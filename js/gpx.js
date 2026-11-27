// GPX 讀寫、距離、爬升計算、偏離路線判斷
const R = 6371000, rad = d => d * Math.PI / 180;
export function dist(a, b) {
  const dLa = rad(b[0] - a[0]), dLo = rad(b[1] - a[1]);
  const s = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function parseGPX(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('GPX 檔案格式錯誤');
  const num = (el, tag) => { const e = el.getElementsByTagName(tag)[0]; return e ? parseFloat(e.textContent) : null; };
  const txt = (el, tag) => { const e = el.getElementsByTagName(tag)[0]; return e ? e.textContent.trim() : ''; };
  const pt = el => [parseFloat(el.getAttribute('lat')), parseFloat(el.getAttribute('lon')), num(el, 'ele'), (() => { const t = txt(el, 'time'); return t ? Date.parse(t) : null; })()];
  let pts = [...doc.getElementsByTagName('trkpt')].map(pt);
  if (!pts.length) pts = [...doc.getElementsByTagName('rtept')].map(pt);
  pts = pts.filter(p => isFinite(p[0]) && isFinite(p[1]));
  const wpts = [...doc.getElementsByTagName('wpt')].map(el => { const p = pt(el); return { lat: p[0], lon: p[1], ele: p[2], name: txt(el, 'name') || '航點' }; }).filter(w => isFinite(w.lat));
  const meta = doc.getElementsByTagName('metadata')[0];
  const trk = doc.getElementsByTagName('trk')[0];
  const name = (trk && txt(trk, 'name')) || (meta && txt(meta, 'name')) || '';
  if (!pts.length && !wpts.length) throw new Error('檔案裡沒有軌跡或航點');
  return { name, pts, wpts };
}

// 抽稀但保留形狀（Douglas–Peucker 簡化版，以公尺為單位）
export function simplify(pts, tol = 4) {
  if (pts.length < 3) return pts;
  const lat0 = rad(pts[0][0]);
  const xy = pts.map(p => [rad(p[1]) * R * Math.cos(lat0), rad(p[0]) * R]);
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let mx = 0, idx = -1;
    const [x1, y1] = xy[a], [x2, y2] = xy[b], dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy || 1;
    for (let i = a + 1; i < b; i++) {
      const t = Math.max(0, Math.min(1, ((xy[i][0] - x1) * dx + (xy[i][1] - y1) * dy) / L));
      const d = Math.hypot(xy[i][0] - (x1 + t * dx), xy[i][1] - (y1 + t * dy));
      if (d > mx) { mx = d; idx = i; }
    }
    if (mx > tol && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

export function stats(pts) {
  let d = 0, up = 0, down = 0, maxE = -Infinity, minE = Infinity, last = null;
  const prof = [];
  for (let i = 0; i < pts.length; i++) {
    if (i) d += dist(pts[i - 1], pts[i]);
    const e = pts[i][2];
    if (e != null && isFinite(e)) {
      maxE = Math.max(maxE, e); minE = Math.min(minE, e);
      if (last == null) last = e;
      const diff = e - last;
      if (Math.abs(diff) >= 3) { if (diff > 0) up += diff; else down -= diff; last = e; } // 3 公尺門檻，避免雜訊灌水
      prof.push([d, e]);
    }
  }
  const t0 = pts.find(p => p[3])?.[3], t1 = [...pts].reverse().find(p => p[3])?.[3];
  return {
    km: d / 1000, up: Math.round(up), down: Math.round(down),
    maxE: isFinite(maxE) ? Math.round(maxE) : null, minE: isFinite(minE) ? Math.round(minE) : null,
    hours: t0 && t1 && t1 > t0 ? (t1 - t0) / 3.6e6 : null, prof
  };
}

// 目前位置到路線的最短距離，以及在路線上的進度（公尺）
export function nearest(pts, p) {
  let best = Infinity, along = 0, acc = 0, bi = 0;
  const lat0 = rad(p[0]), toXY = q => [rad(q[1]) * R * Math.cos(lat0), rad(q[0]) * R], P = toXY(p);
  for (let i = 1; i < pts.length; i++) {
    const A = toXY(pts[i - 1]), B = toXY(pts[i]), dx = B[0] - A[0], dy = B[1] - A[1], L = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / L));
    const d = Math.hypot(P[0] - (A[0] + t * dx), P[1] - (A[1] + t * dy));
    const seg = Math.sqrt(L);
    if (d < best) { best = d; along = acc + t * seg; bi = i; }
    acc += seg;
  }
  return { d: best, along, total: acc, i: bi };
}

export function toGPX(name, pts, wpts = []) {
  const e = s => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const p = q => `<trkpt lat="${q[0].toFixed(6)}" lon="${q[1].toFixed(6)}">${q[2] != null ? `<ele>${q[2].toFixed(1)}</ele>` : ''}${q[3] ? `<time>${new Date(q[3]).toISOString()}</time>` : ''}</trkpt>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="百岳行" xmlns="http://www.topografix.com/GPX/1/1">
<metadata><name>${e(name)}</name></metadata>
${wpts.map(w => `<wpt lat="${w.lat.toFixed(6)}" lon="${w.lon.toFixed(6)}">${w.ele != null ? `<ele>${(+w.ele).toFixed(1)}</ele>` : ''}<name>${e(w.name)}</name></wpt>`).join('\n')}
<trk><name>${e(name)}</name><trkseg>
${pts.map(p).join('\n')}
</trkseg></trk>
</gpx>`;
}

export const fmtKm = k => k < 1 ? `${Math.round(k * 1000)} m` : `${k.toFixed(1)} km`;
export const fmtH = h => h == null ? '—' : `${Math.floor(h)} 小時 ${Math.round((h % 1) * 60)} 分`;
