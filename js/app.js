import { PEAKS, BY, PARK, DIFF, DORD, FAME, STORY, ROUTES, GEAR, zoneOf, speciesFor } from './data.js';
import { kv, trips, photos, tracks, uid, persist, usage, shrink, exportAll, importAll } from './store.js';
import { parseGPX, simplify, stats, toGPX, fmtKm, fmtH } from './gpx.js';
import { LAYERS, makeMap, drawTrack, Tracker, offRoute, tilesFor, prefetch } from './map.js';
import { scene, icon } from './art.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const view = $('#view');
const NATIVE = !!window.Android;
const PREVIEW = /claude/.test(location.hostname); // 在 claude.ai 預覽時，地圖底圖和 GPS 會被擋 // 在 APK 裡執行時，手機原生功能由 window.Android 提供
let S = { done: {}, wish: [], gear: {}, layer: 'emap5', active: null };
let urls = [];
const blobURL = b => { const u = URL.createObjectURL(b); urls.push(u); return u; };
const freeURLs = () => { urls.forEach(u => URL.revokeObjectURL(u)); urls = []; };
const save = () => kv.set('state', S);
let toastT;
function toast(t, ms = 2600) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), ms); }
function download(name, text, type) {
  if (NATIVE) { toast(Android.saveFile(name, text, /\.json$/.test(name) ? 'application/json' : 'application/octet-stream'), 5000); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const confirm2 = (btn, label, fn) => { if (btn.dataset.ok) fn(); else { btn.dataset.ok = 1; btn.textContent = label; btn.classList.add('r'); setTimeout(() => { delete btn.dataset.ok; }, 4000); } };


async function shareText(title, text) {
  if (NATIVE) { Android.share(text); return; }
  try { if (navigator.share) { await navigator.share({ title, text }); return; } } catch (e) { return; }
  try { await navigator.clipboard.writeText(text); toast('已複製'); } catch (e) { toast('無法分享'); }
}

// ---------- 首頁 ----------
function nextRoute() {
  return ROUTES.map(r => ({ ...r, left: r.p.filter(x => !S.done[x]) })).find(r => r.left.length);
}
function meters() {
  const done = PEAKS.filter(x => S.done[x.r]);
  const famN = Object.keys(FAME).filter(r => S.done[r]).length;
  return ['A', 'B', 'C', 'C+'].map(d => { const all = PEAKS.filter(x => x.d === d).length, n = done.filter(x => x.d === d).length;
    return `<div class="meter"><span>${d} ${DIFF[d].t}</span><b><i style="width:${n / all * 100}%;background:${DIFF[d].c}"></i></b><span>${n}/${all}</span></div>`; }).join('')
    + `<div class="meter"><span>五嶽三尖一奇</span><b><i style="width:${famN / 9 * 100}%;background:var(--rho)"></i></b><span>${famN}/9</span></div>`;
}
let bookOpen = false;
function stampBook() {
  const L = bookOpen ? PEAKS : PEAKS.slice(0, 18);
  return `<div class="book" id="book">${L.map(x => { const d = S.done[x.r];
    return `<a class="slot ${d ? 'got' : ''}" href="#peak-${x.r}" aria-label="${x.r} ${esc(x.n)}${d ? ' 已登頂' : ''}">
      <span class="no">${x.r}</span><b>${esc(x.n)}</b><span class="ht">${x.h.toLocaleString()} m</span>
      ${d ? `<span class="seal">登頂<small>${esc((d.date || '').slice(5).replace('-', '.'))}</small></span>` : ''}</a>`; }).join('')}</div>
    <button class="btn sm" id="bookMore" style="margin-top:12px">${bookOpen ? '收合' : '展開全部 100 格'}</button>`;
}
function bindBook() {
  const b = $('#bookMore'); if (!b) return;
  b.onclick = () => { bookOpen = !bookOpen; $('#bookWrap').innerHTML = stampBook(); bindBook(); };
}
let installEvt = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; const b = $('#install'); if (b) b.hidden = false; });

async function vHome() {
  const n = Object.keys(S.done).length, sum = PEAKS.filter(x => S.done[x.r]).reduce((a, x) => a + x.h, 0);
  const nx = nextRoute(), T = (await trips.all()).sort((a, b) => b.date.localeCompare(a.date));
  view.innerHTML = `
  <section class="scene hero">${scene(1, 3952, { label: '黎明雲海上的稜線' })}
    <div class="over wrap" style="width:100%">
      <p style="margin:0 0 4px;font-weight:700;letter-spacing:.02em">百岳行</p>
      <div class="big">${n}<small> / 100 座</small></div>
      <p style="margin:6px 0 0">${n ? `已經累積站上 ${sum.toLocaleString()} 公尺的山頂高度。` : '第一座百岳，從這裡開始。'}</p>
    </div>
  </section>
  <div class="pad wrap stack">
    <button class="btn sm" id="install" hidden style="justify-self:start">＋ 安裝到手機主畫面</button>
    ${nx ? `<a class="card" href="#peaks-routes" style="text-decoration:none;color:inherit;border-left:6px solid var(--rho)">
      <p class="mute" style="margin:0">建議下一趟 · ${esc(nx.lv)} 級 · ${esc(nx.d)}</p>
      <h2 style="margin:2px 0 4px">${esc(nx.n)}</h2>
      <p style="margin:0">${esc(nx.t)}這趟可以再收 <b>${nx.left.length}</b> 座：${nx.left.map(r => esc(BY[r].n)).join('、')}</p></a>` : ''}
    <div class="row2"><a class="btn p" href="#trip-new">寫一篇爬山手記</a><a class="btn" href="#map">打開離線地圖</a></div>
    <div class="card"><h2>登頂印章冊</h2><p class="mute" style="margin:-4px 0 12px">一格一座山，登頂就蓋上紅章。點格子看那座山。</p><div id="bookWrap">${stampBook()}</div><div style="margin-top:16px">${meters()}</div></div>
    ${T.length ? `<div><h2>最近的手記</h2><div class="trips" id="hTrips"></div></div>` : ''}
  </div>`;
  bindBook();
  if (installEvt) $('#install').hidden = false;
  $('#install').onclick = async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $('#install').hidden = true; };
  if (T.length) $('#hTrips').innerHTML = await tripCards(T.slice(0, 2));
}

