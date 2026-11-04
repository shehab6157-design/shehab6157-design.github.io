import { html, icon } from '../ui.js';
import { search, matchSpec, CODE_TYPES } from '../core/model.js';
import { decodedSpec, summarizeDecoded } from '../core/decode.js';
import { thumb, partHref, subtitle, statusChip } from '../components.js';

export function decodedBlock(dec, title = 'How to read it') {
  if (!dec || !dec.parts.length) return '';
  return html`<section class="card pad decoded" aria-label="${title}">
    <div class="row between"><h2>${title}</h2><span class="chip brand">${icon('sparkle')}${summarizeDecoded(dec)}</span></div>
    <div class="pieces">${dec.parts.map((p) => html`<div class="piece"><span class="tok">${p.token}</span><span class="m">${p.meaning}</span></div>`)}</div>
  </section>`;
}

export default async function searchView({ app, query }) {
  const q = query.get('q') || '';
  const res = search(app.index, q, { limit: 40 });
  const ex = res.exact;
  let alert = '';
  if (ex?.status === 'ambiguous') {
    alert = html`<div class="callout bad" role="alert">${icon('stop')}<div>
      <p class="t">Stop: “${q}” points to ${ex.matches.length} different parts</p>
      <p>The same code is recorded for ${ex.matches.map((m, i) => html`${i ? ' and ' : ''}<a href="${partHref(m.part.id)}"><b class="code">${m.part.id}</b> ${m.part.name}</a> (${(CODE_TYPES[m.alias.type] || m.alias.type).toLowerCase()}${m.alias.source ? `, ${m.alias.source}` : ''})`)}. Whoever reads this code can pick either one. Do not use it until it is resolved.</p>
      <div class="acts"><a class="btn sm" href="#/audit">${icon('shield')}See the integrity check</a></div>
    </div></div>`;
  } else if (ex?.status === 'unique' && ex.legacy) {
    alert = html`<div class="callout warn">${icon('history')}<div><p class="t">${q} is an old code</p><p>It was retired${ex.alias.note ? ` (${ex.alias.note.toLowerCase()})` : ''}. The current code is <a href="${partHref(ex.part.id)}"><b class="code">${ex.part.id}</b></a>. Ask for documents and bin labels that still show the old code to be updated.</p></div></div>`;
  }
  let conflict = '';
  if (ex?.status === 'unique' && res.decoded) {
    const ds = decodedSpec(res.decoded);
    if (res.decoded.standard?.guessed) { delete ds.head; delete ds.drive; }
    delete ds.category;
    const m = Object.keys(ds).length ? matchSpec(ex.part, ds) : null;
    if (m && m.missed) conflict = html`<div class="callout warn">${icon('alert')}<div><p class="t">The code itself reads as a different part</p><p>“${q}” reads as ${summarizeDecoded(res.decoded)}, but it is recorded for <b class="code">${ex.part.id}</b> (${ex.part.name}): ${m.misses.join(', ')}. Check the physical part before trusting this code.</p></div></div>`;
  }
  return {
    title: q ? `Search: ${q}` : 'Search',
    html: html`<div class="page">
      <div class="page-head"><div>
        <div class="crumbs"><a href="#/parts">Parts</a><span>/</span><span>Search</span></div>
        <h1>${q ? html`Results for “<span class="code">${q}</span>”` : 'Search'}</h1>
        <p class="lede">${res.results.length ? `${res.results.length} part${res.results.length > 1 ? 's' : ''} found. Codes match without spaces, dashes or capitals, so 100 0233, 1000233 and 100-0233 are the same.` : ''}</p>
      </div></div>
      ${alert}${conflict}
      ${decodedBlock(res.decoded)}
      ${res.results.length ? html`<div class="results">${res.results.map((r) => html`<a class="result" href="${partHref(r.part.id)}${r.reasons[0]?.kind === 'code' ? `?code=${encodeURIComponent(q)}` : ''}">
          <div class="thumb">${thumb(r.part)}</div>
          <div>
            <div class="t">${r.part.name}</div>
            <div class="muted small"><span class="code">${r.part.id}</span> · ${subtitle(r.part)}</div>
            <div class="why">${statusChip(r.part)}${r.reasons.slice(0, 3).map((x) => html`<span class="chip ${x.kind === 'code' ? (ex?.status === 'ambiguous' ? 'bad' : 'ok') : x.kind === 'near' ? 'warn' : x.kind === 'fuzzy' ? 'info' : ''}">${icon(x.kind === 'code' ? 'check' : x.kind === 'near' ? 'alert' : x.kind === 'fuzzy' ? 'info' : 'tag')}${x.text}</span>`)}</div>
          </div>
          <div class="score">${r.reasons[0]?.kind === 'code' ? 'Exact code' : r.reasons[0]?.kind === 'spec' ? 'Same size' : r.reasons[0]?.kind === 'near' ? 'Similar' : ''}</div>
        </a>`)}</div>` : html`<div class="empty">
          <h2>No part found for “${q}”</h2>
          <p style="margin-top:8px">Check the code on the label, or identify the part another way.</p>
          <div class="row" style="justify-content:center;margin-top:14px"><a class="btn primary" href="#/identify">${icon('ruler')}Measure or photograph it</a><a class="btn" href="#/parts">Browse all parts</a></div>
        </div>`}
    </div>`,
  };
}
