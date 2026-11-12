// Light sync, part 1: getting bytes across a noisy channel with no way to ask again.
// A dandelion does not aim its seeds; it sends more than are needed, and any few that land grow.
// A fountain code (Luby transform) does the same with data: the sender shows an endless stream of
// frames, each one a mix of pieces of the message, and the receiver rebuilds the message from any
// big enough set of frames, in any order, missing any of them. Deep-space links and Bitcoin
// hardware wallets (animated QR codes, Blockchain Commons) already work this way.
// Pure: bytes in, frames out, and back.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 (the one in zip and PNG). */
export function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/** A small seeded random generator (mulberry32): the sender and the receiver draw the same numbers. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const harmonic = new Map();

/**
 * Which pieces frame `seq` mixes. The first K frames carry one piece each, in order, so a clean
 * read is as fast as it can be; after that each frame mixes d pieces, with P(d) ∝ 1/d.
 */
export function fragmentsFor(seq, K, checksum) {
  if (seq < K) return [seq];
  const r = rng((Math.imul(seq, 0x9E3779B1) ^ checksum) >>> 0);
  if (!harmonic.has(K)) { let h = 0; for (let d = 1; d <= K; d++) h += 1 / d; harmonic.set(K, h); }
  let x = r() * harmonic.get(K);
  let d = 1;
  while (d < K && (x -= 1 / d) > 0) d++;
  const idx = Array.from({ length: K }, (_, i) => i);
  for (let i = 0; i < d; i++) {
    const j = i + Math.floor(r() * (K - i));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, d).sort((a, b) => a - b);
}

export const VERSION = 1;
export const HEADER = 15; // version 1, checksum 4, length 4, pieces 2, frame number 4

/** Frames for a message: encoder.frame(0), frame(1), … for as long as the sender shows them. */
export function makeEncoder(message, fragLen = 400) {
  if (!(message instanceof Uint8Array) || !message.length) throw new Error('Nothing to send');
  const K = Math.ceil(message.length / fragLen);
  if (K > 65535) throw new Error('Too big to send by light');
  const checksum = crc32(message);
  const frags = [];
  for (let i = 0; i < K; i++) {
    const f = new Uint8Array(fragLen);
    f.set(message.subarray(i * fragLen, Math.min(message.length, (i + 1) * fragLen)));
    frags.push(f);
  }
  return {
    K, checksum, length: message.length, fragLen,
    frame(seq) {
      const out = new Uint8Array(HEADER + fragLen);
      const dv = new DataView(out.buffer);
      out[0] = VERSION;
      dv.setUint32(1, checksum);
      dv.setUint32(5, message.length);
      dv.setUint16(9, K);
      dv.setUint32(11, seq >>> 0);
      const data = out.subarray(HEADER);
      for (const i of fragmentsFor(seq, K, checksum)) {
        const f = frags[i];
        for (let b = 0; b < fragLen; b++) data[b] ^= f[b];
      }
      return out;
    },
  };
}

/** Header of a frame, or null if it is not one of ours. */
export function readHeader(frame) {
  if (!(frame instanceof Uint8Array) || frame.length <= HEADER || frame[0] !== VERSION) return null;
  const dv = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  const h = { checksum: dv.getUint32(1), length: dv.getUint32(5), K: dv.getUint16(9), seq: dv.getUint32(11), fragLen: frame.length - HEADER };
  if (!h.K || !h.length || h.length > h.K * h.fragLen || h.length <= (h.K - 1) * h.fragLen) return null;
  return h;
}

/**
 * Rebuilds a message from frames in any order. receive(frame) -> 'new' | 'dup' | 'other' | 'bad';
 * `progress` is the share of pieces known; `message` is set once the checksum matches.
 */
export function makeDecoder() {
  let head = null, known = null, nKnown = 0, pending = [], seen = new Set(), other = 0;
  const dec = {
    message: null,
    get progress() { return head ? nKnown / head.K : 0; },
    get pieces() { return head ? head.K : 0; },
    get frames() { return seen.size; },
    get otherFrames() { return other; },
    get id() { return head?.checksum ?? null; },
    reset() { head = null; known = null; nKnown = 0; pending = []; seen = new Set(); other = 0; dec.message = null; },
    receive(frame) {
      const h = readHeader(frame);
      if (!h) return 'bad';
      if (!head) { head = h; known = new Array(h.K).fill(null); }
      else if (h.checksum !== head.checksum || h.K !== head.K || h.length !== head.length || h.fragLen !== head.fragLen) { other++; return 'other'; }
      if (dec.message || seen.has(h.seq)) return 'dup';
      seen.add(h.seq);
      const queue = [{ set: new Set(fragmentsFor(h.seq, h.K, h.checksum)), data: frame.slice(HEADER) }];
      while (queue.length) {
        const p = queue.pop();
        for (const i of [...p.set]) {
          if (!known[i]) continue;
          const k = known[i];
          for (let b = 0; b < p.data.length; b++) p.data[b] ^= k[b];
          p.set.delete(i);
        }
        if (!p.set.size) continue;
        if (p.set.size > 1) { pending.push(p); continue; }
        const i = p.set.values().next().value;
        known[i] = p.data;
        nKnown++;
        const rest = [];
        for (const q of pending) (q.set.has(i) ? queue : rest).push(q);
        pending = rest;
      }
      if (nKnown === head.K) {
        const msg = new Uint8Array(head.K * head.fragLen);
        known.forEach((f, i) => msg.set(f, i * head.fragLen));
        const out = msg.slice(0, head.length);
        if (crc32(out) === head.checksum) dec.message = out;
        else dec.reset(); // a corrupt piece got in: start over rather than hand over wrong data
      }
      return 'new';
    },
  };
  return dec;
}
