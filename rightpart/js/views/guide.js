import { html, th, raw, icon, toast, beep, openDialog, fmtDate, fmtDay } from '../ui.js';
import { t, lower, listJoin } from '../core/i18n.js';
import { esc, rich } from '../ui.js';
import { stepText, partText } from '../core/content.js';
import { languageInfo, englishName } from '../lang.js';
import { stepParts, resolveCode, otherCodes, torqueText, CODE_TYPES } from '../core/model.js';
import { findLookalikes, shortDifference } from '../core/lookalike.js';
import { isFastener, sizeLabel } from '../core/dims.js';
import { drawPart } from '../draw.js';
import { get, updateRecord } from '../store.js';
import { partHref, stepHref, thumb, codePill, sevIcon } from '../components.js';
import { reportDialog } from './part.js';
import { startBuild } from './device.js';
import { CHECKS } from '../core/audit.js';
import { getMemory, forgetMemory, getSignals } from '../memory.js';
import { markSVG, markName } from '../core/signals.js';
import { mixupsAt, countOf, lastAt } from '../core/immune.js';

// The 3D viewer survives step changes inside the same device, so moving between steps is instant.
const keep = { deviceId: null, el: null, viewer: null, timer: 0 };

export default async function guide({ app, params, query, navigate }) {
  const dev = app.index.devices.get(params.device);
  if (!dev) return { title: t('Not found'), html: html`<div class="page narrow"><div class="empty">${th('No device {id}.', { id: params.device })}</div></div>` };
  const steps = dev.instructions?.steps || [];
  if (!params.step) { setTimeout(() => navigate(stepHref(dev.id, steps[0].id, query.get('mode'))), 0); return { title: dev.name, html: '' }; }
  const idx = Math.max(0, steps.findIndex((s) => s.id === params.step));
  const step = steps[idx];
  const txt = stepText(step, app.lib); // the step's words in the reader's language (codes and numbers come from the data)
  const mode = query.get('mode') === 'build' ? 'build' : 'learn';
  const buildId = query.get('build');
  const record = buildId ? await get('records', buildId) : null;
  const build = mode === 'build';
  const q = (m, extra = '') => `?mode=${m}${build && buildId ? `&build=${encodeURIComponent(buildId)}` : ''}${extra}`;
  const hrefStep = (s) => `#/guide/${encodeURIComponent(dev.id)}/${encodeURIComponent(s.id)}${q(mode)}`;

  const findings = (app.audit.byStep.get(`${dev.id}/${step.id}`) || []).filter((f) => f.severity !== 'info');
  const subst = findings.find((f) => f.check === 'likely-substitution');
  const disputedPart = subst ? subst.parts[1] : null; // the part the instructions fit
  const bomPart = subst ? subst.parts[0] : null; // the part the BOM asks for
  const sps = stepParts(app.index, step);
  const memory = await getMemory(app); // mix-ups caught at this step before (learned at the bench)
  const signals = await getSignals(app); // colour + shape marks that tell look-alike bins apart
  const usedInDevice = new Set([...app.index.usage.entries()].filter(([, u]) => u.some((x) => x.deviceId === dev.id)).map(([id]) => id));
  const doneSteps = new Set((record?.steps || []).map((s) => s.stepId));
  const lastEvents = new Map();
  for (const e of record?.events || []) if (e.stepId === step.id) lastEvents.set(e.ref, e);

  const partBlock = (sp, i) => {
    const p = sp.part;
    if (!p) return html`<div class="steppart bad"><div class="thumb"></div><div><div class="t">${th('Unknown code {code}', { code: html`<span class="code">${sp.ref.code}</span>` })}</div><div class="s">${sp.resolution.status === 'ambiguous' ? t('This code points to several parts.') : t('This code is not in the library.')}</div></div><span class="qty">${sp.qty}</span></div>`;
    const learned = mixupsAt(memory, dev.id, step.id, p.id).slice(0, 2);
    const learnedIds = new Set(learned.map((e) => e.taken));
    const looks = findLookalikes(app.lib.parts, p).filter((l) => !learnedIds.has(l.part.id) && l.score >= 0.75 && (usedInDevice.has(l.part.id) || l.score >= 0.85)).slice(0, 2);
    const flagged = disputedPart && p.id === disputedPart;
    const needsScan = build && isFastener(p);
    const ev = lastEvents.get(i);
    const legacy = sp.resolution.legacy;
    const others = otherCodes(p).slice(0, 4);
    const pt = partText(p, app.lib);
    const code = (c) => html`<span class="code">${c}</span>`;
    const mark = signals.marks.get(p.id);
    const mName = mark ? markName(mark, t) : '';
    return html`<div class="steppart ${flagged ? 'flag' : ''} ${ev?.result === 'ok' ? 'ok' : ''}" data-ref="${i}">
      <a class="thumb" href="${partHref(p.id)}" aria-label="${t('Open {name}', { name: pt.name })}">${thumb(p)}${mark ? raw(`<span class="thumb-mark">${markSVG(mark, { size: 26, title: t('Bin mark: {mark}', { mark: mName }) })}</span>`) : ''}</a>
      <div>
        <div class="t"><a href="${partHref(p.id)}" style="color:inherit;text-decoration:none">${pt.name}</a></div>
        <div class="s"><span class="code">${p.id}</span>${sizeLabel(p) ? html` · <span class="code">${sizeLabel(p)}</span>` : ''}${torqueText(sp.torque) ? html` · <b class="code">${torqueText(sp.torque)}</b>` : ''}${sp.ref.note ? ` · ${sp.ref.note}` : ''}</div>
        ${legacy ? html`<div class="warnline">${icon('history')}<span>${th('The instructions use the old code {code}.', { code: code(sp.ref.code) })}</span></div>` : ''}
        ${others.length ? html`<div class="alias">${t('Bin or bag may read:')} ${others.map((a, k) => html`${k ? ', ' : ''}<span class="code">${a.code}</span>`)}</div>` : ''}
        ${flagged ? html`<div class="warnline" style="color:var(--bad)">${icon('stop')}<span>${th('BOM rev {rev} asks for {part} ({size}) here.', { rev: dev.bom?.rev, part: html`<a href="${partHref(bomPart)}" class="code">${bomPart}</a>`, size: sizeLabel(app.index.parts.get(bomPart)) })}</span></div>` : ''}
        ${learned.map((e) => { const tp = app.index.parts.get(e.taken); return html`<div class="warnline learned">${icon('antibody')}<span>${th('Mix-up caught here before: {part} ({size}) was picked instead {n, plural, one {once} other {# times}}, last on {date}.', { part: html`<a href="${partHref(tp.id)}" class="code">${tp.id}</a>`, size: sizeLabel(tp) || partText(tp, app.lib).name, n: countOf(e), date: fmtDay(lastAt(e)) })} ${t('Difference: {diff}.', { diff: shortDifference(p, tp) })}</span></div>`; })}
        ${looks.map((l) => html`<div class="warnline">${icon('alert')}<span>${usedInDevice.has(l.part.id)
          ? th("Don't confuse with {part} ({size}): {diff}, also in this device.", { part: html`<a href="${partHref(l.part.id)}" class="code">${l.part.id}</a>`, size: sizeLabel(l.part) || l.part.name, diff: shortDifference(p, l.part) })
          : th("Don't confuse with {part} ({size}): {diff}.", { part: html`<a href="${partHref(l.part.id)}" class="code">${l.part.id}</a>`, size: sizeLabel(l.part) || l.part.name, diff: shortDifference(p, l.part) })}</span></div>`)}
      </div>
      <span class="qty ${sp.qty === 'A/R' ? 'ar' : ''}" title="${t('Quantity')}">${sp.qty === 'A/R' ? t('qty::A/R') : `×${sp.qty}`}</span>
      ${!build && (pt.function || pt.ifWrong) ? html`<details class="more verify"><summary><span class="ic">${icon('info')}</span>${t('More about this part')}<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></summary><div class="body" style="padding-inline-start:16px">
          ${pt.function ? html`<p><b>${t('What it does.')}</b> ${pt.function}</p>` : ''}
          ${pt.why ? html`<p style="margin-top:6px"><b>${t('Why this one.')}</b> ${pt.why}</p>` : ''}
          ${pt.ifWrong ? html`<p style="margin-top:6px;color:var(--bad)"><b>${t("If it's wrong.")}</b> ${pt.ifWrong}</p>` : ''}
          ${p.tool ? html`<p style="margin-top:6px"><b>${t('Tool.')}</b> ${p.tool}</p>` : ''}
        </div></details>` : ''}
      ${needsScan ? html`<div class="verify">
          ${mark ? html`<div class="markline">${raw(markSVG(mark, { size: 22 }))}<span>${th('Take it from the bin with the {mark}.', { mark: html`<b>${mName}</b>` })}</span></div>` : ''}
          <form class="verify-row" data-verify="${i}" autocomplete="off">
            <input type="text" inputmode="text" autocapitalize="characters" spellcheck="false" dir="ltr" placeholder="${t('Scan or type the bin code')}" aria-label="${t('Code on the bin for {name}', { name: pt.name })}" value="${ev?.code || ''}">
            <button class="btn" type="button" data-cam="${i}" aria-label="${t('Scan with the camera')}">${icon('scan')}</button>
            <button class="btn primary" type="submit">${t('verb::Check')}</button>
          </form>
          <div class="vslot" aria-live="assertive">${ev ? raw(verdictHTML(ev, app)) : ''}</div>
        </div>` : build ? html`<div class="verify"><label class="check ${ev?.result === 'ok' ? 'done' : ''}"><input type="checkbox" data-pick="${i}" ${ev?.result === 'ok' ? 'checked' : ''}><span>${sp.qty === 'A/R' ? t('Picked as required') : th('Picked {qty} × {name}', { qty: sp.qty, name: pt.name })}</span></label></div>` : ''}
    </div>`;
  };

  const rail = html`<nav class="steps-rail" aria-label="${t('Steps')}">${steps.map((s, i) => {
    const fl = (app.audit.byStep.get(`${dev.id}/${s.id}`) || []).some((f) => f.severity === 'critical');
    return html`<a href="${hrefStep(s)}" ${i === idx ? html`aria-current="step"` : ''} class="${doneSteps.has(s.id) ? 'done' : ''} ${fl ? 'flag' : ''}" title="${stepText(s, app.lib).title}">${doneSteps.has(s.id) ? icon('check') : i + 1}</a>`;
  })}</nav>`;
  const langName = (code) => { try { return new Intl.DisplayNames([document.documentElement.lang || 'en'], { type: 'language' }).of(code); } catch { return englishName(code); } };
  // Where the step's words come from: the original, a translation (checked or not), or the original because there is no translation yet.
  const textNote = txt.state === 'held'
    ? html`<div class="callout bad lang-note" role="note">${icon('globe')}<div><p class="t">${t('Translation held back')}</p><p>${t('The {language} translation of this step gives a number that is not in the original, so the original ({source}) is shown instead. Ask your supervisor if anything is unclear.', { language: languageInfo().native, source: langName(txt.source) })}</p></div></div>`
    : txt.state === 'missing'
    ? html`<div class="callout info lang-note" role="note">${icon('globe')}<div><p>${t('This step is not translated into {language} yet. The text below is the original ({source}). Part codes, quantities and torques are the same in every language.', { language: languageInfo().native, source: langName(txt.source) })}</p></div></div>`
    : txt.state === 'translated' && (txt.outdated || !txt.reviewed)
      ? html`<div class="callout warn lang-note" role="note">${icon('globe')}<div><p>${txt.outdated ? t('The original step changed after this translation was made. Follow the original ({source}) where they differ, and ask for the translation to be updated.', { source: langName(txt.source) }) : t('This translation has not been checked yet. If anything is unclear, compare it with the original ({source}) or ask your supervisor.', { source: langName(txt.source) })}</p></div></div>`
      : '';

  const progress = build ? (doneSteps.size / steps.length) * 100 : ((idx + 1) / steps.length) * 100;

  return {
    title: t('Step {n}: {title}', { n: idx + 1, title: txt.title }),
    html: html`<div class="page">
      <div class="row between">
        <div class="crumbs" style="margin:0"><a href="#/devices">${t('nav::Build')}</a><span>/</span><a href="#/device/${encodeURIComponent(dev.id)}">${dev.name}</a></div>
        <div class="seg" role="group" aria-label="${t('Mode')}">
          <a href="${stepHref(dev.id, step.id)}?mode=learn" ${!build ? html`aria-current="page"` : ''}>${icon('learn')}${t('mode::Learn')}</a>
          <a href="${build ? '#' : stepHref(dev.id, step.id) + '?mode=build'}" id="toBuild" ${build ? html`aria-current="page"` : ''}>${icon('scan')}${t('mode::Build')}</a>
        </div>
      </div>
      ${build && record ? html`<div class="demo-banner" style="background:var(--surface-2);color:var(--text-2)">${icon('history')}<span>${th('Recording build {serial}', { serial: html`<b class="code">${record.serial || t('no serial')}</b>` })}${record.operator ? ` · ${record.operator}` : ''} · ${t('started {date}', { date: fmtDate(record.createdAt) })} · ${t('{done}/{total} steps done', { done: doneSteps.size, total: steps.length })}</span></div>` : ''}
      ${build && !record ? html`<div class="callout info">${icon('info')}<div><p class="t">${t('Build mode without a record')}</p><p>${t('Checks still work, but nothing is saved. Start a build to record the serial number and every step.')}</p><div class="acts"><button class="btn sm primary" type="button" id="startRec">${t('Start a build')}</button></div></div></div>` : ''}
      <div class="guide">
        <div class="viewer-card">
          <div class="viewer" id="viewerSlot"></div>
        </div>
        <div class="step-panel">
          ${rail}
          <div class="progress" aria-hidden="true"><i style="width:${progress}%"></i></div>
          <div class="step-title">
            <span class="no">${t('Step {n} of {total}', { n: idx + 1, total: steps.length })}${step.critical ? ` · ${t('safety critical')}` : ''}${step.esd ? ` · ${t('static-sensitive')}` : ''}</span>
            <h1>${txt.title}</h1>
            <p>${txt.summary || ''}</p>
          </div>

          ${findings.filter((f) => f.severity === 'critical').map((f) => html`<div class="callout bad" role="alert">${sevIcon(f.severity)}<div>
            <p class="t">${rich(t('Stop. {problem}', { problem: f.title }))}</p>
            <p>${rich(f.detail)}</p>
            <p style="margin-top:6px"><b>${t('What to do:')}</b> ${rich(f.suggestion)}</p>
            <div class="acts"><a class="btn sm" href="#/audit">${icon('shield')}${CHECKS[f.check]?.label || t('Integrity check')}</a><button class="btn sm" type="button" data-report="${f.title}">${icon('flag')}${t('Report it')}</button></div>
          </div></div>`)}
          ${step.draft ? html`<div class="callout warn" role="note">${icon('alert')}<div><p class="t">${t('Draft: not reviewed yet')}</p><p>${step.source?.page ? t('This step was read automatically from {file}, page {page}. It can miss a part, a quantity or a warning: follow the released document until an engineer has reviewed it.', { file: step.source?.file || t('a PDF'), page: step.source.page }) : t('This step was read automatically from {file}. It can miss a part, a quantity or a warning: follow the released document until an engineer has reviewed it.', { file: step.source?.file || t('a PDF') })}</p></div></div>` : ''}
          ${textNote}
          ${findings.some((f) => f.severity === 'warning' && f.check !== 'draft-steps') ? html`<div class="callout warn">${icon('alert')}<div><p class="t">${t('Also checked for this step')}</p><ul class="list-plain small" style="margin-top:4px">${findings.filter((f) => f.severity === 'warning' && f.check !== 'draft-steps').map((f) => html`<li>${rich(f.title)}</li>`)}</ul></div></div>` : ''}

          ${txt.warnings.map((w) => html`<div class="warnbox ${w.level}">${icon(w.level === 'warning' ? 'stop' : w.level === 'caution' ? 'alert' : 'info')}<span>${rich(w.text)}</span></div>`)}

          <section class="stack" aria-labelledby="partsH">
            <div class="row between"><h2 id="partsH">${t('Parts for this step')}</h2>${build ? html`<span class="tiny muted">${t('Scan the bin before you fit the part. A USB scanner types into the box.')}</span>` : ''}</div>
            ${sps.map(partBlock)}
          </section>

          ${step.tools?.length ? html`<section class="stack tight"><h3>${t('Tools')}</h3><div class="tools">${step.tools.map((tool) => html`<span class="chip">${icon('wrench')}${tool}</span>`)}</div></section>` : ''}

          <section class="stack tight"><h3>${t('How')}</h3><ol class="instr">${txt.instructions.map((s) => html`<li>${rich(s)}</li>`)}</ol></section>

          ${txt.why ? (build ? html`<details class="more"><summary><span class="ic">${icon('info')}</span>${t('Why this step matters')}<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></summary><div class="body"><p>${txt.why}</p></div></details>` : html`<div class="why-box"><div class="t">${t('Why this step matters')}</div><p>${txt.why}</p></div>`) : ''}

          ${txt.checks.length ? html`<section class="stack tight"><h3>${build ? t('Check before you continue') : t('What to check')}</h3><div class="checks">${txt.checks.map((c, i) => build ? html`<label class="check"><input type="checkbox" data-check="${i}"><span>${rich(c)}</span></label>` : html`<div class="check" style="cursor:default">${icon('checkCircle')}<span>${rich(c)}</span></div>`)}</div></section>` : ''}

          <div class="row"><button class="btn sm ghost" type="button" id="reportStep">${icon('flag')}${t('Report a doubt about this step')}</button></div>

          <div class="step-nav">
            ${idx > 0 ? html`<a class="btn big" href="${hrefStep(steps[idx - 1])}">${icon('chevronLeft', 'flip')}${t('Back')}</a>` : html`<a class="btn big" href="#/device/${encodeURIComponent(dev.id)}">${icon('chevronLeft', 'flip')}${t('Overview')}</a>`}
            ${build
              ? html`<button class="btn big ok" type="button" id="complete" disabled>${icon('check')}${idx === steps.length - 1 ? t('Finish build') : t('Step done')}</button>`
              : idx < steps.length - 1 ? html`<a class="btn big primary" href="${hrefStep(steps[idx + 1])}">${t('Next')}${icon('chevronRight', 'flip')}</a>` : html`<a class="btn big primary" href="#/quiz/${encodeURIComponent(dev.id)}">${icon('quiz')}${t('Take the quiz')}</a>`}
          </div>
        </div>
      </div>
    </div>`,
    mount(root) {
      // ---- 3D viewer (kept alive between steps of the same device) ----
      clearTimeout(keep.timer);
      const slot = root.querySelector('#viewerSlot');
      if (!dev.scene) {
        // No 3D model for this device: show the step's photos and its kit of parts instead.
        disposeKeep();
        slot.classList.add('board-mode');
        slot.innerHTML = String(stepBoard(app, step, disputedPart));
      } else if (keep.deviceId === dev.id && keep.el) {
        slot.replaceWith(keep.el);
        keep.viewer?.setStep(step.id);
      } else {
        disposeKeep();
        keep.deviceId = dev.id;
        keep.el = slot;
        slot.innerHTML = String(html`<div class="vhint">${t('Drag to turn · tap a part')}</div><div class="vbar"><div class="grp"><button class="vbtn" type="button" data-v="play">${icon('replay')}${t('Replay')}</button><button class="vbtn" type="button" data-v="ghost" aria-pressed="false">${icon('eye')}${t('Show all')}</button></div><div class="grp"><button class="vbtn" type="button" data-v="reset">${icon('reset')}${t('View')}</button></div></div>`);
        import('../viewer3d.js').then(({ createViewer }) => {
          if (keep.el !== slot) return;
          keep.viewer = createViewer(slot, { app, device: dev, onPick: (part) => pickToast(part) });
          if (!keep.viewer) { slot.classList.add('board-mode'); slot.innerHTML = String(stepBoard(app, step, disputedPart)); return; }
          const current = slot.dataset.step || step.id;
          keep.viewer.setStep(current, { instantCamera: true });
        });
        slot.addEventListener('click', (e) => {
          const b = e.target.closest('[data-v]');
          if (!b || !keep.viewer) return;
          if (b.dataset.v === 'play') keep.viewer.play();
          if (b.dataset.v === 'reset') keep.viewer.resetView();
          if (b.dataset.v === 'ghost') { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(on)); keep.viewer.setGhost(on); }
        });
      }
      if (keep.el) keep.el.dataset.step = step.id;

      // ---- Build mode: verification and completion ----
      const state = new Map();
      for (const [ref, ev] of lastEvents) state.set(ref, ev.result);
      const checks = new Set();
      const btn = root.querySelector('#complete');
      const required = sps.map((sp, i) => ({ sp, i })).filter(({ sp }) => sp.part);
      // A conflict (instructions vs BOM) counts as checked, but the step then needs a recorded decision below.
      const passed = (r) => r === 'ok' || r === 'conflict' || r === 'conflict-bom';
      const canComplete = () => required.every(({ i }) => passed(state.get(i))) && checks.size === (step.checks?.length || 0);
      const refresh = () => { if (btn) btn.disabled = !canComplete(); };

      const logEvent = async (ev) => {
        if (!record) return;
        record.events = [...(record.events || []), { ...ev, stepId: step.id, at: Date.now() }];
        await updateRecord(record);
      };

      const verify = async (i, code) => {
        const sp = sps[i];
        const slotEl = root.querySelector(`[data-ref="${i}"] .vslot`);
        const card = root.querySelector(`[data-ref="${i}"]`);
        const ev = judge(app, sp, code, { disputedPart, bomPart, devRev: dev.bom?.rev });
        ev.ref = i;
        state.set(i, ev.result);
        slotEl.innerHTML = verdictHTML(ev, app);
        const v = slotEl.firstElementChild;
        v?.classList.add(ev.result === 'ok' ? 'pop' : 'shake');
        card.classList.toggle('ok', ev.result === 'ok');
        card.classList.toggle('bad', ev.result === 'wrong');
        beep(ev.result === 'ok' ? 'ok' : 'bad');
        await logEvent(ev);
        if (ev.result === 'wrong') forgetMemory(); // the next person at this step is warned
        refresh();
        if (passed(ev.result)) {
          const nextInput = [...root.querySelectorAll('[data-verify] input')].find((inp) => !passed(state.get(+inp.closest('[data-verify]').dataset.verify)));
          nextInput?.focus();
        }
      };

      root.querySelectorAll('[data-verify]').forEach((form) => {
        form.addEventListener('submit', (e) => { e.preventDefault(); const v = form.querySelector('input').value.trim(); if (v) verify(+form.dataset.verify, v); });
      });
      root.querySelectorAll('[data-cam]').forEach((b) => b.addEventListener('click', async () => {
        const { scanDialog } = await import('../scan.js');
        const code = await scanDialog({ title: t('Scan the bin'), hint: t('Hold the label inside the frame.') });
        if (code) { const inp = root.querySelector(`[data-verify="${b.dataset.cam}"] input`); inp.value = code; verify(+b.dataset.cam, code); }
      }));
      root.querySelectorAll('[data-pick]').forEach((c) => c.addEventListener('change', async () => {
        const i = +c.dataset.pick;
        state.set(i, c.checked ? 'ok' : 'none');
        c.closest('.check').classList.toggle('done', c.checked);
        await logEvent({ ref: i, partId: sps[i].part?.id, result: c.checked ? 'ok' : 'none', code: 'picked' });
        refresh();
      }));
      root.querySelectorAll('[data-check]').forEach((c) => c.addEventListener('change', () => {
        if (c.checked) checks.add(c.dataset.check); else checks.delete(c.dataset.check);
        c.closest('.check').classList.toggle('done', c.checked);
        refresh();
      }));
      refresh();

      btn?.addEventListener('click', async () => {
        if (!canComplete()) return;
        if (findings.some((f) => f.severity === 'critical')) {
          let who = '', why = '';
          const ok = await openDialog({
            title: t('This step has a critical issue'),
            body: String(html`<p>${t('The integrity check found a problem with this step. Continue only if a supervisor or engineer has confirmed what to fit.')}</p><div class="field"><label for="ovWho">${t('Confirmed by')}</label><input id="ovWho" type="text"></div><div class="field"><label for="ovWhy">${t('What was decided')}</label><textarea id="ovWhy" placeholder="${t('Example: engineering confirmed 100-0233 (M3 × 8) per BOM rev C')}"></textarea></div>`),
            actions: [{ label: t('Go back'), value: false }, { label: t('Record and continue'), value: true, danger: true }],
            onClose(d) { who = d.querySelector('#ovWho').value.trim(); why = d.querySelector('#ovWhy').value.trim(); },
          });
          if (!ok) return;
          if (!who || !why) { toast(t('Both fields are needed to continue past a critical issue.'), 'bad'); return; }
          await logEvent({ ref: -1, result: 'override', who, why });
        }
        if (record) {
          record.steps = [...(record.steps || []).filter((s) => s.stepId !== step.id), { stepId: step.id, completedAt: Date.now(), checks: [...checks].map(Number) }];
          if (idx === steps.length - 1) record.completedAt = Date.now();
          await updateRecord(record);
        }
        beep('ok');
        if (idx < steps.length - 1) navigate(hrefStep(steps[idx + 1]));
        else {
          const wrong = (record?.events || []).filter((e) => e.result === 'wrong').length;
          await openDialog({ title: t('Build complete'), body: String(html`<div class="callout ok">${icon('checkCircle')}<div><p class="t">${t('{what} is complete', { what: record?.serial || dev.name })}</p><p>${wrong ? t('{steps} steps recorded, {wrong, plural, one {# wrong part stopped at the bench before fitting} other {# wrong parts stopped at the bench before fitting}}.', { steps: steps.length, wrong }) : t('{steps} steps recorded.', { steps: steps.length })}</p></div></div>`), actions: [{ label: t('Done'), value: true, primary: true }] });
          navigate(`#/device/${encodeURIComponent(dev.id)}`);
        }
      });

      root.querySelector('#toBuild')?.addEventListener('click', (e) => {
        if (build) { e.preventDefault(); return; }
        e.preventDefault();
        startBuild(app, dev, navigate);
      });
      root.querySelector('#startRec')?.addEventListener('click', () => startBuild(app, dev, navigate));
      root.querySelector('#reportStep')?.addEventListener('click', () => reportDialog({ deviceId: dev.id, stepId: step.id, preset: `${t('Step {n}', { n: idx + 1 })} (${txt.title}): ` }));
      root.querySelectorAll('[data-report]').forEach((b) => b.addEventListener('click', () => reportDialog({ deviceId: dev.id, stepId: step.id, part: disputedPart ? app.index.parts.get(disputedPart) : null, preset: `${t('Step {n}', { n: idx + 1 })}: ${b.dataset.report}. ` })));

      const onKey = (e) => {
        if (e.target.closest('input, textarea, select, dialog')) return;
        // In right-to-left languages the next step is to the left.
        const rtl = document.documentElement.dir === 'rtl';
        const fwd = rtl ? 'ArrowLeft' : 'ArrowRight';
        const back = rtl ? 'ArrowRight' : 'ArrowLeft';
        if (!build && e.key === fwd && idx < steps.length - 1) navigate(hrefStep(steps[idx + 1]));
        if (e.key === back && idx > 0) navigate(hrefStep(steps[idx - 1]));
        if (e.key === ' ' && keep.viewer) { e.preventDefault(); keep.viewer.play(); }
      };
      document.addEventListener('keydown', onKey);

      if (build) root.querySelector('[data-verify] input')?.focus({ preventScroll: true });

      return () => {
        document.removeEventListener('keydown', onKey);
        // Keep the viewer for a moment: the next page may be another step of this device.
        keep.timer = setTimeout(() => { if (!keep.el?.isConnected) disposeKeep(); }, 1500);
      };
    },
  };
}

