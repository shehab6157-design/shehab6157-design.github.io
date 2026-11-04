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
