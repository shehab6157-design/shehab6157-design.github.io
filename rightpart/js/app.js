// RightPart: app shell, router and the global search box.
import { loadLibrary, settings, setSetting } from './store.js';
import { buildIndex, search, resolveCode } from './core/model.js';
import { runAudit } from './core/audit.js';
import { html, icon, LOGO, esc, $, toast } from './ui.js';
import { thumb, partHref } from './components.js';

const DEMO_URL = 'data/demo-library.json';

export const app = { lib: null, index: null, audit: null, source: 'demo', libName: '', savedAt: null };

export function setLibrary(lib, source = app.source, name) {
  app.lib = lib;
  app.index = buildIndex(lib);
  app.audit = runAudit(app.index);
  app.source = source;
  app.libName = name || lib.meta?.name || 'Library';
  renderNav();
}

// ---------- Routes ----------
const ROUTES = [
  { path: '', nav: 'home', load: () => import('./views/home.js') },
  { path: 'parts', nav: 'parts', load: () => import('./views/parts.js') },
  { path: 'search', nav: 'parts', load: () => import('./views/search.js') },
  { path: 'part/:id', nav: 'parts', load: () => import('./views/part.js') },
  { path: 'devices', nav: 'guides', load: () => import('./views/devices.js') },
  { path: 'device/:id', nav: 'guides', load: () => import('./views/device.js') },
  { path: 'guide/:device/:step', nav: 'guides', load: () => import('./views/guide.js') },
  { path: 'guide/:device', nav: 'guides', load: () => import('./views/guide.js') },
  { path: 'identify', nav: 'identify', load: () => import('./views/identify.js') },
  { path: 'teach', nav: 'identify', load: () => import('./views/teach.js') },
  { path: 'audit', nav: 'audit', load: () => import('./views/audit.js') },
  { path: 'learn', nav: 'learn', load: () => import('./views/learn.js') },
  { path: 'quiz/:device', nav: 'learn', load: () => import('./views/quiz.js') },
  { path: 'data', nav: 'data', load: () => import('./views/data.js') },
  { path: 'about', nav: 'about', load: () => import('./views/about.js') },
  { path: 'labels', nav: 'parts', load: () => import('./views/labels.js') },
];

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [p, q = ''] = h.split('?');
  return { path: p.replace(/\/+$/, ''), query: new URLSearchParams(q) };
}

function match(path) {
  const segs = path ? path.split('/').map(decodeURIComponent) : [];
  for (const r of ROUTES) {
    const pat = r.path ? r.path.split('/') : [];
    if (pat.length !== segs.length) continue;
    const params = {};
    if (pat.every((p, i) => (p.startsWith(':') ? ((params[p.slice(1)] = segs[i]), true) : p === segs[i]))) return { route: r, params };
  }
  return null;
}

let cleanup = null;
let renderSeq = 0;
let firstRender = true;
let currentNav = 'home';

export function navigate(hash) {
  if (location.hash === hash) route(); else location.hash = hash;
}

async function route() {
  const seq = ++renderSeq;
  const { path, query } = parseHash();
  const m = match(path);
  const main = $('#main');
  closeSuggest();
  try { cleanup?.(); } catch { /* ignore */ }
  cleanup = null;
  if (!m) {
    main.innerHTML = String(html`<div class="page narrow"><div class="empty"><h2>Page not found</h2><p style="margin-top:8px"><a href="#/">Back to home</a></p></div></div>`);
    return;
  }
  currentNav = m.route.nav;
  renderNav();
  try {
    const mod = await m.route.load();
    if (seq !== renderSeq) return;
    const view = await mod.default({ app, params: m.params, query, navigate });
    if (seq !== renderSeq) return;
    main.innerHTML = String(view.html);
    document.title = view.title ? `${view.title} · RightPart` : 'RightPart';
    if (!firstRender && !view.keepScroll) window.scrollTo({ top: 0, behavior: 'instant' });
    cleanup = view.mount?.(main) || null;
    if (!firstRender) main.focus({ preventScroll: true });
    firstRender = false;
  } catch (err) {
    console.error(err);
    main.innerHTML = String(html`<div class="page narrow"><div class="callout bad">${icon('stop')}<div><p class="t">This page could not be shown</p><p>${err.message}</p><div class="acts"><a class="btn" href="#/">Home</a></div></div></div></div>`);
  }
}

