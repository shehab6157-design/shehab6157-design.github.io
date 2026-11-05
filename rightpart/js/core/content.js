// The company's own text (step titles, instructions, checks, warnings, part explanations) in the
// reader's language. A translation lives next to the original:
//   step.translations = { he: { title, summary, instructions: [], checks: [], warnings: [], why, reviewed, source } }
//   part.translations = { he: { name, function, why, ifWrong, tips } }
// Nothing safety-relevant is ever taken from a translation: part codes, quantities and torques are
// shown from the step's data, and the integrity check flags a translation whose numbers differ from
// the original. Where there is no translation the original is shown, and the page says so.
// Pure module: no DOM.

import { getLanguage, baseOf, numbersIn } from './i18n.js';

export const STEP_FIELDS = ['title', 'summary', 'instructions', 'checks', 'warnings', 'why'];
export const PART_FIELDS = ['name', 'function', 'why', 'ifWrong', 'tips'];

/** The language the company writes its documents in (default English). */
export const contentLanguage = (lib) => lib?.meta?.contentLang || 'en';

function pick(trs, lang) {
  if (!trs) return null;
  return trs[lang] || trs[baseOf(lang)] || null;
}

const warnText = (w) => (typeof w === 'string' ? w : w?.text || '');

/** A short fingerprint of the original text, stored with a translation to notice when the step changes later. */
export function sourceFingerprint(step) {
  const s = JSON.stringify([step.title || '', step.summary || '', step.instructions || [], step.checks || [], (step.warnings || []).map(warnText), step.why || '']);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

/**
 * Step text for the reader. Returns the fields plus:
 *   state: 'original' (reader reads the company's own language), 'translated', or 'missing' (shown in the original)
 *   reviewed: a person checked the translation; outdated: the step changed after it was translated
 */
export function stepText(step, lib, lang = getLanguage()) {
  const orig = {
    title: step.title || '', summary: step.summary || '', instructions: step.instructions || [], checks: step.checks || [],
    warnings: step.warnings || [], why: step.why || '',
  };
  const source = contentLanguage(lib);
  if (baseOf(lang) === baseOf(source)) return { ...orig, state: 'original', lang: source, source };
  const tr = pick(step.translations, lang);
  if (!tr) return { ...orig, state: 'missing', lang: source, source };
  // A translation whose numbers differ from the original is never shown: the reader gets the original.
  if (numberMismatches(step, tr).length) return { ...orig, state: 'held', lang: source, source };
  const list = (a, b) => (Array.isArray(a) && a.length ? b.map((x, i) => (a[i] && String(a[i]).trim() ? a[i] : x)) : b);
  return {
    title: tr.title || orig.title,
    summary: tr.summary || orig.summary,
    instructions: list(tr.instructions, orig.instructions),
    checks: list(tr.checks, orig.checks),
    // The level of a warning (warning, caution, notice) always comes from the original.
    warnings: orig.warnings.map((w, i) => ({ ...w, text: warnText(tr.warnings?.[i]) || w.text })),
    why: tr.why || orig.why,
    state: 'translated', lang, source,
    reviewed: !!tr.reviewed,
    outdated: !!tr.source && tr.source !== sourceFingerprint(step),
  };
}

/** Part text for the reader (name and explanations), with the same states as stepText. */
export function partText(part, lib, lang = getLanguage()) {
  const d = part.details || {};
  const orig = { name: part.name || '', function: d.function || '', why: d.why || '', ifWrong: d.ifWrong || '', tips: d.tips || '' };
  const source = contentLanguage(lib);
  if (baseOf(lang) === baseOf(source)) return { ...orig, state: 'original' };
  const tr = pick(part.translations, lang);
  if (!tr) return { ...orig, state: 'missing' };
  const out = { state: 'translated' };
  for (const k of PART_FIELDS) out[k] = (tr[k] && String(tr[k]).trim()) || orig[k];
  return out;
}

/**
 * Compare a translation with its original, field by field: every number (torque, count, size,
 * step number) must appear in both. Returns [{ field, index, original, translated, missing[], extra[] }].
 */
export function numberMismatches(step, tr) {
  const out = [];
  const cmp = (field, index, a, b) => {
    if (!b || !String(b).trim()) return;
    const na = numbersIn(a), nb = numbersIn(b);
    if (na.join('|') === nb.join('|')) return;
    const left = [...nb];
    const missing = [];
    for (const n of na) { const k = left.indexOf(n); if (k >= 0) left.splice(k, 1); else missing.push(n); }
    out.push({ field, index, original: a, translated: b, missing, extra: left });
  };
  cmp('title', null, step.title, tr.title);
  cmp('summary', null, step.summary, tr.summary);
  cmp('why', null, step.why, tr.why);
  for (const f of ['instructions', 'checks']) (step[f] || []).forEach((x, i) => cmp(f, i, x, tr[f]?.[i]));
  (step.warnings || []).forEach((w, i) => cmp('warnings', i, warnText(w), warnText(tr.warnings?.[i])));
  return out;
}

/** Languages a library has step translations for. */
export function translatedLanguages(lib) {
  const set = new Set();
  for (const d of lib?.devices || []) for (const s of d.instructions?.steps || []) for (const k of Object.keys(s.translations || {})) set.add(k);
  return [...set].sort();
}
