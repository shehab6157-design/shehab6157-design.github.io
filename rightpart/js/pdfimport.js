// Reading an existing PDF work instruction into draft steps. The PDF is read on this device with
// pdf.js (loaded the first time it is needed); nothing is uploaded. The engineer sees what was
// found and chooses the device before anything is saved, and every step stays a draft until it
// has been compared with the PDF and marked reviewed.
import { html, icon, toast, pickFile, openDialog } from './ui.js';
import { commitLibrary } from './importflows.js';
import { linesFromItems, draftSteps, applyDraft } from './core/pdfsteps.js';

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
      throw new Error('The PDF reader could not be loaded. Open this page once while online so it is stored on this device.');
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
  d.setAttribute('aria-label', 'Reading the PDF');
  d.innerHTML = String(html`<div class="db"><div class="row nowrap"><span class="spinner" style="width:22px;height:22px;border-width:3px;flex:none" aria-hidden="true"></span><span data-t>${text}</span></div></div>`);
  d.addEventListener('cancel', (e) => e.preventDefault());
  document.body.append(d);
  d.showModal();
  return { set: (t) => { d.querySelector('[data-t]').textContent = t; }, close: () => { d.close(); d.remove(); } };
}

function previewBody(app, draft, fileName, preselect) {
  const devices = app.lib.devices || [];
  const s = draft.stats;
  const shown = draft.steps.slice(0, 30);
  return String(html`
    <p class="small muted">${fileName}: ${s.pages} page${s.pages === 1 ? '' : 's'}, ${s.textLines} lines of text, read on this device. Nothing is saved until you choose where the steps go.</p>
    <ul class="list-plain">
      <li>${icon('check')} <b>${s.steps}</b> step${s.steps === 1 ? '' : 's'} found</li>
      <li>${icon('check')} <b>${s.refsLinked}</b> part reference${s.refsLinked === 1 ? '' : 's'} linked to the parts library</li>
      ${draft.unknownCodes.length ? html`<li>${icon('alert')} <b>${draft.unknownCodes.length}</b> code${draft.unknownCodes.length === 1 ? '' : 's'} not in the parts library: ${draft.unknownCodes.slice(0, 12).map((u) => html`<span class="code">${u.code}</span> (page ${u.pages.join(', ')}) `)}${draft.unknownCodes.length > 12 ? '…' : ''}</li>` : ''}
    </ul>
    ${draft.warnings.length ? html`<div class="callout warn">${icon('alert')}<div>${draft.warnings.map((w) => html`<p class="small">${w}</p>`)}</div></div>` : ''}
    <details class="more"><summary>The steps that were found</summary>
      <ol class="small" style="margin-top:8px;display:grid;gap:4px">${shown.map((st) => html`<li><b>${st.title}</b> <span class="muted">· ${st.parts.length} part${st.parts.length === 1 ? '' : 's'} · page ${st.source.page}</span></li>`)}</ol>
      ${draft.steps.length > shown.length ? html`<p class="small muted">…and ${draft.steps.length - shown.length} more.</p>` : ''}
    </details>
    <div class="field"><label for="pdfDev">Put the steps in</label>
      <select id="pdfDev">
        <option value="">A new device</option>
        ${devices.map((d) => html`<option value="${d.id}" ${d.id === preselect ? 'selected' : ''}>${d.name} (${d.id})${d.instructions?.steps?.length ? `: replaces its ${d.instructions.steps.length} steps` : ''}</option>`)}
      </select>
    </div>
    <div class="grid two" id="pdfNew" ${preselect && devices.some((d) => d.id === preselect) ? 'hidden' : ''}>
      <div class="field"><label for="pdfId">Device id</label><input id="pdfId" type="text" maxlength="40" spellcheck="false" autocapitalize="characters" value="${draft.meta.suggestedId}"></div>
      <div class="field"><label for="pdfName">Name</label><input id="pdfName" type="text" maxlength="120" value="${draft.meta.suggestedName}"></div>
    </div>
    <div class="callout info">${icon('info')}<div><p>The steps are saved as <b>drafts</b>. Workers see a warning on each one until an engineer compares it with the PDF in the step editor and ticks <b>Reviewed</b>.</p></div></div>`);
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
    if (!res?.ok) { toast('The sample PDF could not be loaded. Check the connection and try again.', 'bad', 5000); return null; }
    data = new Uint8Array(await res.arrayBuffer());
    fileName = url.split('/').pop();
  } else {
    const file = await pickFile('application/pdf,.pdf');
    if (!file) return null;
    if (file.size > MAX_BYTES) { toast('That PDF is larger than 40 MB. Split it into one document per assembly.', 'bad', 6000); return null; }
    data = new Uint8Array(await file.arrayBuffer());
    fileName = file.name;
  }

  const box = progressBox(`Reading ${fileName}…`);
  let pages;
  try {
    pages = await readPdfLines(data, (n, total) => box.set(`Reading ${fileName}: page ${n} of ${total}`));
  } catch (e) {
    box.close();
    toast(e?.name === 'PasswordException' ? 'This PDF is protected with a password. Save a copy without the password and try again.' : `The PDF could not be read. ${e?.message || ''}`.trim(), 'bad', 7000);
    return null;
  }
  box.close();

  if (!pages.some((p) => p.lines.length)) {
    toast('This PDF has no text in it: it is probably a scan or a photo. Use the PDF exported from Word or the document system, or type the steps in the editor.', 'bad', 9000);
    return null;
  }
  const draft = draftSteps(pages, app.index, { file: fileName });

  let choice = null;
  const go = await openDialog({
    title: 'Steps read from the PDF',
    body: previewBody(app, draft, fileName, deviceId),
    actions: [{ label: 'Cancel', value: false }, { label: 'Create draft steps', value: true, primary: true }],
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

  await commitLibrary(app, applyDraft(app.lib, draft, choice), `${draft.steps.length} draft step${draft.steps.length === 1 ? '' : 's'} read from ${fileName}. Review each one before anyone builds from it.`);
  return choice.deviceId;
}