// ---------- Navigation ----------
const NAV = [
  { id: 'home', href: '#/', label: 'Home', icon: 'home' },
  { id: 'parts', href: '#/parts', label: 'Parts', icon: 'parts' },
  { id: 'identify', href: '#/identify', label: 'Identify', icon: 'identify' },
  { id: 'guides', href: '#/devices', label: 'Build', icon: 'guide' },
  { id: 'audit', href: '#/audit', label: 'Check', icon: 'shield' },
];
const NAV_MORE = [
  { id: 'learn', href: '#/learn', label: 'Learn fasteners', icon: 'learn' },
  { id: 'data', href: '#/data', label: 'Your data', icon: 'data' },
  { id: 'about', href: '#/about', label: 'About the idea', icon: 'info' },
];

function renderNav() {
  const crit = app.audit?.counts.critical || 0;
  const item = (n, small) => html`<a href="${n.href}" ${n.id === currentNav ? html`aria-current="page"` : ''}>${icon(n.icon)}<span>${small && n.id === 'guides' ? 'Build' : n.label}</span>${n.id === 'audit' && crit ? html`<span class="count" aria-label="${crit} critical">${crit}</span>` : ''}</a>`;
  const side = $('#sidenav');
  if (side) {
    side.innerHTML = String(html`${NAV.map((n) => item(n))}
      <div class="group">More</div>
      ${NAV_MORE.map((n) => item(n))}
      <div class="foot">${app.source === 'demo' ? 'Demo library: a fictional device. Import your own on "Your data"; it stays on this device.' : html`Your library: ${app.libName}. Stored only on this device.`}</div>`);
  }
  const bottom = $('#bottomnav');
  if (bottom) bottom.innerHTML = String(html`${NAV.map((n) => item(n, true))}`);
}

// ---------- Global search with suggestions ----------
let activeIdx = -1;
let lastResults = [];

function closeSuggest() {
  const box = $('#suggest');
  if (!box) return;
  box.classList.add('hidden');
  $('#q')?.setAttribute('aria-expanded', 'false');
  activeIdx = -1;
}

function renderSuggest(q) {
  const box = $('#suggest');
  if (!q.trim() || !app.index) { closeSuggest(); return; }
  const res = search(app.index, q, { limit: 6 });
  lastResults = res.results;
  const amb = res.exact?.status === 'ambiguous';
  box.innerHTML = String(html`${res.results.length ? res.results.map((r, i) => html`<a role="option" id="sg-${i}" href="${partHref(r.part.id)}" aria-selected="${i === activeIdx}">
      <span class="thumb">${thumb(r.part)}</span>
      <span><span class="t">${r.part.name}</span><br><span class="s"><span class="code">${r.part.id}</span> · ${r.reasons[0]?.text || ''}</span></span>
      <span class="k">${r.reasons[0]?.kind === 'code' ? (amb ? html`<span class="chip bad">2+ parts</span>` : html`<span class="chip ok">exact</span>`) : ''}</span>
    </a>`) : html`<div class="foot">No part matches “${q}”.</div>`}
    <div class="foot">Enter: ${res.exact?.status === 'unique' ? 'open this part' : 'see all results'} · Esc: close</div>`);
  box.classList.remove('hidden');
  $('#q').setAttribute('aria-expanded', 'true');
}

