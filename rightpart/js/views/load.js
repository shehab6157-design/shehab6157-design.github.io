// Load company data: drop every file the company has (parts lists, BOMs and step lists from
// Excel or CSV, work instructions as PDF, a RightPart library), see what each one was read as,
// correct it if needed, load everything in one go, and get a plain report of what does not add up.
// Everything is read on this device; nothing is uploaded.
import { html, th, icon, toast, esc } from '../ui.js';
import { t } from '../core/i18n.js';
import { currentWorkspace, addWorkspace } from '../store.js';
import { switchWorkspace, submitQuery } from '../app.js';
import { readXlsx, isOldExcel } from '../core/xlsx.js';
import { parseCSV } from '../core/csv.js';
import { describeTable, deviceFromName, SYNONYMS, FIELD_KINDS } from '../core/detect.js';
import { applyItems, readiness } from '../core/companyload.js';
import { validateLibrary } from '../core/importer.js';
import { draftSteps } from '../core/pdfsteps.js';
import { partHref } from '../components.js';

const SAMPLE = 'data/sample-company.xlsx';
const MAX_BYTES = 40 * 1024 * 1024;

const KIND = {
  parts: () => t('Parts list'), codes: () => t('Codes for parts'), bom: () => t('BOM'), steps: () => t('Assembly steps'),
  pdf: () => t('Work instruction (PDF)'), library: () => t('RightPart library'), skip: () => t("Don't load"), unknown: () => t('Not recognised'),
};
const FIELD = {
  id: () => t('Part number'), name: () => t('Description'), designation: () => t('Size or standard'), customer: () => t('Customer code'),
  supplier: () => t('Supplier code'), manufacturer: () => t('Manufacturer code'), drawing: () => t('Drawing number'), legacy: () => t('Old code'),
  category: () => t('Category'), material: () => t('Material'), thread: () => t('Thread'), length_mm: () => t('Length (mm)'), d_mm: () => t('Diameter (mm)'),
  head: () => t('Head'), drive: () => t('Drive'), torque_nm: () => t('Torque (N·m)'), tool: () => t('Tool'), status: () => t('Status'), replaced_by: () => t('Replaced by'),
  qty: () => t('Quantity'), item: () => t('BOM item'), where: () => t('Where it goes'), device: () => t('Device'), device_name: () => t('Device name'), rev: () => t('Revision'),
  step: () => t('Step number'), title: () => t('Step title'), instructions: () => t('Instructions'), parts: () => t('Parts in the step'), checks: () => t('Checks'), warnings: () => t('Warnings'), why: () => t('Why'),
};
const fieldsFor = (kind) => [...new Set([...(FIELD_KINDS[kind === 'codes' ? 'parts' : kind] || []), ...Object.keys(SYNONYMS)])].filter((f) => FIELD[f]);

/** Text of a CSV file in the encoding it was saved in: UTF-8, or Hebrew / Western Windows code pages. */
function decodeText(bytes) {
  try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), enc: 'utf-8' }; } catch { /* not UTF-8 */ }
  const hebrew = bytes.some((b) => b >= 0xE0 && b <= 0xFA);
  for (const enc of hebrew ? ['windows-1255', 'windows-1252'] : ['windows-1252']) {
    try { return { text: new TextDecoder(enc).decode(bytes), enc }; } catch { /* next */ }
  }
  return { text: new TextDecoder('utf-8').decode(bytes), enc: 'utf-8' };
}

