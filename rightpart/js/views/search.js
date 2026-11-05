import { html, icon } from '../ui.js';
import { th } from '../ui.js';
import { t, lower } from '../core/i18n.js';
import { partText } from '../core/content.js';
import { search, matchSpec, CODE_TYPES } from '../core/model.js';
import { decodedSpec, summarizeDecoded } from '../core/decode.js';
import { thumb, partHref, subtitle, statusChip } from '../components.js';

export function decodedBlock(dec, title = t('How to read it')) {
  if (!dec || !dec.parts.length) return '';
  return html`<section class="card pad decoded" aria-label="${title}">
    <div class="row between"><h2>${title}</h2><span class="chip brand">${icon('sparkle')}${summarizeDecoded(dec)}</span></div>
    <div class="pieces">${dec.parts.map((p) => html`<div class="piece"><span class="tok" dir="ltr">${p.token}</span><span class="m">${p.meaning}</span></div>`)}</div>
  </section>`;
}

export default async function searchView({ app, query }) {
  const q = query.get('q') || '';
  const res = search(app.index, q, { limit: 40 });
  const ex = res.exact;
  let alert = '';
  if (ex?.status === 'ambiguous') {
    alert = html`<div class="callout bad" role="alert">${icon('stop')}<div>
      <p class="t">${th('Stop: “{q}” points to {n} different parts', { q, n: ex.matches.length })}</p>
      <p>${th('The same code is recorded for {parts}. Whoever reads this code can pick either one. Do not use it until it is resolved.', { parts: ex.matches.map((m, i) => html`${i ? ' · ' : ''}<a href="${partHref(m.part.id)}"><b class="code">${m.part.id}</b> ${partText(m.part, app.lib).name}</a> (${lower(CODE_TYPES[m.alias.type] || m.alias.type)}${m.alias.source ? `, ${m.alias.source}` : ''})`) })}</p>
      <div class="acts"><a class="btn sm" href="#/audit">${icon('shield')}${t('See the integrity check')}</a></div>
    </div></div>`;
  } else if (ex?.status === 'unique' && ex.legacy) {
    alert = html`<div class="callout warn">${icon('history')}<div><p class="t">${th('{code} is an old code', { code: q })}</p><p>${ex.alias.note ? t('It was retired ({note}).', { note: ex.alias.note.toLowerCase() }) : t('It was retired.')} ${th('The current code is {code}.', { code: html`<a href="${partHref(ex.part.id)}"><b class="code">${ex.part.id}</b></a>` })} ${t('Ask for documents and bin labels that still show the old code to be updated.')}</p></div></div>`;
  }
  let conflict = '';
  if (ex?.status === 'unique' && res.decoded) {
    const ds = decodedSpec(res.decoded);
    if (res.decoded.standard?.guessed) { delete ds.head; delete ds.drive; }
    delete ds.category;
    const m = Object.keys(ds).length ? matchSpec(ex.part, ds) : null;
    if (m && m.missed) conflict = html`<div class="callout warn">${icon('alert')}<div><p class="t">${t('The code itself reads as a different part')}</p><p>${th('“{q}” reads as {says}, but it is recorded for {id} ({name}): {misses}. Check the physical part before trusting this code.', { q, says: summarizeDecoded(res.decoded), id: html`<b class="code">${ex.part.id}</b>`, name: partText(ex.part, app.lib).name, misses: m.misses.join(', ') })}</p></div></div>`;
  }
  return {
    title: q ? t('Search: {q}', { q }) : t('Search'),
    html: html`<div class="page">
      <div class="page-head"><div>
        <div class="crumbs"><a href="#/parts">${t('Parts')}</a><span>/</span><span>${t('Search')}</span></div>
        <h1>${q ? th('Results for “{q}”', { q: html`<span class="code">${q}</span>` }) : t('Search')}</h1>
        <p class="lede">${res.results.length ? t('{n, plural, one {# part found.} other {# parts found.}} Codes match without spaces, dashes or capitals, so 100 0233, 1000233 and 100-0233 are the same.', { n: res.results.length }) : ''}</p>
      </div></div>
      ${alert}${conflict}
      ${decodedBlock(res.decoded)}
      ${res.results.length ? html`<div class="results">${res.results.map((r) => html`<a class="result" href="${partHref(r.part.id)}${r.reasons[0]?.kind === 'code' ? `?code=${encodeURIComponent(q)}` : ''}">
          <div class="thumb">${thumb(r.part)}</div>
          <div>
            <div class="t">${partText(r.part, app.lib).name}</div>
            <div class="muted small"><span class="code">${r.part.id}</span> · ${subtitle(r.part)}</div>
            <div class="why">${statusChip(r.part)}${r.reasons.slice(0, 3).map((x) => html`<span class="chip ${x.kind === 'code' ? (ex?.status === 'ambiguous' ? 'bad' : 'ok') : x.kind === 'near' ? 'warn' : x.kind === 'fuzzy' ? 'info' : ''}">${icon(x.kind === 'code' ? 'check' : x.kind === 'near' ? 'alert' : x.kind === 'fuzzy' ? 'info' : 'tag')}${x.text}</span>`)}</div>
          </div>
          <div class="score">${r.reasons[0]?.kind === 'code' ? t('Exact code') : r.reasons[0]?.kind === 'spec' ? t('Same size') : r.reasons[0]?.kind === 'near' ? t('Similar') : ''}</div>
        </a>`)}</div>` : html`<div class="empty">
          <h2>${th('No part found for “{q}”', { q })}</h2>
          <p style="margin-top:8px">${t('Check the code on the label, or identify the part another way.')}</p>
          <div class="row" style="justify-content:center;margin-top:14px"><a class="btn primary" href="#/identify">${icon('ruler')}${t('Measure or photograph it')}</a><a class="btn" href="#/parts">${t('Browse all parts')}</a></div>
        </div>`}
    </div>`,
  };
}
