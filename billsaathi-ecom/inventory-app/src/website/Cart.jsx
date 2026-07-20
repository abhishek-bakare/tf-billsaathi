import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, ShoppingBag, ArrowRight, Ticket, X, Loader2 } from 'lucide-react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';

export default function Cart({ cart, removeFromCart, updateCartQty, db, coupon, setCoupon }) {
  const [couponInput, setCouponInput] = useState('');
  const [error, setError] = useState('');
  const [loadingCoupon, setLoadingCoupon] = useState(false);
  
  // Shipping Settings State
  const [shippingSettings, setShippingSettings] = useState({
      freeThreshold: 999,
      defaultCost: 50
  });

  // Fetch Shipping Settings
  useEffect(() => {
      if (!db) return;
      const fetchSettings = async () => {
          try {
            const collectionPath = (typeof __app_id !== 'undefined') 
                ? `artifacts/${__app_id}/public/data/settings` 
                : 'settings';
            const docSnap = await getDoc(doc(db, collectionPath, 'shipping'));
            if (docSnap.exists()) {
                const data = docSnap.data();
                setShippingSettings({
                    freeThreshold: Number(data.freeShippingThreshold || 999),
                    defaultCost: Number(data.defaultCost || 50)
                });
            }
          } catch (e) {
              console.error("Shipping settings error:", e);
          }
      };
      fetchSettings();
  }, [db]);

  // Calculations
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

  // Dynamic Shipping Logic
  const netTotal = subtotal - discount;
  const shipping = netTotal >= shippingSettings.freeThreshold ? 0 : shippingSettings.defaultCost;
  const total = netTotal + shipping;

  const applyCoupon = async () => {
    if (!couponInput.trim()) return;
    if (!db) return setError("System unavailable");
    
    setLoadingCoupon(true);
    setError('');

    try {
        const collectionPath = (typeof __app_id !== 'undefined') 
            ? `artifacts/${__app_id}/public/data/coupons` 
            : 'coupons';
            
        const q = query(collection(db, collectionPath), where('code', '==', couponInput.toUpperCase()), where('isActive', '==', true));
        const snap = await getDocs(q);

        if (snap.empty) {
            setError("Invalid or inactive coupon.");
            setLoadingCoupon(false);
            return;
        }

        const couponData = snap.docs[0].data();

        if (couponData.expiryDate) {
            const today = new Date();
            today.setHours(0,0,0,0);
            const expiry = new Date(couponData.expiryDate);
            if (today > expiry) {
                setError("This coupon has expired.");
                setLoadingCoupon(false);
                return;
            }
        }

        if (subtotal < couponData.minOrderAmount) {
            setError(`Add items worth ₹${couponData.minOrderAmount} to use this.`);
            setLoadingCoupon(false);
            return;
        }

        setCoupon(couponData);
        setCouponInput('');
    } catch (err) {
        console.error(err);
        setError("Error applying coupon.");
    }
    setLoadingCoupon(false);
  };

  const removeCoupon = () => {
      setCoupon(null);
  };

  if (cart.length === 0) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mb-6">
          <ShoppingBag className="w-10 h-10 text-blue-500" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Your Cart is Empty</h2>
        <p className="text-slate-500 mb-8 max-w-sm">Looks like you haven't added anything to your cart yet.</p>
        <Link to="/shop" className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-slate-800 transition-colors">
          Start Shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-slate-900 mb-8">Shopping Cart</h1>
      
      <div className="flex flex-col lg:flex-row gap-12">
        {/* CART ITEMS */}
        <div className="flex-1 space-y-6">
          {cart.map((item, idx) => (
            <div key={idx} className="flex gap-4 p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
              <div className="w-24 h-24 bg-slate-100 rounded-lg flex-shrink-0 overflow-hidden">
                {item.image && <img src={item.image} alt={item.name} className="w-full h-full object-cover" />}
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-slate-800">{item.name}</h3>
                    <p className="text-sm text-slate-500">{item.color} / {item.size}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-slate-900">₹{item.price}</p>
                    <p className="text-[10px] text-slate-400">(Incl. GST)</p>
                  </div>
                </div>
                <div className="flex justify-between items-end mt-4">
                  <div className="inline-flex items-center border border-slate-200 rounded-lg select-none">
                    <button onClick={() => updateCartQty(idx, item.qty - 1)} className="px-3 py-1 text-slate-500 hover:bg-slate-50 disabled:opacity-30" disabled={item.qty <= 1}>-</button>
                    <span className="px-2 text-sm font-medium text-slate-900 w-8 text-center">{item.qty}</span>
                    <button onClick={() => updateCartQty(idx, item.qty + 1)} className="px-3 py-1 text-slate-500 hover:bg-slate-50">+</button>
                  </div>
                  <button onClick={() => removeFromCart(idx)} className="text-sm text-red-500 hover:text-red-700 flex items-center gap-1">
                    <Trash2 className="w-4 h-4" /> Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* SUMMARY */}
        <div className="w-full lg:w-96">
          <div className="bg-white p-6 border border-slate-200 rounded-xl shadow-sm sticky top-24">
            <h3 className="font-bold text-lg text-slate-900 mb-4">Order Summary</h3>
            
            <div className="space-y-3 mb-6">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span>₹{subtotal.toFixed(2)}</span>
              </div>
              
              <div className="flex justify-between text-slate-600">
                <span>Shipping</span>
                <span>{shipping === 0 ? <span className="text-emerald-600">Free</span> : `₹${shipping}`}</span>
              </div>

              <div className="pt-3 border-t border-slate-100">
                 {coupon ? (
                     <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex justify-between items-center">
                         <div>
                             <p className="text-sm font-bold text-emerald-700 flex items-center gap-1"><Ticket className="w-3 h-3"/> {coupon.code}</p>
                             <p className="text-xs text-emerald-600">Discount applied</p>
                         </div>
                         <button onClick={removeCoupon} className="text-emerald-500 hover:text-emerald-700"><X className="w-4 h-4"/></button>
                     </div>
                 ) : (
                     <div className="flex gap-2">
                         <input placeholder="Coupon Code" className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm uppercase" value={couponInput} onChange={e => setCouponInput(e.target.value.toUpperCase())} />
                         <button onClick={applyCoupon} disabled={loadingCoupon || !couponInput} className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50">
                            {loadingCoupon ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Apply'}
                         </button>
                     </div>
                 )}
                 {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
                 {coupon && (
                     <div className="flex justify-between text-emerald-600 font-bold mt-2">
                        <span>Discount</span>
                        <span>- ₹{discount.toFixed(2)}</span>
                     </div>
                 )}
              </div>

              <div className="border-t border-slate-100 pt-3 flex justify-between font-bold text-slate-900 text-lg">
                <span>Total</span>
                <span>₹{total.toFixed(2)}</span>
              </div>
            </div>

            <Link to="/checkout" className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors">
              Proceed to Checkout <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}