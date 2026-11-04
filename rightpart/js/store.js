// Storage on this device only. Nothing is sent anywhere.
//  - IndexedDB "rightpart": the imported library, build records, reports, photo samples
//  - localStorage: small settings (theme, screen calibration)
// Every call survives private windows and blocked storage by falling back to memory.

const DB_NAME = 'rightpart';
const DB_VERSION = 1;
const STORES = ['kv', 'records', 'samples'];
const memory = { kv: new Map(), records: new Map(), samples: new Map() };
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: s === 'kv' ? 'key' : 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await openDB();
  if (!db) return fn(null);
  return new Promise((resolve) => {
    try {
      const t = db.transaction(store, mode);
      const os = t.objectStore(store);
      const out = fn(os);
      t.oncomplete = () => resolve(out?.result !== undefined ? out.result : out);
      t.onerror = () => resolve(fn(null));
      t.onabort = () => resolve(fn(null));
    } catch { resolve(fn(null)); }
  });
}

const keyOf = (store, v) => (store === 'kv' ? v.key : v.id);

export async function put(store, value) {
  memory[store].set(keyOf(store, value), value);
  return tx(store, 'readwrite', (os) => (os ? os.put(value) : null));
}

export async function get(store, key) {
  const db = await openDB();
  if (!db) return memory[store].get(key) ?? null;
  return new Promise((resolve) => {
    try {
      const r = db.transaction(store).objectStore(store).get(key);
      r.onsuccess = () => resolve(r.result ?? memory[store].get(key) ?? null);
      r.onerror = () => resolve(memory[store].get(key) ?? null);
    } catch { resolve(memory[store].get(key) ?? null); }
  });
}

export async function all(store) {
  const db = await openDB();
  if (!db) return [...memory[store].values()];
  return new Promise((resolve) => {
    try {
      const r = db.transaction(store).objectStore(store).getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => resolve([...memory[store].values()]);
    } catch { resolve([...memory[store].values()]); }
  });
}

export async function del(store, key) {
  memory[store].delete(key);
  return tx(store, 'readwrite', (os) => (os ? os.delete(key) : null));
}

export async function clear(store) {
  memory[store].clear();
  return tx(store, 'readwrite', (os) => (os ? os.clear() : null));
}

// ---------- Library ----------
export async function loadLibrary(demoUrl) {
  const saved = await get('kv', 'library');
  if (saved?.value?.parts) return { library: saved.value, source: 'imported', savedAt: saved.savedAt, name: saved.name };
  const res = await fetch(demoUrl, { cache: 'no-cache' }).catch(() => null) || await fetch(demoUrl);
  if (!res.ok) throw new Error('Could not load the demo library');
  return { library: await res.json(), source: 'demo' };
}

export async function saveLibrary(library, name = 'Imported library') {
  await put('kv', { key: 'library', value: library, savedAt: Date.now(), name });
}

export async function resetLibrary() {
  await del('kv', 'library');
}

// ---------- Records: build records and floor reports ----------
const uid = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export async function addRecord(rec) {
  const r = { id: rec.id || uid(rec.type || 'rec'), createdAt: Date.now(), ...rec };
  await put('records', r);
  return r;
}
export const updateRecord = (rec) => put('records', rec);
export async function listRecords(type) {
  const list = await all('records');
  return list.filter((r) => !type || r.type === type).sort((a, b) => b.createdAt - a.createdAt);
}

// ---------- Settings ----------
const SKEY = 'rightpart.settings';
let settingsCache = null;
export function settings() {
  if (settingsCache) return settingsCache;
  try { settingsCache = JSON.parse(localStorage.getItem(SKEY) || '{}'); } catch { settingsCache = {}; }
  return settingsCache;
}
export function setSetting(k, v) {
  const s = settings();
  if (v === undefined || v === null) delete s[k]; else s[k] = v;
  try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch { /* memory only */ }
}

export async function storageEstimate() {
  try { return await navigator.storage?.estimate?.(); } catch { return null; }
}
