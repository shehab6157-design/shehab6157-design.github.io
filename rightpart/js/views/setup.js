import { html, icon } from '../ui.js';
import { th } from '../ui.js';
import { t } from '../core/i18n.js';
import { translatedLanguages } from '../core/content.js';
import { currentWorkspace, listRecords } from '../store.js';
import { importParts, importBOM, importSteps, importLibraryJSON, importStepTranslations, exportStepText, templates } from '../importflows.js';
import { importPdfSteps, SAMPLE_PDF } from '../pdfimport.js';
import { isFastener } from '../core/dims.js';

// Getting a new company running: what to load, in which order, and what is still missing.
export default async function setup({ app, navigate }) {
  const ws = currentWorkspace();
  const lib = app.lib;
  const parts = lib.parts.length;
  const codes = app.index.byCode.size;
  const devices = lib.devices || [];
  const withBom = devices.filter((d) => d.bom?.lines?.length).length;
  const withSteps = devices.filter((d) => d.instructions?.steps?.length).length;
  const drafts = devices.reduce((n, d) => n + (d.instructions?.steps || []).filter((s) => s.draft).length, 0);
  const fasteners = lib.parts.filter(isFastener);
  const sized = fasteners.filter((p) => p.spec?.d && (p.category !== 'screw' || p.spec.length)).length;
  const explained = lib.parts.filter((p) => p.details?.function).length;
  const builds = (await listRecords('build')).length;
  const trLangs = translatedLanguages(lib);
  const items = [
    { done: parts > 0, title: t('Parts and every code they go by'), text: parts ? t('{parts} parts under {codes} codes.', { parts, codes }) : t('Start with a spreadsheet of your parts: internal number, description, and every customer, supplier or old code you know.'), acts: html`<button class="btn sm primary" type="button" data-imp="parts">${icon('upload')}${t('Import parts CSV')}</button><button class="btn sm ghost" type="button" data-tpl="parts">${icon('download')}${t('Template')}</button>` },
    { done: fasteners.length > 0 && sized === fasteners.length, title: t('Sizes for screws, nuts, washers and standoffs'), text: fasteners.length ? t('{sized} of {total} fasteners have a size. Sizes are read from descriptions like "ISO 7380 M3x8 A2"; they power the true-scale drawings and the look-alike warnings.', { sized, total: fasteners.length }) : t('No fasteners yet.'), acts: fasteners.length && sized < fasteners.length ? html`<a class="btn sm" href="#/parts?cat=screw">${t('See the parts')}</a>` : '' },
    { done: withBom > 0, title: t('Devices and their BOMs'), text: devices.length ? t('{n, plural, one {# device} other {# devices}}, {bom} with a BOM.', { n: devices.length, bom: withBom }) : t('One BOM per product your line builds. Any code works in the BOM: RightPart resolves it.'), acts: html`<button class="btn sm primary" type="button" data-imp="bom">${icon('upload')}${t('Import BOM CSV')}</button><button class="btn sm ghost" type="button" data-tpl="bom">${icon('download')}${t('Template')}</button>` },
    { done: withSteps > 0 && !drafts, title: t('Assembly steps'), text: withSteps ? [t('{n, plural, one {# device with steps.} other {# devices with steps.}}', { n: withSteps }), drafts ? t("{n, plural, one {# step is a draft read from a PDF, waiting for an engineer's review.} other {# steps are drafts read from a PDF, waiting for an engineer's review.}}", { n: drafts }) : ''].filter(Boolean).join(' ') : t('Read them from the PDF work instructions you already have, import them from a spreadsheet (one row per step), or write them in the step editor.'), acts: html`<button class="btn sm primary" type="button" data-pdf>${icon('upload')}${t('Read a PDF work instruction')}</button>${ws.kind === 'demo' ? html`<button class="btn sm" type="button" data-pdf-sample>${icon('book')}${t('Try the sample PDF')}</button>` : ''}<button class="btn sm" type="button" data-imp="steps">${icon('upload')}${t('Import steps CSV')}</button><button class="btn sm ghost" type="button" data-tpl="steps">${icon('download')}${t('Template')}</button>${devices.length ? devices.slice(0, 3).map((d) => html`<a class="btn sm" href="#/editor/${encodeURIComponent(d.id)}">${icon('edit')}${t('Edit {id}', { id: d.id })}</a>`) : ''}<a class="btn sm" href="#/editor/new">${icon('plus')}${t('New device')}</a>` },
    { done: withSteps > 0 && trLangs.length > 0, title: t('Steps in the languages of your line'), text: trLangs.length ? t('Step text is translated into: {list}. Part codes, quantities and torques come from the data, and the integrity check flags any translation whose numbers differ from the original.', { list: trLangs.map((c) => c.toUpperCase()).join(', ') }) : t('Export the step text, have it translated (by a translator, a bilingual colleague or a translation tool), and import it back. Workers then read each step in their own language; a translation stays marked as not checked until someone ticks it.'), acts: html`<button class="btn sm" type="button" data-imp="translations">${icon('upload')}${t('Import step translations')}</button><button class="btn sm ghost" type="button" data-tpl="translations">${icon('download')}${t('Export step text to translate')}</button><a class="btn sm ghost" href="#/data#languages">${icon('globe')}${t('Interface languages')}</a>` },
    { done: app.audit.counts.critical === 0 && parts > 0, title: t('Integrity check'), text: parts ? t('{critical} critical, {warnings} warnings. Fix the critical ones before anyone builds from these steps.', { critical: app.audit.counts.critical, warnings: app.audit.counts.warning }) : t('Runs automatically once there is data.'), acts: parts ? html`<a class="btn sm" href="#/audit">${icon('shield')}${t('Open the check')}</a>` : '' },
    { done: explained > 0 && explained >= Math.min(parts, 10), title: t('Explanations for learners'), text: t('{done} of {total} parts say what they do and why. Add a "function" and "why" column to the parts spreadsheet; new people learn much faster.', { done: explained, total: parts }), acts: '' },
    { done: parts > 0 && fasteners.length > 0, title: t('True-scale bin labels'), text: t('Print a label for each fastener bin: every code it goes by, a barcode, and the part outline at actual size.'), acts: fasteners.length ? html`<a class="btn sm" href="#/labels?ids=${encodeURIComponent(fasteners.slice(0, 40).map((p) => p.id).join(','))}">${icon('print')}${t('Print labels')}</a>` : '' },
    { done: ws.kind === 'cloud', title: t('Share with the team'), text: ws.kind === 'cloud' ? t('Signed in to {company} as {role}. Publish the library when it is ready.', { company: ws.name, role: ws.org?.role }) : t('Sign in to a company server so every tablet gets the same library and records are collected, or export the library file and import it on each device.'), acts: html`<a class="btn sm" href="#/companies">${icon('cloud')}${t('Companies and sign-in')}</a>` },
    { done: builds > 0, title: t('First build'), text: builds ? t('{n, plural, one {# build recorded.} other {# builds recorded.}}', { n: builds }) : t('Open a device and press "Start a build": every bin is checked before fitting, and every step is recorded.'), acts: devices[0] ? html`<a class="btn sm" href="#/device/${encodeURIComponent(devices[0].id)}">${icon('play')}${t('Open {device}', { device: devices[0].name })}</a>` : '' },
  ];
  const done = items.filter((i) => i.done).length;
  return {
    title: t('Set up this company'),
    html: html`<div class="page narrow">
      <div class="page-head"><div>
        <h1>${ws.kind === 'demo' ? t('Set up a company') : t('Set up {company}', { company: ws.name })}</h1>
        <p class="lede">${ws.kind === 'demo' ? th('You are in the demo. {link}, then follow these steps with your data.', { link: html`<a href="#/companies">${t('Add your own company')}</a>` }) : t("Load your company's data once; every page then works on it: search, drawings, 3D or photo guides, bench checks, the integrity check and the Ask assistant.")}</p>
      </div><span class="chip ${done === items.length ? 'ok' : ''}">${t('{done} of {total} done', { done, total: items.length })}</span></div>
      <div class="progress" aria-hidden="true"><i style="width:${(done / items.length) * 100}%"></i></div>
      ${ws.kind === 'demo' ? '' : html`<a class="card pad load-cta" href="#/load">${icon('upload')}<span><b>${t('Load all your files at once')}</b><span class="small muted">${t('Drop Excel, CSV and PDF files together: RightPart works out what each one is, loads them and checks everything.')}</span></span>${icon('chevronRight')}</a>`}
      <ol class="setup-list">${items.map((it, i) => html`<li class="setup-item ${it.done ? 'done' : ''}">
        <span class="dot">${it.done ? icon('check') : i + 1}</span>
        <div><h3>${it.title}</h3><p>${it.text}</p>${it.acts ? html`<div class="row">${it.acts}</div>` : ''}</div>
      </li>`)}</ol>
      <p class="small muted">${t('Have a full library file from another device or from an engineer?')} <button class="btn sm ghost" type="button" data-imp="json">${icon('upload')}${t('Import library JSON')}</button></p>
    </div>`,
    mount(root) {
      const flows = { parts: importParts, bom: importBOM, steps: importSteps, json: importLibraryJSON, translations: importStepTranslations };
      root.querySelectorAll('[data-imp]').forEach((b) => b.addEventListener('click', async () => { if (await flows[b.dataset.imp](app)) navigate('#/setup'); }));
      root.querySelectorAll('[data-tpl]').forEach((b) => b.addEventListener('click', () => (b.dataset.tpl === 'translations' ? exportStepText(app) : templates[b.dataset.tpl]())));
      root.querySelector('[data-pdf]')?.addEventListener('click', async () => { const id = await importPdfSteps(app); if (id) navigate(`#/editor/${encodeURIComponent(id)}`); });
      root.querySelector('[data-pdf-sample]')?.addEventListener('click', async () => { const id = await importPdfSteps(app, { url: SAMPLE_PDF }); if (id) navigate(`#/editor/${encodeURIComponent(id)}`); });
    },
  };
}
