import { html, th, raw, icon, toast, download, confirmDialog, esc } from '../ui.js';
import { t } from '../core/i18n.js';
import { numberMismatches, sourceFingerprint } from '../core/content.js';
import { buildIndex, resolveCode } from '../core/model.js';
import { runAudit } from '../core/audit.js';
import { sizeLabel } from '../core/dims.js';
import { stepsToCSV } from '../core/importer.js';
import { currentWorkspace } from '../store.js';
import { commitLibrary, importSteps, templates } from '../importflows.js';
import { importPdfSteps } from '../pdfimport.js';
import { QTY_NOTE } from '../core/pdfsteps.js';
import { stepHref } from '../components.js';

// Step editor: anyone who knows the product can write or fix the steps here. The integrity check
// runs as you type, so a step that fits a part the BOM does not list is flagged before anyone builds it.

const lines = (a) => (a || []).join('\n');
const fromLines = (txt) => String(txt || '').split('\n').map((s) => s.trim()).filter(Boolean);
const warnText = (ws) => (ws || []).map((w) => `${w.level}: ${w.text}`).join('\n');
const fromWarn = (txt) => fromLines(txt).map((l) => { const m = l.match(/^(warning|caution|notice)\s*:\s*(.+)$/i); return m ? { level: m[1].toLowerCase(), text: m[2] } : { level: 'caution', text: l }; });

const critBox = (audit) => (audit.counts.critical ? html`<div class="callout bad">${icon('stop')}<div><p class="t">${t("{n, plural, one {# critical issue in this company's data} other {# critical issues in this company's data}}", { n: audit.counts.critical })}</p><p>${t('Flagged steps have a red border.')} <a href="#/audit">${t('Open the integrity check')}</a></p></div></div>` : '');

/** Which languages this step is translated into, and the state of each translation. */
function translationLine(s) {
  const trs = Object.entries(s.translations || {});
  if (!trs.length) return '';
  return html`<p class="tiny muted row" style="gap:6px">${icon('globe')}${trs.map(([lang, tr]) => {
    const bad = numberMismatches(s, tr).length;
    const old = !bad && tr.source && tr.source !== sourceFingerprint(s);
    const cls = bad ? 'bad' : old ? 'warn' : tr.reviewed ? 'ok' : '';
    const label = bad ? t('numbers differ') : old ? t('older than the step') : tr.reviewed ? t('checked') : t('not checked');
    return html`<span class="chip ${cls}" title="${label}"><span lang="${lang}">${lang.toUpperCase()}</span> · ${label}</span>`;
  })}</p>`;
}

