// Cachea la app para que abra sin internet (stale-while-revalidate: sirve del caché y actualiza al fondo).
// Las llamadas a Google (otro origen) NO pasan por aquí.
const V = 'evidencias-v3';
const ARCHIVOS = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'js/app.js', 'js/config.js', 'js/db.js', 'js/google.js', 'js/orden.js', 'js/parser.js', 'js/sync.js',
  'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(ARCHIVOS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const red = fetch(e.request)
        .then((r) => {
          if (r.ok) caches.open(V).then((c) => c.put(e.request, r.clone()));
          return r;
        })
        .catch(() => hit);
      return hit || red;
    })
  );
});