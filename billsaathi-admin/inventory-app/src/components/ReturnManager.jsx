import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, runTransaction, serverTimestamp, orderBy, updateDoc, limit, startAfter } from 'firebase/firestore';
import { Search, RotateCcw, ArrowLeft, CheckCircle, AlertTriangle, User, Calendar, Clock, Check, X, Store, Globe, Phone, MapPin, FileText, Printer, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { httpsCallable, getFunctions } from 'firebase/functions';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const generateReturnReceipt = (data) => {
    const doc = new jsPDF();
    
    // --- COMPANY HEADER ---
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(220, 38, 38); // Red color for Credit Note
    doc.text("CREDIT NOTE", 195, 20, null, null, "right");
    
    doc.setTextColor(0, 0, 0); // Reset black
    doc.setFontSize(14);
    doc.text("Drushya Store", 14, 20);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text("123, Fashion Street, Shirdi", 14, 26);
    doc.text("Maharashtra, India - 423109", 14, 31);
    doc.text("GSTIN: 27ABCDE1234F1Z5", 14, 36);
    doc.text("Email: support@drushyastore.com", 14, 41);

    // --- SEPARATOR ---
    doc.setDrawColor(220);
    doc.setLineWidth(0.5);
    doc.line(14, 48, 196, 48);

    // --- CREDIT NOTE & INVOICE DETAILS ---
    const cnDate = new Date().toLocaleDateString('en-IN');
    const cnNumber = `CN-${data.id ? data.id.slice(0,6).toUpperCase() : Date.now().toString().slice(-6)}`;
    
    doc.setTextColor(0);
    doc.setFont("helvetica", "bold");
    doc.text("Credit Note Details:", 14, 58);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`CN Number:`, 14, 64);   doc.text(cnNumber, 40, 64);
    doc.text(`CN Date:`, 14, 69);     doc.text(cnDate, 40, 69);
    doc.text(`Original Inv:`, 14, 74);doc.text(data.originalOrderId ? `#${data.originalOrderId.slice(0,8).toUpperCase()}` : (data.id ? `#${data.id.slice(0,8).toUpperCase()}` : 'N/A'), 40, 74);

    // --- CUSTOMER DETAILS ---
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Issued To:", 120, 58);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(data.customerName || "Guest", 120, 64);
    doc.text(`Phone: ${data.customerMobile || 'N/A'}`, 120, 69);
    
    // Address handling (wrap text)
    if (data.shippingAddress) {
        const splitAddress = doc.splitTextToSize(data.shippingAddress, 75);
        doc.text(splitAddress, 120, 74);
    }

    // --- ITEMS TABLE ---
    const tableColumn = ["#", "Item Description", "Variant", "Ret Qty", "Unit Price", "Total"];
    const tableRows = [];

    let i = 1;
    // Handle both formats (returnConfig object or itemsReturned array/map)
    const itemsData = data.returnConfig || data.itemsReturned;
    
    if (itemsData) {
        Object.values(itemsData).forEach((item) => {
            if (item.qty > 0) {
                const total = item.qty * item.price;
                tableRows.push([
                    i++,
                    item.name,
                    `${item.color} / ${item.size}`,
                    item.qty,
                    `Rs. ${Number(item.price).toFixed(2)}`,
                    `Rs. ${total.toFixed(2)}`
                ]);
            }
        });
    }

    autoTable(doc, {
        startY: 95,
        head: [tableColumn],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: 'bold' }, // Red theme header
        columnStyles: {
            0: { cellWidth: 10 }, // Sr No
            3: { halign: 'center' }, // Qty
            4: { halign: 'right' }, // Price
            5: { halign: 'right', fontStyle: 'bold' } // Total
        },
        styles: { fontSize: 9, cellPadding: 3 }
    });

    // --- TOTALS ---
    const finalY = doc.lastAutoTable.finalY + 10;
    
    doc.setFontSize(10);
    doc.text("Subtotal (Refund):", 140, finalY);
    doc.text(`Rs. ${Number(data.refundAmount).toFixed(2)}`, 195, finalY, null, null, "right");
    
    doc.setDrawColor(200);
    doc.line(140, finalY + 3, 195, finalY + 3);

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Total Credit:", 140, finalY + 10);
    doc.setTextColor(220, 38, 38);
    doc.text(`Rs. ${Number(data.refundAmount).toFixed(2)}`, 195, finalY + 10, null, null, "right");
    
    // --- FOOTER & SIGNATURE ---
    const footerY = 250;
    doc.setTextColor(0);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    
    doc.text("Terms & Conditions:", 14, footerY);
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text("1. This credit note is issued against the return of goods.", 14, footerY + 5);
    doc.text("2. The amount has been credited to your wallet balance.", 14, footerY + 9);
    doc.text("3. This is a computer generated document.", 14, footerY + 13);

    // Sign
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text("Authorized Signatory", 195, footerY, null, null, "right");
    doc.text("Drushya Store", 195, footerY + 15, null, null, "right");

    doc.save(`CreditNote_${cnNumber}.pdf`);
};