/** The kit for a step, for devices without a 3D model: photos (if any) and every part with its count. */
export function stepBoard(app, step, flaggedPart) {
  const sps = stepParts(app.index, step);
  return html`${(step.images || []).map((src) => html`<img class="step-photo" src="${src}" alt="${t('Photo for step: {title}', { title: stepText(step, app.lib).title })}" loading="lazy">`)}
    <div class="board">${sps.map((sp) => sp.part ? html`<a class="kit ${flaggedPart === sp.part.id ? 'flag' : ''}" href="${partHref(sp.part.id)}">${raw(drawPart(sp.part, { view: 'auto' }))}<span class="q">${sp.qty === 'A/R' ? t('qty::A/R') : `×${sp.qty}`}</span><span class="n">${partText(sp.part, app.lib).name}</span><span class="tiny muted code">${sp.part.id}</span></a>` : html`<div class="kit flag"><span class="q">?</span><span class="n">${th('Unknown code {code}', { code: sp.ref.code })}</span></div>`)}</div>`;
}

function disposeKeep() {
  try { keep.viewer?.dispose(); } catch { /* ignore */ }
  keep.viewer = null; keep.el = null; keep.deviceId = null;
}

function pickToast(part) {
  toast(`${part.id}: ${part.name}`); // name shown as recorded: this toast names what was tapped in the model
}

