import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, Navigate, Outlet } from 'react-router-dom';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, enableIndexedDbPersistence 
} from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';
import { 
  Package, Wifi, WifiOff, Plus, Search, 
  Users, ShoppingCart, Truck, Tags, Edit, AlertTriangle, ClipboardList,
  FileSpreadsheet, Trash2, LayoutDashboard, Ticket, Loader2, Barcode, Settings as SettingsIcon, BarChart3,
  LayoutTemplate
} from 'lucide-react';

// --- ADMIN COMPONENTS IMPORTS (From your original file) ---
import AdminLogin from './components/AdminLogin'; // Make sure this file exists!
import CategoryManager from './components/CategoryManager';
import CustomerManager from './components/CustomerManager';
import VendorManager from './components/VendorManager';
import BillingManager from './components/BillingManager';
import OrderManager from './components/OrderManager';
import ReturnManager from './components/ReturnManager';
import Dashboard from './components/Dashboard';
import CouponManager from './components/CouponManager';
import InventoryManager from './components/InventoryManager';
import AdminOrderDetail from './components/AdminOrderDetail';
import BarcodeManager from './components/BarcodeManager';
import SubscriptionGuard from './components/SubscriptionGuard';
import Settings from './components/Settings';
import StaffManager from './components/StaffManager';
import CMSManager from './components/CMSManager';
import ReportsManager from './components/ReportsManager';

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

// --- ADMIN LAYOUT COMPONENT ---
function AdminLayout({ user, onlineStatus }) {
  const location = useLocation();
  // Helper to highlight active menu item
  const isActive = (path) => location.pathname.includes(path);

  return (
    <div className="flex h-screen bg-slate-100 text-slate-900 font-sans">
      <aside className="w-64 bg-slate-900 text-white flex flex-col flex-shrink-0">
        <div className="p-6 border-b border-slate-700">
          <h1 className="text-2xl font-bold tracking-tight">Drushya Store</h1>
          <p className="text-xs text-slate-400 mt-1">Inventory & POS System</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {/* NOTE: Removed '/admin' prefix from all Links */}
          <Link to="/dashboard" className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive('dashboard') ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
            <LayoutDashboard className="w-5 h-5" /> Dashboard
          </Link>
          <Link to="/inventory" className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive('inventory') ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
            <Package className="w-5 h-5" /> Inventory
          </Link>
          <Link to="/billing" className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive('billing') ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
            <ShoppingCart className="w-5 h-5" /> Billing / POS
          </Link>
          <Link to="/orders" className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive('orders') ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
            <ClipboardList className="w-5 h-5" /> Orders
          </Link>
          <Link to="/returns" className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive('returns') ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
            <AlertTriangle className="w-5 h-5" /> Returns
          </Link>
          <Link to="/coupons" className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive('coupons') ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
            <Ticket className="w-5 h-5" /> Coupons
          </Link>
          <Link to="/customers" className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive('customers') ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
            <Users className="w-5 h-5" /> Customers
          </Link>
          <Link to="/vendors" className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive('vendors') ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
            <Truck className="w-5 h-5" /> Vendors
          </Link>
          <Link to="/categories" className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive('categories') ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
            <Tags className="w-5 h-5" /> Categories
          </Link>
          <Link to="/barcodes" className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive('barcodes') ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
            <Barcode className="w-5 h-5" /> Barcodes
          </Link>
          <Link to="/cms" className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive('cms') ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
            <LayoutTemplate className="w-5 h-5" /> Website Content
          </Link>
          <Link to="/staff" className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive('staff') ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
            <Users className="w-5 h-5" /> Staff
          </Link>
          <Link to="/reports" className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive('reports') ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
            <BarChart3 className="w-5 h-5" /> Reports
          </Link>
          <Link to="/settings" className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive('settings') ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
            <SettingsIcon className="w-5 h-5" /> Settings
          </Link>
        </nav>

        <div className="p-4 border-t border-slate-700">
          <div className={`flex items-center gap-2 text-sm ${onlineStatus ? 'text-emerald-400' : 'text-amber-400'}`}>
            {onlineStatus ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            {onlineStatus ? 'Online' : 'Offline Mode'}
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}

// --- MAIN ROUTER ---
export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true); 
  const [onlineStatus, setOnlineStatus] = useState(navigator.onLine);

  useEffect(() => {
    if (!auth) {
        setAuthLoading(false);
        return;
    }

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
      } else {
        setUser(null);
      }
      setAuthLoading(false);
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
                  <p className="text-slate-500 font-medium">Loading Software...</p>
              </div>
          </div>
      );
  }

  // --- SECURITY WRAPPER ---
  const RequireAuth = () => {
    if (!user) return <Navigate to="/login" replace />;
    
    return (
      <SubscriptionGuard db={db} user={user} functions={functions}>
        <AdminLayout user={user} onlineStatus={onlineStatus} />
      </SubscriptionGuard>
    );
  };

  return (
    <BrowserRouter>
      <Routes>
        
        {/* PUBLIC ROUTE: Admin Login */}
        <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <AdminLogin />} />

        {/* PROTECTED ADMIN ROUTES */}
        {/* Notice we removed the "/admin" path wrapper and placed it directly at the root */}
        <Route path="/" element={<RequireAuth />}>
          
          <Route index element={<Navigate to="/dashboard" replace />} />
          
          {/* Exact routes from your provided snippet */}
          <Route path="dashboard" element={<Dashboard db={db} user={user}/>} />
          <Route path="categories" element={<CategoryManager db={db} />} />
          <Route path="billing" element={<BillingManager db={db} user={user} />} />
          <Route path="orders" element={<OrderManager db={db} />} />
          <Route path="returns" element={<ReturnManager db={db} user={user} />} />
          <Route path="customers" element={<CustomerManager db={db} />} />
          <Route path="vendors" element={<VendorManager db={db} />} />
          <Route path="coupons" element={<CouponManager db={db} />} />
          <Route path="inventory" element={<InventoryManager db={db} user={user} />} />
          <Route path="order/:orderId" element={<AdminOrderDetail db={db} />} />
          <Route path="barcodes" element={<BarcodeManager db={db} />} />
          <Route path="settings" element={<Settings db={db} />} />
          <Route path="staff" element={<StaffManager db={db} user={user} functions={functions} />} />
          <Route path="reports" element={<ReportsManager db={db} user={user} />} />
          <Route path="cms" element={<CMSManager db={db} />} />

        </Route>

        {/* Fallback for unknown URLs */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />

      </Routes>
    </BrowserRouter>
  );
}