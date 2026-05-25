const CACHE_NAME = 'cityfind-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/dashboard-admin.html',
  '/dashboard-company.html',
  '/dashboard-provider.html',
  '/dashboard-receiver.html',
  '/product.html'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});
