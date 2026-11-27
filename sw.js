// 離線用：App 本體預先快取，地圖圖磚看過或下載過就留在手機
const APP = 'baiyue-app-v6';
const TILES = 'baiyue-tiles-v1';
const FONTS = 'baiyue-fonts-v1';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/data.js', './js/store.js', './js/gpx.js', './js/map.js', './js/art.js',
  './vendor/leaflet/leaflet.js', './vendor/leaflet/leaflet.css',
  './vendor/leaflet/images/marker-icon.png', './vendor/leaflet/images/marker-shadow.png', './vendor/leaflet/images/layers.png',
  './icons/icon-192.png', './icons/icon-512.png', './vendor/lxgw/result.min.css'
];

self.addEventListener('install', e => {
  // 用 cache:'reload' 跳過瀏覽器快取，確保裝到的是最新版
  e.waitUntil(caches.open(APP).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('baiyue-app-') && k !== APP).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function tile(req) {
  const c = await caches.open(TILES);
  const hit = await c.match(req.url);
  if (hit) return hit;
  let res;
  try { res = await fetch(req.url, { mode: 'cors', credentials: 'omit' }); } catch (e) { res = null; }
  if (!res || !res.ok) { try { res = await fetch(req.url, { mode: 'no-cors' }); } catch (e) { return new Response('', { status: 504 }); } }
  if (res.ok || res.type === 'opaque') c.put(req.url, res.clone()).catch(() => {});
  return res;
}

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (u.hostname === 'wmts.nlsc.gov.tw') { e.respondWith(tile(e.request)); return; }
  if (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(async c => (await c.match(e.request)) || fetch(e.request).then(r => { c.put(e.request, r.clone()); return r; }).catch(() => new Response('', { status: 504 }))));
    return;
  }
  if (u.origin === location.origin) {
    // 先用快取（離線可開），背景更新
    e.respondWith(caches.open(APP).then(async c => {
      const hit = await c.match(e.request, { ignoreSearch: true });
      const net = fetch(e.request.url, { cache: 'no-cache' }).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => null);
      return hit || (await net) || (await c.match('./index.html'));
    }));
  }
});

self.addEventListener('message', async e => {
  if (e.data === 'tile-stats') {
    const c = await caches.open(TILES); const ks = await c.keys();
    e.source.postMessage({ type: 'tile-stats', n: ks.length });
  }
  if (e.data === 'tile-clear') { await caches.delete(TILES); e.source.postMessage({ type: 'tile-stats', n: 0 }); }
});
