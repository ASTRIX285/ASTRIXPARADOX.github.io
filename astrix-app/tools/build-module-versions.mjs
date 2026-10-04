#!/usr/bin/env node
// One URL per JS file (perf, 3 Oct 2026).
//   node astrix-app/tools/build-module-versions.mjs          write versions, imports and import maps
//   node astrix-app/tools/build-module-versions.mjs --check  exit 1 if anything is out of date
//
// - astrix-app/module-versions.json holds one version per JS file: a hash of its source with
//   module query strings removed. Editing a file and running this script is the whole bump.
// - Pages: imports are plain paths; each page head carries an import map (data-module-versions)
//   that adds the version once. Script src, modulepreload href and Worker entry URLs are not
//   import-mapped by the browser, so they carry the same ?v= stamp from the versions file.
// - Module workers cannot use the page import map. Modules reachable from a worker entry keep a
//   ?v= stamp on their own imports, written here from the same versions file, so a file still has
//   exactly one URL in the page and in the worker.
// - CSS and image ?v= keys, and classic (non-module) <script src> keys, are not touched.
// - Merge-friendly layout (3 Oct 2026): every import map and module-versions.json list one module per line,
//   sorted by path (plain code-point order), with a blank line between entries. A version bump changes
//   only that module's line, and the unchanged blank line beside it lets git merge two PRs that bump
//   neighbouring modules without a conflict. Nothing else is reordered or reflowed.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {ROOT,APP,appGraph,reachable,staticReachable,contentVersion,moduleRefs} from './module-graph.mjs';

export const VERSIONS_FILE=resolve(ROOT,APP,'module-versions.json');
export const WORKER_ENTRIES=Object.freeze([
  '/astrix-app/core/engine-profile-worker.mjs',
  '/astrix-app/core/engine-handoff-worker.mjs',
  '/astrix-app/pages/guardian-workspace-v2/paradox-build-space/paradox-forge-worker.mjs'
]);
const IMPORT_MAP=/[ \t]*<script type="importmap" data-module-versions>[\s\S]*?<\/script>\r?\n?/;
export const byPath=(a,b)=>a<b?-1:a>b?1:0;
// Head hints (perf, 4 Oct 2026), written right after the import map, one per line, sorted, a blank
// line between entries, like the import maps:
// - preconnect to the Worker and the Bungie image host, on pages whose code uses them;
// - preload of the font weights painted above the fold (every @font-face already uses font-display: swap);
// - modulepreload of every module the page needs on first render: its module scripts plus their
//   static imports, at the import-map URL, so each module still has one URL. Modules behind a
//   click or a later step load through import() and are never listed.
export const HEAD_HINT=/[ \t]*<link\b[^>]*\bdata-head-hint>\r?\n(?:[ \t]*\r?\n)?/g;
export const AUTH_HOST='https://auth.astrixparadox.com';
export const BUNGIE_IMAGE_HOST='https://www.bungie.net';
// Modules a page imports with import() at startup, unconditionally, before its first screen.
export const FIRST_RENDER_DYNAMIC=Object.freeze({
  '/astrix-app/pages/journey/index.html':['/astrix-app/pages/journey/journey.mjs','/astrix-app/shared/astrix-hero-cards.mjs']
});
// Font weights painted above the fold, measured per page at 1600 and 390 (4 Oct 2026).
const TOOL_FONTS=['barlow-semi-condensed-600','barlow-semi-condensed-700','michroma-400'];
export const FONT_PRELOADS=Object.freeze({
  '/astrix-app/pages/home/index.html':['barlow-400',...TOOL_FONTS],
  '/astrix-app/pages/journey/index.html':TOOL_FONTS,
  '/astrix-app/pages/guardian-workspace-v2/index.html':TOOL_FONTS,
  '/astrix-app/pages/guardian-workspace-v2/paradox-build-space/index.html':TOOL_FONTS,
  '/astrix-app/pages/forge-loader/index.html':TOOL_FONTS,
  '/astrix-app/pages/reports/index.html':TOOL_FONTS,
  '/astrix-app/pages/vault/index.html':TOOL_FONTS,
  '/astrix-app/pages/loadout/index.html':TOOL_FONTS,
  '/astrix-app/pages/build-review/index.html':['barlow-semi-condensed-600','barlow-semi-condensed-700'],
  '/astrix-app/pages/build-fit/index.html':['barlow-semi-condensed-600','barlow-semi-condensed-700']
});
export function headHintRows({preconnect=[],fonts=[],modules=[]}){
  return [
    ...[...preconnect].sort(byPath).map(host=>`<link rel="preconnect" href="${host}" data-head-hint>`),
    ...[...fonts].sort(byPath).map(font=>`<link rel="preload" href="/fonts/${font}.woff2" as="font" type="font/woff2" crossorigin data-head-hint>`),
    ...[...modules].sort(byPath).map(url=>`<link rel="modulepreload" href="${url}" data-head-hint>`)
  ];
}
const headHintBlock=rows=>rows.length?rows.map(row=>`  ${row}\n`).join('\n'):'';
// One entry per line, a blank line between entries, no trailing comma on the last one.
const entryLines=(rows,indent='')=>rows.map((row,index)=>`${indent}${row}${index<rows.length-1?',':''}`).join('\n\n');
export function formatImportMap(imports){
  const rows=Object.keys(imports).sort(byPath).map(site=>`${JSON.stringify(site)}:${JSON.stringify(imports[site])}`);
  return `  <script type="importmap" data-module-versions>\n{"imports":{\n${entryLines(rows)}\n}}\n  </script>\n`;
}
export function formatVersions({note,modules,workerStamped}){
  const versionRows=Object.keys(modules).sort(byPath).map(site=>`${JSON.stringify(site)}: ${JSON.stringify(modules[site])}`);
  const workerRows=[...workerStamped].sort(byPath).map(site=>JSON.stringify(site));
  return `{\n "schemaVersion": 1,\n "note": ${JSON.stringify(note)},\n "modules": {\n${entryLines(versionRows,'  ')}\n },\n "workerStamped": [\n${entryLines(workerRows,'  ')}\n ]\n}\n`;
}

