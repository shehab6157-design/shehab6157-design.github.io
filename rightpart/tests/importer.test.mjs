// Spreadsheet import: sizes are read from descriptions, codes are merged, BOMs are grouped by device.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partsFromCSV, mergeParts, bomFromCSV, mergeBOM, validateLibrary } from '../js/core/importer.js';
import { buildIndex, resolveCode } from '../js/core/model.js';
import { runAudit } from '../js/core/audit.js';

test('parts CSV: spec from the description, codes from columns', () => {
  const csv = 'Part Number;Description;Customer codes;Supplier codes;Torque Nm\n'
    + 'X-1;DIN 912 M4x12 A2;K-1;S-1@Acme|S-1B@Beta;1,5\n'
    + 'X-2;ISO 10511 M4 A2;K-2;;\n'
    + ';missing id;;;\n';
  const { parts, warnings } = partsFromCSV(csv);
  assert.equal(parts.length, 2);
  assert.ok(warnings.some((w) => w.includes('Row 4')));
  const [a, b] = parts;
  assert.equal(a.category, 'screw');
  assert.deepEqual([a.spec.head, a.spec.drive, a.spec.d, a.spec.length, a.spec.material], ['socket', 'hex', 4, 12, 'A2']);
  assert.equal(a.torque.value, 1.5);
  assert.deepEqual(a.aliases.map((x) => `${x.type}:${x.code}:${x.source || ''}`), ['customer:K-1:', 'supplier:S-1:Acme', 'supplier:S-1B:Beta']);
  assert.equal(b.category, 'nut');
  assert.equal(b.spec.variant, 'nyloc');
});

test('merge keeps existing codes and adds new ones', () => {
  const lib = { parts: [{ id: 'X-1', category: 'screw', name: 'old', spec: { d: 4 }, aliases: [{ type: 'legacy', code: 'OLD-1' }] }], devices: [] };
  const { parts } = partsFromCSV('id,designation,customer_codes\nX-1,DIN 912 M4x12 A2,K-1\nX-9,ISO 4032 M4 A2,K-9\n');
  const { lib: out, added, updated } = mergeParts(lib, parts);
  assert.equal(added, 1);
  assert.equal(updated, 1);
  const x1 = out.parts.find((p) => p.id === 'X-1');
  assert.deepEqual(x1.aliases.map((a) => a.code).sort(), ['K-1', 'OLD-1']);
  assert.equal(lib.parts[0].aliases.length, 1, 'input library untouched');
});

test('BOM CSV creates a device the audit can check', () => {
  const { parts } = partsFromCSV('id,designation,customer_codes\nX-1,DIN 912 M4x12 A2,K-1\n');
  const { lib } = mergeParts({ parts: [], devices: [] }, parts);
  const { boms } = bomFromCSV('device_id,bom_rev,item,code,qty,where\nDEV-1,A,1,K-1,4,Frame\nDEV-1,A,2,UNKNOWN-9,1,\n');
  const out = validateLibrary(mergeBOM(lib, boms));
  const index = buildIndex(out);
  assert.equal(resolveCode(index, 'K-1').part.id, 'X-1');
  const audit = runAudit(index);
  assert.ok(audit.findings.some((f) => f.check === 'unknown-code' && f.codes.includes('UNKNOWN-9')));
  assert.ok(audit.findings.some((f) => f.check === 'bom-not-in-steps'));
});

test('library validation rejects duplicates', () => {
  assert.throws(() => validateLibrary({ parts: [{ id: 'A' }, { id: 'A' }] }), /twice/);
  assert.throws(() => validateLibrary({}), /parts/);
});
