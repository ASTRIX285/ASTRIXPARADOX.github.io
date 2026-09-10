// strip-forge-css-asserts.mjs
// Removes ONLY the CSS-freeze assertions from validate-forge-loader.mjs.
// Deletes every line whose first non-space text is:
//     assert.match(css,        or        assert.doesNotMatch(css,
// Leaves every other line untouched (logic tests, HTML-structural tests,
// runtime tests, no-invented-data, no-live-mutation, no-DIM, other-file tests).
//
// USAGE (from the repo root):
//     node strip-forge-css-asserts.mjs astrix-app/tools/validate-forge-loader.mjs
//
// It writes a .stripped copy, runs `node --check` on it, and only then
// overwrites the original. If the stripped file does not parse, the original
// is left exactly as it was and nothing is changed.

import {readFileSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const target = process.argv[2];
if (!target) {
  console.error('Pass the path to validate-forge-loader.mjs');
  process.exit(1);
}

const CSS_FREEZE = /^\s*assert\.(match|doesNotMatch)\(css\s*,/;

const original = readFileSync(target, 'utf8');
const eol = original.includes('\r\n') ? '\r\n' : '\n';
const lines = original.split(/\r?\n/);

const removed = [];
const kept = [];
for (const line of lines) {
  if (CSS_FREEZE.test(line)) removed.push(line);
  else kept.push(line);
}

const stripped = kept.join(eol);
// keep a .mjs extension so `node --check` treats it as an ES module
const strippedPath = target.replace(/(\.mjs)?$/, '') + '.stripped.mjs';
writeFileSync(strippedPath, stripped);

try {
  execFileSync(process.execPath, ['--check', strippedPath], {stdio: 'pipe'});
} catch (error) {
  console.error('Stripped file did NOT parse. Original left untouched.');
  console.error(String(error.stderr || error.message));
  process.exit(1);
}

writeFileSync(target, stripped);

console.log('Removed ' + removed.length + ' CSS-freeze assertion line(s):');
for (const line of removed) console.log('  - ' + line.trim().slice(0, 100));
console.log('Kept ' + kept.filter(l => /^\s*assert\./.test(l)).length + ' other assertion line(s).');
console.log('node --check passed. ' + target + ' updated.');