// ---------- 百岳清單 ----------
const F = { q: '', d: '', s: '', p: '', o: 'rank', tab: 'list' };
function vPeaks(tab) {
  if (tab) F.tab = tab;
  view.innerHTML = `<div class="pad wrap">
    <h1 style="margin:8px 0 14px">百岳</h1>
    <div class="row2" style="margin-bottom:14px"><button class="btn ${F.tab === 'list' ? 'p' : ''}" data-tab="list">一百座山</button><button class="btn ${F.tab === 'routes' ? 'p' : ''}" data-tab="routes">行程組合</button></div>
    <div id="pbody"></div></div>`;
  $$('[data-tab]').forEach(b => b.onclick = () => { location.hash = b.dataset.tab === 'routes' ? '#peaks-routes' : '#peaks'; });
  F.tab === 'routes' ? routesBody() : listBody();
}
function listBody() {
  $('#pbody').innerHTML = `<input id="q" type="search" placeholder="搜尋山名、縣市" value="${esc(F.q)}" style="margin-bottom:8px">
  <div class="filters">
    <select id="fd"><option value="">全部難度</option>${Object.keys(DIFF).map(k => `<option ${F.d === k ? 'selected' : ''}>${k}</option>`).join('')}</select>
    <select id="fs"><option value="">全部</option><option value="todo">還沒爬</option><option value="done">已登頂</option><option value="wish">想爬</option></select>
    <select id="fp"><option value="">全部區域</option>${Object.entries(PARK).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
    <select id="fo"><option value="rank">依排名</option><option value="diff">由易到難</option><option value="h">由矮到高</option></select>
  </div><div class="plist" id="plist"></div>`;
  $('#fs').value = F.s; $('#fp').value = F.p; $('#fo').value = F.o;
  const draw = () => {
    Object.assign(F, { q: $('#q').value.trim(), d: $('#fd').value, s: $('#fs').value, p: $('#fp').value, o: $('#fo').value });
    let L = PEAKS.filter(x => (!F.q || x.n.includes(F.q) || x.c.includes(F.q)) && (!F.d || x.d === F.d) && (!F.p || x.p === F.p)
      && (!F.s || (F.s === 'done' ? S.done[x.r] : F.s === 'todo' ? !S.done[x.r] : S.wish.includes(x.r))));
    if (F.o === 'diff') L.sort((a, b) => DORD[a.d] - DORD[b.d] || a.h - b.h); else if (F.o === 'h') L.sort((a, b) => a.h - b.h);
    $('#plist').innerHTML = L.length ? L.map(x => `<a class="prow ${S.done[x.r] ? 'done' : ''}" href="#peak-${x.r}">
      <span class="rkc">${x.r}</span>
      <span class="nm">${esc(x.n)} ${FAME[x.r] ? `<span class="fame">${FAME[x.r]}</span>` : ''}${S.wish.includes(x.r) ? ' <span class="wishm">★</span>' : ''}
        <small>${x.h.toLocaleString()} m · ${esc(PARK[x.p])}${S.done[x.r] ? ' · ' + esc(S.done[x.r].date || '') : ''}</small></span>
      <span class="ends">${S.done[x.r] ? '<span class="donest">登頂</span>' : ''}<span class="stamp" style="--c:${DIFF[x.d].c}">${x.d}</span></span></a>`).join('')
      : '<div class="empty">沒有符合的山，換個條件試試。</div>';
  };
  ['#q', '#fd', '#fs', '#fp', '#fo'].forEach(s => $(s).addEventListener('input', draw));
  draw();
}
function routesBody() {
  $('#pbody').innerHTML = `<p class="mute">一趟收好幾座的常見組合，由易到難。天數是一般參考，實際依路況、體能與山屋抽籤調整。</p>
  <div class="routes">${ROUTES.map((r, i) => { const n = r.p.filter(x => S.done[x]).length, top = Math.max(...r.p.map(x => BY[x].h));
    return `<div class="card rcard"><div class="scene">${scene(200 + i, top, { W: 600, H: 220, small: true })}</div><div class="in">
    <p class="mute" style="margin:0">${esc(r.lv)} 級 · ${esc(r.d)}</p><h3>${esc(r.n)}</h3>
    <div class="bar"><i style="width:${n / r.p.length * 100}%"></i></div><p class="mute">${n}/${r.p.length} 座 · ${esc(r.t)}</p>
    <div class="chips">${r.p.map(x => `<a class="chip ${S.done[x] ? 'on' : ''}" href="#peak-${x}">${S.done[x] ? '✓ ' : ''}${esc(BY[x].n)}</a>`).join('')}</div></div></div>`; }).join('')}</div>`;
}

