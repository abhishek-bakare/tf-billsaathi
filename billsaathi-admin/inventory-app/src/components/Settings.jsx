import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { Settings as SettingsIcon, Shield, Calendar, Clock, CreditCard, CheckCircle, AlertTriangle, Truck, Save, Info, Plus, Trash2, FileSpreadsheet, Loader2, Link as LinkIcon } from 'lucide-react';

export default function Settings({ db }) {
  const [activeTab, setActiveTab] = useState('shipping'); 
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ type: '', text: '' }); 

  // Data States
  const [subData, setSubData] = useState(null);
  const [shippingData, setShippingData] = useState({
    method: 'manual', 
    freeShippingThreshold: 999,
    defaultCost: 50,
    zones: [], 
    shiprocketEmail: '',
    shiprocketPassword: ''
  });

  // Local state for adding a new zone
  const [newZone, setNewZone] = useState({ name: '', pincodes: '', cost: '' });

  useEffect(() => {
    if (!db) return;
    
    const collectionPath = (typeof __app_id !== 'undefined') 
        ? `artifacts/${__app_id}/public/data/settings` 
        : 'settings';
    
    const unsubSub = onSnapshot(doc(db, collectionPath, 'subscription'), (docSnap) => {
      if (docSnap.exists()) setSubData(docSnap.data());
    });

    const unsubShip = onSnapshot(doc(db, collectionPath, 'shipping'), (docSnap) => {
      if (docSnap.exists()) {
          const data = docSnap.data();
          setShippingData(prev => ({ 
              ...prev, 
              ...data,
              zones: Array.isArray(data.zones) ? data.zones : [] 
          }));
      }
    });

    setLoading(false);
    return () => { unsubSub(); unsubShip(); };
  }, [db]);

  // Clear status message after 3 seconds
  useEffect(() => {
    if (statusMsg.text) {
        const timer = setTimeout(() => setStatusMsg({ type: '', text: '' }), 3000);
        return () => clearTimeout(timer);
    }
  }, [statusMsg]);

  const addZone = () => {
    if (!newZone.name || !newZone.cost) {
        setStatusMsg({ type: 'error', text: "Zone Name and Cost are required" });
        return;
    }
    setShippingData(prev => ({
        ...prev,
        zones: [...(prev.zones || []), { ...newZone, cost: Number(newZone.cost) }]
    }));
    setNewZone({ name: '', pincodes: '', cost: '' });
  };

  const removeZone = (index) => {
    setShippingData(prev => ({
        ...prev,
        zones: prev.zones.filter((_, i) => i !== index)
    }));
  };

  const handleZoneImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const lines = text.split('\n');
      const importedZones = [];
      
      for (let i = 1; i < lines.length; i++) { 
        const line = lines[i].trim();
        if (!line) continue;
        
        const parts = line.split(',');
        if (parts.length >= 2) {
            const name = parts[0].trim();
            const cost = parts[1].trim();
            const pincodes = parts.slice(2).join(',').replace(/^"|"$/g, '').trim(); 

            if (name && cost && !isNaN(cost)) {
                importedZones.push({ name, cost: Number(cost), pincodes });
            }
        }
      }

      if (importedZones.length > 0) {
          setShippingData(prev => ({
              ...prev,
              zones: [...(prev.zones || []), ...importedZones]
          }));
          setStatusMsg({ type: 'success', text: `Imported ${importedZones.length} zones.` });
      } else {
          setStatusMsg({ type: 'error', text: "No valid zones found in CSV." });
      }
      e.target.value = null; 
    };
    reader.readAsText(file);
  };

  const handleSaveShipping = async (e) => {
    e.preventDefault();
    setSaving(true);
    setStatusMsg({ type: '', text: '' }); 

    try {
        const collectionPath = (typeof __app_id !== 'undefined') 
            ? `artifacts/${__app_id}/public/data/settings` 
            : 'settings';
        
        const cleanZones = (shippingData.zones || []).map(z => ({
            name: String(z.name || ''),
            pincodes: String(z.pincodes || ''),
            cost: Number(z.cost) || 0
        }));

        const payload = {
            method: shippingData.method || 'manual',
            freeShippingThreshold: Number(shippingData.freeShippingThreshold) || 0,
            defaultCost: Number(shippingData.defaultCost) || 0,
            zones: cleanZones,
            // UNLOCKED: Now saving Shiprocket credentials
            shiprocketEmail: String(shippingData.shiprocketEmail || ''),
            shiprocketPassword: String(shippingData.shiprocketPassword || '')
        };
            
        await setDoc(doc(db, collectionPath, 'shipping'), payload, { merge: true });
        
        setStatusMsg({ type: 'success', text: "Settings saved successfully!" });
    } catch (error) {
        console.error("Save Error:", error);
        setStatusMsg({ type: 'error', text: "Failed to save: " + error.message });
    }
    setSaving(false);
  };

  if (loading) return <div className="p-10 text-center text-slate-500">Loading Settings...</div>;

  const validUntil = subData?.validUntil?.toDate ? subData.validUntil.toDate() : null;
  const isValid = validUntil && validUntil > new Date();
  const daysLeft = validUntil ? Math.ceil((validUntil - new Date()) / (1000 * 60 * 60 * 24)) : 0;

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      <div className="bg-white border-b border-slate-200 px-8 py-4 flex-shrink-0">
        <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
            <SettingsIcon className="w-6 h-6 text-slate-500" /> Settings
            </h2>
            
            {statusMsg.text && (
                <div className={`text-sm px-4 py-2 rounded-lg font-medium flex items-center gap-2 shadow-sm animate-in fade-in slide-in-from-top-2 ${statusMsg.type === 'error' ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                    {statusMsg.type === 'error' ? <AlertTriangle className="w-4 h-4"/> : <CheckCircle className="w-4 h-4"/>}
                    {statusMsg.text}
                </div>
            )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 w-full pb-32">
        <div className="max-w-4xl mx-auto pb-20">
        
          <div className="flex gap-4 mb-6 border-b border-slate-200 pb-1">
              <button 
                  onClick={() => setActiveTab('shipping')}
                  className={`px-4 py-2 text-sm font-bold rounded-t-lg transition-colors ${activeTab === 'shipping' ? 'bg-white text-blue-600 border border-b-0 border-slate-200 -mb-1.5' : 'text-slate-500 hover:text-slate-700'}`}
              >
                  Shipping Configuration
              </button>
              <button 
                  onClick={() => setActiveTab('subscription')}
                  className={`px-4 py-2 text-sm font-bold rounded-t-lg transition-colors ${activeTab === 'subscription' ? 'bg-white text-blue-600 border border-b-0 border-slate-200 -mb-1.5' : 'text-slate-500 hover:text-slate-700'}`}
              >
                  License & Plan
              </button>
          </div>

          {activeTab === 'shipping' && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6 animate-in fade-in">
                  <div className="flex items-center gap-3 mb-6">
                      <Truck className="w-6 h-6 text-slate-600" />
                      <h3 className="text-lg font-bold text-slate-800">Shipping Methods</h3>
                  </div>

                  <form onSubmit={handleSaveShipping} className="space-y-8">
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div 
                              onClick={() => setShippingData({...shippingData, method: 'manual'})}
                              className={`cursor-pointer border-2 rounded-xl p-4 flex items-start gap-3 transition-all ${shippingData.method === 'manual' ? 'border-blue-600 bg-blue-50' : 'border-slate-100 hover:border-slate-300'}`}
                          >
                              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 ${shippingData.method === 'manual' ? 'border-blue-600' : 'border-slate-300'}`}>
                                  {shippingData.method === 'manual' && <div className="w-2.5 h-2.5 bg-blue-600 rounded-full" />}
                              </div>
                              <div>
                                  <h4 className="font-bold text-slate-800">Manual Configuration</h4>
                                  <p className="text-xs text-slate-500 mt-1">Set your own flat rates and free shipping limits based on order value.</p>
                              </div>
                          </div>

                          <div 
                              onClick={() => setShippingData({...shippingData, method: 'shiprocket'})}
                              className={`cursor-pointer border-2 rounded-xl p-4 flex items-start gap-3 transition-all ${shippingData.method === 'shiprocket' ? 'border-blue-600 bg-blue-50' : 'border-slate-100 hover:border-slate-300'}`}
                          >
                              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 ${shippingData.method === 'shiprocket' ? 'border-blue-600' : 'border-slate-300'}`}>
                                  {shippingData.method === 'shiprocket' && <div className="w-2.5 h-2.5 bg-blue-600 rounded-full" />}
                              </div>
                              <div>
                                  <h4 className="font-bold text-slate-800">Shiprocket Integration</h4>
                                  <p className="text-xs text-slate-500 mt-1">Automate shipping rates and label generation via API.</p>
                              </div>
                          </div>
                      </div>

                      {shippingData.method === 'manual' && (
                          <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 space-y-4">
                              <h4 className="font-bold text-slate-700 border-b border-slate-200 pb-2 mb-4">Manual Rules</h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  <div>
                                      <label className="block text-sm font-medium text-slate-600 mb-1">Standard Shipping Cost (₹)</label>
                                      <input 
                                          type="number" 
                                          className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                          value={shippingData.defaultCost}
                                          onChange={(e) => setShippingData({...shippingData, defaultCost: e.target.value})}
                                      />
                                      <p className="text-xs text-slate-400 mt-1">Charged if order is below free threshold.</p>
                                  </div>
                                  <div>
                                      <label className="block text-sm font-medium text-slate-600 mb-1">Free Shipping Above (₹)</label>
                                      <input 
                                          type="number" 
                                          className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-blue-500 bg-white"
                                          value={shippingData.freeShippingThreshold}
                                          onChange={(e) => setShippingData({...shippingData, freeShippingThreshold: e.target.value})}
                                      />
                                      <p className="text-xs text-slate-400 mt-1">Orders above this amount get free shipping.</p>
                                  </div>
                              </div>

                              <div className="mt-6 pt-6 border-t border-slate-200">
                                  <div className="flex justify-between items-center mb-4">
                                      <h4 className="font-bold text-slate-700">City & Pincode Zones</h4>
                                      <label className="cursor-pointer text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded flex items-center gap-1 shadow-sm">
                                          <FileSpreadsheet className="w-3.5 h-3.5" /> Import CSV
                                          <input 
                                              type="file" 
                                              accept=".csv" 
                                              className="hidden" 
                                              onChange={handleZoneImport}
                                          />
                                      </label>
                                  </div>
                                  
                                  {/* List */}
                                  <div className="space-y-3 mb-4 max-h-60 overflow-y-auto pr-2">
                                      {Array.isArray(shippingData.zones) && shippingData.zones.map((zone, idx) => (
                                          zone ? (
                                          <div key={idx} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg text-sm">
                                              <div>
                                                  <p className="font-bold text-slate-800">{zone.name || 'Unnamed Zone'}</p>
                                                  <p className="text-xs text-slate-500 truncate max-w-md" title={String(zone.pincodes || '')}>{String(zone.pincodes || '')}</p>
                                              </div>
                                              <div className="flex items-center gap-4">
                                                  <span className="font-bold text-slate-700">₹{zone.cost || 0}</span>
                                                  <button type="button" onClick={() => removeZone(idx)} className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
                                              </div>
                                          </div>
                                          ) : null
                                      ))}
                                      {(!shippingData.zones || shippingData.zones.length === 0) && (
                                          <p className="text-sm text-slate-400 italic text-center py-2">No specific zones added. Default cost applies to all.</p>
                                      )}
                                  </div>

                                  {/* Add Form */}
                                  <div className="grid grid-cols-12 gap-3 items-end bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                                      <div className="col-span-3">
                                          <label className="block text-xs font-bold text-slate-500 mb-1">Zone Name</label>
                                          <input 
                                              className="w-full border border-slate-300 rounded p-2 text-sm outline-none focus:border-blue-500" 
                                              placeholder="e.g. Mumbai"
                                              value={newZone.name}
                                              onChange={e => setNewZone({...newZone, name: e.target.value})}
                                          />
                                      </div>
                                      <div className="col-span-6">
                                          <label className="block text-xs font-bold text-slate-500 mb-1">Pincodes / Cities</label>
                                          <input 
                                              className="w-full border border-slate-300 rounded p-2 text-sm outline-none focus:border-blue-500" 
                                              placeholder="400001, Pune, 110020..."
                                              value={newZone.pincodes}
                                              onChange={e => setNewZone({...newZone, pincodes: e.target.value})}
                                          />
                                      </div>
                                      <div className="col-span-2">
                                          <label className="block text-xs font-bold text-slate-500 mb-1">Cost (₹)</label>
                                          <input 
                                              type="number" 
                                              className="w-full border border-slate-300 rounded p-2 text-sm outline-none focus:border-blue-500" 
                                              placeholder="0"
                                              value={newZone.cost}
                                              onChange={e => setNewZone({...newZone, cost: e.target.value})}
                                          />
                                      </div>
                                      <div className="col-span-1">
                                          <button type="button" onClick={addZone} className="w-full bg-blue-600 hover:bg-blue-700 text-white p-2 rounded flex justify-center items-center h-[38px]">
                                              <Plus className="w-4 h-4" />
                                          </button>
                                      </div>
                                  </div>
                              </div>
                          </div>
                      )}

                      {/* Shiprocket Settings (Unlocked) */}
                      {shippingData.method === 'shiprocket' && (
                          <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 space-y-4">
                               <div className="flex items-center gap-2 text-blue-600 bg-blue-50 p-3 rounded-lg border border-blue-100 mb-4">
                                  <LinkIcon className="w-5 h-5" />
                                  <span className="text-sm font-medium">Connect your Shiprocket Account</span>
                               </div>
                               <div>
                                  <label className="block text-sm font-medium text-slate-600 mb-1">Shiprocket API Email</label>
                                  <input 
                                      className="w-full border border-slate-300 rounded-lg p-2.5 bg-white outline-none focus:ring-2 focus:ring-blue-500" 
                                      placeholder="Enter Shiprocket Email"
                                      value={shippingData.shiprocketEmail}
                                      onChange={(e) => setShippingData({...shippingData, shiprocketEmail: e.target.value})}
                                  />
                               </div>
                               <div>
                                  <label className="block text-sm font-medium text-slate-600 mb-1">Shiprocket API Password</label>
                                  <input 
                                      type="password"
                                      className="w-full border border-slate-300 rounded-lg p-2.5 bg-white outline-none focus:ring-2 focus:ring-blue-500" 
                                      placeholder="Enter API Password (not account password)"
                                      value={shippingData.shiprocketPassword}
                                      onChange={(e) => setShippingData({...shippingData, shiprocketPassword: e.target.value})}
                                  />
                                  <p className="text-xs text-slate-400 mt-1">Found in Shiprocket Panel &gt; Settings &gt; API</p>
                               </div>
                          </div>
                      )}

                      <div className="flex justify-end pt-4 border-t border-slate-100">
                          <button 
                              type="submit" 
                              disabled={saving}
                              className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 disabled:opacity-50"
                          >
                              {saving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4" />}
                              Save Changes
                          </button>
                      </div>
                  </form>
              </div>
          )}

          {/* --- SUBSCRIPTION TAB --- */}
          {activeTab === 'subscription' && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-8 animate-in fade-in duration-300">
                  <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                      <h3 className="font-bold text-slate-800 flex items-center gap-2">
                          <Shield className="w-5 h-5 text-blue-600" /> License Details
                      </h3>
                      {isValid ? (
                          <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" /> Active
                          </span>
                      ) : (
                          <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Expired
                          </span>
                      )}
                  </div>
                  
                  <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-8">
                      <div className="space-y-1">
                          <p className="text-sm text-slate-500 font-medium flex items-center gap-2"><CreditCard className="w-4 h-4" /> Current Plan</p>
                          <p className="text-2xl font-bold text-slate-800 capitalize">{subData?.plan || 'Standard'} License</p>
                      </div>
                      <div className="space-y-1">
                          <p className="text-sm text-slate-500 font-medium flex items-center gap-2"><Calendar className="w-4 h-4" /> Valid Until</p>
                          <p className="text-2xl font-bold text-slate-800">{validUntil ? validUntil.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : 'N/A'}</p>
                      </div>
                      <div className="space-y-1">
                          <p className="text-sm text-slate-500 font-medium flex items-center gap-2"><Clock className="w-4 h-4" /> Remaining</p>
                          <p className={`text-2xl font-bold ${daysLeft < 7 ? 'text-rose-600' : 'text-emerald-600'}`}>{daysLeft > 0 ? `${daysLeft} Days` : '0 Days'}</p>
                      </div>
                  </div>

                  <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 text-sm text-slate-500 flex justify-between items-center">
                      <span className="flex items-center gap-2"><Info className="w-4 h-4"/> License Key previously redeemed.</span>
                      <span className="text-xs">Contact vendor for renewals.</span>
                  </div>
              </div>
          )}

        </div>
      </div>
    </div>
  );
}