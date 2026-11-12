// Light sync: Base45, the fountain code and the signed package.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { encode45, decode45 } from '../js/core/base45.js';
import { makeEncoder, makeDecoder, crc32, fragmentsFor, readHeader } from '../js/core/fountain.js';
import { pack, unpack, newSigner, fingerprint, SYMBOLS, unb64u } from '../js/core/envelope.js';

const te = new TextEncoder();

test('base45: the RFC 9285 examples, and every byte value both ways', () => {
  assert.equal(encode45(te.encode('AB')), 'BB8');
  assert.equal(encode45(te.encode('Hello!!')), '%69 VD92EX0');
  assert.equal(encode45(te.encode('base-45')), 'UJCLQE7W581');
  assert.equal(new TextDecoder().decode(decode45('QED8WEX0')), 'ietf!');
  const all = Uint8Array.from({ length: 513 }, (_, i) => (i * 37) & 255);
  assert.deepEqual(decode45(encode45(all)), all);
  assert.throws(() => decode45('GGW'), /too big/);
  assert.throws(() => decode45('a'), /length/);
});

test('fountain: any big enough set of frames, in any order, rebuilds the message', () => {
  assert.equal(crc32(te.encode('123456789')), 0xCBF43926);
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const msg = Uint8Array.from({ length: 23456 }, () => Math.floor(rand() * 256));
  const enc = makeEncoder(msg, 300);
  assert.equal(enc.K, Math.ceil(23456 / 300));
  for (const loss of [0, 0.3, 0.6]) {
    const dec = makeDecoder();
    let sent = 0;
    for (let seq = 0; !dec.message && seq < enc.K * 6; seq++) {
      sent++;
      if (rand() < loss) continue; // the camera missed this frame
      dec.receive(enc.frame(seq));
    }
    assert.ok(dec.message, `rebuilt with ${loss * 100}% of frames lost`);
    assert.deepEqual(dec.message, msg);
    assert.ok(sent < enc.K * (loss ? 4 : 1.01), `took ${sent} frames for ${enc.K} pieces at ${loss * 100}% loss`);
  }
  // Frames from another transfer and garbage are ignored, not mixed in.
  const dec = makeDecoder();
  dec.receive(enc.frame(0));
  assert.equal(dec.receive(makeEncoder(te.encode('other message'), 300).frame(0)), 'other');
  assert.equal(dec.receive(Uint8Array.of(9, 9, 9)), 'bad');
  assert.equal(dec.receive(enc.frame(0)), 'dup');
  assert.deepEqual(fragmentsFor(3, 10, 1), [3]);
  assert.equal(readHeader(enc.frame(5)).seq, 5);
});

test('package: signed, compressed, verified, and any change is caught', async () => {
  const lib = JSON.parse(readFileSync(new URL('../data/demo-library.json', import.meta.url), 'utf8'));
  const eng = await newSigner('Engineering laptop');
  const bytes = await pack('library', lib, eng);
  assert.ok(bytes.length < JSON.stringify(lib).length / 3, `compressed to ${bytes.length} bytes`);
  const trusted = await unpack(bytes, [{ id: eng.id, pub: eng.pub, name: eng.name }]);
  assert.equal(trusted.kind, 'library');
  assert.ok(trusted.verified && trusted.trusted);
  assert.equal(trusted.name, 'Engineering laptop');
  assert.deepEqual(trusted.data, lib);
  const stranger = await unpack(bytes, []);
  assert.ok(stranger.verified && !stranger.trusted, 'a valid signature from an unknown key is not trusted');
  assert.deepEqual(stranger.key.symbols, await fingerprint(unb64u(eng.pub)));
  const evil = bytes.slice();
  evil[evil.length - 5] ^= 1;
  const broken = await unpack(evil, [{ id: eng.id, pub: eng.pub, name: eng.name }]);
  assert.equal(broken.verified, false, 'one flipped bit breaks the signature');
  assert.equal(broken.data, null, 'nothing is unpacked from a broken package');
  // A different key cannot pass as the trusted one.
  const other = await newSigner('Someone else');
  const fake = await unpack(await pack('library', lib, other), [{ id: eng.id, pub: eng.pub, name: eng.name }]);
  assert.ok(fake.verified && !fake.trusted);
  await assert.rejects(unpack(te.encode('not a package at all, just some text that is long enough to pass the length check of the header and more'), []), /Not a RightPart package/);
  assert.equal(SYMBOLS.length, 64);
  assert.equal(new Set(SYMBOLS).size, 64);
});

