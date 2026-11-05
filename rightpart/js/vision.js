// Photo identification that learns YOUR parts, on this device.
// A small neural network (MobileNet v1, bundled with the app) turns a photo into 512 numbers that
// describe what it looks like. Teaching stores those numbers for photos of each part; identifying
// compares a new photo with them. No photo or number ever leaves the device.
//
// Honest limits: a photo cannot tell M3 × 8 from M3 × 10 (no scale). Photos narrow it down to the
// right family (head, drive, finish); the true-scale gauge confirms the size.

import { put, all, del } from './store.js';
import { t } from './core/i18n.js';

let tfPromise = null;
let modelPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(t('Could not load {file}', { file: src })));
    document.head.append(s);
  });
}

async function loadTF() {
  if (!tfPromise) {
    tfPromise = (async () => {
      if (!window.tf) await loadScript(new URL('../vendor/tfjs/tf.min.js', import.meta.url).href);
      const tf = window.tf;
      try { await tf.setBackend('webgl'); } catch { await tf.setBackend('cpu'); }
      await tf.ready();
      return tf;
    })().catch((e) => { tfPromise = null; throw e; });
  }
  return tfPromise;
}

/** Loads the network once (about 6 MB, cached for offline use afterwards). */
export function loadModel(onStatus) {
  if (!modelPromise) {
    modelPromise = (async () => {
      onStatus?.(t('Loading the on-device model…'));
      const tf = await loadTF();
      const full = await tf.loadLayersModel(new URL('../vendor/mobilenet/model.json', import.meta.url).href);
      const feat = tf.model({ inputs: full.inputs, outputs: full.getLayer('global_average_pooling2d_1').output });
      tf.tidy(() => feat.predict(tf.zeros([1, 224, 224, 3])));
      onStatus?.('Ready');
      return { tf, feat, backend: tf.getBackend() };
    })().catch((e) => { modelPromise = null; throw e; });
  }
  return modelPromise;
}

const work = document.createElement('canvas');
work.width = work.height = 224;

/** Draw the centre square of a source (video, image, canvas) at 224 × 224. */
function square(source, mirror = false) {
  const w = source.videoWidth || source.naturalWidth || source.width;
  const h = source.videoHeight || source.naturalHeight || source.height;
  const s = Math.min(w, h) * 0.86;
  const ctx = work.getContext('2d', { willReadFrequently: true });
  ctx.save();
  ctx.clearRect(0, 0, 224, 224);
  if (mirror) { ctx.translate(224, 0); ctx.scale(-1, 1); }
  ctx.drawImage(source, (w - s) / 2, (h - s) / 2, s, s, 0, 0, 224, 224);
  ctx.restore();
  return work;
}

/** Feature vector (unit length) of the centre of a photo. */
export async function embed(source, { mirror = false } = {}) {
  const { tf, feat } = await loadModel();
  const c = square(source, mirror);
  const data = tf.tidy(() => {
    const x = tf.browser.fromPixels(c).toFloat().div(127.5).sub(1).expandDims(0);
    const y = feat.predict(x).reshape([-1]);
    return y.div(y.norm().add(1e-8));
  });
  const v = await data.data();
  data.dispose();
  return Float32Array.from(v);
}

export function thumbnail(source, size = 96) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d').drawImage(square(source), 0, 0, size, size);
  return c.toDataURL('image/jpeg', 0.8);
}

const uid = () => `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** Teach: store the photo's features (and its mirror image, which doubles the examples). */
export async function teach(partId, source) {
  const thumb = thumbnail(source);
  const v1 = await embed(source);
  const v2 = await embed(source, { mirror: true });
  const at = Date.now();
  await put('samples', { id: uid(), partId, vec: Array.from(v1), thumb, createdAt: at });
  await put('samples', { id: uid(), partId, vec: Array.from(v2), thumb: null, createdAt: at, mirror: true });
}

export async function samplesByPart() {
  const list = await all('samples');
  const map = new Map();
  for (const s of list) { const e = map.get(s.partId) || { count: 0, photos: 0, thumbs: [], ids: [] }; e.count++; if (!s.mirror) { e.photos++; if (s.thumb && e.thumbs.length < 8) e.thumbs.push(s.thumb); } e.ids.push(s.id); map.set(s.partId, e); }
  return map;
}

export async function forgetPart(partId) {
  const list = await all('samples');
  for (const s of list) if (s.partId === partId) await del('samples', s.id);
}

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

/**
 * Compare a photo with every taught part.
 * Returns [{ partId, score (0..1), thumb }] best first, and a verdict: 'strong' | 'possible' | 'unsure' | 'untrained'.
 */
export async function identify(source) {
  const list = await all('samples');
  if (!list.length) return { verdict: 'untrained', matches: [] };
  const v = await embed(source);
  const per = new Map();
  for (const s of list) {
    const sim = dot(v, s.vec);
    const e = per.get(s.partId) || { sims: [], thumb: null };
    e.sims.push(sim);
    if (!e.thumb && s.thumb) e.thumb = s.thumb;
    per.set(s.partId, e);
  }
  const matches = [...per.entries()].map(([partId, e]) => {
    const top = e.sims.sort((a, b) => b - a).slice(0, 3);
    return { partId, score: top.reduce((a, b) => a + b, 0) / top.length, thumb: e.thumb };
  }).sort((a, b) => b.score - a.score);
  const best = matches[0]?.score || 0;
  const margin = best - (matches[1]?.score || 0);
  const verdict = best >= 0.84 && (matches.length === 1 || margin >= 0.03) ? 'strong' : best >= 0.74 ? 'possible' : 'unsure';
  return { verdict, matches: matches.slice(0, 5) };
}

export async function exportSamples() {
  const list = await all('samples');
  return { schema: 'rightpart-samples/1', exportedAt: new Date().toISOString(), model: 'mobilenet_v1_0.50_224/global_average_pooling2d_1', samples: list };
}

export async function importSamples(data) {
  if (data?.schema !== 'rightpart-samples/1' || !Array.isArray(data.samples)) throw new Error(t('Not a RightPart photo-samples file'));
  let n = 0;
  for (const s of data.samples) {
    if (!s.partId || !Array.isArray(s.vec) || s.vec.length !== 512) continue;
    await put('samples', { ...s, id: s.id || uid() });
    n++;
  }
  return n;
}
