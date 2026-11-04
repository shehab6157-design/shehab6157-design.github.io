import { html, icon, fmtDate } from '../ui.js';
import { listRecords } from '../store.js';
import { submitQuery } from '../app.js';

export default async function home({ app }) {
  const { counts } = app.audit;
  const codes = app.index.byCode.size;
  const dev = app.lib.devices?.[0];
  const builds = (await listRecords('build')).slice(0, 3);
  const examples = [
    ['C-55013', 'customer code'],
    ['AF-7380-M3-8-A2', 'supplier code'],
    ['ISO 7380 M3x8', 'standard size'],
    ['SCR-TX-36', 'old code'],
    ['DS-103-308', 'one code, two parts'],
    ['100-0283', 'typo'],
  ];
  return {
    title: 'Home',
    html: html`<div class="page">
      ${app.source === 'demo' ? html`<div class="demo-banner">${icon('info')}<span>Demo library: the Nova-1 is a fictional device made up for this demo. Import your own parts on <a href="#/data">Your data</a>; they never leave this device.</span></div>` : ''}
      <section class="hero">
        <h1>The right part, every time.</h1>
        <p class="lede">Type or scan any code a part goes by (internal, customer, supplier or an old one) and get the one physical part behind it, drawn at true size. Build step by step in 3D, verify every bin at the bench, and let the integrity check find the mistakes that paper instructions hide for years.</p>
        <form class="hero-search" id="heroSearch" role="search" autocomplete="off">
          ${icon('search')}
          <input id="hq" type="search" placeholder="Code, size or name" aria-label="Search any code, size or name" enterkeyhint="search" spellcheck="false" autocapitalize="characters">
          <button class="btn primary" type="submit">Find part</button>
        </form>
        <div class="try"><span class="lbl">Try:</span>${examples.map(([q, t]) => html`<button class="chip" type="button" data-q="${q}" title="${t}"><span class="code">${q}</span><span class="muted">${t}</span></button>`)}</div>
      </section>

      <section class="tiles" aria-label="Start here">
        <a class="tile" href="#/audit">
          <span class="ic ${counts.critical ? 'bad' : 'ok'}">${icon('shield')}</span>
          <h3>Integrity check</h3>
          <p>${counts.critical ? `${counts.critical} critical issue${counts.critical > 1 ? 's' : ''} found by comparing the BOM, the instructions and the part records${dev ? ', including a wrong screw in the instructions' : ''}.` : 'No critical issues in the library.'}</p>
          <span class="meta">${counts.warning} warning${counts.warning === 1 ? '' : 's'} · ${counts.info} note${counts.info === 1 ? '' : 's'}</span>
        </a>
        ${dev ? html`<a class="tile" href="#/device/${encodeURIComponent(dev.id)}">
          <span class="ic">${icon('cube')}</span>
          <h3>Build the ${dev.name.replace(/ demo console$/i, '')}</h3>
          <p>${dev.instructions?.steps?.length || 0} steps in 3D: which part, how many, what torque, and why. Learn mode for new people, build mode with bin scanning.</p>
          <span class="meta">BOM rev ${dev.bom?.rev} · instructions rev ${dev.instructions?.rev}</span>
        </a>` : ''}
        <a class="tile" href="#/identify">
          <span class="ic">${icon('camera')}</span>
          <h3>Identify a loose part</h3>
          <p>Lay a screw on the screen to measure it at true size, pick its head and drive, or photograph it after you teach the app your parts.</p>
          <span class="meta">Works offline, on this device</span>
        </a>
        <a class="tile" href="#/parts">
          <span class="ic">${icon('parts')}</span>
          <h3>Parts library</h3>
          <p>${app.lib.parts.length} parts known under ${codes} codes. Every part with what it does, why it was chosen and what goes wrong with the wrong one.</p>
          <span class="meta">Print true-scale bin labels</span>
        </a>
        <a class="tile" href="#/learn">
          <span class="ic">${icon('learn')}</span>
          <h3>Learn fasteners</h3>
          <p>Heads, drives, threads and how to read a code like ISO 7380 M3×8 A2. Then a short quiz on the real device.</p>
          <span class="meta">For your first weeks on the line</span>
        </a>
        <a class="tile" href="#/data">
          <span class="ic">${icon('data')}</span>
          <h3>Your data</h3>
          <p>Import parts, codes and BOMs from Excel (CSV) or JSON, export build records and reports.</p>
          <span class="meta">${app.source === 'demo' ? 'Using the demo library' : `Using: ${app.libName}`}</span>
        </a>
      </section>

      <section class="stack">
        <h2>How it stops a wrong part</h2>
        <ol class="how">
          <li><b>One part, every code</b><span>Internal, customer, supplier and retired codes all point to one record. A code that points to two parts is flagged.</span></li>
          <li><b>Look-alike guard</b><span>M3×8 next to M3×10, Phillips next to Pozidriv, M3 next to 4-40: shown side by side at true size, with the difference named.</span></li>
          <li><b>Verify at the bench</b><span>Scan the bin before fitting. The wrong part gets a red stop and the reason, the right one a green tick.</span></li>
          <li><b>Integrity check</b><span>BOM against instructions against changes. Finds the step that still fits the old screw after an engineering change.</span></li>
        </ol>
      </section>

      ${builds.length ? html`<section class="stack"><h2>Recent builds</h2>
        <div class="grid three">${builds.map((b) => html`<a class="tile" href="#/device/${encodeURIComponent(b.deviceId)}"><span class="ic ${b.completedAt ? 'ok' : ''}">${icon(b.completedAt ? 'checkCircle' : 'history')}</span><h3>${b.serial || 'No serial'}</h3><p>${b.deviceName || b.deviceId} · ${b.completedAt ? 'completed' : `step ${(b.steps?.length || 0) + 1}`}</p><span class="meta">${fmtDate(b.createdAt)}</span></a>`)}</div>
      </section>` : ''}
    </div>`,
    mount(root) {
      const form = root.querySelector('#heroSearch');
      form.addEventListener('submit', (e) => { e.preventDefault(); submitQuery(root.querySelector('#hq').value); });
      root.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => submitQuery(b.dataset.q)));
    },
  };
}
