// FIX: Explicitly use v1 to support .firestore.document() syntax
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const SibApiV3Sdk = require('@getbrevo/brevo'); 
const axios = require('axios'); // Required for Shiprocket
const crypto = require('crypto'); // Required for PayU

// --- IMPORT TEMPLATES ---
const orderConfirmationTemplate = require('./templatesm/orderConfirmation');
const emailOtpTemplate = require('./templatesm/emailOtp');

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = admin.firestore();

// ==================================================================
// 🔑 CONFIGURATION
// ==================================================================

// Brevo
const BREVO_API_KEY = process.env.BREVO_API_KEY; 
const SENDER_EMAIL = "abhishekbakare43398@gmail.com"; 
const SENDER_NAME = "Drushya Store";

// PayU
const PAYU_KEY = process.env.PAYU_KEY;
const PAYU_SALT = process.env.PAYU_SALT;
const WEBSITE_BASE_URL = "http://localhost:5173"; 

// ==================================================================
// 🛡️ SECURITY & HELPERS
// ==================================================================

// 1. RATE LIMITER
async function checkRateLimit(identifier, limitCount, windowSeconds) {
    const ref = db.collection('rate_limits').doc(identifier);
    
    await db.runTransaction(async (t) => {
        const doc = await t.get(ref);
        const now = admin.firestore.Timestamp.now();

        if (!doc.exists) {
            t.set(ref, { attempts: 1, windowStart: now });
            return;
        }

        const data = doc.data();
        const windowStart = data.windowStart.toDate();
        const diffSeconds = (now.toDate().getTime() - windowStart.getTime()) / 1000;

        if (diffSeconds > windowSeconds) {
            // Window expired, reset counter
            t.set(ref, { attempts: 1, windowStart: now });
        } else {
            // Inside window, check limit
            if (data.attempts >= limitCount) {
                 const waitTime = Math.ceil((windowSeconds - diffSeconds) / 60);
                 throw new functions.https.HttpsError(
                     'resource-exhausted', 
                     `Too many requests. Please wait ${waitTime} minutes.`
                 );
            }
            t.update(ref, { attempts: admin.firestore.FieldValue.increment(1) });
        }
    });
}

// 2. OWNER CHECK
async function requireOwner(context) {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Login required.");
    const settingsDoc = await db.collection('settings').doc('subscription').get();
    const adminEmail = settingsDoc.exists ? settingsDoc.data().adminEmail : null;
    if (context.auth.token.email !== adminEmail) {
        throw new functions.https.HttpsError("permission-denied", "Access Denied: Owner only.");
    }
}

// 3. MANAGER OR OWNER CHECK
async function requireManagerOrOwner(context) {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Login required.");
    const settingsDoc = await db.collection('settings').doc('subscription').get();
    const adminEmail = settingsDoc.exists ? settingsDoc.data().adminEmail : null;
    if (context.auth.token.email === adminEmail) return true;
    if (context.auth.token.role === 'manager') return true;
    throw new functions.https.HttpsError("permission-denied", "Access Denied: Managers or Owner only.");
}

// 4. SHIPROCKET TOKEN
async function getShiprocketToken() {
    const settingsDoc = await db.collection('settings').doc('shipping').get();
    if (!settingsDoc.exists) throw new Error("Shipping settings not found");
    const { shiprocketEmail, shiprocketPassword } = settingsDoc.data();

    if(!shiprocketEmail || !shiprocketPassword) throw new Error("Shiprocket credentials missing in Settings");

    try {
        const response = await axios.post('https://apiv2.shiprocket.in/v1/external/auth/login', {
            email: shiprocketEmail,
            password: shiprocketPassword
        });
        return response.data.token;
    } catch (e) {
        throw new Error("Shiprocket Login Failed: " + (e.response?.data?.message || e.message));
    }
}

