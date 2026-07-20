import React, { useState, useEffect } from 'react';
import { 
  collection, addDoc, updateDoc, doc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp, getDocs, limit, startAfter, where
} from 'firebase/firestore';
import { 
  Plus, Search, Edit, Trash2, Ticket, Calendar, CheckCircle, XCircle, Percent, X, Loader2, ChevronLeft, ChevronRight, Filter 
} from 'lucide-react';

export default function CouponManager({ db }) {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Pagination State
  const ITEMS_PER_PAGE = 20;
  const [lastDoc, setLastDoc] = useState(null);
  const [pageHistory, setPageHistory] = useState([]); 
  const [currentPage, setCurrentPage] = useState(1);
  const [isNextPageAvailable, setIsNextPageAvailable] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'active', 'inactive'

  // Modal State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState(null);

  const [formData, setFormData] = useState({
    code: '',
    type: 'percentage', // 'percentage' or 'flat'
    value: '',
    minOrderAmount: '',
    expiryDate: '',
    isActive: true
  });

  // 1. Fetch Coupons (Paginated)
  const fetchCoupons = async (cursor = null) => {
    if (!db) return;
    setLoading(true);

    try {
        const isCanvas = typeof __app_id !== 'undefined';
        const collectionPath = isCanvas 
            ? `artifacts/${__app_id}/public/data/coupons` 
            : 'coupons';
        const collectionRef = collection(db, collectionPath);

        // SEARCH MODE: Fetch more items to allow client-side filtering
        if (searchTerm) {
            const q = query(collectionRef, orderBy('code'), limit(50));
            const snapshot = await getDocs(q);
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Client-side filtering for search
            const filtered = list.filter(c => c.code.toLowerCase().includes(searchTerm.toLowerCase()));
            setCoupons(filtered);
            setIsNextPageAvailable(false); 
        } 
        // PAGINATION MODE
        else {
            let qArgs = [collectionRef];

            if (filterStatus !== 'all') {
                qArgs.push(where('isActive', '==', filterStatus === 'active'));
            }

            // Order by creation time
            qArgs.push(orderBy('createdAt', 'desc'));

            if (cursor) {
                qArgs.push(startAfter(cursor));
            }

            qArgs.push(limit(ITEMS_PER_PAGE));

            const q = query(...qArgs);
            const snapshot = await getDocs(q);
            
            const fetchedCoupons = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setCoupons(fetchedCoupons);
            
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
    fetchCoupons(null);
  }, [db, filterStatus, searchTerm]);

  // Handle Next Page
  const handleNextPage = () => {
    if (isNextPageAvailable && lastDoc) {
        setPageHistory(prev => [...prev, lastDoc]);
        setCurrentPage(prev => prev + 1);
        fetchCoupons(lastDoc);
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
        fetchCoupons(prevCursor);
    }
  };

  // --- ACTIONS ---

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      const isCanvas = typeof __app_id !== 'undefined';
      const collectionPath = isCanvas 
          ? `artifacts/${__app_id}/public/data/coupons` 
          : 'coupons';
      
      const payload = {
          ...formData,
          code: formData.code.toUpperCase(),
          value: Number(formData.value),
          minOrderAmount: Number(formData.minOrderAmount),
          lastUpdated: serverTimestamp()
      };

      if (editingCoupon) {
        await updateDoc(doc(db, collectionPath, editingCoupon.id), payload);
      } else {
        payload.createdAt = serverTimestamp();
        await addDoc(collection(db, collectionPath), payload);
      }
      setIsFormOpen(false);
      resetForm();
      fetchCoupons(pageHistory.length > 0 ? pageHistory[pageHistory.length - 1] : null); // Refresh current page
    } catch (error) {
      console.error("Save Error:", error);
      alert("Failed to save coupon.");
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this coupon?")) return;
    try {
        const isCanvas = typeof __app_id !== 'undefined';
        const docPath = isCanvas 
            ? `artifacts/${__app_id}/public/data/coupons/${id}` 
            : `coupons/${id}`;
        await deleteDoc(doc(db, docPath));
        setCoupons(prev => prev.filter(c => c.id !== id));
    } catch (error) {
        console.error("Delete Error:", error);
    }
  };

  const toggleStatus = async (coupon) => {
      try {
        const isCanvas = typeof __app_id !== 'undefined';
        const docPath = isCanvas 
            ? `artifacts/${__app_id}/public/data/coupons/${coupon.id}` 
            : `coupons/${coupon.id}`;
        await updateDoc(doc(db, docPath), { isActive: !coupon.isActive });
        
        // Update local state optimistic
        setCoupons(prev => prev.map(c => c.id === coupon.id ? { ...c, isActive: !c.isActive } : c));
      } catch (e) {
          console.error(e);
      }
  };

  const openEdit = (coupon) => {
    setEditingCoupon(coupon);
    setFormData({
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        minOrderAmount: coupon.minOrderAmount,
        expiryDate: coupon.expiryDate || '',
        isActive: coupon.isActive
    });
    setIsFormOpen(true);
  };

  const resetForm = () => {
    setFormData({ code: '', type: 'percentage', value: '', minOrderAmount: '', expiryDate: '', isActive: true });
    setEditingCoupon(null);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-4">
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-slate-800">Coupons & Discounts</h2>
            <div className="flex gap-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                        type="text" 
                        placeholder="Search coupon code..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm w-64 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>
                <button 
                    onClick={() => { resetForm(); setIsFormOpen(true); }}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
                >
                    <Plus className="w-4 h-4" /> Add Coupon
                </button>
            </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 text-sm">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="text-slate-500 font-medium mr-2">Status:</span>
            <button 
                onClick={() => setFilterStatus('all')}
                className={`px-3 py-1 rounded-full border ${filterStatus === 'all' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
            >
                All
            </button>
            <button 
                onClick={() => setFilterStatus('active')}
                className={`px-3 py-1 rounded-full border ${filterStatus === 'active' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
            >
                Active
            </button>
            <button 
                onClick={() => setFilterStatus('inactive')}
                className={`px-3 py-1 rounded-full border ${filterStatus === 'inactive' ? 'bg-slate-600 text-white border-slate-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
            >
                Inactive
            </button>
        </div>
      </div>

      {/* List */}
      <div className="p-8 overflow-auto flex-1">
         {loading ? <div className="text-center p-10 text-slate-500">Loading...</div> : (
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {coupons.map(coupon => {
                  const isExpired = coupon.expiryDate && new Date(coupon.expiryDate) < new Date();
                  
                  return (
                    <div key={coupon.id} className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all ${!coupon.isActive ? 'opacity-60 border-slate-200' : 'border-blue-100 hover:shadow-md'}`}>
                        <div className="p-5 flex justify-between items-start">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg ${coupon.type === 'percentage' ? 'bg-purple-100 text-purple-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                    {coupon.type === 'percentage' ? '%' : '₹'}
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-800 text-lg tracking-wide">{coupon.code}</h3>
                                    <p className="text-xs text-slate-500">
                                        {coupon.type === 'percentage' ? `${coupon.value}% Off` : `Flat ₹${coupon.value} Off`}
                                    </p>
                                </div>
                            </div>
                            <button onClick={() => toggleStatus(coupon)} title="Toggle Status">
                                {coupon.isActive 
                                    ? <CheckCircle className="w-6 h-6 text-emerald-500 fill-emerald-50" /> 
                                    : <XCircle className="w-6 h-6 text-slate-300" />
                                }
                            </button>
                        </div>
                        
                        <div className="px-5 pb-5 space-y-2">
                             <div className="text-xs text-slate-600 flex items-center justify-between">
                                 <span>Min Order:</span>
                                 <span className="font-medium">₹{coupon.minOrderAmount}</span>
                             </div>
                             <div className="text-xs text-slate-600 flex items-center justify-between">
                                 <span>Expires:</span>
                                 <span className={`font-medium flex items-center gap-1 ${isExpired ? 'text-red-500' : ''}`}>
                                    <Calendar className="w-3 h-3" /> {coupon.expiryDate || 'Never'}
                                 </span>
                             </div>
                             {isExpired && <div className="text-[10px] text-red-500 font-bold bg-red-50 px-2 py-1 rounded text-center">EXPIRED</div>}
                        </div>

                        <div className="bg-slate-50 px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
                            <button onClick={() => openEdit(coupon)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"><Edit className="w-4 h-4"/></button>
                            <button onClick={() => handleDelete(coupon.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4"/></button>
                        </div>
                    </div>
                  );
              })}
              {coupons.length === 0 && <div className="col-span-3 text-center text-slate-400 py-10">No coupons found.</div>}
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

      {/* --- MODAL --- */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
             <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-slate-800">{editingCoupon ? 'Edit Coupon' : 'Create Coupon'}</h2>
                <button onClick={() => setIsFormOpen(false)}><X className="w-5 h-5 text-slate-500" /></button>
             </div>
             <form onSubmit={handleSave} className="space-y-4">
                 <div>
                     <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Coupon Code</label>
                     <div className="relative">
                        <Ticket className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input required className="w-full border border-slate-300 rounded-lg pl-9 p-2 uppercase font-bold" placeholder="SAVE20" value={formData.code} onChange={e => setFormData({...formData, code: e.target.value.toUpperCase()})} />
                     </div>
                 </div>
                 
                 <div className="grid grid-cols-2 gap-4">
                     <div>
                         <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Type</label>
                         <select className="w-full border border-slate-300 rounded-lg p-2" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                             <option value="percentage">Percentage (%)</option>
                             <option value="flat">Flat Amount (₹)</option>
                         </select>
                     </div>
                     <div>
                         <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Value</label>
                         <div className="relative">
                            {formData.type === 'percentage' ? <Percent className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" /> : <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>}
                            <input type="number" required className="w-full border border-slate-300 rounded-lg pl-8 p-2" placeholder="0" value={formData.value} onChange={e => setFormData({...formData, value: e.target.value})} />
                         </div>
                     </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                     <div>
                         <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Min Order (₹)</label>
                         <input type="number" className="w-full border border-slate-300 rounded-lg p-2" placeholder="0" value={formData.minOrderAmount} onChange={e => setFormData({...formData, minOrderAmount: e.target.value})} />
                     </div>
                     <div>
                         <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Expires On</label>
                         <input type="date" className="w-full border border-slate-300 rounded-lg p-2" value={formData.expiryDate} onChange={e => setFormData({...formData, expiryDate: e.target.value})} />
                     </div>
                 </div>

                 <div className="pt-2">
                     <label className="flex items-center gap-2 cursor-pointer">
                         <input type="checkbox" className="w-4 h-4 accent-emerald-600" checked={formData.isActive} onChange={e => setFormData({...formData, isActive: e.target.checked})} />
                         <span className="text-sm font-medium text-slate-700">Active Immediately</span>
                     </label>
                 </div>

                 <button type="submit" className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl mt-4 hover:bg-slate-800 transition-colors">
                     {editingCoupon ? 'Update Coupon' : 'Create Coupon'}
                 </button>
             </form>
          </div>
        </div>
      )}
    </div>
  );
}