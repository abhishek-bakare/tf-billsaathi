import React, { useState, useEffect, useRef } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { ShoppingCart, User, Search, Menu, X, LogIn, LogOut, ChevronDown, ChevronRight, Package, UserCircle, Wallet, Heart } from 'lucide-react';
import { getAuth, signOut } from 'firebase/auth';
import { collection, query, orderBy, onSnapshot, doc } from 'firebase/firestore';
//import ThemeToggle from '../components/ThemeToggle'; // Adjust path if needed

export default function WebsiteLayout({ cartCount = 0, user, db }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  
  // NEW: Search & Wallet States
  const [searchQuery, setSearchQuery] = useState('');
  const [walletBalance, setWalletBalance] = useState(0);

  const auth = getAuth();
  const navigate = useNavigate();
  const userMenuRef = useRef(null);

  // Fetch Categories
  useEffect(() => {
    if (!db) return;
    const catRef = (typeof __app_id !== 'undefined') 
        ? collection(db, 'artifacts', __app_id, 'public', 'data', 'categories') 
        : collection(db, 'categories');
    
    const unsub = onSnapshot(query(catRef, orderBy('name')), (snap) => {
      setCategories(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, [db]);

  // NEW: Fetch Real-time Wallet Balance
  useEffect(() => {
    if (!db || !user) {
        setWalletBalance(0);
        return;
    }

    const collectionName = (typeof __app_id !== 'undefined') ? `artifacts/${__app_id}/public/data/website_users` : 'website_users';
    const userDocRef = doc(db, collectionName, user.uid);

    const unsubWallet = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
            setWalletBalance(docSnap.data().wallet_credit_balance || 0);
        }
    });

    return () => unsubWallet();
  }, [db, user]);

  // Click Outside Listener
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      window.location.href = '/'; 
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
        navigate(`/shop?q=${encodeURIComponent(searchQuery)}`);
        setIsMobileMenuOpen(false);
    }
  };

  const isLoggedIn = user && !user.isAnonymous;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* --- NAVBAR --- */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16 gap-4">
            
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 flex-shrink-0">
              <div className="bg-blue-600 text-white p-1.5 rounded-lg font-bold text-xl">D</div>
              <span className="font-bold text-xl tracking-tight text-slate-800 hidden sm:block">Drushya<span className="text-blue-600">Store</span></span>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-6">
              <Link to="/" className="text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors">Home</Link>
              
              {/* Categories Dropdown */}
              <div className="relative group z-50">
                <Link to="/shop" className="text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors flex items-center gap-1 py-4">
                  Shop <ChevronDown className="w-3 h-3" />
                </Link>
                <div className="absolute top-full left-0 w-56 bg-white border border-slate-200 shadow-xl rounded-xl py-2 hidden group-hover:block">
                  {categories.map(cat => (
                    <div key={cat.id} className="relative group/sub">
                      <Link to={`/shop?cat=${cat.name}`} className="flex items-center justify-between px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-blue-600">
                        {cat.name}
                        {cat.subcategories?.length > 0 && <ChevronRight className="w-3 h-3 text-slate-400" />}
                      </Link>
                      {cat.subcategories?.length > 0 && (
                        <div className="absolute left-full top-0 w-48 bg-white border border-slate-200 shadow-xl rounded-xl py-2 hidden group-hover/sub:block ml-1">
                          {cat.subcategories.map(sub => (
                            <Link key={sub} to={`/shop?cat=${cat.name}&subcat=${sub}`} className="block px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-blue-600">
                              {sub}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="border-t border-slate-100 mt-1 pt-1">
                    <Link to="/shop" className="block px-4 py-2.5 text-sm font-bold text-blue-600 hover:bg-slate-50">View All Products</Link>
                  </div>
                </div>
              </div>
            </div>

            {/* --- SEARCH BAR (New) --- */}
            <form onSubmit={handleSearch} className="flex-1 max-w-md hidden md:flex relative">
                <input 
                    type="text"
                    placeholder="Search for products..."
                    className="w-full bg-slate-100 border border-transparent focus:bg-white focus:border-blue-500 rounded-full py-2 pl-4 pr-10 text-sm outline-none transition-all"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600">
                    <Search className="w-4 h-4" />
                </button>
            </form>

            {/* Right Icons */}
            <div className="flex items-center gap-4">
              {/* Mobile Search Toggle (Optional, usually visible on mobile in header or separate row) */}
              <button className="md:hidden text-slate-500 hover:text-blue-600">
                <Search className="w-5 h-5" />
              </button>
              
              {/* NEW: Wallet Display (Only if Logged In) */}
              {isLoggedIn && (
                <div className="hidden sm:flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full border border-emerald-100">
                    <Wallet className="w-4 h-4" />
                    <span className="text-sm font-bold">₹{walletBalance}</span>
                </div>
              )}

              {/* Wishlist Icon */}
              <Link to="/wishlist" className="text-slate-500 hover:text-rose-500 transition-colors">
                <Heart className="w-5 h-5" />
              </Link>
             {/* <ThemeToggle /> */}
              <Link to="/cart" className="relative text-slate-500 hover:text-blue-600">
                <ShoppingCart className="w-5 h-5" />
                {cartCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-rose-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                    {cartCount}
                  </span>
                )}
              </Link>

              

              {/* Dynamic User Dropdown */}
              {isLoggedIn ? (
                <div className="relative" ref={userMenuRef}>
                    <button 
                        onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                        className="flex items-center gap-2 bg-slate-100 text-slate-700 pl-3 pr-2 py-1.5 rounded-full text-sm font-medium hover:bg-slate-200 transition-colors"
                    >
                        <span className="max-w-[80px] truncate">{user.displayName?.split(' ')[0] || 'User'}</span>
                        <div className="bg-slate-300 rounded-full p-1">
                            <User className="w-4 h-4 text-slate-600" />
                        </div>
                    </button>

                    {isUserMenuOpen && (
                        <div className="absolute top-full right-0 mt-2 w-56 bg-white border border-slate-200 shadow-xl rounded-xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                            <div className="px-4 py-3 border-b border-slate-100">
                                <p className="text-xs text-slate-500">Signed in as</p>
                                <p className="text-sm font-bold text-slate-800 truncate">{user.email}</p>
                            </div>
                            
                            {/* Wallet in Dropdown (Visible on mobile too) */}
                            <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between">
                                <span className="text-sm text-slate-600 flex items-center gap-2"><Wallet className="w-4 h-4"/> Balance</span>
                                <span className="text-sm font-bold text-emerald-600">₹{walletBalance}</span>
                            </div>

                            <Link to="/profile" onClick={() => setIsUserMenuOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-blue-600">
                                <UserCircle className="w-4 h-4" /> My Profile
                            </Link>
                            <Link to="/orders" onClick={() => setIsUserMenuOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-blue-600">
                                <Package className="w-4 h-4" /> My Orders
                            </Link>
                            <div className="border-t border-slate-100 mt-1 pt-1">
                                <button onClick={handleLogout} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50 text-left">
                                    <LogOut className="w-4 h-4" /> Logout
                                </button>
                            </div>
                        </div>
                    )}
                </div>
              ) : (
                <Link to="/login" className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-slate-800 transition-colors">
                    <LogIn className="w-4 h-4" />
                    <span>Login</span>
                </Link>
              )}

              {/* Mobile Menu Button */}
              <button className="md:hidden text-slate-500" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
                {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-slate-100 p-4 space-y-4 max-h-[80vh] overflow-y-auto">
            {/* Mobile Search */}
            <form onSubmit={handleSearch} className="relative">
                <input 
                    type="text"
                    placeholder="Search products..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-4 pr-10 text-sm outline-none"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <Search className="w-4 h-4" />
                </button>
            </form>

            <Link to="/" className="block text-slate-600 font-medium" onClick={() => setIsMobileMenuOpen(false)}>Home</Link>
            
            {/* Mobile Categories */}
            <div className="space-y-2">
                <div className="font-bold text-slate-800 text-sm">Shop By Category</div>
                {categories.map(cat => (
                    <div key={cat.id} className="pl-4 border-l-2 border-slate-100">
                        <Link to={`/shop?cat=${cat.name}`} onClick={() => setIsMobileMenuOpen(false)} className="block text-sm text-slate-600 py-1">{cat.name}</Link>
                    </div>
                ))}
            </div>

            {isLoggedIn ? (
                <>
                    <div className="border-t border-slate-100 pt-4 space-y-2">
                        <div className="font-bold text-slate-800 text-sm">Account</div>
                        <div className="flex items-center justify-between text-sm text-slate-600 py-1">
                            <span className="flex items-center gap-2"><Wallet className="w-4 h-4"/> Wallet Balance</span>
                            <span className="font-bold text-emerald-600">₹{walletBalance}</span>
                        </div>
                        <Link to="/profile" className="block text-sm text-slate-600" onClick={() => setIsMobileMenuOpen(false)}>My Profile</Link>
                        <Link to="/orders" className="block text-sm text-slate-600" onClick={() => setIsMobileMenuOpen(false)}>My Orders</Link>
                    </div>
                    <button onClick={handleLogout} className="block w-full text-left text-rose-600 font-medium pt-4 border-t border-slate-100">Logout</button>
                </>
            ) : (
                <Link to="/login" className="block text-blue-600 font-medium pt-4 border-t border-slate-100" onClick={() => setIsMobileMenuOpen(false)}>Login / Sign Up</Link>
            )}
          </div>
        )}
      </nav>

      {/* --- PAGE CONTENT --- */}
      <main>
        <Outlet />
      </main>

      {/* --- FOOTER --- */}
      <footer className="bg-slate-900 text-slate-400 py-12 mt-20">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 md:grid-cols-4 gap-8">
          <div><h3 className="text-white font-bold text-lg mb-4">Drushya India</h3><p className="text-sm">Premium quality products delivered to your doorstep.</p></div>
          <div><h4 className="text-white font-bold mb-4">Shop</h4><ul className="space-y-2 text-sm"><li><Link to="/shop" className="hover:text-white">All Products</Link></li></ul></div>
          <div><h4 className="text-white font-bold mb-4">Customer</h4><ul className="space-y-2 text-sm"><li><Link to="/orders" className="hover:text-white">Track Order</Link></li><li><Link to="/contact" className="hover:text-white">Contact Us</Link></li></ul></div>
          <div><h4 className="text-white font-bold mb-4">Stay Connected</h4><p className="text-sm mb-4">Subscribe for latest updates.</p><div className="flex gap-2"><input placeholder="Email" className="bg-slate-800 border-none rounded px-3 py-2 text-sm w-full" /><button className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-bold">Go</button></div></div>
        </div>
      </footer>
    </div>
  );
}