// ==================================================================
// 1. SECURE ORDER PLACEMENT (Cashier)
// ==================================================================
exports.placeOrderSecure = functions.runWith({ memory: '256MB', timeoutSeconds: 60 }).https.onCall(async (data, context) => {
  try {
    const authUid = context.auth ? context.auth.uid : "None";
    const authEmail = context.auth && context.auth.token ? context.auth.token.email : null;
    
    console.log("1. Function Invoked. Auth UID:", authUid);

    const payload = (data && data.data) ? data.data : (data || {});
    const uid = authUid !== "None" ? authUid : payload.uid;

    if (!uid) throw new functions.https.HttpsError("unauthenticated", "Auth Failed. No UID.");

    // RATE LIMIT CHECK for Orders (Prevent spam orders - 10 per hour)
    if (context.auth) {
        await checkRateLimit(uid, 10, 60 * 60);
    }

    const { cart, addressData, couponCode, paymentMethod } = payload;
    if (!cart || cart.length === 0) throw new functions.https.HttpsError("invalid-argument", "Cart is empty.");

    return await db.runTransaction(async (transaction) => {
      // Reads
      const webUserRef = db.collection("website_users").doc(uid);
      const custUserRef = db.collection("customers").doc(uid);
      const webUserDoc = await transaction.get(webUserRef);
      let userDoc = webUserDoc;
      let userRef = webUserRef;
      if (!webUserDoc.exists) {
          const custUserDoc = await transaction.get(custUserRef);
          if (custUserDoc.exists) { userDoc = custUserDoc; userRef = custUserRef; }
      }

      let couponDoc = null;
      if (couponCode) {
          const couponQuery = db.collection("coupons").where("code", "==", couponCode).limit(1);
          const couponSnap = await transaction.get(couponQuery);
          if (!couponSnap.empty) couponDoc = couponSnap.docs[0];
      }

      let shippingSettings = { freeShippingThreshold: 999, defaultCost: 50, method: 'manual', zones: [] };
      const settingsRef = db.collection('settings').doc('shipping');
      const settingsDoc = await transaction.get(settingsRef);
      if (settingsDoc.exists) shippingSettings = { ...shippingSettings, ...settingsDoc.data() };

      const productDocs = [];
      for (const item of cart) {
          if (!item.productId) throw new functions.https.HttpsError("invalid-argument", "Product ID missing");
          const ref = db.collection("products").doc(item.productId);
          const doc = await transaction.get(ref);
          productDocs.push({ item, ref, doc });
      }

      // Calculations
      let subtotal = 0;
      const itemsToSave = [];
      const productUpdates = new Map();

      for (const { item, ref, doc: prodDoc } of productDocs) {
        if (!prodDoc.exists) throw new functions.https.HttpsError("not-found", `Product not found: ${item.name}`);
        let prodData = productUpdates.has(prodDoc.id) ? productUpdates.get(prodDoc.id).data : prodDoc.data();
        
        const variants = prodData.variants || [];
        let rawIndex = item.variantIndex !== undefined ? item.variantIndex : item.variantIdx;
        const vIdx = parseInt(rawIndex, 10);

        if (isNaN(vIdx) || vIdx < 0 || vIdx >= variants.length) throw new functions.https.HttpsError("invalid-argument", `Invalid variant index`);
        
        const variant = variants[vIdx];
        if (!variant) throw new functions.https.HttpsError("not-found", "Variant data missing.");
        if (Number(variant.stock) < Number(item.qty)) throw new functions.https.HttpsError("resource-exhausted", `Out of stock: ${item.name}`);

        const basePrice = Number(variant.onlinePrice || 0);
        const gstPercent = Number(variant.gst || 0);
        const finalPrice = Math.round(basePrice * (1 + gstPercent / 100));

        subtotal += finalPrice * item.qty;
        variants[vIdx].stock -= item.qty;
        
        prodData.variants = variants;
        productUpdates.set(prodDoc.id, { ref, data: prodData });

        itemsToSave.push({ 
            productId: item.productId, variantIndex: vIdx, qty: item.qty, name: prodData.name,
            color: variant.color, size: variant.size, 
            image: variant.image || (prodData.images && prodData.images[0]) || '',
            price: finalPrice, gst: gstPercent, hsn: variant.hsn || '', weight: variant.weight || 0
        });
      }

      let discount = 0;
      let appliedCouponCode = null;
      if (couponDoc) {
        const cData = couponDoc.data();
        const now = new Date();
        const expiry = cData.expiryDate ? new Date(cData.expiryDate) : null;
        if ((!expiry || now <= expiry) && subtotal >= Number(cData.minOrderAmount)) {
             discount = cData.type === 'percentage' ? Math.round(subtotal * (Number(cData.value)/100)) : Number(cData.value);
             discount = Math.min(discount, subtotal);
             appliedCouponCode = couponCode;
        }
      }

      let shipping = Number(shippingSettings.defaultCost);
      const currentTotal = subtotal - discount;
      if (currentTotal >= Number(shippingSettings.freeShippingThreshold)) {
          shipping = 0;
      } else if (shippingSettings.method === 'manual' && Array.isArray(shippingSettings.zones)) {
          const userPin = String(addressData.pincode || '').trim();
          const userCity = String(addressData.city || '').trim().toLowerCase();
          const matchedZone = shippingSettings.zones.find(z => {
             const codes = (z.pincodes || '').split(',').map(s => s.trim().toLowerCase());
             return codes.includes(userPin) || codes.includes(userCity);
          });
          if (matchedZone) shipping = Number(matchedZone.cost);
      }

      const totalAfterDiscount = subtotal - discount + shipping;
      const walletBalance = userDoc.exists ? Number(userDoc.data().wallet_credit_balance || 0) : 0;
      const dbEmail = userDoc.exists ? (userDoc.data().email || "") : "";
      const customerEmail = authEmail || dbEmail;
      
      const creditUsed = Math.min(totalAfterDiscount, walletBalance);
      const finalPayable = totalAfterDiscount - creditUsed;

      // Writes
      productUpdates.forEach((value) => { transaction.update(value.ref, { variants: value.data.variants }); });
      if (creditUsed > 0 && userDoc.exists) { transaction.update(userRef, { wallet_credit_balance: walletBalance - creditUsed }); }

      const finalPaymentMethod = (paymentMethod === 'Online') ? 'PayU' : 'COD';
      const orderRef = db.collection("orders").doc();
      transaction.set(orderRef, {
        customerId: uid,
        customerName: addressData.fullName,
        customerEmail: customerEmail,
        customerMobile: addressData.phone,
        shippingAddressLine1: addressData.address,
        shippingCity: addressData.city,
        shippingState: addressData.state,
        shippingPincode: addressData.pincode,
        shippingAddress: `${addressData.address}, ${addressData.city}, ${addressData.state} - ${addressData.pincode}`,
        items: itemsToSave,
        subtotal, totalGst: 0, discount, couponCode: appliedCouponCode, shipping, creditUsed,
        grandTotal: totalAfterDiscount, paidAmount: finalPayable, dueAmount: 0,
        date: admin.firestore.FieldValue.serverTimestamp(),
        status: 'New', paymentMethod: finalPaymentMethod, source: 'online'
      });

      return { success: true, orderId: orderRef.id };
    });
  } catch (error) {
    console.error(error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});


// ==================================================================
// 2. EMAIL NOTIFICATION TRIGGER
// ==================================================================
exports.sendOrderConfirmation = functions.runWith({ memory: '256MB' }).firestore
  .document('orders/{orderId}')
  .onCreate(async (snap, context) => {
      try {
        const orderData = snap.data();
        const orderId = context.params.orderId;

        if (!BREVO_API_KEY || BREVO_API_KEY.includes("YOUR_ACTUAL")) return null;

        const recipientEmail = orderData.customerEmail || "test_customer@example.com"; 

        let apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
        let apiKey = apiInstance.authentications['apiKey'];
        apiKey.apiKey = BREVO_API_KEY;

        let sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
        sendSmtpEmail.subject = `Order Confirmation #${orderId.slice(0, 6).toUpperCase()}`;
        sendSmtpEmail.htmlContent = orderConfirmationTemplate.getHtml(orderData, orderId);
        sendSmtpEmail.sender = { "name": SENDER_NAME, "email": SENDER_EMAIL };
        sendSmtpEmail.to = [{ "email": recipientEmail, "name": orderData.customerName || "Customer" }];

        await apiInstance.sendTransacEmail(sendSmtpEmail);
        return null;
      } catch (error) {
        console.error("Brevo Email Error:", error);
        return null;
      }
  });


// ==================================================================
// 3. SHIPROCKET HELPERS & ORDER CREATION
// ==================================================================
async function getShiprocketToken() {
    const settingsDoc = await db.collection('settings').doc('shipping').get();
    if (!settingsDoc.exists) throw new Error("Shipping settings not found");
    const { shiprocketEmail, shiprocketPassword } = settingsDoc.data();
    if(!shiprocketEmail || !shiprocketPassword) throw new Error("Shiprocket credentials missing in Settings");

    try {
        const response = await axios.post('https://apiv2.shiprocket.in/v1/external/auth/login', {
            email: shiprocketEmail, password: shiprocketPassword
        });
        return response.data.token;
    } catch (e) {
        throw new Error("Shiprocket Login Failed: " + (e.response?.data?.message || e.message));
    }
}

exports.createShiprocketOrder = functions.runWith({ memory: '256MB', timeoutSeconds: 60 }).https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Admin access required.");
    
    const { orderId } = data;
    if (!orderId) throw new functions.https.HttpsError("invalid-argument", "Order ID required");

    try {
        const orderDoc = await db.collection('orders').doc(orderId).get();
        if (!orderDoc.exists) throw new functions.https.HttpsError("not-found", "Order not found");
        const order = orderDoc.data();
        const settingsDoc = await db.collection('settings').doc('shipping').get();
        const settings = settingsDoc.exists ? settingsDoc.data() : {};
        const token = await getShiprocketToken();

        let address = (order.shippingAddressLine1 || order.shippingAddress || "").trim();
        let city = (order.shippingCity || "").trim();
        let state = (order.shippingState || "").trim();
        let pincode = (order.shippingPincode || "").trim();

        if (!city || !state || !pincode) {
             const parts = (order.shippingAddress || "").split(",");
             if (parts.length >= 3) {
                 if(!address) address = parts[0].trim();
                 if(!city) city = parts[1].trim();
                 const statePin = parts[2].trim().split("-");
                 if (!state && statePin.length > 0) state = statePin[0].trim();
                 if (!pincode && statePin.length > 1) pincode = statePin[1].trim();
             } else { if(!address) address = order.shippingAddress; }
        }
        
        if (!address || address.length < 3) address = "Address Not Provided";
        if (!city) city = "City Not Provided";
        if (!state) state = "State Not Provided";
        if (!pincode) pincode = (order.shippingAddress || "").match(/\d{6}/)?.[0] || "110001";

        const payload = {
            order_id: orderId,
            order_date: new Date().toISOString().split('T')[0], 
            pickup_location: settings.shiprocketPickupLocation || "Primary", 
            billing_customer_name: (order.customerName || "Customer").split(" ")[0],
            billing_last_name: (order.customerName || "").split(" ")[1] || "",
            billing_address: address.substring(0, 80),
            billing_city: city, billing_pincode: pincode, billing_state: state, billing_country: "India",
            billing_email: order.customerEmail || "noemail@example.com",
            billing_phone: order.customerMobile || "9999999999",
            shipping_is_billing: false, 
            shipping_customer_name: (order.customerName || "Customer").split(" ")[0],
            shipping_last_name: (order.customerName || "").split(" ")[1] || "",
            shipping_address: address.substring(0, 80),
            shipping_city: city, shipping_pincode: pincode, shipping_country: "India", shipping_state: state,
            shipping_email: order.customerEmail || "noemail@example.com",
            shipping_phone: order.customerMobile || "9999999999",
            order_items: (order.items || []).map(item => ({
                name: item.name, sku: item.productId, units: parseInt(item.qty),
                selling_price: parseFloat(item.price), discount: 0, tax: parseFloat(item.gst || 0), hsn: item.hsn || 0
            })),
            payment_method: order.paymentMethod === 'PayU' ? "Prepaid" : "COD",
            sub_total: parseFloat(order.grandTotal),
            length: 10, breadth: 10, height: 10, weight: 0.5 
        };

        const response = await axios.post('https://apiv2.shiprocket.in/v1/external/orders/create/adhoc', payload, {
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
        });

        await db.collection('orders').doc(orderId).update({
            shiprocket_order_id: response.data.order_id,
            shiprocket_shipment_id: response.data.shipment_id,
            status: 'Processing',
            awb_code: response.data.awb_code || null
        });

        return { success: true, message: "Order pushed to Shiprocket", data: response.data };
    } catch (error) {
        console.error("Shiprocket Error:", error.response?.data || error.message);
        throw new functions.https.HttpsError("internal", "Shiprocket Error: " + (JSON.stringify(error.response?.data) || error.message));
    }
});


