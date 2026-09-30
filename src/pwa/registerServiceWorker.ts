/**
 * Registers local Progressive Web App (PWA) Service Worker for offline execution.
 */
export function registerPWA(): void {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('HSFHC ServiceWorker registered with scope: ', registration.scope);
        })
        .catch((err) => {
          console.warn('ServiceWorker registration failed: ', err);
        });
    });
  }
}
