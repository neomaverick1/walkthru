// Offline support for the installed web app.
// Pages: network first, cached copy when offline. Hashed build files, fonts and demo photos: cache first.
// The APK and the speed-test file always come from the network.
const CACHE = 'walkthru-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest', './favicon.svg', './apple-touch-icon.png', './fonts/Archivo-ExpandedBold.ttf', './fonts/Archivo-SemiBold.ttf', './fonts/PublicSans-Regular.ttf', './fonts/PublicSans-SemiBold.ttf'])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req)) || (await cache.match('./index.html'));
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.endsWith('.apk') || url.pathname.endsWith('.bin')) return;
  if (req.mode === 'navigate') e.respondWith(networkFirst(req));
  else if (url.pathname.includes('/assets/') || /\.(woff2?|png|svg|ttf|jpg|webp)$/.test(url.pathname)) e.respondWith(cacheFirst(req));
});
