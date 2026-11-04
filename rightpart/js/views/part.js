import { html, raw, icon, esc, copyText, openDialog, toast, fmtDate } from '../ui.js';
import { drawPart } from '../draw.js';
import { CODE_TYPES, whereUsed, torqueText, normCode } from '../core/model.js';
import { findLookalikes, shortDifference } from '../core/lookalike.js';
import { decodeDesignation } from '../core/decode.js';
import { CATEGORY_LABELS, isFastener, sizeLabel } from '../core/dims.js';
import { barcodeSVG } from '../core/code128.js';
import { settings, listRecords, addRecord } from '../store.js';
import { partHref, stepHref, specFacts, factsGrid, findingCard, statusChip, shortType } from '../components.js';
import { decodedBlock } from './search.js';

export default async function partView({ app, params, query }) {
  const part = app.index.parts.get(params.id);
  if (!part) {
    return { title: 'Part not found', html: html`<div class="page narrow"><div class="empty"><h2>No part ${params.id}</h2><p style="margin-top:8px"><a href="#/search?q=${encodeURIComponent(params.id)}">Search for it</a></p></div></div>` };
  }
  const code = query.get('code');
  const matchedAlias = code ? [{ type: 'internal', code: part.id }, ...(part.aliases || []), part.designation ? { type: 'designation', code: part.designation } : null].filter(Boolean).find((a) => normCode(a.code) === normCode(code)) : null;
  const looks = findLookalikes(app.lib.parts, part);
  const used = whereUsed(app.index, part.id);
  const findings = app.audit.byPart.get(part.id) || [];
  const reports = (await listRecords('report')).filter((r) => r.partId === part.id);
  const replacement = part.replacedBy ? app.index.parts.get(part.replacedBy) : null;
  const dec = part.designation ? decodeDesignation(part.designation) : null;
  const d = part.details || {};
  const torque = torqueText(part.torque);
  const aliasRows = [{ type: 'internal', code: part.id, source: 'Master record' }, ...(part.aliases || [])];
  if (part.designation) aliasRows.push({ type: 'designation', code: part.designation, source: 'Engineering' });
  const collisions = new Set(findings.filter((f) => f.check === 'code-collision').flatMap((f) => f.codes || []).map(normCode));
  const cal = settings().pxPerMm;
  const usedIn = new Set(used.map((u) => u.device?.id));

  return {
    title: part.name,
    html: html`<div class="page">
      <div>
        <div class="crumbs"><a href="#/parts">Parts</a><span>/</span><a href="#/parts?cat=${['screw', 'nut', 'washer', 'standoff'].includes(part.category) ? part.category : 'other'}">${CATEGORY_LABELS[part.category] || part.category}</a></div>
        <div class="row between" style="align-items:flex-start">
          <div class="stack tight">
            <h1>${part.name}</h1>
            <div class="row"><span class="code-pill big" title="Internal code">${part.id}</span>${statusChip(part)}${part.esd ? html`<span class="chip warn">${icon('esd')}Static-sensitive</span>` : ''}${findings.filter((f) => f.severity === 'critical').length ? html`<a class="chip bad" href="#issues">${icon('stop')}${findings.filter((f) => f.severity === 'critical').length} critical issue${findings.filter((f) => f.severity === 'critical').length > 1 ? 's' : ''}</a>` : ''}</div>
          </div>
          <div class="row no-print">
            <a class="btn" href="#/labels?ids=${encodeURIComponent(part.id)}">${icon('print')}Bin label</a>
            <button class="btn" id="reportBtn" type="button">${icon('flag')}Report a doubt</button>
          </div>
        </div>
      </div>

      ${matchedAlias && matchedAlias.type !== 'internal' ? html`<div class="callout ${matchedAlias.type === 'legacy' ? 'warn' : 'ok'}">${icon(matchedAlias.type === 'legacy' ? 'history' : 'checkCircle')}<div><p class="t">${code} is this part's ${(CODE_TYPES[matchedAlias.type] || matchedAlias.type).toLowerCase()}</p><p>${matchedAlias.source ? `Recorded from ${matchedAlias.source}. ` : ''}${matchedAlias.type === 'legacy' ? `It is retired: use ${part.id}.` : `Same physical part as ${part.id}.`}${matchedAlias.note ? ` Note: ${matchedAlias.note}.` : ''}</p></div></div>` : ''}
      ${part.status === 'obsolete' ? html`<div class="callout bad">${icon('stop')}<div><p class="t">Retired part: do not fit it</p><p>${replacement ? html`Replaced by <a href="${partHref(replacement.id)}"><b class="code">${replacement.id}</b> ${replacement.name}</a>. ` : ''}${d.why || ''}</p></div></div>` : ''}

      <section class="part-hero">
        <div class="stack">
          <div class="drawing-box" id="drawBox" aria-live="polite">${raw(drawPart(part, { view: 'both', dims: true }))}</div>
          ${isFastener(part) ? html`<div class="row no-print">
            <div class="seg" role="group" aria-label="Drawing size">
              <button type="button" data-size="fit" aria-pressed="true">${icon('eye')}Fit</button>
              <button type="button" data-size="actual" aria-pressed="false">${icon('ruler')}Actual size</button>
            </div>
            ${looks[0] && part.category === 'screw' ? html`<button class="btn sm" type="button" id="ghostBtn" aria-pressed="false">${icon('layers')}Overlay ${looks[0].part.id}</button>` : ''}
            <span class="tiny muted">${cal ? 'Screen calibrated: lay the part on the drawing.' : 'Calibrate once to see it at true size.'}</span>
          </div>` : html`<p class="tiny muted">Illustration, not to scale.</p>`}
        </div>
        <div class="stack">
          ${factsGrid(specFacts(part))}
          ${torque || part.tool ? html`<div class="facts">${torque ? html`<div class="fact"><div class="k">Torque</div><div class="v">${torque}</div></div>` : ''}${part.tool ? html`<div class="fact"><div class="k">Tool</div><div class="v" style="font-size:15px">${part.tool}</div></div>` : ''}</div>` : ''}
          ${d.function ? html`<div class="why-box"><div class="t">What it does</div><p>${d.function}</p></div>` : ''}
          <div class="stack tight">
            ${d.why ? html`<details class="more" open><summary><span class="ic">${icon('info')}</span>Why this part<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></summary><div class="body"><p>${d.why}</p></div></details>` : ''}
            ${d.ifWrong ? html`<details class="more"><summary><span class="ic bad">${icon('alert')}</span>If the wrong part is fitted<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></summary><div class="body"><p>${d.ifWrong}</p></div></details>` : ''}
            ${d.tips ? html`<details class="more"><summary><span class="ic ok">${icon('hand')}</span>Tips at the bench<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></summary><div class="body"><p>${d.tips}</p></div></details>` : ''}
            ${!d.function ? html`<div class="callout">${icon('info')}<div><p class="t">No explanation yet</p><p>Nobody has written what this part does or why it was chosen. Engineers can add it through Your data.</p></div></div>` : ''}
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h2>Every code for this part</h2><span class="chip">${aliasRows.length} codes</span></div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Type</th><th>Code</th><th>Where it comes from</th><th class="no-print"></th></tr></thead>
          <tbody>${aliasRows.map((a) => html`<tr class="${collisions.has(normCode(a.code)) ? 'flag' : ''}">
            <td><span class="chip ${a.type === 'legacy' ? 'warn' : a.type === 'internal' ? 'brand' : ''}" title="${CODE_TYPES[a.type] || a.type}">${shortType(a.type)}</span> <span class="small muted">${CODE_TYPES[a.type] || a.type}</span></td>
            <td><span class="code">${a.code}</span>${collisions.has(normCode(a.code)) ? html` <span class="chip bad">${icon('stop')}also on another part</span>` : ''}${a.note ? html`<div class="tiny muted">${a.note}</div>` : ''}</td>
            <td class="small">${a.source || ''}</td>
            <td class="no-print" style="text-align:right"><button class="btn sm ghost" type="button" data-copy="${a.code}" aria-label="Copy ${a.code}">${icon('copy')}</button></td>
          </tr>`)}</tbody>
        </table></div>
        <div class="card-foot" style="align-items:center">
          <div style="background:#fff;padding:6px 8px;border-radius:8px;width:min(100%,300px)">${raw(barcodeSVG(part.id, { height: 36, width: '100%', heightAttr: 56, label: true }))}</div>
          <p class="tiny muted" style="max-width:46ch">Scanners read this Code 128 label. Every code above resolves to this one part, with or without dashes and spaces.</p>
        </div>
      </section>

      ${dec ? decodedBlock(dec, `How to read ${part.designation}`) : ''}

      ${looks.length ? html`<section class="stack" aria-labelledby="lk">
        <h2 id="lk">Don't confuse it with</h2>
        <div class="compare">${looks.slice(0, 6).map((l) => html`<article class="lookalike">
          <div class="row between"><a href="${partHref(l.part.id)}"><b class="code">${l.part.id}</b></a><span class="chip ${l.duplicate ? 'bad' : l.score >= 0.85 ? 'warn' : ''}">${l.duplicate ? 'Same spec: duplicate?' : l.score >= 0.85 ? 'Very similar' : 'Similar'}</span></div>
          <div class="pair">
            <div>${raw(drawPart(part, { view: 'side' }))}${sizeLabel(part) || part.id}<br><b>this part</b></div>
            <div>${raw(drawPart(l.part, { view: 'side' }))}${sizeLabel(l.part) || l.part.id}<br><b>${shortDifference(part, l.part)}</b></div>
          </div>
          <div class="diffs">${l.diffs.length ? l.diffs.map((x) => html`<div class="${x.important ? 'imp' : ''}">${x.text}</div>`) : html`<div class="imp">No difference in the spec: probably the same part under two codes.</div>`}</div>
          ${[...usedIn].some((dev) => whereUsed(app.index, l.part.id).some((u) => u.device?.id === dev)) ? html`<span class="chip warn">${icon('alert')}Also used in the same device</span>` : ''}
        </article>`)}</div>
      </section>` : ''}

      <section class="card">
        <div class="card-head"><h2>Where it's used</h2></div>
        ${used.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Device</th><th>Steps</th><th>BOM</th></tr></thead><tbody>
          ${used.map((u) => html`<tr>
            <td><a href="#/device/${encodeURIComponent(u.device.id)}">${u.device.name}</a></td>
            <td>${u.steps.length ? u.steps.map((s) => html`<a class="chip" href="${stepHref(u.device.id, s.stepId)}" style="margin:2px">Step ${s.stepNo} · ${s.qty}×${s.legacy ? ' (old code)' : ''}</a>`) : html`<span class="chip bad">${icon('alert')}No step fits it</span>`}</td>
            <td>${u.bom.length ? u.bom.map((b) => html`<span class="small">Item ${b.item}: ${b.qty}× <span class="code">${b.code}</span>${b.where ? ` (${b.where})` : ''}</span><br>`) : html`<span class="chip bad">${icon('alert')}Not in the BOM</span>`}</td>
          </tr>`)}
        </tbody></table></div>` : html`<div class="card-body muted">Not used in any device in this library.</div>`}
      </section>

      ${findings.length ? html`<section class="stack" id="issues"><h2>Integrity check</h2>${findings.map((f) => findingCard(f, app))}</section>` : ''}

      ${reports.length ? html`<section class="stack"><h2>Reports from the floor</h2>${reports.map((r) => html`<div class="callout warn">${icon('flag')}<div><p class="t">${r.who || 'Someone'} · ${fmtDate(r.createdAt)}</p><p>${r.text}</p>${r.photo ? html`<img src="${r.photo}" alt="Photo attached to the report" style="max-width:220px;border-radius:10px;margin-top:8px">` : ''}</div></div>`)}</section>` : ''}

      <div class="row no-print"><a class="btn" href="#/teach?part=${encodeURIComponent(part.id)}">${icon('sparkle')}Teach the photo identifier this part</a></div>
    </div>`,
    mount(root) {
      root.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => copyText(b.dataset.copy)));
      const box = root.querySelector('#drawBox');
      let mode = 'fit';
      let ghost = false;
      const redraw = async () => {
        const g = ghost ? looks[0]?.part : null;
        if (mode === 'actual') {
          let px = settings().pxPerMm;
          if (!px) {
            const { calibrateDialog } = await import('../gauge.js');
            px = await calibrateDialog();
            if (!px) { mode = 'fit'; syncSeg(); return; }
          }
          box.classList.add('actual');
          box.innerHTML = drawPart(part, { view: 'side', dims: true, mode: 'actual', pxPerMm: px, ghost: g });
        } else {
          box.classList.remove('actual');
          box.innerHTML = drawPart(part, { view: g ? 'side' : 'both', dims: true, ghost: g });
        }
      };
      const syncSeg = () => root.querySelectorAll('[data-size]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.size === mode)));
      root.querySelectorAll('[data-size]').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.size; syncSeg(); redraw(); }));
      root.querySelector('#ghostBtn')?.addEventListener('click', (e) => { ghost = !ghost; e.currentTarget.setAttribute('aria-pressed', String(ghost)); redraw(); });
      root.querySelector('#reportBtn')?.addEventListener('click', () => reportDialog({ part }));
    },
  };
}

