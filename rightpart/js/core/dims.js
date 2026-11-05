// Nominal dimensions of common fasteners, in millimetres.
// Used to draw parts at true scale (2D and 3D) and to suggest tools.
// Values follow the usual ISO/DIN tables, rounded. They are for drawing and
// guidance only: the part record's own spec always wins.

import { N_, localize, t, lower } from './i18n.js';

export const HEADS = localize({
  pan: { label: N_('Pan head'), note: N_('Rounded top with straight sides.') },
  button: { label: N_('Button head'), note: N_('Low, domed head. Neat look, low profile.') },
  socket: { label: N_('Socket cap head'), note: N_('Tall cylinder head. Takes the most torque.') },
  countersunk: { label: N_('Countersunk (flat) head'), note: N_('90° cone that sits flush. Length includes the head.') },
  cheese: { label: N_('Cheese head'), note: N_('Cylinder head with a slightly rounded top.') },
  hex: { label: N_('Hex head'), note: N_('Six flats, turned with a spanner or socket.') },
}, ['label', 'note']);

export const DRIVES = localize({
  phillips: { label: N_('Phillips (PH)'), note: N_('Cross recess. Use a PH bit.') },
  pozidriv: { label: N_('Pozidriv (PZ)'), note: N_('Cross recess plus 4 fine lines at 45°. Use a PZ bit: a PH bit slips out.') },
  torx: { label: N_('Torx (T)'), note: N_('Six-lobe star. Grips well, rarely slips.') },
  hex: { label: N_('Hex socket'), note: N_('Hexagon hole. Use a hex (Allen) key.') },
  slotted: { label: N_('Slotted'), note: N_('Single slot. Use a flat blade.') },
  external: { label: N_('External hex'), note: N_('The head itself is the hexagon. Use a spanner or socket.') },
}, ['label', 'note']);

export const MATERIALS = localize({
  'A2': { label: N_('Stainless steel A2'), note: N_('Austenitic stainless, about AISI 304. Does not rust in normal use, nearly non-magnetic.'), color: ['#E3E7EC', '#9AA3AE'], metal: true },
  'A4': { label: N_('Stainless steel A4'), note: N_('About AISI 316. Better than A2 against salt and chemicals.'), color: ['#E6E9EE', '#A0A8B3'], metal: true },
  'zinc': { label: N_('Steel, zinc plated'), note: N_('Thin zinc coating against rust, clear (silver-blue) finish. Magnetic.'), color: ['#E3EBF5', '#93A3B8'], metal: true },
  'zinc-yellow': { label: N_('Steel, yellow zinc'), note: N_('Zinc plated with a yellow passivation. Magnetic.'), color: ['#F2E5A6', '#B9A04E'], metal: true },
  'black-oxide': { label: N_('Steel, black oxide'), note: N_('Dark finish, light oil. Little rust protection.'), color: ['#5B616B', '#262A30'], metal: true },
  'steel': { label: N_('Steel'), note: N_('Carbon steel. The number after it (8.8, 10.9, 12.9) is the strength class.'), color: ['#CBD0D6', '#7D858F'], metal: true },
  'steel-8.8': { label: N_('Steel, class 8.8'), note: N_('Tensile strength 800 MPa, yield 640 MPa.'), color: ['#CBD0D6', '#7D858F'], metal: true },
  'brass': { label: N_('Brass'), note: N_('Soft, conductive, non-magnetic.'), color: ['#F3D98B', '#B8913A'], metal: true },
  'brass-ni': { label: N_('Brass, nickel plated'), note: N_('Brass with a bright nickel finish. Conductive, non-magnetic.'), color: ['#E8E6E1', '#A9A69D'], metal: true },
  'aluminium': { label: N_('Aluminium'), note: N_('Light, conductive, soft.'), color: ['#E9ECEF', '#AEB5BD'], metal: true },
  'nylon': { label: N_('Nylon (PA66)'), note: N_('Insulating plastic. Light and weak: never a substitute for metal.'), color: ['#FBF8EF', '#D8D0BC'], metal: false },
}, ['label', 'note']);

