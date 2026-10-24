#!/usr/bin/env node
// Each Guide page's facts written into its own HTML (feature/aetherium-guide-static-facts, 24 Oct 2026), so a search engine or
// AI crawler that does not run JavaScript still reads what the page says. The Guide draws itself from the data in the browser;
// this tool opens every Guide page in Chromium on a local server, reads what the page drew (headings, text, list items, table
// rows) and writes it as plain HTML inside #aeStage, between <!-- facts:start --> and <!-- facts:end -->. The block is
// visually hidden (.ae-sr) and the page replaces #aeStage when it draws, so a visitor never sees it twice. Nothing in it is
// written by hand: it is what the page shows, from the same data.
//
// Run after changing Guide data or a Guide page:  node astrix-app/tools/build-aetherium-facts.mjs
// --check reports pages whose block is out of date and changes nothing (exit 1).
// Pages that depend on the clock or on the visitor (resets, the weekly loop, Where to get it) carry their title and
// description only, so the block never goes stale on its own.
import {createServer} from 'node:http';
import {readFile, readdir, stat, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {extname, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const {chromium} = process.env.PLAYWRIGHT_MODULE_PATH
  ? await import(process.env.PLAYWRIGHT_MODULE_PATH)
  : require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? `${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright` : 'playwright');

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const GUIDE = 'hub/aetherium/guide';
/** Pages whose body changes with the clock or the visitor: title and description only. */
export const SUMMARY_ONLY = new Set(['general/resets', 'weekly', 'equipment/where-to-get']);
/** A block longer than this is cut at the last whole item, so no page carries a wall of text. */
const MAX_CHARS = 12000;
const START = '<!-- facts:start -->';
const END = '<!-- facts:end -->';
const BLOCK = /[ \t]*<div class="ae-sr" data-static-facts>[\s\S]*?<!-- facts:end --><\/div>\r?\n?/;
const ANCHOR = '<p class="ae-sr">Opening the Guide.</p>';
const types = {'.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2'};

const esc = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const decode = value => String(value).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

async function guidePages() {
  const out = [];
  const walk = async dir => {
    for (const name of await readdir(dir)) {
      const full = join(dir, name);
      if ((await stat(full)).isDirectory()) await walk(full);
      else if (name === 'index.html') out.push(full);
    }
  };
  await walk(resolve(root, GUIDE));
  return out.sort();
}
const pagePath = file => `/${relative(root, file).split(sep).join('/').replace(/index\.html$/, '')}`;
const innerOf = file => relative(resolve(root, GUIDE), file).split(sep).join('/').replace(/\/?index\.html$/, '');

/** The items a page drew, read in the browser: [{ kind: 'h2'|'h3'|'p'|'li'|'row', text }]. */
function readPage() {
  const body = document.querySelector('#aeGuideBody');
  if (!body) return [];
  const CLOCK = '[data-countdown],[data-reset-when]';
  const hidden = el => el.closest('dialog,nav,button,script,style,template,[hidden],[aria-hidden="true"],.ae-sr,[data-guide-side]');
  /* Text with a space wherever two elements meet, so "Tank" and "1" never run together. */
  const textOf = el => {
    const parts = [];
    const visit = node => {
      if (node.nodeType === 3) { parts.push(node.nodeValue); return; }
      if (node.nodeType !== 1 || hidden(node) || node.tagName === 'IMG') return;
      parts.push(' ');
      for (const child of node.childNodes) visit(child);
      parts.push(' ');
    };
    visit(el);
    return parts.join('').replace(/\s+/g, ' ').replace(/ ([.,:;!?)])/g, '$1').replace(/\( /g, '(').trim();
  };
  const items = [];
  const taken = new Set();
  for (const el of body.querySelectorAll('h2,h3,p,li,tr,figcaption')) {
    if (hidden(el) || [...taken].some(done => done.contains(el))) continue;
    /* Countdowns and next reset times change by the minute: never written into the HTML. */
    if (el.matches(CLOCK) || el.querySelector(CLOCK)) continue;
    const kind = el.tagName === 'TR' ? 'row' : el.tagName.toLowerCase() === 'figcaption' ? 'p' : el.tagName.toLowerCase();
    let text = '';
    if (kind === 'row') text = [...el.children].map(textOf).filter(Boolean).join(', ');
    else if (kind === 'li') {
      /* A list item with its own heading reads "Heading: the rest". */
      const head = el.querySelector(':scope > h3, :scope > strong, :scope > div > h3');
      const rest = textOf(el);
      const title = head ? textOf(head) : '';
      text = title && rest.startsWith(title) && rest.length > title.length ? `${title}: ${rest.slice(title.length).trim()}` : rest;
      /* A card that opens a detail card names itself in its label ("Rare Stun Theostone, see the details"): lead with that,
         so the grade the picture shows is in the words too. */
      const label = el.querySelector('a[aria-label$=", see the details"]')?.getAttribute('aria-label').replace(/, see the details$/, '');
      if (label) {
        const words = text.split(' ');
        let k = 0;
        while (k < words.length && label.toLowerCase().includes(words.slice(0, k + 1).join(' ').toLowerCase())) k += 1;
        text = `${label}: ${words.slice(k).join(' ')}`.replace(/: $/, '');
      }
    } else text = textOf(el);
    if (kind === 'li' || kind === 'row') taken.add(el);
    if (text) items.push({kind, text});
  }
  return items;
}

/** The block for one page: its name, its description, then what it drew. Consecutive list items and rows become one list. */
export function factsBlock({title, description, items}) {
  const out = [`<h1>${esc(title)}</h1>`];
  if (description) out.push(`<p>${esc(description)}</p>`);
  let list = null;
  let used = out.join('').length;
  const seen = new Set();
  for (const item of items) {
    const key = `${item.kind}:${item.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const html = item.kind === 'h2' || item.kind === 'h3' ? `<${item.kind}>${esc(item.text)}</${item.kind}>` : item.kind === 'p' ? `<p>${esc(item.text)}</p>` : `<li>${esc(item.text)}</li>`;
    if (used + html.length > MAX_CHARS) break;
    used += html.length;
    const isList = item.kind === 'li' || item.kind === 'row';
    if (isList && !list) { list = []; }
    if (!isList && list) { out.push(`<ul>${list.join('')}</ul>`); list = null; }
    if (isList) list.push(html); else out.push(html);
  }
  if (list) out.push(`<ul>${list.join('')}</ul>`);
  return `<div class="ae-sr" data-static-facts>${START}${out.join('')}${END}</div>`;
}

/** The page's HTML with its block written in (or replaced), right after the stage's "Opening the Guide." line. */
export function withBlock(html, block) {
  const clean = html.replace(BLOCK, '');
  if (!clean.includes(ANCHOR)) throw new Error('no "Opening the Guide." line in #aeStage');
  return clean.replace(ANCHOR, `${ANCHOR}${block}`);
}

const shortName = title => decode(title).split(' | ')[0].trim();

export async function plan({log = () => {}} = {}) {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = resolve(root, `.${path}`);
    if (!file.startsWith(root + sep) && file !== root) { res.writeHead(403).end(); return; }
    if (path.endsWith('/')) file = resolve(file, 'index.html');
    try { const body = await readFile(file); res.writeHead(200, {'content-type': types[extname(file)] || 'application/octet-stream'}); res.end(body); } catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const writes = new Map();
  try {
    const context = await browser.newContext({viewport: {width: 1440, height: 900}, reducedMotion: 'reduce'});
    /* Local files only: no fonts, no game art, never the Worker or the official site. */
    await context.route('**/*', route => (route.request().url().startsWith(base) ? route.continue() : route.abort()));
    for (const file of await guidePages()) {
      const html = await readFile(file, 'utf8');
      const title = shortName(/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '');
      const description = decode(/<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? '');
      let items = [];
      if (!SUMMARY_ONLY.has(innerOf(file))) {
        const page = await context.newPage();
        try {
          await page.goto(`${base}${pagePath(file)}`, {waitUntil: 'load'});
          await page.waitForFunction(() => document.querySelector('main')?.getAttribute('aria-busy') === 'false' && document.querySelector('#aeGuideBody')?.children.length, null, {timeout: 20000});
          await page.waitForTimeout(150);
          items = await page.evaluate(readPage);
        } finally { await page.close(); }
      }
      const next = withBlock(html, factsBlock({title, description, items}));
      if (next !== html) writes.set(file, next);
      log(`${pagePath(file)} ${items.length} item(s)`);
    }
  } finally {
    await browser.close();
    server.close();
  }
  return writes;
}

if (process.argv[1]?.endsWith('build-aetherium-facts.mjs')) {
  const check = process.argv.includes('--check');
  const writes = await plan({log: process.argv.includes('--verbose') ? line => console.log(line) : () => {}});
  if (check) {
    if (writes.size) { console.error(`AETHERIUM_FACTS=STALE ${writes.size} page(s). Run: node astrix-app/tools/build-aetherium-facts.mjs\n${[...writes.keys()].slice(0, 20).map(file => `  ${relative(root, file)}`).join('\n')}`); process.exit(1); }
    console.log('AETHERIUM_FACTS=PASS every Guide page carries its facts in the HTML');
  } else {
    for (const [file, source] of writes) await writeFile(file, source);
    console.log(`AETHERIUM_FACTS=WRITTEN ${writes.size} page(s)`);
  }
}
