// Loading a company's own files in one go: parts lists, BOMs, step lists (from Excel or CSV),
// work instructions (PDF) and RightPart library files, in the order that lets each one use the
// others (parts first, so the BOM and the steps can resolve their codes), and then a plain report
// of what was loaded and what does not add up yet.
// Pure: tables and PDF text in, a new library and a report out. Reading files happens in views/load.js.

import { partsFromCSV, mergeParts, bomFromCSV, mergeBOM, stepsFromCSV, mergeSteps, validateLibrary } from './importer.js';
import { tableToCSV, partsFromBOMTable } from './detect.js';
import { buildIndex, resolveCode, stepParts } from './model.js';
import { draftSteps, applyDraft } from './pdfsteps.js';
import { isFastener } from './dims.js';

/** Add parts whose code the library does not know yet; for known ones, only add codes they lack. */
export function addMissingParts(lib, parts) {
  const out = structuredClone(lib);
  let index = buildIndex(out);
  const added = [];
  let codes = 0;
  for (const p of parts) {
    const r = resolveCode(index, p.id);
    if (r.status === 'unknown') {
      out.parts.push({ ...p, source: 'bom' });
      added.push(p.id);
      index = buildIndex(out);
      continue;
    }
    if (r.status !== 'unique') continue;
    const cur = out.parts.find((x) => x.id === r.part.id);
    for (const a of p.aliases || []) {
      if (a.code === cur.id || (cur.aliases || []).some((x) => x.code === a.code)) continue;
      cur.aliases = [...(cur.aliases || []), a];
      codes++;
    }
  }
  return { lib: out, added, codes };
}

/**
 * Apply everything at once. items: [{ kind, name, desc, device, library, pdf: { file, pages } }]
 * kinds: library | parts | codes | bom | steps | pdf | skip. Returns { lib, stats }.
 */
export function applyItems(base, items) {
  const stats = { parts: { added: 0, updated: 0 }, codes: 0, fromBom: [], boms: [], steps: [], drafts: [], warnings: [], unknownCodeRows: [] };
  let lib = structuredClone(base);
  const lib0 = items.find((i) => i.kind === 'library' && i.library);
  if (lib0) lib = validateLibrary(structuredClone(lib0.library));
  lib.parts = lib.parts || [];
  lib.devices = lib.devices || [];
  const note = (name, list) => { for (const w of list || []) stats.warnings.push(`${name}: ${w}`); };

  for (const it of items.filter((i) => i.kind === 'parts')) {
    const r = partsFromCSV(tableToCSV(it.desc, 'parts'));
    const m = mergeParts(lib, r.parts);
    lib = m.lib;
    stats.parts.added += m.added;
    stats.parts.updated += m.updated;
    note(it.name, r.warnings);
  }
  for (const it of items.filter((i) => i.kind === 'codes')) {
    const r = partsFromCSV(tableToCSV(it.desc, 'codes'));
    const known = r.parts.filter((p) => lib.parts.some((x) => x.id === p.id));
    for (const p of r.parts) if (!known.includes(p)) stats.unknownCodeRows.push(`${it.name}: ${p.id}`);
    const m = addMissingParts(lib, known);
    lib = m.lib;
    stats.codes += m.codes;
  }
  for (const it of items.filter((i) => i.kind === 'bom')) {
    const r = bomFromCSV(tableToCSV(it.desc, 'bom', it.device));
    lib = mergeBOM(lib, r.boms);
    for (const b of r.boms) stats.boms.push({ id: b.id, name: b.name, rev: b.rev, lines: b.lines.length, file: it.name });
    note(it.name, r.warnings);
    const pcsv = partsFromBOMTable(it.desc);
    if (pcsv) {
      const pr = partsFromCSV(pcsv);
      const m = addMissingParts(lib, pr.parts);
      lib = m.lib;
      stats.fromBom.push(...m.added);
      stats.codes += m.codes;
    }
  }
  for (const it of items.filter((i) => i.kind === 'steps')) {
    const r = stepsFromCSV(tableToCSV(it.desc, 'steps', it.device));
    lib = mergeSteps(lib, r.devices);
    for (const d of r.devices) stats.steps.push({ id: d.id, name: d.name, steps: d.steps.length, file: it.name });
    note(it.name, r.warnings);
  }
  for (const it of items.filter((i) => i.kind === 'pdf' && i.pdf?.pages)) {
    const draft = draftSteps(it.pdf.pages, buildIndex(lib), { file: it.pdf.file || it.name });
    if (!draft.steps.length) { stats.warnings.push(`${it.name}: no steps found`); continue; }
    const dev = it.device || { id: draft.meta.suggestedId, name: draft.meta.suggestedName };
    lib = applyDraft(lib, draft, { deviceId: dev.id, deviceName: dev.name || dev.id, rev: dev.rev || draft.meta.rev, description: draft.notes.join(' ') });
    stats.drafts.push({ id: dev.id, steps: draft.steps.length, unknown: draft.unknownCodes.length, file: it.name });
  }
  // Devices named in BOM or step files keep a readable name.
  for (const d of lib.devices) if (!d.name) d.name = d.id;
  lib.meta = { ...(lib.meta || {}), demo: false, updated: new Date().toISOString().slice(0, 10) };
  return { lib, stats };
}

/**
 * What does not add up yet, in plain terms, for the report after loading.
 * Returns { unknownBom: [{device, code}], unknownSteps: [{device, step, code}], ambiguous: [code],
 *           unsized: [partId], noSteps: [deviceId], noBom: [deviceId], drafts, fromBom }
 */
export function readiness(index) {
  const lib = index.lib;
  const unknownBom = [], unknownSteps = [], noSteps = [], noBom = [];
  let drafts = 0;
  for (const dev of lib.devices || []) {
    const lines = dev.bom?.lines || [];
    const steps = dev.instructions?.steps || [];
    if (!lines.length) noBom.push(dev.id);
    if (!steps.length) noSteps.push(dev.id);
    for (const l of lines) if (resolveCode(index, l.code).status === 'unknown') unknownBom.push({ device: dev.id, code: l.code });
    steps.forEach((s, i) => {
      if (s.draft) drafts++;
      for (const sp of stepParts(index, s)) if (sp.resolution.status === 'unknown') unknownSteps.push({ device: dev.id, step: i + 1, code: sp.ref.code });
    });
  }
  const ambiguous = [...index.byCode.entries()].filter(([, list]) => new Set(list.map((e) => e.partId)).size > 1).map(([, list]) => list[0].alias.code);
  const unsized = lib.parts.filter((p) => isFastener(p) && (p.spec?.d == null || ((p.category === 'screw' || p.category === 'standoff') && p.spec?.length == null))).map((p) => p.id);
  const fromBom = lib.parts.filter((p) => p.source === 'bom').map((p) => p.id);
  return { unknownBom, unknownSteps, ambiguous, unsized, noSteps, noBom, drafts, fromBom };
}
