// Signal marks: character displacement.
// Where two similar species live side by side, they evolve to look more different than where they
// live apart (Brown and Wilson, 1956; Darwin's finches on Daphne Major). RightPart does the same for
// bins: parts that look alike, or that people have really confused, and that are used in the same
// device get marks that differ in colour AND shape. Parts that never meet on a bench may share a mark.
// Colour and shape together, like a warning sign: a colour-blind worker still has the shape, and a
// shape is matched without reading a word in any language. The scan stays the check; the mark gets
// the hand to the right bin first.
// Pure functions: the library index in, one mark per part out.

import { compareParts, LOOKALIKE_MIN } from './lookalike.js';
import { isFastener } from './dims.js';
import { localize, N_ } from './i18n.js';

/** Okabe–Ito colours: told apart with every common kind of colour blindness. `ink` is readable on top. */
export const COLORS = [
  { id: 'black', hex: '#000000', ink: '#ffffff' },
  { id: 'orange', hex: '#E69F00', ink: '#000000' },
  { id: 'sky', hex: '#56B4E9', ink: '#000000' },
  { id: 'green', hex: '#009E73', ink: '#ffffff' },
  { id: 'yellow', hex: '#F0E442', ink: '#000000' },
  { id: 'blue', hex: '#0072B2', ink: '#ffffff' },
  { id: 'red', hex: '#D55E00', ink: '#ffffff' },
  { id: 'pink', hex: '#CC79A7', ink: '#000000' },
];
export const SHAPES = ['circle', 'triangle', 'square', 'diamond', 'hexagon', 'star'];

export const COLOR_NAMES = localize({
  black: { label: N_('color::black') }, orange: { label: N_('color::orange') }, sky: { label: N_('color::sky blue') }, green: { label: N_('color::green') },
  yellow: { label: N_('color::yellow') }, blue: { label: N_('color::dark blue') }, red: { label: N_('color::red') }, pink: { label: N_('color::pink') },
}, ['label']);
export const SHAPE_NAMES = localize({
  circle: { label: N_('shape::circle') }, triangle: { label: N_('shape::triangle') }, square: { label: N_('shape::square') },
  diamond: { label: N_('shape::diamond') }, hexagon: { label: N_('shape::hexagon') }, star: { label: N_('shape::star') },
}, ['label']);

const colorOf = (id) => COLORS.find((c) => c.id === id) || COLORS[0];
const valid = (m) => m && COLORS.some((c) => c.id === m.color) && SHAPES.includes(m.shape);

/** The parts each device uses (steps and BOM): the parts that share a bench. */
export function habitats(index) {
  return [...index.devices.values()].map((dev) => {
    const ids = new Set();
    for (const [id, uses] of index.usage) if (uses.some((u) => u.deviceId === dev.id)) ids.add(id);
    for (const [id, uses] of index.bomUsage) if (uses.some((u) => u.deviceId === dev.id)) ids.add(id);
    return ids;
  });
}

/**
 * Which parts must be told apart: pairs used in the same device that look alike, and pairs that
 * were really confused at a bench (a confusion proves the two bins met, wherever they are listed).
 * Returns Map("a|b" -> weight); a confusion outweighs any likeness.
 */
export function rivalries(index, confused = new Map()) {
  const edges = new Map();
  const add = (a, b, w) => { const k = [a, b].sort().join('|'); edges.set(k, Math.max(edges.get(k) || 0, w)); };
  for (const ids of habitats(index)) {
    const parts = [...ids].map((id) => index.parts.get(id)).filter((p) => p && isFastener(p)).sort((a, b) => a.id.localeCompare(b.id));
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        const s = compareParts(parts[i], parts[j]).score;
        if (s >= LOOKALIKE_MIN) add(parts[i].id, parts[j].id, s);
      }
    }
  }
  for (const [k, times] of confused) {
    const [a, b] = k.split('|');
    if (a !== b && index.parts.has(a) && index.parts.has(b)) add(a, b, 1 + Math.min(times, 8) * 0.25);
  }
  return edges;
}

/**
 * One mark per part that has a rival: { partId -> { color, shape, locked } }, plus the pairs that
 * still share a colour or a shape. Locked marks (already printed on labels) never move.
 * Deterministic: the same library gives the same marks.
 */
