// True-scale measuring on the screen.
// Calibrate once with a bank card (ISO/IEC 7810 ID-1: 85.60 × 53.98 mm), then lay a screw on the
// screen and drag the handles to its ends. Accuracy is about ± 0.3 mm: enough to tell
// M3 × 8 from M3 × 10, which is the mistake that matters.

import { html, icon, openDialog, toast } from './ui.js';
import { t, lower } from './core/i18n.js';
import { HEADS, DRIVES } from './core/dims.js';
import { settings, setSetting } from './store.js';
import { outlineMm } from './draw.js';
import { isFastener, sizeLabel, headDims } from './core/dims.js';

const CARD_W = 85.6, CARD_H = 53.98;
export const DEFAULT_PX_PER_MM = 96 / 25.4;

export function pxPerMm() { return settings().pxPerMm || null; }

export function calibrateDialog() {
  let value = settings().pxPerMm || DEFAULT_PX_PER_MM;
  return openDialog({
    title: t('Calibrate the screen'),
    wide: true,
    body: String(html`<p>${t('Hold a bank card (or any ID card of the same size) flat against the screen, and move the slider until the blue card is exactly as wide as yours. Do this once per device.')}</p>
      <div style="overflow:hidden;padding:8px 0"><div id="calCard" style="border:2px solid var(--brand);background:color-mix(in srgb,var(--brand) 12%,transparent);border-radius:10px;display:grid;place-items:center;color:var(--brand-strong);font-weight:700;max-width:none">85.6 mm</div></div>
      <div class="row nowrap"><button class="btn sm" type="button" data-step="-0.01" aria-label="${t('Smaller')}">${icon('chevronLeft')}</button><input id="calRange" type="range" min="2" max="14" step="0.005" aria-label="${t('Card width')}"><button class="btn sm" type="button" data-step="0.01" aria-label="Larger">${icon('chevronRight')}</button></div>
      <p class="tiny muted">${t("Tip: the card's long edge goes left to right. Your phone or tablet keeps this setting; a zoomed browser page changes it, so keep the zoom at 100%.")}</p>`),
    actions: [{ label: t('Cancel'), value: null }, { label: t('Save calibration'), value: 'save', primary: true }],
    onMount(d) {
      const card = d.querySelector('#calCard');
      const range = d.querySelector('#calRange');
      const paint = () => { card.style.width = `${CARD_W * value}px`; card.style.height = `${CARD_H * value}px`; range.value = String(value); };
      range.addEventListener('input', () => { value = +range.value; paint(); });
      d.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => { value = Math.max(2, Math.min(14, value + +b.dataset.step)); paint(); }));
      paint();
    },
  }).then((v) => {
    if (v !== 'save') return null;
    setSetting('pxPerMm', Math.round(value * 1000) / 1000);
    toast(t('Screen calibrated.'), 'ok');
    return value;
  });
}

const STD_D = [[1.6, 'M1.6'], [2, 'M2'], [2.5, 'M2.5'], [2.84, '#4 (inch)'], [3, 'M3'], [3.5, 'M3.5'], [3.51, '#6 (inch)'], [4, 'M4'], [4.17, '#8 (inch)'], [5, 'M5'], [6, 'M6']].map(([d, l]) => [d, l.replace('(inch)', '(' + t('inch') + ')')]);

export function nearestThread(d) {
  let best = STD_D[0];
  for (const s of STD_D) if (Math.abs(s[0] - d) < Math.abs(best[0] - d)) best = s;
  return best;
}

/**
 * Mounts the measuring stage. onChange({ length, diameter }) fires while dragging.
 * Returns { setOverlay(part|null), measure(), redraw(), destroy() }.
 */
