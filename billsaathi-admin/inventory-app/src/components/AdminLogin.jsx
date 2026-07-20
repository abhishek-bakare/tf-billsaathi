import React, { useState, useEffect } from 'react';
import { getAuth, signInWithEmailAndPassword, signInWithCustomToken } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Lock, Mail, Loader2, ShieldCheck, AlertCircle, Download, Info, User, Key } from 'lucide-react';

export default function AdminLogin() {
  // --- UI STATE ---
  const [mode, setMode] = useState('login'); // 'login' or 'activate'
  
  // --- FORM STATE ---
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // --- PWA INSTALL STATE ---
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  // Catch the install prompt from the browser safely
  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      try {
        e.preventDefault();
        setDeferredPrompt(e);
      } catch (err) {
        console.warn("PWA Event Error:", err);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  // Function to trigger the install popup safely
  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } catch (err) {
      console.error("Install Prompt Error:", err);
    }
  };

  // --- HANDLE STANDARD LOGIN ---
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const auth = getAuth();
      await signInWithEmailAndPassword(auth, email, password);
      // App.jsx router will detect user state change
    } catch (err) {
      console.error("Login Error:", err);
      setError("Invalid email or password. Access denied.");
    }
    setLoading(false);
  };

  // --- HANDLE LICENSE ACTIVATION ---
  const handleActivate = async (e) => {
    e.preventDefault();
    if (!code) return setError("License Key is required.");
    if (!email || !password) return setError("Admin Email and Password are required to setup.");
    
    setLoading(true);
    setError('');

    try {
        const functions = getFunctions();
        const redeemFn = httpsCallable(functions, 'redeemLicense');
        
        // Pass email/pass so server can create user if needed
        const result = await redeemFn({ code, email, password });
        
        // Auto-Login with the token returned by server (if new account created)
        const auth = getAuth();
        if (result.data.customToken) {
            await signInWithCustomToken(auth, result.data.customToken);
        } else {
            await signInWithEmailAndPassword(auth, email, password);
        }
        
        alert(`Activation Successful! Plan valid until: ${new Date(result.data.newExpiry).toLocaleDateString()}`);
    } catch (err) {
        console.error(err);
        setError(err.message || "Activation Failed. Check your key.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4 font-sans py-8">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 border border-slate-200">
        
        {/* HEADER */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
            {mode === 'login' ? <User className="w-8 h-8" /> : <ShieldCheck className="w-8 h-8" />}
          </div>
          <h1 className="text-2xl font-bold text-slate-800">
            {mode === 'login' ? "Admin Login" : "Activate License"}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {mode === 'login' 
              ? "Please login to access the dashboard." 
              : "Enter your license key to setup or renew."}
          </p>
        </div>

        {/* ERROR MESSAGE */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* TOGGLE TABS */}
        <div className="flex bg-slate-100 p-1 rounded-lg mb-6">
            <button 
              type="button"
              onClick={() => { setMode('login'); setError(''); }} 
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === 'login' ? 'bg-white shadow text-slate-900 font-bold' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Login
            </button>
            <button 
              type="button"
              onClick={() => { setMode('activate'); setError(''); }} 
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === 'activate' ? 'bg-white shadow text-slate-900 font-bold' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Activate / Renew
            </button>
        </div>

        {/* DYNAMIC FORM */}
        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-5 mb-8">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input 
                  type="email" 
                  required 
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder="admin@store.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input 
                  type="password" 
                  required 
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-70 mt-2 shadow-lg shadow-slate-200"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-5 h-5" />}
              {loading ? 'Authenticating...' : 'Secure Login'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleActivate} className="space-y-5 mb-8">
            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">License Key</label>
                <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input 
                        type="text" 
                        required
                        placeholder="XXXX-XXXX" 
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl font-mono uppercase focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                    />
                </div>
            </div>
            
            <div className="text-xs text-slate-400 text-center my-4 flex items-center gap-2">
               <span className="flex-1 h-px bg-slate-200"></span>
               Admin Credentials
               <span className="flex-1 h-px bg-slate-200"></span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input 
                  type="email" 
                  required 
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input 
                  type="password" 
                  required 
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-70 mt-2 shadow-lg shadow-blue-200"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
              {loading ? 'Verifying...' : 'Verify & Setup'}
            </button>
          </form>
        )}

        {/* --- INSTALL APP BUTTON OR FALLBACK --- */}
        <div className="pt-6 border-t border-slate-200">
          {deferredPrompt ? (
            <div>
              <button 
                onClick={handleInstallClick} 
                type="button"
                className="w-full bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                <Download className="w-5 h-5" />
                Install Desktop App
              </button>
              <p className="text-center text-xs text-slate-400 mt-2">
                Install this software on your device for faster access.
              </p>
            </div>
          ) : (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center">
              <div className="flex items-center justify-center gap-2 text-slate-600 font-semibold text-sm mb-1">
                <Info className="w-4 h-4" /> App Installation
              </div>
              <p className="text-xs text-slate-400">
                The automatic install button is hidden because the app is already installed, or you are using an unsupported browser/mode. <br className="hidden md:block"/>(Best viewed in Chrome or Edge).
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}