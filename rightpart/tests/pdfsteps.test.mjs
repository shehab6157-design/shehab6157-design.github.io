// Drafting steps from the text of a PDF work instruction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildIndex } from '../js/core/model.js';
import { runAudit } from '../js/core/audit.js';
import { linesFromItems, findCodes, draftSteps, applyDraft, QTY_NOTE } from '../js/core/pdfsteps.js';

const lib = JSON.parse(readFileSync(new URL('../data/demo-library.json', import.meta.url), 'utf8'));
const index = buildIndex(lib);

const HEADER = 'FICTIONAL DEMO DOCUMENT · NOT A REAL WORK INSTRUCTION';
const footer = (n) => `WI-NV1-FAN-001 Rev A · Page ${n} of 2`;
const pages = [
  { page: 1, lines: [
    HEADER,
    'Work Instruction: Fan tray sub-assembly',
    'Product: Nova-1 fan tray',
    'Document: WI-NV1-FAN-001 Revision: A Date: 2026-10-12',
    'CAUTION: ESD sensitive. Wear a grounded wrist strap for all steps.',
    'Item Part number Description Qty',
    '1 C-61003 Fan 60 x 60 x 15 mm, 24 V 1',
    '5 100-0999 Fan finger guard 60 mm 1',
    'Step 1: Prepare the fan',
    'Tools: ESD mat, side cutter',
    '1. Take the fan (C-61003) from its bag.',
    'Check: The airflow arrow points into the chassis.',
    'Step 2: Fit the finger guard',
    'Place the finger guard 100-0999 x1 on the outlet side of the fan.',
    'NOTE: The open side of the guard faces away from the fan.',
    'Step 3: Fasten the fan to the bracket',
    'Tools: PH1 screwdriver; torque driver',
    'Fit 4 x AF-7045-M3-25-A2 through the guard, the fan and the bracket.',
    'Fit a nylon washer 100-0313 x4 under each nut.',
    'Fit 4 x 100-0311 lock nuts and tighten to 0.5 N·m.',
    'WARNING: Do not overtighten: the fan housing cracks above 0.6 N·m.',
    footer(1),
  ] },
  { page: 2, lines: [
    HEADER,
    'Step 4: Earth the bracket',
    'Fit the earth wire C-62002 x1 with 1 x SCR-TX-36 and tighten to 0.8 N·m.',
    'Verify the ring terminal does not turn.',
    'Step 5: Dress the cable',
    'Secure the fan cable with 2 x C-62003.',
    footer(2),
  ] },
];

test('lines from PDF text items: same baseline joined, gaps become spaces', () => {
  const items = [
    { str: 'Step 1:', transform: [10, 0, 0, 10, 50, 700], width: 34 },
    { str: 'Fit', transform: [10, 0, 0, 10, 88, 700], width: 14 },
    { str: '100-0233', transform: [10, 0, 0, 10, 106, 700], width: 40, hasEOL: true },
    { str: 'x4', transform: [10, 0, 0, 10, 50, 686], width: 10 },
    { type: 'beginMarkedContent' },
    { str: 'next line', transform: [10, 0, 0, 10, 50, 660], width: 40 },
  ];
  assert.deepEqual(linesFromItems(items), ['Step 1: Fit 100-0233', 'x4', 'next line']);
});

test('codes in a line: any alias, quantities written in many ways, unknown part numbers', () => {
  const a = findCodes(index, 'Fit 4 x C-55013 and 100-0313 x2, then 2 screws AF-7045-M3-6-A2 and 100-0999 (3)');
  assert.deepEqual(a.refs.map((r) => [r.partId, r.qty, r.qtyStated]), [['100-0233', 4, true], ['100-0313', 2, true], ['100-0231', 2, true]]);
  assert.deepEqual(a.unknown.map((u) => [u.code, u.qty, u.qtyStated]), [['100-0999', 3, true]]);
  const b = findCodes(index, 'Fit the ISO 7380-1 M3x8 A2 screws (6) to 0.6 N·m');
  assert.equal(b.refs[0].partId, '100-0233');
  assert.equal(b.refs[0].qty, 6);
  assert.deepEqual(b.refs[0].torque, { value: 0.6, unit: 'N·m' });
  const c = findCodes(index, 'Document 2026-10-12, ECO-0142, ISO 7380 page 1450-22');
  assert.deepEqual(c.unknown.map((u) => u.code), ['1450-22']);
  const legacy = findCodes(index, 'one SCR-TX-36');
  assert.equal(legacy.refs[0].partId, '100-0236');
  assert.equal(legacy.refs[0].legacy, true);
  assert.equal(legacy.refs[0].qty, 1);
});

