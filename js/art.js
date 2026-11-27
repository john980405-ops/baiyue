// 手繪水彩風的插畫：水彩暈染 + 抖動的墨線（濾鏡定義在 index.html 的 #rough、#wash）
const rng = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

function ridgePts(r, W, base, amp, n, peak) {
  const f = [r() * 6, r() * 6, r() * 6], pts = [];
  for (let i = 0; i <= n; i++) {
    const x = i / n;
    let y = Math.sin(x * 3.1 + f[0]) * 0.45 + Math.sin(x * 7.3 + f[1]) * 0.25 + Math.sin(x * 17 + f[2]) * 0.08 + (r() - 0.5) * 0.08;
    if (peak) { const d = Math.abs(x - peak.x), m = Math.max(0, 1 - d / peak.w); y = y * 0.5 + m ** 1.5 * peak.h + Math.sin(x * 41 + f[0]) * 0.04 * m; }
    pts.push([x * W, base - y * amp]);
  }
  return pts;
}
const line = pts => 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L');
const fill = (pts, W, H) => `M0 ${H} L${pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L')} L${W} ${H} Z`;

function pines(r, W, base, n) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = r() * W, h = 16 + r() * 26, y = base + r() * 16, w = h * 0.3;
    let d = `M${x.toFixed(1)} ${y.toFixed(1)} L${x.toFixed(1)} ${(y - h).toFixed(1)}`;
    for (let k = 1; k <= 4; k++) { const yy = y - h + k * h / 5, ww = w * k / 4; d += ` M${(x - ww).toFixed(1)} ${(yy + 4).toFixed(1)} L${x.toFixed(1)} ${yy.toFixed(1)} L${(x + ww).toFixed(1)} ${(yy + 4).toFixed(1)}`; }
    s += `<path d="${d}"/>`;
  }
  return `<g fill="none" stroke="var(--ink2)" stroke-width="1.6" stroke-linecap="round" filter="url(#rough)">${s}</g>`;
}

