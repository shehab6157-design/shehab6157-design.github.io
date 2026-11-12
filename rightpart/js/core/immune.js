// Learned mix-ups: the app's immune memory.
// A body that has met an infection once fights it faster the second time. Here, every wrong part
// stopped at the bench is remembered as (device, step, part needed, part picked instead), and the
// next person at that step is warned before they pick. The quiz trains new people on the real
// mix-ups (like a vaccine) and engineers see which bins to separate.
// A memory says what was confused where, never who confused it: no names, no serial numbers.
// Pure functions: build records and the library's shared memory in, memory out.

const keyOf = (e) => `${e.deviceId}|${e.stepId}|${e.expected}|${e.taken}`;

/** Mix-ups found in build records: this tablet's own memory. */
export function mixupsFromRecords(records = []) {
  const map = new Map();
  for (const r of records) {
    if (r?.type !== 'build' || !r.deviceId) continue;
    for (const ev of r.events || []) {
      if (ev?.result !== 'wrong' || !ev.partId || !ev.scanned || ev.partId === ev.scanned || !ev.stepId) continue;
      const e = { deviceId: r.deviceId, stepId: ev.stepId, expected: ev.partId, taken: ev.scanned };
      const k = keyOf(e);
      if (!map.has(k)) map.set(k, { ...e, events: [] });
      map.get(k).events.push({ key: `${r.id}#${ev.at}`, at: ev.at });
    }
  }
  for (const e of map.values()) e.events.sort((a, b) => a.at - b.at);
  return [...map.values()];
}

/** Merge memories (this tablet's and the one shared with the library). The same event counts once. */
export function mergeMixups(...lists) {
  const map = new Map();
  for (const list of lists) {
    for (const e of list || []) {
      if (!e?.deviceId || !e.stepId || !e.expected || !e.taken || e.expected === e.taken) continue;
      const k = keyOf(e);
      const cur = map.get(k) || { deviceId: e.deviceId, stepId: e.stepId, expected: e.expected, taken: e.taken, events: [] };
      const seen = new Set(cur.events.map((x) => x.key));
      for (const x of e.events || []) {
        if (!x?.key || seen.has(x.key) || !Number.isFinite(x.at)) continue;
        seen.add(x.key);
        cur.events.push({ key: x.key, at: x.at });
      }
      map.set(k, cur);
    }
  }
  const out = [...map.values()].filter((e) => e.events.length);
  for (const e of out) e.events.sort((a, b) => a.at - b.at);
  return out;
}

export const countOf = (e) => e?.events?.length || 0;
export const lastAt = (e) => (e?.events?.length ? e.events[e.events.length - 1].at : 0);
export const firstAt = (e) => (e?.events?.length ? e.events[0].at : 0);

/**
 * Index a memory for the pages, strongest first (more often, then more recent).
 * `index` (optional, from buildIndex) drops memories of parts, devices or steps that no longer exist.
 */
export function memoryIndex(entries = [], index = null) {
  const alive = (e) => !index || (index.parts.has(e.expected) && index.parts.has(e.taken)
    && (index.devices.get(e.deviceId)?.instructions?.steps || []).some((s) => s.id === e.stepId));
  const all = entries.filter((e) => countOf(e) && alive(e)).sort((a, b) => countOf(b) - countOf(a) || lastAt(b) - lastAt(a));
  const byStep = new Map();
  const byPart = new Map();
  const add = (m, k, e) => { if (!m.has(k)) m.set(k, []); m.get(k).push(e); };
  for (const e of all) {
    add(byStep, `${e.deviceId}/${e.stepId}`, e);
    add(byPart, e.expected, e);
    add(byPart, e.taken, e);
  }
  return { all, byStep, byPart, total: all.reduce((n, e) => n + countOf(e), 0) };
}

/** Mix-ups at one step for one needed part. */
export function mixupsAt(memory, deviceId, stepId, partId) {
  return (memory?.byStep.get(`${deviceId}/${stepId}`) || []).filter((e) => !partId || e.expected === partId);
}

/** Pairs of parts that people have really confused, either way round: "a|b" (sorted) -> times. */
export function confusedPairs(entries = []) {
  const map = new Map();
  for (const e of entries) {
    const k = [e.expected, e.taken].sort().join('|');
    map.set(k, (map.get(k) || 0) + countOf(e));
  }
  return map;
}

/** The library's shared memory after an engineer adds this tablet's memory to it. */
export function shareMemory(libMemory, local) {
  return { ...(libMemory || {}), mixups: mergeMixups(libMemory?.mixups, local), updated: new Date().toISOString().slice(0, 10) };
}

/** Events this tablet remembers that the library's shared memory does not have yet. */
export function unsharedCount(libMemory, local) {
  const known = new Set((libMemory?.mixups || []).flatMap((e) => (e.events || []).map((x) => `${keyOf(e)}#${x.key}`)));
  return (local || []).reduce((n, e) => n + (e.events || []).filter((x) => !known.has(`${keyOf(e)}#${x.key}`)).length, 0);
}
