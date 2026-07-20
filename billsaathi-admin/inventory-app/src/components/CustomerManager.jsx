import React, { useState, useEffect } from 'react';
import { 
  collection, addDoc, updateDoc, doc, deleteDoc, onSnapshot, query, orderBy, where, serverTimestamp, runTransaction, getDocs, limit, startAfter 
} from 'firebase/firestore';
import { 
  Plus, Search, Edit, Trash2, Phone, User, FileText, DollarSign, Package, 
  ExternalLink, X, ArrowRight, Filter, Wallet, ArrowDownLeft, ArrowUpRight,
  ChevronLeft, ChevronRight, Loader2, Globe, Store, History, MapPin, ShoppingBag, AlertCircle, Calendar
} from 'lucide-react';

export default function CustomerManager({ db }) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Pagination State
  const ITEMS_PER_PAGE = 20;
  const [lastDocs, setLastDocs] = useState({ offline: null, online: null }); // Track cursors for both collections
  const [pageHistory, setPageHistory] = useState([]); // Stack of cursors for Prev button
  const [currentPage, setCurrentPage] = useState(1);
  const [isNextPageAvailable, setIsNextPageAvailable] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSource, setFilterSource] = useState('all'); // 'all', 'online', 'offline'
  
  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  
  // Selection States
  const [selectedCustomer, setSelectedCustomer] = useState(null); 
  const [customerOrders, setCustomerOrders] = useState([]); 

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    mobile: '',
    address: '',
    dob: '',
    profession: '',
    image: '',
    wallet_credit_balance: 0,
    total_due_amount: 0
  });

  // 1. Fetch Customers (Paginated)
  const fetchCustomers = async (cursors = { offline: null, online: null }) => {
    if (!db) return;
    setLoading(true);

    try {
        const isCanvas = typeof __app_id !== 'undefined';
        const getPath = (col) => isCanvas ? `artifacts/${__app_id}/public/data/${col}` : col;
        
        let newCustomers = [];
        let newOfflineCursor = null;
        let newOnlineCursor = null;
        let hasMore = false;

        // Fetch Offline Customers
        if (filterSource === 'all' || filterSource === 'offline') {
            let qArgs = [collection(db, getPath('customers'))];
            
            // Search Mode: Fetch more for client-side filtering
            if (searchTerm) {
                 qArgs.push(orderBy('name'), limit(50));
            } else {
                 qArgs.push(orderBy('createdAt', 'desc')); // Default sort
                 if (cursors.offline) qArgs.push(startAfter(cursors.offline));
                 qArgs.push(limit(ITEMS_PER_PAGE));
            }
            
            const q = query(...qArgs);
            const snap = await getDocs(q);
            
            const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data(), source: 'offline' }));
            newCustomers = [...newCustomers, ...list];
            
            if (snap.docs.length === ITEMS_PER_PAGE && !searchTerm) {
                newOfflineCursor = snap.docs[snap.docs.length - 1];
                hasMore = true;
            }
        }

        // Fetch Online Customers
        if (filterSource === 'all' || filterSource === 'online') {
            let qArgs = [collection(db, getPath('website_users'))];
            
            if (searchTerm) {
                 qArgs.push(orderBy('name'), limit(50));
            } else {
                 qArgs.push(orderBy('createdAt', 'desc'));
                 if (cursors.online) qArgs.push(startAfter(cursors.online));
                 qArgs.push(limit(ITEMS_PER_PAGE));
            }
            
            const q = query(...qArgs);
            const snap = await getDocs(q);
            
            const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data(), source: 'online' }));
            newCustomers = [...newCustomers, ...list];
            
            if (snap.docs.length === ITEMS_PER_PAGE && !searchTerm) {
                newOnlineCursor = snap.docs[snap.docs.length - 1];
                hasMore = true;
            }
        }

        // Filter by Search Term (Client-side refinement)
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            newCustomers = newCustomers.filter(c => 
                (c.name || '').toLowerCase().includes(term) || 
                (c.mobile || '').includes(term) ||
                (c.email || '').toLowerCase().includes(term)
            );
            setIsNextPageAvailable(false); // Disable pagination during search
        } else {
            // Sort combined list by date desc
            newCustomers.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            
            setLastDocs({ offline: newOfflineCursor, online: newOnlineCursor });
            setIsNextPageAvailable(hasMore);
        }

        setCustomers(newCustomers);

    } catch (error) {
        console.error("Fetch Error:", error);
    }
    setLoading(false);
  };

  // Initial Load & Filter Change
  useEffect(() => {
    setLastDocs({ offline: null, online: null });
    setPageHistory([]);
    setCurrentPage(1);
    fetchCustomers({ offline: null, online: null });
  }, [db, filterSource, searchTerm]);

  // Handle Next Page
  const handleNextPage = () => {
    if (isNextPageAvailable) {
        setPageHistory(prev => [...prev, lastDocs]); // Save current cursors
        setCurrentPage(prev => prev + 1);
        fetchCustomers(lastDocs);
    }
  };

  // Handle Prev Page
  const handlePrevPage = () => {
    if (pageHistory.length > 0) {
        const newHistory = [...pageHistory];
        const prevCursors = newHistory.pop(); // Get previous page's start cursors (which were saved as "lastDocs" of page before that)
        
        // If popping results in empty, we are back to start (null)
        // Wait, pageHistory[0] is cursors after Page 1. 
        // Logic: pageHistory stores the cursors used to GET the next page.
        // Actually, easiest way is to pop. If empty, pass nulls.
        
        // Correct logic:
        // Page 1: History [] -> Fetch(null)
        // Click Next -> History [Cursor1] -> Fetch(Cursor1) -> Page 2
        // Click Next -> History [Cursor1, Cursor2] -> Fetch(Cursor2) -> Page 3
        // Click Prev -> Pop Cursor2 -> Fetch(Cursor1) -> Page 2
        
        setPageHistory(newHistory);
        setCurrentPage(prev => prev - 1);
        
        const cursorsToUse = newHistory.length > 0 ? newHistory[newHistory.length - 1] : { offline: null, online: null };
        fetchCustomers(cursorsToUse);
    }
  };

  // Fetch History when "History Modal" opens (Keep real-time for specific customer)
  useEffect(() => {
    if (!isHistoryOpen || !selectedCustomer || !db) return;

    const isCanvas = typeof __app_id !== 'undefined';
    const collectionPath = isCanvas 
        ? collection(db, 'artifacts', __app_id, 'public', 'data', 'orders') 
        : collection(db, 'orders');

    const q = query(collectionPath, where('customerId', '==', selectedCustomer.id));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      orders.sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));
      setCustomerOrders(orders);
    });

    return () => unsubscribe();
  }, [isHistoryOpen, selectedCustomer, db]);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setFormData({ ...formData, image: reader.result });
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const isCanvas = typeof __app_id !== 'undefined';
      const collectionName = selectedCustomer?.source === 'online' ? 'website_users' : 'customers';
      
      const collectionPath = isCanvas 
        ? collection(db, 'artifacts', __app_id, 'public', 'data', collectionName) 
        : collection(db, collectionName);

      const customerData = {
        ...formData,
        wallet_credit_balance: Number(formData.wallet_credit_balance),
        total_due_amount: Number(formData.total_due_amount),
        lastUpdated: serverTimestamp()
      };

      if (selectedCustomer) {
        const docPath = isCanvas 
          ? `artifacts/${__app_id}/public/data/${collectionName}/${selectedCustomer.id}` 
          : `${collectionName}/${selectedCustomer.id}`;
        await updateDoc(doc(db, docPath), customerData);
      } else {
        customerData.createdAt = serverTimestamp();
        // New customers added by admin are always 'offline' customers
        await addDoc(collectionPath, customerData);
      }
      setIsFormOpen(false);
      setSelectedCustomer(null);
      resetForm();
      fetchCustomers(lastDocs); // Refresh current view
    } catch (error) {
      console.error("Error saving customer:", error);
      alert("Error saving customer");
    }
  };

  const handleDelete = async (customer) => {
    if (!confirm("Delete this customer? This cannot be undone.")) return;
    try {
      const isCanvas = typeof __app_id !== 'undefined';
      const collectionName = customer.source === 'online' ? 'website_users' : 'customers';
      const docPath = isCanvas 
          ? `artifacts/${__app_id}/public/data/${collectionName}/${customer.id}` 
          : `${collectionName}/${customer.id}`;
      await deleteDoc(doc(db, docPath));
      setCustomers(prev => prev.filter(c => c.id !== customer.id));
    } catch (error) {
      console.error("Error deleting:", error);
    }
  };

  const openEdit = (customer) => {
    setSelectedCustomer(customer);
    setFormData({
      name: customer.name || '',
      mobile: customer.mobile || '',
      address: customer.address || '',
      dob: customer.dob || '',
      profession: customer.profession || '',
      image: customer.image || '',
      wallet_credit_balance: customer.wallet_credit_balance || 0,
      total_due_amount: customer.total_due_amount || 0
    });
    setIsFormOpen(true);
  };

  const openHistory = (customer) => {
    setSelectedCustomer(customer);
    setCustomerOrders([]); 
    setIsHistoryOpen(true);
  };

  const resetForm = () => {
    setFormData({
      name: '', mobile: '', address: '', dob: '', profession: '', image: '',
      wallet_credit_balance: 0, total_due_amount: 0
    });
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-4">
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-slate-800">Customer Management</h2>
            <div className="flex gap-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                    type="text" 
                    placeholder="Search name, mobile or email..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm w-64 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>
                <button 
                    onClick={() => { resetForm(); setSelectedCustomer(null); setIsFormOpen(true); }}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
                >
                    <Plus className="w-4 h-4" /> Add Customer
                </button>
            </div>
        </div>

        {/* Filter Bar */}
        <div className="flex items-center gap-2 text-sm">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="text-slate-500 font-medium mr-2">Filter:</span>
            <button 
                onClick={() => setFilterSource('all')}
                className={`px-3 py-1 rounded-full border ${filterSource === 'all' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
            >
                All
            </button>
            <button 
                onClick={() => setFilterSource('online')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full border ${filterSource === 'online' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
            >
                <Globe className="w-3 h-3" /> Online
            </button>
            <button 
                onClick={() => setFilterSource('offline')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full border ${filterSource === 'offline' ? 'bg-slate-600 text-white border-slate-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
            >
                <Store className="w-3 h-3" /> Offline
            </button>
        </div>
      </div>

      {/* List */}
      <div className="p-8 overflow-auto flex-1">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading ? (
             <div className="col-span-3 flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div> 
           ) : customers.length === 0 ? (
             <div className="col-span-3 text-center text-slate-500 py-10">No customers found.</div>
           ) : (
           customers.map(customer => (
            <div key={customer.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow relative">
              
              {/* Source Badge */}
              <div className="absolute top-4 right-4">
                  {customer.source === 'online' || customer.source === 'online_email' || customer.source === 'online_phone' ? (
                      <span className="flex items-center gap-1 text-[10px] uppercase font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                          <Globe className="w-3 h-3" /> Online
                      </span>
                  ) : (
                      <span className="flex items-center gap-1 text-[10px] uppercase font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          <Store className="w-3 h-3" /> Offline
                      </span>
                  )}
              </div>

              <div className="p-6">
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div className="w-16 h-16 rounded-full bg-slate-100 flex-shrink-0 border border-slate-200 overflow-hidden relative">
                    {customer.image ? (
                      <img src={customer.image} alt={customer.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <User className="w-8 h-8" />
                      </div>
                    )}
                  </div>
                  
                  {/* Details */}
                  <div className="flex-1 min-w-0 pt-1">
                    <h3 className="font-bold text-slate-900 truncate pr-16">{customer.name}</h3>
                    {customer.email && (
                         <div className="text-xs text-slate-400 truncate mt-0.5">{customer.email}</div>
                    )}
                    <div className="flex items-center gap-1.5 text-sm text-slate-500 mt-1">
                      <Phone className="w-3.5 h-3.5" /> {customer.mobile || customer.phone || 'N/A'}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-4">
                  <div className="text-center p-2 bg-emerald-50 rounded-lg border border-emerald-100">
                    <div className="text-xs text-emerald-600 font-medium uppercase tracking-wider">Credit</div>
                    <div className="text-lg font-bold text-emerald-700">₹{customer.wallet_credit_balance || 0}</div>
                  </div>
                  <div className="text-center p-2 bg-rose-50 rounded-lg border border-rose-100">
                    <div className="text-xs text-rose-600 font-medium uppercase tracking-wider">Due</div>
                    <div className="text-lg font-bold text-rose-700">₹{customer.total_due_amount || 0}</div>
                  </div>
                </div>

                {customer.address && (
                  <div className="mt-4 text-xs text-slate-500 flex items-start gap-1.5 bg-slate-50 p-2 rounded">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {customer.address}
                  </div>
                )}
              </div>
              
              <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex justify-between items-center">
                <button onClick={() => openHistory(customer)} className="text-slate-600 hover:text-blue-600 text-xs font-medium flex items-center gap-1 hover:underline">
                  <History className="w-3.5 h-3.5" /> Purchase History
                </button>
                <div className="flex gap-2">
                  <button onClick={() => openEdit(customer)} className="text-blue-600 hover:bg-blue-50 p-1.5 rounded">
                    <Edit className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(customer)} className="text-slate-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )))}
        </div>
      </div>

      {/* PAGINATION CONTROLS */}
      {!searchTerm && !loading && (
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

      {/* --- ADD/EDIT CUSTOMER MODAL --- */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-slate-800">{selectedCustomer ? 'Edit Customer' : 'Add Customer'}</h2>
              <button onClick={() => setIsFormOpen(false)}><X className="w-5 h-5 text-slate-500" /></button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-20 h-20 rounded-full bg-slate-100 border border-slate-200 overflow-hidden relative group">
                  {formData.image ? (
                    <img src={formData.image} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300"><User className="w-8 h-8" /></div>
                  )}
                  <label className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                    <ArrowRight className="w-6 h-6 text-white rotate-90" />
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  </label>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-slate-700">Full Name</label>
                  <input required className="w-full border border-slate-300 rounded-lg px-3 py-2" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Mobile</label>
                  <input className="w-full border border-slate-300 rounded-lg px-3 py-2" value={formData.mobile} onChange={e => setFormData({...formData, mobile: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Date of Birth</label>
                  <input type="date" className="w-full border border-slate-300 rounded-lg px-3 py-2" value={formData.dob} onChange={e => setFormData({...formData, dob: e.target.value})} />
                </div>
              </div>
              
              <div>
                  <label className="block text-sm font-medium text-slate-700">Profession</label>
                  <input className="w-full border border-slate-300 rounded-lg px-3 py-2" placeholder="e.g. Engineer, Doctor" value={formData.profession} onChange={e => setFormData({...formData, profession: e.target.value})} />
              </div>
              
              <div>
                  <label className="block text-sm font-medium text-slate-700">Address</label>
                  <textarea className="w-full border border-slate-300 rounded-lg px-3 py-2" rows="2" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-bold text-emerald-600 uppercase">Wallet Balance</label>
                  <input type="number" className="w-full border border-emerald-200 bg-emerald-50 rounded-lg px-3 py-2" value={formData.wallet_credit_balance} onChange={e => setFormData({...formData, wallet_credit_balance: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-rose-600 uppercase">Due Amount</label>
                  <input type="number" className="w-full border border-rose-200 bg-rose-50 rounded-lg px-3 py-2" value={formData.total_due_amount} onChange={e => setFormData({...formData, total_due_amount: e.target.value})} />
                </div>
              </div>

              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg mt-4">
                {selectedCustomer ? 'Update Customer' : 'Save Customer'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- PURCHASE HISTORY MODAL --- */}
      {isHistoryOpen && selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl h-[80vh] shadow-xl animate-in zoom-in-95 flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-slate-100">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-slate-100 overflow-hidden border border-slate-200">
                   {selectedCustomer.image ? <img src={selectedCustomer.image} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center"><User className="w-6 h-6 text-slate-400"/></div>}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800">{selectedCustomer.name}</h2>
                  <p className="text-sm text-slate-500">Purchase History</p>
                </div>
              </div>
              <button onClick={() => setIsHistoryOpen(false)}><X className="w-6 h-6 text-slate-500" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
              {customerOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                  <ShoppingBag className="w-16 h-16 mb-4 opacity-20" />
                  <p>No purchase history found for this customer.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {customerOrders.map(order => (
                    <div key={order.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                      <div className="flex justify-between mb-3 border-b border-slate-100 pb-2">
                        <div>
                            <span className="font-bold text-slate-700">Order #{order.id.slice(0,6)}</span>
                            <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                                <Calendar className="w-3 h-3"/> 
                                {order.date?.seconds 
                                  ? new Date(order.date.seconds * 1000).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) 
                                  : 'N/A'}
                            </div>
                        </div>
                        <div className="text-right">
                             <div className="font-bold text-slate-900">₹{order.grandTotal}</div>
                             <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold ${order.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                {order.status || 'Completed'}
                             </span>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        {order.items?.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-sm">
                                <div>
                                    <span className="font-medium text-slate-700">{item.name}</span>
                                    <span className="text-slate-500 text-xs ml-2">{item.color} / {item.size}</span>
                                </div>
                                <div className="text-slate-600">x{item.qty}</div>
                            </div>
                        ))}
                      </div>

                      {order.dueAmount > 0 && (
                          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center gap-2 text-rose-600 text-sm font-bold bg-rose-50 p-2 rounded">
                              <AlertCircle className="w-4 h-4" /> Pending Due: ₹{order.dueAmount}
                          </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-slate-200 bg-white rounded-b-2xl flex justify-between items-center text-sm font-medium text-slate-600">
               <span>Total Orders: {customerOrders.length}</span>
               <span>Wallet Balance: <span className="text-emerald-600">₹{selectedCustomer.wallet_credit_balance}</span></span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}