import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { LayoutTemplate, Save, Upload, Image as ImageIcon, Loader2, Type, Link as LinkIcon, Eye, Grid, Palette, Globe, MessageSquare } from 'lucide-react';

export default function CMSManager({ db }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('home'); // home, categories, promo, settings
  
  const [content, setContent] = useState({
    // --- HOME HERO ---
    heroTitle: 'New Arrivals',
    heroSubtitle: 'Summer Collection',
    heroDescription: 'Discover the latest trends in fashion. Premium quality, best prices.',
    heroButtonText: 'Shop Now',
    heroImage: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8',
    announcement: 'Free Shipping on all orders above ₹999',
    
    // --- FEATURED CATEGORIES (3 Slots) ---
    featuredCategories: [
        { title: 'Men', image: '', link: '/shop?cat=Men' },
        { title: 'Women', image: '', link: '/shop?cat=Women' },
        { title: 'Accessories', image: '', link: '/shop?cat=Accessories' }
    ],

    // --- PROMO BANNER ---
    promoTitle: 'Limited Time Offer',
    promoSubtitle: 'Flat 50% Off',
    promoImage: '',
    promoLink: '/shop',

    // --- SEO & THEME ---
    siteTitle: 'Drushya Store - Best Fashion',
    metaDescription: 'Shop the latest fashion trends at Drushya Store.',
    themeColor: '#2563EB', // Default Blue

    // --- POPUP ---
    popupEnabled: false,
    popupTitle: 'Welcome Gift',
    popupText: 'Sign up now and get 10% off your first order!',
    popupCode: 'WELCOME10'
  });

  useEffect(() => {
    if (!db) return;
    const isCanvas = typeof __app_id !== 'undefined';
    const collectionPath = isCanvas ? `artifacts/${__app_id}/public/data/content` : 'content';
    
    const unsub = onSnapshot(doc(db, collectionPath, 'home'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        // Merge with defaults to ensure all fields exist
        setContent(prev => ({ 
            ...prev, 
            ...data,
            featuredCategories: data.featuredCategories || prev.featuredCategories
        }));
      }
      setLoading(false);
    });

    return () => unsub();
  }, [db]);

  const handleImageUpload = (e, field, index = null) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
        if (field === 'featuredCategories' && index !== null) {
            const newCats = [...content.featuredCategories];
            newCats[index].image = reader.result;
            setContent(prev => ({ ...prev, featuredCategories: newCats }));
        } else {
            setContent(prev => ({ ...prev, [field]: reader.result }));
        }
    };
    reader.readAsDataURL(file);
  };

  const handleCatChange = (index, key, value) => {
      const newCats = [...content.featuredCategories];
      newCats[index][key] = value;
      setContent(prev => ({ ...prev, featuredCategories: newCats }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
        const isCanvas = typeof __app_id !== 'undefined';
        const collectionPath = isCanvas ? `artifacts/${__app_id}/public/data/content` : 'content';
            
        await setDoc(doc(db, collectionPath, 'home'), {
            ...content,
            lastUpdated: serverTimestamp()
        }, { merge: true });
        
        alert("Content updated successfully!");
    } catch (error) {
        console.error("Save Error:", error);
        alert("Failed to save content.");
    }
    setSaving(false);
  };

  if (loading) return <div className="p-10 text-center text-slate-500">Loading CMS...</div>;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
           <LayoutTemplate className="w-6 h-6 text-blue-600" /> Website Content Manager
        </h2>
        <button 
            onClick={handleSave}
            disabled={saving}
            className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 px-6 rounded-lg flex items-center gap-2 disabled:opacity-70"
        >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* SIDEBAR TABS */}
        <div className="w-64 bg-white border-r border-slate-200 p-4 space-y-1">
            <button onClick={() => setActiveTab('home')} className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium flex items-center gap-3 ${activeTab === 'home' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                <LayoutTemplate className="w-4 h-4"/> Hero & Announcement
            </button>
            <button onClick={() => setActiveTab('categories')} className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium flex items-center gap-3 ${activeTab === 'categories' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                <Grid className="w-4 h-4"/> Featured Categories
            </button>
            <button onClick={() => setActiveTab('promo')} className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium flex items-center gap-3 ${activeTab === 'promo' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                <ImageIcon className="w-4 h-4"/> Promo Banner
            </button>
            <button onClick={() => setActiveTab('settings')} className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium flex items-center gap-3 ${activeTab === 'settings' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                <Palette className="w-4 h-4"/> Theme & SEO
            </button>
        </div>

        {/* CONTENT AREA */}
        <div className="flex-1 overflow-y-auto p-8">
            <div className="max-w-3xl mx-auto">
                
                {/* --- HERO SECTION --- */}
                {activeTab === 'home' && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6 animate-in fade-in">
                        <h3 className="font-bold text-slate-800 text-lg border-b border-slate-100 pb-2">Announcement Bar</h3>
                        <input className="w-full border p-2 rounded-lg" value={content.announcement} onChange={e => setContent({...content, announcement: e.target.value})} placeholder="Top bar text..." />

                        <h3 className="font-bold text-slate-800 text-lg border-b border-slate-100 pb-2 pt-4">Hero Banner</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="text-xs font-bold text-slate-500">Title</label><input className="w-full border p-2 rounded-lg" value={content.heroTitle} onChange={e => setContent({...content, heroTitle: e.target.value})} /></div>
                            <div><label className="text-xs font-bold text-slate-500">Subtitle</label><input className="w-full border p-2 rounded-lg" value={content.heroSubtitle} onChange={e => setContent({...content, heroSubtitle: e.target.value})} /></div>
                            <div className="col-span-2"><label className="text-xs font-bold text-slate-500">Description</label><textarea rows="2" className="w-full border p-2 rounded-lg" value={content.heroDescription} onChange={e => setContent({...content, heroDescription: e.target.value})} /></div>
                            <div className="col-span-2"><label className="text-xs font-bold text-slate-500">Button Text</label><input className="w-full border p-2 rounded-lg" value={content.heroButtonText} onChange={e => setContent({...content, heroButtonText: e.target.value})} /></div>
                        </div>

                        <div className="pt-2">
                            <label className="block text-xs font-bold text-slate-500 mb-2">Hero Image</label>
                            <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center cursor-pointer relative h-40 flex items-center justify-center bg-slate-50">
                                {content.heroImage ? <img src={content.heroImage} className="absolute inset-0 w-full h-full object-cover rounded-xl" /> : <span className="text-slate-400 flex items-center gap-2"><Upload className="w-4 h-4"/> Upload</span>}
                                <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => handleImageUpload(e, 'heroImage')} />
                            </div>
                        </div>
                    </div>
                )}

                {/* --- FEATURED CATEGORIES --- */}
                {activeTab === 'categories' && (
                    <div className="space-y-6 animate-in fade-in">
                        <h3 className="font-bold text-slate-800 text-lg">Featured Categories (3 Slots)</h3>
                        {content.featuredCategories.map((cat, idx) => (
                            <div key={idx} className="bg-white rounded-xl border border-slate-200 p-4 flex gap-4 items-center">
                                <div className="w-24 h-24 bg-slate-100 rounded-lg flex-shrink-0 border border-slate-200 relative cursor-pointer overflow-hidden group">
                                    {cat.image ? <img src={cat.image} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-300"><ImageIcon className="w-6 h-6"/></div>}
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs"><Upload className="w-4 h-4"/></div>
                                    <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => handleImageUpload(e, 'featuredCategories', idx)} />
                                </div>
                                <div className="flex-1 space-y-3">
                                    <div><label className="text-xs font-bold text-slate-500">Title</label><input className="w-full border p-2 rounded-lg" value={cat.title} onChange={e => handleCatChange(idx, 'title', e.target.value)} /></div>
                                    <div><label className="text-xs font-bold text-slate-500">Link URL</label><input className="w-full border p-2 rounded-lg" value={cat.link} onChange={e => handleCatChange(idx, 'link', e.target.value)} /></div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* --- PROMO BANNER --- */}
                {activeTab === 'promo' && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6 animate-in fade-in">
                         <h3 className="font-bold text-slate-800 text-lg border-b border-slate-100 pb-2">Mid-Page Promo Banner</h3>
                         <div className="grid grid-cols-2 gap-4">
                            <div><label className="text-xs font-bold text-slate-500">Title</label><input className="w-full border p-2 rounded-lg" value={content.promoTitle} onChange={e => setContent({...content, promoTitle: e.target.value})} /></div>
                            <div><label className="text-xs font-bold text-slate-500">Subtitle</label><input className="w-full border p-2 rounded-lg" value={content.promoSubtitle} onChange={e => setContent({...content, promoSubtitle: e.target.value})} /></div>
                            <div className="col-span-2"><label className="text-xs font-bold text-slate-500">Link URL</label><input className="w-full border p-2 rounded-lg" value={content.promoLink} onChange={e => setContent({...content, promoLink: e.target.value})} /></div>
                         </div>
                         <div>
                            <label className="block text-xs font-bold text-slate-500 mb-2">Banner Image</label>
                            <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center cursor-pointer relative h-32 flex items-center justify-center bg-slate-50">
                                {content.promoImage ? <img src={content.promoImage} className="absolute inset-0 w-full h-full object-cover rounded-xl" /> : <span className="text-slate-400 flex items-center gap-2"><Upload className="w-4 h-4"/> Upload</span>}
                                <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => handleImageUpload(e, 'promoImage')} />
                            </div>
                        </div>
                    </div>
                )}

                {/* --- THEME & SEO & POPUP --- */}
                {activeTab === 'settings' && (
                    <div className="space-y-6 animate-in fade-in">
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                            <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2"><Globe className="w-5 h-5"/> SEO Settings</h3>
                            <div><label className="text-xs font-bold text-slate-500">Website Title</label><input className="w-full border p-2 rounded-lg" value={content.siteTitle} onChange={e => setContent({...content, siteTitle: e.target.value})} /></div>
                            <div><label className="text-xs font-bold text-slate-500">Meta Description</label><textarea rows="2" className="w-full border p-2 rounded-lg" value={content.metaDescription} onChange={e => setContent({...content, metaDescription: e.target.value})} /></div>
                        </div>

                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                            <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2"><Palette className="w-5 h-5"/> Theme</h3>
                            <div>
                                <label className="text-xs font-bold text-slate-500">Primary Brand Color</label>
                                <div className="flex gap-2 mt-2">
                                    <input type="color" className="h-10 w-10 border rounded cursor-pointer" value={content.themeColor} onChange={e => setContent({...content, themeColor: e.target.value})} />
                                    <input className="border p-2 rounded-lg flex-1" value={content.themeColor} onChange={e => setContent({...content, themeColor: e.target.value})} />
                                </div>
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                                <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2"><MessageSquare className="w-5 h-5"/> Marketing Popup</h3>
                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input type="checkbox" className="w-4 h-4" checked={content.popupEnabled} onChange={e => setContent({...content, popupEnabled: e.target.checked})} />
                                    Enable Popup
                                </label>
                            </div>
                            <div className={`space-y-4 ${!content.popupEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
                                <div><label className="text-xs font-bold text-slate-500">Popup Title</label><input className="w-full border p-2 rounded-lg" value={content.popupTitle} onChange={e => setContent({...content, popupTitle: e.target.value})} /></div>
                                <div><label className="text-xs font-bold text-slate-500">Popup Text</label><input className="w-full border p-2 rounded-lg" value={content.popupText} onChange={e => setContent({...content, popupText: e.target.value})} /></div>
                                <div><label className="text-xs font-bold text-slate-500">Coupon Code to Show</label><input className="w-full border p-2 rounded-lg" value={content.popupCode} onChange={e => setContent({...content, popupCode: e.target.value})} /></div>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
      </div>
    </div>
  );
}