// No en or em dash in visible copy (house style, 4 Oct 2026). Fails on an en or em dash
//   1. in the rendered text, <title>, or a visible attribute (title, alt, aria-label, placeholder, inline
//      handlers such as the Clips modal title,
//      content of description metas) of any tool or public page, and
//   2. anywhere outside comments in a script those pages load.
// A line that must hold a dash for a non-visible reason (for example a pattern that removes them)
// carries `dash-ok: <reason>` in a comment on that line.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {dirname, posix, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const DASH = /[\u2013\u2014]|\\u201[34]|&(?:mdash|ndash|#8211|#8212|#x2013|#x2014);/i;

// Tool pages live under astrix-app/; public pages are the site root, pages/, hub/ and tools/.
// Verification files, embeddable fragments, the admin page and the nested mirror are not pages.
export function isCheckedPage(path) {
  if (!path.endsWith('.html') || path.startsWith('ASTRIX285.github.io/') || path.includes('/components/') || path.startsWith('admin/')) return false;
  if (/^google[0-9a-f]+\.html$/.test(path)) return false;
  return path.startsWith('astrix-app/') || path.startsWith('pages/') || path.startsWith('hub/') || path.startsWith('tools/') || !path.includes('/');
}

/**
 * Lines of a script with comments removed, keeping line numbers. A line comment is only cut where
 * its // sits outside quotes on that line, so URLs in strings stay. Works line by line, so one odd
 * construct can never hide the rest of a file.
 */
export function codeLines(source) {
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, block => block.replace(/[^\n]/g, ' '));
  return withoutBlocks.split('\n').map(line => {
    let quote = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '\\') { i++; continue; }
      if (quote) { if (ch === quote) quote = ''; continue; }
      if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
      if (ch === '/' && line[i + 1] === '/') return line.slice(0, i);
    }
    return line;
  });
}

export function scriptDashes(source, label) {
  const raw = source.split('\n');
  return codeLines(source).map((line, index) => ({line, number: index + 1}))
    .filter(row => DASH.test(row.line) && !/dash-ok:/.test(raw[row.number - 1] || ''))
    .map(row => `${label}:${row.number}: dash in code or copy: ${row.line.trim().slice(0, 100)}`);
}

export function pageDashes(html, label) {
  const problems = [];
  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '';
  if (DASH.test(title)) problems.push(`${label}: dash in <title>: ${title.trim()}`);
  const body = html.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<!--[\s\S]*?-->|<title>[\s\S]*?<\/title>/gi, '');
  const text = body.replace(/<[^>]+>/g, ' ');
  for (const match of text.matchAll(/[^\n]*(?:[\u2013\u2014]|&(?:mdash|ndash|#8211|#8212|#x2013|#x2014);)[^\n]*/gi)) problems.push(`${label}: dash in text: ${match[0].trim().slice(0, 80)}`);
  for (const match of body.matchAll(/\b(?:title|alt|aria-label|placeholder|on[a-z]+)="([^"]*)"/gi)) if (DASH.test(match[1])) problems.push(`${label}: dash in an attribute: ${match[1].slice(0, 80)}`);
  for (const match of html.matchAll(/<meta\b[^>]*\bcontent="([^"]*)"[^>]*>/gi)) if (/name="description"|property="og:(?:title|description)"/i.test(match[0]) && DASH.test(match[1])) problems.push(`${label}: dash in a description meta: ${match[1].slice(0, 80)}`);
  for (const script of html.matchAll(/<script\b(?![^>]*\bsrc=)(?![^>]*type="importmap")[^>]*>([\s\S]*?)<\/script>/gi)) problems.push(...scriptDashes(script[1], `${label} inline script`));
  return problems;
}

/** Every local script a set of pages loads, following static and literal dynamic imports. */
function loadedScripts(pages) {
  const seen = new Set(), queue = [];
  const add = (from, ref) => {
    if (!ref || /^(?:https?:)?\/\//.test(ref) || !/\.m?js(?:\?|$)/.test(ref)) return;
    const site = ref.split('?')[0];
    const file = site.startsWith('/') ? resolve(root, '.' + site) : resolve(dirname(from), site);
    if (!seen.has(file) && existsSync(file)) { seen.add(file); queue.push(file); }
  };
  for (const page of pages) {
    const html = readFileSync(resolve(root, page), 'utf8');
    for (const match of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gi)) add(resolve(root, page), match[1]);
    for (const match of html.matchAll(/<link\b[^>]*rel="modulepreload"[^>]*href="([^"]+)"/gi)) add(resolve(root, page), match[1]);
  }
  while (queue.length) {
    const file = queue.shift(), source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(?:\bimport\s*(?:[^'"`;()]*?\bfrom\s*)?|\bimport\s*\(\s*|\bexport\s*[^'"`;]*?\bfrom\s*)(['"`])([^'"`]+?\.m?js(?:\?[^'"`]*)?)\1/g)) add(file, match[2]);
  }
  return [...seen];
}

const self = resolve(process.argv[1] || '') === fileURLToPath(import.meta.url);
if (self) {
  // The scanner itself: copy is caught, comments and regex patterns are not.
  assert.deepEqual(scriptDashes("const a='x \u2014 y';", 'a').length, 1, 'A dash in a string is caught');
  assert.deepEqual(scriptDashes('const a=`${n}\u2013${m}`;', 'a').length, 1, 'A dash in a template is caught');
  assert.deepEqual(scriptDashes("const a='\\u2014';", 'a').length, 1, 'An escaped dash in a string is caught');
  assert.deepEqual(scriptDashes('// a \u2014 comment\n/* \u2014\n \u2013 */ const u="https://x.example"; // \u2014', 'a'), [], 'Comments are not copy; a URL in a string is not a comment');
  assert.equal(scriptDashes('const r=/\\u2014/g;', 'a').length, 1, 'A regex holding a dash needs a dash-ok reason');
  assert.equal(scriptDashes("const a=`${b}`+'\u2014';", 'a').length, 1, 'A dash after a template on the same line is caught');
  assert.deepEqual(scriptDashes("const a='x \u2014 y'; // dash-ok: matches Bungie's own text", 'a'), [], 'A marked line is allowed');
  assert.equal(pageDashes('<title>A \u2014 B</title>', 'p').length, 1, 'A dash in a title is caught');
  assert.equal(pageDashes('<p>1&ndash;20</p>', 'p').length, 1, 'An entity dash in text is caught');
  assert.equal(pageDashes('<img alt="a \u2013 b">', 'p').length, 1, 'A dash in alt text is caught');
  assert.deepEqual(pageDashes('<!-- a \u2014 b --><p>Plain - text</p>', 'p'), [], 'Hyphens and comments are fine');

  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {cwd: root, encoding: 'utf8'}).split('\n').filter(Boolean);
  const pages = files.filter(isCheckedPage);
  const problems = [];
  for (const page of pages) problems.push(...pageDashes(readFileSync(resolve(root, page), 'utf8'), page));
  const scripts = loadedScripts(pages);
  for (const file of scripts) problems.push(...scriptDashes(readFileSync(file, 'utf8'), posix.relative(root.split('\\').join('/'), file.split('\\').join('/'))));
  assert.deepEqual(problems, [], `En or em dash in visible copy:\n${problems.join('\n')}`);
  assert.ok(pages.length > 20 && scripts.length > 50, `Checked ${pages.length} pages and ${scripts.length} scripts`);
  console.log(`NO_DASHES=PASS ${pages.length} pages and ${scripts.length} scripts they load`);
}
