// Floor trails: stigmergy.
// Ants do not report to anyone. Each one leaves a little scent where it walks; paths that many use
// grow strong, and the scent evaporates, so a path nobody needs any more fades by itself. The trail
// says "many passed here", never which ant. Here every wrong part stopped, every override, every
// report, every unknown code and every unusually long pause leaves a mark on its step, and marks
// fade by half every two weeks. An engineer sees which steps trouble the floor now, and after a
// change to the instructions, whether the trail fades. No names: only how many, where and when.
// Pure: records in, trails out.

export const WEIGHTS = { wrong: 3, override: 3, report: 3, conflict: 2, unknown: 2, slow: 1 };
export const HALF_LIFE_DAYS = 14;
const DAY = 864e5;

const kindOf = (result) => (result === 'wrong' ? 'wrong'
  : result === 'override' ? 'override'
    : result === 'conflict' || result === 'conflict-bom' ? 'conflict'
      : result === 'unknown' || result === 'ambiguous' ? 'unknown' : null);

/** Marks left by records: { deviceId, stepId, kind, at, rev, from }. `from` is a record id, not a person. */
export function depositsFrom(records = []) {
  const out = [];
  const durations = new Map();
  for (const r of records) {
    if (r?.type === 'report' && r.deviceId && r.stepId && r.createdAt) out.push({ deviceId: r.deviceId, stepId: r.stepId, kind: 'report', at: r.createdAt, rev: null, from: r.id });
    if (r?.type !== 'build' || !r.deviceId) continue;
    for (const e of r.events || []) {
      const kind = kindOf(e?.result);
      if (kind && e.stepId && e.at) out.push({ deviceId: r.deviceId, stepId: e.stepId, kind, at: e.at, rev: r.instructionsRev || null, from: r.id });
    }
    // Time spent on each step, from the moments steps were completed.
    let prev = r.createdAt;
    for (const s of (r.steps || []).filter((x) => x.completedAt).sort((a, b) => a.completedAt - b.completedAt)) {
      const ms = s.completedAt - prev;
      prev = s.completedAt;
      if (!(ms > 0 && ms < 4 * 3600e3)) continue;
      const k = JSON.stringify([r.deviceId, s.stepId]);
      if (!durations.has(k)) durations.set(k, []);
      durations.get(k).push({ ms, at: s.completedAt, rev: r.instructionsRev || null, from: r.id });
    }
  }
  for (const [k, list] of durations) {
    if (list.length < 3) continue; // too few builds to know what is normal
    const sorted = list.map((x) => x.ms).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const [deviceId, stepId] = JSON.parse(k);
    for (const x of list) if (x.ms > 2 * median && x.ms - median > 60e3) out.push({ deviceId, stepId, kind: 'slow', at: x.at, rev: x.rev, from: x.from });
  }
  return out;
}

/**
 * Trails per device and step, as strong as they are `now`. A device's trails are shown only when
 * marks come from at least `minSources` different builds or reports, so no single build stands out.
 */
export function trails(deposits = [], { now = Date.now(), halfLifeDays = HALF_LIFE_DAYS, minSources = 3 } = {}) {
  const devices = new Map();
  for (const d of deposits) {
    if (!d?.deviceId || !d.stepId || !WEIGHTS[d.kind] || !Number.isFinite(d.at) || d.at > now + DAY) continue;
    if (!devices.has(d.deviceId)) devices.set(d.deviceId, { sources: new Set(), steps: new Map(), max: 0 });
    const dev = devices.get(d.deviceId);
    dev.sources.add(d.from || `${d.kind}@${d.at}`);
    if (!dev.steps.has(d.stepId)) dev.steps.set(d.stepId, { strength: 0, marks: 0, kinds: {}, last: 0, byRev: {} });
    const st = dev.steps.get(d.stepId);
    const s = WEIGHTS[d.kind] * 2 ** (-Math.max(0, now - d.at) / (halfLifeDays * DAY));
    st.strength += s;
    st.marks++;
    st.kinds[d.kind] = (st.kinds[d.kind] || 0) + 1;
    st.last = Math.max(st.last, d.at);
    if (d.rev) st.byRev[d.rev] = (st.byRev[d.rev] || 0) + 1;
  }
  for (const dev of devices.values()) {
    dev.visible = dev.sources.size >= minSources;
    dev.sourceCount = dev.sources.size;
    delete dev.sources;
    for (const st of dev.steps.values()) {
      st.strength = Math.round(st.strength * 100) / 100;
      st.state = now - st.last <= 3 * DAY ? 'fresh' : now - st.last >= halfLifeDays * DAY ? 'fading' : 'steady';
      dev.max = Math.max(dev.max, st.strength);
    }
  }
  return devices;
}

/** Example marks a demo library carries (`agoDays` before now, so the demo stays current). */
export function libraryDeposits(lib, now = Date.now()) {
  if (!lib?.meta?.demo) return [];
  return (lib.trails?.deposits || []).filter((d) => Number.isFinite(d?.agoDays)).map(({ agoDays, ...d }) => ({ ...d, at: now - agoDays * DAY, example: true }));
}
