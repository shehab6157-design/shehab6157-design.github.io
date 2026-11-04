import { html, raw, icon, toast } from '../ui.js';
import { drawPart, drawChoice } from '../draw.js';
import { HEADS, DRIVES, sizeLabel } from '../core/dims.js';
import { partHref, thumb, subtitle } from '../components.js';
import { submitQuery } from '../app.js';
import { settings } from '../store.js';

export default async function identify({ app, query, navigate }) {
  const tab = ['photo', 'measure', 'code'].includes(query.get('tab')) ? query.get('tab') : 'measure';
  const calibrated = !!settings().pxPerMm;
  const tabLink = (t, label, ic) => html`<a href="#/identify?tab=${t}" ${t === tab ? html`aria-current="page"` : ''}>${icon(ic)}${label}</a>`;
  return {
    title: 'Identify a part',
    html: html`<div class="page">
      <div class="page-head"><div>
        <h1>Identify a part</h1>
        <p class="lede">Found a loose screw on the bench, or not sure what is in a bin? Measure it on the screen, photograph it, or scan any code on it.</p>
      </div>
      <nav class="seg" aria-label="Method">${tabLink('measure', 'Measure', 'ruler')}${tabLink('photo', 'Photo', 'camera')}${tabLink('code', 'Code', 'scan')}</nav></div>

      ${tab === 'measure' ? html`
        ${!calibrated ? html`<div class="callout warn">${icon('ruler')}<div><p class="t">Calibrate the screen first</p><p>Screens differ in size. Hold a bank card against the screen once, and every drawing in RightPart is shown at its real size on this device.</p><div class="acts"><button class="btn sm primary" type="button" id="calib">Calibrate with a card</button></div></div></div>` : ''}
        <section class="card">
          <div class="card-head"><div><h2>Lay the part on the screen</h2><p class="small muted">Drag <b>H</b> to the underside of the head (the top, for a countersunk screw) and <b>T</b> to the tip. Drag the green lines to the edges of the thread.</p></div>${calibrated ? html`<button class="btn sm" type="button" id="calib">${icon('ruler')}Recalibrate</button>` : ''}</div>
          <div class="gauge-stage" id="stage"></div>
          <div class="card-body stack">
            <div class="gauge-readout" id="readout"></div>
            <div class="stack tight"><span class="small muted" style="font-weight:650">Head (optional)</span><div class="choice-grid" id="heads">${Object.entries(HEADS).map(([k, v]) => html`<button class="choice" type="button" data-head="${k}" aria-pressed="false">${raw(drawChoice('head', k))}${v.label.replace(' head', '').replace(' (flat)', '')}</button>`)}</div></div>
            <div class="stack tight"><span class="small muted" style="font-weight:650">Drive (optional)</span><div class="choice-grid" id="drives">${Object.entries(DRIVES).filter(([k]) => k !== 'external').map(([k, v]) => html`<button class="choice" type="button" data-drive="${k}" aria-pressed="false">${raw(drawChoice('drive', k))}${v.label}</button>`)}</div></div>
          </div>
        </section>
        <section class="stack"><h2>Closest parts in the library</h2><div class="results" id="cands"></div></section>
      ` : ''}

      ${tab === 'photo' ? html`
        <section class="split">
          <div class="stack">
            <div class="cam" id="cam"><video muted playsinline></video><div class="frame"></div><div class="msg" id="camMsg">Camera off</div></div>
            <div class="row">
              <button class="btn primary" type="button" id="camStart">${icon('camera')}Start camera</button>
              <button class="btn" type="button" id="snap" disabled>${icon('target')}Identify</button>
              <label class="btn" for="photoFile">${icon('upload')}Use a photo</label><input id="photoFile" type="file" accept="image/*" capture="environment" class="sr-only">
            </div>
            <p class="small muted">Place the part alone on a plain background (a white sheet works), fill the frame, and use the same setup you used when teaching.</p>
          </div>
          <div class="stack">
            <div id="photoStatus"></div>
            <div class="stack" id="photoResults"></div>
            <a class="btn" href="#/teach">${icon('sparkle')}Teach parts</a>
          </div>
        </section>
      ` : ''}

      ${tab === 'code' ? html`
        <section class="card pad stack">
          <h2>Any code on the part, bag or bin</h2>
          <p class="muted">Internal, customer, supplier, manufacturer or an old code: all of them lead to the same part. A handheld scanner types straight into this box.</p>
          <form class="verify-row" id="codeForm" autocomplete="off"><input id="codeIn" type="text" autocapitalize="characters" spellcheck="false" placeholder="Scan or type a code" aria-label="Code"><button class="btn" type="button" id="codeScan">${icon('scan')}Camera</button><button class="btn primary" type="submit">Find</button></form>
        </section>
      ` : ''}
    </div>`,
    mount(root) {
      const cleanups = [];
      root.querySelector('#calib')?.addEventListener('click', async () => {
        const { calibrateDialog } = await import('../gauge.js');
        if (await calibrateDialog()) navigate('#/identify?tab=measure');
      });

      if (tab === 'measure') {
        const sel = { head: null, drive: null };
        let overlayId = null;
        let gauge = null;
        const readout = root.querySelector('#readout');
        const cands = root.querySelector('#cands');
        let mod = null;
        const update = (m) => {
          if (!mod) return;
          const t = mod.nearestThread(m.diameter);
          readout.innerHTML = String(html`<div class="fact"><div class="k">Length</div><div class="v">${m.length.toFixed(1)} mm</div><div class="n">± 0.3 mm on a calibrated screen</div></div><div class="fact"><div class="k">Thread diameter</div><div class="v">${m.diameter.toFixed(1)} mm</div><div class="n">closest: ${t[1]}</div></div>`);
          const ranked = mod.rankByMeasure(app.lib.parts, { length: m.length, diameter: m.diameter, head: sel.head, drive: sel.drive }).slice(0, 6);
          cands.innerHTML = String(html`${ranked.map((r) => html`<div class="result" style="grid-template-columns:96px minmax(0,1fr) auto">
            <a class="thumb" href="${partHref(r.part.id)}">${thumb(r.part)}</a>
            <div><a href="${partHref(r.part.id)}" class="t" style="color:inherit;text-decoration:none">${r.part.name}</a><div class="muted small"><span class="code">${r.part.id}</span> · ${sizeLabel(r.part)}</div><div class="why">${r.notes.map((n) => html`<span class="chip ${/matches|same/.test(n) ? 'ok' : ''}">${n}</span>`)}</div></div>
            <button class="btn sm" type="button" data-ov="${r.part.id}" aria-pressed="${overlayId === r.part.id}">${icon('layers')}${overlayId === r.part.id ? 'Hide' : 'Overlay'}</button>
          </div>`)}`);
        };
        import('../gauge.js').then((g) => {
          mod = g;
          gauge = g.mountGauge(root.querySelector('#stage'), { onChange: update });
          const pre = query.get('part') && app.index.parts.get(query.get('part'));
          if (pre) { gauge.setFromPart(pre); gauge.setOverlay(pre); overlayId = pre.id; }
          update(gauge.measure());
        });
        cands.addEventListener('click', (e) => {
          const b = e.target.closest('[data-ov]');
          if (!b || !gauge) return;
          overlayId = overlayId === b.dataset.ov ? null : b.dataset.ov;
          gauge.setOverlay(overlayId ? app.index.parts.get(overlayId) : null);
          if (overlayId) toast('The dashed outline is the real size: lay the part on it.');
        });
        root.querySelectorAll('[data-head]').forEach((b) => b.addEventListener('click', () => {
          sel.head = sel.head === b.dataset.head ? null : b.dataset.head;
          root.querySelectorAll('[data-head]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.head === sel.head)));
          gauge && update(gauge.measure());
        }));
        root.querySelectorAll('[data-drive]').forEach((b) => b.addEventListener('click', () => {
          sel.drive = sel.drive === b.dataset.drive ? null : b.dataset.drive;
          root.querySelectorAll('[data-drive]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.drive === sel.drive)));
          gauge && update(gauge.measure());
        }));
        cleanups.push(() => gauge?.destroy());
      }

      if (tab === 'photo') {
        const video = root.querySelector('video');
        const msg = root.querySelector('#camMsg');
        const status = root.querySelector('#photoStatus');
        const results = root.querySelector('#photoResults');
        let stream = null;
        let vision = null;
        const setStatus = (h) => { status.innerHTML = String(h); };
        const ensure = async () => {
          vision = vision || await import('../vision.js');
          const counts = await vision.samplesByPart();
          if (!counts.size) {
            setStatus(html`<div class="callout info">${icon('sparkle')}<div><p class="t">Teach it your parts first</p><p>The identifier learns from your own photos, on this device: 5 to 10 photos of each part, on the same background you will use here. Start with the parts people mix up.</p><div class="acts"><a class="btn sm primary" href="#/teach">Teach parts</a></div></div></div>`);
            return null;
          }
          setStatus(html`<div class="row"><span class="spinner"></span><span class="small muted">Loading the on-device model (about 6 MB, only the first time)…</span></div>`);
          await vision.loadModel();
          setStatus(html`<p class="small muted">${counts.size} part${counts.size > 1 ? 's' : ''} taught on this device.</p>`);
          return counts;
        };
        const show = async (source, preview) => {
          const counts = await ensure().catch((e) => { setStatus(html`<div class="callout bad">${icon('stop')}<div><p class="t">The model could not load</p><p>${e.message}</p></div></div>`); return null; });
          if (!counts) return;
          const res = await vision.identify(source);
          const lab = { strong: ['ok', 'Strong match'], possible: ['warn', 'Possible match: confirm the size'], unsure: ['bad', 'Not sure: teach more photos or measure it'] }[res.verdict] || ['', ''];
          results.innerHTML = String(html`
            <div class="row">${preview ? html`<img src="${preview}" alt="Your photo" style="width:96px;height:96px;object-fit:cover;border-radius:12px">` : ''}<span class="chip ${lab[0]}">${lab[1]}</span></div>
            ${res.matches.map((m, i) => {
              const p = app.index.parts.get(m.partId);
              if (!p) return '';
              return html`<div class="match" style="${i === 0 ? 'border-color:var(--brand)' : ''}">
                ${m.thumb ? html`<img src="${m.thumb}" alt="">` : html`<span class="thumb">${thumb(p)}</span>`}
                <div><a href="${partHref(p.id)}" style="font-weight:650">${p.name}</a><div class="small muted"><span class="code">${p.id}</span> · ${subtitle(p)}</div></div>
                <div class="stack tight" style="justify-items:end"><span class="small"><b>${Math.round(m.score * 100)}%</b></span><div class="meter"><i style="width:${Math.max(4, Math.min(100, (m.score - 0.5) * 200))}%"></i></div>
                ${p.spec?.length ? html`<a class="btn sm" href="#/identify?tab=measure&part=${encodeURIComponent(p.id)}">${icon('ruler')}Check size</a>` : ''}</div>
              </div>`;
            })}
            <p class="tiny muted">A photo shows the type (head, drive, finish) but not the exact length. Always confirm the size with "Check size" before fitting.</p>`);
        };
        ensure();
        root.querySelector('#camStart').addEventListener('click', async () => {
          const { openCamera } = await import('../scan.js');
          try {
            stream = await openCamera(video);
            msg.textContent = 'Part in the frame, then Identify';
            root.querySelector('#snap').disabled = false;
          } catch (e) { msg.textContent = e?.name === 'NotAllowedError' ? 'Camera permission refused. You can still use a photo.' : 'No camera available. Use a photo instead.'; }
        });
        root.querySelector('#snap').addEventListener('click', async () => {
          if (!stream) return;
          const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight; c.getContext('2d').drawImage(video, 0, 0);
          msg.textContent = 'Comparing…';
          await show(c, c.toDataURL('image/jpeg', 0.7));
          msg.textContent = 'Part in the frame, then Identify';
        });
        root.querySelector('#photoFile').addEventListener('change', async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const url = URL.createObjectURL(f);
          const img = new Image(); img.src = url; await img.decode();
          await show(img, url);
        });
        cleanups.push(() => stream?.getTracks().forEach((t) => t.stop()));
      }

      if (tab === 'code') {
        const inp = root.querySelector('#codeIn');
        inp.focus();
        root.querySelector('#codeForm').addEventListener('submit', (e) => { e.preventDefault(); submitQuery(inp.value); });
        root.querySelector('#codeScan').addEventListener('click', async () => {
          const { scanDialog } = await import('../scan.js');
          const code = await scanDialog({ title: 'Scan a code' });
          if (code) { inp.value = code; submitQuery(code); }
        });
      }
      return () => cleanups.forEach((f) => f());
    },
  };
}

void drawPart;
