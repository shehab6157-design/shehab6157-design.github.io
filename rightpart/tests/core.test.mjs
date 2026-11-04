// Unit tests for the pure logic. Run from the rightpart folder:  node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeDesignation, decodedSpec } from '../js/core/decode.js';
import { buildIndex, resolveCode, search, normCode } from '../js/core/model.js';
import { compareParts, findLookalikes } from '../js/core/lookalike.js';
import { runAudit } from '../js/core/audit.js';
import { encode128B, CODE128_PATTERNS } from '../js/core/code128.js';
import { parseCSV, parseCSVObjects, toCSV } from '../js/core/csv.js';

const lib = JSON.parse(readFileSync(new URL('../data/demo-library.json', import.meta.url), 'utf8'));
const index = buildIndex(lib);

test('decodes metric designations', () => {
  const d = decodedSpec(decodeDesignation('ISO 7380 M3x8 A2'));
  assert.deepEqual(d, { category: 'screw', head: 'button', drive: 'hex', d: 3, system: 'metric', length: 8, material: 'A2' });
  const p = decodedSpec(decodeDesignation('ISO 7045 M3 x 6 - Z - 4.8 zinc'));
  assert.equal(p.drive, 'pozidriv');
  assert.equal(decodeDesignation('M8x1.25x20').thread.pitch, 1.25);
  assert.equal(decodeDesignation('M8x1.25x20').length, 20);
  assert.equal(decodeDesignation('M2,5x5').thread.d, 2.5);
});

test('decodes inch designations and abbreviations', () => {
  const d = decodeDesignation('#4-40 x 1/4 PPH zinc');
  assert.equal(d.thread.system, 'unified');
  assert.equal(d.thread.pitch, 0.635);
  assert.equal(d.length, 6.35);
  assert.equal(d.head, 'pan');
  assert.equal(decodeDesignation('6-32 x 3/8" BHCS').head, 'button');
});

test('does not read plain part numbers as sizes', () => {
  assert.equal(decodeDesignation('100-0233'), null);
  assert.equal(decodeDesignation('WR-0738-308'), null);
});

test('finds a standard number hidden in a supplier code', () => {
  const d = decodeDesignation('AF-7045-M3-6-A2');
  assert.equal(d.standard.code, 'ISO 7045');
  assert.equal(d.standard.guessed, true);
});

test('codes are separator- and case-insensitive', () => {
  assert.equal(normCode(' 100-0233 '), normCode('1000233'));
  assert.equal(resolveCode(index, 'af7380m38a2').part.id, '100-0233');
  assert.equal(resolveCode(index, 'C-55013').part.id, '100-0233');
});

test('reports ambiguous and legacy codes', () => {
  const r = resolveCode(index, 'DS-103-308');
  assert.equal(r.status, 'ambiguous');
  assert.deepEqual(r.matches.map((m) => m.part.id).sort(), ['100-0233', '100-0238']);
  assert.equal(resolveCode(index, 'SCR-TX-36').legacy, true);
  assert.equal(resolveCode(index, 'NOPE-1').status, 'unknown');
});

test('search ranks exact codes first and suggests near codes', () => {
  assert.equal(search(index, '100-0233').results[0].part.id, '100-0233');
  const s = search(index, 'ISO 7380 M3x8');
  assert.equal(s.results[0].part.id, '100-0233');
  const f = search(index, '100-0283');
  assert.ok(f.results.some((r) => r.reasons.some((x) => x.kind === 'fuzzy')));
});

test('look-alikes: length, drive and inch thread', () => {
  const P = (id) => index.parts.get(id);
  assert.ok(compareParts(P('100-0233'), P('100-0234')).score >= 0.85);
  assert.ok(compareParts(P('100-0231'), P('100-0232')).score >= 0.6);
  assert.ok(compareParts(P('100-0231'), P('100-0239')).score >= 0.6);
  assert.equal(compareParts(P('100-0233'), P('300-2001')).score, 0);
  const dup = findLookalikes(index.partList, P('100-0235')).find((l) => l.part.id === '100-0240');
  assert.ok(dup && dup.duplicate);
});

test('audit finds the planted mistakes', () => {
  const a = runAudit(index);
  const checks = a.findings.map((f) => f.check);
  const sub = a.findings.find((f) => f.check === 'likely-substitution');
  assert.ok(sub, 'substitution found');
  assert.deepEqual(sub.steps.map((s) => s.stepId), ['S7']);
  assert.deepEqual(sub.parts, ['100-0233', '100-0234']);
  for (const c of ['code-collision', 'rev-mismatch', 'legacy-code', 'spec-conflict', 'duplicate-part', 'missing-torque']) assert.ok(checks.includes(c), c);
  assert.equal(a.counts.critical, 2);
});

test('audit is clean once step 7 is corrected', () => {
  const fixed = structuredClone(lib);
  const s7 = fixed.devices[0].instructions.steps.find((s) => s.id === 'S7');
  s7.parts.find((p) => p.code === '100-0234').code = '100-0233';
  const a = runAudit(buildIndex(fixed));
  assert.ok(!a.findings.some((f) => f.check === 'likely-substitution' || f.check === 'bom-qty'));
});

test('Code 128 table and checksum', () => {
  assert.equal(CODE128_PATTERNS.length, 107);
  CODE128_PATTERNS.slice(0, 106).forEach((p) => assert.equal([...p].reduce((a, b) => a + +b, 0), 11));
  // Start B (104) + P 48×1 + J 42×2 + J 42×3 + 1 17×4 + 2 18×5 + 3 19×6 + C 35×7 = 879; 879 mod 103 = 55
  const v = encode128B('PJJ123C');
  assert.equal(v[0], 104);
  assert.equal(v[v.length - 2], 55);
  assert.equal(v[v.length - 1], 106);
});

test('CSV round trip with quotes and semicolons', () => {
  const rows = [['id', 'name'], ['100-0233', 'Screw "button", M3']];
  assert.deepEqual(parseCSV(toCSV(rows)), rows);
  assert.deepEqual(parseCSVObjects('id;qty\n100-0233;6\n'), [{ id: '100-0233', qty: '6' }]);
});
