// Integrity check: compares the part library, the BOM and the work instructions,
// and reports the kind of mismatch that lets a wrong part be fitted for years.
// Pure functions, no DOM.

import { resolveCode, normCode, qtyNumber, CODE_TYPES } from './model.js';
import { compareParts, shortDifference, LOOKALIKE_MIN } from './lookalike.js';
import { decodeDesignation, decodedSpec, summarizeDecoded } from './decode.js';
import { isFastener, HEADS, DRIVES, sizeLabel, CATEGORY_LABELS } from './dims.js';

export const CHECKS = {
  'likely-substitution': { label: 'Probably the wrong part in a step', why: 'A step fits more of one part and fewer of its look-alike than the BOM asks for. This is exactly how a wrong screw can be fitted for years without anyone noticing.' },
  'code-collision': { label: 'One code points to several parts', why: 'Whoever reads that code on a bin, BOM or drawing can pick either part and believe it is right.' },
  'unknown-code': { label: 'Code not found in the library', why: 'Nobody can check a part that the library does not know.' },
  'obsolete-part': { label: 'Retired part still in use', why: 'A retired part may be out of stock, superseded for a reason, or no longer approved.' },
  'steps-not-in-bom': { label: 'Fitted in a step, missing from the BOM', why: 'The instructions fit something the official parts list does not include.' },
  'bom-not-in-steps': { label: 'In the BOM, never fitted in a step', why: 'Either the part is forgotten during assembly or the instructions use something else in its place.' },
  'bom-qty': { label: 'Quantity differs from the BOM', why: 'Leftover or missing parts at the end of a build point to a mistake somewhere.' },
  'rev-mismatch': { label: 'Instructions and BOM are on different revisions', why: 'Changes made to the BOM (ECOs) may never have reached the people who build the device.' },
  'legacy-code': { label: 'Document still uses an old code', why: 'Old codes keep working only as long as somebody remembers them.' },
  'spec-conflict': { label: 'A code says one size, the spec says another', why: 'A code that spells out a size (like M3-12) but points to a different size misleads anyone who reads it.' },
  'duplicate-part': { label: 'Two records for the same part', why: 'Two codes for one physical part split the stock and confuse people. It is how mix-ups start.' },
  'lookalike-in-device': { label: 'Look-alike parts in the same device', why: 'Similar parts on the same bench are the most common cause of mix-ups.' },
  'missing-torque': { label: 'No torque value for a fastener', why: 'Without a torque value each person tightens by feel: too loose shakes out, too tight strips or cracks.' },
  'missing-details': { label: 'No explanation for learners', why: 'New people learn faster and make fewer mistakes when they know what a part does and why.' },
};

const SEV_RANK = { critical: 0, warning: 1, info: 2 };

function revAfter(a, b) {
  // true when revision a comes after revision b (A < B < ... < Z, AA...; or numbers)
  const n = (r) => (/^\d+$/.test(r) ? parseInt(r, 10) : String(r).toUpperCase().split('').reduce((acc, ch) => acc * 27 + (ch.charCodeAt(0) - 64), 0));
  return n(a) > n(b);
}