let seq = 0;
/** Read one file into items (one per sheet for a workbook). */
async function readFile(file, onProgress) {
  const name = file.name;
  const ext = (name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
  if (file.size > MAX_BYTES) return [{ id: ++seq, name, kind: 'skip', error: t('Larger than 40 MB: split it and try again.') }];
  const bytes = new Uint8Array(await file.arrayBuffer());
  const table = (rows, label, sheet = '') => {
    const desc = describeTable(rows, sheet || name);
    const dev = desc.device ? { ...desc.device, rev: desc.rev || '' } : { id: deviceFromName(sheet && !/^sheet\d*$/i.test(sheet) ? sheet : name), name: '', rev: desc.rev || '' };
    if (!dev.name) dev.name = dev.id;
    return { id: ++seq, name: label, file: name, sheet, kind: desc.kind === 'unknown' ? 'skip' : desc.kind, detected: desc.kind, desc, device: dev };
  };
  try {
    if (ext === 'xlsx' || ext === 'xlsm' || (ext === 'xls' && !isOldExcel(bytes))) {
      const sheets = await readXlsx(bytes);
      const items = sheets.filter((s) => s.rows.filter((r) => r.some((c) => c !== '')).length >= 2)
        .map((s) => ({ ...table(s.rows, `${name} · ${s.name}`, s.name), hidden: s.hidden }));
      for (const it of items) if (it.hidden) it.kind = 'skip';
      return items.length ? items : [{ id: ++seq, name, kind: 'skip', error: t('No table found in this workbook.') }];
    }
    if (ext === 'xls') return [{ id: ++seq, name, kind: 'skip', error: t('Old Excel format (.xls): open it in Excel, save it as .xlsx, and drop it again.') }];
    if (['csv', 'tsv', 'txt'].includes(ext)) {
      const { text, enc } = decodeText(bytes);
      const it = table(parseCSV(text), name);
      if (enc !== 'utf-8') it.note = t('Read as {enc} text.', { enc });
      return [it];
    }
    if (ext === 'json') {
      const lib = validateLibrary(JSON.parse(new TextDecoder().decode(bytes)));
      return [{ id: ++seq, name, file: name, kind: 'library', library: lib }];
    }
    if (ext === 'pdf') {
      const { readPdfLines } = await import('../pdfimport.js');
      const pages = await readPdfLines(bytes, (n, total) => onProgress?.(t('Reading {file}: page {n} of {total}', { file: name, n, total })));
      if (!pages.some((p) => p.lines.length)) return [{ id: ++seq, name, kind: 'skip', error: t('This PDF has no text in it: it is probably a scan or a photo. Use the PDF exported from Word or the document system, or type the steps in the editor.') }];
      return [{ id: ++seq, name, file: name, kind: 'pdf', pdf: { file: name, pages }, device: null }];
    }
  } catch (e) {
    return [{ id: ++seq, name, kind: 'skip', error: e?.name === 'PasswordException' ? t('This PDF is protected with a password. Save a copy without the password and try again.') : t('Could not read this file: {why}', { why: e?.message || String(e) }) }];
  }
  return [{ id: ++seq, name, kind: 'skip', error: t('RightPart reads Excel (.xlsx), CSV, PDF work instructions and RightPart library files (.json).') }];
}

function itemCard(it, app) {
  const isTable = !!it.desc;
  const mapped = isTable ? it.desc.columns.filter((c) => c.header || c.field) : [];
  const rows = isTable ? it.desc.data.length : 0;
  const kinds = isTable ? ['parts', 'codes', 'bom', 'steps', 'skip'] : [it.kind, 'skip'];
  let pdfInfo = null;
  if (it.kind === 'pdf' || it.pdf) {
    const draft = draftSteps(it.pdf.pages, app.index, { file: it.pdf.file });
    if (!it.device) it.device = { id: draft.meta.suggestedId, name: draft.meta.suggestedName || draft.meta.suggestedId, rev: draft.meta.rev || '' };
    pdfInfo = { pages: it.pdf.pages.length, steps: draft.steps.length };
  }
  const needsDevice = it.kind === 'bom' || it.kind === 'steps' || it.kind === 'pdf';
  const devCol = isTable && it.desc.columns.some((c) => c.field === 'device');
  return html`<article class="card load-item ${it.kind === 'skip' ? 'skipped' : ''}" data-item="${it.id}">
    <div class="card-head">
      <div class="li-name"><b dir="auto">${it.name}</b>
        <span class="tiny muted">${isTable ? t('{rows, plural, one {# row} other {# rows}}, column names on row {n}', { rows, n: it.desc.headerRow + 1 }) : pdfInfo ? t('{pages, plural, one {# page} other {# pages}}, {steps} steps found', { pages: pdfInfo.pages, steps: pdfInfo.steps }) : it.library ? t('{n, plural, one {# part} other {# parts}}, {d, plural, one {# device} other {# devices}}', { n: it.library.parts.length, d: it.library.devices.length }) : ''}${it.note ? ` · ${it.note}` : ''}</span>
      </div>
      ${it.error ? '' : html`<label class="li-kind"><span class="sr-only">${t('Read as')}</span><select data-kind="${it.id}">${kinds.map((k) => html`<option value="${k}" ${k === it.kind ? 'selected' : ''}>${KIND[k]()}</option>`)}</select></label>`}
    </div>
    <div class="card-body stack tight">
      ${it.error ? html`<div class="callout warn">${icon('alert')}<div><p>${it.error}</p></div></div>` : ''}
      ${isTable && it.detected === 'unknown' ? html`<p class="small" style="color:var(--warn)">${t('The column names were not recognised. Choose what this table is, and which column holds what.')}</p>` : ''}
      ${it.kind === 'library' ? html`<p class="small">${t('Loading a library file replaces the whole library of this company; the files loaded with it are added on top.')}</p>` : ''}
      ${needsDevice && !devCol ? html`<div class="grid three li-dev">
          <div class="field"><label>${t('Device id')}</label><input data-dev="id" value="${it.device?.id || ''}" dir="ltr" spellcheck="false" autocapitalize="characters" maxlength="40"></div>
          <div class="field"><label>${t('Name')}</label><input data-dev="name" value="${it.device?.name || ''}" dir="auto" maxlength="120"></div>
          <div class="field"><label>${t('Revision')}</label><input data-dev="rev" value="${it.device?.rev || ''}" dir="ltr" maxlength="12"></div>
        </div>` : ''}
      ${isTable && it.kind !== 'skip' ? html`<div class="li-cols">${mapped.map((c) => html`<span class="chip ${c.field ? '' : 'muted-chip'}" title="${c.header}"><bdi>${c.header || t('(no name)')}</bdi>${c.field ? html` → <b>${FIELD[c.field]()}</b>` : html` · ${t('not used')}`}</span>`)}</div>
        <details class="more"><summary><span class="ic">${icon('edit')}</span>${t('Check or change the columns')}</summary>
          <div class="body"><div class="tbl-wrap"><table class="tbl small"><thead><tr><th>${t('Column in the file')}</th><th>${t('Read as')}</th><th>${t('First values')}</th></tr></thead><tbody>
            ${it.desc.columns.map((c) => html`<tr><td><bdi>${c.header || t('(no name)')}</bdi></td><td><select data-col="${c.index}"><option value="">${t('not used')}</option>${fieldsFor(it.kind).map((f) => html`<option value="${f}" ${c.field === f ? 'selected' : ''}>${FIELD[f]()}</option>`)}</select></td><td class="tiny muted"><bdi>${it.desc.data.slice(0, 3).map((r) => r[c.index] || '').filter(Boolean).join(' · ').slice(0, 80)}</bdi></td></tr>`)}
          </tbody></table></div></div>
        </details>` : ''}
    </div>
  </article>`;
}

function reportHTML(app, stats) {
  const r = readiness(app.index);
  const a = app.audit.counts;
  const ok = (cond, good, bad, list = []) => html`<li class="${cond ? 'ok' : 'bad'}">${icon(cond ? 'checkCircle' : 'alert')}<div><span>${cond ? good : bad}</span>${!cond && list.length ? html`<div class="tiny muted">${list.slice(0, 8).map((x, i) => html`${i ? ' · ' : ''}<bdi>${x}</bdi>`)}${list.length > 8 ? ' …' : ''}</div>` : ''}</div></li>`;
  const examples = [];
  const p0 = app.lib.parts.find((p) => (p.aliases || []).length) || app.lib.parts[0];
  if (p0) { examples.push(p0.id); const al = (p0.aliases || [])[0]; if (al) examples.push(al.code); }
  const sized = app.lib.parts.find((p) => p.spec?.thread && p.spec?.length);
  if (sized) examples.push(`${sized.spec.thread}x${sized.spec.length}`);
  return html`<section class="card load-report" id="report">
    <div class="card-head"><h2>${icon('checklist')} ${t('Loaded. Here is what was checked')}</h2></div>
    <div class="card-body stack">
      <ul class="list-plain small load-done">
        ${stats.parts.added + stats.parts.updated ? html`<li>${icon('check')} ${t('{added} parts added, {updated} updated, {codes} codes in total.', { added: stats.parts.added, updated: stats.parts.updated, codes: app.index.byCode.size })}</li>` : ''}
        ${stats.fromBom.length ? html`<li>${icon('check')} ${t('{n, plural, one {# part was taken from a BOM description: check its name and size.} other {# parts were taken from BOM descriptions: check their names and sizes.}}', { n: stats.fromBom.length })}</li>` : ''}
        ${stats.codes ? html`<li>${icon('check')} ${t('{n, plural, one {# more code added to known parts.} other {# more codes added to known parts.}}', { n: stats.codes })}</li>` : ''}
        ${stats.boms.map((b) => html`<li>${icon('check')} ${t('BOM {device} rev {rev}: {n, plural, one {# line} other {# lines}}.', { device: b.id, rev: b.rev || '–', n: b.lines })}</li>`)}
        ${stats.steps.map((s) => html`<li>${icon('check')} ${t('{device}: {n, plural, one {# step} other {# steps}}.', { device: s.id, n: s.steps })}</li>`)}
        ${stats.drafts.map((d) => html`<li>${icon('check')} ${t('{device}: {n, plural, one {# draft step} other {# draft steps}} read from {file}. An engineer reviews each one in the step editor.', { device: d.id, n: d.steps, file: d.file })}</li>`)}
      </ul>
      <h3>${t('Make sure of everything')}</h3>
      <ul class="list-plain load-checks">
        ${ok(!r.unknownBom.length, t('Every BOM line is a known part.'), t('{n, plural, one {# BOM line has a code the parts list does not know.} other {# BOM lines have a code the parts list does not know.}}', { n: r.unknownBom.length }), r.unknownBom.map((x) => `${x.device}: ${x.code}`))}
        ${ok(!r.unknownSteps.length, t('Every part in the steps is a known part.'), t('{n, plural, one {# part in the steps has an unknown code.} other {# parts in the steps have an unknown code.}}', { n: r.unknownSteps.length }), r.unknownSteps.map((x) => `${x.device} ${t('step {n}', { n: x.step })}: ${x.code}`))}
        ${ok(!r.ambiguous.length, t('No code points to two parts.'), t('{n, plural, one {# code points to more than one part: a scan cannot tell them apart.} other {# codes point to more than one part: a scan cannot tell them apart.}}', { n: r.ambiguous.length }), r.ambiguous)}
        ${ok(!r.unsized.length, t('Every screw, nut, washer and standoff has a size.'), t('{n, plural, one {# fastener has no size, so look-alikes cannot be checked for it.} other {# fasteners have no size, so look-alikes cannot be checked for them.}}', { n: r.unsized.length }), r.unsized)}
        ${ok(!r.noBom.length, t('Every device has a BOM.'), t('No BOM yet for: {list}.', { list: r.noBom.join(', ') }))}
        ${ok(!r.noSteps.length, t('Every device has steps.'), t('No steps yet for: {list}.', { list: r.noSteps.join(', ') }))}
        ${ok(!r.drafts, t('No draft steps waiting.'), t('{n, plural, one {# step read from a PDF waits for an engineer to review it.} other {# steps read from PDFs wait for an engineer to review them.}}', { n: r.drafts }))}
        ${ok(!a.critical, t('The integrity check found nothing critical.'), t('The integrity check found {n, plural, one {# critical issue} other {# critical issues}}: fix them before anyone builds from these steps.', { n: a.critical }))}
      </ul>
      <div class="row"><a class="btn primary" href="#/audit">${icon('shield')}${t('Open the integrity check')} (${a.critical + a.warning})</a>${(app.lib.devices || [])[0] ? html`<a class="btn" href="#/device/${encodeURIComponent(app.lib.devices[0].id)}">${icon('cube')}${t('Open {device}', { device: app.lib.devices[0].name })}</a>` : ''}<a class="btn" href="#/parts">${icon('parts')}${t('Parts')}</a></div>
      <h3>${t('Search it')}</h3>
      <form class="hero-search" id="loadSearch" role="search" autocomplete="off">${icon('search')}<input id="lq" type="search" placeholder="${t('Code, size, name or a question')}" aria-label="${t('Search any code, size or name, or ask a question')}" spellcheck="false"><button class="btn primary" type="submit">${t('Find')}</button></form>
      ${examples.length ? html`<div class="try"><span class="lbl">${t('Try:')}</span>${examples.map((q) => html`<button class="chip" type="button" data-q="${q}"><span class="code">${q}</span></button>`)}</div>` : ''}
      ${stats.warnings.length || stats.unknownCodeRows.length ? html`<details class="more"><summary><span class="ic">${icon('info')}</span>${t('Notes from reading the files ({n})', { n: stats.warnings.length + stats.unknownCodeRows.length })}</summary><div class="body"><ul class="small">${[...stats.warnings, ...stats.unknownCodeRows.map((x) => t('{row}: no part with this code, codes not added.', { row: x }))].slice(0, 60).map((w) => html`<li><bdi>${w}</bdi></li>`)}</ul></div></details>` : ''}
      ${stats.fromBom.length ? html`<p class="small">${t('Taken from BOM descriptions:')} ${stats.fromBom.slice(0, 12).map((id, i) => html`${i ? ', ' : ''}<a href="${partHref(id)}" class="code">${id}</a>`)}</p>` : ''}
    </div>
  </section>`;
}

export default async function load({ app, navigate, query }) {
  const ws = currentWorkspace();
  const demo = ws.kind === 'demo';
  return {
    title: t('Load company data'),
    html: html`<div class="page narrow">
      <div class="page-head"><div>
        <h1>${t('Load company data')}</h1>
        <p class="lede">${t('Drop every file you have: parts lists, BOMs and step lists from Excel or CSV, work instructions as PDF. RightPart works out what each file is, reads it, loads everything in one go and then checks it all against itself.')}</p>
      </div></div>
      ${demo ? html`<section class="card pad stack">
          <h2>${icon('building')} ${t('First, a space for the company')}</h2>
          <p class="small">${t('Company data goes into its own space, so the demo stays as it is. You can rename it later.')}</p>
          <form class="row" id="coForm" autocomplete="off"><input id="coName" type="text" required maxlength="80" placeholder="${t('Company name')}" aria-label="${t('Company name')}" style="flex:1;min-width:180px"><button class="btn primary" type="submit">${icon('plus')}${t('Create and continue')}</button></form>
          <p class="small muted">${t('No files at hand?')} <button class="btn sm" type="button" id="trySample">${icon('sparkle')}${t('Try it with a sample company')}</button></p>
        </section>`
        : html`<p class="small muted">${th('Loading into {company}. Files are read on this device; nothing is uploaded or added to the website. Load a company’s real data only with its written approval.', { company: html`<b>${ws.name}</b>` })}</p>
        <label class="drop" id="drop" tabindex="0">${icon('upload')}<b>${t('Drop the files here, or tap to choose')}</b><span class="small muted">${t('Excel (.xlsx), CSV, PDF work instructions, RightPart library (.json). Many files at once.')}</span><input type="file" id="files" multiple accept=".xlsx,.xlsm,.xls,.csv,.tsv,.txt,.json,.pdf" class="sr-only"></label>
        <p class="small muted">${t('No files at hand?')} <button class="btn sm" type="button" id="trySample">${icon('sparkle')}${t('Try the sample files')}</button></p>
        <div id="status" class="small" aria-live="polite"></div>
        <div id="queue" class="stack"></div>
        <div class="row hidden" id="go"><button class="btn primary" type="button" id="loadAll">${icon('check')}${t('Load everything')}</button><button class="btn" type="button" id="clearAll">${t('Clear the list')}</button></div>
        <div id="reportSlot"></div>`}
    </div>`,
    mount(root) {
      root.querySelector('#coForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = root.querySelector('#coName').value.trim();
        if (!name) return;
        const w = addWorkspace({ name, kind: 'local' });
        await switchWorkspace(w.id, '#/load');
      });
      root.querySelector('#trySample')?.addEventListener('click', async () => {
        if (demo) { const w = addWorkspace({ name: t('Orbit Tools (sample)'), kind: 'local' }); await switchWorkspace(w.id, '#/load?sample=1'); return; }
        await addFiles([await sampleFile()]);
      });
      if (demo) return;

      let items = [];
      const queue = root.querySelector('#queue'), status = root.querySelector('#status'), go = root.querySelector('#go');
      const render = () => {
        queue.innerHTML = String(html`${items.map((it) => itemCard(it, app))}`);
        go.classList.toggle('hidden', !items.length);
        root.querySelector('#loadAll').disabled = !items.some((it) => it.kind !== 'skip');
      };
      const addFiles = async (files) => {
        root.querySelector('#reportSlot').innerHTML = '';
        for (const f of files) {
          status.textContent = t('Reading {file}…', { file: f.name });
          items.push(...await readFile(f, (msg) => { status.textContent = msg; }));
          render();
        }
        status.textContent = '';
      };
      const sampleFile = async () => {
        const res = await fetch(SAMPLE);
        if (!res.ok) throw new Error(t('The sample file could not be loaded.'));
        return new File([await res.arrayBuffer()], 'sample-company.xlsx');
      };
      const input = root.querySelector('#files');
      input.addEventListener('change', () => { addFiles([...input.files]); input.value = ''; });
      const drop = root.querySelector('#drop');
      drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('over'));
      drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); addFiles([...(e.dataTransfer?.files || [])]); });
      drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });

      queue.addEventListener('change', (e) => {
        const card = e.target.closest('[data-item]');
        const it = items.find((x) => x.id === +card?.dataset.item);
        if (!it) return;
        if (e.target.matches('[data-kind]')) { it.kind = e.target.value; render(); }
        else if (e.target.matches('[data-col]')) {
          const col = it.desc.columns.find((c) => c.index === +e.target.dataset.col);
          col.field = e.target.value || null;
          render();
          queue.querySelector(`[data-item="${it.id}"] details`)?.setAttribute('open', '');
        }
      });
      queue.addEventListener('input', (e) => {
        const card = e.target.closest('[data-item]');
        const it = items.find((x) => x.id === +card?.dataset.item);
        if (it && e.target.matches('[data-dev]')) {
          it.device = { ...(it.device || {}), [e.target.dataset.dev]: e.target.dataset.dev === 'id' ? e.target.value.trim().toUpperCase().replace(/\s+/g, '-') : e.target.value.trim() };
        }
      });
      root.querySelector('#clearAll').addEventListener('click', () => { items = []; render(); });
      root.querySelector('#loadAll').addEventListener('click', async () => {
        const use = items.filter((it) => it.kind !== 'skip');
        if (!use.length) return;
        for (const it of use) if (['bom', 'steps', 'pdf'].includes(it.kind) && !it.device?.id && !it.desc?.columns.some((c) => c.field === 'device')) { toast(t('Give a device id for {file}.', { file: it.name }), 'bad', 5000); return; }
        const btn = root.querySelector('#loadAll');
        btn.disabled = true;
        status.textContent = t('Loading…');
        try {
          const { lib, stats } = applyItems(app.lib, use);
          if (!lib.meta?.name || /demo/i.test(lib.meta.name)) lib.meta = { ...lib.meta, name: ws.name };
          const { commitLibrary } = await import('../importflows.js');
          await commitLibrary(app, lib, t('{n, plural, one {# file loaded.} other {# files loaded.}}', { n: new Set(use.map((it) => it.file || it.name)).size }));
          items = [];
          render();
          status.textContent = '';
          const slot = root.querySelector('#reportSlot');
          slot.innerHTML = String(reportHTML(app, stats));
          slot.querySelector('#loadSearch').addEventListener('submit', (e) => { e.preventDefault(); submitQuery(slot.querySelector('#lq').value); });
          slot.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => submitQuery(b.dataset.q)));
          slot.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (e) {
          status.textContent = '';
          btn.disabled = false;
          toast(t('Could not load the files: {why}', { why: e?.message || String(e) }), 'bad', 7000);
        }
      });
      if (query?.get('sample')) sampleFile().then((f) => addFiles([f])).catch((e) => toast(e.message, 'bad'));
    },
  };
}

void esc;
