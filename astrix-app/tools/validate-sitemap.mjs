#!/usr/bin/env node
// Keeps sitemap.xml and robots.txt honest for search engines:
//   - every sitemap URL is on astrixparadox.com, ends in / or .html, and its page exists in the repo;
//   - every page under hub/ that names itself as canonical and is not noindex is in the sitemap;
//   - no sitemap page is marked noindex, and no sitemap URL is blocked by robots.txt;
//   - robots.txt points at the sitemap and never blocks the scripts, styles or data pages need to render.
import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {join, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const SITE = 'https://astrixparadox.com';
const errors = [];

const sitemap = readFileSync(join(root, 'sitemap.xml'), 'utf8');
const robots = readFileSync(join(root, 'robots.txt'), 'utf8');
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1].trim());
const disallows = robots.split('\n').map(line => /^Disallow:\s*(\S+)/i.exec(line.trim())?.[1]).filter(Boolean);

const fileFor = path => path.endsWith('/') ? join(root, path, 'index.html') : join(root, path);
const robotsMeta = html => /<meta\s+name="robots"\s+content="([^"]*)"/i.exec(html)?.[1] ?? '';

if (new Set(locs).size !== locs.length) errors.push('sitemap.xml lists a URL twice');
for (const loc of locs) {
  if (!loc.startsWith(`${SITE}/`)) { errors.push(`${loc}: not on ${SITE}`); continue; }
  const path = loc.slice(SITE.length);
  if (!path.endsWith('/') && !path.endsWith('.html')) errors.push(`${loc}: should end in / or .html`);
  const file = fileFor(path);
  if (!existsSync(file)) { errors.push(`${loc}: no page at ${relative(root, file)}`); continue; }
  if (/noindex/i.test(robotsMeta(readFileSync(file, 'utf8')))) errors.push(`${loc}: page is noindex but listed in the sitemap`);
  const blocked = disallows.find(rule => path.startsWith(rule));
  if (blocked) errors.push(`${loc}: blocked by robots.txt (Disallow: ${blocked})`);
}

// Public tool pages: every indexable hub page that names itself as canonical belongs in the sitemap.
function pages(dir) {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return pages(full);
    return name === 'index.html' ? [full] : [];
  });
}
for (const file of pages(join(root, 'hub'))) {
  const html = readFileSync(file, 'utf8');
  const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
  const path = `/${relative(root, file).split(sep).join('/').replace(/index\.html$/, '')}`;
  if (/noindex/i.test(robotsMeta(html)) || canonical !== `${SITE}${path}`) continue;
  if (!locs.includes(canonical)) errors.push(`${canonical}: public page missing from sitemap.xml`);
}

if (!robots.includes(`Sitemap: ${SITE}/sitemap.xml`)) errors.push('robots.txt must point at the sitemap');
for (const needed of ['/css/', '/js/', '/img/', '/astrix-app/shared/', '/astrix-app/pages/', '/astrix-app/games/']) {
  const rule = disallows.find(item => needed.startsWith(item) || item === '/');
  if (rule) errors.push(`robots.txt blocks ${needed} (Disallow: ${rule}); pages need it to render for search engines`);
}
if (/[–—]/.test(robots + sitemap)) errors.push('robots.txt or sitemap.xml contains an en or em dash');

if (errors.length) {
  console.error(`SITEMAP=FAIL ${errors.length} problem(s)`);
  for (const error of errors) console.error(`  ${error}`);
  process.exit(1);
}
console.log(`SITEMAP=PASS ${locs.length} URLs, ${disallows.length} robots rules`);