export function mountGauge(el, { onChange } = {}) {
  let ppm = pxPerMm() || DEFAULT_PX_PER_MM;
  let W = el.clientWidth || 600;
  const H = () => Math.max(170, Math.min(300, 34 * ppm));
  let h = H();
  const mid = () => h * 0.58;
  // handle positions in px
  let A = 60, B = 60 + 8 * ppm, C = mid() - 1.5 * ppm, D = mid() + 1.5 * ppm;
  let overlay = null;
  let drag = null;

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', t('Measuring stage with a millimetre ruler'));
  svg.setAttribute('class', 'gstage');
  el.append(svg);

  const measure = () => ({ length: Math.abs(B - A) / ppm, diameter: Math.abs(D - C) / ppm });

  const draw = () => {
    W = el.clientWidth || W;
    h = H();
    svg.setAttribute('viewBox', `0 0 ${W} ${h}`);
    svg.setAttribute('height', String(h));
    let ticks = '';
    for (let mm = 0; mm * ppm < W; mm++) {
      const x = 8 + mm * ppm;
      const len = mm % 10 === 0 ? 18 : mm % 5 === 0 ? 12 : 7;
      ticks += `<line x1="${x}" y1="0" x2="${x}" y2="${len}" stroke="currentColor" stroke-width="${mm % 10 === 0 ? 1.4 : 1}" opacity=".7"/>`;
      if (mm % 10 === 0) ticks += `<text x="${x + 3}" y="30" font-size="12" fill="currentColor" opacity=".75">${mm}</text>`;
    }
    const m = measure();
    const ov = overlay ? outlineMm(overlay) : null;
    const ovG = ov ? `<g transform="translate(${A} ${(C + D) / 2}) scale(${ppm})" style="color:var(--warn)">${ov.svg}</g>` : '';
    const yMid = (C + D) / 2;
    svg.innerHTML = `<style>.gstage .ghost{fill:none;stroke:var(--warn);stroke-width:2.2;stroke-dasharray:6 4}.gstage .th{display:none}</style>
      <rect x="0" y="0" width="${W}" height="${h}" fill="var(--surface)"/>
      <g style="color:var(--text-2)">${ticks}</g>
      <line x1="0" x2="${W}" y1="${yMid}" y2="${yMid}" stroke="var(--line-2)" stroke-dasharray="4 6"/>
      ${ovG}
      <rect x="${Math.min(A, B)}" y="${Math.min(C, D)}" width="${Math.abs(B - A)}" height="${Math.abs(D - C)}" fill="var(--brand)" opacity=".08"/>
      ${handleV(A, 'Head', h)}${handleV(B, 'Tip', h)}${handleH(C, W)}${handleH(D, W)}
      <text x="${(A + B) / 2}" y="${h - 12}" font-size="15" font-weight="700" text-anchor="middle" fill="var(--brand)">${m.length.toFixed(1)} mm</text>
      <text x="${Math.max(A, B) + 14}" y="${yMid + 5}" font-size="14" font-weight="700" fill="var(--brand)">Ø ${m.diameter.toFixed(1)}</text>`;
    onChange?.(m);
  };

  function handleV(x, label, hh) {
    return `<g class="handle" data-h="${label === 'Head' ? 'A' : 'B'}"><line x1="${x}" x2="${x}" y1="36" y2="${hh - 30}" stroke="var(--brand)" stroke-width="2"/><rect x="${x - 22}" y="36" width="44" height="${hh - 66}" fill="transparent"/><circle cx="${x}" cy="${hh - 30}" r="11" fill="var(--brand)"/><text x="${x}" y="${hh - 26}" font-size="10" font-weight="800" fill="var(--brand-ink)" text-anchor="middle">${label === 'Head' ? 'H' : 'T'}</text></g>`;
  }
  function handleH(y, w) {
    return `<g class="handle v"><line x1="0" x2="${w}" y1="${y}" y2="${y}" stroke="var(--ok)" stroke-width="1.6" stroke-dasharray="7 4"/><circle cx="${w - 20}" cy="${y}" r="9" fill="var(--ok)"/></g>`;
  }

  const local = (e) => { const r = svg.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * h }; };
  const onDown = (e) => {
    const p = local(e);
    const cands = [['A', Math.abs(p.x - A)], ['B', Math.abs(p.x - B)], ['C', Math.abs(p.y - C) * 1.4], ['D', Math.abs(p.y - D) * 1.4]].sort((a, b) => a[1] - b[1]);
    if (cands[0][1] > 40) return;
    drag = cands[0][0];
    svg.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onMove = (e) => {
    if (!drag) return;
    const p = local(e);
    if (drag === 'A') A = Math.max(4, Math.min(W - 4, p.x));
    if (drag === 'B') B = Math.max(4, Math.min(W - 4, p.x));
    if (drag === 'C') C = Math.max(36, Math.min(h - 4, p.y));
    if (drag === 'D') D = Math.max(36, Math.min(h - 4, p.y));
    draw();
  };
  const onUp = () => { drag = null; };
  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointercancel', onUp);
  // Keyboard: arrows move the length handle B, shift+arrows the diameter.
  svg.tabIndex = 0;
  svg.addEventListener('keydown', (e) => {
    const step = ppm * (e.altKey ? 0.1 : 0.5);
    if (e.key === 'ArrowRight') { if (e.shiftKey) D += step; else B += step; }
    else if (e.key === 'ArrowLeft') { if (e.shiftKey) D -= step; else B -= step; }
    else return;
    e.preventDefault(); draw();
  });
  const ro = new ResizeObserver(() => draw());
  ro.observe(el);
  draw();

  return {
    measure,
    setOverlay(part) { overlay = part && isFastener(part) ? part : null; draw(); },
    setFromPart(part) {
      // Place the handles on a part's true size (used for "show me how big X is").
      if (!part?.spec) return;
      const s = part.spec;
      const L = part.category === 'screw' ? (s.head === 'countersunk' ? s.length : s.length) : s.length || 6;
      B = A + L * ppm;
      const d = s.d || 3;
      C = mid() - (d / 2) * ppm; D = mid() + (d / 2) * ppm;
      draw();
    },
    recalibrated() { ppm = pxPerMm() || DEFAULT_PX_PER_MM; B = A + 8 * ppm; C = mid() - 1.5 * ppm; D = mid() + 1.5 * ppm; draw(); },
    destroy() { ro.disconnect(); svg.remove(); },
  };
}

