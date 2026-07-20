import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, getDocs, doc, getDoc } from 'firebase/firestore';
import { ShoppingBag, ArrowRight, Star, X, Copy } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Home({ db, addToCart }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPopup, setShowPopup] = useState(false);
  
  // CMS Content State
  const [content, setContent] = useState({
    heroTitle: 'New Arrivals',
    heroSubtitle: 'Summer Collection',
    heroDescription: 'Discover the latest trends in fashion.',
    heroButtonText: 'Shop Now',
    heroImage: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8',
    announcement: '',
    featuredCategories: [],
    promoTitle: '',
    promoSubtitle: '',
    promoImage: '',
    promoLink: '',
    siteTitle: 'Drushya Store',
    themeColor: '#2563EB',
    popupEnabled: false,
    popupTitle: 'Welcome!',
    popupText: 'Sign up and get discounts.',
    popupCode: ''
  });

  // Fetch Data
  useEffect(() => {
    if (!db) return;
    const fetchData = async () => {
      const isCanvas = typeof __app_id !== 'undefined';
      
      // 1. Fetch CMS Content
      try {
        const contentPath = isCanvas ? `artifacts/${__app_id}/public/data/content` : 'content';
        const contentDoc = await getDoc(doc(db, contentPath, 'home'));
        if (contentDoc.exists()) {
            const data = contentDoc.data();
            setContent(prev => ({ ...prev, ...data }));
            
            // SEO Title Update
            if(data.siteTitle) document.title = data.siteTitle;

            // Popup Logic
            const popupSeen = sessionStorage.getItem('popupSeen');
            if (data.popupEnabled && !popupSeen) {
                setTimeout(() => setShowPopup(true), 2000); // Show after 2s
            }
        }
      } catch (error) { console.warn("CMS Error:", error); }

      // 2. Fetch Latest Products
      try {
        const prodPath = isCanvas ? `artifacts/${__app_id}/public/data/products` : 'products';
        const q = query(collection(db, prodPath), orderBy('createdAt', 'desc'), limit(12));
        const snapshot = await getDocs(q);
        setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error) { console.error("Product Fetch Error:", error); } 
      finally { setLoading(false); }
    };
    fetchData();
  }, [db]);

  const closePopup = () => {
      setShowPopup(false);
      sessionStorage.setItem('popupSeen', 'true');
  };

  const themeStyle = { backgroundColor: content.themeColor };
  const textThemeStyle = { color: content.themeColor };

  return (
    <div className="font-sans">
      
      {/* --- MARKETING POPUP --- */}
      {showPopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
              <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full relative overflow-hidden text-center p-8 transform scale-100 transition-transform">
                  <button onClick={closePopup} className="absolute top-3 right-3 text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
                  <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-opacity-10" style={{ backgroundColor: `${content.themeColor}20` }}>
                      <Star className="w-8 h-8" style={textThemeStyle} />
                  </div>
                  <h3 className="text-2xl font-bold text-slate-800 mb-2">{content.popupTitle}</h3>
                  <p className="text-slate-600 mb-6">{content.popupText}</p>
                  
                  {content.popupCode && (
                      <div className="bg-slate-100 border border-slate-200 rounded-lg p-3 flex justify-between items-center mb-6 cursor-pointer hover:bg-slate-200 transition-colors" onClick={() => navigator.clipboard.writeText(content.popupCode)}>
                          <span className="font-mono font-bold text-slate-800 tracking-wider">{content.popupCode}</span>
                          <Copy className="w-4 h-4 text-slate-500" />
                      </div>
                  )}

                  <button onClick={closePopup} className="w-full text-white font-bold py-3 rounded-xl transition-opacity hover:opacity-90" style={themeStyle}>
                      Start Shopping
                  </button>
              </div>
          </div>
      )}

      {/* --- ANNOUNCEMENT --- */}
      {content.announcement && (
        <div className="bg-slate-900 text-white text-center text-xs font-bold py-2 px-4 tracking-wide">
            {content.announcement}
        </div>
      )}

      {/* --- HERO SECTION --- */}
      <section className="relative bg-slate-900 text-white py-24 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center transition-all duration-1000" style={{ backgroundImage: `url('${content.heroImage}')` }} />
        <div className="absolute inset-0 bg-black/60" />

        <div className="max-w-7xl mx-auto relative z-10 text-center">
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {content.heroTitle} <br /> 
            <span style={textThemeStyle}>{content.heroSubtitle}</span>
          </h1>
          <p className="text-lg text-slate-200 mb-8 max-w-2xl mx-auto">{content.heroDescription}</p>
          <Link to="/shop" className="inline-flex items-center gap-2 text-white px-8 py-3.5 rounded-full font-bold transition-transform transform hover:scale-105 shadow-lg" style={themeStyle}>
            {content.heroButtonText} <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* --- FEATURED CATEGORIES --- */}
      {content.featuredCategories && content.featuredCategories.length > 0 && content.featuredCategories[0].title && (
          <section className="max-w-7xl mx-auto px-4 py-16">
              <h2 className="text-2xl font-bold text-slate-900 mb-8 text-center">Featured Collections</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {content.featuredCategories.map((cat, idx) => (
                      <Link to={cat.link || '/shop'} key={idx} className="relative h-64 rounded-2xl overflow-hidden group shadow-md hover:shadow-xl transition-all">
                          {cat.image ? (
                              <img src={cat.image} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt={cat.title} />
                          ) : (
                              <div className="w-full h-full bg-slate-200 flex items-center justify-center text-slate-400">No Image</div>
                          )}
                          <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition-colors" />
                          <div className="absolute bottom-6 left-6 text-white">
                              <h3 className="text-xl font-bold">{cat.title}</h3>
                              <span className="text-sm font-medium underline decoration-2 underline-offset-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">Shop Now</span>
                          </div>
                      </Link>
                  ))}
              </div>
          </section>
      )}

      {/* --- PROMO BANNER --- */}
      {content.promoTitle && (
          <section className="py-16">
              <div className="max-w-7xl mx-auto px-4">
                  <div className="relative rounded-3xl overflow-hidden shadow-lg h-80 bg-slate-900 flex items-center">
                      {content.promoImage && <img src={content.promoImage} className="absolute inset-0 w-full h-full object-cover opacity-60" alt="Promo" />}
                      <div className="relative z-10 px-8 md:px-16 max-w-xl">
                          <span className="text-xs font-bold tracking-widest uppercase bg-white/20 backdrop-blur text-white px-3 py-1 rounded-full mb-4 inline-block">{content.promoSubtitle}</span>
                          <h2 className="text-4xl font-extrabold text-white mb-6 leading-tight">{content.promoTitle}</h2>
                          <Link to={content.promoLink || '/shop'} className="inline-block bg-white text-slate-900 px-8 py-3 rounded-xl font-bold hover:bg-slate-100 transition-colors">
                              Explore Offer
                          </Link>
                      </div>
                  </div>
              </div>
          </section>
      )}

      {/* --- PRODUCT GRID --- */}
      <section className="max-w-7xl mx-auto px-4 py-16">
        <div className="flex justify-between items-end mb-8">
          <h2 className="text-2xl font-bold text-slate-900">Trending Products</h2>
          <Link to="/shop" className="font-medium hover:underline" style={textThemeStyle}>View All</Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 animate-pulse">
            {[...Array(4)].map((_, i) => <div key={i} className="h-80 bg-slate-200 rounded-2xl"></div>)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {products.map(product => {
              const firstVariant = product.variants && product.variants[0];
              const displayImage = (product.images && product.images[0]) || firstVariant?.image;
              const basePrice = Number(firstVariant?.onlinePrice || 0);
              const gstPercent = Number(firstVariant?.gst || 0);
              const finalPrice = Math.round(basePrice * (1 + gstPercent / 100));
              const rating = product.rating || 0;

              return (
                <Link to={`/product/${product.id}`} key={product.id} className="group bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden flex flex-col h-full">
                  <div className="aspect-[3/4] bg-slate-100 relative overflow-hidden">
                    {displayImage ? <img src={displayImage} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" /> : <div className="w-full h-full flex items-center justify-center text-slate-300"><ShoppingBag className="w-12 h-12" /></div>}
                    {product.variants?.some(v => v.stock < 5) && <div className="absolute bottom-2 left-2 bg-red-500/90 text-white px-2 py-0.5 rounded text-[10px] font-bold">Low Stock</div>}
                  </div>
                  <div className="p-4 flex flex-col flex-1">
                    <div className="text-xs text-slate-500 mb-1">{product.category}</div>
                    <h3 className="font-bold text-slate-900 truncate group-hover:text-blue-600 transition-colors">{product.name}</h3>
                    <div className="flex items-center gap-1 mt-1 mb-3">
                      <Star className={`w-3 h-3 ${rating > 0 ? 'text-yellow-400 fill-yellow-400' : 'text-slate-300'}`} />
                      <span className="text-xs text-slate-400">{rating > 0 ? rating.toFixed(1) : 'New'}</span>
                    </div>
                    <div className="mt-auto flex items-center justify-between">
                      <div className="flex flex-col"><span className="text-xs text-slate-400">Price</span><span className="text-lg font-bold text-slate-900">₹{finalPrice}</span></div>
                      <button 
                        onClick={(e) => { e.preventDefault(); addToCart({ productId: product.id, name: product.name, variantIdx: 0, price: finalPrice, gst: gstPercent, color: firstVariant.color, size: firstVariant.size, image: displayImage, qty: 1 }); }} 
                        className="text-white w-8 h-8 rounded-full flex items-center justify-center transition-colors shadow-sm"
                        style={themeStyle}
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
      </section>

      {/* --- FEATURES --- */}
      <section className="bg-slate-50 border-y border-slate-200 py-12">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          <div className="p-4"><div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-xl">🚚</div><h3 className="font-bold text-slate-900 mb-2">Free Shipping</h3><p className="text-sm text-slate-500">On all orders above ₹999 across India.</p></div>
          <div className="p-4"><div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-xl">🛡️</div><h3 className="font-bold text-slate-900 mb-2">Secure Payment</h3><p className="text-sm text-slate-500">100% secure payment gateways and UPI.</p></div>
          <div className="p-4"><div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-xl">↩️</div><h3 className="font-bold text-slate-900 mb-2">Easy Returns</h3><p className="text-sm text-slate-500">7-day hassle-free return policy.</p></div>
        </div>
      </section>
    </div>
  );
}