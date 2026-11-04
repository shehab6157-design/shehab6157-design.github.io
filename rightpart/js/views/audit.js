import { html, icon, download, fmtDate } from '../ui.js';
import { findingCard, partHref } from '../components.js';
import { CHECKS } from '../core/audit.js';
import { toCSV } from '../core/csv.js';
import { listRecords } from '../store.js';

export default async function auditView({ app, query }) {
  const { findings, counts } = app.audit;
  const sev = query.get('sev') || 'all';
  const list = findings.filter((f) => sev === 'all' || f.severity === sev);
  const reports = await listRecords('report');
  const builds = await listRecords('build');
  const stopped = builds.flatMap((b) => (b.events || []).filter((e) => e.result === 'wrong').map((e) => ({ ...e, serial: b.serial, deviceId: b.deviceId })));
  const link = (s) => `#/audit${s === 'all' ? '' : '?sev=' + s}`;
  return {
    title: 'Integrity check',
    html: html`<div class="page">
      <div class="page-head">
        <div>
          <h1>Integrity check</h1>
          <p class="lede">RightPart compares every code, every BOM line, every instruction step and every engineering change, and lists what does not add up. Paper and PDF instructions cannot do this: a wrong screw in a document stays wrong until somebody happens to notice.</p>
        </div>
        <div class="row"><button class="btn" type="button" id="csv">${icon('download')}Export CSV</button><button class="btn" type="button" id="print">${icon('print')}Print</button></div>
      </div>

      <div class="sev-sum">
        <a class="sev critical" href="${link('critical')}" style="text-decoration:none"><div class="n">${counts.critical}</div><div class="l">Critical: stop and fix</div></a>
        <a class="sev warning" href="${link('warning')}" style="text-decoration:none"><div class="n">${counts.warning}</div><div class="l">Warnings</div></a>
        <a class="sev info" href="${link('info')}" style="text-decoration:none"><div class="n">${counts.info}</div><div class="l">Notes</div></a>
      </div>
      ${sev !== 'all' ? html`<div><a class="chip" href="#/audit">${icon('x')}Show all</a></div>` : ''}

      ${list.length ? html`<div class="stack">${list.map((f) => findingCard(f, app))}</div>` : html`<div class="callout ok">${icon('checkCircle')}<div><p class="t">Nothing to report</p><p>The codes, BOMs and instructions agree.</p></div></div>`}

      <section class="card">
        <div class="card-head"><h2>Reports from the floor</h2><span class="chip">${reports.length}</span></div>
        ${reports.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>When</th><th>Who</th><th>About</th><th>What they noticed</th></tr></thead><tbody>${reports.map((r) => html`<tr><td class="nowrap small">${fmtDate(r.createdAt)}</td><td>${r.who || '—'}</td><td>${r.partId ? html`<a href="${partHref(r.partId)}" class="code">${r.partId}</a>` : ''}${r.stepId ? html` <span class="chip">step ${r.stepId.replace(/^S/, '')}</span>` : ''}</td><td>${r.text}</td></tr>`)}</tbody></table></div>` : html`<div class="card-body muted">No reports yet. Anyone can press “Report a doubt” on a part or a step; the reports collect here and in the export.</div>`}
      </section>

      <section class="card">
        <div class="card-head"><h2>Wrong parts stopped at the bench</h2><span class="chip ${stopped.length ? 'ok' : ''}">${stopped.length}</span></div>
        ${stopped.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>When</th><th>Serial</th><th>Step</th><th>Needed</th><th>Scanned</th></tr></thead><tbody>${stopped.map((e) => html`<tr><td class="small nowrap">${fmtDate(e.at)}</td><td class="code">${e.serial || '—'}</td><td>${e.stepId}</td><td class="code">${e.partId}</td><td class="code">${e.scanned} (${e.code})</td></tr>`)}</tbody></table></div>` : html`<div class="card-body muted">Each time build mode refuses a wrong bin, it is counted here: evidence that the check works.</div>`}
      </section>

      <section class="stack"><h2>What is checked</h2><div class="grid two">${Object.entries(CHECKS).map(([k, c]) => html`<div class="card pad"><h3 style="font-size:15.5px">${c.label}</h3><p class="small muted" style="margin-top:4px">${c.why}</p><p class="tiny" style="margin-top:6px">${findings.filter((f) => f.check === k).length ? html`<b>${findings.filter((f) => f.check === k).length} found</b>` : 'None found'}</p></div>`)}</div></section>
    </div>`,
    mount(root) {
      root.querySelector('#csv').addEventListener('click', () => {
        const rows = [['severity', 'check', 'device', 'title', 'detail', 'what to do', 'parts', 'steps']];
        for (const f of findings) rows.push([f.severity, CHECKS[f.check]?.label || f.check, f.deviceId || '', f.title, f.detail, f.suggestion || '', f.parts.join(' '), f.steps.map((s) => 'step ' + s.stepNo).join(' ')]);
        for (const r of reports) rows.push(['report', 'Report from the floor', r.deviceId || '', r.text, `${r.who || ''} ${new Date(r.createdAt).toISOString()}`, '', r.partId || '', r.stepId || '']);
        download(`rightpart-integrity-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + toCSV(rows), 'text/csv;charset=utf-8');
      });
      root.querySelector('#print').addEventListener('click', () => window.print());
    },
  };
}
