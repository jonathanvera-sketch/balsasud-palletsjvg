/* ============================================================
   BALSASUD · Service Worker
   Estrategia: app shell precacheado + red primero para código.
   La aplicación funciona sin conexión una vez cargada.
   ============================================================ */

const VERSION = 'balsasud-v2.3.5';
const CORE = [
  './',
  './index.html',
  './styles.css?v=2.3.5',
  './api.js?v=2.3.5',
  './data.js?v=2.3.5',
  './engine.js?v=2.3.5',
  './tally.js?v=2.3.5',
  './ui.js?v=2.3.5',
  './app.js?v=2.3.5',
  './manifest.webmanifest',
  './icon.svg'
];

async function clearOldCaches() {
  const keys = await caches.keys();
  return Promise.all(keys.map(k => caches.delete(k)));
}

self.addEventListener('install', event => {
  event.waitUntil(
    clearOldCaches()
      .then(() => caches.open(VERSION))
      .then(cache => cache.addAll(CORE))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('Precarga incompleta', err))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isCode = /\.(js|css|html|webmanifest)(\?.*)?$/i.test(url.pathname + (url.search || ''));

  // Navegación y archivos de código: red primero, respaldo en caché (offline).
  if (request.mode === 'navigate' || isCode) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then(cache => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(request).then(hit => hit || caches.match('./index.html').then(h => h || caches.match('./'))))
    );
    return;
  }

  // Resto de recursos (fuentes, imágenes, etc.): caché primero.
  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then(cache => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
