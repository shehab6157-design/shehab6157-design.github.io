import { html, raw, icon } from '../ui.js';
import { drawPart, partExtentMm } from '../draw.js';
import { barcodeSVG } from '../core/code128.js';
import { findLookalikes, shortDifference } from '../core/lookalike.js';
import { sizeLabel, isFastener } from '../core/dims.js';
import { otherCodes } from '../core/model.js';

// Bin labels at 100 × 50 mm. The drawing on the left is printed at true size,
// so anyone can lay the part from the bin on its own outline.

export default async function labels({ app, query }) {
  const ids = (query.get('ids') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const parts = ids.map((id) => app.index.parts.get(id)).filter(Boolean);
  const label = (p) => {
    const ext = partExtentMm(p);
    const fits = ext && ext.length <= 34 && ext.width <= 36;
    const look = findLookalikes(app.lib.parts, p).filter((l) => l.score >= 0.85)[0];
    const codes = otherCodes(p).slice(0, 4).map((a) => a.code);
    return html`<div class="binlabel">
      <div class="draw">
        <div>${raw(drawPart(p, { view: 'auto', mode: fits ? 'print' : 'fit', pad: 1 }))}</div>
        <div class="note">${fits ? 'ACTUAL SIZE: lay the part here' : isFastener(p) ? 'Scaled to fit' : ''}</div>
      </div>
      <div style="display:grid;align-content:start;gap:.6mm;min-width:0">
        <div class="code">${p.id}</div>
        <div class="nm">${p.name}</div>
        <div style="height:12mm;margin-top:1mm">${raw(barcodeSVG(p.id, { height: 40, width: '100%', heightAttr: '12mm' }))}</div>
        ${codes.length ? html`<div class="al">Also: ${codes.join(' · ')}</div>` : ''}
        ${look ? html`<div class="warn">NOT ${look.part.id} ${sizeLabel(look.part) ? `(${sizeLabel(look.part)})` : ''}: ${shortDifference(p, look.part)}</div>` : ''}
      </div>
    </div>`;
  };
  return {
    title: 'Bin labels',
    html: html`<div class="page">
      <div class="page-head no-print"><div><div class="crumbs"><a href="#/parts">Parts</a><span>/</span><span>Labels</span></div><h1>Bin labels</h1><p class="lede">${parts.length} label${parts.length === 1 ? '' : 's'}, 100 × 50 mm. Print at 100% scale ("actual size", not "fit to page") so the outlines are true to size. Check one with a ruler: the barcode block is exactly 12 mm tall.</p></div>
        <div class="row"><button class="btn primary" type="button" id="printBtn">${icon('print')}Print</button></div></div>
      ${parts.length ? html`<div class="label-sheet">${parts.map(label)}</div>` : html`<div class="empty">No parts selected. Open a part and press "Bin label", or use "Bin labels" on the parts list.</div>`}
    </div>`,
    mount(root) { root.querySelector('#printBtn')?.addEventListener('click', () => window.print()); },
  };
}
