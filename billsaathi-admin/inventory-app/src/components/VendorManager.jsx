import React, { useState, useEffect } from 'react';
import { 
  collection, addDoc, updateDoc, doc, deleteDoc, onSnapshot, query, orderBy, where, serverTimestamp, runTransaction, getDocs, limit, startAfter 
} from 'firebase/firestore';
import { 
  Plus, Search, Edit, Trash2, Phone, User, FileText, DollarSign, Package, 
  ExternalLink, X, ArrowRight, Filter, Wallet, ArrowDownLeft, ArrowUpRight,
  ChevronLeft, ChevronRight, Loader2
} from 'lucide-react';

export default function VendorManager({ db }) {
  const [vendors, setVendors] = useState([]);
  const [products, setProducts] = useState([]); // To count linked products
  const [loading, setLoading] = useState(true);
  
  // Pagination State
  const ITEMS_PER_PAGE = 20;
  const [lastDoc, setLastDoc] = useState(null);
  const [pageHistory, setPageHistory] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isNextPageAvailable, setIsNextPageAvailable] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDue, setFilterDue] = useState('all'); // 'all', 'due'
  
  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLedgerOpen, setIsLedgerOpen] = useState(false);
  const [isProductsOpen, setIsProductsOpen] = useState(false);
  
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [vendorTransactions, setVendorTransactions] = useState([]);

  // Form States
  const [formData, setFormData] = useState({
    name: '', phone: '', email: '', gstin: '', address: '', balance: 0
  });

  const [txnData, setTxnData] = useState({
    type: 'purchase', // 'purchase' (Bill) or 'payment' (Paid)
    amount: '',
    description: ''
  });

  // Page Title
  useEffect(() => {
    document.title = "Manage Vendors | Drushya Store";
  }, []);

  // 1. Fetch Vendors (Paginated)
  const fetchVendors = async (cursor = null) => {
    if (!db) return;
    setLoading(true);

    try {
        const isCanvas = typeof __app_id !== 'undefined';
        const getPath = (col) => isCanvas ? `artifacts/${__app_id}/public/data/${col}` : col;
        const collectionRef = collection(db, getPath('vendors'));

        // SEARCH MODE
        if (searchTerm) {
            const q = query(collectionRef, orderBy('name'), limit(50));
            const snapshot = await getDocs(q);
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            const term = searchTerm.toLowerCase();
            const filtered = list.filter(v => 
                v.name.toLowerCase().includes(term) || 
                (v.phone && v.phone.includes(term))
            );
            
            setVendors(filtered);
            setIsNextPageAvailable(false);
        } 
        // PAGINATION MODE
        else {
            let qArgs = [collectionRef];

            if (filterDue === 'due') {
                qArgs.push(where('balance', '>', 0));
            }

            qArgs.push(orderBy('name'));

            if (cursor) {
                qArgs.push(startAfter(cursor));
            }

            qArgs.push(limit(ITEMS_PER_PAGE));

            const q = query(...qArgs);
            const snapshot = await getDocs(q);
            
            const fetchedVendors = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setVendors(fetchedVendors);
            
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

  // Initial Load & Filter Change
  useEffect(() => {
    setLastDoc(null);
    setPageHistory([]);
    setCurrentPage(1);
    fetchVendors(null);
  }, [db, filterDue, searchTerm]);

  // Fetch Products (Keep real-time for counts)
  useEffect(() => {
    if (!db) return;
    const isCanvas = typeof __app_id !== 'undefined';
    const getPath = (col) => isCanvas ? `artifacts/${__app_id}/public/data/${col}` : col;
    
    const unsubProducts = onSnapshot(collection(db, getPath('products')), (snap) => {
       setProducts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => unsubProducts();
  }, [db]);

  // Fetch Transactions when Ledger Opens
  useEffect(() => {
    if (!db || !selectedVendor || !isLedgerOpen) return;
    const isCanvas = typeof __app_id !== 'undefined';
    const basePath = isCanvas ? `artifacts/${__app_id}/public/data/vendors` : 'vendors';
    
    const q = query(collection(db, `${basePath}/${selectedVendor.id}/transactions`), orderBy('date', 'desc'));
    
    const unsub = onSnapshot(q, (snap) => {
      setVendorTransactions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, [db, selectedVendor, isLedgerOpen]);

  // Pagination Handlers
  const handleNextPage = () => {
    if (isNextPageAvailable && lastDoc) {
        setPageHistory(prev => [...prev, lastDoc]);
        setCurrentPage(prev => prev + 1);
        fetchVendors(lastDoc);
    }
  };

  const handlePrevPage = () => {
    if (pageHistory.length > 0) {
        const newHistory = [...pageHistory];
        newHistory.pop();
        const prevCursor = newHistory.length > 0 ? newHistory[newHistory.length - 1] : null;
        
        setPageHistory(newHistory);
        setCurrentPage(prev => prev - 1);
        fetchVendors(prevCursor);
    }
  };

  // --- ACTIONS ---

  const handleSaveVendor = async (e) => {
    e.preventDefault();
    try {
      const isCanvas = typeof __app_id !== 'undefined';
      const colPath = isCanvas ? `artifacts/${__app_id}/public/data/vendors` : 'vendors';
      
      const payload = {
          ...formData,
          balance: Number(formData.balance),
          lastUpdated: serverTimestamp()
      };

      if (selectedVendor) {
        await updateDoc(doc(db, colPath, selectedVendor.id), payload);
      } else {
        payload.createdAt = serverTimestamp();
        await addDoc(collection(db, colPath), payload);
      }
      setIsFormOpen(false);
      resetForm();
      fetchVendors(pageHistory.length > 0 ? pageHistory[pageHistory.length - 1] : null); // Refresh list
    } catch (error) {
      console.error("Save Error:", error);
      alert("Failed to save vendor.");
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this vendor? This cannot be undone.")) return;
    try {
      const isCanvas = typeof __app_id !== 'undefined';
      const path = isCanvas ? `artifacts/${__app_id}/public/data/vendors/${id}` : `vendors/${id}`;
      await deleteDoc(doc(db, path));
      // Refresh or filter locally
      setVendors(prev => prev.filter(v => v.id !== id));
    } catch (error) {
      console.error("Delete Error:", error);
    }
  };

  const handleTransaction = async (e) => {
      e.preventDefault();
      if (!txnData.amount) return;
      
      try {
        await runTransaction(db, async (transaction) => {
            const isCanvas = typeof __app_id !== 'undefined';
            const basePath = isCanvas ? `artifacts/${__app_id}/public/data` : '';
            const vendorRef = doc(db, `${basePath}/vendors/${selectedVendor.id}`);
            const vendorDoc = await transaction.get(vendorRef);
            
            if (!vendorDoc.exists()) throw "Vendor not found";

            const currentBalance = Number(vendorDoc.data().balance || 0);
            const amount = Number(txnData.amount);
            
            // Logic: 
            // Purchase (Bill) -> We owe them -> Balance Increases
            // Payment (Cash/Bank) -> We paid them -> Balance Decreases
            const newBalance = txnData.type === 'purchase' 
                ? currentBalance + amount 
                : currentBalance - amount;

            // Add to subcollection
            const txnRef = doc(collection(db, `${basePath}/vendors/${selectedVendor.id}/transactions`));
            transaction.set(txnRef, {
                ...txnData,
                amount: amount,
                date: serverTimestamp()
            });

            // Update vendor Balance
            transaction.update(vendorRef, { balance: newBalance });
        });
        
        setTxnData({ type: 'purchase', amount: '', description: '' });
        // Refresh vendors to show new balance
        fetchVendors(pageHistory.length > 0 ? pageHistory[pageHistory.length - 1] : null);
      } catch (error) {
          console.error("Txn Error:", error);
          alert("Transaction failed.");
      }
  };

  const resetForm = () => {
    setFormData({ name: '', phone: '', email: '', gstin: '', address: '', balance: 0 });
    setSelectedVendor(null);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-4">
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-slate-800">Vendor Management</h2>
            <div className="flex gap-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                        type="text" 
                        placeholder="Search vendors..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm w-64 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>
                <button 
                    onClick={() => { resetForm(); setIsFormOpen(true); }}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
                >
                    <Plus className="w-4 h-4" /> Add Vendor
                </button>
            </div>
        </div>

        {/* Filter Bar */}
        <div className="flex items-center gap-3 text-sm">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="text-slate-500 font-medium">Filter:</span>
            <button 
                onClick={() => setFilterDue('all')}
                className={`px-3 py-1 rounded-full border ${filterDue === 'all' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}
            >
                All
            </button>
            <button 
                onClick={() => setFilterDue('due')}
                className={`px-3 py-1 rounded-full border ${filterDue === 'due' ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-slate-600 border-slate-200'}`}
            >
                Pending Dues
            </button>
        </div>
      </div>

      {/* Vendor Grid */}
      <div className="p-8 overflow-auto flex-1">
         {loading ? (
            <div className="flex justify-center p-10"><Loader2 className="w-8 h-8 animate-spin text-slate-400"/></div>
         ) : vendors.length === 0 ? (
            <div className="text-center p-10 text-slate-500">No vendors found.</div>
         ) : (
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {vendors.map(vendor => {
                  const linkedProducts = products.filter(p => p.vendorId === vendor.id);
                  const hasDue = vendor.balance > 0;

                  return (
                    <div key={vendor.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-start">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold text-lg">
                                    {vendor.name.charAt(0)}
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-800">{vendor.name}</h3>
                                    <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                                        <Phone className="w-3 h-3" /> {vendor.phone || 'N/A'}
                                    </div>
                                </div>
                            </div>
                            <div className={`text-right ${hasDue ? 'text-rose-600' : 'text-emerald-600'}`}>
                                <div className="text-xs font-medium uppercase">{hasDue ? 'Payable' : 'Balance'}</div>
                                <div className="text-lg font-bold">₹{vendor.balance?.toLocaleString()}</div>
                            </div>
                        </div>

                        <div className="p-5 bg-slate-50/50 space-y-3">
                             <div className="flex justify-between items-center text-sm">
                                 <span className="text-slate-500 flex items-center gap-2"><Package className="w-4 h-4"/> Inventory Items</span>
                                 <button 
                                    onClick={() => { setSelectedVendor(vendor); setIsProductsOpen(true); }}
                                    className="text-blue-600 font-medium hover:underline flex items-center gap-1"
                                 >
                                    {linkedProducts.length} items <ExternalLink className="w-3 h-3" />
                                 </button>
                             </div>
                             
                             <div className="grid grid-cols-2 gap-3 mt-4">
                                <button 
                                    onClick={() => { setSelectedVendor(vendor); setIsLedgerOpen(true); }}
                                    className="flex items-center justify-center gap-2 bg-white border border-slate-300 text-slate-700 py-2 rounded-lg text-sm font-medium hover:bg-slate-50"
                                >
                                    <DollarSign className="w-4 h-4" /> Ledger
                                </button>
                                <button 
                                    onClick={() => { openEdit(vendor) }}
                                    className="flex items-center justify-center gap-2 bg-white border border-slate-300 text-slate-700 py-2 rounded-lg text-sm font-medium hover:bg-slate-50"
                                >
                                    <Edit className="w-4 h-4" /> Edit
                                </button>
                             </div>
                        </div>
                    </div>
                  );
              })}
           </div>
         )}
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

      {/* --- ADD/EDIT MODAL --- */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl">
             <h2 className="text-xl font-bold text-slate-800 mb-6">{selectedVendor ? 'Edit Vendor' : 'Add Vendor'}</h2>
             <form onSubmit={handleSaveVendor} className="space-y-4">
                 <div className="grid grid-cols-2 gap-4">
                     <div><label className="text-xs font-bold text-slate-500 uppercase">Name</label><input required className="w-full border p-2 rounded-lg mt-1" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
                     <div><label className="text-xs font-bold text-slate-500 uppercase">Phone</label><input className="w-full border p-2 rounded-lg mt-1" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} /></div>
                 </div>
                 <div><label className="text-xs font-bold text-slate-500 uppercase">Email</label><input type="email" className="w-full border p-2 rounded-lg mt-1" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} /></div>
                 <div><label className="text-xs font-bold text-slate-500 uppercase">GSTIN</label><input className="w-full border p-2 rounded-lg mt-1" value={formData.gstin} onChange={e => setFormData({...formData, gstin: e.target.value})} /></div>
                 <div><label className="text-xs font-bold text-slate-500 uppercase">Address</label><textarea className="w-full border p-2 rounded-lg mt-1" rows="2" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} /></div>
                 {!selectedVendor && (
                     <div><label className="text-xs font-bold text-slate-500 uppercase">Opening Balance (Due)</label><input type="number" className="w-full border p-2 rounded-lg mt-1" value={formData.balance} onChange={e => setFormData({...formData, balance: e.target.value})} /></div>
                 )}
                 <div className="flex gap-3 pt-4">
                     <button type="button" onClick={() => setIsFormOpen(false)} className="flex-1 py-2 border rounded-lg font-bold text-slate-600">Cancel</button>
                     <button type="submit" className="flex-1 py-2 bg-slate-900 text-white rounded-lg font-bold">Save</button>
                 </div>
             </form>
          </div>
        </div>
      )}

      {/* --- LEDGER MODAL --- */}
      {isLedgerOpen && selectedVendor && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-2xl h-[80vh] shadow-xl flex flex-col">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">{selectedVendor.name} Ledger</h2>
                        <p className="text-sm text-slate-500">Current Balance: <span className="font-bold text-slate-900">₹{selectedVendor.balance?.toLocaleString()}</span></p>
                    </div>
                    <button onClick={() => setIsLedgerOpen(false)}><X className="w-6 h-6 text-slate-400" /></button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
                    <div className="space-y-3">
                        {vendorTransactions.map(txn => (
                            <div key={txn.id} className="bg-white p-4 rounded-xl border border-slate-200 flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-full ${txn.type === 'purchase' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                        {txn.type === 'purchase' ? <ArrowDownLeft className="w-4 h-4"/> : <ArrowUpRight className="w-4 h-4"/>}
                                    </div>
                                    <div>
                                        <p className="font-bold text-slate-800 text-sm capitalize">{txn.type === 'purchase' ? 'Bill / Purchase' : 'Payment Sent'}</p>
                                        <p className="text-xs text-slate-400">{txn.date?.seconds ? new Date(txn.date.seconds*1000).toLocaleDateString() : 'Just now'} • {txn.description || 'No desc'}</p>
                                    </div>
                                </div>
                                <div className={`font-bold ${txn.type === 'purchase' ? 'text-slate-800' : 'text-emerald-600'}`}>
                                    {txn.type === 'purchase' ? '+' : '-'} ₹{txn.amount}
                                </div>
                            </div>
                        ))}
                        {vendorTransactions.length === 0 && <div className="text-center text-slate-400 py-10">No transactions recorded.</div>}
                    </div>
                </div>

                <div className="p-4 bg-white border-t border-slate-200">
                    <form onSubmit={handleTransaction} className="flex gap-2">
                        <select 
                            className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-slate-50"
                            value={txnData.type}
                            onChange={e => setTxnData({...txnData, type: e.target.value})}
                        >
                            <option value="purchase">Add Bill (+)</option>
                            <option value="payment">Record Payment (-)</option>
                        </select>
                        <input 
                            required
                            type="number" 
                            className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-32"
                            placeholder="Amount"
                            value={txnData.amount}
                            onChange={e => setTxnData({...txnData, amount: e.target.value})}
                        />
                        <input 
                            className="border border-slate-300 rounded-lg px-3 py-2 text-sm flex-1"
                            placeholder="Description (e.g. Inv #123)"
                            value={txnData.description}
                            onChange={e => setTxnData({...txnData, description: e.target.value})}
                        />
                        <button className="bg-slate-900 text-white px-4 py-2 rounded-lg font-bold text-sm">Add</button>
                    </form>
                </div>
            </div>
          </div>
      )}

      {/* --- LINKED PRODUCTS MODAL --- */}
      {isProductsOpen && selectedVendor && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-xl">
                  <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                      <h3 className="font-bold text-slate-800">Products by {selectedVendor.name}</h3>
                      <button onClick={() => setIsProductsOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2">
                      <div className="space-y-1">
                          {products.filter(p => p.vendorId === selectedVendor.id).map(prod => (
                              <div key={prod.id} className="p-3 hover:bg-slate-50 rounded-lg flex gap-3 items-center border-b border-slate-50 last:border-0">
                                   <div className="w-10 h-10 bg-slate-200 rounded overflow-hidden flex-shrink-0">
                                      {prod.images?.[0] && <img src={prod.images[0]} className="w-full h-full object-cover" />}
                                   </div>
                                   <div>
                                       <p className="font-medium text-slate-800 text-sm">{prod.name}</p>
                                       <p className="text-xs text-slate-500">{prod.category} • {prod.variants?.length} variants</p>
                                   </div>
                              </div>
                          ))}
                          {products.filter(p => p.vendorId === selectedVendor.id).length === 0 && (
                              <div className="p-8 text-center text-slate-400">No products linked to this vendor.</div>
                          )}
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* Functions for Edit */}
      {/* Defined inside render for closure access, or move logic out if cleaner */}
    </div>
  );

  function openEdit(vendor) {
    setSelectedVendor(vendor);
    setFormData({
        name: vendor.name || '',
        phone: vendor.phone || '',
        email: vendor.email || '',
        gstin: vendor.gstin || '',
        address: vendor.address || '',
        balance: vendor.balance || 0
    });
    setIsFormOpen(true);
  }
}