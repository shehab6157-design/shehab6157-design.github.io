// Tests for the features taken from nature: learned mix-ups (immune memory) and the ones that follow.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildIndex } from '../js/core/model.js';
import { mixupsFromRecords, mergeMixups, memoryIndex, mixupsAt, confusedPairs, shareMemory, unsharedCount, countOf } from '../js/core/immune.js';

const lib = JSON.parse(readFileSync(new URL('../data/demo-library.json', import.meta.url), 'utf8'));
const index = buildIndex(lib);

const build = (id, events) => ({ type: 'build', id, deviceId: 'NOVA-1', operator: 'Dana', serial: 'NV1-1', events });
const wrong = (stepId, need, took, at) => ({ result: 'wrong', stepId, partId: need, scanned: took, code: took, at });

test('learned mix-ups: wrong parts stopped at the bench become memories, without names', () => {
  const recs = [
    build('b1', [wrong('S3', '100-0231', '100-0232', 1000), { result: 'ok', stepId: 'S3', partId: '100-0231', scanned: '100-0231', at: 1100 }]),
    build('b2', [wrong('S3', '100-0231', '100-0232', 2000), wrong('S9', '100-0234', '100-0233', 2100)]),
    { type: 'report', id: 'r1', text: 'not a build' },
  ];
  const m = mixupsFromRecords(recs);
  assert.equal(m.length, 2);
  const s3 = m.find((e) => e.stepId === 'S3');
  assert.equal(countOf(s3), 2);
  assert.ok(!JSON.stringify(m).includes('Dana') && !JSON.stringify(m).includes('NV1-1'), 'no operator or serial in the memory');
});

test('learned mix-ups: the same event counts once when shared memory and local memory meet', () => {
  const local = mixupsFromRecords([build('b1', [wrong('S3', '100-0231', '100-0232', 1000)])]);
  const shared = shareMemory(null, local);
  assert.equal(unsharedCount(shared, local), 0);
  const merged = mergeMixups(shared.mixups, local, local);
  assert.equal(countOf(merged[0]), 1);
  const more = mixupsFromRecords([build('b1', [wrong('S3', '100-0231', '100-0232', 1000), wrong('S3', '100-0231', '100-0232', 5000)])]);
  assert.equal(unsharedCount(shared, more), 1);
});

test('learned mix-ups: strongest first, per step and per part, and stale ones dropped', () => {
  const entries = mergeMixups(lib.memory.mixups, [{ deviceId: 'NOVA-1', stepId: 'S99', expected: '100-0231', taken: '100-0232', events: [{ key: 'x', at: 1 }] }]);
  const mem = memoryIndex(entries, index);
  assert.ok(mem.all.every((e) => e.stepId !== 'S99'), 'a step that no longer exists is not shown');
  assert.equal(mem.all[0].stepId, 'S3', 'the most frequent mix-up comes first');
  assert.equal(mixupsAt(mem, 'NOVA-1', 'S3', '100-0231')[0].taken, '100-0232');
  assert.equal(mixupsAt(mem, 'NOVA-1', 'S3', '100-0237').length, 0);
  assert.ok(mem.byPart.get('100-0232').length >= 1, 'the part picked by mistake knows about it too');
  assert.equal(confusedPairs(mem.all).get(['100-0231', '100-0232'].sort().join('|')), 3);
});

import { assignSignals, rivalries, markSVG, markName, COLORS, SHAPES } from '../js/core/signals.js';

test('signal marks: rivals on the same bench differ in colour and in shape', () => {
  const confused = confusedPairs(lib.memory.mixups);
  const { marks, clashes, rivals } = assignSignals(index, { confused });
  assert.equal(clashes.length, 0);
  for (const [id, others] of rivals) {
    for (const o of others.keys()) {
      assert.notEqual(marks.get(id).color, marks.get(o).color, `${id} and ${o} share a colour`);
      assert.notEqual(marks.get(id).shape, marks.get(o).shape, `${id} and ${o} share a shape`);
    }
  }
  assert.ok(rivals.get('100-0233').has('100-0234'), 'M3×8 and M3×10 button heads are rivals');
  assert.ok(rivals.get('100-0231').has('100-0232'), 'a real confusion makes rivals even when one part is not in the device');
  assert.ok(!marks.has('300-2001'), 'a part with no look-alike gets no mark');
  const again = assignSignals(index, { confused });
  assert.deepEqual([...again.marks], [...marks], 'the same library gives the same marks');
});

