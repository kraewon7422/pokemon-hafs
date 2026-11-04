// Offline cache for the student app. Bump VERSION on every deploy.
// Update policy: a new version installs in the background; the app tells it to take over (message 'skipWaiting')
// at start-up or when the student taps "새 버전 적용" — never while a bag QR is on screen.
const VERSION = 'hafsmon-v56';
// 운영자가 올린 포켓몬 그림 (Supabase Storage, 0031): 파일 이름이 올릴 때마다 바뀌므로 한 번 받으면 계속 씀 (버전과 따로 보관)
const SPRITES = 'hafsmon-sprites';
// 배경 음악 (web/audio/, 합쳐 약 9MB): 설치 때 받지 않음 (CORE 아님). 처음 틀 때 받아서 따로 보관 → 버전을 올려도 다시 받지 않음.
//   파일을 바꿀 땐 이름을 바꿈 (sfx.js TRACKS). 오프라인이면 받아 둔 곡만 나옴
const AUDIO = 'hafsmon-audio-1';
// 설치할 때 바로 받는 것 = 첫 화면(로그인·홈)에 필요한 것만 (약 1MB)
const CORE = [
  './', 's/', 'manifest.webmanifest',   // not index.html: Cloudflare Pages redirects it, and a redirected response can't answer a navigation
  'css/pixel.css', 'css/types.css', 'css/app.css',
  'js/app.js', 'js/state.js', 'js/dex.js', 'js/raid.js', 'js/battle.js', 'js/login.js', 'js/bag.js', 'js/games/hub.js', 'js/games/common.js',
  'js/eggs.js', 'js/config.js', 'js/sb.js', 'js/db.js', 'js/qrfmt.js', 'js/scanner.js', 'js/sprites.js', 'js/gif.js', 'js/sfx.js', 'js/ui.js', 'js/auth.js',
  'vendor/supabase.js', 'vendor/qrcode.js',
  'fonts/Galmuri11.woff', 'fonts/Galmuri11-Bold.woff',
  'sprites/atlas.png', 'sprites/pk-index.js', 'img/clubs/watson.png', 'img/clubs/decfi.png', 'img/title/sky.png', 'img/title/grass.png', 'img/items.png',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];
// 첫 화면이 뜬 뒤 뒤에서 받는 것 (QR 카메라·지도·배틀·미니게임) — 다 받으면 미니게임까지 인터넷 없이 됨
const EXTRA = [
  // 포켓몬 그림판 (보통 4장 먼저, 다음 색이 다른 4장 — 장 수를 바꾸면 여기도)
  ...['n', 's'].flatMap((k) => [0, 1, 2, 3].map((i) => `sprites/pk-${k}${i}.webp`)),
  'vendor/jsQR.js', 'img/map.webp', 'img/eggs.png', 'js/catch.js', 'js/safari.js', 'js/safari-maps.js', 'img/safari-tiles.png', 'img/safari-tiles.js', 'img/safari-hero.png', 'img/safari-keeper.png', 'img/catch/day.png', 'img/catch/sunset.png', 'img/catch/night.png', 'img/fx/status.png',
  ...['plains', 'forest', 'beach', 'desert', 'snowy', 'underground', 'underwater'].map((n) => `img/battle/${n}.png`),
  'js/games/surf.js', 'js/games/dodge.js', 'js/games/maze.js', 'js/games/land.js', 'js/games/cross.js', 'img/games/cross/cross-props.png',
  'vendor/phaser.min.js', 'img/games/dodge/dodge-bg.png', 'img/games/surf/surf-props.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)));
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
  // 첫 화면이 뜬 뒤 앱이 보냄: 아직 없는 EXTRA 를 하나씩 받아 둠 (실패한 건 다음에 다시)
  if (e.data === 'warm') e.waitUntil(caches.open(VERSION).then(async (c) => {
    for (const u of EXTRA) {
      if (await c.match(u)) continue;
      try { const r = await fetch(u); if (r.ok) await c.put(u, r); } catch { /* 오프라인: 다음 기회에 */ }
    }
  }));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== SPRITES && k !== AUDIO).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method === 'GET' && url.pathname.includes('/storage/v1/object/public/sprites/')) {
    e.respondWith((async () => {
      const cache = await caches.open(SPRITES);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }
  if (req.method !== 'GET' || url.origin !== location.origin) return;   // Supabase etc. → network only
  if (url.pathname.includes('/audio/')) {
    if (req.headers.has('range')) return;   // <audio> 같은 부분 요청은 브라우저에 맡김 (sfx.js 는 fetch 로 통째로 받음)
    e.respondWith((async () => {
      const cache = await caches.open(AUDIO);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && res.status === 200 && res.type === 'basic') cache.put(req, res.clone());
      return res;
    })());
    return;
  }
  // staff pages are online-only tools; don't cache them
  if (/\/(admin|booth|screen)(\.html)?$/.test(url.pathname) || url.pathname.includes('/js/admin') || url.pathname.includes('/js/booth') || url.pathname.includes('/js/screen')) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit;
    if (req.mode === 'navigate') {
      try { return await fetch(req); } catch { return (await cache.match(/\/s(\/|\/index\.html)?$/.test(url.pathname) ? 's/' : './')) || Response.error(); }
    }
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch { return Response.error(); }
  })());
});
