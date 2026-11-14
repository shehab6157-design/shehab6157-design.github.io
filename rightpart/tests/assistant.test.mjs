// The Ask assistant: answers come from the data, with sources, in several languages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildIndex } from '../js/core/model.js';
import { runAudit } from '../js/core/audit.js';
import { answer, retrieveRecords } from '../js/core/assistant.js';

const lib = JSON.parse(readFileSync(new URL('../data/demo-library.json', import.meta.url), 'utf8'));
const index = buildIndex(lib);
const audit = runAudit(index);
// The demo has two products; these questions are about the Nova-1 console, as if asked on its pages.
const NOVA = { deviceId: 'NOVA-1' };
const ask = (q, ctx = NOVA) => answer(index, audit, q, ctx);

test('which screw for a step warns when the BOM disagrees', () => {
  for (const q of ['Which screw goes in step 7?', 'which screws for the front bezel?', 'איזה בורג בשלב 7?', 'أي برغي في الخطوة 7؟']) {
    const a = ask(q);
    assert.equal(a.intent, 'which', q);
    assert.ok(a.lines.some((l) => l.level === 'bad' && l.text.includes('100-0233')), q);
    assert.ok(a.items.some((i) => i.part.id === '100-0234' && i.flag), q);
    assert.ok(a.items.some((i) => i.part.id === '100-0233' && i.bom), q);
  }
});

test('torque answers never invent a value', () => {
  assert.match(ask('torque for 100-0233?').list[0], /0\.6 N·m/);
  assert.match(ask('torque for 100-0235?').list[0], /no torque value is recorded/);
  assert.match(ask('מה המומנט בשלב 5?').list.join(' '), /1\.2 N·m/);
});

test('codes resolve through every alias, and ambiguous codes stop', () => {
  assert.match(ask('what is C-55013?').text[0], /customer code.*100-0233/);
  const amb = ask('What is DS-103-308?');
  assert.ok(amb.lines[0].text.startsWith('Stop'));
  assert.deepEqual(amb.items.map((i) => i.part.id).sort(), ['100-0233', '100-0238']);
  assert.match(ask('what is SCR-TX-36?').lines[0].text, /old code/);
});

test('steps, next step, why, quantities and problems', () => {
  const how = ask('How do I do step 5?');
  assert.equal(how.intent, 'how');
  assert.equal(how.list[0], 'Fit the first star washer on the earth stud.');
  assert.match(ask('what comes after step 3?').text[0], /step 4: Fit the cooling fan/);
  assert.match(ask('why step 4?').text[0], /backwards/);
  assert.match(ask('how many 100-0234?').list[0], /12 in the steps.*6 in the BOM.*do not agree/);
  assert.ok(ask('problems in step 7').findings.some((f) => f.check === 'likely-substitution'));
  assert.equal(ask('how to fit the fan').context.stepNo, 4);
});

test('page context: "this step" and "this part"', () => {
  assert.equal(ask('which screw here?', { deviceId: 'NOVA-1', stepId: 'S9' }).context.stepNo, 9);
  assert.match(ask('why this?', { partId: '100-0312' }).text[0], /earth ring terminal/);
});

test('sizes and loose parts', () => {
  assert.equal(ask('I found a button head screw M3 10 mm, what is it?').items[0].part.id, '100-0234');
  assert.match(ask('What does ISO 7380 M3x8 A2 mean?').text[0], /Button head screw, hex socket/);
});

test('unknown questions fall back honestly', () => {
  const a = ask('qwerty zzz');
  assert.equal(a.intent, 'fallback');
  assert.equal(a.canAskAI, true);
});

test('records retrieved for the AI carry ids it can cite', () => {
  const recs = retrieveRecords(index, audit, 'Which screw goes in step 7?', NOVA);
  const ids = recs.map((r) => r.id);
  assert.ok(ids.includes('step:NOVA-1/S7'));
  assert.ok(ids.includes('part:100-0234'));
  assert.ok(ids.includes('change:ECO-0142'));
  assert.ok(ids.some((id) => id.startsWith('finding:likely-substitution')));
  assert.ok(recs.length <= 40);
});

test('with two products, a step number alone asks which product, and each choice answers for that product', () => {
  const a = answer(index, audit, 'Which screw goes in step 7?', {});
  assert.equal(a.intent, 'pickDevice');
  assert.equal(a.followUps.length, 2);
  const laser = a.followUps.find((f) => f.includes('LX-1'));
  const b = answer(index, audit, laser, {});
  assert.equal(b.context.deviceId, 'LX-1');
  assert.equal(b.context.stepId, 'S7');
  assert.ok(b.items.some((i) => i.part.id === '840-0003'), 'the M5x10 controller screws');
  const nova = answer(index, audit, a.followUps.find((f) => f.includes('Nova')), {});
  assert.equal(nova.context.deviceId, 'NOVA-1');
  assert.equal(answer(index, audit, 'what is C-55013?', {}).intent !== 'pickDevice', true, 'a code needs no product');
});