export function scene(seed, h = 3300, { W = 900, H = 380, label = '', small = false } = {}) {
  const r = rng(seed * 9973 + 7);
  const k = Math.min(1, Math.max(0, (h - 2950) / 1000));
  const peak = { x: 0.32 + r() * 0.36, w: 0.2 + r() * 0.1, h: 0.7 + k * 0.7 };
  const far = ridgePts(r, W, H * 0.5, H * 0.16, 50), mid = ridgePts(r, W, H * 0.6, H * 0.14, 60);
  const main = ridgePts(r, W, H * 0.8, H * 0.22, 80, peak), near = ridgePts(r, W, H * 0.93, H * 0.06, 40);
  const top = main.reduce((a, b) => b[1] < a[1] ? b : a);
  const hatch = small ? '' : Array.from({ length: 7 }, (_, i) => { const x0 = top[0] + 8 + i * 13, y0 = top[1] + 14 + i * 9; return `M${x0.toFixed(0)} ${y0.toFixed(0)} l${(18 + r() * 12).toFixed(0)} ${(30 + r() * 20).toFixed(0)}`; }).join(' ');
  const sunx = W * (peak.x > 0.5 ? 0.36 + r() * 0.08 : 0.58 + r() * 0.08);
  const clouds = Array.from({ length: small ? 3 : 7 }, () => `<ellipse cx="${(r() * W).toFixed(0)}" cy="${(H * 0.6 + r() * 22).toFixed(0)}" rx="${(70 + r() * 120).toFixed(0)}" ry="${(10 + r() * 10).toFixed(0)}"/>`).join('');
  const sw = small ? 1.4 : 2.2;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${label}">
<rect width="${W}" height="${H}" fill="var(--paper)"/>
<defs><linearGradient id="g${seed}${small ? 's' : ''}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--wsky2)" stop-opacity=".7"/><stop offset=".62" stop-color="var(--wsky)" stop-opacity=".75"/><stop offset="1" stop-color="var(--wsky)" stop-opacity=".2"/></linearGradient></defs><rect x="-30" y="-30" width="${W + 60}" height="${(H * 0.75).toFixed(0)}" fill="url(#g${seed}${small ? 's' : ''})" filter="url(#wash)"/>
<circle cx="${sunx.toFixed(0)}" cy="${(H * (small ? 0.22 : 0.17)).toFixed(0)}" r="${small ? 14 : 20}" fill="var(--wsun)" opacity=".85" filter="url(#wash)"/><circle cx="${sunx.toFixed(0)}" cy="${(H * (small ? 0.22 : 0.17)).toFixed(0)}" r="${small ? 14 : 20}" fill="none" stroke="var(--ink2)" stroke-width="1.2" opacity=".6" filter="url(#rough)"/>
<path d="${fill(far, W, H)}" fill="var(--w1)" opacity=".55" filter="url(#wash)"/>
<path d="${line(far)}" fill="none" stroke="var(--ink2)" stroke-width="1" opacity=".35" filter="url(#rough)"/>
<path d="${fill(mid, W, H)}" fill="var(--w2)" opacity=".6" filter="url(#wash)"/>
<g fill="var(--paper)" opacity=".8" filter="url(#wash)">${clouds}</g>
<path d="${fill(main, W, H)}" fill="var(--w3)" opacity=".8" filter="url(#wash)"/><path d="${fill(main.map(p => [p[0] + 5, p[1] + 7]), W, H)}" fill="var(--w4)" opacity=".28" filter="url(#wash)"/>
${(() => { const i = main.indexOf(top), seg = main.slice(Math.max(0, i - 6), i + 2); return `<path d="M${seg.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L')} L${(top[0] + 4).toFixed(1)} ${(top[1] + H * 0.09).toFixed(1)} Z" fill="var(--paper)" opacity=".55" filter="url(#wash)"/>`; })()}
<path d="${line(main)}" fill="none" stroke="var(--ink)" stroke-width="${sw}" stroke-linejoin="round" filter="url(#rough)"/>
${hatch ? `<path d="${hatch}" stroke="var(--ink2)" stroke-width="1.2" stroke-linecap="round" opacity=".55" filter="url(#rough)"/>` : ''}
<path d="${fill(near, W, H)}" fill="var(--w4)" opacity=".85" filter="url(#wash)"/>
<path d="${line(near)}" fill="none" stroke="var(--ink)" stroke-width="${sw * 0.8}" filter="url(#rough)"/>
${small ? '' : pines(r, W, H * 0.9, 18)}
</svg>`;
}

// 圖鑑小插圖：水彩底 + 墨線
const ICON = {
  tree: `<path d="M24 7 L35 24 H29 L38 36 H10 L19 24 H13 Z M24 36 V44"/>`,
  flower: `${[0, 72, 144, 216, 288].map(a => `<ellipse cx="24" cy="15" rx="5" ry="8.5" transform="rotate(${a} 24 24)"/>`).join('')}<circle cx="24" cy="24" r="3.5"/>`,
  grass: `<path d="M12 42 C13 30 15 20 13 9 M20 42 C22 28 25 18 30 9 M28 42 C31 32 35 24 40 17"/>`,
  mammal: `<ellipse cx="24" cy="30" rx="8.5" ry="7.5"/><ellipse cx="13" cy="19" rx="3.6" ry="4.6"/><ellipse cx="19.5" cy="12.5" rx="3.6" ry="4.6"/><ellipse cx="28.5" cy="12.5" rx="3.6" ry="4.6"/><ellipse cx="35" cy="19" rx="3.6" ry="4.6"/>`,
  bird: `<path d="M8 28 C14 18 26 16 34 20 L42 17 L37 24 C35 32 26 37 17 35 L10 40 L12 33 Z"/><circle cx="33" cy="22" r="1"/>`,
  amph: `<path d="M10 30 C10 22 20 20 28 22 C34 23 38 20 42 22 C40 27 35 28 30 29 C24 34 14 36 10 30 Z M16 31 l-4 7 M24 31 l2 7 M30 28 l5 6"/>`
};
export const icon = (k, c) => `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="25" r="19" fill="${c}" opacity=".28" filter="url(#wash)"/><g fill="${c}" fill-opacity=".55" stroke="var(--ink)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" filter="url(#rough)">${ICON[k] || ICON.tree}</g></svg>`;

// 百岳天際線：手繪的一條稜線，依國家公園分成四段山脈；爬過的山插上小紅旗
export const SKY_GROUPS = [['S', '雪霸'], ['T', '太魯閣'], ['-', '中央山脈'], ['Y', '玉山']];
export function skyline(peaks, done) {
  const W = 1000, H = 400, base = 330, gap = 30;
  const massif = L => { const s = [...L].sort((a, b) => b.h - a.h), out = []; s.forEach((p, i) => i % 2 ? out.push(p) : out.unshift(p)); return out; };
  const groups = SKY_GROUPS.map(([k, n]) => ({ k, n, L: massif(peaks.filter(p => p.p === k)) }));
  const step = (W - 24 - gap * (groups.length - 1)) / peaks.length;
  const hy = h => base - 30 - (h - 2950) / 1010 * 230;
  const r = rng(42);
  let x = 12, fills = '', ink = '', flags = '', labels = '';
  const pos = [];
  for (const g of groups) {
    const x0 = x, pts = [[x0, base]];
    g.L.forEach((p, i) => {
      const px = x + step / 2, py = hy(p.h);
      if (i) { const prev = pts[pts.length - 1]; pts.push([(prev[0] + px) / 2, Math.max(prev[1], py) + 10 + r() * 16]); }
      pts.push([px, py]); pos.push({ r: p.r, x: px });
      if (done[p.r]) flags += `<path d="M${px.toFixed(1)} ${py.toFixed(1)} V${(py - 26).toFixed(1)}" stroke="var(--ink)" stroke-width="2"/><path d="M${px.toFixed(1)} ${(py - 26).toFixed(1)} L${(px + 16).toFixed(1)} ${(py - 20).toFixed(1)} L${px.toFixed(1)} ${(py - 14).toFixed(1)} Z" fill="var(--rho)" stroke="var(--ink)" stroke-width="1"/>`;
      x += step;
    });
    pts.push([x, base]);
    fills += `<path d="${line(pts)} Z" fill="var(--w3)" opacity=".7"/>`;
    ink += `<path d="${line(pts)}" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round"/>`;
    labels += `<text x="${((x0 + x) / 2).toFixed(0)}" y="${base + 50}" text-anchor="middle" font-size="36" fill="var(--ink)">${g.n}</text>`;
    x += gap;
  }
  const n = Object.keys(done).length;
  return { pos, W, svg: `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="百岳天際線，已登頂 ${n} 座">
<ellipse cx="500" cy="180" rx="560" ry="170" fill="var(--wsky)" opacity=".5" filter="url(#wash)"/>
<g filter="url(#wash)">${fills}</g>
<g filter="url(#rough)">${ink}<path d="M6 ${base + 2} C300 ${base - 2} 700 ${base + 4} 994 ${base}" stroke="var(--ink)" stroke-width="1.6" fill="none"/>${flags}</g>
<g font-family="'LXGW WenKai TC',serif">${labels}</g>
</svg>` };
}
