// Interface text catalog and translation checks.
//   node tools/i18n.mjs            report: strings, coverage per language, problems
//   node tools/i18n.mjs --write    also rewrite locales/en.json and the coverage in every language file
//   node tools/i18n.mjs --missing he   print the strings a language still lacks (as JSON, ready to translate)
//   node tools/i18n.mjs --leftovers    list English text in templates that is not wrapped in t()
//
// Every string shown on screen is written in English in the code, inside t('…'), th('…') or N_('…').
// "Floor" strings are the ones a worker meets at the bench (build guide, scanning, Ask, parts,
// identify, training): every built-in language covers at least those.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES = path.join(root, 'locales');

// Files whose strings a worker meets at the bench: the menus, the build guide and device page,
// scanning, the Ask panel, part names and look-alike warnings. Every built-in language covers these.
export const FLOOR_FILES = [
  'js/app.js', 'js/ui.js', 'js/lang.js', 'js/components.js', 'js/scan.js', 'js/askpanel.js', 'js/askui.js',
  'js/views/guide.js', 'js/views/device.js', 'js/views/devices.js',
  'js/core/model.js', 'js/core/lookalike.js', 'js/core/dims.js',
];
// The safety messages from the integrity check and Ask that appear inside the build guide.
export const FLOOR_EXTRA = [
  'Step {n} probably fits the wrong {kind}: {fitted} where the BOM asks for {wanted}',
  'Stop and confirm with engineering. If the BOM is right, correct step {n} to {id}, check what is in the bins, and review the devices already built (quality may open a nonconformance).',
  'Step {n} uses code {code}, which is not in the library',
  'Step {n} fits a retired part: {id}',
  '{name} is fitted but not in the BOM',
  '{name}: the steps fit {steps}, the BOM lists {bom}',
  'Code {code} points to {n} different parts',
  'Step {n}: the {language} translation changes a number',
  'Stop: the instructions say {fitted}, but BOM rev {rev} asks for {wanted} here. Ask your supervisor or engineer before fitting.',
  'no torque value is recorded. Ask your engineer; do not tighten by feel.',
  'Step {n}, “{title}”, uses:',
  'Step {n}: {title}.',
  'Torque in step {n}, “{title}”:',
  "I could not find this in the company's data. Try a part code, a step number or a size (like M3x8), or ask your supervisor.",
  'I could not find a direct answer in the data. These parts match your words:',
  "Don't confuse with {part}: {diff}.",
  'Tools:', 'Torque:', 'Why:', 'From:', 'Check before moving on:', 'What can I ask?',
  'How do I do step {n}?', 'Torque for step {n}?', 'What comes after step {n}?',
  'Integrity check', 'a PDF',
  'Step {n} is a draft read from {file} and not reviewed yet. Check it against the released document.',
];

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