export function runAudit(index) {
  const findings = [];
  const add = (f) => {
    f.parts = [...new Set(f.parts || [])];
    f.steps = f.steps || [];
    f.id = [f.check, f.deviceId || '', f.parts.join(','), f.steps.map((s) => s.stepId).join(','), (f.codes || []).join(',')].join('|');
    if (!findings.some((x) => x.id === f.id)) findings.push(f);
  };
  const P = (id) => index.parts.get(id);
  const label = (p) => `${p.id} (${p.name})`;

  // 1. One code, several parts
  for (const [norm, entries] of index.byCode) {
    const real = entries.filter((e) => e.alias.type !== 'designation');
    const ids = [...new Set(real.map((e) => e.partId))];
    if (ids.length < 2) continue;
    const code = real[0].alias.code;
    const where = ids.map((id) => {
      const e = real.find((x) => x.partId === id);
      return `${label(P(id))} as ${CODE_TYPES[e.alias.type]?.toLowerCase() || e.alias.type}${e.alias.source ? ` from ${e.alias.source}` : ''}`;
    });
    const steps = [];
    for (const dev of index.lib.devices || []) (dev.instructions?.steps || []).forEach((s, i) => { if ((s.parts || []).some((r) => normCode(r.code) === norm)) steps.push({ deviceId: dev.id, stepId: s.id, stepNo: i + 1 }); });
    add({
      check: 'code-collision', severity: 'critical', parts: ids, codes: [code], steps,
      title: `Code ${code} points to ${ids.length} different parts`,
      detail: `The code is recorded for ${where.join(' and for ')}.${steps.length ? ` It is used in ${steps.map((s) => 'step ' + s.stepNo).join(', ')}.` : ''}`,
      suggestion: 'Find out which part this code really is (ask the supplier or purchasing), fix the wrong record, and relabel any bin that carries it.',
    });
  }

  // 2. Per device: references, quantities, substitutions, revisions
  for (const dev of index.lib.devices || []) {
    const steps = dev.instructions?.steps || [];
    const bomLines = dev.bom?.lines || [];
    const stepQty = new Map();
    const bomQty = new Map();
    const tally = (map, id, qty, extra) => {
      const e = map.get(id) || { qty: 0, asRequired: false, refs: [] };
      const n = qtyNumber(qty);
      if (n == null) e.asRequired = true; else e.qty += n;
      e.refs.push(extra);
      map.set(id, e);
    };

    steps.forEach((step, i) => {
      for (const ref of step.parts || []) {
        const r = resolveCode(index, ref.code);
        const at = { deviceId: dev.id, stepId: step.id, stepNo: i + 1 };
        if (r.status === 'unknown') {
          add({ check: 'unknown-code', severity: 'critical', deviceId: dev.id, codes: [ref.code], steps: [at], title: `Step ${i + 1} uses code ${ref.code}, which is not in the library`, detail: `"${step.title}" lists ${ref.qty} × ${ref.code}.`, suggestion: 'Add the part to the library with all its codes, or correct the code in the instructions.' });
          continue;
        }
        if (r.status === 'ambiguous') continue; // reported by check 1
        tally(stepQty, r.part.id, ref.qty, { ...at, qty: ref.qty, code: ref.code });
        if (r.legacy) add({ check: 'legacy-code', severity: 'warning', deviceId: dev.id, parts: [r.part.id], codes: [ref.code], steps: [at], title: `Step ${i + 1} still uses the old code ${ref.code}`, detail: `${ref.code} is a retired code for ${label(r.part)}. It still resolves today, but only because somebody kept the old code on record.`, suggestion: `Update the instructions to ${r.part.id}.` });
        if (r.part.status === 'obsolete') add({ check: 'obsolete-part', severity: 'critical', deviceId: dev.id, parts: [r.part.id], steps: [at], title: `Step ${i + 1} fits a retired part: ${r.part.id}`, detail: `${label(r.part)} is marked obsolete${r.part.replacedBy ? `, replaced by ${r.part.replacedBy}` : ''}.`, suggestion: r.part.replacedBy ? `Fit ${r.part.replacedBy} instead and update the instructions.` : 'Ask engineering for the approved replacement.' });
        const jointHasTorque = (step.parts || []).some((o) => { const q = resolveCode(index, o.code).part; return q && isFastener(q) && (o.torque || q.torque); });
        const needsOwn = r.part.category === 'screw' || r.part.category === 'standoff' || (r.part.category === 'nut' && !jointHasTorque);
        if (needsOwn && qtyNumber(ref.qty) != null && !(ref.torque || r.part.torque)) {
          add({ check: 'missing-torque', severity: 'warning', deviceId: dev.id, parts: [r.part.id], steps: [at], title: `No torque value for ${r.part.name} in step ${i + 1}`, detail: `Step ${i + 1} ("${step.title}") fits ${ref.qty} × ${r.part.id} without a torque value.`, suggestion: 'Ask engineering for the torque and add it to the part or the step.' });
        }
      }
    });

    for (const line of bomLines) {
      const r = resolveCode(index, line.code);
      if (r.status === 'unknown') { add({ check: 'unknown-code', severity: 'critical', deviceId: dev.id, codes: [line.code], title: `BOM item ${line.item} uses code ${line.code}, which is not in the library`, detail: `BOM rev ${dev.bom.rev}, item ${line.item}: ${line.qty} × ${line.code}${line.where ? ` (${line.where})` : ''}.`, suggestion: 'Add the part with its codes to the library.' }); continue; }
      if (r.status === 'ambiguous') continue;
      tally(bomQty, r.part.id, line.qty, { item: line.item, qty: line.qty, code: line.code, where: line.where });
      if (r.part.status === 'obsolete') add({ check: 'obsolete-part', severity: 'critical', deviceId: dev.id, parts: [r.part.id], title: `BOM item ${line.item} is a retired part: ${r.part.id}`, detail: `${label(r.part)} is marked obsolete${r.part.replacedBy ? `, replaced by ${r.part.replacedBy}` : ''}.`, suggestion: 'Update the BOM through a change order.' });
    }

    // Substitutions: a step fits more of X and fewer of its look-alike Y than the BOM.
    const ids = new Set([...stepQty.keys(), ...bomQty.keys()]);
    const delta = new Map();
    for (const id of ids) {
      const s = stepQty.get(id), b = bomQty.get(id);
      if ((s && s.asRequired) || (b && b.asRequired)) continue;
      const d = (s?.qty || 0) - (b?.qty || 0);
      if (d) delta.set(id, d);
    }
    const explained = new Set();
    for (const [over, dOver] of delta) {
      if (dOver <= 0) continue;
      for (const [under, dUnder] of delta) {
        if (dUnder >= 0 || explained.has(under) || dOver !== -dUnder) continue;
        const po = P(over), pu = P(under);
        const cmp = compareParts(pu, po);
        if (cmp.score < LOOKALIKE_MIN) continue;
        const sRefs = (stepQty.get(over)?.refs || []);
        const bLine = (bomQty.get(under)?.refs || [])[0];
        const oLine = (bomQty.get(over)?.refs || [])[0];
        let cands = sRefs.filter((r) => qtyNumber(r.qty) === dOver);
        if (cands.length > 1 && bLine?.where) {
          // Several steps fit the same quantity: pick the one whose title names the BOM position.
          const words = bLine.where.toLowerCase().split(/\W+/).filter((w) => w.length >= 4);
          const scored = cands.map((r) => { const st = steps.find((x) => x.id === r.stepId); const t = `${st?.title} ${st?.summary}`.toLowerCase(); return { r, n: words.filter((w) => t.includes(w)).length }; });
          const best = Math.max(...scored.map((x) => x.n));
          if (best > 0 && scored.filter((x) => x.n === best).length === 1) cands = [scored.find((x) => x.n === best).r];
        }
        const at = (cands.length ? cands : sRefs).map((r) => ({ deviceId: dev.id, stepId: r.stepId, stepNo: r.stepNo }));
        const later = (dev.changes || []).filter((c) => dev.instructions?.rev && revAfter(c.rev, dev.instructions.rev));
        const eco = later.find((c) => (c.parts || []).map(normCode).includes(normCode(over)) || (c.parts || []).map(normCode).includes(normCode(under)));
        const one = at.length === 1;
        const kind = (CATEGORY_LABELS[pu.category] || 'part').toLowerCase();
        const sz = (p) => (sizeLabel(p) ? ` (${sizeLabel(p)})` : '');
        add({
          check: 'likely-substitution', severity: 'critical', deviceId: dev.id, parts: [under, over], steps: at,
          title: `${one ? `Step ${at[0].stepNo} probably fits` : 'The instructions probably fit'} the wrong ${kind}: ${po.id}${sz(po)} where the BOM asks for ${pu.id}${sz(pu)}`,
          detail: `BOM rev ${dev.bom?.rev || '?'} lists ${bomQty.get(under)?.qty || 0} × ${pu.id}${bLine?.where ? ` for the ${bLine.where.toLowerCase()}` : ''} and ${bomQty.get(over)?.qty || 0} × ${po.id}${oLine?.where ? ` for the ${oLine.where.toLowerCase()}` : ''}. The instructions (rev ${dev.instructions?.rev || '?'}) fit ${stepQty.get(under)?.qty || 0} × ${pu.id} and ${stepQty.get(over)?.qty || 0} × ${po.id}.${one ? ` Step ${at[0].stepNo} ("${steps.find((x) => x.id === at[0].stepId)?.title}") fits exactly the ${dOver} that are missing.` : ''} The difference is easy to miss: ${po.id} is ${shortDifference(pu, po)}.${eco ? ` Change ${eco.eco} (rev ${eco.rev}, ${eco.date}): "${eco.text}" That change never reached the instructions.` : ''}`,
          suggestion: `Stop and confirm with engineering. If the BOM is right, correct ${one ? `step ${at[0].stepNo}` : 'the instructions'} to ${pu.id}, check what is in the bins, and review the devices already built (quality may open a nonconformance).`,
        });
        explained.add(over); explained.add(under);
        break;
      }
    }

    for (const id of ids) {
      if (explained.has(id)) continue;
      const s = stepQty.get(id), b = bomQty.get(id), p = P(id);
      if (s && !b) add({ check: 'steps-not-in-bom', severity: 'critical', deviceId: dev.id, parts: [id], steps: s.refs.map((r) => ({ deviceId: dev.id, stepId: r.stepId, stepNo: r.stepNo })), title: `${p.name} is fitted but not in the BOM`, detail: `${label(p)} is fitted in ${s.refs.map((r) => 'step ' + r.stepNo).join(', ')} but BOM rev ${dev.bom?.rev} does not list it.`, suggestion: 'Check whether the BOM or the instructions are wrong.' });
      else if (b && !s) add({ check: 'bom-not-in-steps', severity: 'warning', deviceId: dev.id, parts: [id], title: `${p.name} is in the BOM but no step fits it`, detail: `BOM item ${b.refs.map((r) => r.item).join(', ')}: ${b.asRequired ? 'as required' : b.qty} × ${label(p)}.`, suggestion: 'Add it to the step where it belongs, or remove it from the BOM through a change order.' });
      else if (s && b && !s.asRequired && !b.asRequired && s.qty !== b.qty) add({ check: 'bom-qty', severity: isFastener(p) ? 'critical' : 'warning', deviceId: dev.id, parts: [id], steps: s.refs.map((r) => ({ deviceId: dev.id, stepId: r.stepId, stepNo: r.stepNo })), title: `${p.name}: the steps fit ${s.qty}, the BOM lists ${b.qty}`, detail: `${label(p)}: ${s.refs.map((r) => `step ${r.stepNo} fits ${r.qty}`).join(', ')}; BOM item ${b.refs.map((r) => r.item).join(', ')} lists ${b.qty}.`, suggestion: 'Count the holes on the drawing and correct whichever document is wrong.' });
    }

    if (dev.bom?.rev && dev.instructions?.rev && dev.bom.rev !== dev.instructions.rev) {
      const later = (dev.changes || []).filter((c) => revAfter(c.rev, dev.instructions.rev));
      add({
        check: 'rev-mismatch', severity: 'warning', deviceId: dev.id, parts: later.flatMap((c) => (c.parts || []).map((code) => resolveCode(index, code).part?.id).filter(Boolean)),
        title: `${dev.name}: instructions are rev ${dev.instructions.rev}, the BOM is rev ${dev.bom.rev}`,
        detail: later.length ? `Changes made after rev ${dev.instructions.rev}: ${later.map((c) => `${c.eco} (rev ${c.rev}, ${c.date}): ${c.text}`).join(' ')}` : `The instructions were written for an older revision of the BOM.`,
        suggestion: 'Review each change since that revision and update the instructions, then release them at the same revision as the BOM.',
      });
    }

    // Look-alikes in the same device
    const used = [...ids].map(P).filter((p) => isFastener(p));
    for (let i = 0; i < used.length; i++) {
      for (let j = i + 1; j < used.length; j++) {
        const a = used[i], b = used[j];
        const c = compareParts(a, b);
        if (c.score < 0.75) continue;
        const sa = (stepQty.get(a.id)?.refs || []).map((r) => r.stepNo);
        const sb = (stepQty.get(b.id)?.refs || []).map((r) => r.stepNo);
        const stepsAB = [...(stepQty.get(a.id)?.refs || []), ...(stepQty.get(b.id)?.refs || [])].map((r) => ({ deviceId: dev.id, stepId: r.stepId, stepNo: r.stepNo }));
        add({
          check: 'lookalike-in-device', severity: c.score >= 0.85 ? 'warning' : 'info', deviceId: dev.id, parts: [a.id, b.id], steps: stepsAB,
          title: `${a.id}${sizeLabel(a) ? ` (${sizeLabel(a)})` : ''} and ${b.id}${sizeLabel(b) ? ` (${sizeLabel(b)})` : ''} are easy to mix up`,
          detail: `Both are used in ${dev.name}${sa.length ? ` (${a.id} in step ${sa.join(', ')}` : ''}${sb.length ? `; ${b.id} in step ${sb.join(', ')})` : sa.length ? ')' : ''}. Difference: ${c.diffs.map((d) => d.text).join(' ')}`,
          suggestion: 'Keep them in separate bins with true-scale labels, scan the bin at those steps, and ask engineering whether one part could do both jobs: fewer kinds of screws means fewer mix-ups.',
        });
      }
    }
  }

  // 3. Spec vs codes, duplicates, missing explanations
  const usedAnywhere = new Set([...index.usage.keys(), ...index.bomUsage.keys()]);
  for (const p of index.partList) {
    if (!isFastener(p) || !p.spec) continue;
    const texts = [...(p.aliases || []).map((a) => ({ code: a.code, type: a.type })), { code: p.designation, type: 'designation' }, { code: p.name, type: 'name' }].filter((t) => t.code);
    for (const t of texts) {
      const dec = decodeDesignation(t.code);
      if (!dec) continue;
      const ds = decodedSpec(dec);
      if (dec.standard?.guessed) { delete ds.head; delete ds.drive; }
      const sp = p.spec;
      const conflicts = [];
      if (ds.d != null && sp.d != null && Math.abs(ds.d - sp.d) > 0.01) conflicts.push(`thread ${dec.thread.label} vs ${sp.thread || 'M' + sp.d}`);
      if (ds.length != null && sp.length != null && Math.abs(ds.length - sp.length) > 0.01) conflicts.push(`length ${ds.length} mm vs ${sp.length} mm`);
      if (ds.head && sp.head && ds.head !== sp.head) conflicts.push(`${HEADS[ds.head].label.toLowerCase()} vs ${HEADS[sp.head].label.toLowerCase()}`);
      if (ds.drive && sp.drive && ds.drive !== sp.drive) conflicts.push(`${DRIVES[ds.drive].label} vs ${DRIVES[sp.drive].label}`);
      if (!conflicts.length) continue;
      add({
        check: 'spec-conflict', severity: 'warning', parts: [p.id], codes: [t.code],
        title: `${t.type === 'name' ? 'The name' : `Code ${t.code}`} says ${summarizeDecoded(dec)}, but ${p.id} is ${p.spec.thread || ''}${p.spec.length ? ' × ' + p.spec.length + ' mm' : ''}`,
        detail: `${t.type === 'name' ? 'Name' : CODE_TYPES[t.type] || t.type} "${t.code}" on ${label(p)} disagrees with the spec: ${conflicts.join(', ')}.`,
        suggestion: 'Check the physical part and correct either the code record or the spec.',
      });
    }
  }

  const fasteners = index.partList.filter((p) => isFastener(p) && p.status !== 'obsolete');
  for (let i = 0; i < fasteners.length; i++) {
    for (let j = i + 1; j < fasteners.length; j++) {
      const c = compareParts(fasteners[i], fasteners[j]);
      if (c.score >= 0.999 && c.diffs.length === 0) {
        const a = fasteners[i], b = fasteners[j];
        add({ check: 'duplicate-part', severity: 'warning', parts: [a.id, b.id], title: `${a.id} and ${b.id} look like the same part`, detail: `Both records describe ${a.spec.thread || ''}${a.spec.length ? ' × ' + a.spec.length + ' mm' : ''} ${HEADS[a.spec.head]?.label.toLowerCase() || a.category}${a.spec.drive ? ', ' + DRIVES[a.spec.drive].label : ''}, ${a.spec.material || ''}. ${[a, b].map((p) => `${p.id}: ${usedAnywhere.has(p.id) ? 'in use' : 'not used in any device'}`).join('; ')}.`, suggestion: 'Merge them: keep one code, add the other as an alias, and combine the stock.' });
      }
    }
  }

  const noDetails = [...usedAnywhere].map(P).filter((p) => p && !p.details?.function);
  if (noDetails.length) add({ check: 'missing-details', severity: 'info', parts: noDetails.map((p) => p.id), title: `${noDetails.length} part${noDetails.length > 1 ? 's have' : ' has'} no explanation for learners`, detail: noDetails.map((p) => p.id + ' ' + p.name).join('; ') + '.', suggestion: 'Add a line on what each part does and why it was chosen.' });

  findings.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || Object.keys(CHECKS).indexOf(a.check) - Object.keys(CHECKS).indexOf(b.check));
  const counts = { critical: 0, warning: 0, info: 0 };
  const byStep = new Map();
  const byPart = new Map();
  for (const f of findings) {
    counts[f.severity]++;
    for (const s of f.steps) { const k = `${s.deviceId}/${s.stepId}`; byStep.set(k, [...(byStep.get(k) || []), f]); }
    for (const id of f.parts) byPart.set(id, [...(byPart.get(id) || []), f]);
  }
  return { findings, counts, byStep, byPart };
}
