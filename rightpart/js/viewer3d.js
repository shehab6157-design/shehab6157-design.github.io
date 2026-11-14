// 3D assembly viewer. The device is built from the scene description in the library
// (positions in millimetres) and every fastener is generated from its part spec,
// so the model shows exactly the screw the data says: an M3 x 10 really is 10 mm long.

import * as T from '../vendor/three/three.bundle.js';
import { t } from './core/i18n.js';
import { headDims, nutDims, washerDims, MATERIALS, sizeLabel } from './core/dims.js';
import { resolveCode } from './core/model.js';

const UP = new T.Vector3(0, 1, 0);
const DOWN = new T.Vector3(0, -1, 0);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2')) || !!c.getContext('webgl');
  } catch { return false; }
}

// ---------- Materials ----------
function makeMaterials() {
  const cache = new Map();
  const std = (key, o) => {
    if (!cache.has(key)) cache.set(key, new T.MeshStandardMaterial(o));
    return cache.get(key);
  };
  return {
    cache,
    metal(code) {
      const c = MATERIALS[code]?.color;
      if (code === 'nylon') return std('nylon', { color: 0xf3eee1, roughness: 0.62, metalness: 0 });
      if (code === 'black-oxide') return std('bo', { color: 0x2c3036, roughness: 0.42, metalness: 0.75 });
      const col = c ? mix(c[0], c[1], 0.38) : '#c4cad2';
      return std('m-' + code, { color: col, roughness: code === 'brass-ni' ? 0.26 : 0.3, metalness: 1 });
    },
    sheet: () => std('sheet', { color: 0xc4cad3, roughness: 0.48, metalness: 0.55 }),
    dark: () => std('dark', { color: 0x1c2026, roughness: 0.5, metalness: 0.4 }),
    paint: () => std('paint', { color: 0xe6e9ee, roughness: 0.62, metalness: 0.05 }),
    plastic: (c = 0x22262b) => std('pl-' + c, { color: c, roughness: 0.6, metalness: 0 }),
    pcb: () => std('pcb', { color: 0x1d7a4a, roughness: 0.55, metalness: 0.05 }),
    chip: () => std('chip', { color: 0x1a1d22, roughness: 0.45, metalness: 0.1 }),
    ivory: () => std('ivory', { color: 0xf1ede2, roughness: 0.5, metalness: 0 }),
    glass: () => std('glass', { color: 0x0f1a26, roughness: 0.12, metalness: 0.2, emissive: 0x0b2440, emissiveIntensity: 0.35 }),
    psu: () => std('psu', { color: 0xaeb6bf, roughness: 0.38, metalness: 0.85 }),
    copper: () => std('cu', { color: 0xd9b48a, roughness: 0.3, metalness: 1 }),
    recess: () => std('recess', { color: 0x14171b, roughness: 0.7, metalness: 0.2 }),
    /** Materials a generic model names: a key below, or a colour such as "#ff7a1a". */
    named(m) {
      const N = {
        alu: { color: 0xc8cdd3, roughness: 0.34, metalness: 0.9 },
        'alu-black': { color: 0x2b2e33, roughness: 0.42, metalness: 0.65 },
        steel: { color: 0xb9bfc6, roughness: 0.3, metalness: 1 },
        rubber: { color: 0x1a1c1f, roughness: 0.92, metalness: 0 },
        'plastic-black': { color: 0x202327, roughness: 0.62, metalness: 0 },
        'plastic-grey': { color: 0x8b939c, roughness: 0.58, metalness: 0 },
        'plastic-white': { color: 0xeef0f2, roughness: 0.55, metalness: 0 },
        belt: { color: 0x121416, roughness: 0.85, metalness: 0 },
        wood: { color: 0xc9a46b, roughness: 0.82, metalness: 0 },
        brass: { color: 0xd9b25c, roughness: 0.3, metalness: 1 },
        'acrylic-orange': { color: 0xff7a1a, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.42, depthWrite: false },
        'acrylic-clear': { color: 0xdfeefa, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.35, depthWrite: false },
        'led-green': { color: 0x2bd46b, roughness: 0.3, metalness: 0, emissive: 0x2bd46b, emissiveIntensity: 1.4 },
        'led-blue': { color: 0x5b7bff, roughness: 0.3, metalness: 0, emissive: 0x5b7bff, emissiveIntensity: 1.6 },
        laser: { color: 0x7a5cff, roughness: 0.2, metalness: 0, emissive: 0x8f6bff, emissiveIntensity: 3 },
        burn: { color: 0x3b2614, roughness: 0.9, metalness: 0 },
        warning: { color: 0xf5c518, roughness: 0.5, metalness: 0 },
      };
      if (typeof m === 'string' && /^#[0-9a-f]{6}$/i.test(m)) return std('c-' + m, { color: m, roughness: 0.5, metalness: 0.1 });
      if (m === 'pcb') return this.pcb();
      return std('n-' + m, N[m] || N['plastic-grey']);
    },
  };
}
function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

function stripeTexture(colors, angle = true) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = colors[0]; g.fillRect(0, 0, 64, 64);
  g.fillStyle = colors[1];
  if (angle) {
    g.beginPath(); g.moveTo(0, 0); g.lineTo(28, 0); g.lineTo(64, 36); g.lineTo(64, 64); g.lineTo(36, 64); g.lineTo(0, 28); g.closePath(); g.fill();
  } else g.fillRect(0, 0, 64, 26);
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.colorSpace = T.SRGBColorSpace;
  return t;
}

// ---------- Fastener geometry (local: bearing face at y = 0, tip toward -y) ----------
function hexShape(af, hole) {
  const R = af / Math.sqrt(3);
  const s = new T.Shape();
  for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i; s[i ? 'lineTo' : 'moveTo'](R * Math.cos(a), R * Math.sin(a)); }
  s.closePath();
  if (hole) { const h = new T.Path(); h.absarc(0, 0, hole, 0, Math.PI * 2, true); s.holes.push(h); }
  return s;
}
function ringShape(ro, ri) {
  const s = new T.Shape(); s.absarc(0, 0, ro, 0, Math.PI * 2, false);
  const h = new T.Path(); h.absarc(0, 0, ri, 0, Math.PI * 2, true); s.holes.push(h);
  return s;
}
function extrudeY(shape, depth, bevel = 0) {
  const g = new T.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 28 });
  g.rotateX(-Math.PI / 2); // extrusion axis +z -> +y
  return g;
}

function driveDecal(drive, dk, size, mat) {
  const r = dk / 2;
  let shape = null;
  if (drive === 'phillips' || drive === 'pozidriv') {
    const a = r * 0.62, w = r * 0.17;
    shape = new T.Shape();
    const pts = [[-a, -w], [-w, -w], [-w, -a], [w, -a], [w, -w], [a, -w], [a, w], [w, w], [w, a], [-w, a], [-w, w], [-a, w]];
    pts.forEach(([x, y], i) => shape[i ? 'lineTo' : 'moveTo'](x, y));
    shape.closePath();
  } else if (drive === 'torx') {
    const R = r * 0.5, ri = r * 0.34;
    shape = new T.Shape();
    for (let i = 0; i <= 60; i++) { const t = (i / 60) * Math.PI * 2; const rr = (R + ri) / 2 + ((R - ri) / 2) * Math.cos(6 * t); shape[i ? 'lineTo' : 'moveTo'](rr * Math.cos(t), rr * Math.sin(t)); }
  } else if (drive === 'hex') {
    shape = hexShape(Math.min(parseFloat(size) || r * 0.7, r * 1.4));
  } else if (drive === 'slotted') {
    const w = r * 0.1; shape = new T.Shape(); shape.moveTo(-r * 0.95, -w); shape.lineTo(r * 0.95, -w); shape.lineTo(r * 0.95, w); shape.lineTo(-r * 0.95, w); shape.closePath();
  }
  if (!shape) return null;
  const g = new T.ShapeGeometry(shape, 8);
  g.rotateX(-Math.PI / 2);
  return new T.Mesh(g, mat);
}

