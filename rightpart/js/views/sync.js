// Light sync: tablets pass the library and build records to each other through the screen and the
// camera. No Wi-Fi, no server, no cable: like fireflies, they talk with light.
// The sender shows an endless loop of QR frames (a fountain code: any big enough set of frames, in
// any order, rebuilds the package). Every package is signed; a tablet installs a library only from
// a key it trusts, after a person has compared the sender's eight symbols with its own screen.
import { html, th, icon, toast, openDialog, fmtDate } from '../ui.js';
import { t } from '../core/i18n.js';
import { get, put, listRecords, currentWorkspace } from '../store.js';
import { newSigner, pack, unpack, fingerprint, unb64u } from '../core/envelope.js';
import { makeEncoder, makeDecoder } from '../core/fountain.js';
import { encode45, decode45 } from '../core/base45.js';

const PREFIX = 'RP1:';
const FRAG = { easy: 220, normal: 400, dense: 640 };
const MAX_PIECES = 1500;

// ---------- Keys: this tablet's own, and the ones it trusts ----------
export async function mySigner() {
  let s = (await get('kv', 'signer'))?.value;
  if (!s?.privateKey) {
    s = await newSigner('');
    s.name = t('Tablet {code}', { code: s.id.slice(0, 4).toUpperCase() });
    await put('kv', { key: 'signer', value: s });
  }
  return s;
}
export async function trustList() { return (await get('kv', 'trust'))?.value || []; }
async function saveTrust(list) { await put('kv', { key: 'trust', value: list }); }
async function trustKey(k, name) {
  const list = (await trustList()).filter((x) => x.id !== k.id);
  list.push({ id: k.id, pub: k.pub, name: name || k.id, added: Date.now() });
  await saveTrust(list);
}

const symbolsHTML = (symbols, big = false) => html`<span class="symbols ${big ? 'big' : ''}" role="img" aria-label="${t('Key symbols: {list}', { list: symbols.join(' ') })}">${symbols.map((s) => html`<span>${s}</span>`)}</span>`;

// ---------- Drawing QR frames (the bundled ZXing library draws them) ----------
async function qrDrawer() {
  const { loadZXing } = await import('../scan.js');
  const Z = await loadZXing();
  const hints = new Map();
  hints.set(Z.EncodeHintType.ERROR_CORRECTION, Z.QRCodeDecoderErrorCorrectionLevel.L);
  hints.set(Z.EncodeHintType.MARGIN, 0);
  return (canvas, text) => {
    const m = Z.QRCodeEncoder.encode(text, Z.QRCodeDecoderErrorCorrectionLevel.L, hints).getMatrix();
    const n = m.getWidth(), quiet = 4;
    const size = Math.min(canvas.clientWidth || 480, 720) * (window.devicePixelRatio || 1);
    const cell = Math.max(2, Math.floor(size / (n + quiet * 2)));
    canvas.width = canvas.height = cell * (n + quiet * 2);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m.get(x, y) === 1) ctx.fillRect((x + quiet) * cell, (y + quiet) * cell, cell, cell);
  };
}

// ---------- Reading QR frames from the camera ----------
async function qrReader() {
  if ('BarcodeDetector' in window) {
    try {
      if ((await window.BarcodeDetector.getSupportedFormats()).includes('qr_code')) {
        const det = new window.BarcodeDetector({ formats: ['qr_code'] });
        return async (video) => (await det.detect(video)).map((r) => r.rawValue);
      }
    } catch { /* use ZXing */ }
  }
  const { loadZXing } = await import('../scan.js');
  const Z = await loadZXing();
  const reader = new Z.QRCodeReader();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return async (video) => {
    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) return [];
    const scale = Math.min(1, 960 / Math.max(w, h));
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    try { return [reader.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas)))).getText()]; } catch { return []; }
  };
}

/** Text from a QR frame -> fountain frame bytes, or null if it is someone else's QR code. */
export function frameFromText(text) {
  if (typeof text !== 'string' || !text.startsWith(PREFIX)) return null;
  try { return decode45(text.slice(PREFIX.length)); } catch { return null; }
}

