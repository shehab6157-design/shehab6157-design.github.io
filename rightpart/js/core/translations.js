// Translation spreadsheets: the company's own text (steps, part explanations) and the interface
// text go out as a CSV with one column per language, a translator or a bilingual colleague fills
// it in (Excel, Google Sheets, a translation agency's tool), and it comes back in.
// Pure module: no DOM.

import { parseCSV, toCSV } from './csv.js';
import { STEP_FIELDS, PART_FIELDS, sourceFingerprint } from './content.js';
import { baseOf } from './i18n.js';

const LIST_FIELDS = new Set(['instructions', 'checks', 'warnings']);
const warnText = (w) => (typeof w === 'string' ? w : w?.text || '');
const LANG_RE = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i;

/** One row per piece of text: type, id, field, n (1-based for lists), original, then one column per language. */
export function contentRows(lib) {
  const rows = [];
  for (const d of lib.devices || []) {
    for (const s of d.instructions?.steps || []) {
      const id = `${d.id}/${s.id}`;
      for (const f of STEP_FIELDS) {
        if (LIST_FIELDS.has(f)) (s[f] || []).forEach((x, i) => { const v = f === 'warnings' ? warnText(x) : x; if (v) rows.push({ type: 'step', id, field: f, n: i + 1, original: v, ref: s }); });
        else if (s[f]) rows.push({ type: 'step', id, field: f, n: '', original: s[f], ref: s });
      }
    }
  }
  for (const p of lib.parts || []) {
    const d = p.details || {};
    const src = { name: p.name, function: d.function, why: d.why, ifWrong: d.ifWrong, tips: d.tips };
    for (const f of PART_FIELDS) if (src[f]) rows.push({ type: 'part', id: p.id, field: f, n: '', original: src[f], ref: p });
  }
  return rows;
}

function existing(row, lang) {
  const tr = row.ref.translations?.[lang];
  if (!tr) return '';
  const v = tr[row.field];
  if (LIST_FIELDS.has(row.field)) return warnText(v?.[row.n - 1]) || '';
  return v || '';
}

/** The spreadsheet to send to a translator: existing translations filled in, new languages as empty columns. */
export function contentCSV(lib, langs) {
  const list = [...new Set(langs.filter((l) => LANG_RE.test(l)))];
  const out = [['type', 'id', 'field', 'n', 'original', ...list]];
  for (const r of contentRows(lib)) out.push([r.type, r.id, r.field, String(r.n), r.original, ...list.map((l) => existing(r, l))]);
  return toCSV(out);
}

/**
 * Read a filled-in spreadsheet back. Returns { lib, langs, counts: {lang: n}, changedOriginals, warnings }.
 * `reviewed`: the person importing confirms that someone who reads the language checked it.
 * A row whose original no longer matches the library is still imported, but the step is then marked
 * as changed since translation, so the guide tells the worker to follow the original.
 */