// ---------- 單座山 ----------
async function vPeak(r) {
  const x = BY[r]; if (!x) return vPeaks();
  const d = S.done[r], route = ROUTES.filter(o => o.p.includes(r));
  const story = STORY[r] || `${PARK[x.p]}${x.p === '-' ? '，' : '範圍內，'}位在${x.c}。海拔 ${x.h.toLocaleString()} 公尺，山頂一帶是${zoneOf(x.h)}。`;
  const mine = (await trips.all()).filter(t => (t.peaks || []).includes(r)).sort((a, b) => b.date.localeCompare(a.date));
  view.innerHTML = `
  <section class="scene peakhero">${scene(x.r, x.h, { label: x.n + '的山景插畫' })}<a class="back" href="#peaks">← 百岳</a>
    <div class="over wrap" style="width:100%"><p style="margin:0">百岳第 ${x.r} 座</p>
    <h1>${esc(x.n)}</h1>${FAME[x.r] ? `<p style="margin:8px 0 0"><span class="fame">${FAME[x.r]}</span></p>` : ''}${d ? '<span class="bigstamp">登頂<small>' + esc(d.date || '') + '</small></span>' : ''}</div></section>
  <div class="pad wrap">
    <dl class="notes"><div><dt>海拔</dt><dd><b>${x.h.toLocaleString()}</b> 公尺</dd></div><div><dt>難度</dt><dd><span class="stamp" style="--c:${DIFF[x.d].c}">${x.d}</span> ${DIFF[x.d].t}，${DIFF[x.d].s}</dd></div><div><dt>位置</dt><dd>${esc(x.c)} · ${esc(PARK[x.p])}</dd></div></dl>
    <p class="story">${esc(story)}</p>
    ${route.length ? `<p class="mute">常見組合：${route.map(o => `<a href="#peaks-routes">${esc(o.n)}</a>（${esc(o.d)}）`).join('、')}</p>` : ''}
    <div class="actions">
      ${d ? `<span class="btn" style="cursor:default">✓ ${esc(d.date || '')} 登頂</span>` : `<button class="btn p" id="mark">標記已登頂</button>`}
      <a class="btn r" href="#trip-new" id="writeTrip">寫這座山的手記</a>
      <button class="btn" id="wish">${S.wish.includes(r) ? '★ 已在想爬清單' : '☆ 想爬'}</button>
      ${d ? '<button class="btn" id="unmark">取消登頂</button>' : ''}
    </div>
    <h2 style="margin-top:26px">在這裡可能遇見</h2>
    <p class="mute">依海拔與區域推估，不代表每次都看得到。請保持距離、不餵食、不採摘。</p>
    <div class="eco">${speciesFor(x).map(s => `<div class="sp">${icon(s.k, s.c)}<div><h3>${esc(s.n)}</h3><p>${esc(s.t)}</p><span class="when">${esc(s.s)}</span></div></div>`).join('')}</div>
    <h2 style="margin-top:26px">我在這座山</h2>
    <div id="mine">${mine.length ? '' : '<div class="card empty">還沒有這座山的手記。登頂後寫一篇，照片和軌跡都會收在這裡。</div>'}</div>
    <h2 style="margin-top:26px">出發前查一下</h2>
    <div class="chips">
      <a class="chip" target="_blank" rel="noopener" href="https://www.google.com/search?q=${encodeURIComponent(x.n + ' 登山 紀錄 GPX')}">找路線紀錄與 GPX</a>
      <a class="chip" target="_blank" rel="noopener" href="https://www.cwa.gov.tw/V8/C/L/Mountain/Mountain.html">中央氣象署登山天氣</a>
      <a class="chip" target="_blank" rel="noopener" href="https://hike.taiwan.gov.tw/">入山入園申請</a>
    </div>
  </div>`;
  if (mine.length) $('#mine').innerHTML = `<div class="trips">${await tripCards(mine)}</div>`;
  const m = $('#mark'); if (m) m.onclick = () => { S.done[r] = { date: today() }; S.wish = S.wish.filter(v => v !== r); save(); toast(`恭喜登頂 ${x.n}！`); vPeak(r); };
  const u = $('#unmark'); if (u) u.onclick = () => confirm2(u, '再按一次確認取消', () => { delete S.done[r]; save(); vPeak(r); });
  $('#wish').onclick = () => { S.wish = S.wish.includes(r) ? S.wish.filter(v => v !== r) : [...S.wish, r]; save(); vPeak(r); };
  $('#writeTrip').onclick = () => { pendingPeaks = [r]; };
}

// ---------- 手記 ----------
let pendingPeaks = null, pendingTrack = null;
async function coverURL(t) {
  const id = (t.photoIds || [])[0]; if (!id) return null;
  const p = await photos.get(id); return p ? blobURL(p.thumb || p.blob) : null;
}
async function tripCards(T) {
  const out = [];
  for (const t of T) {
    const cov = await coverURL(t);
    out.push(`<a class="tcard" href="#trip-${t.id}"><div class="cov">${cov ? `<img src="${cov}" alt="">` : scene(t.peaks?.[0] || 5, BY[t.peaks?.[0]]?.h || 3300, { W: 600, H: 260, small: true })}</div>
    <div class="in"><time>${esc(t.date)}${t.endDate && t.endDate !== t.date ? ' – ' + esc(t.endDate) : ''}</time><h3 class="serif" style="font-size:20px">${esc(t.title || '未命名的山行')}</h3>
    <p class="mute" style="margin:0">${(t.peaks || []).map(r => esc(BY[r]?.n)).join('、') || '沒有標記百岳'}${t.photoIds?.length ? ` · ${t.photoIds.length} 張照片` : ''}${t.trackId ? ' · 有軌跡' : ''}</p></div></a>`);
  }
  return out.join('');
}
async function vTrips() {
  const T = (await trips.all()).sort((a, b) => b.date.localeCompare(a.date));
  view.innerHTML = `<div class="pad wrap"><div style="display:flex;justify-content:space-between;align-items:center;margin:8px 0 14px"><h1>爬山手記</h1><a class="btn p" href="#trip-new">＋ 新手記</a></div>
  <div class="trips" id="tl">${T.length ? '' : '<div class="card empty">每一趟山行都值得留下來。寫下日期、照片、軌跡和那天的心情，登頂的山會自動點亮。</div>'}</div></div>`;
  if (T.length) $('#tl').innerHTML = await tripCards(T);
}

function profileSVG(prof, markAt) {
  if (!prof || prof.length < 2) return '';
  const D = prof[prof.length - 1][0] || 1, es = prof.map(p => p[1]), lo = Math.min(...es), hi = Math.max(...es), span = Math.max(30, hi - lo);
  const X = d => (d / D * 600).toFixed(1), Y = e => (100 - (e - lo) / span * 86).toFixed(1);
  const line = prof.map((p, i) => `${i ? 'L' : 'M'}${X(p[0])} ${Y(p[1])}`).join(' ');
  let mk = '';
  if (markAt != null) { const p = prof.reduce((a, b) => Math.abs(b[0] - markAt) < Math.abs(a[0] - markAt) ? b : a); mk = `<line x1="${X(p[0])}" x2="${X(p[0])}" y1="0" y2="104" stroke="#2f7fd6" stroke-width="2" vector-effect="non-scaling-stroke"/><circle cx="${X(p[0])}" cy="${Y(p[1])}" r="5" fill="#2f7fd6" stroke="#fff" stroke-width="2" vector-effect="non-scaling-stroke"/>`; }
  return `<svg viewBox="0 0 600 104" preserveAspectRatio="none" aria-label="高度剖面圖"><path d="${line} L600 104 L0 104 Z" style="fill:color-mix(in srgb,var(--rho) 22%,transparent)"/><path d="${line}" fill="none" stroke="var(--rho)" stroke-width="2" vector-effect="non-scaling-stroke"/>${mk}</svg>
  <span class="mute" style="position:absolute;left:4px;top:0;font-size:11px">${Math.round(hi)} m</span><span class="mute" style="position:absolute;left:4px;bottom:0;font-size:11px">${Math.round(lo)} m</span>`;
}

