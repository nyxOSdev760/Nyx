/* A tiny IndexedDB key/value store for things too big for localStorage,
   namely the custom wallpaper image. Never throws; resolves null on failure
   (private mode, blocked storage) so the OS keeps working. */
const DB = 'nyxos', STORE = 'kv';   // the pre-Kanni name, kept so saved data stays
let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    let req;
    try { req = indexedDB.open(DB, 1); } catch { resolve(null); return; }
    req.onupgradeneeded = () => { try { req.result.createObjectStore(STORE); } catch {} };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  }).catch(() => null);
  return dbp;
}
function tx(mode, fn) {
  return open().then(db => new Promise((resolve) => {
    if (!db) { resolve(null); return; }
    let store;
    try { store = db.transaction(STORE, mode).objectStore(STORE); } catch { resolve(null); return; }
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  })).catch(() => null);
}
export const IDB = {
  get(key) { return tx('readonly', s => s.get(key)); },
  set(key, val) { return tx('readwrite', s => s.put(val, key)); },
  del(key) { return tx('readwrite', s => s.delete(key)); },
};
