import { html, raw, icon } from '../ui.js';
import { th } from '../ui.js';
import { t } from '../core/i18n.js';
import { partText } from '../core/content.js';
import { drawPart, partExtentMm } from '../draw.js';
import { barcodeSVG } from '../core/code128.js';
import { findLookalikes, shortDifference } from '../core/lookalike.js';
import { sizeLabel, isFastener } from '../core/dims.js';
import { otherCodes } from '../core/model.js';
import { getSignals, forgetMemory } from '../memory.js';
import { markSVG, markName } from '../core/signals.js';
import { partHref } from '../components.js';

// Bin labels at 100 × 50 mm. The drawing on the left is printed at true size,
// so anyone can lay the part from the bin on its own outline.

export default async function labels({ app, query, navigate }) {
  const ids = (query.get('ids') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const parts = ids.map((id) => app.index.parts.get(id)).filter(Boolean);
  const signals = await getSignals(app);
  const marked = [...signals.marks.entries()].map(([id, m]) => ({ part: app.index.parts.get(id), m })).filter((x) => x.part).sort((a, b) => a.part.id.localeCompare(b.part.id));
  const unlocked = marked.filter((x) => !x.m.locked).length;
  const label = (p) => {
    const ext = partExtentMm(p);
    const fits = ext && ext.length <= 34 && ext.width <= 36;
    const look = findLookalikes(app.lib.parts, p).filter((l) => l.score >= 0.85)[0];
    const codes = otherCodes(p).slice(0, 4).map((a) => a.code);
    const mark = signals.marks.get(p.id);
    return html`<div class="binlabel ${mark ? 'has-mark' : ''}">
      ${mark ? html`<div class="bl-mark">${raw(markSVG(mark, { size: 40, title: markName(mark, t) }))}<span>${markName(mark, t)}</span></div>` : ''}
      <div class="draw">
        <div>${raw(drawPart(p, { view: 'auto', mode: fits ? 'print' : 'fit', pad: 1 }))}</div>
        <div class="note">${fits ? t('ACTUAL SIZE: lay the part here') : isFastener(p) ? t('Scaled to fit') : ''}</div>
      </div>
      <div style="display:grid;align-content:start;gap:.6mm;min-width:0">
        <div class="code">${p.id}</div>
        <div class="nm">${partText(p, app.lib).name}</div>
        <div style="height:12mm;margin-top:1mm">${raw(barcodeSVG(p.id, { height: 40, width: '100%', heightAttr: '12mm' }))}</div>
        ${codes.length ? html`<div class="al">${t('Also:')} <span class="code">${codes.join(' · ')}</span></div>` : ''}
        ${look ? html`<div class="warn">${th('NOT {part}: {diff}', { part: sizeLabel(look.part) ? `${look.part.id} (${sizeLabel(look.part)})` : look.part.id, diff: shortDifference(p, look.part) })}</div>` : ''}
      </div>
    </div>`;
  };
  return {
    title: t('Bin labels'),
    html: html`<div class="page">
      <div class="page-head no-print"><div><div class="crumbs"><a href="#/parts">${t('Parts')}</a><span>/</span><span>${t('Labels')}</span></div><h1>${t('Bin labels')}</h1><p class="lede">${t('{n, plural, one {# label} other {# labels}}, 100 × 50 mm. Print at 100% scale ("actual size", not "fit to page") so the outlines are true to size. Check one with a ruler: the barcode block is exactly 12 mm tall.', { n: parts.length })} ${t('Labels print in the language chosen in RightPart; codes and sizes are the same in every language.')}</p></div>
        <div class="row"><button class="btn primary" type="button" id="printBtn">${icon('print')}${t('Print')}</button></div></div>
      ${parts.length ? html`<div class="label-sheet">${parts.map(label)}</div>` : html`<div class="empty">${t('No parts selected. Open a part and press "Bin label", or use "Bin labels" on the parts list.')}</div>`}
      <section class="card no-print" id="marks">
        <div class="card-head"><div><h2>${t('Signal marks')}</h2><p class="small muted">${t('Parts that look alike, or that were mixed up at the bench, get marks that differ in colour and in shape when they are used in the same device. The shape works for colour-blind eyes and needs no reading. The scan is still the check: the mark gets the hand to the right bin first.')}</p></div><span class="chip">${marked.length}</span></div>
        ${marked.length ? html`<div class="mark-grid">${marked.map(({ part, m }) => html`<a class="mark-cell" href="${partHref(part.id)}">${raw(markSVG(m, { size: 34, title: markName(m, t) }))}<span><b class="code">${part.id}</b>${sizeLabel(part) ? html` <span class="code small">${sizeLabel(part)}</span>` : ''}<br><span class="tiny muted">${markName(m, t)}${m.locked ? ' · ' + t('locked') : ''}</span></span></a>`)}</div>` : html`<div class="card-body muted">${t('No look-alike parts share a device: no marks needed.')}</div>`}
        ${signals.clashes.length ? html`<div class="card-body small" style="color:var(--warn)">${icon('alert')} ${t('{n, plural, one {# pair still shares a colour or a shape: separate those bins.} other {# pairs still share a colour or a shape: separate those bins.}}', { n: signals.clashes.length })}</div>` : ''}
        <div class="card-body row between" style="border-top:1px solid var(--line)">
          <span class="small">${unlocked ? t('{n, plural, one {# mark is not locked yet: it may change when the library changes. Lock the marks before you print labels.} other {# marks are not locked yet: they may change when the library changes. Lock the marks before you print labels.}}', { n: unlocked }) : t('All marks are locked: they stay as printed.')}</span>
          <div class="row">
            ${parts.length === 0 && marked.length ? html`<a class="btn sm" href="#/labels?ids=${encodeURIComponent(marked.map((x) => x.part.id).join(','))}">${icon('print')}${t('Labels for these parts')}</a>` : ''}
            ${unlocked ? html`<button class="btn sm primary" type="button" id="lockMarks">${icon('lock')}${t('Lock the marks')}</button>` : ''}
          </div>
        </div>
      </section>
    </div>`,
    mount(root) {
      root.querySelector('#printBtn')?.addEventListener('click', () => window.print());
      root.querySelector('#lockMarks')?.addEventListener('click', async () => {
        const { commitLibrary } = await import('../importflows.js');
        const locked = { ...(app.lib.signals || {}) };
        for (const { part, m } of marked) locked[part.id] = { color: m.color, shape: m.shape };
        forgetMemory();
        await commitLibrary(app, { ...app.lib, signals: locked }, t('Marks locked: they stay the same on every tablet that gets this version.'));
        navigate(location.hash);
      });
    },
  };
}
