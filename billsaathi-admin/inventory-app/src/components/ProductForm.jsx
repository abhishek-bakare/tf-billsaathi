import React, { useState, useEffect, useRef } from 'react';
import { collection, addDoc, updateDoc, doc, serverTimestamp, query, orderBy, onSnapshot } from 'firebase/firestore';
import { Plus, Trash2, X, Image as ImageIcon, Upload, ChevronDown, Check, Bold, Italic, List, Grid, RefreshCw } from 'lucide-react';

const COLOR_CHOICES = [
  { name: 'White', hex: '#FFFFFF', border: true },
  { name: 'Black', hex: '#000000' },
  { name: 'Red', hex: '#EF4444' },
  { name: 'Blue', hex: '#3B82F6' },
  { name: 'Green', hex: '#10B981' },
  { name: 'Yellow', hex: '#F59E0B' },
  { name: 'Orange', hex: '#F97316' },
  { name: 'Purple', hex: '#8B5CF6' },
  { name: 'Pink', hex: '#EC4899' },
  { name: 'Navy', hex: '#1E3A8A' },
  { name: 'Grey', hex: '#6B7280' },
  { name: 'Maroon', hex: '#7F1D1D' },
  { name: 'Brown', hex: '#78350F' },
  { name: 'Beige', hex: '#F5F5DC' },
  { name: 'Cream', hex: '#FFFDD0' },
  { name: 'Teal', hex: '#14B8A6' },
  { name: 'Olive', hex: '#808000' },
  { name: 'Gold', hex: '#FFD700' },
  { name: 'Silver', hex: '#C0C0C0' },
  { name: 'Multicolor', hex: 'linear-gradient(135deg, #ff0000, #0000ff)' },
];

