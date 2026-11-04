// Parametric drawings: every fastener is drawn from its own spec (head, drive, thread, length),
// so the picture can never disagree with the data. At "actual" size, 1 mm on the drawing is
// 1 mm on a calibrated screen; in "print" mode it is 1 mm on paper.

import { headDims, nutDims, washerDims, MATERIALS, isFastener } from './core/dims.js';

let uid = 0;
const f = (n) => Math.round(n * 1000) / 1000;

function gradient(id, material, vertical = true) {
  const [light, dark] = MATERIALS[material]?.color || ['#D9DEE4', '#8C95A1'];
  const dir = vertical ? 'x1="0" y1="0" x2="0" y2="1"' : 'x1="0" y1="0" x2="1" y2="0"';
  return `<linearGradient id="${id}" ${dir}><stop offset="0" stop-color="${dark}"/><stop offset=".32" stop-color="${light}"/><stop offset=".55" stop-color="${light}" stop-opacity=".92"/><stop offset="1" stop-color="${dark}"/></linearGradient>`;
}
function radial(id, material) {
  const [light, dark] = MATERIALS[material]?.color || ['#D9DEE4', '#8C95A1'];
  return `<radialGradient id="${id}" cx=".38" cy=".34" r=".75"><stop offset="0" stop-color="${light}"/><stop offset=".7" stop-color="${light}" stop-opacity=".85"/><stop offset="1" stop-color="${dark}"/></radialGradient>`;
}

const S = 'vector-effect="non-scaling-stroke"';
const line = (cls = 'o') => `class="${cls}" ${S}`;

// ---------- Geometry builders (mm, side view horizontal: bearing face at x = 0) ----------

function headPath(head, dk, k, d) {
  const r = dk / 2;
  switch (head) {
    case 'button':
      return `M0 ${-r} C ${-k * 0.78} ${-r} ${-k} ${-r * 0.42} ${-k} 0 C ${-k} ${r * 0.42} ${-k * 0.78} ${r} 0 ${r} Z`;
    case 'socket':
      return `M0 ${-r} L ${-k * 0.9} ${-r} L ${-k} ${-r * 0.86} L ${-k} ${r * 0.86} L ${-k * 0.9} ${r} L 0 ${r} Z`;
    case 'countersunk':
      return `M0 ${-d / 2} L ${-k} ${-r} L ${-k} ${r} L 0 ${d / 2} Z`;
    case 'cheese':
      return `M0 ${-r} L ${-k * 0.82} ${-r} Q ${-k} ${-r} ${-k} ${-r * 0.78} L ${-k} ${r * 0.78} Q ${-k} ${r} ${-k * 0.82} ${r} L 0 ${r} Z`;
    case 'hex': {
      const e = dk * 1.1547 / 2;
      return `M0 ${-e} L ${-k} ${-e} L ${-k} ${e} L 0 ${e} Z`;
    }
    case 'pan':
    default:
      return `M0 ${-r} L ${-k * 0.5} ${-r * 0.97} C ${-k * 0.93} ${-r * 0.9} ${-k} ${-r * 0.6} ${-k} ${-r * 0.32} L ${-k} ${r * 0.32} C ${-k} ${r * 0.6} ${-k * 0.93} ${r * 0.9} ${-k * 0.5} ${r * 0.97} L 0 ${r} Z`;
  }
}

function threadLines(x0, x1, d, p) {
  if (!p || x1 - x0 < p) return '';
  let s = '';
  const r = d / 2;
  const n = Math.min(400, Math.floor((x1 - x0 - p * 0.5) / p));
  for (let i = 0; i <= n; i++) {
    const x = x0 + p * 0.25 + i * p;
    if (x + p * 0.5 > x1) break;
    s += `M${f(x)} ${f(-r)}L${f(x + p * 0.5)} ${f(r)}`;
  }
  return `<path d="${s}" class="th" ${S}/>`;
}

