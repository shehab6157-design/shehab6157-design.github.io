// Import flows shared by the setup checklist, the step editor and the data page:
// pick a file, preview what changes, then save into the current company's library.
import { html, icon, toast, download, pickFile, openDialog } from './ui.js';
import { saveLibrary, currentWorkspace } from './store.js';
import { setLibrary } from './app.js';
import { partsFromCSV, mergeParts, bomFromCSV, mergeBOM, stepsFromCSV, mergeSteps, validateLibrary, partsTemplateCSV, bomTemplateCSV, stepsTemplateCSV } from './core/importer.js';
import { t, getLanguage } from './core/i18n.js';
import { contentCSV, importContentCSV } from './core/translations.js';
import { translatedLanguages, contentLanguage } from './core/content.js';
import { KNOWN_LANGUAGES } from './lang.js';

function preview(title, lines, warnings, extra = '') {
  return openDialog({
    title,
    body: String(html`<ul class="list-plain">${lines.map((l) => html`<li>${icon('check')} ${l}</li>`)}</ul>${warnings.length ? html`<div class="callout warn">${icon('alert')}<div><p class="t">${t('{n, plural, one {# note} other {# notes}}', { n: warnings.length })}</p><ul>${warnings.slice(0, 12).map((w) => html`<li class="small">${w}</li>`)}</ul>${warnings.length > 12 ? html`<p class="small">${t('…and {n} more.', { n: warnings.length - 12 })}</p>` : ''}</div></div>` : ''}${extra}`),
    actions: [{ label: t('Cancel'), value: false }, { label: t('Import'), value: true, primary: true }],
    onClose(d, v) { if (v && extra) preview.form = Object.fromEntries([...d.querySelectorAll('input[name]')].map((i) => [i.name, i.type === 'checkbox' ? i.checked : i.value])); },
  });
}

/** Save a new version of the current company's library on this device and refresh every page. */
export async function commitLibrary(app, lib, message) {
  const ws = currentWorkspace();
  const name = ws.kind === 'demo' ? t('Demo (edited)') : ws.name;
  // Sealed chambers: the version being replaced and the new one both join this tablet's chain of seals.
  const { sealVersion } = await import('./chambers.js');
  try { await sealVersion(app.lib, t('Before: {note}', { note: message || '' })); } catch (e) { console.warn('seal', e); }
  if (ws.kind === 'cloud') {
    const { markEdited } = await import('./cloud.js');
    await markEdited(lib);
  } else {
    await saveLibrary(lib, name);
  }
  try { await sealVersion(lib, message || ''); } catch (e) { console.warn('seal', e); }
  app.sealOk = true;
  setLibrary(lib, ws.kind === 'demo' ? 'imported' : ws.kind, name);
  if (message) toast(ws.kind === 'cloud' ? `${message} ${t('Publish it when ready so the team gets it.')}` : message, 'ok', 5000);
}

export async function importParts(app) {
  const f = await pickFile('.csv,text/csv');
  if (!f) return false;
  const { parts, warnings } = partsFromCSV(await f.text());
  if (!parts.length) { toast(t('No parts found in that file. Check that it has an id or part number column.'), 'bad', 5000); return false; }
  const { lib, added, updated } = mergeParts(app.lib, parts);
  if (!(await preview(t('Import {n} parts from {file}', { n: parts.length, file: f.name }), [t('{n, plural, one {# new part} other {# new parts}}', { n: added }), t('{n} updated', { n: updated }), t('{n, plural, one {# code} other {# codes}}', { n: parts.reduce((n, p) => n + (p.aliases?.length || 0), 0) })], warnings))) return false;
  await commitLibrary(app, lib, t('{n, plural, one {# part imported.} other {# parts imported.}}', { n: parts.length }));
  return true;
}

export async function importBOM(app) {
  const f = await pickFile('.csv,text/csv');
  if (!f) return false;
  const { boms, warnings } = bomFromCSV(await f.text());
  if (!boms.length) { toast(t('No BOM lines found in that file.'), 'bad'); return false; }
  if (!(await preview(t('{n, plural, one {Import # BOM from {file}} other {Import # BOMs from {file}}}', { n: boms.length, file: f.name }), boms.map((b) => t('{id} rev {rev}: {n, plural, one {# line} other {# lines}}', { id: b.id, rev: b.rev || '?', n: b.lines.length })), warnings))) return false;
  await commitLibrary(app, mergeBOM(app.lib, boms), t('BOM imported. The integrity check has run again.'));
  return true;
}

