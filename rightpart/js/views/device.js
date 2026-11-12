import { html, th, icon, openDialog, toast, fmtDate } from '../ui.js';
import { t } from '../core/i18n.js';
import { resolveCode, stepParts, qtyNumber, CODE_TYPES } from '../core/model.js';
import { sizeLabel } from '../core/dims.js';
import { stepText, partText } from '../core/content.js';
import { addRecord, listRecords, settings, setSetting } from '../store.js';
import { touchSession } from '../core/nightwatch.js';
import { depositsFrom, trails, libraryDeposits, HALF_LIFE_DAYS } from '../core/trails.js';
import { partHref, stepHref, findingCard, thumb } from '../components.js';

export default async function deviceView({ app, params, navigate }) {
  const dev = app.index.devices.get(params.id);
  if (!dev) return { title: t('Not found'), html: html`<div class="page narrow"><div class="empty">${th('No device {id}.', { id: params.id })}</div></div>` };
  const steps = dev.instructions?.steps || [];
  const findings = app.audit.findings.filter((f) => f.deviceId === dev.id);
  const crit = findings.filter((f) => f.severity === 'critical');
  const allRecords = await listRecords();
  const builds = allRecords.filter((b) => b.type === 'build' && b.deviceId === dev.id).slice(0, 8);
  const examples = libraryDeposits(app.lib);
  const trail = trails([...depositsFrom(allRecords), ...examples]).get(dev.id);
  const KIND = { wrong: (n) => t('{n, plural, one {# wrong part} other {# wrong parts}}', { n }), conflict: (n) => t('{n, plural, one {# BOM conflict} other {# BOM conflicts}}', { n }), override: (n) => t('{n, plural, one {# override} other {# overrides}}', { n }), report: (n) => t('{n, plural, one {# report} other {# reports}}', { n }), unknown: (n) => t('{n, plural, one {# unknown code} other {# unknown codes}}', { n }), slow: (n) => t('{n, plural, one {# long pause} other {# long pauses}}', { n }) };
  const STATE = { fresh: () => t('fresh'), steady: () => t('steady'), fading: () => t('fading') };
  const pname = (p) => partText(p, app.lib).name;

  // BOM vs steps
  const stepQty = new Map();
  for (const s of steps) for (const sp of stepParts(app.index, s)) {
    if (!sp.part) continue;
    const n = qtyNumber(sp.qty);
    const e = stepQty.get(sp.part.id) || { qty: 0, ar: false, steps: [] };
    if (n == null) e.ar = true; else e.qty += n;
    e.steps.push(steps.indexOf(s) + 1);
    stepQty.set(sp.part.id, e);
  }
  // Kit of every part fitted in the steps (or listed in the BOM), for devices without a 3D model.
  const kitMap = new Map();
  for (const [id, e] of stepQty) kitMap.set(id, { part: app.index.parts.get(id), qty: e.ar ? t('qty::A/R') : `×${e.qty}` });
  if (!kitMap.size) for (const l of dev.bom?.lines || []) { const r = resolveCode(app.index, l.code); if (r.part) kitMap.set(r.part.id, { part: r.part, qty: `×${l.qty}` }); }
  const kit = [...kitMap.values()].filter((k) => k.part);
  const bomRows = (dev.bom?.lines || []).map((l) => {
    const r = resolveCode(app.index, l.code);
    const sq = r.part ? stepQty.get(r.part.id) : null;
    const n = qtyNumber(l.qty);
    let status = 'ok';
    if (r.status !== 'unique') status = 'bad';
    else if (!sq) status = 'bad';
    else if (n != null && !sq.ar && sq.qty !== n) status = 'bad';
    return { l, r, sq, status };
  });
  const disagree = bomRows.filter((r) => r.status !== 'ok').length;

  return {
    title: dev.name,
    html: html`<div class="page">
      <div class="page-head">
        <div>
          <div class="crumbs"><a href="#/devices">${t('nav::Build')}</a><span>/</span><span class="code">${dev.id}</span></div>
          <h1>${dev.name}</h1>
          <p class="lede">${dev.description || ''}</p>
          <div class="row" style="margin-top:10px"><span class="chip">${t('BOM {doc} rev {rev}', { doc: dev.bom?.doc || '', rev: dev.bom?.rev || '?' })}</span><span class="chip ${dev.bom?.rev !== dev.instructions?.rev ? 'warn' : ''}">${t('Instructions {doc} rev {rev}', { doc: dev.instructions?.doc || '', rev: dev.instructions?.rev || '?' })}</span><span class="chip">${t('{n, plural, one {# step} other {# steps}}', { n: steps.length })}</span></div>
        </div>
        <div class="row">
          ${steps.length ? html`<a class="btn" href="${stepHref(dev.id, steps[0].id, 'learn')}">${icon('learn')}${t('mode::Learn')}</a>
          <button class="btn primary" id="startBuild" type="button">${icon('play')}${t('Start a build')}</button>
          <a class="btn" href="#/quiz/${encodeURIComponent(dev.id)}">${icon('quiz')}${t('Quiz')}</a>` : ''}
          <a class="btn ${steps.length ? '' : 'primary'}" href="#/editor/${encodeURIComponent(dev.id)}">${icon('edit')}${steps.length ? t('Edit steps') : t('Write the steps')}</a>
          <a class="btn ghost" href="#/editor/new" title="${t('Add another device')}">${icon('plus')}${t('Device')}</a>
        </div>
      </div>

      ${crit.length ? html`<div class="callout bad">${icon('stop')}<div><p class="t">${t("{n, plural, one {# critical issue in this device's documents} other {# critical issues in this device's documents}}", { n: crit.length })}</p><p>${crit[0].title}.</p><div class="acts"><a class="btn sm" href="#/audit">${icon('shield')}${t('Open the integrity check')}</a></div></div></div>` : ''}

      <section class="split">
        <div class="stack">
          ${dev.scene ? html`<div class="viewer" id="viewer"><div class="vhint">${t('Drag to turn · pinch to zoom · tap a part')}</div>
            <div class="vbar"><div class="grp"><button class="vbtn" type="button" id="explode" aria-pressed="false">${icon('explode')}${t('Exploded')}</button></div><div class="grp"><button class="vbtn" type="button" id="resetCam">${icon('reset')}${t('Reset view')}</button></div></div>
          </div>
          <p class="tiny muted">${t('The 3D model is generated from the library: each screw is drawn from its own spec, so its length on screen is its real length.')}</p>` : html`<div class="viewer board-mode"><div class="board">${kit.map(({ part, qty }) => html`<a class="kit" href="${partHref(part.id)}">${thumb(part)}<span class="q">${qty}</span><span class="n">${pname(part)}</span><span class="tiny muted code">${part.id}</span></a>`)}</div></div>
          <p class="tiny muted">${t('No 3D model for this device: every step shows its photos and its kit of parts with true-proportion drawings. A 3D scene can be added to the library file (see the README).')}</p>`}
        </div>
        <div class="stack">
          <h2>${t('Steps')}</h2>
          ${steps.length ? '' : html`<div class="empty">${th('No steps yet. {write} or import them from a spreadsheet on {setup}.', { write: html`<a href="#/editor/${encodeURIComponent(dev.id)}">${t('Write them')}</a>`, setup: html`<a href="#/setup">${t('Set up this company')}</a>` })}</div>`}
          <ol class="list-plain">${steps.map((s, i) => {
            const fl = (app.audit.byStep.get(`${dev.id}/${s.id}`) || []).filter((f) => f.severity !== 'info');
            const sp = stepParts(app.index, s);
            return html`<li><a class="pcard" href="${stepHref(dev.id, s.id, 'learn')}" style="grid-template-columns:44px minmax(0,1fr)">
              <span class="qty" style="min-width:44px">${i + 1}</span>
              <span><span class="t">${stepText(s, app.lib).title}</span>${s.critical ? html` <span class="chip bad">${t('critical')}</span>` : ''}${fl.some((f) => f.severity === 'critical') ? html` <span class="chip bad">${icon('alert')}${t('verb::Check')}</span>` : fl.length ? html` <span class="chip warn">${icon('alert')}${fl.length}</span>` : ''}
              <span class="s" style="display:block" dir="ltr">${sp.filter((x) => x.part).map((x) => `${x.qty === 'A/R' ? t('qty::A/R') : x.qty + '×'} ${sizeLabel(x.part) || pname(x.part).split(',')[0]}`).join(' · ')}</span></span>
            </a></li>`;
          })}</ol>
        </div>
      </section>

      ${steps.length ? html`<section class="card" id="trails">
        <div class="card-head"><div><h2>${t('Floor trails')}</h2><p class="small muted">${t('Wrong parts, overrides, reports, unknown codes and long pauses leave a mark on their step, and every mark fades by half in {days} days, like an ant trail. Strong trails show where the floor struggles now. No names: only how many, where and when.', { days: HALF_LIFE_DAYS })}</p></div>${examples.length ? html`<span class="chip">${t('example data')}</span>` : ''}</div>
        ${trail?.visible ? html`<ol class="trail-list">${steps.map((s, i) => {
          const st = trail.steps.get(s.id);
          const pct = st && trail.max ? Math.max(4, Math.round((st.strength / trail.max) * 100)) : 0;
          const revs = st ? Object.entries(st.byRev) : [];
          const cur = dev.instructions?.rev;
          return html`<li class="${st ? '' : 'quiet'}"><a href="${stepHref(dev.id, s.id, 'learn')}">
            <span class="no">${i + 1}</span>
            <span class="tl"><span class="t">${stepText(s, app.lib).title}</span>
              ${st ? html`<span class="trail-bar" aria-hidden="true"><i class="${st.state}" style="width:${pct}%"></i></span>
              <span class="tiny muted">${Object.entries(st.kinds).map(([k, n]) => KIND[k](n)).join(' · ')} · ${STATE[st.state]()}${revs.length > 1 && cur && st.byRev[cur] != null ? ` · ${t('rev {rev}: {n, plural, one {# mark} other {# marks}}, earlier revisions: {m}', { rev: cur, n: st.byRev[cur], m: revs.filter(([r]) => r !== cur).reduce((a, [, n]) => a + n, 0) })}` : ''}</span>` : html`<span class="tiny muted">${t('no trail')}</span>`}
            </span></a></li>`;
        })}</ol>` : html`<div class="card-body muted small">${trail ? t('Trails appear once marks come from at least 3 different builds or reports, so that no single build stands out.') : t('No trails yet. They form as builds are recorded on this tablet or arrive from others.')}</div>`}
      </section>` : ''}

      <section class="card">
        <div class="card-head"><h2>${t('Bill of materials, rev {rev}', { rev: dev.bom?.rev || '?' })}</h2><span class="chip">${disagree ? t('{n, plural, one {# line disagrees with the steps} other {# lines disagree with the steps}}', { n: disagree }) : t('Matches the steps')}</span></div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>${t('Item')}</th><th>${t('Code on the BOM')}</th><th>${t('Part')}</th><th>${t('BOM qty')}</th><th>${t('In the steps')}</th><th></th></tr></thead>
          <tbody>${bomRows.map(({ l, r, sq, status }) => html`<tr class="${status === 'bad' ? 'flag' : ''}">
            <td>${l.item}</td>
            <td><span class="code">${l.code}</span>${r.alias && r.alias.type !== 'internal' ? html`<div class="tiny muted">${CODE_TYPES[r.alias.type]}</div>` : ''}</td>
            <td>${r.part ? html`<a href="${partHref(r.part.id)}" class="row nowrap" style="gap:8px;text-decoration:none"><span class="tthumb">${thumb(r.part)}</span><span><span class="code">${r.part.id}</span><br><span class="small">${pname(r.part)}</span></span></a>` : html`<span class="chip bad">${r.status === 'ambiguous' ? t('Ambiguous code') : t('Unknown code')}</span>`}</td>
            <td><b>${l.qty}</b>${l.where ? html`<div class="tiny muted">${l.where}</div>` : ''}</td>
            <td>${sq ? html`<b>${sq.ar ? t('qty::A/R') : sq.qty}</b><div class="tiny muted">${t('step {n}', { n: [...new Set(sq.steps)].join(', ') })}</div>` : html`<span class="chip bad">${t('never')}</span>`}</td>
            <td>${status === 'ok' ? html`<span class="chip ok">${icon('check')}</span>` : html`<span class="chip bad">${icon('alert')}</span>`}</td>
          </tr>`)}</tbody>
        </table></div>
      </section>

      ${dev.changes?.length ? html`<section class="card"><div class="card-head"><h2>${t('Change history')}</h2></div><div class="card-body"><ul class="list-plain">${dev.changes.map((c) => html`<li class="row nowrap" style="align-items:flex-start"><span class="chip ${dev.instructions?.rev && c.rev > dev.instructions.rev ? 'warn' : ''}">${t('rev {rev}', { rev: c.rev })}</span><span><b>${c.eco}</b> · ${c.date}<br><span class="small">${c.text}</span>${dev.instructions?.rev && c.rev > dev.instructions.rev ? html`<br><span class="tiny" style="color:var(--warn);font-weight:650">${t('Not in the instructions (rev {rev})', { rev: dev.instructions.rev })}</span>` : ''}</span></li>`)}</ul></div></section>` : ''}

      ${findings.length ? html`<section class="stack"><h2>${t('Integrity check for this device')}</h2>${findings.slice(0, 4).map((f) => findingCard(f, app, { compact: true }))}${findings.length > 4 ? html`<a class="btn" href="#/audit">${t('See all {n}', { n: findings.length })}</a>` : ''}</section>` : ''}

      <section class="card"><div class="card-head"><h2>${t('Build records on this device')}</h2><a class="btn sm" href="#/data#records">${icon('download')}${t('Export')}</a></div>
        ${builds.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>${t('Serial')}</th><th>${t('Operator')}</th><th>${t('Started')}</th><th>${t('Progress')}</th></tr></thead><tbody>${builds.map((b) => {
          const wrong = (b.events || []).filter((e) => e.result === 'wrong').length;
          return html`<tr><td class="code">${b.serial || '—'}</td><td>${b.operator || '—'}</td><td>${fmtDate(b.createdAt)}</td><td>${b.completedAt ? html`<span class="chip ok">${icon('check')}${t('complete')}</span>` : (() => { const done = new Set((b.steps || []).map((x) => x.stepId)); const ni = Math.max(0, steps.findIndex((x) => !done.has(x.id))); return html`<a class="chip" href="${stepHref(dev.id, steps[ni]?.id, 'build')}&build=${encodeURIComponent(b.id)}">${t('Continue at step {n}', { n: ni + 1 })}</a>`; })()}${wrong ? html` <span class="chip bad">${t('{n, plural, one {# wrong scan stopped} other {# wrong scans stopped}}', { n: wrong })}</span>` : ''}</td></tr>`;
        })}</tbody></table></div>` : html`<div class="card-body muted">${t('No builds recorded yet. "Start a build" records who built which serial number, every scan and every completed step.')}</div>`}
      </section>
    </div>`,
    mount(root) {
      let viewer = null;
      if (dev.scene) import('../viewer3d.js').then(({ createViewer }) => {
        const el = root.querySelector('#viewer');
        if (!el?.isConnected) return;
        viewer = createViewer(el, { app, device: dev, mode: 'overview', onPick: (part) => toast(`${part.id}: ${pname(part)}`) });
        if (!viewer) { const fb = document.createElement('div'); fb.className = 'vfallback'; fb.textContent = t('3D needs WebGL, which this browser does not offer. Every step still has drawings and instructions.'); el.append(fb); }
      });
      root.querySelector('#explode')?.addEventListener('click', (e) => { const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', String(on)); viewer?.setExploded(on); });
      root.querySelector('#resetCam')?.addEventListener('click', () => viewer?.resetView());
      root.querySelector('#startBuild')?.addEventListener('click', () => startBuild(app, dev, navigate));
      return () => viewer?.dispose();
    },
  };
}

export async function startBuild(app, dev, navigate) {
  let serial = '', operator = '';
  const ok = await openDialog({
    title: t('Start a build: {device}', { device: dev.name }),
    body: String(html`<p class="muted">${t('Build mode asks you to scan or type the code on each bin before you fit its part, and records every step. The record stays on this device.')}</p>
      <div class="field"><label for="bSerial">${t('Serial number')}</label><input id="bSerial" type="text" autocapitalize="characters" spellcheck="false" dir="ltr" placeholder="NV1-000124"></div>
      <div class="field"><label for="bOp">${t('Operator')}</label><input id="bOp" type="text" autocomplete="name" placeholder="${t('Your name')}"></div>`),
    actions: [{ label: t('Cancel'), value: false }, { label: t('Start'), value: true, primary: true }],
    onMount(d) { d.querySelector('#bSerial').focus(); },
    onClose(d) { serial = d.querySelector('#bSerial').value.trim(); operator = d.querySelector('#bOp').value.trim(); },
  });
  if (!ok) return;
  // Night watch counts this tablet's stretch of use; a different operator starts a new one (no names are kept for it).
  const prev = (await listRecords('build'))[0];
  setSetting('session', touchSession(settings().session, Date.now(), { newOperator: !!operator && !!prev?.operator && prev.operator !== operator }));
  const rec = await addRecord({ type: 'build', deviceId: dev.id, deviceName: dev.name, bomRev: dev.bom?.rev, instructionsRev: dev.instructions?.rev, serial, operator, steps: [], events: [] });
  toast(serial ? t('Build started for {serial}.', { serial }) : t('Build started.'), 'ok');
  navigate(`${stepHref(dev.id, dev.instructions.steps[0].id, 'build')}&build=${encodeURIComponent(rec.id)}`);
}
