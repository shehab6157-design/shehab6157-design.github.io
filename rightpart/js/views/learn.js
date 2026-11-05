import { html, th, raw, icon } from '../ui.js';
import { t } from '../core/i18n.js';
import { drawPart, drawChoice } from '../draw.js';
import { HEADS, DRIVES, MATERIALS } from '../core/dims.js';
import { decodeDesignation } from '../core/decode.js';
import { decodedBlock } from './search.js';

const demo = (spec, category = 'screw') => ({ id: 'learn', category, name: 'Example', spec: { pitch: 0.5, material: 'A2', d: 3, ...spec } });
const code = (c) => html`<b class="code">${c}</b>`;

export default async function learn({ app }) {
  const dev = app.lib.devices?.[0];
  return {
    title: t('Learn fasteners'),
    html: html`<div class="page narrow">
      <div class="page-head"><div>
        <h1>${t('Fastener basics')}</h1>
        <p class="lede">${t('Everything a new person on the line needs to tell screws apart, read their codes and fit them right. Ten minutes, then try the quiz.')}</p>
      </div>${dev ? html`<a class="btn primary" href="#/quiz/${encodeURIComponent(dev.id)}">${icon('quiz')}${t('Quiz')}</a>` : ''}</div>

      <section class="card pad stack">
        <h2>${t('1. Read any code')}</h2>
        <p class="muted">${th('A code like {code} is a complete description. Type one, or one from a bag or a supplier list:', { code: code('ISO 7380 M3x8 A2') })}</p>
        <form class="verify-row" id="decForm" autocomplete="off"><input id="decIn" type="text" dir="ltr" value="ISO 7380 M3x8 A2" aria-label="${t('Code to explain')}" spellcheck="false"><button class="btn primary" type="submit">${t('Explain')}</button></form>
        <div id="decOut">${decodedBlock(decodeDesignation('ISO 7380 M3x8 A2'), t('What it means'))}</div>
        <div class="try"><span class="lbl">${t('More:')}</span>${['DIN 912 M4x10 12.9', 'ISO 7045 M3x6 Z zinc', '#4-40 x 1/4 PPH', 'ISO 10511 M3 A2', 'DIN 6798 A M4'].map((c) => html`<button class="chip" type="button" data-dec="${c}"><span class="code">${c}</span></button>`)}</div>
      </section>

      <section class="stack">
        <h2>${t('2. Head types')}</h2>
        <div class="grid three">${Object.entries(HEADS).map(([k, v]) => html`<div class="card pad stack tight"><div style="height:90px">${raw(drawChoice('head', k))}</div><h3>${v.label}</h3><p class="small muted">${v.note}</p></div>`)}</div>
      </section>

      <section class="stack">
        <h2>${t('3. Drive types')}</h2>
        <div class="grid three">${Object.entries(DRIVES).filter(([k]) => k !== 'external').map(([k, v]) => html`<div class="card pad stack tight"><div style="height:90px">${raw(drawChoice('drive', k))}</div><h3>${v.label}</h3><p class="small muted">${v.note}</p></div>`)}</div>
        <div class="callout warn">${icon('alert')}<div><p class="t">${t('Phillips or Pozidriv?')}</p><p>${t('Look between the arms of the cross: Pozidriv has four extra fine lines at 45°. A Phillips bit in a Pozidriv screw slips out under torque and chews the head (and the other way round).')}</p></div></div>
      </section>

      <section class="stack">
        <h2>${t('4. Length: where to measure')}</h2>
        <div class="grid two">
          <div class="card pad stack tight"><div class="drawing-box" style="min-height:160px">${raw(drawPart(demo({ head: 'pan', drive: 'phillips', length: 8 }), { view: 'side', dims: true }))}</div><p class="small">${th('Most screws: from {where} to the tip.', { where: html`<b>${t('under the head')}</b>` })}</p></div>
          <div class="card pad stack tight"><div class="drawing-box" style="min-height:160px">${raw(drawPart(demo({ head: 'countersunk', drive: 'hex', driveSize: '2', length: 8 }), { view: 'side', dims: true }))}</div><p class="small">${th('Countersunk screws: {where}, head included, because the head sits inside the part.', { where: html`<b>${t('overall')}</b>` })}</p></div>
        </div>
        <p class="muted">${t('Two millimetres is easy to miss by eye and is exactly the kind of mistake that runs for years. When in doubt, lay the screw on a true-scale drawing (part pages have an "Actual size" button) or use the gauge on the Identify page.')}</p>
      </section>

      <section class="stack">
        <h2>${t('5. Metric or inch')}</h2>
        <div class="grid two">
          <div class="card pad stack tight"><div class="drawing-box" style="min-height:150px">${raw(drawPart(demo({ head: 'pan', drive: 'phillips', length: 6.35, pitch: 0.5 }), { view: 'side', dims: true }))}</div><p class="small">${th('{code}: 3 mm, 0.5 mm between threads.', { code: code('M3') })}</p></div>
          <div class="card pad stack tight"><div class="drawing-box" style="min-height:150px">${raw(drawPart(demo({ head: 'pan', drive: 'phillips', length: 6.35, d: 2.84, pitch: 0.635, system: 'unified', thread: '#4-40 UNC', lengthLabel: '1/4 in' }), { view: 'side', dims: true }))}</div><p class="small">${th('{code}: 2.84 mm, 40 threads per inch (0.635 mm). Almost the same size, but it will not go into an M3 hole: forced, it strips the thread.', { code: code('#4-40') })}</p></div>
        </div>
      </section>

      <section class="stack">
        <h2>${t('6. Nuts and washers')}</h2>
        <div class="grid three">
          <div class="card pad stack tight"><div style="height:110px">${raw(drawPart(demo({ variant: 'star-ext', d: 4, id: 4.3, od: 8, t: 0.5 }, 'washer'), { view: 'top' }))}</div><h3>${t('Star washer')}</h3><p class="small muted">${t('Teeth bite through paint and anodising. Used on earth connections.')}</p></div>
          <div class="card pad stack tight"><div style="height:110px">${raw(drawPart(demo({ variant: 'split', d: 4, id: 4.1, od: 7.6, t: 0.9 }, 'washer'), { view: 'top' }))}</div><h3>${t('Split washer')}</h3><p class="small muted">${t('A spring ring. Not a substitute for a star washer on an earth stud.')}</p></div>
          <div class="card pad stack tight"><div style="height:110px">${raw(drawPart(demo({ variant: 'nyloc', d: 3, af: 5.5, m: 4 }, 'nut'), { view: 'both' }))}</div><h3>${t('Nyloc nut')}</h3><p class="small muted">${t('The nylon ring locks it. Single use, and at least two threads must show past it.')}</p></div>
        </div>
      </section>

      <section class="stack">
        <h2>${t('7. Materials')}</h2>
        <div class="tbl-wrap card"><table class="tbl"><thead><tr><th>${t('Material')}</th><th>${t('How to recognise it')}</th></tr></thead><tbody>${['A2', 'A4', 'zinc', 'zinc-yellow', 'black-oxide', 'brass', 'nylon'].map((m) => html`<tr><td><span style="display:inline-block;width:14px;height:14px;border-radius:4px;vertical-align:-2px;margin-inline-end:8px;background:linear-gradient(135deg,${MATERIALS[m].color[0]},${MATERIALS[m].color[1]})"></span><b>${MATERIALS[m].label}</b></td><td class="small">${MATERIALS[m].note}</td></tr>`)}</tbody></table></div>
        <p class="muted">${t('Bench trick: a small magnet barely holds A2 stainless but grabs zinc-plated steel. It settles the stainless-or-plated question in a second.')}</p>
      </section>

      <section class="stack">
        <h2>${t('8. The golden rules')}</h2>
        <ol class="how">
          <li><b>${t('Never substitute')}</b><span>${t('"Close enough" is how a 10 mm screw ends up where an 8 mm belongs. Same code or ask.')}</span></li>
          <li><b>${t('Check the bin, not your memory')}</b><span>${t('Scan or read the code before fitting; bins get refilled from the wrong box.')}</span></li>
          <li><b>${t('Torque with a tool')}</b><span>${t('Feel is not a torque value. Use the driver set to the number in the step.')}</span></li>
          <li><b>${t('Say it when something looks off')}</b><span>${t('"Report a doubt" takes ten seconds. A new pair of eyes is how old mistakes are found.')}</span></li>
        </ol>
      </section>
      ${dev ? html`<div class="row"><a class="btn big primary" href="#/quiz/${encodeURIComponent(dev.id)}">${icon('quiz')}${t('Take the quiz on the {device}', { device: dev.name })}</a></div>` : ''}
    </div>`,
    mount(root) {
      const out = root.querySelector('#decOut');
      const run = (v) => { const d = decodeDesignation(v); out.innerHTML = d ? String(decodedBlock(d, t('What it means'))) : String(html`<div class="callout">${icon('info')}<div><p class="t">${t('Not a standard description')}</p><p>${th('“{code}” looks like a company code. Search it to find the part it belongs to.', { code: v })}</p></div></div>`); };
      root.querySelector('#decForm').addEventListener('submit', (e) => { e.preventDefault(); run(root.querySelector('#decIn').value); });
      root.querySelectorAll('[data-dec]').forEach((b) => b.addEventListener('click', () => { root.querySelector('#decIn').value = b.dataset.dec; run(b.dataset.dec); }));
    },
  };
}
