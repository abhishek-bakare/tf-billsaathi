import React, { useState, useEffect } from 'react';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { Heart, Trash2, ShoppingBag } from 'lucide-react';

export default function Wishlist({ db, user }) {
  const [wishlistItems, setWishlistItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db || !user) {
        setLoading(false);
        return;
    }

    const fetchWishlist = async () => {
      try {
        const path = (typeof __app_id !== 'undefined') 
            ? `artifacts/${__app_id}/public/data/website_users/${user.uid}/wishlist` 
            : `website_users/${user.uid}/wishlist`;
            
        const querySnapshot = await getDocs(collection(db, path));
        const items = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setWishlistItems(items);
      } catch (error) {
        console.error("Error fetching wishlist:", error);
      }
      setLoading(false);
    };

    fetchWishlist();
  }, [db, user]);

  const removeFromWishlist = async (itemId) => {
      if (!db || !user) return;
      try {
          const path = (typeof __app_id !== 'undefined') 
            ? `artifacts/${__app_id}/public/data/website_users/${user.uid}/wishlist/${itemId}` 
            : `website_users/${user.uid}/wishlist/${itemId}`;
          
          await deleteDoc(doc(db, path));
          setWishlistItems(prev => prev.filter(item => item.id !== itemId));
      } catch (error) {
          console.error("Error removing item:", error);
      }
  };

  if (!user) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <Heart className="w-16 h-16 text-slate-200 mb-4" />
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Please Log In</h2>
        <p className="text-slate-500 mb-6">Login to view your wishlist.</p>
        <Link to="/login" className="bg-blue-600 text-white px-6 py-2 rounded-full font-bold">Login Now</Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-slate-900 mb-8 flex items-center gap-3">
        <Heart className="w-8 h-8 text-rose-500 fill-current" /> My Wishlist
      </h1>

      {loading ? (
        <div className="text-center py-20 text-slate-500">Loading your favorites...</div>
      ) : wishlistItems.length === 0 ? (
        <div className="text-center py-20 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
          <Heart className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-lg font-medium text-slate-600">Your wishlist is empty</p>
          <Link to="/shop" className="text-blue-600 font-bold hover:underline mt-2 inline-block">Explore Products</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {wishlistItems.map((item) => (
            <div key={item.id} className="group bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-xl transition-all overflow-hidden relative">
              <Link to={`/product/${item.productId}`}>
                <div className="aspect-square bg-slate-100 relative overflow-hidden">
                  {item.image ? (
                    <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300"><ShoppingBag className="w-10 h-10" /></div>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="font-bold text-slate-900 truncate mb-1">{item.name}</h3>
                  <div className="font-bold text-slate-900">₹{item.price}</div>
                </div>
              </Link>
              
              <button 
                onClick={(e) => { e.preventDefault(); removeFromWishlist(item.id); }}
                className="absolute top-3 right-3 bg-white/90 p-2 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors shadow-sm"
                title="Remove"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}