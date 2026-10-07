/**
 * @file sw.js
 * @description Service Worker con estrategia Cache-First para estáticos y Network-First para APIs.
 */

const CACHE_NAME = 'horario-v3';

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './css/styles.css',
  './src/main.js',
  './src/data/schedule.data.js',
  './src/domain/time-tracker.js',
  './src/ui/table-view.js',
  './src/ui/timeline-view.js',
  './src/ui/theme.js',
  './src/ui/calendar-modal.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Las peticiones al endpoint de calendario (/api/*) van siempre directas a la red
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Estrategia Cache First con fallback a Network para assets de la app
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      });
    }).catch(() => {
      // Fallback para navegación offline
      if (event.request.mode === 'navigate') {
        return caches.match('./index.html');
      }
    })
  );
});