// Source with every module reference reduced to its plain path: the version must not depend on
// the stamps this script writes, or worker modules would chase each other's hashes.
function normalized(source){
  let out='',at=0;
  for(const ref of moduleRefs(source)){out+=source.slice(at,ref.index)+ref.quote+ref.path+ref.quote;at=ref.index+ref.length;}
  return out+source.slice(at);
}

export async function plan(){
  const {modules,pages}=await appGraph();
  const versions={};
  for(const [site,module] of [...modules].sort(([a],[b])=>byPath(a,b)))versions[site]=contentVersion(normalized(module.source));
  const workerGraph=reachable(modules,WORKER_ENTRIES),workerEntries=new Set(WORKER_ENTRIES);
  const stamp=site=>`?v=${versions[site]}`;
  const writes=new Map(),unresolved=[];
  // Modules.
  for(const module of modules.values()){
    let out='',at=0;
    for(const ref of module.refs){
      if(!versions[ref.target]){unresolved.push(`${module.site}: ${ref.path}`);continue;}
      const stamped=workerEntries.has(ref.target)||(workerGraph.has(module.site)&&workerGraph.has(ref.target));
      out+=module.source.slice(at,ref.index)+ref.quote+ref.path+(stamped?stamp(ref.target):'')+ref.quote;at=ref.index+ref.length;
    }
    out+=module.source.slice(at);
    if(out!==module.source)writes.set(module.file,out);
  }
  // Pages.
  for(const page of pages.values()){
    let source=page.source.replace(IMPORT_MAP,'').replace(HEAD_HINT,'');
    const refs=page.refs.filter(ref=>versions[ref.target]);
    // Module entries, plus the modules classic scripts import. Classic scripts themselves are not
    // modules and stay out of the map.
    const classicTargets=refs.filter(ref=>ref.tag==='script'&&!ref.isModule).map(ref=>ref.target);
    const entries=[...refs.filter(ref=>ref.isModule).map(ref=>ref.target),...classicTargets.flatMap(site=>modules.get(site)?.refs.map(ref=>ref.target)||[])];
    const graph=[...reachable(modules,entries)].filter(site=>!classicTargets.includes(site)||entries.includes(site)).sort(byPath);
    // Rewrite script src / modulepreload href to the one stamped URL (HTML uses &amp; nowhere in it).
    source=source.replace(/<(script|link)\b([^>]*?)\b(src|href)="([^"]+?\.m?js)(\?[^"]*)?"([^>]*)>/g,(match,tag,before,attr,path,query,after)=>{
      if(/^https?:/.test(path))return match;
      // Classic (non-module) scripts keep their own ?v= key; they are listed in the PR.
      const attrs=before+after;
      if(tag==='script'?!/\btype="module"/.test(attrs):!/\brel="modulepreload"/.test(attrs))return match;
      const target=resolveFrom(page.site,path);
      return versions[target]?`<${tag}${before}${attr}="${path}${stamp(target)}"${after}>`:match;
    });
    const usesModules=refs.some(ref=>ref.isModule)||graph.length>refs.length;
    if(usesModules&&graph.length){
      const map={imports:Object.fromEntries(graph.map(site=>[site,`${site}${stamp(site)}`]))};
      const block=formatImportMap(map.imports);
      // Before the first script or modulepreload, so every module load sees it.
      const first=source.search(/[ \t]*<(script\b|link\b[^>]*rel="modulepreload")/);
      const hints=page.site.startsWith(`/${APP}/`)?headHintBlock(pageHeadHints(page,refs,classicTargets,modules,versions)):'';
      source=first<0?source.replace('</head>',`${block}${hints}</head>`):source.slice(0,first)+block+hints+source.slice(first);
    }
    if(source!==page.source)writes.set(page.file,source);
  }
  const versionsJson=formatVersions({note:'Generated by astrix-app/tools/build-module-versions.mjs. Do not edit by hand.',modules:versions,workerStamped:[...workerGraph]});
  return {versions,versionsJson,writes,unresolved,workerGraph:[...workerGraph].sort(byPath)};
}
// A page's head hints. A module the page already preloads by hand is not listed twice.
export function pageHeadHints(page,refs,classicTargets,modules,versions){
  const scripts=refs.filter(ref=>ref.tag==='script'&&ref.isModule).map(ref=>ref.target);
  const manual=new Set(page.refs.filter(ref=>ref.tag==='link'&&ref.isModule&&!/data-head-hint/.test(ref.full)).map(ref=>ref.target));
  const firstRender=[...staticReachable(modules,[...scripts,...(FIRST_RENDER_DYNAMIC[page.site]||[])])].filter(site=>versions[site]&&!manual.has(site));
  const code=[page.source,...[...reachable(modules,[...scripts,...classicTargets])].map(site=>modules.get(site)?.source||'')].join('\n');
  const preconnect=[...(code.includes('auth.astrixparadox.com')?[AUTH_HOST]:[]),...(/\bwww\.bungie\.net\b/.test(code)?[BUNGIE_IMAGE_HOST]:[])];
  return headHintRows({preconnect,fonts:FONT_PRELOADS[page.site]||[],modules:firstRender.map(site=>`${site}?v=${versions[site]}`)});
}
function resolveFrom(fromSite,path){
  if(path.startsWith('/'))return path.split('?')[0];
  const parts=fromSite.split('/');parts.pop();
  for(const part of path.split('/')){if(part==='..')parts.pop();else if(part!=='.')parts.push(part);}
  return parts.join('/');
}

