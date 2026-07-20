import React, { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { signInWithCustomToken, signInWithEmailAndPassword, getAuth } from 'firebase/auth'; 
import { Lock, CheckCircle, Loader2, Key, AlertTriangle, User, ShieldCheck } from 'lucide-react';

export default function SubscriptionGuard({ db, user, functions, children }) {
  const [loading, setLoading] = useState(true);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [expiryDate, setExpiryDate] = useState(null);
  
  // UI States
  const [mode, setMode] = useState('login'); // 'login' or 'activate'
  
  // Form Data
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  // 1. Check Subscription Status (Real-time)
  useEffect(() => {
    if (!db) return;

    const collectionPath = (typeof __app_id !== 'undefined') ? `artifacts/${__app_id}/public/data/settings` : 'settings';
    
    const unsub = onSnapshot(doc(db, collectionPath, 'subscription'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const validUntil = data.validUntil?.toDate();
        
        setExpiryDate(validUntil);

        if (validUntil && validUntil > new Date()) {
          setIsSubscribed(true);
          // Default to login if sub is valid but user logged out
          if (!user) setMode('login'); 
        } else {
          setIsSubscribed(false); // Expired
          setMode('activate'); // Default to activate if expired
        }
      } else {
        // No doc means fresh install -> Not subscribed
        setIsSubscribed(false);
        setMode('activate');
      }
      setLoading(false);
    }, (err) => {
        console.error("Sub check error:", err);
        setLoading(false);
    });

    return () => unsub();
  }, [db, user]);

  // 2. Handle Activation (Redeem Key + Create Admin)
  const handleActivate = async (e) => {
    e.preventDefault();
    if (!code) return setError("License Key is required.");
    
    setActionLoading(true);
    setError('');

    try {
        if (!functions) throw new Error("System unavailable. Please check connection.");
        
        const redeemFn = httpsCallable(functions, 'redeemLicense');
        // Pass email/pass so server can create user if needed
        const result = await redeemFn({ code, email, password });
        
        // Auto-Login with the token returned by server (if new account created)
        if (result.data.customToken) {
            const auth = getAuth();
            await signInWithCustomToken(auth, result.data.customToken);
        }
        
        alert(`Activation Successful! Plan valid until: ${new Date(result.data.newExpiry).toLocaleDateString()}`);
        setCode('');
        setPassword(''); // Clear sensitive data
        setMode('login'); // Switch to login after success
    } catch (err) {
        console.error(err);
        setError(err.message || "Activation Failed");
    }
    setActionLoading(false);
  };

  // 3. Handle Standard Login
  const handleLogin = async (e) => {
      e.preventDefault();
      if (!email || !password) return setError("Email and Password required.");
      
      setActionLoading(true);
      setError('');
      try {
          const auth = getAuth();
          await signInWithEmailAndPassword(auth, email, password);
          // If subscription is valid, the useEffect above will auto-unlock the screen
      } catch (err) {
          setError("Invalid Email or Password.");
      }
      setActionLoading(false);
  };

  if (loading) {
      return (
          <div className="h-screen flex items-center justify-center bg-slate-50">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
      );
  }

  // --- UNLOCKED STATE ---
  // Only show children if Subscribed AND User is Logged In
  if (isSubscribed && user) {
      return children;
  }

  // --- LOCKED / LOGIN SCREEN ---
  return (
    <div className="h-screen flex items-center justify-center bg-slate-900 px-4">
        <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-md w-full">
            <div className="text-center mb-6">
                <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    {mode === 'login' ? <User className="w-8 h-8"/> : <ShieldCheck className="w-8 h-8"/>}
                </div>
                <h1 className="text-2xl font-bold text-slate-800">
                    {mode === 'login' ? "Admin Login" : "Activate License"}
                </h1>
                <p className="text-slate-500 text-sm mt-1">
                    {mode === 'login' 
                        ? "Please login to access the dashboard." 
                        : "Enter your license key to setup or renew."}
                </p>
                {expiryDate && !isSubscribed && (
                    <p className="text-xs text-red-500 mt-2 font-bold">Plan expired on {expiryDate.toLocaleDateString()}</p>
                )}
            </div>

            {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg flex items-center gap-2 text-left">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
                </div>
            )}

            {/* TOGGLE TABS (Always Visible) */}
            <div className="flex bg-slate-100 p-1 rounded-lg mb-6">
                <button onClick={() => setMode('login')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === 'login' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>Login</button>
                <button onClick={() => setMode('activate')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === 'activate' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>Activate / Renew</button>
            </div>

            {mode === 'login' ? (
                 <form onSubmit={handleLogin} className="space-y-4">
                    <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email</label><input type="email" required className="w-full border p-2 rounded-lg" value={email} onChange={e => setEmail(e.target.value)} /></div>
                    <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Password</label><input type="password" required className="w-full border p-2 rounded-lg" value={password} onChange={e => setPassword(e.target.value)} /></div>
                    <button disabled={actionLoading} className="w-full bg-slate-900 text-white py-3 rounded-lg font-bold">{actionLoading ? 'Logging in...' : 'Access Dashboard'}</button>
                 </form>
            ) : (
                <form onSubmit={handleActivate} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">License Key</label>
                        <div className="relative">
                            <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input 
                                type="text" 
                                required
                                placeholder="XXXX-XXXX" 
                                className="w-full pl-9 p-2 border border-slate-300 rounded-lg font-mono uppercase"
                                value={code}
                                onChange={(e) => setCode(e.target.value.toUpperCase())}
                            />
                        </div>
                    </div>
                    
                    {/* Ask for Admin credentials if setting up new or not logged in */}
                    {!user && (
                        <>
                            <div className="text-xs text-slate-400 text-center my-2 border-t pt-2">- Setup Admin Account -</div>
                            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email</label><input type="email" required className="w-full border p-2 rounded-lg" value={email} onChange={e => setEmail(e.target.value)} /></div>
                            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Password</label><input type="password" required className="w-full border p-2 rounded-lg" value={password} onChange={e => setPassword(e.target.value)} /></div>
                        </>
                    )}

                    <button disabled={actionLoading} className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold">
                        {actionLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto"/> : 'Verify & Setup'}
                    </button>
                </form>
            )}
            
            <div className="mt-8 pt-6 border-t border-slate-100 text-xs text-slate-400">
                <p>Contact support to purchase a renewal key.</p>
            </div>
        </div>
    </div>
  );
}