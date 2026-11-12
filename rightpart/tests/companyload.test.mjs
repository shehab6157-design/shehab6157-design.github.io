// Loading a company's own files: Excel reading, recognising tables and columns, loading it all, checking it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readXlsx, colIndex, isOldExcel } from '../js/core/xlsx.js';
import { describeTable, tableToCSV, deviceFromName, findHeaderRow } from '../js/core/detect.js';
import { applyItems, readiness, addMissingParts } from '../js/core/companyload.js';
import { partsFromCSV } from '../js/core/importer.js';
import { parseCSV } from '../js/core/csv.js';
import { buildIndex, resolveCode } from '../js/core/model.js';
import { runAudit } from '../js/core/audit.js';

const file = (p) => new Uint8Array(readFileSync(new URL(p, import.meta.url)));
const fieldsOf = (d) => Object.fromEntries(d.columns.filter((c) => c.field).map((c) => [c.header, c.field]));

test('Excel: workbooks from three different writers read the same way', async () => {
  const a = await readXlsx(file('../data/sample-company.xlsx')); // openpyxl
  const b = await readXlsx(file('./fixtures/sample-libreoffice.xlsx')); // LibreOffice
  assert.deepEqual(a.map((s) => s.name), ['Material master', 'BOM ORION-2', 'Work steps']);
  assert.deepEqual(b.map((s) => s.rows.filter((r) => r.length)), a.map((s) => s.rows.filter((r) => r.length)));
  assert.deepEqual(a[0].rows[3].slice(0, 2), ['710-1001', 'SCREW PAN HD M3X8 PHIL SS']);
  assert.equal(a[0].rows[3][6], '0.5', 'numbers come through as written');
  const c = await readXlsx(file('./fixtures/priority-style.xlsx')); // XlsxWriter, with a formula and a hidden sheet
  assert.deepEqual(c.map((s) => [s.name, s.hidden]), [['Parts', false], ['הרכבה', false], ['Lists', true]]);
  assert.equal(c[0].rows[3][0], 'A-102', 'a formula gives its calculated value');
  assert.equal(c[1].rows[0][1], 'מק"ט');
  assert.equal(colIndex('A'), 0); assert.equal(colIndex('Z'), 25); assert.equal(colIndex('AA'), 26); assert.equal(colIndex('AZ'), 51);
  assert.ok(isOldExcel(Uint8Array.of(0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1, 0)));
  await assert.rejects(readXlsx(Uint8Array.of(0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1, 0)), /old-xls/);
});

test('tables are recognised by their column names, in several ERP styles and languages', async () => {
  const [parts, bom, steps] = (await readXlsx(file('../data/sample-company.xlsx'))).map((s) => describeTable(s.rows, s.name));
  assert.equal(parts.kind, 'parts');
  assert.equal(parts.headerRow, 2, 'a title row above the column names is skipped');
  assert.deepEqual(fieldsOf(parts), { Material: 'id', 'Material Description': 'name', 'Customer P/N': 'customer', 'Vendor P/N': 'supplier', 'Mfr P/N': 'manufacturer', 'Old P/N': 'legacy', 'Torque (Nm)': 'torque_nm', Status: 'status' });
  assert.equal(bom.kind, 'bom');
  assert.deepEqual(bom.device, { id: 'ORION-2', name: 'Handheld scanner' });
  assert.equal(bom.rev, 'B');
  assert.equal(steps.kind, 'steps');
  assert.equal(fieldsOf(steps).Components, 'parts');
  const pr = await readXlsx(file('./fixtures/priority-style.xlsx'));
  const p2 = describeTable(pr[0].rows, 'Parts');
  assert.equal(p2.kind, 'parts');
  assert.equal(fieldsOf(p2)['Cust. P/N'], 'customer');
  const he = describeTable(pr[1].rows, 'הרכבה');
  assert.equal(he.kind, 'bom');
  assert.deepEqual(fieldsOf(he), { 'מוצר': 'device', 'מק"ט': 'id', 'תיאור': 'name', 'כמות': 'qty' });
  const de = describeTable([['Teilenummer', 'Bezeichnung', 'Menge', 'Pos'], ['T-1', 'Schraube M3x8', '4', '10'], ['T-2', 'Mutter M3', '4', '20']], 'Stückliste');
  assert.equal(de.kind, 'bom');
  const ar = describeTable([['رقم القطعة', 'الوصف'], ['Q-1', 'برغي M3x8'], ['Q-2', 'صامولة M3']], 'x');
  assert.equal(ar.kind, 'parts');
  // "Material" is a part number in SAP, but a material grade in other lists: the values decide.
  const grade = describeTable([['Part number', 'Description', 'Material'], ['P-1', 'Screw M3x8', 'A2'], ['P-2', 'Nut M3', 'steel']], 'x');
  assert.equal(fieldsOf(grade).Material, 'material');
  assert.equal(describeTable([['Colour', 'Mood'], ['red', 'happy'], ['blue', 'calm']], 'x').kind, 'unknown');
  assert.equal(findHeaderRow([['Report'], [], ['Part number', 'Description'], ['1', 'x']]), 2);
});