function screwSide(sp, gid, ghost = false) {
  const d = sp.d || 3;
  const head = sp.head || 'pan';
  const { dk, k } = headDims(head, d);
  const cs = head === 'countersunk';
  const L = sp.length || d * 2;
  const shankStart = 0;
  const shankEnd = cs ? L - k : L;
  const c = Math.min((sp.pitch || d * 0.15) * 0.6, d * 0.2);
  const r = d / 2;
  const shank = `M${shankStart} ${-r} L${f(shankEnd - c)} ${-r} L${f(shankEnd)} ${f(-r + c)} L${f(shankEnd)} ${f(r - c)} L${f(shankEnd - c)} ${r} L${shankStart} ${r} Z`;
  const headD = headPath(head, dk, k, d);
  const bounds = { x0: -k, x1: shankEnd, y0: -Math.max(dk / 2, head === 'hex' ? dk * 0.577 : 0), y1: Math.max(dk / 2, head === 'hex' ? dk * 0.577 : 0) };
  if (ghost) return { svg: `<path d="${headD}" class="ghost" ${S}/><path d="${shank}" class="ghost" ${S}/>`, bounds, lengthFrom: cs ? -k : 0, lengthTo: shankEnd };
  let extra = '';
  if (head === 'hex') {
    const e = dk * 1.1547 / 2;
    extra = `<path d="M0 ${f(-e / 2)}L${-k} ${f(-e / 2)}M0 ${f(e / 2)}L${-k} ${f(e / 2)}" class="o thin" ${S}/>`;
  }
  if (sp.drive === 'hex' && head !== 'countersunk') {
    const s = parseFloat(sp.driveSize) || d * 0.66;
    const depth = Math.min(k * 0.62, s * 0.9);
    extra += `<path d="M${-k} ${f(-s / 2)}L${f(-k + depth)} ${f(-s / 2)}L${f(-k + depth + s * 0.25)} 0L${f(-k + depth)} ${f(s / 2)}L${-k} ${f(s / 2)}" class="hid" ${S}/>`;
  }
  const svg = `<path d="${shank}" fill="url(#${gid})" ${line()}/>${threadLines(shankStart + c, shankEnd - c, d, sp.pitch)}<path d="${headD}" fill="url(#${gid})" ${line()}/>${extra}`;
  return { svg, bounds, lengthFrom: cs ? -k : 0, lengthTo: shankEnd, headX: -k };
}

function hexagon(cx, cy, af, rot = 0) {
  const R = af / Math.sqrt(3);
  let s = '';
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + rot;
    s += `${i ? 'L' : 'M'}${f(cx + R * Math.cos(a))} ${f(cy + R * Math.sin(a))}`;
  }
  return s + 'Z';
}

function driveShape(drive, cx, cy, dk, size) {
  const r = dk / 2;
  const cls = 'recess';
  if (drive === 'phillips' || drive === 'pozidriv') {
    const a = r * 0.62, w = r * 0.17;
    let s = `<path d="M${f(cx - a)} ${f(cy - w)}L${f(cx - w)} ${f(cy - w)}L${f(cx - w)} ${f(cy - a)}L${f(cx + w)} ${f(cy - a)}L${f(cx + w)} ${f(cy - w)}L${f(cx + a)} ${f(cy - w)}L${f(cx + a)} ${f(cy + w)}L${f(cx + w)} ${f(cy + w)}L${f(cx + w)} ${f(cy + a)}L${f(cx - w)} ${f(cy + a)}L${f(cx - w)} ${f(cy + w)}L${f(cx - a)} ${f(cy + w)}Z" class="${cls}" ${S}/>`;
    if (drive === 'pozidriv') {
      let t = '';
      for (let i = 0; i < 4; i++) {
        const ang = Math.PI / 4 + (i * Math.PI) / 2;
        t += `M${f(cx + Math.cos(ang) * w * 1.6)} ${f(cy + Math.sin(ang) * w * 1.6)}L${f(cx + Math.cos(ang) * a * 0.72)} ${f(cy + Math.sin(ang) * a * 0.72)}`;
      }
      s += `<path d="${t}" class="tick" ${S}/>`;
    }
    return s;
  }
  if (drive === 'torx') {
    const R = r * 0.5, ri = r * 0.34;
    let s = '';
    for (let i = 0; i <= 72; i++) {
      const t = (i / 72) * Math.PI * 2;
      const rr = (R + ri) / 2 + ((R - ri) / 2) * Math.cos(6 * t);
      s += `${i ? 'L' : 'M'}${f(cx + rr * Math.cos(t))} ${f(cy + rr * Math.sin(t))}`;
    }
    return `<path d="${s}Z" class="${cls}" ${S}/>`;
  }
  if (drive === 'hex') {
    const s = parseFloat(size) || r * 0.7;
    return `<path d="${hexagon(cx, cy, Math.min(s, r * 1.5), Math.PI / 6)}" class="${cls}" ${S}/>`;
  }
  if (drive === 'slotted') {
    const w = r * 0.2;
    return `<path d="M${f(cx - r * 0.98)} ${f(cy - w / 2)}h${f(r * 1.96)}v${f(w)}h${f(-r * 1.96)}Z" class="${cls}" ${S}/>`;
  }
  return '';
}

