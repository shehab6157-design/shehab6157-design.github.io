import { html, icon } from '../ui.js';
import { currentWorkspace, listRecords } from '../store.js';
import { importParts, importBOM, importSteps, importLibraryJSON, templates } from '../importflows.js';
import { isFastener } from '../core/dims.js';

// Getting a new company running: what to load, in which order, and what is still missing.
export default async function setup({ app, navigate }) {
  const ws = currentWorkspace();
  const lib = app.lib;
  const parts = lib.parts.length;
  const codes = app.index.byCode.size;
  const devices = lib.devices || [];
  const withBom = devices.filter((d) => d.bom?.lines?.length).length;
  const withSteps = devices.filter((d) => d.instructions?.steps?.length).length;
  const fasteners = lib.parts.filter(isFastener);
  const sized = fasteners.filter((p) => p.spec?.d && (p.category !== 'screw' || p.spec.length)).length;
  const explained = lib.parts.filter((p) => p.details?.function).length;
  const builds = (await listRecords('build')).length;
  const items = [
    { done: parts > 0, title: 'Parts and every code they go by', text: parts ? `${parts} parts under ${codes} codes.` : 'Start with a spreadsheet of your parts: internal number, description, and every customer, supplier or old code you know.', acts: html`<button class="btn sm primary" type="button" data-imp="parts">${icon('upload')}Import parts CSV</button><button class="btn sm ghost" type="button" data-tpl="parts">${icon('download')}Template</button>` },
    { done: fasteners.length > 0 && sized === fasteners.length, title: 'Sizes for screws, nuts, washers and standoffs', text: fasteners.length ? `${sized} of ${fasteners.length} fasteners have a size. Sizes are read from descriptions like "ISO 7380 M3x8 A2"; they power the true-scale drawings and the look-alike warnings.` : 'No fasteners yet.', acts: fasteners.length && sized < fasteners.length ? html`<a class="btn sm" href="#/parts?cat=screw">See the parts</a>` : '' },
    { done: withBom > 0, title: 'Devices and their BOMs', text: devices.length ? `${devices.length} device${devices.length === 1 ? '' : 's'}, ${withBom} with a BOM.` : 'One BOM per product your line builds. Any code works in the BOM: RightPart resolves it.', acts: html`<button class="btn sm primary" type="button" data-imp="bom">${icon('upload')}Import BOM CSV</button><button class="btn sm ghost" type="button" data-tpl="bom">${icon('download')}Template</button>` },
    { done: withSteps > 0, title: 'Assembly steps', text: withSteps ? `${withSteps} device${withSteps === 1 ? '' : 's'} with steps.` : 'Import the steps from a spreadsheet (one row per step), or write them in the step editor. Existing PDF instructions can be typed in step by step.', acts: html`<button class="btn sm primary" type="button" data-imp="steps">${icon('upload')}Import steps CSV</button><button class="btn sm ghost" type="button" data-tpl="steps">${icon('download')}Template</button>${devices.length ? devices.slice(0, 3).map((d) => html`<a class="btn sm" href="#/editor/${encodeURIComponent(d.id)}">${icon('edit')}Edit ${d.id}</a>`) : ''}<a class="btn sm" href="#/editor/new">${icon('plus')}New device</a>` },
    { done: app.audit.counts.critical === 0 && parts > 0, title: 'Integrity check', text: parts ? `${app.audit.counts.critical} critical, ${app.audit.counts.warning} warnings. Fix the critical ones before anyone builds from these steps.` : 'Runs automatically once there is data.', acts: parts ? html`<a class="btn sm" href="#/audit">${icon('shield')}Open the check</a>` : '' },
    { done: explained > 0 && explained >= Math.min(parts, 10), title: 'Explanations for learners', text: `${explained} of ${parts} parts say what they do and why. Add a "function" and "why" column to the parts spreadsheet; new people learn much faster.`, acts: '' },
    { done: parts > 0 && fasteners.length > 0, title: 'True-scale bin labels', text: 'Print a label for each fastener bin: every code it goes by, a barcode, and the part outline at actual size.', acts: fasteners.length ? html`<a class="btn sm" href="#/labels?ids=${encodeURIComponent(fasteners.slice(0, 40).map((p) => p.id).join(','))}">${icon('print')}Print labels</a>` : '' },
    { done: ws.kind === 'cloud', title: 'Share with the team', text: ws.kind === 'cloud' ? `Signed in to ${ws.name} as ${ws.org?.role}. Publish the library when it is ready.` : 'Sign in to a company server so every tablet gets the same library and records are collected, or export the library file and import it on each device.', acts: html`<a class="btn sm" href="#/companies">${icon('cloud')}Companies and sign-in</a>` },
    { done: builds > 0, title: 'First build', text: builds ? `${builds} build${builds === 1 ? '' : 's'} recorded.` : 'Open a device and press "Start a build": every bin is checked before fitting, and every step is recorded.', acts: devices[0] ? html`<a class="btn sm" href="#/device/${encodeURIComponent(devices[0].id)}">${icon('play')}Open ${devices[0].name}</a>` : '' },
  ];
  const done = items.filter((i) => i.done).length;
  return {
    title: 'Set up this company',
    html: html`<div class="page narrow">
      <div class="page-head"><div>
        <h1>Set up ${ws.kind === 'demo' ? 'a company' : ws.name}</h1>
        <p class="lede">${ws.kind === 'demo' ? html`You are in the demo. <a href="#/companies">Add your own company</a>, then follow these steps with your data.` : 'Load your company\'s data once; every page then works on it: search, drawings, 3D or photo guides, bench checks, the integrity check and the Ask assistant.'}</p>
      </div><span class="chip ${done === items.length ? 'ok' : ''}">${done} of ${items.length} done</span></div>
      <div class="progress" aria-hidden="true"><i style="width:${(done / items.length) * 100}%"></i></div>
      <ol class="setup-list">${items.map((it, i) => html`<li class="setup-item ${it.done ? 'done' : ''}">
        <span class="dot">${it.done ? icon('check') : i + 1}</span>
        <div><h3>${it.title}</h3><p>${it.text}</p>${it.acts ? html`<div class="row">${it.acts}</div>` : ''}</div>
      </li>`)}</ol>
      <p class="small muted">Have a full library file from another device or from an engineer? <button class="btn sm ghost" type="button" data-imp="json">${icon('upload')}Import library JSON</button></p>
    </div>`,
    mount(root) {
      const flows = { parts: importParts, bom: importBOM, steps: importSteps, json: importLibraryJSON };
      root.querySelectorAll('[data-imp]').forEach((b) => b.addEventListener('click', async () => { if (await flows[b.dataset.imp](app)) navigate('#/setup'); }));
      root.querySelectorAll('[data-tpl]').forEach((b) => b.addEventListener('click', () => templates[b.dataset.tpl]()));
    },
  };
}
