// Light sync, part 2: what travels, sealed and signed.
// Ants let a nestmate in and turn a stranger away by the scent it carries. Here every package
// carries the sender's public key and a signature over its content: a tablet installs a library only
// from a key it already trusts (or one a person has just compared, symbol by symbol, with the
// sender's screen), and any change on the way breaks the signature. The same design moved signed
// certificates through QR codes (EU Digital COVID Certificate: compressed, signed with ECDSA P-256).
// Uses WebCrypto and CompressionStream: works in browsers and in Node 20+.

const MAGIC = [0x52, 0x50, 0x4C, 0x31]; // "RPL1"
export const KINDS = { library: 1, records: 2, key: 3 };
const KIND_NAMES = Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [v, k]));
const PUB_LEN = 65, SIG_LEN = 64;

const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

export const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64u = (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function through(stream, bytes) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}
export const deflate = (bytes) => through(new CompressionStream('deflate-raw'), bytes);
export const inflate = (bytes) => through(new DecompressionStream('deflate-raw'), bytes);

const sha256 = async (bytes) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));

/** Short id of a public key: the first 8 bytes of its SHA-256, in hex. */
export async function keyId(pub) { return hex((await sha256(pub)).slice(0, 8)); }

// 64 symbols from creation: sea, land, air, plants, sky. Six bits each; eight make a key's face.
export const SYMBOLS = [...'🐢🐙🐬🐳🦀🐠🐡🦈🐚🦑🐟🦐🐘🐪🐎🦁🐯🐻🐼🐨🐺🦊🐰🐑🐐🐄🐖🐓🐸🐊🦎🐍🦅🦉🐦🐧🦆🐝🦋🐞🐜🐌🌲🌳🌴🌵🌾🌿🍀🍁🍄🌻🌷🌹🌸🌼🌙⭐🌍🌋🌊🔥🌈⚡'];

/** Eight symbols that two people can compare across a room: the same key shows the same eight. */
export async function fingerprint(pub) {
  const h = await sha256(pub);
  let bits = 0n;
  for (let i = 0; i < 6; i++) bits = (bits << 8n) | BigInt(h[i]);
  const out = [];
  for (let i = 7; i >= 0; i--) out.push(SYMBOLS[Number((bits >> BigInt(i * 6)) & 63n)]);
  return out;
}

/** A new signing key for this device. The private half never leaves it (not extractable). */
export async function newSigner(name) {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  return { name, privateKey: kp.privateKey, pub: b64u(pub), id: await keyId(pub), created: Date.now() };
}

async function verify(pub, sig, bytes) {
  try {
    const key = await crypto.subtle.importKey('raw', pub, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, bytes);
  } catch { return false; }
}

/** Seal data for the trip: compressed JSON, with the sender's public key and signature. */
export async function pack(kind, data, signer) {
  if (!KINDS[kind]) throw new Error(`Unknown kind ${kind}`);
  if (!signer?.privateKey) throw new Error('A signing key is needed');
  const body = await deflate(new TextEncoder().encode(JSON.stringify(data)));
  const pub = unb64u(signer.pub);
  const k = Uint8Array.of(KINDS[kind]);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signer.privateKey, concat(k, pub, body)));
  return concat(Uint8Array.from(MAGIC), k, Uint8Array.of(1), pub, sig, body);
}

/**
 * Open a package. Returns { kind, data, key: { id, pub, symbols }, verified, trusted, name }.
 * `verified` = the signature matches the content and the key it carries; `trusted` = that key is
 * one this device already trusts (`trust` = [{ id, pub, name }]). Throws if it is not a package.
 */
export async function unpack(bytes, trust = []) {
  if (bytes.length < 6 + PUB_LEN + SIG_LEN || MAGIC.some((m, i) => bytes[i] !== m)) throw new Error('Not a RightPart package');
  const kind = KIND_NAMES[bytes[4]];
  if (!kind || bytes[5] !== 1) throw new Error('Unknown or unsigned package');
  const pub = bytes.slice(6, 6 + PUB_LEN);
  const sig = bytes.slice(6 + PUB_LEN, 6 + PUB_LEN + SIG_LEN);
  const body = bytes.slice(6 + PUB_LEN + SIG_LEN);
  const verified = await verify(pub, sig, concat(Uint8Array.of(bytes[4]), pub, body));
  const id = await keyId(pub);
  const match = (trust || []).find((k) => k.id === id && k.pub === b64u(pub));
  let data = null;
  if (verified) data = JSON.parse(new TextDecoder().decode(await inflate(body)));
  return { kind, data, verified, trusted: !!match, name: match?.name || null, key: { id, pub: b64u(pub), symbols: await fingerprint(pub) } };
}
