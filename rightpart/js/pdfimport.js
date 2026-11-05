// Reading an existing PDF work instruction into draft steps. The PDF is read on this device with
// pdf.js (loaded the first time it is needed); nothing is uploaded. The engineer sees what was
// found and chooses the device before anything is saved, and every step stays a draft until it
// has been compared with the PDF and marked reviewed.
import { html, icon, toast, pickFile, openDialog } from './ui.js';
import { commitLibrary } from './importflows.js';
import { linesFromItems, draftSteps, applyDraft } from './core/pdfsteps.js';
import { th } from './ui.js';
import { t } from './core/i18n.js';

export const SAMPLE_PDF = 'data/sample-work-instruction.pdf';
const MAX_BYTES = 40 * 1024 * 1024;

let pdfjsPromise = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('../vendor/pdfjs/pdf.min.mjs').then((m) => {
      m.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
      return m;
    }).catch(() => {
      pdfjsPromise = null;
      throw new Error(t('The PDF reader could not be loaded. Open this page once while online so it is stored on this device.'));
    });
  }
  return pdfjsPromise;
}

/** The text of every page, as lines. */
export async function readPdfLines(data, onPage) {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  try {
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push({ page: n, lines: linesFromItems(content.items) });
      page.cleanup();
      onPage?.(n, doc.numPages);
    }
    return pages;
  } finally {
    doc.destroy();
  }
}

function progressBox(text) {
  const d = document.createElement('dialog');
  d.className = 'dlg';
  d.setAttribute('aria-label', t('Reading the PDF'));
  d.innerHTML = String(html`<div class="db"><div class="row nowrap"><span class="spinner" style="width:22px;height:22px;border-width:3px;flex:none" aria-hidden="true"></span><span data-t>${text}</span></div></div>`);
  d.addEventListener('cancel', (e) => e.preventDefault());
  document.body.append(d);
  d.showModal();
  return { set: (text2) => { d.querySelector('[data-t]').textContent = text2; }, close: () => { d.close(); d.remove(); } };
}

function previewBody(app, draft, fileName, preselect) {
  const devices = app.lib.devices || [];
  const s = draft.stats;
  const shown = draft.steps.slice(0, 30);
  return String(html`
    <p class="small muted">${t('{file}: {pages, plural, one {# page} other {# pages}}, {lines} lines of text, read on this device. Nothing is saved until you choose where the steps go.', { file: fileName, pages: s.pages, lines: s.textLines })}</p>
    <ul class="list-plain">
      <li>${icon('check')} ${th('{n, plural, one {{b} step found} other {{b} steps found}}', { n: s.steps, b: html`<b>${s.steps}</b>` })}</li>
      <li>${icon('check')} ${th('{n, plural, one {{b} part reference linked to the parts library} other {{b} part references linked to the parts library}}', { n: s.refsLinked, b: html`<b>${s.refsLinked}</b>` })}</li>
      ${draft.unknownCodes.length ? html`<li>${icon('alert')} ${th('{n, plural, one {{b} code not in the parts library:} other {{b} codes not in the parts library:}}', { n: draft.unknownCodes.length, b: html`<b>${draft.unknownCodes.length}</b>` })} ${draft.unknownCodes.slice(0, 12).map((u) => html`<span class="code">${u.code}</span> (${t('page {n}', { n: u.pages.join(', ') })}) `)}${draft.unknownCodes.length > 12 ? '…' : ''}</li>` : ''}
    </ul>
    ${draft.warnings.length ? html`<div class="callout warn">${icon('alert')}<div>${draft.warnings.map((w) => html`<p class="small">${w}</p>`)}</div></div>` : ''}
    <details class="more"><summary>${t('The steps that were found')}</summary>
      <ol class="small" style="margin-top:8px;display:grid;gap:4px">${shown.map((st) => html`<li><b dir="auto">${st.title}</b> <span class="muted">· ${t('{n, plural, one {# part} other {# parts}}', { n: st.parts.length })} · ${t('page {n}', { n: st.source.page })}</span></li>`)}</ol>
      ${draft.steps.length > shown.length ? html`<p class="small muted">${t('…and {n} more.', { n: draft.steps.length - shown.length })}</p>` : ''}
    </details>
    <div class="field"><label for="pdfDev">${t('Put the steps in')}</label>
      <select id="pdfDev">
        <option value="">${t('A new device')}</option>
        ${devices.map((d) => html`<option value="${d.id}" ${d.id === preselect ? 'selected' : ''}>${d.name} (${d.id})${d.instructions?.steps?.length ? `: ${t('replaces its {n} steps', { n: d.instructions.steps.length })}` : ''}</option>`)}
      </select>
    </div>
    <div class="grid two" id="pdfNew" ${preselect && devices.some((d) => d.id === preselect) ? 'hidden' : ''}>
      <div class="field"><label for="pdfId">${t('Device id')}</label><input id="pdfId" type="text" maxlength="40" spellcheck="false" dir="ltr" autocapitalize="characters" value="${draft.meta.suggestedId}"></div>
      <div class="field"><label for="pdfName">${t('Name')}</label><input id="pdfName" type="text" maxlength="120" dir="auto" value="${draft.meta.suggestedName}"></div>
    </div>
    <div class="callout info">${icon('info')}<div><p>${th('The steps are saved as {drafts}. Workers see a warning on each one until an engineer compares it with the PDF in the step editor and ticks {reviewed}.', { drafts: html`<b>${t('drafts')}</b>`, reviewed: html`<b>${t('Reviewed')}</b>` })}</p></div></div>`);
}