// ==================================================================
// 5. SHIPROCKET: GENERATE LABEL & SYNC
// ==================================================================
exports.generateShiprocketLabel = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Admin access required.");
    const { shipmentId } = data;
    try {
        const token = await getShiprocketToken();
        const response = await axios.post('https://apiv2.shiprocket.in/v1/external/courier/generate/label', { shipment_id: [shipmentId] }, { headers: { 'Authorization': `Bearer ${token}` } });
        return { success: true, url: response.data.label_url };
    } catch (error) { throw new functions.https.HttpsError("internal", "Failed to generate label."); }
});

exports.syncShiprocketStatus = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Admin access required.");
    const { orderId } = data;
    try {
        const orderDoc = await db.collection('orders').doc(orderId).get();
        if (!orderDoc.exists) throw new functions.https.HttpsError("not-found", "Order not found");
        const order = orderDoc.data();
        if (!order.shiprocket_order_id) throw new functions.https.HttpsError("failed-precondition", "Not a Shiprocket order");
        const token = await getShiprocketToken();
        const response = await axios.get(`https://apiv2.shiprocket.in/v1/external/orders/show/${order.shiprocket_order_id}`, { headers: { 'Authorization': `Bearer ${token}` } });
        const srStatus = response.data.data.status; 
        
        let appStatus = order.status;
        if (srStatus === 'DELIVERED') appStatus = 'Delivered';
        else if (srStatus === 'SHIPPED' || srStatus === 'IN TRANSIT') appStatus = 'Shipped';
        else if (srStatus === 'PICKUP SCHEDULED' || srStatus === 'READY TO SHIP') appStatus = 'Packed';
        else if (srStatus === 'CANCELED') appStatus = 'Cancelled';
        
        if (appStatus !== order.status) {
            await db.collection('orders').doc(orderId).update({
                status: appStatus, lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            });
            return { success: true, newStatus: appStatus };
        }
        return { success: true, newStatus: null };
    } catch (error) { throw new functions.https.HttpsError("internal", "Failed to sync status."); }
});


