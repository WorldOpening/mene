const CACHE = 'ledger-v20';

const ASSETS = [
  './',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Jost:wght@300;400;500&display=swap'
];

// Install: cache the app shell.
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS).catch(() => c.addAll(['./'])))
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

// Microsoft sign-in and Graph must never touch the cache: a cached ledger.json
// would be served over a newer one, and the offline fallback would answer an
// API call with the app's own HTML.
function isApi(req) {
  const h = new URL(req.url).hostname;
  return h === 'graph.microsoft.com' || h === 'login.microsoftonline.com';
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  /* the connection check must always come from the network, never a saved copy */
  const path = new URL(e.request.url).pathname;
  if (path.endsWith('/reset.html') || path.endsWith('/reset')) return;
  if (isApi(e.request)) return;

  if (isVersionProbe(e.request)) {
    e.respondWith(fetch(e.request, { cache: 'no-store' }));
    return;
  }

  if (isShell(e.request)) {
    /* Network first, but a stalled connection gets five seconds before the
       cached copy opens instead. The network fetch keeps going in the
       background and refreshes the cache, so the next open is current. */
    const net = fetch(e.request, { cache: 'no-store' }).then(res => {
      if (res && res.status === 200) {
        const copy = res.clone();
        return caches.open(CACHE).then(c => c.put(e.request, copy)).then(() => res, () => res);
      }
      return res;
    });
    e.waitUntil(net.catch(() => {}));
    const cached = () => caches.match(e.request).then(hit => hit || caches.match('./'));
    e.respondWith(
      Promise.race([
        net.catch(() => null),
        new Promise(r => setTimeout(() => r(null), 5000)),
      ]).then(res => res || cached().then(hit => hit || net))
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
      }).catch(() => caches.match('./'));
    })
  );
});
