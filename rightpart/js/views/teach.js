import { html, icon, toast, confirmDialog, download, pickFile } from '../ui.js';
import { t } from '../core/i18n.js';
import { partText } from '../core/content.js';
import { isFastener } from '../core/dims.js';
import { thumb, partHref } from '../components.js';

export default async function teach({ app, query, navigate }) {
  const vision = await import('../vision.js');
  const counts = await vision.samplesByPart();
  const preset = query.get('part') && app.index.parts.get(query.get('part')) ? query.get('part') : '';
  const options = [...app.lib.parts].sort((a, b) => (isFastener(b) - isFastener(a)) || a.id.localeCompare(b.id));
  const taught = [...counts.entries()].map(([id, c]) => ({ part: app.index.parts.get(id), c })).filter((x) => x.part);
  return {
    title: t('Teach the photo identifier'),
    html: html`<div class="page">
      <div class="page-head"><div>
        <div class="crumbs"><a href="#/identify?tab=photo">${t('Identify')}</a><span>/</span><span>${t('Teach')}</span></div>
        <h1>${t('Teach the photo identifier')}</h1>
        <p class="lede">${t('Pick a part, then take 5 to 10 photos of it: a few angles, same light, same plain background you will use later. The app learns on this device; photos never leave it.')}</p>
      </div>
      <div class="row"><button class="btn" id="exp" type="button">${icon('download')}${t('Export')}</button><button class="btn" id="imp" type="button">${icon('upload')}${t('Import')}</button></div></div>

      <section class="split">
        <div class="stack">
          <div class="field"><label for="partSel">${t('Part to teach')}</label>
            <select id="partSel"><option value="">${t('Choose a part…')}</option>${options.map((p) => html`<option value="${p.id}" ${p.id === preset ? 'selected' : ''}>${p.id} · ${partText(p, app.lib).name}</option>`)}</select>
          </div>
          <div class="cam"><video muted playsinline></video><div class="frame"></div><div class="msg" id="tMsg">${t('Camera off')}</div></div>
          <div class="row">
            <button class="btn primary" type="button" id="tStart">${icon('camera')}${t('Start camera')}</button>
            <button class="btn" type="button" id="tSnap" disabled>${icon('target')}${t('Take photo')}</button>
            <button class="btn" type="button" id="tBurst" disabled>${icon('layers')}${t('5 photos')}</button>
            <label class="btn" for="tFiles">${icon('upload')}${t('Add photos')}</label><input id="tFiles" type="file" accept="image/*" multiple class="sr-only">
          </div>
          <div id="tStatus" class="small muted" aria-live="polite"></div>
        </div>
        <div class="stack">
          <h2>${t('Taught on this device')}</h2>
          ${taught.length ? html`<div class="stack">${taught.map(({ part, c }) => html`<div class="match">
            <span class="thumb">${thumb(part)}</span>
            <div><a href="${partHref(part.id)}" style="font-weight:650">${partText(part, app.lib).name}</a><div class="small muted"><span class="code">${part.id}</span> · ${t('{n, plural, one {# photo} other {# photos}}', { n: c.photos })}${c.photos < 5 ? ` · ${t('add a few more')}` : ''}</div><div class="samples" style="margin-top:6px">${c.thumbs.map((src) => html`<img src="${src}" alt="">`)}</div></div>
            <button class="btn sm danger" type="button" data-forget="${part.id}" aria-label="${t('Forget {name}', { name: part.name })}">${icon('trash')}</button>
          </div>`)}</div>` : html`<div class="empty">${t('Nothing taught yet. Start with parts people mix up: for the demo, 100-0233 and 100-0234, or 100-0231 and 100-0235.')}</div>`}
          ${taught.length ? html`<a class="btn primary" href="#/identify?tab=photo">${icon('target')}${t('Test the identifier')}</a>` : ''}
        </div>
      </section>
    </div>`,
    mount(root) {
      const video = root.querySelector('video');
      const msg = root.querySelector('#tMsg');
      const st = root.querySelector('#tStatus');
      const sel = root.querySelector('#partSel');
      let stream = null;
      let busy = false;
      const need = () => { if (!sel.value) { toast(t('Choose the part first.'), 'bad'); sel.focus(); return false; } return true; };
      const learn = async (source) => {
        st.textContent = t('Learning…');
        try {
          await vision.loadModel((s) => { st.textContent = s; });
          await vision.teach(sel.value, source);
          const c = (await vision.samplesByPart()).get(sel.value);
          st.textContent = t('{id}: {n, plural, one {# photo taught.} other {# photos taught.}}', { id: sel.value, n: c?.photos || 0 });
        } catch (e) { st.textContent = t('Could not learn: {error}', { error: e.message }); }
      };
      const frame = () => { const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight; c.getContext('2d').drawImage(video, 0, 0); return c; };
      root.querySelector('#tStart').addEventListener('click', async () => {
        const { openCamera } = await import('../scan.js');
        try { stream = await openCamera(video); msg.textContent = t('Fill the frame with the part'); root.querySelector('#tSnap').disabled = false; root.querySelector('#tBurst').disabled = false; vision.loadModel(); }
        catch (e) { msg.textContent = e?.name === 'NotAllowedError' ? t('Camera permission refused. Add photos from files instead.') : t('No camera. Add photos from files instead.'); }
      });
      root.querySelector('#tSnap').addEventListener('click', async () => { if (!need() || busy) return; busy = true; await learn(frame()); busy = false; });
      root.querySelector('#tBurst').addEventListener('click', async () => {
        if (!need() || busy) return; busy = true;
        for (let i = 0; i < 5; i++) { msg.textContent = t('Photo {n} of {total}: turn the part a little', { n: i + 1, total: 5 }); await learn(frame()); await new Promise((r) => setTimeout(r, 450)); }
        msg.textContent = t('Done. Turn it over or change the angle for more.');
        busy = false;
        if (location.hash.startsWith('#/teach')) navigate(`#/teach?part=${encodeURIComponent(sel.value)}`);
      });
      root.querySelector('#tFiles').addEventListener('change', async (e) => {
        if (!need()) return;
        const files = [...(e.target.files || [])];
        busy = true;
        for (const f of files) {
          const url = URL.createObjectURL(f);
          const img = new Image(); img.src = url;
          try { await img.decode(); await learn(img); } finally { URL.revokeObjectURL(url); }
        }
        busy = false;
        if (location.hash.startsWith('#/teach')) navigate(`#/teach?part=${encodeURIComponent(sel.value)}`);
      });
      root.querySelectorAll('[data-forget]').forEach((b) => b.addEventListener('click', async () => {
        if (!(await confirmDialog(t('Forget this part?'), t('Delete every photo taught for {id} on this device.', { id: b.dataset.forget }), t('Forget'), true))) return;
        await vision.forgetPart(b.dataset.forget);
        navigate(`#/teach${preset ? `?part=${encodeURIComponent(preset)}` : ''}`);
      }));
      root.querySelector('#exp').addEventListener('click', async () => { download(`rightpart-photo-samples-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await vision.exportSamples())); });
      root.querySelector('#imp').addEventListener('click', async () => {
        const f = await pickFile('application/json,.json');
        if (!f) return;
        try { const n = await vision.importSamples(JSON.parse(await f.text())); toast(t('{n, plural, one {# sample imported.} other {# samples imported.}}', { n }), 'ok'); navigate('#/teach'); }
        catch (e) { toast(e.message, 'bad'); }
      });
      return () => stream?.getTracks().forEach((tr) => tr.stop());
    },
  };
}
