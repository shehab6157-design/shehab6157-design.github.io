// Reads the text of an existing work instruction (lines of text per page, as taken from a PDF)
// and drafts RightPart steps from it: where each step starts, the parts it names (by any code the
// library knows), quantities, torques, tools, warnings and checks, plus every code-like word the
// library does not know. Pure functions, no DOM, no PDF library: the browser side extracts lines.
//
// Everything produced here is a DRAFT. Reading documents is guesswork: an engineer compares each
// step with the released document and marks it reviewed before anyone builds from it.

import { resolveCode, normCode } from './model.js';
import { isFastener } from './dims.js';

export const QTY_NOTE = 'Quantity not stated in the PDF';

// ---------- Lines from PDF text items ----------

/**
 * Turns PDF text items ({ str, transform: [a, b, c, d, x, y], width, hasEOL }) into lines of text.
 * Items on the same baseline are joined; a gap between items becomes a space.
 */
export function linesFromItems(items) {
  const lines = [];
  let cur = [];
  let lastY = null;
  let lastEnd = null;
  const flush = () => {
    const t = cur.join('').replace(/\s+/g, ' ').trim();
    if (t) lines.push(t);
    cur = [];
    lastEnd = null;
  };
  for (const it of items || []) {
    if (typeof it?.str !== 'string') continue; // marked-content items carry no text
    const tr = it.transform || [1, 0, 0, 1, 0, 0];
    const x = tr[4];
    const y = tr[5];
    const h = Math.abs(tr[3]) || it.height || 10;
    if (lastY !== null && Math.abs(y - lastY) > h * 0.6) flush();
    else if (lastEnd !== null && cur.length && x - lastEnd > h * 0.2 && !/\s$/.test(cur[cur.length - 1]) && !/^\s/.test(it.str)) cur.push(' ');
    if (it.str) cur.push(it.str);
    lastY = y;
    lastEnd = x + (it.width || 0);
    if (it.hasEOL) { flush(); lastY = null; }
  }
  flush();
  return lines;
}

// ---------- Patterns ----------

const STEP_WORDS = 'step|operation|op\\.?|שלב|خطوة|الخطوة|шаг';
const STEP_RE = new RegExp(`^(?:${STEP_WORDS})\\s*(\\d{1,3})(?:\\s+of\\s+\\d+)?\\s*[:.)\\-–—]?\\s*(.*)$`, 'i');
const DOT0_RE = /^(\d{1,3})\.0\s+(\S.*)$/;
const NUM_RE = /^(\d{1,3})\s*[.)]\s+(\S.*)$/;
const BULLET_RE = /^(?:[•●▪◦‣·*–-]|\(?[a-hA-H]\)|\d{1,2}\s*[.)])\s+/;
const TOC_RE = /\.{4,}\s*\d+\s*$/;
const PAGE_RE = /^(?:page|עמוד|صفحة|страница)\s*\d+(?:\s*(?:of|מתוך|من|из)\s*\d+)?$|^\d+\s*(?:\/|of)\s*\d+$/i;