function headLathe(head, dk, k, d) {
  const r = dk / 2;
  const pts = [];
  if (head === 'button') {
    for (let i = 0; i <= 10; i++) { const a = (i / 10) * (Math.PI / 2); pts.push([r * Math.sin(a), k * Math.cos(a)]); }
    pts.push([d / 2, 0]);
  } else if (head === 'socket') pts.push([0, k], [r * 0.9, k], [r, k * 0.9], [r, 0], [d / 2, 0]);
  else if (head === 'cheese') pts.push([0, k], [r * 0.85, k], [r, k * 0.85], [r, 0], [d / 2, 0]);
  else pts.push([0, k], [r * 0.5, k], [r * 0.82, k * 0.88], [r * 0.97, k * 0.55], [r, k * 0.15], [r, 0], [d / 2, 0]);
  // Lathe needs the profile from the axis outward; reverse so the normals face out.
  const v = pts.map(([x, y]) => new T.Vector2(Math.max(0.001, x), y)).reverse();
  return new T.LatheGeometry(v, 36);
}

function buildFastener(part, mats, textures) {
  const sp = part.spec || {};
  const g = new T.Group();
  const mat = mats.metal(sp.material);
  const d = sp.d || 3;
  const add = (geo, m = mat) => { const mesh = new T.Mesh(geo, m); mesh.castShadow = true; g.add(mesh); return mesh; };
  const threaded = (len, y0) => {
    const key = `${len}-${sp.pitch || 0.5}-${sp.material}`;
    if (!textures.has(key)) {
      const tex = stripeTexture(['#ffffff', '#9aa2ad']);
      tex.repeat.set(1, Math.max(1, len / (sp.pitch || 0.5)));
      textures.set(key, new T.MeshStandardMaterial({ color: mat.color, roughness: mat.roughness, metalness: mat.metalness, map: tex }));
    }
    const m = add(new T.CylinderGeometry(d / 2, d / 2, len, 20, 1), textures.get(key));
    m.position.y = y0 - len / 2;
    return m;
  };
  if (part.category === 'screw') {
    const { dk, k } = headDims(sp.head, d);
    if (sp.head === 'hex') add(new T.CylinderGeometry(dk / Math.sqrt(3), dk / Math.sqrt(3), k, 6)).position.y = k / 2;
    else if (sp.head === 'countersunk') { const c = add(new T.CylinderGeometry(dk / 2, d / 2, k, 32)); c.position.y = -k / 2; }
    else add(headLathe(sp.head, dk, k, d));
    const top = sp.head === 'countersunk' ? 0 : k;
    const decal = driveDecal(sp.drive, dk, sp.driveSize, mats.recess());
    if (decal) { decal.position.y = top + 0.02; g.add(decal); }
    const shank = sp.head === 'countersunk' ? sp.length - k : sp.length;
    threaded(shank, sp.head === 'countersunk' ? -k : 0);
  } else if (part.category === 'nut') {
    const { af, m } = nutDims(d, sp.variant);
    const s = sp.af || af, h = sp.m || m;
    const metalH = sp.variant === 'nyloc' ? h * 0.72 : h;
    add(extrudeY(hexShape(s, d / 2), metalH, 0.12));
    if (sp.variant === 'nyloc') {
      const cap = add(new T.CylinderGeometry(s * 0.47, s * 0.5, h - metalH, 6), mat); cap.position.y = metalH + (h - metalH) / 2;
      const ny = add(new T.CylinderGeometry(s * 0.36, s * 0.36, h - metalH + 0.02, 24), mats.plastic(0x5b8def)); ny.position.y = metalH + (h - metalH) / 2;
    }
  } else if (part.category === 'washer') {
    const w = washerDims(d, sp.variant);
    const id = sp.id || w.id, od = sp.od || w.od, t = sp.t || w.t;
    let shape;
    if (sp.variant === 'star-ext') {
      shape = new T.Shape();
      const N = 18;
      for (let i = 0; i < N; i++) {
        const a0 = (i / N) * Math.PI * 2, a1 = ((i + 0.85) / N) * Math.PI * 2;
        const R = i % 2 ? od / 2 * 0.74 : od / 2;
        shape[i ? 'lineTo' : 'moveTo'](R * Math.cos(a0), R * Math.sin(a0));
        shape.lineTo(R * Math.cos(a1), R * Math.sin(a1));
      }
      shape.closePath();
      const h = new T.Path(); h.absarc(0, 0, id / 2, 0, Math.PI * 2, true); shape.holes.push(h);
    } else shape = ringShape(od / 2, id / 2);
    add(extrudeY(shape, t), sp.material === 'nylon' ? mats.metal('nylon') : mat);
  } else if (part.category === 'standoff') {
    const s = sp.af || 5.5;
    add(extrudeY(hexShape(s, d / 2 * 0.95), sp.length || 10, 0.15));
    if (sp.gender !== 'F-F') threaded(sp.maleLength || 6, 0);
  }
  return g;
}

