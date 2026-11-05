import { html, raw, icon, toast, beep, openDialog, fmtDate } from '../ui.js';
import { stepParts, resolveCode, otherCodes, torqueText, CODE_TYPES } from '../core/model.js';
import { findLookalikes, shortDifference } from '../core/lookalike.js';
import { isFastener, sizeLabel } from '../core/dims.js';
import { drawPart } from '../draw.js';
import { get, updateRecord } from '../store.js';
import { partHref, stepHref, thumb, codePill, sevIcon } from '../components.js';
import { reportDialog } from './part.js';
import { startBuild } from './device.js';
import { CHECKS } from '../core/audit.js';

// The 3D viewer survives step changes inside the same device, so moving between steps is instant.
const keep = { deviceId: null, el: null, viewer: null, timer: 0 };

export default async function guide({ app, params, query, navigate }) {
  const dev = app.index.devices.get(params.device);
  if (!dev) return { title: 'Not found', html: html`<div class="page narrow"><div class="empty">No device ${params.device}.</div></div>` };
  const steps = dev.instructions?.steps || [];
  if (!params.step) { setTimeout(() => navigate(stepHref(dev.id, steps[0].id, query.get('mode'))), 0); return { title: dev.name, html: '' }; }
  const idx = Math.max(0, steps.findIndex((s) => s.id === params.step));
  const step = steps[idx];
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
  const usedInDevice = new Set([...app.index.usage.entries()].filter(([, u]) => u.some((x) => x.deviceId === dev.id)).map(([id]) => id));
  const doneSteps = new Set((record?.steps || []).map((s) => s.stepId));
  const lastEvents = new Map();
  for (const e of record?.events || []) if (e.stepId === step.id) lastEvents.set(e.ref, e);

  const partBlock = (sp, i) => {
    const p = sp.part;
    if (!p) return html`<div class="steppart bad"><div class="thumb"></div><div><div class="t">Unknown code <span class="code">${sp.ref.code}</span></div><div class="s">${sp.resolution.status === 'ambiguous' ? 'This code points to several parts.' : 'This code is not in the library.'}</div></div><span class="qty">${sp.qty}</span></div>`;
    const looks = findLookalikes(app.lib.parts, p).filter((l) => l.score >= 0.75 && (usedInDevice.has(l.part.id) || l.score >= 0.85)).slice(0, 2);
    const flagged = disputedPart && p.id === disputedPart;
    const needsScan = build && isFastener(p);
    const ev = lastEvents.get(i);
    const legacy = sp.resolution.legacy;
    const others = otherCodes(p).slice(0, 4);
    return html`<div class="steppart ${flagged ? 'flag' : ''} ${ev?.result === 'ok' ? 'ok' : ''}" data-ref="${i}">
      <a class="thumb" href="${partHref(p.id)}" aria-label="Open ${p.name}">${thumb(p)}</a>
      <div>
        <div class="t"><a href="${partHref(p.id)}" style="color:inherit;text-decoration:none">${p.name}</a></div>
        <div class="s"><span class="code">${p.id}</span>${sizeLabel(p) ? ` · ${sizeLabel(p)}` : ''}${torqueText(sp.torque) ? html` · <b>${torqueText(sp.torque)}</b>` : ''}${sp.ref.note ? ` · ${sp.ref.note}` : ''}</div>
        ${legacy ? html`<div class="warnline">${icon('history')}<span>The instructions use the old code ${sp.ref.code}.</span></div>` : ''}
        ${others.length ? html`<div class="alias">Bin or bag may read: ${others.map((a, k) => html`${k ? ', ' : ''}<span class="code">${a.code}</span>`)}</div>` : ''}
        ${flagged ? html`<div class="warnline" style="color:var(--bad)">${icon('stop')}<span>BOM rev ${dev.bom?.rev} asks for <a href="${partHref(bomPart)}">${bomPart}</a> (${sizeLabel(app.index.parts.get(bomPart))}) here.</span></div>` : ''}
        ${looks.map((l) => html`<div class="warnline">${icon('alert')}<span>Don't confuse with <a href="${partHref(l.part.id)}">${l.part.id}</a> (${sizeLabel(l.part) || l.part.name}): ${shortDifference(p, l.part)}${usedInDevice.has(l.part.id) ? ', also in this device' : ''}.</span></div>`)}
      </div>
      <span class="qty ${sp.qty === 'A/R' ? 'ar' : ''}" title="Quantity">${sp.qty === 'A/R' ? 'A/R' : `×${sp.qty}`}</span>
      ${!build && (p.details?.function || p.details?.ifWrong) ? html`<details class="more verify"><summary><span class="ic">${icon('info')}</span>More about this part<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></summary><div class="body" style="padding-left:16px">
          ${p.details?.function ? html`<p><b>What it does.</b> ${p.details.function}</p>` : ''}
          ${p.details?.why ? html`<p style="margin-top:6px"><b>Why this one.</b> ${p.details.why}</p>` : ''}
          ${p.details?.ifWrong ? html`<p style="margin-top:6px;color:var(--bad)"><b>If it's wrong.</b> ${p.details.ifWrong}</p>` : ''}
          ${p.tool ? html`<p style="margin-top:6px"><b>Tool.</b> ${p.tool}</p>` : ''}
        </div></details>` : ''}
      ${needsScan ? html`<div class="verify">
          <form class="verify-row" data-verify="${i}" autocomplete="off">
            <input type="text" inputmode="text" autocapitalize="characters" spellcheck="false" placeholder="Scan or type the bin code" aria-label="Code on the bin for ${p.name}" value="${ev?.code || ''}">
            <button class="btn" type="button" data-cam="${i}" aria-label="Scan with the camera">${icon('scan')}</button>
            <button class="btn primary" type="submit">Check</button>
          </form>
          <div class="vslot" aria-live="assertive">${ev ? raw(verdictHTML(ev, app)) : ''}</div>
        </div>` : build ? html`<div class="verify"><label class="check ${ev?.result === 'ok' ? 'done' : ''}"><input type="checkbox" data-pick="${i}" ${ev?.result === 'ok' ? 'checked' : ''}><span>Picked ${sp.qty === 'A/R' ? 'as required' : `${sp.qty} × ${p.name}`}</span></label></div>` : ''}
    </div>`;
  };

  const rail = html`<nav class="steps-rail" aria-label="Steps">${steps.map((s, i) => {
    const fl = (app.audit.byStep.get(`${dev.id}/${s.id}`) || []).some((f) => f.severity === 'critical');
    return html`<a href="${hrefStep(s)}" ${i === idx ? html`aria-current="step"` : ''} class="${doneSteps.has(s.id) ? 'done' : ''} ${fl ? 'flag' : ''}" title="${s.title}">${doneSteps.has(s.id) ? icon('check') : i + 1}</a>`;
  })}</nav>`;

  const progress = build ? (doneSteps.size / steps.length) * 100 : ((idx + 1) / steps.length) * 100;

  return {
    title: `Step ${idx + 1}: ${step.title}`,
    html: html`<div class="page">
      <div class="row between">
        <div class="crumbs" style="margin:0"><a href="#/devices">Build</a><span>/</span><a href="#/device/${encodeURIComponent(dev.id)}">${dev.name}</a></div>
        <div class="seg" role="group" aria-label="Mode">
          <a href="${stepHref(dev.id, step.id)}?mode=learn" ${!build ? html`aria-current="page"` : ''}>${icon('learn')}Learn</a>
          <a href="${build ? '#' : stepHref(dev.id, step.id) + '?mode=build'}" id="toBuild" ${build ? html`aria-current="page"` : ''}>${icon('scan')}Build</a>
        </div>
      </div>
      ${build && record ? html`<div class="demo-banner" style="background:var(--surface-2);color:var(--text-2)">${icon('history')}<span>Recording build <b class="code">${record.serial || 'no serial'}</b>${record.operator ? ` · ${record.operator}` : ''} · started ${fmtDate(record.createdAt)} · ${doneSteps.size}/${steps.length} steps done</span></div>` : ''}
      ${build && !record ? html`<div class="callout info">${icon('info')}<div><p class="t">Build mode without a record</p><p>Checks still work, but nothing is saved. Start a build to record the serial number and every step.</p><div class="acts"><button class="btn sm primary" type="button" id="startRec">Start a build</button></div></div></div>` : ''}
      <div class="guide">
        <div class="viewer-card">
          <div class="viewer" id="viewerSlot"></div>
        </div>
        <div class="step-panel">
          ${rail}
          <div class="progress" aria-hidden="true"><i style="width:${progress}%"></i></div>
          <div class="step-title">
            <span class="no">Step ${idx + 1} of ${steps.length}${step.critical ? ' · safety critical' : ''}${step.esd ? ' · static-sensitive' : ''}</span>
            <h1>${step.title}</h1>
            <p>${step.summary || ''}</p>
          </div>

          ${findings.filter((f) => f.severity === 'critical').map((f) => html`<div class="callout bad" role="alert">${sevIcon(f.severity)}<div>
            <p class="t">Stop. ${f.title}</p>
            <p>${f.detail}</p>
            <p style="margin-top:6px"><b>What to do:</b> ${f.suggestion}</p>
            <div class="acts"><a class="btn sm" href="#/audit">${icon('shield')}${CHECKS[f.check]?.label || 'Integrity check'}</a><button class="btn sm" type="button" data-report="${f.title}">${icon('flag')}Report it</button></div>
          </div></div>`)}
          ${step.draft ? html`<div class="callout warn" role="note">${icon('alert')}<div><p class="t">Draft: not reviewed yet</p><p>This step was read automatically from ${step.source?.file || 'a PDF'}${step.source?.page ? `, page ${step.source.page}` : ''}. It can miss a part, a quantity or a warning: follow the released document until an engineer has reviewed it.</p></div></div>` : ''}
          ${findings.some((f) => f.severity === 'warning' && f.check !== 'draft-steps') ? html`<div class="callout warn">${icon('alert')}<div><p class="t">Also checked for this step</p><ul class="list-plain small" style="margin-top:4px">${findings.filter((f) => f.severity === 'warning' && f.check !== 'draft-steps').map((f) => html`<li>${f.title}</li>`)}</ul></div></div>` : ''}

          ${(step.warnings || []).map((w) => html`<div class="warnbox ${w.level}">${icon(w.level === 'warning' ? 'stop' : w.level === 'caution' ? 'alert' : 'info')}<span>${w.text}</span></div>`)}

          <section class="stack" aria-labelledby="partsH">
            <div class="row between"><h2 id="partsH">Parts for this step</h2>${build ? html`<span class="tiny muted">Scan the bin before you fit the part. A USB scanner types into the box.</span>` : ''}</div>
            ${sps.map(partBlock)}
          </section>

          ${step.tools?.length ? html`<section class="stack tight"><h3>Tools</h3><div class="tools">${step.tools.map((t) => html`<span class="chip">${icon('wrench')}${t}</span>`)}</div></section>` : ''}

          <section class="stack tight"><h3>How</h3><ol class="instr">${(step.instructions || []).map((s) => html`<li>${s}</li>`)}</ol></section>

          ${step.why ? (build ? html`<details class="more"><summary><span class="ic">${icon('info')}</span>Why this step matters<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></summary><div class="body"><p>${step.why}</p></div></details>` : html`<div class="why-box"><div class="t">Why this step matters</div><p>${step.why}</p></div>`) : ''}

          ${step.checks?.length ? html`<section class="stack tight"><h3>${build ? 'Check before you continue' : 'What to check'}</h3><div class="checks">${step.checks.map((c, i) => build ? html`<label class="check"><input type="checkbox" data-check="${i}"><span>${c}</span></label>` : html`<div class="check" style="cursor:default">${icon('checkCircle')}<span>${c}</span></div>`)}</div></section>` : ''}

          <div class="row"><button class="btn sm ghost" type="button" id="reportStep">${icon('flag')}Report a doubt about this step</button></div>

          <div class="step-nav">
            ${idx > 0 ? html`<a class="btn big" href="${hrefStep(steps[idx - 1])}">${icon('chevronLeft')}Back</a>` : html`<a class="btn big" href="#/device/${encodeURIComponent(dev.id)}">${icon('chevronLeft')}Overview</a>`}
            ${build
              ? html`<button class="btn big ok" type="button" id="complete" disabled>${icon('check')}${idx === steps.length - 1 ? 'Finish build' : 'Step done'}</button>`
              : idx < steps.length - 1 ? html`<a class="btn big primary" href="${hrefStep(steps[idx + 1])}">Next${icon('chevronRight')}</a>` : html`<a class="btn big primary" href="#/quiz/${encodeURIComponent(dev.id)}">${icon('quiz')}Take the quiz</a>`}
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
        slot.innerHTML = String(html`<div class="vhint">Drag to turn · tap a part</div><div class="vbar"><div class="grp"><button class="vbtn" type="button" data-v="play">${icon('replay')}Replay</button><button class="vbtn" type="button" data-v="ghost" aria-pressed="false">${icon('eye')}Show all</button></div><div class="grp"><button class="vbtn" type="button" data-v="reset">${icon('reset')}View</button></div></div>`);
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
        const code = await scanDialog({ title: 'Scan the bin', hint: 'Hold the label inside the frame.' });
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
            title: 'This step has a critical issue',
            body: String(html`<p>The integrity check found a problem with this step. Continue only if a supervisor or engineer has confirmed what to fit.</p><div class="field"><label for="ovWho">Confirmed by</label><input id="ovWho" type="text"></div><div class="field"><label for="ovWhy">What was decided</label><textarea id="ovWhy" placeholder="Example: engineering confirmed 100-0233 (M3 × 8) per BOM rev C"></textarea></div>`),
            actions: [{ label: 'Go back', value: false }, { label: 'Record and continue', value: true, danger: true }],
            onClose(d) { who = d.querySelector('#ovWho').value.trim(); why = d.querySelector('#ovWhy').value.trim(); },
          });
          if (!ok) return;
          if (!who || !why) { toast('Both fields are needed to continue past a critical issue.', 'bad'); return; }
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
          await openDialog({ title: 'Build complete', body: String(html`<div class="callout ok">${icon('checkCircle')}<div><p class="t">${record?.serial || dev.name} is complete</p><p>${steps.length} steps recorded${wrong ? `, ${wrong} wrong part${wrong > 1 ? 's' : ''} stopped at the bench before fitting` : ''}.</p></div></div>`), actions: [{ label: 'Done', value: true, primary: true }] });
          navigate(`#/device/${encodeURIComponent(dev.id)}`);
        }
      });

      root.querySelector('#toBuild')?.addEventListener('click', (e) => {
        if (build) { e.preventDefault(); return; }
        e.preventDefault();
        startBuild(app, dev, navigate);
      });
      root.querySelector('#startRec')?.addEventListener('click', () => startBuild(app, dev, navigate));
      root.querySelector('#reportStep')?.addEventListener('click', () => reportDialog({ deviceId: dev.id, stepId: step.id, preset: `Step ${idx + 1} (${step.title}): ` }));
      root.querySelectorAll('[data-report]').forEach((b) => b.addEventListener('click', () => reportDialog({ deviceId: dev.id, stepId: step.id, part: disputedPart ? app.index.parts.get(disputedPart) : null, preset: `Step ${idx + 1}: ${b.dataset.report}. ` })));

      const onKey = (e) => {
        if (e.target.closest('input, textarea, select, dialog')) return;
        if (!build && e.key === 'ArrowRight' && idx < steps.length - 1) navigate(hrefStep(steps[idx + 1]));
        if (e.key === 'ArrowLeft' && idx > 0) navigate(hrefStep(steps[idx - 1]));
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
  return html`${(step.images || []).map((src) => html`<img class="step-photo" src="${src}" alt="Photo for step: ${step.title}" loading="lazy">`)}
    <div class="board">${sps.map((sp) => sp.part ? html`<a class="kit ${flaggedPart === sp.part.id ? 'flag' : ''}" href="${partHref(sp.part.id)}">${raw(drawPart(sp.part, { view: 'auto' }))}<span class="q">${sp.qty === 'A/R' ? 'A/R' : `×${sp.qty}`}</span><span class="n">${sp.part.name}</span><span class="tiny muted code">${sp.part.id}</span></a>` : html`<div class="kit flag"><span class="q">?</span><span class="n">Unknown code ${sp.ref.code}</span></div>`)}</div>`;
}

