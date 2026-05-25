// Service Worker for City Find PWA
const CACHE_NAME = 'cityfind-v1.0.0';
const STATIC_CACHE = 'cityfind-static-v1';
const DYNAMIC_CACHE = 'cityfind-dynamic-v1';

// Files to cache on install
const STATIC_FILES = [
    '/',
    '/index.html',
    '/dashboard-admin.html',
    '/dashboard-company.html',
    '/dashboard-provider.html',
    '/dashboard-receiver.html',
    '/product.html',
    '/manifest.json',
    '/icons/icon-72x72.png',
    '/icons/icon-96x96.png',
    '/icons/icon-128x128.png',
    '/icons/icon-144x144.png',
    '/icons/icon-152x152.png',
    '/icons/icon-192x192.png',
    '/icons/icon-384x384.png',
    '/icons/icon-512x512.png'
];

// External CDN resources to cache
const EXTERNAL_FILES = [
    'https://cdn.tailwindcss.com',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdn.socket.io/4.6.2/socket.io.min.js',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js'
];

// Install event - cache static files
self.addEventListener('install', event => {
    console.log('[Service Worker] Installing...');
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => {
                console.log('[Service Worker] Caching static files');
                return cache.addAll(STATIC_FILES);
            })
            .then(() => {
                // Cache external resources
                return caches.open(DYNAMIC_CACHE);
            })
            .then(cache => {
                console.log('[Service Worker] Caching external resources');
                return cache.addAll(EXTERNAL_FILES);
            })
            .then(() => {
                console.log('[Service Worker] Installation complete');
                return self.skipWaiting();
            })
            .catch(err => console.error('[Service Worker] Cache error:', err))
    );
});

// Activate event - clean old caches
self.addEventListener('activate', event => {
    console.log('[Service Worker] Activating...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
                        console.log('[Service Worker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('[Service Worker] Claiming clients');
            return self.clients.claim();
        })
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);
    
    // Skip non-GET requests and external cross-origin
    if (event.request.method !== 'GET') return;
    
    // Skip API calls (don't cache them)
    if (requestUrl.pathname.startsWith('/api/')) {
        return;
    }
    
    // Skip socket.io
    if (requestUrl.pathname.includes('/socket.io/')) {
        return;
    }
    
    // For static files - cache first
    if (STATIC_FILES.includes(requestUrl.pathname)) {
        event.respondWith(
            caches.match(event.request)
                .then(cachedResponse => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    return fetch(event.request)
                        .then(response => {
                            const responseClone = response.clone();
                            caches.open(STATIC_CACHE)
                                .then(cache => {
                                    cache.put(event.request, responseClone);
                                });
                            return response;
                        });
                })
        );
        return;
    }
    
    // For other resources - network first with cache fallback
    event.respondWith(
        fetch(event.request)
            .then(response => {
                const responseClone = response.clone();
                caches.open(DYNAMIC_CACHE)
                    .then(cache => {
                        cache.put(event.request, responseClone);
                    });
                return response;
            })
            .catch(() => {
                return caches.match(event.request);
            })
    );
});

// Handle offline fallback for navigation requests
self.addEventListener('fetch', event => {
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .catch(() => {
                    return caches.match('/index.html');
                })
        );
    }
});

// Background sync for pending actions
self.addEventListener('sync', event => {
    console.log('[Service Worker] Background sync:', event.tag);
    if (event.tag === 'sync-orders') {
        event.waitUntil(syncOrders());
    }
});

async function syncOrders() {
    console.log('[Service Worker] Syncing pending orders...');
    // Add your sync logic here
}

// Push notification handling
self.addEventListener('push', event => {
    const data = event.data.json();
    const options = {
        body: data.body || 'New update from City Find',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-96x96.png',
        vibrate: [200, 100, 200],
        data: {
            url: data.url || '/'
        }
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title || 'City Find', options)
    );
});

// Notification click handler
self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow(event.notification.data.url)
    );
});
