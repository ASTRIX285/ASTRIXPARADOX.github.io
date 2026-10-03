// For Node tests: the URL other modules use for an app module. Worker-graph modules import each
// other with their ?v= stamp (workers cannot read the page import map), so a test that imports one
// plainly would get a second module instance. Usage:
//   const {readPreparedBundle}=await import(moduleUrl('../core/prepared-bundle-cache.mjs',import.meta.url));
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const versions=JSON.parse(readFileSync(new URL('../module-versions.json',import.meta.url),'utf8'));
const stamped=new Set(versions.workerStamped||[]);
const root=fileURLToPath(new URL('../../',import.meta.url)).replace(/\\/g,'/');
export function moduleUrl(path,base){
  const url=new URL(path,base),site='/'+fileURLToPath(url).replace(/\\/g,'/').slice(root.length).replace(/^\/+/,'');
  if(stamped.has(site))url.search=`?v=${versions.modules[site]}`;
  return url.href;
}