// Coarse metric pitch by nominal diameter.
export const COARSE_PITCH = { 1.6: 0.35, 2: 0.4, 2.5: 0.45, 3: 0.5, 3.5: 0.6, 4: 0.7, 5: 0.8, 6: 1.0, 8: 1.25, 10: 1.5, 12: 1.75 };

// Unified (inch) number sizes: diameter in inches = 0.060 + 0.013 * N
export const UNIFIED_TPI = {
  0: [80], 1: [64, 72], 2: [56, 64], 3: [48, 56], 4: [40, 48], 5: [40, 44], 6: [32, 40], 8: [32, 36], 10: [24, 32], 12: [24, 28],
  '1/4': [20, 28], '5/16': [18, 24], '3/8': [16, 24], '1/2': [13, 20],
};

function nearestKey(table, d) {
  let best = null;
  for (const k of Object.keys(table).map(Number)) if (best === null || Math.abs(k - d) < Math.abs(best - d)) best = k;
  return best;
}
const near = (table, d) => table[nearestKey(table, d)];

// Head size: dk = head diameter (or across flats for hex), k = head height.
const HEAD_TABLE = {
  pan: { 2: [4, 1.6], 2.5: [5, 2.1], 3: [5.6, 2.4], 3.5: [7, 2.6], 4: [8, 3.1], 5: [9.5, 3.7], 6: [12, 4.6] },
  button: { 2: [3.5, 1.1], 2.5: [4.7, 1.4], 3: [5.7, 1.65], 4: [7.6, 2.2], 5: [9.5, 2.75], 6: [10.5, 3.3] },
  socket: { 2: [3.8, 2], 2.5: [4.5, 2.5], 3: [5.5, 3], 4: [7, 4], 5: [8.5, 5], 6: [10, 6] },
  countersunk: { 2: [4.4, 1.2], 2.5: [5.5, 1.5], 3: [6.72, 1.86], 4: [8.96, 2.48], 5: [11.2, 3.1], 6: [13.44, 3.72] },
  cheese: { 2: [3.8, 1.3], 2.5: [4.5, 1.6], 3: [5.5, 2], 4: [7, 2.6], 5: [8.5, 3.3], 6: [10, 3.9] },
  hex: { 2: [4, 1.4], 2.5: [5, 1.7], 3: [5.5, 2], 4: [7, 2.8], 5: [8, 3.5], 6: [10, 4] },
};

export function headDims(head, d) {
  const t = HEAD_TABLE[head];
  if (!t) return { dk: d * 1.9, k: d * 0.7 };
  if (t[d]) return { dk: t[d][0], k: t[d][1] };
  const base = nearestKey(t, d);
  const [dk, k] = t[base];
  return { dk: (dk / base) * d, k: (k / base) * d };
}

// Hex key / bit size suggestions.
const HEX_KEY = {
  socket: { 2: '1.5', 2.5: '2', 3: '2.5', 4: '3', 5: '4', 6: '5' },
  button: { 2: '1.3', 2.5: '1.5', 3: '2', 4: '2.5', 5: '3', 6: '4' },
  countersunk: { 2: '1.3', 2.5: '1.5', 3: '2', 4: '2.5', 5: '3', 6: '4' },
};
const PH_SIZE = { 2: 'PH0', 2.5: 'PH1', 3: 'PH1', 3.5: 'PH2', 4: 'PH2', 5: 'PH2', 6: 'PH3' };
const TORX_SIZE = { 2: 'T6', 2.5: 'T8', 3: 'T10', 4: 'T20', 5: 'T25', 6: 'T30' };
const NUT_AF = { 2: 4, 2.5: 5, 3: 5.5, 4: 7, 5: 8, 6: 10, 8: 13 };
const NUT_M = { 2: 1.6, 2.5: 2, 3: 2.4, 4: 3.2, 5: 4.7, 6: 5.2, 8: 6.8 };
const NYLOC_M = { 2.5: 3.8, 3: 4, 4: 5, 5: 5, 6: 6, 8: 8 };