test('light sync end to end: package -> frames -> Base45 text -> frames -> package', async () => {
  const lib = JSON.parse(readFileSync(new URL('../data/demo-library.json', import.meta.url), 'utf8'));
  const key = await newSigner('Line 2 tablet');
  const enc = makeEncoder(await pack('library', lib, key), 400);
  const dec = makeDecoder();
  for (let seq = 0; !dec.message; seq++) {
    if (seq % 4 === 1) continue;
    const text = 'RP1:' + encode45(enc.frame(seq));
    assert.match(text, /^[0-9A-Z $%*+\-./:]+$/, 'only QR alphanumeric characters');
    dec.receive(decode45(text.slice(4)));
  }
  const got = await unpack(dec.message, [{ id: key.id, pub: key.pub, name: key.name }]);
  assert.ok(got.trusted && got.verified);
  assert.equal(got.data.devices[0].id, 'NOVA-1');
});

import { createRequire } from 'node:module';

test('light sync through real QR codes: draw each frame with the bundled ZXing, read it back, rebuild', async () => {
  globalThis.self ??= globalThis;
  const ZXing = createRequire(import.meta.url)('../vendor/zxing/zxing.min.js');
  const L = ZXing.QRCodeDecoderErrorCorrectionLevel.L;
  const hints = new Map([[ZXing.EncodeHintType.ERROR_CORRECTION, L]]);
  const reader = new ZXing.QRCodeReader();
  const roundTrip = (text) => {
    const m = ZXing.QRCodeEncoder.encode(text, L, hints).getMatrix();
    const n = m.getWidth(), q = 4, s = 4, W = (n + 2 * q) * s;
    const lum = new Uint8ClampedArray(W * W).fill(255);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m.get(x, y) === 1) for (let dy = 0; dy < s; dy++) lum.fill(0, ((y + q) * s + dy) * W + (x + q) * s, ((y + q) * s + dy) * W + (x + q + 1) * s);
    try { return { text: reader.decode(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.RGBLuminanceSource(lum, W, W)))).getText(), modules: n }; }
    catch { return { text: null, modules: n }; } // ZXing misses a frame now and then: so does a camera
  };
  const lib = JSON.parse(readFileSync(new URL('../data/demo-library.json', import.meta.url), 'utf8'));
  const key = await newSigner('Engineering');
  const enc = makeEncoder(await pack('library', { from: key.name, library: lib }, key), 400);
  const dec = makeDecoder();
  let biggest = 0, unread = 0, shown = 0;
  for (let seq = 0; !dec.message && seq < enc.K * 4; seq++) {
    shown++;
    if (seq % 5 === 2) continue; // missed by the camera
    const { text, modules } = roundTrip('RP1:' + encode45(enc.frame(seq)));
    biggest = Math.max(biggest, modules);
    if (!text) { unread++; continue; }
    dec.receive(decode45(text.slice(4)));
  }
  assert.ok(unread <= shown * 0.2, `${unread} of ${shown} frames could not be read back`);
  assert.ok(dec.message, 'rebuilt from QR codes');
  assert.ok(biggest <= 77, `QR codes stay readable for a phone camera (${biggest} modules wide)`);
  const got = await unpack(dec.message, [{ id: key.id, pub: key.pub, name: key.name }]);
  assert.ok(got.trusted);
  assert.equal(got.data.library.parts.length, lib.parts.length);
});
