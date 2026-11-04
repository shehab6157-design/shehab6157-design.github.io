// Turning spreadsheets (CSV exported from Excel or an ERP) into library records.
// Pure functions. If a row has a description like "ISO 7380 M3x8 A2" but no size columns,
// the size, head, drive and material are read from the description.

import { parseCSVObjects, toCSV } from './csv.js';
import { decodeDesignation, decodedSpec } from './decode.js';
import { coarsePitch } from './dims.js';

const CODE_COLS = { customer_codes: 'customer', supplier_codes: 'supplier', manufacturer_codes: 'manufacturer', drawing_codes: 'drawing', legacy_codes: 'legacy', other_codes: 'supplier' };
export const PART_COLUMNS = ['id', 'category', 'name', 'designation', 'thread', 'd_mm', 'pitch_mm', 'length_mm', 'head', 'drive', 'drive_size', 'material', 'torque_nm', 'tool', 'status', 'replaced_by', 'function', 'why', 'if_wrong', 'tips', ...Object.keys(CODE_COLS)];
export const BOM_COLUMNS = ['device_id', 'device_name', 'bom_rev', 'item', 'code', 'qty', 'where'];

const key = (k) => k.trim().toLowerCase().replace(/[\s.-]+/g, '_').replace(/[()]/g, '');
const num = (v) => { if (v == null || v === '') return null; const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : null; };

function normRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) out[key(k)] = typeof v === 'string' ? v.trim() : v;
  // Common synonyms from ERP exports
  if (!out.id) out.id = out.part_number || out.pn || out.item_code || out.code || out.internal_code || '';
  if (!out.name) out.name = out.description || out.desc || '';
  return out;
}

function splitCodes(cell, type) {
  if (!cell) return [];
  return String(cell).split(/[|\n]/).map((s) => s.trim()).filter(Boolean).map((s) => {
    const [code, source] = s.split('@').map((x) => x.trim());
    return source ? { type, code, source } : { type, code };
  });
}

export function partsFromCSV(text) {
  const rows = parseCSVObjects(text).map(normRow);
  const parts = [];
  const warnings = [];
  rows.forEach((r, i) => {
    const line = i + 2;
    if (!r.id) { warnings.push(`Row ${line}: no id / part number, skipped.`); return; }
    const dec = decodeDesignation(r.designation || '') || decodeDesignation(r.name || '');
    const ds = decodedSpec(dec);
    const category = (r.category || ds.category || (dec ? 'screw' : 'mechanical')).toLowerCase();
    const spec = {};
    const d = num(r.d_mm) ?? ds.d ?? null;
    if (['screw', 'nut', 'washer', 'standoff'].includes(category)) {
      if (r.thread || dec?.thread) spec.thread = r.thread || dec.thread.label;
      if (d != null) spec.d = d;
      const pitch = num(r.pitch_mm) ?? dec?.thread?.pitch ?? (d ? coarsePitch(d) : null);
      if (pitch) spec.pitch = pitch;
      spec.system = dec?.thread?.system || 'metric';
      const len = num(r.length_mm) ?? ds.length ?? null;
      if (len != null) spec.length = len;
      if (r.head || ds.head) spec.head = (r.head || ds.head).toLowerCase();
      if (r.drive || ds.drive) spec.drive = (r.drive || ds.drive).toLowerCase();
      if (r.drive_size) spec.driveSize = r.drive_size;
      if (ds.variant) spec.variant = ds.variant;
      if (ds.gender) spec.gender = ds.gender;
      if (category === 'screw' && (spec.d == null || spec.length == null)) warnings.push(`Row ${line} (${r.id}): screw without ${spec.d == null ? 'thread' : 'length'}; add it so look-alikes can be checked.`);
    }
    const material = r.material || ds.material;
    if (material) spec.material = material;
    const aliases = Object.entries(CODE_COLS).flatMap(([col, type]) => splitCodes(r[col], type));
    const p = { id: r.id, category, name: r.name || r.designation || r.id, spec, aliases, status: (r.status || 'active').toLowerCase() };
    if (r.designation) p.designation = r.designation;
    const tq = num(r.torque_nm);
    if (tq != null) p.torque = { value: tq, unit: 'N·m' };
    if (r.tool) p.tool = r.tool;
    if (r.replaced_by) p.replacedBy = r.replaced_by;
    const det = { function: r.function, why: r.why, ifWrong: r.if_wrong, tips: r.tips };
    if (Object.values(det).some(Boolean)) p.details = Object.fromEntries(Object.entries(det).filter(([, v]) => v));
    parts.push(p);
  });
  return { parts, warnings };
}

