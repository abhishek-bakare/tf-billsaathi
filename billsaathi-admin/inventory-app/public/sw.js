// A valid service worker required by Chrome to trigger the Install button
self.addEventListener('install', (e) => {
  self.skipWaiting(); 
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim()); 
});

self.addEventListener('fetch', (e) => {
  // Let the browser handle all network requests normally
});