import { html, icon } from '../ui.js';
import { partCard, emptyState } from '../components.js';
import { CATEGORY_LABELS } from '../core/dims.js';

const CATS = [
  ['all', 'All'], ['screw', 'Screws'], ['nut', 'Nuts'], ['washer', 'Washers'], ['standoff', 'Standoffs'], ['other', 'Other parts'],
];

export default async function parts({ app, query }) {
  const cat = query.get('cat') || 'all';
  const only = query.get('only') || '';
  const used = new Set([...app.index.usage.keys(), ...app.index.bomUsage.keys()]);
  const list = app.lib.parts.filter((p) => {
    if (cat === 'other' && ['screw', 'nut', 'washer', 'standoff'].includes(p.category)) return false;
    if (cat !== 'all' && cat !== 'other' && p.category !== cat) return false;
    if (only === 'used' && !used.has(p.id)) return false;
    if (only === 'issues' && !app.audit.byPart.get(p.id)?.some((f) => f.severity !== 'info')) return false;
    return true;
  });
  const order = { screw: 0, nut: 1, washer: 2, standoff: 3 };
  list.sort((a, b) => (order[a.category] ?? 9) - (order[b.category] ?? 9) || a.id.localeCompare(b.id));
  const link = (c, o) => `#/parts?cat=${c}${o ? '&only=' + o : ''}`;
  return {
    title: 'Parts',
    html: html`<div class="page">
      <div class="page-head">
        <div>
          <h1>Parts library</h1>
          <p class="lede">${app.lib.parts.length} parts under ${app.index.byCode.size} codes. Open a part to see every code it goes by, a true-scale drawing, what it does and which parts it is easy to confuse with.</p>
        </div>
        <div class="row">
          <a class="btn" href="#/labels?ids=${encodeURIComponent(list.filter((p) => ['screw', 'nut', 'washer', 'standoff'].includes(p.category)).map((p) => p.id).join(','))}">${icon('print')}Bin labels</a>
          <a class="btn" href="#/data">${icon('upload')}Import</a>
        </div>
      </div>
      <div class="filters" role="group" aria-label="Filter by type">
        ${CATS.map(([c, l]) => html`<a class="chip" href="${link(c, only)}" ${c === cat ? html`aria-current="page" style="background:var(--brand);border-color:var(--brand);color:var(--brand-ink)"` : ''}>${l}</a>`)}
        <span style="flex:1"></span>
        <a class="chip" href="${link(cat, only === 'used' ? '' : 'used')}" ${only === 'used' ? html`style="background:var(--brand-soft);border-color:var(--brand)"` : ''}>${icon('cube')}Used in a device</a>
        <a class="chip" href="${link(cat, only === 'issues' ? '' : 'issues')}" ${only === 'issues' ? html`style="background:var(--bad-soft);border-color:var(--bad)"` : ''}>${icon('alert')}With issues</a>
      </div>
      ${list.length ? html`<div class="parts-grid">${list.map((p) => partCard(p, { app }))}</div>` : emptyState('No parts match these filters.', html`<a class="btn" href="#/parts">Show all</a>`)}
      <p class="tiny muted">Categories: ${Object.values(CATEGORY_LABELS).join(', ')}.</p>
    </div>`,
  };
}