/** Insert or update parts by id. Aliases are merged, never silently dropped. */
export function mergeParts(lib, incoming) {
  const out = structuredClone(lib);
  const byId = new Map(out.parts.map((p) => [p.id, p]));
  let added = 0, updated = 0;
  for (const p of incoming) {
    const cur = byId.get(p.id);
    if (!cur) { out.parts.push(p); byId.set(p.id, p); added++; continue; }
    const aliases = [...(cur.aliases || [])];
    for (const a of p.aliases || []) if (!aliases.some((x) => x.code === a.code && x.type === a.type)) aliases.push(a);
    Object.assign(cur, { ...p, spec: { ...cur.spec, ...p.spec }, aliases, details: { ...(cur.details || {}), ...(p.details || {}) } });
    updated++;
  }
  return { lib: out, added, updated };
}

export function bomFromCSV(text) {
  const rows = parseCSVObjects(text).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [key(k), v])));
  const devices = new Map();
  const warnings = [];
  rows.forEach((r, i) => {
    const id = r.device_id || r.device || r.product;
    const code = r.code || r.part_number || r.pn || r.component;
    if (!id || !code) { warnings.push(`Row ${i + 2}: needs device_id and code.`); return; }
    const d = devices.get(id) || { id, name: r.device_name || id, rev: r.bom_rev || r.rev || '', lines: [] };
    const q = String(r.qty ?? r.quantity ?? '').trim();
    d.lines.push({ item: num(r.item) ?? d.lines.length + 1, code, qty: /^\d+$/.test(q) ? parseInt(q, 10) : q || 'A/R', where: r.where || r.position || r.ref || '' });
    devices.set(id, d);
  });
  return { boms: [...devices.values()], warnings };
}

export function mergeBOM(lib, boms) {
  const out = structuredClone(lib);
  out.devices = out.devices || [];
  for (const b of boms) {
    let dev = out.devices.find((d) => d.id === b.id);
    if (!dev) { dev = { id: b.id, name: b.name, description: '', bom: { rev: b.rev, lines: [] }, instructions: { rev: '', steps: [] } }; out.devices.push(dev); }
    dev.bom = { ...(dev.bom || {}), rev: b.rev || dev.bom?.rev || '', lines: b.lines };
  }
  return out;
}

export function validateLibrary(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('Not a JSON object');
  if (!Array.isArray(obj.parts)) throw new Error('The file has no "parts" list');
  const ids = new Set();
  for (const [i, p] of obj.parts.entries()) {
    if (!p.id) throw new Error(`Part #${i + 1} has no id`);
    if (ids.has(p.id)) throw new Error(`Part id ${p.id} appears twice`);
    ids.add(p.id);
    p.aliases = p.aliases || [];
    p.spec = p.spec || {};
    p.category = p.category || 'mechanical';
    p.name = p.name || p.id;
  }
  obj.devices = obj.devices || [];
  obj.schema = obj.schema || 'rightpart/1';
  obj.meta = { ...(obj.meta || {}), demo: false };
  return obj;
}

export function partsTemplateCSV() {
  return toCSV([PART_COLUMNS,
    ['100-0233', 'screw', 'Button head screw M3 x 8, stainless', 'ISO 7380-1 M3x8 A2', '', '', '', '', '', '', '', '', '0.6', '2 mm hex key', 'active', '', 'Fixes the front bezel', 'Low head, clean look', 'A 10 mm screw bottoms out', '', 'C-55013@Customer BOM', 'AF-7380-M3-8-A2@Alpha Fasteners|DS-103-308@Delta Supply', '', '', ''],
    ['200-1002', 'mechanical', 'Front bezel', '', '', '', '', '', '', '', '', 'Aluminium', '', '', 'active', '', 'Front face of the device', '', '', '', 'C-60002', '', '', 'DWG-NV1-110', ''],
  ]);
}

export function bomTemplateCSV() {
  return toCSV([BOM_COLUMNS, ['NOVA-1', 'Nova-1 demo console', 'C', '17', 'C-55013', '6', 'Front bezel'], ['NOVA-1', 'Nova-1 demo console', 'C', '22', '500-4001', 'A/R', 'Bezel screws']]);
}
