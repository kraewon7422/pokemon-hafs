// Tiny IndexedDB key-value store (survives app kills; offline data lives here).
const DB = 'hafsmon';
let dbp;

function open() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
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

export const kv = {
  get: (k) => tx('readonly', (s) => s.get(k)),
  set: (k, v) => tx('readwrite', (s) => s.put(v, k)),
  del: (k) => tx('readwrite', (s) => s.delete(k)),
  clear: () => tx('readwrite', (s) => s.clear()),
};

// ask the browser not to evict our data (best effort)
export function persist() {
  try { navigator.storage?.persist?.(); } catch { /* ignore */ }
}