function disposeKeep() {
  try { keep.viewer?.dispose(); } catch { /* ignore */ }
  keep.viewer = null; keep.el = null; keep.deviceId = null;
}

function pickToast(part) {
  toast(`${part.id}: ${part.name}`);
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
  const viaText = ev.via && ev.via.type !== 'internal' ? ` (${(CODE_TYPES[ev.via.type] || ev.via.type).toLowerCase()} ${ev.via.code})` : '';
  if (ev.result === 'ok') return String(html`<div class="verdict ok">${icon('checkCircle')}<div><p class="t">Right part</p><p>${ev.code === 'picked' ? 'Picked.' : html`<span class="code">${ev.code}</span> is ${exp?.id}${viaText}.`}${ev.legacy ? ' The bin carries an old code: ask for a new label.' : ''}</p></div></div>`);
  if (ev.result === 'wrong') return String(html`<div class="verdict bad">${icon('xCircle')}<div><p class="t">Wrong part: do not fit it</p><p>You scanned <span class="code">${ev.code}</span> = <b>${got?.id}</b> ${got?.name}${sizeLabel(got) ? ` (${sizeLabel(got)})` : ''}. This step needs <b>${exp?.id}</b>${sizeLabel(exp) ? ` (${sizeLabel(exp)})` : ''}. ${got && exp ? `Difference: ${shortDifference(exp, got)}.` : ''}</p><div class="vdraw">${raw(`<div>${drawPart(exp, { view: 'auto' })}<div class="tiny center">needed</div></div><div>${got ? drawPart(got, { view: 'auto' }) : ''}<div class="tiny center">scanned</div></div>`)}</div></div></div>`);
  if (ev.result === 'unknown') return String(html`<div class="verdict warn">${icon('alert')}<div><p class="t">Unknown code</p><p><span class="code">${ev.code}</span> is not in the library. Check the label, try another code on the bin, or report it.</p></div></div>`);
  if (ev.result === 'ambiguous') return String(html`<div class="verdict bad">${icon('stop')}<div><p class="t">This code points to ${ev.matches.length} parts</p><p><span class="code">${ev.code}</span> is recorded for ${ev.matches.join(' and ')}. It cannot prove which part is in the bin: scan another code on the label or ask your supervisor.</p></div></div>`);
  if (ev.result === 'conflict') return String(html`<div class="verdict warn">${icon('alert')}<div><p class="t">Matches the instructions, not the BOM</p><p><span class="code">${ev.code}</span> is ${got?.id} (${sizeLabel(got)}), as the instructions say. But BOM rev ${ev.devRev} asks for ${ev.bomPart} here. Stop and ask before fitting.</p></div></div>`);
  if (ev.result === 'conflict-bom') return String(html`<div class="verdict warn">${icon('alert')}<div><p class="t">Matches the BOM, not the instructions</p><p><span class="code">${ev.code}</span> is ${got?.id} (${sizeLabel(got)}), which BOM rev ${ev.devRev} asks for. The instructions are out of date here: confirm with your supervisor.</p></div></div>`);
  return '';
}

void codePill;
