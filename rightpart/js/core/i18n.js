// Translations. The English text in the code is the key: t('Parts for this step') returns the
// translation for the current language, or the English text when there is none yet, so nothing
// can ever show up blank. Pure module (no DOM): the integrity check and Ask use it in Node too.
//
// Placeholders: t('Step {n} of {total}', { n: 3, total: 10 }).
// Plurals (ICU style, every language picks its own forms):
//   t('{n, plural, one {# step} other {# steps}}', { n })
//   Russian: '{n, plural, one {# шаг} few {# шага} many {# шагов} other {# шага}}'
// Same English word, two meanings: t('nav::Check') is its own entry and shows "Check" in English.
//
// Numbers, part codes, torques and sizes are never translated or reformatted: the screen shows
// them exactly as the released documents and the bin labels do, in every language.

let lang = 'en';
let messages = Object.create(null); // built-in translations for `lang`
let overrides = Object.create(null); // the company's own wording for `lang` (wins over built-in)
let plural = new Intl.PluralRules('en');

/** Scripts written right to left. */
const RTL = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'yi', 'dv', 'ckb', 'sd', 'ug', 'syr', 'iw', 'prs']);
export const baseOf = (code) => String(code || 'en').split(/[-_]/)[0].toLowerCase();
export const dirOf = (code) => (RTL.has(baseOf(code)) ? 'rtl' : 'ltr');

/** Marks text for translation where it is defined (tables, labels); t() translates it when shown. */
export const N_ = (s) => s;

export function setLanguage(code, builtIn = {}, company = {}) {
  lang = code || 'en';
  messages = Object.assign(Object.create(null), builtIn || {});
  overrides = Object.assign(Object.create(null), company || {});
  try { plural = new Intl.PluralRules(lang); } catch { plural = new Intl.PluralRules('en'); }
}
export const getLanguage = () => lang;
export const isRTL = () => dirOf(lang) === 'rtl';

const CTX = /^[a-z][\w-]*::/;
/** English text of a key: "nav::Check" -> "Check". */
export const english = (src) => String(src).replace(CTX, '');

/** The translated template, before placeholders are filled. */
export function tr(src) {
  const o = overrides[src];
  if (typeof o === 'string' && o.trim()) return o;
  const m = messages[src];
  if (typeof m === 'string' && m.trim()) return m;
  return english(src);
}

/** True when the current language has its own text for this string. */
export const hasTranslation = (src) => lang === 'en' || !!(overrides[src] || messages[src]);

/**
 * Fill a template. `text` transforms literal text and `value` transforms inserted values,
 * so the HTML version can escape the template while keeping trusted markup in values.
 */
