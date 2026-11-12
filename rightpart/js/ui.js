// Small UI helpers: safe HTML templating, translated markup, icons, toasts, dialogs, sound.
import { tr, format, t, getLanguage } from './core/i18n.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
/** Mark trusted markup so `html` does not escape it. */
export const raw = (s) => new Raw(String(s ?? ''));

/** Tagged template: escapes every value unless wrapped in raw(); arrays are joined. */
export function html(strings, ...values) {
  let out = '';
  strings.forEach((str, i) => {
    out += str;
    if (i < values.length) out += render(values[i]);
  });
  return raw(out);
}
function render(v) {
  if (v == null || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  return esc(v);
}

const RTL_CHAR = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
/** A value inside translated text, isolated so a code or a size can never be reordered by right-to-left text. */
function isolate(v) {
  if (v instanceof Raw) return v.s;
  if (v == null || v === false) return '';
  if (Array.isArray(v)) return v.map(isolate).join('');
  const s = String(v);
  return RTL_CHAR.test(s) ? `<bdi>${esc(s)}</bdi>` : `<bdi dir="ltr">${esc(s)}</bdi>`;
}

/**
 * Translated markup: th('Recording build {serial}', { serial: html`<b>${s}</b>` }).
 * The translation is escaped; values are escaped unless wrapped in raw()/html``.
 */
export function th(src, vars) {
  return raw(format(tr(src), vars, { text: esc, value: isolate }));
}
export { t };

// Part codes, sizes and numbers inside composed text ("Don't confuse with 100-0234 (M3 × 10)")
// are kept on one line and left to right, in every language.
const CODE_RE = /\b(?:[A-Z0-9]+[-/.])+[A-Z0-9]+\b|\bM\d+(?:\.\d+)?(?:\s?[×xX]\s?\d+(?:\.\d+)?)?\b/g;
/** Plain text to safe markup, with every code-like token isolated and unbroken. */
export function rich(text) {
  return raw(esc(text).replace(CODE_RE, (m) => `<bdi dir="ltr" class="nobr">${m}</bdi>`));
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const P = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  scan: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M7 9v6M10 9v6M13 9v6M16.5 9v6"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  home: '<path d="M4 11 12 4l8 7"/><path d="M6 10v10h12V10"/>',
  parts: '<path d="M12 3 4 7.5v9L12 21l8-4.5v-9z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
  identify: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/><path d="M8.5 11h5M11 8.5v5"/>',
  guide: '<path d="M5 4h11l3 3v13H5z"/><path d="M9 10h6M9 14h6M9 18h3"/>',
  shield: '<path d="M12 3 5 6v5c0 4.5 3 8.2 7 10 4-1.8 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/>',
  learn: '<path d="M3 8.5 12 4l9 4.5-9 4.5z"/><path d="M7 10.5V15c0 1.3 2.2 3 5 3s5-1.7 5-3v-4.5"/>',
  quiz: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.6 2.6 0 1 1 3.6 2.4c-.7.3-1.1.9-1.1 1.6v.5"/><path d="M12 17h.01"/>',
  data: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  xCircle: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
  alert: '<path d="M12 4 2.8 20h18.4z"/><path d="M12 10v4.5M12 17.5h.01"/>',
  stop: '<path d="M8.2 3h7.6L21 8.2v7.6L15.8 21H8.2L3 15.8V8.2z"/><path d="M12 8v5M12 16h.01"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  chevronLeft: '<path d="m15 6-6 6 6 6"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  cube: '<path d="M12 3 4 7.5v9L12 21l8-4.5v-9z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
  ruler: '<path d="M3 16 16 3l5 5L8 21z"/><path d="m7 12 2 2M10 9l2 2M13 6l2 2M5 15l1.5 1.5"/>',
  play: '<path d="M7 5v14l12-7z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  replay: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/>',
  explode: '<path d="M12 3v5M12 16v5M3 12h5M16 12h5M5.6 5.6l3 3M15.4 15.4l3 3M5.6 18.4l3-3M15.4 8.6l3-3"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  sparkle: '<path d="M12 3c.6 3.8 2.2 5.4 6 6-3.8.6-5.4 2.2-6 6-.6-3.8-2.2-5.4-6-6 3.8-.6 5.4-2.2 6-6z"/><path d="M19 15c.3 1.7 1 2.4 2.7 2.7-1.7.3-2.4 1-2.7 2.7-.3-1.7-1-2.4-2.7-2.7 1.7-.3 2.4-1 2.7-2.7z"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8" r="1.5"/>',
  wrench: '<path d="M14.5 6.5a4 4 0 0 0 5 5L21 13l-8 8-3-3 6.5-6.5a4 4 0 0 0-2-5z"/><path d="M3 21l6-6"/>',
  print: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  hand: '<path d="M8 11V5.5a1.5 1.5 0 0 1 3 0V10M11 9.5V4a1.5 1.5 0 0 1 3 0v6M14 6.5a1.5 1.5 0 0 1 3 0V13M8 11a1.5 1.5 0 0 0-3 0v2c0 4.4 3 8 7 8h1c3 0 4-2 4-5v-3"/>',
  history: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4M12 8v4l3 2"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  bolt: '<path d="M9 3h6v4l2 2v2H7V9l2-2z"/><path d="M10 11v10M14 11v10M10 14l4-1.5M10 17l4-1.5M10 20l4-1.5"/>',
  gauge: '<path d="M3 17h18M5 17v-3M9 17v-5M13 17v-3M17 17v-5M21 17v-3"/><path d="M3 7h18"/>',
  book: '<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h10"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".5"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  esd: '<path d="M13 3 6 13h5l-1 8 7-10h-5z"/><circle cx="12" cy="12" r="10"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
  building: '<path d="M4 21V5l8-2v18M12 8h8v13M4 21h16"/><path d="M7 8h2M7 12h2M7 16h2M15 12h2M15 16h2"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 9.3 4.4 4.4 0 0 0 7 18z"/>',
  checklist: '<path d="M10 6h10M10 12h10M10 18h10"/><path d="m3.5 6 1.5 1.5L7.5 5M3.5 12l1.5 1.5 2.5-2.5M3.5 18l1.5 1.5 2.5-2.5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1.2-3.5 3.6-5 6.5-5s5.3 1.5 6.5 5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 15c1.8.6 3 2.2 3.5 5"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/>',
  send: '<path d="M4 12 20 4l-6 16-3-7z"/><path d="m11 13 9-9"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
  arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  grip: '<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  antibody: '<path d="M12 21v-7.5M12 13.5 6.8 8.3M12 13.5l5.2-5.2"/><path d="M3.8 10.2 8.2 5.8M20.2 10.2l-4.4-4.4"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
};

export function icon(name, cls = '') {
  return raw(`<svg class="ico${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.info}</svg>`);
}

export const LOGO = raw(`<svg viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="10" fill="var(--brand)"/><path d="M20 7.5 30.8 13.75v12.5L20 32.5 9.2 26.25v-12.5z" fill="none" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"/><path d="m14.6 20.2 3.7 3.7 7.3-7.6" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`);

// ---------- Toasts ----------
export function toast(message, type = 'info', ms = 3200) {
  let box = document.querySelector('.toasts');
  if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.append(box); }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${icon(type === 'ok' ? 'checkCircle' : type === 'bad' ? 'xCircle' : 'info')}<span>${esc(message)}</span>`;
  box.append(el);
  setTimeout(() => { el.style.transition = 'opacity 200ms'; el.style.opacity = '0'; setTimeout(() => el.remove(), 220); }, ms);
}

// ---------- Dialog ----------
/**
 * openDialog({ title, body (html string), wide, actions: [{label, value, primary, danger}], onMount(el, close), onClose(el, value) })
 * Resolves with the clicked action value (or null when dismissed).
 */
export function openDialog({ title, body, wide = false, actions = [{ label: t('Close'), value: null }], onMount, onClose }) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'dlg' + (wide ? ' wide' : '');
    d.innerHTML = `<div class="dh"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="${esc(t('Close'))}">${icon('x')}</button></div>
      <div class="db">${body}</div>
      ${actions.length ? `<div class="df">${actions.map((a, i) => `<button class="btn ${a.primary ? 'primary' : ''} ${a.danger ? 'danger' : ''}" data-act="${i}">${esc(a.label)}</button>`).join('')}</div>` : ''}`;
    document.body.append(d);
    let result = null;
    const close = (v = null) => { result = v; d.close(); };
    d.addEventListener('close', () => { try { onClose?.(d, result); } catch (e) { console.error(e); } d.remove(); resolve(result); });
    d.addEventListener('click', (e) => {
      if (e.target === d) close(null);
      const c = e.target.closest('[data-close]');
      if (c) close(null);
      const a = e.target.closest('[data-act]');
      if (a) close(actions[+a.dataset.act].value);
    });
    d.showModal();
    onMount?.(d, close);
  });
}

export async function confirmDialog(title, text, okLabel = t('OK'), danger = false) {
  const v = await openDialog({ title, body: `<p>${esc(text)}</p>`, actions: [{ label: t('Cancel'), value: false }, { label: okLabel, value: true, primary: !danger, danger }] });
  return v === true;
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast(t('Copied {text}', { text }), 'ok', 1800); }
  catch { toast(t('Copy is not available here'), 'bad'); }
}

export function download(filename, content, type = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function pickFile(accept) {
  return new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept;
    i.addEventListener('change', () => resolve(i.files?.[0] || null));
    i.click();
  });
}

// ---------- Feedback sound and vibration (bench feedback) ----------
let audioCtx = null;
export function beep(kind = 'ok') {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime;
    const notes = kind === 'ok' ? [[880, 0], [1320, 0.09]] : [[220, 0], [196, 0.16]];
    for (const [f, dt] of notes) {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = kind === 'ok' ? 'sine' : 'square';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + dt);
      g.gain.exponentialRampToValueAtTime(kind === 'ok' ? 0.18 : 0.08, t + dt + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dt + (kind === 'ok' ? 0.16 : 0.24));
      o.connect(g).connect(audioCtx.destination);
      o.start(t + dt); o.stop(t + dt + 0.3);
    }
  } catch { /* sound is optional */ }
  try { navigator.vibrate?.(kind === 'ok' ? 40 : [120, 60, 160]); } catch { /* optional */ }
}

export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function fmtDay(ts) {
  try { return new Date(ts).toLocaleDateString(getLanguage(), { dateStyle: 'medium', numberingSystem: 'latn' }); } catch { return String(ts); }
}

export function fmtDate(ts) {
  try { return new Date(ts).toLocaleString(getLanguage(), { dateStyle: 'medium', timeStyle: 'short', numberingSystem: 'latn' }); } catch { return String(ts); }
}
