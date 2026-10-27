// Tiny IndexedDB key-value store (survives app kills; offline data lives here).
// Never blocks the app: if IndexedDB is unavailable, blocked by another tab, or slow (private mode, old iOS),
// reads return undefined and writes are dropped after a short timeout — the app keeps working online.
const DB = 'hafsmon';
let dbp;

function open() {
  dbp ??= new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('IDB_TIMEOUT')), 4000);
    let req;
    try { req = indexedDB.open(DB, 1); } catch (e) { clearTimeout(timer); reject(e); return; }
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => {
      clearTimeout(timer);
      const db = req.result;
      db.onversionchange = () => { db.close(); dbp = null; };   // let other tabs upgrade / delete
      resolve(db);
    };
    req.onerror = () => { clearTimeout(timer); reject(req.error); };
  }).catch((e) => { dbp = null; throw e; });
  return dbp;
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction('kv', mode);
    const r = fn(t.objectStore('kv'));
    t.oncomplete = () => resolve(r?.result);
    t.onerror = () => reject(t.error);
  });
}

const safe = (p) => p.catch(() => undefined);

export const kv = {
  get: (k) => safe(tx('readonly', (s) => s.get(k))),
  set: (k, v) => safe(tx('readwrite', (s) => s.put(v, k))),
  del: (k) => safe(tx('readwrite', (s) => s.delete(k))),
  clear: () => safe(tx('readwrite', (s) => s.clear())),
};

// ask the browser not to evict our data (best effort)
export function persist() {
  try { navigator.storage?.persist?.(); } catch { /* ignore */ }
}
