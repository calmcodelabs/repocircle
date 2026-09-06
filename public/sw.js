// RepoCircle service worker — M7, rebuilt M14. Network-first for the HTML shell
// (deploys win), cache-first for hashed immutable assets, best-effort avatars.
// Firestore data is NOT touched here — the SDK owns it.
//
// BUILD_ID is stamped by vite.config.ts at build time. Two things depend on it:
// this file's bytes change every deploy (a byte-identical worker is never
// updated by the browser, so the old one served stale HTML forever), and the
// caches are per-build, so activate() drops the previous shell instead of
// keeping it alive indefinitely.
const BUILD_ID = '__BUILD_ID__';
const SHELL_CACHE = `rc-shell-${BUILD_ID}`;
const ASSET_CACHE = `rc-assets-${BUILD_ID}`;
const AVATAR_CACHE = 'rc-avatars-v1'; // content-addressed by URL; survives deploys
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
          // no-store, or the HTTP cache can hand back HTML up to its max-age old
          // — which pins the page to last deploy's asset hashes.
          const fresh = await fetch(req.url, { cache: 'no-store' });
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
