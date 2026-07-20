import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { Search, Filter, ShoppingBag, Star, ChevronRight, ChevronDown, X } from 'lucide-react';

export default function Shop({ db, addToCart }) {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // URL Params for filtering (e.g. ?cat=Men&subcat=Shirts)
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCategory = searchParams.get('cat') || 'All';
  const selectedSubcategory = searchParams.get('subcat') || '';
  const urlSearchQuery = searchParams.get('q') || '';

  // Local state for sorting & search input
  const [sortBy, setSortBy] = useState('newest'); // newest, price_low, price_high
  const [localSearch, setLocalSearch] = useState(urlSearchQuery); // Local input state

  // UI State for sidebar expansion
  const [expandedCategory, setExpandedCategory] = useState(null);

  // Page Title
  useEffect(() => {
    document.title = "Shop All Products | Drushya Store";
  }, []);

  // Sync local search with URL
  useEffect(() => {
    setLocalSearch(urlSearchQuery);
  }, [urlSearchQuery]);

  // 1. Fetch Data (Products & Categories)
  useEffect(() => {
    if (!db) return;
    setLoading(true);

    // Fetch Products
    const prodRef = (typeof __app_id !== 'undefined') 
        ? collection(db, 'artifacts', __app_id, 'public', 'data', 'products') 
        : collection(db, 'products');

    const unsubProd = onSnapshot(query(prodRef, orderBy('createdAt', 'desc')), (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProducts(list);
      setLoading(false);
    });

    // Fetch Categories for Sidebar
    const catRef = (typeof __app_id !== 'undefined') 
        ? collection(db, 'artifacts', __app_id, 'public', 'data', 'categories') 
        : collection(db, 'categories');
    
    const unsubCat = onSnapshot(query(catRef, orderBy('name')), (snap) => {
      setCategories(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => { unsubProd(); unsubCat(); };
  }, [db]);

  // Sync expanded category with selected category from URL
  useEffect(() => {
    if (selectedCategory !== 'All') {
      setExpandedCategory(selectedCategory);
    }
  }, [selectedCategory]);

  // 2. Filter & Sort Logic
  const filteredProducts = products.filter(product => {
    // Category Filter
    const matchesCategory = selectedCategory === 'All' || product.category === selectedCategory;
    // Subcategory Filter
    const matchesSubcategory = !selectedSubcategory || product.subcategory === selectedSubcategory;
    // Search Filter (Use URL param for actual filtering)
    const matchesSearch = product.name.toLowerCase().includes(urlSearchQuery.toLowerCase());
    
    return matchesCategory && matchesSubcategory && matchesSearch;
  }).sort((a, b) => {
    // Sort Logic - Calculating Effective Price for Sorting
    const getPrice = (p) => {
        const v = p.variants?.[0];
        const base = Number(v?.onlinePrice || 0);
        const gst = Number(v?.gst || 0);
        return base * (1 + gst / 100);
    };

    const priceA = getPrice(a);
    const priceB = getPrice(b);

    if (sortBy === 'price_low') return priceA - priceB;
    if (sortBy === 'price_high') return priceB - priceA;
    return 0; // Default is newest (from Firestore query)
  });

  const handleCategoryClick = (catName) => {
    if (expandedCategory === catName) {
      setExpandedCategory(null);
    } else {
      setExpandedCategory(catName);
    }
    // Update URL, keep search query if present
    setSearchParams(prev => {
        const newParams = new URLSearchParams(prev);
        newParams.set('cat', catName);
        newParams.delete('subcat'); // Clear subcat when switching main cat
        return newParams;
    });
  };

  const handleSubcategoryClick = (e, catName, subName) => {
    e.stopPropagation();
    setSearchParams(prev => {
        const newParams = new URLSearchParams(prev);
        newParams.set('cat', catName);
        newParams.set('subcat', subName);
        return newParams;
    });
  };

  const handleSearchSubmit = (e) => {
      e.preventDefault();
      setSearchParams(prev => {
          const newParams = new URLSearchParams(prev);
          if (localSearch) newParams.set('q', localSearch);
          else newParams.delete('q');
          return newParams;
      });
  };

  const clearFilters = () => {
      setSearchParams({});
      setLocalSearch('');
      setExpandedCategory(null);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      
      {/* --- PAGE HEADER & SEARCH --- */}
      <div className="mb-8 bg-slate-900 text-white rounded-2xl p-8 md:p-12 text-center relative overflow-hidden">
         <div className="absolute inset-0 opacity-10 bg-[url('https://images.unsplash.com/photo-1557683316-973673baf926')] bg-cover bg-center" />
         <div className="relative z-10">
             <h1 className="text-3xl md:text-4xl font-bold mb-4">Shop Our Collection</h1>
             <p className="text-slate-300 mb-8 max-w-xl mx-auto">Browse our latest arrivals and find your perfect style.</p>
             
             <form onSubmit={handleSearchSubmit} className="max-w-lg mx-auto relative">
                <input 
                    type="text" 
                    placeholder="Search for products..." 
                    className="w-full pl-12 pr-4 py-3.5 rounded-full text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-lg"
                    value={localSearch}
                    onChange={(e) => setLocalSearch(e.target.value)}
                />
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                {localSearch && (
                    <button type="button" onClick={() => { setLocalSearch(''); setSearchParams(prev => { const n = new URLSearchParams(prev); n.delete('q'); return n; }) }} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500">
                        <X className="w-4 h-4" />
                    </button>
                )}
             </form>
         </div>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        
        {/* --- SIDEBAR FILTERS --- */}
        <aside className="w-full md:w-64 flex-shrink-0">
          <div className="bg-white p-6 rounded-xl border border-slate-200 sticky top-24">
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Filter className="w-4 h-4" /> Filters
                </h3>
                {(selectedCategory !== 'All' || selectedSubcategory || urlSearchQuery) && (
                    <button onClick={clearFilters} className="text-xs text-red-500 hover:underline">Clear All</button>
                )}
            </div>
            
            {/* Categories & Subcategories */}
            <div className="mb-6">
              <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">Categories</h4>
              <ul className="space-y-1">
                <li>
                  <button 
                    onClick={() => handleCategoryClick('All')}
                    className={`text-sm w-full text-left px-3 py-2 rounded-lg transition-colors flex justify-between items-center ${selectedCategory === 'All' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}
                  >
                    All Products
                  </button>
                </li>
                {categories.map(cat => {
                  const isActiveCat = selectedCategory === cat.name;
                  const isExpanded = expandedCategory === cat.name;

                  return (
                    <li key={cat.id}>
                      <button 
                        onClick={() => handleCategoryClick(cat.name)}
                        className={`text-sm w-full text-left px-3 py-2 rounded-lg transition-colors flex justify-between items-center ${isActiveCat ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}
                      >
                        {cat.name}
                        {cat.subcategories?.length > 0 && (
                          <span className="text-slate-400">
                             {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </span>
                        )}
                      </button>
                      
                      {/* Subcategories */}
                      {isExpanded && cat.subcategories?.length > 0 && (
                        <ul className="pl-4 mt-1 space-y-0.5 border-l-2 border-slate-100 ml-3">
                          {cat.subcategories.map(sub => (
                            <li key={sub}>
                              <button
                                onClick={(e) => handleSubcategoryClick(e, cat.name, sub)}
                                className={`text-xs w-full text-left px-3 py-1.5 rounded-md transition-colors ${selectedSubcategory === sub ? 'text-blue-600 font-bold bg-blue-50/50' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}
                              >
                                {sub}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </aside>

        {/* --- MAIN CONTENT --- */}
        <div className="flex-1">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div>
              <h2 className="font-bold text-slate-800">
                {selectedCategory === 'All' ? 'All Products' : selectedCategory}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {selectedSubcategory && <span className="font-medium text-slate-700">{selectedSubcategory} &bull; </span>}
                {filteredProducts.length} results
                {urlSearchQuery && <span> for "<span className="font-medium text-slate-800">{urlSearchQuery}</span>"</span>}
              </p>
            </div>

            <div className="flex items-center gap-3">
               <span className="text-sm text-slate-500">Sort by:</span>
               <select 
                 className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2 outline-none cursor-pointer"
                 value={sortBy}
                 onChange={(e) => setSortBy(e.target.value)}
               >
                 <option value="newest">Newest First</option>
                 <option value="price_low">Price: Low to High</option>
                 <option value="price_high">Price: High to Low</option>
               </select>
            </div>
          </div>

          {/* Product Grid */}
          {loading ? (
             <div className="grid grid-cols-2 md:grid-cols-3 gap-6 animate-pulse">
               {[...Array(6)].map((_, i) => <div key={i} className="h-80 bg-slate-200 rounded-2xl"></div>)}
             </div>
          ) : filteredProducts.length === 0 ? (
             <div className="text-center py-20 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
               <ShoppingBag className="w-16 h-16 text-slate-300 mx-auto mb-3" />
               <p className="text-lg font-medium text-slate-600">No products found</p>
               <p className="text-slate-400 text-sm mb-4">Try adjusting your filters or search query.</p>
               <button onClick={clearFilters} className="text-blue-600 font-bold hover:underline">Clear Filters</button>
             </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              {filteredProducts.map(product => {
                const firstVariant = product.variants && product.variants[0];
                const displayImage = (product.images && product.images[0]) || firstVariant?.image;
                
                // CALCULATE FINAL PRICE (Base + GST)
                const basePrice = Number(firstVariant?.onlinePrice || 0);
                const gstPercent = Number(firstVariant?.gst || 0);
                const finalPrice = Math.round(basePrice * (1 + gstPercent / 100));

                // RATING LOGIC
                const rating = product.rating || 0;
                const reviewCount = product.ratingCount || 0;

                return (
                  <Link to={`/product/${product.id}`} key={product.id} className="group bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden flex flex-col h-full">
                    <div className="aspect-[3/4] bg-slate-100 relative overflow-hidden">
                      {displayImage ? (
                        <img src={displayImage} alt={product.name} className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300"><ShoppingBag className="w-12 h-12" /></div>
                      )}
                      {product.variants?.some(v => v.stock < 5) && (
                        <div className="absolute bottom-2 left-2 bg-red-500/90 backdrop-blur-sm text-white px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                           Low Stock
                        </div>
                      )}
                    </div>

                    <div className="p-4 flex flex-col flex-1">
                      <div className="text-xs text-slate-500 mb-1">{product.category} {product.subcategory ? `/ ${product.subcategory}` : ''}</div>
                      <h3 className="font-bold text-slate-900 truncate group-hover:text-blue-600 transition-colors">{product.name}</h3>
                      
                      {/* UPDATED RATING DISPLAY */}
                      <div className="flex items-center gap-1 mt-1 mb-3">
                         <Star className={`w-3 h-3 ${rating > 0 ? 'text-yellow-400 fill-yellow-400' : 'text-slate-300'}`} />
                         <span className="text-xs text-slate-400">
                            {rating > 0 ? rating.toFixed(1) : 'New'} 
                            {reviewCount > 0 && ` (${reviewCount})`}
                         </span>
                      </div>
                      
                      <div className="mt-auto flex items-center justify-between">
                        <div className="flex flex-col">
                            <span className="text-xs text-slate-400">Excl. Tax: ₹{basePrice}</span>
                            <span className="text-lg font-bold text-slate-900">₹{finalPrice}</span>
                        </div>
                        <button 
                          onClick={(e) => { 
                             e.preventDefault(); 
                             if (addToCart) {
                                addToCart({ 
                                    productId: product.id, 
                                    name: product.name, 
                                    variantIdx: 0, 
                                    price: finalPrice, 
                                    gst: gstPercent, 
                                    color: firstVariant.color, 
                                    size: firstVariant.size, 
                                    image: displayImage, 
                                    qty: 1 
                                });
                             }
                          }} 
                          className="bg-slate-900 text-white w-8 h-8 rounded-full flex items-center justify-center hover:bg-blue-600 transition-colors shadow-sm"
                        >
                          <ShoppingBag className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}