// ==================================================================
// 7. SEND EMAIL OTP (Restricted Rate Limit) - AND CHECK LIMIT HELPER
// ==================================================================
exports.sendEmailOTP = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "User must be created first.");
    const email = data.email || context.auth.token.email;
    const name = data.name || "Customer";
    const uid = context.auth.uid;

    await checkRateLimit(uid, 3, 15 * 60);

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; 

    try {
        await db.collection('email_otps').doc(uid).set({ email, otp, expiresAt, attempts: 0 });
        let apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
        let apiKey = apiInstance.authentications['apiKey'];
        apiKey.apiKey = BREVO_API_KEY;
        let sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
        sendSmtpEmail.subject = `${otp} is your verification code`;
        sendSmtpEmail.htmlContent = emailOtpTemplate.getHtml(name, otp);
        sendSmtpEmail.sender = { "name": SENDER_NAME, "email": SENDER_EMAIL };
        sendSmtpEmail.to = [{ "email": email, "name": name }];
        await apiInstance.sendTransacEmail(sendSmtpEmail);
        return { success: true, message: "OTP sent to email" };
    } catch (error) {
        console.error("Brevo Failure Details:", error);
        throw new functions.https.HttpsError("internal", "Unable to send verification email.");
    }
});

// ==================================================================
// 8. VERIFY EMAIL OTP
// ==================================================================
exports.verifyEmailOTP = functions.https.onCall(async (data, context) => {
    const uid = context.auth ? context.auth.uid : data.uid;
    const userOtp = data.otp;
    if (!uid) throw new functions.https.HttpsError("unauthenticated", "User not found.");
    const otpRef = db.collection('email_otps').doc(uid);
    const otpDoc = await otpRef.get();
    if (!otpDoc.exists) throw new functions.https.HttpsError("not-found", "No OTP request found. Please resend.");
    const otpData = otpDoc.data();
    if (Date.now() > otpData.expiresAt) throw new functions.https.HttpsError("failed-precondition", "OTP expired.");
    if (otpData.attempts > 5) throw new functions.https.HttpsError("resource-exhausted", "Too many failed attempts.");
    if (otpData.otp !== userOtp) {
        await otpRef.update({ attempts: admin.firestore.FieldValue.increment(1) });
        throw new functions.https.HttpsError("invalid-argument", "Incorrect OTP.");
    }
    await admin.auth().updateUser(uid, { emailVerified: true });
    await otpRef.delete(); 
    return { success: true, message: "Email verified successfully!" };
});

