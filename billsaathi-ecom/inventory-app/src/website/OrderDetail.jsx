import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore'; 
import { getFunctions, httpsCallable } from 'firebase/functions'; 
import { ArrowLeft, Package, MapPin, CreditCard, Calendar, Truck, RotateCcw, X, Loader2, Clock, AlertCircle } from 'lucide-react';
import { getAuth } from 'firebase/auth';

export default function OrderDetail({ db }) {
  const { orderId } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const auth = getAuth();
  const currentUser = auth.currentUser;
  
  // Return Modal State
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [itemToReturn, setItemToReturn] = useState(null); 
  const [returnQty, setReturnQty] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!db || !orderId) return;

    const fetchOrder = async () => {
      try {
        const collectionPath = (typeof __app_id !== 'undefined') 
            ? `artifacts/${__app_id}/public/data/orders` 
            : 'orders';
            
        const docRef = doc(db, collectionPath, orderId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (currentUser && data.customerId !== currentUser.uid) {
             navigate('/orders'); 
             return;
          }
          setOrder({ id: docSnap.id, ...data });
        }
      } catch (err) {
        console.error("Error fetching order:", err);
      }
      setLoading(false);
    };

    fetchOrder();
  }, [db, orderId, currentUser, navigate]);

  const openReturnModal = (item, index) => {
    setItemToReturn({ ...item, index });
    setReturnQty(1);
    setIsReturnModalOpen(true);
  };

  const handleReturnRequest = async () => {
    if (!itemToReturn || returnQty <= 0) return;
    
    const maxReturn = itemToReturn.qty - (itemToReturn.returnedQty || 0);
    if (returnQty > maxReturn) return alert("Cannot return more than purchased quantity.");

    if (!confirm(`Submit return request for ${returnQty} item(s)?\nAdmin approval required for refund.`)) return;

    setIsProcessing(true);

    try {
        const functions = getFunctions();
        const requestReturnFn = httpsCallable(functions, 'requestReturn');

        await requestReturnFn({
            uid: currentUser.uid, 
            orderId: orderId,
            itemIndex: itemToReturn.index,
            qty: returnQty
        });

        alert("Return Requested Successfully! You will be notified once approved.");
        setIsReturnModalOpen(false);
        window.location.reload(); 

    } catch (error) {
        console.error("Return Request Error:", error);
        alert("Failed to submit request: " + (error.message || "Unknown Error"));
    }
    setIsProcessing(false);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading Order...</div>;
  if (!order) return <div className="min-h-screen flex items-center justify-center text-slate-500">Order not found.</div>;

  const statusDate = order.lastReturnDate || order.lastUpdated;

  // --- 7-DAY RETURN POLICY CHECK ---
  const isWithinReturnWindow = () => {
      if (!order.date?.seconds) return false;
      const orderDate = new Date(order.date.seconds * 1000);
      const currentDate = new Date();
      const differenceInTime = currentDate.getTime() - orderDate.getTime();
      const differenceInDays = differenceInTime / (1000 * 3600 * 24);
      return differenceInDays <= 7;
  };

  const returnWindowOpen = isWithinReturnWindow();

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <Link to="/orders" className="inline-flex items-center text-slate-500 hover:text-blue-600 mb-6 font-medium">
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to My Orders
      </Link>

      <div className="flex flex-col md:flex-row justify-between items-start mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            Order #{order.id.slice(0, 8).toUpperCase()}
            <div className="flex flex-col items-start">
                <span className={`text-base px-3 py-1 rounded-full font-medium ${
                order.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' : 
                order.status === 'Returned' ? 'bg-rose-100 text-rose-700' : 
                order.status === 'Return Requested' ? 'bg-amber-100 text-amber-700' :
                'bg-blue-100 text-blue-700'
                }`}>
                {order.status}
                </span>
                {statusDate?.seconds && (
                    <span className="text-xs text-slate-400 mt-1 pl-1">
                        {new Date(statusDate.seconds * 1000).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                )}
            </div>
          </h1>
          <p className="text-slate-500 mt-2 flex items-center gap-2">
            <Calendar className="w-4 h-4" /> 
            Placed on {order.date?.seconds ? new Date(order.date.seconds * 1000).toLocaleString() : 'N/A'}
          </p>
        </div>
      </div>

      {/* --- ALERT IF RETURN WINDOW CLOSED --- */}
      {!returnWindowOpen && order.status !== 'Returned' && order.status !== 'Cancelled' && (
          <div className="mb-8 p-4 bg-orange-50 border border-orange-200 rounded-xl flex items-center gap-3 text-orange-700">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <div>
                  <p className="font-bold text-sm">Return Window Closed</p>
                  <p className="text-xs mt-0.5">The 7-day return period for this order has expired. Items can no longer be returned.</p>
              </div>
          </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Package className="w-5 h-5 text-slate-500" /> Order Items
              </h3>
            </div>
            <div className="divide-y divide-slate-100">
              {order.items?.map((item, idx) => {
                const alreadyReturned = item.returnedQty || 0;
                const canReturn = item.qty - alreadyReturned > 0;
                const isPending = item.returnStatus === 'Pending';

                return (
                  <div key={idx} className="p-6 flex flex-col sm:flex-row gap-4">
                    <div className="w-20 h-20 bg-slate-100 rounded-lg flex-shrink-0 overflow-hidden border border-slate-200">
                      {item.image ? (
                        <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300"><Package className="w-8 h-8"/></div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <div>
                          <Link to={`/product/${item.productId}`} className="font-bold text-slate-800 text-lg hover:text-blue-600 hover:underline">{item.name}</Link>
                          <p className="text-slate-500">{item.color} / {item.size}</p>
                        </div>
                        <p className="font-bold text-slate-900">₹{item.price}</p>
                      </div>
                      <div className="mt-2 flex justify-between items-center">
                          <div className="text-sm text-slate-500">
                              Qty: {item.qty} {alreadyReturned > 0 && <span className="text-rose-500 ml-2">(Returned: {alreadyReturned})</span>}
                          </div>
                          
                          {/* BUTTON LOGIC - WITH RETURN WINDOW CHECK */}
                          {canReturn && !isPending && returnWindowOpen && (
                              <button onClick={() => openReturnModal(item, idx)} className="text-xs border border-slate-300 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 hover:text-rose-600 transition-colors flex items-center gap-1">
                                  <RotateCcw className="w-3 h-3" /> Return Item
                              </button>
                          )}
                          
                          {isPending && (
                              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded font-bold flex items-center gap-1">
                                  <Clock className="w-3 h-3"/> Approval Pending
                              </span>
                          )}
                          
                          {!canReturn && alreadyReturned > 0 && !isPending && (
                              <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded font-bold">Fully Returned</span>
                          )}

                          {/* Show closed status if window closed and item not returned */}
                          {!returnWindowOpen && canReturn && !isPending && (
                              <span className="text-xs text-slate-400 italic">Return window closed</span>
                          )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><MapPin className="w-5 h-5 text-slate-500" /> Shipping Details</h3>
            <div className="text-sm text-slate-600 space-y-1">
              <p className="font-bold text-slate-800">{order.customerName}</p>
              <p>{order.shippingAddress}</p>
              <p className="mt-2 flex items-center gap-2"><CreditCard className="w-4 h-4"/> {order.customerMobile}</p>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
             <h3 className="font-bold text-slate-800 mb-4">Payment Summary</h3>
             <div className="space-y-3 text-sm border-b border-slate-100 pb-4 mb-4">
               <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>₹{order.subtotal?.toFixed(2)}</span></div>
               <div className="flex justify-between text-slate-600"><span>Shipping</span><span>{order.shipping === 0 ? 'Free' : `₹${order.shipping}`}</span></div>
             </div>
             <div className="flex justify-between font-bold text-lg text-slate-900"><span>Total Paid</span><span>₹{order.grandTotal?.toFixed(2)}</span></div>
          </div>
        </div>
      </div>

      {isReturnModalOpen && itemToReturn && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl animate-in zoom-in-95">
                <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-2">
                    <h3 className="font-bold text-slate-800">Return Item</h3>
                    <button onClick={() => setIsReturnModalOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
                </div>
                
                <div className="mb-4">
                    <div className="font-medium text-slate-800">{itemToReturn.name}</div>
                    <div className="text-sm text-slate-500">{itemToReturn.color} / {itemToReturn.size}</div>
                    <div className="text-sm text-slate-500 mt-1">Price: ₹{itemToReturn.price}</div>
                </div>

                <div className="mb-6">
                    <label className="block text-sm font-medium text-slate-700 mb-2">Quantity to Return</label>
                    <div className="flex items-center border border-slate-300 rounded-lg w-32">
                        <button className="px-3 py-2 hover:bg-slate-50 disabled:opacity-50" onClick={() => setReturnQty(Math.max(1, returnQty - 1))} disabled={returnQty <= 1}>-</button>
                        <span className="flex-1 text-center font-bold">{returnQty}</span>
                        <button className="px-3 py-2 hover:bg-slate-50 disabled:opacity-50" onClick={() => setReturnQty(Math.min(itemToReturn.qty - (itemToReturn.returnedQty||0), returnQty + 1))} disabled={returnQty >= (itemToReturn.qty - (itemToReturn.returnedQty||0))}>+</button>
                    </div>
                </div>

                <div className="bg-amber-50 p-3 rounded-lg mb-6 text-sm text-amber-800 border border-amber-100">
                    Refund Amount: <span className="font-bold">₹{(itemToReturn.price * returnQty).toFixed(2)}</span>
                    <div className="text-xs mt-1">Will be credited to wallet after Admin approval.</div>
                </div>

                <button 
                    onClick={handleReturnRequest}
                    disabled={isProcessing}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-70"
                >
                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin"/> : <RotateCcw className="w-4 h-4" />}
                    Submit Request
                </button>
            </div>
        </div>
      )}
    </div>
  );
}