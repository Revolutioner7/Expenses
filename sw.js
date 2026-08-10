/* Cuaderno de gastos — funciona sin conexión */
const CACHE = 'gastos-v2';
const SHELL = [
  './',
  './index.html',
  './bundle.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // navegación: primero la red, y si no hay, la copia guardada
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((r) => { caches.open(CACHE).then((c) => c.put('./index.html', r.clone())); return r; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // resto: sirve de la caché al momento y actualiza por detrás
  e.respondWith(
    caches.match(req).then((hit) => {
      const red = fetch(req)
        .then((r) => {
          if (r && (r.ok || r.type === 'opaque')) {
            caches.open(CACHE).then((c) => c.put(req, r.clone()));
          }
          return r;
        })
        .catch(() => hit);
      return hit || red;
    })
  );
});