export default function ProductForm({ onClose, db, user, productToEdit }) {
  const [formData, setFormData] = useState({
    name: '', description: '', category: '', subcategory: '', vendorId: ''
  });

  const [dbCategories, setDbCategories] = useState([]);
  const [availableSubcategories, setAvailableSubcategories] = useState([]);
  const [vendors, setVendors] = useState([]); 
  const [images, setImages] = useState([]); 
  const [openColorPicker, setOpenColorPicker] = useState(null);
  const editorRef = useRef(null);
  
  const [variants, setVariants] = useState([{
    sku: '', color: '', size: '', 
    length: 0, width: 0, height: 0, weight: 0, 
    purchasePrice: 0, offlinePrice: 0, onlinePrice: 0, gst: 0, hsn: '',
    stock: 0, barcode: '', image: '' 
  }]);

  useEffect(() => {
    if (productToEdit) {
      setFormData({
        name: productToEdit.name || '',
        description: productToEdit.description || '',
        category: productToEdit.category || '',
        subcategory: productToEdit.subcategory || '',
        vendorId: productToEdit.vendorId || ''
      });
      setImages(productToEdit.images || []);
      if (productToEdit.variants) {
        setVariants(productToEdit.variants.map(v => ({
          ...v,
          gst: v.gst || 0,
          hsn: v.hsn || '',
          weight: v.weight || 0,
          length: v.length || 0, width: v.width || 0, height: v.height || 0
        })));
      }
      
      // Populate Editor
      if (editorRef.current) {
        editorRef.current.innerHTML = productToEdit.description || '';
      }
    }
  }, [productToEdit]);

  useEffect(() => {
    if (!db) return;
    const getCollectionRef = (col) => (typeof __app_id !== 'undefined') ? collection(db, 'artifacts', __app_id, 'public', 'data', col) : collection(db, col);

    const unsubVendors = onSnapshot(query(getCollectionRef('vendors'), orderBy('name')), (snap) => {
      setVendors(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubCats = onSnapshot(query(getCollectionRef('categories'), orderBy('name')), (snap) => {
      const cats = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setDbCategories(cats);
      if (productToEdit && productToEdit.category) {
        const found = cats.find(c => c.name === productToEdit.category);
        if (found) setAvailableSubcategories(found.subcategories);
      }
    });

    return () => { unsubVendors(); unsubCats(); };
  }, [db, productToEdit]);

  const handleCategoryChange = (e) => {
    const catName = e.target.value;
    setFormData({ ...formData, category: catName, subcategory: '' });
    const selectedCat = dbCategories.find(c => c.name === catName);
    setAvailableSubcategories(selectedCat ? selectedCat.subcategories : []);
  };

  const processFile = (file, callback) => {
    const reader = new FileReader();
    reader.onloadend = () => callback(reader.result);
    reader.readAsDataURL(file);
  };

  const handleMainImageUpload = (e) => {
    Array.from(e.target.files).forEach(file => processFile(file, (base64) => setImages(prev => [...prev, base64])));
  };

  const handleVariantImageUpload = (index, e) => {
    processFile(e.target.files[0], (base64) => handleVariantChange(index, 'image', base64));
  };

  const handleVariantChange = (index, field, value) => {
    const newVariants = [...variants];
    newVariants[index][field] = value;
    setVariants(newVariants);
  };

  // --- NEW: GENERATE BARCODE ---
  const generateBarcode = (index) => {
    const randomEAN = Math.floor(100000000000 + Math.random() * 900000000000).toString();
    handleVariantChange(index, 'barcode', randomEAN);
  };

  const addVariant = () => {
    setVariants([...variants, { sku: '', color: '', size: '', length: 0, width: 0, height: 0, weight: 0, purchasePrice: 0, offlinePrice: 0, onlinePrice: 0, gst: 0, hsn: '', stock: 0, barcode: '', image: '' }]);
  };

  const removeVariant = (index) => {
    setVariants(variants.filter((_, i) => i !== index));
  };

  // --- RICH TEXT EDITOR LOGIC ---
  const handleFormat = (command, value = null) => {
    document.execCommand(command, false, value);
    if (editorRef.current) {
        setFormData({ ...formData, description: editorRef.current.innerHTML });
        editorRef.current.focus();
    }
  };

  const insertTable = () => {
      const tableHtml = `
        <table style="width:100%; border-collapse: collapse; border: 1px solid #ccc; margin-top: 10px;">
            <tr>
                <th style="border: 1px solid #ccc; padding: 5px; background: #f0f0f0;">Header 1</th>
                <th style="border: 1px solid #ccc; padding: 5px; background: #f0f0f0;">Header 2</th>
            </tr>
            <tr>
                <td style="border: 1px solid #ccc; padding: 5px;">Data 1</td>
                <td style="border: 1px solid #ccc; padding: 5px;">Data 2</td>
            </tr>
        </table><br/>
      `;
      document.execCommand('insertHTML', false, tableHtml);
      if (editorRef.current) setFormData({ ...formData, description: editorRef.current.innerHTML });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!db) return;

    const finalDescription = editorRef.current ? editorRef.current.innerHTML : formData.description;

    try {
      const collectionPath = (typeof __app_id !== 'undefined') ? collection(db, 'artifacts', __app_id, 'public', 'data', 'products') : collection(db, 'products');
      
      const productData = {
        ...formData,
        description: finalDescription,
        vendorName: vendors.find(v => v.id === formData.vendorId)?.name || 'Unknown',
        images: images,
        variants: variants.map(v => ({
          ...v,
          purchasePrice: Number(v.purchasePrice),
          offlinePrice: Number(v.offlinePrice),
          onlinePrice: Number(v.onlinePrice),
          gst: Number(v.gst),
          hsn: v.hsn || '',
          stock: Number(v.stock),
          length: Number(v.length), width: Number(v.width), height: Number(v.height),
          weight: Number(v.weight),
          barcode: v.barcode || ''
        })),
        lastUpdated: serverTimestamp(),
        lastUpdatedBy: user?.uid || 'admin'
      };

      if (productToEdit) {
        const docRef = (typeof __app_id !== 'undefined') ? doc(db, 'artifacts', __app_id, 'public', 'data', 'products', productToEdit.id) : doc(db, 'products', productToEdit.id);
        await updateDoc(docRef, productData);
        alert("Product updated successfully!");
      } else {
        productData.createdAt = serverTimestamp();
        await addDoc(collectionPath, productData);
        alert("Product added successfully!");
      }
      onClose();
    } catch (error) {
      console.error(error);
      alert(`Error saving: ${error.message}`);
    }
  };

  // Helper to calculate final price
  const calcFinal = (price, gst) => (Number(price) * (1 + Number(gst)/100)).toFixed(0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-7xl p-6 shadow-xl my-8 relative">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-slate-800">{productToEdit ? 'Edit Product' : 'Add Advanced Product'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-500" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700">Product Name</label>
              <input required className="w-full border border-slate-300 p-2 rounded" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            </div>
            
            {/* RICH DESCRIPTION EDITOR */}
            <div className="col-span-2">
               <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
               <div className="border border-slate-300 rounded overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all">
                  <div className="flex gap-1 bg-slate-50 border-b border-slate-200 p-1">
                     <button type="button" onClick={() => handleFormat('bold')} className="p-1.5 hover:bg-slate-200 rounded text-slate-600" title="Bold"><Bold className="w-4 h-4"/></button>
                     <button type="button" onClick={() => handleFormat('italic')} className="p-1.5 hover:bg-slate-200 rounded text-slate-600" title="Italic"><Italic className="w-4 h-4"/></button>
                     <button type="button" onClick={() => handleFormat('insertUnorderedList')} className="p-1.5 hover:bg-slate-200 rounded text-slate-600" title="Bullet List"><List className="w-4 h-4"/></button>
                     <button type="button" onClick={insertTable} className="p-1.5 hover:bg-slate-200 rounded text-slate-600" title="Insert Table"><Grid className="w-4 h-4"/></button>
                  </div>
                  <div 
                     ref={editorRef}
                     className="p-3 min-h-[120px] max-h-[200px] overflow-y-auto outline-none text-sm prose prose-sm max-w-none bg-white"
                     contentEditable
                     onInput={(e) => setFormData({ ...formData, description: e.currentTarget.innerHTML })}
                     suppressContentEditableWarning={true}
                  />
               </div>
               <p className="text-[10px] text-slate-400 mt-1">Tip: Click 'Grid' to add a table.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Category</label>
              <select required className="w-full border border-slate-300 p-2 rounded" value={formData.category} onChange={handleCategoryChange}>
                <option value="">Select Category</option>
                {dbCategories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Subcategory</label>
              <select className="w-full border border-slate-300 p-2 rounded" value={formData.subcategory} onChange={e => setFormData({...formData, subcategory: e.target.value})} disabled={!formData.category}>
                <option value="">Select Subcategory</option>
                {availableSubcategories.map((sub, idx) => <option key={idx} value={sub}>{sub}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Vendor</label>
              <select className="w-full border border-slate-300 p-2 rounded" value={formData.vendorId} onChange={e => setFormData({...formData, vendorId: e.target.value})}>
                <option value="">Select Vendor</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
          </div>

          <div className="border rounded-lg p-4 bg-slate-50">
            <div className="flex justify-between items-center mb-4">
               <h3 className="font-semibold text-slate-700 flex items-center gap-2"><ImageIcon className="w-4 h-4"/> Product Gallery</h3>
               <label className="cursor-pointer bg-white border border-slate-300 px-3 py-1 rounded-lg text-sm flex items-center gap-2 hover:bg-slate-100">
                  <Upload className="w-4 h-4" /> Upload Images
                  <input type="file" multiple accept="image/*" className="hidden" onChange={handleMainImageUpload} />
               </label>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2 min-h-[80px]">
               {images.map((img, idx) => (
                  <div key={idx} className="relative group flex-shrink-0">
                     <img src={img} alt="Product" className="w-16 h-16 object-cover rounded-lg border border-slate-200" />
                     <button type="button" onClick={() => setImages(images.filter((_, i) => i !== idx))} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3 h-3" /></button>
                  </div>
               ))}
            </div>
          </div>

          <div className="border rounded-lg p-4 bg-slate-50 overflow-x-auto">
            <div className="flex justify-between items-center mb-4 min-w-[1000px]">
              <h3 className="font-semibold text-slate-700">Product Variants</h3>
              <button type="button" onClick={addVariant} className="text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded flex items-center gap-1"><Plus className="w-4 h-4" /> Add Variant</button>
            </div>
            <div className="space-y-4 min-w-[1300px]">
              {variants.map((variant, index) => (
                <div key={index} className="flex gap-2 items-end border-b border-slate-200 pb-4">
                  <div className="w-12 flex-shrink-0">
                    <div className="relative w-12 h-12 bg-white border rounded cursor-pointer flex items-center justify-center overflow-hidden">
                      {variant.image ? <img src={variant.image} className="w-full h-full object-cover" /> : <Upload className="w-4 h-4" />}
                      <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => handleVariantImageUpload(index, e)} />
                    </div>
                  </div>
                  <div className="w-32 relative">
                    <label className="text-[10px] text-slate-500 mb-1 block uppercase font-bold">Color</label>
                    <button type="button" onClick={() => setOpenColorPicker(index)} className="w-full flex items-center justify-between border border-slate-300 p-1.5 rounded bg-white text-sm">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <div className={`w-4 h-4 rounded-full border border-slate-200 shadow-sm flex-shrink-0`} style={{ background: COLOR_CHOICES.find(c => c.name === variant.color)?.hex || '#fff' }} />
                        <span className="truncate">{variant.color || "Select"}</span>
                      </div>
                      <ChevronDown className="w-3 h-3 text-slate-400 flex-shrink-0" />
                    </button>
                  </div>
                  
                  {/* SIZE */}
                  <div className="w-20"><label className="text-[10px] text-slate-500 uppercase font-bold">Size/Num</label><input className="w-full border border-slate-300 p-1 rounded text-sm" placeholder="M or 42" value={variant.size} onChange={e => handleVariantChange(index, 'size', e.target.value)} /></div>
                  
                  {/* DIMENSIONS */}
                  <div className="w-14"><label className="text-[10px] text-slate-500 uppercase font-bold">Len</label><input type="number" className="w-full border border-slate-300 p-1 rounded text-sm" value={variant.length} onChange={e => handleVariantChange(index, 'length', e.target.value)} /></div>
                  <div className="w-14"><label className="text-[10px] text-slate-500 uppercase font-bold">Wid</label><input type="number" className="w-full border border-slate-300 p-1 rounded text-sm" value={variant.width} onChange={e => handleVariantChange(index, 'width', e.target.value)} /></div>
                  <div className="w-14"><label className="text-[10px] text-slate-500 uppercase font-bold">Hgt</label><input type="number" className="w-full border border-slate-300 p-1 rounded text-sm" value={variant.height} onChange={e => handleVariantChange(index, 'height', e.target.value)} /></div>
                  
                  {/* WEIGHT */}
                  <div className="w-14"><label className="text-[10px] text-slate-500 uppercase font-bold">Wt(kg)</label><input type="number" step="0.1" className="w-full border border-slate-300 p-1 rounded text-sm" value={variant.weight} onChange={e => handleVariantChange(index, 'weight', e.target.value)} /></div>

                  <div className="w-16"><label className="text-[10px] text-slate-500 uppercase font-bold">Stock</label><input type="number" className="w-full border border-slate-300 p-1 rounded text-sm" value={variant.stock} onChange={e => handleVariantChange(index, 'stock', e.target.value)} /></div>
                  
                  {/* PRICING */}
                  <div className="w-20"><label className="text-[10px] text-slate-500 uppercase font-bold">Buy Price</label><input type="number" className="w-full border border-slate-300 p-1 rounded text-sm" value={variant.purchasePrice} onChange={e => handleVariantChange(index, 'purchasePrice', e.target.value)} /></div>
                  
                  <div className="w-14"><label className="text-[10px] text-slate-500 uppercase font-bold">GST %</label><input type="number" className="w-full border border-slate-300 p-1 rounded text-sm" value={variant.gst} onChange={e => handleVariantChange(index, 'gst', e.target.value)} /></div>
                  
                  {/* HSN CODE */}
                  <div className="w-20"><label className="text-[10px] text-slate-500 uppercase font-bold">HSN Code</label><input className="w-full border border-slate-300 p-1 rounded text-sm" placeholder="1234" value={variant.hsn} onChange={e => handleVariantChange(index, 'hsn', e.target.value)} /></div>

                  {/* BASE PRICES */}
                  <div className="w-24">
                      <label className="text-[10px] text-blue-600 uppercase font-bold">Base (Off)</label>
                      <input type="number" className="w-full border border-blue-200 bg-blue-50 p-1 rounded text-sm" value={variant.offlinePrice} onChange={e => handleVariantChange(index, 'offlinePrice', e.target.value)} />
                      <div className="text-[10px] text-slate-400 mt-1">Final: ₹{calcFinal(variant.offlinePrice, variant.gst)}</div>
                  </div>
                  <div className="w-24">
                      <label className="text-[10px] text-emerald-600 uppercase font-bold">Base (On)</label>
                      <input type="number" className="w-full border border-emerald-200 bg-emerald-50 p-1 rounded text-sm" value={variant.onlinePrice} onChange={e => handleVariantChange(index, 'onlinePrice', e.target.value)} />
                      <div className="text-[10px] text-slate-400 mt-1">Final: ₹{calcFinal(variant.onlinePrice, variant.gst)}</div>
                  </div>
                  
                  {/* BARCODE WITH AUTO GENERATE BUTTON */}
                  <div className="flex-1 min-w-[150px]">
                    <label className="text-[10px] text-slate-500 uppercase font-bold">Barcode</label>
                    <div className="flex gap-1">
                        <input className="w-full border border-slate-300 p-1 rounded text-sm" placeholder="Scan..." value={variant.barcode} onChange={e => handleVariantChange(index, 'barcode', e.target.value)} />
                        <button type="button" onClick={() => generateBarcode(index)} className="p-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded border border-slate-300" title="Generate Random Barcode">
                            <RefreshCw className="w-4 h-4" />
                        </button>
                    </div>
                  </div>

                  <div className="pb-1"><button type="button" onClick={() => removeVariant(index)} className="text-red-500 hover:bg-red-50 p-2 rounded"><Trash2 className="w-4 h-4" /></button></div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 py-2 border border-slate-300 rounded-lg">Cancel</button>
            <button type="submit" className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-bold">{productToEdit ? 'Update Product' : 'Save Product'}</button>
          </div>
        </form>
      </div>

      {openColorPicker !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={() => setOpenColorPicker(null)}>
          <div className="bg-white p-5 rounded-2xl shadow-2xl border border-slate-200 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="grid grid-cols-5 gap-3">
              {COLOR_CHOICES.map(c => (
                <button key={c.name} type="button" onClick={() => { handleVariantChange(openColorPicker, 'color', c.name); setOpenColorPicker(null); }} className="flex flex-col items-center gap-2 p-2 hover:bg-slate-50 rounded-xl group transition-all">
                  <div className="relative"><div className={`w-10 h-10 rounded-full shadow-md transition-transform group-hover:scale-110 ${c.border ? 'border border-slate-200' : ''}`} style={{ background: c.hex }} />{variants[openColorPicker].color === c.name && <div className="absolute inset-0 flex items-center justify-center"><Check className="w-5 h-5 text-white drop-shadow-md" /></div>}</div>
                  <span className="text-[11px] font-medium text-slate-600 truncate w-full text-center">{c.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}