function screwTop(sp, cx, rid) {
  const d = sp.d || 3;
  const head = sp.head || 'pan';
  const { dk } = headDims(head, d);
  let body;
  if (head === 'hex') body = `<path d="${hexagon(cx, 0, dk)}" fill="url(#${rid})" ${line()}/>`;
  else body = `<circle cx="${f(cx)}" cy="0" r="${f(dk / 2)}" fill="url(#${rid})" ${line()}/>`;
  const rings = head === 'socket' ? `<circle cx="${f(cx)}" cy="0" r="${f(dk / 2 * 0.86)}" class="o thin" fill="none" ${S}/>` : '';
  const ext = head === 'hex' ? Math.max(dk * 0.577, dk / 2) : dk / 2;
  return { svg: body + rings + driveShape(sp.drive, cx, 0, dk, sp.driveSize), r: ext };
}

function nutSide(sp, gid) {
  const d = sp.d || 3;
  const { af, m } = nutDims(d, sp.variant);
  const s = sp.af || af, h = sp.m || m;
  const e = s * 1.1547 / 2;
  const insert = sp.variant === 'nyloc' ? h * 0.3 : 0;
  const metal = h - insert;
  let svg = `<path d="M0 ${f(-e)}L${f(metal)} ${f(-e)}L${f(metal)} ${f(e)}L0 ${f(e)}Z" fill="url(#${gid})" ${line()}/>`;
  svg += `<path d="M0 ${f(-e / 2)}L${f(metal)} ${f(-e / 2)}M0 ${f(e / 2)}L${f(metal)} ${f(e / 2)}" class="o thin" ${S}/>`;
  if (insert) svg += `<path d="M${f(metal)} ${f(-e * 0.8)}L${f(h)} ${f(-e * 0.6)}L${f(h)} ${f(e * 0.6)}L${f(metal)} ${f(e * 0.8)}Z" fill="url(#${gid})" ${line()}/><rect x="${f(metal + insert * 0.15)}" y="${f(-e * 0.55)}" width="${f(insert * 0.7)}" height="${f(e * 1.1)}" class="nylon" ${S}/>`;
  svg += `<path d="M0 ${f(-d / 2)}L${f(h)} ${f(-d / 2)}M0 ${f(d / 2)}L${f(h)} ${f(d / 2)}" class="hid" ${S}/>`;
  return { svg, bounds: { x0: 0, x1: h, y0: -e, y1: e } };
}

function nutTop(sp, cx, rid) {
  const d = sp.d || 3;
  const { af } = nutDims(d, sp.variant);
  const s = sp.af || af;
  let svg = `<path d="${hexagon(cx, 0, s)}" fill="url(#${rid})" ${line()}/>`;
  svg += `<circle cx="${f(cx)}" cy="0" r="${f(s * 0.45)}" class="o thin" fill="none" ${S}/>`;
  if (sp.variant === 'nyloc') svg += `<circle cx="${f(cx)}" cy="0" r="${f(d * 0.62)}" class="nylon" ${S}/>`;
  svg += `<circle cx="${f(cx)}" cy="0" r="${f(d / 2)}" class="hole" ${S}/><circle cx="${f(cx)}" cy="0" r="${f(d / 2 * 0.82)}" class="hid" fill="none" ${S}/>`;
  return { svg, r: s * 0.577 };
}

function washerTop(sp, cx, rid) {
  const d = sp.d || 3;
  const dims = washerDims(d, sp.variant);
  const id = sp.id || dims.id, od = sp.od || dims.od;
  const v = sp.variant || 'flat';
  let svg = '';
  if (v === 'star-ext' || v === 'star-int') {
    const teeth = od > 7 ? 9 : 8;
    const outer = v === 'star-ext';
    const R1 = outer ? od / 2 : od / 2;
    const R0 = outer ? od / 2 * 0.72 : od / 2;
    const ri1 = outer ? id / 2 : id / 2 * 1.45;
    const ri0 = id / 2;
    let p = '';
    const N = teeth * 2;
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
      const R = outer ? (i % 2 ? R0 : R1) : R1;
      p += `${i ? 'L' : 'M'}${f(cx + R * Math.cos(a0))} ${f(R * Math.sin(a0))}L${f(cx + R * Math.cos(a1 - 0.05))} ${f(R * Math.sin(a1 - 0.05))}`;
    }
    p += 'Z';
    let h = '';
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
      const r = outer ? ri0 : (i % 2 ? ri1 : ri0);
      h += `${i ? 'L' : 'M'}${f(cx + r * Math.cos(a1))} ${f(r * Math.sin(a1))}L${f(cx + r * Math.cos(a0 + 0.05))} ${f(r * Math.sin(a0 + 0.05))}`;
    }
    svg = `<path d="${p} ${h}Z" fill="url(#${rid})" fill-rule="evenodd" ${line()}/>`;
  } else if (v === 'split') {
    const gap = 0.16;
    const a0 = gap, a1 = Math.PI * 2 - gap;
    const ro = od / 2, ri = id / 2;
    const pt = (r, a) => `${f(cx + r * Math.cos(a))} ${f(r * Math.sin(a))}`;
    svg = `<path d="M${pt(ro, a0)} A${f(ro)} ${f(ro)} 0 1 1 ${pt(ro, a1)} L${pt(ri, a1)} A${f(ri)} ${f(ri)} 0 1 0 ${pt(ri, a0)}Z" fill="url(#${rid})" ${line()}/>`;
  } else {
    svg = `<path d="M${f(cx - od / 2)} 0a${f(od / 2)} ${f(od / 2)} 0 1 0 ${f(od)} 0a${f(od / 2)} ${f(od / 2)} 0 1 0 ${f(-od)} 0ZM${f(cx - id / 2)} 0a${f(id / 2)} ${f(id / 2)} 0 1 1 ${f(id)} 0a${f(id / 2)} ${f(id / 2)} 0 1 1 ${f(-id)} 0Z" fill="url(#${rid})" fill-rule="evenodd" ${line()}/>`;
  }
  return { svg, r: od / 2, id, od };
}

