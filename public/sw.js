// RepoCircle service worker — M7. Network-first for the HTML shell (deploys win),
// cache-first for hashed immutable assets, best-effort cache for avatars.
// Firestore data is NOT touched here — the SDK's IndexedDB persistence owns it.
const SHELL_CACHE = 'rc-shell-v1';
const ASSET_CACHE = 'rc-assets-v1';
const AVATAR_CACHE = 'rc-avatars-v1';
const KEEP = new Set([SHELL_CACHE, ASSET_CACHE, AVATAR_CACHE]);

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => !KEEP.has(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(SHELL_CACHE);
          cache.put('shell', fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match('shell');
          return cached ?? Response.error();
        }
      })(),
    );
    return;
  }

  if (url.origin === location.origin && (url.pathname.includes('/assets/') || url.pathname.includes('/fonts/') || url.pathname.includes('/icons/'))) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        const fresh = await fetch(req);
        if (fresh.ok) {
          const cache = await caches.open(ASSET_CACHE);
          cache.put(req, fresh.clone());
        }
        return fresh;
      })(),
    );
    return;
  }

  if (url.hostname === 'avatars.githubusercontent.com') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(AVATAR_CACHE);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(req);
          return cached ?? Response.error();
        }
      })(),
    );
  }
});
