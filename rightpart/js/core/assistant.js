// "Ask": answers a worker's question from the company's own data (parts and their codes, steps,
// BOMs, engineering changes, integrity findings). Every answer is built from records and lists
// its sources, so it can never invent a torque value or a part number. It works offline.
// Questions it cannot match get the closest search results, and can be passed to the optional
// AI (backend/supabase/functions/ask) together with the records retrieved here.
// Pure module: no DOM.

import { search, resolveCode, stepParts, whereUsed, torqueText, otherCodes, normCode, CODE_TYPES, qtyNumber } from './model.js';
import { decodeDesignation, summarizeDecoded } from './decode.js';
import { findLookalikes, compareParts, shortDifference } from './lookalike.js';
import { sizeLabel, isFastener, CATEGORY_LABELS } from './dims.js';

// Keywords in English, Hebrew and Arabic. (\b only works for Latin letters in JavaScript.)
const KW = {
  help: /^(help|hi|hello|hey|start|menu|what can you do\??|\?)$|^(שלום|עזרה|היי|مرحبا|مساعدة|اهلا|أهلا)$/i,
  torque: /\btorque\b|\bhow (tight|hard)\b|\d\s?n\s?[·.]?\s?m\b|\bnm\b|מומנט|عزم/i,
  tool: /\btools?\b|\bbits?\b|\bkeys?\b|\bdrivers?\b|\bspanner\b|\bwrench\b|\ballen\b|\bscrewdriver\b|כלי|מפתח|ביט|מברג|أداة|ادوات|أدوات|مفك|مفتاح/i,
  howMany: /\bhow many\b|\bquantity\b|\bqty\b|\bnumber of\b|כמה|كم /i,
  where: /\bwhere\b|\bwhich steps?\b.*\b(use|uses|used)\b|איפה|היכן|באיזה שלב|أين|وين|في أي خطوة/i,
  meaning: /\bwhat does\b|\bmeaning\b|\bmean\b|\bexplain\b|\bdecode\b|\bstand for\b|מה פירוש|מה זה אומר|ماذا يعني|معنى|اشرح/i,
  diff: /\bdifference\b|\bdiffer\b|\bvs\.?\b|\bversus\b|\bsame as\b|\bconfuse\b|\bcompare\b|\bmix(ed)? up\b|ההבדל|הבדל|להתבלבל|الفرق|فرق|يختلف/i,
  how: /\bhow (do|to|should|can)\b|\binstructions?\b|\bprocedure\b|\bassemble\b|\binstall\b|\bput together\b|איך|כיצד|להרכיב|הוראות|كيف|طريقة|تركيب|خطوات/i,
  why: /\bwhy\b|\breason\b|\bpurpose\b|\bwhat (is it|does it) (for|do)\b|למה|מדוע|بشو|لماذا|ليش|ليه/i,
  next: /\bnext\b|\bafter (this|that|step)\b|\bthen what\b|הבא|אחרי|التالي|بعد/i,
  problems: /\bproblems?\b|\bissues?\b|\berrors?\b|\bmistakes?\b|\bconflicts?\b|\bwrong\b|\bintegrity\b|\banything (wrong|off)\b|בעיות|בעיה|שגיאה|טעות|مشاكل|مشكلة|خطأ|غلط/i,
  identify: /\bi (found|have|picked)\b|\bloose\b|\bwhat is this\b|\bidentify\b|\bwhich one is\b|מצאתי|יש לי בורג|وجدت|لقيت|ما هذا|شو هاد/i,
  safety: /\bsafety\b|\bsafe\b|\besd\b|\bstatic\b|\bearth(ing)?\b|\bground(ing)?\b|\bcritical\b|\bdanger(ous)?\b|בטיחות|הארקה|סטטי|سلامة|تأريض|أرضي|كهرباء ساكنة/i,
  which: /\b(which|what)\b.*\b(screws?|bolts?|parts?|washers?|nuts?|standoffs?|spacers?|use|need|fit|goes|go)\b|\bwhat (do|should) i (use|need|fit)\b|איזה|איזו|אילו|מה צריך|מה להשתמש|أي برغي|اي برغي|أي قطعة|ما البرغي|شو البرغي|ماذا أستخدم|شو بدي|ايش/i,
  whatIs: /\bwhat(?:'s| is)\b|\bwho makes\b|מה זה|ما هو|ما هي|شو هو/i,
};
const CATEGORY_WORDS = [
  ['screw', /\bscrews?\b|\bbolts?\b|בורג|ברגים|برغي|براغي|مسمار/i],
  ['nut', /\bnuts?\b|\bnyloc\b|אום|אומים|صامولة|صواميل/i],
  ['washer', /\bwashers?\b|דסקית|דסקיות|وردة|حلقة|ورد/i],
  ['standoff', /\bstand-?offs?\b|\bspacers?\b|ספייסר|מרווח|فاصل/i],
];
const STEP_RE = /(?:\bstep|\bstage|שלב|خطوة|\bs)\s*(?:no\.?|number|#|מס'?)?\s*(\d{1,3})(?!\s*(?:mm|x|×))/i;
const GENERIC = new Set('the a an and or of to for in on at by with from this that these those it its is are be do does did i me my we our you your step steps part parts screw screws bolt nut washer fit fitting mount install connect use used need needs which what how why where when there here into onto device console demo new old put goes go get set check make please can should would could will about any all one two three four five six'.split(' '));

const words = (s) => String(s || '').toLowerCase().match(/[a-z0-9֐-׿؀-ۿ]+/g) || [];

function findDevice(index, q, ctx) {
  const devs = [...index.devices.values()];
  if (!devs.length) return null;
  const nq = normCode(q);
  const byId = devs.find((d) => nq.includes(normCode(d.id)));
  if (byId) return byId;
  const qw = new Set(words(q).filter((w) => w.length >= 3 && !GENERIC.has(w)));
  let best = null, bestN = 0;
  for (const d of devs) {
    const n = words(d.name).filter((w) => w.length >= 3 && !GENERIC.has(w) && qw.has(w)).length;
    if (n > bestN) { best = d; bestN = n; }
  }
  if (best) return best;
  if (ctx?.deviceId && index.devices.get(ctx.deviceId)) return index.devices.get(ctx.deviceId);
  return devs.length === 1 ? devs[0] : null;
}

function findStep(dev, q, ctx) {
  if (!dev) return null;
  const steps = dev.instructions?.steps || [];
  const m = q.match(STEP_RE);
  if (m) {
    const n = parseInt(m[1], 10);
    const byNo = steps[n - 1];
    const byId = steps.find((s) => normCode(s.id) === normCode(`S${n}`));
    const s = byNo || byId;
    if (s) return { step: s, no: steps.indexOf(s) + 1, how: 'number' };
  }
  const qw = new Set(words(q).filter((w) => w.length >= 3 && !GENERIC.has(w)));
  let best = null, bestScore = 0;
  steps.forEach((s, i) => {
    const t = words(s.title).filter((w) => !GENERIC.has(w));
    const body = words(`${s.summary || ''}`).filter((w) => !GENERIC.has(w));
    const score = t.filter((w) => qw.has(w)).length * 2 + body.filter((w) => qw.has(w)).length * 0.5;
    if (score > bestScore) { best = { step: s, no: i + 1, how: 'title' }; bestScore = score; }
  });
  if (best && bestScore >= 2) return best;
  // A BOM position ("front bezel") points at the step whose title names it.
  for (const line of dev.bom?.lines || []) {
    const lw = words(line.where).filter((w) => w.length >= 4 && !GENERIC.has(w));
    if (lw.length && lw.every((w) => qw.has(w))) {
      const i = steps.findIndex((s) => lw.every((w) => words(`${s.title} ${s.summary}`).includes(w)));
      if (i >= 0) return { step: steps[i], no: i + 1, how: 'position' };
    }
  }
  if (ctx?.stepId && ctx.deviceId === dev.id) {
    const i = steps.findIndex((s) => s.id === ctx.stepId);
    if (i >= 0) return { step: steps[i], no: i + 1, how: 'context' };
  }
  return null;
}

/** Codes mentioned in the question: single tokens and pairs ("ISO 7380"), resolved through every alias. */
function findCodes(index, q) {
  const toks = q.split(/[\s,;?!()"']+/).map((t) => t.replace(/[.:]+$/, '')).filter((t) => t.length >= 3);
  const found = [];
  const seen = new Set();
  const consider = (t) => {
    if (!/\d/.test(t)) return;
    const r = resolveCode(index, t);
    if (r.status === 'unknown') return;
    const key = r.status === 'unique' ? r.part.id : `amb:${r.norm}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ token: t, resolution: r });
  };
  toks.forEach((t, i) => { consider(t); if (toks[i + 1]) consider(`${t} ${toks[i + 1]}`); });
  return found;
}

function categoryOf(q) {
  for (const [cat, re] of CATEGORY_WORDS) if (re.test(q)) return cat;
  return null;
}

const partRef = (p) => ({ label: `${p.id} · ${p.name}`, href: `#/part/${encodeURIComponent(p.id)}` });
const stepRef = (dev, st, no) => ({ label: `${dev.name}, step ${no}: ${st.title}`, href: `#/guide/${encodeURIComponent(dev.id)}/${encodeURIComponent(st.id)}?mode=learn` });
const sz = (p) => (sizeLabel(p) ? ` (${sizeLabel(p)})` : '');

function stepFindings(audit, dev, st) {
  return (audit.byStep.get(`${dev.id}/${st.id}`) || []).filter((f) => f.severity !== 'info');
}

function substitutionLine(audit, dev, st, index) {
  const f = stepFindings(audit, dev, st).find((x) => x.check === 'likely-substitution');
  if (!f) return null;
  const bomPart = index.parts.get(f.parts[0]);
  const stepPart = index.parts.get(f.parts[1]);
  return { level: 'bad', text: `Stop: the instructions say ${stepPart.id}${sz(stepPart)}, but BOM rev ${dev.bom?.rev || '?'} asks for ${bomPart.id}${sz(bomPart)} here. Ask your supervisor or engineer before fitting.`, finding: f };
}

function partItem(index, sp, extra = {}) {
  const p = sp.part;
  const looks = isFastener(p) ? findLookalikes(index.partList, p).filter((l) => l.score >= 0.75 && !l.duplicate).slice(0, 2) : [];
  return {
    kind: 'part', part: p, qty: sp.qty, torque: torqueText(sp.torque),
    codes: otherCodes(p).slice(0, 3).map((a) => a.code),
    warnings: looks.map((l) => `Don't confuse with ${l.part.id}${sz(l.part)}: ${shortDifference(p, l.part)}.`),
    note: sp.ref?.note || '',
    ...extra,
  };
}

// ---------- Handlers ----------
function answerWhich(ctx, cat) {
  const { index, audit, dev, step } = ctx;
  const st = step.step;
  let sps = stepParts(index, st).filter((x) => x.part);
  if (cat) { const f = sps.filter((x) => x.part.category === cat); if (f.length) sps = f; }
  const sub = substitutionLine(audit, dev, st, index);
  const disputed = sub?.finding.parts[1];
  const items = sps.map((sp) => partItem(index, sp, { flag: sp.part.id === disputed }));
  if (sub) {
    const bomPart = index.parts.get(sub.finding.parts[0]);
    const inStep = sps.find((sp) => sp.part.id === disputed);
    items.push(partItem(index, { part: bomPart, qty: inStep?.qty ?? null, torque: bomPart.torque }, { note: `What BOM rev ${dev.bom?.rev || '?'} asks for`, bom: true }));
  }
  return {
    intent: 'which',
    text: [`Step ${step.no}, “${st.title}”, uses${cat && sps.length ? ` these ${CATEGORY_LABELS[cat].toLowerCase()}s` : ''}:`],
    lines: sub ? [sub] : [],
    items,
    sources: [stepRef(dev, st, step.no), ...(sub ? [{ label: 'Integrity check', href: '#/audit' }] : [])],
    followUps: [`How do I do step ${step.no}?`, `Torque for step ${step.no}?`, `What comes after step ${step.no}?`],
  };
}

function answerHow(ctx) {
  const { index, audit, dev, step } = ctx;
  const st = step.step;
  const sub = substitutionLine(audit, dev, st, index);
  const lines = [];
  if (sub) lines.push(sub);
  for (const w of st.warnings || []) lines.push({ level: w.level === 'warning' ? 'bad' : 'warn', text: w.text });
  return {
    intent: 'how',
    text: [`Step ${step.no}: ${st.title}.${st.summary ? ' ' + st.summary : ''}`],
    lines,
    list: st.instructions || [],
    checks: st.checks || [],
    items: stepParts(index, st).filter((x) => x.part).map((sp) => partItem(index, sp, { flag: sub?.finding.parts[1] === sp.part.id })),
    tools: st.tools || [],
    why: st.why || '',
    sources: [stepRef(dev, st, step.no)],
    followUps: [`What comes after step ${step.no}?`, `Why step ${step.no}?`],
  };
}

function answerTorque(ctx, parts) {
  const { index, dev, step } = ctx;
  const out = [];
  const sources = [];
  if (step && (!parts.length || parts.every((p) => stepParts(index, step.step).some((x) => x.part?.id === p.id)))) {
    const sps = stepParts(index, step.step).filter((x) => x.part && (!parts.length || parts.some((p) => p.id === x.part.id)) && x.part.category !== 'washer' && isFastener(x.part));
    for (const sp of sps) out.push(sp.torque ? `${sp.part.id}${sz(sp.part)}: ${torqueText(sp.torque)}${sp.part.tool ? ` (${sp.part.tool})` : ''}.` : `${sp.part.id}${sz(sp.part)}: no torque value is recorded. Ask your engineer; do not tighten by feel.`);
    sources.push(stepRef(dev, step.step, step.no));
    if (!out.length) out.push(`Step ${step.no} has no screws or nuts that need a torque value.`);
    return { intent: 'torque', text: [`Torque in step ${step.no}, “${step.step.title}”:`], list: out, sources, followUps: [`Which tool for step ${step.no}?`] };
  }
  for (const p of parts) {
    const uses = whereUsed(index, p.id).flatMap((u) => u.steps.map((s) => ({ dev: u.device, s })));
    const perStep = uses.map(({ dev: d, s }) => {
      const st = d.instructions.steps.find((x) => x.id === s.stepId);
      const ref = st?.parts.find((r) => resolveCode(index, r.code).part?.id === p.id);
      return { d, st, no: s.stepNo, t: ref?.torque || p.torque };
    });
    const values = new Set(perStep.map((x) => torqueText(x.t)).filter(Boolean));
    if (!p.torque && !values.size) out.push(`${p.id}${sz(p)}: no torque value is recorded. Ask your engineer; do not tighten by feel.`);
    else if (values.size > 1) perStep.forEach((x) => out.push(`${p.id} in step ${x.no} (${x.st.title}): ${torqueText(x.t) || 'not recorded'}.`));
    else out.push(`${p.id}${sz(p)}: ${[...values][0] || torqueText(p.torque)}${p.tool ? `, ${p.tool}` : ''}.`);
    sources.push(partRef(p));
  }
  return { intent: 'torque', text: [parts.length > 1 ? 'Torque values:' : 'Torque:'], list: out, sources };
}

function answerTool(ctx, parts) {
  const { index, dev, step } = ctx;
  if (step && !parts.length) {
    const st = step.step;
    const extra = stepParts(index, st).filter((x) => x.part?.tool).map((x) => `${x.part.id}: ${x.part.tool}`);
    return { intent: 'tool', text: [`Tools for step ${step.no}, “${st.title}”:`], list: [...(st.tools || []), ...extra], sources: [stepRef(dev, st, step.no)] };
  }
  const list = parts.map((p) => `${p.id}${sz(p)}: ${p.tool || (p.spec?.driveSize ? `${p.spec.driveSize} bit or key` : 'no tool recorded')}`);
  return { intent: 'tool', text: ['Tools:'], list, sources: parts.map(partRef) };
}

function answerHowMany(ctx, parts) {
  const { index, dev, step } = ctx;
  if (!parts.length && step) return answerWhich(ctx, ctx.cat);
  const list = [];
  const sources = [];
  for (const p of parts) {
    const u = whereUsed(index, p.id).filter((x) => !dev || x.device.id === dev.id);
    if (step) {
      const sp = stepParts(index, step.step).find((x) => x.part?.id === p.id);
      list.push(sp ? `Step ${step.no} fits ${sp.qty} × ${p.id}${sz(p)}.` : `Step ${step.no} does not use ${p.id}.`);
    }
    for (const x of u) {
      const inSteps = x.steps.reduce((n, s) => n + (qtyNumber(s.qty) ?? 0), 0);
      const inBom = x.bom.reduce((n, b) => n + (qtyNumber(b.qty) ?? 0), 0);
      list.push(`${x.device.name}: ${inSteps} in the steps (${x.steps.map((s) => `step ${s.stepNo}: ${s.qty}`).join(', ') || 'none'}), ${inBom} in the BOM.${inSteps !== inBom && x.bom.length ? ' These do not agree: check the integrity findings.' : ''}`);
    }
    if (!u.length) list.push(`${p.id} is not used in any device.`);
    sources.push(partRef(p));
  }
  return { intent: 'howMany', text: ['Quantities:'], list, sources };
}

function answerWhere(ctx, parts) {
  const { index } = ctx;
  const list = [];
  for (const p of parts) {
    const u = whereUsed(index, p.id);
    if (!u.length) { list.push(`${p.id}${sz(p)} is not used in any device.`); continue; }
    for (const x of u) list.push(`${x.device.name}: ${x.steps.length ? x.steps.map((s) => `step ${s.stepNo} (${s.qty}×)`).join(', ') : 'no step fits it'}${x.bom.length ? `; BOM item ${x.bom.map((b) => b.item).join(', ')}${x.bom[0].where ? ` (${x.bom[0].where})` : ''}` : '; not in the BOM'}.`);
  }
  return { intent: 'where', text: [parts.length === 1 ? `${parts[0].id}${sz(parts[0])} is used here:` : 'Where these parts are used:'], list, items: parts.map((p) => ({ kind: 'part', part: p })), sources: parts.map(partRef) };
}

function answerWhatIs(ctx, codes) {
  const { index } = ctx;
  const out = { intent: 'whatIs', text: [], lines: [], items: [], sources: [] };
  for (const c of codes) {
    const r = c.resolution;
    if (r.status === 'ambiguous') {
      out.lines.push({ level: 'bad', text: `Stop: ${c.token} points to ${r.matches.length} different parts (${r.matches.map((m) => m.part.id).join(' and ')}). Do not use this code until it is fixed: scan another code on the label.` });
      r.matches.forEach((m) => out.items.push({ kind: 'part', part: m.part }));
      out.sources.push({ label: 'Integrity check', href: '#/audit' });
      continue;
    }
    const p = r.part;
    const type = (CODE_TYPES[r.alias.type] || r.alias.type).toLowerCase();
    out.text.push(r.alias.type === 'internal' ? `${p.id} is ${p.name}.` : `${c.token} is the ${type}${r.alias.source ? ` (${r.alias.source})` : ''} of ${p.id}: ${p.name}.`);
    if (r.legacy) out.lines.push({ level: 'warn', text: `${c.token} is an old code. Use ${p.id}, and ask for documents and labels with the old code to be updated.` });
    if (p.status === 'obsolete') out.lines.push({ level: 'bad', text: `${p.id} is retired${p.replacedBy ? `: use ${p.replacedBy}` : ''}.` });
    if (p.details?.function) out.text.push(p.details.function);
    out.items.push(partItem(index, { part: p, qty: null, torque: p.torque }));
    out.sources.push(partRef(p));
  }
  out.followUps = codes.filter((c) => c.resolution.part).slice(0, 1).flatMap((c) => [`Where is ${c.resolution.part.id} used?`, `Torque for ${c.resolution.part.id}?`, `What is ${c.resolution.part.id} easy to confuse with?`]);
  return out;
}

function answerDiff(ctx, parts) {
  const { index } = ctx;
  if (parts.length >= 2) {
    const [a, b] = parts;
    const c = compareParts(a, b);
    const list = c.diffs.length ? c.diffs.map((d) => d.text) : [a.category !== b.category ? `${a.id} is a ${a.category}, ${b.id} is a ${b.category}.` : 'Their recorded specs are identical: they may be the same part under two codes. Tell your engineer.'];
    return { intent: 'diff', text: [`${a.id}${sz(a)} compared with ${b.id}${sz(b)}:`], list, items: [{ kind: 'part', part: a }, { kind: 'part', part: b }], tip: 'Lay the part on the true-scale drawing (part page, "Actual size") or use the gauge on the Identify page to be sure.', sources: [partRef(a), partRef(b)] };
  }
  const p = parts[0];
  const looks = findLookalikes(index.partList, p).slice(0, 4);
  if (!looks.length) return { intent: 'diff', text: [`Nothing in the library looks like ${p.id}${sz(p)}.`], sources: [partRef(p)] };
  return { intent: 'diff', text: [`${p.id}${sz(p)} is easy to confuse with:`], list: looks.map((l) => `${l.part.id}${sz(l.part)}: ${l.duplicate ? 'identical spec (probably a duplicate record)' : shortDifference(p, l.part)}.`), items: looks.map((l) => ({ kind: 'part', part: l.part })), sources: [partRef(p)] };
}

function answerMeaning(ctx, dec) {
  const { index } = ctx;
  const matches = search(index, ctx.q, { limit: 5 }).results.filter((r) => r.reasons.some((x) => x.kind === 'spec'));
  return {
    intent: 'meaning',
    text: [`${dec.parts.map((p) => p.token).join(' ')} reads as: ${summarizeDecoded(dec)}.`],
    list: dec.parts.map((p) => `${p.token}: ${p.meaning}`),
    items: matches.slice(0, 3).map((r) => ({ kind: 'part', part: r.part })),
    sources: matches.slice(0, 3).map((r) => partRef(r.part)),
    followUps: ['How do I measure a screw?'],
  };
}

function answerIdentify(ctx, dec) {
  const { index } = ctx;
  const res = search(index, ctx.q, { limit: 6 }).results.filter((r) => r.reasons.some((x) => x.kind === 'spec' || x.kind === 'near'));
  if (!res.length) return { intent: 'identify', text: ['Tell me what you can see or measure: head shape, drive, thread size and length (for example "button head, hex, M3, 10 mm"). Or measure it on the screen on the Identify page.'], sources: [{ label: 'Identify page', href: '#/identify' }] };
  return {
    intent: 'identify',
    text: [`Parts that match${dec ? ` ${summarizeDecoded(dec)}` : ''}:`],
    items: res.slice(0, 4).map((r) => ({ kind: 'part', part: r.part, note: r.reasons[0].text })),
    tip: 'A size read by eye can be 1 or 2 mm off: lay the part on its true-scale drawing or use the gauge before fitting it.',
    sources: [{ label: 'Measure on the Identify page', href: '#/identify?tab=measure' }],
  };
}

function answerWhy(ctx, parts) {
  const { dev, step } = ctx;
  if (parts.length) {
    const p = parts[0];
    const d = p.details || {};
    const text = [d.function, d.why].filter(Boolean);
    return { intent: 'why', text: text.length ? text : [`Nobody has written down why ${p.id} was chosen yet. Ask your engineer, and ask them to add it.`], lines: d.ifWrong ? [{ level: 'warn', text: `If the wrong part is fitted: ${d.ifWrong}` }] : [], sources: [partRef(p)] };
  }
  const st = step.step;
  return { intent: 'why', text: [st.why || `Step ${step.no} has no explanation yet. Ask your engineer.`], sources: [stepRef(dev, st, step.no)] };
}

function answerNext(ctx) {
  const { dev, step, index } = ctx;
  const steps = dev.instructions.steps;
  const nxt = steps[step.no];
  if (!nxt) return { intent: 'next', text: [`Step ${step.no} is the last step of the ${dev.name}.`], sources: [stepRef(dev, step.step, step.no)] };
  const sps = stepParts(index, nxt).filter((x) => x.part);
  return { intent: 'next', text: [`After step ${step.no} comes step ${step.no + 1}: ${nxt.title}.${nxt.summary ? ' ' + nxt.summary : ''}`], list: sps.map((x) => `${x.qty === 'A/R' ? 'As required' : x.qty + ' ×'} ${x.part.id}${sz(x.part)} ${x.part.name}`), sources: [stepRef(dev, nxt, step.no + 1)], followUps: [`How do I do step ${step.no + 1}?`] };
}

function answerProblems(ctx, parts) {
  const { audit, dev, step } = ctx;
  let list = audit.findings.filter((f) => f.severity !== 'info');
  if (step) list = list.filter((f) => f.steps.some((s) => s.stepId === step.step.id && s.deviceId === dev.id));
  else if (parts.length) list = list.filter((f) => parts.some((p) => f.parts.includes(p.id)));
  else if (dev) list = list.filter((f) => !f.deviceId || f.deviceId === dev.id);
  if (!list.length) return { intent: 'problems', text: [`No open problems${step ? ` in step ${step.no}` : parts.length ? ` for ${parts.map((p) => p.id).join(', ')}` : ''}.`], sources: [{ label: 'Integrity check', href: '#/audit' }] };
  return { intent: 'problems', text: [`${list.length} problem${list.length > 1 ? 's' : ''} found${step ? ` in step ${step.no}` : ''}:`], findings: list.slice(0, 6), sources: [{ label: 'Integrity check', href: '#/audit' }] };
}

function answerSafety(ctx) {
  const { dev } = ctx;
  const steps = dev.instructions?.steps || [];
  const crit = steps.map((s, i) => ({ s, no: i + 1 })).filter(({ s }) => s.critical || s.esd || (s.warnings || []).some((w) => w.level === 'warning'));
  return {
    intent: 'safety',
    text: [crit.length ? `Safety in the ${dev.name}:` : `No step of the ${dev.name} is marked safety-critical or static-sensitive.`],
    list: crit.map(({ s, no }) => `Step ${no}, ${s.title}: ${[s.critical ? 'safety critical' : '', s.esd ? 'static-sensitive (wear the wrist strap)' : '', ...(s.warnings || []).filter((w) => w.level === 'warning').map((w) => w.text)].filter(Boolean).join('; ')}.`),
    sources: crit.map(({ s, no }) => stepRef(dev, s, no)),
  };
}

function answerHelp(ctx) {
  const { index, dev } = ctx;
  const steps = dev?.instructions?.steps || [];
  const cust = index.partList.flatMap((p) => (p.aliases || []).filter((a) => a.type === 'customer').map((a) => a.code))[0];
  const screw = index.partList.find((p) => p.category === 'screw' && index.usage.has(p.id));
  const ex = [
    steps[0] && `Which screw goes in step ${Math.min(steps.length, 3)}?`,
    steps[0] && `How do I do step 1?`,
    screw && `Torque for ${screw.id}?`,
    cust && `What is ${cust}?`,
    screw && `What is ${screw.id} easy to confuse with?`,
    'What does ISO 7380 M3x8 A2 mean?',
    dev && 'What problems are there?',
    'I found a button head screw M3 10 mm, what is it?',
  ].filter(Boolean);
  return { intent: 'help', text: [`I answer from ${dev ? `the ${dev.name} and ` : ''}this company's parts, codes, steps, BOMs and integrity check. Every answer shows where it comes from. Ask in English, Hebrew or Arabic; the part numbers work in any language.`], followUps: ex.slice(0, 6) };
}

function fallback(ctx) {
  const { index, q } = ctx;
  const res = search(index, q, { limit: 4 }).results;
  return {
    intent: 'fallback',
    confidence: 'low',
    text: res.length ? ['I could not find a direct answer in the data. These parts match your words:'] : ['I could not find this in the company\'s data. Try a part code, a step number or a size (like M3x8), or ask your supervisor.'],
    items: res.map((r) => ({ kind: 'part', part: r.part, note: r.reasons[0]?.text })),
    canAskAI: true,
    followUps: ['help'],
  };
}

/**
 * Answer a question. ctx: { deviceId, stepId, partId } from the page the person is on.
 * Returns { intent, text[], lines[{level,text}], list[], checks[], tools[], items[], findings[], why, tip, sources[{label,href}], followUps[], canAskAI, confidence }
 */
export function answer(index, audit, question, pageCtx = {}) {
  const q = String(question || '').trim();
  const dev = findDevice(index, q, pageCtx);
  const step = findStep(dev, q, pageCtx);
  const codes = findCodes(index, q);
  const parts = codes.filter((c) => c.resolution.status === 'unique').map((c) => c.resolution.part);
  if (!parts.length && pageCtx.partId && /\b(this|it)\b|זה|הזה|هذا|هذه/i.test(q) && index.parts.get(pageCtx.partId)) parts.push(index.parts.get(pageCtx.partId));
  const dec = decodeDesignation(q);
  const cat = categoryOf(q);
  const ctx = { index, audit, dev, step, q, cat };
  const is = (k) => KW[k].test(q);
  let a;
  if (!q || is('help')) a = answerHelp(ctx);
  else if (codes.some((c) => c.resolution.status === 'ambiguous') && !parts.length) a = answerWhatIs(ctx, codes);
  else if (is('diff') && parts.length) a = answerDiff(ctx, parts);
  else if (is('torque') && (parts.length || step)) a = answerTorque(ctx, parts);
  else if (is('tool') && (parts.length || step)) a = answerTool(ctx, parts);
  else if (is('howMany') && (parts.length || step)) a = answerHowMany(ctx, parts);
  else if (is('where') && parts.length) a = answerWhere(ctx, parts);
  else if (is('problems')) a = answerProblems(ctx, parts);
  else if (is('identify') && !parts.length) a = answerIdentify(ctx, dec);
  else if (is('why') && (parts.length || step)) a = answerWhy(ctx, parts);
  else if (is('next') && step && dev) a = answerNext(ctx);
  else if (is('meaning') && dec && !parts.length) a = answerMeaning(ctx, dec);
  else if (is('safety') && dev && !parts.length && !step) a = answerSafety(ctx);
  else if (step && (is('how') || (!is('which') && !cat && !parts.length && step.how !== 'context'))) a = answerHow(ctx);
  else if (step && (is('which') || cat || is('howMany'))) a = answerWhich(ctx, cat);
  else if (parts.length) a = codes.length ? answerWhatIs(ctx, codes) : answerWhere(ctx, parts);
  else if (dec && (dec.thread || dec.head)) a = (is('identify') || dec.length != null) ? answerIdentify(ctx, dec) : answerMeaning(ctx, dec);
  else if (dev && is('safety')) a = answerSafety(ctx);
  else if (dev && (is('which') || is('how')) && !step) {
    const steps = dev.instructions?.steps || [];
    a = { intent: 'pickStep', text: [`Which step of the ${dev.name}? It has ${steps.length} steps:`], followUps: steps.slice(0, 12).map((s, i) => `${is('how') ? 'How do I do' : 'Which parts for'} step ${i + 1}? (${s.title})`) };
  } else a = fallback(ctx);
  // A step read from a PDF and not reviewed yet: say so with every answer about it.
  const st = step?.step;
  const stepIntents = ['which', 'how', 'torque', 'tool', 'howMany', 'why', 'next', 'problems', 'safety'];
  if (st?.draft && stepIntents.includes(a.intent)) {
    a.lines = [{ level: 'warn', text: `Step ${step.no} is a draft read from ${st.source?.file || 'a PDF'}${st.source?.page ? `, page ${st.source.page}` : ''} and not reviewed yet. Check it against the released document.` }, ...(a.lines || [])];
  }
  return {
    lines: [], list: [], checks: [], tools: [], items: [], findings: [], sources: [], followUps: [], confidence: 'high', canAskAI: false,
    ...a,
    context: { deviceId: dev?.id || null, stepId: step?.step.id || null, stepNo: step?.no || null, partIds: parts.map((p) => p.id) },
  };
}

/**
 * Records to send to the optional AI for a question it should answer: the parts, steps, BOM lines,
 * changes and findings that relate to it. Ids match what the AI must cite.
 */
export function retrieveRecords(index, audit, question, pageCtx = {}, limit = 40) {
  const a = answer(index, audit, question, pageCtx);
  const dev = a.context.deviceId ? index.devices.get(a.context.deviceId) : null;
  const out = new Map();
  const addPart = (p) => {
    if (!p || out.has(`part:${p.id}`) || out.size >= limit) return;
    out.set(`part:${p.id}`, { id: `part:${p.id}`, type: 'part', name: p.name, category: p.category, designation: p.designation, spec: p.spec, codes: (p.aliases || []).map((x) => `${x.type}:${x.code}`), torque: torqueText(p.torque), tool: p.tool, status: p.status, details: p.details });
  };
  const addStep = (d, st, no) => {
    if (!st || out.has(`step:${d.id}/${st.id}`) || out.size >= limit) return;
    out.set(`step:${d.id}/${st.id}`, { id: `step:${d.id}/${st.id}`, type: 'step', device: d.name, number: no, title: st.title, summary: st.summary, parts: (st.parts || []).map((r) => `${r.qty} x ${r.code}${r.torque ? ` @ ${r.torque.value} N·m` : ''}`), tools: st.tools, instructions: st.instructions, checks: st.checks, warnings: st.warnings, why: st.why, critical: !!st.critical, esd: !!st.esd, ...(st.draft ? { draft: `read automatically from ${st.source?.file || 'a PDF'}, not reviewed by an engineer` } : {}) });
    for (const sp of stepParts(index, st)) addPart(sp.part);
  };
  a.context.partIds.forEach((id) => addPart(index.parts.get(id)));
  for (const it of a.items || []) addPart(it.part);
  if (dev && a.context.stepId) { const i = dev.instructions.steps.findIndex((s) => s.id === a.context.stepId); addStep(dev, dev.instructions.steps[i], i + 1); }
  for (const r of search(index, question, { limit: 8 }).results) addPart(r.part);
  if (dev) {
    for (const line of dev.bom?.lines || []) {
      const r = resolveCode(index, line.code);
      if (r.part && out.has(`part:${r.part.id}`) && out.size < limit) out.set(`bom:${dev.id}/${line.item}`, { id: `bom:${dev.id}/${line.item}`, type: 'bom-line', device: dev.name, bomRev: dev.bom.rev, item: line.item, code: line.code, part: r.part.id, qty: line.qty, where: line.where });
    }
    for (const c of dev.changes || []) if (out.size < limit) out.set(`change:${c.eco}`, { id: `change:${c.eco}`, type: 'engineering-change', rev: c.rev, date: c.date, text: c.text, parts: c.parts });
    if (!a.context.stepId && out.size < limit / 2) (dev.instructions?.steps || []).forEach((st, i) => addStep(dev, st, i + 1));
  }
  for (const f of audit.findings) {
    if (out.size >= limit) break;
    if (f.parts.some((id) => out.has(`part:${id}`)) || f.steps.some((s) => out.has(`step:${s.deviceId}/${s.stepId}`))) out.set(`finding:${f.check}:${f.parts.join(',')}`, { id: `finding:${f.check}:${f.parts.join(',')}`, type: 'integrity-finding', severity: f.severity, title: f.title, detail: f.detail, whatToDo: f.suggestion });
  }
  return [...out.values()];
}