/**
 * Pick a PDF (or use `url`), read it, preview the draft and save it into a device.
 * Resolves with the device id, or null when nothing was saved.
 */
export async function importPdfSteps(app, { url, deviceId } = {}) {
  let data;
  let fileName;
  if (url) {
    const res = await fetch(url).catch(() => null);
    if (!res?.ok) { toast(t('The sample PDF could not be loaded. Check the connection and try again.'), 'bad', 5000); return null; }
    data = new Uint8Array(await res.arrayBuffer());
    fileName = url.split('/').pop();
  } else {
    const file = await pickFile('application/pdf,.pdf');
    if (!file) return null;
    if (file.size > MAX_BYTES) { toast(t('That PDF is larger than 40 MB. Split it into one document per assembly.'), 'bad', 6000); return null; }
    data = new Uint8Array(await file.arrayBuffer());
    fileName = file.name;
  }

  const box = progressBox(t('Reading {file}…', { file: fileName }));
  let pages;
  try {
    pages = await readPdfLines(data, (n, total) => box.set(t('Reading {file}: page {n} of {total}', { file: fileName, n, total })));
  } catch (e) {
    box.close();
    toast(e?.name === 'PasswordException' ? t('This PDF is protected with a password. Save a copy without the password and try again.') : `${t('The PDF could not be read.')} ${e?.message || ''}`.trim(), 'bad', 7000);
    return null;
  }
  box.close();

  if (!pages.some((p) => p.lines.length)) {
    toast(t('This PDF has no text in it: it is probably a scan or a photo. Use the PDF exported from Word or the document system, or type the steps in the editor.'), 'bad', 9000);
    return null;
  }
  const draft = draftSteps(pages, app.index, { file: fileName });

  let choice = null;
  const go = await openDialog({
    title: t('Steps read from the PDF'),
    body: previewBody(app, draft, fileName, deviceId),
    actions: [{ label: t('Cancel'), value: false }, { label: t('Create draft steps'), value: true, primary: true }],
    onMount(d) {
      const sel = d.querySelector('#pdfDev');
      const fresh = d.querySelector('#pdfNew');
      sel.addEventListener('change', () => { fresh.hidden = !!sel.value; });
    },
    onClose(d) {
      const existing = d.querySelector('#pdfDev').value;
      const id = (existing || d.querySelector('#pdfId').value.trim().toUpperCase().replace(/\s+/g, '-') || draft.meta.suggestedId).slice(0, 40);
      const dev = (app.lib.devices || []).find((x) => x.id === id);
      choice = { deviceId: id, deviceName: dev?.name || d.querySelector('#pdfName').value.trim() || id, rev: draft.meta.rev, description: draft.notes.join(' ') };
    },
  });
  if (!go || !choice) return null;

  await commitLibrary(app, applyDraft(app.lib, draft, choice), t('{n, plural, one {# draft step read from {file}. Review it before anyone builds from it.} other {# draft steps read from {file}. Review each one before anyone builds from it.}}', { n: draft.steps.length, file: fileName }));
  return choice.deviceId;
}
