import { html, raw, icon, beep } from '../ui.js';
import { drawPart, drawChoice } from '../draw.js';
import { stepParts, torqueText, CODE_TYPES } from '../core/model.js';
import { findLookalikes, shortDifference } from '../core/lookalike.js';
import { isFastener, sizeLabel, DRIVES } from '../core/dims.js';
import { decodeDesignation, summarizeDecoded } from '../core/decode.js';
import { settings, setSetting } from '../store.js';

const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function buildQuestions(app, dev) {
  const steps = dev.instructions?.steps || [];
  const qs = [];
  const fasteners = app.lib.parts.filter((p) => isFastener(p) && p.status !== 'obsolete');
  // a) which part goes here (only steps without open issues: never train on a disputed step)
  for (const [i, s] of steps.entries()) {
    if ((app.audit.byStep.get(`${dev.id}/${s.id}`) || []).some((f) => f.severity !== 'info')) continue;
    for (const sp of stepParts(app.index, s)) {
      if (!sp.part || sp.part.category !== 'screw') continue;
      const looks = findLookalikes(app.lib.parts, sp.part).filter((l) => !l.duplicate && l.part.status !== 'obsolete').slice(0, 3);
      if (looks.length < 2) continue;
      qs.push({
        kind: 'which', prompt: `Step ${i + 1}, “${s.title}”: which screw goes here?`,
        options: shuffle([sp.part, ...looks.map((l) => l.part)]).map((p) => ({ id: p.id, part: p, label: sizeLabel(p) })),
        answer: sp.part.id,
        explain: `${sp.part.id} (${sizeLabel(sp.part)}). ${sp.part.details?.why || ''} ${looks[0] ? `The look-alike ${looks[0].part.id} is ${shortDifference(sp.part, looks[0].part)}.` : ''}`,
      });
    }
  }
  // b) torque
  const torqued = steps.flatMap((s, i) => stepParts(app.index, s).filter((sp) => sp.part && sp.torque?.value).map((sp) => ({ s, i, sp })));
  for (const t of shuffle(torqued).slice(0, 2)) {
    const v = t.sp.torque.value;
    const opts = [...new Set([v, Math.round(v * 2 * 10) / 10, Math.round(v * 0.5 * 100) / 100, Math.round((v + 0.8) * 10) / 10])].slice(0, 4);
    qs.push({ kind: 'torque', prompt: `What torque for ${t.sp.part.name.split(',')[0]} in step ${t.i + 1}?`, options: shuffle(opts).map((o) => ({ id: String(o), label: `${o} N·m` })), answer: String(v), explain: `${torqueText(t.sp.torque)}. ${t.sp.part.details?.ifWrong || 'Too loose shakes out; too tight strips the thread or cracks the part.'}` });
  }
  // c) codes
  const withCust = app.lib.parts.filter((p) => (p.aliases || []).some((a) => a.type === 'customer' || a.type === 'supplier') && isFastener(p));
  for (const p of shuffle(withCust).slice(0, 2)) {
    const a = pick((p.aliases || []).filter((x) => x.type === 'customer' || x.type === 'supplier'));
    const others = shuffle(fasteners.filter((q) => q.id !== p.id && q.category === p.category)).slice(0, 3);
    qs.push({ kind: 'code', prompt: `A ${(CODE_TYPES[a.type] || a.type).toLowerCase()} reads ${a.code}. Which internal part is it?`, options: shuffle([p, ...others]).map((q) => ({ id: q.id, label: q.id, sub: sizeLabel(q) || q.name })), answer: p.id, explain: `${a.code} is ${p.id}, ${p.name}. Every code in RightPart leads to one part: search any of them.` });
  }
  // d) decode
  const des = shuffle(fasteners.filter((p) => p.designation && decodeDesignation(p.designation)?.standard)).slice(0, 4);
  if (des.length >= 4) {
    const p = des[0];
    qs.push({ kind: 'decode', prompt: `What is “${p.designation}”?`, options: shuffle(des).map((q) => ({ id: q.id, label: summarizeDecoded(decodeDesignation(q.designation)) })), answer: p.id, explain: decodeDesignation(p.designation).parts.map((x) => `${x.token}: ${x.meaning}`).join(' ') });
  }
  // e) drive
  const drives = ['phillips', 'pozidriv', 'torx', 'hex'];
  const d = pick(drives);
  qs.push({ kind: 'drive', prompt: 'Which drive is this?', figure: drawChoice('drive', d), options: shuffle(drives).map((x) => ({ id: x, label: DRIVES[x].label })), answer: d, explain: DRIVES[d].note });
  return shuffle(qs).slice(0, 8);
}

