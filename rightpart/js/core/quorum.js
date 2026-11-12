// Quorum light: an AI answer lights up only when its records agree with it.
// The bacteria in the Hawaiian bobtail squid's light organ glow only when enough of them signal
// together (quorum sensing), and an immune cell attacks only after a second, confirming signal.
// Here an answer from the AI is shown only if every number and every part code in it is also in the
// records it cites (or in the worker's own question). Otherwise it is held back, the same rule a
// translation that changes a number already follows. It is a guard, not a proof: a number that
// is in the records can still be used in the wrong place, so answers still say to check the step.
// Pure: answer text and records in, verdict out.

import { resolveCode } from './model.js';

const DIGITS = /[٠-٩۰-۹०-९]/g;
const DIGIT_BASE = [0x0660, 0x06F0, 0x0966];

/** Western digits and decimal points, so "٠٫٦" or "0,6" compare equal to "0.6". */
export function normalizeNumbers(s) {
  return String(s ?? '')
    .replace(DIGITS, (c) => { const code = c.charCodeAt(0); const base = DIGIT_BASE.find((b) => code >= b && code <= b + 9); return String(code - base); })
    .replace(/٫/g, '.')
    .replace(/(\d),(\d{1,3})(?!\d)/g, '$1.$2');
}

const normCode = (s) => normalizeNumbers(s).toUpperCase().replace(/[×✕]/g, 'X').replace(/\s+/g, '');

// Part codes (100-0233, SCR-TX-36, AF-7380-M3-8-A2, 1/4), thread sizes (M3×8, M2.5 x 5) and inch threads (#4-40).
const CODE_RE = /#\d+-\d+|\bM\d+(?:\.\d+)?(?:\s?[×xX✕]\s?\d+(?:\.\d+)?)+\b|\b[A-Z0-9]+(?:[-/][A-Z0-9]+)+(?:\.[A-Z0-9]+)*\b|\b(?=[A-Z0-9.]*[A-Z])(?=[A-Z0-9.]*\d)[A-Z0-9]+(?:\.[A-Z0-9]+)+\b/g;

/** Codes in a text: anything with a digit and a dash or slash, a thread size, or a dotted code with letters. */
export function codesIn(text) {
  const out = [];
  for (const m of normalizeNumbers(text).matchAll(CODE_RE)) {
    const c = m[0];
    if (!/\d/.test(c)) continue;
    out.push(c);
  }
  return out;
}

/** Numbers in a text that is not a code, with list markers ("1. ", "2) ") left out. */
export function numbersIn(text) {
  const plain = normalizeNumbers(text)
    .split('\n').map((line) => line.replace(/^\s*(?:\d{1,2}[.)]|[-*•])\s+/, '')).join('\n')
    .replace(CODE_RE, ' ');
  return [...plain.matchAll(/\d+(?:\.\d+)?/g)].map((m) => parseFloat(m[0]));
}

const evidenceText = (records) => records.map((r) => JSON.stringify(r)).join('\n');

/**
 * The records an answer may lean on: the ones it cites, plus the part records those name (a cited
 * step lists its parts by code; the part record gives their size). With no citations, nothing.
 */
export function evidenceFor(records = [], cited = []) {
  const ids = new Set(cited || []);
  const base = records.filter((r) => ids.has(r.id));
  const text = normCode(evidenceText(base));
  const extra = records.filter((r) => !ids.has(r.id) && r.type === 'part' && text.includes(normCode(r.id.slice(5))));
  return [...base, ...extra];
}

/**
 * Check an AI answer. Returns { ok, checked, unsupported: [{ kind: 'number'|'code', value }] }.
 * `index` (optional) lets a code count when it is another code of a part in the evidence.
 */
export function checkQuorum(answer, records = [], cited = [], { question = '', index = null } = {}) {
  const body = String(answer || '').replace(/\[[^\]\s]{1,80}\]/g, ' '); // citations are checked by the server
  const ev = evidenceFor(records, cited);
  const evText = evidenceText(ev) + '\n' + String(question || '');
  const evCodes = normCode(evText);
  const evNumbers = numbersIn(evText.replace(/[A-Za-z_:"{}[\],]+/g, ' ')).concat(codesIn(evText).flatMap((c) => (normalizeNumbers(c).match(/\d+(?:\.\d+)?/g) || []).map(Number)));
  const hasNumber = (v) => evNumbers.some((x) => Math.abs(x - v) < 1e-9);
  const evPartIds = new Set(ev.filter((r) => r.type === 'part').map((r) => r.id.slice(5)));
  const unsupported = [];
  let checked = 0;
  for (const c of new Set(codesIn(body))) {
    checked++;
    if (evCodes.includes(normCode(c))) continue;
    const r = index ? resolveAny(index, c) : null;
    if (r && (evPartIds.has(r) || evCodes.includes(normCode(r)))) continue;
    unsupported.push({ kind: 'code', value: c });
  }
  for (const n of new Set(numbersIn(body))) {
    checked++;
    if (!hasNumber(n)) unsupported.push({ kind: 'number', value: String(n) });
  }
  return { ok: unsupported.length === 0, checked, unsupported };
}

function resolveAny(index, code) {
  const r = resolveCode(index, code);
  return r.status === 'unique' ? r.part.id : null;
}
