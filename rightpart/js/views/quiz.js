import { html, raw, icon, beep } from '../ui.js';
import { t, lower } from '../core/i18n.js';
import { stepText, partText } from '../core/content.js';
import { drawPart, drawChoice } from '../draw.js';
import { stepParts, torqueText, CODE_TYPES } from '../core/model.js';
import { findLookalikes, shortDifference } from '../core/lookalike.js';
import { isFastener, sizeLabel, DRIVES } from '../core/dims.js';
import { decodeDesignation, summarizeDecoded } from '../core/decode.js';
import { settings, setSetting } from '../store.js';
import { getMemory } from '../memory.js';
import { countOf } from '../core/immune.js';

const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const pick = (a) => a[Math.floor(Math.random() * a.length)];

/**
 * Mix-ups really caught at the bench come first, like a vaccine: a new person meets each one in the
 * quiz before meeting it on the line. Never from a step with open issues.
 */
function learnedQuestions(app, dev, memory) {
  const steps = dev.instructions?.steps || [];
  const out = [];
  for (const e of memory?.all || []) {
    if (e.deviceId !== dev.id) continue;
    const i = steps.findIndex((s) => s.id === e.stepId);
    const need = app.index.parts.get(e.expected), took = app.index.parts.get(e.taken);
    if (i < 0 || !need || !took || out.some((q) => q.key === `${e.stepId}|${e.expected}`)) continue;
    if ((app.audit.byStep.get(`${dev.id}/${e.stepId}`) || []).some((f) => f.severity !== 'info')) continue;
    const others = findLookalikes(app.lib.parts, need).filter((l) => !l.duplicate && l.part.id !== took.id && l.part.status !== 'obsolete').slice(0, 2).map((l) => l.part);
    const opts = [need, took, ...others];
    // Same size on every option (Phillips or Pozidriv, steel or stainless): name them in full, and draw the head from above.
    const sameSize = new Set(opts.map((p) => sizeLabel(p))).size < opts.length;
    const label = (p) => (!sameSize && sizeLabel(p)) || partText(p, app.lib).name;
    const view = need.spec?.drive && took.spec?.drive && need.spec.drive !== took.spec.drive ? 'top' : 'side';
    out.push({
      kind: 'learned', key: `${e.stepId}|${e.expected}`,
      prompt: t('Step {n}, “{title}”: the wrong part has been picked here before. Which one goes here?', { n: i + 1, title: stepText(steps[i], app.lib).title }),
      options: shuffle(opts).map((p) => ({ id: p.id, part: isFastener(p) ? p : null, view, label: label(p), sub: p.id })),
      answer: need.id,
      explain: [`${need.id} (${label(need)}).`, t('{part} was picked here by mistake {n, plural, one {once} other {# times}}.', { part: `${took.id} (${label(took)})`, n: countOf(e) }), t('Difference: {diff}.', { diff: shortDifference(need, took) })].join(' '),
    });
    if (out.length >= 3) break;
  }
  return out;
}