test('signal marks: locked marks stay as printed and the others move around them', () => {
  const confused = confusedPairs(lib.memory.mixups);
  const { marks } = assignSignals(index, { confused, locked: { '100-0234': { color: 'green', shape: 'diamond' }, '100-0999': { color: 'red', shape: 'star' }, '100-0233': { color: 'nope', shape: 'circle' } } });
  assert.deepEqual(marks.get('100-0234'), { color: 'green', shape: 'diamond', locked: true });
  assert.ok(!marks.has('100-0999'), 'a mark for a part that is not in the library is ignored');
  assert.equal(marks.get('100-0233').locked, false, 'an invalid locked mark is reassigned');
  assert.notEqual(marks.get('100-0233').color, 'green');
  assert.notEqual(marks.get('100-0233').shape, 'diamond');
  const svg = markSVG(marks.get('100-0234'), { size: 30, title: 'green "diamond" <x>' });
  assert.match(svg, /^<svg class="mark"[^>]*data-mark="green-diamond"/);
  assert.ok(!svg.includes('<x>') && svg.includes('&quot;diamond&quot;'));
  assert.equal(markName({ color: 'sky', shape: 'star' }, (s, v) => s.replace('{color}', v.color).replace('{shape}', v.shape)), 'sky blue star');
  assert.equal(COLORS.length * SHAPES.length, 48);
  assert.ok(rivalries(index).size >= 3);
});

import { checkQuorum, normalizeNumbers, codesIn, numbersIn } from '../js/core/quorum.js';
import { runAudit } from '../js/core/audit.js';
import { retrieveRecords } from '../js/core/assistant.js';

test('quorum light: an AI answer is held back when a number or code is not in the records it cites', () => {
  const recs = retrieveRecords(index, runAudit(index), 'which screw goes in step 4 and what torque?', { deviceId: 'NOVA-1', stepId: 'S4' });
  const cite = ['step:NOVA-1/S4'];
  const tq = lib.parts.find((p) => p.id === '100-0237').torque?.value;
  assert.ok(checkQuorum(`Use 4 × 100-0237 (M3 × 25) with 4 lock nuts 100-0311 [step:NOVA-1/S4].${tq ? ` Tighten to ${tq} N·m.` : ''}`, recs, cite, { index }).ok);
  const bad = checkQuorum('Use 4 × 100-0237 [step:NOVA-1/S4]. Tighten to 1.7 N·m.', recs, cite, { index });
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.unsupported, [{ kind: 'number', value: '1.7' }]);
  assert.equal(checkQuorum('Use 100-0238 [step:NOVA-1/S4].', recs, cite, { index }).unsupported[0].value, '100-0238');
  assert.equal(checkQuorum('Use 4 screws.', recs, [], { index }).ok, false, 'an answer with numbers and no citation is held');
  assert.ok(checkQuorum('Ask your supervisor.', recs, [], { index }).ok, 'nothing to check, nothing held');
  assert.ok(checkQuorum('1. Hold the fan.\n2. Fit the screws [step:NOVA-1/S4].', recs, cite, { index }).ok, 'list numbers are not facts');
  assert.ok(checkQuorum('step 4: use the long screws [step:NOVA-1/S4]', recs, cite, { question: 'what goes in step 4?', index }).ok);
  // Another code of a cited part counts (the supplier code of 100-0237, if it has one).
  const alias = (lib.parts.find((p) => p.id === '100-0237').aliases || [])[0]?.code;
  if (alias) assert.ok(checkQuorum(`Bin label ${alias} [step:NOVA-1/S4]`, recs, cite, { index }).ok);
});

