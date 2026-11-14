import { html, th, icon, fmtDate } from '../ui.js';
import { t } from '../core/i18n.js';
import { listRecords } from '../store.js';
import { submitQuery } from '../app.js';
import { productCard } from '../components.js';
import { fillPosters } from '../posters.js';

const DEMO_EXAMPLES = [
  ['C-55013', () => t('customer code')],
  ['AF-7380-M3-8-A2', () => t('supplier code')],
  ['ISO 7380 M3x8', () => t('standard size')],
  ['SCR-TX-36', () => t('old code')],
  ['DS-103-308', () => t('one code, two parts')],
  ['100-0283', () => t('typo')],
];
const ALIAS_LABEL = { customer: () => t('customer code'), supplier: () => t('supplier code'), manufacturer: () => t('maker code'), drawing: () => t('drawing code'), legacy: () => t('old code') };

/** A few codes from the company's own data, one of each kind, to show that any of them works. */
function ownExamples(lib) {
  const out = [];
  if (lib.parts[0]) out.push([lib.parts[0].id, () => t('internal code')]);
  const seen = new Set();
  for (const p of lib.parts) {
    for (const a of p.aliases || []) {
      if (ALIAS_LABEL[a.type] && !seen.has(a.type)) { seen.add(a.type); out.push([a.code, ALIAS_LABEL[a.type]]); }
    }
    if (seen.size >= 4) break;
  }
  const sized = lib.parts.find((p) => p.designation && p.designation.length <= 24);
  if (sized) out.push([sized.designation, () => t('standard size')]);
  return out.slice(0, 6);
}

/** A company that has just been added: nothing to search yet, so show how to start. */
function welcome(app) {
  const ws = app.workspace;
  const cloud = ws?.kind === 'cloud';
  return {
    title: t('Home'),
    html: html`<div class="page narrow">
      <section class="hero">
        <h1>${ws.name}</h1>
        <p class="lede">${t("This company has no data yet. Load its parts, BOMs and assembly steps once, and every page works on them: search by any code, true-scale drawings, step-by-step guides, checks at the bench, the integrity check and answers to workers' questions.")}</p>
        <div class="row">
          <a class="btn primary" href="#/load">${icon('upload')}${t('Load company data')}</a>
          <a class="btn" href="#/setup">${icon('checklist')}${t('Set up this company')}</a>
          ${cloud ? html`<a class="btn" href="#/companies">${icon('cloud')}${t('Download the company library')}</a>` : html`<a class="btn" href="#/companies">${icon('building')}${t('Companies and sign-in')}</a>`}
        </div>
      </section>
      <section class="stack">
        <h2>${t('Three ways to start')}</h2>
        <ol class="how">
          <li><b>${t('From spreadsheets')}</b><span>${t('Export the parts list, the BOMs and, if you have them, the steps from your ERP or Excel as CSV. Templates are on the setup page.')}</span></li>
          <li><b>${t('From PDF instructions')}</b><span>${t('Read the work instructions you already have: steps, parts, quantities, torques and warnings are drafted for an engineer to check, and every code the parts list does not know is listed.')}</span></li>
          <li><b>${t('From your team')}</b><span>${t('If an engineer already set the company up, sign in to the company server and download the library, or import the library file they sent you.')}</span></li>
        </ol>
      </section>
      <p class="small muted">${th('Want to see a finished example first? {link} from the list of companies.', { link: html`<a href="#/companies">${t('Open the demo')}</a>` })}</p>
    </div>`,
  };
}