/** Lets anyone on the floor flag a doubt. Stored on this device; exported from Your data. */
export async function reportDialog({ part, deviceId, stepId, preset = '' }) {
  let photo = null;
  let text = '';
  let who = '';
  const res = await openDialog({
    title: 'Report a doubt',
    body: String(html`<p class="muted">Something does not match: the part in the bin, the label, the picture or the instruction? Say what you see. It is saved on this device for your supervisor or engineer.</p>
      ${part ? html`<p><b class="code">${part.id}</b> ${part.name}</p>` : ''}
      <div class="field"><label for="rpText">What did you notice?</label><textarea id="rpText" placeholder="Example: the bin labelled 100-0233 has screws that look longer than the picture.">${preset}</textarea></div>
      <div class="field"><label for="rpWho">Your name (optional)</label><input id="rpWho" type="text" autocomplete="name"></div>
      <div class="field"><span class="lbl">Photo (optional)</span><input id="rpPhoto" type="file" accept="image/*" capture="environment"><img id="rpPrev" alt="" class="hidden" style="max-width:200px;border-radius:10px"></div>`),
    actions: [{ label: 'Cancel', value: null }, { label: 'Save report', value: 'save', primary: true }],
    onMount(d) {
      d.querySelector('#rpPhoto').addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        photo = await shrinkImage(file, 900);
        const img = d.querySelector('#rpPrev'); img.src = photo; img.classList.remove('hidden');
      });
    },
    onClose(d) { text = d.querySelector('#rpText').value.trim(); who = d.querySelector('#rpWho').value.trim(); },
  });
  if (res !== 'save') return null;
  if (!text) { toast('Nothing saved: the report was empty.', 'bad'); return null; }
  const rec = await addRecord({ type: 'report', partId: part?.id || null, deviceId: deviceId || null, stepId: stepId || null, text, who, photo });
  toast('Report saved on this device.', 'ok');
  return rec;
}

export function shrinkImage(file, max = 900) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

void esc;
