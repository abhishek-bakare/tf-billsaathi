import React, { useState, useEffect } from 'react';
import { 
  collection, getDocs, query, orderBy, deleteDoc, doc, limit, startAfter, where 
} from 'firebase/firestore';
import { 
  Search, Plus, FileSpreadsheet, Edit, Trash2, Package, Filter, Calendar, Loader2, ChevronRight, ChevronLeft
} from 'lucide-react';

// --- LOCAL SETUP: UNCOMMENT THESE IMPORTS ---
import ProductForm from './ProductForm';
import BulkImport from './BulkImport';


export default function InventoryManager({ db, user }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Pagination State
  const ITEMS_PER_PAGE = 20;
  const [lastDoc, setLastDoc] = useState(null); // Cursor for current page end
  const [pageHistory, setPageHistory] = useState([]); // Stack of start cursors for prev pages
  const [currentPage, setCurrentPage] = useState(1);
  const [isNextPageAvailable, setIsNextPageAvailable] = useState(true);

  // Filter States
  const [categories, setCategories] = useState([]);
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStock, setFilterStock] = useState('all');
  const [filterDate, setFilterDate] = useState('');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  // 1. Fetch Categories
  useEffect(() => {
    if (!db) return;
    const isCanvas = typeof __app_id !== 'undefined';
    const catPath = isCanvas ? `artifacts/${__app_id}/public/data/categories` : 'categories';
    const fetchCats = async () => {
        const snap = await getDocs(query(collection(db, catPath), orderBy('name')));
        setCategories(snap.docs.map(doc => doc.data().name));
    };
    fetchCats();
  }, [db]);

  // 2. Fetch Products (Paginated)
  // cursor: The document snapshot to start AFTER (null for first page)
  const fetchProducts = async (cursor = null) => {
    if (!db) return;
    setLoading(true);

    try {
        const isCanvas = typeof __app_id !== 'undefined';
        const prodPath = isCanvas ? `artifacts/${__app_id}/public/data/products` : 'products';
        const collectionRef = collection(db, prodPath);

        // SEARCH MODE: Fetch more items to allow client-side search filtering
        if (searchTerm) {
            const q = query(collectionRef, orderBy('createdAt', 'desc'), limit(100));
            const snapshot = await getDocs(q);
            setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setIsNextPageAvailable(false); // Disable pagination in search mode
        } 
        // PAGINATION MODE
        else {
            let qArgs = [collectionRef];

            if (filterCategory !== 'all') {
                qArgs.push(where('category', '==', filterCategory));
            }
            
            qArgs.push(orderBy('createdAt', 'desc'));
            
            if (cursor) {
                qArgs.push(startAfter(cursor));
            }
            
            // Fetch one extra to know if next page exists
            qArgs.push(limit(ITEMS_PER_PAGE)); 

            const q = query(...qArgs);
            const snapshot = await getDocs(q);
            
            const fetchedItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            setItems(fetchedItems);
            
            // Set cursor for the end of this page (to be used if user clicks Next)
            const lastVisible = snapshot.docs[snapshot.docs.length - 1];
            setLastDoc(lastVisible);
            
            // Simple check: if we got less than requested, no more pages
            setIsNextPageAvailable(snapshot.docs.length === ITEMS_PER_PAGE);
        }

    } catch (error) {
        console.error("Fetch Error:", error);
    }
    setLoading(false);
  };

  // Initial Load & Reset on Filter/Search Change
  useEffect(() => {
    // Reset pagination
    setLastDoc(null);
    setPageHistory([]);
    setCurrentPage(1);
    fetchProducts(null);
  }, [db, filterCategory, searchTerm]);

  // Handle Next Page
  const handleNextPage = () => {
    if (isNextPageAvailable && lastDoc) {
        setPageHistory(prev => [...prev, lastDoc]); // Push current cursor to history
        setCurrentPage(prev => prev + 1);
        fetchProducts(lastDoc);
    }
  };

  // Handle Prev Page
  const handlePrevPage = () => {
    if (pageHistory.length > 0) {
        const newHistory = [...pageHistory];
        newHistory.pop(); // Remove current page's start cursor (which was prev page's end)
        const prevCursor = newHistory.length > 0 ? newHistory[newHistory.length - 1] : null; // Get new top or null for page 1
        
        setPageHistory(newHistory);
        setCurrentPage(prev => prev - 1);
        fetchProducts(prevCursor);
    }
  };

  // DELETE FUNCTION
  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to delete this product? This cannot be undone.")) return;
    try {
      const isCanvas = typeof __app_id !== 'undefined';
      const docPath = isCanvas ? `artifacts/${__app_id}/public/data/products/${id}` : `products/${id}`;
      await deleteDoc(doc(db, docPath));
      setItems(prev => prev.filter(i => i.id !== id)); // Remove locally
    } catch (error) {
      console.error("Error deleting:", error);
      alert("Failed to delete.");
    }
  };

  // CLIENT-SIDE FILTERING (For Search & Stock within fetched items)
  const filteredItems = items.filter(item => {
    const matchesSearch = 
      item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.variants?.some(v => v.sku?.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCategory = filterCategory === 'all' || item.category === filterCategory;

    let matchesStock = true;
    const totalStock = item.variants?.reduce((acc, v) => acc + (Number(v.stock) || 0), 0) || 0;
    const hasLowStockVariant = item.variants?.some(v => Number(v.stock) < 5); 

    if (filterStock === 'low') matchesStock = hasLowStockVariant;
    else if (filterStock === 'out') matchesStock = totalStock === 0;

    let matchesDate = true;
    if (filterDate && item.createdAt?.seconds) {
        const itemDate = new Date(item.createdAt.seconds * 1000).toISOString().split('T')[0];
        matchesDate = itemDate === filterDate;
    }

    return matchesSearch && matchesCategory && matchesStock && matchesDate;
  });

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-8 py-4 sticky top-0 z-10">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
              <Package className="w-6 h-6 text-blue-600" /> Inventory Manager
          </h2>
          <div className="flex gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search products..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm w-64 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            
            <button 
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              <FileSpreadsheet className="w-4 h-4" /> Import
            </button>

            <button 
              onClick={() => { setEditingProduct(null); setIsAddModalOpen(true); }}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              <Plus className="w-4 h-4" /> Add Product
            </button>
          </div>
        </div>

        {/* --- FILTERS BAR --- */}
        <div className="flex flex-wrap gap-3 items-center bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div className="flex items-center gap-2 text-slate-500 text-sm font-medium border-r border-slate-300 pr-3 mr-1">
                <Filter className="w-4 h-4" /> Filters:
            </div>
            
            <select 
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white outline-none focus:border-blue-500"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="all">All Categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <select 
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white outline-none focus:border-blue-500"
              value={filterStock}
              onChange={(e) => setFilterStock(e.target.value)}
            >
              <option value="all">All Stock Status</option>
              <option value="low">Low Stock (Variant &lt; 5)</option>
              <option value="out">Out of Stock</option>
            </select>

            <div className="relative flex items-center">
                <Calendar className="absolute left-2.5 w-3.5 h-3.5 text-slate-500" />
                <input 
                  type="date" 
                  className="pl-8 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white outline-none focus:border-blue-500"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                />
            </div>
            
            {(filterCategory !== 'all' || filterStock !== 'all' || filterDate) && (
              <button 
                onClick={() => { setFilterCategory('all'); setFilterStock('all'); setFilterDate(''); }}
                className="text-xs text-red-500 hover:underline ml-auto font-medium"
              >
                  Clear Filters
              </button>
            )}
        </div>
      </header>

      <div className="p-8 flex-1 overflow-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 font-semibold text-slate-600 text-sm">Product</th>
                  <th className="px-6 py-4 font-semibold text-slate-600 text-sm">Category</th>
                  <th className="px-6 py-4 font-semibold text-slate-600 text-sm">Variants</th>
                  <th className="px-6 py-4 font-semibold text-slate-600 text-sm">Total Stock</th>
                  <th className="px-6 py-4 font-semibold text-slate-600 text-sm text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {item.images && item.images[0] ? (
                          <img src={item.images[0]} alt="prod" className="w-10 h-10 rounded-lg object-cover border border-slate-200" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400">
                            <Package className="w-5 h-5" />
                          </div>
                        )}
                        <div>
                          <div className="font-medium">{item.name}</div>
                          <div className="text-xs text-slate-400">{item.vendorName}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{item.category} / {item.subcategory}</td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2 flex-wrap">
                        {item.variants?.map((v, i) => (
                          <span key={i} className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded border border-blue-100 flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full border border-slate-200" style={{background: v.color === 'White' ? '#ffffff' : v.color}} />
                            {v.color}/{v.size}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-sm">
                      {item.variants?.reduce((sum, v) => sum + (v.stock || 0), 0)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={() => { setEditingProduct(item); setIsAddModalOpen(true); }}
                          className="text-blue-600 hover:bg-blue-50 p-2 rounded-lg transition-colors"
                          title="Edit Product"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(item.id)}
                          className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors"
                          title="Delete Product"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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
            
            {!loading && filteredItems.length === 0 && (
                 <div className="p-10 text-center text-slate-500">No products found.</div>
            )}
        </div>
      </div>

      {isAddModalOpen && (
        <ProductForm onClose={() => { setIsAddModalOpen(false); setEditingProduct(null); }} db={db} user={user} productToEdit={editingProduct} />
      )}

      {isImportModalOpen && (
        <BulkImport db={db} user={user} onClose={() => setIsImportModalOpen(false)} />
      )}
    </div>
  );
}