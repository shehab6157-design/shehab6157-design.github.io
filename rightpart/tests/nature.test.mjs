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