export function submitQuery(q) {
  q = String(q || '').trim();
  if (!q || !app.index) return;
  const r = resolveCode(app.index, q);
  closeSuggest();
  if (r.status === 'unique') navigate(`${partHref(r.part.id)}?code=${encodeURIComponent(q)}`);
  else navigate(`#/search?q=${encodeURIComponent(q)}`);
}

function wireSearch() {
  const form = $('#topSearch');
  const input = $('#q');
  const narrow = window.matchMedia('(max-width: 640px)');
  const ph = () => { input.placeholder = narrow.matches ? 'Code, size or name' : 'Any code, size or name: 100-0233, C-55013, M3x8…'; };
  ph();
  narrow.addEventListener?.('change', ph);
  let t = 0;
  input.addEventListener('input', () => { clearTimeout(t); activeIdx = -1; t = setTimeout(() => renderSuggest(input.value), 70); });
  input.addEventListener('focus', () => { if (input.value.trim()) renderSuggest(input.value); });
  input.addEventListener('keydown', (e) => {
    const opts = [...document.querySelectorAll('#suggest [role="option"]')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!opts.length) return;
      e.preventDefault();
      activeIdx = (activeIdx + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
      opts.forEach((o, i) => o.setAttribute('aria-selected', String(i === activeIdx)));
      input.setAttribute('aria-activedescendant', opts[activeIdx].id);
    } else if (e.key === 'Escape') { closeSuggest(); }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (activeIdx >= 0 && lastResults[activeIdx]) { closeSuggest(); navigate(partHref(lastResults[activeIdx].part.id)); input.blur(); return; }
    submitQuery(input.value);
    input.blur();
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('#topSearch')) closeSuggest(); });
  $('#suggest').addEventListener('click', () => { closeSuggest(); input.blur(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !e.target.closest('input, textarea, select, [contenteditable]')) { e.preventDefault(); input.focus(); input.select(); }
  });
  $('#scanBtn').innerHTML = String(icon('scan'));
  $('#photoBtn').innerHTML = String(icon('camera'));
  $('#scanBtn').addEventListener('click', async () => {
    const { scanDialog } = await import('./scan.js');
    const code = await scanDialog({ title: 'Scan any code', hint: 'Point the camera at a bin label, a bag or a drawing. A USB or Bluetooth scanner works too: just scan into the search box.' });
    if (code) { input.value = code; submitQuery(code); }
  });
  $('#photoBtn').addEventListener('click', () => navigate('#/identify'));
}

// ---------- Theme ----------
function wireTheme() {
  const btn = $('#themeBtn');
  const paint = () => {
    const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    btn.innerHTML = String(icon(dark ? 'sun' : 'moon'));
    btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#131A22' : '#1D5BD8');
  };
  btn.addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    setSetting('theme', next);
    paint();
    window.dispatchEvent(new CustomEvent('rightpart:theme'));
  });
  paint();
}

// ---------- Boot ----------
async function boot() {
  document.querySelector('.appbrand .logo').innerHTML = String(LOGO);
  $('#aboutBtn').innerHTML = String(icon('info'));
  wireTheme();
  wireSearch();
  // Hash routing owns the URL fragment, so the skip link moves focus itself.
  $('#skipLink')?.addEventListener('click', (e) => { e.preventDefault(); $('#main').focus(); });
  try {
    const { library, source, name, savedAt } = await loadLibrary(DEMO_URL);
    app.savedAt = savedAt || null;
    setLibrary(library, source, name);
  } catch (err) {
    $('#main').innerHTML = String(html`<div class="page narrow"><div class="callout bad">${icon('stop')}<div><p class="t">The library could not be loaded</p><p>${err.message}. If you opened the file directly, serve the folder with a web server instead.</p></div></div></div>`);
    return;
  }
  window.addEventListener('hashchange', route);
  await route();
  registerSW();
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if (local && !new URLSearchParams(location.search).has('sw')) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) toast('A new version is ready: reload to use it.'); });
    });
  }).catch(() => { /* offline support is optional */ });
}

boot();
void esc;
