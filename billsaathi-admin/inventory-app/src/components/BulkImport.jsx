import React, { useState } from 'react';
import { collection, writeBatch, doc, serverTimestamp } from 'firebase/firestore';
import { Upload, FileSpreadsheet, X, Check, AlertCircle, Loader2, Download, Image as ImageIcon } from 'lucide-react';

export default function BulkImport({ db, user, onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [previewData, setPreviewData] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');

  const escapeCsv = (value) => {
    if (value === null || value === undefined) return '';
    const stringValue = String(value);
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  };

  const handleDownloadTemplate = () => {
    const headers = [
      "Product Name", "Description", "Category", "Subcategory", "Vendor Name", 
      "Color", "Size", "SKU", "Stock", 
      "Purchase Price", "Sell Price Off", "Sell Price On", "GST %", "Barcode",
      "Length (cm)", "Width (cm)", "Height (cm)", "Weight (kg)", "Image URL"
    ];
    
    const sample = [
      "Cotton T-Shirt", "Premium cotton tee, standard fit", "Men", "T-Shirts", "ABC Textiles", 
      "Red", "M", "TSH-RED-M", "50", 
      "200", "500", "600", "5", "890123456",
      "10", "10", "2", "0.25", "https://example.com/image.jpg"
    ];
    
    const csvContent = [
      headers.join(","),
      sample.map(escapeCsv).join(",")
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "Inventory_Import_Template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    setError('');

    try {
      let text = await selectedFile.text();
      text = text.replace(/^\uFEFF/, ''); 
      
      const rows = text.split('\n').map(row => row.trim()).filter(row => row);
      
      if (rows.length < 2) {
        setError("File appears to be empty or missing data.");
        return;
      }

      const parseLine = (line) => {
        const result = [];
        let start = 0;
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          if (line[i] === '"') {
            inQuotes = !inQuotes;
          } else if (line[i] === ',' && !inQuotes) {
            let field = line.substring(start, i);
            if (field.startsWith('"') && field.endsWith('"')) {
              field = field.slice(1, -1).replace(/""/g, '"');
            }
            result.push(field.trim());
            start = i + 1;
          }
        }
        let field = line.substring(start);
        if (field.startsWith('"') && field.endsWith('"')) {
          field = field.slice(1, -1).replace(/""/g, '"');
        }
        result.push(field.trim());
        return result;
      };

      const headers = rows[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      const jsonData = [];

      for (let i = 1; i < rows.length; i++) {
        const values = parseLine(rows[i]);
        if (values.length >= 1) { 
          const obj = {};
          headers.forEach((header, index) => {
            obj[header] = values[index] || '';
          });
          jsonData.push(obj);
        }
      }

      const firstRow = jsonData[0];
      if (!firstRow || !firstRow["Product Name"]) {
        setError("Invalid Format. 'Product Name' column is missing. Please use the Template.");
        return;
      }

      setPreviewData(jsonData);
    } catch (err) {
      console.error(err);
      setError("Failed to parse file. Please ensure it is a valid CSV.");
    }
  };

  const handleRowImageUpload = (index, e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const newData = [...previewData];
      newData[index]["Image URL"] = reader.result;
      setPreviewData(newData);
    };
    reader.readAsDataURL(file);
  };

  const processAndUpload = async () => {
    if (!db || previewData.length === 0) return;
    setIsUploading(true);

    try {
      const groupedProducts = {};

      previewData.forEach(row => {
        const name = row["Product Name"]?.trim();
        if (!name) return;

        if (!groupedProducts[name]) {
          const rowImage = row["Image URL"];
          const mainImages = rowImage ? [rowImage] : [];

          groupedProducts[name] = {
            name: name,
            description: row["Description"] || "",
            category: row["Category"] || "General",
            subcategory: row["Subcategory"] || "",
            vendorName: row["Vendor Name"] || "Unknown",
            vendorId: "",
            images: mainImages, 
            variants: [],
            createdAt: serverTimestamp(),
            lastUpdatedBy: user?.uid || 'import'
          };
        }

        groupedProducts[name].variants.push({
          color: row["Color"] || "Standard",
          size: row["Size"] || "Standard",
          sku: row["SKU"] || `GEN-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          stock: Number(row["Stock"]) || 0,
          purchasePrice: Number(row["Purchase Price"]) || 0,
          offlinePrice: Number(row["Sell Price Off"]) || 0,
          onlinePrice: Number(row["Sell Price On"]) || 0,
          gst: Number(row["GST %"]) || 0,
          barcode: row["Barcode"] ? String(row["Barcode"]) : "",
          length: Number(row["Length (cm)"]) || 0, 
          width: Number(row["Width (cm)"]) || 0, 
          height: Number(row["Height (cm)"]) || 0,
          weight: Number(row["Weight (kg)"]) || 0,
          image: row["Image URL"] || "" 
        });
      });

      const productsArray = Object.values(groupedProducts);
      const chunkSize = 400;
      
      for (let i = 0; i < productsArray.length; i += chunkSize) {
        const batch = writeBatch(db);
        const chunk = productsArray.slice(i, i + chunkSize);

        chunk.forEach(product => {
          const collectionPath = (typeof __app_id !== 'undefined') 
            ? `artifacts/${__app_id}/public/data/products` 
            : 'products';
            
          const newDocRef = doc(collection(db, collectionPath));
          batch.set(newDocRef, product);
        });

        await batch.commit();
      }

      alert(`Success! Grouped ${previewData.length} rows into ${productsArray.length} unique products.`);
      if(onSuccess) onSuccess();
      onClose();

    } catch (err) {
      console.error("Import Error:", err);
      setError("Upload failed: " + err.message);
    }
    setIsUploading(false);
  };

  const uniqueProductCount = new Set(previewData.map(r => r["Product Name"]?.trim())).size;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-5xl p-6 shadow-xl relative animate-in zoom-in-95 max-h-[90vh] flex flex-col">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6 flex-shrink-0">
          <div className="bg-green-100 p-2 rounded-lg text-green-600">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Bulk Product Import</h2>
            <p className="text-sm text-slate-500">Upload CSV to add inventory. Use URL or Local Image.</p>
          </div>
        </div>

        {!file ? (
          <div className="space-y-6">
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-12 flex flex-col items-center justify-center text-center hover:bg-slate-50 transition-colors relative">
              <Upload className="w-16 h-16 text-slate-400 mb-4" />
              <p className="text-slate-700 font-bold text-lg">Drag & Drop or Click to Upload</p>
              <p className="text-sm text-slate-500 mt-2">Supports .csv files</p>
              <input 
                type="file" 
                accept=".csv"
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={handleFileUpload}
              />
            </div>

            <div className="bg-blue-50 p-4 rounded-lg flex justify-between items-center">
              <div className="flex items-center gap-3 text-sm text-blue-800">
                <AlertCircle className="w-5 h-5" />
                <span>Use the template to ensure correct format (Dimensions, Images, Prices)</span>
              </div>
              <button 
                onClick={handleDownloadTemplate}
                className="text-xs bg-white border border-blue-200 px-4 py-2 rounded-lg font-bold text-blue-700 hover:bg-blue-100 flex items-center gap-2 shadow-sm"
              >
                <Download className="w-4 h-4" /> Download Template
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-200 mb-4 flex-shrink-0">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="w-6 h-6 text-green-600" />
                <div>
                  <div className="text-sm font-bold text-slate-700">{file.name}</div>
                  <div className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</div>
                </div>
              </div>
              <button onClick={() => { setFile(null); setPreviewData([]); setError(''); }} className="text-slate-400 hover:text-red-500 p-2 hover:bg-white rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="p-4 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2 border border-red-100 mb-4 flex-shrink-0">
                <AlertCircle className="w-5 h-5" /> {error}
              </div>
            )}

            {!error && (
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden flex-1 min-h-0 flex flex-col">
                <div className="overflow-auto flex-1">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-bold border-b sticky top-0 shadow-sm">
                      <tr>
                        <th className="p-3">Name</th>
                        <th className="p-3">Variant</th>
                        <th className="p-3">Stock</th>
                        <th className="p-3">Prices (Off/On)</th>
                        <th className="p-3 text-center">Image (URL or Local)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y text-slate-600">
                      {previewData.map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="p-3 font-medium text-slate-900">{row["Product Name"]}</td>
                          <td className="p-3">{row["Color"]}/{row["Size"]}</td>
                          <td className="p-3">{row["Stock"]}</td>
                          <td className="p-3">
                            <span className="text-blue-600 font-bold"> {row["Sell Price Off"]}</span> / 
                            <span className="text-emerald-600 font-bold"> {row["Sell Price On"]}</span>
                          </td>
                          <td className="p-3 text-center">
                            {row["Image URL"] ? (
                              <div className="w-10 h-10 mx-auto bg-slate-100 rounded overflow-hidden border border-slate-200 relative group">
                                <img src={row["Image URL"]} alt="Preview" className="w-full h-full object-cover" />
                                <button 
                                  className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white"
                                  onClick={() => {
                                    const newData = [...previewData];
                                    newData[i]["Image URL"] = "";
                                    setPreviewData(newData);
                                  }}
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <label className="cursor-pointer text-blue-600 hover:underline flex items-center justify-center gap-1">
                                <ImageIcon className="w-4 h-4" /> Upload
                                <input 
                                  type="file" 
                                  accept="image/*" 
                                  className="hidden" 
                                  onChange={(e) => handleRowImageUpload(i, e)}
                                />
                              </label>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="p-3 text-center text-xs text-slate-500 bg-slate-50 border-t flex-shrink-0 flex justify-between px-6">
                  <span>Total Variants: {previewData.length}</span>
                  <span className="font-bold text-blue-600">Will create {uniqueProductCount} Grouped Products</span>
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-6 flex-shrink-0">
              <button onClick={onClose} className="flex-1 py-3 border border-slate-300 rounded-xl text-slate-600 hover:bg-slate-50 font-bold">Cancel</button>
              <button 
                onClick={processAndUpload}
                disabled={isUploading || !!error}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                {isUploading ? 'Confirm & Import' : 'Confirm & Import'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}