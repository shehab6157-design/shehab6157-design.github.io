// The offline cache must list every app file, and every listed file must exist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const shell = [...sw.matchAll(/^\s+'([^']+)',$/gm)].map((m) => m[1]);

function walk(dir) {
  return readdirSync(join(root, dir)).flatMap((f) => {
    const p = join(dir, f);
    return statSync(join(root, p)).isDirectory() ? walk(p) : [p];
  });
}

test('every listed file exists', () => {
  for (const f of shell) if (f !== './') assert.ok(existsSync(join(root, f)), f);
});

test('every script and stylesheet is cached for offline use', () => {
  const files = [...walk('js'), ...walk('css')].filter((f) => /\.(js|css)$/.test(f));
  for (const f of files) assert.ok(shell.includes(f), `${f} missing from sw.js`);
});

test('every listed language has its file, is cached offline, and keeps every placeholder', async () => {
  const langSrc = readFileSync(join(root, 'js/lang.js'), 'utf8');
  const block = langSrc.slice(langSrc.indexOf('export const LANGUAGES'), langSrc.indexOf('export const PLANNED'));
  const listed = [...block.matchAll(/code: '([\w-]+)'/g)].map((m) => m[1]);
  const cached = JSON.parse(sw.match(/const LOCALES = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
  assert.deepEqual([...cached].sort(), [...listed].sort(), 'sw.js LOCALES must match LANGUAGES in js/lang.js');
  const { buildCatalog, checkLocale } = await import('../tools/i18n.mjs');
  const cat = buildCatalog();
  for (const code of listed) {
    assert.ok(existsSync(join(root, `locales/${code}.json`)), `locales/${code}.json is missing`);
    if (code === 'en') continue;
    const r = checkLocale(JSON.parse(readFileSync(join(root, `locales/${code}.json`), 'utf8')), cat);
    assert.equal(r.placeholders.length + r.braces.length, 0, `${code}: a translation lost a {placeholder}: ${JSON.stringify(r.placeholders.slice(0, 3))}`);
  }
});
