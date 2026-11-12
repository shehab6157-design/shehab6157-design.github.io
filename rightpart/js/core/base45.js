// Base45 (RFC 9285): bytes as the 45 characters a QR code stores most compactly (alphanumeric mode).
// The EU Digital COVID Certificate used it to fit a signed record into one QR code.

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
const VALUE = new Map([...ALPHABET].map((c, i) => [c, i]));

export function encode45(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 2) {
    if (i + 1 < bytes.length) {
      let n = bytes[i] * 256 + bytes[i + 1];
      const c = n % 45; n = (n - c) / 45;
      const d = n % 45; const e = (n - d) / 45;
      out += ALPHABET[c] + ALPHABET[d] + ALPHABET[e];
    } else {
      const n = bytes[i];
      const c = n % 45;
      out += ALPHABET[c] + ALPHABET[(n - c) / 45];
    }
  }
  return out;
}

export function decode45(text) {
  const s = String(text);
  if (s.length % 3 === 1) throw new Error('Not Base45: wrong length');
  const out = new Uint8Array(Math.floor(s.length / 3) * 2 + (s.length % 3 === 2 ? 1 : 0));
  let o = 0;
  const v = (ch) => { const x = VALUE.get(ch); if (x === undefined) throw new Error('Not Base45: bad character'); return x; };
  for (let i = 0; i < s.length; i += 3) {
    if (i + 2 < s.length) {
      const n = v(s[i]) + v(s[i + 1]) * 45 + v(s[i + 2]) * 2025;
      if (n > 0xFFFF) throw new Error('Not Base45: value too big');
      out[o++] = n >> 8; out[o++] = n & 255;
    } else {
      const n = v(s[i]) + v(s[i + 1]) * 45;
      if (n > 0xFF) throw new Error('Not Base45: value too big');
      out[o++] = n;
    }
  }
  return out;
}
