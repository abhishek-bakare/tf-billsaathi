import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions'; 
import { doc, getDoc } from 'firebase/firestore'; 
import { MapPin, Phone, CreditCard, User, Truck, CheckCircle, Loader2, Ticket, Wallet } from 'lucide-react';

export default function Checkout({ cart, user, db, clearCart, coupon, functions }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0); 
  const [paymentMethod, setPaymentMethod] = useState('Online'); // Default: Online
  
  const [formData, setFormData] = useState({
    fullName: user?.displayName || '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    phone: ''
  });

  // Shipping Config State
  const [shippingConfig, setShippingConfig] = useState({
      freeThreshold: 999,
      defaultCost: 50,
      zones: []
  });

  // 1. Fetch Wallet & Shipping Config
  useEffect(() => {
    if(!user || !db) return;
    
    const fetchData = async () => {
        const collectionPrefix = (typeof __app_id !== 'undefined') ? `artifacts/${__app_id}/public/data` : '';
        
        // Wallet
        const userDoc = await getDoc(doc(db, `${collectionPrefix}/website_users`, user.uid));
        if(userDoc.exists()) setWalletBalance(userDoc.data().wallet_credit_balance || 0);

        // Shipping Settings
        const shipDoc = await getDoc(doc(db, `${collectionPrefix}/settings`, 'shipping'));
        if(shipDoc.exists()) {
            const d = shipDoc.data();
            setShippingConfig({
                freeThreshold: Number(d.freeShippingThreshold || 999),
                defaultCost: Number(d.defaultCost || 50),
                zones: Array.isArray(d.zones) ? d.zones : []
            });
        }
    };
    fetchData();
  }, [user, db]);

  // 2. Dynamic Shipping Calculation
  const calculateShipping = () => {
      const baseSubtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
      let disc = 0;
      if (coupon) {
          disc = coupon.type === 'percentage' 
            ? baseSubtotal * (coupon.value / 100) 
            : coupon.value;
          disc = Math.min(disc, baseSubtotal);
      }
      
      const netTotal = baseSubtotal - disc;

      // Rule 1: Free Threshold
      if (netTotal >= shippingConfig.freeThreshold) return 0;

      // Rule 2: Check Zones (Manual)
      if (shippingConfig.zones.length > 0) {
          const userPin = formData.pincode.trim();
          const userCity = formData.city.toLowerCase().trim();
          
          const matchedZone = shippingConfig.zones.find(z => {
             const codes = (z.pincodes || '').split(',').map(s => s.trim().toLowerCase());
             return codes.includes(userPin) || codes.includes(userCity);
          });
          
          if (matchedZone) return Number(matchedZone.cost);
      }

      // Rule 3: Default
      return shippingConfig.defaultCost;
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  
  let discount = 0;
  if (coupon) {
    if (coupon.type === 'percentage') {
      discount = subtotal * (coupon.value / 100);
    } else {
      discount = coupon.value;
    }
    discount = Math.min(discount, subtotal);
  }

  const shippingCost = calculateShipping();
  const totalAfterDiscount = subtotal - discount + shippingCost;
  const creditUsed = Math.min(totalAfterDiscount, walletBalance);
  const finalPayable = totalAfterDiscount - creditUsed;

  useEffect(() => {
    if (!user) {
      navigate('/login?redirect=checkout');
    } else if (cart.length === 0) {
      navigate('/cart');
    }
  }, [user, cart, navigate]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    if (!functions || !user) {
        alert("System unavailable. Ensure you are online.");
        return;
    }
    setLoading(true);

    try {
      // Step A: Create Order on Server (Status: New)
      const placeOrderSecure = httpsCallable(functions, 'placeOrderSecure');
      
      const result = await placeOrderSecure({
        uid: user.uid,
        cart: cart.map(item => ({
            productId: item.productId,
            variantIndex: (item.variantIndex !== undefined) ? item.variantIndex : item.variantIdx,
            qty: item.qty,
            name: item.name
        })), 
        addressData: formData,
        couponCode: coupon ? coupon.code : null,
        // Pass payment preference so backend knows logic
        paymentMethod: paymentMethod 
      });

      const orderId = result.data.orderId;
      console.log("Order Created:", orderId);

      // Step B: Handle Payment Flow
      if (paymentMethod === 'COD' || finalPayable <= 0) {
          // COD Success
          clearCart();
          setTimeout(() => {
              alert("Order Placed Successfully!");
              navigate('/orders'); 
          }, 500);
          return;
      }

      // ONLINE PAYMENT (PayU)
      if (paymentMethod === 'Online') {
          // 1. Get Hash from Server
          const generatePayUHash = httpsCallable(functions, 'generatePayUHash');
          const hashRes = await generatePayUHash({
              txnid: orderId,
              amount: finalPayable.toFixed(2),
              productinfo: "DrushyaStoreOrder",
              firstname: formData.fullName.split(' ')[0],
              email: user.email || "guest@example.com"
          });

          const { hash, key } = hashRes.data;

          // 2. Configure URL (Replace with your actual deployed function URL)
          // Look in 'firebase deploy' output for 'payuHandler' URL
          const PAYU_HANDLER_URL = "https://us-central1-inventory-app-4b978.cloudfunctions.net/payuHandler"; 
          
          // 3. Create & Submit Hidden Form
          const form = document.createElement('form');
          form.method = 'POST';
          form.action = 'https://test.payu.in/_payment'; // CHANGE TO 'secure.payu.in' FOR PRODUCTION

          const params = {
              key: key,
              txnid: orderId,
              amount: finalPayable.toFixed(2),
              productinfo: "DrushyaStoreOrder",
              firstname: formData.fullName.split(' ')[0],
              email: user.email || "guest@example.com",
              phone: formData.phone,
              surl: PAYU_HANDLER_URL,
              furl: PAYU_HANDLER_URL,
              hash: hash
          };

          for (const k in params) {
              const input = document.createElement('input');
              input.type = 'hidden';
              input.name = k;
              input.value = params[k];
              form.appendChild(input);
          }
          document.body.appendChild(form);
          form.submit(); // Redirects user to PayU
      }

    } catch (error) {
      console.error("Checkout Error:", error);
      let msg = "Checkout Failed";
      if (error.code === 'internal') msg = "Server Error (Internal).";
      else if (error.message) msg = error.message;
      alert(msg);
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-slate-900 mb-8">Checkout</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        
        {/* --- LEFT: FORMS --- */}
        <div className="lg:col-span-2 space-y-8">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-blue-600" /> Shipping Address
                </h2>
                <form id="checkout-form" onSubmit={handlePlaceOrder} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2"><label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label><input required name="fullName" value={formData.fullName} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500" /></div>
                    <div className="md:col-span-2"><label className="block text-sm font-medium text-slate-700 mb-1">Address</label><input required name="address" value={formData.address} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500" placeholder="Street, Sector, Apartment" /></div>
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">City</label><input required name="city" value={formData.city} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500" /></div>
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">State</label><input required name="state" value={formData.state} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500" /></div>
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">Pincode</label><input required name="pincode" value={formData.pincode} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500" /></div>
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label><input required name="phone" value={formData.phone} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500" /></div>
                </form>
            </div>
            
             <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-blue-600" /> Payment Method
                </h2>
                <div className="space-y-3">
                    <label className={`flex items-center gap-3 p-4 border rounded-lg cursor-pointer transition-all ${paymentMethod === 'Online' ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
                        <input type="radio" name="payment" value="Online" checked={paymentMethod === 'Online'} onChange={() => setPaymentMethod('Online')} className="w-4 h-4 text-blue-600" />
                        <span className="font-medium text-slate-900">Pay Online (Card/UPI/NetBanking)</span>
                    </label>
                    <label className={`flex items-center gap-3 p-4 border rounded-lg cursor-pointer transition-all ${paymentMethod === 'COD' ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
                        <input type="radio" name="payment" value="COD" checked={paymentMethod === 'COD'} onChange={() => setPaymentMethod('COD')} className="w-4 h-4 text-blue-600" />
                        <span className="font-medium text-slate-900">Cash on Delivery (COD)</span>
                    </label>
                </div>
            </div>
        </div>

        {/* --- RIGHT: ORDER SUMMARY --- */}
        <div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm sticky top-24">
                <h3 className="font-bold text-lg text-slate-900 mb-4">Order Summary</h3>
                <div className="space-y-4 mb-6 max-h-60 overflow-y-auto pr-2">
                    {cart.map((item, i) => (
                        <div key={i} className="flex gap-3 text-sm">
                             <div className="w-12 h-12 bg-slate-100 rounded-md flex-shrink-0 overflow-hidden">
                                {item.image && <img src={item.image} className="w-full h-full object-cover" />}
                             </div>
                             <div className="flex-1">
                                 <div className="font-medium text-slate-800">{item.name}</div>
                                 <div className="text-xs text-slate-500">{item.color} / {item.size} x {item.qty}</div>
                             </div>
                             <div className="font-medium">₹{item.price * item.qty}</div>
                        </div>
                    ))}
                </div>
                <div className="space-y-3 mb-6 border-t border-slate-100 pt-4">
                    <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>₹{subtotal.toFixed(2)}</span></div>
                    <div className="flex justify-between text-slate-600">
                        <span>Shipping</span>
                        <span>
                            {shippingCost === 0 
                                ? <span className="text-emerald-600">Free</span> 
                                : `₹${shippingCost}`}
                        </span>
                    </div>
                    
                    {coupon && (
                         <div className="flex justify-between text-emerald-600 font-medium">
                            <span className="flex items-center gap-1"><Ticket className="w-3 h-3"/> Coupon ({coupon.code})</span>
                            <span>- ₹{discount.toFixed(2)}</span>
                        </div>
                    )}

                    {creditUsed > 0 && (
                        <div className="flex justify-between text-blue-600 font-medium bg-blue-50 px-2 py-1 rounded">
                             <span className="flex items-center gap-1"><Wallet className="w-3 h-3"/> Wallet Credit</span>
                             <span>- ₹{creditUsed.toFixed(2)}</span>
                        </div>
                    )}
                    
                    <div className="flex justify-between font-bold text-slate-900 text-lg pt-2 border-t border-slate-100">
                        <span>Payable</span>
                        <span>₹{finalPayable.toFixed(2)}</span>
                    </div>
                </div>

                <button 
                    type="submit" 
                    form="checkout-form"
                    disabled={loading}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                    {loading ? 'Processing...' : (paymentMethod === 'Online' ? 'Pay Now' : 'Place Order')}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
}