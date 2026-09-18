declare global {
  interface Window {
    Razorpay?: any;
  }
}

export interface RazorpayPaymentSuccessResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface LaunchRazorpayOptions {
  key: string;
  amount: number; // in paise (e.g. 500000 for ₹5,000)
  currency?: string;
  name?: string;
  description?: string;
  order_id: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, string>;
  themeColor?: string;
}

/**
 * Dynamically loads the official Razorpay Standard Checkout SDK
 */
export async function loadRazorpayCheckoutScript(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (window.Razorpay) return true;

  return new Promise((resolve) => {
    const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      resolve(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

/**
 * Triggers the native Razorpay modal dialog and awaits user completion
 */
export async function openRazorpayCheckout(
  options: LaunchRazorpayOptions
): Promise<RazorpayPaymentSuccessResponse> {
  const loaded = await loadRazorpayCheckoutScript();
  if (!loaded || !window.Razorpay) {
    throw new Error('Unable to load Razorpay payment gateway script. Please verify your connection.');
  }

  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: options.key,
      amount: options.amount,
      currency: options.currency || 'INR',
      name: options.name || 'SkyOps',
      description: options.description || 'SkyOps Cloud Subscription',
      order_id: options.order_id,
      prefill: options.prefill,
      notes: options.notes,
      theme: {
        color: options.themeColor || '#0284c7'
      },
      modal: {
        ondismiss: () => {
          reject(new Error('PAYMENT_CANCELLED'));
        }
      },
      handler: (response: RazorpayPaymentSuccessResponse) => {
        resolve(response);
      }
    });

    rzp.on('payment.failed', (response: any) => {
      reject(new Error(response?.error?.description || 'Payment processing failed'));
    });

    rzp.open();
  });
}
