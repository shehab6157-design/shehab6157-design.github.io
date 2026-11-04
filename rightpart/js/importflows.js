// Import flows shared by the setup checklist, the step editor and the data page:
// pick a file, preview what changes, then save into the current company's library.
import { html, icon, toast, download, pickFile, openDialog } from './ui.js';
import { saveLibrary, currentWorkspace } from './store.js';
import { setLibrary } from './app.js';
import { partsFromCSV, mergeParts, bomFromCSV, mergeBOM, stepsFromCSV, mergeSteps, validateLibrary, partsTemplateCSV, bomTemplateCSV, stepsTemplateCSV } from './core/importer.js';

function preview(title, lines, warnings) {
  return openDialog({
    title,
    body: String(html`<ul class="list-plain">${lines.map((l) => html`<li>${icon('check')} ${l}</li>`)}</ul>${warnings.length ? html`<div class="callout warn">${icon('alert')}<div><p class="t">${warnings.length} note${warnings.length > 1 ? 's' : ''}</p><ul>${warnings.slice(0, 12).map((w) => html`<li class="small">${w}</li>`)}</ul>${warnings.length > 12 ? html`<p class="small">…and ${warnings.length - 12} more.</p>` : ''}</div></div>` : ''}`),
    actions: [{ label: 'Cancel', value: false }, { label: 'Import', value: true, primary: true }],
  });
}

/** Save a new version of the current company's library on this device and refresh every page. */
export async function commitLibrary(app, lib, message) {
  const ws = currentWorkspace();
  const name = ws.kind === 'demo' ? 'Demo (edited)' : ws.name;
  if (ws.kind === 'cloud') {
    const { markEdited } = await import('./cloud.js');
    await markEdited(lib);
  } else {
    await saveLibrary(lib, name);
  }
  setLibrary(lib, ws.kind === 'demo' ? 'imported' : ws.kind, name);
  if (message) toast(`${message}${ws.kind === 'cloud' ? ' Publish it when ready so the team gets it.' : ''}`, 'ok', 5000);
}

export async function importParts(app) {
  const f = await pickFile('.csv,text/csv');
  if (!f) return false;
  const { parts, warnings } = partsFromCSV(await f.text());
  if (!parts.length) { toast('No parts found in that file. Check that it has an id or part number column.', 'bad', 5000); return false; }
  const { lib, added, updated } = mergeParts(app.lib, parts);
  if (!(await preview(`Import ${parts.length} parts from ${f.name}`, [`${added} new part${added === 1 ? '' : 's'}`, `${updated} updated`, `${parts.reduce((n, p) => n + (p.aliases?.length || 0), 0)} codes`], warnings))) return false;
  await commitLibrary(app, lib, `${parts.length} parts imported.`);
  return true;
}

export async function importBOM(app) {
  const f = await pickFile('.csv,text/csv');
  if (!f) return false;
  const { boms, warnings } = bomFromCSV(await f.text());
  if (!boms.length) { toast('No BOM lines found in that file.', 'bad'); return false; }
  if (!(await preview(`Import ${boms.length} BOM${boms.length > 1 ? 's' : ''} from ${f.name}`, boms.map((b) => `${b.id} rev ${b.rev || '?'}: ${b.lines.length} lines`), warnings))) return false;
  await commitLibrary(app, mergeBOM(app.lib, boms), 'BOM imported. The integrity check has run again.');
  return true;
}

export async function importSteps(app) {
  const f = await pickFile('.csv,text/csv');
  if (!f) return false;
  const { devices, warnings } = stepsFromCSV(await f.text());
  if (!devices.length) { toast('No steps found in that file.', 'bad'); return false; }
  const replacing = devices.filter((d) => app.lib.devices?.some((x) => x.id === d.id && x.instructions?.steps?.length));
  if (!(await preview(`Import steps from ${f.name}`, [...devices.map((d) => `${d.id}: ${d.steps.length} step${d.steps.length === 1 ? '' : 's'}${d.rev ? `, instructions rev ${d.rev}` : ''}`), ...(replacing.length ? [`Replaces the current steps of ${replacing.map((d) => d.id).join(', ')}`] : [])], warnings))) return false;
  await commitLibrary(app, mergeSteps(app.lib, devices), 'Steps imported. The integrity check has run on them.');
  return true;
}

export async function importLibraryJSON(app) {
  const f = await pickFile('application/json,.json');
  if (!f) return false;
  try {
    const lib = validateLibrary(JSON.parse(await f.text()));
    if (!(await preview(`Import ${f.name}`, [`${lib.parts.length} parts`, `${lib.devices.length} devices`, 'Replaces the whole library of this company'], []))) return false;
    await commitLibrary(app, lib, 'Library imported.');
    return true;
  } catch (e) { toast(`Not imported: ${e.message}`, 'bad', 5000); return false; }
}

export const templates = {
  parts: () => download('rightpart-parts-template.csv', '﻿' + partsTemplateCSV(), 'text/csv;charset=utf-8'),
  bom: () => download('rightpart-bom-template.csv', '﻿' + bomTemplateCSV(), 'text/csv;charset=utf-8'),
  steps: () => download('rightpart-steps-template.csv', '﻿' + stepsTemplateCSV(), 'text/csv;charset=utf-8'),
};