function buildQuestions(app, dev, memory) {
  const steps = dev.instructions?.steps || [];
  const learned = learnedQuestions(app, dev, memory);
  const qs = [];
  const fasteners = app.lib.parts.filter((p) => isFastener(p) && p.status !== 'obsolete');
  // a) which part goes here (only steps without open issues: never train on a disputed step)
  for (const [i, s] of steps.entries()) {
    if ((app.audit.byStep.get(`${dev.id}/${s.id}`) || []).some((f) => f.severity !== 'info')) continue;
    for (const sp of stepParts(app.index, s)) {
      if (!sp.part || sp.part.category !== 'screw') continue;
      if (learned.some((q) => q.key === `${s.id}|${sp.part.id}`)) continue;
      const looks = findLookalikes(app.lib.parts, sp.part).filter((l) => !l.duplicate && l.part.status !== 'obsolete').slice(0, 3);
      if (looks.length < 2) continue;
      qs.push({
        kind: 'which', prompt: t('Step {n}, “{title}”: which screw goes here?', { n: i + 1, title: stepText(s, app.lib).title }),
        options: shuffle([sp.part, ...looks.map((l) => l.part)]).map((p) => ({ id: p.id, part: p, label: sizeLabel(p) })),
        answer: sp.part.id,
        explain: [`${sp.part.id} (${sizeLabel(sp.part)}).`, partText(sp.part, app.lib).why, looks[0] ? t('The look-alike {id} is {diff}.', { id: looks[0].part.id, diff: shortDifference(sp.part, looks[0].part) }) : ''].filter(Boolean).join(' '),
      });
    }
  }
  // b) torque
  const torqued = steps.flatMap((s, i) => stepParts(app.index, s).filter((sp) => sp.part && sp.torque?.value).map((sp) => ({ s, i, sp })));
  for (const x of shuffle(torqued).slice(0, 2)) {
    const v = x.sp.torque.value;
    const opts = [...new Set([v, Math.round(v * 2 * 10) / 10, Math.round(v * 0.5 * 100) / 100, Math.round((v + 0.8) * 10) / 10])].slice(0, 4);
    const pt = partText(x.sp.part, app.lib);
    qs.push({ kind: 'torque', prompt: t('What torque for {part} in step {n}?', { part: sizeLabel(x.sp.part) ? `${x.sp.part.id} (${sizeLabel(x.sp.part)})` : pt.name.split(',')[0], n: x.i + 1 }), options: shuffle(opts).map((o) => ({ id: String(o), label: `${o} N·m` })), answer: String(v), explain: `${torqueText(x.sp.torque)}. ${pt.ifWrong || t('Too loose shakes out; too tight strips the thread or cracks the part.')}` });
  }
  // c) codes
  const withCust = app.lib.parts.filter((p) => (p.aliases || []).some((a) => a.type === 'customer' || a.type === 'supplier') && isFastener(p));
  for (const p of shuffle(withCust).slice(0, 2)) {
    const a = pick((p.aliases || []).filter((x) => x.type === 'customer' || x.type === 'supplier'));
    const others = shuffle(fasteners.filter((q) => q.id !== p.id && q.category === p.category)).slice(0, 3);
    qs.push({ kind: 'code', prompt: t('The {type} reads {code}. Which internal part is it?', { type: lower(CODE_TYPES[a.type] || a.type), code: a.code }), options: shuffle([p, ...others]).map((q) => ({ id: q.id, label: q.id, sub: sizeLabel(q) || partText(q, app.lib).name })), answer: p.id, explain: t('{code} is {id}, {name}. Every code in RightPart leads to one part: search any of them.', { code: a.code, id: p.id, name: partText(p, app.lib).name }) });
  }
  // d) decode
  const des = shuffle(fasteners.filter((p) => p.designation && decodeDesignation(p.designation)?.standard)).slice(0, 4);
  if (des.length >= 4) {
    const p = des[0];
    qs.push({ kind: 'decode', prompt: t('What is “{code}”?', { code: p.designation }), options: shuffle(des).map((q) => ({ id: q.id, label: summarizeDecoded(decodeDesignation(q.designation)) })), answer: p.id, explain: decodeDesignation(p.designation).parts.map((x) => `${x.token}: ${x.meaning}`).join(' ') });
  }
  // e) drive
  const drives = ['phillips', 'pozidriv', 'torx', 'hex'];
  const d = pick(drives);
  qs.push({ kind: 'drive', prompt: t('Which drive is this?'), figure: drawChoice('drive', d), options: shuffle(drives).map((x) => ({ id: x, label: DRIVES[x].label })), answer: d, explain: DRIVES[d].note });
  return [...learned, ...shuffle(qs)].slice(0, 8);
}

