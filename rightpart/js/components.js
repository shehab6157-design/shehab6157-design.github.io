// Pieces of markup shared by several pages.
import { html, th, raw, icon, esc, rich } from './ui.js';
import { t } from './core/i18n.js';
import { partText } from './core/content.js';
import { drawPart } from './draw.js';
import { CODE_TYPES } from './core/model.js';
import { CATEGORY_LABELS, sizeLabel, materialLabel, HEADS, DRIVES } from './core/dims.js';
import { CHECKS } from './core/audit.js';
import { cachedPoster } from './posters.js';

export const partHref = (id) => `#/part/${encodeURIComponent(id)}`;
export const stepHref = (deviceId, stepId, mode) => `#/guide/${encodeURIComponent(deviceId)}/${encodeURIComponent(stepId)}${mode ? '?mode=' + mode : ''}`;
/** Where "show me how to build it" goes: the 3D guide when the product has a 3D model, else the step-by-step guide. */
export const guideHref = (dev, stepId) => {
  const steps = dev.instructions?.steps || [];
  if (dev.scene) return `#/show/${encodeURIComponent(dev.id)}${stepId ? `/${encodeURIComponent(stepId)}` : ''}`;
  return steps.length ? stepHref(dev.id, stepId || steps[0].id, 'learn') : `#/device/${encodeURIComponent(dev.id)}`;
};

/** The picture of a product (made from its 3D model on this device), with a play button when it opens the 3D guide. */
export function poster(dev, { play = true, cls = '' } = {}) {
  const pic = cachedPoster(dev);
  return html`<span class="poster ${cls} ${pic ? 'ready' : dev.scene ? '' : 'none'}">${dev.scene ? html`<img data-poster="${dev.id}" ${pic ? html`src="${pic}"` : ''} alt="" draggable="false">` : ''}<span class="ph">${icon('cube')}</span>${play && dev.scene ? html`<span class="play">${icon('play')}</span>` : ''}</span>`;
}

/** A product: its picture, its name, and one tap into the guide. */
export function productCard(app, dev) {
  const steps = dev.instructions?.steps || [];
  const crit = app.audit.findings.filter((f) => f.deviceId === dev.id && f.severity === 'critical').length;
  return html`<article class="prod">
    <a class="prod-main" href="${guideHref(dev)}">
      ${poster(dev)}
      <span class="prod-name">${dev.name}</span>
      <span class="prod-meta">${dev.scene ? html`${icon('cube')}${t('3D guide')} · ` : ''}${t('{n, plural, one {# step} other {# steps}}', { n: steps.length })}${crit ? html` · <span class="bad">${icon('alert')}${t('{n, plural, one {# critical issue} other {# critical issues}}', { n: crit })}</span>` : ''}</span>
    </a>
    <a class="prod-more" href="#/device/${encodeURIComponent(dev.id)}" aria-label="${t('About {device}', { device: dev.name })}" title="${t('About {device}', { device: dev.name })}">${icon('info')}</a>
  </article>`;
}

export function thumb(part) {
  return raw(drawPart(part, { view: 'auto' }));
}

export function statusChip(part) {
  if (part.status === 'obsolete') return html`<span class="chip bad">${icon('xCircle')}${t('Retired')}${part.replacedBy ? html` <span class="flip-arrow">→</span> <span class="code">${part.replacedBy}</span>` : ''}</span>`;
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
      <div class="t">${app ? partText(part, app.lib).name : part.name}</div>
      <div class="s"><span class="code">${part.id}</span> · ${subtitle(part)}</div>
      ${(flags.length || part.status === 'obsolete') ? html`<div class="row">${statusChip(part)}${flags.length ? html`<span class="chip bad">${icon('alert')}${t('{n, plural, one {# critical issue} other {# critical issues}}', { n: flags.length })}</span>` : ''}</div>` : ''}
      ${extra}
    </div>
  </a>`;
}

export function codePill(code, type) {
  return html`<span class="code-pill" title="${CODE_TYPES[type] || type || ''}">${type ? html`<span class="t">${shortType(type)}</span>` : ''}${code}</span>`;
}

export function shortType(type) {
  const map = { internal: () => t('code-short::INT'), customer: () => t('code-short::CUST'), supplier: () => t('code-short::SUP'), manufacturer: () => t('code-short::MFR'), drawing: () => t('code-short::DWG'), legacy: () => t('code-short::OLD'), designation: () => t('code-short::STD') };
  return map[type]?.() || type;
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
      <h3>${rich(f.title)}</h3>
      ${compact ? '' : html`<p class="d">${rich(f.detail)}</p>`}
      ${!compact && f.suggestion ? html`<p class="fix"><b>${t('What to do:')} </b>${rich(f.suggestion)}</p>` : ''}
      ${!compact && CHECKS[f.check]?.why ? html`<p class="tiny muted" style="margin-top:8px">${t('Why this matters:')} ${CHECKS[f.check].why}</p>` : ''}
      <div class="links">
        ${f.steps.map((s) => html`<a class="chip" href="${stepHref(s.deviceId, s.stepId)}">${icon('guide')}${t('Step {n}', { n: s.stepNo })}</a>`)}
        ${f.parts.slice(0, 6).map((id) => html`<a class="chip" href="${partHref(id)}">${icon('parts')}<span class="code">${id}</span></a>`)}
        ${(f.codes || []).filter((c) => !f.parts.includes(c)).slice(0, 3).map((c) => html`<a class="chip" href="#/search?q=${encodeURIComponent(c)}">${icon('search')}<span class="code">${c}</span></a>`)}
      </div>
    </div>
  </article>`;
}