// ==================================================================
// 9. REDEEM LICENSE (Admin)
// ==================================================================
exports.redeemLicense = functions.https.onCall(async (data, context) => {
    // If logged in, check owner; else allow for setup
    if (context.auth) await requireOwner(context);
    const { code, email, password } = data;
    if (!context.auth && (!email || !password)) throw new functions.https.HttpsError("invalid-argument", "Credentials required for setup.");
    
    return db.runTransaction(async (transaction) => {
        const keyQuery = db.collection('license_keys').where('code', '==', code.trim().toUpperCase()).limit(1);
        const keySnap = await transaction.get(keyQuery);
        if (keySnap.empty) throw new functions.https.HttpsError("not-found", "Invalid License Key.");
        const keyDoc = keySnap.docs[0];
        if (keyDoc.data().status === 'used') throw new functions.https.HttpsError("already-exists", "Key used.");
        
        let uid = context.auth ? context.auth.uid : null;
        let customToken = null;
        
        if (!uid) {
             try {
                const userRecord = await admin.auth().createUser({ email, password, displayName: "Admin" });
                uid = userRecord.uid;
                customToken = await admin.auth().createCustomToken(uid);
            } catch (err) {
                if(err.code === 'auth/email-already-exists') {
                    const userRecord = await admin.auth().getUserByEmail(email);
                    uid = userRecord.uid;
                    customToken = await admin.auth().createCustomToken(uid);
                } else throw new functions.https.HttpsError("aborted", "User creation failed");
            }
        }
        
        const settingsRef = db.collection('settings').doc('subscription');
        const settingsDoc = await transaction.get(settingsRef);
        let currentExpiry = new Date();
        if (settingsDoc.exists && settingsDoc.data().validUntil?.toDate() > new Date()) {
             currentExpiry = settingsDoc.data().validUntil.toDate();
        }
        const newExpiry = new Date(currentExpiry);
        newExpiry.setDate(newExpiry.getDate() + (keyDoc.data().durationDays || 30));
        
        transaction.update(keyDoc.ref, { status: 'used', usedBy: uid, usedAt: admin.firestore.FieldValue.serverTimestamp() });
        transaction.set(settingsRef, { validUntil: admin.firestore.Timestamp.fromDate(newExpiry), plan: keyDoc.data().plan || 'standard', adminEmail: email || context.auth.token.email }, { merge: true });
        
        return { success: true, newExpiry: newExpiry.toISOString(), customToken };
    });
});

