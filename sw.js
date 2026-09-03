/* Expenses — funciona sin conexión */
const CACHE = 'cosecha-v16';
const SHELL = [
  './',
  './index.html',
  './bundle.js?v=16',
  './styles.css?v=16',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './apple-touch-icon.png',
  './font-bricolage.woff2',
  './font-karla.woff2',
  './font-mono-400.woff2',
  './font-mono-500.woff2',
  './font-mono-600.woff2',
];

/* con cobertura mala no esperamos indefinidamente: a 1,5 s tiramos de la copia local */
const conLimite = (req, ms) => new Promise((ok, ko) => {
  const t = setTimeout(() => ko(new Error('lenta')), ms);
  fetch(req).then((r) => { clearTimeout(t); ok(r); }, (e) => { clearTimeout(t); ko(e); });
});

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
      conLimite(req, 1500)
        .then((r) => { caches.open(CACHE).then((c) => c.put('./index.html', r.clone())); return r; })
        .catch(() => caches.match('./index.html').then((hit) => hit || fetch(req)))
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
