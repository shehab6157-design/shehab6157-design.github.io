// Reads fastener designations and part codes, such as
//   "ISO 7380 M3x8 A2", "DIN 912 M4x10 8.8", "#4-40 x 1/4 PPH zinc", "AF-7045-M3-6-A2"
// and explains every piece in plain words. Pure functions, no DOM.

import { coarsePitch, UNIFIED_TPI, HEADS, DRIVES, MATERIALS, driveSize } from './dims.js';

export const STANDARDS = [
  { codes: ['ISO 4762', 'DIN 912'], category: 'screw', head: 'socket', drive: 'hex', name: 'Socket head cap screw', note: 'Tall cylindrical head with a hex socket. The strongest common head: used where a high clamp force is needed.' },
  { codes: ['ISO 7380-1', 'ISO 7380'], category: 'screw', head: 'button', drive: 'hex', name: 'Button head screw, hex socket', note: 'Low domed head with a hex socket. Neat and low, but it takes less torque than a socket cap screw.' },
  { codes: ['ISO 10642', 'DIN 7991'], category: 'screw', head: 'countersunk', drive: 'hex', name: 'Countersunk screw, hex socket', note: 'A 90° cone head that sits flush with the surface. Its length is measured overall, head included.' },
  { codes: ['ISO 7045', 'DIN 7985'], category: 'screw', head: 'pan', drive: 'phillips', name: 'Pan head screw, cross recess', note: 'Rounded pan head. The letter after the size tells the cross: H = Phillips, Z = Pozidriv.' },
  { codes: ['ISO 7046', 'DIN 965'], category: 'screw', head: 'countersunk', drive: 'phillips', name: 'Countersunk screw, cross recess', note: 'Flush 90° head with a cross recess (H = Phillips, Z = Pozidriv). Length includes the head.' },
  { codes: ['ISO 14583'], category: 'screw', head: 'pan', drive: 'torx', name: 'Pan head screw, Torx (hexalobular) socket', note: 'Pan head with a six-lobe Torx drive, which slips far less than a cross recess.' },
  { codes: ['ISO 14580'], category: 'screw', head: 'cheese', drive: 'torx', name: 'Cheese head screw, Torx socket', note: 'Cylindrical cheese head with a Torx drive.' },
  { codes: ['ISO 14581'], category: 'screw', head: 'countersunk', drive: 'torx', name: 'Countersunk screw, Torx socket', note: 'Flush head with a Torx drive. Length includes the head.' },
  { codes: ['ISO 1207', 'DIN 84'], category: 'screw', head: 'cheese', drive: 'slotted', name: 'Slotted cheese head screw', note: 'Cylinder head with a single slot.' },
  { codes: ['ISO 1580', 'DIN 85'], category: 'screw', head: 'pan', drive: 'slotted', name: 'Slotted pan head screw', note: 'Low pan head with a single slot.' },
  { codes: ['ISO 4017', 'DIN 933'], category: 'screw', head: 'hex', drive: 'external', name: 'Hex head screw, fully threaded', note: 'Hexagon head turned with a spanner; thread runs up to the head.' },
  { codes: ['ISO 4014', 'DIN 931'], category: 'screw', head: 'hex', drive: 'external', name: 'Hex head bolt, part threaded', note: 'Hexagon head with a plain shank under the head.' },
  { codes: ['ISO 7049', 'DIN 7981'], category: 'screw', head: 'pan', drive: 'phillips', tapping: true, name: 'Pan head tapping screw, cross recess', note: 'Self-tapping: it cuts its own thread in plastic or thin sheet. Never interchangeable with a machine screw.' },
  { codes: ['ISO 4032', 'DIN 934'], category: 'nut', variant: 'hex', name: 'Hex nut', note: 'Standard hexagon nut.' },
  { codes: ['ISO 10511', 'DIN 985'], category: 'nut', variant: 'nyloc', name: 'Lock nut with nylon insert (nyloc)', note: 'A nylon ring grips the thread so the nut does not shake loose. Single use: replace it if removed.' },
  { codes: ['ISO 7089', 'DIN 125-A', 'DIN 125'], category: 'washer', variant: 'flat', name: 'Plain washer, normal series', note: 'Spreads the load under a head or nut and protects the surface.' },
  { codes: ['ISO 7092', 'DIN 433'], category: 'washer', variant: 'flat', name: 'Plain washer, small series', note: 'Smaller outside diameter, for cheese and pan heads.' },
  { codes: ['ISO 7093', 'DIN 9021'], category: 'washer', variant: 'flat', name: 'Plain washer, large series', note: 'Large outside diameter, for soft or slotted material.' },
  { codes: ['DIN 6798-A', 'DIN 6798 A', 'DIN 6798'], category: 'washer', variant: 'star-ext', name: 'Serrated lock washer, external teeth', note: 'Teeth bite into both surfaces. Used for earth (ground) connections because they cut through paint and anodising.' },
  { codes: ['DIN 6798-J', 'DIN 6798 J'], category: 'washer', variant: 'star-int', name: 'Serrated lock washer, internal teeth', note: 'Teeth on the inside edge, hidden under small heads.' },
  { codes: ['DIN 127-B', 'DIN 127 B', 'DIN 127'], category: 'washer', variant: 'split', name: 'Spring lock washer (split)', note: 'A split, twisted ring. DIN 127 was withdrawn in 2003 but is still sold. It does not cut through coatings.' },
];

