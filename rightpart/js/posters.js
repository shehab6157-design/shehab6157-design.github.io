// A picture of each product for its card, rendered once from its own 3D scene and kept on this
// device (some tens of kB each). Rendering happens one product at a time, after the page has
// painted. A product without a 3D scene, or a browser without WebGL, simply gets no picture.

const KEY = 'rightpart.posters.v1';
const MAX = 16;
const mem = new Map();
let queue = Promise.resolve();

const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
};
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
const save = (all) => {
  const keep = Object.entries(all).sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).slice(0, MAX);
  try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(keep))); } catch { /* storage full or blocked: memory only */ }
};
const keyOf = (dev) => `${dev.id}:${hash(JSON.stringify(dev.scene))}`;

/** The picture if it is already made (data URL), or null. */
export function cachedPoster(dev) {
  if (!dev?.scene) return null;
  const k = keyOf(dev);
  if (mem.has(k)) return mem.get(k);
  const hit = load()[dev.id];
  if (hit?.k === k && hit.url) { mem.set(k, hit.url); return hit.url; }
  return null;
}

/** The picture of a product, made from its 3D scene when needed. Resolves to a data URL or null. */
export function posterFor(app, dev) {
  if (!dev?.scene) return Promise.resolve(null);
  const ready = cachedPoster(dev);
  if (ready) return Promise.resolve(ready);
  const k = keyOf(dev);
  const job = queue.then(() => (mem.has(k) ? mem.get(k) : render(app, dev))).then((url) => {
    mem.set(k, url);
    if (url) { const all = load(); all[dev.id] = { k, url, at: Date.now() }; save(all); }
    return url;
  }).catch(() => null);
  queue = job;
  return job;
}

async function render(app, dev) {
  const { createViewer } = await import('./viewer3d.js');
  await new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(() => r(), { timeout: 900 }) : setTimeout(r, 250)));
  const box = document.createElement('div');
  box.setAttribute('aria-hidden', 'true');
  box.style.cssText = 'position:fixed;left:-10000px;top:0;width:640px;height:460px;pointer-events:none;';
  document.body.append(box);
  let viewer = null;
  try {
    viewer = createViewer(box, { app, device: dev, mode: 'overview', preserve: true });
    if (!viewer) return null;
    const url = viewer.capture('image/webp', 0.84, 900);
    return url && url.length > 3000 ? url : null;
  } finally {
    try { viewer?.dispose(); } catch { /* ignore */ }
    box.remove();
  }
}

/** Put the picture into every <img data-poster="deviceId"> under root, as each one is ready. */
export function fillPosters(app, root) {
  for (const img of root.querySelectorAll('img[data-poster]')) {
    const dev = app.index.devices.get(img.dataset.poster);
    if (!dev?.scene || img.getAttribute('src')) continue;
    posterFor(app, dev).then((url) => {
      if (!img.isConnected) return;
      if (!url) { img.closest('.poster')?.classList.add('none'); return; }
      img.src = url;
      img.closest('.poster')?.classList.add('ready');
    });
  }
}
