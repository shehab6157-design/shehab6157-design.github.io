// RightPart: app shell, router, company workspaces and the global search box.
import { loadLibrary, setSetting, currentWorkspace, setCurrentWorkspace, workspaces } from './store.js';
import { buildIndex, search, resolveCode } from './core/model.js';
import { runAudit } from './core/audit.js';
import { html, icon, LOGO, esc, $, toast } from './ui.js';
import { thumb, partHref } from './components.js';

const DEMO_URL = 'data/demo-library.json';

/** Everything the pages need: the current company, its library, the index and the integrity check. */
export const app = { lib: null, index: null, audit: null, source: 'demo', libName: '', savedAt: null, version: null, workspace: null, context: {} };

export function setLibrary(lib, source = app.source, name) {
  app.lib = lib;
  app.index = buildIndex(lib);
  app.audit = runAudit(app.index);
  app.source = source;
  app.libName = name || lib.meta?.name || 'Library';
  app.workspace = currentWorkspace();
  renderNav();
  renderWorkspaceButton();
  window.dispatchEvent(new CustomEvent('rightpart:library'));
}

/** Load the current workspace's library from this device (or the demo file). */
export async function reloadLibrary() {
  const { library, source, name, savedAt, version } = await loadLibrary(DEMO_URL);
  app.savedAt = savedAt || null;
  app.version = version ?? null;
  setLibrary(library, source, name);
}

/** Switch company: every page then works on that company's data only. */
export async function switchWorkspace(id, to = '#/') {
  setCurrentWorkspace(id);
  await reloadLibrary();
  toast(`Now working in ${app.workspace.name}.`, 'ok');
  navigate(to);
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
  { path: 'editor/:device', nav: 'guides', load: () => import('./views/editor.js') },
  { path: 'identify', nav: 'identify', load: () => import('./views/identify.js') },
  { path: 'teach', nav: 'identify', load: () => import('./views/teach.js') },
  { path: 'audit', nav: 'audit', load: () => import('./views/audit.js') },
  { path: 'ask', nav: 'ask', load: () => import('./views/ask.js') },
  { path: 'learn', nav: 'learn', load: () => import('./views/learn.js') },
  { path: 'quiz/:device', nav: 'learn', load: () => import('./views/quiz.js') },
  { path: 'setup', nav: 'setup', load: () => import('./views/setup.js') },
  { path: 'companies', nav: 'companies', load: () => import('./views/companies.js') },
  { path: 'data', nav: 'data', load: () => import('./views/data.js') },
  { path: 'challenges', nav: 'challenges', load: () => import('./views/challenges.js') },
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
  // What the Ask panel knows about where the person is.
  app.context = { deviceId: m.params.device || (m.route.path === 'device/:id' ? m.params.id : null), stepId: m.params.step || null, partId: m.route.path === 'part/:id' ? m.params.id : null };
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
  { id: 'ask', href: '#/ask', label: 'Ask a question', icon: 'chat' },
  { id: 'learn', href: '#/learn', label: 'Learn fasteners', icon: 'learn' },
  { id: 'setup', href: '#/setup', label: 'Set up this company', icon: 'checklist' },
  { id: 'companies', href: '#/companies', label: 'Companies and sign-in', icon: 'building' },
  { id: 'data', href: '#/data', label: 'Data and records', icon: 'data' },
  { id: 'challenges', href: '#/challenges', label: 'Problems to expect', icon: 'alert' },
  { id: 'about', href: '#/about', label: 'About the idea', icon: 'info' },
];

function renderNav() {
  const crit = app.audit?.counts.critical || 0;
  const item = (n, small) => html`<a href="${n.href}" ${n.id === currentNav ? html`aria-current="page"` : ''}>${icon(n.icon)}<span>${small && n.id === 'guides' ? 'Build' : n.label}</span>${n.id === 'audit' && crit ? html`<span class="count" aria-label="${crit} critical">${crit}</span>` : ''}</a>`;
  const ws = currentWorkspace();
  const side = $('#sidenav');
  if (side) {
    side.innerHTML = String(html`${NAV.map((n) => item(n))}
      <div class="group">More</div>
      ${NAV_MORE.map((n) => item(n))}
      <div class="foot">${ws.kind === 'demo' ? 'Demo: a fictional device. Add your own company with the company button at the top.' : ws.kind === 'cloud' ? html`Signed-in company: ${ws.name}. A copy is kept on this device for offline work.` : html`${ws.name}: stored only on this device.`}</div>`);
  }
  const bottom = $('#bottomnav');
  if (bottom) bottom.innerHTML = String(html`${NAV.map((n) => item(n, true))}`);
}

