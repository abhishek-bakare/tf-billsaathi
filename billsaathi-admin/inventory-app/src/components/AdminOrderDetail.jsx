import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions'; 
import { 
  ArrowLeft, Package, MapPin, CreditCard, Calendar, 
  User, Phone, Mail, Globe, Store, Truck, Loader2, AlertTriangle, Box, FileText, RefreshCw, Printer, BadgeCheck, Banknote
} from 'lucide-react';
import { generateBill } from '../utils/billGenerator'; 

export default function AdminOrderDetail({ db }) {
  const { orderId } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [labelLoading, setLabelLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);

  const ORDER_STATUSES = [
    'Order Placed', 'Processing', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered', 'Returned', 'Cancelled'
  ];

  const fetchOrder = async () => {
    setLoading(true);
    try {
      const collectionPath = (typeof __app_id !== 'undefined') 
          ? `artifacts/${__app_id}/public/data/orders` 
          : 'orders';
          
      const docRef = doc(db, collectionPath, orderId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        setOrder({ id: docSnap.id, ...docSnap.data() });
      }
    } catch (err) {
      console.error("Error fetching order:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!db || !orderId) return;
    fetchOrder();
  }, [db, orderId]);

  const handleStatusChange = async (newStatus) => {
    if (!db || !orderId) return;
    try {
        const collectionPath = (typeof __app_id !== 'undefined') ? `artifacts/${__app_id}/public/data/orders` : 'orders';
        const orderRef = doc(db, collectionPath, orderId);
        
        await updateDoc(orderRef, {
            status: newStatus,
            lastUpdated: serverTimestamp()
        });
        
        setOrder(prev => ({ ...prev, status: newStatus }));
    } catch (error) {
        console.error("Error updating status:", error);
        alert("Failed to update status.");
    }
  };

  const handleShiprocketPush = async () => {
      if (!confirm("Push this order to Shiprocket? Ensure weight and dimensions are correct in inventory.")) return;
      setShippingLoading(true);
      
      try {
          const functions = getFunctions();
          const createOrderFn = httpsCallable(functions, 'createShiprocketOrder');
          
          const result = await createOrderFn({ orderId: order.id });
          
          alert("Success! Order created in Shiprocket.");
          setOrder(prev => ({
              ...prev,
              shiprocket_order_id: result.data.data.order_id,
              shiprocket_shipment_id: result.data.data.shipment_id,
              status: 'Processing'
          }));

      } catch (error) {
          console.error("Shiprocket Error:", error);
          alert("Failed to push to Shiprocket: " + error.message);
      }
      setShippingLoading(false);
  };

  const handleGenerateLabel = async () => {
      if (!order.shiprocket_shipment_id) return alert("Shipment ID missing. Push order first.");
      setLabelLoading(true);
      try {
          const functions = getFunctions();
          const generateLabelFn = httpsCallable(functions, 'generateShiprocketLabel');
          
          const result = await generateLabelFn({ shipmentId: order.shiprocket_shipment_id });
          
          if(result.data.url) {
              window.open(result.data.url, '_blank');
          } else {
              alert("Label URL not received.");
          }
      } catch (error) {
          console.error("Label Error:", error);
          alert("Failed to generate label: " + error.message);
      }
      setLabelLoading(false);
  };

  const handleSyncStatus = async () => {
      if (!order.shiprocket_shipment_id && !order.shiprocket_order_id) return alert("Not a Shiprocket order.");
      setSyncLoading(true);
      try {
          const functions = getFunctions();
          const syncStatusFn = httpsCallable(functions, 'syncShiprocketStatus');
          
          const result = await syncStatusFn({ orderId: order.id }); 
          
          if (result.data.newStatus) {
            setOrder(prev => ({ ...prev, status: result.data.newStatus }));
            alert(`Status Synced: ${result.data.newStatus}`);
          } else {
            alert("Status Synced. No change.");
          }
      } catch (error) {
          console.error("Sync Error:", error);
          alert("Failed to sync status: " + error.message);
      }
      setSyncLoading(false);
  };

  const handleDownloadInvoice = () => {
      if (!order) return;
      generateBill({
          ...order,
          orderId: order.id
      });
  };

  if (loading && !order) return <div className="p-10 text-center text-slate-500">Loading Order Details...</div>;
  if (!order) return <div className="p-10 text-center text-slate-500">Order not found.</div>;

  // Format Helpers
  const formatCurrency = (amount) => Number(amount || 0).toFixed(2);
  const shippingCost = Number(order.shipping || 0);

  // Logic to determine if payment failed/cancelled
  const statusLower = (order.status || '').toLowerCase();
  const isFailedOrCancelled = statusLower === 'payment failed' || statusLower === 'cancelled' || statusLower === 'failed';
  const displayPaidAmount = isFailedOrCancelled ? 0 : (order.paidAmount || 0);

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-auto">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-4 flex items-center gap-4 sticky top-0 z-10">
        <Link to="/admin/orders" className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-3">
            Order #{order.id.slice(0, 8).toUpperCase()}
            {order.source === 'online' ? (
                <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded border border-blue-200">
                    <Globe className="w-3 h-3" /> Online
                </span>
            ) : (
                <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 text-xs px-2 py-0.5 rounded border border-slate-200">
                    <Store className="w-3 h-3" /> Offline
                </span>
            )}
            <button onClick={fetchOrder} title="Refresh Order Data" className="ml-2 p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-50 rounded-full">
                <RefreshCw className="w-4 h-4" />
            </button>
            </h1>
            <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5" />
                {order.date?.seconds 
                    ? new Date(order.date.seconds * 1000).toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' }) 
                    : 'N/A'}
            </p>
        </div>
        
        <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-600">Status:</span>
            {order.source === 'online' ? (
                <select 
                    value={order.status} 
                    onChange={(e) => handleStatusChange(e.target.value)}
                    className={`text-sm font-bold px-3 py-1.5 rounded-lg border-none outline-none cursor-pointer ${
                        order.status === 'Delivered' ? 'bg-emerald-100 text-emerald-700' :
                        order.status === 'Cancelled' || order.status === 'Returned' || order.status === 'Payment Failed' ? 'bg-red-100 text-red-700' :
                        'bg-blue-100 text-blue-700'
                    }`}
                >
                    {ORDER_STATUSES.map(s => (
                        <option key={s} value={s}>{s}</option>
                    ))}
                </select>
            ) : (
                <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${
                    order.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' :
                    order.status === 'Returned' ? 'bg-rose-100 text-rose-700' :
                    'bg-slate-100 text-slate-700'
                }`}>
                    {order.status}
                </span>
            )}
        </div>
      </div>

      <div className="p-8 max-w-6xl mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* LEFT COLUMN: Items & Payment */}
            <div className="lg:col-span-2 space-y-6">
                
                {/* Items List */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <Package className="w-5 h-5 text-slate-500" /> Order Items ({order.items?.length})
                        </h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                            order.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' :
                            order.status === 'Returned' ? 'bg-rose-100 text-rose-700' :
                            'bg-blue-100 text-blue-700'
                        }`}>
                            {order.status}
                        </span>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {order.items?.map((item, idx) => (
                            <div key={idx} className="p-4 flex gap-4">
                                <div className="w-16 h-16 bg-slate-100 rounded-lg flex-shrink-0 overflow-hidden border border-slate-200">
                                    {item.image ? (
                                        <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-slate-300"><Package className="w-6 h-6"/></div>
                                    )}
                                </div>
                                <div className="flex-1">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h4 className="font-bold text-slate-800">{item.name}</h4>
                                            <p className="text-sm text-slate-500">{item.color} / {item.size}</p>
                                        </div>
                                        <p className="font-mono font-medium text-slate-900">₹{item.price}</p>
                                    </div>
                                    <div className="mt-1 flex justify-between items-center text-sm">
                                        <span className="text-slate-500">Qty: {item.qty}</span>
                                        <span className="text-slate-900 font-bold">₹{(item.price * item.qty).toFixed(2)}</span>
                                    </div>
                                    {item.returnedQty > 0 && (
                                        <div className="mt-1 text-xs text-rose-600 bg-rose-50 inline-block px-2 py-0.5 rounded font-medium">
                                            Returned: {item.returnedQty}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Payment Breakdown */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                    <h3 className="font-bold text-slate-800 mb-4">Payment Summary</h3>
                    <div className="space-y-2 text-sm text-slate-600 border-b border-slate-100 pb-4 mb-4">
                        <div className="flex justify-between">
                            <span>Subtotal</span>
                            <span>₹{formatCurrency(order.subtotal)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>GST Included</span>
                            <span>₹{formatCurrency(order.totalGst)}</span>
                        </div>
                        
                        <div className="flex justify-between">
                            <span>Shipping</span>
                            <span>
                                {shippingCost === 0 
                                    ? <span className="text-emerald-600 font-bold">Free</span> 
                                    : `₹${formatCurrency(shippingCost)}`}
                            </span>
                        </div>
                        
                        {order.discount > 0 && (
                            <div className="flex justify-between text-emerald-600">
                                <span>Discount {order.couponCode && `(${order.couponCode})`}</span>
                                <span>- ₹{formatCurrency(order.discount)}</span>
                            </div>
                        )}
                        {order.creditUsed > 0 && (
                            <div className="flex justify-between text-blue-600">
                                <span>Wallet Credit Used</span>
                                <span>- ₹{formatCurrency(order.creditUsed)}</span>
                            </div>
                        )}
                    </div>
                    <div className="flex justify-between font-bold text-lg text-slate-900 mb-1">
                        <span>Grand Total</span>
                        <span>₹{formatCurrency(order.grandTotal)}</span>
                    </div>
                    
                    {/* Payment Status & Details */}
                    <div className="bg-slate-50 rounded-lg p-3 mt-4 border border-slate-100">
                         <div className="flex justify-between items-center text-sm mb-2">
                             <span className="text-slate-500">Method</span>
                             <span className="font-bold text-slate-800 flex items-center gap-1">
                                {order.paymentMethod === 'Online' || order.paymentMethod === 'PayU' ? <CreditCard className="w-4 h-4"/> : <Banknote className="w-4 h-4"/>}
                                {order.paymentMethod === 'PayU' ? 'Online (PayU)' : order.paymentMethod}
                             </span>
                         </div>
                         
                         {order.paymentId && (
                             <div className="flex justify-between items-center text-sm mb-2">
                                <span className="text-slate-500">Transaction ID</span>
                                <span className="font-mono text-xs bg-white border border-slate-200 px-2 py-0.5 rounded text-slate-600 select-all">
                                    {order.paymentId}
                                </span>
                             </div>
                         )}

                         <div className="flex justify-between items-center text-sm mt-2 pt-2 border-t border-slate-200">
                             <span className="text-slate-500">Paid Amount</span>
                             {/* UPDATED: Show 0 if failed, otherwise actual paid */}
                             <span className={`font-bold ${isFailedOrCancelled ? 'text-red-500 line-through' : 'text-emerald-600'}`}>
                                ₹{formatCurrency(displayPaidAmount)}
                             </span>
                         </div>
                    </div>

                    {!isFailedOrCancelled && order.dueAmount > 0 && (
                        <div className="flex justify-between text-sm text-rose-600 font-bold mt-3 bg-rose-50 p-2 rounded">
                            <span>Balance Due</span>
                            <span>₹{formatCurrency(order.dueAmount)}</span>
                        </div>
                    )}
                </div>

            </div>

            {/* RIGHT COLUMN: Customer & Shipping */}
            <div className="space-y-6">
                
                {/* LOGISTICS & SHIPROCKET */}
                {order.source === 'online' && (
                    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <Truck className="w-5 h-5 text-blue-600" /> Logistics
                        </h3>
                        
                        {order.shiprocket_order_id ? (
                            <div className="space-y-3">
                                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                                    <p className="text-xs text-blue-600 font-bold uppercase mb-1">Shipment Created</p>
                                    <p className="text-sm text-slate-700">SR ID: <span className="font-mono">{order.shiprocket_order_id}</span></p>
                                    {order.awb_code && <p className="text-sm text-slate-700 mt-1">AWB: <span className="font-mono font-bold">{order.awb_code}</span></p>}
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <button 
                                        onClick={handleSyncStatus}
                                        disabled={syncLoading}
                                        className="text-xs bg-white border border-slate-300 text-slate-600 py-2 rounded hover:bg-slate-50 flex items-center justify-center gap-1"
                                    >
                                        {syncLoading ? <Loader2 className="w-3 h-3 animate-spin"/> : <RefreshCw className="w-3 h-3"/>} Sync Status
                                    </button>
                                    <button 
                                        onClick={handleGenerateLabel}
                                        disabled={labelLoading}
                                        className="text-xs bg-slate-800 text-white py-2 rounded hover:bg-slate-900 flex items-center justify-center gap-1"
                                    >
                                        {labelLoading ? <Loader2 className="w-3 h-3 animate-spin"/> : <Printer className="w-3 h-3"/>} Print Label
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <div className="bg-amber-50 p-3 rounded-lg border border-amber-100 mb-4 flex gap-2">
                                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                                    <p className="text-xs text-amber-700">Ready to ship? Push this order to Shiprocket to generate AWB.</p>
                                </div>
                                <button 
                                    onClick={handleShiprocketPush}
                                    disabled={shippingLoading}
                                    className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
                                >
                                    {shippingLoading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Box className="w-4 h-4"/>}
                                    Ship with Shiprocket
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Customer Info */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <User className="w-5 h-5 text-slate-500" /> Customer
                    </h3>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-lg">
                            {order.customerName?.charAt(0)}
                        </div>
                        <div>
                            <div className="font-bold text-slate-900">{order.customerName}</div>
                            <div className="text-xs text-slate-500">ID: {order.customerId?.slice(0,6)}...</div>
                        </div>
                    </div>
                    <div className="space-y-2 text-sm text-slate-600">
                        <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-slate-400"/> {order.customerMobile}</div>
                        {order.customerEmail && <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-slate-400"/> {order.customerEmail}</div>}
                    </div>
                </div>

                {/* Shipping Address */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <MapPin className="w-5 h-5 text-slate-500" /> Shipping Address
                    </h3>
                    <div className="text-sm text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                        {order.shippingAddress || (
                            <span className="text-slate-400 italic">No shipping address provided (Offline Order)</span>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <button 
                    onClick={handleDownloadInvoice}
                    className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                >
                    <FileText className="w-5 h-5" /> Download Invoice
                </button>

            </div>
        </div>
      </div>
    </div>
  );
}