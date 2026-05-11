/* ========================================
   DODGE BLITZ - Service Worker
   Permite funcionamiento offline (PWA)
   ======================================== */

const CACHE_NAME = 'dodge-blitz-v1';

// Archivos que se guardan en caché para uso offline
const ARCHIVOS_CACHE = [
  './',
  './index.html',
  './style.css',
  './game.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap'
];

// Instalación: guarda todos los archivos en caché
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ARCHIVOS_CACHE).catch(err => {
        // Si algún archivo falla (ej: fuente), continúa igual
        console.warn('Algunos archivos no se cachearon:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activación: limpia cachés antiguas
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(claves => {
      return Promise.all(
        claves
          .filter(clave => clave !== CACHE_NAME)
          .map(clave => caches.delete(clave))
      );
    })
  );
  self.clients.claim();
});

// Fetch: sirve desde caché si está disponible, si no va a la red
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(respuestaCacheada => {
      if (respuestaCacheada) return respuestaCacheada;
      return fetch(event.request).then(respuestaRed => {
        // Guardar en caché la nueva respuesta
        if (respuestaRed && respuestaRed.status === 200) {
          const respuestaClonada = respuestaRed.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, respuestaClonada);
          });
        }
        return respuestaRed;
      }).catch(() => {
        // Sin red y sin caché: nada que hacer
        return new Response('Sin conexión', { status: 503 });
      });
    })
  );
});
