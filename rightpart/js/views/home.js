import { html, th, icon, fmtDate } from '../ui.js';
import { t } from '../core/i18n.js';
import { listRecords } from '../store.js';
import { submitQuery } from '../app.js';
import { LANGUAGES, PLANNED } from '../lang.js';

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
          <a class="btn primary" href="#/setup">${icon('checklist')}${t('Set up this company')}</a>
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
  const codes = app.index.byCode.size;
  const dev = app.lib.devices?.[0];
  const builds = (await listRecords('build')).slice(0, 3);
  const examples = app.source === 'demo' ? DEMO_EXAMPLES : ownExamples(app.lib);
  const nSteps = dev?.instructions?.steps?.length || 0;
  return {
    title: t('Home'),
    html: html`<div class="page">
      ${app.source === 'demo' ? html`<div class="demo-banner">${icon('info')}<span>${th('Demo library: the Nova-1 is a fictional device made up for this demo. To use your own data, {link}: it gets its own space, and the demo stays as it is.', { link: html`<a href="#/companies">${t('add your company')}</a>` })}</span></div>` : ''}
      <section class="hero">
        <h1>${isDemo ? t('The right part, every time.') : app.workspace.name}</h1>
        <p class="lede">${t('Type or scan any code a part goes by (internal, customer, supplier or an old one) and get the one physical part behind it, drawn at true size. Build step by step, verify every bin at the bench, ask when in doubt, and let the integrity check find the mistakes that paper instructions hide for years.')}</p>
        <form class="hero-search" id="heroSearch" role="search" autocomplete="off">
          ${icon('search')}
          <input id="hq" type="search" placeholder="${t('Code, size, name or a question')}" aria-label="${t('Search any code, size or name, or ask a question')}" enterkeyhint="search" spellcheck="false">
          <button class="btn primary" type="submit">${t('Find')}</button>
        </form>
        ${examples.length ? html`<div class="try"><span class="lbl">${t('Try:')}</span>${examples.map(([q, label]) => html`<button class="chip" type="button" data-q="${q}" title="${label()}"><span class="code">${q}</span><span class="muted">${label()}</span></button>`)}</div>` : ''}
      </section>

      <section class="tiles" aria-label="${t('Start here')}">
        <a class="tile" href="#/audit">
          <span class="ic ${counts.critical ? 'bad' : 'ok'}">${icon('shield')}</span>
          <h3>${t('Integrity check')}</h3>
          <p>${counts.critical
            ? (app.source === 'demo'
              ? t('{n, plural, one {# critical issue found by comparing the BOM, the instructions and the part records, including a wrong screw in the instructions.} other {# critical issues found by comparing the BOM, the instructions and the part records, including a wrong screw in the instructions.}}', { n: counts.critical })
              : t('{n, plural, one {# critical issue found by comparing the BOM, the instructions and the part records.} other {# critical issues found by comparing the BOM, the instructions and the part records.}}', { n: counts.critical }))
            : t('No critical issues: the BOM, the instructions and the part records agree.')}</p>
          <span class="meta">${t('{n, plural, one {# warning} other {# warnings}}', { n: counts.warning })} · ${t('{n, plural, one {# note} other {# notes}}', { n: counts.info })}</span>
        </a>
        ${dev ? html`<a class="tile" href="#/device/${encodeURIComponent(dev.id)}">
          <span class="ic">${icon('cube')}</span>
          <h3>${t('Build the {device}', { device: dev.name.replace(/ demo console$/i, '') })}</h3>
          <p>${nSteps ? (dev.scene ? t('{n} steps in 3D: which part, how many, what torque, and why. Learn mode for new people, build mode with bin scanning.', { n: nSteps }) : t('{n} steps: which part, how many, what torque, and why. Learn mode for new people, build mode with bin scanning.', { n: nSteps })) : t('No steps yet: write them in the step editor or import them from a spreadsheet.')}</p>
          <span class="meta">${(app.lib.devices || []).length > 1 ? `${t('{n} devices', { n: app.lib.devices.length })} · ` : ''}${t('BOM rev {rev}', { rev: dev.bom?.rev || '–' })} · ${t('instructions rev {rev}', { rev: dev.instructions?.rev || '–' })}</span>
        </a>` : ''}
        <a class="tile" href="#/ask">
          <span class="ic">${icon('chat')}</span>
          <h3>${t('Ask a question')}</h3>
          <p>${t('"Which screw goes in this step?", "what is this code?", "M3×8 or M3×10?" Answers from this company\'s own parts, steps and BOMs, with the source of each one.')}</p>
          <span class="meta">${t('Ask in {n} languages · works offline', { n: LANGUAGES.length + PLANNED.length })}</span>
        </a>
        <a class="tile" href="#/identify">
          <span class="ic">${icon('camera')}</span>
          <h3>${t('Identify a loose part')}</h3>
          <p>${t('Lay a screw on the screen to measure it at true size, pick its head and drive, or photograph it after you teach the app your parts.')}</p>
          <span class="meta">${t('Works offline, on this device')}</span>
        </a>
        <a class="tile" href="#/parts">
          <span class="ic">${icon('parts')}</span>
          <h3>${t('Parts library')}</h3>
          <p>${t('{parts} parts known under {codes} codes. Every part with what it does, why it was chosen and what goes wrong with the wrong one.', { parts: app.lib.parts.length, codes })}</p>
          <span class="meta">${t('Print true-scale bin labels')}</span>
        </a>
        <a class="tile" href="#/learn">
          <span class="ic">${icon('learn')}</span>
          <h3>${t('Learn fasteners')}</h3>
          <p>${t('Heads, drives, threads and how to read a code like ISO 7380 M3×8 A2. Then a short quiz on the real device.')}</p>
          <span class="meta">${t('For your first weeks on the line')}</span>
        </a>
        ${isDemo ? html`<a class="tile" href="#/companies">
          <span class="ic">${icon('building')}</span>
          <h3>${t('Your own company')}</h3>
          <p>${t('Add your company and load its parts, BOMs and steps from Excel or your ERP. Sign in to share one library with the whole team.')}</p>
          <span class="meta">${t('Each company in its own space')}</span>
        </a>` : html`<a class="tile" href="#/setup">
          <span class="ic">${icon('checklist')}</span>
          <h3>${t('Set up and data')}</h3>
          <p>${t('Import parts, codes, BOMs and steps from Excel (CSV) or JSON, write steps in the editor, export build records and reports.')}</p>
          <span class="meta">${app.version ? t('Using: {name} · version {v}', { name: app.libName, v: app.version }) : t('Using: {name}', { name: app.libName })}</span>
        </a>`}
      </section>

      <section class="stack">
        <h2>${t('How it stops a wrong part')}</h2>
        <ol class="how">
          <li><b>${t('One part, every code')}</b><span>${t('Internal, customer, supplier and retired codes all point to one record. A code that points to two parts is flagged.')}</span></li>
          <li><b>${t('Look-alike guard')}</b><span>${t('M3×8 next to M3×10, Phillips next to Pozidriv, M3 next to 4-40: shown side by side at true size, with the difference named.')}</span></li>
          <li><b>${t('Verify at the bench')}</b><span>${t('Scan the bin before fitting. The wrong part gets a red stop and the reason, the right one a green tick.')}</span></li>
          <li><b>${t('Integrity check')}</b><span>${t('BOM against instructions against changes. Finds the step that still fits the old screw after an engineering change.')}</span></li>
        </ol>
      </section>

      ${builds.length ? html`<section class="stack"><h2>${t('Recent builds')}</h2>
        <div class="grid three">${builds.map((b) => html`<a class="tile" href="#/device/${encodeURIComponent(b.deviceId)}"><span class="ic ${b.completedAt ? 'ok' : ''}">${icon(b.completedAt ? 'checkCircle' : 'history')}</span><h3 class="code">${b.serial || t('No serial')}</h3><p>${b.deviceName || b.deviceId} · ${b.completedAt ? t('completed') : t('step {n}', { n: (b.steps?.length || 0) + 1 })}</p><span class="meta">${fmtDate(b.createdAt)}</span></a>`)}</div>
      </section>` : ''}
    </div>`,
    mount(root) {
      const form = root.querySelector('#heroSearch');
      form.addEventListener('submit', (e) => { e.preventDefault(); submitQuery(root.querySelector('#hq').value); });
      root.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => submitQuery(b.dataset.q)));
    },
  };
}