// ==================================================================
// 10. PAYU
// ==================================================================
exports.generatePayUHash = functions.https.onCall((data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "User not logged in.");
    const { txnid, amount, productinfo, firstname, email } = data;
    const hashString = `${PAYU_KEY}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|||||||||||${PAYU_SALT}`;
    const hash = crypto.createHash('sha512').update(hashString).digest('hex');
    return { hash, key: PAYU_KEY };
});

exports.payuHandler = functions.https.onRequest(async (req, res) => {
    const { status, txnid, amount, hash, productinfo, firstname, email, mihpayid, mode, error_Message } = req.body;
    // ... Verify Hash ...
    const hashString = `${PAYU_SALT}|${status}|||||||||||${email}|${firstname}|${productinfo}|${amount}|${txnid}|${PAYU_KEY}`;
    if (crypto.createHash('sha512').update(hashString).digest('hex') !== hash) return res.redirect(`${WEBSITE_BASE_URL}/payment/failure?reason=hash_mismatch`);
    
    try {
        const orderRef = db.collection('orders').doc(txnid);
        if (status === 'success') {
            await orderRef.update({ status: 'Paid', paymentId: mihpayid, paymentMode: mode || 'Online', paidAmount: parseFloat(amount), dueAmount: 0, lastUpdated: admin.firestore.FieldValue.serverTimestamp() });
            return res.redirect(`${WEBSITE_BASE_URL}/payment/success?orderId=${txnid}`);
        } else {
            await orderRef.update({ status: 'Payment Failed', paymentError: error_Message || 'Unknown', lastUpdated: admin.firestore.FieldValue.serverTimestamp() });
            return res.redirect(`${WEBSITE_BASE_URL}/payment/failure?orderId=${txnid}&reason=${error_Message}`);
        }
    } catch (e) { return res.redirect(`${WEBSITE_BASE_URL}/payment/failure?reason=internal_error`); }
});

