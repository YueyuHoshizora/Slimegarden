importScripts('./sw-assets.js');

const CACHE_PREFIX = 'slimegarden-runtime-';
const CACHE_NAME = `${CACHE_PREFIX}${self.SW_VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(self.SW_ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const url = new URL(request.url);
    const cached = await cache.match(request);
    if (cached) return cached;

    if (request.mode === 'navigate') {
      const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
      const pathRequest = new Request(new URL(pathname, self.location.origin));
      const cachedPage = await cache.match(pathRequest);
      if (cachedPage) return cachedPage;
    }

    try {
      return await fetch(request);
    } catch (error) {
      if (request.mode === 'navigate') {
        const fallback = await cache.match('/index.html');
        if (fallback) return fallback;
      }
      throw error;
    }
  })());
});
