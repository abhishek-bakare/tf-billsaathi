import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, query, orderBy, getDocs, doc, updateDoc, serverTimestamp, limit, startAfter 
} from 'firebase/firestore';
import { 
  Search, Printer, RefreshCw, Save, Barcode as BarcodeIcon, Check, Trash2, ChevronLeft, ChevronRight, Loader2, Globe, Store 
} from 'lucide-react';

export default function BarcodeManager({ db }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all', 'missing'

  // Pagination State
  const ITEMS_PER_PAGE = 20;
  const [lastDoc, setLastDoc] = useState(null);
  const [pageHistory, setPageHistory] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isNextPageAvailable, setIsNextPageAvailable] = useState(true);

  // 1. Fetch Products (Paginated)
  const fetchProducts = async (cursor = null) => {
    if (!db) return;
    setLoading(true);

    try {
        const collectionPath = (typeof __app_id !== 'undefined') 
            ? collection(db, 'artifacts', __app_id, 'public', 'data', 'products') 
            : collection(db, 'products');

        let q;

        // SEARCH MODE: Fetch larger batch for client-side filtering
        if (searchTerm) {
            q = query(collectionPath, orderBy('createdAt', 'desc'), limit(50));
            const snapshot = await getDocs(q);
            processSnapshot(snapshot);
            setIsNextPageAvailable(false);
        }
        // PAGINATION MODE
        else {
            const qArgs = [collectionPath, orderBy('createdAt', 'desc')];
            
            if (cursor) {
                qArgs.push(startAfter(cursor));
            }
            qArgs.push(limit(ITEMS_PER_PAGE));
            
            q = query(...qArgs);
            const snapshot = await getDocs(q);
            
            processSnapshot(snapshot);
            
            // Update Cursor
            const lastVisible = snapshot.docs[snapshot.docs.length - 1];
            setLastDoc(lastVisible);
            
            // Check if full page retrieved
            setIsNextPageAvailable(snapshot.docs.length === ITEMS_PER_PAGE);
        }
    } catch (error) {
        console.error("Fetch Error:", error);
    }
    setLoading(false);
  };

  const processSnapshot = (snapshot) => {
      const flatList = [];
      snapshot.docs.forEach(doc => {
        const p = doc.data();
        if (p.variants) {
          p.variants.forEach((v, idx) => {
            flatList.push({
              id: doc.id, 
              variantIndex: idx, 
              name: p.name,
              category: p.category,
              sku: v.sku,
              color: v.color,
              size: v.size,
              price: v.offlinePrice || 0,
              onlinePrice: v.onlinePrice || 0, 
              barcode: v.barcode || '', 
              onlineBarcode: v.onlineBarcode || '', 
              variants: p.variants, // Need full array to update
              unsaved: false
            });
          });
        }
      });
      setProducts(flatList);
  };

  // Initial Load & Search
  useEffect(() => {
    setLastDoc(null);
    setPageHistory([]);
    setCurrentPage(1);
    fetchProducts(null);
  }, [db, searchTerm]);

  // Pagination Handlers
  const handleNextPage = () => {
    if (isNextPageAvailable && lastDoc) {
        setPageHistory(prev => [...prev, lastDoc]);
        setCurrentPage(prev => prev + 1);
        fetchProducts(lastDoc);
    }
  };

  const handlePrevPage = () => {
    if (pageHistory.length > 0) {
        const newHistory = [...pageHistory];
        newHistory.pop();
        const prevCursor = newHistory.length > 0 ? newHistory[newHistory.length - 1] : null;
        
        setPageHistory(newHistory);
        setCurrentPage(prev => prev - 1);
        fetchProducts(prevCursor);
    }
  };

  // Generate a random 12-digit EAN-13 style string
  const generateEAN = () => {
    return Math.floor(100000000000 + Math.random() * 900000000000).toString();
  };

  const handleGenerate = (index, field) => {
    const newBarcode = generateEAN();
    handleUpdate(index, field, newBarcode);
  };

  const handleUpdate = (index, field, value) => {
    const newProducts = [...products];
    newProducts[index][field] = value;
    newProducts[index].unsaved = true; // Mark as dirty
    setProducts(newProducts);
  };

  const handleSave = async (index) => {
    const item = products[index];
    try {
        const docPath = (typeof __app_id !== 'undefined') 
            ? `artifacts/${__app_id}/public/data/products/${item.id}` 
            : `products/${item.id}`;
            
        const prodRef = doc(db, docPath);
        
        const updatedVariants = [...item.variants];
        // Update both fields in the variant array
        updatedVariants[item.variantIndex].barcode = item.barcode;
        updatedVariants[item.variantIndex].onlineBarcode = item.onlineBarcode;
        
        await updateDoc(prodRef, {
            variants: updatedVariants,
            lastUpdated: serverTimestamp()
        });

        // Clear unsaved flag locally
        const newProducts = [...products];
        newProducts[index].unsaved = false;
        setProducts(newProducts);
    } catch (error) {
        console.error("Save Error:", error);
        alert("Failed to save barcode.");
    }
  };

  const printLabel = (item, type) => {
    const barcodeValue = type === 'online' ? item.onlineBarcode : item.barcode;
    const priceValue = type === 'online' ? item.onlinePrice : item.price;
    const labelTitle = type === 'online' ? 'Online' : 'In-Store';

    if (!barcodeValue) return alert(`No ${labelTitle} barcode generated for this item.`);

    const printWindow = window.open('', '', 'width=400,height=400');
    printWindow.document.write(`
      <html>
        <head>
          <title>Print Label</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Libre+Barcode+39&display=swap');
            body { font-family: sans-serif; text-align: center; margin: 0; padding: 20px; }
            .label { border: 1px dashed #ccc; padding: 10px; display: inline-block; margin: 5px; width: 220px; text-align: center; }
            .brand { font-size: 14px; font-weight: bold; margin-bottom: 5px; text-transform: uppercase; }
            .name { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .meta { font-size: 10px; color: #555; }
            .price { font-size: 16px; font-weight: bold; margin: 5px 0; }
            .barcode { font-family: 'Libre Barcode 39', cursive; font-size: 45px; margin: 0; line-height: 1; }
            .number { font-size: 10px; font-family: monospace; letter-spacing: 2px; }
          </style>
        </head>
        <body>
          <div class="label">
            <div class="brand">Drushya Store</div>
            <div class="name">${item.name}</div>
            <div class="meta">${item.color} / ${item.size} (${labelTitle})</div>
            <div class="barcode">*${barcodeValue}*</div>
            <div class="number">${barcodeValue}</div>
            <div class="price">Rs. ${priceValue}</div>
          </div>
          <script>
            // Wait for fonts to load before printing
            document.fonts.ready.then(() => {
                setTimeout(() => {
                    window.print();
                    window.close();
                }, 500);
            });
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Client-side filter for the fetched batch
  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === 'all' || (filterType === 'missing' && (!p.barcode || !p.onlineBarcode));
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-800">Barcode Manager</h2>
        
        <div className="flex gap-4">
          <select 
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="all">All Items</option>
            <option value="missing">Missing Barcodes</option>
          </select>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search product..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm w-64 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>
      </div>

      {/* List */}
      <div className="p-8 overflow-auto flex-1">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold text-slate-600 text-sm">Product Info</th>
                <th className="px-6 py-4 font-semibold text-slate-600 text-sm">SKU</th>
                <th className="px-6 py-4 font-semibold text-slate-600 text-sm">Offline Barcode</th>
                <th className="px-6 py-4 font-semibold text-slate-600 text-sm">Online Barcode</th>
                <th className="px-6 py-4 font-semibold text-slate-600 text-sm text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={5} className="p-6 text-center text-slate-500">Loading...</td></tr>
              ) : filteredProducts.map((item, idx) => {
                 const originalIndex = products.indexOf(item);
                 
                 return (
                <tr key={`${item.id}-${item.variantIndex}`} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900">{item.name}</div>
                    <div className="text-xs text-slate-500">{item.color} / {item.size}</div>
                  </td>
                  <td className="px-6 py-4 text-xs font-mono text-slate-500">{item.sku}</td>
                  
                  {/* Offline Barcode */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                        <div className="flex flex-col">
                            <input 
                                className="border border-slate-300 rounded px-2 py-1 text-sm w-32 font-mono"
                                value={item.barcode}
                                onChange={(e) => handleUpdate(originalIndex, 'barcode', e.target.value)}
                                placeholder="Offline..."
                            />
                            {item.barcode && <span className="text-[10px] text-slate-400 mt-1">₹{item.price}</span>}
                        </div>
                        <div className="flex flex-col gap-1">
                            <div className="flex gap-1">
                                <button 
                                    onClick={() => handleGenerate(originalIndex, 'barcode')}
                                    className="p-1.5 bg-slate-100 rounded hover:bg-slate-200 text-slate-600"
                                    title="Generate Offline"
                                >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                </button>
                                {item.barcode && (
                                    <button 
                                        onClick={() => handleUpdate(originalIndex, 'barcode', '')}
                                        className="p-1.5 bg-red-100 rounded hover:bg-red-200 text-red-600"
                                        title="Delete Offline Barcode"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                            {item.barcode && (
                                <button 
                                    onClick={() => printLabel(item, 'offline')}
                                    className="p-1.5 bg-slate-800 rounded hover:bg-slate-900 text-white w-full flex justify-center"
                                    title="Print Offline Label"
                                >
                                    <Printer className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    </div>
                  </td>

                  {/* Online Barcode */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                        <div className="flex flex-col">
                            <input 
                                className="border border-slate-300 rounded px-2 py-1 text-sm w-32 font-mono"
                                value={item.onlineBarcode}
                                onChange={(e) => handleUpdate(originalIndex, 'onlineBarcode', e.target.value)}
                                placeholder="Online..."
                            />
                            {item.onlineBarcode && <span className="text-[10px] text-blue-400 mt-1">₹{item.onlinePrice}</span>}
                        </div>
                        <div className="flex flex-col gap-1">
                            <div className="flex gap-1">
                                <button 
                                    onClick={() => handleGenerate(originalIndex, 'onlineBarcode')}
                                    className="p-1.5 bg-slate-100 rounded hover:bg-slate-200 text-slate-600"
                                    title="Generate Online"
                                >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                </button>
                                {item.onlineBarcode && (
                                    <button 
                                        onClick={() => handleUpdate(originalIndex, 'onlineBarcode', '')}
                                        className="p-1.5 bg-red-100 rounded hover:bg-red-200 text-red-600"
                                        title="Delete Online Barcode"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                            {item.onlineBarcode && (
                                <button 
                                    onClick={() => printLabel(item, 'online')}
                                    className="p-1.5 bg-blue-600 rounded hover:bg-blue-700 text-white w-full flex justify-center"
                                    title="Print Online Label"
                                >
                                    <Printer className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    </div>
                  </td>

                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                        {item.unsaved ? (
                            <button 
                                onClick={() => handleSave(originalIndex)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm animate-pulse"
                            >
                                <Save className="w-3.5 h-3.5" /> Save
                            </button>
                        ) : (
                            <span className="text-xs text-slate-400 italic">Saved</span>
                        )}
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
          
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

          {loading && <div className="p-6 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>}
          
          {filteredProducts.length === 0 && !loading && (
             <div className="p-10 text-center text-slate-500">No products found.</div>
          )}
        </div>
      </div>
    </div>
  );
}