export function specFacts(part) {
  const s = part.spec || {};
  const facts = [];
  const pitch = (inch) => (s.pitch ? (inch ? t('pitch {n} mm (inch)', { n: s.pitch }) : t('pitch {n} mm', { n: s.pitch })) : '');
  if (part.category === 'screw') {
    facts.push([t('Thread'), s.thread || 'M' + s.d, pitch(s.system === 'unified')]);
    facts.push([t('Length'), s.lengthLabel ? `${s.lengthLabel}` : `${s.length} mm`, s.head === 'countersunk' ? t('overall, head included') : t('under the head to the tip')]);
    facts.push([t('Head'), HEADS[s.head]?.label || s.head || '—', '']);
    facts.push([t('Drive'), DRIVES[s.drive]?.label || s.drive || '—', s.driveSize ? t('bit / key: {size}', { size: s.driveSize }) : '']);
  } else if (part.category === 'nut') {
    facts.push([t('Thread'), s.thread || 'M' + s.d, pitch(false)]);
    facts.push([t('Type'), s.variant === 'nyloc' ? t('Lock nut, nylon insert') : t('Hex nut'), '']);
    if (s.af) facts.push([t('Spanner'), `${s.af} mm`, t('height {n} mm', { n: s.m })]);
  } else if (part.category === 'washer') {
    facts.push([t('For thread'), s.thread || 'M' + s.d, '']);
    const types = { flat: () => t('Plain washer'), 'star-ext': () => t('Star, external teeth'), 'star-int': () => t('Star, internal teeth'), split: () => t('Split spring washer') };
    facts.push([t('Type'), types[s.variant || 'flat']?.() || s.variant, '']);
    facts.push([t('Size'), `Ø${s.od} / Ø${s.id} mm`, t('{n} mm thick', { n: s.t })]);
  } else if (part.category === 'standoff') {
    facts.push([t('Thread'), s.thread || 'M' + s.d, s.gender === 'M-F' ? t('male one end, female the other') : s.gender]);
    facts.push([t('Body length'), `${s.length} mm`, s.maleLength ? t('+ {n} mm male thread', { n: s.maleLength }) : '']);
    facts.push([t('Hex'), `${s.af} mm`, t('across flats')]);
  } else {
    for (const [k, v] of Object.entries(s)) facts.push([k[0].toUpperCase() + k.slice(1), String(v), '']);
  }
  if (s.material) facts.push([t('Material'), materialLabel(s.material), '']);
  return facts;
}

export function factsGrid(facts) {
  return html`<div class="facts">${facts.map(([k, v, n]) => html`<div class="fact"><div class="k">${k}</div><div class="v" dir="auto">${v}</div>${n ? html`<div class="n">${n}</div>` : ''}</div>`)}</div>`;
}

export function emptyState(text, action = '') {
  return html`<div class="empty"><p>${text}</p>${action ? html`<div style="margin-top:12px">${action}</div>` : ''}</div>`;
}

export function sizeTag(part) {
  const s = sizeLabel(part);
  return s ? html`<span class="chip">${s}</span>` : '';
}

void th;
