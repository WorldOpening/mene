const CACHE = 'ledger-v7';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Jost:wght@300;400;500&display=swap'
];

// Install: cache the app shell.
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS).catch(() => c.addAll(['./', './index.html'])))
      .then(() => self.skipWaiting())
  );
});

// Activate: drop old caches.
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

// The app shell is the only thing that changes between releases, so it is
// fetched from the network first and falls back to the cache when offline.
// Everything else stays cache-first.
function isShell(req) {
  if (req.mode === 'navigate') return true;
  const u = new URL(req.url);
  if (u.origin !== self.location.origin) return false;
  return u.pathname.endsWith('/') || u.pathname.endsWith('/index.html') || u.pathname.endsWith('/manifest.json');
}

// The version probe must never be answered from the cache: offline it has to
// fail so the app can say it could not check, rather than claim it is current.
function isVersionProbe(req) {
  const u = new URL(req.url);
  return u.origin === self.location.origin && u.searchParams.has('ts');
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  if (isVersionProbe(e.request)) {
    e.respondWith(fetch(e.request, { cache: 'no-store' }));
    return;
  }

  if (isShell(e.request)) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then(res => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(e.request).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(hit => {
      if (hit) {
        fetch(e.request).then(res => {
          if (res && res.status === 200) {
            caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          }
        }).catch(() => {});
        return hit;
      }

      return fetch(e.request).then(res => {
        if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