async function saveTrack(name, pts, wpts = []) {
  const st = stats(pts);
  const prof = st.prof.length > 400 ? st.prof.filter((_, i) => i % Math.ceil(st.prof.length / 400) === 0) : st.prof;
  const t = { id: uid(), name: name || '未命名路線', pts: simplify(pts, 3), wpts, stats: { ...st, prof }, at: Date.now() };
  await tracks.put(t); return t;
}
async function importGPXFile(file) {
  const g = parseGPX(await file.text());
  return saveTrack(g.name || file.name.replace(/\.gpx$/i, ''), g.pts, g.wpts);
}

async function vTripEdit(id) {
  const t = id ? await trips.get(id) : { id: uid(), title: '', date: today(), endDate: '', peaks: pendingPeaks || [], weather: '', team: '', text: '', trackId: pendingTrack, photoIds: [] };
  pendingPeaks = null; pendingTrack = null;
  if (!t) return vTrips();
  const K = (await tracks.all()).sort((a, b) => b.at - a.at);
  const old = []; for (const pid of t.photoIds || []) { const p = await photos.get(pid); if (p) old.push(p); }
  let newPh = [], delPh = new Set();
  view.innerHTML = `<div class="pad wrap"><a href="${id ? '#trip-' + id : '#trips'}" class="mute">← 取消</a><h1 style="margin:8px 0 16px">${id ? '編輯手記' : '新的爬山手記'}</h1>
  <div class="f"><label for="tt">標題</label><input id="tt" value="${esc(t.title)}" placeholder="例如：第一次看到雲海的合歡山"></div>
  <div class="row2"><div class="f"><label for="td">出發日期</label><input id="td" type="date" value="${esc(t.date)}"></div><div class="f"><label for="te">下山日期</label><input id="te" type="date" value="${esc(t.endDate)}"></div></div>
  <div class="f"><label>這趟登頂的百岳</label><input id="pq" type="search" placeholder="搜尋山名"><div class="pick" id="pick"></div></div>
  <div class="row2"><div class="f"><label for="tw">天氣</label><input id="tw" value="${esc(t.weather)}" placeholder="晴、午後起霧"></div><div class="f"><label for="tm">同行夥伴</label><input id="tm" value="${esc(t.team)}"></div></div>
  <div class="f"><label for="tx">手記</label><textarea id="tx" placeholder="路況、花了多久、看到什麼、下次要注意的事…">${esc(t.text)}</textarea></div>
  <div class="f"><label>照片</label><div class="gallery" id="ph"></div><label class="btn" style="margin-top:8px">＋ 加入照片<input type="file" id="phin" accept="image/*" multiple hidden></label></div>
  <div class="f"><label for="tk">軌跡</label><select id="tk"><option value="">不附軌跡</option>${K.map(k => `<option value="${k.id}" ${k.id === t.trackId ? 'selected' : ''}>${esc(k.name)} · ${fmtKm(k.stats.km)}</option>`).join('')}</select>
    <label class="btn" style="margin-top:8px">匯入 GPX 檔<input type="file" id="gin" accept=".gpx,application/gpx+xml,application/xml,text/xml" hidden></label></div>
  <div class="actions"><button class="btn p" id="sv">儲存手記</button>${id ? '<button class="btn" id="del">刪除這篇</button>' : ''}</div></div>`;
  const sel = new Set(t.peaks || []);
  const drawPick = () => { const q = $('#pq').value.trim();
    $('#pick').innerHTML = PEAKS.filter(x => sel.has(x.r) || !q || x.n.includes(q)).sort((a, b) => sel.has(b.r) - sel.has(a.r) || a.r - b.r)
      .map(x => `<button type="button" class="chip ${sel.has(x.r) ? 'on' : ''}" data-r="${x.r}">${sel.has(x.r) ? '✓ ' : ''}${esc(x.n)}</button>`).join(''); };
  $('#pq').oninput = drawPick; drawPick();
  $('#pick').onclick = e => { const b = e.target.closest('[data-r]'); if (!b) return; const r = +b.dataset.r; sel.has(r) ? sel.delete(r) : sel.add(r); drawPick(); };
  const drawPh = () => {
    $('#ph').innerHTML = [...old.filter(p => !delPh.has(p.id)).map(p => `<button type="button" data-old="${p.id}"><img src="${blobURL(p.thumb || p.blob)}" alt=""><span class="x">✕</span></button>`),
      ...newPh.map((p, i) => `<button type="button" data-new="${i}"><img src="${p.url}" alt=""><span class="x">✕</span></button>`)].join('');
  };
  drawPh();
  $('#ph').onclick = e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.old) delPh.add(b.dataset.old); else newPh.splice(+b.dataset.new, 1); drawPh(); };
  $('#phin').onchange = async e => {
    toast('處理照片中…');
    for (const f of e.target.files) { const blob = await shrink(f, 1800), thumb = await shrink(f, 420, .75); newPh.push({ blob, thumb, url: blobURL(thumb) }); }
    e.target.value = ''; drawPh(); toast(`已加入 ${newPh.length} 張新照片`);
  };
  $('#gin').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const k = await importGPXFile(f); $('#tk').insertAdjacentHTML('beforeend', `<option value="${k.id}">${esc(k.name)} · ${fmtKm(k.stats.km)}</option>`); $('#tk').value = k.id; toast('軌跡已匯入'); }
    catch (err) { toast(err.message || '讀不到這個 GPX'); }
  };
  $('#sv').onclick = async () => {
    const ids = old.filter(p => !delPh.has(p.id)).map(p => p.id);
    for (const pid of delPh) await photos.del(pid);
    for (const p of newPh) { const pid = uid(); await photos.put({ id: pid, tripId: t.id, blob: p.blob, thumb: p.thumb, at: Date.now() }); ids.push(pid); }
    const nt = { ...t, title: $('#tt').value.trim(), date: $('#td').value || today(), endDate: $('#te').value, peaks: [...sel], weather: $('#tw').value.trim(), team: $('#tm').value.trim(), text: $('#tx').value, trackId: $('#tk').value || null, photoIds: ids, updatedAt: Date.now() };
    await trips.put(nt);
    let lit = 0;
    for (const r of nt.peaks) if (!S.done[r]) { S.done[r] = { date: nt.endDate || nt.date, tripId: nt.id }; lit++; }
    S.wish = S.wish.filter(r => !S.done[r]); await save();
    toast(lit ? `已儲存，點亮 ${lit} 座百岳！` : '手記已儲存');
    location.hash = '#trip-' + nt.id;
  };
  const del = $('#del'); if (del) del.onclick = () => confirm2(del, '再按一次刪除（照片也會刪除）', async () => {
    for (const pid of t.photoIds || []) await photos.del(pid); await trips.del(t.id); toast('已刪除'); location.hash = '#trips'; });
}

