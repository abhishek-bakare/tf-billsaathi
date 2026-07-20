import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { updateProfile, updatePassword, signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions'; // Import for Cloud Function
import { User, MapPin, Phone, Mail, Save, Loader2, Wallet, CreditCard, Key, Trash2, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function UserProfile({ db, user, functions }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  
  // Wallet State
  const [walletBalance, setWalletBalance] = useState(0);

  // Form Data
  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    phone: '',
    
    // Shipping
    address: '', city: '', state: '', pincode: '',
    
    // Billing
    billingAddress: '', billingCity: '', billingState: '', billingPincode: ''
  });

  const [sameAsShipping, setSameAsShipping] = useState(false);

  // Password State
  const [passData, setPassData] = useState({ newPassword: '', confirmPassword: '' });
  const [passLoading, setPassLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    if (!user || !db) return;

    const fetchProfile = async () => {
      try {
        const collectionName = (typeof __app_id !== 'undefined') ? `artifacts/${__app_id}/public/data/website_users` : 'website_users';
        const docRef = doc(db, collectionName, user.uid);
        const docSnap = await getDoc(docRef);
        
        const userData = docSnap.exists() ? docSnap.data() : {};

        setFormData({
          displayName: user.displayName || userData.name || '',
          email: user.email || '',
          phone: userData.phone || '',
          
          address: userData.address || '',
          city: userData.city || '',
          state: userData.state || '',
          pincode: userData.pincode || '',

          billingAddress: userData.billingAddress || '',
          billingCity: userData.billingCity || '',
          billingState: userData.billingState || '',
          billingPincode: userData.billingPincode || ''
        });
        
        setWalletBalance(userData.wallet_credit_balance || 0);

      } catch (error) {
        console.error("Profile Fetch Error:", error);
      }
      setLoading(false);
    };

    fetchProfile();
  }, [user, db]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSameAsShipping = (e) => {
    const isChecked = e.target.checked;
    setSameAsShipping(isChecked);
    if (isChecked) {
      setFormData(prev => ({
        ...prev,
        billingAddress: prev.address,
        billingCity: prev.city,
        billingState: prev.state,
        billingPincode: prev.pincode
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (user.displayName !== formData.displayName) {
        await updateProfile(user, { displayName: formData.displayName });
      }

      const collectionName = (typeof __app_id !== 'undefined') ? `artifacts/${__app_id}/public/data/website_users` : 'website_users';
      const docRef = doc(db, collectionName, user.uid);
      
      const updateData = {
        name: formData.displayName,
        phone: formData.phone,
        
        address: formData.address,
        city: formData.city,
        state: formData.state,
        pincode: formData.pincode,

        billingAddress: sameAsShipping ? formData.address : formData.billingAddress,
        billingCity: sameAsShipping ? formData.city : formData.billingCity,
        billingState: sameAsShipping ? formData.state : formData.billingState,
        billingPincode: sameAsShipping ? formData.pincode : formData.billingPincode,

        lastUpdated: serverTimestamp()
      };

      await updateDoc(docRef, updateData).catch(async (err) => {
          if(err.code === 'not-found') {
              await setDoc(docRef, { ...updateData, email: formData.email, wallet_credit_balance: 0 }, { merge: true });
          }
      });

      alert("Profile Updated Successfully!");
    } catch (error) {
      console.error("Update Error:", error);
      alert("Failed to update profile.");
    }
    setSaving(false);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passData.newPassword.length < 6) return alert("Password must be at least 6 characters.");
    if (passData.newPassword !== passData.confirmPassword) return alert("Passwords do not match.");

    setPassLoading(true);
    try {
      await updatePassword(user, passData.newPassword);
      alert("Password updated successfully!");
      setPassData({ newPassword: '', confirmPassword: '' });
    } catch (error) {
      console.error("Pwd Error:", error);
      if (error.code === 'auth/requires-recent-login') {
        alert("For security, please logout and login again to change your password.");
      } else {
        alert("Failed to update password: " + error.message);
      }
    }
    setPassLoading(false);
  };

  // --- SECURE DELETE ACCOUNT ---
  const handleDeleteAccount = async () => {
    const confirmMsg = "Are you sure you want to delete your account? This action is permanent and cannot be undone. All your data will be lost.";
    if (!window.confirm(confirmMsg)) return;
    
    setDeleteLoading(true);

    try {
      if (!functions) throw new Error("Backend unavailable");

      // Use Cloud Function to bypass Security Rules
      const deleteAccountFn = httpsCallable(functions, 'deleteCustomerAccount');
      await deleteAccountFn();

      alert("Account deleted successfully.");
      await signOut(user.auth); // Logout on client
      navigate('/');
    } catch (error) {
      console.error("Delete Error:", error);
      alert("Failed to delete account: " + error.message);
    }
    setDeleteLoading(false);
  };

  if (!user) return <div className="text-center py-20">Please log in to view your profile.</div>;
  if (loading) return <div className="text-center py-20">Loading Profile...</div>;

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-slate-900 mb-8">My Profile</h1>

      {/* WALLET CARD */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 mb-8 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
            <Wallet className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-emerald-900">Wallet Balance</h2>
            <p className="text-sm text-emerald-700">Available credits for checkout</p>
          </div>
        </div>
        <div className="text-3xl font-bold text-emerald-700">
          ₹{walletBalance.toLocaleString()}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN: Main Info & Addresses */}
        <div className="lg:col-span-2 space-y-8">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 bg-slate-50 border-b border-slate-200 flex items-center gap-4">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
                        <User className="w-8 h-8" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">{user.displayName || 'User'}</h2>
                        <p className="text-sm text-slate-500">{user.email}</p>
                    </div>
                </div>
                
                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1"><User className="w-4 h-4 text-slate-400"/> Full Name</label>
                            <input name="displayName" value={formData.displayName} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1"><Phone className="w-4 h-4 text-slate-400"/> Phone</label>
                            <input name="phone" value={formData.phone} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="+91..." />
                        </div>
                    </div>

                    <div className="border-t border-slate-100 pt-6">
                        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><MapPin className="w-5 h-5 text-blue-600" /> Shipping Address</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                                <input name="address" value={formData.address} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none" />
                            </div>
                            <div><label className="block text-sm font-medium text-slate-700 mb-1">City</label><input name="city" value={formData.city} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none" /></div>
                            <div><label className="block text-sm font-medium text-slate-700 mb-1">State</label><input name="state" value={formData.state} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none" /></div>
                            <div><label className="block text-sm font-medium text-slate-700 mb-1">Pincode</label><input name="pincode" value={formData.pincode} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none" /></div>
                        </div>
                    </div>

                    <div className="border-t border-slate-100 pt-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><CreditCard className="w-5 h-5 text-blue-600" /> Billing Address</h3>
                            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
                                <input type="checkbox" checked={sameAsShipping} onChange={handleSameAsShipping} className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
                                Same as Shipping
                            </label>
                        </div>
                        
                        {!sameAsShipping && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-2">
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                                    <input name="billingAddress" value={formData.billingAddress} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none" />
                                </div>
                                <div><label className="block text-sm font-medium text-slate-700 mb-1">City</label><input name="billingCity" value={formData.billingCity} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none" /></div>
                                <div><label className="block text-sm font-medium text-slate-700 mb-1">State</label><input name="billingState" value={formData.billingState} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none" /></div>
                                <div><label className="block text-sm font-medium text-slate-700 mb-1">Pincode</label><input name="billingPincode" value={formData.billingPincode} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none" /></div>
                            </div>
                        )}
                    </div>

                    <div className="pt-4 flex justify-end">
                        <button 
                            type="submit" 
                            disabled={saving}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 disabled:opacity-70 transition-all"
                        >
                            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                            Save Changes
                        </button>
                    </div>
                </form>
            </div>
        </div>

        {/* RIGHT COLUMN: Password & Danger Zone */}
        <div className="space-y-8">
            
            {/* Change Password */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden p-6">
                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><Key className="w-5 h-5 text-slate-500" /> Change Password</h3>
                <form onSubmit={handleChangePassword} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">New Password</label>
                        <input type="password" placeholder="Min 6 chars" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" value={passData.newPassword} onChange={e => setPassData({...passData, newPassword: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Confirm Password</label>
                        <input type="password" placeholder="Confirm new password" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" value={passData.confirmPassword} onChange={e => setPassData({...passData, confirmPassword: e.target.value})} />
                    </div>
                    <button disabled={passLoading} className="w-full bg-slate-800 hover:bg-slate-900 text-white py-2.5 rounded-lg text-sm font-bold flex justify-center">
                        {passLoading ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Update Password'}
                    </button>
                </form>
            </div>

            {/* Danger Zone */}
            <div className="bg-red-50 rounded-2xl border border-red-100 p-6">
                <h3 className="text-lg font-bold text-red-700 mb-2 flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> Danger Zone</h3>
                <p className="text-xs text-red-600 mb-4">Deleting your account will remove all your data, order history, and wallet credits permanently.</p>
                <button 
                    onClick={handleDeleteAccount} 
                    disabled={deleteLoading}
                    className="w-full bg-white border border-red-200 text-red-600 hover:bg-red-600 hover:text-white py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                    {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Trash2 className="w-4 h-4" />}
                    Delete Account
                </button>
            </div>

        </div>

      </div>
    </div>
  );
}