// ---------- Big parts ----------
function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function plateWithHoles(w, h, t, holes, mat) {
  const s = new T.Shape();
  s.moveTo(-w / 2, -h / 2); s.lineTo(w / 2, -h / 2); s.lineTo(w / 2, h / 2); s.lineTo(-w / 2, h / 2); s.closePath();
  for (const ho of holes) {
    const p = new T.Path();
    if (ho.r) p.absarc(ho.x, ho.y, ho.r, 0, Math.PI * 2, true);
    else { p.moveTo(ho.x - ho.w / 2, ho.y - ho.h / 2); p.lineTo(ho.x - ho.w / 2, ho.y + ho.h / 2); p.lineTo(ho.x + ho.w / 2, ho.y + ho.h / 2); p.lineTo(ho.x + ho.w / 2, ho.y - ho.h / 2); p.closePath(); }
    s.holes.push(p);
  }
  const g = new T.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 32 });
  g.translate(0, 0, -t / 2);
  const m = new T.Mesh(g, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function buildChassis(o, mats) {
  const g = new T.Group();
  const [W, PT, D] = o.plate;
  const base = mats.sheet();
  const sheet = base.clone(); // walls: shown see-through while building, so the inside stays visible
  g.userData.wallMat = sheet;
  const mark = (m) => { m.userData.xray = true; return m; };
  g.add(box(W, PT, D, base, 0, PT / 2, 0));
  const rear = o.rear;
  const rz = -D / 2 + rear.t / 2;
  const wall = plateWithHoles(W, rear.h, rear.t, [{ x: rear.fan[0], y: rear.fan[1] - (PT + rear.h / 2), r: rear.fan[2] }, { x: rear.inlet[0], y: rear.inlet[1] - (PT + rear.h / 2), w: 27, h: 19 }], sheet);
  wall.position.set(0, PT + rear.h / 2, rz);
  g.add(mark(wall));
  // fan guard bars
  for (const a of [0, Math.PI / 2]) { const bar = box(rear.fan[2] * 2, 1.2, 1, sheet); bar.rotation.z = a; bar.position.set(rear.fan[0], rear.fan[1], rz); g.add(mark(bar)); }
  // power inlet
  const inletOut = box(31, 23, 4, mats.chip(), rear.inlet[0], rear.inlet[1], rz - rear.t / 2 - 2);
  g.add(inletOut, box(26, 18, 18, mats.chip(), rear.inlet[0], rear.inlet[1], rz + rear.t / 2 + 9));
  for (const dx of [-6, 0, 6]) { const pin = new T.Mesh(new T.CylinderGeometry(1, 1, 3, 10), mats.metal('brass')); pin.rotation.x = Math.PI / 2; pin.position.set(rear.inlet[0] + dx, rear.inlet[1] + (dx ? -2 : 3), rz - rear.t / 2 - 4.5); g.add(pin); }
  // front frame with display window and bosses
  const fr = o.front;
  const frame = plateWithHoles(W, fr.h, fr.t, [{ x: fr.window[2], y: fr.window[3] - (PT + fr.h / 2), w: fr.window[0], h: fr.window[1] }], sheet);
  frame.position.set(0, PT + fr.h / 2, fr.z);
  g.add(mark(frame));
  for (const [x, y] of fr.bosses) {
    const b = new T.Mesh(new T.CylinderGeometry(2.8, 2.8, fr.boss, 18), sheet);
    b.rotation.x = Math.PI / 2; b.position.set(x, y, fr.z + fr.t / 2 + fr.boss / 2); b.castShadow = true; g.add(mark(b));
  }
  for (const z of o.flanges) g.add(mark(box(W, 1.5, 12, sheet, 0, PT + rear.h - 0.75, z)));
  // earth stud with thread
  const [sx, sy, sz] = o.stud;
  const stud = new T.Mesh(new T.CylinderGeometry(2, 2, 12, 16), new T.MeshStandardMaterial({ color: 0xc9ced6, metalness: 1, roughness: 0.3, map: (() => { const t = stripeTexture(['#ffffff', '#9aa2ad']); t.repeat.set(1, 17); return t; })() }));
  stud.position.set(sx, sy + 6, sz); stud.castShadow = true; g.add(stud);
  // earth symbol plate
  const sym = earthSymbolTexture();
  const decal = new T.Mesh(new T.PlaneGeometry(12, 12), new T.MeshStandardMaterial({ map: sym, transparent: true, roughness: 0.6 }));
  decal.rotation.x = -Math.PI / 2; decal.position.set(sx + 12, PT + 0.05, sz); g.add(decal);
  return g;
}

function earthSymbolTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#1F9D55'; x.beginPath(); x.arc(64, 64, 60, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#fff'; x.lineWidth = 9; x.lineCap = 'round';
  x.beginPath(); x.moveTo(64, 22); x.lineTo(64, 66); x.moveTo(34, 66); x.lineTo(94, 66); x.moveTo(44, 82); x.lineTo(84, 82); x.moveTo(54, 98); x.lineTo(74, 98); x.stroke();
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}

function buildPSU(o, mats) {
  const g = new T.Group();
  const [w, h, d] = o.size;
  g.add(box(w, h, d, mats.psu()));
  for (let i = 0; i < 9; i++) g.add(box(4, 0.4, d * 0.7, mats.chip(), -w / 2 + 12 + i * 8, h / 2 + 0.1, 0));
  for (const fx of o.flanges) g.add(box(8, 1.5, d, mats.psu(), fx - o.pos[0], -h / 2 + 0.75, 0));
  g.add(box(5, 12, 22, mats.plastic(0x2e7d32), w / 2 + 2.5, h / 2 - 12, 9));
  const lbl = labelTexture(['POWER SUPPLY 24 V', '150 W  (fictional)'], 256, 96, '#f4f4f4');
  const plane = new T.Mesh(new T.PlaneGeometry(40, 15), new T.MeshStandardMaterial({ map: lbl, roughness: 0.7 }));
  plane.rotation.x = -Math.PI / 2; plane.position.set(-14, h / 2 + 0.3, 8); g.add(plane);
  return g;
}

function buildPCB(o, mats) {
  const g = new T.Group();
  const [w, t, d] = o.size;
  const board = box(w, t, d, mats.pcb()); g.add(board);
  const top = t / 2;
  g.add(box(14, 1.4, 14, mats.chip(), -10, top + 0.7, 0));
  g.add(box(7, 1.1, 5, mats.chip(), 18, top + 0.55, 14), box(7, 1.1, 5, mats.chip(), 28, top + 0.55, 14), box(9, 1.2, 9, mats.chip(), 22, top + 0.6, -20));
  const hs = new T.Group();
  for (let i = 0; i < 7; i++) hs.add(box(1.2, 11, 20, mats.metal('aluminium'), -7 + i * 2.4, 5.5, 0));
  hs.add(box(18, 1.5, 20, mats.metal('aluminium'), 0, 0.75, 0));
  hs.position.set(-36, top, -14); g.add(hs);
  for (const x of [-30, -40]) { const c = new T.Mesh(new T.CylinderGeometry(4, 4, 10, 20), mats.plastic(0x1b3a6b)); c.position.set(x, top + 5, 22); c.castShadow = true; g.add(c); }
  g.add(box(8, 6, 10, mats.ivory(), -48, top + 3, -30)); // J1
  g.add(box(26, 3, 5, mats.ivory(), 0, top + 1.5, 38), box(26, 1, 2, mats.chip(), 0, top + 3.3, 39.5)); // J3
  g.add(box(7, 5, 5, mats.ivory(), 44, top + 2.5, -35)); // J5
  const silk = labelTexture(['MCB-1  rev C', 'J1        J3        J5'], 256, 64, null, '#e8f5ec');
  const s = new T.Mesh(new T.PlaneGeometry(44, 11), new T.MeshBasicMaterial({ map: silk, transparent: true }));
  s.rotation.x = -Math.PI / 2; s.position.set(20, top + 0.02, 28); g.add(s);
  return g;
}

function buildFan(o, mats) {
  const g = new T.Group();
  const [w, h, d] = o.size;
  const frame = plateWithHoles(w, h, d, [{ x: 0, y: 0, r: w * 0.46 }, ...[[-25, -25], [25, -25], [-25, 25], [25, 25]].map(([x, y]) => ({ x, y, r: 1.7 }))], mats.plastic(0x23272c));
  g.add(frame);
  const hub = new T.Mesh(new T.CylinderGeometry(10, 10, d * 0.8, 28), mats.plastic(0x2b3036)); hub.rotation.x = Math.PI / 2; g.add(hub);
  const blades = new T.Group();
  for (let i = 0; i < 7; i++) { const b = box(17, 2, d * 0.5, mats.plastic(0x2f343a)); b.position.set(18, 0, 0); b.rotation.x = 0.5; const p = new T.Group(); p.add(b); p.rotation.z = (i / 7) * Math.PI * 2; blades.add(p); }
  g.add(blades);
  g.userData.blades = blades;
  // airflow arrow on the top edge, pointing out of the device (toward -z)
  const arrow = new T.Group();
  const shaft = new T.Mesh(new T.CylinderGeometry(0.8, 0.8, 9, 10), mats.plastic(0xffffff)); shaft.rotation.x = Math.PI / 2;
  const tip = new T.Mesh(new T.CylinderGeometry(0, 2.2, 4, 12), mats.plastic(0xffffff)); tip.rotation.x = -Math.PI / 2; tip.position.z = -6.4;
  arrow.add(shaft, tip); arrow.position.set(0, h / 2 + 1.2, 0); g.add(arrow);
  return g;
}

function buildDisplay(o, mats) {
  const g = new T.Group();
  const [w, h, d] = o.size;
  g.add(box(w, h, d * 0.6, mats.sheet(), 0, 0, -d * 0.2));
  g.add(box(w - 4, h - 4, d * 0.4, mats.glass(), 0, 0, d * 0.3));
  for (const [x, y] of o.ears) g.add(box(12, 10, 1, mats.sheet(), x, y - o.pos[1], -d / 2 + 0.5));
  return g;
}

