/* Empório A.R — service worker mínimo (PWA) */
const CACHE = 'emporio-ar-shell-v1';
const SHELL = ['/', '/index.html', '/js/app.js', '/js/prices.js', '/manifest.webmanifest', '/assets/logo.jpg', '/assets/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // não cachear Gist / APIs / funções
  if (url.hostname.includes('githubusercontent.com') || url.pathname.startsWith('/.netlify') || url.pathname.startsWith('/api/')) {
    return;
  }
  // network-first para HTML/JS; cache fallback
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match('/')))
    );
  }
});