// ---------- Sending ----------
async function packageFor(app, what) {
  const signer = await mySigner();
  if (what === 'library') return { bytes: await pack('library', { from: signer.name, library: app.lib }, signer), label: t('the library'), signer };
  if (what === 'key') return { bytes: await pack('key', { name: signer.name, id: signer.id, pub: signer.pub }, signer), label: t("this tablet's key"), signer };
  const records = (await listRecords()).map((r) => (r.photo ? { ...r, photo: null, photoLeftOut: true } : r));
  return { bytes: await pack('records', { from: signer.name, records }, signer), label: t('{n, plural, one {# record} other {# records}}', { n: records.length }), signer };
}

async function showFrames(app, what) {
  const { bytes, label, signer } = await packageFor(app, what);
  let density = 'normal';
  let enc = makeEncoder(bytes, FRAG[density]);
  if (enc.K > MAX_PIECES) { toast(t('Too big to send by light ({kb} kB). Use a file or the company server.', { kb: Math.round(bytes.length / 1024) }), 'bad', 6000); return; }
  const draw = await qrDrawer();
  const symbols = await fingerprint(unb64u(signer.pub));
  let fps = 5, seq = 0, timer = 0, wake = null;
  const secs = () => Math.max(2, Math.round((enc.K * 1.5) / fps));
  await openDialog({
    title: t('Sending {what}', { what: label }),
    wide: true,
    body: String(html`<div class="lightsend">
        <canvas class="qr" aria-label="${t('Animated code with {what}', { what: label })}"></canvas>
        <div class="stack tight">
          <p>${t('Point the other tablet at this screen: Light sync, then Receive. Keep it steady until it says it is done.')}</p>
          <p class="small muted" id="lsInfo"></p>
          <div class="fk"><span class="small">${t('The receiving tablet will show these symbols:')}</span>${symbolsHTML(symbols, true)}<span class="tiny muted">${signer.name}</span></div>
          <div class="row">
            <div class="seg" role="group" aria-label="${t('Speed')}">
              <button type="button" data-fps="3">${t('Slow')}</button><button type="button" data-fps="5" aria-pressed="true">${t('Normal')}</button><button type="button" data-fps="8">${t('Fast')}</button>
            </div>
            <div class="seg" role="group" aria-label="${t('Code size')}">
              <button type="button" data-den="easy">${t('Large squares')}</button><button type="button" data-den="normal" aria-pressed="true">${t('Normal')}</button><button type="button" data-den="dense">${t('Dense')}</button>
            </div>
          </div>
        </div>
      </div>`),
    actions: [{ label: t('Stop'), value: null }],
    async onMount(d) {
      const canvas = d.querySelector('canvas');
      const info = d.querySelector('#lsInfo');
      const tick = () => {
        try { draw(canvas, PREFIX + encode45(enc.frame(seq++))); } catch (e) { console.error(e); }
        info.textContent = t('{pieces} pieces, {kb} kB · about {s} s with a clear view · frame {n}', { pieces: enc.K, kb: Math.max(1, Math.round(bytes.length / 1024)), s: secs(), n: seq });
      };
      const run = () => { clearInterval(timer); timer = setInterval(tick, 1000 / fps); };
      d.querySelectorAll('[data-fps]').forEach((b) => b.addEventListener('click', () => { fps = +b.dataset.fps; d.querySelectorAll('[data-fps]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); run(); }));
      d.querySelectorAll('[data-den]').forEach((b) => b.addEventListener('click', () => { density = b.dataset.den; enc = makeEncoder(bytes, FRAG[density]); seq = 0; d.querySelectorAll('[data-den]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }));
      try { wake = await navigator.wakeLock?.request('screen'); } catch { /* the screen may dim */ }
      tick();
      run();
    },
    onClose() { clearInterval(timer); wake?.release?.().catch(() => {}); },
  });
}

// ---------- Receiving ----------
function receiveDialog() {
  let stream = null, stop = false;
  const dec = makeDecoder();
  return openDialog({
    title: t('Receive by light'),
    body: String(html`<div class="cam"><video muted playsinline></video><div class="frame"></div><div class="msg" id="lrMsg">${t('Starting the camera…')}</div></div>
      <div class="lightbar" aria-hidden="true"><i id="lrBar"></i></div>
      <p class="small muted" id="lrInfo">${t('Point the camera at the code on the other screen, about 20–40 cm away.')}</p>`),
    actions: [{ label: t('Cancel'), value: null }],
    async onMount(d, close) {
      const { openCamera, stopStream, cameraError } = await import('../scan.js');
      const video = d.querySelector('video'), msg = d.querySelector('#lrMsg'), bar = d.querySelector('#lrBar'), info = d.querySelector('#lrInfo');
      try {
        const read = await qrReader();
        stream = await openCamera(video);
        if (stop) { stopStream(stream); return; }
        msg.textContent = t('Looking for the code…');
        const loop = async () => {
          if (stop) return;
          if (video.readyState >= 2) {
            for (const text of await read(video).catch(() => [])) {
              const f = frameFromText(text);
              if (!f) continue;
              const r = dec.receive(f);
              if (r === 'other' && dec.otherFrames > 8 && dec.progress < 0.5) dec.reset(); // the sender switched to something else
            }
            if (dec.pieces) {
              bar.style.width = `${Math.round(dec.progress * 100)}%`;
              msg.textContent = t('{pct}% received', { pct: Math.round(dec.progress * 100) });
              info.textContent = t('{known} of {pieces} pieces from {frames} frames. Missed frames do not matter: keep pointing.', { known: Math.round(dec.progress * dec.pieces), pieces: dec.pieces, frames: dec.frames });
            }
            if (dec.message) { stopStream(stream); stream = null; close(dec.message); return; }
          }
          setTimeout(loop, 30);
        };
        loop();
      } catch (err) { msg.textContent = cameraError(err); }
    },
    onClose() { stop = true; if (stream) stream.getTracks().forEach((tr) => tr.stop()); },
  });
}

/** What a received package holds, and what to do with it. */
async function handlePackage(app, bytes, navigate) {
  let p;
  try { p = await unpack(bytes, await trustList()); } catch (e) { toast(e.message, 'bad', 6000); return; }
  if (!p.verified) {
    await openDialog({ title: t('Not installed'), body: String(html`<div class="callout bad">${icon('stop')}<div><p class="t">${t('This package was changed on the way')}</p><p>${t('Its signature does not match its content. Nothing was installed. Send it again.')}</p></div></div>`) });
    return;
  }
  const claimed = typeof p.data?.from === 'string' ? p.data.from.slice(0, 60) : typeof p.data?.name === 'string' ? p.data.name.slice(0, 60) : '';
  const who = html`<div class="fk">${symbolsHTML(p.key.symbols, true)}<span class="small">${p.trusted ? html`<b>${p.name}</b> · ${t('trusted')}` : html`<b>${t('Not trusted yet')}</b>${claimed ? html`<br>${t('Says it is: {name}', { name: claimed })}` : ''}`}</span></div>`;
  const ws = currentWorkspace();
  if (p.kind === 'key') {
    const ok = await openDialog({
      title: t('Trust this tablet?'),
      body: String(html`<p>${th('{name} wants to be trusted by this tablet in {company}.', { name: html`<b>${claimed || p.key.id}</b>`, company: html`<b>${ws.name}</b>` })}</p>${who}<p class="small">${t('Trust it only if the other screen shows exactly the same symbols in the same order. A trusted tablet can send this tablet a new library.')}</p>`),
      actions: [{ label: t('Cancel'), value: false }, { label: t('Same symbols: trust it'), value: true, primary: true }],
    });
    if (ok) { await trustKey(p.key, claimed || p.key.id); toast(t('{name} is trusted.', { name: claimed || p.key.id }), 'ok'); navigate('#/sync'); }
    return;
  }
  if (p.kind === 'records') {
    const recs = Array.isArray(p.data?.records) ? p.data.records.filter((r) => r && typeof r.id === 'string' && (r.type === 'build' || r.type === 'report')) : [];
    const mine = new Map((await listRecords()).map((r) => [r.id, r]));
    const fresh = recs.filter((r) => !mine.has(r.id) || (r.events?.length || 0) + (r.steps?.length || 0) > (mine.get(r.id).events?.length || 0) + (mine.get(r.id).steps?.length || 0));
    const ok = await openDialog({
      title: t('Records received'),
      body: String(html`${who}<p>${t('{n, plural, one {# record} other {# records}} from {from}: {fresh} new or longer than the copy on this tablet.', { n: recs.length, from: p.data?.from || p.key.id, fresh: fresh.length })}</p><p class="small muted">${t('They are kept as they are and passed on to the company server the next time this tablet is online. Photos are not sent by light.')}</p>`),
      actions: [{ label: t('Cancel'), value: false }, { label: t('Add them'), value: true, primary: true, }],
    });
    if (ok) {
      for (const r of fresh) await put('records', { ...r, synced: false, via: 'light' });
      const { forgetMemory } = await import('../memory.js');
      forgetMemory();
      toast(t('{n, plural, one {# record added.} other {# records added.}}', { n: fresh.length }), 'ok');
      navigate('#/audit');
    }
    return;
  }
  // A library (the name of the sender is its own claim: trust comes from the symbols)
  const lib = p.data?.library;
  const from = typeof p.data?.from === 'string' ? p.data.from.slice(0, 60) : '';
  if (!lib || !Array.isArray(lib.parts) || !Array.isArray(lib.devices)) { toast(t('This package is not a library.'), 'bad'); return; }
  const steps = lib.devices.reduce((n, d) => n + (d.instructions?.steps?.length || 0), 0);
  const summary = html`<ul class="list-plain small"><li>${icon('parts')} ${t('{n, plural, one {# part} other {# parts}}', { n: lib.parts.length })}</li><li>${icon('cube')} ${t('{n, plural, one {# device} other {# devices}}', { n: lib.devices.length })}, ${t('{n, plural, one {# step} other {# steps}}', { n: steps })}</li>${lib.meta?.updated ? html`<li>${icon('history')} ${t('Updated {date}', { date: lib.meta.updated })}</li>` : ''}</ul>`;
  const act = await openDialog({
    title: t('A library arrived'),
    body: String(html`${who}<p><b>${lib.meta?.name || t('Library')}</b></p>${summary}
      ${p.trusted ? html`<p class="small">${th('Installing replaces the library of {company} on this tablet. The current one is kept as the previous version.', { company: html`<b>${ws.name}</b>` })}</p>`
        : html`<div class="callout warn">${icon('alert')}<div><p class="t">${t('From a key this tablet does not trust yet')}</p><p>${t('Install it only if the sending screen shows exactly these symbols, and you know who sent it.')}</p></div></div>`}`),
    actions: [{ label: t('Cancel'), value: null }, { label: p.trusted ? t('Install') : t('Same symbols: trust and install'), value: 'install', primary: true }],
  });
  if (act !== 'install') return;
  const name = p.name || from || t('Key {code}', { code: p.key.id.slice(0, 4).toUpperCase() });
  if (!p.trusted) await trustKey(p.key, name);
  const { commitLibrary } = await import('../importflows.js');
  await commitLibrary(app, lib, t('Library installed from {name}.', { name }));
  navigate('#/');
}

// ---------- The page ----------
export default async function sync({ app, navigate }) {
  const signer = await mySigner();
  const symbols = await fingerprint(unb64u(signer.pub));
  const trust = await trustList();
  const trustSymbols = await Promise.all(trust.map((k) => fingerprint(unb64u(k.pub)).catch(() => [])));
  const records = await listRecords();
  const steps = (app.lib.devices || []).reduce((n, d) => n + (d.instructions?.steps?.length || 0), 0);
  return {
    title: t('Light sync'),
    html: html`<div class="page narrow">
      <div class="page-head"><div>
        <h1>${t('Light sync')}</h1>
        <p class="lede">${t('Pass the library and the build records from tablet to tablet through the screen and the camera: no Wi-Fi, no server, no cable. Like fireflies, the tablets talk with light. Everything sent is signed, and a tablet installs a library only from a key it trusts.')}</p>
      </div></div>

      <section class="card pad stack">
        <h2>${t("This tablet's key")}</h2>
        <div class="fk">${symbolsHTML(symbols, true)}<span><b>${signer.name}</b><br><span class="tiny muted code">${signer.id}</span></span></div>
        <p class="small muted">${t('Other tablets compare these eight symbols before they trust this one. The secret half of the key never leaves this tablet.')}</p>
        <div class="row"><button class="btn sm" type="button" id="rename">${icon('edit')}${t('Rename')}</button></div>
      </section>

      <div class="grid two">
        <section class="card pad stack">
          <h2>${icon('send')} ${t('Send')}</h2>
          <button class="btn primary" type="button" data-send="library">${icon('parts')}${t('The library')}</button>
          <p class="tiny muted">${t('{parts} parts, {steps} steps', { parts: app.lib.parts.length, steps })}</p>
          <button class="btn" type="button" data-send="records" ${records.length ? '' : 'disabled'}>${icon('history')}${t('Build records and reports')}</button>
          <p class="tiny muted">${t('{n, plural, one {# record on this tablet} other {# records on this tablet}}', { n: records.length })}</p>
          <button class="btn" type="button" data-send="key">${icon('lock')}${t("This tablet's key")}</button>
          <p class="tiny muted">${t('So that another tablet can trust this one.')}</p>
        </section>
        <section class="card pad stack">
          <h2>${icon('camera')} ${t('Receive')}</h2>
          <button class="btn primary" type="button" id="receive">${icon('scan')}${t('Receive with the camera')}</button>
          <p class="tiny muted">${t('A library is installed only from a trusted key, and only after you confirm. Records are added next to this tablet’s own.')}</p>
        </section>
      </div>

      <section class="card">
        <div class="card-head"><h2>${t('Trusted keys')}</h2><span class="chip">${trust.length}</span></div>
        ${trust.length ? html`<ul class="list-plain trust-list">${trust.map((k, i) => html`<li class="row between"><span class="fk">${symbolsHTML(trustSymbols[i])}<span><b>${k.name}</b><br><span class="tiny muted">${t('trusted {date}', { date: fmtDate(k.added) })} · <span class="code">${k.id}</span></span></span></span><button class="btn sm" type="button" data-untrust="${k.id}">${icon('trash')}${t('Remove')}</button></li>`)}</ul>`
          : html`<div class="card-body muted small">${t('No trusted keys yet. On the engineer’s tablet, send “This tablet’s key”; receive it here and compare the symbols.')}</div>`}
      </section>
    </div>`,
    mount(root) {
      root.querySelectorAll('[data-send]').forEach((b) => b.addEventListener('click', () => showFrames(app, b.dataset.send).catch((e) => toast(e.message, 'bad', 6000))));
      root.querySelector('#receive').addEventListener('click', async () => {
        const bytes = await receiveDialog();
        if (bytes) await handlePackage(app, bytes, navigate);
      });
      root.querySelectorAll('[data-untrust]').forEach((b) => b.addEventListener('click', async () => {
        await saveTrust((await trustList()).filter((k) => k.id !== b.dataset.untrust));
        navigate('#/sync');
      }));
      root.querySelector('#rename').addEventListener('click', async () => {
        let name = '';
        const ok = await openDialog({ title: t('Rename this tablet'), body: String(html`<div class="field"><label for="tName">${t('Name other tablets will see')}</label><input id="tName" type="text" value="${signer.name}"></div>`), actions: [{ label: t('Cancel'), value: false }, { label: t('Save'), value: true, primary: true }], onClose(d) { name = d.querySelector('#tName').value.trim(); } });
        if (ok && name) { await put('kv', { key: 'signer', value: { ...signer, name } }); navigate('#/sync'); }
      });
    },
  };
}

// For tests and for the self-check: the same path a camera frame takes.
export const _test = { handlePackage, packageFor };
