import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, Navigate, Outlet } from 'react-router-dom';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, enableIndexedDbPersistence, deleteDoc, doc 
} from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { 
  Package, Wifi, WifiOff, Plus, Search, 
  Users, ShoppingCart, Truck, Tags, Edit, AlertTriangle, ClipboardList,
  FileSpreadsheet, Trash2, LayoutDashboard, Ticket, Loader2, Barcode, Settings as SettingsIcon, BarChart3,
  LayoutTemplate
} from 'lucide-react';

// --- WEBSITE COMPONENTS ---
import WebsiteLayout from './website/WebsiteLayout';
import Home from './website/Home';
import ProductDetail from './website/ProductDetail';
import Cart from './website/Cart';
import CustomerAuth from './website/CustomerAuth';
import Checkout from './website/Checkout';
import MyOrders from './website/MyOrders';
import OrderDetail from './website/OrderDetail';
import UserProfile from './website/UserProfile';
import Shop from './website/Shop'; 
import Wishlist from './website/Wishlist';
import PaymentSuccess from './website/PaymentSuccess';
import PaymentFailure from './website/PaymentFailure';
// Add 'getFunctions' to this import line
import { getFunctions } from 'firebase/functions';


// Styles
import './index.css';

// --- FIREBASE CONFIGURATION ---
let firebaseConfig;
let isCanvasEnvironment = false;

try {
  if (typeof __firebase_config !== 'undefined') {
    firebaseConfig = JSON.parse(__firebase_config);
    isCanvasEnvironment = true;
  } else {
    throw new Error('Running locally');
  }
} catch (e) {
  // PASTE YOUR FIREBASE KEYS HERE FOR LOCALHOST
  firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
  };
}

// Initialize Firebase
let app, auth, db, functions;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  functions = getFunctions(app);
  
  if (!isCanvasEnvironment) {
      enableIndexedDbPersistence(db).catch((err) => {
          console.log("Persistence Error:", err.code);
      });
  }
} catch (error) {
  console.error("Firebase Init Error:", error);
}

// Helper for Collection Path
const getProductCollection = (firestoreDb) => {
  if (isCanvasEnvironment && typeof __app_id !== 'undefined') {
    return collection(firestoreDb, 'artifacts', __app_id, 'public', 'data', 'products');
  }
  return collection(firestoreDb, 'products'); 
};