export default async function editor({ app, params, navigate }) {
  const ws = currentWorkspace();
  const role = ws.org?.role;
  const readOnly = ws.kind === 'cloud' && !['owner', 'admin', 'engineer'].includes(role);

  if (params.device === 'new') {
    return {
      title: t('New device'),
      html: html`<div class="page narrow">
        <div class="crumbs"><a href="#/devices">${t('nav::Build')}</a><span>/</span><span>${t('New device')}</span></div>
        <h1>${t('Add a device')}</h1>
        <p class="lede">${t('A device is one product your line builds. Give it a short id (like the drawing or ERP number) and a name; then write its steps or import them from a spreadsheet.')}</p>
        <form class="card pad stack" id="newDev" autocomplete="off">
          <div class="field"><label for="devId">${t('Device id')}</label><input id="devId" type="text" dir="ltr" placeholder="${t('e.g. {example}', { example: 'NV1-ASSY' })}" maxlength="40" autocapitalize="characters" spellcheck="false"></div>
          <div class="field"><label for="devName">${t('Name')}</label><input id="devName" type="text" dir="auto" placeholder="${t('e.g. {example}', { example: 'Nova-1 console, final assembly' })}" maxlength="120"></div>
          <div class="field"><label for="devRev">${t('Instructions revision')}</label><input id="devRev" type="text" dir="ltr" placeholder="${t('e.g. {example}', { example: 'A' })}" maxlength="10"></div>
          <div><button class="btn primary" type="submit" ${readOnly ? 'disabled' : ''}>${t('Create and add steps')}</button></div>
        </form>
        <div class="card pad stack tight">
          <h2 style="font-size:17px">${t('Already have the instructions as a PDF?')}</h2>
          <p class="small muted">${t('RightPart reads the steps, the parts each step names (by any of their codes), quantities, torques, tools, warnings and checks, and lists every code it does not know. The PDF is read on this device and is not uploaded. The steps are saved as drafts for an engineer to review.')}</p>
          <div><button class="btn" type="button" id="pdfNew" ${readOnly ? 'disabled' : ''}>${icon('upload')}${t('Read steps from a PDF')}</button></div>
        </div>
      </div>`,
      mount(root) {
        root.querySelector('#pdfNew')?.addEventListener('click', async () => { const id = await importPdfSteps(app); if (id) navigate(`#/editor/${encodeURIComponent(id)}`); });
        root.querySelector('#newDev').addEventListener('submit', async (e) => {
          e.preventDefault();
          const id = root.querySelector('#devId').value.trim();
          const name = root.querySelector('#devName').value.trim() || id;
          if (!/^[\w.-]{1,40}$/.test(id)) { toast(t('Use letters, digits, dots, dashes or underscores for the id.'), 'bad', 5000); return; }
          if (app.lib.devices?.some((d) => d.id === id)) { toast(t('A device with this id exists already.'), 'bad'); return; }
          const lib = structuredClone(app.lib);
          lib.devices = lib.devices || [];
          lib.devices.push({ id, name, description: '', bom: { rev: '', lines: [] }, instructions: { rev: root.querySelector('#devRev').value.trim(), steps: [{ id: 'S1', title: t('First step'), summary: '', parts: [], tools: [], instructions: [], checks: [], warnings: [] }] } });
          await commitLibrary(app, lib, t('{name} created.', { name }));
          navigate(`#/editor/${encodeURIComponent(id)}`);
        });
      },
    };
  }

  const original = app.index.devices.get(params.device);
  if (!original) return { title: t('Not found'), html: html`<div class="page narrow"><div class="empty">${t('No device {id}.', { id: params.device })}</div></div>` };
  let draft = structuredClone(app.lib);
  let dev = draft.devices.find((d) => d.id === original.id);
  dev.instructions = dev.instructions || { rev: '', steps: [] };

  const hint = (index, code) => {
    if (!code.trim()) return html`<span class="muted">${t('Type or scan any code: internal, customer or supplier')}</span>`;
    const r = resolveCode(index, code);
    if (r.status === 'unknown') return html`<span style="color:var(--bad)">${icon('stop')} ${t('Not in the parts library')}</span>`;
    if (r.status === 'ambiguous') return html`<span style="color:var(--bad)">${icon('stop')} ${t('This code points to {n} parts: use the internal code', { n: r.matches.length })}</span>`;
    return html`<span style="color:${r.legacy ? 'var(--warn)' : 'var(--ok)'}">${icon(r.legacy ? 'history' : 'check')} <span class="code">${r.part.id}</span> · ${r.part.name}${sizeLabel(r.part) ? ` (${sizeLabel(r.part)})` : ''}${r.legacy ? `: ${t('old code, prefer {id}', { id: r.part.id })}` : ''}</span>`;
  };

  const stepCard = (s, i, index, audit) => {
    const issues = (audit.byStep.get(`${dev.id}/${s.id}`) || []).filter((f) => f.severity !== 'info' && f.check !== 'draft-steps');
    return html`<article class="editor-step ${issues.some((f) => f.severity === 'critical') ? 'flag' : ''}" data-i="${i}">
      <div class="head">
        <span class="row nowrap" style="flex:1;min-width:0"><span class="num">${i + 1}</span><input data-f="title" type="text" dir="auto" value="${s.title}" aria-label="${t('Title of step {n}', { n: i + 1 })}" style="flex:1;min-width:0;min-height:42px;padding:8px 10px;border-radius:10px;border:1px solid var(--line-2);background:var(--surface);font-weight:650;font-size:16px" ${readOnly ? 'disabled' : ''}></span>
        <span class="row" style="gap:4px">
          <button class="btn sm ghost" type="button" data-move="-1" aria-label="${t('Move step up')}" ${i === 0 || readOnly ? 'disabled' : ''}>${icon('arrowUp')}</button>
          <button class="btn sm ghost" type="button" data-move="1" aria-label="${t('Move step down')}" ${i === dev.instructions.steps.length - 1 || readOnly ? 'disabled' : ''}>${icon('chevronDown')}</button>
          <button class="btn sm ghost danger" type="button" data-del-step aria-label="${t('Delete step {n}', { n: i + 1 })}" ${readOnly ? 'disabled' : ''}>${icon('trash')}</button>
        </span>
      </div>
      ${s.draft ? html`<div class="draft-note"><span class="row nowrap" style="gap:8px;align-items:flex-start;min-width:0">${icon('alert')}<span>${s.source?.page ? th('Draft read from {file}, page {page}. Compare it with the PDF and correct it, then tick Reviewed.', { file: html`<b>${s.source?.file || t('a PDF')}</b>`, page: s.source.page }) : th('Draft read from {file}. Compare it with the PDF and correct it, then tick Reviewed.', { file: html`<b>${s.source?.file || t('a PDF')}</b>` })}</span></span><label class="row nowrap" style="gap:8px;font-weight:650"><input type="checkbox" data-f="reviewed" ${readOnly ? 'disabled' : ''}> ${t('Reviewed')}</label></div>` : s.source?.file ? html`<p class="tiny muted">${icon('check')} ${[t('From {file}', { file: s.source.file }), s.source.page ? t('page {n}', { n: s.source.page }) : '', s.source.reviewedAt ? t('reviewed {date}', { date: s.source.reviewedAt }) : ''].filter(Boolean).join(', ')}</p>` : ''}
      ${translationLine(s)}
      <div data-issues>${issues.map((f) => html`<div class="warnline" style="color:${f.severity === 'critical' ? 'var(--bad)' : 'var(--warn)'}">${icon(f.severity === 'critical' ? 'stop' : 'alert')}<span>${f.title}</span></div>`)}</div>
      <div class="field"><label>${t('Summary')}</label><input data-f="summary" type="text" dir="auto" value="${s.summary || ''}" ${readOnly ? 'disabled' : ''}></div>
      <div class="stack tight">
        <span class="lbl" style="font-size:14px;font-weight:650;color:var(--text-2)">${t('Parts: code, quantity, torque (N·m)')}</span>
        ${(s.parts || []).map((p, k) => html`<div class="ref-row" data-r="${k}">
          <input class="code" data-pf="code" type="text" dir="ltr" value="${p.code}" aria-label="${t('Part code')}" spellcheck="false" autocapitalize="characters" ${readOnly ? 'disabled' : ''}>
          <input data-pf="qty" type="text" dir="ltr" value="${p.qty}" aria-label="${t('Quantity')}" inputmode="numeric" ${readOnly ? 'disabled' : ''}>
          <input data-pf="torque" type="text" dir="ltr" value="${p.torque?.value ?? ''}" placeholder="N·m" aria-label="${t('Torque')}" inputmode="decimal" ${readOnly ? 'disabled' : ''}>
          <button class="btn sm ghost" type="button" data-del-part aria-label="${t('Remove part')}" ${readOnly ? 'disabled' : ''}>${icon('x')}</button>
          <div class="hint" data-hint>${hint(index, p.code)}</div>
        </div>`)}
        <div><button class="btn sm" type="button" data-add-part ${readOnly ? 'disabled' : ''}>${icon('plus')}${t('Add part')}</button></div>
      </div>
      <div class="grid two">
        <div class="field"><label>${t('How: one instruction per line')}</label><textarea data-f="instructions" dir="auto" ${readOnly ? 'disabled' : ''}>${lines(s.instructions)}</textarea></div>
        <div class="field"><label>${t('Checks before moving on: one per line')}</label><textarea data-f="checks" dir="auto" ${readOnly ? 'disabled' : ''}>${lines(s.checks)}</textarea></div>
        <div class="field"><label>${t('Tools: one per line')}</label><textarea data-f="tools" dir="auto" ${readOnly ? 'disabled' : ''}>${lines(s.tools)}</textarea></div>
        <div class="field"><label>${t('Warnings: "caution: …", "warning: …" or "notice: …" (these three words stay in English)')}</label><textarea data-f="warnings" dir="auto" ${readOnly ? 'disabled' : ''}>${warnText(s.warnings)}</textarea></div>
      </div>
      <div class="field"><label>${t('Why this step matters (shown to learners)')}</label><textarea data-f="why" dir="auto" ${readOnly ? 'disabled' : ''}>${s.why || ''}</textarea></div>
      <div class="row"><label class="row nowrap" style="gap:8px"><input type="checkbox" data-f="critical" ${s.critical ? 'checked' : ''} ${readOnly ? 'disabled' : ''}> ${t('Safety critical')}</label><label class="row nowrap" style="gap:8px"><input type="checkbox" data-f="esd" ${s.esd ? 'checked' : ''} ${readOnly ? 'disabled' : ''}> ${t('Static-sensitive')}</label></div>
    </article>`;
  };

  const renderSteps = () => {
    const index = buildIndex(draft);
    const audit = runAudit(index);
    return { markup: String(html`${dev.instructions.steps.map((s, i) => stepCard(s, i, index, audit))}`), audit };
  };
  const first = renderSteps();

  return {
    title: t('Edit steps: {device}', { device: dev.name }),
    html: html`<div class="page narrow">
      <div class="crumbs"><a href="#/devices">${t('nav::Build')}</a><span>/</span><a href="#/device/${encodeURIComponent(dev.id)}">${dev.name}</a><span>/</span><span>${t('Edit steps')}</span></div>
      <div class="page-head"><div>
        <h1>${t('Edit steps')}</h1>
        <p class="lede">${t('Write each step the way you would explain it to someone new, or read the steps from the PDF you already have. Parts can be entered by any of their codes. The integrity check runs as you type and flags parts that are unknown, retired, look-alikes, or that disagree with the BOM.')}</p>
      </div><span class="chip" id="saveState" aria-live="polite">${readOnly ? t('Read only') : t('Saved')}</span></div>
      ${readOnly ? html`<div class="callout info">${icon('lock')}<div><p class="t">${t('Only engineers can change the steps')}</p><p>${t('Your role in {company} is {role}. Report a doubt on the step instead, and an engineer will see it.', { company: ws.name, role })}</p></div></div>` : ''}
      <div class="row">
        <div class="field" style="min-width:140px"><label for="instRev">${t('Instructions revision')}</label><input id="instRev" type="text" dir="ltr" value="${dev.instructions.rev || ''}" maxlength="10" ${readOnly ? 'disabled' : ''}></div>
        <span style="flex:1"></span>
        <button class="btn" type="button" id="pdfSteps" ${readOnly ? 'disabled' : ''}>${icon('upload')}${t('Read steps from a PDF')}</button>
        <button class="btn" type="button" id="impSteps" ${readOnly ? 'disabled' : ''}>${icon('upload')}${t('Import steps CSV')}</button>
        <button class="btn" type="button" id="expSteps">${icon('download')}${t('Export steps CSV')}</button>
        <button class="btn ghost" type="button" id="tplSteps">${icon('download')}${t('Template')}</button>
        <a class="btn ghost" href="#/data#languages">${icon('globe')}${t('Translations')}</a>
        <a class="btn primary" href="${stepHref(dev.id, dev.instructions.steps[0]?.id || 'S1', 'learn')}">${icon('play')}${t('Open the guide')}</a>
      </div>
      <div id="critSum">${critBox(first.audit)}</div>
      <div class="stack" id="steps">${raw(first.markup)}</div>
      ${readOnly ? '' : html`<div><button class="btn big" type="button" id="addStep">${icon('plus')}${t('Add a step')}</button></div>`}
    </div>`,
    mount(root) {
      const box = root.querySelector('#steps');
      const state = root.querySelector('#saveState');
      let timer = 0;
      const rerender = () => { const r = renderSteps(); box.innerHTML = r.markup; paintSummary(r.audit); };
      const paintSummary = (audit) => {
        root.querySelector('#critSum').innerHTML = String(critBox(audit));
      };
      const save = async () => {
        if (readOnly) return;
        state.textContent = t('Saving…');
        await commitLibrary(app, structuredClone(draft));
        state.textContent = t('Saved on this device');
      };
      const changed = (refreshIssues = true) => {
        state.textContent = t('Editing…');
        clearTimeout(timer);
        timer = setTimeout(async () => {
          if (refreshIssues) {
            const index = buildIndex(draft);
            const audit = runAudit(index);
            box.querySelectorAll('.editor-step').forEach((card) => {
              const s = dev.instructions.steps[+card.dataset.i];
              if (!s) return;
              const issues = (audit.byStep.get(`${dev.id}/${s.id}`) || []).filter((f) => f.severity !== 'info' && f.check !== 'draft-steps');
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
        const el = e.target;
        if (readOnly) return;
        if (el.dataset.f) {
          const s = stepOf(el);
          const f = el.dataset.f;
          if (f === 'title' || f === 'summary' || f === 'why') s[f] = el.value;
          else if (f === 'warnings') s.warnings = fromWarn(el.value);
          else if (f === 'critical' || f === 'esd') { if (el.checked) s[f] = true; else delete s[f]; }
          else if (f === 'reviewed') {
            if (!el.checked) return;
            delete s.draft;
            s.source = { ...(s.source || {}), reviewedAt: new Date().toISOString().slice(0, 10) };
            for (const p of s.parts || []) if (p.note === QTY_NOTE) delete p.note;
            rerender();
          }
          else s[f] = fromLines(el.value);
          changed(f !== 'title' || true);
        } else if (el.dataset.pf) {
          const s = stepOf(el);
          const p = s.parts[+el.closest('.ref-row').dataset.r];
          if (el.dataset.pf === 'code') p.code = el.value.trim();
          if (el.dataset.pf === 'qty') { const v = el.value.trim(); p.qty = /^\d+$/.test(v) ? parseInt(v, 10) : (v.toUpperCase() === 'A/R' ? 'A/R' : v); }
          if (el.dataset.pf === 'torque') { const v = parseFloat(el.value.replace(',', '.')); if (isFinite(v)) p.torque = { value: v, unit: 'N·m' }; else delete p.torque; }
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
          if (!(await confirmDialog(t('Delete step {n}?', { n: i + 1 }), t('"{title}" and its parts list are removed from the instructions.', { title: steps[i].title }), t('Delete step'), true))) return;
          steps.splice(i, 1); rerender(); changed(false);
        }
      });
      root.querySelector('#addStep')?.addEventListener('click', () => {
        const steps = dev.instructions.steps;
        let n = steps.length + 1;
        while (steps.some((s) => s.id === `S${n}`)) n++;
        steps.push({ id: `S${n}`, title: t('Step {n}', { n: steps.length + 1 }), summary: '', parts: [{ code: '', qty: 1 }], tools: [], instructions: [], checks: [], warnings: [] });
        rerender(); changed(false);
        box.querySelector('.editor-step:last-child [data-f="title"]')?.select();
      });
      root.querySelector('#instRev')?.addEventListener('input', (e) => { dev.instructions.rev = e.target.value.trim(); changed(); });
      root.querySelector('#impSteps')?.addEventListener('click', async () => { if (await importSteps(app)) navigate(`#/editor/${encodeURIComponent(dev.id)}`); });
      root.querySelector('#pdfSteps')?.addEventListener('click', async () => { const id = await importPdfSteps(app, { deviceId: dev.id }); if (id) navigate(`#/editor/${encodeURIComponent(id)}`); });
      root.querySelector('#expSteps').addEventListener('click', () => download(`${dev.id}-steps.csv`, '﻿' + stepsToCSV(dev), 'text/csv;charset=utf-8'));
      root.querySelector('#tplSteps').addEventListener('click', templates.steps);
      return () => { if (timer) { clearTimeout(timer); save(); } };
    },
  };
}

void esc;