export default async function quiz({ app, params }) {
  const dev = app.index.devices.get(params.device);
  if (!dev) return { title: 'Quiz', html: html`<div class="page narrow"><div class="empty">No device ${params.device}.</div></div>` };
  const best = settings()[`quiz.${dev.id}`];
  return {
    title: `Quiz: ${dev.name}`,
    html: html`<div class="page narrow">
      <div class="page-head"><div><div class="crumbs"><a href="#/learn">Learn</a><span>/</span><span>Quiz</span></div><h1>Quiz: ${dev.name}</h1><p class="lede">Eight quick questions from the real device: which screw, which torque, which code. ${best != null ? `Your best so far: ${best}%.` : ''}</p></div></div>
      <div id="quiz" class="stack"></div>
    </div>`,
    mount(root) {
      const box = root.querySelector('#quiz');
      let qs = buildQuestions(app, dev);
      let i = 0, score = 0;
      const wrong = [];
      const render = () => {
        if (i >= qs.length) {
          const pct = Math.round((score / qs.length) * 100);
          if (best == null || pct > best) setSetting(`quiz.${dev.id}`, pct);
          box.innerHTML = String(html`<div class="callout ${pct >= 80 ? 'ok' : pct >= 50 ? 'warn' : 'bad'}">${icon(pct >= 80 ? 'checkCircle' : 'info')}<div><p class="t">${score} of ${qs.length} right (${pct}%)</p><p>${pct >= 80 ? 'Well done. You know these parts.' : 'Have another look at the learn page and the parts below, then try again.'}</p></div></div>
            ${wrong.length ? html`<h2>To review</h2>${wrong.map((q) => html`<div class="card pad"><b>${q.prompt}</b><p class="small" style="margin-top:6px">${q.explain}</p></div>`)}` : ''}
            <div class="row"><button class="btn primary" type="button" id="again">${icon('replay')}Try again</button><a class="btn" href="#/device/${encodeURIComponent(dev.id)}">Back to the device</a></div>`);
          box.querySelector('#again').addEventListener('click', () => { qs = buildQuestions(app, dev); i = 0; score = 0; wrong.length = 0; render(); });
          return;
        }
        const q = qs[i];
        box.innerHTML = String(html`<div class="progress"><i style="width:${(i / qs.length) * 100}%"></i></div>
          <p class="small muted">Question ${i + 1} of ${qs.length}</p>
          <h2>${q.prompt}</h2>
          ${q.figure ? html`<div class="drawing-box" style="min-height:140px;max-width:240px">${raw(q.figure)}</div>` : ''}
          <div class="quiz-opts">${q.options.map((o) => html`<button class="quiz-opt" type="button" data-id="${o.id}">${o.part ? raw(drawPart(o.part, { view: 'side' })) : ''}<span>${o.label}</span>${o.sub ? html`<span class="small muted">${o.sub}</span>` : ''}</button>`)}</div>
          <div id="fb" aria-live="polite"></div>`);
        box.querySelectorAll('.quiz-opt').forEach((b) => b.addEventListener('click', () => {
          const right = b.dataset.id === q.answer;
          if (right) score++; else wrong.push(q);
          beep(right ? 'ok' : 'bad');
          box.querySelectorAll('.quiz-opt').forEach((x) => { x.disabled = true; if (x.dataset.id === q.answer) x.classList.add('right'); });
          if (!right) b.classList.add('wrong');
          box.querySelector('#fb').innerHTML = String(html`<div class="callout ${right ? 'ok' : 'bad'}">${icon(right ? 'checkCircle' : 'xCircle')}<div><p class="t">${right ? 'Right' : 'Not quite'}</p><p>${q.explain}</p><div class="acts"><button class="btn primary" type="button" id="next">${i === qs.length - 1 ? 'See the result' : 'Next question'}</button></div></div></div>`);
          box.querySelector('#next').addEventListener('click', () => { i++; render(); });
          box.querySelector('#next').focus();
        }));
      };
      render();
    },
  };
}
