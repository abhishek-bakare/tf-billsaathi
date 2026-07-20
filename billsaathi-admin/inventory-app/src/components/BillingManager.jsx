import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, onSnapshot, addDoc, updateDoc, doc, 
  serverTimestamp, runTransaction, query, orderBy, where, getDocs 
} from 'firebase/firestore';
import { 
  Search, ShoppingCart, User, Plus, Trash2, Printer, CheckCircle, RefreshCw, Ticket, X, Loader2, UserPlus 
} from 'lucide-react';

// IMPORT FROM SEPARATE FILE
import { generateBill } from '../utils/billGenerator';

export default function BillingManager({ db, user }) {
  // Data State
  const [products, setProducts] = useState([]); 
  const [customers, setCustomers] = useState([]);
  
  // UI State
  const [searchTerm, setSearchTerm] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Checkout State
  const [paidAmount, setPaidAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Coupon State
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null); 
  const [couponError, setCouponError] = useState('');

  // --- Add Customer State ---
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', mobile: '', address: '', profession:'' });

  const searchInputRef = useRef(null);

  // Page Title
    useEffect(() => {
      document.title = "Manage Billings | Drushya Store";
    }, []);

  // 1. Fetch Data
  useEffect(() => {
    if (!db) return;
    
    // Helper for Collection Path
    const getCollectionRef = (collectionName) => {
        if (typeof __app_id !== 'undefined') {
            return collection(db, 'artifacts', __app_id, 'public', 'data', collectionName);
        }
        return collection(db, collectionName);
    }

    const unsubCust = onSnapshot(query(getCollectionRef('customers'), orderBy('name')), (snap) => {
      setCustomers(snap.docs.map(d => ({id: d.id, ...d.data()})));
    });

    const unsubProd = onSnapshot(getCollectionRef('products'), (snap) => {
      const flatList = [];
      snap.docs.forEach(doc => {
        const p = doc.data();
        if (p.variants) {
          p.variants.forEach((v, idx) => {
            // CALCULATE FINAL PRICE (Base + GST)
            const basePrice = Number(v.offlinePrice || 0);
            const gstPercent = Number(v.gst || 0);
            const finalPrice = Math.round(basePrice * (1 + gstPercent / 100));

            flatList.push({
              productId: doc.id,
              variantIndex: idx,
              name: p.name,
              category: p.category,
              sku: v.sku,
              color: v.color,
              size: v.size,
              stock: v.stock,
              price: finalPrice, 
              basePrice: basePrice,
              gst: gstPercent,
              barcode: v.barcode,
              image: v.image || (p.images && p.images[0]) || ''
            });
          });
        }
      });
      setProducts(flatList);
      setLoading(false);
    });

    return () => { unsubCust(); unsubProd(); };
  }, [db]);

  // --- Handle Quick Add Customer ---
  const handleAddCustomer = async (e) => {
    e.preventDefault();
    if (!newCustomer.name || !newCustomer.mobile || !newCustomer.profession) return alert("Name, Mobile & Profession are required.");

    try {
        const collectionPath = (typeof __app_id !== 'undefined') 
            ? collection(db, 'artifacts', __app_id, 'public', 'data', 'customers') 
            : collection(db, 'customers');

        // Add to Firestore
        const docRef = await addDoc(collectionPath, {
            ...newCustomer,
            wallet_credit_balance: 0,
            total_due_amount: 0,
            createdAt: serverTimestamp(),
            lastUpdated: serverTimestamp()
        });

        // Automatically select the new customer
        setSelectedCustomer({ 
            id: docRef.id, 
            ...newCustomer, 
            wallet_credit_balance: 0, 
            total_due_amount: 0 
        });

        setIsCustomerModalOpen(false);
        setNewCustomer({ name: '', mobile: '', address: '', profession:'' });
        
    } catch (error) {
        console.error("Error adding customer:", error);
        alert("Failed to add customer.");
    }
  };

  const addToCart = (item) => {
    if (item.stock <= 0) return alert("Out of Stock!");
    setCart(prev => {
      const existing = prev.find(i => i.uniqueId === `${item.productId}-${item.variantIndex}`);
      if (existing) {
        if (existing.qty + 1 > item.stock) { alert("Not enough stock!"); return prev; }
        return prev.map(i => i.uniqueId === existing.uniqueId ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { ...item, uniqueId: `${item.productId}-${item.variantIndex}`, qty: 1 }];
    });
    setSearchTerm('');
    if (searchInputRef.current) searchInputRef.current.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && searchTerm) {
      const exactMatch = products.find(p => p.barcode === searchTerm || p.sku === searchTerm);
      if (exactMatch) addToCart(exactMatch);
    }
  };

  const updateCartItem = (uniqueId, field, value) => {
    setCart(prev => prev.map(item => {
      if (item.uniqueId === uniqueId) {
        if (field === 'qty' && value > item.stock) { alert(`Only ${item.stock} available!`); return item; }
        return { ...item, [field]: Number(value) };
      }
      return item;
    }));
  };

  const removeFromCart = (uniqueId) => setCart(prev => prev.filter(i => i.uniqueId !== uniqueId));

  const calculateTotals = () => {
    let subtotal = 0; 
    cart.forEach(item => {
      subtotal += item.price * item.qty;
    });

    let discount = 0;
    if (appliedCoupon) {
      if (appliedCoupon.type === 'percentage') {
        discount = subtotal * (appliedCoupon.value / 100);
      } else {
        discount = appliedCoupon.value;
      }
      discount = Math.min(discount, subtotal);
    }

    return { subtotal, discount, grandTotal: subtotal - discount };
  };

  const { subtotal, discount, grandTotal } = calculateTotals();
  const walletBalance = selectedCustomer?.wallet_credit_balance || 0;
  const creditUsed = Math.min(grandTotal, walletBalance);
  const netPayable = grandTotal - creditUsed;
  const dueAmount = netPayable - (Number(paidAmount) || 0);

  // Apply Coupon Logic
  const applyCoupon = async () => {
    if (!couponCode) return;
    setCouponError('');
    
    try {
        const collectionPath = (typeof __app_id !== 'undefined') ? `artifacts/${__app_id}/public/data/coupons` : 'coupons';
        const q = query(collection(db, collectionPath), where('code', '==', couponCode.toUpperCase()), where('isActive', '==', true));
        const snap = await getDocs(q);

        if (snap.empty) {
            setCouponError('Invalid or inactive coupon');
            setAppliedCoupon(null);
            return;
        }

        const couponData = snap.docs[0].data();

        if (couponData.expiryDate) {
            const today = new Date();
            today.setHours(0,0,0,0); 
            const expiry = new Date(couponData.expiryDate);
            if (today > expiry) {
                setCouponError('Coupon has expired');
                setAppliedCoupon(null);
                return;
            }
        }

        if (grandTotal < couponData.minOrderAmount) {
            setCouponError(`Min order amount ₹${couponData.minOrderAmount} required`);
            setAppliedCoupon(null);
            return;
        }

        setAppliedCoupon(couponData);
        setCouponError('');
    } catch (err) {
        console.error("Coupon Check Error:", err);
        setCouponError('Error applying coupon');
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode('');
  };

  const handleCheckout = async () => {
    if (!selectedCustomer) return alert("Please select a customer first.");
    if (cart.length === 0) return alert("Cart is empty.");
    if (Number(paidAmount) > netPayable) return alert("Paid amount cannot exceed Net Payable.");

    const confirmMsg = `Confirm Order?\n\nTotal: ₹${grandTotal.toFixed(2)}\nDiscount: -₹${discount.toFixed(2)}\nCredit Used: -₹${creditUsed.toFixed(2)}\nNet Payable: ₹${netPayable.toFixed(2)}\n\nPaid: ₹${Number(paidAmount).toFixed(2)}\nDue: ₹${dueAmount.toFixed(2)}`;
    if (!confirm(confirmMsg)) return;

    setIsProcessing(true);
    try {
      let remainingCreditAfterTx = 0;
      await runTransaction(db, async (transaction) => {
        const custPath = (typeof __app_id !== 'undefined') ? `artifacts/${__app_id}/public/data/customers/${selectedCustomer.id}` : `customers/${selectedCustomer.id}`;
        const custDoc = await transaction.get(doc(db, custPath));
        if (!custDoc.exists()) throw "Customer does not exist!";
        
        const currentDue = custDoc.data().total_due_amount || 0;
        const currentWallet = custDoc.data().wallet_credit_balance || 0;
        if (currentWallet < creditUsed) throw "Credit changed. Try again.";

        for (const item of cart) {
          const prodPath = (typeof __app_id !== 'undefined') ? `artifacts/${__app_id}/public/data/products/${item.productId}` : `products/${item.productId}`;
          const prodRef = doc(db, prodPath);
          const prodDoc = await transaction.get(prodRef);
          if (!prodDoc.exists()) throw `Product ${item.name} not found!`;
          const prodData = prodDoc.data();
          if (prodData.variants[item.variantIndex].stock < item.qty) throw `Stock Insufficient for ${item.name}`;
          prodData.variants[item.variantIndex].stock -= item.qty;
          transaction.update(prodRef, { variants: prodData.variants });
        }

        const orderRef = doc(collection(db, (typeof __app_id !== 'undefined') ? `artifacts/${__app_id}/public/data/orders` : 'orders'));
        const newWallet = currentWallet - creditUsed;
        remainingCreditAfterTx = newWallet;

        const orderData = {
          customerId: selectedCustomer.id,
          customerName: selectedCustomer.name,
          customerMobile: selectedCustomer.mobile,
          items: cart,
          subtotal, 
          totalGst: 0, // Inclusive
          grandTotal, 
          creditUsed, netPayable, remainingCredit: newWallet,
          discount, couponCode: appliedCoupon ? appliedCoupon.code : null,
          paidAmount: Number(paidAmount),
          dueAmount: dueAmount > 0 ? dueAmount : 0,
          date: serverTimestamp(),
          status: dueAmount > 0 ? 'Partial' : 'Paid',
          createdBy: user?.uid || 'staff',
          source: 'offline'
        };
        transaction.set(orderRef, orderData);

        const newDue = currentDue + (dueAmount > 0 ? dueAmount : 0);
        transaction.update(doc(db, custPath), { total_due_amount: newDue, wallet_credit_balance: newWallet, lastOrderDate: serverTimestamp() });
        return orderData;
      });

      alert("Order Successful!");
      
      const cartForPdf = cart.map(i => ({...i, gst: 0}));

      generateBill({ 
        orderId: "NEW", customerName: selectedCustomer.name, customerMobile: selectedCustomer.mobile, 
        items: cartForPdf, subtotal, totalGst: 0, grandTotal, discount, couponCode: appliedCoupon?.code, 
        creditUsed, netPayable, remainingCredit: remainingCreditAfterTx, paidAmount: Number(paidAmount), amountPaidNow: Number(paidAmount), dueAmount 
      });

      setCart([]); setSelectedCustomer(null); setPaidAmount(''); setCustomerSearch(''); removeCoupon();
    } catch (error) { console.error("Checkout Error:", error); alert("Checkout Failed: " + error); }
    setIsProcessing(false);
  };

  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.sku.toLowerCase().includes(searchTerm.toLowerCase()) || p.barcode?.includes(searchTerm));
  const filteredCustomers = customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase()) || c.mobile.includes(customerSearch));

  return (
    <div className="flex h-full bg-slate-100 overflow-hidden">
      <div className="w-7/12 flex flex-col border-r border-slate-200 bg-white">
        <div className="p-4 border-b border-slate-200"><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" /><input ref={searchInputRef} autoFocus className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-lg" placeholder="Scan Barcode or Search Product..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} onKeyDown={handleKeyDown} /></div></div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? <div className="text-center p-10">Loading Products...</div> : <div className="grid grid-cols-3 gap-4">{filteredProducts.map((item) => (
            <button key={`${item.productId}-${item.variantIndex}`} onClick={() => addToCart(item)} className={`text-left p-3 rounded-xl border transition-all ${item.stock > 0 ? 'bg-white border-slate-200 hover:border-blue-400 hover:shadow-md' : 'bg-slate-50 border-slate-100 opacity-60 cursor-not-allowed'}`} disabled={item.stock <= 0}>
              <div className="flex gap-3"><div className="w-12 h-12 bg-slate-100 rounded-lg flex-shrink-0 overflow-hidden">{item.image && <img src={item.image} className="w-full h-full object-cover" />}</div><div className="flex-1 min-w-0"><h4 className="font-semibold text-slate-800 text-sm truncate">{item.name}</h4><p className="text-xs text-slate-500 truncate">{item.color} / {item.size}</p><div className="flex justify-between items-center mt-1"><span className="font-bold text-blue-600">₹{item.price}</span><span className={`text-[10px] px-1.5 py-0.5 rounded ${item.stock < 5 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>{item.stock} left</span></div></div></div>
            </button>
          ))}</div>}
        </div>
      </div>
      <div className="w-5/12 flex flex-col bg-slate-50">
        <div className="p-4 bg-white border-b border-slate-200 shadow-sm z-10">
          {selectedCustomer ? (
            <div className="flex justify-between items-center bg-blue-50 p-3 rounded-lg border border-blue-100">
              <div className="flex items-center gap-3"><div className="w-10 h-10 bg-blue-200 rounded-full flex items-center justify-center text-blue-700 font-bold">{selectedCustomer.name.charAt(0)}</div><div><h3 className="font-bold text-slate-800">{selectedCustomer.name}</h3><div className="flex gap-2 text-xs"><span className="text-slate-500">{selectedCustomer.mobile}</span>{selectedCustomer.wallet_credit_balance > 0 && <span className="text-emerald-600 font-bold px-1.5 bg-emerald-100 rounded">Credit: ₹{selectedCustomer.wallet_credit_balance}</span>}</div></div></div>
              <button onClick={() => setSelectedCustomer(null)} className="text-xs bg-white border border-blue-200 px-2 py-1 rounded text-blue-600 hover:bg-blue-100">Change</button>
            </div>
          ) : (
            <div className="flex gap-2">
                <div className="relative group flex-1">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Search Customer..." value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} />
                    {customerSearch && <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto z-50">{filteredCustomers.map(c => (<button key={c.id} onClick={() => { setSelectedCustomer(c); setCustomerSearch(''); }} className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm border-b border-slate-50 flex justify-between"><div><div className="font-medium text-slate-800">{c.name}</div><div className="text-xs text-slate-500">{c.mobile}</div></div>{c.wallet_credit_balance > 0 && <span className="text-xs text-emerald-600 font-bold">₹{c.wallet_credit_balance} Cr</span>}</button>))}</div>}
                </div>
                
                {/* --- ADD CUSTOMER BUTTON --- */}
                <button 
                    onClick={() => setIsCustomerModalOpen(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-xl flex-shrink-0"
                    title="Add New Customer"
                >
                    <UserPlus className="w-5 h-5" />
                </button>
            </div>
          )}
        </div>
        
        {/* Cart List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.length === 0 ? <div className="h-full flex flex-col items-center justify-center text-slate-400"><ShoppingCart className="w-16 h-16 mb-2 opacity-20" /><p>Cart is empty</p></div> : 
            cart.map(item => (
              <div key={item.uniqueId} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-3">
                <div className="flex justify-between items-start"><div><h4 className="font-semibold text-slate-800">{item.name}</h4><p className="text-xs text-slate-500">{item.color} / {item.size}</p></div><button onClick={() => removeFromCart(item.uniqueId)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button></div>
                <div className="flex items-end gap-3 text-sm">
                  <div className="flex-1"><label className="text-[10px] text-slate-400 uppercase font-bold">Price</label><div className="font-bold text-slate-800 py-1">₹{item.price}</div></div>
                  <div className="flex-1"><label className="text-[10px] text-slate-400 uppercase font-bold">Qty</label><input type="number" className="w-full border-b border-slate-200 py-1 outline-none font-mono" value={item.qty} onChange={e => updateCartItem(item.uniqueId, 'qty', e.target.value)} /></div>
                  {/* GST Column removed as requested */}
                  <div className="text-right"><div className="text-[10px] text-slate-400 uppercase font-bold">Total</div><div className="font-bold text-slate-800 py-1">₹{(item.price * item.qty).toFixed(0)}</div></div>
                </div>
              </div>
            ))
          }
        </div>
        
        {/* Summary */}
        <div className="bg-white border-t border-slate-200 p-6 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          
          {/* Coupon Input */}
          <div className="mb-4">
             {appliedCoupon ? (
               <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 p-2 rounded-lg">
                  <span className="text-sm text-emerald-700 flex items-center gap-1 font-medium"><Ticket className="w-4 h-4"/> Applied: {appliedCoupon.code}</span>
                  <button onClick={removeCoupon} className="text-emerald-500 hover:text-emerald-700"><X className="w-4 h-4" /></button>
               </div>
             ) : (
               <div className="flex gap-2">
                 <input placeholder="Coupon" className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm uppercase" value={couponCode} onChange={e => setCouponCode(e.target.value.toUpperCase())} />
                 <button onClick={applyCoupon} className="bg-slate-800 text-white px-3 py-1.5 rounded-lg text-sm font-medium">Apply</button>
               </div>
             )}
             {couponError && <p className="text-xs text-red-500 mt-1 ml-1">{couponError}</p>}
          </div>

          <div className="space-y-2 mb-4 text-sm">
            <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>₹{subtotal.toFixed(2)}</span></div>
            {discount > 0 && <div className="flex justify-between text-rose-600 font-medium"><span>Discount</span><span>- ₹{discount.toFixed(2)}</span></div>}
            <div className="flex justify-between text-lg font-bold text-slate-700 pt-2 border-t border-dashed border-slate-200"><span>Grand Total</span><span>₹{grandTotal.toFixed(2)}</span></div>
            {creditUsed > 0 && <div className="flex justify-between text-emerald-600 font-medium"><span>Wallet Credit Applied</span><span>- ₹{creditUsed.toFixed(2)}</span></div>}
            <div className="flex justify-between text-xl font-bold text-slate-900 pt-2"><span>Net Payable</span><span>₹{netPayable.toFixed(2)}</span></div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div><label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Received Amount</label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">₹</span><input type="number" className="w-full pl-6 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-bold outline-none focus:border-blue-500" value={paidAmount} onChange={e => setPaidAmount(e.target.value)} placeholder="0" /></div></div>
            <div><label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Due Amount</label><div className={`w-full py-2 px-3 rounded-lg font-bold border bg-slate-50 ${dueAmount > 0 ? 'text-red-600 border-red-200' : 'text-emerald-600 border-emerald-200'}`}>₹{dueAmount > 0 ? dueAmount.toFixed(2) : '0.00'}</div></div>
          </div>
          <button onClick={handleCheckout} disabled={isProcessing || cart.length === 0} className="w-full bg-slate-900 hover:bg-slate-800 text-white py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed">{isProcessing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Printer className="w-5 h-5" />}{isProcessing ? 'Processing...' : 'Complete Order & Print'}</button>
        </div>
      </div>

      {/* --- ADD CUSTOMER MODAL --- */}
      {isCustomerModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl animate-in zoom-in-95">
                <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-2">
                    <h3 className="font-bold text-slate-800">New Customer</h3>
                    <button onClick={() => setIsCustomerModalOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
                </div>
                <form onSubmit={handleAddCustomer} className="space-y-4">
                    <div><label className="block text-sm font-medium text-slate-700">Name</label><input required className="w-full border p-2 rounded-lg" value={newCustomer.name} onChange={e=>setNewCustomer({...newCustomer, name: e.target.value})} /></div>
                    <div><label className="block text-sm font-medium text-slate-700">Mobile</label><input required className="w-full border p-2 rounded-lg" value={newCustomer.mobile} onChange={e=>setNewCustomer({...newCustomer, mobile: e.target.value})} /></div>
                    <div><label className="block text-sm font-medium text-slate-700">Profession</label><input className="w-full border p-2 rounded-lg" value={newCustomer.profession} onChange={e=>setNewCustomer({...newCustomer, profession: e.target.value})} /></div>
                    <div><label className="block text-sm font-medium text-slate-700">Address</label><input className="w-full border p-2 rounded-lg" value={newCustomer.address} onChange={e=>setNewCustomer({...newCustomer, address: e.target.value})} /></div>
                    <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-lg font-bold">Add Customer</button>
                </form>
            </div>
        </div>
      )}

    </div>
  );
}