function buildBezel(o, mats) {
  const [w, h, d] = o.size;
  const [ww, wh, wx, wy] = o.window;
  const m = plateWithHoles(w, h, d, [{ x: wx, y: wy, w: ww, h: wh }], mats.dark());
  const g = new T.Group(); g.add(m);
  return g;
}

function buildCover(o, mats) {
  const g = new T.Group();
  const [w, h, d] = o.size;
  const t = o.t;
  g.add(box(w, t, d, mats.paint(), 0, h / 2 - t / 2, 0));
  g.add(box(t, h, d, mats.paint(), -w / 2 + t / 2, 0, 0), box(t, h, d, mats.paint(), w / 2 - t / 2, 0, 0));
  for (let i = 0; i < 8; i++) for (const sx of [-1, 1]) g.add(box(0.6, 2, 24, mats.dark(), sx * (w / 2 + 0.05), -h / 2 + 30 + i * 6, -40));
  return g;
}

function curveFrom(points) {
  return new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p)));
}

function buildCable(o, mats) {
  const g = new T.Group();
  const curve = curveFrom(o.points);
  let mat;
  if (o.stripe) {
    const tex = stripeTexture([o.color, o.stripe], true);
    tex.repeat.set(2, 10);
    mat = new T.MeshStandardMaterial({ map: tex, roughness: 0.5 });
  } else mat = new T.MeshStandardMaterial({ color: o.color || '#333', roughness: 0.55 });
  const tube = new T.Mesh(new T.TubeGeometry(curve, 48, o.radius || 1.2, 10, false), mat);
  tube.castShadow = true; g.add(tube);
  if (o.ring) {
    const r = new T.Mesh(extrudeY(ringShape(o.ring.od / 2, o.ring.id / 2), o.ring.t), mats.copper());
    r.position.set(...o.ring.at); r.castShadow = true; g.add(r);
  }
  g.userData.curve = curve;
  return g;
}

function buildRibbon(o) {
  const curve = curveFrom(o.points);
  const N = 40;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    let side = new T.Vector3().crossVectors(tan, UP);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize().multiplyScalar(o.width / 2);
    pos.push(p.x - side.x, p.y - side.y, p.z - side.z, p.x + side.x, p.y + side.y, p.z + side.z);
    uv.push(0, t, 1, t);
    if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new T.Mesh(geo, new T.MeshStandardMaterial({ color: o.color, roughness: 0.45, metalness: 0.2, side: T.DoubleSide }));
  m.castShadow = true;
  const g = new T.Group(); g.add(m);
  g.userData.curve = curve;
  return g;
}

// ---------- Generic models: any product drawn from simple shapes in the library ----------
const DEG = Math.PI / 180;
/** Cross-section of an aluminium extrusion (20 × 20 per cell) with its slots. */
function profileShape(cells) {
  const w = 20, h = 20 * cells, slot = 6.2, depth = 4.2;
  const s = new T.Shape();
  const pts = [];
  // Walk round the outline, cutting a slot in the middle of every 20 mm face.
  const edge = (x0, y0, x1, y1, nx, ny) => {
    const len = Math.hypot(x1 - x0, y1 - y0), n = Math.round(len / 20);
    const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
    for (let i = 0; i < n; i++) {
      const c = i * 20 + 10;
      const a = c - slot / 2, b = c + slot / 2;
      pts.push([x0 + ux * (i * 20), y0 + uy * (i * 20)]);
      pts.push([x0 + ux * a, y0 + uy * a]);
      pts.push([x0 + ux * a - nx * depth, y0 + uy * a - ny * depth]);
      pts.push([x0 + ux * b - nx * depth, y0 + uy * b - ny * depth]);
      pts.push([x0 + ux * b, y0 + uy * b]);
    }
  };
  edge(-w / 2, -h / 2, w / 2, -h / 2, 0, -1);
  edge(w / 2, -h / 2, w / 2, h / 2, 1, 0);
  edge(w / 2, h / 2, -w / 2, h / 2, 0, 1);
  edge(-w / 2, h / 2, -w / 2, -h / 2, -1, 0);
  pts.forEach(([x, y], i) => s[i ? 'lineTo' : 'moveTo'](x, y));
  s.closePath();
  const hole = new T.Path();
  for (let k = 0; k < cells; k++) { const c = new T.Path(); c.absarc(0, -h / 2 + 10 + k * 20, 2.1, 0, Math.PI * 2, true); s.holes.push(c); }
  void hole;
  return s;
}

function buildModel(o, mats) {
  const g = new T.Group();
  const geoCache = new Map();
  const put = (mesh, sh) => {
    mesh.castShadow = true; mesh.receiveShadow = true;
    if (sh.p) mesh.position.set(...sh.p);
    if (sh.r) mesh.rotation.set(sh.r[0] * DEG, sh.r[1] * DEG, sh.r[2] * DEG);
    g.add(mesh);
    return mesh;
  };
  for (const sh of o.shapes || []) {
    const mat = mats.named(sh.m);
    if (sh.t === 'box') put(new T.Mesh(new T.BoxGeometry(...sh.s), mat), sh);
    else if (sh.t === 'cyl') {
      const d2 = sh.d2 ?? sh.d;
      put(new T.Mesh(new T.CylinderGeometry(d2 / 2, sh.d / 2, sh.h, sh.seg || 28), mat), sh);
    } else if (sh.t === 'torus') put(new T.Mesh(new T.TorusGeometry(sh.R, sh.tube, 10, 28), mat), sh);
    else if (sh.t === 'profile') {
      const cells = sh.size === '2040' ? 2 : 1;
      const key = `${cells}-${sh.len}`;
      if (!geoCache.has(key)) {
        const geo = new T.ExtrudeGeometry(profileShape(cells), { depth: sh.len, bevelEnabled: false, curveSegments: 10 });
        geo.translate(0, 0, -sh.len / 2);
        geoCache.set(key, geo);
      }
      const mesh = new T.Mesh(geoCache.get(key), mat);
      // The extrusion runs along z; turn it to the axis the data asks for. "up" says where the 40 mm side points.
      if (sh.axis === 'x') mesh.rotation.set(0, Math.PI / 2, sh.up === 'z' ? Math.PI / 2 : 0);
      else if (sh.axis === 'y') mesh.rotation.set(Math.PI / 2, 0, 0);
      else if (sh.up === 'x') mesh.rotation.set(0, 0, Math.PI / 2);
      put(mesh, { ...sh, r: null });
    } else if (sh.t === 'bar') {
      // A straight bar from a to b with a w × h cross-section (a belt, a rod).
      const a = new T.Vector3(...sh.a), b = new T.Vector3(...sh.b);
      const len = a.distanceTo(b);
      const mesh = new T.Mesh(new T.BoxGeometry(sh.w || 6, sh.h || 1.6, len), mat);
      mesh.position.copy(a).add(b).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), b.clone().sub(a).normalize());
      mesh.castShadow = true; mesh.receiveShadow = true;
      g.add(mesh);
    } else if (sh.t === 'label') {
      const tex = labelTexture(sh.text, 512, Math.round(512 * (sh.s[1] / sh.s[0])), sh.bg ?? '#ffffff', sh.fg);
      const mesh = new T.Mesh(new T.PlaneGeometry(sh.s[0], sh.s[1]), new T.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
      put(mesh, sh);
    }
  }
  return g;
}

