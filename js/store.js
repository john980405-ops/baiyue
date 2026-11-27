// 資料都存在手機本機（IndexedDB），沒網路也能用
const DB_NAME = 'baiyue', VER = 1;
let dbp;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    let r;
    try { r = indexedDB.open(DB_NAME, VER); } catch (e) { rej(e); return; }
    setTimeout(() => rej(new Error('timeout')), 4000);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      if (!d.objectStoreNames.contains('trips')) d.createObjectStore('trips', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('tracks')) d.createObjectStore('tracks', { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
// 如果這個環境不能用 IndexedDB（例如某些預覽視窗），改存在記憶體，App 仍可操作
const MEM = {};
function memStore(name) {
  const m = MEM[name] || (MEM[name] = new Map());
  const keyOf = v => v.id;
  return {
    get: k => ({ result: m.get(k) }), getAll: () => ({ result: [...m.values()] }),
    put: (v, k) => { m.set(k ?? keyOf(v), v); return {}; }, delete: k => { m.delete(k); return {}; }, clear: () => { m.clear(); return {}; }
  };
}
let memMode = false;
export const isMemory = () => memMode;
async function tx(store, mode, fn) {
  let d;
  try { if (memMode) throw 0; d = await open(); }
  catch (e) { memMode = true; const out = fn(memStore(store)); return out && 'result' in out ? out.result : out; }
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode), s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = () => res(out && 'result' in out ? out.result : out);
    t.onerror = () => rej(t.error);
  });
}
export const kv = {
  get: k => tx('kv', 'readonly', s => s.get(k)),
  set: (k, v) => tx('kv', 'readwrite', s => s.put(v, k))
};
const coll = name => ({
  all: () => tx(name, 'readonly', s => s.getAll()),
  get: id => tx(name, 'readonly', s => s.get(id)),
  put: v => tx(name, 'readwrite', s => s.put(v)),
  del: id => tx(name, 'readwrite', s => s.delete(id)),
  clear: () => tx(name, 'readwrite', s => s.clear())
});
export const trips = coll('trips');
export const photos = coll('photos');   // {id, tripId, blob, thumb(blob), at, lat, lon}
export const tracks = coll('tracks');   // {id, name, pts:[[lat,lon,ele,time]], wpts:[{lat,lon,name,ele}], stats, at}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// 要求瀏覽器不要自動清掉資料
export async function persist() {
  try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) {}
  return false;
}
export async function usage() {
  try { const e = await navigator.storage.estimate(); return e; } catch (e) { return null; }
}

// 照片：縮成 1600px 與 360px 縮圖
export async function shrink(file, max, q = 0.82) {
  let bmp;
  try { bmp = await createImageBitmap(file); } catch (e) { return file; }
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(b => r(b || file), 'image/jpeg', q));
}

// 備份：全部資料（含照片）匯出成一個 JSON 檔
const b2d = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
const d2b = async d => (await fetch(d)).blob();
export async function exportAll() {
  const state = await kv.get('state');
  const T = await trips.all(), K = await tracks.all(), P = await photos.all();
  const PP = [];
  for (const p of P) PP.push({ ...p, blob: await b2d(p.blob), thumb: p.thumb ? await b2d(p.thumb) : null });
  return JSON.stringify({ app: 'baiyue', v: 1, at: new Date().toISOString(), state, trips: T, tracks: K, photos: PP });
}
export async function importAll(text) {
  const o = JSON.parse(text);
  if (o.app !== 'baiyue') throw new Error('不是百岳行的備份檔');
  if (o.state) await kv.set('state', o.state);
  for (const t of o.trips || []) await trips.put(t);
  for (const t of o.tracks || []) await tracks.put(t);
  for (const p of o.photos || []) await photos.put({ ...p, blob: await d2b(p.blob), thumb: p.thumb ? await d2b(p.thumb) : null });
}
