import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'; 
import { Star, ShoppingBag, Truck, ShieldCheck, ArrowLeft, Check, Plus, Minus, Heart } from 'lucide-react';

// IMPORT REVIEWS COMPONENT
import ProductReviews from './ProductReviews';

export default function ProductDetail({ db, addToCart, user }) { 
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [selectedVariantIdx, setSelectedVariantIdx] = useState(0);
  const [mainImage, setMainImage] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [wishlistLoading, setWishlistLoading] = useState(false);

  useEffect(() => {
    if (!db || !id) return;
    const fetchProduct = async () => {
      try {
        const docPath = (typeof __app_id !== 'undefined') 
          ? `artifacts/${__app_id}/public/data/products/${id}` 
          : `products/${id}`;
          
        // Use onSnapshot for real-time updates (e.g. when rating changes)
        const { onSnapshot } = await import('firebase/firestore');
        const unsub = onSnapshot(doc(db, docPath), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setProduct({ id: docSnap.id, ...data });
                
                // Initialize image only if not set yet
                if (!mainImage) {
                    if (data.images && data.images.length > 0) setMainImage(data.images[0]);
                    else if (data.variants && data.variants[0].image) setMainImage(data.variants[0].image);
                }
            }
            setLoading(false);
        });
        return () => unsub();
      } catch (error) {
        console.error("Error fetching product:", error);
        setLoading(false);
      }
    };
    fetchProduct();
  }, [db, id]); 

  // Check Wishlist Status
  useEffect(() => {
      if (!db || !user || !id) return;
      const checkWishlist = async () => {
          const path = (typeof __app_id !== 'undefined') 
            ? `artifacts/${__app_id}/public/data/website_users/${user.uid}/wishlist/${id}` 
            : `website_users/${user.uid}/wishlist/${id}`;
          
          try {
            const docSnap = await getDoc(doc(db, path));
            if (docSnap.exists()) setIsWishlisted(true);
          } catch (e) {
            console.error("Wishlist check error:", e);
          }
      };
      checkWishlist();
  }, [db, user, id]);

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!product) return <div className="min-h-screen flex items-center justify-center">Product not found.</div>;

  const currentVariant = product.variants[selectedVariantIdx];
  
  const basePrice = Number(currentVariant.onlinePrice || 0);
  const gstPercent = Number(currentVariant.gst || 0);
  const finalPrice = Math.round(basePrice * (1 + gstPercent / 100));

  const uniqueColors = [...new Set(product.variants.map(v => v.color))];
  
  const availableSizes = product.variants
    .filter(v => v.color === currentVariant.color)
    .map((v, idx) => ({ size: v.size, originalIndex: product.variants.indexOf(v) }));

  const handleColorClick = (color) => {
    const firstMatch = product.variants.findIndex(v => v.color === color);
    if (firstMatch !== -1) {
      setSelectedVariantIdx(firstMatch);
      if (product.variants[firstMatch].image) setMainImage(product.variants[firstMatch].image);
    }
  };

  const handleAddToCart = () => {
    if (currentVariant.stock <= 0) return alert("Sorry, this item is out of stock.");
    if (quantity > currentVariant.stock) return alert(`Only ${currentVariant.stock} items available.`);

    addToCart({
      productId: product.id,
      name: product.name,
      variantIdx: selectedVariantIdx,
      color: currentVariant.color,
      size: currentVariant.size,
      price: finalPrice, 
      gst: gstPercent,
      image: mainImage,
      qty: quantity
    });
    alert("Added to Cart!");
  };

  const handleWishlistToggle = async () => {
    if (!user) return alert("Please log in to add items to your wishlist.");
    if (!db || wishlistLoading) return;
    
    setWishlistLoading(true);
    const path = (typeof __app_id !== 'undefined') ? `artifacts/${__app_id}/public/data/website_users/${user.uid}/wishlist/${id}` : `website_users/${user.uid}/wishlist/${id}`;
    const ref = doc(db, path);

    try {
        if (isWishlisted) {
            await deleteDoc(ref);
            setIsWishlisted(false);
        } else {
            await setDoc(ref, { productId: id, name: product.name, image: mainImage, price: finalPrice, addedAt: serverTimestamp() });
            setIsWishlisted(true);
        }
    } catch (e) { console.error(e); }
    setWishlistLoading(false);
  };

  const increaseQty = () => { if (quantity < currentVariant.stock) setQuantity(quantity + 1); };
  const decreaseQty = () => { if (quantity > 1) setQuantity(quantity - 1); };

  // Real Rating Data
  const ratingValue = product.rating || 0;
  const ratingCount = product.ratingCount || 0;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <Link to="/shop" className="inline-flex items-center text-slate-500 hover:text-blue-600 mb-6">
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Shop
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        {/* --- LEFT: IMAGES --- */}
        <div className="space-y-4">
          <div className="aspect-square bg-slate-100 rounded-2xl overflow-hidden border border-slate-200 relative">
            {mainImage ? <img src={mainImage} alt={product.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-300">No Image</div>}
            {currentVariant.stock < 5 && <div className="absolute top-4 left-4 bg-red-500 text-white px-3 py-1 rounded-full text-xs font-bold shadow-sm">Only {currentVariant.stock} Left!</div>}
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {product.images?.map((img, i) => (
              <button key={i} onClick={() => setMainImage(img)} className={`w-20 h-20 rounded-lg overflow-hidden border-2 flex-shrink-0 ${mainImage === img ? 'border-blue-600' : 'border-transparent'}`}><img src={img} className="w-full h-full object-cover" /></button>
            ))}
            {product.variants.map((v, i) => v.image && (
              <button key={`v-${i}`} onClick={() => setMainImage(v.image)} className={`w-20 h-20 rounded-lg overflow-hidden border-2 flex-shrink-0 ${mainImage === v.image ? 'border-blue-600' : 'border-transparent'}`}><img src={v.image} className="w-full h-full object-cover" /></button>
            ))}
          </div>
        </div>

        {/* --- RIGHT: INFO & ACTIONS --- */}
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">{product.name}</h1>
          
          {/* RATING SECTION */}
          <div className="flex items-center gap-2 mb-4">
            <div className="flex text-yellow-400">
               {[1,2,3,4,5].map(star => (
                   <Star key={star} className={`w-4 h-4 ${star <= Math.round(ratingValue) ? 'fill-current' : 'text-slate-200'}`} />
               ))}
            </div>
            <span className="text-sm text-slate-500">({ratingCount} Reviews)</span>
          </div>

          <div className="flex items-end gap-3 mb-6">
            <span className="text-4xl font-bold text-slate-900">₹{finalPrice}</span>
            <span className="text-lg text-slate-400 line-through mb-1">₹{Math.round(finalPrice * 1.2)}</span>
            <span className="text-sm font-bold text-emerald-600 mb-2 bg-emerald-50 px-2 py-0.5 rounded">20% OFF</span>
          </div>
          
          <div className="text-xs text-slate-500 mb-6">Base Price: ₹{basePrice} + {gstPercent}% GST</div>

          {/* Color Selector */}
          <div className="mb-6"><label className="block text-sm font-bold text-slate-700 mb-2">Select Color: <span className="font-normal text-slate-500">{currentVariant.color}</span></label><div className="flex gap-3">{uniqueColors.map(color => (<button key={color} onClick={() => handleColorClick(color)} className={`w-10 h-10 rounded-full border-2 flex items-center justify-center ${currentVariant.color === color ? 'border-blue-600' : 'border-slate-200'}`} style={{ backgroundColor: color.toLowerCase() === 'white' ? '#fff' : color }}>{currentVariant.color === color && <Check className={`w-5 h-5 ${color.toLowerCase() === 'white' ? 'text-black' : 'text-white'}`} />}</button>))}</div></div>

          {/* Size Selector */}
          <div className="mb-8"><label className="block text-sm font-bold text-slate-700 mb-2">Select Size: <span className="font-normal text-slate-500">{currentVariant.size}</span></label><div className="flex gap-3">{availableSizes.map(({ size, originalIndex }) => (<button key={size} onClick={() => setSelectedVariantIdx(originalIndex)} className={`w-12 h-12 rounded-lg border flex items-center justify-center font-medium transition-all ${selectedVariantIdx === originalIndex ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'}`}>{size}</button>))}</div></div>
          
          {/* Quantity Selector */}
          <div className="mb-8"><label className="block text-sm font-bold text-slate-700 mb-2">Quantity</label><div className="flex items-center border border-slate-300 rounded-xl w-32 bg-white"><button onClick={decreaseQty} className="px-4 py-3 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors" disabled={quantity <= 1}><Minus className="w-4 h-4" /></button><span className="flex-1 text-center font-bold text-slate-900">{quantity}</span><button onClick={increaseQty} className="px-4 py-3 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors" disabled={quantity >= currentVariant.stock}><Plus className="w-4 h-4" /></button></div></div>

          {/* ACTIONS - Centered */}
          <div className="flex gap-4 mb-8 justify-center">
            <button onClick={handleAddToCart} disabled={currentVariant.stock <= 0} className="bg-blue-600 hover:bg-blue-700 text-white py-4 px-8 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><ShoppingBag className="w-5 h-5" /> {currentVariant.stock > 0 ? 'Add to Cart' : 'Out of Stock'}</button>
            <button onClick={handleWishlistToggle} disabled={wishlistLoading} className={`px-6 py-4 border rounded-xl transition-colors flex items-center justify-center ${isWishlisted ? 'border-rose-200 bg-rose-50 text-rose-500' : 'border-slate-300 hover:bg-slate-50 text-slate-400 hover:text-rose-500'}`} title="Add to Wishlist">{wishlistLoading ? <span className="text-xs">...</span> : <Heart className={`w-6 h-6 ${isWishlisted ? 'fill-current' : ''}`} />}</button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl"><Truck className="w-6 h-6 text-blue-600" /><div><div className="font-bold text-sm text-slate-800">Free Delivery</div><div className="text-xs text-slate-500">Orders over ₹999</div></div></div>
            <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl"><ShieldCheck className="w-6 h-6 text-emerald-600" /><div><div className="font-bold text-sm text-slate-800">1 Year Warranty</div><div className="text-xs text-slate-500">Official Guarantee</div></div></div>
          </div>
        </div>
      </div>

      {/* --- DESCRIPTION SECTION --- */}
      <div className="mt-16 border-t border-slate-200 pt-10 max-w-4xl mx-auto">
        <h3 className="font-bold text-xl text-slate-900 mb-6 text-center">Product Description</h3>
        
        {/* ADDED: Tailwind classes to enforce list dots, numbers, and table styles */}
        <div 
            className="text-slate-600 leading-relaxed mx-auto text-left text-sm
            [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4
            [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-4
            [&_li]:mb-1
            [&_table]:w-full [&_table]:border-collapse [&_table]:border [&_table]:border-slate-200 [&_table]:mt-4 [&_table]:mb-6
            [&_th]:border [&_th]:border-slate-300 [&_th]:p-3 [&_th]:bg-slate-100 [&_th]:text-left [&_th]:font-bold
            [&_td]:border [&_td]:border-slate-200 [&_td]:p-3
            [&_b]:font-bold [&_i]:italic"
            dangerouslySetInnerHTML={{ __html: product.description || "No description available." }} 
        />
      </div>

      {/* --- REVIEWS SECTION --- */}
      <ProductReviews db={db} productId={id} user={user} />

    </div>
  );
}