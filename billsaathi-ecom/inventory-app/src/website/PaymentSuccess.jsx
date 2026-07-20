import React, { useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle, ArrowRight, Package } from 'lucide-react';

export default function PaymentSuccess({ clearCart }) {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('orderId');

  useEffect(() => {
    // Clear the cart once payment is confirmed success
    if (clearCart) clearCart();
  }, [clearCart]);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center bg-slate-50 px-4">
      <div className="bg-white p-8 rounded-3xl shadow-xl text-center max-w-md w-full border border-emerald-100">
        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-10 h-10 text-emerald-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Payment Successful!</h1>
        <p className="text-slate-500 mb-6">Thank you for your purchase. Your order has been placed successfully.</p>
        
        {orderId && (
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 mb-6 font-mono text-sm text-slate-600">
                Order ID: {orderId}
            </div>
        )}

        <div className="space-y-3">
            <Link to="/orders" className="block w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                <Package className="w-4 h-4" /> View My Orders
            </Link>
            <Link to="/shop" className="block w-full text-slate-500 font-medium hover:text-slate-800 py-2">
                Continue Shopping
            </Link>
        </div>
      </div>
    </div>
  );
}