/** Every t('…'), th('…') and N_('…') literal in a source text. */
export function extract(src) {
  const keys = [];
  const re = /(?<![\w$.])(?:t|th|N_)\(\s*(['"])((?:\\.|(?!\1)[^\\\n])*)\1/g;
  let m;
  while ((m = re.exec(src))) {
    const lit = m[1] + m[2] + m[1];
    // eslint-disable-next-line no-new-func
    keys.push(Function(`"use strict"; return (${lit});`)());
  }
  return keys;
}

export function buildCatalog() {
  const files = walk(path.join(root, 'js')).filter((f) => !f.includes(`${path.sep}vendor${path.sep}`));
  const keys = new Map(); // key -> Set(files)
  for (const f of files) {
    const rel = path.relative(root, f).split(path.sep).join('/');
    for (const k of extract(fs.readFileSync(f, 'utf8'))) {
      if (!keys.has(k)) keys.set(k, new Set());
      keys.get(k).add(rel);
    }
  }
  const all = [...keys.keys()].sort((a, b) => a.localeCompare(b, 'en'));
  const floor = all.filter((k) => FLOOR_EXTRA.includes(k) || [...keys.get(k)].some((f) => FLOOR_FILES.includes(f)));
  const missingExtra = FLOOR_EXTRA.filter((k) => !keys.has(k));
  if (missingExtra.length) console.warn('FLOOR_EXTRA strings not found in the code:', missingExtra);
  return { all, floor, files: keys };
}

/** {name} placeholders a template uses (plural branches included). */
export function placeholderSet(s) {
  // A small ICU reader: {name}, {name, plural|select, one {text} other {text}}; text in branches may hold more placeholders.
  const src = String(s);
  const names = new Set();
  let i = 0;
  const text = (inBranch) => {
    while (i < src.length) {
      const c = src[i];
      if (c === '}' && inBranch) return;
      if (c !== '{') { i++; continue; }
      const m = src.slice(i + 1).match(/^\s*([\w.]+)\s*([,}])/);
      if (!m) { i++; continue; }
      names.add(m[1]);
      i += 1 + m[0].length;
      if (m[2] === '}') continue;
      const k = src.slice(i).match(/^\s*(plural|select|selectordinal)\s*,/);
      if (!k) { let d = 1; while (i < src.length && d) { if (src[i] === '{') d++; else if (src[i] === '}') d--; i++; } continue; }
      i += k[0].length;
      for (let b; (b = src.slice(i).match(/^\s*(=?[\w-]+)\s*\{/));) { i += b[0].length; text(true); i++; }
      while (i < src.length && src[i] !== '}') i++;
      i++;
    }
  };
  text(false);
  return [...names].sort().join('|');
}

/** Problems in one language file against the catalog. */
export function checkLocale(data, cat) {
  const msgs = data.messages || {};
  const want = data.tier === 'full' ? cat.all : cat.floor;
  const missing = want.filter((k) => !msgs[k]);
  const stale = Object.keys(msgs).filter((k) => !cat.files.has(k));
  const placeholders = Object.entries(msgs).filter(([k, v]) => cat.files.has(k) && placeholderSet(k) !== placeholderSet(v)).map(([k, v]) => ({ key: k, value: v }));
  const braces = Object.entries(msgs).filter(([, v]) => { let d = 0; for (const c of v) { if (c === '{') d++; if (c === '}') d--; if (d < 0) return true; } return d !== 0; }).map(([k]) => k);
  const covered = cat.all.filter((k) => msgs[k]).length;
  return { missing, stale, placeholders, braces, coverage: Math.round((covered / cat.all.length) * 1000) / 1000, floorCoverage: cat.floor.filter((k) => msgs[k]).length / cat.floor.length };
}

function leftovers() {
  const files = walk(path.join(root, 'js')).filter((f) => !f.includes('vendor') && !/problems\.js|about\.js|challenges\.js/.test(f));
  const out = [];
  for (const f of files) {
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (/^\s*\/\//.test(line)) return;
      // Text between tags that starts with a capital and has a second word, outside ${…}.
      const plain = line.replace(/\$\{[^}]*\}/g, '');
      const m = plain.match(/>\s*([A-Z][a-z]+(?:[ ,'][a-zA-Z]+)+)\s*</);
      const toast = line.match(/toast\(\s*['`][A-Z][a-z]+ [a-z]/);
      const label = line.match(/(?:label|title|placeholder|aria-label)(?::\s*|=")['"`]?[A-Z][a-z]+ [a-z]+/);
      if ((m || toast || label) && !/\bt\(|\bth\(/.test(line)) out.push(`${path.relative(root, f)}:${i + 1}: ${line.trim().slice(0, 140)}`);
    });
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const cat = buildCatalog();
  if (args[0] === '--leftovers') { const l = leftovers(); console.log(l.join('\n') || 'none'); process.exit(l.length ? 1 : 0); }
  if (args[0] === '--list') {
    // Numbered strings of a tier still missing in a language: "N|english". Translate as "N|text".
    const [, code, tier] = args;
    const file = path.join(LOCALES, `${code}.json`);
    const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { messages: {} };
    const want = (tier || data.tier) === 'full' ? cat.all : cat.floor;
    want.forEach((k, i) => { if (!data.messages?.[k]) console.log(`${i + 1}|${k}`); });
    process.exit(0);
  }
  if (args[0] === '--merge') {
    // node tools/i18n.mjs --merge he full file.txt  (lines "N|translation", N from --list)
    const [, code, tier, src] = args;
    const want = tier === 'full' ? cat.all : cat.floor;
    const file = path.join(LOCALES, `${code}.json`);
    const meta = (await import('../js/lang.js').catch(() => null)) ? null : null; void meta;
    const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { code, tier, reviewed: false, messages: {} };
    data.tier = data.tier || tier;
    let n = 0;
    const problems = [];
    for (const line of fs.readFileSync(src, 'utf8').split('\n')) {
      const m = line.match(/^(\d+)\|(.*)$/);
      if (!m) continue;
      const key = want[+m[1] - 1];
      const v = m[2].trim();
      if (!key || !v) { problems.push(`line ${m[1]}: no such string`); continue; }
      if (placeholderSet(key) !== placeholderSet(v)) { problems.push(`${m[1]}: placeholders ${placeholderSet(key)} vs ${placeholderSet(v)}  |  ${v}`); continue; }
      data.messages[key] = v;
      n++;
    }
    data.messages = Object.fromEntries(Object.entries(data.messages).sort(([a], [b]) => a.localeCompare(b, 'en')));
    data.coverage = checkLocale(data, cat).coverage;
    fs.writeFileSync(file, JSON.stringify(data, null, 1) + '\n');
    console.log(`${code}: merged ${n}, coverage ${(data.coverage * 100).toFixed(1)}%`);
    for (const p of problems) console.log('  ', p);
    process.exit(problems.length ? 1 : 0);
  }
  if (args[0] === '--missing') {
    const code = args[1];
    const file = path.join(LOCALES, `${code}.json`);
    const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { tier: args[2] || 'floor', messages: {} };
    const want = (args[2] || data.tier) === 'full' ? cat.all : cat.floor;
    const todo = want.filter((k) => !data.messages?.[k]);
    console.log(JSON.stringify(todo, null, 0));
    process.exit(0);
  }
  const write = args.includes('--write');
  if (write) {
    fs.mkdirSync(LOCALES, { recursive: true });
    const en = { code: 'en', name: 'English', note: 'Generated by tools/i18n.mjs: every interface string, in English. Do not edit.', count: cat.all.length, floor: cat.floor, messages: Object.fromEntries(cat.all.map((k) => [k, k.replace(/^[a-z][\w-]*::/, '')])) };
    fs.writeFileSync(path.join(LOCALES, 'en.json'), JSON.stringify(en, null, 1) + '\n');
  }
  console.log(`${cat.all.length} strings, ${cat.floor.length} on the floor screens.`);
  let bad = 0;
  for (const f of fs.readdirSync(LOCALES).filter((x) => x.endsWith('.json') && x !== 'en.json').sort()) {
    const file = path.join(LOCALES, f);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const r = checkLocale(data, cat);
    bad += r.placeholders.length + r.braces.length;
    console.log(`${f.padEnd(9)} ${String(data.tier).padEnd(6)} ${(r.coverage * 100).toFixed(0).padStart(3)}% of all, ${(r.floorCoverage * 100).toFixed(0).padStart(3)}% of floor · missing ${r.missing.length} · stale ${r.stale.length} · placeholder problems ${r.placeholders.length + r.braces.length}`);
    for (const p of r.placeholders.slice(0, 5)) console.log(`   placeholder: ${p.key}  ->  ${p.value}`);
    if (write) {
      data.coverage = r.coverage;
      // Stale entries (strings no longer in the code) are dropped so files stay small.
      for (const k of r.stale) delete data.messages[k];
      data.messages = Object.fromEntries(Object.entries(data.messages).sort(([a], [b]) => a.localeCompare(b, 'en')));
      fs.writeFileSync(file, JSON.stringify(data, null, 1) + '\n');
    }
  }
  process.exit(bad ? 1 : 0);
}
