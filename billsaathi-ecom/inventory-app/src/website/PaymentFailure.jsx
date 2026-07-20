import React from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { XCircle, RefreshCw } from 'lucide-react';

export default function PaymentFailure() {
  const [searchParams] = useSearchParams();
  const reason = searchParams.get('reason') || 'Transaction declined';

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center bg-slate-50 px-4">
      <div className="bg-white p-8 rounded-3xl shadow-xl text-center max-w-md w-full border border-red-100">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <XCircle className="w-10 h-10 text-red-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Payment Failed</h1>
        <p className="text-slate-500 mb-6">We could not process your payment. Please try again.</p>
        
        <div className="bg-red-50 p-3 rounded-xl border border-red-100 mb-6 text-xs text-red-600 font-medium">
            Reason: {reason}
        </div>

        <div className="space-y-3">
            <Link to="/checkout" className="block w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4" /> Retry Payment
            </Link>
            <Link to="/shop" className="block w-full text-slate-500 font-medium hover:text-slate-800 py-2">
                Cancel
            </Link>
        </div>
      </div>
    </div>
  );
}