const NARROW = window.matchMedia('(max-width: 640px)');
function searchPlaceholder() {
  const input = $('#q');
  if (!input) return;
  input.placeholder = NARROW.matches ? 'Code, size or question'
    : currentWorkspace().kind === 'demo' ? 'Any code, size, name or question: C-55013, M3x8, torque for step 7?' : 'Any code, size, name or a question';
}

function renderWorkspaceButton() {
  const b = $('#wsBtn');
  if (!b) return;
  const ws = currentWorkspace();
  const initials = ws.kind === 'demo' ? 'Demo' : ws.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  b.innerHTML = String(html`${icon(ws.kind === 'cloud' ? 'cloud' : 'building')}<span class="ws-name">${ws.kind === 'demo' ? 'Demo' : ws.name}</span><span class="ws-init">${initials}</span>${icon('chevronDown', 'chev')}`);
  b.setAttribute('aria-label', `Company: ${ws.name}. Switch company`);
  searchPlaceholder();
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
  const looksLikeQuestion = /\?|^(how|what|which|why|where|when|can|do|is|does|show|tell|כמה|מה|איזה|למה|איפה|كم|ما|ماذا|أي|لماذا|أين)\b/i.test(q.trim());
  box.innerHTML = String(html`${looksLikeQuestion ? html`<a role="option" id="sg-ask" href="#/ask?q=${encodeURIComponent(q)}" aria-selected="false"><span class="thumb" style="display:grid;place-items:center">${icon('chat')}</span><span><span class="t">Ask: “${q}”</span><br><span class="s">Answer from this company's parts, steps and BOMs</span></span><span class="k"></span></a>` : ''}
    ${res.results.length ? res.results.map((r, i) => html`<a role="option" id="sg-${i}" href="${partHref(r.part.id)}" aria-selected="${i === activeIdx}">
      <span class="thumb">${thumb(r.part)}</span>
      <span><span class="t">${r.part.name}</span><br><span class="s"><span class="code">${r.part.id}</span> · ${r.reasons[0]?.text || ''}</span></span>
      <span class="k">${r.reasons[0]?.kind === 'code' ? (amb ? html`<span class="chip bad">2+ parts</span>` : html`<span class="chip ok">exact</span>`) : ''}</span>
    </a>`) : looksLikeQuestion ? '' : html`<div class="foot">No part matches “${q}”. Press Enter to ask it as a question.</div>`}
    <div class="foot">Enter: ${res.exact?.status === 'unique' ? 'open this part' : looksLikeQuestion || !res.results.length ? 'ask it as a question' : 'see all results'} · Esc: close</div>`);
  box.classList.remove('hidden');
  $('#q').setAttribute('aria-expanded', 'true');
}

export function submitQuery(q) {
  q = String(q || '').trim();
  if (!q || !app.index) return;
  const r = resolveCode(app.index, q);
  closeSuggest();
  if (r.status === 'unique') { navigate(`${partHref(r.part.id)}?code=${encodeURIComponent(q)}`); return; }
  const res = search(app.index, q, { limit: 1 });
  const question = /\?|\s/.test(q) && (!res.results.length || /\?|^(how|what|which|why|where|when|can|do|is|does|show|tell|כמה|מה|איזה|למה|איפה|كم|ما|ماذا|أي|لماذا|أين)\b/i.test(q));
  if (question) navigate(`#/ask?q=${encodeURIComponent(q)}`);
  else navigate(`#/search?q=${encodeURIComponent(q)}`);
}

function wireSearch() {
  const form = $('#topSearch');
  const input = $('#q');
  searchPlaceholder();
  NARROW.addEventListener?.('change', searchPlaceholder);
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
    const opts = [...document.querySelectorAll('#suggest [role="option"]')];
    if (activeIdx >= 0 && opts[activeIdx]) { closeSuggest(); location.hash = opts[activeIdx].getAttribute('href'); input.blur(); return; }
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

// ---------- Company switcher ----------
function wireWorkspaces() {
  $('#wsBtn')?.addEventListener('click', async () => {
    const { workspaceDialog } = await import('./views/companies.js');
    workspaceDialog({ app, navigate });
  });
  renderWorkspaceButton();
}

// ---------- Ask button (on every page) ----------
function wireAsk() {
  const fab = $('#askFab');
  if (!fab) return;
  fab.innerHTML = String(html`${icon('chat')}<span>Ask</span>`);
  fab.addEventListener('click', async () => {
    const { openAskPanel } = await import('./askpanel.js');
    openAskPanel({ app, navigate });
  });
}

// ---------- Theme ----------
const isDark = () => (document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches);

function paintTheme() {
  const dark = isDark();
  const btn = $('#themeBtn');
  if (btn) {
    btn.innerHTML = String(icon(dark ? 'sun' : 'moon'));
    btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#131A22' : '#1D5BD8');
}

function toggleTheme() {
  const next = isDark() ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  setSetting('theme', next);
  paintTheme();
  window.dispatchEvent(new CustomEvent('rightpart:theme'));
}

function wireTheme() {
  $('#themeBtn').addEventListener('click', toggleTheme);
  paintTheme();
}

// ---------- Menu (phones and tablets, where the side menu is hidden) ----------
function openMenu() {
  const ws = currentWorkspace();
  const dark = isDark();
  const d = document.createElement('dialog');
  d.className = 'dlg sheet menu-sheet';
  d.setAttribute('aria-label', 'Menu');
  d.innerHTML = String(html`<div class="dh"><h2>${icon('menu')} Menu</h2><button class="icon-btn" type="button" data-close aria-label="Close">${icon('x')}</button></div>
    <div class="db">
      <button class="ws-item menu-ws" type="button" data-ws><span class="av">${icon(ws.kind === 'cloud' ? 'cloud' : 'building')}</span><span><span class="t">${ws.name}</span><br><span class="s">Company: switch or add one</span></span>${icon('chevronRight')}</button>
      <nav class="menu-list" aria-label="More pages">${NAV_MORE.map((n) => html`<a href="${n.href}" ${n.id === currentNav ? html`aria-current="page"` : ''}>${icon(n.icon)}<span>${n.label}</span></a>`)}</nav>
      <button class="btn" type="button" data-theme>${icon(dark ? 'sun' : 'moon')}${dark ? 'Light theme' : 'Dark theme'}</button>
    </div>`);
  document.body.append(d);
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', async (e) => {
    if (e.target === d || e.target.closest('[data-close]') || e.target.closest('a[href^="#/"]')) { d.close(); return; }
    if (e.target.closest('[data-ws]')) {
      d.close();
      const { workspaceDialog } = await import('./views/companies.js');
      workspaceDialog({ app, navigate });
      return;
    }
    if (e.target.closest('[data-theme]')) { toggleTheme(); d.close(); }
  });
  d.showModal();
}

function wireMenu() {
  const btn = $('#menuBtn');
  if (!btn) return;
  btn.innerHTML = String(icon('menu'));
  btn.addEventListener('click', openMenu);
}

// ---------- Boot ----------
async function boot() {
  document.querySelector('.appbrand .logo').innerHTML = String(LOGO);
  $('#aboutBtn').innerHTML = String(icon('info'));
  wireTheme();
  wireSearch();
  wireWorkspaces();
  wireMenu();
  wireAsk();
  // Hash routing owns the URL fragment, so the skip link moves focus itself.
  $('#skipLink')?.addEventListener('click', (e) => { e.preventDefault(); $('#main').focus(); });
  try {
    await reloadLibrary();
  } catch (err) {
    $('#main').innerHTML = String(html`<div class="page narrow"><div class="callout bad">${icon('stop')}<div><p class="t">The library could not be loaded</p><p>${err.message}. If you opened the file directly, serve the folder with a web server instead.</p></div></div></div>`);
    return;
  }
  window.addEventListener('hashchange', route);
  await route();
  registerSW();
  // A signed-in company refreshes its data quietly when the app opens online.
  if (app.workspace?.kind === 'cloud' && navigator.onLine) import('./cloud.js').then((c) => c.backgroundSync?.(app)).catch(() => {});
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
void esc; void workspaces;