const ABBREVIATIONS = [
  { re: /\bSHCS\b/i, head: 'socket', drive: 'hex', text: 'SHCS', meaning: 'Socket head cap screw (US abbreviation).' },
  { re: /\bBH(?:S)?CS\b/i, head: 'button', drive: 'hex', text: 'BHCS', meaning: 'Button head (socket) cap screw (US abbreviation).' },
  { re: /\bFH(?:S)?CS\b/i, head: 'countersunk', drive: 'hex', text: 'FHCS', meaning: 'Flat (countersunk) head socket cap screw (US abbreviation).' },
  { re: /\bP(?:P)?HMS\b|\bPPH\b/i, head: 'pan', drive: 'phillips', text: 'PPH', meaning: 'Pan Phillips head machine screw (US abbreviation).' },
  { re: /\bF(?:P)?HMS\b|\bFPH\b/i, head: 'countersunk', drive: 'phillips', text: 'FPH', meaning: 'Flat (countersunk) Phillips head machine screw (US abbreviation).' },
];

const WORDS = [
  { re: /\bpan\b/i, head: 'pan' },
  { re: /\bbutton\b/i, head: 'button' },
  { re: /\bsocket\s*(?:head\s*)?cap\b|\bcap\s*screw\b|\bcap\s*head\b/i, head: 'socket' },
  { re: /\bcountersunk\b|\bcsk\b|\bflat\s*head\b/i, head: 'countersunk' },
  { re: /\bcheese\b/i, head: 'cheese' },
  { re: /\bhex(?:agon)?\s*head\b/i, head: 'hex' },
  { re: /\bphillips\b|\bcross\b/i, drive: 'phillips' },
  { re: /\bpozi(?:driv)?\b/i, drive: 'pozidriv' },
  { re: /\btorx\b|\bhexalobular\b/i, drive: 'torx' },
  { re: /\ballen\b|\bhex(?:agon)?\s*socket\b|\binbus\b/i, drive: 'hex' },
  { re: /\bslot(?:ted)?\b/i, drive: 'slotted' },
  { re: /\bstand-?offs?\b|\bspacers?\b|\bstandoff\b/i, category: 'standoff' },
  { re: /\bnyloc\b|\bnylon\s*insert\b|\block\s*nut\b/i, category: 'nut', variant: 'nyloc' },
  { re: /\bnuts?\b/i, category: 'nut' },
  { re: /\bstar\s*washer\b|\bserrated\b|\btooth(?:ed)?\s*(?:lock\s*)?washer\b/i, category: 'washer', variant: 'star-ext' },
  { re: /\bsplit\s*(?:lock\s*)?washer\b|\bspring\s*washer\b/i, category: 'washer', variant: 'split' },
  { re: /\bwashers?\b/i, category: 'washer' },
  { re: /\bscrews?\b|\bbolts?\b/i, category: 'screw' },
  { re: /\bself[-\s]?tapping\b|\btapping\b|\bthread[-\s]?forming\b/i, tapping: true },
];

