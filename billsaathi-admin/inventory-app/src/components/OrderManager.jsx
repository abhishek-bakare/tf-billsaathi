import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, deleteDoc, doc, runTransaction, serverTimestamp, limit, startAfter, where } from 'firebase/firestore';
import { Search, Printer, Trash2, Banknote, X, Globe, Store, RotateCcw, Eye, Filter, Calendar, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

// IMPORT FROM SEPARATE UTILITY FILE
import { generateBill } from '../utils/billGenerator';

export default function OrderManager({ db }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Pagination State
  const ITEMS_PER_PAGE = 20;
  const [lastDoc, setLastDoc] = useState(null); // Cursor for current page end
  const [pageHistory, setPageHistory] = useState([]); // Stack of start cursors
  const [currentPage, setCurrentPage] = useState(1);
  const [isNextPageAvailable, setIsNextPageAvailable] = useState(true);

  // Search & Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterSource, setFilterSource] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterItem, setFilterItem] = useState('');

  // Settle Due States
  const [settleOrder, setSettleOrder] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // 1. Fetch Orders (Paginated)
  const fetchOrders = async (cursor = null) => {
    if (!db) return;
    setLoading(true);

    try {
        const isCanvas = typeof __app_id !== 'undefined';
        const collectionPath = isCanvas 
            ? `artifacts/${__app_id}/public/data/orders` 
            : 'orders';
        const collectionRef = collection(db, collectionPath);

        // SEARCH MODE: Fetch more items to allow client-side search filtering
        if (searchTerm) {
            const q = query(collectionRef, orderBy('date', 'desc'), limit(100));
            const snapshot = await getDocs(q);
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setOrders(list);
            setIsNextPageAvailable(false); 
        } 
        // PAGINATION MODE
        else {
            let qArgs = [collectionRef];

            // Filter by Source if selected (Requires Index if combined with sort, usually works for date desc)
            if (filterSource !== 'all') {
                qArgs.push(where('source', '==', filterSource));
            }

            // Always sort by Date Descending
            qArgs.push(orderBy('date', 'desc'));

            if (cursor) {
                qArgs.push(startAfter(cursor));
            }

            qArgs.push(limit(ITEMS_PER_PAGE));

            const q = query(...qArgs);
            const snapshot = await getDocs(q);
            
            const fetchedOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setOrders(fetchedOrders);
            
            // Update Cursor
            const lastVisible = snapshot.docs[snapshot.docs.length - 1];
            setLastDoc(lastVisible);
            
            // Check if we got full page
            setIsNextPageAvailable(snapshot.docs.length === ITEMS_PER_PAGE);
        }
    } catch (error) {
        console.error("Fetch Error:", error);
    }
    setLoading(false);
  };

  // Initial Load & Reset on Filter/Search Change
  useEffect(() => {
    setLastDoc(null);
    setPageHistory([]);
    setCurrentPage(1);
    fetchOrders(null);
  }, [db, filterSource, searchTerm]); // Trigger reload when key filters change

  // Handle Next Page
  const handleNextPage = () => {
    if (isNextPageAvailable && lastDoc) {
        setPageHistory(prev => [...prev, lastDoc]);
        setCurrentPage(prev => prev + 1);
        fetchOrders(lastDoc);
    }
  };

  // Handle Prev Page
  const handlePrevPage = () => {
    if (pageHistory.length > 0) {
        const newHistory = [...pageHistory];
        newHistory.pop(); 
        const prevCursor = newHistory.length > 0 ? newHistory[newHistory.length - 1] : null;
        
        setPageHistory(newHistory);
        setCurrentPage(prev => prev - 1);
        fetchOrders(prevCursor);
    }
  };

  const filteredOrders = orders.filter(order => {
    // 1. Search Term
    const matchesSearch = 
        order.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customerMobile?.includes(searchTerm);

    // 2. Date Filter
    let matchesDate = true;
    if (filterDate) {
        const datesToCheck = [order.date, order.lastUpdated, order.lastReturnDate];
        matchesDate = datesToCheck.some(d => {
            if (!d?.seconds) return false;
            const dateStr = new Date(d.seconds * 1000).toISOString().split('T')[0];
            return dateStr === filterDate;
        });
    }

    // 3. Source Filter (Already handled in Query, but double check for client safety)
    const matchesSource = filterSource === 'all' || (order.source || 'offline') === filterSource;

    // 4. Status Filter
    const hasReturns = order.items?.some(i => (i.returnedQty || 0) > 0);
    const effectiveStatus = (hasReturns && order.status !== 'Returned') ? 'Returned' : (order.status || 'Paid');
    const matchesStatus = filterStatus === 'all' || effectiveStatus.toLowerCase() === filterStatus.toLowerCase();

    // 5. Item Filter
    const matchesItem = !filterItem || order.items?.some(item => 
        item.name.toLowerCase().includes(filterItem.toLowerCase())
    );

    return matchesSearch && matchesDate && matchesSource && matchesStatus && matchesItem;
  });

  const handlePrint = (order) => {
    generateBill({
        ...order,
        orderId: order.id
    });
  };

  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to delete this order? This action cannot be undone.")) return;
    try {
        const isCanvas = typeof __app_id !== 'undefined';
        const docPath = isCanvas 
            ? `artifacts/${__app_id}/public/data/orders/${id}` 
            : `orders/${id}`;
        await deleteDoc(doc(db, docPath));
        // Remove locally
        setOrders(prev => prev.filter(o => o.id !== id));
    } catch (error) {
        console.error("Error deleting order:", error);
    }
  };

  const handleOpenSettle = (order) => {
    setSettleOrder(order);
    setPaymentAmount(order.dueAmount);
  };

  const handleSettleDue = async (e) => {
    e.preventDefault();
    if (!settleOrder || !paymentAmount) return;
    
    const amount = Number(paymentAmount);
    if (amount <= 0 || amount > settleOrder.dueAmount) {
        alert("Invalid amount.");
        return;
    }

    setIsProcessing(true);
    try {
        await runTransaction(db, async (transaction) => {
            const isCanvas = typeof __app_id !== 'undefined';
            const orderPath = isCanvas ? `artifacts/${__app_id}/public/data/orders/${settleOrder.id}` : `orders/${settleOrder.id}`;
            const custPath = isCanvas ? `artifacts/${__app_id}/public/data/customers/${settleOrder.customerId}` : `customers/${settleOrder.customerId}`;

            const orderRef = doc(db, orderPath);
            const custRef = doc(db, custPath);
            const orderDoc = await transaction.get(orderRef);
            const custDoc = await transaction.get(custRef);

            if (!orderDoc.exists()) throw "Order not found!";

            const currentOrder = orderDoc.data();
            const newPaid = Number(currentOrder.paidAmount) + amount;
            const newDue = Number(currentOrder.dueAmount) - amount;
            const newStatus = newDue <= 0 ? 'Paid' : 'Partial';

            transaction.update(orderRef, {
                paidAmount: newPaid,
                dueAmount: newDue,
                status: newStatus,
                lastUpdated: serverTimestamp() 
            });

            if (custDoc.exists()) {
                const currentCustDue = Number(custDoc.data().total_due_amount) || 0;
                transaction.update(custRef, {
                    total_due_amount: currentCustDue - amount
                });
            }
        });

        const updatedOrderData = {
            ...settleOrder,
            paidAmount: Number(settleOrder.paidAmount) + amount,
            dueAmount: Number(settleOrder.dueAmount) - amount,
            orderId: settleOrder.id,
            amountPaidNow: amount, 
            subtotal: settleOrder.subtotal || 0,
            totalGst: settleOrder.totalGst || 0,
            grandTotal: settleOrder.grandTotal || 0,
            creditUsed: settleOrder.creditUsed || 0,
            netPayable: settleOrder.netPayable || settleOrder.grandTotal
        };
        
        generateBill(updatedOrderData);

        alert("Payment Recorded & Bill Updated!");
        setSettleOrder(null);
        setPaymentAmount('');
        // Refresh Current Page
        fetchOrders(pageHistory.length > 0 ? pageHistory[pageHistory.length - 1] : null);

    } catch (error) {
        console.error("Settle Error:", error);
        alert("Failed to settle: " + error);
    }
    setIsProcessing(false);
  };

  const getStatusColor = (status) => {
      if (!status) return 'bg-gray-100 text-gray-700';
      const s = status.toLowerCase();
      if (s === 'paid') return 'bg-emerald-100 text-emerald-700';
      if (s === 'new') return 'bg-blue-100 text-blue-700';
      if (s.includes('return')) return 'bg-rose-100 text-rose-700';
      if (s === 'payment failed' || s === 'cancelled') return 'bg-red-100 text-red-700';
      return 'bg-amber-100 text-amber-700';
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-8 py-4">
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-slate-800">Orders & History</h2>
            <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
                type="text" 
                placeholder="Search Customer or Order ID..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm w-72 focus:ring-2 focus:ring-blue-500 outline-none"
            />
            </div>
        </div>

        {/* --- FILTERS BAR --- */}
        <div className="flex flex-wrap gap-3 items-center bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div className="flex items-center gap-2 text-slate-500 text-sm font-medium border-r border-slate-300 pr-3 mr-1">
                <Filter className="w-4 h-4" /> Filters:
            </div>

            <div className="relative">
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input 
                    type="date" 
                    className="pl-8 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                />
            </div>

            <select 
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
                value={filterSource}
                onChange={(e) => setFilterSource(e.target.value)}
            >
                <option value="all">All Sources</option>
                <option value="online">Online Store</option>
                <option value="offline">Offline / Shop</option>
            </select>

            <select 
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
            >
                <option value="all">All Statuses</option>
                <option value="Paid">Paid</option>
                <option value="Partial">Partial Due</option>
                <option value="New">New (Unpaid)</option>
                <option value="Returned">Returned</option>
                <option value="Payment Failed">Payment Failed</option>
            </select>

            <input 
                type="text" 
                placeholder="Filter by Product Name..." 
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 w-48"
                value={filterItem}
                onChange={(e) => setFilterItem(e.target.value)}
            />

            {(filterDate || filterSource !== 'all' || filterStatus !== 'all' || filterItem) && (
                <button 
                    onClick={() => { setFilterDate(''); setFilterSource('all'); setFilterStatus('all'); setFilterItem(''); }}
                    className="text-xs text-red-500 hover:underline ml-auto font-medium"
                >
                    Clear Filters
                </button>
            )}
        </div>
      </div>

      <div className="p-8 overflow-auto flex-1">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold text-slate-600 text-sm">Order ID</th>
                <th className="px-6 py-4 font-semibold text-slate-600 text-sm">Source</th>
                <th className="px-6 py-4 font-semibold text-slate-600 text-sm">Customer</th>
                <th className="px-6 py-4 font-semibold text-slate-600 text-sm">Date / Time</th>
                <th className="px-6 py-4 font-semibold text-slate-600 text-sm">Items</th>
                <th className="px-6 py-4 font-semibold text-slate-600 text-sm">Total / Paid</th>
                <th className="px-6 py-4 font-semibold text-slate-600 text-sm">Status</th>
                <th className="px-6 py-4 font-semibold text-slate-600 text-sm text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={8} className="p-6 text-center text-slate-500">Loading Orders...</td></tr>
              ) : filteredOrders.length === 0 ? (
                <tr><td colSpan={8} className="p-10 text-center text-slate-500">No orders found.</td></tr>
              ) : filteredOrders.map(order => {
                const statusDate = order.lastReturnDate || order.lastUpdated;
                const hasReturns = order.items?.some(i => (i.returnedQty || 0) > 0);
                const displayStatus = (hasReturns && order.status !== 'Returned') ? 'Returned' : order.status;
                  
                const statusLower = (displayStatus || '').toLowerCase();
                const isFailedOrCancelled = statusLower === 'payment failed' || statusLower === 'cancelled' || statusLower === 'failed';
                const displayPaid = isFailedOrCancelled ? 0 : (order.paidAmount || 0);

                return (
                <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-mono text-xs text-slate-500">
                    #{order.id.slice(0, 6).toUpperCase()}
                  </td>
                  <td className="px-6 py-4">
                    {order.source === 'online' ? (
                        <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-[10px] uppercase font-bold px-2 py-0.5 rounded border border-blue-200">
                            <Globe className="w-3 h-3" /> Online
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 text-[10px] uppercase font-bold px-2 py-0.5 rounded border border-slate-200">
                            <Store className="w-3 h-3" /> Offline
                        </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900">{order.customerName}</div>
                    <div className="text-xs text-slate-400">{order.customerMobile}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    <div className="flex flex-col">
                        <span>
                            {order.date?.seconds 
                            ? new Date(order.date.seconds * 1000).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) 
                            : 'N/A'}
                        </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    <div className="flex flex-col gap-1 max-h-20 overflow-y-auto">
                      {order.items?.map((item, idx) => (
                        <div key={idx} className="text-xs truncate max-w-[200px]" title={`${item.name} (${item.color}/${item.size})`}>
                          <span className="font-bold text-slate-900">{item.name}</span>
                          <span className="text-slate-500 ml-1">x{item.qty}</span>
                          {item.returnedQty > 0 && (
                              <span className="text-rose-500 text-[10px] ml-1 font-bold">(Ret: {item.returnedQty})</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <div className="font-bold text-slate-800" title="Amount Received">
                        ₹{Number(displayPaid).toFixed(2)}
                      </div>
                      <div className="text-xs text-slate-400 font-medium">
                        Bill: ₹{Number(order.grandTotal).toFixed(2)}
                      </div>
                      {!isFailedOrCancelled && Number(order.dueAmount) > 0 && (
                          <div className="text-xs text-red-500 font-bold mt-1">Due: ₹{Number(order.dueAmount).toFixed(2)}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col items-start gap-1">
                        <span className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 w-fit ${getStatusColor(displayStatus)}`}>
                        {displayStatus?.toLowerCase().includes('return') && <RotateCcw className="w-3 h-3" />}
                        {displayStatus}
                        </span>
                        
                        {statusDate?.seconds && (
                            <span className="text-[10px] text-slate-400 font-medium">
                                {new Date(statusDate.seconds * 1000).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                        )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                        <Link 
                            to={`/admin/order/${order.id}`}
                            className="text-slate-500 hover:text-blue-600 p-2 rounded hover:bg-blue-50 transition-colors"
                            title="View Details"
                        >
                            <Eye className="w-4 h-4" />
                        </Link>

                        {!isFailedOrCancelled && order.dueAmount > 0 && (
                            <button 
                                onClick={() => handleOpenSettle(order)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1 shadow-sm"
                                title="Settle Due Amount"
                            >
                                <Banknote className="w-3.5 h-3.5" /> Pay
                            </button>
                        )}
                        <button onClick={() => handlePrint(order)} className="text-slate-500 hover:text-blue-600 p-2 rounded"><Printer className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(order.id)} className="text-slate-500 hover:text-red-600 p-2 rounded"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
          
          {/* PAGINATION CONTROLS */}
          {!searchTerm && (
              <div className="p-4 flex justify-between items-center border-t border-slate-100 bg-slate-50">
                  <button 
                      onClick={handlePrevPage}
                      disabled={loading || currentPage === 1}
                      className="flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-blue-600 hover:bg-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                      <ChevronLeft className="w-4 h-4" /> Previous
                  </button>
                  
                  <span className="text-sm font-medium text-slate-500">Page {currentPage}</span>

                  <button 
                      onClick={handleNextPage}
                      disabled={loading || !isNextPageAvailable}
                      className="flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-blue-600 hover:bg-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                      Next <ChevronRight className="w-4 h-4" />
                  </button>
              </div>
          )}
          
          {loading && (
              <div className="p-6 flex justify-center text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin" />
              </div>
          )}
          
          {!loading && filteredOrders.length === 0 && (
               <div className="p-10 text-center text-slate-500">No orders found.</div>
          )}
        </div>
      </div>

      {settleOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95">
                <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700">Settle Due Amount</h3>
                    <button onClick={() => setSettleOrder(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
                </div>
                <form onSubmit={handleSettleDue} className="p-6">
                    <div className="mb-4">
                        <div className="text-sm text-slate-500 mb-1">Customer</div>
                        <div className="font-medium text-slate-800">{settleOrder.customerName}</div>
                    </div>
                    <div className="mb-6">
                        <div className="text-sm text-slate-500 mb-1">Pending Due</div>
                        <div className="text-2xl font-bold text-red-600">₹{settleOrder.dueAmount}</div>
                    </div>
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-slate-700 mb-2">Enter Payment Amount</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                            <input type="number" autoFocus required max={settleOrder.dueAmount} className="w-full pl-8 pr-4 py-3 border border-slate-300 rounded-lg text-lg font-bold outline-none focus:ring-2 focus:ring-emerald-500" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} />
                        </div>
                    </div>
                    <button type="submit" disabled={isProcessing} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-lg font-bold">
                        {isProcessing ? 'Processing...' : 'Confirm Payment & Print'}
                    </button>
                </form>
            </div>
        </div>
      )}
    </div>
  );
}