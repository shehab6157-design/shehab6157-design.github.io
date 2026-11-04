import { html, icon, toast, download, confirmDialog, fmtDate } from '../ui.js';
import { resetLibrary, listRecords, clear, storageEstimate, currentWorkspace } from '../store.js';
import { reloadLibrary } from '../app.js';
import { importParts, importBOM, importSteps, importLibraryJSON, templates } from '../importflows.js';
import { toCSV } from '../core/csv.js';

export default async function dataView({ app, navigate }) {
  const ws = currentWorkspace();
  const builds = await listRecords('build');
  const reports = await listRecords('report');
  const est = await storageEstimate();
  const isDemo = ws.kind === 'demo';
  return {
    title: 'Data and records',
    html: html`<div class="page narrow">
      <div class="page-head"><div>
        <h1>Data and records: ${ws.name}</h1>
        <p class="lede">${ws.kind === 'cloud' ? 'This company is shared through the company server. A copy is kept on this device so the floor keeps working offline.' : 'Everything for this company lives in this browser, on this device. Nothing is uploaded. Export to back up or to move it to another tablet.'}</p>
      </div></div>

      <section class="card">
        <div class="card-head"><div><h2>Library</h2><p class="small muted">${app.lib.parts.length} parts, ${app.index.byCode.size} codes, ${app.lib.devices?.length || 0} device${app.lib.devices?.length === 1 ? '' : 's'}${app.savedAt ? `, last changed ${fmtDate(app.savedAt)}` : ''}${app.version ? `, server version ${app.version}` : ''}.</p></div><span class="chip ${isDemo ? 'info' : 'ok'}">${isDemo ? (app.source === 'demo' ? 'Demo' : 'Demo, edited') : ws.kind === 'cloud' ? 'Signed in' : 'This device'}</span></div>
        <div class="card-body row">
          <button class="btn" type="button" id="expLib">${icon('download')}Export library (JSON)</button>
          ${isDemo && app.source !== 'demo' ? html`<button class="btn danger" type="button" id="resetDemo">${icon('replay')}Reset the demo</button>` : ''}
          ${!isDemo ? html`<a class="btn" href="#/companies">${icon('building')}Manage companies</a>` : ''}
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h2>Import from spreadsheets</h2><a class="btn sm ghost" href="#/setup">${icon('checklist')}Setup checklist</a></div>
        <div class="card-body stack">
          <div class="grid two">
            <div class="stack tight"><h3>Parts and codes</h3><p class="small muted">One row per part, with every code it goes by. If a row only has a description like <span class="code">ISO 7380 M3x8 A2</span>, the size, head, drive and material are read from it.</p><div class="row"><button class="btn primary" type="button" data-imp="parts">${icon('upload')}Import parts CSV</button><button class="btn sm ghost" type="button" data-tpl="parts">${icon('download')}Template</button></div></div>
            <div class="stack tight"><h3>Bill of materials</h3><p class="small muted">Device, revision, item, code (any code), quantity and position. Replaces that device's BOM.</p><div class="row"><button class="btn primary" type="button" data-imp="bom">${icon('upload')}Import BOM CSV</button><button class="btn sm ghost" type="button" data-tpl="bom">${icon('download')}Template</button></div></div>
            <div class="stack tight"><h3>Assembly steps</h3><p class="small muted">One row per step: title, parts like <span class="code">100-0233 x6 @0.6</span>, tools, instructions, checks and warnings separated by <span class="code">|</span>.</p><div class="row"><button class="btn primary" type="button" data-imp="steps">${icon('upload')}Import steps CSV</button><button class="btn sm ghost" type="button" data-tpl="steps">${icon('download')}Template</button></div></div>
            <div class="stack tight"><h3>Full library</h3><p class="small muted">Parts, devices, BOMs, steps, changes and 3D scenes in the format of the demo file (see the README).</p><div class="row"><button class="btn" type="button" data-imp="json">${icon('upload')}Import library JSON</button></div></div>
          </div>
        </div>
      </section>

      <section class="card anchor-target" id="records">
        <div class="card-head"><h2>Records</h2><span class="chip">${builds.length} build${builds.length === 1 ? '' : 's'} · ${reports.length} report${reports.length === 1 ? '' : 's'}</span></div>
        <div class="card-body stack">
          <div class="row">
            <button class="btn" type="button" id="expBuilds" ${builds.length ? '' : 'disabled'}>${icon('download')}Build records (CSV)</button>
            <button class="btn" type="button" id="expReports" ${reports.length ? '' : 'disabled'}>${icon('download')}Floor reports (CSV)</button>
            <button class="btn" type="button" id="expAll">${icon('download')}Everything (JSON)</button>
            ${ws.kind === 'cloud' ? html`<a class="btn" href="#/companies">${icon('sync')}Sync with the server</a>` : ''}
            <button class="btn danger" type="button" id="clrRec" ${builds.length + reports.length ? '' : 'disabled'}>${icon('trash')}Clear records on this device</button>
          </div>
          <p class="tiny muted">A build record lists the serial number, operator, every bin scanned (right or wrong), every override with who decided it, and when each step was completed. Records name people: agree with your team (and works council, where there is one) what they are used for.</p>
        </div>
      </section>

      <section class="callout info">${icon('shield')}<div>
        <p class="t">Before using real company data</p>
        <p>Keep confidential drawings, BOMs and customer part numbers off public websites: on this device they stay in the browser, and on a company server they are protected per company. If your company builds for customers, check the contract allows putting the customer's data into a new system. In a medical-device factory, software that guides or records production has to be validated and released through the quality system (ISO 13485 §4.1.6 and §7.5.6, FDA QMSR) before it replaces controlled documents: run RightPart as a pilot next to the official instructions until then.</p>
      </div></section>

      ${est?.usage != null ? html`<p class="tiny muted">Storage used by this browser: ${(est.usage / 1048576).toFixed(1)} MB${est.quota ? ` of ${(est.quota / 1073741824).toFixed(1)} GB available` : ''}.</p>` : ''}
    </div>`,
    mount(root) {
      const flows = { parts: importParts, bom: importBOM, steps: importSteps, json: importLibraryJSON };
      root.querySelectorAll('[data-imp]').forEach((b) => b.addEventListener('click', async () => { if (await flows[b.dataset.imp](app)) navigate('#/audit'); }));
      root.querySelectorAll('[data-tpl]').forEach((b) => b.addEventListener('click', () => templates[b.dataset.tpl]()));
      root.querySelector('#expLib').addEventListener('click', () => download(`rightpart-${ws.name.replace(/[^\w-]+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(app.lib, null, 1)));
      root.querySelector('#resetDemo')?.addEventListener('click', async () => {
        if (!(await confirmDialog('Reset the demo?', 'Your edits to the demo library are removed. Records and photo samples stay.', 'Reset', true))) return;
        await resetLibrary();
        await reloadLibrary();
        toast('Demo restored.', 'ok');
        navigate('#/');
      });
      root.querySelector('#expBuilds')?.addEventListener('click', () => {
        const rows = [['build id', 'device', 'bom rev', 'instructions rev', 'serial', 'operator', 'started', 'completed', 'step', 'event time', 'event', 'part needed', 'code scanned', 'part scanned', 'decided by', 'decision']];
        for (const b of builds) {
          const base = [b.id, b.deviceId, b.bomRev, b.instructionsRev, b.serial, b.operator, new Date(b.createdAt).toISOString(), b.completedAt ? new Date(b.completedAt).toISOString() : ''];
          for (const s of b.steps || []) rows.push([...base, s.stepId, new Date(s.completedAt).toISOString(), 'step completed', '', '', '', '', '']);
          for (const e of b.events || []) rows.push([...base, e.stepId, new Date(e.at).toISOString(), e.result, e.partId || '', e.code || '', e.scanned || '', e.who || '', e.why || '']);
          if (!(b.steps || []).length && !(b.events || []).length) rows.push([...base, '', '', 'started', '', '', '', '', '']);
        }
        download(`rightpart-builds-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + toCSV(rows), 'text/csv;charset=utf-8');
      });
      root.querySelector('#expReports')?.addEventListener('click', () => {
        const rows = [['time', 'who', 'part', 'device', 'step', 'text', 'has photo']];
        for (const r of reports) rows.push([new Date(r.createdAt).toISOString(), r.who, r.partId, r.deviceId, r.stepId, r.text, r.photo ? 'yes' : 'no']);
        download(`rightpart-reports-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + toCSV(rows), 'text/csv;charset=utf-8');
      });
      root.querySelector('#expAll').addEventListener('click', () => download(`rightpart-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), company: ws.name, library: app.lib, builds, reports }, null, 1)));
      root.querySelector('#clrRec')?.addEventListener('click', async () => {
        if (!(await confirmDialog('Clear all records on this device?', 'Build records and floor reports on this device are deleted. Export them first if they are needed.', 'Delete records', true))) return;
        await clear('records');
        toast('Records cleared.', 'ok');
        navigate('#/data');
      });
    },
  };
}
