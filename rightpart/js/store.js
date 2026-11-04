// Storage on this device. Each company is a separate workspace with its own IndexedDB
// database, so two companies' data can never mix, and removing a company removes all of it.
//  - IndexedDB "rightpart" (the demo) or "rightpart-<workspace id>": library, records, photo samples
//  - localStorage: the list of workspaces and small settings (theme, screen calibration)
// Every call survives private windows and blocked storage by falling back to memory.
// A signed-in (cloud) workspace keeps a copy here too, so the app works offline on the floor.

const DB_VERSION = 1;
const STORES = ['kv', 'records', 'samples'];
const REG_KEY = 'rightpart.workspaces';
const DEMO = { id: 'demo', name: 'Demo: Nova-1 (fictional)', kind: 'demo' };

const dbPromises = new Map();
const memories = new Map();

const dbName = (id) => (id === 'demo' ? 'rightpart' : `rightpart-${id}`);

// ---------- Workspace registry ----------
let registryCache = null;
function readRegistry() {
  if (registryCache) return registryCache;
  let r = null;
  try { r = JSON.parse(localStorage.getItem(REG_KEY) || 'null'); } catch { r = null; }
  if (!r || !Array.isArray(r.list)) r = { current: 'demo', list: [DEMO] };
  if (!r.list.some((w) => w.id === 'demo')) r.list.unshift(DEMO);
  if (!r.list.some((w) => w.id === r.current)) r.current = 'demo';
  registryCache = r;
  return r;
}
function writeRegistry(r) {
  registryCache = r;
  try { localStorage.setItem(REG_KEY, JSON.stringify(r)); } catch { /* memory only */ }
}

export function workspaces() { return readRegistry().list; }
export function currentWorkspace() { const r = readRegistry(); return r.list.find((w) => w.id === r.current) || DEMO; }
export function setCurrentWorkspace(id) { const r = readRegistry(); if (r.list.some((w) => w.id === id)) { r.current = id; writeRegistry(r); } }

export function addWorkspace({ name, kind = 'local', org = null }) {
  const r = readRegistry();
  const id = `ws-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const w = { id, name: String(name || 'New company').trim().slice(0, 80), kind, org, createdAt: Date.now() };
  r.list.push(w);
  writeRegistry(r);
  return w;
}

export function updateWorkspace(id, patch) {
  const r = readRegistry();
  const w = r.list.find((x) => x.id === id);
  if (!w || id === 'demo') return null;
  Object.assign(w, patch);
  writeRegistry(r);
  return w;
}

/** Removes a company and everything stored for it on this device. */
export async function deleteWorkspace(id) {
  if (id === 'demo') return false;
  const r = readRegistry();
  r.list = r.list.filter((w) => w.id !== id);
  if (r.current === id) r.current = 'demo';
  writeRegistry(r);
  const p = dbPromises.get(id);
  if (p) { try { (await p)?.close(); } catch { /* ignore */ } }
  dbPromises.delete(id);
  memories.delete(id);
  await new Promise((resolve) => {
    try { const req = indexedDB.deleteDatabase(dbName(id)); req.onsuccess = req.onerror = req.onblocked = () => resolve(); } catch { resolve(); }
  });
  return true;
}

// ---------- IndexedDB per workspace ----------
function mem() {
  const id = currentWorkspace().id;
  if (!memories.has(id)) memories.set(id, { kv: new Map(), records: new Map(), samples: new Map() });
  return memories.get(id);
}

function openDB() {
  const id = currentWorkspace().id;
  if (dbPromises.has(id)) return dbPromises.get(id);
  const p = new Promise((resolve) => {
    try {
      const req = indexedDB.open(dbName(id), DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: s === 'kv' ? 'key' : 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  dbPromises.set(id, p);
  return p;
}

async function write(store, fn) {
  const db = await openDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const t = db.transaction(store, 'readwrite');
      fn(t.objectStore(store));
      t.oncomplete = () => resolve(true);
      t.onerror = t.onabort = () => resolve(false);
    } catch { resolve(false); }
  });
}

const keyOf = (store, v) => (store === 'kv' ? v.key : v.id);

export async function put(store, value) {
  mem()[store].set(keyOf(store, value), value);
  return write(store, (os) => os.put(value));
}

export async function get(store, key) {
  const m = mem()[store];
  const db = await openDB();
  if (!db) return m.get(key) ?? null;
  return new Promise((resolve) => {
    try {
      const r = db.transaction(store).objectStore(store).get(key);
      r.onsuccess = () => resolve(r.result ?? m.get(key) ?? null);
      r.onerror = () => resolve(m.get(key) ?? null);
    } catch { resolve(m.get(key) ?? null); }
  });
}

export async function all(store) {
  const m = mem()[store];
  const db = await openDB();
  if (!db) return [...m.values()];
  return new Promise((resolve) => {
    try {
      const r = db.transaction(store).objectStore(store).getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => resolve([...m.values()]);
    } catch { resolve([...m.values()]); }
  });
}

export async function del(store, key) {
  mem()[store].delete(key);
  return write(store, (os) => os.delete(key));
}

export async function clear(store) {
  mem()[store].clear();
  return write(store, (os) => os.clear());
}

// ---------- Library ----------
export function emptyLibrary(name) {
  return { schema: 'rightpart/1', meta: { name, demo: false, created: new Date().toISOString().slice(0, 10) }, parts: [], devices: [] };
}

/** The current workspace's library: saved copy, the demo file, or an empty library for a new company. */
export async function loadLibrary(demoUrl) {
  const ws = currentWorkspace();
  const saved = await get('kv', 'library');
  if (saved?.value?.parts) return { library: saved.value, source: ws.kind === 'demo' ? 'imported' : ws.kind, savedAt: saved.savedAt, name: saved.name, version: saved.version ?? null };
  if (ws.kind === 'demo') {
    const res = await fetch(demoUrl, { cache: 'no-cache' }).catch(() => null) || await fetch(demoUrl);
    if (!res.ok) throw new Error('Could not load the demo library');
    return { library: await res.json(), source: 'demo' };
  }
  return { library: emptyLibrary(ws.name), source: ws.kind, savedAt: null, name: ws.name, version: null };
}

export async function saveLibrary(library, name = 'Imported library', extra = {}) {
  await put('kv', { key: 'library', value: library, savedAt: Date.now(), name, ...extra });
}

export async function libraryMeta() {
  const saved = await get('kv', 'library');
  return saved ? { savedAt: saved.savedAt, name: saved.name, version: saved.version ?? null, dirty: !!saved.dirty } : null;
}

export async function resetLibrary() {
  await del('kv', 'library');
}

// ---------- Records: build records and floor reports ----------
const uid = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export async function addRecord(rec) {
  const r = { id: rec.id || uid(rec.type || 'rec'), createdAt: Date.now(), ...rec, synced: false };
  await put('records', r);
  return r;
}
export const updateRecord = (rec) => put('records', { ...rec, synced: false });
export async function listRecords(type) {
  const list = await all('records');
  return list.filter((r) => !type || r.type === type).sort((a, b) => b.createdAt - a.createdAt);
}

// ---------- Settings (per device, shared by all companies) ----------
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
