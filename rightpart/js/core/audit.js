// Integrity check: compares the part library, the BOM and the work instructions,
// and reports the kind of mismatch that lets a wrong part be fitted for years.
// Pure functions, no DOM.

import { resolveCode, normCode, qtyNumber, CODE_TYPES } from './model.js';
import { compareParts, shortDifference, LOOKALIKE_MIN } from './lookalike.js';
import { decodeDesignation, decodedSpec, summarizeDecoded } from './decode.js';
import { isFastener, HEADS, DRIVES, sizeLabel, CATEGORY_LABELS } from './dims.js';
import { N_, localize, t, lower, listJoin, getLanguage } from './i18n.js';
import { numberMismatches, sourceFingerprint } from './content.js';

const langLabel = (code) => { try { return new Intl.DisplayNames([getLanguage()], { type: 'language' }).of(code) || code; } catch { return code; } };

export const CHECKS = localize({
  'likely-substitution': { label: N_('Probably the wrong part in a step'), why: N_('A step fits more of one part and fewer of its look-alike than the BOM asks for. This is exactly how a wrong screw can be fitted for years without anyone noticing.') },
  'code-collision': { label: N_('One code points to several parts'), why: N_('Whoever reads that code on a bin, BOM or drawing can pick either part and believe it is right.') },
  'unknown-code': { label: N_('Code not found in the library'), why: N_('Nobody can check a part that the library does not know.') },
  'obsolete-part': { label: N_('Retired part still in use'), why: N_('A retired part may be out of stock, superseded for a reason, or no longer approved.') },
  'steps-not-in-bom': { label: N_('Fitted in a step, missing from the BOM'), why: N_('The instructions fit something the official parts list does not include.') },
  'bom-not-in-steps': { label: N_('In the BOM, never fitted in a step'), why: N_('Either the part is forgotten during assembly or the instructions use something else in its place.') },
  'bom-qty': { label: N_('Quantity differs from the BOM'), why: N_('Leftover or missing parts at the end of a build point to a mistake somewhere.') },
  'rev-mismatch': { label: N_('Instructions and BOM are on different revisions'), why: N_('Changes made to the BOM (ECOs) may never have reached the people who build the device.') },
  'translation-numbers': { label: N_('A translation changes a number'), why: N_('A translated step must give the same torque, count and size as the original. A number changed in translation can make someone fit or tighten the wrong thing, so the guide shows the original instead until it is fixed.') },
  'translation-outdated': { label: N_('Translation older than the step'), why: N_('The step changed after it was translated. Workers reading the translation could follow the old version.') },
  'translation-unchecked': { label: N_('Translation not checked yet'), why: N_('Machine or quick translations can be wrong in ways only a native reader notices. Until someone who reads the language checks it, the guide marks it as not checked.') },
  'draft-steps': { label: N_('Steps read from a PDF, not reviewed yet'), why: N_('Steps read automatically from a document can miss a part, a quantity or a warning. An engineer compares them with the released document before anyone builds from them.') },
  'no-bom': { label: N_('Device without a BOM'), why: N_('Without a parts list to compare with, nobody can tell whether the steps fit the right parts in the right numbers.') },
  'legacy-code': { label: N_('Document still uses an old code'), why: N_('Old codes keep working only as long as somebody remembers them.') },
  'spec-conflict': { label: N_('A code says one size, the spec says another'), why: N_('A code that spells out a size (like M3-12) but points to a different size misleads anyone who reads it.') },
  'duplicate-part': { label: N_('Two records for the same part'), why: N_('Two codes for one physical part split the stock and confuse people. It is how mix-ups start.') },
  'lookalike-in-device': { label: N_('Look-alike parts in the same device'), why: N_('Similar parts on the same bench are the most common cause of mix-ups.') },
  'missing-torque': { label: N_('No torque value for a fastener'), why: N_('Without a torque value each person tightens by feel: too loose shakes out, too tight strips or cracks.') },
  'missing-details': { label: N_('No explanation for learners'), why: N_('New people learn faster and make fewer mistakes when they know what a part does and why.') },
}, ['label', 'why']);

