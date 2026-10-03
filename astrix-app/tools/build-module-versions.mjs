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
import {ROOT,APP,appGraph,reachable,contentVersion,moduleRefs} from './module-graph.mjs';

export const VERSIONS_FILE=resolve(ROOT,APP,'module-versions.json');
export const WORKER_ENTRIES=Object.freeze([
  '/astrix-app/core/engine-profile-worker.mjs',
  '/astrix-app/core/engine-handoff-worker.mjs',
  '/astrix-app/pages/guardian-workspace-v2/paradox-build-space/paradox-forge-worker.mjs'
]);
const IMPORT_MAP=/[ \t]*<script type="importmap" data-module-versions>[\s\S]*?<\/script>\r?\n?/;
export const byPath=(a,b)=>a<b?-1:a>b?1:0;
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
    let source=page.source.replace(IMPORT_MAP,'');
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
      source=first<0?source.replace('</head>',`${block}</head>`):source.slice(0,first)+block+source.slice(first);
    }
    if(source!==page.source)writes.set(page.file,source);
  }
  const versionsJson=formatVersions({note:'Generated by astrix-app/tools/build-module-versions.mjs. Do not edit by hand.',modules:versions,workerStamped:[...workerGraph]});
  return {versions,versionsJson,writes,unresolved,workerGraph:[...workerGraph].sort(byPath)};
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