function washerSide(sp, gid) {
  const d = sp.d || 3;
  const dims = washerDims(d, sp.variant);
  const id = sp.id || dims.id, od = sp.od || dims.od, t = sp.t || dims.t;
  let svg = `<path d="M0 ${f(-od / 2)}L${f(t)} ${f(-od / 2)}L${f(t)} ${f(od / 2)}L0 ${f(od / 2)}Z" fill="url(#${gid})" ${line()}/>`;
  svg += `<path d="M0 ${f(-id / 2)}L${f(t)} ${f(-id / 2)}M0 ${f(id / 2)}L${f(t)} ${f(id / 2)}" class="hid" ${S}/>`;
  return { svg, bounds: { x0: 0, x1: t, y0: -od / 2, y1: od / 2 }, t };
}

function standoffSide(sp, gid) {
  const d = sp.d || 3;
  const s = sp.af || 5.5;
  const e = s * 1.1547 / 2;
  const L = sp.length || 10;
  const male = sp.gender === 'F-F' ? 0 : sp.maleLength || 6;
  const r = d / 2;
  let svg = `<path d="M0 ${f(-e)}L${f(L)} ${f(-e)}L${f(L)} ${f(e)}L0 ${f(e)}Z" fill="url(#${gid})" ${line()}/>`;
  svg += `<path d="M0 ${f(-e / 2)}L${f(L)} ${f(-e / 2)}M0 ${f(e / 2)}L${f(L)} ${f(e / 2)}" class="o thin" ${S}/>`;
  svg += `<path d="M0 ${f(-r)}L${f(Math.min(L, 6))} ${f(-r)}M0 ${f(r)}L${f(Math.min(L, 6))} ${f(r)}" class="hid" ${S}/>`;
  if (male) {
    const c = 0.3;
    svg += `<path d="M${f(L)} ${f(-r)}L${f(L + male - c)} ${f(-r)}L${f(L + male)} ${f(-r + c)}L${f(L + male)} ${f(r - c)}L${f(L + male - c)} ${f(r)}L${f(L)} ${f(r)}Z" fill="url(#${gid})" ${line()}/>${threadLines(L + 0.2, L + male - c, d, sp.pitch || 0.5)}`;
  }
  return { svg, bounds: { x0: 0, x1: L + male, y0: -e, y1: e }, L, male };
}

function standoffTop(sp, cx, rid) {
  const d = sp.d || 3;
  const s = sp.af || 5.5;
  return { svg: `<path d="${hexagon(cx, 0, s)}" fill="url(#${rid})" ${line()}/><circle cx="${f(cx)}" cy="0" r="${f(d / 2)}" class="hole" ${S}/>`, r: s * 0.577 };
}