/** Rank library fasteners against a measurement and optional head/drive. */
export function rankByMeasure(parts, { length, diameter, head, drive, category = 'screw' }) {
  const out = [];
  for (const p of parts) {
    if (!isFastener(p) || p.category !== category || !p.spec) continue;
    const s = p.spec;
    const L = s.length ?? null;
    const d = s.d ?? null;
    let score = 1;
    const notes = [];
    if (length && L != null) {
      const dl = Math.abs(L - length);
      score -= Math.min(0.6, dl * 0.18);
      notes.push(dl <= 0.5 ? { ok: true, text: t('length matches ({n} mm)', { n: L }) } : { text: t('{n} mm long ({diff})', { n: L, diff: (L - length > 0 ? '+' : '') + (L - length).toFixed(1) }) });
    }
    if (diameter && d != null) {
      const dd = Math.abs(d - diameter);
      score -= Math.min(0.5, dd * 0.45);
      notes.push(dd <= 0.25 ? { ok: true, text: t('diameter matches ({thread})', { thread: s.thread || 'M' + d }) } : { text: `${s.thread || 'M' + d}` });
    }
    if (head) { if (s.head === head) notes.push({ ok: true, text: t('same head') }); else { score -= 0.3; notes.push({ text: t('head: {head}', { head: lower(HEADS[s.head]?.label || s.head || '?') }) }); } }
    if (drive) { if (s.drive === drive) notes.push({ ok: true, text: t('same drive') }); else { score -= 0.2; notes.push({ text: t('drive: {drive}', { drive: DRIVES[s.drive]?.label || s.drive || '?' }) }); } }
    if (p.status === 'obsolete') { score -= 0.1; notes.push({ text: t('retired') }); }
    out.push({ part: p, score: Math.max(0, Math.round(score * 100) / 100), notes });
  }
  return out.sort((a, b) => b.score - a.score);
}

void sizeLabel; void headDims;
