#!/usr/bin/env node
// Search and share tags for every Aetherium page (chore/aetherium-sitemap, 24 Oct 2026), so search engines and link
// previews pick up what each page is:
//   - Open Graph and Twitter card tags (title, description, page URL, the page's own photo) and a BreadcrumbList in JSON-LD,
//     written between <!-- seo:start --> and <!-- seo:end --> right after the canonical link;
//   - the page's <lastmod> in sitemap.xml, from the last commit that changed the page.
// Titles, descriptions and canonicals stay in each page; this reads them, so the page stays the one place they live.
// Run after adding an Aetherium page or changing its photo:  node astrix-app/tools/build-aetherium-seo.mjs
// --check reports pages that are out of date and changes nothing (validate-sitemap.mjs runs it).
import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync, readdirSync, statSync, writeFileSync} from 'node:fs';
import {join, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const SITE = 'https://astrixparadox.com';
const BASE = 'hub/aetherium';
const IMAGES = '/astrix-app/pages/aetherium/images';

/* The photo each page shows, the same one its banner or backdrop uses (guide-shell.mjs and the page backdrops). */
const PAGE_HEROES = ['crafting/gathering', 'general/loadouts', 'equipment/slots', 'equipment/titles', 'equipment/where-to-get', 'equipment/manastones', 'equipment/arcana', 'equipment/pets-wings', 'path', 'dungeons', 'dungeons/daily-dungeon'];
const PAGE_HERO_FILE = { 'crafting/gathering': 'gathering', 'general/loadouts': 'loadouts', 'equipment/slots': 'slots', 'equipment/titles': 'titles', 'equipment/where-to-get': 'where-to-get', 'equipment/manastones': 'manastones', 'equipment/arcana': 'arcana', 'equipment/pets-wings': 'pets-wings', path: 'path', dungeons: 'dungeons', 'dungeons/daily-dungeon': 'daily-dungeon' };
const SECTION_OF = [['general', 'general'], ['character', 'character'], ['classes', 'character'], ['skills', 'skills'], ['equipment', 'equipment'], ['crafting', 'crafting'], ['world', 'world'], ['guides', 'guides'], ['path', 'guides'], ['weekly', 'guides'], ['dungeons', 'guides']];
const ASCENT_TABS = ['mastery', 'skill-bar', 'stigma', 'daevanion', 'macro', 'stats'];

export function imageFor(path) {
  if (path === 'guide/') return `${IMAGES}/photos/golden-sea-01.jpg`;
  if (path === 'guide/general/about/') return `${IMAGES}/photos/atreia-vista-01.jpg`;
  if (path.startsWith('guide/')) {
    const inner = path.slice('guide/'.length).replace(/\/$/, '');
    if (PAGE_HEROES.includes(inner)) return `${IMAGES}/page-heroes/${PAGE_HERO_FILE[inner]}.jpg`;
    const cls = /^classes\/([a-z]+)$/.exec(inner)?.[1];
    if (cls) return `${IMAGES}/class-figures/${cls}.jpg`;
    const section = SECTION_OF.find(([start]) => inner === start || inner.startsWith(`${start}/`))?.[1];
    if (section) return `${IMAGES}/section-heroes/${section}.jpg`;
    return `${IMAGES}/photos/golden-sea-01.jpg`;
  }
  if (path.startsWith('ascent/')) {
    const tab = path.split('/')[1];
    return `${IMAGES}/page-backgrounds/ascent-${ASCENT_TABS.includes(tab) ? tab : 'mastery'}.jpg`;
  }
  if (path === '') return `${IMAGES}/page-backgrounds/daeva-card.jpg`;
  /* The Atreia Atlas shares the Guide's World photo. */
  if (path === 'map/') return `${IMAGES}/section-heroes/world.jpg`;
  /* The character pages each have their own backdrop (design/aetherium-more-backdrops, 24 Oct 2026). */
  const own = { 'gear/': 'character', 'gear/titles/': 'titles', 'compare/': 'compare', 'skills/': 'skills', 'daevanion/': 'daevanion' }[path];
  return `${IMAGES}/page-backgrounds/${own ?? 'gear-ledger'}.jpg`;
}

const attr = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const decode = value => String(value).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const read = html => ({
  title: decode(/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? ''),
  description: decode(/<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? ''),
  canonical: /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1] ?? ''
});
/** The page's own name: the first part of its title ("Theostones | Equipment | ..." gives "Theostones"). */
const shortName = title => title.split(' | ')[0].trim();

