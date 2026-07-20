import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { 
  Users, UserPlus, Trash2, Shield, ShieldCheck, ShoppingBag, Loader2, Mail, Lock, User, X, AlertTriangle, CheckCircle 
} from 'lucide-react';

export default function StaffManager({ db, user, functions }) {
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(''); // Store permission errors (Main View Blocker)
  
  // Feedback States
  const [actionError, setActionError] = useState(''); // For action failures
  const [successMsg, setSuccessMsg] = useState(''); // For action success

  // Modal & Form
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'cashier' // 'manager' or 'cashier'
  });

  // Clear feedback after 5 seconds
  useEffect(() => {
    if (successMsg || actionError) {
      const timer = setTimeout(() => {
        setSuccessMsg('');
        setActionError('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [successMsg, actionError]);

  // 1. Fetch Staff List
  useEffect(() => {
    if (!db) return;
    
    const collectionPath = (typeof __app_id !== 'undefined') 
        ? `artifacts/${__app_id}/public/data/staff` 
        : 'staff';

    const q = query(collection(db, collectionPath), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setStaffList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (err) => {
        // --- ERROR HANDLER ---
        console.error("Staff Fetch Error:", err);
        if (err.code === 'permission-denied') {
            setError("Access Denied: You do not have permission to view staff.");
        } else {
            setError("Error loading staff data.");
        }
        setLoading(false);
    });

    return () => unsubscribe();
  }, [db]);

  // 2. Handle Add Staff (Secure Call)
  const handleAddStaff = async (e) => {
    e.preventDefault();
    if (formData.password.length < 6) {
        setActionError("Password must be at least 6 characters long.");
        return;
    }
    
    setIsProcessing(true);
    setActionError('');
    setSuccessMsg('');

    try {
        if (!functions) throw new Error("Backend unavailable");
        
        const createStaffFn = httpsCallable(functions, 'createStaffAccount');
        await createStaffFn(formData);

        setSuccessMsg(`Staff account for ${formData.name} created successfully!`);
        setIsModalOpen(false);
        setFormData({ name: '', email: '', password: '', role: 'cashier' });

    } catch (error) {
        console.error("Create Staff Error:", error);
        // Clean up error message
        let msg = error.message;
        if (msg.includes('auth/email-already-exists')) msg = "This email is already in use.";
        setActionError("Failed to create staff: " + msg);
    }
    setIsProcessing(false);
  };

  // 3. Handle Delete Staff
  const handleDelete = async (staffId, staffEmail) => {
    if (!confirm(`Are you sure you want to delete ${staffEmail}? They will lose access immediately.`)) return;
    
    setActionError('');
    setSuccessMsg('');

    try {
        const deleteStaffFn = httpsCallable(functions, 'deleteStaffAccount');
        await deleteStaffFn({ uid: staffId });
        setSuccessMsg(`Staff ${staffEmail} deleted successfully.`);
    } catch (error) {
        console.error("Delete Error:", error);
        setActionError("Failed to delete: " + error.message);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
           <Users className="w-6 h-6 text-blue-600" /> Staff Management
        </h2>
        <button 
            onClick={() => { setIsModalOpen(true); setActionError(''); }}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors"
        >
            <UserPlus className="w-4 h-4" /> Add Staff
        </button>
      </div>

      <div className="p-8 overflow-auto flex-1">
        
        {/* ACTION FEEDBACK MESSAGES */}
        {successMsg && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm rounded-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
                {successMsg}
            </div>
        )}
        {actionError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                {actionError}
            </div>
        )}

        {/* ERROR DISPLAY (Permission) */}
        {error ? (
             <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                 <div className="bg-red-50 p-4 rounded-xl border border-red-100 flex items-center gap-3 text-red-600">
                     <AlertTriangle className="w-6 h-6" />
                     <span>{error}</span>
                 </div>
             </div>
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            {/* Owner Card (Read Only) */}
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 text-white shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10"><ShieldCheck className="w-24 h-24" /></div>
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-white/10 rounded-lg"><ShieldCheck className="w-6 h-6 text-emerald-400"/></div>
                        <div>
                            <h3 className="font-bold text-lg">Owner / Admin</h3>
                            <p className="text-xs text-slate-400">Full Access</p>
                        </div>
                    </div>
                    <div className="space-y-2 text-sm text-slate-300">
                        <p className="flex items-center gap-2"><User className="w-4 h-4"/> You</p>
                        <p className="flex items-center gap-2"><Mail className="w-4 h-4"/> {user?.email}</p>
                    </div>
                </div>
            </div>

            {/* Staff List */}
            {loading ? <div className="p-10 text-slate-500">Loading...</div> : staffList.map(staff => (
                <div key={staff.id} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow relative group">
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${staff.role === 'manager' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'}`}>
                                {staff.role === 'manager' ? <Shield className="w-5 h-5"/> : <ShoppingBag className="w-5 h-5"/>}
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800">{staff.name}</h3>
                                <p className={`text-xs font-bold uppercase tracking-wider ${staff.role === 'manager' ? 'text-purple-600' : 'text-blue-600'}`}>{staff.role}</p>
                            </div>
                        </div>
                        <button 
                            onClick={() => handleDelete(staff.id, staff.email)}
                            className="text-slate-400 hover:text-red-600 p-2 rounded-full hover:bg-red-50 transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                    
                    <div className="space-y-2 text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <p className="flex items-center gap-2"><Mail className="w-3.5 h-3.5"/> {staff.email}</p>
                        <p className="flex items-center gap-2 text-xs text-slate-400">
                            Created: {staff.createdAt?.seconds ? new Date(staff.createdAt.seconds * 1000).toLocaleDateString() : 'Recent'}
                        </p>
                    </div>
                </div>
            ))}
        </div>
        )}
      </div>

      {/* --- ADD STAFF MODAL --- */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl animate-in zoom-in-95">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-slate-800">Add New Staff</h3>
                    <button onClick={() => setIsModalOpen(false)}><X className="w-5 h-5 text-slate-500" /></button>
                </div>

                {/* SHOW ERROR INSIDE MODAL TOO IF ACTION FAILS */}
                {actionError && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {actionError}
                    </div>
                )}
                
                <form onSubmit={handleAddStaff} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Full Name</label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input required className="w-full pl-9 p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. John Doe" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email (Login ID)</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input type="email" required className="w-full pl-9 p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" placeholder="staff@store.com" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Password</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input type="password" required className="w-full pl-9 p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" placeholder="Min 6 characters" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Role & Permissions</label>
                        <div className="grid grid-cols-2 gap-3">
                            <label className={`cursor-pointer border rounded-xl p-3 flex flex-col items-center gap-2 transition-all ${formData.role === 'cashier' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                                <input type="radio" name="role" value="cashier" checked={formData.role === 'cashier'} onChange={e => setFormData({...formData, role: e.target.value})} className="hidden" />
                                <ShoppingBag className="w-6 h-6" />
                                <span className="font-bold text-sm">Cashier</span>
                                <span className="text-[10px] text-center opacity-80">POS & Orders Only</span>
                            </label>
                            
                            <label className={`cursor-pointer border rounded-xl p-3 flex flex-col items-center gap-2 transition-all ${formData.role === 'manager' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                                <input type="radio" name="role" value="manager" checked={formData.role === 'manager'} onChange={e => setFormData({...formData, role: e.target.value})} className="hidden" />
                                <Shield className="w-6 h-6" />
                                <span className="font-bold text-sm">Manager</span>
                                <span className="text-[10px] text-center opacity-80">Inventory & Reports</span>
                            </label>
                        </div>
                    </div>

                    <button disabled={isProcessing} className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-70 mt-4">
                        {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
                        {isProcessing ? 'Creating Account...' : 'Create Staff Account'}
                    </button>
                </form>
            </div>
        </div>
      )}
    </div>
  );
}