test('quorum light: digits from other scripts and decimal commas are read as numbers', () => {
  assert.equal(normalizeNumbers('٠٫٦ و 0,6 و ۴'), '0.6 و 0.6 و 4');
  assert.deepEqual(codesIn('Fit M3 × 8, not M3x10 or #4-40 (100-0233, SCR-TX-36).'), ['M3 × 8', 'M3x10', '#4-40', '100-0233', 'SCR-TX-36']);
  assert.deepEqual(numbersIn('1. Use 4 screws at 0,6 N·m\n2. Done'), [4, 0.6]);
});

import { inWindow, nightWatchState, touchSession, policyOf, DEFAULT_POLICY } from '../js/core/nightwatch.js';

test('night watch: early-morning hours and long stretches of use turn on the second look', () => {
  const at = (h, m = 0) => new Date(2026, 10, 12, h, m).getTime();
  assert.ok(inWindow(2, 2, 6) && inWindow(5.99, 2, 6) && !inWindow(6, 2, 6) && !inWindow(1.5, 2, 6));
  assert.ok(inWindow(23, 22, 6) && inWindow(3, 22, 6) && !inWindow(12, 22, 6), 'a window can cross midnight');
  assert.equal(nightWatchState(at(3, 30), DEFAULT_POLICY, null).reason, 'night');
  assert.equal(nightWatchState(at(14), DEFAULT_POLICY, null).active, false);
  const long = { start: at(3), last: at(13, 50) };
  assert.equal(nightWatchState(at(14), DEFAULT_POLICY, long).reason, 'long');
  assert.equal(nightWatchState(at(14), DEFAULT_POLICY, { start: at(3), last: at(9) }).active, false, 'after a long pause the stretch is over');
  assert.equal(nightWatchState(at(3), { ...DEFAULT_POLICY, enabled: false }, long).active, false);
  assert.deepEqual(policyOf({ policy: { nightWatch: { from: 'x', to: 5, longHours: -1 } } }), { enabled: true, from: 2, to: 5, longHours: 0 });
});

test('night watch: this tablet\'s stretch of use restarts after a pause or with a new operator', () => {
  const s1 = touchSession(null, 1000);
  assert.deepEqual(s1, { start: 1000, last: 1000 });
  const s2 = touchSession(s1, 1000 + 2 * 3.6e6);
  assert.equal(s2.start, 1000);
  assert.equal(touchSession(s2, s2.last + 3 * 3.6e6).start, s2.last + 3 * 3.6e6);
  assert.equal(touchSession(s2, s2.last + 60000, { newOperator: true }).start, s2.last + 60000);
  assert.ok(!('who' in s2), 'no person is stored');
});

import { canonical, hashOf, chamberFor, verifyChambers, sealRecord, verifyRecords } from '../js/core/seal.js';

test('sealed chambers: library versions chain, and changing an old one breaks the chain', async () => {
  assert.equal(canonical({ b: 1, a: [1, { d: undefined, c: 'x' }] }), '{"a":[1,{"c":"x"}],"b":1}');
  assert.equal(await hashOf({ a: 1, b: 2 }), await hashOf({ b: 2, a: 1 }), 'key order does not matter');
  const v1 = await chamberFor(lib, null, { at: 1, note: 'first' });
  const lib2 = { ...lib, meta: { ...lib.meta, updated: '2026-11-12' } };
  const v2 = await chamberFor(lib2, v1, { at: 2 });
  const v3 = await chamberFor(lib, v2, { at: 3, note: 'back to the first' });
  assert.equal(v2.prev, v1.seal);
  assert.equal(v3.hash, v1.hash, 'the same content has the same hash');
  assert.notEqual(v3.seal, v1.seal, 'but a new place in the chain');
  assert.deepEqual(await verifyChambers([v1, v2, v3]), { ok: true, broken: null });
  assert.deepEqual(await verifyChambers([v1, { ...v2, hash: v1.hash }, v3]), { ok: false, broken: 2 });
  assert.equal((await verifyChambers([v1, v3])).broken, 3, 'a version taken out of the middle shows');
});

