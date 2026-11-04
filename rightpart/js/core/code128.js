// Code 128 (set B) barcodes as SVG, for printable bin labels.
// Any handheld scanner reads Code 128; it carries letters, digits and dashes.

const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];
const START_B = 104;
const STOP = 106;

export const CODE128_PATTERNS = PATTERNS;

/** Symbol values for text in code set B (printable ASCII 32..126). */
export function encode128B(text) {
  const values = [START_B];
  for (const ch of String(text)) {
    const c = ch.charCodeAt(0);
    if (c < 32 || c > 126) throw new Error(`Code 128B cannot encode "${ch}"`);
    values.push(c - 32);
  }
  let sum = values[0];
  for (let i = 1; i < values.length; i++) sum += values[i] * i;
  values.push(sum % 103, STOP);
  return values;
}

/** Bar and space widths in modules, starting with a bar. */
export function modules128(text) {
  return encode128B(text).flatMap((v) => PATTERNS[v].split('').map(Number));
}

/** SVG string. width/height in any CSS unit ("38mm") or user units. */
export function barcodeSVG(text, { height = 40, module = 1, quiet = 10, width, heightAttr, label = false, color = '#000' } = {}) {
  const widths = modules128(text);
  const total = widths.reduce((a, b) => a + b, 0) + quiet * 2;
  let x = quiet;
  let bars = '';
  widths.forEach((w, i) => {
    if (i % 2 === 0) bars += `M${x} 0h${w}v${height}h-${w}z`;
    x += w;
  });
  const vbH = height + (label ? 12 : 0);
  const t = label ? `<text x="${total / 2}" y="${height + 10}" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="9" text-anchor="middle" fill="${color}">${escapeXml(text)}</text>` : '';
  const w = width ?? total * module;
  const h = heightAttr ?? vbH * module;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${vbH}" width="${w}" height="${h}" preserveAspectRatio="none" shape-rendering="crispEdges" role="img" aria-label="Barcode ${escapeXml(text)}"><path fill="${color}" d="${bars}"/>${t}</svg>`;
}

function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}
