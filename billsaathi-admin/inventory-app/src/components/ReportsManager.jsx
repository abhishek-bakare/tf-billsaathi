import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, orderBy, where, Timestamp } from 'firebase/firestore';
import { 
  FileSpreadsheet, Calendar, Download, Loader2, BarChart3, Package, Users, ShoppingBag, ShieldAlert
} from 'lucide-react';

export default function ReportsManager({ db, user }) {
  const [reportType, setReportType] = useState('sales'); 
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  
  // Auth State
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);

  // Check Permissions (Owner Only)
  useEffect(() => {
    if (user) {
        user.getIdTokenResult().then(idTokenResult => {
            // If 'staff' claim exists, it's a staff member -> Block access
            // If no 'staff' claim, it's the Owner -> Allow access
            setIsAuthorized(!idTokenResult.claims.staff);
            setAuthChecking(false);
        }).catch(err => {
            console.error("Claims Check Error:", err);
            setAuthChecking(false);
        });
    }
  }, [user]);

  if (authChecking) return <div className="p-10 text-center text-slate-500">Verifying access...</div>;

  if (!isAuthorized) {
      return (
          <div className="flex h-full items-center justify-center bg-slate-50">
              <div className="text-center p-8 bg-white rounded-2xl shadow-sm border border-slate-200 max-w-sm">
                  <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                      <ShieldAlert className="w-8 h-8" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-800 mb-2">Restricted Access</h2>
                  <p className="text-slate-500 text-sm">Financial Reports are only available to the Store Owner.</p>
              </div>
          </div>
      );
  }

  // --- HELPER: CONVERT TO CSV & DOWNLOAD ---
  const downloadCSV = (data, filename) => {
    if (!data || data.length === 0) {
        alert("No data to export.");
        return;
    }

    const headers = Object.keys(data[0]);
    const csvRows = [
        headers.join(','),
        ...data.map(row => headers.map(fieldName => {
            let val = row[fieldName];
            if (val === null || val === undefined) val = '';
            if (typeof val === 'string') {
                val = `"${val.replace(/"/g, '""')}"`;
            }
            return val;
        }).join(','))
    ];

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- REPORT GENERATORS ---

  const generateSalesReport = async () => {
    setLoading(true);
    try {
        const start = new Date(startDate); start.setHours(0,0,0,0);
        const end = new Date(endDate); end.setHours(23,59,59,999);

        const collectionPath = (typeof __app_id !== 'undefined') ? `artifacts/${__app_id}/public/data/orders` : 'orders';
        const q = query(
            collection(db, collectionPath), 
            where('date', '>=', start),
            where('date', '<=', end),
            orderBy('date', 'desc')
        );

        const snapshot = await getDocs(q);
        const reportData = snapshot.docs.map(doc => {
            const d = doc.data();
            return {
                "Order ID": d.id || doc.id,
                "Date": d.date?.seconds ? new Date(d.date.seconds * 1000).toLocaleDateString() : '',
                "Customer Name": d.customerName || '',
                "Mobile": d.customerMobile || '',
                "Email": d.customerEmail || '',
                "Source": d.source || 'Offline',
                "Status": d.status || '',
                "Payment Mode": d.paymentMethod || 'Cash',
                "Total Amount": d.grandTotal || 0,
                "Paid Amount": d.paidAmount || 0,
                "Due Amount": d.dueAmount || 0,
                "Discount": d.discount || 0,
                "Shipping Cost": d.shipping || 0,
                "Coupon": d.couponCode || ''
            };
        });

        downloadCSV(reportData, "Sales_Report");

    } catch (error) {
        console.error("Sales Report Error:", error);
        if (error.code === 'permission-denied') {
            alert("Access Denied: Your account is not recognized as Admin by the database rules.\n\nFix: Ensure 'settings/subscription' document exists and 'adminEmail' matches your login.");
        } else if (error.code === 'failed-precondition') {
            alert("Database Index Missing. Please check the console for the creation link.");
        } else {
            alert("Failed to generate report: " + error.message);
        }
    }
    setLoading(false);
  };

  const generateInventoryReport = async () => {
    setLoading(true);
    try {
        const collectionPath = (typeof __app_id !== 'undefined') ? `artifacts/${__app_id}/public/data/products` : 'products';
        const snapshot = await getDocs(collection(db, collectionPath));
        
        const reportData = [];
        snapshot.forEach(doc => {
            const p = doc.data();
            if (p.variants && p.variants.length > 0) {
                p.variants.forEach(v => {
                    reportData.push({
                        "Product Name": p.name,
                        "Description": p.description || '',
                        "Category": p.category,
                        "Subcategory": p.subcategory || '',
                        "Vendor": p.vendorName || '',
                        "Variant (Color/Size)": `${v.color}/${v.size}`,
                        "SKU": v.sku || '',
                        "Barcode": v.barcode || '',
                        "HSN Code": v.hsn || '',
                        "Stock": v.stock || 0,
                        "Purchase Price": v.purchasePrice || 0,
                        "Offline Price": v.offlinePrice || 0,
                        "Online Price": v.onlinePrice || 0,
                        "GST %": v.gst || 0,
                        "Weight (kg)": v.weight || 0,
                        "Length (cm)": v.length || 0,
                        "Width (cm)": v.width || 0,
                        "Height (cm)": v.height || 0,
                        "Image Link": v.image || (p.images ? p.images[0] : ''),
                        "Total Value (Cost)": (Number(v.stock || 0) * Number(v.purchasePrice || 0)).toFixed(2)
                    });
                });
            }
        });

        downloadCSV(reportData, "Inventory_Full_Report");
    } catch (error) {
        console.error("Inventory Report Error:", error);
        if (error.code === 'permission-denied') {
            alert("Access Denied: You do not have permission to view Products.");
        } else {
            alert("Failed to generate report: " + error.message);
        }
    }
    setLoading(false);
  };

  const generateCustomerReport = async () => {
    setLoading(true);
    try {
        const isCanvas = typeof __app_id !== 'undefined';
        const offlinePath = isCanvas ? `artifacts/${__app_id}/public/data/customers` : 'customers';
        const onlinePath = isCanvas ? `artifacts/${__app_id}/public/data/website_users` : 'website_users';

        let offlineSnap = { docs: [] };
        let onlineSnap = { docs: [] };

        try { offlineSnap = await getDocs(collection(db, offlinePath)); } catch(e) {}
        try { onlineSnap = await getDocs(collection(db, onlinePath)); } catch(e) {}

        const reportData = [];
        const process = (doc, type) => {
            const d = doc.data();
            reportData.push({
                "Name": d.name || 'Unknown',
                "Mobile": d.mobile || d.phone || '',
                "Email": d.email || '',
                "Type": type,
                "Wallet Balance": d.wallet_credit_balance || 0,
                "Pending Due": d.total_due_amount || 0,
                "Address": d.address || '',
                "Joined Date": d.createdAt?.seconds ? new Date(d.createdAt.seconds * 1000).toLocaleDateString() : ''
            });
        };

        offlineSnap.docs.forEach(doc => process(doc, 'Offline'));
        onlineSnap.docs.forEach(doc => process(doc, 'Online'));

        downloadCSV(reportData, "Customer_Ledger_Report");
    } catch (error) {
        console.error("Customer Report Error:", error);
        alert("Failed to generate report: " + error.message);
    }
    setLoading(false);
  };

  const handleGenerate = () => {
      if (reportType === 'sales') generateSalesReport();
      else if (reportType === 'inventory') generateInventoryReport();
      else if (reportType === 'customers') generateCustomerReport();
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-8 py-4">
        <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
           <BarChart3 className="w-6 h-6 text-blue-600" /> Reports & Analytics
        </h2>
      </div>

      <div className="p-8 max-w-4xl">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-8">
            <h3 className="text-lg font-bold text-slate-800 mb-6">Generate New Report</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div 
                    onClick={() => setReportType('sales')}
                    className={`cursor-pointer border-2 rounded-xl p-4 flex flex-col items-center gap-2 transition-all ${reportType === 'sales' ? 'border-blue-600 bg-blue-50' : 'border-slate-100 hover:border-slate-300'}`}
                >
                    <ShoppingBag className={`w-8 h-8 ${reportType === 'sales' ? 'text-blue-600' : 'text-slate-400'}`} />
                    <span className={`font-bold ${reportType === 'sales' ? 'text-blue-700' : 'text-slate-600'}`}>Sales Report</span>
                </div>

                <div 
                    onClick={() => setReportType('inventory')}
                    className={`cursor-pointer border-2 rounded-xl p-4 flex flex-col items-center gap-2 transition-all ${reportType === 'inventory' ? 'border-purple-600 bg-purple-50' : 'border-slate-100 hover:border-slate-300'}`}
                >
                    <Package className={`w-8 h-8 ${reportType === 'inventory' ? 'text-purple-600' : 'text-slate-400'}`} />
                    <span className={`font-bold ${reportType === 'inventory' ? 'text-purple-700' : 'text-slate-600'}`}>Inventory Value</span>
                </div>

                <div 
                    onClick={() => setReportType('customers')}
                    className={`cursor-pointer border-2 rounded-xl p-4 flex flex-col items-center gap-2 transition-all ${reportType === 'customers' ? 'border-emerald-600 bg-emerald-50' : 'border-slate-100 hover:border-slate-300'}`}
                >
                    <Users className={`w-8 h-8 ${reportType === 'customers' ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <span className={`font-bold ${reportType === 'customers' ? 'text-emerald-700' : 'text-slate-600'}`}>Customer Ledger</span>
                </div>
            </div>

            {reportType === 'sales' && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-8 animate-in fade-in">
                    <h4 className="text-sm font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
                        <Calendar className="w-4 h-4" /> Date Range
                    </h4>
                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="text-xs text-slate-500 mb-1 block">From</label>
                            <input type="date" className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                        </div>
                        <div className="flex-1">
                            <label className="text-xs text-slate-500 mb-1 block">To</label>
                            <input type="date" className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                        </div>
                    </div>
                </div>
            )}

            <button 
                onClick={handleGenerate}
                disabled={loading}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 disabled:opacity-70 transition-all shadow-lg shadow-slate-200"
            >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                {loading ? 'Generating...' : 'Download Report (CSV)'}
            </button>
            <p className="text-center text-xs text-slate-400 mt-4">The downloaded file can be opened in Microsoft Excel, Google Sheets, or Numbers.</p>
        </div>
      </div>
    </div>
  );
}