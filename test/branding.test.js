'use strict';
// VIDA Dental is a separate product. This check fails the build if any file
// mentions another clinic product's name, so nothing borrowed slips in.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKIP = new Set(['node_modules', '.git', 'dist', '.smoke']);
const FORBIDDEN = [/caring[\s_-]*hands/i, /oregon/i, /chbak/i];

function* files(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* files(p);
    else if (/\.(js|mjs|cjs|json|html|css|md|yml|yaml|txt)$/i.test(e.name) || e.name === 'LICENSE') yield p;
  }
}

test('no other product’s name or wording appears anywhere in the repository', () => {
  const self = path.join('test', 'branding.test.js');
  const hits = [];
  for (const f of files(ROOT)) {
    if (path.relative(ROOT, f) === self || path.basename(f) === 'package-lock.json') continue;
    const text = fs.readFileSync(f, 'utf8');
    for (const re of FORBIDDEN) if (re.test(text)) hits.push(`${path.relative(ROOT, f)} matches ${re}`);
  }
  assert.deepEqual(hits, []);
});
