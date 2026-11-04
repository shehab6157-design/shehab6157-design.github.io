import { html, raw, icon, toast, download, confirmDialog, esc } from '../ui.js';
import { buildIndex, resolveCode } from '../core/model.js';
import { runAudit } from '../core/audit.js';
import { sizeLabel } from '../core/dims.js';
import { stepsToCSV } from '../core/importer.js';
import { currentWorkspace } from '../store.js';
import { commitLibrary, importSteps, templates } from '../importflows.js';
import { stepHref } from '../components.js';

// Step editor: anyone who knows the product can write or fix the steps here. The integrity check
// runs as you type, so a step that fits a part the BOM does not list is flagged before anyone builds it.

const lines = (a) => (a || []).join('\n');
const fromLines = (t) => String(t || '').split('\n').map((s) => s.trim()).filter(Boolean);
const warnText = (ws) => (ws || []).map((w) => `${w.level}: ${w.text}`).join('\n');
const fromWarn = (t) => fromLines(t).map((l) => { const m = l.match(/^(warning|caution|notice)\s*:\s*(.+)$/i); return m ? { level: m[1].toLowerCase(), text: m[2] } : { level: 'caution', text: l }; });

export default async function editor({ app, params, navigate }) {
  const ws = currentWorkspace();
  const role = ws.org?.role;
  const readOnly = ws.kind === 'cloud' && !['owner', 'admin', 'engineer'].includes(role);

  if (params.device === 'new') {
    return {
      title: 'New device',
      html: html`<div class="page narrow">
        <div class="crumbs"><a href="#/devices">Build</a><span>/</span><span>New device</span></div>
        <h1>Add a device</h1>
        <p class="lede">A device is one product your line builds. Give it a short id (like the drawing or ERP number) and a name; then write its steps or import them from a spreadsheet.</p>
        <form class="card pad stack" id="newDev" autocomplete="off">
          <div class="field"><label for="devId">Device id</label><input id="devId" type="text" placeholder="e.g. NV1-ASSY" maxlength="40" autocapitalize="characters" spellcheck="false"></div>
          <div class="field"><label for="devName">Name</label><input id="devName" type="text" placeholder="e.g. Nova-1 console, final assembly" maxlength="120"></div>
          <div class="field"><label for="devRev">Instructions revision</label><input id="devRev" type="text" placeholder="e.g. A" maxlength="10"></div>
          <div><button class="btn primary" type="submit" ${readOnly ? 'disabled' : ''}>Create and add steps</button></div>
        </form>
      </div>`,
      mount(root) {
        root.querySelector('#newDev').addEventListener('submit', async (e) => {
          e.preventDefault();
          const id = root.querySelector('#devId').value.trim();
          const name = root.querySelector('#devName').value.trim() || id;
          if (!/^[\w.-]{1,40}$/.test(id)) { toast('Use letters, digits, dots, dashes or underscores for the id.', 'bad', 5000); return; }
          if (app.lib.devices?.some((d) => d.id === id)) { toast('A device with this id exists already.', 'bad'); return; }
          const lib = structuredClone(app.lib);
          lib.devices = lib.devices || [];
          lib.devices.push({ id, name, description: '', bom: { rev: '', lines: [] }, instructions: { rev: root.querySelector('#devRev').value.trim(), steps: [{ id: 'S1', title: 'First step', summary: '', parts: [], tools: [], instructions: [], checks: [], warnings: [] }] } });
          await commitLibrary(app, lib, `${name} created.`);
          navigate(`#/editor/${encodeURIComponent(id)}`);
        });
      },
    };
  }

  const original = app.index.devices.get(params.device);
  if (!original) return { title: 'Not found', html: html`<div class="page narrow"><div class="empty">No device ${params.device}.</div></div>` };
  let draft = structuredClone(app.lib);
  let dev = draft.devices.find((d) => d.id === original.id);
  dev.instructions = dev.instructions || { rev: '', steps: [] };

  const hint = (index, code) => {
    if (!code.trim()) return html`<span class="muted">Type or scan any code: internal, customer or supplier</span>`;
    const r = resolveCode(index, code);
    if (r.status === 'unknown') return html`<span style="color:var(--bad)">${icon('stop')} Not in the parts library</span>`;
    if (r.status === 'ambiguous') return html`<span style="color:var(--bad)">${icon('stop')} This code points to ${r.matches.length} parts: use the internal code</span>`;
    return html`<span style="color:${r.legacy ? 'var(--warn)' : 'var(--ok)'}">${icon(r.legacy ? 'history' : 'check')} ${r.part.id} · ${r.part.name}${sizeLabel(r.part) ? ` (${sizeLabel(r.part)})` : ''}${r.legacy ? ': old code, prefer ' + r.part.id : ''}</span>`;
  };

  const stepCard = (s, i, index, audit) => {
    const issues = (audit.byStep.get(`${dev.id}/${s.id}`) || []).filter((f) => f.severity !== 'info');
    return html`<article class="editor-step ${issues.some((f) => f.severity === 'critical') ? 'flag' : ''}" data-i="${i}">
      <div class="head">
        <span class="row nowrap" style="flex:1;min-width:0"><span class="num">${i + 1}</span><input data-f="title" type="text" value="${s.title}" aria-label="Title of step ${i + 1}" style="flex:1;min-width:0;min-height:42px;padding:8px 10px;border-radius:10px;border:1px solid var(--line-2);background:var(--surface);font-weight:650;font-size:16px" ${readOnly ? 'disabled' : ''}></span>
        <span class="row" style="gap:4px">
          <button class="btn sm ghost" type="button" data-move="-1" aria-label="Move step up" ${i === 0 || readOnly ? 'disabled' : ''}>${icon('arrowUp')}</button>
          <button class="btn sm ghost" type="button" data-move="1" aria-label="Move step down" ${i === dev.instructions.steps.length - 1 || readOnly ? 'disabled' : ''}>${icon('chevronDown')}</button>
          <button class="btn sm ghost danger" type="button" data-del-step aria-label="Delete step ${i + 1}" ${readOnly ? 'disabled' : ''}>${icon('trash')}</button>
        </span>
      </div>
      <div data-issues>${issues.map((f) => html`<div class="warnline" style="color:${f.severity === 'critical' ? 'var(--bad)' : 'var(--warn)'}">${icon(f.severity === 'critical' ? 'stop' : 'alert')}<span>${f.title}</span></div>`)}</div>
      <div class="field"><label>Summary</label><input data-f="summary" type="text" value="${s.summary || ''}" ${readOnly ? 'disabled' : ''}></div>
      <div class="stack tight">
        <span class="lbl" style="font-size:14px;font-weight:650;color:var(--text-2)">Parts: code, quantity, torque (N·m)</span>
        ${(s.parts || []).map((p, k) => html`<div class="ref-row" data-r="${k}">
          <input class="code" data-pf="code" type="text" value="${p.code}" aria-label="Part code" spellcheck="false" autocapitalize="characters" ${readOnly ? 'disabled' : ''}>
          <input data-pf="qty" type="text" value="${p.qty}" aria-label="Quantity" inputmode="numeric" ${readOnly ? 'disabled' : ''}>
          <input data-pf="torque" type="text" value="${p.torque?.value ?? ''}" placeholder="N·m" aria-label="Torque" inputmode="decimal" ${readOnly ? 'disabled' : ''}>
          <button class="btn sm ghost" type="button" data-del-part aria-label="Remove part" ${readOnly ? 'disabled' : ''}>${icon('x')}</button>
          <div class="hint" data-hint>${hint(index, p.code)}</div>
        </div>`)}
        <div><button class="btn sm" type="button" data-add-part ${readOnly ? 'disabled' : ''}>${icon('plus')}Add part</button></div>
      </div>
      <div class="grid two">
        <div class="field"><label>How: one instruction per line</label><textarea data-f="instructions" ${readOnly ? 'disabled' : ''}>${lines(s.instructions)}</textarea></div>
        <div class="field"><label>Checks before moving on: one per line</label><textarea data-f="checks" ${readOnly ? 'disabled' : ''}>${lines(s.checks)}</textarea></div>
        <div class="field"><label>Tools: one per line</label><textarea data-f="tools" ${readOnly ? 'disabled' : ''}>${lines(s.tools)}</textarea></div>
        <div class="field"><label>Warnings: "caution: …", "warning: …" or "notice: …"</label><textarea data-f="warnings" ${readOnly ? 'disabled' : ''}>${warnText(s.warnings)}</textarea></div>
      </div>
      <div class="field"><label>Why this step matters (shown to learners)</label><textarea data-f="why" ${readOnly ? 'disabled' : ''}>${s.why || ''}</textarea></div>
      <div class="row"><label class="row nowrap" style="gap:8px"><input type="checkbox" data-f="critical" ${s.critical ? 'checked' : ''} ${readOnly ? 'disabled' : ''}> Safety critical</label><label class="row nowrap" style="gap:8px"><input type="checkbox" data-f="esd" ${s.esd ? 'checked' : ''} ${readOnly ? 'disabled' : ''}> Static-sensitive</label></div>
    </article>`;
  };

  const renderSteps = () => {
    const index = buildIndex(draft);
    const audit = runAudit(index);
    return { markup: String(html`${dev.instructions.steps.map((s, i) => stepCard(s, i, index, audit))}`), audit };
  };
  const first = renderSteps();

  return {
    title: `Edit steps: ${dev.name}`,
    html: html`<div class="page narrow">
      <div class="crumbs"><a href="#/devices">Build</a><span>/</span><a href="#/device/${encodeURIComponent(dev.id)}">${dev.name}</a><span>/</span><span>Edit steps</span></div>
      <div class="page-head"><div>
        <h1>Edit steps</h1>
        <p class="lede">Write each step the way you would explain it to someone new. Parts can be entered by any of their codes. The integrity check runs as you type and flags parts that are unknown, retired, look-alikes, or that disagree with the BOM.</p>
      </div><span class="chip" id="saveState" aria-live="polite">${readOnly ? 'Read only' : 'Saved'}</span></div>
      ${readOnly ? html`<div class="callout info">${icon('lock')}<div><p class="t">Only engineers can change the steps</p><p>Your role in ${ws.name} is ${role}. Report a doubt on the step instead, and an engineer will see it.</p></div></div>` : ''}
      <div class="row">
        <div class="field" style="min-width:140px"><label for="instRev">Instructions revision</label><input id="instRev" type="text" value="${dev.instructions.rev || ''}" maxlength="10" ${readOnly ? 'disabled' : ''}></div>
        <span style="flex:1"></span>
        <button class="btn" type="button" id="impSteps" ${readOnly ? 'disabled' : ''}>${icon('upload')}Import steps CSV</button>
        <button class="btn" type="button" id="expSteps">${icon('download')}Export steps CSV</button>
        <button class="btn ghost" type="button" id="tplSteps">${icon('download')}Template</button>
        <a class="btn primary" href="${stepHref(dev.id, dev.instructions.steps[0]?.id || 'S1', 'learn')}">${icon('play')}Open the guide</a>
      </div>
      <div id="critSum">${first.audit.counts.critical ? html`<div class="callout bad">${icon('stop')}<div><p class="t">${first.audit.counts.critical} critical issue${first.audit.counts.critical > 1 ? 's' : ''} in this company's data</p><p>Flagged steps have a red border. <a href="#/audit">Open the integrity check</a></p></div></div>` : ''}</div>
      <div class="stack" id="steps">${raw(first.markup)}</div>
      ${readOnly ? '' : html`<div><button class="btn big" type="button" id="addStep">${icon('plus')}Add a step</button></div>`}
    </div>`,
    mount(root) {
      const box = root.querySelector('#steps');
      const state = root.querySelector('#saveState');
      let timer = 0;
      const rerender = () => { const r = renderSteps(); box.innerHTML = r.markup; paintSummary(r.audit); };
      const paintSummary = (audit) => {
        root.querySelector('#critSum').innerHTML = audit.counts.critical ? String(html`<div class="callout bad">${icon('stop')}<div><p class="t">${audit.counts.critical} critical issue${audit.counts.critical > 1 ? 's' : ''} in this company's data</p><p>Flagged steps have a red border. <a href="#/audit">Open the integrity check</a></p></div></div>`) : '';
      };
      const save = async () => {
        if (readOnly) return;
        state.textContent = 'Saving…';
        await commitLibrary(app, structuredClone(draft));
        state.textContent = 'Saved on this device';
      };
      const changed = (refreshIssues = true) => {
        state.textContent = 'Editing…';
        clearTimeout(timer);
        timer = setTimeout(async () => {
          if (refreshIssues) {
            const index = buildIndex(draft);
            const audit = runAudit(index);
            box.querySelectorAll('.editor-step').forEach((card) => {
              const s = dev.instructions.steps[+card.dataset.i];
              if (!s) return;
              const issues = (audit.byStep.get(`${dev.id}/${s.id}`) || []).filter((f) => f.severity !== 'info');
              card.classList.toggle('flag', issues.some((f) => f.severity === 'critical'));
              card.querySelector('[data-issues]').innerHTML = String(html`${issues.map((f) => html`<div class="warnline" style="color:${f.severity === 'critical' ? 'var(--bad)' : 'var(--warn)'}">${icon(f.severity === 'critical' ? 'stop' : 'alert')}<span>${f.title}</span></div>`)}`);
              card.querySelectorAll('.ref-row').forEach((row) => { const p = s.parts[+row.dataset.r]; if (p) row.querySelector('[data-hint]').innerHTML = String(hint(index, p.code)); });
            });
            paintSummary(audit);
          }
          await save();
        }, 450);
      };
      const stepOf = (el) => dev.instructions.steps[+el.closest('.editor-step').dataset.i];
      box.addEventListener('input', (e) => {
        const t = e.target;
        if (readOnly) return;
        if (t.dataset.f) {
          const s = stepOf(t);
          const f = t.dataset.f;
          if (f === 'title' || f === 'summary' || f === 'why') s[f] = t.value;
          else if (f === 'warnings') s.warnings = fromWarn(t.value);
          else if (f === 'critical' || f === 'esd') { if (t.checked) s[f] = true; else delete s[f]; }
          else s[f] = fromLines(t.value);
          changed(f !== 'title' || true);
        } else if (t.dataset.pf) {
          const s = stepOf(t);
          const p = s.parts[+t.closest('.ref-row').dataset.r];
          if (t.dataset.pf === 'code') p.code = t.value.trim();
          if (t.dataset.pf === 'qty') { const v = t.value.trim(); p.qty = /^\d+$/.test(v) ? parseInt(v, 10) : (v.toUpperCase() === 'A/R' ? 'A/R' : v); }
          if (t.dataset.pf === 'torque') { const v = parseFloat(t.value.replace(',', '.')); if (isFinite(v)) p.torque = { value: v, unit: 'N·m' }; else delete p.torque; }
          changed();
        }
      });
      box.addEventListener('change', (e) => { if (e.target.type === 'checkbox') e.target.dispatchEvent(new Event('input', { bubbles: true })); });
      box.addEventListener('click', async (e) => {
        if (readOnly) return;
        const b = e.target.closest('button');
        if (!b) return;
        const i = +b.closest('.editor-step')?.dataset.i;
        const steps = dev.instructions.steps;
        if (b.hasAttribute('data-add-part')) { steps[i].parts = [...(steps[i].parts || []), { code: '', qty: 1 }]; rerender(); box.querySelector(`.editor-step[data-i="${i}"] .ref-row:last-of-type input`)?.focus(); }
        else if (b.hasAttribute('data-del-part')) { steps[i].parts.splice(+b.closest('.ref-row').dataset.r, 1); rerender(); changed(false); }
        else if (b.dataset.move) { const j = i + +b.dataset.move; [steps[i], steps[j]] = [steps[j], steps[i]]; rerender(); changed(false); }
        else if (b.hasAttribute('data-del-step')) {
          if (!(await confirmDialog(`Delete step ${i + 1}?`, `"${steps[i].title}" and its parts list are removed from the instructions.`, 'Delete step', true))) return;
          steps.splice(i, 1); rerender(); changed(false);
        }
      });
      root.querySelector('#addStep')?.addEventListener('click', () => {
        const steps = dev.instructions.steps;
        let n = steps.length + 1;
        while (steps.some((s) => s.id === `S${n}`)) n++;
        steps.push({ id: `S${n}`, title: `Step ${steps.length + 1}`, summary: '', parts: [{ code: '', qty: 1 }], tools: [], instructions: [], checks: [], warnings: [] });
        rerender(); changed(false);
        box.querySelector('.editor-step:last-child [data-f="title"]')?.select();
      });
      root.querySelector('#instRev')?.addEventListener('input', (e) => { dev.instructions.rev = e.target.value.trim(); changed(); });
      root.querySelector('#impSteps')?.addEventListener('click', async () => { if (await importSteps(app)) navigate(`#/editor/${encodeURIComponent(dev.id)}`); });
      root.querySelector('#expSteps').addEventListener('click', () => download(`${dev.id}-steps.csv`, '﻿' + stepsToCSV(dev), 'text/csv;charset=utf-8'));
      root.querySelector('#tplSteps').addEventListener('click', templates.steps);
      return () => { if (timer) { clearTimeout(timer); save(); } };
    },
  };
}

void esc;