export function driveSize(head, drive, d) {
  if (drive === 'hex') { const k = HEX_KEY[head] || HEX_KEY.socket; return t('{size} mm hex key', { size: k[d] || near(k, d) }); }
  if (drive === 'phillips') return PH_SIZE[d] || near(PH_SIZE, d);
  if (drive === 'pozidriv') return (PH_SIZE[d] || near(PH_SIZE, d)).replace('PH', 'PZ');
  if (drive === 'torx') return TORX_SIZE[d] || near(TORX_SIZE, d);
  if (drive === 'external') return t('{size} mm spanner', { size: headDims('hex', d).dk });
  if (drive === 'slotted') return t('Flat blade {size} mm', { size: d <= 3 ? '0.5 × 3' : '0.8 × 4' });
  return '';
}

export function nutDims(d, variant) {
  const af = NUT_AF[d] || near(NUT_AF, d);
  const m = variant === 'nyloc' ? (NYLOC_M[d] || near(NYLOC_M, d)) : (NUT_M[d] || near(NUT_M, d));
  return { af, m };
}

const WASHER = {
  flat: { 2: [2.2, 5, 0.3], 2.5: [2.7, 6, 0.5], 3: [3.2, 7, 0.5], 4: [4.3, 9, 0.8], 5: [5.3, 10, 1], 6: [6.4, 12, 1.6] },
  'star-ext': { 2.5: [2.7, 5.5, 0.3], 3: [3.2, 6, 0.4], 4: [4.3, 8, 0.5], 5: [5.3, 10, 0.6], 6: [6.4, 11, 0.7] },
  'star-int': { 2.5: [2.7, 5.5, 0.3], 3: [3.2, 6, 0.4], 4: [4.3, 8, 0.5], 5: [5.3, 10, 0.6], 6: [6.4, 11, 0.7] },
  split: { 2.5: [2.6, 5.1, 0.6], 3: [3.1, 6.2, 0.8], 4: [4.1, 7.6, 0.9], 5: [5.1, 9.2, 1.2], 6: [6.1, 11.8, 1.6] },
};

export function washerDims(d, variant = 'flat') {
  const t = WASHER[variant] || WASHER.flat;
  const [id, od, t2] = t[d] || near(t, d);
  return { id, od, t: t2 };
}

export function coarsePitch(d) {
  return COARSE_PITCH[d] ?? near(COARSE_PITCH, d);
}

export const FASTENER_CATEGORIES = ['screw', 'nut', 'washer', 'standoff'];
export const isFastener = (p) => !!p && FASTENER_CATEGORIES.includes(p.category);

export const CATEGORY_LABELS = localize({
  screw: N_('Screw'), nut: N_('Nut'), washer: N_('Washer'), standoff: N_('Standoff'), mechanical: N_('Mechanical part'),
  pcb: N_('Circuit board'), electrical: N_('Electrical part'), cable: N_('Cable'), consumable: N_('Consumable'), label: N_('Label'), module: N_('Module'),
});

/** Plural category names for running text ("these screws"). */
export const CATEGORY_PLURALS = localize({
  screw: N_('screws'), nut: N_('nuts'), washer: N_('washers'), standoff: N_('standoffs'),
});

export function materialLabel(code) {
  return MATERIALS[code]?.label || code || '';
}

// "M3", "4-40 UNC", or the thread string stored on the part.
export function threadLabel(spec) {
  if (!spec) return '';
  if (spec.thread) return spec.thread;
  if (spec.d) return 'M' + spec.d;
  return '';
}

/** "M3 × 8", "#4-40 UNC × 1/4 in", "M4" */
export function sizeLabel(p) {
  const s = p?.spec || {};
  const th = s.thread || (s.d ? 'M' + s.d : '');
  if (!th) return '';
  if (s.length != null && (p.category === 'screw' || p.category === 'standoff')) return `${th} × ${s.lengthLabel || s.length}`;
  return th;
}

/** Drive name for running text: "hex socket", "Phillips (PH)". */
export function driveWord(d) {
  const l = DRIVES[d]?.label || d || '';
  return ['hex', 'slotted', 'external'].includes(d) ? lower(l) : l;
}

export function fmtMm(v) {
  if (v == null || isNaN(v)) return '';
  return Math.round(v * 100) / 100 + ' mm';
}