// ==================================================================
// 11. STAFF & RETURNS (Admin Actions)
// ==================================================================
exports.approveReturn = functions.https.onCall(async (data, context) => {
    await requireManagerOrOwner(context);
    const { orderId, returnConfig, refundAmount } = data;

    return db.runTransaction(async (transaction) => {
        const orderRef = db.collection('orders').doc(orderId);
        const orderDoc = await transaction.get(orderRef);
        if (!orderDoc.exists) throw new functions.https.HttpsError("not-found", "Order not found");
        
        const orderData = orderDoc.data();
        const currentItems = orderData.items;

        let userRef = db.collection('website_users').doc(orderData.customerId);
        let userDoc = await transaction.get(userRef);
        if (!userDoc.exists) {
            userRef = db.collection('customers').doc(orderData.customerId);
            userDoc = await transaction.get(userRef);
        }

        for (const [idxStr, config] of Object.entries(returnConfig)) {
            if (config.qty > 0) {
                const index = parseInt(idxStr);
                const item = currentItems[index];
                delete item.returnStatus;
                delete item.returnRequestedQty;
                item.returnedQty = (item.returnedQty || 0) + config.qty;
                
                if (config.returnToStock) {
                    const prodRef = db.collection('products').doc(item.productId);
                    const prodDoc = await transaction.get(prodRef);
                    if (prodDoc.exists) {
                        const prodData = prodDoc.data();
                        if (prodData.variants && prodData.variants[item.variantIndex]) {
                            prodData.variants[item.variantIndex].stock += config.qty;
                            transaction.update(prodRef, { variants: prodData.variants });
                        }
                    }
                }
            }
        }

        const allReturned = currentItems.every(i => i.qty === i.returnedQty);
        const anyPending = currentItems.some(i => i.returnStatus === 'Pending');
        const newStatus = anyPending ? 'Return Requested' : (allReturned ? 'Returned' : 'Paid');

        transaction.update(orderRef, { items: currentItems, status: newStatus, lastReturnDate: admin.firestore.FieldValue.serverTimestamp() });

        if (userDoc.exists) {
             const currentWallet = Number(userDoc.data().wallet_credit_balance || 0);
             transaction.update(userRef, { wallet_credit_balance: currentWallet + Number(refundAmount) });
        } else {
             transaction.set(userRef, {
                 name: orderData.customerName || 'Customer',
                 email: orderData.customerEmail || '',
                 mobile: orderData.customerMobile || '',
                 wallet_credit_balance: Number(refundAmount),
                 createdAt: admin.firestore.FieldValue.serverTimestamp(),
                 source: orderData.source || 'online'
             });
        }
        const returnLogRef = db.collection('returns').doc();
        transaction.set(returnLogRef, { originalOrderId: orderId, customerId: orderData.customerId, refundAmount: Number(refundAmount), itemsReturned: returnConfig, date: admin.firestore.FieldValue.serverTimestamp(), processedBy: context.auth.uid });
        return { success: true };
    });
});

