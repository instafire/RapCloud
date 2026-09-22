const CACHE = 'rapr-v1';
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/index.html'])));
  self.skipWaiting();
});
self.addEventListener('activate', () => self.clients.claim());
self.addEventListener('fetch', (e) => {
  if (e.request.url.startsWith(self.location.origin) && !e.request.url.includes('/api/')) {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
  }
});