const MATERIAL_TOKENS = [
  { re: /\bA2(?:[-\s]?(50|70|80))?\b/i, code: 'A2' },
  { re: /\bA4(?:[-\s]?(50|70|80))?\b/i, code: 'A4' },
  { re: /\bstainless\b|\binox\b|\bSS\b|\bAISI\s?304\b/i, code: 'A2' },
  { re: /\bAISI\s?316\b/i, code: 'A4' },
  { re: /\b(?:yellow\s*zinc|zinc\s*yellow|ZY)\b/i, code: 'zinc-yellow' },
  { re: /\bzinc(?:[-\s]?plated)?\b|\bZn\b|\bZP\b|\bgalv(?:anised|anized)?\b/i, code: 'zinc' },
  { re: /\bblack\s*oxide\b|\bBO\b|\bblk\b/i, code: 'black-oxide' },
  { re: /\b(?:4\.8|5\.8|8\.8|10\.9|12\.9)\b/, code: 'class' },
  { re: /\bnylon\b|\bPA\s?66\b|\bPA\s?6\b|\bpolyamide\b|\bPA\b/i, code: 'nylon' },
  { re: /\bnickel[-\s]?plated\s*brass\b|\bbrass[,\s-]*nickel\b|\bNi\b/i, code: 'brass-ni' },
  { re: /\bbrass\b|\bCuZn\b/i, code: 'brass' },
  { re: /\balumin(?:i)?um\b/i, code: 'aluminium' },
];

const STEEL_CLASS = {
  '4.8': 'Steel, property class 4.8: tensile strength 400 MPa, low-strength general purpose.',
  '5.8': 'Steel, property class 5.8: tensile strength 500 MPa.',
  '8.8': 'Steel, property class 8.8: tensile strength 800 MPa, yield 640 MPa. The usual "high tensile" grade.',
  '10.9': 'Steel, property class 10.9: tensile strength 1000 MPa, yield 900 MPa.',
  '12.9': 'Steel, property class 12.9: tensile strength 1200 MPa, yield 1080 MPa. Typical for socket cap screws.',
};

const num = (s) => (s == null ? null : parseFloat(String(s).replace(',', '.')));