exports.createStaffAccount = functions.https.onCall(async (data, context) => {
    await requireOwner(context);
    const { email, password, name, role } = data;
    const userRecord = await admin.auth().createUser({ email, password, displayName: name });
    await admin.auth().setCustomUserClaims(userRecord.uid, { role, staff: true });
    await db.collection('staff').doc(userRecord.uid).set({ name, email, role, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    return { success: true };
});

exports.deleteStaffAccount = functions.https.onCall(async (data, context) => {
    await requireOwner(context);
    await admin.auth().deleteUser(data.uid);
    await db.collection('staff').doc(data.uid).delete();
    return { success: true };
});

// 12. REQUEST RETURN
exports.requestReturn = functions.https.onCall(async (data, context) => {
    const uid = context.auth ? context.auth.uid : data.uid;
    if (!uid) throw new functions.https.HttpsError("unauthenticated", "User must be logged in.");

    const { orderId, itemIndex, qty } = data;

    return db.runTransaction(async (transaction) => {
        const orderRef = db.collection('orders').doc(orderId);
        const orderDoc = await transaction.get(orderRef);
        
        if (!orderDoc.exists) throw new functions.https.HttpsError("not-found", "Order not found");
        
        const orderData = orderDoc.data();
        
        if (orderData.customerId !== uid) {
            throw new functions.https.HttpsError("permission-denied", "You can only return your own orders.");
        }

        const items = orderData.items;
        const item = items[itemIndex];
        
        if (!item) throw new functions.https.HttpsError("not-found", "Item not found in order.");

        const maxReturn = item.qty - (item.returnedQty || 0);
        if (qty > maxReturn) throw new functions.https.HttpsError("invalid-argument", "Invalid return quantity.");

        item.returnRequestedQty = Number(qty);
        item.returnStatus = 'Pending';
        
        transaction.update(orderRef, {
            items: items,
            status: 'Return Requested',
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        });

        return { success: true };
    });
});

// 13. CLEANUP FAILED ORDERS
exports.cleanupFailedOrders = functions.pubsub.schedule('every 240 hours').onRun(async (context) => {
    const now = new Date();
    const cutoffDate = new Date(now.setDate(now.getDate() - 30));
    
    console.log("Running Cleanup for orders older than:", cutoffDate.toISOString());

    try {
        const ordersRef = db.collection('orders');
        const snapshot = await ordersRef
            .where('source', '==', 'online')
            .where('status', 'in', ['Payment Failed', 'New'])
            .where('date', '<', admin.firestore.Timestamp.fromDate(cutoffDate))
            .get();

        if (snapshot.empty) return null;

        const batch = db.batch();
        snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });

        await batch.commit();
        console.log(`Deleted ${snapshot.size} failed/abandoned orders.`);
        return null;

    } catch (error) {
        console.error("Cleanup Error:", error);
        return null;
    }
});

// ==================================================================
// 14. DELETE CUSTOMER ACCOUNT (Self Deletion)
// ==================================================================
exports.deleteCustomerAccount = functions.https.onCall(async (data, context) => {
    // 1. Auth Check - User must be logged in
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Login required.");
    
    const uid = context.auth.uid;

    try {
        // 2. Delete Firestore Data (Profile)
        // We delete from both potential collections to be safe
        await db.collection('website_users').doc(uid).delete();
        await db.collection('customers').doc(uid).delete();
        
        // 3. Delete Authentication Record
        await admin.auth().deleteUser(uid);

        return { success: true };
    } catch (error) {
        console.error("Delete Customer Error:", error);
        // If auth user is already deleted, we might get an error, but that's fine.
        // We throw internal to let client know something went wrong if it wasn't a clean delete.
        throw new functions.https.HttpsError("internal", "Failed to delete account: " + error.message);
    }
});