function labelTexture(lines, w = 512, h = 208, bg = '#ffffff', fg = '#111111') {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, w, h); x.strokeStyle = '#333'; x.lineWidth = 4; x.strokeRect(2, 2, w - 4, h - 4); }
  x.fillStyle = fg || '#111';
  const fs = Math.floor(h / (lines.length + 1.6));
  lines.forEach((l, i) => { x.font = `${i ? 500 : 800} ${i ? fs * 0.82 : fs}px system-ui, Arial, sans-serif`; x.fillText(l, w * 0.05, fs * 1.15 + i * fs * 1.12); });
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function buildLabel(o) {
  const tex = labelTexture(o.text, 512, 208);
  const m = new T.Mesh(new T.PlaneGeometry(o.size[0], o.size[1]), new T.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
  const n = new T.Vector3(...(o.normal || [0, 0, 1]));
  m.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), n);
  const g = new T.Group(); g.add(m);
  return g;
}

// ---------- Viewer ----------
const THUMB_KINDS = new Set(['model', 'chassis', 'psu', 'pcb', 'fan', 'display', 'bezel', 'cover']);

export function createViewer(container, { app, device, onPick, mode = 'step', hotspots = false, autoRotate = false, preserve = false, insets: insets0 = null } = {}) {
  if (!webglAvailable()) return null;
  const scn = device.scene;
  if (!scn) return null;
  let renderer;
  try {
    renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: preserve });
  } catch { return null; }
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.75 : 2));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-label', t('3D model of the {device}. Drag to turn, pinch or scroll to zoom.', { device: device.name }));
  canvas.setAttribute('role', 'img');
  canvas.tabIndex = 0;
  container.prepend(canvas);

  const scene = new T.Scene();
  const pmrem = new T.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new T.RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.85;

  const camera = new T.PerspectiveCamera(32, 1, 5, 6000);
  const controls = new T.OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.minDistance = 30;
  controls.maxDistance = 1400;
  controls.screenSpacePanning = true;

  scene.add(new T.HemisphereLight(0xffffff, 0x8a94a3, 0.55));
  const key = new T.DirectionalLight(0xffffff, 1.7);
  key.position.set(220, 420, 260);
  key.castShadow = true;
  key.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  Object.assign(key.shadow.camera, { left: -240, right: 240, top: 240, bottom: -240, near: 50, far: 1200 });
  key.shadow.bias = -0.0004;
  key.shadow.radius = 4;
  scene.add(key);
  const fill = new T.DirectionalLight(0xdfe8ff, 0.5); fill.position.set(-300, 180, -220); scene.add(fill);
  const ground = new T.Mesh(new T.PlaneGeometry(3000, 3000), new T.ShadowMaterial({ opacity: 0.16 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true; scene.add(ground);

  const mats = makeMaterials();
  const threadMats = new Map();
  const steps = device.instructions?.steps || [];
  const stepIndex = new Map(steps.map((s, i) => [s.id, i]));
  const root = new T.Group();
  scene.add(root);

  /** items: one per movable thing { obj, node, stepIdx, base, final: {pos, quat}, offset: Vector3, spinAxis, order, partId, label } */
  const items = [];
  const groups = []; // per scene object: { obj, nodes: [...], stepIdx, partId, labelEl }

  for (const o of scn.objects) {
    const r = o.code ? resolveCode(app.index, o.code) : null;
    const part = r?.part || null;
    const sIdx = o.base ? -1 : stepIndex.has(o.step) ? stepIndex.get(o.step) : -1;
    const entry = { obj: o, nodes: [], stepIdx: sIdx, part, base: !!o.base };
    const tag = (node) => { node.traverse((c) => { c.userData.pickId = o.id; }); node.userData.pickId = o.id; };
    if (o.kind === 'fastener' && part) {
      const dir = new T.Vector3(...o.dir).normalize();
      const q = new T.Quaternion().setFromUnitVectors(DOWN, dir);
      for (const at of o.at) {
        const node = buildFastener(part, mats, threadMats);
        node.quaternion.copy(q);
        node.position.set(...at);
        tag(node);
        root.add(node);
        const off = dir.clone().multiplyScalar(-(o.from || 40));
        items.push({ node, entry, final: { pos: node.position.clone(), quat: node.quaternion.clone() }, offset: off, spin: dir.clone(), turns: Math.min(4, (o.from || 40) / 12), order: o.order || 0 });
        entry.nodes.push(node);
      }
    } else {
      let node;
      if (o.kind === 'chassis') node = buildChassis(o, mats);
      else if (o.kind === 'psu') node = buildPSU(o, mats);
      else if (o.kind === 'pcb') node = buildPCB(o, mats);
      else if (o.kind === 'fan') node = buildFan(o, mats);
      else if (o.kind === 'display') node = buildDisplay(o, mats);
      else if (o.kind === 'bezel') node = buildBezel(o, mats);
      else if (o.kind === 'cover') node = buildCover(o, mats);
      else if (o.kind === 'cable') node = buildCable(o, mats);
      else if (o.kind === 'ribbon') node = buildRibbon(o);
      else if (o.kind === 'label') node = buildLabel(o);
      else if (o.kind === 'tie') node = new T.Group();
      else if (o.kind === 'model') node = buildModel(o, mats);
      else continue;
      if (o.pos && !['cable', 'ribbon', 'tie'].includes(o.kind)) node.position.set(...o.pos);
      tag(node);
      root.add(node);
      entry.nodes.push(node);
      const off = new T.Vector3(...(Array.isArray(o.from) ? o.from : [0, o.from || 0, 0]));
      items.push({ node, entry, final: { pos: node.position.clone(), quat: node.quaternion.clone() }, offset: off, order: o.order || 0 });
      if (o.kind === 'fan') entry.blades = node.userData.blades;
    }
    groups.push(entry);
  }
  // Cable ties: small rings around the nearest cable, square to it.
  for (const entry of groups.filter((e) => e.obj.kind === 'tie')) {
    const curves = groups.filter((e) => e.nodes[0]?.userData.curve).map((e) => e.nodes[0].userData.curve);
    const parent = entry.nodes[0];
    for (const at of entry.obj.at) {
      const p = new T.Vector3(...at);
      let best = null, bt = 0, bd = Infinity;
      for (const c of curves) for (let i = 0; i <= 60; i++) { const q = c.getPoint(i / 60); const dd = q.distanceToSquared(p); if (dd < bd) { bd = dd; best = c; bt = i / 60; } }
      const ring = new T.Mesh(new T.TorusGeometry(2.4, 0.55, 8, 20), mats.ivory());
      if (best) { const tan = best.getTangent(bt); ring.position.copy(best.getPoint(bt)); ring.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), tan.normalize()); } else ring.position.copy(p);
      ring.userData.pickId = entry.obj.id;
      parent.add(ring);
    }
  }

  // Size the light, the shadows and the zoom limits to the product: a laser frame is much bigger than a console.
  root.updateMatrixWorld(true);
  const sceneSphere = new T.Box3().setFromObject(root).getBoundingSphere(new T.Sphere());
  {
    const R = Math.max(240, sceneSphere.radius * 1.05);
    Object.assign(key.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 10, far: R * 2 + 1400 });
    key.shadow.camera.updateProjectionMatrix();
    key.position.copy(sceneSphere.center).add(new T.Vector3(220, 420, 260).normalize().multiplyScalar(Math.max(547, R + 420)));
    key.target.position.copy(sceneSphere.center);
    scene.add(key.target);
    controls.maxDistance = Math.max(1400, sceneSphere.radius * 7);
    camera.far = Math.max(6000, sceneSphere.radius * 16);
  }

  // Per-object highlight materials (clone on first highlight).
  const highlightOn = (entry, on, level = 1) => {
    if (on && level <= 0) on = false;
    for (const n of entry.nodes) n.traverse((c) => {
      if (!c.isMesh || !c.material || !('emissive' in c.material)) return;
      if (on && !c.userData.ownMat) { c.material = c.material.clone(); c.userData.ownMat = true; c.userData.baseEmissive = c.material.emissive.getHex(); c.userData.baseEI = c.material.emissiveIntensity; }
      if (!c.userData.ownMat) return;
      if (on) { c.material.emissive.setHex(0x2f6bff); c.material.emissiveIntensity = (entry.obj.kind === 'fastener' || entry.obj.kind === 'tie' ? 0.55 : 0.12) * level; }
      else { c.material.emissive.setHex(c.userData.baseEmissive); c.material.emissiveIntensity = c.userData.baseEI; }
    });
  };
  const ghostOn = (entry, on) => {
    for (const n of entry.nodes) n.traverse((c) => {
      if (!c.isMesh || !c.material) return;
      if (on && !c.userData.ghostMat) { c.userData.solidMat = c.material; c.userData.ghostMat = new T.MeshBasicMaterial({ color: 0x7f8ea3, transparent: true, opacity: 0.12, depthWrite: false }); }
      if (c.userData.ghostMat) c.material = on ? c.userData.ghostMat : c.userData.solidMat;
      c.castShadow = !on;
    });
  };

  // ---------- Labels ----------
  const labelLayer = document.createElement('div');
  if (hotspots) labelLayer.className = 'vhots'; else labelLayer.setAttribute('aria-hidden', 'true');
  container.append(labelLayer);
  let labels = [];
  const setLabels = (entries) => {
    labelLayer.innerHTML = '';
    const list = entries.filter((e) => e.part);
    if (hotspots) list.sort((a, b) => (a.obj.order || 0) - (b.obj.order || 0));
    labels = list.map((e, i) => {
      let el;
      const n = e.obj.kind === 'fastener' ? e.obj.at.length : 1;
      if (hotspots) {
        // Numbered spots in the order the parts go in: 1 is where to start.
        el = document.createElement('button');
        el.type = 'button';
        el.className = `vhot${i === 0 ? ' start' : ''}`;
        el.textContent = String(i + 1);
        el.setAttribute('aria-label', `${i + 1}. ${n > 1 ? `${n} × ` : ''}${e.part.name}`);
        el.addEventListener('click', (ev) => { ev.stopPropagation(); onPick?.(e.part, e); });
      } else {
        el = document.createElement('div');
        el.className = 'vlabel';
        el.textContent = e.obj.kind === 'fastener' ? `${n}× ${sizeLabel(e.part) || e.part.id}` : e.part.name.split(',')[0];
      }
      labelLayer.append(el);
      const center = new T.Vector3();
      if (e.obj.kind === 'fastener') {
        const dir = new T.Vector3(...e.obj.dir).normalize();
        // Numbered spots sit on the first screw (where to start); plain labels in the middle of the group.
        if (hotspots) center.set(...e.obj.at[0]);
        else { e.obj.at.forEach((a) => center.add(new T.Vector3(...a))); center.multiplyScalar(1 / e.obj.at.length); }
        center.addScaledVector(dir, -8);
      }
      else if (e.obj.pos) center.set(...e.obj.pos);
      else if (e.obj.points) center.set(...e.obj.points[Math.floor(e.obj.points.length / 2)]);
      return { el, center, entry: e };
    });
  };
  const v = new T.Vector3();
  const placeLabels = () => {
    const w = container.clientWidth, h = container.clientHeight;
    const placed = [];
    const since = anim ? performance.now() - anim.t0 : 0;
    for (const l of labels) {
      v.copy(l.center).project(camera);
      let x = ((v.x + 1) / 2) * w, y = ((1 - v.y) / 2) * h;
      // While the parts fly in, each number appears when its part has landed.
      const waiting = holdLabels || (anim && (anim.doneAt?.get(l.entry) ?? anim.end) > since);
      const hidden = v.z > 1 || focused || waiting || y > h - insets.bottom + 8 || y < insets.top - 8;
      l.el.style.display = hidden ? 'none' : '';
      if (hidden) continue;
      const lw = l.el.offsetWidth || 90;
      // Nudge labels apart so two never cover each other.
      for (let k = 0; k < 6; k++) {
        const clash = placed.find((p) => Math.abs(p.y - y) < 24 && Math.abs(p.x - x) < (p.w + lw) / 2 + 4);
        if (!clash) break;
        y = clash.y + (y >= clash.y ? 26 : -26);
      }
      placed.push({ x, y, w: lw });
      l.el.style.left = `${x}px`;
      l.el.style.top = `${y}px`;
    }
  };

  // ---------- State ----------
  let current = mode === 'overview' ? Infinity : 0;
  let focused = null; // entries shown alone, close up
  let focusPred = null;
  let holdLabels = false;
  let playTimer = 0;
  let fade = null; // { t0, entries }: the step's highlight fading out after the parts have landed
  let insets = { top: insets0?.top || 0, bottom: insets0?.bottom || 0 }; // px covered by the page's own panels
  controls.autoRotateSpeed = 0.8;
  const spin = (on) => { controls.autoRotate = !!on && !reduce && current === Infinity; dirty = true; };
  controls.addEventListener('start', () => { if (controls.autoRotate) controls.autoRotate = false; });
  let exploded = false;
  let ghost = false;
  let anim = null;
  let camAnim = null;
  let dirty = true;
  let raf = 0;
  let running = true;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const applyVisibility = () => {
    focused = null;
    fade = null;
    for (const e of groups) {
      const visible = e.base || e.stepIdx <= current || ghost;
      const isGhost = !e.base && e.stepIdx > current && ghost;
      for (const n of e.nodes) n.visible = visible;
      ghostOn(e, isGhost);
      highlightOn(e, current !== Infinity && e.stepIdx === current);
    }
    for (const it of items) {
      const pos = it.final.pos.clone();
      if (exploded && current === Infinity && !it.entry.base) pos.add(it.offset.clone().multiplyScalar(0.9));
      it.node.position.copy(pos);
      it.node.quaternion.copy(it.final.quat);
    }
    for (const e of groups) {
      const wm = e.nodes[0]?.userData.wallMat;
      if (!wm) continue;
      const xr = current !== Infinity;
      wm.transparent = xr; wm.opacity = xr ? 0.2 : 1; wm.depthWrite = !xr; wm.needsUpdate = true;
    }
    setLabels(current === Infinity ? [] : groups.filter((e) => e.stepIdx === current));
    dirty = true;
  };

  // ---------- Framing ----------
  // The page may cover the top and bottom of the view with its own panels: the model is framed in what is left.
  const visFrac = () => { const h = container.clientHeight || 1; return Math.min(1, Math.max(0.3, (h - insets.top - insets.bottom) / h)); };
  const applyOffset = () => {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    const dy = Math.round((insets.bottom - insets.top) / 2);
    if (dy) camera.setViewOffset(w, h, 0, dy, w, h); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  };
  /** Corners of every visible mesh of these nodes, in world space. */
  const cornersOf = (nodes) => {
    const pts = [];
    const b = new T.Box3();
    for (const n of nodes) {
      if (!n.visible) continue;
      n.traverseVisible((c) => {
        if (!c.isMesh || !c.geometry) return;
        if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
        b.copy(c.geometry.boundingBox);
        for (let i = 0; i < 8; i++) pts.push(new T.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(c.matrixWorld));
      });
    }
    return pts;
  };
  /** Where to aim and how far back along dir the camera must be for all these points to fit the visible part of the view. */
  const fitPoints = (pts, dir, cam, { frac = 1, margin = 1.12, minR = 0 } = {}) => {
    const fw = dir.clone().negate().normalize();
    let up = new T.Vector3(0, 1, 0);
    if (Math.abs(fw.dot(up)) > 0.98) up = new T.Vector3(0, 0, -1);
    const rt = new T.Vector3().crossVectors(fw, up).normalize();
    const uv = new T.Vector3().crossVectors(rt, fw).normalize();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of pts) {
      const x = p.dot(rt), y = p.dot(uv), z = p.dot(fw);
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    const center = rt.clone().multiplyScalar((x0 + x1) / 2).addScaledVector(uv, (y0 + y1) / 2).addScaledVector(fw, (z0 + z1) / 2);
    const tan = Math.tan((cam.fov * Math.PI) / 360);
    const tv = (tan * frac) / margin, th = (tan * cam.aspect) / margin;
    const q = new T.Vector3();
    let d = minR / Math.min(tv, th);
    for (const p of pts) {
      q.copy(p).sub(center);
      const z = q.dot(fw);
      d = Math.max(d, Math.abs(q.dot(rt)) / th - z, Math.abs(q.dot(uv)) / tv - z);
    }
    return { center, dist: d };
  };
  const clampDist = (d) => Math.min(controls.maxDistance * 0.98, Math.max(controls.minDistance + 10, d));

  // Frame the parts of the current step (or the whole device) from the direction given in the data.
  const fitted = (camDef) => {
    const def = camDef || scn.overview;
    const focus = current === Infinity ? groups : groups.filter((e) => e.stepIdx === current);
    root.updateMatrixWorld(true);
    const pts = cornersOf(focus.flatMap((e) => e.nodes));
    if (!pts.length) return def;
    const dir = new T.Vector3(...def.pos).sub(new T.Vector3(...def.target)).normalize();
    const { center, dist } = fitPoints(pts, dir, camera, current === Infinity ? { frac: visFrac(), minR: 120 } : { frac: visFrac(), margin: hotspots ? 1.3 : 1.12, minR: hotspots ? 85 : 55 });
    return { pos: center.clone().addScaledVector(dir, clampDist(dist)).toArray(), target: center.toArray() };
  };

  const flyTo = (camDef, instant = false) => {
    const pos = new T.Vector3(...(camDef?.pos || scn.overview.pos));
    const tgt = new T.Vector3(...(camDef?.target || scn.overview.target));
    if (instant || reduce) { camera.position.copy(pos); controls.target.copy(tgt); controls.update(); dirty = true; return; }
    camAnim = { t0: performance.now(), dur: 900, p0: camera.position.clone(), t0v: controls.target.clone(), p1: pos, t1: tgt };
  };

  const playStep = () => {
    holdLabels = false;
    dirty = true;
    if (current === Infinity || reduce) return;
    const its = items.filter((it) => it.entry.stepIdx === current).sort((a, b) => a.order - b.order);
    if (!its.length) return;
    fade = null;
    for (const e of groups) if (e.stepIdx === current) highlightOn(e, true);
    const orders = [...new Set(its.map((i) => i.order))];
    const t0 = performance.now();
    const per = 850, gap = 220;
    anim = { t0, its: its.map((it) => {
      const oi = orders.indexOf(it.order);
      const sameOrder = its.filter((x) => x.order === it.order);
      const k = sameOrder.indexOf(it);
      return { it, start: oi * (per + 150) + k * 90, dur: per };
    }) };
    anim.end = Math.max(...anim.its.map((a) => a.start + a.dur)) + gap;
    anim.doneAt = new Map();
    for (const a of anim.its) anim.doneAt.set(a.it.entry, Math.max(anim.doneAt.get(a.it.entry) || 0, a.start + a.dur));
    for (const a of anim.its) { a.it.node.position.copy(a.it.final.pos).add(a.it.offset); }
  };

  const tick = (now) => {
    if (!running) return;
    raf = requestAnimationFrame(tick);
    if (camAnim) {
      const k = Math.min(1, (now - camAnim.t0) / camAnim.dur);
      const e = ease(k);
      camera.position.lerpVectors(camAnim.p0, camAnim.p1, e);
      controls.target.lerpVectors(camAnim.t0v, camAnim.t1, e);
      if (k >= 1) camAnim = null;
      dirty = true;
    }
    if (controls.update()) dirty = true;
    if (anim) {
      const el = now - anim.t0;
      for (const a of anim.its) {
        const k = Math.max(0, Math.min(1, (el - a.start) / a.dur));
        const e = easeOut(k);
        a.it.node.position.copy(a.it.final.pos).addScaledVector(a.it.offset, 1 - e);
        a.it.node.quaternion.copy(a.it.final.quat);
        if (a.it.spin && k < 1) {
          const qs = new T.Quaternion().setFromAxisAngle(a.it.spin, (1 - e) * a.it.turns * Math.PI * 2);
          a.it.node.quaternion.premultiply(qs);
        }
      }
      if (el > anim.end) {
        anim = null;
        for (const it of items) if (it.entry.stepIdx === current) { it.node.position.copy(it.final.pos); it.node.quaternion.copy(it.final.quat); }
        if (hotspots && !focused) fade = { t0: now, entries: groups.filter((e) => e.stepIdx === current) };
      }
      dirty = true;
    }
    if (fade) {
      const k = Math.min(1, (now - fade.t0) / 1400);
      for (const e of fade.entries) highlightOn(e, k < 1, 1 - easeOut(k));
      if (k >= 1) fade = null;
      dirty = true;
    }
    if (current === Infinity && !exploded && !reduce) for (const e of groups) if (e.blades) { e.blades.rotation.z -= 0.22; dirty = true; }
    if (dirty) { renderer.render(scene, camera); placeLabels(); dirty = false; }
  };

  const resize = () => {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.9 ? 44 : 32;
    applyOffset();
    camera.updateProjectionMatrix();
    dirty = true;
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  // ---------- Picking ----------
  const ray = new T.Raycaster();
  const ndc = new T.Vector2();
  const tip = document.createElement('div');
  tip.className = 'vtip hidden';
  container.append(tip);
  const pick = (ev) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(root.children, true).filter((h) => isVisible(h.object) && h.object.material !== h.object.userData.ghostMat && !(h.object.userData.xray && current !== Infinity));
    const hit = hits[0];
    if (!hit) return null;
    const id = hit.object.userData.pickId;
    const entry = groups.find((g) => g.obj.id === id);
    return entry ? { entry, x: ev.clientX - r.left, y: ev.clientY - r.top } : null;
  };
  const isVisible = (o) => { while (o) { if (!o.visible) return false; o = o.parent; } return true; };
  const showTip = (p) => {
    if (!p) { tip.classList.add('hidden'); return; }
    const name = p.entry.part ? p.entry.part.name : p.entry.obj.label || p.entry.obj.id;
    tip.innerHTML = '';
    const a = document.createElement('div'); a.textContent = name;
    tip.append(a);
    if (p.entry.part) { const c = document.createElement('div'); c.className = 'c'; c.textContent = p.entry.part.id + (p.entry.stepIdx >= 0 ? ` · ${t('step {n}', { n: p.entry.stepIdx + 1 })}` : ''); tip.append(c); }
    tip.style.left = `${p.x}px`; tip.style.top = `${p.y}px`;
    tip.classList.remove('hidden');
  };
  let down = null;
  let hoverT = 0;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) { down = null; return; }
    down = null;
    const p = pick(e);
    showTip(p);
    if (p?.entry.part) onPick?.(p.entry.part, p.entry);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || down) return;
    const now = performance.now();
    if (now - hoverT < 70) return;
    hoverT = now;
    const p = pick(e);
    canvas.style.cursor = p?.entry.part ? 'pointer' : '';
    showTip(p);
  });
  canvas.addEventListener('pointerleave', () => showTip(null));

  const onVis = () => {
    if (document.hidden) { running = false; cancelAnimationFrame(raf); }
    else if (!running) { running = true; dirty = true; raf = requestAnimationFrame(tick); }
  };
  document.addEventListener('visibilitychange', onVis);

  /** Show one part close up: the camera flies to it and everything else turns to glass. */
  const focusOn = (pred) => {
    const shown = (e) => e.base || e.stepIdx <= current;
    const list = groups.filter((e) => shown(e) && pred(e));
    if (!list.length) return false;
    anim = null;
    fade = null;
    holdLabels = false;
    for (const it of items) { it.node.position.copy(it.final.pos); it.node.quaternion.copy(it.final.quat); }
    for (const e of groups) {
      const mine = list.includes(e);
      for (const n of e.nodes) n.visible = shown(e) || mine;
      ghostOn(e, !mine && shown(e));
      highlightOn(e, false);
    }
    focused = list;
    focusPred = pred;
    spin(false);
    root.updateMatrixWorld(true);
    const dir = camera.position.clone().sub(controls.target).normalize();
    const { center, dist } = fitPoints(cornersOf(list.flatMap((e) => e.nodes)), dir, camera, { frac: visFrac(), margin: 1.7, minR: 12 });
    flyTo({ pos: center.clone().addScaledVector(dir, clampDist(dist)).toArray(), target: center.toArray() });
    dirty = true;
    return true;
  };

  applyVisibility();
  flyTo(fitted(current === Infinity ? scn.overview : scn.cameras?.[steps[0]?.id]), true);
  spin(autoRotate);
  raf = requestAnimationFrame(tick);

  return {
    /** Fly to a part (by id) or a scene object (by its id) and show it alone. */
    focus(partId) { return focusOn((e) => e.part?.id === partId || e.obj.id === partId); },
    clearFocus() {
      if (!focused) return;
      focusPred = null;
      applyVisibility();
      flyTo(fitted(current === Infinity ? scn.overview : scn.cameras?.[steps[current]?.id] || scn.overview));
      spin(autoRotate);
    },
    get focused() { return !!focused; },
    setAutoRotate(on) { autoRotate = on; spin(on); },
    /** A picture of what is on screen now (for product cards), at most maxWidth pixels wide. */
    capture(type = 'image/webp', quality = 0.86, maxWidth = 0) {
      renderer.render(scene, camera);
      if (!maxWidth || canvas.width <= maxWidth) return canvas.toDataURL(type, quality);
      const c2 = document.createElement('canvas');
      c2.width = maxWidth;
      c2.height = Math.round((canvas.height * maxWidth) / canvas.width);
      c2.getContext('2d').drawImage(canvas, 0, 0, c2.width, c2.height);
      return c2.toDataURL(type, quality);
    },
    setStep(stepId, { animate = true, instantCamera = false } = {}) {
      showTip(null);
      current = stepId == null ? Infinity : stepIndex.get(stepId) ?? 0;
      anim = null;
      focusPred = null;
      clearTimeout(playTimer);
      holdLabels = animate && !reduce && current !== Infinity;
      applyVisibility();
      spin(autoRotate);
      flyTo(fitted(current === Infinity ? scn.overview : scn.cameras?.[stepId] || scn.overview), instantCamera);
      if (animate) playTimer = setTimeout(playStep, instantCamera ? 50 : 450);
    },
    /** Keep the model clear of the page's own panels (px from the top and from the bottom of the view). */
    setInsets(top = 0, bottom = 0, { refit = true } = {}) {
      const big = Math.abs(insets.top - top) > 24 || Math.abs(insets.bottom - bottom) > 24;
      if (Math.abs(insets.top - top) < 2 && Math.abs(insets.bottom - bottom) < 2) return;
      insets = { top, bottom };
      applyOffset();
      dirty = true;
      if (!refit || !big) return;
      if (focused && focusPred) focusOn(focusPred);
      else if (!focused) flyTo(fitted(current === Infinity ? scn.overview : scn.cameras?.[steps[current]?.id] || scn.overview));
    },
    /** 3D pictures of single parts on a clear background, for part lists: Map(partId -> PNG data URL). */
    thumbnails({ width = 168, height = 120 } = {}) {
      const out = new Map();
      const dpr = renderer.getPixelRatio();
      const W = Math.round(width * dpr), H = Math.round(height * dpr);
      if (canvas.width < W || canvas.height < H) return out;
      const v4 = () => ({ x: 0, y: 0, z: 0, w: 0, copy(o) { this.x = o.x; this.y = o.y; this.z = o.z; this.w = o.w; return this; } });
      const vp = renderer.getViewport(v4()), sc = renderer.getScissor(v4()), scOn = renderer.getScissorTest();
      const vis = new Map();
      root.traverse((o) => vis.set(o, o.visible));
      const groundOn = ground.visible;
      ground.visible = false;
      const cam = new T.PerspectiveCamera(30, width / height, 1, 20000);
      const dir = new T.Vector3(0.62, 0.55, 1).normalize();
      const pic = document.createElement('canvas');
      pic.width = W; pic.height = H;
      const g2 = pic.getContext('2d');
      renderer.setScissorTest(true);
      renderer.setViewport(0, 0, width, height);
      renderer.setScissor(0, 0, width, height);
      try {
        for (const e of groups) {
          if (!e.part || out.has(e.part.id) || !THUMB_KINDS.has(e.obj.kind)) continue;
          for (const g of groups) for (const n of g.nodes) n.visible = g === e;
          ghostOn(e, false);
          highlightOn(e, false);
          for (const it of items) if (it.entry === e) { it.node.position.copy(it.final.pos); it.node.quaternion.copy(it.final.quat); }
          root.updateMatrixWorld(true);
          const pts = cornersOf(e.nodes);
          if (!pts.length) continue;
          const { center: c, dist: d } = fitPoints(pts, dir, cam, { margin: 1.1, minR: 3 });
          cam.position.copy(c).addScaledVector(dir, d);
          cam.near = Math.max(0.5, d / 40);
          cam.far = d * 4 + 600;
          cam.lookAt(c);
          cam.updateProjectionMatrix();
          renderer.render(scene, cam);
          g2.clearRect(0, 0, W, H);
          g2.drawImage(canvas, 0, canvas.height - H, W, H, 0, 0, W, H);
          out.set(e.part.id, pic.toDataURL('image/png'));
        }
      } finally {
        renderer.setScissorTest(scOn);
        renderer.setScissor(sc.x, sc.y, sc.z, sc.w);
        renderer.setViewport(vp.x, vp.y, vp.z, vp.w);
        for (const [o, on] of vis) o.visible = on;
        ground.visible = groundOn;
        if (focused) { const f = focused; for (const e of groups) ghostOn(e, !f.includes(e) && (e.base || e.stepIdx <= current)); } else applyVisibility();
        renderer.render(scene, camera);
      }
      return out;
    },
    play: playStep,
    setExploded(on) { exploded = on; applyVisibility(); if (current === Infinity) flyTo(fitted(scn.overview)); },
    setGhost(on) { ghost = on; applyVisibility(); },
    resetView() { flyTo(fitted(current === Infinity ? scn.overview : scn.cameras?.[steps[current]?.id] || scn.overview)); },
    dispose() {
      running = false;
      cancelAnimationFrame(raf);
      clearTimeout(playTimer);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      controls.dispose();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const m of ms) { m.map?.dispose(); m.dispose(); }
        if (o.userData.ghostMat) o.userData.ghostMat.dispose();
      });
      envRT.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();
      canvas.remove(); labelLayer.remove(); tip.remove();
    },
  };
}
