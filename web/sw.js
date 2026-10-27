// Offline cache for the student app. Bump VERSION on every deploy.
// Update policy: a new version installs in the background and activates the next time the app is fully
// closed and reopened — never in the middle of showing a bag QR (no skipWaiting).
const VERSION = 'hafsmon-v1';
const SHELL = [
  './', 'index.html', 's/', 's/index.html', 'manifest.webmanifest',
  'css/pixel.css', 'css/types.css', 'css/app.css',
  'js/app.js', 'js/config.js', 'js/sb.js', 'js/db.js', 'js/qrfmt.js', 'js/scanner.js', 'js/sprites.js',
  'js/sfx.js', 'js/ui.js', 'js/auth.js',
  'vendor/supabase.js', 'vendor/jsQR.js', 'vendor/qrcode.js',
  'fonts/Galmuri11.woff', 'fonts/Galmuri11-Bold.woff',
  'sprites/atlas.png', 'img/map.png',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;   // Supabase etc. → network only
  // staff pages are online-only tools; don't cache them
  if (/\/(admin|booth|screen)\.html$/.test(url.pathname) || url.pathname.includes('/js/admin') || url.pathname.includes('/js/booth') || url.pathname.includes('/js/screen')) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit;
    if (req.mode === 'navigate') {
      try { return await fetch(req); } catch { return (await cache.match(url.pathname.endsWith('/s/') ? 's/index.html' : 'index.html')) || Response.error(); }
    }
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch { return Response.error(); }
  })());
});
