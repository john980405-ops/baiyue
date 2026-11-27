// 地圖、GPS、軌跡記錄、離線圖磚下載
import { nearest, dist } from './gpx.js';
const L = window.L;

export const LAYERS = {
  emap5: { n: '等高線地形圖', url: 'https://wmts.nlsc.gov.tw/wmts/EMAP5/default/GoogleMapsCompatible/{z}/{y}/{x}', max: 18, nat: 17, attr: '© 內政部國土測繪中心', offline: true },
  emap: { n: '通用電子地圖', url: 'https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/{z}/{y}/{x}', max: 19, nat: 18, attr: '© 內政部國土測繪中心', offline: true },
  photo: { n: '正射影像', url: 'https://wmts.nlsc.gov.tw/wmts/PHOTO2/default/GoogleMapsCompatible/{z}/{y}/{x}', max: 19, nat: 18, attr: '© 內政部國土測繪中心', offline: true }
};

export function makeMap(el, { layer = 'emap5', interactive = true } = {}) {
  const map = L.map(el, { zoomControl: false, attributionControl: true, dragging: interactive, scrollWheelZoom: interactive, touchZoom: interactive, doubleClickZoom: interactive, boxZoom: false, keyboard: interactive }).setView([23.75, 121.0], 8);
  let base;
  const setLayer = k => {
    const o = LAYERS[k] || LAYERS.emap5;
    if (base) map.removeLayer(base);
    base = L.tileLayer(o.url, { maxZoom: o.max, maxNativeZoom: o.nat, attribution: o.attr }).addTo(map);
    let errs = 0; base.on('tileerror', () => { if (++errs === 6) el.dispatchEvent(new CustomEvent('tilefail')); });
  };
  setLayer(layer);
  return { map, setLayer };
}

export function drawTrack(map, t, { color = '#e0457b', fit = true, wpts = true } = {}) {
  const g = L.layerGroup().addTo(map);
  if (t.pts.length) {
    L.polyline(t.pts.map(p => [p[0], p[1]]), { color: '#fff', weight: 8, opacity: .85 }).addTo(g);
    L.polyline(t.pts.map(p => [p[0], p[1]]), { color, weight: 4.5 }).addTo(g);
    const dot = (p, c, tip) => L.circleMarker([p[0], p[1]], { radius: 7, color: '#fff', weight: 3, fillColor: c, fillOpacity: 1 }).bindTooltip(tip).addTo(g);
    dot(t.pts[0], '#2f8f5b', '起點'); dot(t.pts[t.pts.length - 1], '#14281f', '終點');
  }
  if (wpts) for (const w of t.wpts || []) L.marker([w.lat, w.lon], { icon: L.divIcon({ className: 'wpt', html: `<span>${w.name.replace(/[<>&]/g, '')}</span>`, iconSize: null }) }).addTo(g);
  if (fit) { const b = L.latLngBounds([...t.pts.map(p => [p[0], p[1]]), ...(t.wpts || []).map(w => [w.lat, w.lon])]); if (b.isValid()) map.fitBounds(b, { padding: [30, 30] }); }
  return g;
}

