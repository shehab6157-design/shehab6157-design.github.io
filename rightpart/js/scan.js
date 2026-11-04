// Barcode and QR scanning with the camera.
// Uses the browser's BarcodeDetector where it exists (Chrome on Android, macOS),
// and the bundled ZXing decoder everywhere else. Handheld USB/Bluetooth scanners
// need none of this: they type the code into the focused box and press Enter.

import { html, icon, openDialog, esc } from './ui.js';

let zxing = null;
function loadZXing() {
  if (zxing) return zxing;
  zxing = new Promise((resolve, reject) => {
    if (window.ZXing) { resolve(window.ZXing); return; }
    const s = document.createElement('script');
    s.src = new URL('../vendor/zxing/zxing.min.js', import.meta.url).href;
    s.onload = () => resolve(window.ZXing);
    s.onerror = () => { zxing = null; reject(new Error('The barcode reader could not be loaded')); };
    document.head.append(s);
  });
  return zxing;
}

const NATIVE_FORMATS = ['code_128', 'code_39', 'code_93', 'qr_code', 'data_matrix', 'ean_13', 'ean_8', 'upc_a', 'itf', 'codabar'];

async function makeDecoder() {
  if ('BarcodeDetector' in window) {
    try {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      const formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
      if (formats.length) {
        const det = new window.BarcodeDetector({ formats });
        return { kind: 'native', decode: async (src) => { const r = await det.detect(src); return r[0]?.rawValue || null; } };
      }
    } catch { /* fall back */ }
  }
  const Z = await loadZXing();
  const reader = new Z.MultiFormatReader();
  const hints = new Map();
  hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.CODE_128, Z.BarcodeFormat.CODE_39, Z.BarcodeFormat.CODE_93, Z.BarcodeFormat.QR_CODE, Z.BarcodeFormat.DATA_MATRIX, Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.ITF]);
  hints.set(Z.DecodeHintType.TRY_HARDER, true);
  reader.setHints(hints);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return {
    kind: 'zxing',
    decode: async (src) => {
      const w = src.videoWidth || src.naturalWidth || src.width;
      const h = src.videoHeight || src.naturalHeight || src.height;
      if (!w || !h) return null;
      const scale = Math.min(1, 1280 / Math.max(w, h));
      canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
      ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
      const warn = console.warn;
      console.warn = (...a) => { if (!String(a[0]).startsWith('MultiFormatReader')) warn(...a); };
      try {
        const lum = new Z.HTMLCanvasElementLuminanceSource(canvas);
        const res = reader.decodeWithState(new Z.BinaryBitmap(new Z.HybridBinarizer(lum)));
        return res.getText();
      } catch { return null; } finally { console.warn = warn; }
    },
  };
}

/** Decode a barcode from an image file (photo of a label). */
export async function decodeFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const dec = await makeDecoder();
    return await dec.decode(img);
  } finally { URL.revokeObjectURL(url); }
}

function cameraError(err) {
  if (!window.isSecureContext) return 'The camera only works over HTTPS.';
  if (err?.name === 'NotAllowedError') return 'Camera permission was refused. Allow it in the browser settings, or type the code below.';
  if (err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError') return 'No camera found on this device. Type the code below or use a handheld scanner.';
  return 'The camera could not start. Type the code below.';
}

export async function openCamera(video, { facing = 'environment' } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('No camera API'), { name: 'NotFoundError' });
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.muted = true;
  await video.play().catch(() => {});
  return stream;
}

export function stopStream(stream) {
  stream?.getTracks().forEach((t) => t.stop());
}

/**
 * Open a scanner. Resolves with the code (from the camera, a photo, or typed) or null.
 */
export function scanDialog({ title = 'Scan a code', hint = '' } = {}) {
  let stream = null;
  let stop = false;
  let found = null;
  return openDialog({
    title,
    body: String(html`<div class="cam"><video muted playsinline></video><div class="frame line"></div><div class="msg" id="scMsg">Starting the camera…</div></div>
      ${hint ? html`<p class="small muted">${hint}</p>` : ''}
      <form class="verify-row" id="scForm" autocomplete="off"><input id="scInput" type="text" autocapitalize="characters" spellcheck="false" placeholder="Or type the code" aria-label="Code"><button class="btn primary" type="submit">Use</button></form>
      <div class="row"><label class="btn sm" for="scFile">${icon('upload')}Read from a photo</label><input id="scFile" type="file" accept="image/*" class="sr-only"><button class="btn sm hidden" type="button" id="scTorch">${icon('zap')}Light</button></div>`),
    actions: [{ label: 'Cancel', value: null }],
    onMount(d, close) {
      const video = d.querySelector('video');
      const msg = d.querySelector('#scMsg');
      const input = d.querySelector('#scInput');
      const finish = (code) => { if (found) return; found = code; close(code); };
      d.querySelector('#scForm').addEventListener('submit', (e) => { e.preventDefault(); const v = input.value.trim(); if (v) finish(v); });
      d.querySelector('#scFile').addEventListener('change', async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        msg.textContent = 'Reading the photo…';
        const code = await decodeFile(f).catch(() => null);
        if (code) finish(code); else msg.textContent = 'No barcode found in that photo. Try closer, flat and in focus.';
      });
      (async () => {
        try {
          const dec = await makeDecoder();
          stream = await openCamera(video);
          if (stop) { stopStream(stream); return; }
          msg.textContent = 'Hold the barcode inside the frame';
          const track = stream.getVideoTracks()[0];
          const caps = track.getCapabilities?.() || {};
          if (caps.torch) {
            const tb = d.querySelector('#scTorch');
            tb.classList.remove('hidden');
            let on = false;
            tb.addEventListener('click', () => { on = !on; track.applyConstraints({ advanced: [{ torch: on }] }).catch(() => {}); });
          }
          const loop = async () => {
            if (stop || found) return;
            if (video.readyState >= 2) {
              const code = await dec.decode(video).catch(() => null);
              if (code) { navigator.vibrate?.(30); finish(code); return; }
            }
            setTimeout(loop, dec.kind === 'native' ? 120 : 220);
          };
          loop();
        } catch (err) {
          msg.textContent = cameraError(err);
          input.focus();
        }
      })();
      if (!matchMedia('(pointer: coarse)').matches) input.focus();
    },
    onClose() { stop = true; stopStream(stream); },
  });
}

void esc;