function parseInch(s) {
  if (!s) return null;
  s = s.trim().replace(/["”]|\s?in(?:ch)?$/i, '').trim();
  let m = s.match(/^(\d+)[\s-]+(\d+)\/(\d+)$/); // 1-1/4
  if (m) return +m[1] + m[2] / m[3];
  m = s.match(/^(\d+)\/(\d+)$/);
  if (m) return m[1] / m[2];
  m = s.match(/^(\d*\.\d+|\d+)$/);
  if (m) return parseFloat(m[1]);
  return null;
}

const round2 = (v) => Math.round(v * 100) / 100;
const round3 = (v) => Math.round(v * 1000) / 1000;

// Find "ISO 7380-1", "DIN 912", "DIN 6798 A".
function findStandard(text) {
  const re = /\b(ISO|DIN|EN\s?ISO)\s*-?\s*(\d{2,5})(?:\s*-\s*(\d)\b)?(?:[\s-]*([ABJ])\b)?/gi;
  let m;
  while ((m = re.exec(text))) {
    const body = m[1].toUpperCase().replace(/\s/g, '') === 'ENISO' ? 'ISO' : m[1].toUpperCase();
    const candidates = [];
    if (m[3]) candidates.push(`${body} ${m[2]}-${m[3]}`);
    if (m[4]) candidates.push(`${body} ${m[2]}-${m[4].toUpperCase()}`, `${body} ${m[2]} ${m[4].toUpperCase()}`);
    candidates.push(`${body} ${m[2]}`);
    for (const c of candidates) {
      const std = STANDARDS.find((s) => s.codes.includes(c));
      if (std) return { std, matched: m[0].trim(), code: c };
    }
  }
  return null;
}

function findMetric(text) {
  // M3, M3x8, M3x0.5x8, M3-8, M2,5x6
  const re = /(?:^|[^A-Z0-9])M\s?(\d{1,2}(?:[.,]\d{1,2})?)(?:\s?[x×X*-]\s?(\d{1,3}(?:[.,]\d{1,2})?))?(?:\s?[x×X*-]\s?(\d{1,3}(?:[.,]\d{1,2})?))?(?![0-9])/i;
  const m = text.match(re);
  if (!m) return null;
  const d = num(m[1]);
  if (!(d >= 1 && d <= 30)) return null;
  const a = num(m[2]);
  const b = num(m[3]);
  const cp = coarsePitch(d);
  let pitch = null;
  let length = null;
  const looksPitch = (v) => v != null && v < 2.5 && v <= d * 0.4;
  if (a != null && b != null) {
    if (looksPitch(a)) { pitch = a; length = b; } else { length = a; }
  } else if (a != null) {
    if (looksPitch(a)) pitch = a; else length = a;
  }
  return {
    matched: m[0].replace(/^[^M]*/i, ''),
    thread: { system: 'metric', d, pitch: pitch ?? cp, pitchGiven: pitch != null, coarse: pitch == null || Math.abs(pitch - cp) < 0.001, label: 'M' + d },
    length,
  };
}

function findUnified(text) {
  // #4-40 x 1/4, 6-32x3/8", 1/4-20 x 1
  const re = /(?:^|[^\d/.])(?:#\s?(\d{1,2})|(\d{1,2})|(\d\/\d{1,2}))\s?-\s?(\d{2})(?:\s?(UNC|UNF))?(?:\s?[x×X]\s?((?:\d+[\s-])?\d+\/\d{1,2}|\d*\.\d+|\d+)\s?(?:"|”|in(?:ch)?)?)?(?![\d/])/i;
  const m = text.match(re);
  if (!m) return null;
  const sizeKey = m[1] ?? m[2] ?? m[3];
  const tpi = parseInt(m[4], 10);
  const allowed = UNIFIED_TPI[sizeKey];
  if (!allowed || !allowed.includes(tpi)) return null;
  const inchD = sizeKey.includes('/') ? parseInch(sizeKey) : 0.06 + 0.013 * parseInt(sizeKey, 10);
  const series = m[5] ? m[5].toUpperCase() : (tpi === allowed[0] ? 'UNC' : 'UNF');
  const lenIn = parseInch(m[6]);
  return {
    matched: m[0].replace(/^[^#\d]/, '').trim(),
    thread: {
      system: 'unified', d: round2(inchD * 25.4), dInch: round3(inchD), tpi, pitch: round3(25.4 / tpi), series,
      label: `${sizeKey.includes('/') ? sizeKey : '#' + sizeKey}-${tpi} ${series}`,
    },
    length: lenIn != null ? round2(lenIn * 25.4) : null,
    lengthInch: m[6] ? m[6].trim() : null,
  };
}

function findDrive(text) {
  let m = text.match(/\b(PH|PZ)\s?([0-4])\b/i);
  if (m) return { drive: m[1].toUpperCase() === 'PH' ? 'phillips' : 'pozidriv', size: m[1].toUpperCase() + m[2], matched: m[0] };
  m = text.match(/\bT(?:X)?\s?(5|6|7|8|9|10|15|20|25|27|30|40|45|50)\b/i);
  if (m) return { drive: 'torx', size: 'T' + m[1], matched: m[0] };
  return null;
}

// Letter H / Z after a cross-recess standard: "ISO 7045 M3x6 H".
function findCrossLetter(text) {
  const m = text.match(/(?:[\s-])(H|Z)(?=$|[\s-])/);
  if (!m) return null;
  return { drive: m[1] === 'H' ? 'phillips' : 'pozidriv', matched: m[1] };
}

function findStandoffGender(text) {
  const m = text.match(/\b(M-?F|F-?F|M-?M|male[-\s]female|female[-\s]female|male[-\s]male)\b/i);
  if (!m) return null;
  const t = m[1].toUpperCase().replace(/[^MFALE]/g, '');
  const g = /^MF|MALEFEMALE/.test(t) ? 'M-F' : /^FF|FEMALEFEMALE/.test(t) ? 'F-F' : 'M-M';
  return { gender: g, matched: m[0] };
}

/**
 * Decode a designation or code into structured fields plus plain-language notes.
 * Returns null when nothing recognisable is found.
 */
export function decodeDesignation(input) {
  const text = String(input ?? '').trim();
  if (!text) return null;
  const out = {
    input: text, standard: null, category: null, head: null, drive: null, driveSize: null,
    variant: null, thread: null, length: null, lengthInch: null, material: null, steelClass: null,
    gender: null, tapping: false, parts: [], fields: 0,
  };
  const add = (token, meaning, kind) => out.parts.push({ token, meaning, kind });

  const std = findStandard(text);
  if (std) {
    const s = std.std;
    out.standard = { code: s.codes[0], codes: s.codes, name: s.name };
    out.category = s.category; out.head = s.head || null; out.drive = s.drive || null; out.variant = s.variant || null;
    out.tapping = !!s.tapping;
    const others = s.codes.filter((c) => c !== std.code && !c.startsWith(std.code.split(/[- ]/).slice(0, 2).join(' ')));
    add(std.matched, `${s.name}. ${s.note}${others.length ? ` Same part as ${others.join(' / ')}.` : ''}`, 'standard');
  }

  for (const ab of ABBREVIATIONS) {
    const m = text.match(ab.re);
    if (m) { out.category = out.category || 'screw'; out.head = out.head || ab.head; out.drive = out.drive || ab.drive; add(m[0], ab.meaning, 'type'); break; }
  }

  const uni = findUnified(text);
  const met = uni ? null : findMetric(text);
  const th = uni || met;
  if (th) {
    out.thread = th.thread;
    out.length = th.length;
    out.lengthInch = th.lengthInch || null;
    const t = th.thread;
    if (t.system === 'metric') {
      add(t.label + (t.pitchGiven ? `×${t.pitch}` : ''), `Metric thread, ${t.d} mm outside diameter, ${t.coarse ? `standard coarse pitch ${t.pitch} mm` : `fine pitch ${t.pitch} mm (not the standard ${coarsePitch(t.d)} mm)`}.`, 'thread');
    } else {
      add(t.label, `US unified thread: size ${t.label.split('-')[0]} (${t.d} mm, ${t.dInch} in) with ${t.tpi} threads per inch (pitch ${t.pitch} mm), ${t.series === 'UNC' ? 'coarse series' : 'fine series'}. It is not metric: it will not fit an M${Math.round(t.d * 2) / 2} hole even if it looks the same.`, 'thread');
    }
  }

  if (out.thread && out.length == null) {
    const lm = text.match(/(?:\bL\s?=?\s?)(\d{1,3}(?:[.,]\d)?)\b|\b(\d{1,3}(?:[.,]\d)?)\s?mm\b/i);
    if (lm) out.length = num(lm[1] ?? lm[2]);
  }

  // A standard number hidden inside a supplier code, such as "AF-7045-M3-6".
  if (!out.standard) {
    const nums = text.match(/(?:^|[^A-Z0-9.])(\d{4,5})(?=$|[^0-9.])/gi) || [];
    for (const raw of nums) {
      const n = raw.replace(/\D/g, '');
      const s = STANDARDS.find((st) => st.codes.some((c) => c.replace(/^\D+/, '').split(/[- ]/)[0] === n));
      if (s) {
        out.standard = { code: s.codes[0], codes: s.codes, name: s.name, guessed: true };
        out.category = out.category || s.category; out.head = out.head || s.head || null; out.drive = out.drive || s.drive || null; out.variant = out.variant || s.variant || null;
        out.parts.unshift({ token: n, meaning: `Probably ${s.codes[0]} (${s.name.toLowerCase()}): the number ${n} appears in the code. Check it against the part record.`, kind: 'standard' });
        break;
      }
    }
  }

  // Words for head, drive, category
  for (const w of WORDS) {
    const m = text.match(w.re);
    if (!m) continue;
    if (w.head && !out.head) { out.head = w.head; add(m[0], HEADS[w.head].label + '. ' + HEADS[w.head].note, 'head'); }
    if (w.drive && !out.drive) { out.drive = w.drive; add(m[0], DRIVES[w.drive].label + '. ' + DRIVES[w.drive].note, 'drive'); }
    if (w.category && !out.category) { out.category = w.category; }
    if (w.variant && !out.variant) out.variant = w.variant;
    if (w.tapping) out.tapping = true;
  }

  const dr = findDrive(text);
  if (dr) {
    out.drive = dr.drive; out.driveSize = dr.size;
    add(dr.matched, `${DRIVES[dr.drive].label}, size ${dr.size}: use a ${dr.size} bit. ${dr.drive === 'pozidriv' ? 'A Phillips bit slips out of it and damages the head.' : dr.drive === 'phillips' ? 'Not the same as Pozidriv (PZ).' : ''}`.trim(), 'drive');
  } else if (out.standard && /^ISO 704[56]$/.test(out.standard.code)) {
    const cl = findCrossLetter(text);
    if (cl) { out.drive = cl.drive; add(cl.matched, cl.drive === 'phillips' ? 'H = Phillips cross recess.' : 'Z = Pozidriv cross recess (Phillips bits slip out of it).', 'drive'); }
  }

  const g = findStandoffGender(text);
  if (g) { out.gender = g.gender; out.category = out.category || 'standoff'; add(g.matched, g.gender === 'M-F' ? 'Male-female: outside thread at one end, inside thread at the other.' : g.gender === 'F-F' ? 'Female-female: inside thread at both ends.' : 'Male-male: outside thread at both ends.', 'type'); }

  if (out.thread && out.length != null) {
    const cs = out.head === 'countersunk';
    const lenText = out.lengthInch ? `${out.lengthInch} in (${out.length} mm)` : `${out.length} mm`;
    const isStandoff = out.category === 'standoff';
    add('×' + (out.lengthInch || out.length), `Length ${lenText}, ${isStandoff ? 'measured on the body, not counting the male thread' : cs ? 'measured overall, head included (countersunk)' : 'measured from under the head to the tip'}.`, 'length');
  }

  for (const mt of MATERIAL_TOKENS) {
    const m = text.match(mt.re);
    if (!m) continue;
    if (mt.code === 'class') {
      out.steelClass = m[0];
      out.material = out.material || (m[0] === '8.8' ? 'steel-8.8' : 'steel');
      add(m[0], STEEL_CLASS[m[0]], 'material');
    } else if (!out.material || out.material === 'steel-8.8' || out.material === 'steel') {
      out.material = mt.code;
      const cls = (mt.code === 'A2' || mt.code === 'A4') && m[1] ? ` Strength class ${mt.code}-${m[1]}: tensile strength ${m[1] * 10} MPa.` : '';
      add(m[0], MATERIALS[mt.code].label + '. ' + MATERIALS[mt.code].note + cls, 'material');
    }
  }

  if (out.tapping && !out.parts.some((p) => p.kind === 'standard')) add('tapping', 'Self-tapping screw: cuts its own thread. Never use it in a threaded hole meant for a machine screw.', 'type');
  if (!out.category && (out.head || out.drive || (out.thread && out.length != null))) out.category = 'screw';
  if (out.category === 'screw' && out.thread && out.head && out.drive && !out.driveSize) out.driveSize = driveSize(out.head, out.drive, out.thread.d);

  out.fields = ['standard', 'thread', 'length', 'head', 'drive', 'material'].filter((k) => out[k] != null).length + (out.category ? 1 : 0);
  if (!out.parts.length) return null;
  return out;
}

/** Fields of a decoded designation that can be compared with a part spec. */
export function decodedSpec(dec) {
  if (!dec) return {};
  const s = {};
  if (dec.category) s.category = dec.category;
  if (dec.head) s.head = dec.head;
  if (dec.drive) s.drive = dec.drive;
  if (dec.thread) { s.d = dec.thread.d; s.system = dec.thread.system; if (dec.thread.pitchGiven || dec.thread.system === 'unified') s.pitch = dec.thread.pitch; }
  if (dec.length != null) s.length = dec.length;
  if (dec.material) s.material = dec.material;
  if (dec.variant) s.variant = dec.variant;
  if (dec.gender) s.gender = dec.gender;
  return s;
}

/** One-line summary such as "Button head · hex socket · M3 × 8 mm · stainless A2". */
export function summarizeDecoded(dec) {
  if (!dec) return '';
  const bits = [];
  if (dec.standard) bits.push(dec.standard.name);
  else {
    if (dec.head) bits.push(HEADS[dec.head].label);
    if (dec.drive) bits.push(DRIVES[dec.drive].label);
    if (!dec.head && !dec.drive && dec.category) bits.push(dec.category);
  }
  if (dec.thread) bits.push(dec.thread.label + (dec.length != null ? ` × ${dec.lengthInch ? dec.lengthInch + ' in' : dec.length + ' mm'}` : ''));
  const lc = (t) => (t ? t[0].toLowerCase() + t.slice(1) : t);
  if (dec.material && MATERIALS[dec.material]) bits.push(lc(MATERIALS[dec.material].label));
  else if (dec.material === 'steel') bits.push('steel');
  if (dec.steelClass && dec.material !== 'steel-8.8') bits.push('class ' + dec.steelClass);
  return bits.join(' · ');
}