async function vTrip(id) {
  const t = await trips.get(id); if (!t) return vTrips();
  const k = t.trackId ? await tracks.get(t.trackId) : null;
  const P = []; for (const pid of t.photoIds || []) { const p = await photos.get(pid); if (p) P.push(p); }
  const cov = P[0] ? blobURL(P[0].blob) : null;
  view.innerHTML = `
  <section class="scene covhero">${cov ? `<img src="${cov}" alt="">` : scene(t.peaks?.[0] || 3, BY[t.peaks?.[0]]?.h || 3400)}<a class="back" href="#trips">← 手記</a>
    <div class="over wrap" style="width:100%;z-index:2"><p style="margin:0">${esc(t.date)}${t.endDate && t.endDate !== t.date ? ' – ' + esc(t.endDate) : ''}${t.weather ? ' · ' + esc(t.weather) : ''}</p><h1>${esc(t.title || '未命名的山行')}</h1></div></section>
  <div class="pad wrap">
    ${t.peaks?.length ? `<div class="chips" style="margin-bottom:12px">${t.peaks.map(r => `<a class="chip on" href="#peak-${r}">▲ ${esc(BY[r].n)} ${BY[r].h} m</a>`).join('')}</div>` : ''}
    ${t.team ? `<p class="mute">同行：${esc(t.team)}</p>` : ''}
    ${k ? `<div class="nums card" style="margin:12px 0"><div><b>${fmtKm(k.stats.km)}</b><span>距離</span></div><div><b>${k.stats.up ?? '—'}</b><span>總爬升 m</span></div><div><b>${k.stats.maxE ?? '—'}</b><span>最高 m</span></div><div><b style="font-size:15px">${fmtH(k.stats.hours)}</b><span>花費時間</span></div></div>
      <div class="minimap" id="mm"></div><div class="prof card" style="height:130px;padding:0">${profileSVG(k.stats.prof)}</div>` : ''}
    ${t.text ? `<div class="journal" style="margin:20px 0">${esc(t.text)}</div>` : ''}
    ${P.length ? `<h2>照片</h2><div class="gallery" id="gal">${P.map((p, i) => `<button data-i="${i}"><img src="${blobURL(p.thumb || p.blob)}" alt="照片 ${i + 1}"></button>`).join('')}</div>` : ''}
    <div class="actions"><a class="btn p" href="#trip-edit-${t.id}">編輯</a>${k ? '<button class="btn" id="gx">下載 GPX</button><button class="btn" id="nav">用這條路線導航</button>' : ''}<button class="btn" id="sh">分享文字</button></div>
  </div>`;
  if (k) {
    const { map } = makeMap($('#mm'), { layer: S.layer }); drawTrack(map, k, { color: '#d9467a' });
    $('#gx').onclick = () => download(`${k.name}.gpx`, toGPX(k.name, k.pts, k.wpts), 'application/gpx+xml');
    $('#nav').onclick = () => { S.active = k.id; save(); location.hash = '#map'; };
  }
  const gal = $('#gal'); if (gal) gal.onclick = e => { const b = e.target.closest('[data-i]'); if (!b) return; const lb = $('#lightbox'); $('img', lb).src = blobURL(P[+b.dataset.i].blob); lb.hidden = false; };
  $('#sh').onclick = async () => {
    const text = `${t.title || '山行'}（${t.date}）\n${(t.peaks || []).map(r => `▲ ${BY[r].n} ${BY[r].h}m`).join('\n')}\n${k ? `${fmtKm(k.stats.km)}，爬升 ${k.stats.up} m\n` : ''}\n${t.text || ''}`;
    shareText(t.title, text);
  };
}
$('#lbClose').onclick = () => { $('#lightbox').hidden = true; };