// --- ADMIN LAYOUT COMPONENT ---
function AdminLayout({ user, onlineStatus }) {
  const location = useLocation();
  const isActive = (path) => location.pathname.includes(path);

  return (
    <div className="flex h-screen bg-slate-100 text-slate-900 font-sans">
      <aside className="w-64 bg-slate-900 text-white flex flex-col flex-shrink-0">
        <div className="p-6 border-b border-slate-700">
          <h1 className="text-2xl font-bold tracking-tight">Drushya Store</h1>
          <p className="text-xs text-slate-400 mt-1">Inventory & POS System</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <Link to="/admin/dashboard" className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive('dashboard') ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
            <LayoutDashboard className="w-5 h-5" /> Dashboard
          </Link>
          <Link to="/admin/inventory" className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive('inventory') ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
            <Package className="w-5 h-5" /> Inventory
          </Link>
          <Link to="/admin/billing" className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive('billing') ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
            <ShoppingCart className="w-5 h-5" /> Billing / POS
          </Link>
          <Link to="/admin/orders" className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive('orders') ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
            <ClipboardList className="w-5 h-5" /> Orders
          </Link>
          <Link to="/admin/returns" className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive('returns') ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
            <AlertTriangle className="w-5 h-5" /> Returns
          </Link>
          <Link to="/admin/coupons" className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive('coupons') ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
            <Ticket className="w-5 h-5" /> Coupons
          </Link>
          <Link to="/admin/customers" className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive('customers') ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
            <Users className="w-5 h-5" /> Customers
          </Link>
          <Link to="/admin/vendors" className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive('vendors') ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
            <Truck className="w-5 h-5" /> Vendors
          </Link>
          <Link to="/admin/categories" className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive('categories') ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
            <Tags className="w-5 h-5" /> Categories
          </Link>
          <Link to="/admin/barcodes" className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive('barcodes') ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
            <Barcode className="w-5 h-5" /> Barcodes
          </Link>
          <Link to="/admin/cms" className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive('cms') ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
            <LayoutTemplate className="w-5 h-5" /> Website Content
          </Link>
          <Link to="/admin/staff" className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive('staff') ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
            <Users className="w-5 h-5" /> Staff
          </Link>
          <Link to="/admin/reports" className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive('reports') ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
            <BarChart3 className="w-5 h-5" /> Reports
          </Link>
          <Link to="/admin/settings" className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive('settings') ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
            <SettingsIcon className="w-5 h-5" /> Settings
          </Link>
        </nav>

        <div className="p-4 border-t border-slate-700">
          <div className={`flex items-center gap-2 text-sm ${onlineStatus ? 'text-emerald-400' : 'text-amber-400'}`}>
            {onlineStatus ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            {onlineStatus ? 'Online' : 'Offline Mode'}
          </div>
          {/* <ThemeToggle /> */}
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}

// --- INVENTORY PAGE ---
import { query, orderBy, onSnapshot as onSnapshotDoc } from 'firebase/firestore';


// --- MAIN ROUTER ---
export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true); // NEW: Auth Loading State
  const [onlineStatus, setOnlineStatus] = useState(navigator.onLine);
  
  // WEBSITE STATE
  const [websiteCart, setWebsiteCart] = useState([]);
  const [websiteCoupon, setWebsiteCoupon] = useState(null); 

  const addToWebsiteCart = (item) => {
    setWebsiteCart(prev => {
      const key = `${item.productId}-${item.color}-${item.size}`;
      const existing = prev.find(i => `${i.productId}-${i.color}-${i.size}` === key);
      
      if (existing) {
        return prev.map(i => `${i.productId}-${i.color}-${i.size}` === key ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { ...item, qty: 1 }];
    });
  };
  
  const updateWebsiteCartQty = (index, newQty) => {
    if (newQty < 1) return;
    setWebsiteCart(prev => prev.map((item, i) => i === index ? { ...item, qty: newQty } : item));
  };
  
  const removeFromWebsiteCart = (index) => {
      setWebsiteCart(prev => prev.filter((_, i) => i !== index));
  }

  const clearWebsiteCart = () => {
    setWebsiteCart([]);
    setWebsiteCoupon(null);
  }

  useEffect(() => {
    if (!auth) {
        setAuthLoading(false);
        return;
    }
    if (!isCanvasEnvironment && firebaseConfig.apiKey && firebaseConfig.apiKey.includes("PASTE_YOUR")) {
        setAuthLoading(false);
        return;
    }

    // --- CRITICAL FIX FOR PERSISTENCE ---
    // Wait for onAuthStateChanged to fire before rendering the app
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
      } else {
        setUser(null);
      }
      setAuthLoading(false); // Stop loading once Firebase responds
    });

    const handleOnline = () => setOnlineStatus(true);
    const handleOffline = () => setOnlineStatus(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // --- LOADING SCREEN ---
  if (authLoading) {
      return (
          <div className="flex h-screen items-center justify-center bg-slate-50">
              <div className="text-center">
                  <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto mb-4" />
                  <p className="text-slate-500 font-medium">Loading...</p>
              </div>
          </div>
      );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* PUBLIC WEBSITE ROUTES */}
        <Route path="/" element={<WebsiteLayout cartCount={websiteCart.length} user={user} db={db} />}>
          <Route index element={<Home db={db} addToCart={addToWebsiteCart} />} />
          <Route path="shop" element={<Shop db={db} />} />
          <Route path="product/:id" element={<ProductDetail db={db} addToCart={addToWebsiteCart} user={user} />} />
          
          <Route path="cart" element={
            <Cart 
                cart={websiteCart} 
                removeFromCart={removeFromWebsiteCart} 
                updateCartQty={updateWebsiteCartQty}
                db={db} 
                coupon={websiteCoupon} 
                setCoupon={setWebsiteCoupon} 
            />
          } />
          
          <Route path="login" element={<CustomerAuth auth={auth} db={db} functions={functions} />} />
          <Route path="signup" element={<CustomerAuth auth={auth} db={db} functions={functions} />} />
          
          <Route path="checkout" element={
            <Checkout 
                cart={websiteCart} 
                user={user} 
                db={db} 
                clearCart={clearWebsiteCart} 
                coupon={websiteCoupon} 
                functions={functions}
            />
          } />
          <Route path="payment/success" element={<PaymentSuccess clearCart={clearWebsiteCart} />} />
          <Route path="payment/failure" element={<PaymentFailure />} />
          <Route path="orders" element={<MyOrders db={db} user={user} />} />
          <Route path="order/:orderId" element={<OrderDetail db={db} />} />
          <Route path="profile" element={<UserProfile db={db} user={user} functions={functions}/>} />
          <Route path="wishlist" element={<Wishlist db={db} user={user} />} />
        </Route>
        
      </Routes>
    </BrowserRouter>
  );
}