test('a recognised table feeds the importers, with sizes read from free-text descriptions', async () => {
  const pr = await readXlsx(file('./fixtures/priority-style.xlsx'));
  const r = partsFromCSV(tableToCSV(describeTable(pr[0].rows, 'Parts')));
  const a100 = r.parts.find((p) => p.id === 'A-100');
  assert.deepEqual([a100.category, a100.spec.d, a100.spec.length, a100.spec.head, a100.spec.material], ['screw', 4, 10, 'button', 'A2']);
  assert.deepEqual(a100.aliases.map((x) => `${x.type}:${x.code}`).sort(), ['customer:C-1', 'manufacturer:MF-9']);
  assert.equal(deviceFromName('BOM ORION-2.xlsx'), 'ORION-2');
  assert.equal(deviceFromName('Steps for GX 7.csv'), 'GX-7');
  assert.equal(deviceFromName('Work steps'), 'DEVICE-1');
  assert.deepEqual(parseCSV('מק"ט,שם\n1,"a, ""b"""\n'), [['מק"ט', 'שם'], ['1', 'a, "b"']]);
});

test('loading a whole company at once, then checking everything', async () => {
  const sheets = await readXlsx(file('../data/sample-company.xlsx'));
  const items = sheets.map((s) => { const d = describeTable(s.rows, s.name); return { kind: d.kind, name: s.name, desc: d, device: d.device ? { ...d.device, rev: d.rev } : { id: deviceFromName(s.name), name: '' } }; });
  const { lib, stats } = applyItems({ schema: 'rightpart/1', meta: { name: 'Orbit Tools (sample)' }, parts: [], devices: [] }, items);
  assert.deepEqual(stats.parts, { added: 12, updated: 0 });
  assert.deepEqual(stats.fromBom, ['710-1099'], 'a BOM line the parts list lacks becomes a part, from its description');
  assert.equal(lib.devices.length, 1);
  assert.equal(lib.devices[0].name, 'Handheld scanner');
  assert.equal(lib.devices[0].bom.lines.length, 10);
  assert.equal(lib.devices[0].instructions.steps.length, 5);
  const index = buildIndex(lib);
  assert.equal(resolveCode(index, 'CX-4411').part.id, '710-1002', 'a BOM line written with a customer code still resolves');
  assert.equal(resolveCode(index, '710-0991').legacy, true);
  const r = readiness(index);
  assert.deepEqual([r.unknownBom.length, r.unknownSteps.length, r.ambiguous.length], [0, 0, 0]);
  assert.deepEqual(r.unsized, ['710-1007']);
  const audit = runAudit(index);
  assert.ok(audit.findings.some((f) => f.severity === 'critical' && f.check === 'likely-substitution'), 'the step that fits M3×8 where the BOM asks for M3×10 is caught');
  // Loading the same files again updates instead of duplicating.
  const again = applyItems(lib, items);
  assert.deepEqual(again.stats.parts, { added: 0, updated: 12 });
  assert.equal(again.lib.parts.length, lib.parts.length);
  // Codes for a known part are added; a BOM never renames a known part.
  const m = addMissingParts(lib, [{ id: '710-1001', name: 'renamed?', category: 'screw', spec: {}, aliases: [{ type: 'supplier', code: 'NEW-1' }] }]);
  assert.equal(m.codes, 1);
  assert.equal(m.lib.parts.find((p) => p.id === '710-1001').name, 'SCREW PAN HD M3X8 PHIL SS');
});