test('draft: steps, parts, tools, warnings, checks, torque and ESD from a work instruction', () => {
  const d = draftSteps(pages, index, { file: 'WI-NV1-FAN-001.pdf' });
  assert.equal(d.meta.product, 'Nova-1 fan tray');
  assert.equal(d.meta.docNo, 'WI-NV1-FAN-001');
  assert.equal(d.meta.rev, 'A');
  assert.equal(d.meta.title, 'Work Instruction: Fan tray sub-assembly');
  assert.equal(d.steps.length, 5);
  assert.deepEqual(d.steps.map((s) => s.title), ['Prepare the fan', 'Fit the finger guard', 'Fasten the fan to the bracket', 'Earth the bracket', 'Dress the cable']);
  assert.ok(d.steps.every((s) => s.draft && s.esd), 'drafts, ESD from the general caution');
  assert.deepEqual(d.steps.map((s) => s.source.page), [1, 1, 1, 2, 2]);

  const [s1, s2, s3, s4, s5] = d.steps;
  assert.deepEqual(s1.tools, ['ESD mat', 'side cutter']);
  assert.deepEqual(s1.parts, [{ code: 'C-61003', qty: 1, note: QTY_NOTE }]);
  assert.deepEqual(s1.checks, ['The airflow arrow points into the chassis.']);
  assert.deepEqual(s1.instructions, ['Take the fan (C-61003) from its bag.'], 'list number removed');

  assert.deepEqual(s2.parts, [{ code: '100-0999', qty: 1 }], 'unknown code with a quantity is kept, so the check flags it');
  assert.deepEqual(s2.warnings, [{ level: 'notice', text: 'The open side of the guard faces away from the fan.' }]);

  assert.deepEqual(s3.tools, ['PH1 screwdriver', 'torque driver']);
  assert.deepEqual(s3.parts, [
    { code: 'AF-7045-M3-25-A2', qty: 4 },
    { code: '100-0313', qty: 4 },
    { code: '100-0311', qty: 4, torque: { value: 0.5, unit: 'N·m' } },
  ], 'torque goes to the part on its own line, not to the others');
  assert.equal(s3.warnings[0].level, 'warning');

  assert.deepEqual(s4.parts, [{ code: 'C-62002', qty: 1 }, { code: 'SCR-TX-36', qty: 1, torque: { value: 0.8, unit: 'N·m' } }]);
  assert.deepEqual(s4.checks, ['Verify the ring terminal does not turn.']);
  assert.deepEqual(s5.parts, [{ code: 'C-62003', qty: 2 }]);

  assert.deepEqual(d.unknownCodes.map((u) => [u.code, u.pages]), [['100-0999', [1]]]);
  assert.equal(d.stats.qtyMissing, 1);
  assert.ok(d.steps.every((s) => !s.instructions.some((l) => /FICTIONAL|Page \d/.test(l))), 'headers and footers removed');
});

test('applying a draft: new device, then the check flags drafts, the old code, the unknown code and the missing BOM', () => {
  const d = draftSteps(pages, index, { file: 'WI-NV1-FAN-001.pdf' });
  const out = applyDraft(lib, d, { deviceId: 'NOVA-1-FAN', deviceName: 'Nova-1 fan tray', rev: 'A' });
  assert.equal(lib.devices.length, 1, 'original untouched');
  const dev = out.devices.find((x) => x.id === 'NOVA-1-FAN');
  assert.equal(dev.instructions.steps.length, 5);
  const audit = runAudit(buildIndex(out));
  const mine = audit.findings.filter((f) => f.deviceId === 'NOVA-1-FAN');
  const checks = new Set(mine.map((f) => f.check));
  for (const c of ['draft-steps', 'no-bom', 'legacy-code', 'unknown-code']) assert.ok(checks.has(c), c);
  assert.ok(!checks.has('steps-not-in-bom'), 'no flood of "not in the BOM" when there is no BOM at all');
  const draft = mine.find((f) => f.check === 'draft-steps');
  assert.equal(draft.steps.length, 5);
  assert.equal(audit.byStep.get('NOVA-1-FAN/S3').some((f) => f.check === 'draft-steps'), true);
});