export function importContentCSV(lib, text, { reviewed = false } = {}) {
  const rows = parseCSV(text);
  if (!rows.length) return { lib, langs: [], counts: {}, changedOriginals: 0, warnings: ['The file is empty.'] };
  const head = rows[0].map((h) => String(h || '').trim());
  const col = (name) => head.findIndex((h) => h.toLowerCase() === name);
  const iType = col('type'), iId = col('id'), iField = col('field'), iN = col('n'), iOrig = col('original');
  if ([iType, iId, iField, iOrig].some((i) => i < 0)) return { lib, langs: [], counts: {}, changedOriginals: 0, warnings: ['Columns type, id, field and original are needed (export the step text first, then fill in the language columns).'] };
  const langCols = head.map((h, i) => ({ h, i })).filter(({ h, i }) => i > Math.max(iType, iId, iField, iN, iOrig) && LANG_RE.test(h)).map(({ h, i }) => ({ lang: h.toLowerCase(), i }));
  const next = structuredClone(lib);
  const steps = new Map();
  for (const d of next.devices || []) for (const s of d.instructions?.steps || []) steps.set(`${d.id}/${s.id}`, s);
  const parts = new Map((next.parts || []).map((p) => [p.id, p]));
  const counts = {};
  const touched = new Map(); // step -> { lang -> stale? }
  const warnings = [];
  let changedOriginals = 0;
  for (const r of rows.slice(1)) {
    const type = String(r[iType] || '').trim();
    const id = String(r[iId] || '').trim();
    const field = String(r[iField] || '').trim();
    const n = parseInt(r[iN], 10);
    const original = String(r[iOrig] ?? '');
    if (!type || !id || !field) continue;
    const target = type === 'step' ? steps.get(id) : type === 'part' ? parts.get(id) : null;
    if (!target) { warnings.push(`${type} ${id}: not in the library, skipped.`); continue; }
    const fields = type === 'step' ? STEP_FIELDS : PART_FIELDS;
    if (!fields.includes(field)) { warnings.push(`${type} ${id}: unknown field "${field}", skipped.`); continue; }
    const current = type === 'step'
      ? (LIST_FIELDS.has(field) ? (field === 'warnings' ? warnText(target[field]?.[n - 1]) : target[field]?.[n - 1]) : target[field])
      : (field === 'name' ? target.name : target.details?.[field]);
    const stale = String(current ?? '').trim() !== original.trim();
    if (stale) changedOriginals++;
    for (const { lang, i } of langCols) {
      const v = String(r[i] ?? '').trim();
      if (!v) continue;
      target.translations = target.translations || {};
      const tr = (target.translations[lang] = target.translations[lang] || {});
      if (LIST_FIELDS.has(field)) {
        if (!(n >= 1)) continue;
        tr[field] = Array.isArray(tr[field]) ? tr[field] : [];
        tr[field][n - 1] = v;
      } else tr[field] = v;
      counts[lang] = (counts[lang] || 0) + 1;
      if (type === 'step') {
        const m = touched.get(target) || {};
        m[lang] = m[lang] || stale;
        touched.set(target, m);
      } else if (reviewed) tr.reviewed = true;
    }
  }
  // Every touched step remembers which original its translation was made from.
  for (const [s, m] of touched) for (const [lang, stale] of Object.entries(m)) {
    const tr = s.translations[lang];
    for (const f of LIST_FIELDS) if (Array.isArray(tr[f])) tr[f] = Array.from(tr[f], (x) => x ?? '');
    tr.source = stale ? 'changed' : sourceFingerprint(s);
    tr.reviewed = !!reviewed;
  }
  return { lib: next, langs: langCols.map((l) => l.lang), counts, changedOriginals, warnings };
}

/** Interface text: one row per string the app shows, English first, then the company's languages. */
export function uiCSV(catalog, lib, langs, builtIn = {}) {
  const list = [...new Set(langs.filter((l) => LANG_RE.test(l)))];
  const out = [['key', 'english', ...list]];
  for (const key of catalog) {
    const english = key.replace(/^[a-z][\w-]*::/, '');
    out.push([key, english, ...list.map((l) => lib?.languages?.ui?.[l]?.[key] || builtIn[l]?.[key] || '')]);
  }
  return toCSV(out);
}

/**
 * Read interface text back into the library (lib.languages). A new language code adds that language
 * to the picker for everyone in this company. Returns { lib, langs, counts, problems }.
 * `problems`: translations that dropped a {placeholder}; they are not imported, so a screen never
 * loses a number or a code.
 */
export function importUiCSV(lib, text, nativeName = (code) => code) {
  const rows = parseCSV(text);
  const head = (rows[0] || []).map((h) => String(h || '').trim());
  const iKey = head.findIndex((h) => h.toLowerCase() === 'key');
  if (iKey < 0) return { lib, langs: [], counts: {}, problems: ['A "key" column is needed: export the interface text first.'] };
  const iEn = head.findIndex((h) => h.toLowerCase() === 'english');
  const langCols = head.map((h, i) => ({ h, i })).filter(({ h, i }) => i !== iKey && i !== iEn && LANG_RE.test(h) && baseOf(h) !== 'en').map(({ h, i }) => ({ lang: h.toLowerCase(), i }));
  const next = structuredClone(lib);
  next.languages = next.languages || { names: {}, ui: {} };
  next.languages.names = next.languages.names || {};
  next.languages.ui = next.languages.ui || {};
  const counts = {};
  const problems = [];
  const ph = (s) => (String(s).match(/\{\s*[\w.]+\s*(?=[,}])/g) || []).map((x) => x.replace(/[{\s]/g, '')).sort().join('|');
  for (const r of rows.slice(1)) {
    const key = String(r[iKey] || '').trim();
    if (!key) continue;
    for (const { lang, i } of langCols) {
      const v = String(r[i] ?? '').trim();
      if (!v) continue;
      if (ph(v) !== ph(key)) { problems.push(`${lang}: "${key.slice(0, 60)}" must keep ${ph(key).split('|').filter(Boolean).map((x) => `{${x}}`).join(' ') || 'no {placeholders}'}`); continue; }
      next.languages.ui[lang] = next.languages.ui[lang] || {};
      next.languages.ui[lang][key] = v;
      counts[lang] = (counts[lang] || 0) + 1;
    }
  }
  for (const lang of Object.keys(counts)) if (!next.languages.names[lang]) next.languages.names[lang] = nativeName(lang);
  return { lib: next, langs: Object.keys(counts), counts, problems };
}