export default function ReturnManager({ db, user }) {
  const [activeTab, setActiveTab] = useState('requests'); // 'requests', 'manual', 'history'
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Pagination State
  const ITEMS_PER_PAGE = 20;
  const [lastDoc, setLastDoc] = useState(null);
  const [pageHistory, setPageHistory] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isNextPageAvailable, setIsNextPageAvailable] = useState(true);

  // Data States
  const [dataList, setDataList] = useState([]); // Shared state for lists (Requests, Orders, History)
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [returnConfig, setReturnConfig] = useState({}); 

  // 1. Unified Fetch Function (Paginated)
  const fetchData = async (cursor = null) => {
    if (!db) return;
    setLoading(true);

    try {
        const isCanvas = typeof __app_id !== 'undefined';
        const basePath = isCanvas ? `artifacts/${__app_id}/public/data` : '';
        
        let q;
        let qArgs = [];
        let collectionRef;

        if (activeTab === 'requests') {
            collectionRef = collection(db, `${basePath}/orders`);
            qArgs = [collectionRef, where('status', '==', 'Return Requested')];
        } else if (activeTab === 'history') {
            collectionRef = collection(db, `${basePath}/returns`);
            qArgs = [collectionRef, orderBy('date', 'desc')];
        } else if (activeTab === 'manual') {
            collectionRef = collection(db, `${basePath}/orders`);
            
            if (searchTerm) {
                // Search Mode: Fetch larger batch for client filtering (No Pagination)
                qArgs = [collectionRef, orderBy('date', 'desc'), limit(50)];
                const qSearch = query(...qArgs);
                const snapSearch = await getDocs(qSearch);
                const term = searchTerm.toLowerCase();
                const filtered = snapSearch.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .filter(d => 
                        (d.customerName || '').toLowerCase().includes(term) || 
                        d.id.toLowerCase().includes(term) ||
                        (d.customerMobile || '').includes(term)
                    );
                setDataList(filtered);
                setIsNextPageAvailable(false);
                setLoading(false);
                return;
            } else {
                // Default Mode: Recent Orders
                qArgs = [collectionRef, orderBy('date', 'desc')];
            }
        }

        // Apply Pagination
        if (cursor) {
            qArgs.push(startAfter(cursor));
        }
        qArgs.push(limit(ITEMS_PER_PAGE));

        q = query(...qArgs);
        const snap = await getDocs(q);
        
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setDataList(list);

        // Update Cursor
        const lastVisible = snap.docs[snap.docs.length - 1];
        setLastDoc(lastVisible);
        setIsNextPageAvailable(snap.docs.length === ITEMS_PER_PAGE);

    } catch (error) {
        console.error("Fetch Error:", error);
    }
    setLoading(false);
  };

  // 2. Initial Load & Tab Change
  useEffect(() => {
    setLastDoc(null);
    setPageHistory([]);
    setCurrentPage(1);
    setDataList([]);
    fetchData(null);
  }, [db, activeTab, searchTerm]); 

  // Pagination Handlers
  const handleNextPage = () => {
    if (isNextPageAvailable && lastDoc) {
        setPageHistory(prev => [...prev, lastDoc]);
        setCurrentPage(prev => prev + 1);
        fetchData(lastDoc);
    }
  };

  const handlePrevPage = () => {
    if (pageHistory.length > 0) {
        const newHistory = [...pageHistory];
        newHistory.pop();
        const prevCursor = newHistory.length > 0 ? newHistory[newHistory.length - 1] : null;
        
        setPageHistory(newHistory);
        setCurrentPage(prev => prev - 1);
        fetchData(prevCursor);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
  };

  const handleSelectOrder = (order) => {
    setSelectedOrder(order);
    const initialConfig = {};
    
    order.items.forEach((item, idx) => {
      const requestedQty = item.returnStatus === 'Pending' ? (item.returnRequestedQty || 0) : 0;
      const maxReturn = item.qty - (item.returnedQty || 0);
      
      initialConfig[`${idx}`] = { 
          qty: requestedQty, 
          max: maxReturn, 
          returnToStock: true, 
          price: item.price, 
          name: item.name, 
          color: item.color, 
          size: item.size,
          isRequest: item.returnStatus === 'Pending' 
      };
    });
    setReturnConfig(initialConfig);
  };

  const updateReturnConfig = (idx, field, value) => { setReturnConfig(prev => ({ ...prev, [idx]: { ...prev[idx], [field]: value } })); };
  
  const calculateRefund = () => { 
      let total = 0; 
      let currentReturnQty = 0;
      
      Object.values(returnConfig).forEach(item => { 
          total += (item.qty * item.price); 
          currentReturnQty += item.qty;
      }); 

      // Auto-include Shipping if Full Return
      if (selectedOrder) {
          const totalOrderQty = selectedOrder.items.reduce((sum, i) => sum + i.qty, 0);
          const prevReturned = selectedOrder.items.reduce((sum, i) => sum + (i.returnedQty || 0), 0);
          
          if (currentReturnQty + prevReturned >= totalOrderQty) {
              total += Number(selectedOrder.shipping || 0);
          }
      }
      
      return total; 
  };

  const processReturn = async () => {
    const refundAmount = calculateRefund();
    if (refundAmount <= 0) return alert("Please select items to return.");
    const confirmMsg = activeTab === 'requests' 
        ? `Approve Return Request?\n\nRefund: ₹${refundAmount}\nStock will be updated.`
        : `Confirm Manual Return?\n\nRefund: ₹${refundAmount} to Wallet.\nStock will be updated.`;
        
    if (!confirm(confirmMsg)) return;
    setLoading(true);

    try {
      const functions = getFunctions();
      const approveReturnFn = httpsCallable(functions, 'approveReturn');

      await approveReturnFn({
          orderId: selectedOrder.id,
          returnConfig: returnConfig,
          refundAmount: refundAmount
      });

      alert(activeTab === 'requests' ? "Return Approved & Processed!" : "Return Processed Successfully!");
      generateReturnReceipt({ ...selectedOrder, refundAmount, returnConfig, originalOrderId: selectedOrder.id });
      
      setSelectedOrder(null); 
      // Refresh Lists
      fetchData(pageHistory.length > 0 ? pageHistory[pageHistory.length - 1] : null);

    } catch (error) { console.error("Return Failed:", error); alert("Error: " + (error.message || "Failed to process return")); }
    setLoading(false);
  };

  const handleReject = async () => {
      if(!confirm("Reject this return request?")) return;
      try {
           const isCanvas = typeof __app_id !== 'undefined';
           const orderPath = isCanvas ? `artifacts/${__app_id}/public/data/orders/${selectedOrder.id}` : `orders/${selectedOrder.id}`;
           const orderRef = doc(db, orderPath);
           const currentItems = selectedOrder.items.map(item => {
               const newItem = { ...item };
               delete newItem.returnStatus;
               delete newItem.returnRequestedQty;
               return newItem;
           });
           
           await updateDoc(orderRef, {
               items: currentItems,
               status: 'Paid' 
           });
           
           alert("Request Rejected.");
           setSelectedOrder(null);
           fetchData(pageHistory.length > 0 ? pageHistory[pageHistory.length - 1] : null);
      } catch (e) { console.error(e); alert("Failed to reject"); }
  };

  const shippingIncluded = selectedOrder && (calculateRefund() > (Object.values(returnConfig).reduce((acc, i) => acc + (i.qty * i.price), 0)));

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-slate-800">Returns Management</h2>
          <div className="flex bg-slate-100 p-1 rounded-lg">
               <button onClick={() => { setActiveTab('requests'); setSelectedOrder(null); setSearchTerm(''); }} className={`px-4 py-2 rounded-md text-sm font-medium ${activeTab === 'requests' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>Pending Requests {activeTab === 'requests' && dataList.length > 0 && `(${dataList.length})`}</button>
               <button onClick={() => { setActiveTab('manual'); setSelectedOrder(null); setSearchTerm(''); }} className={`px-4 py-2 rounded-md text-sm font-medium ${activeTab === 'manual' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>Manual Return</button>
               <button onClick={() => { setActiveTab('history'); setSelectedOrder(null); setSearchTerm(''); }} className={`px-4 py-2 rounded-md text-sm font-medium ${activeTab === 'history' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>History</button>
          </div>
      </div>

      <div className="p-8 overflow-auto flex-1">
        {/* VIEW: PENDING REQUESTS */}
        {!selectedOrder && activeTab === 'requests' && (
            <div className="space-y-4">
                {dataList.length === 0 && !loading ? <div className="text-center text-slate-500 py-10">No pending return requests.</div> : 
                 dataList.map(order => (
                    <div key={order.id} className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/30 shadow-sm flex justify-between items-center hover:border-amber-400 cursor-pointer" onClick={() => handleSelectOrder(order)}>
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="font-bold text-slate-800">Order #{order.id.slice(0,6).toUpperCase()}</span>
                                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-bold">Action Required</span>
                            </div>
                            
                            {/* CUSTOMER INFO CARD */}
                            <div className="text-sm text-slate-600 mt-2 p-2 bg-white/60 rounded border border-amber-100">
                                <div className="font-bold">{order.customerName}</div>
                                <div className="flex items-center gap-4 text-xs text-slate-500 mt-1">
                                    <span className="flex items-center gap-1"><Phone className="w-3 h-3"/> {order.customerMobile}</span>
                                    {order.shippingAddress && (
                                        <span className="flex items-center gap-1 truncate max-w-[250px]" title={order.shippingAddress}>
                                            <MapPin className="w-3 h-3"/> {order.shippingAddress}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="text-right">
                            <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700">Review Request</button>
                        </div>
                    </div>
                 ))
                }
            </div>
        )}

        {/* VIEW: MANUAL SEARCH */}
        {!selectedOrder && activeTab === 'manual' && (
          <div className="space-y-4">
             <form onSubmit={handleSearchSubmit} className="flex gap-4 mb-6"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" /><input className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-slate-500" placeholder="Search Order ID, Name, Mobile..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div><button type="submit" className="bg-slate-800 text-white px-6 py-2 rounded-lg font-medium">Search</button></form>
             {dataList.length === 0 && !loading && <div className="text-center text-slate-500 py-10">No recent orders found.</div>}
             {dataList.map(order => (
                 <div key={order.id} onClick={() => handleSelectOrder(order)} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center cursor-pointer hover:border-blue-300">
                     <div>
                         <span className="font-bold">#{order.id.slice(0,6)}</span> - {order.customerName}
                         <span className="text-xs text-slate-400 ml-2">({order.date?.seconds ? new Date(order.date.seconds * 1000).toLocaleDateString() : 'N/A'})</span>
                     </div>
                     <div className="flex items-center gap-3">
                         {order.source === 'online' ? (
                             <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded border border-blue-100 flex items-center gap-1"><Globe className="w-3 h-3"/> Online</span>
                         ) : (
                             <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1"><Store className="w-3 h-3"/> Offline</span>
                         )}
                         <span className="text-blue-600 text-sm font-bold">Select</span>
                     </div>
                 </div>
             ))}
          </div>
        )}

        {/* VIEW: HISTORY */}
        {!selectedOrder && activeTab === 'history' && (
            <div className="space-y-4">
                {dataList.length === 0 && !loading ? <div className="text-center text-slate-500 py-10">No return history found.</div> :
                 dataList.map(ret => (
                     <div key={ret.id} className="bg-white p-4 rounded-xl border border-emerald-100 shadow-sm flex justify-between items-center">
                         <div>
                             <div className="flex items-center gap-2 mb-1">
                                <span className="font-bold text-slate-800">REF: {ret.originalOrderId ? ret.originalOrderId.slice(0,8) : 'N/A'}</span>
                                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-bold">Refunded</span>
                             </div>
                             <div className="text-sm text-slate-600">
                                 {ret.customerName} <span className="text-slate-400 mx-1">•</span> {ret.date?.seconds ? new Date(ret.date.seconds * 1000).toLocaleDateString() : 'N/A'}
                             </div>
                         </div>
                         <div className="text-right flex items-center gap-4">
                             <div className="font-bold text-emerald-600 text-lg">₹{ret.refundAmount}</div>
                             <button 
                                onClick={() => generateReturnReceipt(ret)}
                                className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600"
                                title="Print Credit Note"
                             >
                                <Printer className="w-4 h-4"/>
                             </button>
                         </div>
                     </div>
                 ))
                }
            </div>
        )}

        {/* PAGINATION CONTROLS */}
        {!searchTerm && !loading && !selectedOrder && (
          <div className="p-4 flex justify-between items-center border-t border-slate-200 bg-white sticky bottom-0">
              <button 
                  onClick={handlePrevPage}
                  disabled={currentPage === 1}
                  className="flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                  <ChevronLeft className="w-4 h-4" /> Previous
              </button>
              
              <span className="text-sm font-medium text-slate-500">Page {currentPage}</span>

              <button 
                  onClick={handleNextPage}
                  disabled={!isNextPageAvailable}
                  className="flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                  Next <ChevronRight className="w-4 h-4" />
              </button>
          </div>
        )}

        {loading && <div className="p-6 flex justify-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>}

        {/* SELECTED ORDER VIEW (PROCESS) */}
        {selectedOrder && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden max-w-4xl mx-auto animate-in fade-in">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                <button onClick={() => setSelectedOrder(null)} className="text-slate-500 hover:text-slate-800 flex items-center gap-1 text-sm"><ArrowLeft className="w-4 h-4" /> Back</button>
                <div className="font-bold text-slate-700">Process Return: #{selectedOrder.id.slice(0,6)}</div>
            </div>
            
            <div className="p-6">
                <div className="space-y-4">
                    {selectedOrder.items.map((item, idx) => { 
                        const config = returnConfig[`${idx}`] || { qty: 0, max: 0 }; 
                        const isFullyReturned = config.max <= 0; 
                        
                        return (
                        <div key={idx} className={`flex items-center gap-4 p-4 rounded-lg border ${config.isRequest ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`}>
                            <div className="flex-1">
                                <div className="font-bold text-lg text-slate-900">{item.name} {config.isRequest && <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded ml-2">Requested</span>}</div>
                                <div className="text-sm text-slate-500">{item.color} / {item.size}</div>
                                <div className="text-xs text-slate-400 mt-1">Bought: {item.qty} • Price: ₹{item.price}</div>
                            </div>
                            
                            {!isFullyReturned && (
                                <div className="flex items-center gap-6">
                                    <div className="flex flex-col items-end">
                                        <label className="text-[10px] uppercase font-bold text-slate-400 mb-1">{activeTab === 'requests' ? 'Approve Qty' : 'Return Qty'}</label>
                                        <input type="number" min="0" max={config.max} className="w-20 border border-slate-300 rounded p-1 text-center font-bold" value={config.qty} onChange={(e) => updateReturnConfig(idx, 'qty', Math.min(Number(e.target.value), config.max))} />
                                    </div>
                                    <div className="flex flex-col items-center">
                                        <label className="text-[10px] uppercase font-bold text-slate-400 mb-1">Restock</label>
                                        <input type="checkbox" className="w-5 h-5 accent-emerald-600" checked={config.returnToStock} onChange={(e) => updateReturnConfig(idx, 'returnToStock', e.target.checked)} />
                                    </div>
                                </div>
                            )}
                            {isFullyReturned && <span className="text-sm font-bold text-slate-400">Already Returned</span>}
                        </div>
                    ); })}
                </div>
                
                <div className="mt-8 pt-6 border-t border-slate-100 flex justify-between items-center">
                    <div>
                        <div className="text-sm text-slate-500">Total Refund to Wallet</div>
                        <div className="text-2xl font-bold text-emerald-600">
                            ₹{calculateRefund().toFixed(2)}
                            {shippingIncluded && (
                                <span className="text-xs text-slate-400 font-normal block">
                                    (Includes Shipping: ₹{Number(selectedOrder.shipping || 0)})
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex gap-3">
                         {activeTab === 'requests' && (
                             <button onClick={handleReject} className="px-6 py-3 border border-red-200 text-red-600 rounded-xl font-bold hover:bg-red-50 flex items-center gap-2"><X className="w-5 h-5"/> Reject Request</button>
                         )}
                         <button 
                            onClick={processReturn} 
                            disabled={calculateRefund() <= 0} 
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-xl font-bold disabled:opacity-50 flex items-center gap-2"
                        >
                            <CheckCircle className="w-5 h-5" /> 
                            {activeTab === 'requests' ? 'Approve & Refund' : 'Process Return'}
                        </button>
                    </div>
                </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}