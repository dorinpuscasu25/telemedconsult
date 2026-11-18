const STATIC_CACHE = 'telemedconsult-pwa-static-v1';
const OFFLINE_PAGE = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll([OFFLINE_PAGE, '/icons/app-192.png', '/icons/app-512.png'])));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('telemedconsult-pwa-static-') && key !== STATIC_CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (['/icons/app-192.png', '/icons/app-512.png'].includes(url.pathname)) {
    event.respondWith(caches.match(url.pathname).then((cached) => cached || fetch(event.request)));
    return;
  }
  if (event.request.mode !== 'navigate' || /^\/(api|sanctum)(\/|$)/.test(url.pathname)) return;
  event.respondWith(fetch(event.request).catch(async () => (await caches.match(OFFLINE_PAGE)) || new Response('Conectează-te la internet și reîncearcă.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })));
});
