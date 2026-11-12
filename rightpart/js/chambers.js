// Sealed chambers on this tablet: every library version it runs is sealed into a chain, the last few
// are kept whole so the line can go back to one, and every completed build is sealed into the
// tablet's own chain. See core/seal.js for why.
import { get, put, del, listRecords } from './store.js';
import { chamberFor, verifyChambers, hashOf, sealRecord, verifyRecords } from './core/seal.js';

const KEEP_WHOLE = 3;

export async function chambers() { return (await get('kv', 'chambers'))?.value || []; }

/** Seal `lib` as the newest chamber, unless it already is one. Keeps its content to go back to. */
export async function sealVersion(lib, note = '') {
  if (!lib?.parts) return null;
  const list = await chambers();
  const last = list[list.length - 1];
  const hash = await hashOf(lib);
  if (last?.hash === hash) return last;
  const c = await chamberFor(lib, last, { note });
  list.push(c);
  await put('kv', { key: `chamber:${c.hash}`, value: lib });
  // The seals stay forever; the content of old versions does not need to.
  const whole = new Set(list.slice(-KEEP_WHOLE).map((x) => x.hash));
  for (const x of list) {
    if (!whole.has(x.hash) && !x.dropped) { await del('kv', `chamber:${x.hash}`); x.dropped = true; }
  }
  await put('kv', { key: 'chambers', value: list });
  return c;
}

/** The content of a sealed version, checked against its seal before it is handed back. */
export async function openChamber(hash) {
  const lib = (await get('kv', `chamber:${hash}`))?.value;
  if (!lib || (await hashOf(lib)) !== hash) return null;
  return lib;
}

/** Does the library this tablet is running match the newest seal? null = nothing sealed yet. */
export async function checkCurrent(lib) {
  const last = (await chambers()).at(-1);
  if (!last || !lib) return null;
  return (await hashOf(lib)) === last.hash;
}

async function chainId() {
  let id = (await get('kv', 'chain-id'))?.value;
  if (!id) { id = `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; await put('kv', { key: 'chain-id', value: id }); }
  return id;
}

/** Seal a build record that has just been completed. */
export async function sealBuild(record) {
  const chain = await chainId();
  const last = (await listRecords('build')).filter((r) => r.seal?.chain === chain && r.id !== record.id).sort((a, b) => b.seal.n - a.seal.n)[0];
  return sealRecord(record, last, chain);
}

/** Check every seal on this tablet: library versions and completed builds. */
export async function checkAll() {
  const list = await chambers();
  const versions = await verifyChambers(list);
  const records = await verifyRecords(await listRecords('build'));
  return { versions: { ...versions, count: list.length }, records };
}

/** After the records are cleared on purpose, the tablet starts a new chain. */
export async function newChain() { await del('kv', 'chain-id'); }
