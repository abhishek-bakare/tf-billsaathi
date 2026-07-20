import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Package, Truck, CheckCircle, Clock, ShoppingBag, ChevronRight, RotateCcw, AlertCircle, Banknote } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function MyOrders({ db, user }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db || !user) {
        setLoading(false);
        return;
    }

    const collectionPath = (typeof __app_id !== 'undefined') 
        ? collection(db, 'artifacts', __app_id, 'public', 'data', 'orders') 
        : collection(db, 'orders');
        
    const q = query(
        collectionPath, 
        where('customerId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const rawList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // --- STRICT FILTER LOGIC ---
      const validOrders = rawList.filter(order => {
          // Only filter Online orders (Offline orders always show)
          if (order.source === 'online') {
              const status = (order.status || '').toLowerCase();
              const payMethod = (order.paymentMethod || '').toLowerCase();

              // 1. Always hide failed/cancelled payments
              if (status.includes('failed') || status === 'cancelled') {
                  return false; 
              }

              // 2. Logic for 'New' status
              if (status === 'new') {
                  // Explicitly SHOW COD orders
                  if (payMethod === 'cod') {
                      return true;
                  }
                  
                  // HIDE Online/PayU orders that are still 'New' (Abandoned Checkout)
                  // (Online orders should be 'Paid' to be valid)
                  if (payMethod === 'online' || payMethod === 'payu') {
                      return false;
                  }
              }
          }
          // Default to showing everything else (Paid, Shipped, Offline orders, etc.)
          return true; 
      });

      // Sort by Date Descending
      validOrders.sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));
      
      setOrders(validOrders);
      setLoading(false);
    }, (err) => {
        console.error("Error fetching orders:", err);
        setLoading(false);
    });

    return () => unsubscribe();
  }, [db, user]);

  if (!user) {
    return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
            <h2 className="text-2xl font-bold text-slate-800 mb-4">Please Log In</h2>
            <Link to="/login" className="bg-blue-600 text-white px-6 py-2 rounded-full font-bold">Login Now</Link>
        </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-slate-900 mb-8">My Orders</h1>

      {loading ? (
        <div className="text-center py-10 text-slate-500">Loading your orders...</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-100 shadow-sm">
            <ShoppingBag className="w-16 h-16 text-slate-200 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-slate-700 mb-2">No active orders</h3>
            <p className="text-slate-500 mb-6">You haven't placed any orders yet.</p>
            <Link to="/shop" className="text-blue-600 font-bold hover:underline">Start Shopping</Link>
        </div>
      ) : (
        <div className="space-y-6">
          {orders.map(order => {
             // Logic for Date Display
             let displayDate = order.date;
             let dateLabel = 'Order Placed';

             if (order.status === 'Returned' && order.lastReturnDate) {
                displayDate = order.lastReturnDate;
                dateLabel = 'Returned On';
             } else if (order.status !== 'New' && order.lastUpdated) {
                displayDate = order.lastUpdated;
                dateLabel = 'Last Updated';
             }

             const payMethod = (order.paymentMethod || '').toLowerCase();

             return (
            <div key={order.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              <div className="bg-slate-50 px-6 py-4 flex flex-wrap justify-between items-center gap-4 border-b border-slate-100">
                <div className="flex gap-6 text-sm">
                    <div>
                        <div className="text-slate-500 uppercase text-xs font-bold mb-1">{dateLabel}</div>
                        <div className="font-medium text-slate-800">
                            {displayDate?.seconds 
                                ? new Date(displayDate.seconds * 1000).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) 
                                : 'Just now'}
                        </div>
                    </div>
                    <div>
                        <div className="text-slate-500 uppercase text-xs font-bold mb-1">Total</div>
                        <div className="font-medium text-slate-800">₹{order.grandTotal?.toFixed(2)}</div>
                    </div>
                    <div>
                        <div className="text-slate-500 uppercase text-xs font-bold mb-1">Order #</div>
                        <div className="font-medium text-slate-800">{order.id.slice(0, 8).toUpperCase()}</div>
                    </div>
                </div>
                <div className="flex items-center gap-2 text-sm font-medium">
                    {/* Status Badge Logic */}
                    {order.status === 'Paid' ? (
                        <span className="text-emerald-600 flex items-center gap-1"><CheckCircle className="w-4 h-4"/> Paid</span>
                    ) : order.status === 'Returned' ? (
                        <span className="text-rose-600 flex items-center gap-1"><RotateCcw className="w-4 h-4"/> Returned</span>
                    ) : (
                        <span className="text-blue-600 flex items-center gap-1">
                            {(order.status === 'New' && payMethod === 'cod') ? <Banknote className="w-4 h-4"/> : <Clock className="w-4 h-4"/>} 
                            {(order.status === 'New' && payMethod === 'cod') ? 'Order Placed (COD)' : order.status}
                        </span>
                    )}
                </div>
              </div>
              
              <div className="p-6">
                {order.items.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-4 mb-4 last:mb-0">
                        <div className="w-20 h-20 bg-slate-100 rounded-lg flex-shrink-0 overflow-hidden border border-slate-200">
                            {item.image ? (
                                <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-300"><Package className="w-8 h-8"/></div>
                            )}
                        </div>
                        <div className="flex-1">
                            <h4 className="font-bold text-slate-800">{item.name}</h4>
                            <p className="text-sm text-slate-500">{item.color} / {item.size} • Qty: {item.qty}</p>
                            <p className="text-sm font-medium text-slate-900 mt-1">₹{item.price}</p>
                        </div>
                    </div>
                ))}
              </div>
              
              <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex justify-between items-center">
                   <span className="text-xs text-slate-400">Items: {order.items.length}</span>
                  <Link to={`/order/${order.id}`} className="text-sm text-blue-600 font-medium hover:underline cursor-pointer flex items-center gap-1">
                      View Details <ChevronRight className="w-4 h-4" />
                  </Link>
              </div>
            </div>
          );
        })}
        </div>
      )}
    </div>
  );
}