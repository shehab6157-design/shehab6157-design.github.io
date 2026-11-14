// The 3D guide: the whole product in 3D, then one step at a time. Numbered spots show where to
// start and in which order the parts go in; the parts fly into place. Tap a part (on the model or
// in the list) and the camera flies to it. Words stay hidden until the worker asks for them.
import { html, th, raw, icon, toast } from '../ui.js';
import { t, getLanguage } from '../core/i18n.js';
import { stepText, partText } from '../core/content.js';
import { stepParts, torqueText, otherCodes } from '../core/model.js';
import { sizeLabel } from '../core/dims.js';
import { drawPart } from '../draw.js';
import { partHref, stepHref } from '../components.js';
import { getMemory, getSignals } from '../memory.js';
import { mixupsAt, countOf } from '../core/immune.js';
import { markSVG, markName } from '../core/signals.js';

export default async function show({ app, params, navigate }) {
  const dev = app.index.devices.get(params.device);
  if (!dev) return { title: t('Not found'), html: html`<div class="page narrow"><div class="empty">${th('No device {id}.', { id: params.device })}</div></div>` };
  const steps = dev.instructions?.steps || [];
  const memory = await getMemory(app);
  const signals = await getSignals(app);
  let idx = params.step ? steps.findIndex((s) => s.id === params.step) : -1;
  const rtl = () => document.documentElement.dir === 'rtl';
  const qty = (q) => (q === 'A/R' ? t('qty::A/R') : `×${q}`);
  // 3D pictures of the parts, rendered from the model once it is loaded; drawings until then (and for screws).
  const pics = new Map();
  const picOf = (p) => (pics.has(p.id) ? html`<img src="${pics.get(p.id)}" alt="" draggable="false">` : raw(drawPart(p, { view: 'auto' })));
  const uniqueParts = new Set(steps.flatMap((s) => stepParts(app.index, s).filter((sp) => sp.part).map((sp) => sp.part.id)));

  const dots = () => html`<button type="button" class="dot ov" data-go="-1" aria-label="${t('The whole product')}" ${idx < 0 ? html`aria-current="step"` : ''}>${icon('cube')}</button>${steps.map((s, i) => html`<button type="button" class="dot" data-go="${i}" aria-label="${t('Step {n}: {title}', { n: i + 1, title: stepText(s, app.lib).title })}" ${i === idx ? html`aria-current="step"` : ''}>${i + 1}</button>`)}`;

  const partChip = (sp, step) => {
    const p = sp.part;
    const mark = signals.marks.get(p.id);
    const learned = mixupsAt(memory, dev.id, step.id, p.id).length;
    return html`<button type="button" class="sp-part ${learned ? 'learned' : ''}" data-part="${p.id}" aria-label="${t('{qty} × {name}', { qty: sp.qty, name: partText(p, app.lib).name })}">
      <span class="pic">${picOf(p)}${mark ? raw(`<span class="mk">${markSVG(mark, { size: 18 })}</span>`) : ''}</span>
      <span class="q" dir="ltr">${qty(sp.qty)}</span>
      ${torqueText(sp.torque) ? html`<span class="tq" dir="ltr">${torqueText(sp.torque)}</span>` : ''}
    </button>`;
  };

  const overviewPanel = () => html`<div class="sp-ov">
      <h1>${dev.name}</h1>
      <div class="sp-meta"><span>${icon('guide')}${t('{n, plural, one {# step} other {# steps}}', { n: steps.length })}</span><span>${icon('parts')}${t('{n, plural, one {# part} other {# parts}}', { n: uniqueParts.size })}</span></div>
      <div class="sp-actions">
        <button type="button" class="btn" id="sExplode" aria-pressed="false">${icon('explode')}${t('Exploded')}</button>
        <button type="button" class="btn primary big" id="sStart">${icon('play')}${t('Start')}</button>
      </div>
    </div>`;

  const stepPanel = () => {
    const step = steps[idx];
    const txt = stepText(step, app.lib);
    const sps = stepParts(app.index, step).filter((sp) => sp.part);
    const danger = txt.warnings.filter((w) => w.level === 'warning');
    const learned = mixupsAt(memory, dev.id, step.id).filter((e) => app.index.parts.has(e.taken))[0];
    const last = idx === steps.length - 1;
    return html`<div class="sp-step">
      <div class="sp-head"><span class="sp-num">${idx + 1}</span><h2 dir="auto">${txt.title}</h2><button type="button" class="sbtn" id="sInfo" aria-label="${t('More about this step')}">${icon('info')}</button></div>
      ${danger.map((w) => html`<button type="button" class="sp-warn" data-info>${icon('stop')}<span dir="auto">${w.text}</span></button>`)}
      ${learned ? html`<button type="button" class="sp-learn" data-part="${learned.expected}">${icon('antibody')}<span>${th('{part} was picked here by mistake {n, plural, one {once} other {# times}}.', { part: html`<b dir="ltr">${sizeLabel(app.index.parts.get(learned.taken)) || learned.taken}</b>`, n: countOf(learned) })}</span></button>` : ''}
      <div class="sp-parts">${sps.map((sp) => partChip(sp, step))}</div>
      <div class="sp-nav">
        <button type="button" class="btn round" id="sPrev" aria-label="${t('Back')}">${icon(rtl() ? 'chevronRight' : 'chevronLeft')}</button>
        <button type="button" class="btn round" id="sReplay" aria-label="${t('Play again')}">${icon('replay')}</button>
        <button type="button" class="btn primary grow" id="sNext">${last ? html`${icon('check')}${t('Done')}` : html`${t('Next')}${icon(rtl() ? 'chevronLeft' : 'chevronRight')}`}</button>
      </div>
    </div>`;
  };

  const partPanel = (p, sp) => {
    const pt = partText(p, app.lib);
    const mark = signals.marks.get(p.id);
    const codes = otherCodes(p).slice(0, 3);
    const more = pt.function || pt.why || pt.ifWrong || p.tool;
    return html`<div class="sp-partcard">
      <div class="sp-head"><button type="button" class="sbtn" id="sUnfocus" aria-label="${idx < 0 ? t('Back') : t('Back to the step')}">${icon(rtl() ? 'chevronRight' : 'chevronLeft')}</button><h2 dir="auto">${pt.name}</h2></div>
      <div class="pc-main">
        <div class="pic big">${picOf(p)}</div>
        <div class="pc-facts">
          <b class="code">${p.id}</b>
          ${sizeLabel(p) ? html`<span class="code">${sizeLabel(p)}</span>` : ''}
          ${sp ? html`<span class="chip" dir="ltr">${qty(sp.qty)}</span>` : ''}
          ${torqueText(sp?.torque || p.torque) ? html`<span class="chip" dir="ltr">${torqueText(sp?.torque || p.torque)}</span>` : ''}
          ${mark ? html`<span class="chip">${raw(markSVG(mark, { size: 16 }))}${markName(mark, t)}</span>` : ''}
        </div>
      </div>
      ${more ? html`<details class="pc-more"><summary>${icon('info')}${t('More details')}</summary>
        ${pt.function ? html`<p><b>${t('What it does.')}</b> <span dir="auto">${pt.function}</span></p>` : ''}
        ${pt.why ? html`<p><b>${t('Why this one.')}</b> <span dir="auto">${pt.why}</span></p>` : ''}
        ${pt.ifWrong ? html`<p class="bad"><b>${t("If it's wrong.")}</b> <span dir="auto">${pt.ifWrong}</span></p>` : ''}
        ${p.tool ? html`<p><b>${t('Tool.')}</b> <span dir="auto">${p.tool}</span></p>` : ''}
        ${codes.length ? html`<p class="small">${t('Bin or bag may read:')} ${codes.map((a, i) => html`${i ? ', ' : ''}<span class="code">${a.code}</span>`)}</p>` : ''}
      </details>` : ''}
      <div class="sp-nav"><a class="btn" href="${partHref(p.id)}">${icon('parts')}${t('Part page')}</a><button type="button" class="btn primary grow" id="sUnfocus2">${idx < 0 ? t('Back') : t('Back to the step')}</button></div>
    </div>`;
  };

  const infoSheet = () => {
    const step = steps[idx];
    const txt = stepText(step, app.lib);
    return html`<div class="sh-head"><h3 dir="auto">${t('Step {n}: {title}', { n: idx + 1, title: txt.title })}</h3><button type="button" class="sbtn" data-close aria-label="${t('Close')}">${icon('x')}</button></div>
      <div class="sh-body">
        ${txt.summary ? html`<p class="lead" dir="auto">${txt.summary}</p>` : ''}
        ${txt.warnings.map((w) => html`<div class="warnbox ${w.level}">${icon(w.level === 'warning' ? 'stop' : w.level === 'caution' ? 'alert' : 'info')}<span dir="auto">${w.text}</span></div>`)}
        ${txt.instructions.length ? html`<h4>${t('How')}</h4><ol class="sh-how">${txt.instructions.map((x) => html`<li dir="auto">${x}</li>`)}</ol>` : ''}
        ${txt.checks.length ? html`<h4>${t('Check')}</h4><ul class="sh-checks">${txt.checks.map((x) => html`<li dir="auto">${icon('checkCircle')}<span>${x}</span></li>`)}</ul>` : ''}
        ${(step.tools || []).length ? html`<h4>${t('Tools')}</h4><div class="row">${step.tools.map((x) => html`<span class="chip" dir="auto">${icon('wrench')}${x}</span>`)}</div>` : ''}
        ${txt.why ? html`<h4>${t('Why')}</h4><p dir="auto">${txt.why}</p>` : ''}
        <div class="row" style="margin-top:6px"><a class="btn sm" href="${stepHref(dev.id, step.id, 'learn')}">${icon('guide')}${t('Text view')}</a><a class="btn sm" href="${stepHref(dev.id, step.id, 'build')}">${icon('scan')}${t('mode::Build')}</a></div>
      </div>`;
  };

  return {
    title: t('3D guide: {device}', { device: dev.name }),
    html: html`<div class="show" id="show">
      <div class="show-3d" id="s3d"></div>
      <div class="show-top">
        <a class="sbtn" href="#/device/${encodeURIComponent(dev.id)}" aria-label="${t('Close')}">${icon('x')}</a>
        <div class="s-dev"><b>${dev.name}</b><span id="sCount" aria-live="polite"></span></div>
        <button type="button" class="sbtn" id="sAsk" aria-label="${t('Ask a question')}">${icon('chat')}</button>
        <a class="sbtn" id="sBuild" href="${stepHref(dev.id, steps[Math.max(0, idx)]?.id || '', 'build')}" aria-label="${t('Build mode: scan each bin')}">${icon('scan')}</a>
      </div>
      <nav class="s-dots" id="sDots" aria-label="${t('Steps')}">${dots()}</nav>
      <div class="s-panel" id="sPanel"></div>
      <div class="s-sheet" id="sSheet" hidden role="dialog" aria-label="${t('More about this step')}"></div>
    </div>`,
    mount(root) {
      document.body.classList.add('immersive');
      const panel = root.querySelector('#sPanel'), sheet = root.querySelector('#sSheet'), dotsEl = root.querySelector('#sDots');
      let viewer = null, focusedPart = null, exploded = false, ro = null;

      const s3d = root.querySelector('#s3d');
      const insets = () => {
        const box = s3d.getBoundingClientRect();
        return [Math.max(0, dotsEl.getBoundingClientRect().bottom - box.top + 6), Math.max(0, box.bottom - panel.getBoundingClientRect().top + 6)];
      };
      const fitPanels = (refit) => { if (viewer) viewer.setInsets(...insets(), { refit }); };
      const closeSheet = () => { sheet.hidden = true; sheet.innerHTML = ''; };
      const openSheet = () => { sheet.innerHTML = String(infoSheet()); sheet.hidden = false; sheet.querySelector('[data-close]')?.focus(); };
      const paint = () => {
        focusedPart = null;
        panel.innerHTML = String(idx < 0 ? overviewPanel() : stepPanel());
        dotsEl.innerHTML = String(dots());
        dotsEl.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
        root.querySelector('#sCount').textContent = idx < 0 ? '' : t('{n} of {total}', { n: idx + 1, total: steps.length });
        root.querySelector('#sBuild').href = stepHref(dev.id, steps[Math.max(0, idx)]?.id || '', 'build');
        if (!viewer) root.querySelector('#s3d').innerHTML = idx < 0 || !boardFn ? '' : String(boardFn(app, steps[idx]));
      };
      const go = (i) => {
        idx = Math.max(-1, Math.min(steps.length - 1, i));
        closeSheet();
        history.replaceState(null, '', `#/show/${encodeURIComponent(dev.id)}${idx >= 0 ? `/${encodeURIComponent(steps[idx].id)}` : ''}`);
        app.context = { deviceId: dev.id, stepId: idx >= 0 ? steps[idx].id : null, partId: null };
        paint();
        fitPanels(false);
        viewer?.setStep(idx < 0 ? null : steps[idx].id);
        if (idx < 0) viewer?.setExploded(exploded);
      };
      const focusPart = (id) => {
        const p = app.index.parts.get(id);
        if (!p) return;
        const sp = idx >= 0 ? stepParts(app.index, steps[idx]).find((x) => x.part?.id === id) : null;
        focusedPart = id;
        app.context = { ...app.context, partId: id };
        closeSheet();
        panel.innerHTML = String(partPanel(p, sp));
        fitPanels(false);
        if (viewer && !viewer.focus(id)) toast(t('This part is not in the 3D model.'), '', 2500);
      };
      const unfocus = () => { if (!focusedPart) return; app.context = { ...app.context, partId: null }; paint(); fitPanels(false); viewer?.clearFocus(); };

      panel.addEventListener('click', (e) => {
        const b = e.target.closest('button, a');
        if (!b) return;
        if (b.id === 'sStart') go(0);
        else if (b.id === 'sNext') { if (idx >= steps.length - 1) { toast(t('All steps done.'), 'ok'); go(-1); } else go(idx + 1); }
        else if (b.id === 'sPrev') go(idx - 1);
        else if (b.id === 'sReplay') viewer?.play();
        else if (b.id === 'sInfo' || b.hasAttribute('data-info')) openSheet();
        else if (b.id === 'sExplode') { exploded = !exploded; b.setAttribute('aria-pressed', String(exploded)); viewer?.setExploded(exploded); }
        else if (b.id === 'sUnfocus' || b.id === 'sUnfocus2') unfocus();
        else if (b.dataset.part) focusPart(b.dataset.part);
      });
      dotsEl.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) go(+b.dataset.go); });
      root.querySelector('#sAsk').addEventListener('click', async () => { const { openAskPanel } = await import('../askpanel.js'); openAskPanel({ app, navigate }); });
      sheet.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeSheet(); });

      // Swipe on the panel: next and back (mirrored in right-to-left languages).
      let sx = null;
      panel.addEventListener('pointerdown', (e) => { sx = e.clientX; });
      panel.addEventListener('pointerup', (e) => {
        if (sx == null || focusedPart || idx < 0) { sx = null; return; }
        const dx = e.clientX - sx; sx = null;
        if (Math.abs(dx) < 70) return;
        const forward = rtl() ? dx > 0 : dx < 0;
        go(idx + (forward ? 1 : -1));
      });
      const onKey = (e) => {
        if (e.target.closest('input, textarea, select')) return;
        if (e.key === 'Escape') { if (!sheet.hidden) closeSheet(); else unfocus(); return; }
        const next = rtl() ? 'ArrowLeft' : 'ArrowRight', back = rtl() ? 'ArrowRight' : 'ArrowLeft';
        if (e.key === next && idx < steps.length - 1) go(idx + 1);
        if (e.key === back && idx > -1) go(idx - 1);
      };
      document.addEventListener('keydown', onKey);

      let boardFn = null;
      paint();
      import('../viewer3d.js').then(({ createViewer }) => {
        const el = root.querySelector('#s3d');
        if (!el?.isConnected) return;
        const [top, bottom] = insets();
        viewer = dev.scene ? createViewer(el, { app, device: dev, mode: idx < 0 ? 'overview' : 'step', hotspots: true, autoRotate: true, insets: { top, bottom }, onPick: (p) => focusPart(p.id) }) : null;
        if (viewer) {
          try { for (const [id, url] of viewer.thumbnails()) pics.set(id, url); } catch { /* drawings stay */ }
          if (pics.size && idx >= 0 && !focusedPart) paint();
          if (idx >= 0) viewer.setStep(steps[idx].id, { instantCamera: true });
          // The panel grows and shrinks (warnings, "More details"): keep the model in the space above it.
          ro = new ResizeObserver(() => fitPanels(true));
          ro.observe(panel);
          return;
        }
        // No 3D model (or no WebGL): show each step's kit of parts instead.
        import('./guide.js').then((m) => { boardFn = m.stepBoard; el.classList.add('board-mode'); paint(); });
      });

      return () => {
        document.body.classList.remove('immersive');
        document.removeEventListener('keydown', onKey);
        ro?.disconnect();
        try { viewer?.dispose(); } catch { /* ignore */ }
      };
    },
  };
}

void getLanguage;