// GPS 定位與記錄
export class Tracker {
  constructor(map) { this.map = map; this.watch = null; this.me = null; this.acc = null; this.follow = true; this.rec = null; this.listeners = []; this.lock = null; }
  on(f) { this.listeners.push(f); }
  start() {
    if (this.watch != null) return true;
    if (!('geolocation' in navigator)) return false;
    this.watch = navigator.geolocation.watchPosition(p => this._pos(p), e => this.listeners.forEach(f => f({ error: e.code === 1 ? (window.Android ? '沒有定位權限：請到手機「設定 > 應用程式 > 百岳行 > 權限」允許位置' : '沒有定位權限，請到瀏覽器設定允許位置') : '暫時抓不到 GPS 訊號' })), { enableHighAccuracy: true, maximumAge: 2000, timeout: 30000 });
    this._wake();
    return true;
  }
  stop() { if (this.watch != null) navigator.geolocation.clearWatch(this.watch); this.watch = null; if (!this.rec) this._unwake(); }
  async _wake() { if (window.Android) { window.Android.keepOn(true); this.lock = 'native'; return; } try { if ('wakeLock' in navigator && !this.lock) { this.lock = await navigator.wakeLock.request('screen'); this.lock.addEventListener('release', () => { this.lock = null; }); } } catch (e) {} }
  _unwake() { if (window.Android) { window.Android.keepOn(false); this.lock = null; return; } try { this.lock && this.lock.release(); } catch (e) {} this.lock = null; }
  _pos(p) {
    const c = p.coords, ll = [c.latitude, c.longitude];
    if (!this.me) {
      this.acc = L.circle(ll, { radius: c.accuracy, color: '#2f7fd6', weight: 1, fillOpacity: .12 }).addTo(this.map);
      this.me = L.circleMarker(ll, { radius: 8, color: '#fff', weight: 3, fillColor: '#2f7fd6', fillOpacity: 1 }).addTo(this.map);
      this.map.setView(ll, Math.max(this.map.getZoom(), 15));
    } else { this.me.setLatLng(ll); this.acc.setLatLng(ll).setRadius(c.accuracy); if (this.follow) this.map.panTo(ll, { animate: true }); }
    const fix = { lat: c.latitude, lon: c.longitude, ele: c.altitude, acc: c.accuracy, t: p.timestamp };
    if (this.rec && c.accuracy < 60) {
      const last = this.rec.pts[this.rec.pts.length - 1];
      if (!last || dist(last, ll) > 6 || p.timestamp - last[3] > 30000) {
        this.rec.pts.push([c.latitude, c.longitude, c.altitude, p.timestamp]);
        this.rec.line.addLatLng(ll);
        this.rec.onPoint && this.rec.onPoint(this.rec.pts);
      }
    }
    this.last = fix;
    this.listeners.forEach(f => f(fix));
  }
  startRec(onPoint, prev = []) {
    this.start();
    const line = L.polyline(prev.map(p => [p[0], p[1]]), { color: '#2f7fd6', weight: 4, dashArray: '1 7', lineCap: 'round' }).addTo(this.map);
    this.rec = { pts: [...prev], line, onPoint };
    this._wake();
  }
  stopRec() { const r = this.rec; this.rec = null; if (r) this.map.removeLayer(r.line); if (this.watch == null) this._unwake(); return r ? r.pts : []; }
}

export function offRoute(track, fix) {
  if (!track || !track.pts.length || !fix) return null;
  return nearest(track.pts, [fix.lat, fix.lon]);
}

// 離線圖磚：沿著路線兩側緩衝區下載
const lon2x = (lon, z) => Math.floor((lon + 180) / 360 * 2 ** z);
const lat2y = (lat, z) => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z); };
export function tilesFor(track, layerKey, zmin = 12, zmax = 16, buf = 700) {
  const o = LAYERS[layerKey] || LAYERS.emap5;
  const set = new Set();
  const pts = track.pts.length ? track.pts : (track.wpts || []).map(w => [w.lat, w.lon]);
  const dLat = buf / 111320;
  for (let z = zmin; z <= zmax; z++) {
    let lastKey = '';
    for (let i = 0; i < pts.length; i++) {
      const [la, lo] = pts[i], dLon = buf / (111320 * Math.cos(la * Math.PI / 180));
      const x0 = lon2x(lo - dLon, z), x1 = lon2x(lo + dLon, z), y0 = lat2y(la + dLat, z), y1 = lat2y(la - dLat, z);
      const key = `${x0},${x1},${y0},${y1}`; if (key === lastKey) continue; lastKey = key;
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) set.add(o.url.replace('{z}', z).replace('{x}', x).replace('{y}', y));
    }
  }
  return [...set];
}
export async function prefetch(urls, onProg, signal) {
  let done = 0, fail = 0, i = 0;
  const worker = async () => {
    while (i < urls.length) {
      if (signal && signal.aborted) return;
      const u = urls[i++];
      try { const r = await fetch(u, { mode: 'no-cors', cache: 'reload' }); if (r.type !== 'opaque' && !r.ok) fail++; } catch (e) { fail++; }
      done++; onProg(done, fail, urls.length);
      await new Promise(r => setTimeout(r, 60)); // 放慢速度，對圖資伺服器友善
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return { done, fail };
}