function pages() {
  const walk = dir => readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return name === 'index.html' ? [full] : [];
  });
  return walk(join(root, BASE)).map(file => ({ file, path: relative(join(root, BASE), file).split(sep).join('/').replace(/index\.html$/, '') })).sort((a, b) => a.path.localeCompare(b.path));
}

/** The breadcrumb from the site to this page: The Hub, The Aetherium, then each page above this one that exists. */
function breadcrumb(path, names) {
  const items = [{ name: 'The Hub', url: `${SITE}/hub/` }, { name: 'The Aetherium', url: `${SITE}/${BASE}/` }];
  const parts = path.replace(/\/$/, '').split('/').filter(Boolean);
  for (let n = 1; n <= parts.length; n++) {
    const sub = `${parts.slice(0, n).join('/')}/`;
    if (names.has(sub)) items.push({ name: names.get(sub), url: `${SITE}/${BASE}/${sub}` });
  }
  return items;
}

export function seoBlock({ path, title, description, canonical }, names) {
  const image = imageFor(path);
  const name = path === '' ? 'Daeva Card' : shortName(title);
  const ld = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: breadcrumb(path, names).map((item, n) => ({ '@type': 'ListItem', position: n + 1, name: item.name, item: item.url })) };
  return `<!-- seo:start -->
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="ASTRIX PARADOX">
  <meta property="og:title" content="${attr(`${name} | The Aetherium | AION 2`)}">
  <meta property="og:description" content="${attr(description)}">
  <meta property="og:url" content="${attr(canonical)}">
  <meta property="og:image" content="${attr(`${SITE}${image}`)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${attr(`${name} | The Aetherium | AION 2`)}">
  <meta name="twitter:description" content="${attr(description)}">
  <meta name="twitter:image" content="${attr(`${SITE}${image}`)}">
  <script type="application/ld+json">${JSON.stringify(ld)}</script>
  <!-- seo:end -->`;
}

const BLOCK = /<!-- seo:start -->[\s\S]*?<!-- seo:end -->/;
export function withSeo(html, block) {
  if (BLOCK.test(html)) return html.replace(BLOCK, block);
  return html.replace(/(<link rel="canonical" href="[^"]+">)/, `$1\n  ${block}`);
}

const lastChange = file => {
  try { return execFileSync('git', ['log', '-1', '--format=%cs', '--', relative(root, file)], { cwd: root, encoding: 'utf8' }).trim() || null; } catch { return null; }
};

/** Every Aetherium page with its tags as they should be, and its sitemap date. */
export function plan() {
  const list = pages().map(page => ({ ...page, ...read(readFileSync(page.file, 'utf8')) }));
  const names = new Map(list.map(page => [page.path, page.path === '' ? 'Daeva Card' : shortName(page.title)]));
  return list.map(page => ({ ...page, block: seoBlock(page, names), image: imageFor(page.path) }));
}

/** Problems with the pages as they are now: missing or stale tags, a photo that is not in the repo. */
export function check() {
  const problems = [];
  for (const page of plan()) {
    const html = readFileSync(page.file, 'utf8');
    if (!page.canonical || !page.description || !page.title) problems.push(`${page.path || '(Daeva Card)'}: needs a title, description and canonical first`);
    if (!existsSync(join(root, page.image))) problems.push(`${page.path || '(Daeva Card)'}: its photo ${page.image} is not in the repo`);
    if (html.match(BLOCK)?.[0] !== page.block) problems.push(`${page.path || '(Daeva Card)'}: search and share tags are missing or out of date (run node astrix-app/tools/build-aetherium-seo.mjs)`);
  }
  return problems;
}

function updateSitemap(list) {
  const file = join(root, 'sitemap.xml');
  let xml = readFileSync(file, 'utf8');
  for (const page of list) {
    const loc = `${SITE}/${BASE}/${page.path}`;
    const date = lastChange(page.file);
    if (!date) continue;
    xml = xml.replace(new RegExp(`(<loc>${loc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</loc>\\s*<lastmod>)[^<]*(</lastmod>)`), `$1${date}$2`);
  }
  writeFileSync(file, xml);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--check')) {
    const problems = check();
    if (problems.length) { console.error(`AETHERIUM_SEO=FAIL ${problems.length}`); for (const line of problems) console.error(`  ${line}`); process.exit(1); }
    console.log('AETHERIUM_SEO=PASS');
  } else {
    const list = plan();
    let changed = 0;
    for (const page of list) {
      const html = readFileSync(page.file, 'utf8');
      const next = withSeo(html, page.block);
      if (next !== html) { writeFileSync(page.file, next); changed++; }
    }
    updateSitemap(list);
    console.log(`AETHERIUM_SEO updated ${changed} of ${list.length} pages and their sitemap dates`);
  }
}
