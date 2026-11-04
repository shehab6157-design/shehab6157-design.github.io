// Offline support. The app shell is cached on install; the photo-identification model and
// TensorFlow.js (about 7 MB) are cached the first time they are used.
// Bump VERSION whenever a file in SHELL changes.
const VERSION = 'rp-2026-11-04-2';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/theme.js',
  'js/app.js',
  'js/ui.js',
  'js/store.js',
  'js/components.js',
  'js/draw.js',
  'js/viewer3d.js',
  'js/scan.js',
  'js/gauge.js',
  'js/vision.js',
  'js/config.js',
  'js/cloud.js',
  'js/importflows.js',
  'js/askui.js',
  'js/askpanel.js',
  'js/problems.js',
  'js/core/dims.js',
  'js/core/decode.js',
  'js/core/model.js',
  'js/core/lookalike.js',
  'js/core/audit.js',
  'js/core/code128.js',
  'js/core/csv.js',
  'js/core/importer.js',
  'js/core/assistant.js',
  'js/views/home.js',
  'js/views/parts.js',
  'js/views/search.js',
  'js/views/part.js',
  'js/views/devices.js',
  'js/views/device.js',
  'js/views/guide.js',
  'js/views/identify.js',
  'js/views/teach.js',
  'js/views/audit.js',
  'js/views/learn.js',
  'js/views/quiz.js',
  'js/views/data.js',
  'js/views/about.js',
  'js/views/labels.js',
  'js/views/companies.js',
  'js/views/setup.js',
  'js/views/editor.js',
  'js/views/ask.js',
  'js/views/challenges.js',
  'data/demo-library.json',
  'vendor/three/three.bundle.js',
  'vendor/zxing/zxing.min.js',
  'vendor/supabase/supabase.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/icon-180.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('rp-') && k !== VERSION && k !== 'rp-runtime').map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // The demo library: fresh when online, cached when not.
  if (url.pathname.endsWith('/data/demo-library.json')) {
    event.respondWith(fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req)));
    return;
  }

  // Large optional files: cache on first use.
  if (url.pathname.includes('/vendor/tfjs/') || url.pathname.includes('/vendor/mobilenet/')) {
    event.respondWith(caches.open('rp-runtime').then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }

  // Pages: the app is one page with hash routes.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('index.html')));
    return;
  }

  event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
