import { html, th, icon, toast, download, confirmDialog, fmtDate, openDialog, pickFile } from '../ui.js';
import { t, getLanguage } from '../core/i18n.js';
import { resetLibrary, listRecords, clear, storageEstimate, currentWorkspace } from '../store.js';
import { reloadLibrary } from '../app.js';
import { importParts, importBOM, importSteps, importLibraryJSON, importStepTranslations, exportStepText, commitLibrary, languageName, templates } from '../importflows.js';
import { importPdfSteps } from '../pdfimport.js';
import { toCSV } from '../core/csv.js';
import { translatedLanguages, contentLanguage } from '../core/content.js';
import { uiCSV, importUiCSV } from '../core/translations.js';
import { LANGUAGES, catalog, builtInMessages } from '../lang.js';

const nativeName = (code) => { try { return new Intl.DisplayNames([code], { type: 'language' }).of(code) || code; } catch { return code; } };

export default async function dataView({ app, navigate }) {
  const ws = currentWorkspace();
  const builds = await listRecords('build');
  const reports = await listRecords('report');
  const est = await storageEstimate();
  const isDemo = ws.kind === 'demo';
  const devN = app.lib.devices?.length || 0;
  const stepLangs = translatedLanguages(app.lib);
  const companyLangs = Object.entries(app.lib.languages?.names || {});
  const source = contentLanguage(app.lib);
  const sourceChoices = [...LANGUAGES.map((l) => ({ code: l.code, native: l.native })), ...companyLangs.filter(([c]) => !LANGUAGES.some((l) => l.code === c)).map(([code, native]) => ({ code, native }))];
  const changed = app.savedAt ? t('last changed {date}', { date: fmtDate(app.savedAt) }) : '';
  return {
    title: t('Data and records'),
    html: html`<div class="page narrow">
      <div class="page-head"><div>
        <h1>${t('Data and records: {company}', { company: isDemo ? t('Demo: Nova-1 (fictional)') : ws.name })}</h1>
        <p class="lede">${ws.kind === 'cloud' ? t('This company is shared through the company server. A copy is kept on this device so the floor keeps working offline.') : t('Everything for this company lives in this browser, on this device. Nothing is uploaded. Export to back up or to move it to another tablet.')}</p>
      </div></div>

      <section class="card">
        <div class="card-head"><div><h2>${t('Library')}</h2><p class="small muted">${[t('{n, plural, one {# part} other {# parts}}', { n: app.lib.parts.length }), t('{n, plural, one {# code} other {# codes}}', { n: app.index.byCode.size }), t('{n, plural, one {# device} other {# devices}}', { n: devN }), changed, app.version ? t('server version {v}', { v: app.version }) : ''].filter(Boolean).join(', ')}.</p></div><span class="chip ${isDemo ? 'info' : 'ok'}">${isDemo ? (app.source === 'demo' ? t('Demo') : t('Demo, edited')) : ws.kind === 'cloud' ? t('Signed in') : t('This device')}</span></div>
        <div class="card-body row">
          <button class="btn" type="button" id="expLib">${icon('download')}${t('Export library (JSON)')}</button>
          ${isDemo && app.source !== 'demo' ? html`<button class="btn danger" type="button" id="resetDemo">${icon('replay')}${t('Reset the demo')}</button>` : ''}
          ${!isDemo ? html`<a class="btn" href="#/companies">${icon('building')}${t('Manage companies')}</a>` : ''}
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h2>${t('Import from spreadsheets')}</h2><a class="btn sm ghost" href="#/setup">${icon('checklist')}${t('Setup checklist')}</a></div>
        <div class="card-body stack">
          <div class="grid two">
            <div class="stack tight"><h3>${t('Parts and codes')}</h3><p class="small muted">${th('One row per part, with every code it goes by. If a row only has a description like {example}, the size, head, drive and material are read from it.', { example: html`<span class="code">ISO 7380 M3x8 A2</span>` })}</p><div class="row"><button class="btn primary" type="button" data-imp="parts">${icon('upload')}${t('Import parts CSV')}</button><button class="btn sm ghost" type="button" data-tpl="parts">${icon('download')}${t('Template')}</button></div></div>
            <div class="stack tight"><h3>${t('Bill of materials')}</h3><p class="small muted">${t("Device, revision, item, code (any code), quantity and position. Replaces that device's BOM.")}</p><div class="row"><button class="btn primary" type="button" data-imp="bom">${icon('upload')}${t('Import BOM CSV')}</button><button class="btn sm ghost" type="button" data-tpl="bom">${icon('download')}${t('Template')}</button></div></div>
            <div class="stack tight"><h3>${t('Assembly steps')}</h3><p class="small muted">${th('One row per step: title, parts like {example}, tools, instructions, checks and warnings separated by {sep}.', { example: html`<span class="code">100-0233 x6 @0.6</span>`, sep: html`<span class="code">|</span>` })}</p><div class="row"><button class="btn primary" type="button" data-imp="steps">${icon('upload')}${t('Import steps CSV')}</button><button class="btn sm ghost" type="button" data-tpl="steps">${icon('download')}${t('Template')}</button></div></div>
            <div class="stack tight"><h3>${t('Steps from a PDF')}</h3><p class="small muted">${t('The work instructions you already have. The steps, the parts each one names (any code), quantities, torques, tools, warnings and checks are read on this device and saved as drafts for an engineer to review.')}</p><div class="row"><button class="btn primary" type="button" data-pdf>${icon('upload')}${t('Read a PDF')}</button></div></div>
            <div class="stack tight"><h3>${t('Full library')}</h3><p class="small muted">${t('Parts, devices, BOMs, steps, changes and 3D scenes in the format of the demo file (see the README).')}</p><div class="row"><button class="btn" type="button" data-imp="json">${icon('upload')}${t('Import library JSON')}</button></div></div>
          </div>
        </div>
      </section>

      <section class="card anchor-target" id="languages">
        <div class="card-head"><div><h2>${icon('globe')} ${t('Languages')}</h2><p class="small muted">${t('People on one line often read different languages. The interface comes in {n} languages; your steps can be in as many as your team needs.', { n: LANGUAGES.length })}</p></div></div>
        <div class="card-body stack">
          <div class="field"><label for="srcLang">${t('Language your documents are written in')}</label>
            <select id="srcLang">${sourceChoices.map((l) => html`<option value="${l.code}" ${l.code === source ? 'selected' : ''}>${l.native}</option>`)}</select>
            <span class="tiny muted">${t('People who read this language see the steps as written. Everyone else sees a translation when there is one, or the original with a note.')}</span>
          </div>
          <div class="grid two">
            <div class="stack tight"><h3>${t('Step text')}</h3>
              <p class="small muted">${stepLangs.length ? t('Translated into: {list}.', { list: stepLangs.map((c) => languageName(c)).join(', ') }) : t('No translations yet.')} ${t('Export the text, have it translated, import it back. Part codes, quantities and torques stay in the data and are never translated; a translation that changes a number is held back.')}</p>
              <div class="row"><button class="btn" type="button" id="expSteps">${icon('download')}${t('Export step text to translate')}</button><button class="btn primary" type="button" id="impSteps">${icon('upload')}${t('Import step translations')}</button></div></div>
            <div class="stack tight"><h3>${t('Interface text')}</h3>
              <p class="small muted">${t('Add a language RightPart does not have yet, or change any wording for this company (a bilingual colleague can correct what reads badly). It travels with this company\'s library.')}</p>
              ${companyLangs.length ? html`<ul class="list-plain small">${companyLangs.map(([code, name]) => html`<li class="row between nowrap"><span><b lang="${code}">${name}</b> <span class="muted">${code} · ${t('{n} texts', { n: Object.keys(app.lib.languages?.ui?.[code] || {}).length })}</span></span><button class="btn sm ghost" type="button" data-droplang="${code}" aria-label="${t('Remove {language}', { language: name })}">${icon('trash')}</button></li>`)}</ul>` : ''}
              <div class="row"><button class="btn" type="button" id="expUi">${icon('download')}${t('Export interface text')}</button><button class="btn primary" type="button" id="impUi">${icon('upload')}${t('Import interface text')}</button></div></div>
          </div>
        </div>
      </section>

      <section class="card anchor-target" id="records">
        <div class="card-head"><h2>${t('Records')}</h2><span class="chip">${t('{n, plural, one {# build} other {# builds}}', { n: builds.length })} · ${t('{n, plural, one {# report} other {# reports}}', { n: reports.length })}</span></div>
        <div class="card-body stack">
          <div class="row">
            <button class="btn" type="button" id="expBuilds" ${builds.length ? '' : 'disabled'}>${icon('download')}${t('Build records (CSV)')}</button>
            <button class="btn" type="button" id="expReports" ${reports.length ? '' : 'disabled'}>${icon('download')}${t('Floor reports (CSV)')}</button>
            <button class="btn" type="button" id="expAll">${icon('download')}${t('Everything (JSON)')}</button>
            ${ws.kind === 'cloud' ? html`<a class="btn" href="#/companies">${icon('sync')}${t('Sync with the server')}</a>` : ''}
            <button class="btn danger" type="button" id="clrRec" ${builds.length + reports.length ? '' : 'disabled'}>${icon('trash')}${t('Clear records on this device')}</button>
          </div>
          <p class="tiny muted">${t('A build record lists the serial number, operator, every bin scanned (right or wrong), every override with who decided it, and when each step was completed. Records name people: agree with your team (and works council, where there is one) what they are used for.')}</p>
        </div>
      </section>

      <section class="callout info">${icon('shield')}<div>
        <p class="t">${t('Before using real company data')}</p>
        <p>${t("Keep confidential drawings, BOMs and customer part numbers off public websites: on this device they stay in the browser, and on a company server they are protected per company. If your company builds for customers, check the contract allows putting the customer's data into a new system. In a medical-device factory, software that guides or records production has to be validated and released through the quality system (ISO 13485 §4.1.6 and §7.5.6, FDA QMSR) before it replaces controlled documents: run RightPart as a pilot next to the official instructions until then.")}</p>
      </div></section>

      ${est?.usage != null ? html`<p class="tiny muted">${est.quota ? t('Storage used by this browser: {used} MB of {quota} GB available.', { used: (est.usage / 1048576).toFixed(1), quota: (est.quota / 1073741824).toFixed(1) }) : t('Storage used by this browser: {used} MB.', { used: (est.usage / 1048576).toFixed(1) })}</p>` : ''}
    </div>`,
    mount(root) {
      const flows = { parts: importParts, bom: importBOM, steps: importSteps, json: importLibraryJSON };
      root.querySelectorAll('[data-imp]').forEach((b) => b.addEventListener('click', async () => { if (await flows[b.dataset.imp](app)) navigate('#/audit'); }));
      root.querySelector('[data-pdf]')?.addEventListener('click', async () => { const id = await importPdfSteps(app); if (id) navigate(`#/editor/${encodeURIComponent(id)}`); });
      root.querySelectorAll('[data-tpl]').forEach((b) => b.addEventListener('click', () => templates[b.dataset.tpl]()));
      root.querySelector('#expLib').addEventListener('click', () => download(`rightpart-${ws.name.replace(/[^\w-]+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(app.lib, null, 1)));
      root.querySelector('#resetDemo')?.addEventListener('click', async () => {
        if (!(await confirmDialog(t('Reset the demo?'), t('Your edits to the demo library are removed. Records and photo samples stay.'), t('Reset'), true))) return;
        await resetLibrary();
        await reloadLibrary();
        toast(t('Demo restored.'), 'ok');
        navigate('#/');
      });

      // ---- Languages ----
      root.querySelector('#srcLang').addEventListener('change', async (e) => {
        const lib = structuredClone(app.lib);
        lib.meta = { ...(lib.meta || {}), contentLang: e.target.value };
        await commitLibrary(app, lib, t('Saved: documents are written in {language}.', { language: languageName(e.target.value) }));
        navigate('#/data#languages');
      });
      root.querySelector('#expSteps').addEventListener('click', () => exportStepText(app));
      root.querySelector('#impSteps').addEventListener('click', async () => { if (await importStepTranslations(app)) navigate('#/audit'); });
      root.querySelector('#expUi').addEventListener('click', async () => {
        const have = Object.keys(app.lib.languages?.names || {});
        let chosen = [];
        const ok = await openDialog({
          title: t('Export interface text'),
          body: String(html`<p class="muted">${t('The spreadsheet lists every text RightPart shows, in English, with one column per language. Keep anything in {curly brackets} exactly as it is: it is replaced by a number, a code or a name.')}</p>
            <div class="lang-checks">${LANGUAGES.filter((l) => l.code !== 'en').map((l) => html`<label class="check"><input type="checkbox" value="${l.code}" ${have.includes(l.code) || l.code === getLanguage() ? 'checked' : ''}><span lang="${l.code}">${l.native}</span><span class="tiny muted">${l.english}</span></label>`)}</div>
            <div class="field" style="margin-top:12px"><label for="newLang">${t('Add a new language (code, for example ti, ne, so, my)')}</label><input id="newLang" type="text" dir="ltr" spellcheck="false" placeholder="ti"></div>`),
          actions: [{ label: t('Cancel'), value: false }, { label: t('Download'), value: true, primary: true }],
          onClose(d) { chosen = [...d.querySelectorAll('.lang-checks input:checked')].map((i) => i.value).concat(d.querySelector('#newLang').value.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean)); },
        });
        if (!ok) return;
        const keys = await catalog();
        if (!keys.length) { toast(t('The list of interface texts could not be loaded. Try again online.'), 'bad', 5000); return; }
        const builtIn = {};
        for (const c of chosen) builtIn[c] = await builtInMessages(c);
        download(`rightpart-interface-text-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + uiCSV(keys, app.lib, chosen, builtIn), 'text/csv;charset=utf-8');
      });
      root.querySelector('#impUi').addEventListener('click', async () => {
        const f = await pickFile('.csv,text/csv');
        if (!f) return;
        const res = importUiCSV(app.lib, await f.text(), nativeName);
        if (!res.langs.length) { toast(res.problems[0] || t('No translations found in that file.'), 'bad', 6000); return; }
        const ok = await openDialog({
          title: t('Import interface text from {file}', { file: f.name }),
          body: String(html`<ul class="list-plain">${res.langs.map((l) => html`<li>${icon('check')} <b lang="${l}">${nativeName(l)}</b> (${l}): ${t('{n} texts', { n: res.counts[l] })}</li>`)}</ul>
            ${res.problems.length ? html`<div class="callout warn">${icon('alert')}<div><p class="t">${t('{n, plural, one {# text skipped} other {# texts skipped}}', { n: res.problems.length })}</p><p class="small">${t('These translations lost a {placeholder}, so a number or a code would be missing from the screen. Fix them and import again:')}</p><ul>${res.problems.slice(0, 8).map((p) => html`<li class="small" dir="auto">${p}</li>`)}</ul></div></div>` : ''}
            <p class="small muted">${t('Everyone in this company sees these texts once the library is saved (and published, with a company server).')}</p>`),
          actions: [{ label: t('Cancel'), value: false }, { label: t('Import'), value: true, primary: true }],
        });
        if (!ok) return;
        await commitLibrary(app, res.lib, t('Interface text imported.'));
        navigate('#/data#languages');
      });
      root.querySelectorAll('[data-droplang]').forEach((b) => b.addEventListener('click', async () => {
        const code = b.dataset.droplang;
        if (!(await confirmDialog(t('Remove {language}?', { language: nativeName(code) }), t("This company's own wording for this language is removed. Built-in translations stay."), t('Remove'), true))) return;
        const lib = structuredClone(app.lib);
        delete lib.languages?.names?.[code];
        delete lib.languages?.ui?.[code];
        await commitLibrary(app, lib, t('Removed.'));
        navigate('#/data#languages');
      }));

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
        const rows = [['time', 'who', 'part', 'device', 'step', 'language', 'text', 'has photo']];
        for (const r of reports) rows.push([new Date(r.createdAt).toISOString(), r.who, r.partId, r.deviceId, r.stepId, r.lang || '', r.text, r.photo ? 'yes' : 'no']);
        download(`rightpart-reports-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + toCSV(rows), 'text/csv;charset=utf-8');
      });
      root.querySelector('#expAll').addEventListener('click', () => download(`rightpart-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), company: ws.name, library: app.lib, builds, reports }, null, 1)));
      root.querySelector('#clrRec')?.addEventListener('click', async () => {
        if (!(await confirmDialog(t('Clear all records on this device?'), t('Build records and floor reports on this device are deleted. Export them first if they are needed.'), t('Delete records'), true))) return;
        await clear('records');
        toast(t('Records cleared.'), 'ok');
        navigate('#/data');
      });
    },
  };
}