if(process.argv[1]?.endsWith('build-module-versions.mjs')){
  const check=process.argv.includes('--check');
  const result=await plan();
  const current=await readFile(VERSIONS_FILE,'utf8').catch(()=>'');
  const stale=[...result.writes.keys()];
  if(current!==result.versionsJson)stale.unshift(VERSIONS_FILE);
  if(check){
    if(stale.length){console.error(`MODULE_VERSIONS=STALE ${stale.length} file(s) out of date. Run: node astrix-app/tools/build-module-versions.mjs\n${stale.slice(0,20).map(file=>`  ${file}`).join('\n')}`);process.exit(1);}
    console.log(`MODULE_VERSIONS=PASS ${Object.keys(result.versions).length} modules, worker-stamped ${result.workerGraph.length}`);
  }else{
    for(const [file,source] of result.writes)await writeFile(file,source);
    if(current!==result.versionsJson)await writeFile(VERSIONS_FILE,result.versionsJson);
    console.log(`MODULE_VERSIONS=WRITTEN ${stale.length} file(s); ${Object.keys(result.versions).length} modules; worker-stamped ${result.workerGraph.length}`);
  }
  if(result.unresolved.length)console.log(`Unresolved references (left as written):\n${result.unresolved.map(row=>`  ${row}`).join('\n')}`);
}
