import { html, th, raw, icon, esc, rich, copyText, openDialog, toast, fmtDate } from '../ui.js';
import { t, lower } from '../core/i18n.js';
import { partText } from '../core/content.js';
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
    return { title: t('Part not found'), html: html`<div class="page narrow"><div class="empty"><h2>${th('No part {id}', { id: params.id })}</h2><p style="margin-top:8px"><a href="#/search?q=${encodeURIComponent(params.id)}">${t('Search for it')}</a></p></div></div>` };
  }
  const code = query.get('code');
  const matchedAlias = code ? [{ type: 'internal', code: part.id }, ...(part.aliases || []), part.designation ? { type: 'designation', code: part.designation } : null].filter(Boolean).find((a) => normCode(a.code) === normCode(code)) : null;
  const looks = findLookalikes(app.lib.parts, part);
  const used = whereUsed(app.index, part.id);
  const findings = app.audit.byPart.get(part.id) || [];
  const reports = (await listRecords('report')).filter((r) => r.partId === part.id);
  const replacement = part.replacedBy ? app.index.parts.get(part.replacedBy) : null;
  const dec = part.designation ? decodeDesignation(part.designation) : null;
  const pt = partText(part, app.lib); // name and explanations in the reader's language
  const d = { ...(part.details || {}), function: pt.function, why: pt.why, ifWrong: pt.ifWrong, tips: pt.tips };
  const torque = torqueText(part.torque);
  const aliasRows = [{ type: 'internal', code: part.id, source: t('Master record') }, ...(part.aliases || [])];
  if (part.designation) aliasRows.push({ type: 'designation', code: part.designation, source: t('Engineering') });
  const critN = findings.filter((f) => f.severity === 'critical').length;
  const collisions = new Set(findings.filter((f) => f.check === 'code-collision').flatMap((f) => f.codes || []).map(normCode));
  const cal = settings().pxPerMm;
  const usedIn = new Set(used.map((u) => u.device?.id));

  return {
    title: pt.name,
    html: html`<div class="page">
      <div>
        <div class="crumbs"><a href="#/parts">${t('Parts')}</a><span>/</span><a href="#/parts?cat=${['screw', 'nut', 'washer', 'standoff'].includes(part.category) ? part.category : 'other'}">${CATEGORY_LABELS[part.category] || part.category}</a></div>
        <div class="row between" style="align-items:flex-start">
          <div class="stack tight">
            <h1>${pt.name}</h1>
            ${pt.state === 'translated' && pt.name !== part.name ? html`<p class="small muted" dir="auto">${part.name}</p>` : ''}
            <div class="row"><span class="code-pill big" title="${t('Internal code')}">${part.id}</span>${statusChip(part)}${part.esd ? html`<span class="chip warn">${icon('esd')}${t('Static-sensitive')}</span>` : ''}${critN ? html`<a class="chip bad" href="#issues">${icon('stop')}${t('{n, plural, one {# critical issue} other {# critical issues}}', { n: critN })}</a>` : ''}</div>
          </div>
          <div class="row no-print">
            <a class="btn" href="#/labels?ids=${encodeURIComponent(part.id)}">${icon('print')}${t('Bin label')}</a>
            <button class="btn" id="reportBtn" type="button">${icon('flag')}${t('Report a doubt')}</button>
          </div>
        </div>
      </div>

      ${matchedAlias && matchedAlias.type !== 'internal' ? html`<div class="callout ${matchedAlias.type === 'legacy' ? 'warn' : 'ok'}">${icon(matchedAlias.type === 'legacy' ? 'history' : 'checkCircle')}<div><p class="t">${th("{code} is this part's {type}", { code: html`<span class="code">${code}</span>`, type: lower(CODE_TYPES[matchedAlias.type] || matchedAlias.type) })}</p><p>${matchedAlias.source ? `${t('Recorded from {source}.', { source: matchedAlias.source })} ` : ''}${matchedAlias.type === 'legacy' ? t('It is retired: use {id}.', { id: part.id }) : t('Same physical part as {id}.', { id: part.id })}${matchedAlias.note ? ` ${t('Note: {note}.', { note: matchedAlias.note })}` : ''}</p></div></div>` : ''}
      ${part.status === 'obsolete' ? html`<div class="callout bad">${icon('stop')}<div><p class="t">${t('Retired part: do not fit it')}</p><p>${replacement ? html`${th('Replaced by {part}.', { part: html`<a href="${partHref(replacement.id)}"><b class="code">${replacement.id}</b> ${partText(replacement, app.lib).name}</a>` })} ` : ''}${d.why || ''}</p></div></div>` : ''}

      <section class="part-hero">
        <div class="stack">
          <div class="drawing-box" id="drawBox" aria-live="polite">${raw(drawPart(part, { view: 'both', dims: true }))}</div>
          ${isFastener(part) ? html`<div class="row no-print">
            <div class="seg" role="group" aria-label="${t('Drawing size')}">
              <button type="button" data-size="fit" aria-pressed="true">${icon('eye')}${t('Fit')}</button>
              <button type="button" data-size="actual" aria-pressed="false">${icon('ruler')}${t('Actual size')}</button>
            </div>
            ${looks[0] && part.category === 'screw' ? html`<button class="btn sm" type="button" id="ghostBtn" aria-pressed="false">${icon('layers')}${th('Overlay {id}', { id: looks[0].part.id })}</button>` : ''}
            <span class="tiny muted">${cal ? t('Screen calibrated: lay the part on the drawing.') : t('Calibrate once to see it at true size.')}</span>
          </div>` : html`<p class="tiny muted">${t('Illustration, not to scale.')}</p>`}
        </div>
        <div class="stack">
          ${factsGrid(specFacts(part))}
          ${torque || part.tool ? html`<div class="facts">${torque ? html`<div class="fact"><div class="k">${t('Torque')}</div><div class="v" dir="ltr">${torque}</div></div>` : ''}${part.tool ? html`<div class="fact"><div class="k">${t('Tool')}</div><div class="v" style="font-size:15px">${part.tool}</div></div>` : ''}</div>` : ''}
          ${pt.state === 'missing' && (d.function || d.why) ? html`<p class="tiny muted lang-note">${icon('globe')} ${t('The explanations below are not translated yet: they are shown as the company wrote them.')}</p>` : ''}
          ${d.function ? html`<div class="why-box"><div class="t">${t('What it does')}</div><p>${d.function}</p></div>` : ''}
          <div class="stack tight">
            ${d.why ? html`<details class="more" open><summary><span class="ic">${icon('info')}</span>${t('Why this part')}<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></summary><div class="body"><p>${d.why}</p></div></details>` : ''}
            ${d.ifWrong ? html`<details class="more"><summary><span class="ic bad">${icon('alert')}</span>${t('If the wrong part is fitted')}<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></summary><div class="body"><p>${d.ifWrong}</p></div></details>` : ''}
            ${d.tips ? html`<details class="more"><summary><span class="ic ok">${icon('hand')}</span>${t('Tips at the bench')}<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></summary><div class="body"><p>${d.tips}</p></div></details>` : ''}
            ${!d.function ? html`<div class="callout">${icon('info')}<div><p class="t">${t('No explanation yet')}</p><p>${t('Nobody has written what this part does or why it was chosen. Engineers can add it through Your data.')}</p></div></div>` : ''}
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h2>${t('Every code for this part')}</h2><span class="chip">${t('{n, plural, one {# code} other {# codes}}', { n: aliasRows.length })}</span></div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>${t('Type')}</th><th>${t('Code')}</th><th>${t('Where it comes from')}</th><th class="no-print"></th></tr></thead>
          <tbody>${aliasRows.map((a) => html`<tr class="${collisions.has(normCode(a.code)) ? 'flag' : ''}">
            <td><span class="chip ${a.type === 'legacy' ? 'warn' : a.type === 'internal' ? 'brand' : ''}" title="${CODE_TYPES[a.type] || a.type}">${shortType(a.type)}</span> <span class="small muted">${CODE_TYPES[a.type] || a.type}</span></td>
            <td><span class="code">${a.code}</span>${collisions.has(normCode(a.code)) ? html` <span class="chip bad">${icon('stop')}${t('also on another part')}</span>` : ''}${a.note ? html`<div class="tiny muted">${a.note}</div>` : ''}</td>
            <td class="small">${a.source || ''}</td>
            <td class="no-print" style="text-align:end"><button class="btn sm ghost" type="button" data-copy="${a.code}" aria-label="${t('Copy {code}', { code: a.code })}">${icon('copy')}</button></td>
          </tr>`)}</tbody>
        </table></div>
        <div class="card-foot" style="align-items:center">
          <div style="background:#fff;padding:6px 8px;border-radius:8px;width:min(100%,300px)">${raw(barcodeSVG(part.id, { height: 36, width: '100%', heightAttr: 56, label: true }))}</div>
          <p class="tiny muted" style="max-width:46ch">${t('Scanners read this Code 128 label. Every code above resolves to this one part, with or without dashes and spaces.')}</p>
        </div>
      </section>

      ${dec ? decodedBlock(dec, t('How to read {code}', { code: part.designation })) : ''}

      ${looks.length ? html`<section class="stack" aria-labelledby="lk">
        <h2 id="lk">${t("Don't confuse it with")}</h2>
        <div class="compare">${looks.slice(0, 6).map((l) => html`<article class="lookalike">
          <div class="row between"><a href="${partHref(l.part.id)}"><b class="code">${l.part.id}</b></a><span class="chip ${l.duplicate ? 'bad' : l.score >= 0.85 ? 'warn' : ''}">${l.duplicate ? t('Same spec: duplicate?') : l.score >= 0.85 ? t('Very similar') : t('Similar')}</span></div>
          <div class="pair">
            <div>${raw(drawPart(part, { view: 'side' }))}<span class="code">${sizeLabel(part) || part.id}</span><br><b>${t('this part')}</b></div>
            <div>${raw(drawPart(l.part, { view: 'side' }))}<span class="code">${sizeLabel(l.part) || l.part.id}</span><br><b>${shortDifference(part, l.part)}</b></div>
          </div>
          <div class="diffs">${l.diffs.length ? l.diffs.map((x) => html`<div class="${x.important ? 'imp' : ''}">${rich(x.text)}</div>`) : html`<div class="imp">${t('No difference in the spec: probably the same part under two codes.')}</div>`}</div>
          ${[...usedIn].some((dev) => whereUsed(app.index, l.part.id).some((u) => u.device?.id === dev)) ? html`<span class="chip warn">${icon('alert')}${t('Also used in the same device')}</span>` : ''}
        </article>`)}</div>
      </section>` : ''}

      <section class="card">
        <div class="card-head"><h2>${t("Where it's used")}</h2></div>
        ${used.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>${t('Device')}</th><th>${t('Steps')}</th><th>${t('BOM')}</th></tr></thead><tbody>
          ${used.map((u) => html`<tr>
            <td><a href="#/device/${encodeURIComponent(u.device.id)}">${u.device.name}</a></td>
            <td>${u.steps.length ? u.steps.map((s) => html`<a class="chip" href="${stepHref(u.device.id, s.stepId)}" style="margin:2px">${t('Step {n}', { n: s.stepNo })} · ${s.qty}×${s.legacy ? ` (${t('old code')})` : ''}</a>`) : html`<span class="chip bad">${icon('alert')}${t('No step fits it')}</span>`}</td>
            <td>${u.bom.length ? u.bom.map((b) => html`<span class="small">${t('Item {item}:', { item: b.item })} ${b.qty}× <span class="code">${b.code}</span>${b.where ? ` (${b.where})` : ''}</span><br>`) : html`<span class="chip bad">${icon('alert')}${t('Not in the BOM')}</span>`}</td>
          </tr>`)}
        </tbody></table></div>` : html`<div class="card-body muted">${t('Not used in any device in this library.')}</div>`}
      </section>

      ${findings.length ? html`<section class="stack" id="issues"><h2>${t('Integrity check')}</h2>${findings.map((f) => findingCard(f, app))}</section>` : ''}

      ${reports.length ? html`<section class="stack"><h2>${t('Reports from the floor')}</h2>${reports.map((r) => html`<div class="callout warn">${icon('flag')}<div><p class="t">${r.who || t('Someone')} · ${fmtDate(r.createdAt)}</p><p dir="auto">${r.text}</p>${r.photo ? html`<img src="${r.photo}" alt="${t('Photo attached to the report')}" style="max-width:220px;border-radius:10px;margin-top:8px">` : ''}</div></div>`)}</section>` : ''}

      <div class="row no-print"><a class="btn" href="#/teach?part=${encodeURIComponent(part.id)}">${icon('sparkle')}${t('Teach the photo identifier this part')}</a></div>
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
    title: t('Report a doubt'),
    body: String(html`<p class="muted">${t('Something does not match: the part in the bin, the label, the picture or the instruction? Say what you see, in any language. It is saved on this device for your supervisor or engineer.')}</p>
      ${part ? html`<p><b class="code">${part.id}</b> ${part.name}</p>` : ''}
      <div class="field"><label for="rpText">${t('What did you notice?')}</label><textarea id="rpText" dir="auto" placeholder="${t('Example: the bin labelled 100-0233 has screws that look longer than the picture.')}">${preset}</textarea></div>
      <div class="field"><label for="rpWho">${t('Your name (optional)')}</label><input id="rpWho" type="text" autocomplete="name" dir="auto"></div>
      <div class="field"><span class="lbl">${t('Photo (optional)')}</span><input id="rpPhoto" type="file" accept="image/*" capture="environment"><img id="rpPrev" alt="" class="hidden" style="max-width:200px;border-radius:10px"></div>`),
    actions: [{ label: t('Cancel'), value: null }, { label: t('Save report'), value: 'save', primary: true }],
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
  if (!text) { toast(t('Nothing saved: the report was empty.'), 'bad'); return null; }
  // The language it was written in travels with the report, so the reader knows to translate it.
  const rec = await addRecord({ type: 'report', partId: part?.id || null, deviceId: deviceId || null, stepId: stepId || null, text, who, photo, lang: document.documentElement.lang || 'en' });
  toast(t('Report saved on this device.'), 'ok');
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
