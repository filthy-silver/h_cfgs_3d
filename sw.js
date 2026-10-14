/**
 * @file sw.js
 * @description Service Worker con estrategia Network-First para navegación y Stale-While-Revalidate para recursos estáticos.
 */

const CACHE_NAME = 'horario-v16';

const STATIC_ASSETS = [
  './',
  './index.html',
  './kanban.html',
  './chat.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './css/styles.css',
  './css/kanban.css',
  './css/chat.css',
  './src/main.js',
  './src/data/schedule.data.js',
  './src/domain/time-tracker.js',
  './src/domain/sanitizer.js',
  './src/domain/subject-matcher.js',
  './src/ui/table-view.js',
  './src/ui/timeline-view.js',
  './src/ui/theme.js',
  './src/ui/calendar-modal.js',
  './src/ui/assignments-view.js',
  './src/ui/admin-modal.js',
  './src/kanban/kanban.js',
  './src/kanban/kanban-store.js',
  './src/kanban/kanban-cards.js',
  './src/kanban/kanban-dnd.js',
  './src/kanban/kanban-notes.js',
  './src/kanban/kanban-sync.js',
  './src/chat/app.js',
  './src/chat/crypto.js',
  './src/chat/p2p.js',
  './src/chat/storage.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Usar cache: 'reload' para forzar la descarga fresca desde la red y evitar HTTP cache antiguo
      const cachePromises = STATIC_ASSETS.map(async (url) => {
        try {
          const response = await fetch(new Request(url, { cache: 'reload' }));
          if (response && response.ok) {
            await cache.put(url, response);
          }
        } catch (err) {
          console.warn('[SW] Fallo al precachear recurso:', url, err);
        }
      });
      await Promise.all(cachePromises);
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
            console.info('[SW] Eliminando caché obsoleta:', key);
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

  // 1. Las peticiones a las APIs (/api/*) van siempre directas a la red
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 2. Navegación (HTML de páginas): Network-First con fallback a la página correspondiente
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;

          // Si la ruta solicitada corresponde al tablero Kanban (/kanban o /kanban.html)
          if (url.pathname.includes('kanban')) {
            const kanbanCached = await caches.match('./kanban.html');
            if (kanbanCached) return kanbanCached;
          }

          // Si la ruta solicitada corresponde al Chat P2P (/chat o /chat.html)
          if (url.pathname.includes('chat')) {
            const chatCached = await caches.match('./chat.html');
            if (chatCached) return chatCached;
          }

          // Fallback predeterminado al horario principal
          return (await caches.match('./index.html')) || (await caches.match('./'));
        })
    );
    return;
  }

  // 3. Recursos estáticos (CSS, JS, iconos): Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