export function format(template, vars, { text = (s) => s, value = (v) => (v == null ? '' : String(v)) } = {}) {
  const src = String(template ?? '');
  if (!vars || src.indexOf('{') < 0) return text(src);
  let i = 0;
  const parse = (stopAtBrace, hashValue) => {
    let out = '';
    let lit = '';
    const flush = () => { if (lit) { out += text(lit); lit = ''; } };
    while (i < src.length) {
      const c = src[i];
      if (c === '}' && stopAtBrace) break;
      if (c === '#' && hashValue != null) { flush(); out += value(hashValue); i++; continue; }
      if (c !== '{') { lit += c; i++; continue; }
      // A placeholder: {name} or {name, plural|select, ...}
      const close = matching(src, i);
      if (close < 0) { lit += c; i++; continue; }
      const body = src.slice(i + 1, close);
      const comma = body.indexOf(',');
      const name = (comma < 0 ? body : body.slice(0, comma)).trim();
      if (!/^[\w.]+$/.test(name) || !(name in vars)) { lit += src.slice(i, close + 1); i = close + 1; continue; }
      flush();
      if (comma < 0) { out += value(vars[name]); i = close + 1; continue; }
      const rest = body.slice(comma + 1);
      const kindM = rest.match(/^\s*(plural|select)\s*,/);
      if (!kindM) { out += value(vars[name]); i = close + 1; continue; }
      // Parse the branches of plural/select in place.
      i = i + 1 + comma + 1 + kindM[0].length;
      const branches = {};
      while (i < close) {
        while (i < close && /\s/.test(src[i])) i++;
        const km = src.slice(i).match(/^(=?[\w-]+)\s*\{/);
        if (!km) break;
        i += km[0].length;
        const v = vars[name];
        const inner = parseBranch(kindM[1] === 'plural' ? v : null);
        branches[km[1]] = inner;
        i++; // the branch's closing brace
      }
      i = close + 1;
      const v = vars[name];
      let pick;
      if (kindM[1] === 'plural') {
        const n = Number(v);
        pick = branches[`=${n}`] ?? branches[safeSelect(n)] ?? branches.other ?? '';
      } else pick = branches[String(v)] ?? branches.other ?? '';
      out += pick;
    }
    flush();
    return out;
  };
  // Branch text is parsed with the outer index so nested placeholders work.
  const parseBranch = (hashValue) => parse(true, hashValue);
  return parse(false, null);
}

function safeSelect(n) {
  try { return plural.select(n); } catch { return 'other'; }
}

function matching(s, open) {
  let depth = 0;
  for (let j = open; j < s.length; j++) {
    if (s[j] === '{') depth++;
    else if (s[j] === '}') { depth--; if (depth === 0) return j; }
  }
  return -1;
}

// Inside right-to-left text every inserted value is isolated (Unicode FSI ... PDI), so a code such
// as "100-0233" or a size such as "M3 × 10" keeps its own order.
const isolateText = (v) => (v == null ? '' : `\u2068${v}\u2069`);

/** Translate and fill: plain text (escape it before putting it in HTML, or use th() from ui.js). */
export function t(src, vars) {
  return format(tr(src), vars, dirOf(lang) === 'rtl' ? { value: isolateText } : undefined);
}

/** Lower-case a label used inside a sentence, except where nouns keep their capital (German). */
export function lower(s) {
  s = String(s ?? '');
  if (baseOf(lang) === 'de') return s;
  try { return s.toLocaleLowerCase(lang); } catch { return s.toLowerCase(); }
}

/** "A, B and C" in the current language. */
export function listJoin(items, type = 'conjunction') {
  const arr = (items || []).map(String);
  try { return new Intl.ListFormat(lang, { style: 'long', type }).format(arr); } catch { return arr.join(', '); }
}

/** Placeholders a template uses ("{n}", "{name}"), for checking that a translation kept them all. */
export function placeholders(template) {
  const out = new Set();
  const s = String(template || '');
  const re = /\{\s*([\w.]+)\s*(?:,|\})/g;
  let m;
  while ((m = re.exec(s))) out.add(m[1]);
  return [...out].sort();
}

/** Numbers written in a text ("0.5", "4", "M3"), to compare a translated step with its original. */
export function numbersIn(text) {
  return (String(text || '').match(/\d+(?:[.,]\d+)?/g) || []).map((x) => x.replace(',', '.')).sort();
}

/**
 * A table whose text fields translate when they are read:
 *   localize({ pan: { label: N_('Pan head') } }, ['label'])   -> HEADS.pan.label is "ראש פאן" in Hebrew
 *   localize({ screw: N_('Screw') })                            -> a flat map of labels
 */
export function localize(table, fields) {
  for (const key of Object.keys(table)) {
    const row = table[key];
    if (!fields) {
      if (typeof row === 'string') Object.defineProperty(table, key, { get: () => t(row), enumerable: true });
      continue;
    }
    for (const f of fields) {
      const src = row?.[f];
      if (typeof src === 'string') Object.defineProperty(row, f, { get: () => t(src), enumerable: true });
    }
  }
  return table;
}