const LABELS = [
  { kind: 'tools', re: /^(?:tools?|tooling|equipment|כלים|כלי עבודה|أدوات|инструменты?)\s*[:–-]\s*(.*)$/i },
  { kind: 'parts', re: /^(?:parts?|materials?|components?|חלקים|רכיבים|القطع|المكونات|детали)\s*[:–-]\s*(.*)$/i },
  { kind: 'warning', level: 'warning', re: /^(?:warning|danger|אזהרה|סכנה|تحذير|خطر|внимание|опасно)\s*[:!–-]\s*(.*)$/i },
  { kind: 'warning', level: 'caution', re: /^(?:caution|זהירות|تنبيه|осторожно)\s*[:!–-]\s*(.*)$/i },
  { kind: 'warning', level: 'notice', re: /^(?:note|notice|important|tip|הערה|חשוב|ملاحظة|مهم|примечание)\s*[:!–-]\s*(.*)$/i },
  { kind: 'checks', re: /^(?:check|verify|inspect(?:ion)?|quality check|qc|בדיקה|בדוק|וודא|ודא|تحقق|افحص|проверка|проверить)\s*[:–-]\s*(.*)$/i },
  { kind: 'why', re: /^(?:why|purpose|reason|מטרה|למה|الغرض|لماذا|зачем|цель)\s*[:–-]\s*(.*)$/i },
];
// Items in a "Tools:" or "Parts:" line: split on ; | and commas, but not on a decimal comma (5,5 mm).
const LIST_SEP = /\s*(?:[;|]|,(?!\d))\s*/;
const CHECK_START = /^(?:check|verify|ensure|make sure|inspect|confirm|וודא|ודא|בדוק|تأكد|تحقق)\b/i;
const ESD_RE = /\bESD\b|electrostatic|static[- ]sensitive|wrist strap|אלקטרוסטטי|רצועת הארקה|كهرباء ساكنة|электростат/i;

