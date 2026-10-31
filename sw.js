/* Dineriko — funciona sin conexión */
const CACHE = 'dineriko-v15';
const SHELL = [
  './',
  './index.html',
  './boot.js?v=15',
  './bundle.js?v=15',
  './bundle-beta.js?v=15',
  './styles.css?v=15',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './apple-touch-icon.png',
  './hucha-d.png',
  './gastos-periodicos.png',
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
  // (solo la app en sí: privacidad.html u oauth.html no deben guardarse como si fueran la app)
  const ruta = new URL(req.url).pathname;
  const esApp = ruta.endsWith('/') || ruta.endsWith('/index.html');
  if (req.mode === 'navigate' && !esApp) return;
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
