// Reading any company table: which kind it is (parts list, BOM, assembly steps, or a list of
// codes) and which column means what. Header names come from many ERP and PLM exports and in
// several languages; where a name is ambiguous ("Material" is the part number in SAP but a
// material grade elsewhere), the values decide. The result feeds the importers in importer.js.
// Pure functions: rows in, a description of the table out.

import { toCSV } from './csv.js';
import { PART_COLUMNS, BOM_COLUMNS, STEP_COLUMNS } from './importer.js';

export const norm = (s) => String(s ?? '').toLowerCase()
  .replace(/[׳״'"`’‘”“]/g, '')
  .replace(/[_\-./#()[\]:,;*]+/g, ' ')
  .replace(/\s+/g, ' ').trim();

// Field -> header names (already normalised). The first match wins inside a field.
export const SYNONYMS = {
  id: ['part number', 'part no', 'part nr', 'part num', 'partnumber', 'pn', 'p n', 'part', 'part id', 'part code', 'item number', 'item no', 'item code', 'item id', 'material', 'material number', 'material no', 'article', 'article number', 'article no', 'sku', 'internal code', 'internal part number', 'internal pn', 'our part number', 'component', 'component number', 'component no', 'code', 'catalog number', 'catalogue number', 'cat no', 'stock code', 'מקט', 'מק ט', 'מספר פריט', 'קוד פריט', 'פריט', 'רכיב', 'מספר חלק', 'رقم القطعة', 'رقم الصنف', 'كود', 'teilenummer', 'sachnummer', 'artikelnummer', 'numero de piece', 'référence', 'reference', 'numero de parte', 'codigo', 'codice', 'numer czesci'],
  name: ['description', 'desc', 'descr', 'name', 'part name', 'part description', 'item description', 'material description', 'component description', 'item name', 'תיאור', 'תאור', 'שם', 'שם פריט', 'תיאור פריט', 'الوصف', 'الاسم', 'bezeichnung', 'beschreibung', 'désignation', 'descripcion', 'descrizione', 'opis'],
  designation: ['designation', 'spec', 'specification', 'standard', 'size', 'dimension', 'dimensions', 'מפרט', 'מידה'],
  customer: ['customer part number', 'customer pn', 'cust pn', 'customer p n', 'cust p n', 'cpn', 'cust part number', 'cust part no', 'customer part no', 'customer item number', 'customer number', 'customer code', 'customer item', 'customer part', 'customer part no', 'client part number', 'client pn', 'מקט לקוח', 'קוד לקוח', 'رقم الزبون'],
  supplier: ['supplier part number', 'supplier pn', 'vendor part number', 'vendor pn', 'supplier part no', 'vendor part no', 'vend pn', 'vend p n', 'supp pn', 'supp p n', 'vendor item number', 'supplier code', 'vendor code', 'supplier item', 'vendor item', 'vendor p n', 'supplier p n', 'מקט ספק', 'קוד ספק'],
  manufacturer: ['manufacturer part number', 'mfr pn', 'mfr part number', 'mfr p n', 'mpn', 'mfg p n', 'manuf part number', 'manufacturer part no', 'mfr part no', 'mfg pn', 'mfg part number', 'manufacturer pn', 'manufacturer code', 'מקט יצרן'],
  drawing: ['drawing', 'drawing number', 'drawing no', 'dwg', 'dwg no', 'dwg number', 'שרטוט', 'מספר שרטוט'],
  legacy: ['old part number', 'old pn', 'old p n', 'old code', 'legacy', 'legacy code', 'legacy pn', 'previous part number', 'former part number', 'מקט ישן'],
  category: ['category', 'part type', 'item type', 'commodity', 'class', 'type', 'group', 'קטגוריה', 'סוג'],
  material: ['material grade', 'material', 'finish', 'plating', 'grade', 'חומר', 'גימור'],
  thread: ['thread', 'thread size', 'הברגה'],
  length_mm: ['length mm', 'length', 'len', 'אורך'],
  d_mm: ['diameter mm', 'diameter', 'dia', 'd mm'],
  head: ['head', 'head type', 'ראש'],
  drive: ['drive', 'drive type', 'recess'],
  torque_nm: ['torque nm', 'torque n m', 'torque', 'tightening torque', 'מומנט'],
  tool: ['tool', 'tools', 'כלי', 'כלים'],
  status: ['status', 'lifecycle', 'lifecycle status', 'state', 'סטטוס', 'מצב'],
  replaced_by: ['replaced by', 'superseded by', 'replacement', 'successor', 'מוחלף ב'],
  qty: ['qty', 'quantity', 'qty per', 'quantity per', 'comp qty', 'component quantity', 'qty per assembly', 'quantity per assembly', 'pcs', 'pieces', 'count', 'כמות', 'الكمية', 'menge', 'anzahl', 'quantité', 'cantidad', 'quantita'],
  item: ['item', 'item no', 'line', 'line no', 'pos', 'position', 'find number', 'find no', 'find', 'bom item', 'no', 'nr', 'מס', 'שורה'],
  where: ['ref des', 'reference designator', 'reference designators', 'refdes', 'ref', 'location', 'where', 'where used', 'position text', 'placement', 'remark', 'remarks', 'notes', 'note', 'comment', 'comments', 'מיקום', 'הערות', 'הערה'],
  device: ['device', 'product', 'assembly', 'parent', 'parent part', 'parent item', 'top level', 'model', 'assembly number', 'product number', 'device id', 'מוצר', 'הרכבה', 'מכלול', 'דגם'],
  device_name: ['device name', 'product name', 'assembly name', 'model name', 'שם מוצר'],
  rev: ['rev', 'revision', 'bom rev', 'version', 'ver', 'גרסה', 'מהדורה'],
  step: ['step', 'step no', 'step number', 'op', 'op no', 'operation no', 'operation number', 'seq', 'sequence', 'שלב', 'מספר שלב'],
  title: ['step title', 'title', 'operation', 'operation name', 'operation description', 'heading', 'כותרת', 'פעולה'],
  instructions: ['instructions', 'instruction', 'work instruction', 'work instructions', 'procedure', 'how', 'details', 'text', 'הוראות', 'הוראה', 'تعليمات'],
  parts: ['parts', 'components', 'parts used', 'components used', 'materials', 'חלקים', 'רכיבים'],
  checks: ['checks', 'check', 'inspection', 'verify', 'verification', 'בדיקות', 'בדיקה'],
  warnings: ['warnings', 'warning', 'caution', 'cautions', 'safety', 'אזהרות', 'אזהרה'],
  why: ['why', 'reason', 'למה'],
};

const ALIAS_FIELDS = ['customer', 'supplier', 'manufacturer', 'drawing', 'legacy'];
export const FIELD_KINDS = {
  parts: ['id', 'name', 'designation', 'category', 'material', 'thread', 'length_mm', 'd_mm', 'head', 'drive', 'torque_nm', 'tool', 'status', 'replaced_by', ...ALIAS_FIELDS],
  bom: ['device', 'device_name', 'rev', 'item', 'id', 'name', 'qty', 'where', ...ALIAS_FIELDS],
  steps: ['device', 'device_name', 'rev', 'step', 'title', 'instructions', 'parts', 'tool', 'checks', 'warnings', 'why'],
};

const CODE_RE = /^(?=.*\d)[A-Z0-9][A-Z0-9 ./_-]{1,29}$/i;
const isCode = (v) => CODE_RE.test(v) && !/\s{2,}/.test(v) && v.split(' ').length <= 3;
const isQty = (v) => /^(\d+(?:[.,]\d+)?|a\/r|as req(?:uired)?|ar)$/i.test(v);
const isSmallInt = (v) => /^\d{1,4}$/.test(v);
const isGrade = (v) => /^(a[1-4]|a[1-4]-\d+|ss|stainless|steel|zinc|zn|brass|nylon|pa66?|aluminium|aluminum|al|nickel|black oxide|plastic|\d{1,2}\.\d)$/i.test(v);

/** Share of non-empty values in a column that pass a test. */
function share(values, test) {
  const v = values.filter((x) => x !== '');
  return v.length ? v.filter(test).length / v.length : 0;
}

function headerScore(cell) {
  const h = norm(cell);
  if (!h || h.length > 40) return 0;
  for (const syns of Object.values(SYNONYMS)) if (syns.includes(h)) return 2;
  for (const syns of Object.values(SYNONYMS)) if (syns.some((s) => s.length > 3 && (h.startsWith(`${s} `) || h.endsWith(` ${s}`)))) return 1;
  return 0;
}

/** The row that holds the column names: the best-scoring of the first rows. */
export function findHeaderRow(rows) {
  let best = -1, bestScore = 0;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const cells = (rows[i] || []).filter((c) => c !== '');
    if (cells.length < 2) continue;
    const score = cells.reduce((s, c) => s + headerScore(c), 0);
    if (score > bestScore) { best = i; bestScore = score; }
  }
  if (best >= 0 && bestScore >= 3) return best;
  // No known names: the first row with at least two text cells and no numbers.
  return rows.findIndex((r) => (r || []).filter((c) => c !== '').length >= 2 && (r || []).every((c) => c === '' || !/^\d+([.,]\d+)?$/.test(c)));
}

/** How well a column fits a field: from its header (strongest) and its values. */
function fit(field, header, values) {
  const h = norm(header);
  const syns = SYNONYMS[field] || [];
  let s = 0;
  const at = syns.indexOf(h);
  if (at >= 0) s = 10 - Math.min(at, 30) * 0.05; // an exact name; earlier names in the list are more typical
  else if (syns.some((x) => x.length > 3 && (h.startsWith(`${x} `) || h.endsWith(` ${x}`) || h.includes(` ${x} `)))) s = 5;
  else if (syns.some((x) => x.length > 4 && h.includes(x))) s = 3;
  if (!s) return 0;
  // Values settle the ambiguous names.
  if (field === 'id') s += share(values, isCode) > 0.7 ? 3 : -6;
  if (field === 'material') s += share(values, isGrade) > 0.5 ? 3 : share(values, isCode) > 0.7 ? -8 : 0;
  if (field === 'name') s += share(values, (v) => /[a-z֐-ۿ].*\s/i.test(v)) > 0.5 ? 2 : -2;
  if (field === 'qty') s += share(values, isQty) > 0.8 ? 3 : -8;
  if (field === 'item' || field === 'step') s += share(values, (v) => isSmallInt(v) || /^[A-Z]?\d{1,4}$/i.test(v)) > 0.8 ? 2 : -6;
  if (ALIAS_FIELDS.includes(field)) s += share(values, isCode) > 0.6 ? 2 : -3;
  if (field === 'torque_nm' || field === 'length_mm' || field === 'd_mm') s += share(values, (v) => /^\d+([.,]\d+)?$/.test(v)) > 0.8 ? 2 : -6;
  return s;
}

/**
 * Describe a table. `rows` = string[][] (as read from Excel or CSV); `name` = file or sheet name.
 * Returns { name, kind, confidence, headerRow, columns: [{ index, header, field }], data, device, rev }.
 */
export function describeTable(rows, name = '') {
  const clean = rows.map((r) => (r || []).map((c) => String(c ?? '').trim()));
  const hr = findHeaderRow(clean);
  const base = { name, kind: 'unknown', confidence: 0, headerRow: hr, columns: [], data: [], device: null, rev: null };
  if (hr < 0) return base;
  const header = clean[hr];
  const data = clean.slice(hr + 1).filter((r) => r.some((c) => c !== ''));
  const width = Math.max(header.length, ...data.slice(0, 200).map((r) => r.length));
  const values = (i) => data.slice(0, 300).map((r) => r[i] ?? '');
  // Score every column against every field, then hand out the best pairs first.
  const pairs = [];
  for (let i = 0; i < width; i++) for (const f of Object.keys(SYNONYMS)) { const s = fit(f, header[i] ?? '', values(i)); if (s > 0) pairs.push({ i, f, s }); }
  pairs.sort((a, b) => b.s - a.s || a.i - b.i);
  const byCol = new Map(), used = new Set();
  for (const p of pairs) {
    if (byCol.has(p.i)) continue;
    if (used.has(p.f) && !ALIAS_FIELDS.includes(p.f)) continue;
    byCol.set(p.i, p.f);
    used.add(p.f);
  }
  const columns = Array.from({ length: width }, (_, i) => ({ index: i, header: header[i] ?? '', field: byCol.get(i) || null }));
  const has = (f) => used.has(f);
  const aliases = ALIAS_FIELDS.filter(has).length;
  let kind = 'unknown', confidence = 0;
  if ((has('step') || has('title')) && (has('instructions') || has('parts'))) { kind = 'steps'; confidence = has('step') && has('instructions') ? 0.9 : 0.7; }
  else if (has('qty') && has('id')) { kind = 'bom'; confidence = has('item') || has('device') || has('where') ? 0.9 : 0.75; }
  else if (has('id') && (has('name') || has('designation'))) { kind = 'parts'; confidence = 0.9; }
  else if (has('id') && aliases) { kind = 'codes'; confidence = 0.8; }
  // A device and revision written above the column names: "Assembly: ORION-2", "Rev: B".
  let device = null, rev = null;
  for (const r of clean.slice(0, hr)) {
    for (const c of r) {
      const d = c.match(/^(?:assembly|product|device|model|bom for|top level|מוצר|הרכבה|מכלול|דגם)\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{1,39})(?:\s+(.{1,80}))?$/i);
      if (d && !device) device = { id: d[1].toUpperCase(), name: (d[2] || '').trim() || d[1].toUpperCase() };
      const v = c.match(/^(?:rev|revision|version|גרסה|מהדורה)\.?\s*[:#-]?\s*([A-Z0-9][A-Z0-9.-]{0,9})$/i);
      if (v && !rev) rev = v[1];
    }
  }
  return { name, kind, confidence, headerRow: hr, columns, data, device, rev, width };
}

/** A device id from a file or sheet name: "BOM ORION-2.xlsx" -> "ORION-2". */
export function deviceFromName(name) {
  const base = String(name || '').replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/\b(bom|bill of materials|steps|work steps|instructions|work instructions|wi|parts|parts list|material master|export|list|sheet\d*|for|of|the|and|to|in)\b/gi, ' ').trim();
  const words = base.split(/[\s_]+/).filter(Boolean);
  const coded = words.find((w) => /\d/.test(w) && /\p{L}/u.test(w) && w.length >= 2);
  const id = coded || words.slice(0, 3).join('-');
  return id.toUpperCase().replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'DEVICE-1';
}

/**
 * Turn a described table into CSV text for the importer of its kind (partsFromCSV, bomFromCSV,
 * stepsFromCSV). `device` = { id, name, rev } for BOM and step tables that do not name one per row.
 * Several columns of the same code type (two supplier columns) are joined.
 */
export function tableToCSV(desc, kind = desc.kind, device = desc.device) {
  const cols = (f) => desc.columns.filter((c) => c.field === f).map((c) => c.index);
  const get = (row, f) => cols(f).map((i) => row[i] ?? '').filter(Boolean).join(' | ');
  const aliasCell = (row, f) => cols(f).flatMap((i) => String(row[i] ?? '').split(/[,;\n]+/)).map((s) => s.trim()).filter(Boolean).join('|');
  const dev = (row) => get(row, 'device') || device?.id || '';
  if (kind === 'parts' || kind === 'codes') {
    const out = [PART_COLUMNS];
    for (const r of desc.data) {
      const rec = { id: get(r, 'id'), name: get(r, 'name'), designation: get(r, 'designation'), category: get(r, 'category').toLowerCase(), material: get(r, 'material'), thread: get(r, 'thread'), length_mm: get(r, 'length_mm'), d_mm: get(r, 'd_mm'), head: get(r, 'head').toLowerCase(), drive: get(r, 'drive').toLowerCase(), torque_nm: get(r, 'torque_nm'), tool: get(r, 'tool'), status: get(r, 'status').toLowerCase().replace(/^(released|production|current)$/, 'active').replace(/^(inactive|discontinued|retired|eol)$/, 'obsolete'), replaced_by: get(r, 'replaced_by'), customer_codes: aliasCell(r, 'customer'), supplier_codes: aliasCell(r, 'supplier'), manufacturer_codes: aliasCell(r, 'manufacturer'), drawing_codes: aliasCell(r, 'drawing'), legacy_codes: aliasCell(r, 'legacy') };
      if (!rec.id) continue;
      out.push(PART_COLUMNS.map((c) => rec[c] ?? ''));
    }
    return toCSV(out);
  }
  if (kind === 'bom') {
    const out = [BOM_COLUMNS];
    desc.data.forEach((r, i) => {
      const code = get(r, 'id');
      if (!code) return;
      out.push([dev(r), get(r, 'device_name') || (get(r, 'device') ? '' : device?.name || ''), get(r, 'rev') || device?.rev || desc.rev || '', get(r, 'item') || String((i + 1) * 10), code, get(r, 'qty') || 'A/R', get(r, 'where')]);
    });
    return toCSV(out);
  }
  if (kind === 'steps') {
    const out = [STEP_COLUMNS];
    desc.data.forEach((r) => {
      const row = { device_id: dev(r), device_name: get(r, 'device_name') || (get(r, 'device') ? '' : device?.name || ''), instructions_rev: get(r, 'rev') || device?.rev || desc.rev || '', step: get(r, 'step'), title: get(r, 'title'), summary: '', parts: get(r, 'parts').replace(/\s*\|\s*/g, '; '), tools: get(r, 'tool'), instructions: get(r, 'instructions'), checks: get(r, 'checks'), warnings: get(r, 'warnings'), why: get(r, 'why'), critical: '', esd: '', image: '' };
      if (!row.title && row.instructions) row.title = row.instructions.split(/[|.\n]/)[0].slice(0, 80);
      out.push(STEP_COLUMNS.map((c) => row[c] ?? ''));
    });
    return toCSV(out);
  }
  return '';
}

/** Parts that a BOM describes (code + description + codes), for codes the parts list does not have. */
export function partsFromBOMTable(desc) {
  if (!desc.columns.some((c) => c.field === 'name')) return '';
  const copy = { ...desc, columns: desc.columns.map((c) => (c.field === 'qty' || c.field === 'item' || c.field === 'where' || c.field === 'device' || c.field === 'rev' ? { ...c, field: null } : c)) };
  return tableToCSV(copy, 'parts');
}
