// The part library as one connected index: every code (internal, customer, supplier,
// manufacturer, old) points to one physical part. Pure functions, no DOM.

import { decodeDesignation, decodedSpec } from './decode.js';
import { HEADS, DRIVES, MATERIALS, CATEGORY_LABELS, driveWord } from './dims.js';

export const CODE_TYPES = {
  internal: 'Internal code',
  customer: 'Customer code',
  supplier: 'Supplier code',
  manufacturer: 'Manufacturer code',
  drawing: 'Drawing callout',
  legacy: 'Old code (retired)',
  designation: 'Standard designation',
};

/** Codes are compared without case, spaces or separators: "100-0233" = "100 0233" = "1000233". */
export function normCode(s) {
  return String(s ?? '').toUpperCase().replace(/×/g, 'X').replace(/[\s\-_./\\,:;#"']+/g, '');
}

// Characters people and scanners misread for each other.
const visual = (s) => s.replace(/O/g, '0').replace(/[IL]/g, '1').replace(/S/g, '5').replace(/B/g, '8');

export function buildIndex(lib) {
  const parts = new Map();
  const byCode = new Map();
  const partList = lib.parts || [];
  const addCode = (partId, alias) => {
    const n = normCode(alias.code);
    if (!n) return;
    const list = byCode.get(n) || [];
    if (!list.some((e) => e.partId === partId && e.alias.type === alias.type)) list.push({ partId, alias });
    byCode.set(n, list);
  };
  for (const p of partList) {
    parts.set(p.id, p);
    addCode(p.id, { type: 'internal', code: p.id, primary: true });
    for (const a of p.aliases || []) addCode(p.id, a);
    if (p.designation) addCode(p.id, { type: 'designation', code: p.designation });
  }
  const index = { lib, parts, partList, byCode, devices: new Map(), usage: new Map(), bomUsage: new Map() };
  for (const dev of lib.devices || []) {
    index.devices.set(dev.id, dev);
    (dev.instructions?.steps || []).forEach((step, i) => {
      for (const ref of step.parts || []) {
        const r = resolveCode(index, ref.code);
        if (r.status !== 'unique') continue;
        const list = index.usage.get(r.part.id) || [];
        list.push({ deviceId: dev.id, stepId: step.id, stepNo: i + 1, qty: ref.qty, code: ref.code, legacy: r.legacy });
        index.usage.set(r.part.id, list);
      }
    });
    for (const line of dev.bom?.lines || []) {
      const r = resolveCode(index, line.code);
      if (r.status !== 'unique') continue;
      const list = index.bomUsage.get(r.part.id) || [];
      list.push({ deviceId: dev.id, item: line.item, qty: line.qty, code: line.code, where: line.where });
      index.bomUsage.set(r.part.id, list);
    }
  }
  return index;
}

/**
 * Resolve any code to parts.
 * status: 'unique' (one part), 'ambiguous' (the same code points to several parts), 'unknown'.
 */
export function resolveCode(index, code) {
  const norm = normCode(code);
  const entries = norm ? index.byCode.get(norm) || [] : [];
  const seen = new Map();
  for (const e of entries) {
    const part = index.parts.get(e.partId);
    if (!part) continue;
    if (!seen.has(part.id) || e.alias.primary) seen.set(part.id, { part, alias: e.alias });
  }
  const matches = [...seen.values()];
  const status = matches.length === 1 ? 'unique' : matches.length > 1 ? 'ambiguous' : 'unknown';
  const legacy = matches.length === 1 && matches[0].alias.type === 'legacy';
  return { code, norm, status, matches, part: matches.length === 1 ? matches[0].part : null, alias: matches.length === 1 ? matches[0].alias : null, legacy };
}

function compatibleMaterial(a, b) {
  if (!a || !b) return true;
  if (a === b) return true;
  const base = (m) => (m.startsWith('steel') ? 'steel' : m);
  return base(a) === base(b) && (a === 'steel' || b === 'steel');
}

/** Compare decoded fields with a part's spec. */
export function matchSpec(part, ds) {
  const sp = part.spec || {};
  const res = { matched: 0, missed: 0, total: 0, hits: [], misses: [] };
  const check = (ok, hit, miss) => { res.total++; if (ok) { res.matched++; res.hits.push(hit); } else { res.missed++; res.misses.push(miss); } };
  if (ds.category) check(part.category === ds.category, CATEGORY_LABELS[ds.category]?.toLowerCase() || ds.category, `${CATEGORY_LABELS[part.category]?.toLowerCase() || part.category}`);
  if (ds.d != null) check(sp.d != null && Math.abs(sp.d - ds.d) < 0.01 && (sp.system || 'metric') === (ds.system || 'metric'), threadText(ds), `thread ${sp.thread || (sp.d ? 'M' + sp.d : 'none')}`);
  if (ds.pitch != null) check(sp.pitch != null && Math.abs(sp.pitch - ds.pitch) < 0.002, `pitch ${ds.pitch}`, `pitch ${sp.pitch ?? '?'}`);
  if (ds.length != null) check(sp.length != null && Math.abs(sp.length - ds.length) < 0.01, `${ds.length} mm`, `length ${sp.length ?? '?'} mm`);
  if (ds.head) check(sp.head === ds.head, HEADS[ds.head]?.label.toLowerCase(), HEADS[sp.head]?.label.toLowerCase() || 'no head');
  if (ds.drive) check(sp.drive === ds.drive, driveWord(ds.drive), sp.drive ? driveWord(sp.drive) : 'no drive');
  if (ds.variant) check((sp.variant || null) === ds.variant, ds.variant, sp.variant || 'other type');
  if (ds.gender) check(sp.gender === ds.gender, ds.gender, sp.gender || '?');
  if (ds.material) check(compatibleMaterial(sp.material, ds.material) && !!sp.material, MATERIALS[ds.material]?.label.toLowerCase() || ds.material, MATERIALS[sp.material]?.label.toLowerCase() || 'no material');
  res.ratio = res.total ? res.matched / res.total : 0;
  return res;
}

const threadText = (ds) => (ds.system === 'unified' ? `${ds.d} mm inch thread` : 'M' + ds.d);

function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(b.length + 1);
    cur[0] = i;
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

export { editDistance };

/**
 * Search by any code, by size ("M3x8", "ISO 7380 M3x8 A2") or by words.
 * Returns { query, decoded, exact, results: [{ part, score, reasons: [{kind, text, alias}] }] }.
 */
export function search(index, query, { limit = 40 } = {}) {
  const q = String(query ?? '').trim();
  const out = { query: q, decoded: null, exact: null, results: [] };
  if (!q) return out;
  const norm = normCode(q);
  const map = new Map();
  const bump = (part, score, reason) => {
    const r = map.get(part.id) || { part, score: 0, reasons: [] };
    r.score = Math.max(r.score, score);
    if (!r.reasons.some((x) => x.text === reason.text)) r.reasons.push({ ...reason, score });
    r.reasons.sort((a, b) => b.score - a.score);
    map.set(part.id, r);
  };

  const exact = resolveCode(index, q);
  out.exact = exact;
  for (const m of exact.matches) bump(m.part, 100, { kind: 'code', alias: m.alias, text: `${CODE_TYPES[m.alias.type] || m.alias.type} ${m.alias.code}${m.alias.source ? ` (${m.alias.source})` : ''}` });

  if (norm.length >= 3) {
    for (const [code, entries] of index.byCode) {
      if (code === norm || !code.includes(norm)) continue;
      for (const e of entries) {
        const part = index.parts.get(e.partId);
        if (part) bump(part, 70 - Math.min(20, code.length - norm.length), { kind: 'code-partial', alias: e.alias, text: `${CODE_TYPES[e.alias.type] || e.alias.type} ${e.alias.code}` });
      }
    }
  }

  const decoded = decodeDesignation(q);
  out.decoded = decoded;
  const ds = decodedSpec(decoded);
  const specKeys = Object.keys(ds).filter((k) => k !== 'system');
  const meaningful = specKeys.some((k) => k !== 'category') || (ds.category && specKeys.length === 1 && q.split(/\s+/).length === 1);
  if (decoded && meaningful) {
    for (const p of index.partList) {
      const m = matchSpec(p, ds);
      if (!m.total) continue;
      const hits = m.hits.length > 1 && ds.category ? m.hits.slice(1) : m.hits;
      if (m.missed === 0) bump(p, 60 + 30 * m.ratio, { kind: 'spec', text: 'Matches ' + hits.join(', ') });
      else if (m.total >= 3 && m.missed === 1 && m.matched >= 2) bump(p, 32 + 10 * m.ratio, { kind: 'near', text: `Close, but ${m.misses.join(', ')}` });
    }
  }

  const tokens = q.toLowerCase().split(/[\s,;/]+/).filter((t) => t.length >= 2);
  if (tokens.length) {
    for (const p of index.partList) {
      const title = [p.name, p.designation, p.category, CATEGORY_LABELS[p.category], ...(p.tags || []), p.spec?.thread].filter(Boolean).join(' ').toLowerCase();
      const body = [p.details?.function, p.details?.why].filter(Boolean).join(' ').toLowerCase();
      const inTitle = tokens.filter((t) => title.includes(t)).length;
      const inAny = tokens.filter((t) => title.includes(t) || body.includes(t)).length;
      if (!inAny) continue;
      if (inTitle === tokens.length) bump(p, 50 + Math.min(10, tokens.length * 3), { kind: 'text', text: 'Name matches' });
      else if (inAny === tokens.length) bump(p, 30 + Math.min(6, tokens.length * 2), { kind: 'text', text: 'Mentioned in the description' });
      else if (tokens.length >= 2 && inAny / tokens.length >= 0.5) bump(p, 18 + 10 * (inAny / tokens.length), { kind: 'text', text: 'Partly matches' });
    }
  }

  if (exact.status === 'unknown' && norm.length >= 5) {
    const max = norm.length >= 8 ? 2 : 1;
    const vq = visual(norm);
    for (const [code, entries] of index.byCode) {
      const close = visual(code) === vq || editDistance(norm, code, max) <= max;
      if (!close || code === norm) continue;
      for (const e of entries) {
        const part = index.parts.get(e.partId);
        if (part) bump(part, 30, { kind: 'fuzzy', alias: e.alias, text: `Did you mean ${e.alias.code}?` });
      }
    }
  }

  out.results = [...map.values()].sort((a, b) => b.score - a.score || a.part.name.localeCompare(b.part.name)).slice(0, limit);
  return out;
}

/** Every place a part is used: steps and BOM lines, per device. */
export function whereUsed(index, partId) {
  const steps = index.usage.get(partId) || [];
  const bom = index.bomUsage.get(partId) || [];
  const devices = new Set([...steps.map((s) => s.deviceId), ...bom.map((b) => b.deviceId)]);
  return [...devices].map((deviceId) => ({
    device: index.devices.get(deviceId),
    steps: steps.filter((s) => s.deviceId === deviceId),
    bom: bom.filter((b) => b.deviceId === deviceId),
  }));
}

/** Parts of a step with their resolution, quantity and torque. */
export function stepParts(index, step) {
  return (step.parts || []).map((ref) => {
    const r = resolveCode(index, ref.code);
    return { ref, resolution: r, part: r.part, qty: ref.qty, torque: ref.torque || r.part?.torque || null };
  });
}

/** Codes other than the internal one that people may see on a bin, a BOM or a drawing. */
export function otherCodes(part) {
  return (part.aliases || []).filter((a) => a.type !== 'legacy');
}

export const qtyNumber = (q) => (typeof q === 'number' && isFinite(q) ? q : typeof q === 'string' && /^\d+$/.test(q.trim()) ? parseInt(q, 10) : null);

export function torqueText(t) {
  if (!t || t.value == null) return '';
  return `${t.value} ${t.unit || 'N·m'}${t.tolerance ? ' ' + t.tolerance : ''}`;
}
