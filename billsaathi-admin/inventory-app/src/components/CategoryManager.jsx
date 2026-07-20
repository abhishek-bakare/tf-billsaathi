import React, { useState, useEffect } from 'react';
import { 
  collection, addDoc, deleteDoc, doc, updateDoc, onSnapshot, arrayUnion, arrayRemove, query, orderBy 
} from 'firebase/firestore';
import { Plus, Trash2, ChevronRight, FolderPlus } from 'lucide-react';

export default function CategoryManager({ db }) {
  const [categories, setCategories] = useState([]);
  const [newCategory, setNewCategory] = useState('');
  const [newSubcategory, setNewSubcategory] = useState('');
  const [activeCategoryId, setActiveCategoryId] = useState(null);

  // Page Title
    useEffect(() => {
      document.title = "Manage categories and subcategories | Drushya Store";
    }, []);

  // Fetch Categories from DB
  useEffect(() => {
    if (!db) return;
    // Helper to get collection path (supports your local + canvas env)
    const collectionRef = (typeof __app_id !== 'undefined') 
        ? collection(db, 'artifacts', __app_id, 'public', 'data', 'categories') 
        : collection(db, 'categories');

    const q = query(collectionRef, orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [db]);

  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCategory.trim()) return;
    
    try {
      const collectionRef = (typeof __app_id !== 'undefined') 
        ? collection(db, 'artifacts', __app_id, 'public', 'data', 'categories') 
        : collection(db, 'categories');

      await addDoc(collectionRef, {
        name: newCategory.trim(),
        subcategories: []
      });
      setNewCategory('');
    } catch (error) {
      console.error("Error adding category:", error);
      alert("Error adding category: " + error.message);
    }
  };

  const handleDeleteCategory = async (id) => {
    if (!confirm("Delete this category and all its subcategories?")) return;
    try {
      const docPath = (typeof __app_id !== 'undefined') 
        ? `artifacts/${__app_id}/public/data/categories/${id}` 
        : `categories/${id}`;
        
      await deleteDoc(doc(db, docPath));
      if (activeCategoryId === id) setActiveCategoryId(null);
    } catch (error) {
      console.error("Error deleting category:", error);
    }
  };

  const handleAddSubcategory = async (e) => {
    e.preventDefault();
    if (!activeCategoryId || !newSubcategory.trim()) return;
    try {
      const docPath = (typeof __app_id !== 'undefined') 
        ? `artifacts/${__app_id}/public/data/categories/${activeCategoryId}` 
        : `categories/${activeCategoryId}`;

      await updateDoc(doc(db, docPath), {
        subcategories: arrayUnion(newSubcategory.trim())
      });
      setNewSubcategory('');
    } catch (error) {
      console.error("Error adding subcategory:", error);
    }
  };

  const handleDeleteSubcategory = async (categoryId, sub) => {
    try {
      const docPath = (typeof __app_id !== 'undefined') 
        ? `artifacts/${__app_id}/public/data/categories/${categoryId}` 
        : `categories/${categoryId}`;

      await updateDoc(doc(db, docPath), {
        subcategories: arrayRemove(sub)
      });
    } catch (error) {
      console.error("Error deleting subcategory:", error);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full p-1">
      {/* Categories List */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <h3 className="font-semibold text-slate-700">Categories</h3>
        </div>
        
        <div className="p-4 border-b border-slate-200">
          <form onSubmit={handleAddCategory} className="flex gap-2">
            <input 
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="New Category Name..."
              value={newCategory}
              onChange={e => setNewCategory(e.target.value)}
            />
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg">
              <Plus className="w-5 h-5" />
            </button>
          </form>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {categories.map(cat => (
            <div 
              key={cat.id} 
              onClick={() => setActiveCategoryId(cat.id)}
              className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${activeCategoryId === cat.id ? 'bg-blue-50 border-blue-200 border' : 'hover:bg-slate-50 border border-transparent'}`}
            >
              <span className={`font-medium ${activeCategoryId === cat.id ? 'text-blue-700' : 'text-slate-700'}`}>{cat.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 bg-white px-2 py-0.5 rounded border">{cat.subcategories?.length || 0} sub</span>
                <button 
                  onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat.id); }}
                  className="text-slate-400 hover:text-red-500 p-1"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <ChevronRight className={`w-4 h-4 ${activeCategoryId === cat.id ? 'text-blue-500' : 'text-slate-300'}`} />
              </div>
            </div>
          ))}
          {categories.length === 0 && <div className="text-center py-10 text-slate-400 text-sm">No categories yet.</div>}
        </div>
      </div>

      {/* Subcategories List */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <h3 className="font-semibold text-slate-700">
            {activeCategoryId ? `Subcategories for "${categories.find(c => c.id === activeCategoryId)?.name}"` : 'Select a Category'}
          </h3>
        </div>

        {activeCategoryId ? (
          <>
            <div className="p-4 border-b border-slate-200">
              <form onSubmit={handleAddSubcategory} className="flex gap-2">
                <input 
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="New Subcategory..."
                  value={newSubcategory}
                  onChange={e => setNewSubcategory(e.target.value)}
                />
                <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-lg">
                  <Plus className="w-5 h-5" />
                </button>
              </form>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {categories.find(c => c.id === activeCategoryId)?.subcategories?.map((sub, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-slate-700">{sub}</span>
                  <button 
                    onClick={() => handleDeleteSubcategory(activeCategoryId, sub)}
                    className="text-slate-400 hover:text-red-500 p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {(!categories.find(c => c.id === activeCategoryId)?.subcategories?.length) && (
                <div className="text-center py-10 text-slate-400 text-sm">No subcategories yet.</div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <FolderPlus className="w-12 h-12 mb-2 opacity-20" />
            <p>Select a category to manage subcategories</p>
          </div>
        )}
      </div>
    </div>
  );
}