/** Decide whether a scanned or typed code is the right part for this step. */
export function judge(app, sp, code, { disputedPart, bomPart, devRev } = {}) {
  const r = resolveCode(app.index, code);
  const expected = sp.part;
  const base = { code, partId: expected?.id };
  if (r.status === 'unknown') return { ...base, result: 'unknown' };
  if (r.status === 'ambiguous') return { ...base, result: 'ambiguous', matches: r.matches.map((m) => m.part.id) };
  const got = r.part;
  const via = r.alias;
  if (got.id === expected.id) {
    if (disputedPart && got.id === disputedPart) return { ...base, result: 'conflict', scanned: got.id, via, bomPart, devRev };
    return { ...base, result: 'ok', scanned: got.id, via, legacy: r.legacy };
  }
  if (disputedPart && expected.id === disputedPart && got.id === bomPart) return { ...base, result: 'conflict-bom', scanned: got.id, via, devRev };
  return { ...base, result: 'wrong', scanned: got.id, via };
}

export function verdictHTML(ev, app) {
  const P = (id) => app.index.parts.get(id);
  const exp = P(ev.partId);
  const got = ev.scanned ? P(ev.scanned) : null;
  const code = (c) => html`<span class="code">${c}</span>`;
  const sized = (p) => (p ? html`<b class="code">${p.id}</b>${sizeLabel(p) ? html` (<span class="code">${sizeLabel(p)}</span>)` : ''}` : '');
  const via = ev.via && ev.via.type !== 'internal' ? `${lower(CODE_TYPES[ev.via.type] || ev.via.type)} ${ev.via.code}` : '';
  if (ev.result === 'ok') return String(html`<div class="verdict ok">${icon('checkCircle')}<div><p class="t">${t('Right part')}</p><p>${ev.code === 'picked' ? t('Picked.') : via ? th('{code} is {id} ({via}).', { code: code(ev.code), id: code(exp?.id), via }) : th('{code} is {id}.', { code: code(ev.code), id: code(exp?.id) })}${ev.legacy ? ` ${t('The bin carries an old code: ask for a new label.')}` : ''}</p></div></div>`);
  if (ev.result === 'wrong') return String(html`<div class="verdict bad">${icon('xCircle')}<div><p class="t">${t('Wrong part: do not fit it')}</p><p>${th('You scanned {code} = {part} {name}.', { code: code(ev.code), part: sized(got), name: got ? partText(got, app.lib).name : '' })} ${th('This step needs {part}.', { part: sized(exp) })} ${got && exp ? t('Difference: {diff}.', { diff: shortDifference(exp, got) }) : ''}</p><div class="vdraw">${raw(`<div>${drawPart(exp, { view: 'auto' })}<div class="tiny center">${esc(t('needed'))}</div></div><div>${got ? drawPart(got, { view: 'auto' }) : ''}<div class="tiny center">${esc(t('scanned'))}</div></div>`)}</div></div></div>`);
  if (ev.result === 'unknown') return String(html`<div class="verdict warn">${icon('alert')}<div><p class="t">${t('Unknown code')}</p><p>${th('{code} is not in the library. Check the label, try another code on the bin, or report it.', { code: code(ev.code) })}</p></div></div>`);
  if (ev.result === 'ambiguous') return String(html`<div class="verdict bad">${icon('stop')}<div><p class="t">${t('This code points to {n} parts', { n: ev.matches.length })}</p><p>${th('{code} is recorded for {parts}. It cannot prove which part is in the bin: scan another code on the label or ask your supervisor.', { code: code(ev.code), parts: listJoin(ev.matches) })}</p></div></div>`);
  if (ev.result === 'conflict') return String(html`<div class="verdict warn">${icon('alert')}<div><p class="t">${t('Matches the instructions, not the BOM')}</p><p>${th('{code} is {part}, as the instructions say. But BOM rev {rev} asks for {bom} here. Stop and ask before fitting.', { code: code(ev.code), part: sized(got), rev: ev.devRev, bom: code(ev.bomPart) })}</p></div></div>`);
  if (ev.result === 'conflict-bom') return String(html`<div class="verdict warn">${icon('alert')}<div><p class="t">${t('Matches the BOM, not the instructions')}</p><p>${th('{code} is {part}, which BOM rev {rev} asks for. The instructions are out of date here: confirm with your supervisor.', { code: code(ev.code), part: sized(got), rev: ev.devRev })}</p></div></div>`);
  return '';
}

void codePill;
