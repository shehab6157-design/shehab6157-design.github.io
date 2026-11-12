// Small CSV reader and writer (comma, semicolon or tab; quoted fields; Excel exports).

export function detectDelimiter(text) {
  const line = text.split(/\r?\n/).find((l) => l.trim()) || '';
  let inQ = false;
  const count = { ',': 0, ';': 0, '\t': 0 };
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (!inQ && ch in count) count[ch]++;
  }
  return Object.entries(count).sort((a, b) => b[1] - a[1])[0][1] ? Object.entries(count).sort((a, b) => b[1] - a[1])[0][0] : ',';
}

export function parseCSV(text, delimiter) {
  text = String(text ?? '').replace(/^﻿/, '');
  const d = delimiter || detectDelimiter(text);
  const rows = [];
  let row = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += ch;
    } else if (ch === '"' && field === '') inQ = true; // a quote opens a quoted field only at its start: מק"ט stays as it is
    else if (ch === d) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

/** Rows as objects keyed by the (lower-case, trimmed) header row. */
export function parseCSVObjects(text) {
  const rows = parseCSV(text);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

export function toCSV(rows) {
  return rows.map((r) => r.map((v) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\r\n');
}
