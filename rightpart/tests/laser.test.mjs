// The fictional Lumen LX-1 laser engraver: the second demo product, built for the 3D guide.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildIndex, resolveCode } from '../js/core/model.js';
import { runAudit } from '../js/core/audit.js';

const lib = JSON.parse(readFileSync(new URL('../data/demo-library.json', import.meta.url), 'utf8'));
const index = buildIndex(lib);
const dev = index.devices.get('LX-1');
const steps = dev.instructions.steps;

test('the laser engraver has its steps, its BOM and a 3D scene for every step', () => {
  assert.equal(steps.length, 10);
  assert.ok(dev.bom.lines.length >= 15);
  const objs = dev.scene.objects;
  for (const s of steps) {
    assert.ok(objs.some((o) => o.step === s.id), `${s.id} has something to show`);
    assert.ok(dev.scene.cameras[s.id], `${s.id} has a camera`);
  }
  for (const o of objs) assert.ok(steps.some((s) => s.id === o.step), `${o.id} belongs to a step`);
  assert.equal(new Set(objs.map((o) => o.id)).size, objs.length, 'object ids are unique');
});

test('every code in the steps, the BOM and the scene is one known part', () => {
  const codes = [
    ...steps.flatMap((s) => s.parts.map((r) => r.code)),
    ...dev.bom.lines.map((l) => l.code),
    ...dev.scene.objects.filter((o) => o.code).map((o) => o.code),
  ];
  for (const c of codes) assert.equal(resolveCode(index, c).status, 'unique', c);
});

test('the scene shows as many screws as the step asks for', () => {
  for (const s of steps) {
    for (const r of s.parts) {
      const shown = dev.scene.objects.filter((o) => o.kind === 'fastener' && o.step === s.id && o.code === r.code);
      if (!shown.length) continue;
      const n = shown.reduce((sum, o) => sum + o.at.length, 0);
      assert.equal(n, r.qty, `${s.id} ${r.code}`);
    }
  }
});

test('torque values come from the part, never made up in the step', () => {
  for (const s of steps) {
    for (const r of s.parts) {
      if (!r.torque) continue;
      const p = resolveCode(index, r.code).part;
      assert.ok(p.torque, `${r.code} has a recorded torque`);
      assert.equal(r.torque.value, p.torque.value, `${s.id} ${r.code}`);
    }
  }
});

test('the integrity check finds nothing critical, and names the M5 look-alikes', () => {
  const audit = runAudit(index);
  const mine = audit.findings.filter((f) => f.deviceId === 'LX-1' || f.parts.some((id) => id.startsWith('840-')));
  assert.ok(!mine.some((f) => f.severity === 'critical'), mine.filter((f) => f.severity === 'critical').map((f) => f.title).join('; '));
  assert.ok(mine.some((f) => f.parts.includes('840-0002') && f.parts.includes('840-0003')), 'M5x8 and M5x10 are look-alikes');
});

test('the demo is fictional', () => {
  assert.equal(lib.meta.demo, true);
  assert.match(dev.name, /LX-1/);
  assert.ok(steps.some((s) => s.warnings?.some((w) => w.level === 'warning' && /glasses/i.test(w.text))), 'laser safety is said');
});
