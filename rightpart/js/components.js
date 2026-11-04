// Pieces of markup shared by several pages.
import { html, raw, icon, esc } from './ui.js';
import { drawPart } from './draw.js';
import { CODE_TYPES } from './core/model.js';
import { CATEGORY_LABELS, sizeLabel, materialLabel, HEADS, DRIVES } from './core/dims.js';
import { CHECKS } from './core/audit.js';

export const partHref = (id) => `#/part/${encodeURIComponent(id)}`;
export const stepHref = (deviceId, stepId, mode) => `#/guide/${encodeURIComponent(deviceId)}/${encodeURIComponent(stepId)}${mode ? '?mode=' + mode : ''}`;

export function thumb(part) {
  return raw(drawPart(part, { view: 'auto' }));
}

export function statusChip(part) {
  if (part.status === 'obsolete') return html`<span class="chip bad">${icon('xCircle')}Retired${part.replacedBy ? html` → ${part.replacedBy}` : ''}</span>`;
  return '';
}

export function subtitle(part) {
  const bits = [];
  if (part.designation) bits.push(part.designation);
  else bits.push(CATEGORY_LABELS[part.category] || part.category);
  return bits.join(' · ');
}

/** Card linking to a part. extra: html to append (reasons, warnings). */
export function partCard(part, { extra = '', app } = {}) {
  const flags = app?.audit.byPart.get(part.id)?.filter((f) => f.severity === 'critical') || [];
  return html`<a class="pcard" href="${partHref(part.id)}">
    <div class="thumb">${thumb(part)}</div>
    <div>
      <div class="t">${part.name}</div>
      <div class="s"><span class="code">${part.id}</span> · ${subtitle(part)}</div>
      ${(flags.length || part.status === 'obsolete') ? html`<div class="row">${statusChip(part)}${flags.length ? html`<span class="chip bad">${icon('alert')}${flags.length} critical issue${flags.length > 1 ? 's' : ''}</span>` : ''}</div>` : ''}
      ${extra}
    </div>
  </a>`;
}

export function codePill(code, type) {
  return html`<span class="code-pill" title="${CODE_TYPES[type] || type || ''}">${type ? html`<span class="t">${shortType(type)}</span>` : ''}${code}</span>`;
}

export function shortType(type) {
  return { internal: 'INT', customer: 'CUST', supplier: 'SUP', manufacturer: 'MFR', drawing: 'DWG', legacy: 'OLD', designation: 'STD' }[type] || type;
}

export function sevIcon(sev) {
  return icon(sev === 'critical' ? 'stop' : sev === 'warning' ? 'alert' : 'info');
}

export function findingCard(f, app, { compact = false } = {}) {
  const dev = f.deviceId ? app.index.devices.get(f.deviceId) : null;
  return html`<article class="finding ${f.severity}" id="f-${esc(f.id).replace(/[^a-zA-Z0-9_-]/g, '_')}">
    <div class="ic">${sevIcon(f.severity)}</div>
    <div>
      <div class="kind">${CHECKS[f.check]?.label || f.check}${dev ? ` · ${dev.name}` : ''}</div>
      <h3>${f.title}</h3>
      ${compact ? '' : html`<p class="d">${f.detail}</p>`}
      ${!compact && f.suggestion ? html`<p class="fix"><b>What to do: </b>${f.suggestion}</p>` : ''}
      ${!compact && CHECKS[f.check]?.why ? html`<p class="tiny muted" style="margin-top:8px">Why this matters: ${CHECKS[f.check].why}</p>` : ''}
      <div class="links">
        ${f.steps.map((s) => html`<a class="chip" href="${stepHref(s.deviceId, s.stepId)}">${icon('guide')}Step ${s.stepNo}</a>`)}
        ${f.parts.slice(0, 6).map((id) => html`<a class="chip" href="${partHref(id)}">${icon('parts')}<span class="code">${id}</span></a>`)}
        ${(f.codes || []).filter((c) => !f.parts.includes(c)).slice(0, 3).map((c) => html`<a class="chip" href="#/search?q=${encodeURIComponent(c)}">${icon('search')}<span class="code">${c}</span></a>`)}
      </div>
    </div>
  </article>`;
}

export function specFacts(part) {
  const s = part.spec || {};
  const facts = [];
  if (part.category === 'screw') {
    facts.push(['Thread', s.thread || 'M' + s.d, s.pitch ? `pitch ${s.pitch} mm${s.system === 'unified' ? ' (inch)' : ''}` : '']);
    facts.push(['Length', s.lengthLabel ? `${s.lengthLabel}` : `${s.length} mm`, s.head === 'countersunk' ? 'overall, head included' : 'under the head to the tip']);
    facts.push(['Head', HEADS[s.head]?.label || s.head || '—', '']);
    facts.push(['Drive', DRIVES[s.drive]?.label || s.drive || '—', s.driveSize ? `bit / key: ${s.driveSize}` : '']);
  } else if (part.category === 'nut') {
    facts.push(['Thread', s.thread || 'M' + s.d, s.pitch ? `pitch ${s.pitch} mm` : '']);
    facts.push(['Type', s.variant === 'nyloc' ? 'Lock nut, nylon insert' : 'Hex nut', '']);
    if (s.af) facts.push(['Spanner', `${s.af} mm`, `height ${s.m} mm`]);
  } else if (part.category === 'washer') {
    facts.push(['For thread', s.thread || 'M' + s.d, '']);
    facts.push(['Type', { flat: 'Plain washer', 'star-ext': 'Star, external teeth', 'star-int': 'Star, internal teeth', split: 'Split spring washer' }[s.variant || 'flat'], '']);
    facts.push(['Size', `Ø${s.od} / Ø${s.id} mm`, `${s.t} mm thick`]);
  } else if (part.category === 'standoff') {
    facts.push(['Thread', s.thread || 'M' + s.d, s.gender === 'M-F' ? 'male one end, female the other' : s.gender]);
    facts.push(['Body length', `${s.length} mm`, s.maleLength ? `+ ${s.maleLength} mm male thread` : '']);
    facts.push(['Hex', `${s.af} mm`, 'across flats']);
  } else {
    for (const [k, v] of Object.entries(s)) facts.push([k[0].toUpperCase() + k.slice(1), String(v), '']);
  }
  if (s.material) facts.push(['Material', materialLabel(s.material), '']);
  return facts;
}

export function factsGrid(facts) {
  return html`<div class="facts">${facts.map(([k, v, n]) => html`<div class="fact"><div class="k">${k}</div><div class="v">${v}</div>${n ? html`<div class="n">${n}</div>` : ''}</div>`)}</div>`;
}

export function emptyState(text, action = '') {
  return html`<div class="empty"><p>${text}</p>${action ? html`<div style="margin-top:12px">${action}</div>` : ''}</div>`;
}

export function sizeTag(part) {
  const s = sizeLabel(part);
  return s ? html`<span class="chip">${s}</span>` : '';
}
