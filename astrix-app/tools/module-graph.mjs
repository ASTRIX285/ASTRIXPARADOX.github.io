// Static module graph of the app: every JS module reference in pages and modules,
// resolved to a site path (/astrix-app/...). Shared by build-module-versions.mjs and
// validate-single-module-urls.mjs. Reads files only; never writes.
import {readFile,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative,sep,posix} from 'node:path';
import {fileURLToPath} from 'node:url';

export const ROOT=resolve(fileURLToPath(new URL('../../',import.meta.url)));
export const APP='astrix-app';
const SKIP=new Set(['tools','node_modules','vendor','ASTRIX285.github.io']);
// Page folders outside astrix-app/ whose pages load app modules (The Division WorkBench lives at /hub/workbench/<title>/).
export const PAGE_DIRS=Object.freeze(['hub/aetherium','hub/workbench']);
export const toSite=file=>'/'+relative(ROOT,file).split(sep).join('/');
export const toFile=site=>resolve(ROOT,'.'+decodeURIComponent(site));

export async function walk(dir=resolve(ROOT,APP),out=[]){
  for(const name of await readdir(dir)){
    if(SKIP.has(name)||name.startsWith('.'))continue;
    const full=resolve(dir,name),info=await stat(full);
    if(info.isDirectory())await walk(full,out);else out.push(full);
  }
  return out;
}

// Quoted module paths: './x.mjs', "../y.js?v=1", '/astrix-app/z.mjs'. Only relative or
// root paths count; https URLs and bare names are not app modules.
const MODULE_REF=/(['"`])((?:\.{1,2}\/|\/astrix-app\/)[^'"`\s]*?\.m?js)(\?[^'"`\s]*)?\1/g;
export function moduleRefs(source){
  const refs=[];
  for(const match of source.matchAll(MODULE_REF)){
    if(match[1]==='`'&&match[2].includes('${'))continue;
    // static: import/export ... from, or a bare import. dynamic: import(). other: any other string
    // (worker entry URLs, stylesheet helpers), which never loads with the page on its own.
    const before=source.slice(Math.max(0,match.index-24),match.index);
    const kind=/\bimport\s*\(\s*$/.test(before)?'dynamic':/(?:\bfrom|(?:^|[^.\w$])import)\s*$/.test(before)?'static':'other';
    refs.push({quote:match[1],path:match[2],query:match[3]||'',index:match.index,length:match[0].length,kind});
  }
  return refs;
}
// Script tags and modulepreload links in HTML.
const HTML_REF=/<(script|link)\b([^>]*?)\b(src|href)="([^"]+?\.m?js)(\?[^"]*)?"([^>]*)>/g;
export function htmlRefs(source){
  const refs=[];
  for(const match of source.matchAll(HTML_REF)){
    const attrs=match[2]+match[6],tag=match[1];
    const isModule=tag==='script'?/\btype="module"/.test(attrs):/\brel="modulepreload"/.test(attrs);
    if(/^https?:/.test(match[4]))continue;
    refs.push({tag,attr:match[3],path:match[4],query:match[5]||'',isModule,index:match.index,full:match[0]});
  }
  return refs;
}
export function resolveSite(fromSite,path){
  if(path.startsWith('/'))return posix.normalize(path);
  return posix.normalize(posix.join(posix.dirname(fromSite),path));
}
export const contentVersion=source=>createHash('sha256').update(source).digest('hex').slice(0,10);

/** Every app module and page, with resolved references. */
export async function appGraph(){
  const files=await walk(),modules=new Map(),pages=new Map();
  for(const file of files){
    const site=toSite(file);
    if(/\.m?js$/.test(file)){const source=await readFile(file,'utf8');modules.set(site,{site,file,source,refs:moduleRefs(source).map(ref=>({...ref,target:resolveSite(site,ref.path)}))});}
    else if(file.endsWith('.html')){const source=await readFile(file,'utf8');pages.set(site,{site,file,source,refs:htmlRefs(source).map(ref=>({...ref,target:resolveSite(site,ref.path)}))});}
  }
  // Root index.html and other site pages that load app modules.
  for(const name of await readdir(ROOT)){
    if(!name.endsWith('.html'))continue;
    const file=resolve(ROOT,name),source=await readFile(file,'utf8'),site='/'+name;
    if(/astrix-app\/.*\.m?js/.test(source))pages.set(site,{site,file,source,refs:htmlRefs(source).map(ref=>({...ref,target:resolveSite(site,ref.path)}))});
  }
  for(const dir of PAGE_DIRS){
    const full=resolve(ROOT,dir);
    if(!(await stat(full).catch(()=>null))?.isDirectory())continue;
    for(const file of await walk(full)){
      if(!file.endsWith('.html'))continue;
      const source=await readFile(file,'utf8'),site=toSite(file);
      pages.set(site,{site,file,source,refs:htmlRefs(source).map(ref=>({...ref,target:resolveSite(site,ref.path)}))});
    }
  }
  return {modules,pages};
}

/** Modules a page needs on first render: entries plus their static imports, transitively. */
export function staticReachable(modules,entries){
  const seen=new Set(),queue=[...entries];
  while(queue.length){
    const site=queue.shift();if(seen.has(site)||!modules.has(site))continue;seen.add(site);
    for(const ref of modules.get(site).refs)if(ref.kind==='static'&&!seen.has(ref.target))queue.push(ref.target);
  }
  return seen;
}

/** Modules reachable from a set of entry sites through static and literal dynamic references. */
export function reachable(modules,entries){
  const seen=new Set(),queue=[...entries];
  while(queue.length){
    const site=queue.shift();if(seen.has(site)||!modules.has(site))continue;seen.add(site);
    for(const ref of modules.get(site).refs)if(!seen.has(ref.target))queue.push(ref.target);
  }
  return seen;
}
