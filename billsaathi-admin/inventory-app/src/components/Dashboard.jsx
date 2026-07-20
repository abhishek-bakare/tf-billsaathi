import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, orderBy, where } from 'firebase/firestore';
import { getAuth } from 'firebase/auth'; // Added to fetch user if prop is missing
import { 
  TrendingUp, Users, ShoppingBag, AlertCircle, Wallet, Globe, Store, RotateCcw,
  Package, Truck, Tags, Calendar, Clock, Lock, RefreshCw, AlertTriangle, Info
} from 'lucide-react';

export default function Dashboard({ db, user }) {
  const [stats, setStats] = useState({
    netRevenue: 0,
    onlineSales: 0,
    offlineSales: 0,
    totalOrders: 0,
    totalDue: 0,
    totalReturns: 0,
    totalRefunded: 0,
    lowStockCount: 0,
    totalProducts: 0,
    totalCustomers: 0,
    totalVendors: 0,
    totalCategories: 0
  });
  const [lowStockItems, setLowStockItems] = useState([]);
  const [todayOrders, setTodayOrders] = useState([]);
  const [yesterdayOrders, setYesterdayOrders] = useState([]);
  const [dueCustomers, setDueCustomers] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [permissionError, setPermissionError] = useState(false);
  const [debugMsg, setDebugMsg] = useState('');
  const [generalError, setGeneralError] = useState('');
  
  // Debug State
  const [collectionPathDebug, setCollectionPathDebug] = useState('');

  // Fallback: If 'user' prop is missing (due to App.jsx route), get directly from Auth
  const auth = getAuth();
  const activeUser = user || auth.currentUser;

  const fetchData = async () => {
    setLoading(true);
    setPermissionError(false);
    setDebugMsg('');
    setGeneralError('');
    
    // Set debug path immediately to see what we are trying to access
    const isCanvas = typeof __app_id !== 'undefined';
    const getPath = (col) => isCanvas ? `artifacts/${__app_id}/public/data/${col}` : col;
    setCollectionPathDebug(getPath('orders'));

    if (!db || !activeUser) {
        // If user is missing, we stop here, but the UI will show "NULL" in debug footer
        setLoading(false);
        return;
    }

    try {
      // Helper to handle fetches with strict permission checking
      const secureGetDocs = async (queryRef, context) => {
        try {
            return await getDocs(queryRef);
        } catch (e) {
            console.error(`${context} Fetch Fail:`, e);
            if (e.code === 'permission-denied') throw e;
            setGeneralError(prev => prev + `${context}: ${e.message}. `);
            return { size: 0, docs: [], forEach: () => {} };
        }
      };

      // --- 1. ORDERS & REVENUE ---
      const ordersRef = collection(db, getPath('orders'));
      const allOrdersSnap = await secureGetDocs(ordersRef, "Orders");
      
      let online = 0, offline = 0, due = 0;
      const todayList = [], yesterdayList = [];
      const today = new Date(); today.setHours(0,0,0,0);
      const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
      const endYesterday = new Date(today);

      allOrdersSnap.forEach((doc) => {
        const data = doc.data();
        
        const isFailedOrCancelled = (data.status || '').toLowerCase().includes('failed') || (data.status || '').toLowerCase() === 'cancelled';
        const isPendingOnlinePayment = data.source === 'online' && data.paymentMethod === 'Online' && data.status === 'New';

        if (!isFailedOrCancelled && !isPendingOnlinePayment) {
            const paid = Number(data.paidAmount || 0);
            if (data.source === 'online') online += paid;
            else offline += paid;
        }
        
        if (!isFailedOrCancelled) due += Number(data.dueAmount || 0);

        if (data.date?.seconds) {
          const orderDate = new Date(data.date.seconds * 1000);
          if (orderDate >= today) todayList.push({ id: doc.id, ...data });
          else if (orderDate >= yesterday && orderDate < endYesterday) yesterdayList.push({ id: doc.id, ...data });
        }
      });

      // --- 2. RETURNS ---
      const returnsSnap = await secureGetDocs(collection(db, getPath('returns')), "Returns");
      let refunds = 0;
      returnsSnap.forEach((doc) => refunds += Number(doc.data().refundAmount || 0));

      // --- 3. PRODUCTS (Low Stock) ---
      const prodSnap = await secureGetDocs(collection(db, getPath('products')), "Products");
      let lowStock = 0;
      const lowItems = [];
      prodSnap.forEach(doc => {
          const p = doc.data();
          p.variants?.forEach(v => {
          if (Number(v.stock) < 5) {
              lowStock++;
              if (lowItems.length < 5) lowItems.push({ name: p.name, variant: `${v.color}/${v.size}`, stock: v.stock });
          }
          });
      });

      // --- 4. OTHER COUNTS ---
      const custQuery = query(collection(db, getPath('customers')), where('total_due_amount', '>', 0));
      
      const [custSnap, websiteUsersSnap, vendSnap, catSnap, dueCustSnap] = await Promise.all([
          secureGetDocs(collection(db, getPath('customers')), "Customers"),
          secureGetDocs(collection(db, getPath('website_users')), "Web Users"),
          secureGetDocs(collection(db, getPath('vendors')), "Vendors"),
          secureGetDocs(collection(db, getPath('categories')), "Categories"),
          secureGetDocs(custQuery, "Due Customers")
      ]);

      const dueCustList = dueCustSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const totalCustomers = custSnap.size + websiteUsersSnap.size;

      // Update State
      setStats({
        netRevenue: (online + offline) - refunds,
        onlineSales: online, offlineSales: offline,
        totalOrders: allOrdersSnap.size, totalDue: due,
        totalReturns: returnsSnap.size, totalRefunded: refunds,
        lowStockCount: lowStock,
        totalProducts: prodSnap.size, 
        totalCustomers: totalCustomers,
        totalVendors: vendSnap.size, totalCategories: catSnap.size
      });
      
      const sortTime = (a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0);
      setTodayOrders(todayList.sort(sortTime));
      setYesterdayOrders(yesterdayList.sort(sortTime));
      setDueCustomers(dueCustList.sort((a,b) => b.total_due_amount - a.total_due_amount)); 
      setLowStockItems(lowItems);

    } catch (error) {
      console.error("Dashboard Fatal Error:", error);
      setDebugMsg(error.message);
      if (error.code === 'permission-denied') {
          setPermissionError(true);
      } else {
          setGeneralError(error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const timer = setTimeout(() => setLoading(false), 5000);
    return () => clearTimeout(timer);
  }, [db, activeUser]);

  if (loading) {
      return (
          <div className="flex h-full items-center justify-center text-slate-500 gap-2">
               Loading Dashboard...
          </div>
      );
  }

  if (permissionError) {
      return (
          <div className="flex h-full items-center justify-center bg-slate-50 p-4">
              <div className="bg-white p-8 rounded-2xl shadow-lg border border-red-100 text-center max-w-md">
                  <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Lock className="w-8 h-8" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-800 mb-2">Access Denied</h2>
                  <p className="text-slate-600 mb-4 text-sm">
                      Your email (<strong>{activeUser?.email}</strong>) is not authorized.
                  </p>
                  <p className="text-xs text-red-500 bg-red-50 p-2 rounded border border-red-100 mb-4 text-left overflow-auto max-h-20">{debugMsg}</p>
                  <button onClick={fetchData} className="mt-4 text-blue-600 hover:underline text-sm flex items-center justify-center gap-1 w-full">
                      <RefreshCw className="w-4 h-4"/> Retry
                  </button>
              </div>
          </div>
      );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 p-8 overflow-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Business Overview</h1>
        <div className="flex items-center gap-3">
            <button onClick={fetchData} className="p-2 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-blue-600 hover:border-blue-200 transition-colors" title="Refresh Data">
                <RefreshCw className="w-4 h-4" />
            </button>
            <div className="text-sm text-slate-500 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
        </div>
      </div>
      
      {/* ERROR BANNER */}
      {generalError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-3 text-sm">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span><strong>Data Load Error:</strong> {generalError}</span>
          </div>
      )}

      {/* --- ROW 1: FINANCIALS --- */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-100 text-emerald-600 rounded-lg"><TrendingUp className="w-6 h-6" /></div>
          <div><p className="text-sm text-slate-500 font-medium">Net Revenue</p><p className="text-2xl font-bold text-slate-900">₹{stats.netRevenue.toLocaleString()}</p></div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center gap-2">
            <div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2 text-slate-600"><Globe className="w-4 h-4"/> Online</span><span className="font-bold text-blue-600">₹{stats.onlineSales.toLocaleString()}</span></div>
            <div className="w-full h-px bg-slate-100"></div>
            <div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2 text-slate-600"><Store className="w-4 h-4"/> Offline</span><span className="font-bold text-slate-700">₹{stats.offlineSales.toLocaleString()}</span></div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-rose-100 text-rose-600 rounded-lg"><RotateCcw className="w-6 h-6" /></div>
          <div><p className="text-sm text-slate-500 font-medium">Returns</p><p className="text-2xl font-bold text-rose-600">₹{stats.totalRefunded.toLocaleString()}</p><p className="text-[10px] text-slate-400">{stats.totalReturns} items returned</p></div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-100 text-amber-600 rounded-lg"><Wallet className="w-6 h-6" /></div>
          <div><p className="text-sm text-slate-500 font-medium">Pending Dues</p><p className="text-2xl font-bold text-slate-800">₹{stats.totalDue.toLocaleString()}</p></div>
        </div>
      </div>

      {/* --- ROW 2: OPERATIONS --- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-6 mb-8">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center text-center"><div className="p-2 bg-blue-50 text-blue-600 rounded-full mb-2"><ShoppingBag className="w-5 h-5"/></div><p className="text-2xl font-bold text-slate-800">{stats.totalOrders}</p><p className="text-xs text-slate-500 font-medium uppercase">Total Orders</p></div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center text-center"><div className="p-2 bg-purple-50 text-purple-600 rounded-full mb-2"><Package className="w-5 h-5"/></div><p className="text-2xl font-bold text-slate-800">{stats.totalProducts}</p><p className="text-xs text-slate-500 font-medium uppercase">Products</p></div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center text-center"><div className="p-2 bg-indigo-50 text-indigo-600 rounded-full mb-2"><Users className="w-5 h-5"/></div><p className="text-2xl font-bold text-slate-800">{stats.totalCustomers}</p><p className="text-xs text-slate-500 font-medium uppercase">Customers</p></div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center text-center"><div className="p-2 bg-orange-50 text-orange-600 rounded-full mb-2"><Truck className="w-5 h-5"/></div><p className="text-2xl font-bold text-slate-800">{stats.totalVendors}</p><p className="text-xs text-slate-500 font-medium uppercase">Vendors</p></div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center text-center"><div className="p-2 bg-pink-50 text-pink-600 rounded-full mb-2"><Tags className="w-5 h-5"/></div><p className="text-2xl font-bold text-slate-800">{stats.totalCategories}</p><p className="text-xs text-slate-500 font-medium uppercase">Categories</p></div>
      </div>

      {/* --- ROW 3: DETAILED LISTS --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* TODAY'S SALES */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-96">
          <div className="p-4 border-b border-slate-200 bg-emerald-50 flex justify-between items-center">
            <h3 className="font-bold text-emerald-800 flex items-center gap-2"><Calendar className="w-4 h-4"/> Today's Sales</h3>
            <span className="text-xs font-bold bg-white text-emerald-600 px-2 py-1 rounded-full">{todayOrders.length} Orders</span>
          </div>
          <div className="overflow-y-auto flex-1 p-2">
             {todayOrders.length === 0 ? <div className="text-center text-slate-400 py-10 text-sm">No sales yet today.</div> : (
               <table className="w-full text-left text-xs">
                 <tbody className="divide-y divide-slate-100">
                   {todayOrders.map(order => (
                     <tr key={order.id} className="hover:bg-slate-50">
                       <td className="p-3">
                         <div className="font-bold text-slate-700">{order.customerName}</div>
                         <div className="text-[10px] text-slate-400 flex items-center gap-1">
                           <Clock className="w-3 h-3"/> {new Date(order.date.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                         </div>
                       </td>
                       <td className="p-3 text-right">
                         <div className="font-bold text-slate-900">₹{order.grandTotal}</div>
                         <span className="text-[10px] text-emerald-600 font-medium">{order.status}</span>
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             )}
          </div>
          <div className="p-3 border-t border-slate-200 bg-slate-50 text-right text-sm font-bold text-slate-700">
             Total: ₹{todayOrders.reduce((sum, o) => {
                 if (o.status === 'Payment Failed' || o.status === 'Cancelled') return sum;
                 if (o.source === 'online' && o.paymentMethod === 'Online' && o.status === 'New') return sum;
                 return sum + Number(o.grandTotal || 0);
             }, 0).toLocaleString()}
          </div>
        </div>

        {/* YESTERDAY'S SALES */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-96">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
            <h3 className="font-bold text-slate-700 flex items-center gap-2"><Calendar className="w-4 h-4 text-slate-400"/> Yesterday</h3>
            <span className="text-xs font-bold bg-white text-slate-600 px-2 py-1 rounded-full">{yesterdayOrders.length} Orders</span>
          </div>
          <div className="overflow-y-auto flex-1 p-2">
             {yesterdayOrders.length === 0 ? <div className="text-center text-slate-400 py-10 text-sm">No sales yesterday.</div> : (
               <table className="w-full text-left text-xs">
                 <tbody className="divide-y divide-slate-100">
                   {yesterdayOrders.map(order => (
                     <tr key={order.id} className="hover:bg-slate-50">
                       <td className="p-3">
                         <div className="font-bold text-slate-700">{order.customerName}</div>
                         <div className="text-[10px] text-slate-400">{new Date(order.date.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                       </td>
                       <td className="p-3 text-right">
                         <div className="font-bold text-slate-900">₹{order.grandTotal}</div>
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             )}
          </div>
           <div className="p-3 border-t border-slate-200 bg-slate-50 text-right text-sm font-bold text-slate-700">
             Total: ₹{yesterdayOrders.reduce((sum, o) => sum + Number(o.grandTotal || 0), 0).toLocaleString()}
          </div>
        </div>

        {/* PENDING DUES CUSTOMERS */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-96">
          <div className="p-4 border-b border-slate-200 bg-amber-50 flex justify-between items-center">
            <h3 className="font-bold text-amber-800 flex items-center gap-2"><Wallet className="w-4 h-4"/> Pending Dues</h3>
            <span className="text-xs font-bold bg-white text-amber-600 px-2 py-1 rounded-full">{dueCustomers.length} Customers</span>
          </div>
          <div className="overflow-y-auto flex-1 p-2">
             {dueCustomers.length === 0 ? <div className="text-center text-slate-400 py-10 text-sm">No pending dues!</div> : (
               <table className="w-full text-left text-xs">
                 <thead className="bg-slate-50 text-slate-500"><tr><th className="p-2">Customer</th><th className="p-2 text-right">Due Amount</th></tr></thead>
                 <tbody className="divide-y divide-slate-100">
                   {dueCustomers.map(c => (
                     <tr key={c.id} className="hover:bg-slate-50">
                       <td className="p-3 font-medium text-slate-700">{c.name} <span className="text-slate-400 text-[10px] block">{c.mobile}</span></td>
                       <td className="p-3 text-right font-bold text-red-600">₹{c.total_due_amount}</td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             )}
          </div>
        </div>
      </div>

      {/* --- ROW 4: LOW STOCK (Full Width) --- */}
      <div className="mt-8 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center"><h3 className="font-bold text-rose-700 flex items-center gap-2"><AlertCircle className="w-4 h-4" /> Low Stock Alerts ({stats.lowStockCount})</h3></div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500"><tr><th className="p-3 font-medium">Product</th><th className="p-3 font-medium">Variant</th><th className="p-3 font-medium">Stock</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                {lowStockItems.length === 0 ? (<tr><td colSpan={3} className="p-6 text-center text-slate-400">All stock levels are healthy!</td></tr>) : lowStockItems.map((item, i) => (
                    <tr key={i}><td className="p-3 font-medium text-slate-800">{item.name}</td><td className="p-3 text-slate-500">{item.variant}</td><td className="p-3 text-rose-600 font-bold">{item.stock}</td></tr>
                ))}
                </tbody>
            </table>
          </div>
      </div>
    </div>
  );
}