// ---------- Generic pictures for non-fasteners (not to scale) ----------
function genericIcon(part) {
  const n = `${part.name} ${part.category}`.toLowerCase();
  const W = 100, H = 70;
  let body;
  if (/fan/.test(n)) {
    body = `<rect x="18" y="3" width="64" height="64" rx="8" class="gen-a"/><circle cx="50" cy="35" r="27" class="gen-b"/><circle cx="50" cy="35" r="9" class="gen-c"/>` +
      [0, 72, 144, 216, 288].map((a) => `<path d="M50 35 q 14 -6 22 4 q -10 6 -22 -4z" class="gen-c" transform="rotate(${a} 50 35)"/>`).join('') +
      [[24, 9], [76, 9], [24, 61], [76, 61]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.4" class="gen-hole"/>`).join('');
  } else if (/earth wire|ground/.test(n)) {
    body = `<path d="M8 40 C 30 10, 55 60, 76 34" class="gen-pe"/><path d="M8 40 C 30 10, 55 60, 76 34" class="gen-pe2"/><circle cx="84" cy="30" r="8" class="gen-a"/><circle cx="84" cy="30" r="3.4" class="gen-hole"/>`;
  } else if (part.category === 'cable') {
    body = `<rect x="10" y="26" width="80" height="18" rx="2" class="gen-ffc"/><rect x="6" y="24" width="12" height="22" rx="1.5" class="gen-chip"/><rect x="82" y="24" width="12" height="22" rx="1.5" class="gen-chip"/>`;
  } else if (/display/.test(n)) {
    body = `<rect x="6" y="8" width="88" height="56" rx="5" class="gen-a"/><rect x="12" y="13" width="76" height="44" rx="2" class="gen-screen"/><path d="M20 22h30M20 30h44M20 38h24" class="gen-line"/>`;
  } else if (/power supply/.test(n)) {
    body = `<rect x="8" y="12" width="84" height="48" rx="4" class="gen-a"/>` + Array.from({ length: 9 }, (_, i) => `<rect x="${16 + i * 7.5}" y="20" width="3.5" height="20" rx="1.5" class="gen-hole"/>`).join('') + `<rect x="66" y="45" width="20" height="9" rx="2" class="gen-c"/>`;
  } else if (part.category === 'pcb') {
    body = `<rect x="6" y="8" width="88" height="56" rx="4" class="gen-pcb"/><rect x="30" y="22" width="22" height="22" rx="2" class="gen-chip"/><rect x="62" y="16" width="14" height="10" rx="1.5" class="gen-chip"/><rect x="62" y="34" width="22" height="7" rx="1" class="gen-conn"/><rect x="12" y="48" width="14" height="8" rx="1" class="gen-conn"/>` +
      [[12, 14], [88, 14], [12, 58], [88, 58]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" class="gen-hole"/>`).join('');
  } else if (/cable tie/.test(n)) {
    body = `<path d="M10 52 C 30 20, 70 20, 88 30" class="gen-strip"/><rect x="6" y="46" width="12" height="12" rx="2" class="gen-c"/>`;
  } else if (/threadlocker|seal|lacquer/.test(n)) {
    body = `<path d="M38 64 h24 v-34 l-6 -8 v-10 h-12 v10 l-6 8 z" class="${/threadlocker/.test(n) ? 'gen-purple' : 'gen-orange'}"/><rect x="44" y="4" width="12" height="9" rx="2" class="gen-c"/>`;
  } else if (part.category === 'label') {
    body = `<rect x="8" y="14" width="84" height="44" rx="3" class="gen-label"/><path d="M14 24h40M14 32h30M14 40h36" class="gen-line2"/>` + Array.from({ length: 12 }, (_, i) => `<rect x="${62 + i * 2.2}" y="34" width="${i % 3 ? 1 : 1.6}" height="16" fill="#111"/>`).join('');
  } else if (/bezel/.test(n)) {
    body = `<rect x="6" y="8" width="88" height="56" rx="4" class="gen-dark"/><rect x="20" y="16" width="60" height="40" rx="2" class="gen-screen"/>` + [[12, 14], [88, 14], [12, 36], [88, 36], [12, 58], [88, 58]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2" class="gen-hole"/>`).join('');
  } else if (/cover/.test(n)) {
    body = `<path d="M8 62 V18 a6 6 0 0 1 6 -6 h72 a6 6 0 0 1 6 6 V62" class="gen-sheet"/>`;
  } else {
    body = `<path d="M8 58 h84 v-6 h-70 v-40 h-14 z" class="gen-sheet"/><circle cx="15" cy="22" r="2.6" class="gen-hole"/><circle cx="60" cy="55" r="2" class="gen-hole"/>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="pdraw generic" role="img" aria-label="${escAttr(part.name)} (illustration, not to scale)">${body}</svg>`;
}

// Drawing styles. The app loads the same rules from css/app.css; STYLE is embedded only in standalone SVGs.
const STYLE = `<style>
.pdraw .o{stroke:var(--draw-line,#2E3A48);stroke-width:1.2;fill-opacity:1}
.pdraw .o.thin{stroke-width:.7;opacity:.7}
.pdraw .th{stroke:var(--draw-line,#2E3A48);stroke-width:.7;opacity:.55;fill:none}
.pdraw .hid{stroke:var(--draw-line,#2E3A48);stroke-width:.8;stroke-dasharray:3 2;opacity:.55;fill:none}
.pdraw .recess{fill:#1f2630;fill-opacity:.82;stroke:var(--draw-line,#2E3A48);stroke-width:.8}
.pdraw .tick{stroke:#1f2630;stroke-width:1.1;opacity:.85}
.pdraw .hole{fill:var(--surface,#fff);stroke:var(--draw-line,#2E3A48);stroke-width:1}
.pdraw .nylon{fill:#5B8DEF;fill-opacity:.55;stroke:#3466c9;stroke-width:.8}
.pdraw .ghost{fill:none;stroke:var(--warn,#9A5800);stroke-width:1.6;stroke-dasharray:5 3}
.pdraw .dim{stroke:var(--draw-dim,#1D5BD8);stroke-width:1;fill:none}
.pdraw .ext{stroke:var(--draw-dim,#1D5BD8);stroke-width:.7;opacity:.6;fill:none}
.pdraw text{fill:var(--draw-dim,#1D5BD8);font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;font-weight:650}
.pdraw text.cap{fill:var(--text-3,#66727F);font-weight:600}
.pdraw text.gh{fill:var(--warn,#9A5800)}
.pdraw .gen-a{fill:#cfd5dd;stroke:#56606c;stroke-width:1.4}
.pdraw .gen-b{fill:#2b3138;stroke:#56606c;stroke-width:1}
.pdraw .gen-c{fill:#8b95a1;stroke:#45505c;stroke-width:1}
.pdraw .gen-hole{fill:var(--surface,#fff);stroke:#56606c;stroke-width:1}
.pdraw .gen-screen{fill:#1b2a3a;stroke:#0e1621;stroke-width:1}
.pdraw .gen-line{stroke:#5fa8ff;stroke-width:3;stroke-linecap:round;opacity:.8}
.pdraw .gen-line2{stroke:#333;stroke-width:3;stroke-linecap:round}
.pdraw .gen-pcb{fill:#1f7a4d;stroke:#0f4d2f;stroke-width:1.4}
.pdraw .gen-chip{fill:#20252b;stroke:#0b0e11;stroke-width:1}
.pdraw .gen-conn{fill:#f3f0e6;stroke:#9c9686;stroke-width:1}
.pdraw .gen-strip{fill:none;stroke:#e9e4d6;stroke-width:6;stroke-linecap:round}
.pdraw .gen-pe{fill:none;stroke:#1F9D55;stroke-width:6;stroke-linecap:round}
.pdraw .gen-pe2{fill:none;stroke:#E9C21B;stroke-width:6;stroke-dasharray:6 10;stroke-linecap:butt}
.pdraw .gen-ffc{fill:#d1ad66;stroke:#8d6d2c;stroke-width:1}
.pdraw .gen-purple{fill:#7d4bc9;stroke:#4b2a82;stroke-width:1.4}
.pdraw .gen-orange{fill:#f08a24;stroke:#a85710;stroke-width:1.4}
.pdraw .gen-label{fill:#fff;stroke:#555;stroke-width:1.2}
.pdraw .gen-dark{fill:#2a2f36;stroke:#111;stroke-width:1.2}
.pdraw .gen-sheet{fill:#d5dbe2;stroke:#56606c;stroke-width:1.6;stroke-linejoin:round}
</style>`;

function escAttr(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function dimH(x0, x1, y, label, fs, ext0, ext1, cls = '') {
  const t = fs * 0.5;
  let s = `<path d="M${f(x0)} ${f(y)}L${f(x1)} ${f(y)}M${f(x0 - t * 0.6)} ${f(y + t * 0.6)}L${f(x0 + t * 0.6)} ${f(y - t * 0.6)}M${f(x1 - t * 0.6)} ${f(y + t * 0.6)}L${f(x1 + t * 0.6)} ${f(y - t * 0.6)}" class="dim" ${S}/>`;
  if (ext0 != null) s += `<path d="M${f(x0)} ${f(ext0)}L${f(x0)} ${f(y + t)}M${f(x1)} ${f(ext1 ?? ext0)}L${f(x1)} ${f(y + t)}" class="ext" ${S}/>`;
  s += `<text x="${f((x0 + x1) / 2)}" y="${f(y + fs * 1.15)}" font-size="${f(fs)}" text-anchor="middle" class="${cls}">${escAttr(label)}</text>`;
  return s;
}

/**
 * Draw a part.
 * opts.view: 'auto' | 'side' | 'top' | 'both'
 * opts.mode: 'fit' (scales to its box) | 'actual' (px, needs pxPerMm) | 'print' (mm on paper)
 * opts.dims: dimension lines and labels
 * opts.ghost: another part drawn dashed on top, aligned under the head (for comparison)
 */
export function drawPart(part, opts = {}) {
  if (!part) return '';
  if (!isFastener(part) || !part.spec) return genericIcon(part);
  const { view = 'auto', mode = 'fit', pxPerMm = 3.78, dims = false, ghost = null, pad: padIn, ariaLabel, standalone = false } = opts;
  const sp = part.spec;
  const id = ++uid;
  const gid = `g${id}`, rid = `r${id}`;
  const defs = gradient(gid, sp.material) + radial(rid, sp.material);

  let side;
  if (part.category === 'screw') side = screwSide(sp, gid);
  else if (part.category === 'nut') side = nutSide(sp, gid);
  else if (part.category === 'washer') side = washerSide(sp, gid);
  else side = standoffSide(sp, gid);

  const topFirst = part.category === 'washer' || part.category === 'nut';
  const wantTop = view === 'top' || view === 'both' || (view === 'auto' && topFirst);
  const wantSide = view !== 'top' && !(view === 'auto' && topFirst);

  const extent = Math.max(side.bounds.x1 - side.bounds.x0, side.bounds.y1 - side.bounds.y0);
  const fs = mode === 'fit' ? Math.max(1.1, Math.min(3.4, extent * 0.085)) : mode === 'print' ? 2.4 : 11 / pxPerMm;
  const pad = padIn ?? (dims ? fs * 1.2 : Math.max(0.6, extent * 0.06));
  let body = '';
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const grow = (a, b, c, d) => { x0 = Math.min(x0, a); x1 = Math.max(x1, b); y0 = Math.min(y0, c); y1 = Math.max(y1, d); };

  if (wantTop) {
    const t = part.category === 'screw' ? (cx) => screwTop(sp, cx, rid)
      : part.category === 'nut' ? (cx) => nutTop(sp, cx, rid)
      : part.category === 'washer' ? (cx) => washerTop(sp, cx, rid)
      : (cx) => standoffTop(sp, cx, rid);
    const probe = t(0);
    const offset = wantSide ? side.bounds.x0 - probe.r - Math.max(2, extent * 0.18) : 0;
    const top = t(offset);
    body += `<g>${top.svg}</g>`;
    grow(offset - top.r, offset + top.r, -top.r, top.r);
    if (dims) {
      const cap = part.category === 'screw' ? (sp.driveSize || '') : part.category === 'washer' ? `Ø${f(top.od || 0)} / Ø${f(top.id || 0)}` : '';
      if (cap) {
        body += `<text x="${f(offset)}" y="${f(top.r + fs * 1.5)}" font-size="${f(fs * 0.9)}" text-anchor="middle" class="cap">${escAttr(cap)}</text>`;
        grow(offset - top.r, offset + top.r, -top.r, top.r + fs * 1.9);
      }
    }
  }

  if (wantSide) {
    body += `<g>${side.svg}</g>`;
    grow(side.bounds.x0, side.bounds.x1, side.bounds.y0, side.bounds.y1);
    let ghostEnd = -Infinity;
    if (ghost && ghost.category === part.category && ghost.spec) {
      let g = null;
      if (part.category === 'screw') g = screwSide(ghost.spec, gid, true);
      else if (part.category === 'standoff') {
        const gs = standoffSide(ghost.spec, gid);
        g = { svg: gs.svg.replace(/fill="url\(#[^)]+\)"/g, 'fill="none"').replace(/class="o( thin)?"/g, 'class="ghost"'), bounds: gs.bounds };
      }
      if (g) { body += `<g>${g.svg}</g>`; grow(g.bounds.x0, g.bounds.x1, g.bounds.y0, g.bounds.y1); ghostEnd = g.bounds.x1; }
    }
    if (dims) {
      const yb = side.bounds.y1 + fs * 1.1;
      const th = sp.thread || 'M' + sp.d;
      const labelX = Math.max(side.bounds.x1, ghostEnd) + fs * 0.6;
      if (part.category === 'screw') {
        body += dimH(side.lengthFrom, side.lengthTo, yb, `${sp.lengthLabel || f(sp.length) + ' mm'}`, fs, side.bounds.y1 * 0.4, (sp.d || 3) / 2 + 0.2);
        body += `<text x="${f(labelX)}" y="${f(fs * 0.36)}" font-size="${f(fs)}" text-anchor="start">${escAttr(th)}</text>`;
        grow(side.bounds.x0, labelX + fs * th.length * 0.62, side.bounds.y0, yb + fs * 1.5);
        if (ghost?.spec?.length != null && ghost.category === 'screw' && Math.abs(ghost.spec.length - sp.length) > 0.01) {
          const g = screwSide(ghost.spec, gid, true);
          const yg = side.bounds.y0 - fs * 1.4;
          body += dimH(g.lengthFrom, g.lengthTo, yg, `${ghost.spec.lengthLabel || f(ghost.spec.length) + ' mm'} (dashed)`, fs * 0.9, null, null, 'gh');
          grow(side.bounds.x0, side.bounds.x1, yg - fs * 0.6, side.bounds.y1);
        }
      } else if (part.category === 'standoff') {
        body += dimH(0, side.L, yb, `${f(sp.length)} mm`, fs, side.bounds.y1 * 0.6);
        body += `<text x="${f(labelX)}" y="${f(fs * 0.36)}" font-size="${f(fs)}">${escAttr(th)}</text>`;
        grow(side.bounds.x0, labelX + fs * th.length * 0.62, side.bounds.y0, yb + fs * 1.5);
      } else if (part.category === 'nut') {
        body += `<text x="${f(side.bounds.x1 / 2)}" y="${f(side.bounds.y1 + fs * 1.4)}" font-size="${f(fs)}" text-anchor="middle">${escAttr(th)}</text>`;
        grow(side.bounds.x0, side.bounds.x1, side.bounds.y0, side.bounds.y1 + fs * 1.7);
      }
    }
  }

  x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
  const W = x1 - x0, H = y1 - y0;
  const size = mode === 'actual' ? `width="${f(W * pxPerMm)}" height="${f(H * pxPerMm)}"` : mode === 'print' ? `width="${f(W)}mm" height="${f(H)}mm"` : '';
  const label = ariaLabel || `${part.name}${mode === 'fit' ? '' : ', actual size'}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(x0)} ${f(y0)} ${f(W)} ${f(H)}" ${size} class="pdraw" role="img" aria-label="${escAttr(label)}"><defs>${defs}</defs>${standalone ? STYLE : ''}${body}</svg>`;
}

/** Overall drawn size in mm (for laying out true-scale overlays). */
export function partExtentMm(part) {
  if (!isFastener(part)) return null;
  const sp = part.spec || {};
  if (part.category === 'screw') { const { dk, k } = headDims(sp.head, sp.d || 3); return { length: (sp.head === 'countersunk' ? sp.length : sp.length + k), width: dk }; }
  if (part.category === 'standoff') return { length: (sp.length || 10) + (sp.maleLength || 0), width: (sp.af || 5.5) * 1.1547 };
  if (part.category === 'nut') { const n = nutDims(sp.d || 3, sp.variant); return { length: n.m, width: n.af * 1.1547 }; }
  const w = washerDims(sp.d || 3, sp.variant);
  return { length: w.od, width: w.od };
}

/** Small icon of a head type or drive type, for pickers. */
export function drawChoice(kind, value) {
  const sp = kind === 'head' ? { head: value, drive: value === 'hex' ? 'external' : value === 'socket' || value === 'button' || value === 'countersunk' ? 'hex' : 'phillips', d: 3, length: 7, pitch: 0.5, material: 'A2' } : { head: 'pan', drive: value, d: 3, length: 6, pitch: 0.5, material: 'A2', driveSize: value === 'hex' ? '2' : '' };
  return drawPart({ id: 'choice', category: 'screw', name: value, spec: sp }, { view: kind === 'head' ? 'side' : 'top', pad: 0.8 });
}

/**
 * Side silhouette in millimetres, bearing face at x = 0, axis at y = 0, for true-scale overlays.
 * Returns { svg (paths with class "ghost"), x0, x1, y0, y1 } or null.
 */
export function outlineMm(part) {
  if (!isFastener(part) || !part.spec) return null;
  if (part.category === 'screw') {
    const s = screwSide(part.spec, 'none', true);
    return { svg: s.svg, ...s.bounds };
  }
  if (part.category === 'standoff') {
    const s = standoffSide(part.spec, 'none');
    return { svg: s.svg.replace(/fill="url\(#[^)]+\)"/g, 'fill="none"').replace(/class="(o|o thin|th|hid)"/g, 'class="ghost"'), ...s.bounds };
  }
  const s = part.category === 'nut' ? nutSide(part.spec, 'none') : washerSide(part.spec, 'none');
  return { svg: s.svg.replace(/fill="url\(#[^)]+\)"/g, 'fill="none"').replace(/class="(o|o thin|th|hid|nylon)"/g, 'class="ghost"'), ...s.bounds };
}