const META = {
  product: /^(?:product|assembly|sub-assembly|device|model|מוצר|מכלול|تجميع|المنتج|изделие|сборка)\s*[:–-]\s*(.+)$/i,
  docNo: /(?:\bdoc(?:ument)?\.?\s*(?:no\.?|number|#)?|\bwi\s*(?:no\.?|#)|מסמך|مستند)\s*[:#]?\s*([A-Z0-9][A-Z0-9_./-]{2,})/i,
  rev: /(?:\brev(?:ision)?\.?|גרסה|מהדורה|مراجعة)\s*[:#]?\s*([A-Z0-9]{1,3})(?![A-Z0-9])/i,
};

// Torque in N·m (also Nm, N-m, N.m) or inch-pounds.
const TORQUE_RE = /(\d+(?:[.,]\d+)?)\s*(?:N\s*[·.\-]?\s*m\b|Nm\b)|(\d+(?:[.,]\d+)?)\s*(?:in\.?\s*[-·]?\s*lbs?\b|lbf?\s*[-·.]?\s*in\b)/gi;

// A word that looks like a part number: digits with a dash or letters, e.g. 100-0233, C-55013, AF-7380-M3-8-A2.
const CODE_LIKE = /^(?=.*[A-Z-])[A-Z]{0,5}-?\d{3,}(?:[-./][A-Z0-9]+)*$/i;
const NOT_A_PART = /^(?:ECO|ECN|ECR|DCN|REV|DOC|WI|SOP|QP|FRM|PAGE|TEL|FAX|ISO|DIN|EN|IEC|UL|IPC|DWG)\b|^\d{4}[-./]\d{1,2}[-./]\d{1,2}$|^\d{1,2}[-./]\d{1,2}[-./]\d{2,4}$/i;

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const PART_NOUN = /^(?:screws?|bolts?|nuts?|lock ?nuts?|washers?|standoffs?|spacers?|rivets?|clips?|ties?|cable ?ties?|pins?|inserts?|brackets?|labels?|ברגים|בורג|אומים|אום|דסקיות|דסקית|براغي|برغي|صواميل|винт(?:а|ов)?|гайк(?:а|и)?)$/i;

const num = (s) => {
  const t = String(s || '').toLowerCase();
  if (/^\d{1,3}$/.test(t)) return parseInt(t, 10);
  return NUMBER_WORDS[t] ?? null;
};
const cleanTok = (raw) => raw.replace(/^[(\[{<"'“”‘’]+|[)\]}>"'“”‘’,;:!?]+$/g, '').replace(/\.$/, '');

function torquesIn(text) {
  const out = [];
  for (const m of String(text).matchAll(TORQUE_RE)) {
    if (m[1]) out.push({ value: parseFloat(m[1].replace(',', '.')), unit: 'N·m' });
    else if (m[2]) out.push({ value: parseFloat(m[2].replace(',', '.')), unit: 'in·lb' });
  }
  return out;
}

// ---------- Codes in a line ----------

/** Quantity written next to a code at tokens [i, j): "4 x CODE", "CODE x4", "CODE (4)", "4 screws CODE", "CODE qty 4". */
function qtyAround(tokens, i, j) {
  const raw = (k) => tokens[k]?.raw ?? '';
  const prev = raw(i - 1), prev2 = raw(i - 2), prev3 = raw(i - 3);
  const next = raw(j), next2 = raw(j + 1);
  let m;
  // before the code
  if (/^[x×*]$/i.test(prev) && num(prev2) != null) return num(prev2);
  if ((m = prev.match(/^(\d{1,3})[x×*]$/i))) return parseInt(m[1], 10);
  if (/^(?:pcs?|pieces?|ea|off)\.?$/i.test(prev) && num(prev2) != null) return num(prev2);
  if (/^of$/i.test(prev) && /^(?:pcs?|pieces?)\.?$/i.test(prev2) && num(prev3) != null) return num(prev3);
  if (PART_NOUN.test(cleanTok(prev)) && num(prev2) != null) return num(prev2);
  if (PART_NOUN.test(cleanTok(prev)) && /^(?:M\d|#\d)/i.test(prev2) && num(prev3) != null) return num(prev3);
  if (/^(?:a|an|one)$/i.test(prev) || (PART_NOUN.test(cleanTok(prev)) && /^(?:a|an|one)$/i.test(prev2))) return 1;
  // after the code
  if ((m = next.match(/^[x×*](\d{1,3})[),.;]*$/i))) return parseInt(m[1], 10);
  if (/^[x×*]$/i.test(next) && (m = next2.match(/^(\d{1,3})[),.;]*$/))) return parseInt(m[1], 10);
  if ((m = next.match(/^\((?:[x×]\s*)?(\d{1,3})\)[,.;]*$/i))) return parseInt(m[1], 10);
  if ((m = tokens[i]?.raw.match(/\((?:[x×]\s*)?(\d{1,3})\)[,.;]*$/i)) && j === i + 1) return parseInt(m[1], 10);
  if (/^(?:qty|quantity|כמות|كمية)\.?:?$/i.test(next) && (m = next2.match(/^(\d{1,3})/))) return parseInt(m[1], 10);
  if (PART_NOUN.test(cleanTok(next)) && (m = next2.match(/^\((?:[x×]\s*)?(\d{1,3})\)[,.;]*$|^[x×*](\d{1,3})[,.;]*$/i))) return parseInt(m[1] || m[2], 10);
  return null;
}

/**
 * Finds the parts a line names. Known codes (any alias, designation or internal code) are matched
 * on up to four words; unknown part-number-like words are returned separately.
 * Returns { refs: [{ code, qty, qtyStated, status, partId, legacy, torque? }], unknown: [code] }.
 */
export function findCodes(index, line, { tableRow = false } = {}) {
  const tokens = String(line).split(/\s+/).filter(Boolean).map((raw) => ({ raw, clean: cleanTok(raw) }));
  const refs = [];
  const unknown = [];
  // Parts tables: "1  C-61003  Fan 60 × 60  1": the last number on the row is the quantity.
  const rowQty = tableRow && tokens.length >= 3 && /^\d{1,3}$/.test(tokens[0].clean) ? num(tokens[tokens.length - 1].clean) : null;
  const torques = torquesIn(line);
  let i = 0;
  while (i < tokens.length) {
    let hit = null;
    for (let n = Math.min(4, tokens.length - i); n >= 1; n--) {
      const words = tokens.slice(i, i + n).map((t) => t.clean);
      if (!words[0] || !words[n - 1]) continue;
      const text = words.join(' ');
      if (normCode(text).length < 4) continue;
      if (n > 1 && words.every((w) => /^\d+$/.test(w)) && words.some((w) => w.length < 3)) continue;
      const r = resolveCode(index, text);
      if (r.status !== 'unknown') { hit = { n, text, r }; break; }
    }
    if (hit) {
      const stated = qtyAround(tokens, i, i + hit.n) ?? (rowQty != null && i > 0 && i + hit.n < tokens.length ? rowQty : null);
      const ref = { code: hit.text, qty: stated ?? 1, qtyStated: stated != null, status: hit.r.status, partId: hit.r.part?.id || null, legacy: !!hit.r.legacy };
      if (torques.length && hit.r.part && isFastener(hit.r.part)) ref.torque = torques[0];
      refs.push(ref);
      i += hit.n;
      continue;
    }
    const t = tokens[i].clean;
    if (CODE_LIKE.test(t) && !NOT_A_PART.test(t)) {
      const stated = qtyAround(tokens, i, i + 1) ?? (rowQty != null && i > 0 && i + 1 < tokens.length ? rowQty : null);
      unknown.push({ code: t, qty: stated ?? 1, qtyStated: stated != null });
    }
    i += 1;
  }
  return { refs, unknown };
}

// ---------- Document structure ----------

function stripRepeated(pages) {
  // Headers and footers: the same line (numbers ignored) on at least half of the pages.
  if (pages.length < 2) return pages.map((p) => ({ ...p, lines: p.lines.filter((l) => !PAGE_RE.test(l)) }));
  const key = (l) => l.replace(/\d+/g, '#').toLowerCase();
  const count = new Map();
  for (const p of pages) for (const k of new Set(p.lines.map(key))) count.set(k, (count.get(k) || 0) + 1);
  const repeated = new Set([...count].filter(([k, n]) => n >= Math.max(2, Math.ceil(pages.length / 2)) && k.length < 140).map(([k]) => k));
  return pages.map((p) => ({ ...p, lines: p.lines.filter((l) => !repeated.has(key(l)) && !PAGE_RE.test(l)) }));
}

function headingOf(line, mode) {
  let m;
  if (mode === 'step' && (m = line.match(STEP_RE))) return { no: parseInt(m[1], 10), title: m[2].replace(TOC_RE, '').trim() };
  if (mode === 'dot0' && (m = line.match(DOT0_RE))) return { no: parseInt(m[1], 10), title: m[2].replace(TOC_RE, '').trim() };
  if (mode === 'num' && (m = line.match(NUM_RE))) return { no: parseInt(m[1], 10), title: m[2].replace(TOC_RE, '').trim() };
  return null;
}

function slug(s) {
  return String(s || '').toUpperCase().normalize('NFKD').replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
}

/**
 * Drafts steps from the lines of a document.
 * pages: [{ page: 1, lines: ['...'] }]; index: from buildIndex(); file: shown on each step as its source.
 * Returns { meta, steps, unknownCodes, notes, warnings, stats }.
 */
export function draftSteps(pages, index, { file = 'PDF' } = {}) {
  const warnings = [];
  const clean = stripRepeated(pages.map((p, k) => ({ page: p.page ?? k + 1, lines: (p.lines || []).map((l) => String(l).replace(/\s+/g, ' ').trim()).filter(Boolean) })));
  const all = clean.flatMap((p) => p.lines.map((text) => ({ text, page: p.page })));

  // Which kind of headings does the document use?
  const countOf = (re) => all.filter((l) => re.test(l.text)).length;
  const mode = countOf(STEP_RE) >= 2 ? 'step' : countOf(DOT0_RE) >= 2 ? 'dot0' : countOf(NUM_RE) >= 2 ? 'num' : null;

  // Split into a preamble and steps. In numbered-list documents a heading must continue the
  // sequence (1, 2, 3 …), so a numbered list inside a step does not start new steps.
  const preamble = [];
  let raw = [];
  let cur = null;
  let lastNo = 0;
  for (const l of all) {
    const h = mode ? headingOf(l.text, mode) : null;
    const accept = h && (mode !== 'num' || h.no === lastNo + 1 || (lastNo === 0 && h.no === 1));
    if (accept) {
      if (h.no <= lastNo && raw.length) {
        // Numbering starts again: an earlier table of contents (headings without bodies), or a second section.
        const thin = raw.every((s) => s.body.length <= 1);
        if (thin) { preamble.push(...raw.flatMap((s) => [{ text: s.heading, page: s.page }, ...s.body])); raw = []; }
        else warnings.push(`Step numbers start again on page ${l.page}; the steps were kept in the order they appear.`);
      }
      cur = { no: h.no, title: h.title, heading: l.text, page: l.page, body: [] };
      raw.push(cur);
      lastNo = h.no;
    } else if (cur) cur.body.push(l);
    else preamble.push(l);
  }
  if (!mode || !raw.length) {
    warnings.push('No step numbers were found ("Step 1", "1.0" or a numbered list), so each page became one step. Split them in the editor.');
    raw = clean.filter((p) => p.lines.length).map((p, k) => ({ no: k + 1, title: '', heading: '', page: p.page, body: p.lines.map((text) => ({ text, page: p.page })) }));
    preamble.length = 0;
  }

  // Document details from the preamble.
  const meta = { title: '', product: '', docNo: '', rev: '' };
  for (const l of preamble) {
    let m;
    if (!meta.product && (m = l.text.match(META.product))) meta.product = m[1].trim();
    if (!meta.docNo && (m = l.text.match(META.docNo)) && /\d/.test(m[1])) meta.docNo = m[1].replace(/[.,;]+$/, '');
    if (!meta.rev && (m = l.text.match(META.rev))) meta.rev = m[1].toUpperCase();
  }
  meta.title = (preamble.find((l) => /\p{L}{3,}/u.test(l.text) && !META.docNo.test(l.text) && !META.rev.test(l.text) && !META.product.test(l.text)) || {}).text || '';
  meta.suggestedId = slug(meta.product || meta.docNo || meta.title || file.replace(/\.pdf$/i, '')) || 'NEW-DEVICE';
  meta.suggestedName = meta.product || meta.title || file.replace(/\.pdf$/i, '');

  // General notes before the first step: warnings and ESD apply to the whole document.
  const notes = [];
  let esdAll = false;
  const unknownCodes = new Map();
  const noteUnknown = (u, page, where) => {
    if (meta.docNo && normCode(u.code) === normCode(meta.docNo)) return;
    const e = unknownCodes.get(normCode(u.code)) || { code: u.code, pages: new Set(), where: new Set() };
    e.pages.add(page);
    if (where) e.where.add(where);
    unknownCodes.set(normCode(u.code), e);
  };
  for (const l of preamble) {
    if (ESD_RE.test(l.text)) esdAll = true;
    const lab = LABELS.find((x) => x.re.test(l.text));
    if (lab?.kind === 'warning') notes.push(l.text);
    for (const u of findCodes(index, l.text, { tableRow: true }).unknown) noteUnknown(u, l.page, 'parts list');
  }

  // Steps.
  let refsLinked = 0;
  let qtyMissing = 0;
  const steps = raw.map((s, k) => {
    const step = { id: `S${k + 1}`, title: '', summary: '', parts: [], tools: [], instructions: [], checks: [], warnings: [], draft: true, source: { file, page: s.page } };
    const listed = [];   // from "Parts:" lines: the step's own parts list
    const inline = [];   // codes named in the text
    const lineTorques = [];
    const take = (text, page, into) => {
      const { refs, unknown } = findCodes(index, text);
      for (const r of refs) into.push(r);
      for (const u of unknown) {
        noteUnknown(u, page, `step ${k + 1}`);
        if (u.qtyStated || into === listed) into.push({ code: u.code, qty: u.qty, qtyStated: u.qtyStated, status: 'unknown', partId: null });
      }
    };
    let title = s.title;
    if (title) take(title, s.page, inline);
    for (const l of s.body) {
      const text = l.text.replace(BULLET_RE, '').trim();
      if (!text) continue;
      if (ESD_RE.test(text)) step.esd = true;
      const lab = LABELS.find((x) => x.re.test(text));
      const rest = lab ? text.match(lab.re)[1].trim() : text;
      if (lab?.kind === 'tools') { step.tools.push(...rest.split(LIST_SEP).filter(Boolean)); continue; }
      if (lab?.kind === 'parts') { for (const seg of rest.split(LIST_SEP)) take(seg, l.page, listed); continue; }
      if (lab?.kind === 'warning') { step.warnings.push({ level: lab.level, text: rest }); continue; }
      if (lab?.kind === 'why') { step.why = step.why ? `${step.why} ${rest}` : rest; continue; }
      if (lab?.kind === 'checks' || CHECK_START.test(text)) { step.checks.push(rest); take(rest, l.page, inline); continue; }
      step.instructions.push(text);
      lineTorques.push(...torquesIn(text));
      take(text, l.page, inline);
    }
    if (!title) title = step.instructions.shift() || `Step ${k + 1}`;
    if (title.length > 90) { step.instructions.unshift(title); title = `${title.slice(0, 87).replace(/\s+\S*$/, '')}…`; }
    step.title = title;
    if (esdAll) step.esd = true;

    // One list of parts: the step's own list first, then codes named only in the text.
    // The same code named twice counts once, with the larger quantity.
    const merged = new Map();
    for (const r of [...listed, ...inline]) {
      const key = r.partId || normCode(r.code);
      const e = merged.get(key);
      if (!e) { merged.set(key, { ...r, fromList: listed.includes(r) }); continue; }
      if (e.fromList && !listed.includes(r)) { if (!e.torque && r.torque) e.torque = r.torque; continue; }
      if (r.qtyStated && (!e.qtyStated || r.qty > e.qty)) { e.qty = r.qty; e.qtyStated = true; }
      if (!e.torque && r.torque) e.torque = r.torque;
    }
    // One torque value in the step and one fastener without a torque: that value is for it.
    const distinct = [...new Map(lineTorques.map((t) => [`${t.value}${t.unit}`, t])).values()];
    const bare = [...merged.values()].filter((r) => !r.torque && r.partId && isFastener(index.parts.get(r.partId)));
    if (distinct.length === 1 && bare.length === 1) bare[0].torque = distinct[0];

    for (const r of merged.values()) {
      const ref = { code: r.code, qty: r.qty };
      if (r.torque) ref.torque = r.torque;
      if (!r.qtyStated) { ref.note = QTY_NOTE; qtyMissing++; }
      if (r.status !== 'unknown') refsLinked++;
      step.parts.push(ref);
    }
    return step;
  });

  for (const st of steps) for (const k of ['tools', 'instructions', 'checks']) st[k] = [...new Set(st[k])];
  const stats = { pages: pages.length, steps: steps.length, refsLinked, qtyMissing, unknown: unknownCodes.size, textLines: all.length };
  if (qtyMissing) warnings.push(`${qtyMissing} part${qtyMissing === 1 ? '' : 's'} had no quantity next to the code, so 1 was used. Check them in the editor.`);
  return {
    meta,
    steps,
    notes,
    unknownCodes: [...unknownCodes.values()].map((u) => ({ code: u.code, pages: [...u.pages].sort((a, b) => a - b), where: [...u.where] })),
    warnings,
    stats,
  };
}

/** Puts drafted steps into a device (creating it if needed). Replaces that device's steps. */
export function applyDraft(lib, draft, { deviceId, deviceName, rev, description }) {
  const out = structuredClone(lib);
  out.devices = out.devices || [];
  let dev = out.devices.find((d) => d.id === deviceId);
  if (!dev) {
    dev = { id: deviceId, name: deviceName || deviceId, description: description || '', bom: { rev: '', lines: [] }, instructions: { rev: rev || '', steps: [] } };
    out.devices.push(dev);
  }
  dev.instructions = { ...(dev.instructions || {}), rev: rev || dev.instructions?.rev || '', steps: draft.steps };
  return out;
}