export async function importSteps(app) {
  const f = await pickFile('.csv,text/csv');
  if (!f) return false;
  const { devices, warnings } = stepsFromCSV(await f.text());
  if (!devices.length) { toast(t('No steps found in that file.'), 'bad'); return false; }
  const replacing = devices.filter((d) => app.lib.devices?.some((x) => x.id === d.id && x.instructions?.steps?.length));
  if (!(await preview(t('Import steps from {file}', { file: f.name }), [...devices.map((d) => `${d.id}: ${t('{n, plural, one {# step} other {# steps}}', { n: d.steps.length })}${d.rev ? `, ${t('instructions rev {rev}', { rev: d.rev })}` : ''}`), ...(replacing.length ? [t('Replaces the current steps of {list}', { list: replacing.map((d) => d.id).join(', ') })] : [])], warnings))) return false;
  await commitLibrary(app, mergeSteps(app.lib, devices), t('Steps imported. The integrity check has run on them.'));
  return true;
}

export async function importLibraryJSON(app) {
  const f = await pickFile('application/json,.json');
  if (!f) return false;
  try {
    const lib = validateLibrary(JSON.parse(await f.text()));
    if (!(await preview(t('Import {file}', { file: f.name }), [t('{n, plural, one {# part} other {# parts}}', { n: lib.parts.length }), t('{n, plural, one {# device} other {# devices}}', { n: lib.devices.length }), t('Replaces the whole library of this company')], []))) return false;
    await commitLibrary(app, lib, t('Library imported.'));
    return true;
  } catch (e) { toast(t('Not imported: {error}', { error: e.message }), 'bad', 5000); return false; }
}

/** Step and part text in other languages, from the spreadsheet made by "Export step text to translate". */
export async function importStepTranslations(app) {
  const f = await pickFile('.csv,text/csv');
  if (!f) return false;
  const res = importContentCSV(app.lib, await f.text());
  const langs = Object.keys(res.counts);
  if (!langs.length) { toast(res.warnings[0] || t('No translations found in that file.'), 'bad', 6000); return false; }
  const lines = langs.map((l) => t('{language}: {n, plural, one {# text} other {# texts}}', { language: languageName(l), n: res.counts[l] }));
  if (res.changedOriginals) lines.push(t('{n, plural, one {# original text changed since the export: those steps are marked as older than the step.} other {# original texts changed since the export: those steps are marked as older than the step.}}', { n: res.changedOriginals }));
  const extra = html`<label class="check" style="margin-top:12px"><input type="checkbox" name="reviewed"><span>${t('Someone who reads these languages checked the translations against the original')}</span></label><p class="tiny muted" style="margin-top:6px">${t('Numbers are compared automatically: a translation that changes a torque, a count or a size is held back and the original is shown.')}</p>`;
  if (!(await preview(t('Import translations from {file}', { file: f.name }), lines, res.warnings, extra))) return false;
  const final = importContentCSV(app.lib, await f.text(), { reviewed: !!preview.form?.reviewed });
  await commitLibrary(app, final.lib, t('Translations imported. The integrity check has compared their numbers with the originals.'));
  return true;
}

export function languageName(code, inLang = getLanguage()) {
  try { return new Intl.DisplayNames([inLang], { type: 'language' }).of(code) || code; } catch { return code; }
}

/** Ask which languages to export, then download the spreadsheet for the translator. */
export async function exportStepText(app) {
  const have = translatedLanguages(app.lib);
  const source = contentLanguage(app.lib);
  const options = KNOWN_LANGUAGES.filter((l) => l.code !== source);
  let chosen = [];
  const ok = await openDialog({
    title: t('Export step text to translate'),
    body: String(html`<p class="muted">${t('Pick the languages people on your line read. The spreadsheet has one row per piece of text (step titles, instructions, checks, warnings and part explanations) and one column per language. Existing translations are filled in.')}</p>
      <div class="lang-checks">${options.map((l) => html`<label class="check"><input type="checkbox" value="${l.code}" ${have.includes(l.code) ? 'checked' : ''}><span lang="${l.code}">${l.native}</span><span class="tiny muted">${l.english}</span></label>`)}</div>
      <div class="field" style="margin-top:12px"><label for="otherLang">${t('Another language (code, for example ti, ne or so)')}</label><input id="otherLang" type="text" dir="ltr" spellcheck="false" placeholder="ti, ne, so"></div>`),
    actions: [{ label: t('Cancel'), value: false }, { label: t('Download'), value: true, primary: true }],
    onClose(d) { chosen = [...d.querySelectorAll('.lang-checks input:checked')].map((i) => i.value).concat(d.querySelector('#otherLang').value.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean)); },
  });
  if (!ok) return;
  if (!chosen.length) { toast(t('Pick at least one language.'), 'bad'); return; }
  download(`rightpart-step-text-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + contentCSV(app.lib, chosen), 'text/csv;charset=utf-8');
}

export const templates = {
  parts: () => download('rightpart-parts-template.csv', '﻿' + partsTemplateCSV(), 'text/csv;charset=utf-8'),
  bom: () => download('rightpart-bom-template.csv', '﻿' + bomTemplateCSV(), 'text/csv;charset=utf-8'),
  steps: () => download('rightpart-steps-template.csv', '﻿' + stepsTemplateCSV(), 'text/csv;charset=utf-8'),
};
