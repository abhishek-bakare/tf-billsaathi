import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  updateProfile, 
  signOut,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions'; 
import { doc, setDoc, getDoc, serverTimestamp, deleteDoc } from 'firebase/firestore'; 
import { Loader2, AlertCircle, Phone, Mail, CheckCircle, User, Lock, ArrowRight, ShieldCheck } from 'lucide-react';

// ⚠️ STEP 1: For Production, run 'npm install react-google-recaptcha' and uncomment the line below:
// import ReCAPTCHA from "react-google-recaptcha"; 

export default function CustomerAuth({ auth, db, functions }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const rawRedirect = searchParams.get('redirect');
  const redirect = rawRedirect ? (rawRedirect.startsWith('/') ? rawRedirect : `/${rawRedirect}`) : '/';

  const isSignupRoute = location.pathname.includes('signup');
  const [authMethod, setAuthMethod] = useState('email'); 
  const [view, setView] = useState('main'); 
  const [isLogin, setIsLogin] = useState(!isSignupRoute);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  
  // Captcha State
  const [captchaToken, setCaptchaToken] = useState(null);
  const recaptchaRef = useRef(null);

  const [formData, setFormData] = useState({
    name: '', email: '', password: '', phone: '', otp: ''
  });

  // Sync view
  useEffect(() => {
    if (view.includes('verify')) return;
    const isSignup = location.pathname.includes('signup');
    setView('main');
    setIsLogin(!isSignup);
    setError('');
    setSuccessMsg('');
    setCaptchaToken(null); 
  }, [location.pathname]);

  // Clear captcha on method change
  useEffect(() => {
    setCaptchaToken(null);
    return () => {
        if (window.recaptchaVerifier) {
            try { window.recaptchaVerifier.clear(); } catch(e) {}
            window.recaptchaVerifier = null;
        }
    };
  }, [authMethod]);

  // --- HELPER: FRIENDLY ERROR MESSAGES ---
  const getFriendlyErrorMessage = (errorCode, rawMessage) => {
    // Handle Cloud Function Internal Errors specially
    if (errorCode === 'functions/internal' || errorCode === 'internal') {
        // If message is generic "INTERNAL", it's a server crash/config issue
        if (rawMessage === 'INTERNAL') {
             return "Server Error: The backend function failed. Admin: Check Firebase Console > Functions > Logs for details (e.g., missing API Key or Template).";
        }
        return rawMessage;
    }

    if (rawMessage && rawMessage.includes("Failed to send OTP email")) {
        return "System Error: Unable to send verification email. Please try again later.";
    }

    switch (errorCode) {
      case 'auth/invalid-email': return "Invalid email address.";
      case 'auth/user-not-found': return "No account found. Please sign up.";
      case 'auth/wrong-password': return "Incorrect password.";
      case 'auth/invalid-credential': return "Invalid credentials.";
      case 'auth/email-already-in-use': return "Email already registered.";
      case 'auth/weak-password': return "Password too weak.";
      case 'auth/invalid-phone-number': return "Invalid phone number.";
      case 'auth/code-expired': return "OTP expired. Resend code.";
      case 'auth/invalid-verification-code': return "Incorrect OTP.";
      case 'auth/invalid-app-credential': return "Domain configuration error.";
      case 'auth/network-request-failed': return "Network error. Please check your connection.";
      default: return rawMessage || "Something went wrong.";
    }
  };

  // Setup Phone Auth Invisible Recaptcha
  const setupPhoneRecaptcha = () => {
    if (window.recaptchaVerifier) {
        try { window.recaptchaVerifier.clear(); } catch(e) {}
        window.recaptchaVerifier = null;
    }
    const container = document.getElementById('recaptcha-container');
    if (container) container.innerHTML = ''; 

    try {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
            'size': 'invisible',
            'callback': () => console.log("Phone Recaptcha Verified"),
            'expired-callback': () => {
                setError("Security check expired. Please try again.");
                setLoading(false);
            }
        });
    } catch (err) {
        console.error("Recaptcha Setup Failed:", err);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleCaptchaChange = (token) => {
      setCaptchaToken(token);
      setError('');
  };

  // --- EMAIL AUTH ---
  const handleEmailAuth = async (e) => {
    e.preventDefault();
    if (!captchaToken) return setError("Please verify you are not a robot."); 
    
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        // --- SECURE LOGIN ---
        const userCred = await signInWithEmailAndPassword(auth, formData.email, formData.password);
        
        // 🛡️ SECURITY FIX: Enforce Email Verification
        if (!userCred.user.emailVerified) {
             await signOut(auth); // Immediately logout
             throw new Error("Email not verified. Please verify your email to login.");
        }

        navigate(redirect);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
        const user = userCredential.user;
        
        try {
            await updateProfile(user, { displayName: formData.name });
            if (!functions) throw new Error("Backend connection failed.");
            
            // Pass captcha token to backend if you want server-side verification later
            const sendEmailOTP = httpsCallable(functions, 'sendEmailOTP');
            await sendEmailOTP({ email: formData.email, name: formData.name, captchaToken });

            if (db) {
                const collectionName = (typeof __app_id !== 'undefined') ? `artifacts/${__app_id}/public/data/website_users` : 'website_users';
                await setDoc(doc(db, collectionName, user.uid), {
                    name: formData.name,
                    email: formData.email,
                    phone: formData.phone || '', 
                    createdAt: serverTimestamp(),
                    source: 'online_email'
                });
            }
            setView('verify-email-otp');
            setSuccessMsg(`OTP sent to ${formData.email}`);

        } catch (innerError) {
            // Rollback if backend fails
            await user.delete().catch(() => {});
            if (db) {
                const collectionName = (typeof __app_id !== 'undefined') ? `artifacts/${__app_id}/public/data/website_users` : 'website_users';
                await deleteDoc(doc(db, collectionName, user.uid)).catch(() => {});
            }
            throw innerError;
        }
      }
    } catch (err) {
      console.error("Auth Error:", err);
      // If it's our custom error, show it directly, else use helper
      const message = err.message === "Email not verified. Please verify your email to login." 
          ? err.message 
          : getFriendlyErrorMessage(err.code, err.message);
      setError(message);
    }
    setLoading(false);
  };

  // --- PHONE AUTH ---
  const handlePhoneAuthStart = async (e) => {
    e.preventDefault();
    setError('');
    
    const safePhone = formData.phone || '';
    const phoneNumber = safePhone.startsWith('+') ? safePhone : `+91${safePhone}`;
    
    if (phoneNumber.length < 10) return setError("Invalid phone number format.");
    if (!isLogin && (!formData.name || !formData.email)) return setError("Please fill all fields.");

    setLoading(true);
    try {
        setupPhoneRecaptcha();
        const appVerifier = window.recaptchaVerifier;
        const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
        window.confirmationResult = confirmationResult;
        
        setView('verify-phone-otp');
        setSuccessMsg(`Code sent to ${phoneNumber}`);
    } catch (err) {
        handleAuthError(err);
        if (window.recaptchaVerifier) window.recaptchaVerifier.clear();
    }
    setLoading(false);
  };

  const handleVerifyEmailOTP = async (e) => {
      e.preventDefault(); setLoading(true); setError('');
      try {
          const verifyEmailOTP = httpsCallable(functions, 'verifyEmailOTP');
          await verifyEmailOTP({ otp: formData.otp });
          await auth.currentUser.reload();
          setSuccessMsg("Email Verified Successfully!");
          setTimeout(() => navigate(redirect), 1000);
      } catch (err) { setError(getFriendlyErrorMessage(err.code, err.message) || "Invalid OTP"); }
      setLoading(false);
  };

  const handleVerifyPhoneOtp = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
        const result = await window.confirmationResult.confirm(formData.otp);
        const user = result.user;
        if (db) {
            const collectionName = (typeof __app_id !== 'undefined') ? `artifacts/${__app_id}/public/data/website_users` : 'website_users';
            const userDoc = await getDoc(doc(db, collectionName, user.uid));
            if (!userDoc.exists() || !isLogin) {
                await setDoc(doc(db, collectionName, user.uid), {
                    name: formData.name || 'Mobile User', email: formData.email || '', phone: user.phoneNumber, createdAt: serverTimestamp(), source: 'online_phone'
                }, { merge: true });
                if(formData.name) await updateProfile(user, { displayName: formData.name });
            }
        }
        navigate(redirect);
    } catch (err) { setError("Invalid OTP."); }
    setLoading(false);
  };

  const handleForgotPassword = async (e) => {
      e.preventDefault(); setLoading(true); setError('');
      try {
          const actionCodeSettings = {
             url: window.location.origin + '/reset-password',
             handleCodeInApp: true,
          };
          await sendPasswordResetEmail(auth, formData.email, actionCodeSettings);
          setSuccessMsg("Reset link sent to email.");
          setTimeout(() => { setView('main'); setIsLogin(true); }, 5000);
      } catch (err) { handleAuthError(err); }
      setLoading(false);
  };

  const handleAuthError = (err) => setError(getFriendlyErrorMessage(err.code, err.message));
  const handleToggleMode = () => { navigate((isLogin ? '/signup' : '/login') + (rawRedirect ? `?redirect=${rawRedirect}` : '')); };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12 font-sans">
      <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 w-full max-w-md relative overflow-hidden">
        
        {/* Invisible Container for Phone Auth */}
        <div id="recaptcha-container"></div>

        <div className="text-center mb-6">
          <h1 className="text-3xl font-extrabold text-slate-900 mb-2 tracking-tight">
            {view === 'forgot-password' ? 'Reset Password' : view.includes('verify') ? 'Verify Code' : isLogin ? 'Welcome Back' : 'Create Account'}
          </h1>
          <p className="text-slate-500 text-sm">
             {view === 'forgot-password' ? 'Enter email to reset password' : view.includes('verify') ? 'Enter the code sent to you' : isLogin ? 'Login to manage your orders' : 'Start your shopping journey'}
          </p>
        </div>

        {error && <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl flex items-start gap-3"><AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" /> <span className="leading-snug">{error}</span></div>}
        {successMsg && <div className="mb-6 p-4 bg-emerald-50 border border-emerald-100 text-emerald-600 text-sm rounded-lg flex items-center gap-2"><CheckCircle className="w-4 h-4" /> {successMsg}</div>}

        {view === 'forgot-password' && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label><input name="email" type="email" required className="w-full border p-2 rounded-lg" value={formData.email} onChange={handleChange} /></div>
                <button disabled={loading} className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl">{loading ? 'Sending...' : 'Send Reset Link'}</button>
                <button type="button" onClick={() => { setView('main'); setIsLogin(true); }} className="w-full text-slate-500 text-sm hover:underline">Back to Login</button>
            </form>
        )}

        {view.includes('verify') && (
             <form onSubmit={view === 'verify-email-otp' ? handleVerifyEmailOTP : handleVerifyPhoneOtp} className="space-y-6">
                 <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1 text-center">Enter OTP</label><input name="otp" type="text" autoFocus required maxLength="6" className="w-full border border-slate-300 rounded-xl py-4 text-center text-2xl tracking-[0.5em] font-bold outline-none focus:ring-2 focus:ring-blue-500" value={formData.otp} onChange={handleChange} /></div>
                 <button disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl">{loading ? <Loader2 className="animate-spin w-5 h-5 mx-auto"/> : 'Verify & Login'}</button>
             </form>
        )}

        {view === 'main' && (
            <>
                <div className="flex bg-slate-100 p-1 rounded-lg mb-6">
                    <button type="button" onClick={() => setAuthMethod('email')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${authMethod === 'email' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Mail className="w-4 h-4" /> Email</button>
                    <button type="button" onClick={() => setAuthMethod('phone')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${authMethod === 'phone' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Phone className="w-4 h-4" /> Mobile</button>
                </div>

                {authMethod === 'email' ? (
                    <form className="space-y-4" onSubmit={handleEmailAuth}>
                        {!isLogin && <div><label className="block text-sm text-slate-700 mb-1">Full Name</label><div className="relative"><User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400"/><input name="name" required className="w-full border border-slate-300 rounded-xl py-3 pl-10" value={formData.name} onChange={handleChange} placeholder="John Doe" /></div></div>}
                        <div><label className="block text-sm text-slate-700 mb-1">Email</label><div className="relative"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400"/><input name="email" type="email" required className="w-full border border-slate-300 rounded-xl py-3 pl-10" value={formData.email} onChange={handleChange} placeholder="name@example.com" /></div></div>
                        <div><label className="block text-sm text-slate-700 mb-1">Password</label><div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400"/><input name="password" type="password" required className="w-full border border-slate-300 rounded-xl py-3 pl-10" value={formData.password} onChange={handleChange} placeholder="••••••••" /></div></div>
                        
                        {/* ⚠️ STEP 2: Configure ReCAPTCHA */}
                        {/* <div className="flex justify-center my-4">
                            <ReCAPTCHA
                                sitekey="PASTE_YOUR_GOOGLE_RECAPTCHA_SITE_KEY_HERE"
                                onChange={handleCaptchaChange}
                            />
                        </div> */}

                        {/* Mock Captcha (Remove this when real key is added) */}
                        <div className="flex justify-center my-4">
                            <label className="flex items-center gap-2 p-3 bg-gray-50 border rounded cursor-pointer select-none transition-colors hover:bg-gray-100">
                                <input type="checkbox" className="w-5 h-5 accent-blue-600" onChange={(e) => handleCaptchaChange(e.target.checked ? "verified_mock_token" : null)} />
                                <span className="text-sm text-slate-600 font-medium">I am not a robot</span>
                            </label>
                        </div>

                        <button 
                            disabled={loading || !captchaToken} 
                            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-xl flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-slate-200"
                        >
                            {loading ? <Loader2 className="animate-spin w-5 h-5"/> : (
                                <>{isLogin ? 'Sign In' : 'Create Account'} <ArrowRight className="w-5 h-5" /></>
                            )}
                        </button>
                    </form>
                ) : (
                     <form className="space-y-4" onSubmit={handlePhoneAuthStart}>
                        {!isLogin && <><div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Full Name</label><input name="name" className="w-full border border-slate-300 rounded-xl py-3 px-4" value={formData.name} onChange={handleChange} required placeholder="John Doe" /></div><div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email</label><input name="email" className="w-full border border-slate-300 rounded-xl py-3 px-4" value={formData.email} onChange={handleChange} required placeholder="name@example.com" /></div></>}
                        <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Mobile Number</label><div className="flex"><span className="bg-slate-100 border border-r-0 border-slate-300 rounded-l-xl px-3 py-3 text-slate-600 font-bold flex items-center">+91</span><input name="phone" type="tel" required className="flex-1 border border-slate-300 rounded-r-xl px-3 py-3" placeholder="9876543210" value={(formData.phone || '').replace('+91', '')} onChange={handleChange} /></div></div>
                        <button disabled={loading} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-xl flex justify-center items-center gap-2 mt-2 shadow-lg shadow-slate-200">{loading ? <Loader2 className="animate-spin w-5 h-5"/> : <>{'Send Code'} <ArrowRight className="w-5 h-5" /></>}</button>
                     </form>
                )}

                <div className="mt-6 text-center text-sm font-medium text-slate-600">
                    {isLogin ? "Don't have an account? " : "Already have an account? "}
                    <button onClick={handleToggleMode} className="text-blue-600 font-bold hover:underline ml-1">
                        {isLogin ? 'Sign Up' : 'Log In'}
                    </button>
                </div>
            </>
        )}
      </div>
    </div>
  );
}