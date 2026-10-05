import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Ensure favicon is active in browser tab
(() => {
  try {
    let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
    if (!link) {
      link = document.createElement('link');
      link.type = 'image/png';
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = '/favicon.png';
  } catch {
    // Ignore if not in browser environment
  }
})();

// Intercept known non-fatal Firebase Auth popup/redirect race conditions in iframe environments
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = String(reason?.message || reason || '');
    if (
      msg.includes('Pending promise was never set') ||
      msg.includes('INTERNAL ASSERTION FAILED: Pending promise') ||
      (msg.includes('@firebase/auth') && msg.includes('INTERNAL ASSERTION FAILED'))
    ) {
      console.warn('[SkyOps Auth] Gracefully handled Firebase popup/redirect race condition:', msg);
      event.preventDefault();
      event.stopImmediatePropagation?.();
    }
  });

  window.addEventListener('error', (event) => {
    const msg = String(event.message || event.error?.message || '');
    if (
      msg.includes('Pending promise was never set') ||
      msg.includes('INTERNAL ASSERTION FAILED: Pending promise') ||
      (msg.includes('@firebase/auth') && msg.includes('INTERNAL ASSERTION FAILED'))
    ) {
      console.warn('[SkyOps Auth] Gracefully intercepted internal assertion error:', msg);
      event.preventDefault();
      event.stopImmediatePropagation?.();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
