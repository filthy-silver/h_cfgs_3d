const CACHE_NAME = 'horario-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/data.js',
  './js/app.js',
  './icon-192.png',
  './icon-512.png',
  './favicon.svg'
];

// Instalación: precachea recursos esenciales de forma resiliente
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Usamos map con captura individual para evitar fallo atómico si un archivo secundario cambia
      return Promise.allSettled(
        ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`[SW] No se pudo precachear ${url}:`, err);
          })
        )
      );
    })
  );
  self.skipWaiting();
});

// Activación: limpia cachés antiguas y reclama clientes
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null))
      )
    )
  );
  self.clients.claim();
});

// Fetch: Network-First para páginas HTML (para reflejar cambios de horario online)
// y Cache-First con actualización de fondo para recursos estáticos
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Solo peticiones GET http(s)
  if (req.method !== 'GET' || !req.url.startsWith('http')) {
    return;
  }

  // Navegación (HTML principal): Network-First
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          if (networkRes.status === 200) {
            const copy = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return networkRes;
        })
        .catch(() => caches.match('./index.html') || caches.match('./'))
    );
    return;
  }

  // Recursos estáticos (CSS, JS, imágenes): Cache-First con fallback a red
  event.respondWith(
    caches.match(req).then((cachedRes) => {
      if (cachedRes) {
        // En segundo plano revalidamos la caché
        fetch(req).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(req, networkRes));
          }
        }).catch(() => { /* Sin conexión, no pasa nada */ });

        return cachedRes;
      }

      return fetch(req).then((networkRes) => {
        if (networkRes && networkRes.status === 200) {
          const copy = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return networkRes;
      });
    })
  );
});
