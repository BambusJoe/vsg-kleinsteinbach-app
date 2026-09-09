// Service Worker – installierbar + offline-tauglich.
// Strategie: HTML/Navigation IMMER frisch aus dem Netz (iOS-Cache umgehen),
// nur als Offline-Fallback der Cache. Statische Assets: network, dann Cache.
const CACHE = 'vsg-app-v5';
const SHELL = ['manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const isHTML = e.request.mode === 'navigate' || e.request.destination === 'document';

  if (isHTML) {
    // Netz zuerst, HTTP-Cache umgehen -> neue Version kommt sofort an.
    e.respondWith(
      fetch(e.request, { cache: 'reload' })
        .then((res) => { const c = res.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)).catch(() => {}); return res; })
        .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
    );
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((res) => { const c = res.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)).catch(() => {}); return res; })
      .catch(() => caches.match(e.request))
  );
});