export default async function quiz({ app, params }) {
  const dev = app.index.devices.get(params.device);
  if (!dev) return { title: t('Quiz'), html: html`<div class="page narrow"><div class="empty">${t('No device {id}.', { id: params.device })}</div></div>` };
  const best = settings()[`quiz.${dev.id}`];
  const memory = await getMemory(app);
  return {
    title: t('Quiz: {device}', { device: dev.name }),
    html: html`<div class="page narrow">
      <div class="page-head"><div><div class="crumbs"><a href="#/learn">${t('mode::Learn')}</a><span>/</span><span>${t('Quiz')}</span></div><h1>${t('Quiz: {device}', { device: dev.name })}</h1><p class="lede">${t('Eight quick questions from the real device: which screw, which torque, which code.')} ${best != null ? t('Your best so far: {pct}%.', { pct: best }) : ''}</p></div></div>
      <div id="quiz" class="stack"></div>
    </div>`,
    mount(root) {
      const box = root.querySelector('#quiz');
      let qs = buildQuestions(app, dev, memory);
      let i = 0, score = 0;
      const wrong = [];
      const render = () => {
        if (i >= qs.length) {
          const pct = Math.round((score / qs.length) * 100);
          if (best == null || pct > best) setSetting(`quiz.${dev.id}`, pct);
          box.innerHTML = String(html`<div class="callout ${pct >= 80 ? 'ok' : pct >= 50 ? 'warn' : 'bad'}">${icon(pct >= 80 ? 'checkCircle' : 'info')}<div><p class="t">${t('{score} of {total} right ({pct}%)', { score, total: qs.length, pct })}</p><p>${pct >= 80 ? t('Well done. You know these parts.') : t('Have another look at the learn page and the parts below, then try again.')}</p></div></div>
            ${wrong.length ? html`<h2>${t('To review')}</h2>${wrong.map((q) => html`<div class="card pad"><b>${q.prompt}</b><p class="small" style="margin-top:6px">${q.explain}</p></div>`)}` : ''}
            <div class="row"><button class="btn primary" type="button" id="again">${icon('replay')}${t('Try again')}</button><a class="btn" href="#/device/${encodeURIComponent(dev.id)}">${t('Back to the device')}</a></div>`);
          box.querySelector('#again').addEventListener('click', () => { qs = buildQuestions(app, dev, memory); i = 0; score = 0; wrong.length = 0; render(); });
          return;
        }
        const q = qs[i];
        box.innerHTML = String(html`<div class="progress"><i style="width:${(i / qs.length) * 100}%"></i></div>
          <p class="small muted">${t('Question {n} of {total}', { n: i + 1, total: qs.length })}</p>
          <h2>${q.prompt}</h2>
          ${q.figure ? html`<div class="drawing-box" style="min-height:140px;max-width:240px">${raw(q.figure)}</div>` : ''}
          <div class="quiz-opts">${q.options.map((o) => html`<button class="quiz-opt" type="button" data-id="${o.id}">${o.part ? raw(drawPart(o.part, { view: o.view || 'side' })) : ''}<span dir="auto">${o.label}</span>${o.sub ? html`<span class="small muted">${o.sub}</span>` : ''}</button>`)}</div>
          <div id="fb" aria-live="polite"></div>`);
        box.querySelectorAll('.quiz-opt').forEach((b) => b.addEventListener('click', () => {
          const right = b.dataset.id === q.answer;
          if (right) score++; else wrong.push(q);
          beep(right ? 'ok' : 'bad');
          box.querySelectorAll('.quiz-opt').forEach((x) => { x.disabled = true; if (x.dataset.id === q.answer) x.classList.add('right'); });
          if (!right) b.classList.add('wrong');
          box.querySelector('#fb').innerHTML = String(html`<div class="callout ${right ? 'ok' : 'bad'}">${icon(right ? 'checkCircle' : 'xCircle')}<div><p class="t">${right ? t('quiz::Right') : t('Not quite')}</p><p>${q.explain}</p><div class="acts"><button class="btn primary" type="button" id="next">${i === qs.length - 1 ? t('See the result') : t('Next question')}</button></div></div></div>`);
          box.querySelector('#next').addEventListener('click', () => { i++; render(); });
          box.querySelector('#next').focus();
        }));
      };
      render();
    },
  };
}
