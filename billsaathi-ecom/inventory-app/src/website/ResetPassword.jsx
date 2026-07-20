import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth';
import { Loader2, Lock, CheckCircle, AlertCircle } from 'lucide-react';

export default function ResetPassword({ auth }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  // Get the special code from the URL link
  const oobCode = searchParams.get('oobCode');

  const [newPassword, setNewPassword] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!auth || !oobCode) {
        setError("Invalid or missing reset link.");
        setLoading(false);
        return;
    }

    // Verify the code is valid before showing the form
    verifyPasswordResetCode(auth, oobCode)
      .then((email) => {
        setEmail(email);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError("This reset link is invalid or has expired. Please request a new one.");
        setLoading(false);
      });
  }, [auth, oobCode]);

  const handleReset = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) return setError("Password must be at least 6 characters.");
    
    setSubmitting(true);
    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      console.error(err);
      setError(err.message);
    }
    setSubmitting(false);
  };

  if (loading) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-slate-50">
              <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          </div>
      );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12 font-sans">
      <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 w-full max-w-md">
        
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Reset Password</h1>
          {email && <p className="text-sm text-slate-500">for {email}</p>}
        </div>

        {error ? (
          <div className="text-center">
            <div className="bg-red-50 text-red-700 p-4 rounded-xl mb-4 text-sm flex items-start gap-2">
               <AlertCircle className="w-5 h-5 flex-shrink-0" />
               <span className="text-left">{error}</span>
            </div>
            <button onClick={() => navigate('/login')} className="text-blue-600 font-bold hover:underline">Back to Login</button>
          </div>
        ) : success ? (
          <div className="text-center">
             <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                 <CheckCircle className="w-8 h-8" />
             </div>
             <h3 className="text-xl font-bold text-slate-800 mb-2">Password Reset!</h3>
             <p className="text-slate-500 text-sm mb-6">You can now login with your new password.</p>
             <button onClick={() => navigate('/login')} className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl">Go to Login</button>
          </div>
        ) : (
          <form onSubmit={handleReset} className="space-y-6">
            <div>
               <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">New Password</label>
               <div className="relative">
                 <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                 <input 
                   type="password" 
                   autoFocus
                   required
                   className="w-full border border-slate-300 rounded-xl py-3 pl-10 pr-4 outline-none focus:ring-2 focus:ring-blue-500 transition-all" 
                   placeholder="••••••••" 
                   value={newPassword}
                   onChange={(e) => setNewPassword(e.target.value)}
                 />
               </div>
            </div>
            <button disabled={submitting} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-xl flex justify-center items-center gap-2">
                {submitting ? <Loader2 className="animate-spin w-5 h-5"/> : 'Save New Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}