test('sealed chambers: completed builds are sealed tablet by tablet; edits and gaps show', async () => {
  const rec = (id, at, events) => ({ type: 'build', id, deviceId: 'NOVA-1', serial: id, steps: [{ stepId: 'S1', completedAt: at }], events, completedAt: at, createdAt: at - 1000 });
  const r1 = await sealRecord(rec('b1', 10, [wrong('S3', '100-0231', '100-0232', 5)]), null, 'tab-A');
  const r2 = await sealRecord(rec('b2', 20, []), r1, 'tab-A');
  const r3 = await sealRecord(rec('b3', 30, []), r2, 'tab-A');
  const other = await sealRecord(rec('x1', 15, []), null, 'tab-B');
  const good = await verifyRecords([r3, other, r1, r2, { ...rec('open', 40, []), completedAt: undefined }]);
  assert.deepEqual(good, { ok: true, sealed: 4, chains: 2, problems: [] });
  assert.ok((await verifyRecords([{ ...r1, synced: true, via: 'light' }, r2, r3])).ok, 'syncing does not count as a change');
  const edited = { ...r1, events: [] }; // someone removes the wrong part from the record
  assert.deepEqual((await verifyRecords([edited, r2, r3])).problems, [{ id: 'b1', why: 'changed' }]);
  assert.deepEqual((await verifyRecords([r1, r3])).problems, [{ id: 'b3', why: 'missing' }]);
  assert.ok((await verifyRecords([r2, r3])).ok, 'a chain may start later, after records were cleared on purpose');
});

import { depositsFrom, trails, libraryDeposits, WEIGHTS } from '../js/core/trails.js';

test('floor trails: marks from wrong parts, overrides, reports and long pauses, fading by half', () => {
  const DAY = 864e5, now = Date.UTC(2026, 10, 12);
  const step = (id, done) => ({ stepId: id, completedAt: done });
  const b = (id, start, extra = {}) => ({ type: 'build', id, deviceId: 'NOVA-1', operator: 'Dana', instructionsRev: 'B', createdAt: start, events: [], steps: [], ...extra });
  const recs = [
    b('b1', now - 10 * DAY, { events: [wrong('S3', '100-0231', '100-0232', now - 10 * DAY)], steps: [step('S1', now - 10 * DAY + 60e3), step('S2', now - 10 * DAY + 120e3)] }),
    b('b2', now - 2 * DAY, { events: [{ result: 'override', ref: -1, who: 'Sam', why: 'ok', stepId: 'S7', at: now - 2 * DAY }], steps: [step('S1', now - 2 * DAY + 60e3), step('S2', now - 2 * DAY + 600e3)] }),
    b('b3', now - DAY, { steps: [step('S1', now - DAY + 70e3), step('S2', now - DAY + 130e3)] }),
    b('b4', now - DAY, { steps: [step('S1', now - DAY + 65e3), step('S2', now - DAY + 125e3)] }),
    { type: 'report', id: 'r1', deviceId: 'NOVA-1', stepId: 'S7', createdAt: now - 3 * DAY, who: 'Sam', text: 'bezel screws?' },
  ];
  const deps = depositsFrom(recs);
  assert.deepEqual(deps.map((d) => `${d.stepId}:${d.kind}`).sort(), ['S2:slow', 'S3:wrong', 'S7:override', 'S7:report']);
  assert.ok(!JSON.stringify(deps).match(/Dana|Sam|bezel/), 'no names and no words in the marks');
  const dev = trails(deps, { now }).get('NOVA-1');
  assert.ok(dev.visible);
  const s3 = dev.steps.get('S3');
  assert.ok(Math.abs(s3.strength - WEIGHTS.wrong * 2 ** (-10 / 14)) < 0.01, 'a 10-day-old mark has faded by 2^(-10/14)');
  assert.equal(dev.steps.get('S7').state, 'fresh');
  assert.equal(trails(deps, { now: now + 60 * DAY }).get('NOVA-1').steps.get('S7').state, 'fading');
  assert.equal(trails(deps.filter((d) => d.from === 'b1'), { now }).get('NOVA-1').visible, false, 'one build alone is not shown');
  const ex = libraryDeposits(lib, now);
  assert.ok(ex.length > 5 && ex.every((d) => d.example && d.at < now));
  assert.equal(libraryDeposits({ ...lib, meta: { ...lib.meta, demo: false } }, now).length, 0, 'only a demo library carries example marks');
});
