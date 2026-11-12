// Sealed chambers: a record that cannot be quietly rewritten.
// A chambered nautilus grows by building a new chamber and sealing the old one behind a wall; a tree
// adds a ring each year, and no inner ring can change without cutting through every ring outside it.
// Here every library version a tablet runs, and every build it completes, gets a seal: the SHA-256
// of its content, chained to the seal before it. Change one old record and its seal, and every seal
// after it, no longer match. Anyone can check this offline.
// Pure (WebCrypto for SHA-256): content in, seals and verdicts out.

const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
export const sha256hex = async (text) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));

/** JSON with sorted keys and no undefined values: the same content always gives the same text. */
export function canonical(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : canonical(x))).join(',')}]`;
  return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
}

export const hashOf = (v) => sha256hex(canonical(v));

// Fields that travel with a record but are not part of what happened at the bench.
const TRANSPORT = ['seal', 'synced', 'via'];
const content = (rec) => Object.fromEntries(Object.entries(rec).filter(([k]) => !TRANSPORT.includes(k)));

const linkOf = (n, hash, prev, at) => sha256hex(`${n}|${hash}|${prev || ''}|${at}`);

/** The next chamber after `last` for a library version. */
export async function chamberFor(lib, last, { at = Date.now(), note = '' } = {}) {
  const hash = await hashOf(lib);
  const n = (last?.n || 0) + 1;
  const prev = last?.seal || null;
  const steps = (lib.devices || []).reduce((s, d) => s + (d.instructions?.steps?.length || 0), 0);
  return { n, hash, prev, at, seal: await linkOf(n, hash, prev, at), note: String(note || '').slice(0, 200), name: lib.meta?.name || '', parts: (lib.parts || []).length, steps };
}

/** Check a chain of chambers (oldest first). Returns { ok, broken: n | null }. */
export async function verifyChambers(chambers = []) {
  let prev = null;
  for (const c of chambers) {
    if (c.prev !== prev || c.seal !== await linkOf(c.n, c.hash, c.prev, c.at)) return { ok: false, broken: c.n };
    prev = c.seal;
  }
  return { ok: true, broken: null };
}

/** Seal a completed build record, chained to the last sealed record of the same tablet. */
export async function sealRecord(rec, last, chain) {
  const hash = await hashOf(content(rec));
  const n = (last?.seal?.n || 0) + 1;
  const prev = last?.seal?.seal || null;
  const at = rec.completedAt || Date.now();
  return { ...rec, seal: { chain, n, hash, prev, at, seal: await linkOf(n, hash, prev, at) } };
}

/**
 * Check every sealed build record, tablet by tablet. Returns { ok, sealed, chains, problems: [{ id, why }] }:
 * why = 'changed' (content does not match its seal), 'broken' (the chain does not join), 'missing' (a record is gone).
 */
export async function verifyRecords(records = []) {
  const chains = new Map();
  for (const r of records) if (r?.seal?.chain) { if (!chains.has(r.seal.chain)) chains.set(r.seal.chain, []); chains.get(r.seal.chain).push(r); }
  const problems = [];
  let sealed = 0;
  for (const list of chains.values()) {
    list.sort((a, b) => a.seal.n - b.seal.n);
    let prev = null, expect = list[0]?.seal.n || 1;
    for (const r of list) {
      sealed++;
      const s = r.seal;
      if (s.n !== expect) problems.push({ id: r.id, why: 'missing' });
      else if (s.prev !== prev && !(s.n === list[0].seal.n && prev === null)) problems.push({ id: r.id, why: 'broken' });
      if (s.hash !== await hashOf(content(r)) || s.seal !== await linkOf(s.n, s.hash, s.prev, s.at)) problems.push({ id: r.id, why: 'changed' });
      prev = s.seal;
      expect = s.n + 1;
    }
  }
  return { ok: problems.length === 0, sealed, chains: chains.size, problems };
}