test('numbered lists, tables of contents and documents without step numbers', () => {
  const numbered = draftSteps([{ page: 1, lines: [
    'Assembly: Bracket', '1. Fit the bracket', 'a) Hold it square', '2. Fit 2 x 100-0310', '1. sub item that is not a step', '3. Check the bracket',
  ] }], index);
  assert.deepEqual(numbered.steps.map((s) => s.title), ['Fit the bracket', 'Fit 2 x 100-0310', 'Check the bracket']);
  assert.ok(numbered.steps[1].instructions.includes('sub item that is not a step'));

  const toc = draftSteps([{ page: 1, lines: ['Contents', 'Step 1 Prepare ........ 2', 'Step 2 Fit ........ 3'] }, { page: 2, lines: ['Step 1: Prepare', 'Clean the base.', 'Step 2: Fit', 'Fit 2 x 100-0310.'] }], index);
  assert.equal(toc.steps.length, 2);
  assert.deepEqual(toc.steps[1].parts, [{ code: '100-0310', qty: 2 }]);

  const none = draftSteps([{ page: 1, lines: ['Clean the base.'] }, { page: 2, lines: ['Fit 2 x 100-0310.'] }], index);
  assert.equal(none.steps.length, 2);
  assert.match(none.warnings[0], /No step numbers/);
});

test('Hebrew and Arabic headings, labels and warnings', () => {
  const he = draftSteps([{ page: 1, lines: [
    'שלב 1: הרכבת התומכות', 'כלים: מפתח 5.5', 'הברג 4 x C-55030 בבסיס', 'זהירות: לא להדק יותר מדי', 'שלב 2: חיבור הספק', 'חלקים: 300-2002, 100-0236 x4',
  ] }], index);
  assert.equal(he.steps.length, 2);
  assert.deepEqual(he.steps[0].tools, ['מפתח 5.5']);
  assert.deepEqual(he.steps[0].parts, [{ code: 'C-55030', qty: 4 }]);
  assert.deepEqual(he.steps[0].warnings, [{ level: 'caution', text: 'לא להדק יותר מדי' }]);
  assert.deepEqual(he.steps[1].parts, [{ code: '300-2002', qty: 1, note: QTY_NOTE }, { code: '100-0236', qty: 4 }]);
  const ar = draftSteps([{ page: 1, lines: ['خطوة 1: تركيب اللوحة', 'تحذير: افصل الكهرباء', 'خطوة 2: إغلاق الغطاء'] }], index);
  assert.equal(ar.steps.length, 2);
  assert.equal(ar.steps[0].warnings[0].level, 'warning');
});

test('Ask says when a step is an unreviewed draft', async () => {
  const { answer } = await import('../js/core/assistant.js');
  const d = draftSteps(pages, index, { file: 'WI-NV1-FAN-001.pdf' });
  const out = applyDraft(lib, d, { deviceId: 'NOVA-1-FAN', deviceName: 'Nova-1 fan tray', rev: 'A' });
  const idx = buildIndex(out);
  const a = answer(idx, runAudit(idx), 'which screw goes in step 3?', { deviceId: 'NOVA-1-FAN' });
  assert.equal(a.intent, 'which');
  assert.match(a.lines[0].text, /draft read from WI-NV1-FAN-001\.pdf, page 1/);
  assert.ok(a.items.some((it) => it.part?.id === '100-0237'), 'the screw from the PDF, by its supplier code');
  const reviewed = structuredClone(out);
  delete reviewed.devices.find((x) => x.id === 'NOVA-1-FAN').instructions.steps[2].draft;
  const idx2 = buildIndex(reviewed);
  const b = answer(idx2, runAudit(idx2), 'which screw goes in step 3?', { deviceId: 'NOVA-1-FAN' });
  assert.ok(!b.lines.some((l) => /draft/.test(l.text)));
});

test('Russian headings and labels, inch-pound torques', () => {
  const ru = draftSteps([{ page: 1, lines: ['Шаг 1: Установка стоек', 'Инструменты: ключ 5,5', 'Установите 4 x C-55030', 'Внимание: не перетягивать', 'Шаг 2: Крышка', 'Проверка: крышка лежит ровно'] }], index);
  assert.equal(ru.steps.length, 2);
  assert.deepEqual(ru.steps[0].tools, ['ключ 5,5'], 'a decimal comma does not split a tool');
  assert.deepEqual(ru.steps[0].parts, [{ code: 'C-55030', qty: 4 }]);
  assert.equal(ru.steps[0].warnings[0].level, 'warning');
  assert.deepEqual(ru.steps[1].checks, ['крышка лежит ровно']);
  const inlb = findCodes(index, 'Fit 2 x 100-0310 and torque to 12 in-lb');
  assert.deepEqual(inlb.refs[0].torque, { value: 12, unit: 'in·lb' });
});
