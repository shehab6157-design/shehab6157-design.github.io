import { html, icon, openDialog, toast, fmtDate } from '../ui.js';
import { resolveCode, stepParts, qtyNumber, CODE_TYPES } from '../core/model.js';
import { sizeLabel } from '../core/dims.js';
import { addRecord, listRecords } from '../store.js';
import { partHref, stepHref, findingCard, thumb } from '../components.js';

export default async function deviceView({ app, params, navigate }) {
  const dev = app.index.devices.get(params.id);
  if (!dev) return { title: 'Not found', html: html`<div class="page narrow"><div class="empty">No device ${params.id}.</div></div>` };
  const steps = dev.instructions?.steps || [];
  const findings = app.audit.findings.filter((f) => f.deviceId === dev.id);
  const crit = findings.filter((f) => f.severity === 'critical');
  const builds = (await listRecords('build')).filter((b) => b.deviceId === dev.id).slice(0, 8);

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
  for (const [id, e] of stepQty) kitMap.set(id, { part: app.index.parts.get(id), qty: e.ar ? 'A/R' : `×${e.qty}` });
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

  return {
    title: dev.name,
    html: html`<div class="page">
      <div class="page-head">
        <div>
          <div class="crumbs"><a href="#/devices">Build</a><span>/</span><span>${dev.id}</span></div>
          <h1>${dev.name}</h1>
          <p class="lede">${dev.description || ''}</p>
          <div class="row" style="margin-top:10px"><span class="chip">BOM ${dev.bom?.doc || ''} rev ${dev.bom?.rev || '?'}</span><span class="chip ${dev.bom?.rev !== dev.instructions?.rev ? 'warn' : ''}">Instructions ${dev.instructions?.doc || ''} rev ${dev.instructions?.rev || '?'}</span><span class="chip">${steps.length} steps</span></div>
        </div>
        <div class="row">
          ${steps.length ? html`<a class="btn" href="${stepHref(dev.id, steps[0].id, 'learn')}">${icon('learn')}Learn</a>
          <button class="btn primary" id="startBuild" type="button">${icon('play')}Start a build</button>
          <a class="btn" href="#/quiz/${encodeURIComponent(dev.id)}">${icon('quiz')}Quiz</a>` : ''}
          <a class="btn ${steps.length ? '' : 'primary'}" href="#/editor/${encodeURIComponent(dev.id)}">${icon('edit')}${steps.length ? 'Edit steps' : 'Write the steps'}</a>
          <a class="btn ghost" href="#/editor/new" title="Add another device">${icon('plus')}Device</a>
        </div>
      </div>

      ${crit.length ? html`<div class="callout bad">${icon('stop')}<div><p class="t">${crit.length} critical issue${crit.length > 1 ? 's' : ''} in this device's documents</p><p>${crit[0].title}.</p><div class="acts"><a class="btn sm" href="#/audit">${icon('shield')}Open the integrity check</a></div></div></div>` : ''}

      <section class="split">
        <div class="stack">
          ${dev.scene ? html`<div class="viewer" id="viewer"><div class="vhint">Drag to turn · pinch to zoom · tap a part</div>
            <div class="vbar"><div class="grp"><button class="vbtn" type="button" id="explode" aria-pressed="false">${icon('explode')}Exploded</button></div><div class="grp"><button class="vbtn" type="button" id="resetCam">${icon('reset')}Reset view</button></div></div>
          </div>
          <p class="tiny muted">The 3D model is generated from the library: each screw is drawn from its own spec, so its length on screen is its real length.</p>` : html`<div class="viewer board-mode"><div class="board">${kit.map(({ part, qty }) => html`<a class="kit" href="${partHref(part.id)}">${thumb(part)}<span class="q">${qty}</span><span class="n">${part.name}</span><span class="tiny muted code">${part.id}</span></a>`)}</div></div>
          <p class="tiny muted">No 3D model for this device: every step shows its photos and its kit of parts with true-proportion drawings. A 3D scene can be added to the library file (see the README).</p>`}
        </div>
        <div class="stack">
          <h2>Steps</h2>
          ${steps.length ? '' : html`<div class="empty">No steps yet. <a href="#/editor/${encodeURIComponent(dev.id)}">Write them</a> or import them from a spreadsheet on <a href="#/setup">Set up this company</a>.</div>`}
          <ol class="list-plain">${steps.map((s, i) => {
            const fl = (app.audit.byStep.get(`${dev.id}/${s.id}`) || []).filter((f) => f.severity !== 'info');
            const sp = stepParts(app.index, s);
            return html`<li><a class="pcard" href="${stepHref(dev.id, s.id, 'learn')}" style="grid-template-columns:44px minmax(0,1fr)">
              <span class="qty" style="min-width:44px">${i + 1}</span>
              <span><span class="t">${s.title}</span>${s.critical ? html` <span class="chip bad">critical</span>` : ''}${fl.some((f) => f.severity === 'critical') ? html` <span class="chip bad">${icon('alert')}check</span>` : fl.length ? html` <span class="chip warn">${icon('alert')}${fl.length}</span>` : ''}
              <span class="s" style="display:block">${sp.filter((x) => x.part).map((x) => `${x.qty === 'A/R' ? 'A/R' : x.qty + '×'} ${sizeLabel(x.part) || x.part.name.split(',')[0]}`).join(' · ')}</span></span>
            </a></li>`;
          })}</ol>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h2>Bill of materials, rev ${dev.bom?.rev || '?'}</h2><span class="chip">${bomRows.filter((r) => r.status !== 'ok').length ? `${bomRows.filter((r) => r.status !== 'ok').length} line${bomRows.filter((r) => r.status !== 'ok').length > 1 ? 's' : ''} disagree with the steps` : 'Matches the steps'}</span></div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Item</th><th>Code on the BOM</th><th>Part</th><th>BOM qty</th><th>In the steps</th><th></th></tr></thead>
          <tbody>${bomRows.map(({ l, r, sq, status }) => html`<tr class="${status === 'bad' ? 'flag' : ''}">
            <td>${l.item}</td>
            <td><span class="code">${l.code}</span>${r.alias && r.alias.type !== 'internal' ? html`<div class="tiny muted">${CODE_TYPES[r.alias.type]}</div>` : ''}</td>
            <td>${r.part ? html`<a href="${partHref(r.part.id)}" class="row nowrap" style="gap:8px;text-decoration:none"><span class="tthumb">${thumb(r.part)}</span><span><span class="code">${r.part.id}</span><br><span class="small">${r.part.name}</span></span></a>` : html`<span class="chip bad">${r.status === 'ambiguous' ? 'Ambiguous code' : 'Unknown code'}</span>`}</td>
            <td><b>${l.qty}</b>${l.where ? html`<div class="tiny muted">${l.where}</div>` : ''}</td>
            <td>${sq ? html`<b>${sq.ar ? 'A/R' : sq.qty}</b><div class="tiny muted">step ${[...new Set(sq.steps)].join(', ')}</div>` : html`<span class="chip bad">never</span>`}</td>
            <td>${status === 'ok' ? html`<span class="chip ok">${icon('check')}</span>` : html`<span class="chip bad">${icon('alert')}</span>`}</td>
          </tr>`)}</tbody>
        </table></div>
      </section>

      ${dev.changes?.length ? html`<section class="card"><div class="card-head"><h2>Change history</h2></div><div class="card-body"><ul class="list-plain">${dev.changes.map((c) => html`<li class="row nowrap" style="align-items:flex-start"><span class="chip ${dev.instructions?.rev && c.rev > dev.instructions.rev ? 'warn' : ''}">rev ${c.rev}</span><span><b>${c.eco}</b> · ${c.date}<br><span class="small">${c.text}</span>${dev.instructions?.rev && c.rev > dev.instructions.rev ? html`<br><span class="tiny" style="color:var(--warn);font-weight:650">Not in the instructions (rev ${dev.instructions.rev})</span>` : ''}</span></li>`)}</ul></div></section>` : ''}

      ${findings.length ? html`<section class="stack"><h2>Integrity check for this device</h2>${findings.slice(0, 4).map((f) => findingCard(f, app, { compact: true }))}${findings.length > 4 ? html`<a class="btn" href="#/audit">See all ${findings.length}</a>` : ''}</section>` : ''}

      <section class="card"><div class="card-head"><h2>Build records on this device</h2><a class="btn sm" href="#/data#records">${icon('download')}Export</a></div>
        ${builds.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Serial</th><th>Operator</th><th>Started</th><th>Progress</th></tr></thead><tbody>${builds.map((b) => html`<tr><td class="code">${b.serial || '—'}</td><td>${b.operator || '—'}</td><td>${fmtDate(b.createdAt)}</td><td>${b.completedAt ? html`<span class="chip ok">${icon('check')}complete</span>` : (() => { const done = new Set((b.steps || []).map((x) => x.stepId)); const ni = Math.max(0, steps.findIndex((x) => !done.has(x.id))); return html`<a class="chip" href="${stepHref(dev.id, steps[ni]?.id, 'build')}&build=${encodeURIComponent(b.id)}">Continue at step ${ni + 1}</a>`; })()}${(b.events || []).some((e) => e.result === 'wrong') ? html` <span class="chip bad">${(b.events || []).filter((e) => e.result === 'wrong').length} wrong scan${(b.events || []).filter((e) => e.result === 'wrong').length > 1 ? 's' : ''} stopped</span>` : ''}</td></tr>`)}</tbody></table></div>` : html`<div class="card-body muted">No builds recorded yet. "Start a build" records who built which serial number, every scan and every completed step.</div>`}
      </section>
    </div>`,
    mount(root) {
      let viewer = null;
      if (dev.scene) import('../viewer3d.js').then(({ createViewer }) => {
        const el = root.querySelector('#viewer');
        if (!el?.isConnected) return;
        viewer = createViewer(el, { app, device: dev, mode: 'overview', onPick: (part) => toast(`${part.id}: ${part.name}`) });
        if (!viewer) el.insertAdjacentHTML('beforeend', '<div class="vfallback">3D needs WebGL, which this browser does not offer. Every step still has drawings and instructions.</div>');
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
    title: `Start a build: ${dev.name}`,
    body: String(html`<p class="muted">Build mode asks you to scan or type the code on each bin before you fit its part, and records every step. The record stays on this device.</p>
      <div class="field"><label for="bSerial">Serial number</label><input id="bSerial" type="text" autocapitalize="characters" spellcheck="false" placeholder="NV1-000124"></div>
      <div class="field"><label for="bOp">Operator</label><input id="bOp" type="text" autocomplete="name" placeholder="Your name"></div>`),
    actions: [{ label: 'Cancel', value: false }, { label: 'Start', value: true, primary: true }],
    onMount(d) { d.querySelector('#bSerial').focus(); },
    onClose(d) { serial = d.querySelector('#bSerial').value.trim(); operator = d.querySelector('#bOp').value.trim(); },
  });
  if (!ok) return;
  const rec = await addRecord({ type: 'build', deviceId: dev.id, deviceName: dev.name, bomRev: dev.bom?.rev, instructionsRev: dev.instructions?.rev, serial, operator, steps: [], events: [] });
  toast(`Build started${serial ? ` for ${serial}` : ''}.`, 'ok');
  navigate(`${stepHref(dev.id, dev.instructions.steps[0].id, 'build')}&build=${encodeURIComponent(rec.id)}`);
}
