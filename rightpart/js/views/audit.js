import { html, th, icon, download, fmtDate, fmtDay } from '../ui.js';
import { t, getLanguage } from '../core/i18n.js';
const langName = (code) => { try { return new Intl.DisplayNames([getLanguage()], { type: 'language' }).of(code); } catch { return code; } };
import { findingCard, partHref } from '../components.js';
import { CHECKS } from '../core/audit.js';
import { toCSV } from '../core/csv.js';
import { listRecords } from '../store.js';
import { getMemory, forgetMemory } from '../memory.js';
import { countOf, lastAt, unsharedCount, shareMemory } from '../core/immune.js';
import { shortDifference } from '../core/lookalike.js';
import { sizeLabel } from '../core/dims.js';
import { stepHref } from '../components.js';

export default async function auditView({ app, query, navigate }) {
  const { findings, counts } = app.audit;
  const sev = query.get('sev') || 'all';
  const list = findings.filter((f) => sev === 'all' || f.severity === sev);
  const reports = await listRecords('report');
  const builds = await listRecords('build');
  const stopped = builds.flatMap((b) => (b.events || []).filter((e) => e.result === 'wrong').map((e) => ({ ...e, serial: b.serial, deviceId: b.deviceId })));
  const link = (s) => `#/audit${s === 'all' ? '' : '?sev=' + s}`;
  const memory = await getMemory(app);
  const unshared = unsharedCount(app.lib.memory, memory.local);
  const sized = (p) => html`<span class="code">${p.id}</span>${sizeLabel(p) ? html` <span class="tiny muted code">${sizeLabel(p)}</span>` : ''}`;
  const learnedRow = (e) => {
    const dev = app.index.devices.get(e.deviceId);
    const no = dev.instructions.steps.findIndex((s) => s.id === e.stepId) + 1;
    const need = app.index.parts.get(e.expected), took = app.index.parts.get(e.taken);
    return html`<tr><td><a href="${stepHref(dev.id, e.stepId)}">${dev.name} · ${t('step {n}', { n: no })}</a></td><td>${sized(need)}</td><td>${sized(took)}<div class="tiny muted">${shortDifference(need, took)}</div></td><td class="num"><b>${countOf(e)}</b></td><td class="small nowrap">${fmtDay(lastAt(e))}</td></tr>`;
  };
  return {
    title: t('Integrity check'),
    html: html`<div class="page">
      <div class="page-head">
        <div>
          <h1>${t('Integrity check')}</h1>
          <p class="lede">${t('RightPart compares every code, every BOM line, every instruction step and every engineering change, and lists what does not add up. Paper and PDF instructions cannot do this: a wrong screw in a document stays wrong until somebody happens to notice.')}</p>
        </div>
        <div class="row"><button class="btn" type="button" id="csv">${icon('download')}${t('Export CSV')}</button><button class="btn" type="button" id="print">${icon('print')}${t('Print')}</button></div>
      </div>

      <div class="sev-sum">
        <a class="sev critical" href="${link('critical')}" style="text-decoration:none"><div class="n">${counts.critical}</div><div class="l">${t('Critical: stop and fix')}</div></a>
        <a class="sev warning" href="${link('warning')}" style="text-decoration:none"><div class="n">${counts.warning}</div><div class="l">${t('Warnings')}</div></a>
        <a class="sev info" href="${link('info')}" style="text-decoration:none"><div class="n">${counts.info}</div><div class="l">${t('Notes')}</div></a>
      </div>
      ${sev !== 'all' ? html`<div><a class="chip" href="#/audit">${icon('x')}${t('Show all')}</a></div>` : ''}

      ${list.length ? html`<div class="stack">${list.map((f) => findingCard(f, app))}</div>` : html`<div class="callout ok">${icon('checkCircle')}<div><p class="t">${t('Nothing to report')}</p><p>${t('The codes, BOMs and instructions agree.')}</p></div></div>`}

      <section class="card" id="learned">
        <div class="card-head"><div><h2>${t('Learned mix-ups')}</h2><p class="small muted">${t('Every wrong part stopped at the bench is remembered. The next person at that step is warned before they pick, and the quiz trains new people on it. No names are kept.')}</p></div><span class="chip ${memory.total ? 'warn' : ''}">${memory.total}</span></div>
        ${memory.all.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>${t('Step')}</th><th>${t('Needed')}</th><th>${t('Picked instead')}</th><th>${t('Times')}</th><th>${t('Last')}</th></tr></thead><tbody>${memory.all.map(learnedRow)}</tbody></table></div>
          <div class="card-body small">${th('To stop a mix-up for good: separate the two bins, give them different {marks}, or ask engineering whether one part can do both jobs.', { marks: html`<a href="#/labels">${t('signal marks')}</a>` })}</div>` : html`<div class="card-body muted">${t('Nothing learned yet. A mix-up is remembered here when build mode stops a wrong part.')}</div>`}
        ${unshared ? html`<div class="card-body row between" style="border-top:1px solid var(--line)"><span class="small">${t('{n, plural, one {# mix-up on this tablet is not shared yet.} other {# mix-ups on this tablet are not shared yet.}}', { n: unshared })}</span><button class="btn sm" type="button" id="shareMemory">${icon('users')}${t('Share with every tablet')}</button></div>` : ''}
      </section>

      <section class="card">
        <div class="card-head"><h2>${t('Reports from the floor')}</h2><span class="chip">${reports.length}</span></div>
        ${reports.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>${t('When')}</th><th>${t('Who')}</th><th>${t('About')}</th><th>${t('What they noticed')}</th></tr></thead><tbody>${reports.map((r) => html`<tr><td class="nowrap small">${fmtDate(r.createdAt)}</td><td>${r.who || '—'}</td><td>${r.partId ? html`<a href="${partHref(r.partId)}" class="code">${r.partId}</a>` : ''}${r.stepId ? html` <span class="chip">${t('step {n}', { n: r.stepId.replace(/^S/, '') })}</span>` : ''}</td><td dir="auto" lang="${r.lang || ''}">${r.text}${r.lang && r.lang !== getLanguage() ? html` <span class="chip" title="${t('Written in {language}', { language: langName(r.lang) })}">${r.lang.toUpperCase()}</span>` : ''}</td></tr>`)}</tbody></table></div>` : html`<div class="card-body muted">${t('No reports yet. Anyone can press “Report a doubt” on a part or a step; the reports collect here and in the export.')}</div>`}
      </section>

      <section class="card">
        <div class="card-head"><h2>${t('Wrong parts stopped at the bench')}</h2><span class="chip ${stopped.length ? 'ok' : ''}">${stopped.length}</span></div>
        ${stopped.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>${t('When')}</th><th>${t('Serial')}</th><th>${t('Step')}</th><th>${t('Needed')}</th><th>${t('Scanned')}</th></tr></thead><tbody>${stopped.map((e) => html`<tr><td class="small nowrap">${fmtDate(e.at)}</td><td class="code">${e.serial || '—'}</td><td>${e.stepId}</td><td class="code">${e.partId}</td><td class="code">${e.scanned} (${e.code})</td></tr>`)}</tbody></table></div>` : html`<div class="card-body muted">${t('Each time build mode refuses a wrong bin, it is counted here: evidence that the check works.')}</div>`}
      </section>

      <section class="stack"><h2>${t('What is checked')}</h2><div class="grid two">${Object.entries(CHECKS).map(([k, c]) => html`<div class="card pad"><h3 style="font-size:15.5px">${c.label}</h3><p class="small muted" style="margin-top:4px">${c.why}</p><p class="tiny" style="margin-top:6px">${findings.filter((f) => f.check === k).length ? html`<b>${t('{n} found', { n: findings.filter((f) => f.check === k).length })}</b>` : t('None found')}</p></div>`)}</div></section>
    </div>`,
    mount(root) {
      root.querySelector('#csv').addEventListener('click', () => {
        const rows = [['severity', 'check', 'device', 'title', 'detail', 'what to do', 'parts', 'steps']];
        for (const f of findings) rows.push([f.severity, CHECKS[f.check]?.label || f.check, f.deviceId || '', f.title, f.detail, f.suggestion || '', f.parts.join(' '), f.steps.map((s) => 'step ' + s.stepNo).join(' ')]);
        for (const r of reports) rows.push(['report', 'Report from the floor', r.deviceId || '', r.text, `${r.who || ''} ${new Date(r.createdAt).toISOString()}`, '', r.partId || '', r.stepId || '']);
        download(`rightpart-integrity-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + toCSV(rows), 'text/csv;charset=utf-8');
      });
      root.querySelector('#print').addEventListener('click', () => window.print());
      root.querySelector('#shareMemory')?.addEventListener('click', async () => {
        const { commitLibrary } = await import('../importflows.js');
        forgetMemory();
        await commitLibrary(app, { ...app.lib, memory: shareMemory(app.lib.memory, memory.local) }, t('Mix-ups added to the library. Every tablet that gets this version is warned at those steps.'));
        navigate('#/audit');
      });
    },
  };
}