// ---------- 地圖 ----------
let M = null;
async function ensureMap() {
  if (M) return M;
  const wrap = document.createElement('div'); wrap.className = 'mapview'; wrap.id = 'mapwrap'; wrap.hidden = true;
  wrap.innerHTML = `<div id="map"></div>
  <div class="mtop"><select id="lyr" aria-label="底圖">${Object.entries(LAYERS).map(([k, v]) => `<option value="${k}">${v.n}</option>`).join('')}</select></div>
  <div class="fab" id="fab">
    <button id="loc" aria-label="定位我的位置"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg></button>
    <button id="rec" aria-label="開始記錄軌跡"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6" fill="currentColor"/></svg></button>
  </div>
  <div class="sheet" id="sheet"></div>`;
  $('#app').appendChild(wrap);
  const { map, setLayer } = makeMap($('#map', wrap), { layer: S.layer });
  M = { wrap, map, setLayer, tr: new Tracker(map), track: null, layer: null, fix: null, off: 0, alerted: false, min: false };
  $('#lyr').value = S.layer;
  $('#lyr').onchange = e => { S.layer = e.target.value; save(); setLayer(S.layer); };
  $('#map').addEventListener('tilefail', () => PREVIEW || toast('地圖圖磚載入失敗：可能沒網路且這一區還沒下載，或換一種底圖試試', 5000));
  map.on('dragstart', () => { M.tr.follow = false; $('#loc').classList.remove('on'); });
  $('#loc').onclick = () => { if (!M.tr.start()) return toast('這台裝置不支援定位'); M.tr.follow = true; $('#loc').classList.add('on'); if (M.fix) map.setView([M.fix.lat, M.fix.lon], Math.max(map.getZoom(), 15)); };
  $('#rec').onclick = () => M.tr.rec ? stopRec() : startRec();
  M.tr.on(fix => {
    if (fix.error) { toast(fix.error, 4000); return; }
    M.fix = fix;
    if (M.track) {
      const n = offRoute(M.track, fix);
      if (n && fix.acc < 50 && n.d > 60) M.off++; else { M.off = 0; M.alerted = false; }
      M.near = n;
      if (M.off >= 2 && !M.alerted) { M.alerted = true; try { NATIVE ? Android.vibrate(900) : navigator.vibrate && navigator.vibrate([300, 150, 300]); } catch (e) {} }
    }
    sheet();
  });
  const ro = new ResizeObserver(() => { $('#fab').style.bottom = ($('#sheet').offsetHeight + 12) + 'px'; }); ro.observe($('#sheet'));
  const rec = await kv.get('rec'); if (rec && rec.length) { M.tr.startRec(p => kv.set('rec', p), rec); $('#rec').classList.add('rec'); toast('接續上次未結束的記錄'); }
  return M;
}
async function setActive(id) {
  if (M.layer) { M.map.removeLayer(M.layer); M.layer = null; }
  M.track = id ? await tracks.get(id) : null; M.off = 0; M.alerted = false; M.near = null;
  S.active = M.track ? M.track.id : null; save();
  if (M.track) M.layer = drawTrack(M.map, M.track);
  sheet();
}
function startRec() {
  M.tr.startRec(p => { if (p.length % 5 === 0) kv.set('rec', p); sheet(); });
  $('#rec').classList.add('rec'); $('#loc').classList.add('on'); M.tr.follow = true;
  toast('開始記錄。螢幕會保持亮著；按電源鍵關螢幕或切到別的 App 時記錄會暫停。', 5000); sheet();
}
async function stopRec() {
  const pts = M.tr.stopRec(); $('#rec').classList.remove('rec'); await kv.set('rec', []);
  if (pts.length < 2) { toast('記錄點太少，沒有存檔'); sheet(); return; }
  const k = await saveTrack(`我的軌跡 ${today()}`, pts);
  pendingTrack = k.id; toast('軌跡已儲存'); sheet(k.id);
}
async function sheet(savedId) {
  const el = $('#sheet'); if (!el) return;
  const t = M.track, f = M.fix, n = M.near;
  const recN = M.tr.rec ? M.tr.rec.pts.length : 0;
  let h = `<button class="grab" id="grab" aria-label="展開或收合"></button>`;
  if (savedId) h += `<div class="card" style="margin-bottom:8px"><b>軌跡已儲存。</b> <a href="#trip-new">把它寫成手記 →</a></div>`;
  if (M.alerted) h += `<div class="alert">你可能偏離路線約 ${Math.round(n.d)} 公尺，停下來確認方向。</div>`;
  if (recN) h += `<p style="margin:0 0 6px"><b style="color:var(--rho)">● 記錄中</b> <span class="mute">${recN} 個點</span></p>`;
  if (t) {
    const s = t.stats, along = n ? n.along : null;
    h += `<h3>${esc(t.name)}</h3><div class="nums"><div><b>${fmtKm(s.km)}</b><span>全長</span></div><div><b>${s.up}</b><span>爬升 m</span></div>
      <div><b>${f && f.ele != null ? Math.round(f.ele) : '—'}</b><span>目前海拔 m</span></div><div><b>${n ? fmtKm(Math.max(0, n.total - n.along) / 1000) : '—'}</b><span>剩餘</span></div></div>
      <div class="full"><div class="prof">${profileSVG(s.prof, along)}</div>
      <div class="actions" style="margin:10px 0 0"><button class="btn sm p" id="dl">下載這條路線的離線地圖</button><button class="btn sm" id="chg">換路線</button><button class="btn sm" id="cls">關閉路線</button></div>
      <div id="dlbox"></div></div>`;
  } else {
    if (PREVIEW) h += `<div class="alert" style="background:var(--pine)">這是預覽版：地圖底圖、GPS 定位和離線地圖要安裝正式版才能用。可以先匯入 GPX 看路線形狀和高度剖面。</div>`;
    h += `<h3>離線地圖與導航</h3><div class="full"><p class="mute">匯入路線 GPX、下載沿線離線地圖，在山上沒訊號也能看到自己在路線的哪裡；偏離路線會震動提醒。也可以按紅點自己記錄軌跡。</p>
      <label class="btn sm p">匯入 GPX 檔<input type="file" id="mg" accept=".gpx,application/gpx+xml,application/xml,text/xml" hidden></label>
      <div class="tlist" id="tl"></div></div>`;
  }
  if (f) h += `<p class="mute full" style="margin:8px 0 0">GPS 精度 ±${Math.round(f.acc)} m${f.ele != null ? ` · 海拔 ${Math.round(f.ele)} m（手機 GPS 海拔誤差可能有數十公尺）` : ''}</p>`;
  const keep = $('#dlbox') && $('#dlbox').firstChild ? $('#dlbox') : null;
  if (keep) keep.remove();
  el.innerHTML = h; el.classList.toggle('min', M.min);
  if (keep && $('#dlbox')) $('#dlbox').replaceWith(keep);
  $('#grab').onclick = () => { M.min = !M.min; el.classList.toggle('min', M.min); };
  if (t) {
    $('#cls').onclick = () => setActive(null);
    $('#chg').onclick = () => setActive(null);
    $('#dl').onclick = () => dlTiles(t);
  } else {
    $('#mg').onchange = async e => { const file = e.target.files[0]; if (!file) return; try { const k = await importGPXFile(file); toast('路線已匯入'); setActive(k.id); } catch (err) { toast(err.message || '讀不到這個 GPX'); } };
    const K = (await tracks.all()).sort((a, b) => b.at - a.at);
    const tl = $('#tl'); if (tl) { tl.innerHTML = K.length ? K.map(k => `<button data-k="${k.id}"><b>${esc(k.name)}</b><br><span class="mute">${fmtKm(k.stats.km)} · 爬升 ${k.stats.up} m${k.stats.maxE ? ` · 最高 ${k.stats.maxE} m` : ''}</span></button>`).join('') : '<p class="mute">還沒有路線。</p>';
      tl.onclick = e => { const b = e.target.closest('[data-k]'); if (b) setActive(b.dataset.k); }; }
  }
}
let dlAbort = null;
async function dlTiles(t) {
  const box = $('#dlbox');
  const list = tilesFor(t, S.layer, 12, 16), est = Math.round(list.length * 25 / 1024);
  box.innerHTML = `<div class="card" style="margin-top:10px"><p style="margin:0 0 6px">目前底圖「${LAYERS[S.layer].n}」沿路線兩側約 700 公尺，縮放 12–16 級，共 ${list.length} 張圖磚，約 ${est} MB。請在有 Wi-Fi 的地方下載。</p>
    <div class="progress"><i id="pg"></i></div><p class="mute" id="pt" style="margin:0 0 8px"></p><button class="btn sm p" id="go">開始下載</button> <button class="btn sm" id="stop">停止</button></div>`;
  $('#stop').onclick = () => dlAbort && dlAbort.abort();
  $('#go').onclick = async () => {
    $('#go').disabled = true; dlAbort = new AbortController();
    const r = await prefetch(list, (d, fail, n) => { $('#pg').style.width = (d / n * 100) + '%'; $('#pt').textContent = `${d}/${n}${fail ? `，${fail} 張失敗` : ''}`; }, dlAbort.signal);
    $('#pt').textContent = r.fail ? `完成，但有 ${r.fail} 張失敗，可以再按一次補下載。` : '下載完成！沒訊號時這段路線的地圖也看得到。';
    $('#go').disabled = false; persist();
  };
}
async function vMap() {
  view.innerHTML = '';
  await ensureMap(); M.wrap.hidden = false;
  setTimeout(() => M.map.invalidateSize(), 50);
  if (S.active && (!M.track || M.track.id !== S.active)) await setActive(S.active); else sheet();
}