export default async function home({ app }) {
  const isDemo = app.workspace?.kind === 'demo';
  if (!isDemo && !app.lib.parts.length && !(app.lib.devices || []).length) return welcome(app);
  const { counts } = app.audit;
  const devices = app.lib.devices || [];
  const builds = (await listRecords('build')).slice(0, 3);
  const examples = app.source === 'demo' ? DEMO_EXAMPLES : ownExamples(app.lib);
  // One icon and a few words each: the explanations live on the pages themselves.
  const apps = [
    { href: '#/audit', icon: 'shield', label: t('Integrity check'), cls: counts.critical ? 'bad' : 'ok', badge: counts.critical },
    { href: '#/ask', icon: 'chat', label: t('Ask a question') },
    { href: '#/identify', icon: 'camera', label: t('Identify a loose part') },
    { href: '#/parts', icon: 'parts', label: t('Parts library') },
    { href: '#/learn', icon: 'learn', label: t('Learn fasteners') },
    { href: '#/nature', icon: 'leaf', label: t('Learned from nature') },
    { href: '#/load', icon: 'upload', label: t('Load company data') },
    isDemo ? { href: '#/companies', icon: 'building', label: t('Companies and sign-in') } : { href: '#/setup', icon: 'checklist', label: t('Set up this company') },
  ];
  return {
    title: t('Home'),
    html: html`<div class="page home2">
      ${app.sealOk === false ? html`<div class="callout bad" role="alert">${icon('stop')}<div><p class="t">${t('The library does not match its seal')}</p><p>${t('It was changed outside RightPart after it was sealed. Go back to a sealed version before building.')}</p><div class="acts"><a class="btn sm" href="#/data?go=versions">${icon('history')}${t('Sealed versions')}</a></div></div></div>` : ''}
      ${app.source === 'demo' ? html`<div class="demo-pill">${icon('info')}<span>${t('Demo: made-up products and parts.')}</span><a href="#/companies">${t('Use your own data')}</a></div>` : ''}

      <section class="hero compact">
        <h1>${isDemo ? t('The right part, every time.') : app.workspace.name}</h1>
        <form class="hero-search" id="heroSearch" role="search" autocomplete="off">
          ${icon('search')}
          <input id="hq" type="search" placeholder="${t('Code, size, name or a question')}" aria-label="${t('Search any code, size or name, or ask a question')}" enterkeyhint="search" spellcheck="false">
          <button class="btn primary" type="submit">${t('Find')}</button>
        </form>
        ${examples.length ? html`<details class="try-more"><summary>${icon('sparkle')}${t('Examples')}</summary><div class="try">${examples.map(([q, label]) => html`<button class="chip" type="button" data-q="${q}" title="${label()}"><span class="code">${q}</span><span class="muted">${label()}</span></button>`)}</div></details>` : ''}
      </section>

      ${devices.length ? html`<section class="stack" aria-labelledby="prodH">
        <h2 id="prodH" class="sec-h">${icon('cube')}${t('Build')}</h2>
        <div class="prods">${devices.slice(0, 6).map((d) => productCard(app, d))}</div>
        ${devices.length > 6 ? html`<a class="btn" href="#/devices">${t('All {n} products', { n: devices.length })}</a>` : ''}
      </section>` : ''}

      <nav class="tools-grid" aria-label="${t('Start here')}">
        ${apps.map((a) => html`<a class="tool-tile" href="${a.href}"><span class="ic ${a.cls || ''}">${icon(a.icon)}</span><span>${a.label}</span>${a.badge ? html`<span class="badge" aria-label="${t('{n, plural, one {# critical issue} other {# critical issues}}', { n: a.badge })}">${a.badge}</span>` : ''}</a>`)}
      </nav>

      ${builds.length ? html`<section class="stack"><h2 class="sec-h">${icon('history')}${t('Recent builds')}</h2>
        <div class="recent">${builds.map((b) => html`<a class="recent-b" href="#/device/${encodeURIComponent(b.deviceId)}"><span class="ic ${b.completedAt ? 'ok' : ''}">${icon(b.completedAt ? 'checkCircle' : 'history')}</span><span class="code">${b.serial || t('No serial')}</span><span class="muted">${b.completedAt ? t('completed') : t('step {n}', { n: (b.steps?.length || 0) + 1 })} · ${fmtDate(b.createdAt)}</span></a>`)}</div>
      </section>` : ''}

      <details class="fold">
        <summary><span class="ic">${icon('shield')}</span><span class="grow">${t('How it stops a wrong part')}</span>${icon('chevronDown', 'chev')}</summary>
        <div class="fold-body">
          <ol class="how">
            <li><b>${t('One part, every code')}</b><span>${t('Internal, customer, supplier and retired codes all point to one record. A code that points to two parts is flagged.')}</span></li>
            <li><b>${t('Look-alike guard')}</b><span>${t('M3×8 next to M3×10, Phillips next to Pozidriv, M3 next to 4-40: shown side by side at true size, with the difference named.')}</span></li>
            <li><b>${t('Verify at the bench')}</b><span>${t('Scan the bin before fitting. The wrong part gets a red stop and the reason, the right one a green tick.')}</span></li>
            <li><b>${t('Integrity check')}</b><span>${t('BOM against instructions against changes. Finds the step that still fits the old screw after an engineering change.')}</span></li>
          </ol>
        </div>
      </details>
    </div>`,
    mount(root) {
      const form = root.querySelector('#heroSearch');
      form.addEventListener('submit', (e) => { e.preventDefault(); submitQuery(root.querySelector('#hq').value); });
      root.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => submitQuery(b.dataset.q)));
      fillPosters(app, root);
    },
  };
}
