#!/usr/bin/env node
// The Aetherium app shell list (feature/aetherium-pwa, 26 Nov 2026).
//   node astrix-app/tools/build-aetherium-sw.mjs          write the SHELL list in hub/aetherium/sw.js
//   node astrix-app/tools/build-aetherium-sw.mjs --check  exit 1 when the list is out of date
//
// build-module-versions.mjs runs this after every module bump, so the list keeps the same ?v= keys the pages use.
// A CSS or image ?v= bump by hand needs this run too (the PWA test says so when it is out of date).
// The shell is what the Aetherium home and the offline page load before their first screen: the two pages, their
// stylesheets, module scripts and import-mapped modules, head preloads, icons, the manifest and its icons, and the
// fonts those stylesheets use. Only files on this site, never Typekit or the NCSOFT CDN. One entry per line with a
// blank line between entries, sorted, like the import maps, so two PRs that bump different files merge cleanly.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(fileURLToPath(new URL('../../',import.meta.url)));
export const SW_FILE='hub/aetherium/sw.js';
export const SHELL_PAGES=Object.freeze([['/hub/aetherium/','hub/aetherium/index.html'],['/hub/aetherium/offline/','hub/aetherium/offline/index.html']]);
const BLOCK=/(\/\/ aetherium-shell:start\r?\n)[\s\S]*?(\/\/ aetherium-shell:end)/;
const decode=value=>value.replace(/&amp;/g,'&');
const ownUrl=value=>typeof value==='string'&&value.startsWith('/')&&!value.startsWith('//');
const byPath=(a,b)=>a<b?-1:a>b?1:0;

export async function shellList(){
  const urls=new Set();
  const css=new Set();
  for(const [site,file] of SHELL_PAGES){
    urls.add(site);
    const html=await readFile(resolve(ROOT,file),'utf8');
    const head=html.slice(0,html.indexOf('</head>'));
    for(const tag of head.match(/<link\b[^>]*>/g)??[]){
      const rel=tag.match(/\brel="([^"]+)"/)?.[1]??'';
      const href=decode(tag.match(/\bhref="([^"]+)"/)?.[1]??'');
      if(!ownUrl(href)||/\b(?:canonical|preconnect)\b/.test(rel))continue;
      urls.add(href);
      if(rel==='stylesheet')css.add(href);
    }
    for(const tag of head.match(/<script\b[^>]*\bsrc="[^"]+"[^>]*>/g)??[]){const src=decode(tag.match(/\bsrc="([^"]+)"/)[1]);if(ownUrl(src))urls.add(src);}
    const map=head.match(/<script type="importmap" data-module-versions>([\s\S]*?)<\/script>/);
    if(map)for(const url of Object.values(JSON.parse(map[1]).imports??{}))if(ownUrl(url))urls.add(url);
    for(const src of html.match(/<img\b[^>]*\bsrc="(\/[^"]+)"/g)??[])urls.add(decode(src.match(/\bsrc="([^"]+)"/)[1]));
  }
  for(const href of [...urls].filter(url=>url.endsWith('.webmanifest'))){
    const manifest=JSON.parse(await readFile(resolve(ROOT,'.'+href.split('?')[0]),'utf8'));
    for(const icon of manifest.icons??[])if(ownUrl(icon.src))urls.add(icon.src);
  }
  for(const href of css){
    const source=await readFile(resolve(ROOT,'.'+href.split('?')[0]),'utf8');
    for(const match of source.matchAll(/url\(\s*["']?(\/fonts\/[^"')?]+\.woff2)["']?\s*\)/g))urls.add(match[1]);
  }
  return [...urls].sort(byPath);
}

export const formatShell=list=>list.map((url,index)=>`${JSON.stringify(url)}${index<list.length-1?',':''}`).join('\n\n');

export async function buildShell({check=false}={}){
  const file=resolve(ROOT,SW_FILE);
  const source=await readFile(file,'utf8');
  if(!BLOCK.test(source))throw new Error(`${SW_FILE}: no aetherium-shell block`);
  const list=await shellList();
  const next=source.replace(BLOCK,(_,start,end)=>`${start}const SHELL = [\n${formatShell(list)}\n];\n${end}`);
  if(next===source){console.log(`AETHERIUM_SHELL=PASS ${list.length} files`);return true;}
  if(check){console.error(`AETHERIUM_SHELL=STALE ${SW_FILE}. Run: node astrix-app/tools/build-aetherium-sw.mjs`);return false;}
  await writeFile(file,next);
  console.log(`AETHERIUM_SHELL=WRITTEN ${list.length} files`);
  return true;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const ok=await buildShell({check:process.argv.includes('--check')});
  if(!ok)process.exit(1);
}
