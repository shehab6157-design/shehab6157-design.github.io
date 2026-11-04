// Round trip: our Code 128 encoder -> pixels -> the ZXing decoder used by the scanner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { modules128 } from '../js/core/code128.js';

globalThis.self ??= globalThis;
const require = createRequire(import.meta.url);
const ZXing = require('../vendor/zxing/zxing.min.js');

function decode(text) {
  const widths = modules128(text);
  const scale = 3, quiet = 12, rows = 12;
  const total = (widths.reduce((a, b) => a + b, 0) + quiet * 2) * scale;
  const line = new Uint8ClampedArray(total).fill(255);
  let x = quiet * scale;
  widths.forEach((w, i) => { if (i % 2 === 0) line.fill(0, x, x + w * scale); x += w * scale; });
  const lum = new Uint8ClampedArray(total * rows);
  for (let r = 0; r < rows; r++) lum.set(line, r * total);
  const src = new ZXing.RGBLuminanceSource(lum, total, rows);
  const bmp = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(src));
  const reader = new ZXing.MultiFormatReader();
  const hints = new Map([[ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.CODE_128]]]);
  return reader.decode(bmp, hints);
}

for (const code of ['100-0233', 'C-55013', 'AF-7380-M3-8-A2', 'NV1-000123', 'SCR-TX-36']) {
  test(`Code 128 round trip: ${code}`, () => {
    const res = decode(code);
    assert.equal(res.getText(), code);
    assert.equal(res.getBarcodeFormat(), ZXing.BarcodeFormat.CODE_128);
  });
}