// ---------- 準備 ----------
const PLANS = {
  A: ['出發前 4 週', '每週 3 次：快走或爬樓梯 30–45 分鐘', '每週 1 次：核心與下肢肌力（深蹲、弓箭步、棒式）20 分鐘', '週末：郊山或中級山 3–5 小時，背 5–8 kg', '最後一週減量、睡飽，新鞋不要直接上山'],
  B: ['出發前 6 週', '每週 2 次：背 8–10 kg 爬樓梯 40–60 分鐘', '每週 1–2 次：肌力（深蹲、登階、單腳平衡、提踵）', '週末：中級山 6–8 小時，背 10–12 kg', '第 4–5 週：連續兩天健行，練習隔天恢復'],
  C: ['出發前 8 週，建議先完成幾座 A、B 級', '每週 2–3 次：背 12–15 kg 爬樓梯或長坡 60 分鐘以上', '每週 2 次：肌力與膝踝穩定訓練', '每 2 週：一次兩天一夜重裝中級山', '練習地圖判讀、GPX 離線導航、拉繩與碎石坡移動'],
  'C+': ['出發前 10–12 週，必須有完整 C 級經驗', 'C 級計畫全部加量，安排一次 4 天以上長程縱走', '參加登山技術課程（垂降、確保、攀岩基礎）', '跟熟悉路線的領隊或登山社團一起，不要獨攀', '練習惡劣天氣下的撤退判斷']
};
async function vPrep() {
  const est = await usage();
  view.innerHTML = `<div class="pad wrap stack"><h1 style="margin:8px 0 4px">行前準備</h1>
  <div class="card warn"><h3>安全底線</h3><ul style="margin:6px 0 0;padding-left:1.2em">
    <li><b>高山症</b>：頭痛、噁心、疲倦、睡不著是早期症狀，先休息、不要再往上。走路不穩、意識混亂、休息時也喘，立刻下撤並求援。</li>
    <li>不獨攀；照計畫的折返時間走，到時間沒登頂就下山。</li>
    <li>緊急求救撥 <b>112</b>。手機與行動電源保暖防水。</li>
    <li>這個 App 是輔助工具，請同時帶紙本地圖或第二支導航手機。</li></ul></div>
  <details class="card" open><summary>申請流程</summary><ol style="padding-left:1.3em;margin:10px 0 0">
    <li>確認路線要辦什麼：進國家公園生態保護區要<b>入園證</b>，進山地管制區要<b>入山證</b>，很多百岳兩個都要。</li>
    <li>到<a href="https://hike.taiwan.gov.tw/" target="_blank" rel="noopener">臺灣登山申請一站式服務網</a>申請入園、入山與山屋／營地。熱門山屋多半要抽籤，請看各國家公園公告的期限。</li>
    <li>投保登山保險。</li><li>把下面的留守人卡傳給家人。</li>
    <li>出發前幾天看<a href="https://www.cwa.gov.tw/V8/C/L/Mountain/Mountain.html" target="_blank" rel="noopener">中央氣象署登山天氣</a>，颱風、鋒面、豪雨就延期。</li></ol></details>
  <details class="card"><summary>留守人卡</summary><div style="margin-top:10px">
    <div class="f"><label for="l1">路線與目標山</label><input id="l1" placeholder="例如：雪山主東，雪山登山口進出"></div>
    <div class="row2"><div class="f"><label for="l2">入山時間</label><input id="l2" type="datetime-local"></div><div class="f"><label for="l3">預計下山時間</label><input id="l3" type="datetime-local"></div></div>
    <div class="f"><label for="l4">隊員與電話</label><textarea id="l4" style="min-height:80px" placeholder="姓名 電話（每行一位）"></textarea></div>
    <div class="f"><label for="l5">每天預計住哪</label><input id="l5" placeholder="D1 七卡山莊、D2 三六九山莊"></div>
    <div class="f"><label for="l6">逾時多久報案</label><input id="l6" value="預計下山時間後 6 小時仍未聯絡，撥 112 並通報國家公園"></div>
    <button class="btn p" id="lsend">分享給留守人</button></div></details>
  <div class="card"><h3>裝備清單 <span class="mute" id="gc"></span></h3><ul class="ck" id="gear"></ul><button class="btn sm" id="gr" style="margin-top:8px">清空勾選</button></div>
  <div class="card"><h3>訓練計畫</h3><select id="tp" style="margin:8px 0">${Object.keys(PLANS).map(k => `<option value="${k}">目標 ${k} ${DIFF[k].t}</option>`).join('')}</select><div id="plan"></div></div>
  <div class="card"><h3>資料與備份</h3>
    <p class="mute">所有手記、照片、軌跡都只存在這支手機。換手機前一定要匯出備份。${est ? `目前使用約 ${(est.usage / 1048576).toFixed(1)} MB。` : ''}<span id="tc"></span></p>
    <div class="row2"><button class="btn p" id="ex">匯出完整備份</button><label class="btn">從備份還原<input type="file" id="im" accept=".json,application/json" hidden></label></div>
    <button class="btn sm" id="tclr" style="margin-top:8px">清除已下載的離線地圖</button></div>
  <p class="mute">地圖：內政部國土測繪中心臺灣通用電子地圖（政府資料開放授權）。百岳名單依中華民國山岳協會，路況與規定請以官方公告為準。</p></div>`;
  let tot = 0, on = 0;
  $('#gear').innerHTML = GEAR.map(([g, items]) => `<li><p class="mute" style="margin:10px 0 0;font-weight:700">${g}</p></li>` + items.map(it => { tot++; const k = g + '/' + it; if (S.gear[k]) on++;
    return `<li><label><input type="checkbox" data-g="${esc(k)}" ${S.gear[k] ? 'checked' : ''}> ${esc(it)}</label></li>`; }).join('')).join('');
  $('#gc').textContent = `${on}/${tot}`;
  $('#gear').onchange = e => { const k = e.target.dataset.g; if (e.target.checked) S.gear[k] = 1; else delete S.gear[k]; save(); $('#gc').textContent = `${Object.keys(S.gear).length}/${tot}`; };
  $('#gr').onclick = () => { S.gear = {}; save(); vPrep(); };
  const plan = () => { const p = PLANS[$('#tp').value]; $('#plan').innerHTML = `<p class="mute">${p[0]}</p><ul style="padding-left:1.2em;margin:0">${p.slice(1).map(x => `<li>${x}</li>`).join('')}</ul>`; };
  $('#tp').onchange = plan; plan();
  $('#lsend').onclick = async () => {
    const v = i => $('#l' + i).value.trim(), dt = s => s ? s.replace('T', ' ') : '未填';
    const text = `【登山留守人資料】\n路線：${v(1)}\n入山：${dt(v(2))}\n預計下山：${dt(v(3))}\n住宿：${v(5)}\n隊員：\n${v(4)}\n逾時處理：${v(6)}\n緊急電話 112`;
    shareText('登山留守人資料', text);
  };
  $('#ex').onclick = async () => { toast('打包中…'); download(`百岳行備份-${today()}.json`, await exportAll(), 'application/json'); };
  $('#im').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { await importAll(await f.text()); S = Object.assign(S, await kv.get('state')); toast('已還原'); vPrep(); } catch (err) { toast(err.message || '備份檔讀取失敗'); } };
  if (NATIVE) {
    const show = () => { $('#tc').textContent = ` 已下載離線圖磚 ${Android.tileCount()} 張。`; };
    $('#tclr').onclick = () => { Android.clearTiles(); show(); toast('已清除離線地圖'); }; show();
  } else {
    $('#tclr').onclick = () => navigator.serviceWorker?.controller?.postMessage('tile-clear');
    navigator.serviceWorker?.controller?.postMessage('tile-stats');
  }
}
navigator.serviceWorker?.addEventListener('message', e => { if (e.data?.type === 'tile-stats') { const el = $('#tc'); if (el) el.textContent = ` 已下載離線圖磚 ${e.data.n} 張。`; } });