const SEV_RANK = { critical: 0, warning: 1, info: 2 };
const specText = (p) => `${p.spec?.thread || ''}${p.spec?.length ? ' × ' + p.spec.length + ' mm' : ''}`.trim();

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
  const stepList = (arr) => listJoin(arr.map((s) => t('step {n}', { n: s.stepNo ?? s })));

  // 1. One code, several parts
  for (const [norm, entries] of index.byCode) {
    const real = entries.filter((e) => e.alias.type !== 'designation');
    const ids = [...new Set(real.map((e) => e.partId))];
    if (ids.length < 2) continue;
    const code = real[0].alias.code;
    const where = ids.map((id) => {
      const e = real.find((x) => x.partId === id);
      const type = CODE_TYPES[e.alias.type] ? lower(CODE_TYPES[e.alias.type]) : e.alias.type;
      return e.alias.source ? t('{part} as {type} from {source}', { part: label(P(id)), type, source: e.alias.source }) : t('{part} as {type}', { part: label(P(id)), type });
    });
    const steps = [];
    for (const dev of index.lib.devices || []) (dev.instructions?.steps || []).forEach((s, i) => { if ((s.parts || []).some((r) => normCode(r.code) === norm)) steps.push({ deviceId: dev.id, stepId: s.id, stepNo: i + 1 }); });
    add({
      check: 'code-collision', severity: 'critical', parts: ids, codes: [code], steps,
      title: t('Code {code} points to {n} different parts', { code, n: ids.length }),
      detail: [t('The code is recorded for {where}.', { where: listJoin(where) }), steps.length ? t('It is used in {steps}.', { steps: stepList(steps) }) : ''].filter(Boolean).join(' '),
      suggestion: t('Find out which part this code really is (ask the supplier or purchasing), fix the wrong record, and relabel any bin that carries it.'),
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
          add({ check: 'unknown-code', severity: 'critical', deviceId: dev.id, codes: [ref.code], steps: [at], title: t('Step {n} uses code {code}, which is not in the library', { n: i + 1, code: ref.code }), detail: t('"{title}" lists {qty} × {code}.', { title: step.title, qty: ref.qty, code: ref.code }), suggestion: t('Add the part to the library with all its codes, or correct the code in the instructions.') });
          continue;
        }
        if (r.status === 'ambiguous') continue; // reported by check 1
        tally(stepQty, r.part.id, ref.qty, { ...at, qty: ref.qty, code: ref.code });
        if (r.legacy) add({ check: 'legacy-code', severity: 'warning', deviceId: dev.id, parts: [r.part.id], codes: [ref.code], steps: [at], title: t('Step {n} still uses the old code {code}', { n: i + 1, code: ref.code }), detail: t('{code} is a retired code for {part}. It still resolves today, but only because somebody kept the old code on record.', { code: ref.code, part: label(r.part) }), suggestion: t('Update the instructions to {id}.', { id: r.part.id }) });
        if (r.part.status === 'obsolete') add({ check: 'obsolete-part', severity: 'critical', deviceId: dev.id, parts: [r.part.id], steps: [at], title: t('Step {n} fits a retired part: {id}', { n: i + 1, id: r.part.id }), detail: r.part.replacedBy ? t('{part} is marked obsolete, replaced by {by}.', { part: label(r.part), by: r.part.replacedBy }) : t('{part} is marked obsolete.', { part: label(r.part) }), suggestion: r.part.replacedBy ? t('Fit {by} instead and update the instructions.', { by: r.part.replacedBy }) : t('Ask engineering for the approved replacement.') });
        const jointHasTorque = (step.parts || []).some((o) => { const q = resolveCode(index, o.code).part; return q && isFastener(q) && (o.torque || q.torque); });
        const needsOwn = r.part.category === 'screw' || r.part.category === 'standoff' || (r.part.category === 'nut' && !jointHasTorque);
        if (needsOwn && qtyNumber(ref.qty) != null && !(ref.torque || r.part.torque)) {
          add({ check: 'missing-torque', severity: 'warning', deviceId: dev.id, parts: [r.part.id], steps: [at], title: t('No torque value for {name} in step {n}', { name: r.part.name, n: i + 1 }), detail: t('Step {n} ("{title}") fits {qty} × {id} without a torque value.', { n: i + 1, title: step.title, qty: ref.qty, id: r.part.id }), suggestion: t('Ask engineering for the torque and add it to the part or the step.') });
        }
      }
    });

    for (const line of bomLines) {
      const r = resolveCode(index, line.code);
      if (r.status === 'unknown') { add({ check: 'unknown-code', severity: 'critical', deviceId: dev.id, codes: [line.code], title: t('BOM item {item} uses code {code}, which is not in the library', { item: line.item, code: line.code }), detail: line.where ? t('BOM rev {rev}, item {item}: {qty} × {code} ({where}).', { rev: dev.bom.rev, item: line.item, qty: line.qty, code: line.code, where: line.where }) : t('BOM rev {rev}, item {item}: {qty} × {code}.', { rev: dev.bom.rev, item: line.item, qty: line.qty, code: line.code }), suggestion: t('Add the part with its codes to the library.') }); continue; }
      if (r.status === 'ambiguous') continue;
      tally(bomQty, r.part.id, line.qty, { item: line.item, qty: line.qty, code: line.code, where: line.where });
      if (r.part.status === 'obsolete') add({ check: 'obsolete-part', severity: 'critical', deviceId: dev.id, parts: [r.part.id], title: t('BOM item {item} is a retired part: {id}', { item: line.item, id: r.part.id }), detail: r.part.replacedBy ? t('{part} is marked obsolete, replaced by {by}.', { part: label(r.part), by: r.part.replacedBy }) : t('{part} is marked obsolete.', { part: label(r.part) }), suggestion: t('Update the BOM through a change order.') });
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
        const kind = lower(CATEGORY_LABELS[pu.category] || t('part'));
        const sz = (p) => (sizeLabel(p) ? `${p.id} (${sizeLabel(p)})` : p.id);
        const bomLine = (p, qty, ln) => (ln?.where ? t('{qty} × {id} for the {where}', { qty, id: p.id, where: ln.where.toLowerCase() }) : t('{qty} × {id}', { qty, id: p.id }));
        add({
          check: 'likely-substitution', severity: 'critical', deviceId: dev.id, parts: [under, over], steps: at,
          title: one
            ? t('Step {n} probably fits the wrong {kind}: {fitted} where the BOM asks for {wanted}', { n: at[0].stepNo, kind, fitted: sz(po), wanted: sz(pu) })
            : t('The instructions probably fit the wrong {kind}: {fitted} where the BOM asks for {wanted}', { kind, fitted: sz(po), wanted: sz(pu) }),
          detail: [
            t('BOM rev {rev} lists {a} and {b}.', { rev: dev.bom?.rev || '?', a: bomLine(pu, bomQty.get(under)?.qty || 0, bLine), b: bomLine(po, bomQty.get(over)?.qty || 0, oLine) }),
            t('The instructions (rev {rev}) fit {qa} × {a} and {qb} × {b}.', { rev: dev.instructions?.rev || '?', qa: stepQty.get(under)?.qty || 0, a: pu.id, qb: stepQty.get(over)?.qty || 0, b: po.id }),
            one ? t('Step {n} ("{title}") fits exactly the {missing} that are missing.', { n: at[0].stepNo, title: steps.find((x) => x.id === at[0].stepId)?.title, missing: dOver }) : '',
            t('The difference is easy to miss: {id} is {diff}.', { id: po.id, diff: shortDifference(pu, po) }),
            eco ? t('Change {eco} (rev {rev}, {date}): "{text}" That change never reached the instructions.', { eco: eco.eco, rev: eco.rev, date: eco.date, text: eco.text }) : '',
          ].filter(Boolean).join(' '),
          suggestion: one
            ? t('Stop and confirm with engineering. If the BOM is right, correct step {n} to {id}, check what is in the bins, and review the devices already built (quality may open a nonconformance).', { n: at[0].stepNo, id: pu.id })
            : t('Stop and confirm with engineering. If the BOM is right, correct the instructions to {id}, check what is in the bins, and review the devices already built (quality may open a nonconformance).', { id: pu.id }),
        });
        explained.add(over); explained.add(under);
        break;
      }
    }

    if (!bomLines.length && steps.length) {
      add({ check: 'no-bom', severity: 'warning', deviceId: dev.id, title: t('{device} has no BOM', { device: dev.name }), detail: t('{steps, plural, one {# step fits} other {# steps fit}} {parts, plural, one {# different part} other {# different parts}}, but there is no parts list to check them against.', { steps: steps.length, parts: stepQty.size }), suggestion: t('Import the BOM from the ERP (More, Set up this company). The check then compares every step with it.') });
    }
    // Translations of the step text: numbers must match the original, and the original must not have changed since.
    const unchecked = new Map();
    steps.forEach((st, i) => {
      for (const [lang, tr] of Object.entries(st.translations || {})) {
        const at = { deviceId: dev.id, stepId: st.id, stepNo: i + 1 };
        const language = langLabel(lang);
        const mm = numberMismatches(st, tr);
        if (mm.length) {
          const m = mm[0];
          add({
            check: 'translation-numbers', severity: 'critical', deviceId: dev.id, steps: [at], codes: [lang],
            title: t('Step {n}: the {language} translation changes a number', { n: i + 1, language }),
            detail: [t('Original: "{a}". Translation: "{b}".', { a: m.original, b: m.translated }),
              m.missing.length ? t('Missing in the translation: {list}.', { list: m.missing.join(', ') }) : '',
              m.extra.length ? t('Not in the original: {list}.', { list: m.extra.join(', ') }) : '',
              mm.length > 1 ? t('{n, plural, one {# more line differs.} other {# more lines differ.}}', { n: mm.length - 1 }) : ''].filter(Boolean).join(' '),
            suggestion: t('Correct the translation and import it again. Until then, people reading {language} see the original text of this step.', { language }),
          });
        } else if (tr.source && tr.source !== sourceFingerprint(st)) {
          add({ check: 'translation-outdated', severity: 'warning', deviceId: dev.id, steps: [at], codes: [lang], title: t('Step {n}: the {language} translation is older than the step', { n: i + 1, language }), detail: t('The step was changed after it was translated. The guide tells workers to follow the original where the two differ.'), suggestion: t('Export the step text, update the {language} column and import it again.', { language }) });
        } else if (!tr.reviewed) {
          unchecked.set(lang, [...(unchecked.get(lang) || []), at]);
        }
      }
    });
    for (const [lang, at] of unchecked) {
      const language = langLabel(lang);
      add({ check: 'translation-unchecked', severity: 'info', deviceId: dev.id, steps: at, codes: [lang], title: t('{n, plural, one {# step of {device} has a {language} translation nobody has checked yet} other {# steps of {device} have a {language} translation nobody has checked yet}}', { n: at.length, device: dev.name, language }), detail: t('Steps {list}.', { list: at.map((x) => x.stepNo).join(', ') }), suggestion: t('Ask someone who reads {language} to compare it with the original, then import it again with "checked" ticked.', { language }) });
    }

    const drafts = steps.map((st, i) => ({ st, i })).filter(({ st }) => st.draft);
    if (drafts.length) {
      const files = [...new Set(drafts.map(({ st }) => st.source?.file).filter(Boolean))];
      const nums = drafts.map(({ i }) => i + 1).join(', ');
      add({ check: 'draft-steps', severity: 'warning', deviceId: dev.id, steps: drafts.map(({ st, i }) => ({ deviceId: dev.id, stepId: st.id, stepNo: i + 1 })), title: t('{n, plural, one {# step of {device} was read from a PDF and not reviewed yet} other {# steps of {device} were read from a PDF and not reviewed yet}}', { n: drafts.length, device: dev.name }), detail: [files.length ? t('{n, plural, one {Step {list}, read from {files}.} other {Steps {list}, read from {files}.}}', { n: drafts.length, list: nums, files: files.join(', ') }) : t('{n, plural, one {Step {list}.} other {Steps {list}.}}', { n: drafts.length, list: nums }), t('Reading a document automatically can miss a part, a quantity or a warning.')].join(' '), suggestion: t('Open the step editor, compare each step with the PDF and tick Reviewed.') });
    }

    for (const id of bomLines.length ? ids : []) {
      if (explained.has(id)) continue;
      const s = stepQty.get(id), b = bomQty.get(id), p = P(id);
      if (s && !b) add({ check: 'steps-not-in-bom', severity: 'critical', deviceId: dev.id, parts: [id], steps: s.refs.map((r) => ({ deviceId: dev.id, stepId: r.stepId, stepNo: r.stepNo })), title: t('{name} is fitted but not in the BOM', { name: p.name }), detail: t('{part} is fitted in {steps} but BOM rev {rev} does not list it.', { part: label(p), steps: stepList(s.refs), rev: dev.bom?.rev }), suggestion: t('Check whether the BOM or the instructions are wrong.') });
      else if (b && !s) add({ check: 'bom-not-in-steps', severity: 'warning', deviceId: dev.id, parts: [id], title: t('{name} is in the BOM but no step fits it', { name: p.name }), detail: t('BOM item {items}: {qty} × {part}.', { items: b.refs.map((r) => r.item).join(', '), qty: b.asRequired ? t('as required') : b.qty, part: label(p) }), suggestion: t('Add it to the step where it belongs, or remove it from the BOM through a change order.') });
      else if (s && b && !s.asRequired && !b.asRequired && s.qty !== b.qty) add({ check: 'bom-qty', severity: isFastener(p) ? 'critical' : 'warning', deviceId: dev.id, parts: [id], steps: s.refs.map((r) => ({ deviceId: dev.id, stepId: r.stepId, stepNo: r.stepNo })), title: t('{name}: the steps fit {steps}, the BOM lists {bom}', { name: p.name, steps: s.qty, bom: b.qty }), detail: t('{part}: {fits}; BOM item {items} lists {bom}.', { part: label(p), fits: s.refs.map((r) => t('step {n} fits {qty}', { n: r.stepNo, qty: r.qty })).join(', '), items: b.refs.map((r) => r.item).join(', '), bom: b.qty }), suggestion: t('Count the holes on the drawing and correct whichever document is wrong.') });
    }

    if (dev.bom?.rev && dev.instructions?.rev && dev.bom.rev !== dev.instructions.rev) {
      const later = (dev.changes || []).filter((c) => revAfter(c.rev, dev.instructions.rev));
      add({
        check: 'rev-mismatch', severity: 'warning', deviceId: dev.id, parts: later.flatMap((c) => (c.parts || []).map((code) => resolveCode(index, code).part?.id).filter(Boolean)),
        title: t('{device}: instructions are rev {a}, the BOM is rev {b}', { device: dev.name, a: dev.instructions.rev, b: dev.bom.rev }),
        detail: later.length ? t('Changes made after rev {rev}: {changes}', { rev: dev.instructions.rev, changes: later.map((c) => t('{eco} (rev {rev}, {date}): {text}', { eco: c.eco, rev: c.rev, date: c.date, text: c.text })).join(' ') }) : t('The instructions were written for an older revision of the BOM.'),
        suggestion: t('Review each change since that revision and update the instructions, then release them at the same revision as the BOM.'),
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
          title: t('{a} and {b} are easy to mix up', { a: sizeLabel(a) ? `${a.id} (${sizeLabel(a)})` : a.id, b: sizeLabel(b) ? `${b.id} (${sizeLabel(b)})` : b.id }),
          detail: [
            t('Both are used in {device}.', { device: dev.name }),
            sa.length ? t('{id} in step {steps}.', { id: a.id, steps: sa.join(', ') }) : '',
            sb.length ? t('{id} in step {steps}.', { id: b.id, steps: sb.join(', ') }) : '',
            t('Difference: {diff}', { diff: c.diffs.map((d) => d.text).join(' ') }),
          ].filter(Boolean).join(' '),
          suggestion: t('Keep them in separate bins with true-scale labels, scan the bin at those steps, and ask engineering whether one part could do both jobs: fewer kinds of screws means fewer mix-ups.'),
        });
      }
    }
  }

  // 3. Spec vs codes, duplicates, missing explanations
  const usedAnywhere = new Set([...index.usage.keys(), ...index.bomUsage.keys()]);
  for (const p of index.partList) {
    if (!isFastener(p) || !p.spec) continue;
    const texts = [...(p.aliases || []).map((a) => ({ code: a.code, type: a.type })), { code: p.designation, type: 'designation' }, { code: p.name, type: 'name' }].filter((x) => x.code);
    for (const tx of texts) {
      const dec = decodeDesignation(tx.code);
      if (!dec) continue;
      const ds = decodedSpec(dec);
      if (dec.standard?.guessed) { delete ds.head; delete ds.drive; }
      const sp = p.spec;
      const conflicts = [];
      if (ds.d != null && sp.d != null && Math.abs(ds.d - sp.d) > 0.01) conflicts.push(t('thread {a} vs {b}', { a: dec.thread.label, b: sp.thread || 'M' + sp.d }));
      if (ds.length != null && sp.length != null && Math.abs(ds.length - sp.length) > 0.01) conflicts.push(t('length {a} mm vs {b} mm', { a: ds.length, b: sp.length }));
      if (ds.head && sp.head && ds.head !== sp.head) conflicts.push(t('{a} vs {b}', { a: lower(HEADS[ds.head].label), b: lower(HEADS[sp.head].label) }));
      if (ds.drive && sp.drive && ds.drive !== sp.drive) conflicts.push(t('{a} vs {b}', { a: DRIVES[ds.drive].label, b: DRIVES[sp.drive].label }));
      if (!conflicts.length) continue;
      add({
        check: 'spec-conflict', severity: 'warning', parts: [p.id], codes: [tx.code],
        title: tx.type === 'name'
          ? t('The name says {says}, but {id} is {spec}', { says: summarizeDecoded(dec), id: p.id, spec: specText(p) })
          : t('Code {code} says {says}, but {id} is {spec}', { code: tx.code, says: summarizeDecoded(dec), id: p.id, spec: specText(p) }),
        detail: t('{what} "{code}" on {part} disagrees with the spec: {conflicts}.', { what: tx.type === 'name' ? t('Name') : CODE_TYPES[tx.type] || tx.type, code: tx.code, part: label(p), conflicts: conflicts.join(', ') }),
        suggestion: t('Check the physical part and correct either the code record or the spec.'),
      });
    }
  }

  const fasteners = index.partList.filter((p) => isFastener(p) && p.status !== 'obsolete');
  for (let i = 0; i < fasteners.length; i++) {
    for (let j = i + 1; j < fasteners.length; j++) {
      const c = compareParts(fasteners[i], fasteners[j]);
      if (c.score >= 0.999 && c.diffs.length === 0) {
        const a = fasteners[i], b = fasteners[j];
        const what = [specText(a), HEADS[a.spec.head] ? lower(HEADS[a.spec.head].label) : a.category, a.spec.drive ? DRIVES[a.spec.drive]?.label : '', a.spec.material || ''].filter(Boolean).join(', ');
        add({ check: 'duplicate-part', severity: 'warning', parts: [a.id, b.id], title: t('{a} and {b} look like the same part', { a: a.id, b: b.id }), detail: [t('Both records describe {what}.', { what }), [a, b].map((p) => (usedAnywhere.has(p.id) ? t('{id}: in use', { id: p.id }) : t('{id}: not used in any device', { id: p.id }))).join('; ') + '.'].join(' '), suggestion: t('Merge them: keep one code, add the other as an alias, and combine the stock.') });
      }
    }
  }

  const noDetails = [...usedAnywhere].map(P).filter((p) => p && !p.details?.function);
  if (noDetails.length) add({ check: 'missing-details', severity: 'info', parts: noDetails.map((p) => p.id), title: t('{n, plural, one {# part has no explanation for learners} other {# parts have no explanation for learners}}', { n: noDetails.length }), detail: noDetails.map((p) => p.id + ' ' + p.name).join('; ') + '.', suggestion: t('Add a line on what each part does and why it was chosen.') });

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
