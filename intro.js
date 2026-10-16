/* Shehab Shibli portfolio intro film: a 55-second title sequence rendered live in the Golden Hive (hive.js)
   and the project worlds, cut to an original 100 BPM organ score (intro.mp3). Loaded by index.html only when it is needed. */
(function(){
"use strict";
function init(api){
/* =========================================================
   INTRO FILM — 55 seconds, cut to an original organ score at
   100 BPM (intro.mp3, its sound effects mixed in). The hive
   (hive.js) is the set for APIS; each other project is shown in
   its own world (the worlds chunk), entered through the
   honeycomb. This file directs it all: cameras, light, events,
   each world's clock, the cuts and the titles. Every frame is a
   pure function of time, so the film can be played, scrubbed or
   captured frame by frame. It ends on the page's own hero shot
   and hands the hive back to the page.
   ========================================================= */
const {root, PC, LITE, clamp, lerp, eOut, eIO, sstep} = api;
const ov = document.getElementById("intro");
if (ov){
const $ = id => document.getElementById(id);
const audio = $("introAudio"), playBtn = $("introPlay"), playTxt = $("introPlayTxt"), gateSkip = $("introGateSkip"), skipBtn = $("introSkip"), soundBtn = $("introSound");
const gateEl = $("introGate"), ctrlEl = ov.querySelector(".intro-ctrl"), fillEl = $("introFill");
const nameEl = $("introName"), subEl = $("introSub"), replayBtn = $("introReplay"), heroName = $("name");
const INERT = [document.querySelector(".skip"), $("nav"), $("top"), document.querySelector("body > footer"), $("exam")].filter(Boolean);
const DEV = /[?&]introdev\b/.test(location.search);
const BPM = 100, B = 60 / BPM;
// scene starts in beats (4 to the bar): power on, thesis, APIS, the attack, the alerts, five worlds, back in the hive, credentials, the name, hand-off, end
const SB = {power: 0, thesis: 4, apis: 12, attack: 16, alerts: 24, mcp: 28, animal: 36, solar: 44, sos: 52, more: 60, real: 72, creds: 76, name: 80, handoff: 88, end: 92};
const ST = {}; for (const k in SB) ST[k] = SB[k] * B;
const END = ST.end;
const TB = b => b * B;

/* ---------- easing ---------- */
const cl = x => x < 0 ? 0 : x > 1 ? 1 : x;
const ramp = (t, a, d) => cl((t - a) / d);
const eIn = x => x * x * x;
const eOut5 = x => 1 - Math.pow(1 - x, 5);
const eSine = x => .5 - .5 * Math.cos(Math.PI * cl(x));
function bez(x1, y1, x2, y2){
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = t => ((ax * t + bx) * t + cx) * t, sy = t => ((ay * t + by) * t + cy) * t, dx = t => (3 * ax * t + 2 * bx) * t + cx;
  return x => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++){ const e = sx(t) - x; if (Math.abs(e) < 1e-6) return sy(t); const d = dx(t); if (Math.abs(d) < 1e-6) break; t -= e / d; }
    let lo = 0, hi = 1; t = x;
    for (let i = 0; i < 30; i++){ const v = sx(t); if (Math.abs(v - x) < 1e-6) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
    return sy(t);
  };
}
const eMove = bez(.65, 0, .35, 1), eGlide = bez(.4, 0, .2, 1), eDrift = bez(.3, .2, .6, .9);
function rnd(seed){ let s = seed >>> 0 || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ---------- frame size ---------- */
let W = 1, H = 1, PORT = false, NARROW = false;
function layout(){ W = Math.max(1, innerWidth); H = Math.max(1, innerHeight); PORT = H > W * 1.05; NARROW = W < 700; }

/* ---------- the camera: shots are keyframed poses, eased; a pose is relative to the comb ---------- */
// pose: {pos:[x,y,z], tgt:[x,y,z], fov, range, roll, sx, sy}; focus defaults to the camera-to-target distance
const pose = (pos, tgt, fov = 30, o = {}) => Object.assign({pos, tgt, fov, range: null, roll: 0, sx: 0, sy: 0}, o);
function mixP(a, b, u){
  const o = {pos: [0, 0, 0], tgt: [0, 0, 0]};
  for (let i = 0; i < 3; i++){ o.pos[i] = lerp(a.pos[i], b.pos[i], u); o.tgt[i] = lerp(a.tgt[i], b.tgt[i], u); }
  for (const k of ["fov", "roll", "sx", "sy"]) o[k] = lerp(a[k] || 0, b[k] || 0, u);
  o.range = (a.range != null && b.range != null) ? lerp(a.range, b.range, u) : null;
  o.focusAdj = lerp(a.focusAdj || 0, b.focusAdj || 0, u);
  return o;
}
// portrait screens: step back and widen, keep the subject in the upper part (titles sit below)
function fitPose(p){
  if (!PORT) return p;
  const q = {pos: p.pos.slice(), tgt: p.tgt.slice(), fov: Math.min(62, p.fov * 1.42), roll: p.roll, sx: 0, sy: p.portSy != null ? p.portSy : .14, range: p.range, focusAdj: p.focusAdj};
  for (let i = 0; i < 3; i++) q.pos[i] = p.tgt[i] + (p.pos[i] - p.tgt[i]) * 1.12;
  return q;
}
function applyCam(h, p){
  const v = h.view, q = fitPose(p);
  v.pos.set(q.pos[0], q.pos[1], q.pos[2]); v.target.set(q.tgt[0], q.tgt[1], q.tgt[2]);
  v.fov = q.fov; v.roll = q.roll || 0; v.shiftX = q.sx || 0; v.shiftY = q.sy || 0; v.yaw = 0; v.pitch = 0;
  const d = Math.hypot(q.pos[0] - q.tgt[0], q.pos[1] - q.tgt[1], q.pos[2] - q.tgt[2]);
  v.focus = d + (q.focusAdj || 0); v.range = q.range != null ? q.range : d * .36;
}

/* ---------- titles: real text in the page (crisp, true optical sizes), animated per frame from the film clock ---------- */
const SCRIM = document.createElement("div"); SCRIM.className = "intro-scrim"; SCRIM.setAttribute("aria-hidden", "true"); ov.insertBefore(SCRIM, gateEl);
const TT = document.createElement("div"); TT.className = "intro-titles"; TT.setAttribute("aria-hidden", "true"); ov.insertBefore(TT, gateEl);
function scrim(l, r, c, b){ if (PORT){ b = Math.max(b, l, r, c * .8); l = r = 0; c *= .5; } ST_(SCRIM, "--sl", l.toFixed(3)); ST_(SCRIM, "--sr", r.toFixed(3)); ST_(SCRIM, "--sc", c.toFixed(3)); ST_(SCRIM, "--sb", b.toFixed(3)); }
const titles = [];
// a title: html (letters split for the rise), classes for its look, where it sits, when it comes and goes
function title(html, cls, place, tIn, tOut, o = {}){
  const el = document.createElement("div"); el.className = "ft " + cls; el.innerHTML = html;
  if (o.letters){
    const walk = node => { for (const n of [...node.childNodes]){ if (n.nodeType === 3){ const f = document.createDocumentFragment(); for (const ch of n.textContent){ if (ch === " "){ f.append(" "); continue; } const s = document.createElement("span"); s.className = "fl"; s.textContent = ch; f.append(s); } n.replaceWith(f); } else if (n.nodeType === 1) walk(n); } };
    walk(el);
  }
  TT.append(el);
  const t = {el, cls, place, tIn, tOut, o, lts: o.letters ? [...el.querySelectorAll(".fl")] : null, its: o.items ? [...el.querySelectorAll(".it")] : null, shown: false};
  titles.push(t); return t;
}
const ST_ = (el, k, v) => { if (el.__s === undefined) el.__s = {}; if (el.__s[k] !== v){ el.__s[k] = v; el.style.setProperty(k, v); } };
function placeTitle(t){
  const p = typeof t.place === "function" ? t.place() : t.place, el = t.el;
  ST_(el, "left", typeof p.x === "string" ? p.x : (p.x * 100).toFixed(2) + "%"); ST_(el, "top", typeof p.y === "string" ? p.y : (p.y * 100).toFixed(2) + "%");
  ST_(el, "--ax", p.ax == null ? "0%" : (p.ax * -100) + "%"); ST_(el, "--ay", p.ay == null ? "0%" : (p.ay * -100) + "%");
  ST_(el, "text-align", p.al || "left"); ST_(el, "max-width", p.mw ? p.mw : "none");
}
function drawTitles(t){
  for (const T of titles){
    const on = t >= T.tIn - .05 && t <= T.tOut + .7;
    if (!on){ if (T.shown){ T.shown = false; T.el.style.display = "none"; } continue; }
    if (!T.shown){ T.shown = true; T.el.style.display = /\b(lg|lab)\b/.test(T.cls) ? "flex" : "block"; placeTitle(T); }
    const inD = T.o.inD || .55, outD = T.o.outD || .28;
    const outK = eOut(ramp(t, T.tOut, outD)), lift = outK * (T.o.lift == null ? -8 : T.o.lift);
    let a = 1 - outK;
    if (T.lts){
      const n = T.lts.length, st = T.o.stagger == null ? .035 : T.o.stagger;
      for (let i = 0; i < n; i++){
        const p = eOut5(ramp(t, T.tIn + i * st, inD)), L = T.lts[i];
        ST_(L, "opacity", (p * a).toFixed(3)); ST_(L, "transform", p >= 1 ? "none" : `translateY(${((1 - p) * .42).toFixed(3)}em)`);
        ST_(L, "filter", p >= 1 || LITE ? "none" : `blur(${((1 - p) * 7).toFixed(2)}px)`);
      }
      ST_(T.el, "opacity", "1");
    } else {
      const p = eOut5(ramp(t, T.tIn, inD)); a *= p;
      ST_(T.el, "opacity", a.toFixed(3));
      ST_(T.el, "--dy", ((1 - p) * (T.o.rise == null ? 14 : T.o.rise) + lift).toFixed(2) + "px");
    }
    if (T.lts) ST_(T.el, "--dy", lift.toFixed(2) + "px");
    if (T.o.items){ T.o.items.forEach((ti, i) => { const it = T.its[i], p = eOut5(ramp(t, ti, inD)); ST_(it, "opacity", (p * (1 - outK)).toFixed(3)); ST_(it, "transform", p >= 1 ? "none" : `translateY(${((1 - p) * 14).toFixed(2)}px)`); }); }
    if (T.o.count){ const c = T.o.count, k = eOut(ramp(t, c.t0, c.d)), v = c.from + (c.to - c.from) * k; const tx = c.fmt(v); if (T.el.__cv !== tx){ T.el.__cv = tx; c.el(T.el).textContent = tx; } }
  }
}
function relayoutTitles(){ for (const T of titles) if (T.shown) placeTitle(T); }

/* =========================================================
   THE FILM: shots, light, worlds and titles, beat by beat
   ========================================================= */
let F = null;   // everything that depends on the comb (cells, shots), built once the hive exists
// the projects, each in its own world, entered through the honeycomb: their beats, the world's own clock (start, speed),
// the camera's move (from, to: position, target, lens), its depth of field, and where the honeycomb opens from
const WSEG = [
  {key: "mcp", b0: SB.mcp, b1: SB.animal, clock: [7.2, 1], from: [[-3.7, 1.7, 5.9], [-.25, 1.75, -1.4], 32], to: [[2.7, 3.5, 8.1], [.4, 1.9, -1.6], 30], range: 9},
  {key: "animal", b0: SB.animal, b1: SB.solar, clock: [1.6, 1.3], from: [[-6.0, 6.2, 1.6], [-5.6, 1.5, -9.5], 34], to: [[6.2, 13.6, 16.5], [-6.2, 2.4, -15], 34], range: 40, origin: [.86, .52], shift: [.2, 0]},
  {key: "solar", b0: SB.solar, b1: SB.sos, clock: [1.4, 2.9], from: [[.9, 3.2, 4.6], [.4, 1.45, -.1], 32], to: [[2.5, 4.0, 8.3], [.8, 1.35, -.3], 30], range: 14, origin: [.18, .28], shift: [.18, .13]},
  {key: "sos", b0: SB.sos, b1: SB.more, clock: [3.6, 1.55], from: [[2.7, 1.15, 3.9], [-3.0, .1, -.3], 34], to: [[-6.6, 3.6, 12.6], [-1.4, .1, 0], 34], range: 3000, origin: [.5, .86]},
  {key: "relay", b0: SB.more, b1: SB.real, clock: [6.2, 1.3], rail: true, range: 13, origin: [.14, .5], shift: [.2, .05]}];
const CELLAT = {mcp: [-.9, 1.6], animal: [4.5, -2.4], solar: [1.8, 4.4], sos: [6.9, 1.2], relay: [6, 6.2]};   // the cells the page lights for them
function prepare(h){
  const cells = h.cells, R0 = rnd(2026);
  const top = (i, dz = 0) => [cells[i].x, cells[i].y, cells[i].h + dz];
  const near = (x, y, f) => { let best = -1, bd = 1e9; for (const c of cells){ if (f && !f(c)) continue; const d = (c.x - x) ** 2 + (c.y - y) ** 2; if (d < bd){ bd = d; best = c.idx; } } return best; };
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--){ const j = (R0() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const Col = hex => { const n = parseInt(hex.slice(1), 16); return {r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255}; };
  const lin = c => ({r: Math.pow(c.r, 2.2) * 1.4, g: Math.pow(c.g, 2.2) * 1.4, b: Math.pow(c.b, 2.2) * 1.4});   // gem colours as light
  const G = {apis: lin(Col(PC.apis)), mcp: lin(Col(PC.mcp)), animal: lin(Col(PC.animal)), solar: lin(Col(PC.solar)), sos: lin(Col(PC.sos)), scam: lin(Col(PC.scam)), phish: lin(Col(PC.phish)), ai: lin(Col(PC.ai))};
  G.relay = G.scam;
  const c0 = near(0, 0);
  // traffic for the thesis: packets wandering cell to cell
  const walks = []; for (let k = 0; k < 14; k++){ const a = near(-12 + R0() * 18, -6 + R0() * 12), b = near(-8 + R0() * 18, -6 + R0() * 12); const w = h.walk(a, b); if (w.length > 3) walks.push(w.slice(0, 10)); }
  // the attack: from a honey cell on the left, across the comb
  const cA = near(-6.2, -2.4, c => c.kind === 1), attackPath = h.walk(cA, near(1.5, 2.6)).slice(0, 7);
  // the alerts: 2,896 -> 603 is 79.2% fewer, drawn as 150 cells -> 31
  const pool = shuffle(cells.filter(c => c.u < .86).map(c => c.idx));
  const alerts = pool.slice(0, 150), alertsKept = alerts.slice(0, 31), alertsGone = alerts.slice(31);
  const wcell = {}; for (const k in CELLAT) wcell[k] = near(CELLAT[k][0], CELLAT[k][1]);
  const creds = [[-5.4, -6.2], [-2.2, -6.6], [1.2, -6.6], [4.4, -6.1]].map(([x, y]) => near(x, y, c => c.kind !== 2));
  const T0 = top(c0);

  /* ----- the hive's shots (landscape; portrait screens are refit in fitPose) ----- */
  const S = [];
  const shot = (b0, b1, from, to, ease = eGlide) => S.push({a: TB(b0), b: TB(b1), from, to, ease});
  // power on: a macro on the first cell to light
  shot(SB.power, SB.thesis, pose([-1.45, -3.3, T0[2] + 1.95], [T0[0], T0[1] + .05, T0[2] - .08], 30, {range: .75, focusAdj: .1}), pose([-2.4, -5.6, T0[2] + 3.5], [T0[0], T0[1] + .25, T0[2] - .15], 30, {range: 1.5}));
  // thesis: a grazing dolly across the comb while traffic hops from cell to cell
  { const a = [-9, -2.6, 2.3], b = [4, 1.4, 2.3], o = [-1.6, -12.2, 1.9];
    shot(SB.thesis, SB.apis, pose(a.map((v, i) => v + o[i]), a, 34, {range: 6, sy: -.16, focusAdj: -2, portSy: -.05}), pose(b.map((v, i) => v + o[i]), b, 34, {range: 6, sy: -.16, focusAdj: -2, portSy: -.05}), x => x); }
  // APIS: push in on the queen cell
  shot(SB.apis, SB.attack, pose([T0[0] + .9, T0[1] - 4.6, T0[2] + 3.6], [T0[0], T0[1] + .2, T0[2] - .1], 30, {range: 1.3}), pose([T0[0] + .5, T0[1] - 3.7, T0[2] + 2.9], [T0[0], T0[1] + .15, T0[2] - .1], 30, {range: 1.1}));
  // the attack: a medium shot over the lateral movement
  { const m = top(attackPath[3]); m[2] = .5;
    shot(SB.attack, SB.alerts, pose([m[0] - 2.4, m[1] - 9.8, m[2] + 6.6], m, 30, {sx: .14, range: 4.2}), pose([m[0] - .4, m[1] - 9.1, m[2] + 6.0], m, 30, {sx: .14, range: 4.2})); }
  // the alerts: from above, they flare red and most go dark; then the camera dives into the first project's cell (cameraAt)
  shot(SB.alerts, SB.mcp, pose([6, -30, 40], [1, 2, 0], 30, {sx: .2, range: 16, portSy: .2}), pose([3.2, -27.5, 37.5], [1, 2, 0], 30, {sx: .2, range: 16, portSy: .2}));
  // back in the hive: the camera cranes up until the whole comb glows below (it starts as the last world closes into the comb)
  shot(SB.real - 1, SB.creds, pose([-7, -15, 3.8], [0, 2, 1], 34, {}), pose([0, -7.5, 41], [0, 1.5, 0], 34, {roll: .3}), eMove);
  // credentials: a slow track along the comb as each one is sealed in gold
  { const a = top(creds[0]), b = top(creds[3]); a[2] = b[2] = .5; const o = [-1.2, -8.9, 5.9];
    shot(SB.creds, SB.name, pose(a.map((v, i) => v + o[i]), a, 30, {sx: -.17, range: 4.4}), pose(b.map((v, i) => v + o[i]), b, 30, {sx: -.17, range: 4.4}), x => x); }
  // the name: low across the comb, rising toward its heart
  shot(SB.name, SB.handoff, pose([0, -19.5, 2.9], [0, 0, 1.1], 36, {focusAdj: -5, range: 3}), pose([0, -13.5, 8.6], [0, 2.5, .5], 32, {focusAdj: -6, range: 3.5}));
  // a project whose world is not ready (a slow device): a macro on its lit cell instead
  const rot = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a), v[2]];
  const MACRO = {}; WSEG.forEach((s, i) => { const t = top(wcell[s.key]), ang = [-.18, .4, -.2, .62, .1][i];
    const o1 = rot([-2.5, -6.1, 4.4], ang), o2 = rot([-1.9, -5.2, 3.7], ang), tg = [t[0], t[1] + .1, t[2] - .06];
    MACRO[s.key] = [pose(tg.map((v, k) => v + o1[k]), tg, 30, {range: 1.7, sx: .16, sy: .06}), pose(tg.map((v, k) => v + o2[k]), tg, 30, {range: 1.5, sx: .16, sy: .06})]; });
  F = {c0, walks, cA, attackPath, alerts, alertsKept, alertsGone, wcell, creds, G, S, T0, MACRO, use: {}};
  return F;
}
function schedule(h){
  const f = F, A = h.colors.ALERT, W = h.colors.WHITE, Bc = h.colors.BASE, pale = {r: 1, g: .16, b: .07};
  h.clearEvents(); f.use = {};
  // power on
  h.glow(f.c0, TB(.15), {k: 9, inT: TB(1.5), dur: TB(11.5), outT: TB(1)});
  h.set(h.cells[f.c0].nb, TB(2), {k: 3.4, inT: .35, dur: TB(3), outT: .8, stagger: .05});
  h.wave(f.c0, TB(3), {k: 2.4, speed: 7, width: 2.6, life: 3.2});
  // traffic
  f.walks.forEach((w, i) => h.path(w, TB(4.1) + i * TB(.5), {hop: .16 + (i % 3) * .03, k: 6.5, decay: 4, col: i % 4 === 3 ? W : Bc}));
  // APIS: the queen cell burns bright
  h.glow(f.c0, TB(SB.apis), {k: 3.2, inT: .25, dur: TB(3.4), outT: .35, col: W, edge: 1.2, inner: .6});
  // the attack: one host turns red, the infection hops on, the hive raises the alarm, confirms, and seals it
  const P = f.attackPath, hop = TB(.36), a0 = SB.attack;
  h.glow(P[0], TB(a0), {col: A, k: 9, inT: .1, dur: TB(6.6), outT: .6, edge: 1.1, dim: .9});
  h.path(P, TB(a0 + .6), {col: A, hop, k: 7, decay: 2.2});
  P.slice(1).forEach((c, i) => h.glow(c, TB(a0 + .6) + (i + 1) * hop, {col: A, k: 6.5, inT: .12, dur: TB(6.4) - (i + 1) * hop, outT: .6, edge: 1.1, dim: .9}));
  h.wave(P[0], TB(a0 + 2.4), {col: Bc, k: 2.8, speed: 9, width: 2.4, life: 3});
  h.set(P, TB(a0 + 3.6), {col: W, k: 6, inT: .1, dur: .32, outT: .45, inner: .2, edge: 1.7, stagger: .05});
  P.forEach((c, i) => h.seal(c, TB(a0 + 4) + i * .085, TB(SB.handoff + .4) + i * .05, false));
  // the alerts: they flare and 79.2% of them go dark
  h.set(f.alertsKept, TB(SB.alerts + .05), {col: pale, k: 4.6, inT: .14, dur: TB(3.5), outT: .3, stagger: .003, edge: 1.1});
  h.set(f.alertsGone, TB(SB.alerts + .05), {col: pale, k: 4.6, inT: .14, dur: TB(1.1), outT: .42, stagger: .0028, edge: 1.1});
  // the projects' cells light in their gems: the first as the camera dives into it, the rest for the fallback shots
  WSEG.forEach((s, i) => { const col = f.G[s.key], t0 = i === 0 ? TB(s.b0 - 1.6) : TB(s.b0 - .7) - .1, cell = f.wcell[s.key];
    h.glow(cell, t0, {col, k: 11, inT: .3, dur: TB(s.b1 - s.b0 + (i === 0 ? 1.6 : .7)), outT: .3, edge: 1.1});
    h.set(h.cells[cell].nb, t0 + .1, {col, k: 2.6, inT: .4, dur: TB(s.b1 - s.b0), outT: .25, inner: .7, edge: .6}); });
  // back in the hive: the whole comb breathes out
  h.wave(f.c0, TB(SB.real + .2), {col: Bc, k: 2, speed: 5.5, width: 4, life: 5});
  // credentials: a gold cap seals a cell on each of the four notes
  f.creds.forEach((c, i) => { h.seal(c, TB(SB.creds + i) - .42, TB(SB.handoff + .9) + i * .06, false); h.glow(c, TB(SB.creds + i) + .01, {col: W, k: 4, inT: .06, dur: .1, outT: .7, edge: 1.4, inner: .3}); });   // each cap lands on its note
  // the name: light rises from the heart of the comb
  h.wave(f.c0, TB(SB.name + .3), {col: W, k: 1.6, speed: 6, width: 3, life: 4.5, inner: .5, edge: 1.2});
}
// the comb's overall light, by time (set directly every frame, so any frame can be rendered in any order)
function levels(h, t){
  const g = h.glowState; let st = 1;
  if (t < ST.thesis){ const k = eSine(ramp(t, TB(1.6), TB(2))); g.base = k; g.honey = k; st = .015 + .835 * eIn(eSine(ramp(t, TB(.8), TB(2.8)))); }
  else if (t < ST.apis){ g.base = 1; g.honey = 1; st = .85; }
  else if (t < ST.attack){ g.base = .8; g.honey = .7; st = .62; }
  else if (t < ST.alerts){ g.base = .9; g.honey = .8; st = .78; }
  else if (t < ST.mcp){ g.base = .3; g.honey = .12; st = .5; }
  else if (t < ST.real - TB(1)){ g.base = .7; g.honey = .55; st = .62; }
  else if (t < ST.creds){ g.base = 1; g.honey = 1; st = .95; }
  else if (t < ST.name){ g.base = 1; g.honey = .9; st = .85; }
  else { const a = eSine(ramp(t, ST.name, TB(3))), b = eSine(ramp(t, ST.handoff, TB(3.6))); g.base = lerp(.7, 1, b); g.honey = lerp(.75 + .3 * a, 1, b); st = lerp(.38, 1, b); }
  h.studio(st);
}
/* ----- the worlds: which one is on screen, its clock and its camera ----- */
// decide each project's world as its turn comes: ready then, or the hive's macro shot for the whole of it (never a pop)
function decide(t){ for (const s of WSEG) if (F.use[s.key] == null && t >= TB(s.b0 - 2.2)) F.use[s.key] = !!api.worldReady(s.key) && !(DEV && (window.__skipWorlds || []).includes(s.key)); }
// a project shown by the hive (its world is not ready), through the honeycomb sweeps on either side of it
function hiveSeg(t){
  for (let i = 0; i < WSEG.length; i++){ const s = WSEG[i], pv = WSEG[i - 1], nx = WSEG[i + 1]; if (F.use[s.key] !== false) continue;
    const a = TB(s.b0 - (pv && F.use[pv.key] ? .7 : 0)), b = TB(s.b1 + (nx && F.use[nx.key] ? 1.1 : 0));
    if (t >= a && t < b) return s; }
  return null; }
let heroP = null;
// the hive's camera: its shots; the dive into the first project's cell; a project's macro when its world is not ready
function cameraAt(h, t){
  if (t >= ST.handoff){   // the hand-off: glide from the name shot onto the page's own hero shot
    const s8 = F.S[F.S.length - 1], from = mixP(s8.from, s8.to, 1), u = eMove(ramp(t, ST.handoff, TB(3.6)));
    const hp = heroP || (heroP = api.heroPose());
    const to = pose(hp.pos.slice(), hp.tgt.slice(), hp.fov, {sx: hp.sx, sy: hp.sy, roll: hp.roll || 0, range: hp.range});
    const q = mixP(PORT ? fitPose(from) : from, to, u); return applyRaw(h, q, hp, u);
  }
  const hs = hiveSeg(t);
  if (hs){ const [a, b] = F.MACRO[hs.key], u = eGlide(ramp(t, TB(hs.b0 - .7), TB(hs.b1 - hs.b0 + 1.8))); return applyCam(h, mixP(a, b, u)); }
  let s = F.S[0]; for (const x of F.S){ if (t >= x.a) s = x; }
  let p = mixP(s.from, s.to, s.ease(ramp(t, s.a, s.b - s.a)));
  if (t >= ST.alerts && t < ST.real - TB(1)){   // the dive: from the alerts overview straight down into the first project's cell
    const c = h.cells[F.wcell.mcp], tg = [c.x, c.y, c.h + .2], dv = Math.hypot(p.pos[0] - tg[0], p.pos[1] - tg[1], p.pos[2] - tg[2]) || 1, D = 6.2;
    const dive = pose(tg.map((v, i) => v + (p.pos[i] - tg[i]) / dv * D), tg, 26, {range: 3.5});
    p = mixP(p, dive, eIO(ramp(t, TB(SB.mcp - 1.2), TB(1.6))));
  }
  applyCam(h, p);
}
function applyRaw(h, q, hp, u){
  const v = h.view; v.pos.set(q.pos[0], q.pos[1], q.pos[2]); v.target.set(q.tgt[0], q.tgt[1], q.tgt[2]);
  v.fov = q.fov; v.roll = q.roll || 0; v.shiftX = q.sx || 0; v.shiftY = q.sy || 0; v.yaw = 0; v.pitch = 0;
  const d = Math.hypot(q.pos[0] - q.tgt[0], q.pos[1] - q.tgt[1], q.pos[2] - q.tgt[2]);
  v.focus = lerp(d, hp.focus, u); v.range = lerp(d * .36, hp.range, u);
}
// the gold line of the last world: the camera travels along it, slowing at each station (beats 2, 6 and 10 of the segment)
const RX = [-8.3, .9, 8.4], RM = [RX[1] - RX[0], (RX[2] - RX[0]) / 2, RX[2] - RX[1]];
function railX(b){
  const u = b / 4 - .5, s = u - .62 * Math.sin(2 * Math.PI * u) / (2 * Math.PI);
  if (s <= 0) return RX[0] + s * RM[0]; if (s >= 2) return RX[2] + (s - 2) * RM[2];
  const i = s < 1 ? 0 : 1, x = s - i, x2 = x * x, x3 = x2 * x;
  return (2 * x3 - 3 * x2 + 1) * RX[i] + (x3 - 2 * x2 + x) * RM[i] + (-2 * x3 + 3 * x2) * RX[i + 1] + (x3 - x2) * RM[i + 1];
}
const posA = [0, 0, 0], tgtA = [0, 0, 0];
function worldCam(h, s, t){
  const w = h.worlds.get(s.key); if (!w) return;
  if (!s.fn) s.fn = tt => s.clock[0] + (tt - TB(s.b0)) * s.clock[1];
  w.clock = s.fn;
  let fov;
  if (s.rail){ const x = railX((t - TB(s.b0)) / B); posA[0] = x - .5; posA[1] = 3.25; posA[2] = 8.7; tgtA[0] = x + .25; tgtA[1] = 1.12; tgtA[2] = -.55; fov = 30; }
  else {   // one continuous move from the cut in to the cut out (still moving through both sweeps)
    const O = DEV && window.__wseg && window.__wseg[s.key], fr = O && O.from || s.from, to = O && O.to || s.to;   // (dev: try other moves)
    const u = cl((t - TB(s.b0 - .8)) / TB(s.b1 - s.b0 + 2)), e = .3 * u + .7 * eSine(u);
    for (let i = 0; i < 3; i++){ posA[i] = lerp(fr[0][i], to[0][i], e); tgtA[i] = lerp(fr[1][i], to[1][i], e); } fov = lerp(fr[2], to[2], e);
  }
  // a tall screen: a wider lens and a step back (as the page does), the subject raised above the titles
  const a = W / H, g = a < 1.25 ? Math.pow(1.25 / a, .75) : 1, kd = Math.pow(g, .45), kf = Math.pow(g, .55);
  if (g > 1){ for (let i = 0; i < 3; i++) posA[i] = tgtA[i] + (posA[i] - tgtA[i]) * kd; fov = 2 * Math.atan(Math.tan(fov * Math.PI / 360) * kf) * 180 / Math.PI; }
  const v = w.view; v.pos.set(posA[0], posA[1], posA[2]); v.target.set(tgtA[0], tgtA[1], tgtA[2]); v.fov = fov; v.roll = 0; v.yaw = v.pitch = 0;
  const O2 = DEV && window.__wseg && window.__wseg[s.key] && window.__wseg[s.key].shift, sh = O2 || s.shift || [.14, 0];
  v.shiftX = PORT ? 0 : sh[0]; v.shiftY = PORT ? .14 : sh[1];   // the subject right of the titles (they sit lower left), or above them
  v.focus = Math.hypot(posA[0] - tgtA[0], posA[1] - tgtA[1], posA[2] - tgtA[2]); v.range = s.range;
  if (w.aim) w.aim(tgtA[0]);
}
function worldsAt(h, t){
  decide(t);
  const m = h.mix, key = s => F.use[s.key] ? s.key : "hive", sm = (a, b) => sstep(TB(a), TB(b), t);
  m.a = "hive"; m.b = null; m.p = 0; m.ox = .5; m.oy = .5;
  const i = WSEG.findIndex(s => t >= TB(s.b0 - 1.2) && t < TB(s.b1 + 1.2));
  if (i < 0) return;
  const s = WSEG[i], next = WSEG[i + 1];
  if (i === 0 && t < TB(s.b0 + .8)){   // the dive: the comb opens into the first world from its lit cell
    if (!F.use[s.key]) return;
    worldCam(h, s, t); m.b = s.key; m.p = sm(s.b0 - .8, s.b0 + .7);
    const pr = h.project(F.wcell[s.key]); m.ox = clamp(pr.x / W, .02, .98); m.oy = clamp(1 - pr.y / H, .02, .98); return; }
  if (!next && t >= TB(s.b1 - .8)){   // the last world closes back into the comb, toward the middle
    if (!F.use[s.key]) return;
    worldCam(h, s, t); m.b = s.key; m.p = 1 - sm(s.b1 - .8, s.b1 + .9); return; }
  if (next && t >= TB(s.b1 - .7)){   // one world to the next: the honeycomb sweeps across from one side
    const ka = key(s), kb = key(next);
    if (ka !== "hive") worldCam(h, s, t); if (kb !== "hive") worldCam(h, next, t);
    m.a = ka; m.b = kb; m.p = sm(next.b0 - .7, next.b0 + 1.1); m.ox = next.origin[0]; m.oy = next.origin[1]; return; }
  if (F.use[s.key]){ worldCam(h, s, t); m.a = s.key; }
}
// the film is over (or skipped): every world back on the page's own clock
function releaseWorlds(h){ if (h) for (const s of WSEG){ const w = h.worlds.get(s.key); if (w && w.clock === s.fn) w.clock = null; } }
function postAt(h, t){
  const p = h.post;
  p.fade = t < ST.thesis ? eSine(ramp(t, 0, .8)) : 1;
  p.exposure = 1;
  p.haze = t >= ST.name && t < ST.handoff ? .34 * eSine(ramp(t, ST.name, TB(2))) : t >= ST.handoff ? .34 * (1 - eSine(ramp(t, ST.handoff, TB(3)))) : 0;
  p.bloom = t < ST.thesis ? .5 : .38; p.vignette = t < ST.thesis ? 1 : .85; p.dof = 1; p.motes = 1; p.grain = .035;
  // dark scrims under the titles: left for the numbers and the projects, right for the credentials, centre for the big words
  let l = 0, r = 0, c = 0, b = 0;
  if (t < ST.thesis) b = .5 * ramp(t, .2, .4) * (1 - ramp(t, 2.1, .3));
  else if (t < ST.apis){ l = .55; c = .2; }
  else if (t < ST.attack) c = .7;
  else if (t < ST.mcp) l = .95;
  else if (t < ST.real){ l = .62; b = .6; }
  else if (t < ST.creds) c = .75;
  else if (t < ST.name) r = .95;
  else c = .65 * (1 - eSine(ramp(t, ST.handoff, TB(2))));
  scrim(l, r, c, b);
}
/* ----- titles ----- */
const L = (x, y, o = {}) => () => PORT ? Object.assign({x: .07, y: o.py != null ? o.py : .66, al: "left"}, o.port || {}) : Object.assign({x, y}, o.land || {});
const C = (y, o = {}) => () => PORT ? Object.assign({x: .5, y: o.py != null ? o.py : y, ax: .5, ay: .5, al: "center"}, o.port || {}) : {x: .5, y, ax: .5, ay: .5, al: "center"};
const gem = k => `<span class="gem" style="--c:var(--c-${k})" aria-hidden="true"></span>`;
function buildTitles(){
  if (titles.length) return;
  const CUT = b => TB(b) - .3;   // every title is gone by the cut
  title("A portfolio, in under a minute", "q", C(.8, {py: .8}), .35, CUT(SB.thesis) - .15, {inD: .7});
  // thesis
  title("Network defenses", "xl", L(.08, .13, {py: .56}), TB(SB.thesis), CUT(SB.apis), {letters: true, stagger: .028});
  title("modeled on", "xl", L(.08, "calc(13% + 1.08em)", {py: "calc(56% + 1.08em)"}), TB(SB.thesis + 2), CUT(SB.apis), {letters: true, stagger: .03});
  title("living systems.", "xl", L(.08, "calc(13% + 2.16em)", {py: "calc(56% + 2.16em)"}), TB(SB.thesis + 4), CUT(SB.apis), {letters: true, stagger: .03});
  // APIS
  title("APIS", "xxl", C(.45, {py: .62}), TB(SB.apis), CUT(SB.attack), {letters: true, stagger: .07, inD: .8});
  title("Adaptive Protective Immune System", "cap wide", C(.64, {py: .76}), TB(SB.apis + 1), CUT(SB.attack), {inD: .6});
  const num = (html, tIn, tOut, count, y = .34) => title(html, "num", L(.08, y, {py: .58}), tIn, tOut, {inD: .5, count: count && Object.assign({el: el => el.querySelector(".n")}, count)});
  const cap = (txt, cls, tIn, tOut, y, py) => title(txt, "cap " + cls, L(.08, y, {py}), tIn, tOut, {inD: .5});
  title('<span class="gem" style="--c:var(--ruby)" aria-hidden="true"></span>Lateral movement', "lab", L(.08, .22, {py: .52}), TB(SB.attack + .2), CUT(SB.alerts), {inD: .5});
  num('<span class="n">96</span><small>%</small>', TB(SB.attack + 3.8), CUT(SB.alerts), {t0: TB(SB.attack + 3.8), d: TB(1.6), from: 0, to: 96, fmt: v => Math.round(v)});
  cap("of the red team's stolen-credential logins caught", "", TB(SB.attack + 4.1), CUT(SB.alerts), .56, .74);
  cap("166 of 173, real LANL data", "dim", TB(SB.attack + 4.7), CUT(SB.alerts), .64, .82);
  num('<span class="n">79.2</span><small>%</small>', TB(SB.alerts + .3), CUT(SB.mcp) - .4, {t0: TB(SB.alerts + .3), d: TB(1.8), from: 0, to: 79.2, fmt: v => v.toFixed(1)});
  cap("fewer false positives on LANL's real network data", "", TB(SB.alerts + .6), CUT(SB.mcp) - .4, .56, .74);
  cap("2,896 alerts → 603", "dim", TB(SB.alerts + 1.2), CUT(SB.mcp) - .4, .64, .82);
  // the projects, each in its world
  const proj = (k, nm, sub, b0, b1, d0 = .35) => { const t0 = TB(b0) + d0, t1 = CUT(b1);
    title(gem(k) + nm, nm.length > 18 ? "lg long" : "lg", L(.08, .62, {py: .66}), t0, t1, {inD: .5, outD: .24});
    title(sub, "cap", L(.08, "calc(62% + clamp(38px, 4.6vw, 76px) * 1.25)", {py: "calc(66% + clamp(34px, 9vw, 56px) * 1.3)"}), t0 + .18, t1, {inD: .5, outD: .24}); };
  proj("mcp", "MCP Security Proxy", "Every AI-agent tool call, logged in a hash-chained trail", SB.mcp, SB.animal);
  proj("animal", "Animal detection", "~340 ms per frame on a Raspberry Pi 5, cars within 1 km warned", SB.animal, SB.solar);
  proj("solar", "Bio-inspired solar screen", "68% less energy over a phone's office day, simulated", SB.solar, SB.sos);
  proj("sos", "S.O.S", "NASA Space Apps 2025, 3rd place, as team leader", SB.sos, SB.more);
  proj("scam", "ScamShield", "Warns on likely scams, never blocks", SB.more, SB.more + 4, .2);
  proj("phish", "Phishing Detector", "9 of 12 phishing emails caught, 0 false alarms", SB.more + 4, SB.more + 8, .1);
  proj("ai", "Personal AI Assistant", "Memory in SQLite, answers from the Claude API", SB.more + 8, SB.real, .1);
  // back in the hive
  title("tested on", "md", C(.36, {py: .6}), TB(SB.real + .4), CUT(SB.creds), {inD: .7});
  title("real data.", "xxl", C(.5, {py: .7}), TB(SB.real + 1), CUT(SB.creds), {letters: true, stagger: .05, inD: .8});
  // credentials: one list, an entry on each of the four notes
  const items = ["Cisco Certified Network Associate", "AWS Certified Cloud Practitioner", "NASA Space Apps 2025, 3rd place", "Top 100, Jordan's 12th National Technology Parade"];
  title(items.map(nm => `<div class="it">${gem("apis")}<span>${nm}</span></div>`).join(""), "lst", () => PORT ? {x: .07, y: .5} : {x: .58, y: .5, ay: .5}, TB(SB.creds) - .05, CUT(SB.name), {items: [0, 1, 2, 3].map(i => TB(SB.creds + i) - .02), inD: .45});
}

/* =========================================================
   PLAYBACK: the gate, the music as the clock, skip, replay,
   and the hand-off of the hive and the name to the page
   ========================================================= */
// the name: rises letter by letter, then flies into the hero (same font, same size)
const nameAnims = [];
if (nameEl && nameEl.animate){
  nameEl.querySelectorAll(".ch").forEach((c, k) => {
    const a = c.animate([{transform: "perspective(520px) translateY(96%) rotateX(-75deg)", filter: LITE ? "blur(6px)" : "blur(12px)", opacity: 0, easing: "cubic-bezier(.16,1,.3,1)"}, {filter: "blur(2px)", opacity: 1, offset: .55, easing: "cubic-bezier(.16,1,.3,1)"}, {transform: "perspective(520px) translateY(0) rotateX(0deg)", filter: "blur(0px)", opacity: 1}], {duration: 1100, delay: 120 + k * 48, fill: "both"});
    a.pause(); a.currentTime = 0; nameAnims.push(a);
  });
}
let NM = null;
function measureName(){
  nameEl.style.transform = "none";
  const er = nameEl.getBoundingClientRect(), ws = nameEl.querySelectorAll(".w"), r0 = ws[0].getBoundingClientRect(), r1 = ws[1].getBoundingClientRect();
  const bx0 = Math.min(r0.left, r1.left) - er.left, bx1 = Math.max(r0.right, r1.right) - er.left, by0 = r0.top - er.top, by1 = r1.bottom - er.top;
  const s0 = PORT ? 1 : .92, cyT = H * (PORT ? .5 : .47);
  const tx0 = W / 2 - s0 * (bx0 + bx1) / 2, ty0 = cyT - s0 * (by0 + by1) / 2;
  let tx1 = tx0, ty1 = ty0, s1 = s0;
  const hw = heroName && heroName.querySelector(".w");
  if (hw){
    const h0 = hw.getBoundingClientRect(), fs = parseFloat(getComputedStyle(heroName).fontSize) / parseFloat(getComputedStyle(nameEl).fontSize);
    if (h0.width > 0){ s1 = fs; tx1 = h0.left - fs * (r0.left - er.left); ty1 = h0.top - fs * (r0.top - er.top); }
  }
  return {tx0, ty0, s0, tx1, ty1, s1, subY: ty0 + s0 * by1 + 26};
}
let landed = false, released = false;
function heroAnims(){
  const out = [];
  document.querySelectorAll(".hero .status, .hero .thesis, .hero .lede, .hero .cta, .hero .badges, .hero .console").forEach(el => { if (el.getAnimations) el.getAnimations().forEach(a => { if (a.animationName) out.push(a); }); });
  return out;
}
function restartHero(){ heroAnims().forEach(a => { try { a.cancel(); a.play(); } catch (e) {} }); }
function release(){ root.classList.remove("intro-hold"); ov.classList.add("open"); restartHero(); }
function dom(t){
  if (fillEl) fillEl.style.setProperty("--p", cl(t / END).toFixed(4));
  ov.classList.toggle("ending", t >= ST.handoff);
  const nt = t - ST.name;
  if (nt >= 0){
    if (!NM) NM = measureName();
    nameEl.classList.add("show");
    for (const a of nameAnims) a.currentTime = Math.max(0, nt * 1000);
    const f = eMove(ramp(t, ST.handoff + .1, TB(3.2))), lift = -Math.sin(f * Math.PI) * 10;
    nameEl.style.transform = `translate(${lerp(NM.tx0, NM.tx1, f).toFixed(2)}px, ${(lerp(NM.ty0, NM.ty1, f) + lift).toFixed(2)}px) scale(${lerp(NM.s0, NM.s1, f).toFixed(4)})`;
    const si = eOut(ramp(t, TB(SB.name + 2), .6)), sa = si * (1 - eOut(ramp(t, ST.handoff, .35)));
    subEl.style.top = NM.subY.toFixed(1) + "px"; subEl.style.opacity = sa.toFixed(3); subEl.style.transform = `translateY(${((1 - si) * 10).toFixed(1)}px)`;
  } else if (nameEl.classList.contains("show") || (nameAnims.length && nameAnims[0].currentTime)){
    nameEl.classList.remove("show"); subEl.style.opacity = "0"; for (const a of nameAnims) a.currentTime = 0;
  }
  const isLanded = t >= ST.handoff + TB(3.2);
  if (isLanded !== landed){ landed = isLanded; root.classList.toggle("intro-landed", landed); }
  if (isLanded && !released){ released = true; release(); }
  if (!isLanded && ov.classList.contains("open")) ov.classList.remove("open");
}

/* ---------- one frame of the film ---------- */
let H3 = null;
function render(t){
  const h = H3; if (!h) return;
  levels(h, t); cameraAt(h, t); postAt(h, t); worldsAt(h, t);
  h.render(t);
  drawTitles(t);
}
// the gate: the studio is dark, one cell breathes while the visitor decides
function drawGate(gt){
  const h = H3; if (!h) return;
  const g = h.glowState; g.base = 0; g.honey = .05; h.studio(.04 + .1 * eSine(ramp(gt, .2, 2.5)));
  scrim(0, 0, .5, 0);
  const s = h.spot("gate", F.c0, 0xffb43f, {inner: 1, edge: .5}); s.k = (2.2 + 1.2 * Math.sin(gt * 1.6)) * eSine(ramp(gt, 0, 1.2));
  applyCam(h, mixP(F.S[0].from, F.S[0].from, 0)); const m = h.mix; m.a = "hive"; m.b = null; m.p = 0;
  Object.assign(h.post, {fade: eSine(ramp(gt, 0, 1)), exposure: 1, haze: 0, bloom: .5, vignette: 1, dof: 1, motes: 1});
  h.render(gt);
}

/* ---------- playback: the music is the clock ---------- */
let mode = "off", ft = 0, lastNow = 0, raf2 = 0, gateT = 0, stalled = false, stallT0 = 0, audioLive = false, hidHold = false, resumeAudio = false, soundOn = true, capture = false, waitHive = 0;
const setInert = on => INERT.forEach(el => { el.inert = on; });
function jumpTop(){ const d = document.documentElement, sb = d.style.scrollBehavior; d.style.scrollBehavior = "auto"; window.scrollTo(0, 0); d.style.scrollBehavior = sb; }
function warmFonts(){
  if (!document.fonts || !document.fonts.load) return;
  const go = () => { ['500 64px "Bodoni Moda"', 'italic 400 24px "Bodoni Moda"', '400 18px "Instrument Sans"', '500 18px "Instrument Sans"'].forEach(f => document.fonts.load(f, "Network real data 0123456789%").catch(() => {})); };
  const l = document.getElementById("fontcss");
  if (l && l.media !== "all") l.addEventListener("load", go, {once: true}); go();
}
function ensureHive(){
  if (H3) return true;
  const h = api.hive(); if (!h) return false;
  H3 = h; layout(); prepare(h); buildTitles();
  if (playBtn){ playBtn.removeAttribute("aria-busy"); if (playTxt) playTxt.textContent = "Play the intro"; }
  return true;
}
function frame(now){
  raf2 = requestAnimationFrame(frame);
  const dt = Math.min(.1, Math.max(0, (now - lastNow) / 1000)); lastNow = now;
  if (!ensureHive()){ if (api.hiveDead() || (mode === "wait" && now - waitHive > 9000)) giveUp(); return; }
  if (mode === "gate"){ gateT += dt; drawGate(gateT); return; }
  if (mode === "wait"){ mode = "gate"; begin(true); return; }
  if (mode !== "film" || capture) return;
  if (stalled && now - stallT0 > (audioLive ? 1500 : 1200)){ stalled = false; audioLive = false; }
  if (!stalled && !hidHold) ft += dt;
  if (audioLive && !stalled && !audio.paused){ const d = audio.currentTime - ft; if (Math.abs(d) > .3) ft = audio.currentTime; else ft += d * .1; }
  render(ft); dom(ft);
  if (ft >= END) finish();
}
function loop2(){ lastNow = performance.now(); if (!raf2) raf2 = requestAnimationFrame(frame); }
function openGate(){
  mode = "gate"; gateT = 0; ov.classList.remove("playing", "ending", "out");
  if (gateEl) gateEl.inert = false; if (ctrlEl) ctrlEl.inert = true;
  setInert(true); layout(); api.own("film"); api.bootHive(); api.prefetchFilm();
  if (!api.hive() && playBtn){ playBtn.setAttribute("aria-busy", "true"); if (playTxt) playTxt.textContent = "Preparing the hive"; }
  try { audio.preload = "auto"; audio.load(); } catch (e) {}
  warmFonts();
  if (playBtn) playBtn.focus({preventScroll: true});
  loop2();
}
function begin(fromGate){
  if (mode === "film") return;
  if (!ensureHive()){ mode = "wait"; waitHive = performance.now(); try { audio.muted = true; audio.play().then(() => { audio.pause(); audio.muted = false; }, () => { audio.muted = false; }); } catch (e) {} loop2(); return; }
  mode = "film"; ft = 0; stalled = true; stallT0 = performance.now(); audioLive = false; landed = released = false; NM = null; heroP = null;
  jumpTop(); layout(); api.own("film"); api.spotsOff(); H3.spot("gate", F.c0, null, {k: 0});
  schedule(H3);
  ov.classList.add("playing"); ov.classList.remove("ending", "out", "open");
  if (gateEl) gateEl.inert = true; if (ctrlEl) ctrlEl.inert = false;
  root.classList.remove("intro-landed");
  nameEl.classList.remove("show"); subEl.style.opacity = "0"; for (const a of nameAnims) a.currentTime = 0;
  soundBtn.disabled = false; soundBtn.setAttribute("aria-pressed", soundOn ? "true" : "false");
  try { audio.pause(); audio.currentTime = 0; } catch (e) {}
  audio.muted = !soundOn; try { audio.volume = .9; } catch (e) {}
  const p = capture ? null : audio.play();
  if (p && p.catch) p.catch(() => { audioLive = false; stalled = false; soundBtn.disabled = true; });
  if (capture){ stalled = false; }
  skipBtn.focus({preventScroll: true});
  loop2();
}
audio.addEventListener("playing", () => { if (mode !== "film") return; if (!audioLive){ audioLive = true; if (ft > .08){ try { audio.currentTime = ft; } catch (e) {} } } stalled = false; });
audio.addEventListener("waiting", () => { if (mode === "film" && audioLive){ stalled = true; stallT0 = performance.now(); } });
audio.addEventListener("error", () => { audioLive = false; stalled = false; soundBtn.disabled = true; });
function fadeAudio(d){
  if (audio.paused) return;
  const v0 = audio.volume, t0 = performance.now();
  const step = now => { const k = Math.min(1, (now - t0) / (d * 1000)); try { audio.volume = v0 * (1 - k); } catch (e) {} if (k < 1) requestAnimationFrame(step); else { audio.pause(); try { audio.volume = v0; } catch (e) {} } };
  requestAnimationFrame(step);
}
function cleanup(){
  root.classList.remove("intro-show", "intro-hold");
  ov.classList.remove("playing", "ending", "out", "open");
  nameEl.classList.remove("show"); subEl.style.opacity = "0";
  for (const T of titles){ T.shown = false; T.el.style.display = "none"; }
  setInert(false);
  try { sessionStorage.setItem("ss-intro", "seen"); } catch (e) {}
}
function finish(){
  if (mode === "off") return;
  mode = "off"; if (raf2){ cancelAnimationFrame(raf2); raf2 = 0; }
  if (!released){ released = true; root.classList.add("intro-landed"); release(); }
  if (H3){ H3.clearEvents(); releaseWorlds(H3); api.handoff(END, false); }
  cleanup();
  api.setIntro(false);
  if (heroName){ heroName.setAttribute("tabindex", "-1"); heroName.focus({preventScroll: true}); }
}
// skip: the picture dips to black, the page comes up on its own hero shot
function skip(){
  if (mode === "off" || mode === "leaving") return;
  fadeAudio(.35);
  const from = mode;
  if (raf2){ cancelAnimationFrame(raf2); raf2 = 0; }
  mode = "leaving"; ov.classList.add("out");
  const t0 = performance.now(), ft0 = ft, f0 = H3 ? H3.post.fade : 1;
  const dip = now => {
    const k = Math.min(1, (now - t0) / (api.reduced() ? 1 : 380));
    if (H3){ if (from === "film"){ levels(H3, ft0); cameraAt(H3, ft0); postAt(H3, ft0); worldsAt(H3, ft0); } H3.post.fade = f0 * (1 - k); H3.render(from === "film" ? ft0 : gateT); }
    if (k < 1) return requestAnimationFrame(dip);
    root.classList.add("intro-landed"); released = true; root.classList.remove("intro-hold"); restartHero();
    if (H3){ H3.clearEvents(); if (F) H3.spot("gate", F.c0, null, {k: 0}); releaseWorlds(H3); const m = H3.mix; m.a = "hive"; m.b = null; m.p = 0; api.handoff(END, true); }
    mode = "film"; finish();
  };
  requestAnimationFrame(dip);
}
function giveUp(){   // no live hive on this device: no film either, straight to the page
  if (mode === "off") return;
  mode = "off"; if (raf2){ cancelAnimationFrame(raf2); raf2 = 0; }
  root.classList.add("intro-landed"); released = true; release(); cleanup(); api.own("site"); api.setIntro(false);
}
function replay(){
  if (mode !== "off") return;
  root.classList.remove("intro-landed"); root.classList.add("intro-hold", "intro-show");
  api.setIntro(true); setInert(true); api.own("film"); api.prefetchFilm();
  begin(false);
}
playBtn && playBtn.addEventListener("click", () => begin(true));
gateSkip && gateSkip.addEventListener("click", skip);
skipBtn.addEventListener("click", skip);
soundBtn.addEventListener("click", () => { soundOn = !soundOn; audio.muted = !soundOn; soundBtn.setAttribute("aria-pressed", soundOn ? "true" : "false"); });
replayBtn && replayBtn.addEventListener("click", replay);
addEventListener("keydown", e => { if (e.key === "Escape" && (mode === "gate" || mode === "film" || mode === "wait")){ e.preventDefault(); skip(); } });
addEventListener("resize", () => { if (mode === "gate" || mode === "film"){ layout(); NM = null; heroP = null; relayoutTitles(); } });
addEventListener("hive-failed", () => { if (mode !== "off") giveUp(); });
document.addEventListener("visibilitychange", () => {
  if (mode !== "film") return;
  if (document.hidden){ hidHold = true; if (!audio.paused){ audio.pause(); resumeAudio = true; } }
  else { hidHold = false; lastNow = performance.now(); if (resumeAudio){ resumeAudio = false; audio.play().catch(() => {}); } }
});
if (DEV) window.__intro = {
  B, END, ST, SB,
  worlds: () => WSEG.map(s => [s.key, !!api.worldReady(s.key)]),
  prep(){ capture = true; ensureHive(); if (mode === "gate") ov.classList.add("playing"); begin(false); if (raf2){ cancelAnimationFrame(raf2); raf2 = 0; } },
  renderAt(t){ ft = t; render(t); dom(t); if (released){ const ms = (t - ST.handoff - TB(3.2)) * 1000; heroAnims().forEach(a => { a.pause(); a.currentTime = Math.max(0, ms); }); } return t; },
  done(){ capture = false; heroAnims().forEach(a => { try { a.play(); } catch (e) {} }); finish(); }
};
window.__introAPI = {replay};
if (root.classList.contains("intro-show")) openGate();
else if (api.pending === "replay"){ api.pending = null; replay(); }
window.__introReady = true;
}
}
if (window.__site) init(window.__site); else window.__introInit = init;
})();
