// Reading Excel workbooks (.xlsx) on the device, with no library: an .xlsx file is a zip of XML
// files (the workbook, its shared strings and one file per sheet). Nothing is uploaded.
// Old binary .xls files are not read: save them as .xlsx or .csv first.
// Works in browsers and in Node 18+ (DecompressionStream, Blob, Response).

const td = new TextDecoder();
const MAX_UNZIPPED = 200 * 1024 * 1024; // refuse files that claim to unpack to more than this
const MAX_ROWS = 100000;

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

/** Is this the start of a zip file (every .xlsx is one)? */
export const isZip = (bytes) => bytes.length > 4 && u32(bytes, 0) === 0x04034b50;
/** Old Excel 97–2003 (.xls) files start with the OLE2 signature. */
export const isOldExcel = (bytes) => bytes.length > 8 && bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0;

async function inflateRaw(data) {
  const s = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/** The files in a zip archive: Map(name -> () => Promise<Uint8Array>). */
export function unzip(bytes) {
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (u32(bytes, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a zip file');
  const count = u16(bytes, eocd + 10);
  let p = u32(bytes, eocd + 16);
  let total = 0;
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (u32(bytes, p) !== 0x02014b50) throw new Error('Damaged zip file');
    const method = u16(bytes, p + 10);
    const csize = u32(bytes, p + 20);
    total += u32(bytes, p + 24);
    const nameLen = u16(bytes, p + 28), extraLen = u16(bytes, p + 30), commentLen = u16(bytes, p + 32);
    const local = u32(bytes, p + 42);
    const name = td.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    files.set(name, async () => {
      if (u32(bytes, local) !== 0x04034b50) throw new Error('Damaged zip file');
      const start = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28);
      const data = bytes.subarray(start, start + csize);
      if (method === 0) return data;
      if (method === 8) return inflateRaw(data);
      throw new Error('Unsupported zip compression');
    });
  }
  if (total > MAX_UNZIPPED) throw new Error('The workbook is too large');
  return files;
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescapeXml = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#'
  ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
  : ENT[e] ?? m));
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? unescapeXml(m[1]) : null;
};
/** All the text of an element: the <t> runs, without phonetic hints. */
const textOf = (xml) => unescapeXml([...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));

/** "A" -> 0, "Z" -> 25, "AA" -> 26 */
export function colIndex(ref) {
  let n = 0;
  for (const ch of ref) { const c = ch.charCodeAt(0); if (c < 65 || c > 90) break; n = n * 26 + (c - 64); }
  return n - 1;
}

/**
 * Read a workbook. Returns [{ name, hidden, rows: string[][] }], one per sheet, in workbook order.
 * Cells are text: numbers as Excel stores them, formulas as their last calculated value.
 */
export async function readXlsx(bytes) {
  if (isOldExcel(bytes)) throw new Error('old-xls');
  const files = unzip(bytes);
  const read = async (path) => { const f = files.get(path); return f ? td.decode(await f()) : null; };
  const workbook = await read('xl/workbook.xml');
  if (!workbook) throw new Error('This file is not an Excel workbook');
  const rels = new Map();
  for (const m of ((await read('xl/_rels/workbook.xml.rels')) || '').matchAll(/<Relationship\b[^>]*>/g)) rels.set(attr(m[0], 'Id'), attr(m[0], 'Target'));
  const shared = [...((await read('xl/sharedStrings.xml')) || '').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const sheets = [];
  for (const m of workbook.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const name = attr(m[0], 'name') || `Sheet${sheets.length + 1}`;
    const target = rels.get(attr(m[0], 'r:id')) || '';
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    const xml = await read(path);
    if (!xml) continue;
    sheets.push({ name, hidden: /^(hidden|veryHidden)$/.test(attr(m[0], 'state') || ''), rows: sheetRows(xml, shared) });
  }
  return sheets;
}

function sheetRows(xml, shared) {
  const rows = [];
  let next = 0;
  for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = attr(rm[0].slice(0, rm[0].indexOf('>') + 1), 'r');
    const ri = r ? parseInt(r, 10) - 1 : next;
    next = ri + 1;
    if (ri >= MAX_ROWS) break;
    const row = [];
    let col = 0;
    for (const cm of (rm[2] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(` ${cm[1]}`, 'r');
      const ci = ref ? colIndex(ref.replace(/\d+$/, '')) : col;
      col = ci + 1;
      const type = attr(` ${cm[1]}`, 't');
      const inner = cm[2] || '';
      let v = '';
      if (type === 'inlineStr') v = textOf(inner);
      else {
        const vm = inner.match(/<v>([\s\S]*?)<\/v>/);
        const raw = vm ? unescapeXml(vm[1]) : '';
        if (type === 's') v = shared[parseInt(raw, 10)] ?? '';
        else if (type === 'b') v = raw === '1' ? 'TRUE' : raw === '0' ? 'FALSE' : raw;
        else v = raw;
      }
      if (v !== '') row[ci] = v.trim();
    }
    for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = '';
    rows[ri] = row;
  }
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
  while (rows.length && !rows[rows.length - 1].some((c) => c !== '')) rows.pop();
  return rows;
}
