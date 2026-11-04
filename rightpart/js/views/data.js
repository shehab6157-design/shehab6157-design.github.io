import { html, icon, toast, download, pickFile, confirmDialog, openDialog, fmtDate } from '../ui.js';
import { saveLibrary, resetLibrary, listRecords, clear, storageEstimate, loadLibrary } from '../store.js';
import { setLibrary } from '../app.js';
import { partsFromCSV, mergeParts, bomFromCSV, mergeBOM, validateLibrary, partsTemplateCSV, bomTemplateCSV } from '../core/importer.js';
import { toCSV } from '../core/csv.js';

export default async function dataView({ app, navigate }) {
  const builds = await listRecords('build');
  const reports = await listRecords('report');
  const est = await storageEstimate();
  const demo = app.source === 'demo';
  return {
    title: 'Your data',
    html: html`<div class="page narrow">
      <div class="page-head"><div>
        <h1>Your data</h1>
        <p class="lede">Everything RightPart knows lives in this browser, on this device. Nothing is uploaded: there is no server. Export to back up or to move it to another tablet.</p>
      </div></div>

      <section class="card">
        <div class="card-head"><div><h2>Library</h2><p class="small muted">${demo ? 'The demo library (fictional Nova-1).' : `${app.libName}${app.savedAt ? `, imported ${fmtDate(app.savedAt)}` : ''}.`} ${app.lib.parts.length} parts, ${app.index.byCode.size} codes, ${app.lib.devices?.length || 0} device${app.lib.devices?.length === 1 ? '' : 's'}.</p></div><span class="chip ${demo ? 'info' : 'ok'}">${demo ? 'Demo' : 'Yours'}</span></div>
        <div class="card-body stack">
          <div class="row">
            <button class="btn" type="button" id="expLib">${icon('download')}Export library (JSON)</button>
            ${!demo ? html`<button class="btn danger" type="button" id="resetLib">${icon('replay')}Back to the demo</button>` : ''}
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h2>Import</h2></div>
        <div class="card-body stack">
          <div class="grid two">
            <div class="stack tight"><h3>Parts and codes (CSV)</h3><p class="small muted">One row per part, with every code it goes by. Export it from Excel or your ERP. If a row only has a description like <span class="code">ISO 7380 M3x8 A2</span>, the size, head, drive and material are read from it.</p><div class="row"><button class="btn primary" type="button" id="impParts">${icon('upload')}Import parts CSV</button><button class="btn sm ghost" type="button" id="tplParts">${icon('download')}Template</button></div></div>
            <div class="stack tight"><h3>Bill of materials (CSV)</h3><p class="small muted">Device, revision, item, code (any code: customer, internal, supplier), quantity and position. Replaces that device's BOM, then the integrity check runs again.</p><div class="row"><button class="btn primary" type="button" id="impBom">${icon('upload')}Import BOM CSV</button><button class="btn sm ghost" type="button" id="tplBom">${icon('download')}Template</button></div></div>
          </div>
          <hr class="sep">
          <div class="stack tight"><h3>Full library (JSON)</h3><p class="small muted">Parts, devices, BOMs, instructions with steps, change history and 3D scenes, in the format of the demo file. The format is described in the README.</p><div class="row"><button class="btn" type="button" id="impJson">${icon('upload')}Import library JSON</button></div></div>
        </div>
      </section>

      <section class="card anchor-target" id="records">
        <div class="card-head"><h2>Records</h2><span class="chip">${builds.length} build${builds.length === 1 ? '' : 's'} · ${reports.length} report${reports.length === 1 ? '' : 's'}</span></div>
        <div class="card-body stack">
          <div class="row">
            <button class="btn" type="button" id="expBuilds" ${builds.length ? '' : 'disabled'}>${icon('download')}Build records (CSV)</button>
            <button class="btn" type="button" id="expReports" ${reports.length ? '' : 'disabled'}>${icon('download')}Floor reports (CSV)</button>
            <button class="btn" type="button" id="expAll">${icon('download')}Everything (JSON)</button>
            <button class="btn danger" type="button" id="clrRec" ${builds.length + reports.length ? '' : 'disabled'}>${icon('trash')}Clear records</button>
          </div>
          <p class="tiny muted">A build record lists the serial number, operator, every bin scanned (right or wrong), every override with who decided it, and when each step was completed.</p>
        </div>
      </section>

      <section class="callout info">${icon('shield')}<div>
        <p class="t">Before using real company data</p>
        <p>Keep confidential drawings, BOMs and customer part numbers off public websites: this app stores imported data only in your browser, but the copy you host must be one your company approves. In a medical-device factory, software that guides or records production has to be validated and released through the quality system (ISO 13485 §4.1.6 and §7.5.6, FDA QMSR) before it replaces controlled documents. Use RightPart as a pilot alongside the official work instructions until then.</p>
      </div></section>

      ${est?.usage != null ? html`<p class="tiny muted">Storage used on this device: ${(est.usage / 1048576).toFixed(1)} MB${est.quota ? ` of ${(est.quota / 1073741824).toFixed(1)} GB available` : ''}.</p>` : ''}
    </div>`,
    mount(root) {
      const apply = async (lib, name, msg) => { await saveLibrary(lib, name); setLibrary(lib, 'imported', name); toast(msg, 'ok', 4200); navigate('#/audit'); };
      const preview = (title, lines, warnings) => openDialog({
        title,
        body: String(html`<ul class="list-plain">${lines.map((l) => html`<li>${icon('check')} ${l}</li>`)}</ul>${warnings.length ? html`<div class="callout warn">${icon('alert')}<div><p class="t">${warnings.length} note${warnings.length > 1 ? 's' : ''}</p><ul>${warnings.slice(0, 12).map((w) => html`<li class="small">${w}</li>`)}</ul>${warnings.length > 12 ? html`<p class="small">…and ${warnings.length - 12} more.</p>` : ''}</div></div>` : ''}`),
        actions: [{ label: 'Cancel', value: false }, { label: 'Import', value: true, primary: true }],
      });
      root.querySelector('#expLib').addEventListener('click', () => download(`rightpart-library-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(app.lib, null, 1)));
      root.querySelector('#resetLib')?.addEventListener('click', async () => {
        if (!(await confirmDialog('Back to the demo library?', 'Your imported library is removed from this device (records and photo samples stay). Export it first if you need it.', 'Remove and reset', true))) return;
        await resetLibrary();
        const { library } = await loadLibrary('data/demo-library.json');
        setLibrary(library, 'demo');
        toast('Demo library restored.', 'ok');
        navigate('#/');
      });
      root.querySelector('#tplParts').addEventListener('click', () => download('rightpart-parts-template.csv', '﻿' + partsTemplateCSV(), 'text/csv;charset=utf-8'));
      root.querySelector('#tplBom').addEventListener('click', () => download('rightpart-bom-template.csv', '﻿' + bomTemplateCSV(), 'text/csv;charset=utf-8'));
      root.querySelector('#impParts').addEventListener('click', async () => {
        const f = await pickFile('.csv,text/csv');
        if (!f) return;
        const { parts, warnings } = partsFromCSV(await f.text());
        if (!parts.length) { toast('No parts found in that file.', 'bad'); return; }
        let base = app.lib;
        if (app.source === 'demo') {
          const choice = await openDialog({ title: 'Where should these parts go?', body: '<p>Add them to the demo library (the Nova-1 stays for practice), or start a new library with only your parts.</p>', actions: [{ label: 'Cancel', value: null }, { label: 'Add to the demo', value: 'demo' }, { label: 'New library', value: 'new', primary: true }] });
          if (!choice) return;
          if (choice === 'new') base = { schema: 'rightpart/1', meta: { name: 'My library' }, parts: [], devices: [] };
        }
        const { lib, added, updated } = mergeParts(base, parts);
        if (!(await preview(`Import ${parts.length} parts from ${f.name}`, [`${added} new part${added === 1 ? '' : 's'}`, `${updated} updated`, `${parts.reduce((n, p) => n + (p.aliases?.length || 0), 0)} codes`], warnings))) return;
        await apply(lib, base === app.lib ? app.libName : 'My library', `${parts.length} parts imported. The integrity check has run on the new data.`);
      });
      root.querySelector('#impBom').addEventListener('click', async () => {
        const f = await pickFile('.csv,text/csv');
        if (!f) return;
        const { boms, warnings } = bomFromCSV(await f.text());
        if (!boms.length) { toast('No BOM lines found in that file.', 'bad'); return; }
        if (!(await preview(`Import ${boms.length} BOM${boms.length > 1 ? 's' : ''} from ${f.name}`, boms.map((b) => `${b.id} rev ${b.rev || '?'}: ${b.lines.length} lines`), warnings))) return;
        await apply(mergeBOM(app.lib, boms), app.source === 'demo' ? 'Demo + my BOM' : app.libName, 'BOM imported. Check the integrity results.');
      });
      root.querySelector('#impJson').addEventListener('click', async () => {
        const f = await pickFile('application/json,.json');
        if (!f) return;
        try {
          const lib = validateLibrary(JSON.parse(await f.text()));
          if (!(await preview(`Import ${f.name}`, [`${lib.parts.length} parts`, `${lib.devices.length} devices`], []))) return;
          await apply(lib, lib.meta?.name || f.name.replace(/\.json$/i, ''), 'Library imported.');
        } catch (e) { toast(`Not imported: ${e.message}`, 'bad', 5000); }
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
      root.querySelector('#expAll').addEventListener('click', () => download(`rightpart-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), library: app.lib, builds, reports }, null, 1)));
      root.querySelector('#clrRec')?.addEventListener('click', async () => {
        if (!(await confirmDialog('Clear all records?', 'Build records and floor reports on this device are deleted. Export them first if they are needed.', 'Delete records', true))) return;
        await clear('records');
        toast('Records cleared.', 'ok');
        navigate('#/data');
      });
    },
  };
}