export function assignSignals(index, { locked = {}, confused = new Map() } = {}) {
  const edges = rivalries(index, confused);
  const nbr = new Map();
  for (const [k, w] of edges) {
    const [a, b] = k.split('|');
    if (!nbr.has(a)) nbr.set(a, new Map());
    if (!nbr.has(b)) nbr.set(b, new Map());
    nbr.get(a).set(b, w);
    nbr.get(b).set(a, w);
  }
  const marks = new Map();
  const uses = new Map();
  const use = (m) => uses.set(`${m.color}/${m.shape}`, (uses.get(`${m.color}/${m.shape}`) || 0) + 1);
  for (const [id, m] of Object.entries(locked || {})) {
    if (index.parts.has(id) && valid(m)) { marks.set(id, { color: m.color, shape: m.shape, locked: true }); use(m); }
  }
  // Parts on the same bench should not wear the very same mark either, rivals or not.
  const benches = habitats(index);
  const benchmates = (id) => benches.filter((h) => h.has(id)).flatMap((h) => [...h]).filter((x) => x !== id);
  const strength = (id) => [...(nbr.get(id)?.values() || [])].reduce((s, w) => s + w, 0);
  const order = [...nbr.keys()].filter((id) => !marks.has(id)).sort((a, b) => strength(b) - strength(a) || a.localeCompare(b));
  for (const id of order) {
    let best = null;
    for (const c of COLORS) {
      for (const shape of SHAPES) {
        let cost = 0;
        for (const [other, w] of nbr.get(id)) {
          const m = marks.get(other);
          if (!m) continue;
          const sc = m.color === c.id, ss = m.shape === shape;
          cost += w * ((sc ? 1 : 0) + (ss ? 1 : 0) + (sc && ss ? 10 : 0));
        }
        for (const other of benchmates(id)) {
          const m = marks.get(other);
          if (m) cost += (m.color === c.id ? 0.01 : 0) + (m.shape === shape ? 0.01 : 0) + (m.color === c.id && m.shape === shape ? 0.05 : 0);
        }
        cost += 0.001 * (uses.get(`${c.id}/${shape}`) || 0); // spread marks over the library
        if (!best || cost < best.cost - 1e-9) best = { cost, color: c.id, shape };
      }
    }
    const m = { color: best.color, shape: best.shape, locked: false };
    marks.set(id, m);
    use(m);
  }
  const clashes = [];
  for (const [k, w] of edges) {
    const [a, b] = k.split('|');
    const ma = marks.get(a), mb = marks.get(b);
    if (!ma || !mb) continue;
    const same = ma.color === mb.color && ma.shape === mb.shape ? 'both' : ma.color === mb.color ? 'color' : ma.shape === mb.shape ? 'shape' : null;
    if (same) clashes.push({ a, b, same, weight: w });
  }
  clashes.sort((x, y) => y.weight - x.weight);
  return { marks, clashes, rivals: nbr };
}

/** The words for a mark, e.g. "orange triangle" (word order is the translator's). */
export function markName(m, t) {
  if (!m) return '';
  return t('{color} {shape}', { color: COLOR_NAMES[m.color]?.label || m.color, shape: SHAPE_NAMES[m.shape]?.label || m.shape });
}

function shapePath(shape, s) {
  const c = s / 2, r = s * 0.42;
  const poly = (pts) => `M${pts.map(([x, y]) => `${(c + x).toFixed(2)} ${(c + y).toFixed(2)}`).join('L')}Z`;
  const ring = (n, rad, rot = -Math.PI / 2) => Array.from({ length: n }, (_, i) => [rad * Math.cos(rot + (i * 2 * Math.PI) / n), rad * Math.sin(rot + (i * 2 * Math.PI) / n)]);
  switch (shape) {
    case 'circle': return `M${c - r} ${c}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
    case 'triangle': return poly(ring(3, r * 1.12).map(([x, y]) => [x, y + r * 0.14]));
    case 'square': return poly([[-r * 0.86, -r * 0.86], [r * 0.86, -r * 0.86], [r * 0.86, r * 0.86], [-r * 0.86, r * 0.86]]);
    case 'diamond': return poly([[0, -r * 1.12], [r * 0.9, 0], [0, r * 1.12], [-r * 0.9, 0]]);
    case 'hexagon': return poly(ring(6, r * 1.02, 0));
    case 'star': return poly(Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5; const rad = i % 2 ? r * 0.5 : r * 1.12; return [rad * Math.cos(a), rad * Math.sin(a)]; }));
    default: return '';
  }
}

/**
 * The mark as SVG markup: a filled shape with a dark outline and a white halo, so every colour
 * stands out on white paper, on a grey bin and in dark mode. `title` names it for screen readers.
 */
export function markSVG(m, { size = 24, title = '' } = {}) {
  if (!m) return '';
  const s = 48; // drawn on a 48-unit grid, scaled to `size`
  const d = shapePath(m.shape, s);
  const fill = colorOf(m.color).hex;
  const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const label = title ? `role="img" aria-label="${esc(title)}"` : 'aria-hidden="true"';
  return `<svg class="mark" viewBox="0 0 ${s} ${s}" width="${size}" height="${size}" ${label} data-mark="${esc(m.color)}-${esc(m.shape)}">${title ? `<title>${esc(title)}</title>` : ''}<path d="${d}" fill="none" stroke="#fff" stroke-width="7" stroke-linejoin="round"/><path d="${d}" fill="${fill}" stroke="#111" stroke-width="3" stroke-linejoin="round"/></svg>`;
}
