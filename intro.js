/* Shehab Shibli · portfolio intro film. A 19-second title sequence drawn live on canvas,
   cut to an original 128 BPM score (intro.mp3). Loaded by index.html only when it is needed. */
(function(){
"use strict";
function init(api){
const {root, C, PC, MONO, LITE, TAU, clamp, lerp, eOut, eIO, rgb, rgba, glow, grain, rng, hexPath, rrect} = api;
/* =========================================================
   INTRO FILM — a 19-second title sequence cut to an original
   128 BPM score (intro.mp3). One scene per bar. It ends by
   flying the name into the hero and opening the page from the
   lens. Everything is drawn live, and every number is real.
   ========================================================= */
{
const ov = document.getElementById("intro"), cv = document.getElementById("introCv");
if (ov && cv && cv.getContext){
const ctx = cv.getContext("2d");
const $ = id => document.getElementById(id);
const audio = $("introAudio"), playBtn = $("introPlay"), gateSkip = $("introGateSkip"), skipBtn = $("introSkip"), soundBtn = $("introSound");
const gateEl = $("introGate"), ctrlEl = ov.querySelector(".intro-ctrl");
const hudNum = $("ihNum"), hudTxt = $("ihTxt"), hudTc = $("ihTc"), hudFill = $("ihFill");
const nameEl = $("introName"), subEl = $("introSub"), ringEl = ov.querySelector(".ig-ring"), replayBtn = $("introReplay");
const heroName = $("name"), lensEl = $("lens"), lensWrap = $("lensWrap");
const INERT = [document.querySelector(".skip"), $("nav"), $("top"), document.querySelector("body > footer"), $("exam")].filter(Boolean);
const DEV = /[?&]introdev\b/.test(location.search);
const INK = "#0A0E0D";
const BPM = 128, B = 60 / BPM, BAR = 4 * B, END = 10 * BAR;
const T = (bar, beat = 0) => bar * BAR + beat * B;

/* ---------- easing and noise ---------- */
const cl = x => x < 0 ? 0 : x > 1 ? 1 : x;
const ramp = (t, a, d) => cl((t - a) / d);
const eIn = x => x * x * x;
const eIn2 = x => x * x;
const eOut5 = x => 1 - Math.pow(1 - x, 5);
const eBack = (x, k = 1.6) => { const u = x - 1; return 1 + (k + 1) * u * u * u + k * u * u; };
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
const eMove = bez(.65, 0, .35, 1);
const hsh = (a, b = 0, c = 0) => { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1274126177)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const pad2 = n => (n < 10 ? "0" : "") + n;

/* ---------- size, safe area, caches ---------- */
let W = 1, H = 1, DPR = 1, S = 1, CX = .5, MY = .5, SH = 1, TOP = 70, BOT = 104, PORT = false;
let CACHE = {}, NM = null, GA = 1;
const cache = (k, f) => CACHE[k] || (CACHE[k] = f());
const TM = new Map();
function layout(){
  W = Math.max(1, innerWidth); H = Math.max(1, innerHeight);
  DPR = Math.min(window.devicePixelRatio || 1, LITE ? 1.5 : 1.75);
  const cw = Math.round(W * DPR), ch = Math.round(H * DPR);
  if (cv.width !== cw || cv.height !== ch){ cv.width = cw; cv.height = ch; }
  S = Math.min(W, H); CX = W / 2; PORT = H > W * 1.08;
  TOP = H < 520 ? 52 : 72; BOT = H < 520 ? 84 : 108;
  SH = H - TOP - BOT; MY = TOP + SH / 2;
  CACHE = {}; NM = null; TM.clear();
}
let VIG = null;
function vig(){
  if (VIG) return VIG;
  const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d");
  const gr = g.createRadialGradient(128, 128, 50, 128, 128, 184); gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,.5)");
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256); return VIG = c;
}
const SPRITES = {};
function sprite(k, fn){ return SPRITES[k] || (SPRITES[k] = fn()); }
// a soft radial disc (for scrims) and a vertical ramp (for title backdrops), drawn once and scaled
const discSpr = () => sprite("disc", () => { const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d"), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128); gr.addColorStop(0, "rgba(6,9,8,.82)"); gr.addColorStop(1, "rgba(6,9,8,0)"); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); return c; });
const rampSpr = () => sprite("ramp", () => { const c = document.createElement("canvas"); c.width = 4; c.height = 256; const g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, "rgba(6,9,8,0)"); gr.addColorStop(.45, "rgba(6,9,8,.82)"); gr.addColorStop(1, "rgba(6,9,8,.9)"); g.fillStyle = gr; g.fillRect(0, 0, 4, 256); return c; });
const gl = (hex, soft, x, y, r, a) => glow(ctx, hex, soft, x, y, r, a * GA);
const fillA = (hex, a) => { ctx.fillStyle = rgba(hex, a * GA); };
const strokeA = (hex, a, w = 1) => { ctx.strokeStyle = rgba(hex, a * GA); ctx.lineWidth = w; };

/* ---------- type ---------- */
const GRO = (px, wt = 900) => `${wt} ${px.toFixed(1)}px "Hanken Grotesk", "Helvetica Neue", Arial, sans-serif`;
const SER = (px, wt = 300) => `italic ${wt} ${px.toFixed(1)}px Newsreader, Georgia, serif`;
const SER4 = px => SER(px, 400);
const MON = (px, wt = 500) => `${wt} ${px.toFixed(1)}px ${MONO}`;
function lay(text, ff, px, tr){
  const f = ff(px), k = f + "|" + tr + "|" + text; let v = TM.get(k); if (v) return v;
  ctx.font = f; const ch = Array.from(text), xs = new Array(ch.length); let s = "";
  for (let i = 0; i < ch.length; i++){ xs[i] = ctx.measureText(s).width + i * tr * px; s += ch[i]; }
  const w = ctx.measureText(text).width + Math.max(0, ch.length - 1) * tr * px;
  const m = ctx.measureText("H"), cap = m.actualBoundingBoxAscent > 0 ? m.actualBoundingBoxAscent : px * .7;
  v = {f, ch, xs, w, cap, px, tr}; TM.set(k, v); return v;
}
/* letter-by-letter text; o.anim(i, n, ch) returns null (skip) or {dx, dy, a, s, r, c, ch} */
function word(text, x, y, ff, px, col, o = {}){
  const tr = o.tr || 0, L1 = lay(text, ff, px, tr), n = L1.ch.length;
  const x0 = o.al === "left" ? x : o.al === "right" ? x - L1.w : x - L1.w / 2;
  ctx.font = L1.f; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  for (let i = 0; i < n; i++){
    let c = L1.ch[i]; if (c === " ") continue;
    let dx = 0, dy = 0, a = o.a == null ? 1 : o.a, s = 1, r = 0, fc = col;
    if (o.anim){ const q = o.anim(i, n, c); if (!q) continue; if (q.dx) dx = q.dx; if (q.dy) dy = q.dy; if (q.a != null) a *= q.a; if (q.s != null) s = q.s; if (q.r) r = q.r; if (q.c) fc = q.c; if (q.ch) c = q.ch; }
    a *= GA; if (a <= .004 || s <= .001) continue;
    const lx = x0 + L1.xs[i] + dx, ly = y + dy;
    ctx.globalAlpha = a > 1 ? 1 : a; ctx.fillStyle = fc;
    if (s !== 1 || r){
      const cw = (i + 1 < n ? L1.xs[i + 1] - tr * px : L1.w) - L1.xs[i];
      ctx.save(); ctx.translate(lx + cw / 2, ly - L1.cap / 2); if (r) ctx.rotate(r); ctx.scale(s, s); ctx.fillText(c, -cw / 2, L1.cap / 2); ctx.restore();
    } else ctx.fillText(c, lx, ly);
  }
  ctx.globalAlpha = 1;
  return {x0, w: L1.w, cap: L1.cap, xs: L1.xs, n, px};
}
function fit(text, ff, maxW, maxPx, tr = 0){ const L1 = lay(text, ff, 100, tr); return Math.max(9, Math.min(maxPx, maxW / L1.w * 100)); }
function txt(text, x, y, ff, px, col, a = 1, al = "left", tr = 0){ if (a <= .004) return null; return word(text, x, y, ff, px, col, {tr, al, a}); }
/* mono typing with a block cursor; the line never shifts while it types */
function typed(text, x, y, px, col, k, al = "left", tr = .14, a = 1){
  if (k <= 0 || a <= .004) return;
  const L1 = lay(text, MON, px, tr), n = L1.ch.length, m = Math.min(n, Math.floor(k * n + 1e-6));
  const x0 = al === "right" ? x - L1.w : al === "center" ? x - L1.w / 2 : x;
  word(text, x0, y, MON, px, col, {tr, al: "left", a, anim: i => i < m ? {} : null});
  if (k < 1){ const cx2 = x0 + (m < n ? L1.xs[m] : L1.w + tr * px); ctx.globalAlpha = a * GA; ctx.fillStyle = col; ctx.fillRect(cx2 + 1, y - L1.cap, px * .55, L1.cap); ctx.globalAlpha = 1; }
}
function lines(text, ff, px, tr, maxW){
  const ws = text.split(" "), out = []; let cur = "";
  for (const w of ws){ const t2 = cur ? cur + " " + w : w; if (cur && lay(t2, ff, px, tr).w > maxW){ out.push(cur); cur = w; } else cur = t2; }
  if (cur) out.push(cur); return out;
}

/* ---------- shared pieces ---------- */
function dust(t, a){
  if (a <= .01) return;
  const D = cache("dust", () => { const R = rng(5), n = LITE ? 40 : 90, P = []; for (let i = 0; i < n; i++) P.push({x: R() * W, y: R() * H, z: R(), ph: R() * TAU, s: .6 + R() * 1.3}); return P; });
  for (const p of D){
    const y = ((p.y - t * (5 + 18 * p.z)) % H + H) % H, x = p.x + Math.sin(t * .4 + p.ph) * 10 * p.z;
    fillA(p.z > .72 ? C.lumen : C.bone, (.06 + .24 * p.z) * a); ctx.fillRect(x, y, p.s, p.s);
  }
}
/* the microscope ring: arc, ticks, dashed inner ring, a lamp-coloured head while drawing */
function lensRing(x, y, R, p, t, a, idx = true){
  if (a <= .01 || R < 3 || p <= 0) return;
  const a0 = -Math.PI / 2, a1 = a0 + p * TAU;
  strokeA(C.bone, .55 * a, 1.25); ctx.beginPath(); ctx.arc(x, y, R, a0, a1); ctx.stroke();
  const N = R > 150 ? 120 : R > 60 ? 60 : 30, lim = Math.floor(p * N + 1e-6);
  ctx.beginPath();
  for (let i = 0; i < lim; i++){
    const an = a0 + i / N * TAU, len = i % 10 === 0 ? 10 : i % 5 === 0 ? 6 : 3, c = Math.cos(an), s = Math.sin(an);
    ctx.moveTo(x + c * (R + 4), y + s * (R + 4)); ctx.lineTo(x + c * (R + 4 + len), y + s * (R + 4 + len));
  }
  strokeA(C.faint, .85 * a, 1); ctx.stroke();
  ctx.setLineDash([2, 7]); ctx.lineDashOffset = -t * 18; strokeA(C.bone, .16 * a, 1);
  ctx.beginPath(); ctx.arc(x, y, R * .93, a0, a1); ctx.stroke(); ctx.setLineDash([]);
  if (p < 1){ const c = Math.cos(a1), s = Math.sin(a1); gl(C.lumen, 1, x + c * R, y + s * R, 16, .9 * a); fillA(C.lumen, a); ctx.beginPath(); ctx.arc(x + c * R, y + s * R, 2.3, 0, TAU); ctx.fill(); }
  if (idx){ fillA(C.lumen, a); ctx.fillRect(x - .5, y - R - 19, 1, 16); }
}
const HB = [[0, 1], [.17, .62], [2 * B, 1], [2 * B + .17, .62]];
function heart(t){ let h = 0; for (const [ht, s] of HB) if (t >= ht) h += s * Math.exp(-(t - ht) * 8); return h; }
function kickAge(t){
  const bar = Math.floor(t / BAR); if (bar < 1 || bar > 7) return 9;
  const lt = t - bar * BAR; if (bar === 5) return lt;
  return lt - Math.floor(lt / B) * B;
}

/* ---------- 00 power on: a heartbeat, the lens draws itself, two stains merge ---------- */
let G0 = null;   // the gate's ring, so the film starts where the gate left off
const S0 = {world(t){
  const R = Math.min(S * .29, 290), x = CX, y = MY, h = heart(t);
  const zt = t - 3 * B, z = zt > 0 ? cl(zt / (BAR - 3 * B)) : 0, zs = 1 + z * z * z * 18 + z * 1.2;
  ctx.save(); ctx.translate(x, y); ctx.scale(zs, zs); ctx.translate(-x, -y);
  dust(t, eOut(ramp(t, 0, .8)) * (1 - z));
  const fa = eOut(ramp(t, .06, .5)), sp = eIO(ramp(t, .28, 1.15)), ang = .7 + t * 1.7, d = R * .42 * (1 - sp);
  ctx.globalCompositeOperation = "lighter";
  gl(C.net, 2, x + Math.cos(ang) * d, y + Math.sin(ang) * d, R * .6, .5 * fa);
  gl(C.auth, 2, x - Math.cos(ang) * d, y - Math.sin(ang) * d, R * .6, .5 * fa);
  gl(C.merge, 1, x, y, R * (.1 + .45 * sp) * (1 + h * .22), (.18 + .5 * sp) * fa + h * .22);
  ctx.globalCompositeOperation = "source-over";
  gl(C.merge, 0, x, y, 10 + h * 34, .95);
  fillA(C.merge, 1); ctx.beginPath(); ctx.arc(x, y, 2 + h * 1.4, 0, TAU); ctx.fill();
  for (const [ht, s] of HB){ const age = t - ht; if (age < 0 || age > 1) continue; strokeA(C.merge, s * .42 * (1 - age), 1.1); ctx.beginPath(); ctx.arc(x, y, R * (.05 + 1.35 * eOut(age)), 0, TAU); ctx.stroke(); }
  const q = eOut(ramp(t, .25, .6));
  if (q > 0){
    const len = (R - 16) * q; strokeA(C.bone, .24, 1); ctx.beginPath();
    ctx.moveTo(x - len, y); ctx.lineTo(x - 10, y); ctx.moveTo(x + 10, y); ctx.lineTo(x + len, y);
    ctx.moveTo(x, y - len); ctx.lineTo(x, y - 10); ctx.moveTo(x, y + 10); ctx.lineTo(x, y + len);
    for (let s = 20; s < len; s += 20){ const k = s % 100 === 0 ? 5 : 2.5; ctx.moveTo(x + s, y - k); ctx.lineTo(x + s, y + k); ctx.moveTo(x - s, y - k); ctx.lineTo(x - s, y + k); ctx.moveTo(x - k, y + s); ctx.lineTo(x + k, y + s); ctx.moveTo(x - k, y - s); ctx.lineTo(x + k, y - s); }
    ctx.stroke();
  }
  lensRing(x, y, R, eOut(ramp(t, .06, 1.0)), t, 1);
  const la = eOut(ramp(t, .55, .4)) * (1 - z), mp = clamp(S * .014, 9, 11);
  if (x + R * .72 + 16 + lay("40× · N.A. 0.65", MON, mp, .12).w < W - 12) txt("40× · N.A. 0.65", x + R * .72 + 16, y + R * .72 + 18, MON, mp, C.faint, la, "left", .12);
  if (x - R * .72 - 16 - lay("FIG. 00", MON, mp, .12).w > 12) txt("FIG. 00", x - R * .72 - 16, y - R * .72 - 10, MON, mp, C.faint, la, "right", .12);
  const cpx = clamp(S * .034, 17, 28);
  word("a portfolio, in nineteen seconds", x, y + R + 34 + cpx, SER, cpx, C.mute, {anim: i => { const p = eOut(ramp(t, .5 + i * .016, .45)); return p > 0 ? {dy: (1 - p) * 8, a: p * (1 - z)} : null; }});
  ctx.restore();
  if (G0 && t < .32){
    const k = cl(t / .3), e = eOut(k);
    lensRing(lerp(G0.x, x, e), lerp(G0.y, y, e), G0.r * (1 - eIn2(k)), 1, t, 1 - k);
  }
}};

/* ---------- 01 thesis: one word per beat ---------- */
const GLY = "ABCDEFGHKMNORSTWXZ#/<>01";
const WORDS = [
  {t:"NETWORK", sub:"HOSTS · FLOWS · LOGINS"},
  {t:"DEFENSES", sub:"LEARN · CONFIRM · RESPOND", flood:true},
  {t:"MODELED ON", sub:"BIOMIMICRY", acc:8},
  {t:"living systems.", sub:"HONEYBEES · MOTH EYES · FIREFLIES", serif:true}
];
function cells(t, a){
  for (let i = 0; i < 9; i++){
    const col = i % 3 === 0 ? C.net : i % 3 === 1 ? C.auth : C.host;
    const x = W * (.06 + .88 * hsh(i, 1, 4)) + Math.sin(t * .9 + i) * 14, y = TOP + SH * (.04 + .92 * hsh(i, 2, 4)) + Math.cos(t * .7 + i * 2) * 12, r = S * (.045 + .07 * hsh(i, 3, 4));
    gl(col, 2, x, y, r * 1.7, .16 * a);
    strokeA(col, .24 * a, 1); ctx.beginPath();
    for (let j = 0; j <= 28; j++){ const an = j / 28 * TAU, rr = r * (1 + .07 * Math.sin(an * 3 + t * 2.2 + i)); const px = x + Math.cos(an) * rr, py = y + Math.sin(an) * rr; j ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.closePath(); ctx.stroke();
    fillA(col, .45 * a); ctx.beginPath(); ctx.arc(x + r * .22, y - r * .12, r * .15, 0, TAU); ctx.fill();
  }
}
const S1 = {world(t, b, tg){
  const k = Math.min(3, Math.floor(b)), wt = t - k * B, w = WORDS[k], fl = !!w.flood, ser = !!w.serif;
  if (fl){ fillA(C.lumen, 1); const wp = eOut(cl(wt / .07)); ctx.fillRect(-W, lerp(H * 1.2, -H, wp), 3 * W, 4 * H); }
  const oe = 0, push = k === 3 && t > BAR - .34 ? eIn(cl((t - (BAR - .34)) / .34)) : 0;
  if (k === 3) cells(t, eOut(cl(wt / .16)));
  if (push > 0){ const ps = 1 + .07 * push; ctx.save(); ctx.translate(CX, MY); ctx.scale(ps, ps); ctx.translate(-CX, -MY); }
  const ff = ser ? SER : GRO, tr = ser ? -.012 : -.03;
  const px = fit(w.t, ff, W * (PORT ? .92 : .8), Math.min(SH * (ser ? .3 : .34), ser ? 230 : 250), tr);
  const L1 = lay(w.t, ff, px, tr), by = MY + L1.cap / 2, x0 = CX - L1.w / 2, n = L1.ch.length;
  // type-specimen guides
  const ga = (fl ? .16 : .09) * (1 - oe) * eOut(cl(wt / .12)), gcol = fl ? INK : C.bone;
  fillA(gcol, ga); ctx.fillRect(0, Math.round(by), W, 1); ctx.fillRect(0, Math.round(by - L1.cap), W, 1);
  const gp = clamp(S * .012, 9, 10);
  txt("BASELINE", W - 22, by - 6, MON, gp, rgba(gcol, ga * 4.5), 1, "right", .14);
  txt("CAP HEIGHT", W - 22, by - L1.cap - 6, MON, gp, rgba(gcol, ga * 4.5), 1, "right", .14);
  // scramble: for one frame or two the new word is made of the old one
  const prev = k > 0 ? WORDS[k - 1].t : "", fr = Math.floor(tg * 60);
  const scr = (i, c) => { if (k === 0 || wt > .075) return c; if (hsh(fr, i, k) < 1 - wt / .075){ const pc = prev[i]; return pc && pc !== " " && hsh(fr, i, 9) < .6 ? pc : GLY[Math.floor(hsh(fr, i, 5) * GLY.length)]; } return c; };
  let anim;
  if (k === 0) anim = i => { const p = cl((wt - i * .011) / .17); if (p <= 0) return null; return {dy: -(1 - eBack(p, 1.25)) * L1.cap * 1.3, a: cl(p * 4)}; };
  else if (k === 1) anim = (i, nn, c) => { const p = eOut5(cl((wt - i * .01) / .16)); return {dy: (1 - p) * L1.cap * 1.3, ch: scr(i, c)}; };
  else if (k === 2) anim = (i, nn, c) => { const p = eOut(cl((wt - i * .009) / .17)); if (p <= 0) return null; return {dx: (1 - p) * px * .75, a: cl(p * 3), c: i >= w.acc ? C.lumen : null, ch: scr(i, c)}; };
  else anim = (i, nn) => { if (i === nn - 1) return null; const p = eOut(cl((wt - i * .011) / .26)); if (p <= 0) return null; return {dy: (1 - p) * px * .2, r: -(1 - p) * .2, a: p}; };
  if (!fl){
    const ca = 15 * Math.exp(-wt * 11) + 3.5 * Math.exp(-kickAge(tg) * 22);
    if (ca > .5){ ctx.globalCompositeOperation = "lighter"; word(w.t, x0 - ca, by, ff, px, rgba(C.auth, .55), {tr, al: "left", anim}); word(w.t, x0 + ca, by, ff, px, rgba(C.net, .5), {tr, al: "left", anim}); ctx.globalCompositeOperation = "source-over"; }
  }
  if (k === 2){
    const ghost = (m, a) => (i, nn, c) => { const q = anim(i, nn, c); if (!q || !q.dx || q.dx < 1) return null; return {dx: q.dx * m, a: q.a * a, ch: q.ch, c: q.c}; };
    word(w.t, x0, by, ff, px, C.bone, {tr, al: "left", anim: ghost(2.8, .1)});
    word(w.t, x0, by, ff, px, C.bone, {tr, al: "left", anim: ghost(1.8, .22)});
  }
  if (fl){
    ctx.save(); ctx.beginPath(); ctx.rect(-W, by - L1.cap * 1.42, 3 * W, L1.cap * 1.42 + 16); ctx.clip();
    for (let j = 9; j >= 1; j--){ const c = rgb(C.lumen), m = .78 - j * .025; word(w.t, x0 + j * 1.25, by + j * 1.25, ff, px, `rgb(${c[0] * m | 0},${c[1] * m | 0},${c[2] * m | 0})`, {tr, al: "left", anim}); }
    word(w.t, x0, by, ff, px, INK, {tr, al: "left", anim});
    ctx.restore();
  } else word(w.t, x0, by, ff, px, C.bone, {tr, al: "left", anim});
  if (ser){
    const cw = L1.w - L1.xs[n - 1];
    let dx = x0 + L1.xs[n - 1] + cw * .3, dy = by - px * .06, dr = px * .058;
    const pp = Math.max(0, eBack(cl((wt - .2) / .2), 2.4)), pg = Math.exp(-kickAge(tg) * 10);
    gl(C.net, 1, dx, dy, dr * (4.2 + 3 * push), (.6 + .3 * push) * Math.min(1, pp) + .2 * pg);
    fillA(C.net, 1); ctx.beginPath(); ctx.arc(dx, dy, Math.max(0, dr * pp), 0, TAU); ctx.fill();
  }
  const lp = clamp(px * .07, 10, 13), ly = by + (ser ? px * .34 : px * .12) + lp + 12, la = eOut(ramp(wt, .05, .2)) * (1 - oe);
  txt(pad2(k + 1) + " / 04", x0, ly, MON, lp, fl ? rgba(INK, .62) : C.faint, la, "left", .14);
  typed(w.sub, x0 + L1.w, ly, lp, fl ? rgba(INK, .78) : C.mute, ramp(wt, .06, .16), "right", .14, la);
  if (push > 0) ctx.restore();
}};

/* ---------- 02 APIS: the hive grid, a plate that flips to the measured result ---------- */
function hexGrid(){
  return cache("hex", () => {
    const s = clamp(S / 18, 20, 46), w = Math.sqrt(3) * s, h = 1.5 * s, cells = [], dmax = Math.hypot(W, H) / 2;
    const cols = Math.ceil(W / w) + 2, rows = Math.ceil(H / h) + 2;
    for (let r = -1; r < rows; r++) for (let c = -1; c < cols; c++){ const x = c * w + (r & 1 ? w / 2 : 0), y = r * h; cells.push({x, y, d: Math.hypot(x - CX, y - MY) / dmax, q: hsh(r + 50, c + 50, 7)}); }
    const P = clamp(S * .26, 104, 240), anom = [], R = rng(9), on = [1, 3, 4, 6, 7];
    let tries = 0;
    while (anom.length < 5 && tries++ < 900){
      const c = cells[Math.floor(R() * cells.length)];
      if (c.d < .28 || c.d > .85 || c.y < TOP + 30 || c.y > H - BOT - 20 || c.x < 30 || c.x > W - 30) continue;
      if (Math.abs(c.x - CX) < P * 1.25 && Math.abs(c.y - MY) < P * 1.35) continue;
      if (anom.some(a => Math.hypot(a.x - c.x, a.y - c.y) < s * 5)) continue;
      anom.push({x: c.x, y: c.y, on: on[anom.length] * B / 2});
    }
    return {s, cells, anom, P};
  });
}
const S2 = {world(t, b){
  const G = hexGrid(), P = G.P, x = CX, y = MY, nb = Math.min(3, Math.floor(b));
  if (t < .22){ const e = eOut(cl(t / .22)); gl(C.net, 1, x, y, P * (.6 + 1.6 * e), .8 * (1 - e)); fillA(C.net, .55 * (1 - e)); ctx.beginPath(); ctx.arc(x, y, P * (.15 + 1.1 * e), 0, TAU); ctx.fill(); }
  for (const c of G.cells){
    const ap = eOut(cl((t - c.d * .42) / .3)); if (ap <= 0) continue;
    let wv = 0;
    for (let k = 0; k <= nb; k++){ const age = t - k * B; if (age < 0) continue; wv += Math.exp(-Math.pow((c.d - age * 1.6) / .06, 2)) * Math.exp(-age * 1.1); }
    hexPath(ctx, c.x, c.y, G.s * .9 * ap);
    if (c.q < .2 || wv > .05){ fillA(PC.apis, .04 + wv * .22); ctx.fill(); }
    strokeA(PC.apis, (.12 + .5 * wv) * ap, 1); ctx.stroke();
  }
  const fr = Math.floor(t * 60);
  G.anom.forEach((a, i) => {
    const age = t - a.on; if (age < 0 || age > .62) return;
    const al = (age < .08 ? (hsh(fr, i, 3) > .45 ? 1 : .2) : 1) * (1 - eIn(cl((age - .3) / .32)));
    hexPath(ctx, a.x, a.y, G.s * .88); fillA(C.auth, .36 * al); ctx.fill(); strokeA(C.auth, .9 * al, 1.4); ctx.stroke();
    gl(C.auth, 1, a.x, a.y, G.s * 1.9, .5 * al);
    if (i === 0 || i === 3){
      const lx = a.x + (a.x < CX ? -1 : 1) * G.s * 1.6, ly = a.y - G.s * 1.3, mp = clamp(S * .013, 9, 11);
      strokeA(C.auth, .6 * al, 1); ctx.beginPath(); ctx.moveTo(a.x, a.y - G.s * .4); ctx.lineTo(lx, ly); ctx.stroke();
      txt("1 SIGNAL · WATCH ONLY", lx + (a.x < CX ? -4 : 4), ly - 5, MON, mp, C.auth, al, a.x < CX ? "right" : "left", .12);
    }
  });
  // the plate: APIS slams in, then flips to its result
  const kp = Math.exp(-kickAge(T(2) + t) * 9), fl = eIO(ramp(t, 2 * B - .05, .24)), sx = Math.cos(fl * Math.PI), back = fl > .5;
  const slam = eOut(cl(t / .16)), sc0 = 1 + .55 * (1 - slam), pa = cl(t / .04);
  gl(PC.apis, 2, x, y, P * 1.7, (.22 + .2 * kp) * pa);
  for (let j = 0; j < 6; j++){
    const u = (t * .32 + j / 6) % 1, e = Math.floor(u * 6), f = u * 6 - e, a1 = Math.PI / 6 + e * Math.PI / 3, a2 = a1 + Math.PI / 3, rr = P * 1.09;
    const gx = x + lerp(Math.cos(a1), Math.cos(a2), f) * rr, gy = y + lerp(Math.sin(a1), Math.sin(a2), f) * rr;
    gl(C.lumen, 0, gx, gy, 7, .7 * pa); fillA(C.lumen, pa); ctx.fillRect(gx - 1.2, gy - 1.2, 2.4, 2.4);
  }
  ctx.save(); ctx.translate(x, y); ctx.scale(Math.max(.004, Math.abs(sx)) * sc0, sc0);
  hexPath(ctx, 0, 0, P); fillA(C.ground, pa); ctx.fill(); strokeA(C.lumen, pa, (1.6 + kp * 1.2) / sc0); ctx.stroke();
  hexPath(ctx, 0, 0, P * .9); strokeA(C.bone, .14 * pa, 1); ctx.stroke();
  const mp = clamp(P * .062, 9, 13);
  if (!back){
    const apx = fit("APIS", GRO, P * 1.2, P * .62, -.02);
    word("APIS", 0, apx * .2, GRO, apx, C.bone, {tr: -.02, a: pa});
    const k1 = ramp(t, .16, .2), k2 = ramp(t, .34, .16);
    typed("ADAPTIVE PROTECTIVE", 0, apx * .2 + mp * 2.6, mp, C.lumen, k1, "center", .14);
    typed("IMMUNE SYSTEM", 0, apx * .2 + mp * 4.3, mp, C.lumen, k2, "center", .14);
  } else {
    const v = 79.2 * eOut(ramp(t, 2 * B + .08, .5)), npx = fit("79.2%", GRO, P * 1.3, P * .5, -.03);
    word(v.toFixed(1) + "%", 0, npx * .3, GRO, npx, C.bone, {tr: -.03});
    txt("FEWER FALSE POSITIVES", 0, npx * .3 + mp * 2.6, MON, mp, C.lumen, eOut(ramp(t, 2 * B + .15, .2)), "center", .14);
  }
  ctx.restore();
  if (fl > .3 && fl < .7){ const e = 1 - Math.abs(fl - .5) / .2; fillA(C.merge, .9 * e); ctx.fillRect(x - 1, y - P * sc0, 2, P * 2 * sc0); gl(C.merge, 1, x, y, P * .6, .5 * e); }
  const ub = y + P * 1.12 + 26, up = clamp(S * .015, 10, 12);
  typed("ON LANL'S REAL NETWORK DATA · 2,896 → 603", x, ub, up, C.mute, ramp(t, 2.55 * B, .3), "center", .12);
}};

/* ---------- 03 lateral movement: hops on the eighths, two signals agree ---------- */
function graph(){
  return cache("graph", () => {
    const R = rng(42), N = PORT ? 16 : 26, pts = [];
    const x0 = W * .07, x1 = W * .93, y0 = TOP + SH * .06, y1 = TOP + SH * (PORT ? .6 : .94);
    const minD = Math.min(x1 - x0, y1 - y0) * (PORT ? .2 : .16);
    let tries = 0;
    while (pts.length < N && tries++ < 5000){ const p = {x: lerp(x0, x1, R()), y: lerp(y0, y1, R())}; if (pts.every(q => Math.hypot(q.x - p.x, q.y - p.y) > minD)) pts.push(p); }
    const n = pts.length, adj = pts.map(() => new Set()), edges = [];
    for (let i = 0; i < n; i++){
      const nb = pts.map((q, j) => [j, Math.hypot(q.x - pts[i].x, q.y - pts[i].y)]).filter(e => e[0] !== i).sort((a, b) => a[1] - b[1]).slice(0, 3);
      for (const [j] of nb) if (!adj[i].has(j)){ adj[i].add(j); adj[j].add(i); edges.push([i, j]); }
    }
    // the attack ends on the right (where the camera pushes in); it starts four hops back
    let g = 0; pts.forEach((p, i) => { if (p.x > pts[g].x) g = i; });
    const dist = new Array(n).fill(-1), par = new Array(n).fill(-1), q = [g]; dist[g] = 0;
    while (q.length){ const u = q.shift(); for (const v of adj[u]) if (dist[v] < 0){ dist[v] = dist[u] + 1; par[v] = u; q.push(v); } }
    let s = -1; for (let i = 0; i < n; i++) if (dist[i] === 4 && (s < 0 || pts[i].x < pts[s].x)) s = i;
    if (s < 0){ s = 0; for (let i = 0; i < n; i++) if (dist[i] > dist[s]) s = i; }
    const path = []; for (let v = s; v >= 0; v = par[v]) path.push(v);
    return {pts, edges, path, app: pts.map(p => .02 + (p.x - x0) / (x1 - x0) * .2)};
  });
}
const S3 = {
  world(t){
    const G = graph(), P = G.pts, path = G.path, hops = Math.max(1, path.length - 1), hopT = h => h * 2 * B / hops;
    const last = P[path[path.length - 1]], zc = eIO(ramp(t, 2 * B, .45)), dim = 1 - .55 * zc;
    ctx.save(); ctx.translate(last.x, last.y); ctx.scale(1 + .2 * zc, 1 + .2 * zc); ctx.translate(-last.x, -last.y);
    for (const [i, j] of G.edges){
      const p = eOut(cl((t - Math.max(G.app[i], G.app[j]) - .04) / .16)); if (p <= 0) continue;
      const a = P[i], c = P[j]; strokeA(C.bone, .13 * dim, 1); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(lerp(a.x, c.x, p), lerp(a.y, c.y, p)); ctx.stroke();
    }
    const mp = clamp(S * .013, 9, 11);
    for (let h = 1; h <= hops; h++){
      const a = P[path[h - 1]], c = P[path[h]], p = cl((t - (hopT(h) - .11)) / .11); if (p <= 0) continue;
      const e = p * p, hx = lerp(a.x, c.x, e), hy = lerp(a.y, c.y, e);
      strokeA(C.auth, .75, 2); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(hx, hy); ctx.stroke();
      if (p < 1){ gl(C.auth, 0, hx, hy, 12, 1); }
    }
    for (let h = 0; h < path.length; h++){
      const v = P[path[h]], th = h ? hopT(h) : .06, age = t - th; if (age < 0) continue;
      const net = eOut(ramp(t, th + .12, .3)), conf = h === path.length - 1 ? eOut(ramp(t, 2 * B, .2)) : 0;
      ctx.globalCompositeOperation = "lighter";
      gl(C.auth, 2, v.x, v.y, 34 + 10 * h, .32 * (1 - conf * .5));
      if (h > 0) gl(C.net, 2, v.x + 6, v.y - 4, 30 + 8 * h, .3 * net);
      if (conf > 0) gl(C.merge, 1, v.x, v.y, 70 * conf, .7 * conf);
      ctx.globalCompositeOperation = "source-over";
      if (age < .45){ strokeA(C.auth, .8 * (1 - age / .45), 1.2); ctx.beginPath(); ctx.arc(v.x, v.y, 6 + 28 * eOut(age / .45), 0, TAU); ctx.stroke(); }
      txt(h ? String(h) : "ENTRY", v.x + 10, v.y - 10, MON, mp, h ? C.auth : C.bone, eOut(cl(age / .1)) * (1 - zc * .6), "left", .12);
    }
    const onPath = new Set(path);
    P.forEach((v, i) => {
      const p = eBack(cl((t - G.app[i]) / .18), 2); if (p <= 0) return;
      const hit = onPath.has(i) && t >= (path.indexOf(i) ? hopT(path.indexOf(i)) : .06), isLast = i === path[path.length - 1] && t >= 2 * B;
      const col = isLast ? C.merge : hit ? C.auth : C.host;
      if (!hit) gl(C.host, 1, v.x, v.y, 14, .35 * dim);
      ctx.beginPath(); ctx.arc(v.x, v.y, 4 * p, 0, TAU); fillA(C.stage, 1); ctx.fill(); strokeA(col, (hit ? 1 : .8 * dim), 1.6); ctx.stroke();
      if (hit){ fillA(col, 1); ctx.beginPath(); ctx.arc(v.x, v.y, 2, 0, TAU); ctx.fill(); }
    });
    if (t >= 2 * B){
      const st = t - 2 * B, sp = eOut(cl(st / .14)), sc = 1.7 - .7 * sp, sw = clamp(S * .016, 10, 13);
      ctx.save(); ctx.translate(last.x, last.y - 34); ctx.rotate(-.06); ctx.scale(sc, sc);
      const L1 = lay("CONFIRMED", MON, sw, .2), bw = L1.w + 22, bh = sw + 16;
      fillA(C.ground, .85 * sp); ctx.fillRect(-bw / 2, -bh / 2, bw, bh); strokeA(C.merge, sp, 1.6); ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
      txt("CONFIRMED", 0, sw * .36, MON, sw, C.merge, sp, "center", .2);
      ctx.restore();
    }
    ctx.restore();
  },
  ui(t){
    const mp = clamp(S * .013, 9, 11), la = eOut(ramp(t, .5, .2)) * (1 - eOut(ramp(t, 2 * B, .3)));
    if (la > 0){
      let lx = 26, ly = H - BOT - 8;
      for (const [c, s] of [[C.net, "NETWORK"], [C.auth, "IDENTITY"], [C.merge, "BOTH AGREE"]]){ fillA(c, la); ctx.beginPath(); ctx.arc(lx + 4, ly - 4, 4, 0, TAU); ctx.fill(); const r = txt(s, lx + 14, ly, MON, mp, C.mute, la, "left", .12); lx += 14 + (r ? r.w : 60) + 22; }
    }
    if (t < 1) return;
    const k = eOut(ramp(t, 1, .3)), v = Math.round(96 * eOut(ramp(t, 1.02, .4)));
    const npx = PORT ? Math.min(W * .3, SH * .2) : Math.min(SH * .4, W * .17);
    const bx = PORT ? W * .08 : W * .07, nb = PORT ? TOP + SH * .82 : MY + npx * .22;
    const gr = PORT ? ctx.createLinearGradient(0, H, 0, H * .35) : ctx.createLinearGradient(0, 0, W * .62, 0);
    gr.addColorStop(0, rgba(C.ground, .97 * k)); gr.addColorStop(.62, rgba(C.ground, .9 * k)); gr.addColorStop(1, rgba(C.ground, 0));
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    const r = word(v + "%", bx, nb, GRO, npx, C.bone, {tr: -.035, al: "left", anim: i => ({dy: (1 - eOut5(cl((t - 1 - i * .03) / .22))) * npx * .25, a: k})});
    const lp = clamp(S * .017, 11, 15), maxW = PORT ? W * .84 : W * .4;
    const L = lines("OF THE RED TEAM'S STOLEN-CREDENTIAL LOGINS CAUGHT", MON, lp, .1, maxW);
    L.forEach((s, i) => typed(s, bx, nb + 30 + i * lp * 1.55, lp, C.bone, ramp(t, 1.12 + i * .1, .22), "left", .1));
    typed("166 OF 173 · REAL LANL DATA", bx, nb + 30 + L.length * lp * 1.55 + 10, clamp(S * .014, 10, 12), C.lumen, ramp(t, 1.3, .2), "left", .14);
    if (r){ fillA(C.auth, k); ctx.fillRect(bx, nb - npx * .86, 28, 2); }
  }
};

/* ---------- 04 measured: one card per beat, each wiped in with its colour ---------- */
const CARDS = [
  {c: PC.scam, val: 236, fmt: v => String(Math.round(v)), lab: "AUTOMATED TESTS IN THE APIS SUITE", sub: "ADVERSARIAL SCENARIOS INCLUDED", tag: "APIS", viz: "tests"},
  {c: PC.phish, val: 9, fmt: v => Math.round(v) + "/12", lab: "PHISHING EMAILS CAUGHT", sub: "0 FALSE ALARMS ON 12 CLEAN EMAILS", tag: "PHISHING DETECTOR", viz: "mail"},
  {c: PC.animal, val: 340, fmt: v => "~" + Math.round(v), unit: "ms", lab: "PER FRAME ON A RASPBERRY PI 5", sub: "YOLOv5, RUNNING AT THE EDGE", tag: "ANIMAL DETECTION", viz: "frame"},
  {c: PC.solar, val: 68, fmt: v => "−" + Math.round(v), unit: "%", lab: "SCREEN AND MESSAGE ENERGY, ONE OFFICE DAY", sub: "6,300 J → 2,004 J · SIMULATED MODEL", tag: "SOLAR SCREEN MODEL", viz: "energy"}
];
const VIZ = {
  tests(bx, ct){
    const n = 236, cols = bx.w > bx.h * 1.4 ? 20 : 16, rows = Math.ceil(n / cols), sz = Math.min(bx.w / cols, bx.h / rows), g = sz * .26;
    const ox = bx.x + (bx.w - cols * sz) / 2, oy = bx.y + (bx.h - rows * sz) / 2, done = Math.floor(n * eOut(ramp(ct, .05, .32)));
    for (let i = 0; i < n; i++){
      const x = ox + (i % cols) * sz, y = oy + Math.floor(i / cols) * sz;
      if (i < done){ fillA(INK, .82); ctx.fillRect(x + g / 2, y + g / 2, sz - g, sz - g); }
      else { strokeA(INK, .28, 1); ctx.strokeRect(x + g / 2 + .5, y + g / 2 + .5, sz - g - 1, sz - g - 1); }
    }
  },
  mail(bx, ct){
    const missed = new Set([3, 7, 10]), cols = 6, ew = Math.min(bx.w / cols * .78, 64), eh = ew * .66, gx = bx.w / cols;
    const mp = clamp(S * .012, 8, 10);
    for (let i = 0; i < 12; i++){
      const x = bx.x + (i % cols) * gx + (gx - ew) / 2, y = bx.y + Math.floor(i / cols) * (eh + 30), p = eOut(ramp(ct, .04 + i * .02, .12)); if (p <= 0) continue;
      const m = missed.has(i);
      ctx.save(); ctx.translate(x + ew / 2, y + eh / 2); ctx.scale(p, p); ctx.translate(-ew / 2, -eh / 2);
      if (!m){ fillA(INK, .85); ctx.fillRect(0, 0, ew, eh); strokeA(PC.phish, .9, 1.4); }
      else { ctx.setLineDash([3, 3]); strokeA(INK, .55, 1.2); ctx.strokeRect(.5, .5, ew - 1, eh - 1); ctx.setLineDash([]); strokeA(INK, .55, 1.2); }
      ctx.beginPath(); ctx.moveTo(2, 2); ctx.lineTo(ew / 2, eh * .55); ctx.lineTo(ew - 2, 2); ctx.stroke();
      ctx.restore();
      if (m) txt("MISSED", x + ew / 2, y + eh + 14, MON, mp, rgba(INK, .7), p, "center", .1);
    }
    const cy = bx.y + 2 * (eh + 30) + 18, cr = Math.min(gx * .16, 7);
    for (let i = 0; i < 12; i++){ const p = eOut(ramp(ct, .2 + i * .012, .1)); strokeA(INK, .6 * p, 1.2); ctx.beginPath(); ctx.arc(bx.x + (i + .5) * bx.w / 12, cy, cr, 0, TAU); ctx.stroke(); }
    txt("12 CLEAN · 0 FLAGGED", bx.x, cy + cr + 18, MON, mp, rgba(INK, .75), eOut(ramp(ct, .3, .1)), "left", .12);
  },
  frame(bx, ct){
    const fw = Math.min(bx.w, bx.h * 1.5), fh = fw / 1.6, fx = bx.x + (bx.w - fw) / 2, fy = bx.y, k = 14;
    strokeA(INK, .85, 2); ctx.beginPath();
    for (const [x, y, sx, sy] of [[fx, fy, 1, 1], [fx + fw, fy, -1, 1], [fx, fy + fh, 1, -1], [fx + fw, fy + fh, -1, -1]]){ ctx.moveTo(x, y + sy * k); ctx.lineTo(x, y); ctx.lineTo(x + sx * k, y); }
    ctx.stroke();
    deer(fx + fw * .55, fy + fh * .88, fh * .62, INK, .85, null);
    const p = cl((ct - .03) / .34), bh = 8, by = fy + fh + 26;
    fillA(INK, .18); ctx.fillRect(fx, by, fw, bh); fillA(INK, .9); ctx.fillRect(fx, by, fw * p, bh);
    const mp = clamp(S * .012, 8, 10);
    for (let m = 0; m <= 3; m++){ const x = fx + fw * (m * 100 / 340); fillA(INK, .8); ctx.fillRect(x, by + bh, 1, 5); txt(m * 100 + (m === 3 ? " ms" : ""), x + 2, by + bh + 16, MON, mp, rgba(INK, .8), 1, "left", .08); }
    if (p >= 1){ const a = eOut(ramp(ct, .37, .06)); strokeA(INK, a, 2); ctx.strokeRect(fx + fw * .3, fy + fh * .2, fw * .5, fh * .7); fillA(INK, a); ctx.fillRect(fx + fw * .3, fy + fh * .2 - 16, 64, 16); txt("ANIMAL", fx + fw * .3 + 5, fy + fh * .2 - 4, MON, mp, PC.animal, a, "left", .1); }
  },
  energy(bx, ct){
    const mp = clamp(S * .013, 9, 11), bh = Math.min(bx.h * .16, 34), w = bx.w, p = eOut(ramp(ct, .05, .3)), after = lerp(1, 2004 / 6300, p);
    txt("BEFORE · 6,300 J", bx.x, bx.y + mp, MON, mp, rgba(INK, .8), 1, "left", .12);
    fillA(INK, .35); ctx.fillRect(bx.x, bx.y + mp + 10, w, bh);
    txt("AFTER · 2,004 J", bx.x, bx.y + mp * 2 + bh + 30, MON, mp, rgba(INK, .8), 1, "left", .12);
    fillA(INK, .9); ctx.fillRect(bx.x, bx.y + mp * 2 + bh + 40, w * after, bh);
    strokeA(INK, .5, 1); ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(bx.x + w * 2004 / 6300, bx.y + mp + 6); ctx.lineTo(bx.x + w * 2004 / 6300, bx.y + mp * 2 + bh * 2 + 44); ctx.stroke(); ctx.setLineDash([]);
  }
};
function card(k, ct){
  const c = CARDS[k]; fillA(c.c, 1); ctx.fillRect(-W, -H, 3 * W, 3 * H);
  strokeA(INK, .05, 1); ctx.beginPath(); for (let x = -H; x < W; x += 18){ ctx.moveTo(x, H); ctx.lineTo(x + H, 0); } ctx.stroke();
  const pad = W * (PORT ? .08 : .07), npx = PORT ? Math.min(W * .27, SH * .19) : Math.min(SH * .44, W * .17);
  const nb = PORT ? TOP + SH * .3 : MY + npx * .3 - SH * .06, mp = clamp(S * .012, 10, 11);
  txt(pad2(k + 1) + " / 04 · " + c.tag, pad, TOP + 16, MON, mp, rgba(INK, .72), 1, "left", .14);
  if (W > 640) for (let s = 0; s < 16; s++){ const on = s === Math.floor((T(4) + k * B + ct - T(4)) / (B / 4)); fillA(INK, on ? .9 : .2); ctx.fillRect(W - pad - (16 - s) * 9, TOP + 7, 6, 6); }
  const big = c.fmt(c.val * eOut(ramp(ct, .03, .32)));
  const r = word(big, pad, nb, GRO, npx, INK, {tr: -.035, al: "left", anim: i => ({dy: (1 - eOut5(cl((ct - i * .018) / .2))) * npx * .22})});
  if (c.unit) txt(c.unit, pad + r.w + npx * .05, nb, GRO, npx * .42, INK, 1, "left", -.01);
  const lp = clamp(S * .017, 11, 15), L = lines(c.lab, MON, lp, .1, PORT ? W - pad * 2 : W * .42);
  const g0 = Math.max(30, npx * .3);
  L.forEach((s, i) => txt(s, pad, nb + g0 + i * lp * 1.5, MON, lp, INK, eOut(ramp(ct, .04 + i * .03, .1)), "left", .1));
  txt(c.sub, pad, nb + g0 + L.length * lp * 1.5 + 12, MON, mp, rgba(INK, .68), eOut(ramp(ct, .1, .1)), "left", .12);
  const bx = PORT ? {x: pad, y: TOP + SH * .6, w: W - pad * 2, h: SH * .34} : {x: W * .56, y: MY - SH * .24, w: W * .36, h: SH * .48};
  VIZ[c.viz](bx, ct);
}
const S4 = {world(t, b){
  const k = Math.min(3, Math.floor(b)), ct = t - k * B, edge = W * eOut(cl(ct / .1));
  if (edge < W && k > 0) card(k - 1, B + ct);
  ctx.save(); if (edge < W){ ctx.beginPath(); ctx.rect(-W, -H, W + edge, 3 * H); ctx.clip(); }
  card(k, ct); ctx.restore();
  if (edge < W){ fillA(C.bone, .9); ctx.fillRect(edge - 1, -H, 2, 3 * H); }
  if (t > BAR - .22){
    const e = eIn(cl((t - (BAR - .22)) / .22)), r = Math.hypot(W, H) * .55 * (1 - e) + 1.5;
    ctx.beginPath(); ctx.rect(-W, -H, 3 * W, 3 * H); ctx.arc(CX, MY, r, 0, TAU, true); fillA(C.ground, 1); ctx.fill("evenodd");
  }
}};

/* ---------- 05 method: a galaxy of signals settles into the words ---------- */
function galaxy(){
  return cache("gal", () => {
    const N = LITE ? 700 : 1800, R = rng(77), P = [];
    for (let i = 0; i < N; i++){ const arm = i % 3, rr = Math.pow(R(), .62); P.push({arm, rr, a0: arm * TAU / 3 + rr * 5.4 + (R() - .5) * (.55 - rr * .3), z: R(), s: .7 + R() * 1.3, ph: R() * TAU, tx: CX, ty: MY, d: .9375 + rr * .28 + R() * .06}); }
    const px = fit("real data.", SER4, W * (PORT ? .9 : .66), Math.min(SH * .34, 230)), by = MY + px * .34;
    const oc = document.createElement("canvas"), ow = Math.ceil(W), oh = Math.ceil(H); oc.width = ow; oc.height = oh;
    const o = oc.getContext("2d"); o.font = SER4(px); o.textAlign = "center"; o.textBaseline = "alphabetic"; o.fillStyle = "#fff"; o.fillText("real data.", CX, by);
    const id = o.getImageData(0, 0, ow, oh).data, pts = [], st = LITE ? 3 : 2;
    for (let y = 0; y < oh; y += st) for (let x = 0; x < ow; x += st) if (id[(y * ow + x) * 4 + 3] > 140) pts.push([x, y]);
    if (pts.length){
      const cx = CX, cy = by - px * .3, ang = q => Math.atan2(q[1] - cy, q[0] - cx);
      pts.sort((a, b) => ang(a) - ang(b));
      const order = P.map((p, i) => i).sort((a, b) => ((P[a].a0 % TAU) - (P[b].a0 % TAU)));
      order.forEach((pi, j) => { const q = pts[Math.floor(j * pts.length / N)]; P[pi].tx = q[0] + (R() - .5) * st; P[pi].ty = q[1] + (R() - .5) * st; });
    }
    return {P, px, by};
  });
}
const S5 = {world(t){
  const G = galaxy(), RG = Math.hypot(W, H) * .36, burst = eOut(cl(t / .5)), ex = t > BAR - .32 ? eIn(cl((t - (BAR - .32)) / .32)) : 0;
  const cols = [C.net, C.auth, C.merge];
  let settled = 0;
  ctx.globalCompositeOperation = "lighter";
  gl(C.lumen, 1, CX, MY, RG * .2 * burst, .45 * (1 - eOut(ramp(t, 1, .5))) * (1 - ex));
  gl(C.net, 3, CX - RG * .2, MY, RG * .5 * burst, .12 * (1 - ex)); gl(C.auth, 3, CX + RG * .2, MY, RG * .5 * burst, .12 * (1 - ex));
  for (let c = 0; c < 3; c++){
    ctx.fillStyle = cols[c];
    for (let i = c; i < G.P.length; i += 3){
      const p = G.P[i], an = p.a0 + t * (.9 / (p.rr + .3)) + .2, rad = p.rr * RG * burst;
      let x = CX + Math.cos(an) * rad, y = MY + Math.sin(an) * rad * .72;
      const e = eIO(cl((t - p.d) / .5));
      if (e > 0){ const sw = Math.sin(e * Math.PI) * 24 * (p.arm - 1); x = lerp(x, p.tx, e) - sw * .6; y = lerp(y, p.ty, e) + sw; if (e >= 1){ x += Math.sin(t * 3 + p.ph) * .6; y += Math.cos(t * 2.6 + p.ph) * .6; settled++; } }
      if (ex > 0){ x += (x - CX) * ex * 1.8; y += (y - MY) * ex * 1.8; }
      const a = (.5 + .5 * p.z) * (1 - ex) * GA; if (a <= .01) continue;
      ctx.globalAlpha = a; const s = p.s * (1.25 + .8 * (1 - e)); ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  const ta = eOut(ramp(t, 1.42, .3)) * (1 - eOut(cl(ex * 2)));
  if (ta > 0) word("real data.", CX, G.by, SER4, G.px, C.bone, {a: ta * .92, anim: (i, n) => i === n - 1 ? {c: C.net} : {}});
  const sp = G.px * .3;
  word("tested on", CX, G.by - G.px * 1.0, SER, sp, C.mute, {anim: i => { const p = eOut(ramp(t, .98 + i * .03, .3)); return p > 0 ? {dy: (1 - p) * 10, a: p * (1 - ex)} : null; }});
}};

/* ---------- 06 builds: four projects, one per beat ---------- */
// a stylised deer, facing left, feet at (x, y), h tall
function deer(x, y, h, col, a, rim){
  const u = h;
  ctx.save(); ctx.translate(x, y); ctx.scale(u, u);
  ctx.beginPath();
  ctx.ellipse(.08, -.52, .34, .15, -.04, 0, TAU);
  ctx.moveTo(-.16, -.6); ctx.lineTo(-.33, -.86); ctx.lineTo(-.25, -.9); ctx.lineTo(-.06, -.6); ctx.closePath();
  ctx.moveTo(-.25, -.92); ctx.quadraticCurveTo(-.44, -.95, -.53, -.86); ctx.lineTo(-.5, -.82); ctx.quadraticCurveTo(-.38, -.82, -.27, -.84); ctx.closePath();
  ctx.moveTo(-.26, -.9); ctx.lineTo(-.18, -.98); ctx.lineTo(-.22, -.88); ctx.closePath();
  for (const lx of [-.18, -.1, .24, .32]){ ctx.rect(lx, -.44, .035, .44); }
  ctx.moveTo(.42, -.6); ctx.lineTo(.5, -.66); ctx.lineTo(.46, -.56); ctx.closePath();
  ctx.restore();
  fillA(col, a); ctx.fill();
  if (rim){ strokeA(rim, .85 * a, 1.4); ctx.stroke(); }
  // antlers
  ctx.save(); ctx.translate(x, y); ctx.scale(u, u); ctx.beginPath();
  ctx.moveTo(-.3, -.92); ctx.lineTo(-.26, -1.08); ctx.lineTo(-.18, -1.16); ctx.moveTo(-.26, -1.08); ctx.lineTo(-.33, -1.15);
  ctx.moveTo(-.3, -.92); ctx.lineTo(-.36, -1.04); ctx.lineTo(-.42, -1.1);
  ctx.restore();
  strokeA(rim || col, a, Math.max(1.2, h * .018)); ctx.stroke();
}
function VA(){
  const title = PORT ? 46 : 84;
  return {x0: W * .06, x1: W * .94, y0: TOP + 8, y1: H - BOT - title - 64};
}
const PANELS = [
  {c: PC.animal, title: "EDGE TO CLOUD", sub: "RASPBERRY PI 5 → AWS IOT CORE → NEARBY CARS", tag: "ANIMAL DETECTION", draw: pAnimal},
  {c: PC.solar, title: "BIO-INSPIRED SCREEN", sub: "MOTH EYE · FIREFLY · CHAMELEON · SIMULATED", tag: "SOLAR SCREEN MODEL", draw: pSolar},
  {c: PC.sos, title: "NASA SPACE APPS", sub: "2025 · 3RD PLACE · TEAM ORION · TEAM LEADER", tag: "S.O.S MISSION CONCEPT", draw: pOrbit},
  {c: PC.mcp, title: "EVERY TOOL CALL, LOGGED", sub: "MCP SECURITY PROXY · HASH-CHAINED AUDIT LOG", tag: "MCP SECURITY PROXY", draw: pProxy}
];
function pAnimal(pt, c){
  const v = VA(), vx = CX, vy = v.y0 + (v.y1 - v.y0) * .16, base = H + 40;
  ctx.beginPath(); ctx.moveTo(vx - 5, vy); ctx.lineTo(vx + 5, vy); ctx.lineTo(W * .9, base); ctx.lineTo(W * .1, base); ctx.closePath();
  fillA("#141B1E", 1); ctx.fill();
  strokeA(C.bone, .3, 1.2); ctx.beginPath(); ctx.moveTo(vx - 5, vy); ctx.lineTo(W * .1, base); ctx.moveTo(vx + 5, vy); ctx.lineTo(W * .9, base); ctx.stroke();
  for (let j = 0; j < 8; j++){ const u = ((j + pt * 2.4) % 8) / 8, e = u * u, y = lerp(vy, base, e), w = lerp(.6, 8, e), hh = lerp(1, 34, e); fillA(C.lumen, .55 * u); ctx.fillRect(vx - w / 2, y, w, hh); }
  gl(c, 3, CX, H, W * .5, .16);
  const dh = Math.min((v.y1 - v.y0) * .5, (v.x1 - v.x0) * .42), fx = vx + Math.min((v.y1 - vy) * .42, (v.x1 - vx) * .5), fy = vy + (v.y1 - vy) * .82;
  gl(c, 2, fx - dh * .1, fy - dh * .5, dh * .9, .2);
  deer(fx, fy, dh, "#0E1412", 1, c);
  const lk = eOut(cl((pt - .05) / .14)), s = 1 + .5 * (1 - lk), bw = dh * 1.12 * s, bh = dh * 1.26 * s, bx = fx - dh * .06 - bw / 2, by = fy - dh * .62 - bh / 2, k = 16;
  const blink = pt < .2 ? (Math.floor(pt * 30) % 2 ? .35 : 1) : 1;
  strokeA(c, lk * blink, 2); ctx.beginPath();
  for (const [x, y, sx, sy] of [[bx, by, 1, 1], [bx + bw, by, -1, 1], [bx, by + bh, 1, -1], [bx + bw, by + bh, -1, -1]]){ ctx.moveTo(x, y + sy * k); ctx.lineTo(x, y); ctx.lineTo(x + sx * k, y); }
  ctx.stroke();
  if (lk > .9){ const mp = clamp(S * .013, 9, 11); fillA(c, 1); ctx.fillRect(bx, by - mp - 10, 70, mp + 10); txt("ANIMAL", bx + 6, by - 6, MON, mp, INK, 1, "left", .12); const sy = by + bh * ((pt * 2.2) % 1); fillA(c, .35); ctx.fillRect(bx, sy, bw, 1.5); }
}
function pSolar(pt, c){
  const v = VA(), vw = v.x1 - v.x0, vh = v.y1 - v.y0, sx = v.x0 + vw * (PORT ? .2 : .26), sy = v.y0 + vh * .28;
  gl(C.lumen, 2, sx, sy, vh * .5, .35); fillA(C.lumen, 1); ctx.beginPath(); ctx.arc(sx, sy, vh * .07, 0, TAU); ctx.fill();
  strokeA(C.lumen, .5, 1.5); ctx.beginPath();
  for (let i = 0; i < 14; i++){ const a = i / 14 * TAU + pt * .8; ctx.moveTo(sx + Math.cos(a) * vh * .1, sy + Math.sin(a) * vh * .1); ctx.lineTo(sx + Math.cos(a) * vh * .16, sy + Math.sin(a) * vh * .16); }
  ctx.stroke();
  const pw = Math.min(vh * .36, 160), ph = pw * 2, px = v.x0 + vw * (PORT ? .66 : .68) - pw / 2, py = v.y0 + (vh - ph) / 2;
  const refl = pt > .2, sw = eOut(ramp(pt, .2, .08));
  ctx.setLineDash([6, 8]); ctx.lineDashOffset = -pt * 90; strokeA(C.lumen, .55, 1.4); ctx.beginPath();
  for (let i = 0; i < 4; i++){ const ty = py + ph * (.2 + i * .18); ctx.moveTo(sx, sy); ctx.lineTo(px + 4, ty); if (refl){ ctx.moveTo(px + 4, ty); ctx.lineTo(px + pw + 70, ty - 50 - i * 10); } }
  ctx.stroke(); ctx.setLineDash([]);
  gl(c, 2, px + pw / 2, py + ph / 2, pw * 1.3, .3 * (1 - sw) + .12);
  rrect(ctx, px, py, pw, ph, pw * .14); fillA(C.stage, 1); ctx.fill(); strokeA(C.bone, .6, 1.4); ctx.stroke();
  const ix = px + 7, iy = py + 14, iw = pw - 14, ih = ph - 28;
  fillA(c, .32 * (1 - sw)); ctx.fillRect(ix, iy, iw, ih);
  if (sw > 0){ fillA(C.lumen, .14 * sw); ctx.fillRect(ix, iy, iw, ih); ctx.save(); ctx.beginPath(); ctx.rect(ix, iy, iw, ih); ctx.clip(); const hs = 6; strokeA(C.lumen, .3 * sw, 1); for (let yy = iy; yy < iy + ih + hs; yy += hs * 1.5) for (let xx = ix; xx < ix + iw + hs; xx += hs * 1.73){ hexPath(ctx, xx + ((yy - iy) / (hs * 1.5) % 2 ? hs * .86 : 0), yy, hs * .8); ctx.stroke(); } ctx.restore(); }
  const mp = clamp(S * .012, 8, 10);
  txt(refl ? "REFLECTIVE" : "GLOW", px + pw / 2, py + ph * .52, MON, mp, refl ? C.lumen : C.bone, 1, "center", .14);
  fillA(C.bone, .5); ctx.fillRect(px + pw * .35, py + 6, pw * .3, 3);
}
function pOrbit(pt, c){
  const v = VA(), ER = S * 1.15, ex = CX, ey = v.y1 + ER * .82;
  ctx.beginPath(); ctx.arc(ex, ey, ER, 0, TAU); fillA("#0F1B2A", 1); ctx.fill();
  gl(C.host, 3, ex, ey - ER, ER * .5, .25); strokeA(C.host, .6, 2); ctx.beginPath(); ctx.arc(ex, ey, ER + 2, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
  const OR = ER + (v.y1 - v.y0) * .45;
  ctx.setLineDash([3, 6]); strokeA(c, .4, 1.2); ctx.beginPath(); ctx.arc(ex, ey, OR, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); ctx.setLineDash([]);
  const a0 = Math.asin(Math.min(.95, W * .36 / OR)), sa = -Math.PI / 2 + lerp(-a0, a0 * .6, cl(pt / B)), satx = ex + Math.cos(sa) * OR, saty = ey + Math.sin(sa) * OR;
  for (let i = 0; i < 46; i++){
    const a1 = Math.asin(Math.min(.98, W * .55 / OR)), a = -Math.PI / 2 + (hsh(i, 1, 2) * 2 - 1) * a1 + pt * .05 * (hsh(i, 3, 2) - .3), r = OR + (hsh(i, 2, 2) - .5) * 60, x = ex + Math.cos(a) * r, y = ey + Math.sin(a) * r;
    const ahead = a - sa, caught = ahead > -.02 && ahead < .09 && Math.abs(r - OR) < 34;
    if (caught && pt > .1) continue;
    fillA(i % 7 ? C.bone : c, .55); const s = 1.5 + hsh(i, 4, 2) * 2.5; ctx.fillRect(x - s / 2, y - s / 2, s, s);
  }
  ctx.save(); ctx.translate(satx, saty); ctx.rotate(sa + Math.PI / 2);
  strokeA(c, .65, 1); ctx.beginPath(); for (let i = -2; i <= 2; i++){ ctx.moveTo(8, 0); ctx.lineTo(48, i * 11); } ctx.stroke();
  strokeA(c, .4, 1); ctx.beginPath(); ctx.moveTo(48, -22); ctx.quadraticCurveTo(58, 0, 48, 22); ctx.stroke();
  fillA(C.host, .9); ctx.fillRect(-7, -26, 14, 18); ctx.fillRect(-7, 8, 14, 18);
  fillA(C.bone, 1); ctx.fillRect(-9, -7, 18, 14);
  ctx.restore();
  gl(c, 1, satx, saty, 26, .5);
  if (pt > .18 && pt < .38 && Math.floor(pt * 40) % 3){ const ta = sa + .2, tx = ex + Math.cos(ta) * (OR - 18), ty = ey + Math.sin(ta) * (OR - 18); strokeA(C.auth, .9, 1.6); ctx.beginPath(); ctx.moveTo(satx, saty); ctx.lineTo(tx, ty); ctx.stroke(); gl(C.auth, 0, tx, ty, 12, .9); fillA(C.bone, .8); ctx.fillRect(tx - 3, ty - 3, 6, 6); }
  const mr = Math.min((v.y1 - v.y0) * .2, 70), mx = v.x1 - mr - 10, my = v.y0 + mr + 10, me = eBack(cl((pt - .04) / .16), 2.2);
  if (me > 0){
    ctx.save(); ctx.translate(mx, my); ctx.scale(me, me); ctx.rotate((1 - Math.min(1, me)) * -.6);
    gl(C.lumen, 2, 0, 0, mr * 1.6, .25); ctx.beginPath(); ctx.arc(0, 0, mr, 0, TAU); fillA(C.ground, .9); ctx.fill(); strokeA(C.lumen, 1, 2); ctx.stroke();
    strokeA(C.lumen, .4, 1); ctx.beginPath(); ctx.arc(0, 0, mr * .84, 0, TAU); ctx.stroke();
    txt("3RD", 0, mr * .18, GRO, mr * .55, C.bone, 1, "center", -.02);
    txt("PLACE", 0, mr * .5, MON, Math.max(8, mr * .16), C.lumen, 1, "center", .16);
    ctx.restore();
  }
}
function pProxy(pt, c){
  const v = VA(), vw = v.x1 - v.x0, vh = v.y1 - v.y0, ax = v.x0 + vw * .1, tx = v.x1 - vw * .1, gx = CX, gy = v.y0 + vh * .42, mp = clamp(S * .012, 8, 10);
  const ay = i => gy + (i - 1) * vh * .26, ty = i => gy + (i - 1.5) * vh * .2;
  for (let i = 0; i < 3; i++){ gl(c, 1, ax, ay(i), 22, .4); ctx.beginPath(); ctx.arc(ax, ay(i), 9, 0, TAU); fillA(C.stage, 1); ctx.fill(); strokeA(c, 1, 1.6); ctx.stroke(); txt("AGENT " + (i + 1), ax, ay(i) + 26, MON, mp, C.mute, 1, "center", .12); }
  for (let i = 0; i < 4; i++){ hexPath(ctx, tx, ty(i), 12); fillA(C.stage, 1); ctx.fill(); strokeA(c, .9, 1.4); ctx.stroke(); }
  const gh = vh * .78; ctx.save(); ctx.beginPath(); ctx.rect(gx - 7, gy - gh / 2, 14, gh); ctx.clip();
  fillA(c, .2); ctx.fillRect(gx - 7, gy - gh / 2, 14, gh); strokeA(c, .8, 3); ctx.beginPath(); for (let y = gy - gh / 2 - 20 + (pt * 80) % 14; y < gy + gh / 2 + 20; y += 14){ ctx.moveTo(gx - 10, y); ctx.lineTo(gx + 10, y - 10); } ctx.stroke(); ctx.restore();
  gl(c, 2, gx, gy, gh * .45, .25); txt("PROXY", gx, gy - gh / 2 - 10, MON, mp, c, 1, "center", .16);
  const cy = v.y1 - 4, bs = Math.max(12, Math.min(vw / 26, 20)), calls = 9;
  let logged = 0;
  for (let j = 0; j < calls; j++){
    const st = j * .03, p = cl((pt - st) / .18); if (p <= 0) continue;
    const a = j % 3, tl = (j * 7) % 4, odd = j === 5, col = odd ? C.lumen : C.net;
    let x, y; if (p < .5){ const e = p / .5; x = lerp(ax, gx, e); y = lerp(ay(a), gy, e); } else { const e = (p - .5) / .5; x = lerp(gx, tx, e); y = lerp(gy, ty(tl), e); }
    if (p < 1){ gl(col, 0, x, y, 9, 1); }
    if (p >= .5) logged++;
  }
  const n = logged, chainW = n * bs * 1.6, x0 = gx - chainW / 2;
  for (let i = 0; i < n; i++){ const x = x0 + i * bs * 1.6, e = i === n - 1 ? eOut(cl(((pt - (i * .03 + .09)) / .05))) : 1; ctx.save(); ctx.translate(x + bs / 2, cy - bs / 2); ctx.scale(e, e); fillA(C.ground, 1); ctx.fillRect(-bs / 2, -bs / 2, bs, bs); strokeA(C.lumen, .9, 1.2); ctx.strokeRect(-bs / 2, -bs / 2, bs, bs); fillA(C.lumen, .7); for (let q = 0; q < 3; q++) ctx.fillRect(-bs * .3, -bs * .25 + q * bs * .2, bs * (.25 + .35 * hsh(i, q, 6)), 1.5); ctx.restore(); if (i){ strokeA(C.lumen, .6, 1); ctx.beginPath(); ctx.moveTo(x - bs * .6, cy - bs / 2); ctx.lineTo(x, cy - bs / 2); ctx.stroke(); } }
}
const LABEL6 = ["Animal detection", "Solar screen", "S.O.S", "MCP proxy"];
const S6 = {world(t){
  const k = Math.min(3, Math.floor(t / B)), pt = t - k * B, P = PANELS[k], zs = 1.07 - .07 * eOut(cl(pt / B));
  gl(P.c, 3, CX, MY, S * .95, .17);
  ctx.save(); ctx.translate(CX, MY); ctx.scale(zs, zs); ctx.translate(-CX, -MY); P.draw(pt, P.c); ctx.restore();
}, ui(t){
  const k = Math.min(3, Math.floor(t / B)), pt = t - k * B, P = PANELS[k];
  const tpx = fit(P.title, GRO, W * (PORT ? .88 : .62), PORT ? 44 : 84, -.03), sp = clamp(S * .014, 10, 12), mp = clamp(S * .012, 9, 11);
  const al = PORT ? "center" : "left", x = PORT ? CX : W * .07, sy = H - BOT - 14, ty = sy - sp - 18;
  ctx.drawImage(rampSpr(), 0, ty - tpx - 40, W, H - (ty - tpx - 40));
  txt(pad2(k + 1) + " / 04 · " + P.tag, x, ty - tpx - 14, MON, mp, P.c, eOut(cl(pt / .04)), al, .14);
  ctx.save(); ctx.beginPath(); ctx.rect(0, ty - tpx * 1.05, W, tpx * 1.2); ctx.clip();
  word(P.title, x, ty, GRO, tpx, C.bone, {tr: -.03, al, anim: i => ({dy: (1 - eOut5(cl((pt - i * .004) / .12))) * tpx})});
  ctx.restore();
  typed(P.sub, x, sy, sp, C.mute, ramp(pt, .03, .13), al, .12);
}};

/* ---------- 07 credentials: a dot matrix in every project colour, then it all collapses ---------- */
const CREDS = [
  {t: "CCNA", s: "CISCO CERTIFIED NETWORK ASSOCIATE", c: C.net},
  {t: "AWS", s: "CERTIFIED CLOUD PRACTITIONER", c: PC.animal},
  {t: "NASA SPACE APPS", s: "3RD PLACE · 2025 · TEAM LEADER", c: C.host},
  {t: "TOP 100", s: "JORDAN'S 12TH NATIONAL TECHNOLOGY PARADE", c: C.lumen}
];
const CT = [0, .75 * B, 1.5 * B, 2.25 * B, 3 * B];
function dotGrid(){
  return cache("dots", () => { const g = clamp(S / 13, 24, 58), cols = Math.ceil(W / g) + 1, rows = Math.ceil(H / g) + 1, ox = (W - (cols - 1) * g) / 2, oy = (H - (rows - 1) * g) / 2, cells = []; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push({x: ox + c * g, y: oy + r * g, c, r}); return {g, cells}; });
}
const PAL = [PC.apis, PC.solar, PC.scam, PC.mcp, PC.phish, PC.ai, PC.animal, PC.sos];
const S7 = {world(t){
  const G = dotGrid(), c1 = eIn(ramp(t, 3 * B, .2)), c2 = eIn(ramp(t, 3 * B + .21, .17)), sp = 2 + 9 * Math.pow(t / BAR, 2), ph = t * (5 + 16 * t / BAR);
  if (c1 > 0) ctx.globalCompositeOperation = "lighter";
  for (const d of G.cells){
    const wv = .5 + .5 * Math.sin(d.c * .55 + d.r * .35 - ph), x = c2 > 0 ? lerp(d.x, CX, c2) : d.x, y = c1 > 0 ? lerp(d.y, MY, c1) : d.y;
    const q = G.g * .56 * (.55 + .45 * wv) * (1 - c2 * .75) * (1 - c1 * .35), idx = (Math.floor((d.c + d.r) * .22 + t * sp) % 8 + 8) % 8;
    fillA(PAL[idx], (.16 + .62 * wv) * (1 - c2 * .5)); ctx.fillRect(x - q / 2, y - q / 2 * (1 - c1 * .7), q, q * (1 - c1 * .7));
  }
  ctx.globalCompositeOperation = "source-over";
  if (c2 > .6){
    const k = eOut(ramp(t, BAR - .16, .16)), sx = 26 * (1 - k);
    ctx.globalCompositeOperation = "lighter";
    for (const [col, dx] of [[C.net, -1], [C.merge, 0], [C.auth, 1]]){ gl(col, 1, CX + dx * sx * 1.6, MY, 26, .9); fillA(col, 1); ctx.beginPath(); ctx.arc(CX + dx * sx * 1.6, MY, 4, 0, TAU); ctx.fill(); }
    ctx.globalCompositeOperation = "source-over";
  }
}, ui(t){
  if (t >= CT[4]) return;
  let k = 0; while (k < 3 && t >= CT[k + 1]) k++;
  const cr = CREDS[k], pt = t - CT[k], s = 1 + .14 * (1 - eOut(cl(pt / .12)));
  const bpx = fit(cr.t, GRO, Math.min(W * (PORT ? .8 : .6), W - 120), PORT ? 52 : 110, -.03), sp = clamp(S * .014, 10, 12);
  const sl = lines(cr.s, MON, sp, .14, Math.min(W * (PORT ? .78 : .56), W - 110)), bw = Math.min(W - 24, Math.max(lay(cr.t, GRO, bpx, -.03).w, ...sl.map(z => lay(z, MON, sp, .14).w)) + 72), bh = bpx * .9 + sl.length * sp * 1.6 + 60;
  ctx.save(); ctx.translate(CX, MY); ctx.scale(s, s);
  fillA(C.ground, .93); ctx.fillRect(-bw / 2, -bh / 2, bw, bh); strokeA(cr.c, 1, 1.5); ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
  fillA(cr.c, 1); for (const [x, y] of [[-bw / 2, -bh / 2], [bw / 2, -bh / 2], [-bw / 2, bh / 2], [bw / 2, bh / 2]]) ctx.fillRect(x - 3, y - 3, 6, 6);
  txt(pad2(k + 1) + " / 04", -bw / 2 + 14, -bh / 2 + 22, MON, clamp(S * .012, 9, 10), C.faint, 1, "left", .14);
  word(cr.t, 0, -bh / 2 + 34 + bpx * .74, GRO, bpx, C.bone, {tr: -.03, anim: i => ({dy: (1 - eOut5(cl((pt - i * .01) / .14))) * bpx * .3})});
  sl.forEach((z, i) => txt(z, 0, -bh / 2 + 34 + bpx * .74 + 26 + i * sp * 1.6, MON, sp, cr.c, eOut(ramp(pt, .04, .1)), "center", .14));
  ctx.restore();
}};

/* ---------- 08 the name: impact, a slow starburst, the two stains meet behind it ---------- */
const S8 = {world(t){
  const k0 = eOut(cl(t / .5)), NMx = NM ? NM.w * .3 : S * .3;
  if (t < .14){ const e = eOut(cl(t / .12)); for (const [col, dx] of [[C.net, -1], [C.auth, 1]]) gl(col, 1, CX + dx * 4 * (1 - e), MY, 22, 1 - e); }
  ctx.globalCompositeOperation = "lighter";
  gl(C.net, 3, CX - NMx * (1 - .25 * k0) + Math.sin(t * .8) * 10, MY, S * .42, .3 * k0);
  gl(C.auth, 3, CX + NMx * (1 - .25 * k0) - Math.sin(t * .8) * 10, MY, S * .42, .3 * k0);
  const SB = cache("burst", () => { const R = Math.ceil(S * .5), c = document.createElement("canvas"); c.width = c.height = R * 2; const g = c.getContext("2d"), rg = g.createRadialGradient(R, R, 0, R, R, R); rg.addColorStop(0, rgba(C.lumen, .3)); rg.addColorStop(.5, rgba(C.lumen, .1)); rg.addColorStop(1, rgba(C.lumen, 0)); g.fillStyle = rg; g.beginPath(); for (let i = 0; i < 28; i++){ const a = i / 28 * TAU, L = R * (.48 + .5 * hsh(i, 3, 8)), dw = .01 + .012 * hsh(i, 4, 8); g.moveTo(R, R); g.lineTo(R + Math.cos(a - dw) * L, R + Math.sin(a - dw) * L); g.lineTo(R + Math.cos(a + dw) * L, R + Math.sin(a + dw) * L); g.closePath(); } g.fill(); return {c, R}; });
  ctx.save(); ctx.translate(CX, MY); ctx.rotate(t * .1 + .2); const bs = 2 * k0 * (1 + .015 * Math.sin(t * 2.4)); ctx.scale(bs, bs); ctx.globalAlpha = GA; ctx.drawImage(SB.c, -SB.R, -SB.R); ctx.globalAlpha = 1; ctx.restore();
  ctx.globalCompositeOperation = "source-over";
  for (let i = 0; i < 3; i++){ const age = t - i * .07; if (age < 0 || age > 1.1) continue; strokeA(i === 1 ? C.lumen : C.merge, .5 * (1 - age / 1.1), 1.4); ctx.beginPath(); ctx.arc(CX, MY, S * (.06 + 1.3 * eOut(age / 1.1)), 0, TAU); ctx.stroke(); }
  ctx.globalAlpha = GA; ctx.drawImage(discSpr(), CX - S * .62, MY - S * .62, S * 1.24, S * 1.24); ctx.globalAlpha = 1;
  dust(t + 12, .9);
}};

/* ---------- 09 hand-off: the name flies into the hero, the page opens from the lens ---------- */
function lensGeom(){
  return cache("lens", () => {
    let x = CX, y = MY, r = Math.min(S * .3, 240);
    if (lensEl){
      const rc = lensEl.getBoundingClientRect(); let dy = 0;
      try { const m = getComputedStyle(lensWrap).transform; if (m && m !== "none"){ const v = m.slice(m.indexOf("(") + 1, -1).split(",").map(parseFloat); dy = v.length === 6 ? v[5] : (v[13] || 0); } } catch (e) {}
      const lx = rc.left + rc.width / 2, ly = rc.top + rc.height / 2 - dy;
      if (rc.width > 20 && lx > 0 && lx < W && ly > 0 && ly < H){ x = lx; y = ly; r = rc.width / 2; }
    }
    return {x, y, r, rmax: Math.max(Math.hypot(x, y), Math.hypot(W - x, y), Math.hypot(x, H - y), Math.hypot(W - x, H - y)) + 6};
  });
}
const S9 = {world(t){
  const fo = 1 - eOut(cl(t / .6));
  if (fo > .01){ GA = fo; S8.world(BAR + t); GA = 1; }
  const L = lensGeom(), hp = eIO(ramp(t, 1.05, .8)), R = lerp(L.r, L.rmax, hp), ra = 1 - eOut(ramp(t, 1.05, .8)) * .9;
  if (hp <= 0){
    const fa = eOut(ramp(t, .2, .5));
    ctx.globalCompositeOperation = "lighter";
    gl(C.net, 2, L.x - L.r * .25, L.y, L.r * .7, .3 * fa); gl(C.auth, 2, L.x + L.r * .25, L.y, L.r * .7, .3 * fa); gl(C.merge, 1, L.x, L.y, L.r * .3, .3 * fa);
    ctx.globalCompositeOperation = "source-over";
  }
  lensRing(L.x, L.y, R + (hp > 0 ? 3 : 0), eOut(ramp(t, .15, .8)), t, ra, hp <= 0);
  if (hp > 0){ strokeA(C.lumen, .8 * (1 - hp), 2); ctx.beginPath(); ctx.arc(L.x, L.y, R + 1.5, 0, TAU); ctx.stroke(); gl(C.lumen, 2, L.x, L.y - R, 60, .4 * (1 - hp)); }
}};
const SC = [S0, S1, S2, S3, S4, S5, S6, S7, S8, S9];
const LABELS = ["Power on", "Thesis", "APIS", "Lateral movement", "Measured", "Method", "Builds", "Credentials", "Shehab Shibli", "Enter"];

/* ---------- the cut: camera, flashes, glitches, whips ---------- */
const FLASH = [[T(1), .85, .09, C.merge], [T(1, 1), .2, .05, C.bone], [T(1, 2), .26, .05, C.bone], [T(1, 3), .18, .06, C.bone], [T(2), .45, .08, C.net], [T(3), .26, .06, C.bone], [T(3, 2), .3, .08, C.merge], [T(5), .25, .12, PC.solar], [T(6), .3, .05, C.bone], [T(6, 1), .2, .05, C.bone], [T(6, 2), .2, .05, C.bone], [T(6, 3), .2, .05, C.bone], [T(7), .22, .06, C.bone], [T(8), .72, .12, C.merge], [T(9, 2) + .1, .12, .3, C.lumen]];
const GLITCH = [[T(1, 1), .07, 1], [T(1, 2), .07, .8], [T(1, 3), .06, .6], [T(2), .08, .9], [T(3), .08, .9], [T(4, 1), .05, .6], [T(4, 2), .05, .6], [T(4, 3), .05, .6], [T(6), .08, 1], [T(6, 1), .08, 1], [T(6, 2), .08, 1], [T(6, 3), .08, 1], [T(7), .08, .8], [T(8), .12, 1.3]];
const SHAKES = [[T(2), 7, .07], [T(3, 2), 4, .06], [T(8), 14, .12]];
const WOUT = new Set([2, 3, 6]), WIN = new Set([3, 4, 7]);
function camera(t, bar, lt){
  let x = 0, y = 0, s = 1;
  const ka = kickAge(t); if (ka < .3) s += .016 * Math.exp(-ka * 16);
  if (bar === 7) s += .05 * eIn2(lt / BAR);
  if (WOUT.has(bar) && lt > BAR - .3) x -= eIn(cl((lt - (BAR - .3)) / .3)) * W * .22;
  if (WIN.has(bar) && lt < .16) x += (1 - eOut(lt / .16)) * W * .16;
  const f = Math.floor(t * 60);
  for (const [st, amp, dec] of SHAKES){ const age = t - st; if (age >= 0 && age < dec * 5){ const e = amp * Math.exp(-age / dec); x += (hsh(f, 1, st * 97) - .5) * 2 * e; y += (hsh(f, 2, st * 97) - .5) * 2 * e; } }
  return {x, y, s};
}
function post(t, bar, lt){
  let sm = 0;
  if (WOUT.has(bar) && lt > BAR - .3) sm = eIn(cl((lt - (BAR - .3)) / .3));
  if (WIN.has(bar) && lt < .16) sm = Math.max(sm, 1 - eOut(lt / .16));
  if (sm > .02 && !LITE){ ctx.globalAlpha = .36 * sm; ctx.drawImage(cv, 0, 0, cv.width, cv.height, 24 * sm, 0, W, H); ctx.globalAlpha = .2 * sm; ctx.drawImage(cv, 0, 0, cv.width, cv.height, 60 * sm, 0, W, H); ctx.globalAlpha = 1; }
  for (const g of GLITCH){
    const age = t - g[0]; if (age < 0 || age > g[1]) continue;
    const k = g[2] * (1 - age / g[1]), f = Math.floor(t * 60), n = LITE ? 3 : 7;
    for (let i = 0; i < n; i++){ const y = hsh(f, i, 11) * H, h = 3 + hsh(f, i, 12) * H * .07, dx = (hsh(f, i, 13) - .5) * 90 * k; ctx.drawImage(cv, 0, Math.floor(y * DPR), cv.width, Math.max(1, Math.floor(h * DPR)), dx, y, W, h); }
    ctx.globalCompositeOperation = "lighter"; fillA(C.auth, .12 * k); ctx.fillRect(0, hsh(f, 1, 14) * H, W, 2 + 6 * k); fillA(C.net, .12 * k); ctx.fillRect(0, hsh(f, 2, 14) * H, W, 2 + 6 * k); ctx.globalCompositeOperation = "source-over";
    break;
  }
  let fa = 0, fc = C.merge;
  for (const f of FLASH){ const age = t - f[0]; if (age < 0 || age > f[2] * 6) continue; const a = f[1] * Math.exp(-age / f[2]); if (a > fa){ fa = a; fc = f[3]; } }
  if (fa > .01){ ctx.globalAlpha = Math.min(1, fa); ctx.fillStyle = fc; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  grain(ctx, W, H, .05);
}
function render(t){
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; GA = 1;
  fillA(C.ground, 1); ctx.fillRect(0, 0, W, H);
  const bar = Math.min(9, Math.max(0, Math.floor(t / BAR))), lt = t - bar * BAR, b = lt / B, sc = SC[bar], cam = camera(t, bar, lt);
  ctx.save(); ctx.translate(CX + cam.x, MY + cam.y); ctx.scale(cam.s, cam.s); ctx.translate(-CX, -MY);
  if (sc.world) sc.world(lt, b, t);
  ctx.restore(); ctx.setTransform(DPR, 0, 0, DPR, 0, 0); GA = 1;
  ctx.drawImage(vig(), 0, 0, W, H);
  if (sc.ui) sc.ui(lt, b, t);
  post(t, bar, lt);
  if (bar === 9 && lt >= 1.05){ const L = lensGeom(), r = lerp(L.r, L.rmax, eIO(ramp(lt, 1.05, .8))); ctx.globalCompositeOperation = "destination-out"; ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(L.x, L.y, r, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = "source-over"; }
}

/* ---------- the gate: an idle lens while the visitor decides ---------- */
function gateGeom(){
  if (!ringEl) return {x: CX, y: MY, r: S * .2};
  const r = ringEl.getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2, r: Math.max(10, r.width / 2 - 16)};
}
function drawGate(gt){
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; GA = 1;
  fillA(C.ground, 1); ctx.fillRect(0, 0, W, H);
  dust(gt, eOut(cl(gt / 1.2)));
  const g = gateGeom(), R = g.r, ph = (gt % 6) / 6, m = .5 - .5 * Math.cos(ph * TAU), ang = gt * .5, d = R * .4 * (1 - m * .85), fi = eOut(cl(gt / .8));
  const hp = gt % 2, h = Math.exp(-hp * 8) + (hp > .17 ? .6 * Math.exp(-(hp - .17) * 8) : 0);
  ctx.globalCompositeOperation = "lighter";
  gl(C.net, 2, g.x + Math.cos(ang) * d, g.y + Math.sin(ang) * d, R * .56, .42 * fi);
  gl(C.auth, 2, g.x - Math.cos(ang) * d, g.y - Math.sin(ang) * d, R * .56, .42 * fi);
  gl(C.merge, 1, g.x, g.y, R * (.12 + .3 * m) * (1 + h * .25), (.2 + .45 * m + h * .3) * fi);
  ctx.globalCompositeOperation = "source-over";
  ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(gt * .05); ctx.translate(-g.x, -g.y);
  lensRing(g.x, g.y, R, eOut(cl(gt / 1.1)), gt, 1, false);
  ctx.restore();
  fillA(C.lumen, fi); ctx.fillRect(g.x - .5, g.y - R - 19, 1, 16);
  strokeA(C.bone, .2 * fi, 1); ctx.beginPath(); ctx.moveTo(g.x - R * .8, g.y); ctx.lineTo(g.x - 9, g.y); ctx.moveTo(g.x + 9, g.y); ctx.lineTo(g.x + R * .8, g.y); ctx.moveTo(g.x, g.y - R * .8); ctx.lineTo(g.x, g.y - 9); ctx.moveTo(g.x, g.y + 9); ctx.lineTo(g.x, g.y + R * .8); ctx.stroke();
  ctx.drawImage(vig(), 0, 0, W, H);
}

/* ---------- DOM side: HUD, the name, the hand-off ---------- */
const nameAnims = [];
if (nameEl && nameEl.animate){
  nameEl.querySelectorAll(".ch").forEach((c, k) => {
    const a = c.animate([{transform: "translateY(96%)", filter: LITE ? "blur(6px)" : "blur(12px)", easing: "cubic-bezier(.16,1,.3,1)"}, {filter: "blur(2px)", offset: .55, easing: "cubic-bezier(.16,1,.3,1)"}, {transform: "none", filter: "blur(0px)"}], {duration: 1000, delay: 120 + k * 45, fill: "both"});
    a.pause(); a.currentTime = 0; nameAnims.push(a);
  });
}
function measureName(){
  nameEl.style.transform = "none";
  const er = nameEl.getBoundingClientRect(), ws = nameEl.querySelectorAll(".w"), r0 = ws[0].getBoundingClientRect(), r1 = ws[1].getBoundingClientRect();
  const bx0 = Math.min(r0.left, r1.left) - er.left, bx1 = Math.max(r0.right, r1.right) - er.left, by0 = r0.top - er.top, by1 = r1.bottom - er.top;
  const s0 = PORT ? 1.12 : 1.06, cyT = MY - SH * .04;
  const tx0 = CX - s0 * (bx0 + bx1) / 2, ty0 = cyT - s0 * (by0 + by1) / 2;
  let tx1 = tx0, ty1 = ty0, s1 = s0;
  const hw = heroName && heroName.querySelector(".w");
  if (hw){
    const h0 = hw.getBoundingClientRect(), fs = parseFloat(getComputedStyle(heroName).fontSize) / parseFloat(getComputedStyle(nameEl).fontSize);
    if (h0.width > 0){ s1 = fs; tx1 = h0.left - fs * (r0.left - er.left); ty1 = h0.top - fs * (r0.top - er.top); }
  }
  return {tx0, ty0, s0, tx1, ty1, s1, w: (bx1 - bx0) * s0, subY: ty0 + s0 * by1 + 30};
}
let hudKey = "", lastTc = "", landed = false, released = false;
function heroAnims(withName){
  const out = [];
  document.querySelectorAll("main .in, .lens-wrap, .lens canvas, main .sheen" + (withName ? ", main .name .ch" : "")).forEach(el => { if (el.getAnimations) el.getAnimations().forEach(a => { if (a.animationName) out.push(a); }); });
  return out;
}
function restartHero(withName){ heroAnims(withName).forEach(a => { try { a.cancel(); a.play(); } catch (e) {} }); }
function release(){ root.classList.remove("intro-hold"); ov.classList.add("open"); restartHero(false); requestAnimationFrame(() => api.setIntro(false)); }
function dom(t){
  const bar = Math.min(9, Math.max(0, Math.floor(t / BAR))), sub = bar === 6 ? Math.min(3, Math.floor((t - T(6)) / B)) : -1, key = bar + ":" + sub;
  if (key !== hudKey){ hudKey = key; hudNum.textContent = pad2(bar); hudTxt.textContent = LABELS[bar] + (sub >= 0 ? " · " + LABEL6[sub] : ""); }
  const fr = Math.floor(Math.max(0, t) * 24), tc = pad2(Math.floor(fr / 1440)) + ":" + pad2(Math.floor(fr / 24) % 60) + ":" + pad2(fr % 24);
  if (tc !== lastTc){ lastTc = tc; hudTc.textContent = tc; }
  hudFill.style.setProperty("--p", cl(t / END).toFixed(4));
  ov.classList.toggle("ending", t >= T(9));
  const nt = t - T(8);
  if (nt >= 0){
    if (!NM){ NM = measureName(); lensGeom(); }
    nameEl.classList.add("show");
    for (const a of nameAnims) a.currentTime = nt * 1000;
    const f = eMove(ramp(t, T(9) + .1, .9)), lift = -Math.sin(f * Math.PI) * 10;
    nameEl.style.transform = `translate(${lerp(NM.tx0, NM.tx1, f).toFixed(2)}px, ${(lerp(NM.ty0, NM.ty1, f) + lift).toFixed(2)}px) scale(${lerp(NM.s0, NM.s1, f).toFixed(4)})`;
    const si = eOut(ramp(t, T(8, 2), .45)), sa = si * (1 - eOut(ramp(t, T(9), .3)));
    subEl.style.top = NM.subY.toFixed(1) + "px"; subEl.style.opacity = sa.toFixed(3); subEl.style.transform = `translateY(${((1 - si) * 10).toFixed(1)}px)`;
  } else if (nameEl.classList.contains("show") || nameAnims.length && nameAnims[0].currentTime){
    nameEl.classList.remove("show"); subEl.style.opacity = "0"; for (const a of nameAnims) a.currentTime = 0;
  }
  const isLanded = t >= T(9) + .95;
  if (isLanded !== landed){ landed = isLanded; root.classList.toggle("intro-landed", landed); }
  if (t >= T(9) + 1.05 && !released){ released = true; release(); }
  if (t < T(9) + 1.05 && ov.classList.contains("open")) ov.classList.remove("open");
}

/* ---------- playback: the music is the clock ---------- */
let mode = "off", ft = 0, lastNow = 0, raf2 = 0, gateT = 0, stalled = false, stallT0 = 0, audioLive = false, hidHold = false, resumeAudio = false, soundOn = true, capture = false;
const setInert = on => INERT.forEach(el => { el.inert = on; });
function jumpTop(){ const h = document.documentElement, sb = h.style.scrollBehavior; h.style.scrollBehavior = "auto"; window.scrollTo(0, 0); h.style.scrollBehavior = sb; }
function warmFonts(){
  if (!document.fonts || !document.fonts.load) return;
  const go = () => { [GRO(64), SER(64), SER4(64), MON(12)].forEach(f => document.fonts.load(f, "NETWORK real data 0123456789%").catch(() => {})); };
  const l = document.getElementById("fontcss");
  if (l && l.media !== "all") l.addEventListener("load", go, {once: true}); go();
}
if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener("loadingdone", () => { TM.clear(); delete CACHE.gal; NM = null; });
function frame(now){
  raf2 = requestAnimationFrame(frame);
  const dt = Math.min(.1, Math.max(0, (now - lastNow) / 1000)); lastNow = now;
  if (mode === "gate"){ gateT += dt; drawGate(gateT); return; }
  if (mode !== "film" || capture) return;
  if (stalled && now - stallT0 > (audioLive ? 1500 : 1200)){ stalled = false; audioLive = false; }
  if (!stalled && !hidHold) ft += dt;
  if (audioLive && !stalled && !audio.paused){ const d = audio.currentTime - ft; if (Math.abs(d) > .3) ft = audio.currentTime; else ft += d * .1; }
  // build the heavier scene data a little before it is needed, in quieter moments
  if (ft > T(1) && !CACHE.hex) hexGrid(); else if (ft > T(2, 2) && !CACHE.graph) graph(); else if (ft > T(4, 1) && !CACHE.gal) galaxy(); else if (ft > T(7, 1) && !CACHE.dots) dotGrid();
  render(ft); dom(ft);
  if (ft >= END) finish();
}
function loop2(){ lastNow = performance.now(); if (!raf2) raf2 = requestAnimationFrame(frame); }
function openGate(){
  mode = "gate"; gateT = 0; ov.classList.remove("playing", "ending", "out");
  if (gateEl) gateEl.inert = false; if (ctrlEl) ctrlEl.inert = true;
  setInert(true); layout();
  try { audio.preload = "auto"; audio.load(); } catch (e) {}
  warmFonts();
  if (playBtn) playBtn.focus({preventScroll: true});
  loop2();
}
function begin(fromGate){
  if (mode === "film") return;
  G0 = fromGate ? gateGeom() : null;
  mode = "film"; ft = 0; stalled = true; stallT0 = performance.now(); audioLive = false; landed = released = false; hudKey = ""; lastTc = "";
  jumpTop(); layout();
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
function finish(){
  if (mode === "off") return;
  mode = "off"; if (raf2){ cancelAnimationFrame(raf2); raf2 = 0; }
  if (!released){ released = true; root.classList.add("intro-landed"); release(); }
  root.classList.remove("intro-show", "intro-hold");
  ov.classList.remove("playing", "ending", "out", "open");
  nameEl.classList.remove("show"); subEl.style.opacity = "0";
  setInert(false);
  api.setIntro(false);
  try { sessionStorage.setItem("ss-intro", "seen"); } catch (e) {}
  if (heroName){ heroName.setAttribute("tabindex", "-1"); heroName.focus({preventScroll: true}); }
}
function skip(){
  if (mode === "off" || mode === "leaving") return;
  fadeAudio(.35);
  if (!landed && !released){ root.classList.remove("intro-landed", "intro-hold"); released = true; restartHero(true); }
  else if (!released){ released = true; release(); }
  api.setIntro(false);
  if (raf2){ cancelAnimationFrame(raf2); raf2 = 0; }
  mode = "leaving"; ov.classList.add("out");
  setTimeout(() => { mode = "film"; finish(); }, api.reduced() ? 0 : 440);
}
function replay(){
  if (mode !== "off") return;
  root.classList.remove("intro-landed"); root.classList.add("intro-hold", "intro-show");
  api.setIntro(true); setInert(true);
  begin(false);
}
playBtn && playBtn.addEventListener("click", () => begin(true));
gateSkip && gateSkip.addEventListener("click", skip);
skipBtn.addEventListener("click", skip);
soundBtn.addEventListener("click", () => { soundOn = !soundOn; audio.muted = !soundOn; soundBtn.setAttribute("aria-pressed", soundOn ? "true" : "false"); });
replayBtn && replayBtn.addEventListener("click", replay);
addEventListener("keydown", e => { if (e.key === "Escape" && (mode === "gate" || mode === "film")){ e.preventDefault(); skip(); } });
addEventListener("resize", () => { if (mode === "gate" || mode === "film"){ layout(); if (mode === "film" && !raf2) render(ft); } });
document.addEventListener("visibilitychange", () => {
  if (mode !== "film") return;
  if (document.hidden){ hidHold = true; if (!audio.paused){ audio.pause(); resumeAudio = true; } }
  else { hidHold = false; lastNow = performance.now(); if (resumeAudio){ resumeAudio = false; audio.play().catch(() => {}); } }
});
if (DEV) window.__intro = {
  B, BAR, END,
  prep(){ capture = true; if (mode === "gate") ov.classList.add("playing"); begin(false); if (raf2){ cancelAnimationFrame(raf2); raf2 = 0; } },
  renderAt(t){ ft = t; render(t); dom(t); if (released){ const ms = (t - T(9) - 1.05) * 1000; heroAnims(false).forEach(a => { a.pause(); a.currentTime = Math.max(0, ms); }); } return t; },
  done(){ capture = false; heroAnims(false).forEach(a => { try { a.play(); } catch (e) {} }); finish(); }
};
window.__introAPI = {replay};
if (root.classList.contains("intro-show")) openGate();
else if (api.pending === "replay"){ api.pending = null; replay(); }
window.__introReady = true;
}
}
}
if (window.__site) init(window.__site); else window.__introInit = init;
})();