// ---------- 路由 ----------
async function route() {
  const h = location.hash.slice(1) || 'home';
  freeURLs();
  if (M) M.wrap.hidden = h !== 'map';
  const tab = h.startsWith('peak') ? 'peaks' : h.startsWith('trip') ? 'trips' : h;
  $$('.tabs a').forEach(a => a.toggleAttribute('aria-current', a.dataset.t === tab));
  let m;
  if (h === 'home') await vHome();
  else if (h === 'peaks') vPeaks('list');
  else if (h === 'peaks-routes') vPeaks('routes');
  else if ((m = h.match(/^peak-(\d+)$/))) await vPeak(+m[1]);
  else if (h === 'map') await vMap();
  else if (h === 'trips') await vTrips();
  else if (h === 'trip-new') await vTripEdit(null);
  else if ((m = h.match(/^trip-edit-(.+)$/))) await vTripEdit(m[1]);
  else if ((m = h.match(/^trip-(.+)$/))) await vTrip(m[1]);
  else if (h === 'prep') await vPrep();
  else await vHome();
  if (h !== 'map') { scrollTo(0, 0); view.focus({ preventScroll: true }); }
}
view.addEventListener('click', e => { const b = e.target.closest('[data-peak]'); if (b) location.hash = '#peak-' + b.dataset.peak; });
addEventListener('hashchange', route);

(async () => {
  try { const st = await kv.get('state'); if (st) S = Object.assign(S, st); } catch (e) { toast(NATIVE ? '無法存資料，請重新開啟 App' : '這個瀏覽器無法存資料，請用 Chrome 開啟'); }
  await route();
  if (!NATIVE && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  persist();
})();
