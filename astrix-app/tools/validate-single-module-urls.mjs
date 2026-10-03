#!/usr/bin/env node
// Every JS file loads from one URL on every tool page (perf, 3 Oct 2026).
//   1. module-versions.json, imports and import maps are current (build-module-versions --check).
//   2. No import in a page-context module carries ?v=; the version comes from the import map.
//      Modules reachable from a module worker are the listed exception: their stamps must equal
//      the versions file, because a worker cannot read the page import map.
//   3. Each tool page, loaded signed out from a local server (nothing leaves the machine), requests
//      every JS file under exactly one URL, and that URL carries its version.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {ROOT,appGraph,reachable} from './module-graph.mjs';
import {plan,WORKER_ENTRIES} from './build-module-versions.mjs';
const require=createRequire(import.meta.url);

// 1 and 2: static.
const result=await plan(),current=await readFile(resolve(ROOT,'astrix-app/module-versions.json'),'utf8').catch(()=>'');
assert.equal(current,result.versionsJson,'module-versions.json is stale. Run: node astrix-app/tools/build-module-versions.mjs');
assert.deepEqual([...result.writes.keys()],[],'Imports or import maps are stale. Run: node astrix-app/tools/build-module-versions.mjs');
const {modules,pages}=await appGraph(),workerGraph=reachable(modules,WORKER_ENTRIES),workerEntries=new Set(WORKER_ENTRIES);
const versioned=[];
for(const module of modules.values())for(const ref of module.refs){
  if(!ref.query)continue;
  const allowed=workerEntries.has(ref.target)||(workerGraph.has(module.site)&&workerGraph.has(ref.target));
  if(!allowed||ref.query!==`?v=${result.versions[ref.target]}`)versioned.push(`${module.site}: ${ref.path}${ref.query}`);
}
assert.deepEqual(versioned,[],'Imports must not carry ?v= (the import map adds it); only worker stamps from the versions file are allowed');
for(const page of pages.values())if(page.refs.some(ref=>ref.isModule))assert.match(page.source,/<script type="importmap" data-module-versions>/,`${page.site} loads modules but has no import map`);

// 4. Merge-friendly layout (3 Oct 2026): one module per line, sorted by path, a blank line between entries,
//    and every version equal to module-versions.json. Two PRs that bump different modules then merge cleanly.
const layoutProblems=[];
function checkEntries(label,lines,parse){
  const sites=[];
  lines.forEach((line,index)=>{
    if(index%2===1){if(line!=='')layoutProblems.push(`${label}: line ${index+1} between entries must be blank`);return;}
    const last=index===lines.length-1,row=parse(line);
    if(!row){layoutProblems.push(`${label}: not one module per line: ${line.slice(0,80)}`);return;}
    if(line.endsWith(',')===last)layoutProblems.push(`${label}: ${row.site} ${last?'must not':'must'} end with a comma`);
    if(result.versions[row.site]!==row.version)layoutProblems.push(`${label}: ${row.site} version ${row.version} does not match module-versions.json (${result.versions[row.site]})`);
    sites.push(row.site);
  });
  if(lines.length%2===0)layoutProblems.push(`${label}: entries must alternate with blank lines`);
  const sorted=[...sites].sort((a,b)=>a<b?-1:a>b?1:0);
  if(sites.join('\n')!==sorted.join('\n'))layoutProblems.push(`${label}: modules are not sorted by path`);
  return sites.length;
}
for(const page of pages.values()){
  const match=page.source.match(/<script type="importmap" data-module-versions>\n\{"imports":\{\n([\s\S]*?)\n\}\}\n  <\/script>/);
  if(!/<script type="importmap" data-module-versions>/.test(page.source))continue;
  if(!match){layoutProblems.push(`${page.site}: import map is not in the one-module-per-line layout`);continue;}
  checkEntries(page.site,match[1].split('\n'),line=>{const m=line.match(/^"([^"]+)":"([^"?]+)\?v=([0-9a-f]+)",?$/);return m&&m[1]===m[2]?{site:m[1],version:m[3]}:null;});
}
const versionsBlock=current.match(/\n "modules": \{\n([\s\S]*?)\n \},\n/);
if(!versionsBlock)layoutProblems.push('module-versions.json: modules are not in the one-module-per-line layout');
else assert.equal(checkEntries('module-versions.json',versionsBlock[1].split('\n'),line=>{const m=line.match(/^  "([^"]+)": "([0-9a-f]+)",?$/);return m&&{site:m[1],version:m[2]};}),Object.keys(result.versions).length,'module-versions.json lists every module');
assert.deepEqual(layoutProblems,[],'Import maps and module-versions.json must list one module per line, sorted, blank-line separated, matching the versions file');
// The check itself: an unsorted list, a missing blank line, a wrong version and a squashed map are all reported.
{
  const [a,b]=Object.keys(result.versions).sort((x,y)=>x<y?-1:x>y?1:0),row=(site,version,comma)=>`"${site}":"${site}?v=${version}"${comma?',':''}`;
  const parse=line=>{const m=line.match(/^"([^"]+)":"([^"?]+)\?v=([0-9a-f]+)",?$/);return m&&m[1]===m[2]?{site:m[1],version:m[3]}:null;};
  const problems=lines=>{layoutProblems.length=0;checkEntries('self-test',lines,parse);return layoutProblems.length;};
  assert.equal(problems([row(a,result.versions[a],true),'',row(b,result.versions[b],false)]),0,'Layout check accepts a good map');
  assert.ok(problems([row(b,result.versions[b],true),'',row(a,result.versions[a],false)])>0,'Layout check reports an unsorted map');
  assert.ok(problems([row(a,result.versions[a],true),row(b,result.versions[b],false)])>0,'Layout check reports a missing blank line');
  assert.ok(problems([row(a,'0000000000',true),'',row(b,result.versions[b],false)])>0,'Layout check reports a version that differs from module-versions.json');
  assert.ok(problems([`${row(a,result.versions[a],true)}${row(b,result.versions[b],false)}`])>0,'Layout check reports two modules on one line');
}

// 3: browser.
let chromium;
try{({chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright'));}
catch{console.log('SINGLE_MODULE_URLS=STATIC-PASS browser part NOT RUN: Playwright missing');process.exit(0);}
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
  const path=decodeURIComponent(new URL(req.url,'http://x').pathname),file=resolve(ROOT,'.'+path+(path.endsWith('/')?'index.html':''));
  if(!file.startsWith(ROOT+sep)){res.writeHead(403).end();return;}
  try{res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});res.end(await readFile(file));}catch{res.writeHead(404).end();}
});
let browser;
try{
  try{browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});}
  catch(error){if(/Executable doesn't exist/.test(error.message)){console.log('SINGLE_MODULE_URLS=STATIC-PASS browser part NOT RUN: Chromium missing');process.exit(0);}throw error;}
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const origin=`http://127.0.0.1:${server.address().port}`;
  // Classic scripts keep their own key; they are still checked for a single URL.
  const classic=new Set([...pages.values()].flatMap(page=>page.refs.filter(ref=>ref.tag==='script'&&!ref.isModule).map(ref=>ref.target)));
  const toolPages=[...pages.keys()].filter(site=>/^\/astrix-app\/(index\.html|pages\/[^/]+\/(?:[^/]+\/)?index\.html)$/.test(site)&&!/guardian-workspace-v1|shooting-range-test/.test(site));
  const report=[];
  for(const site of toolPages){
    const context=await browser.newContext({viewport:{width:1600,height:900}}),urls=new Map();
    // Signed out and offline: only this local server answers.
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    context.on('request',request=>{const url=new URL(request.url());if(url.origin!==origin||!/\.m?js$/.test(url.pathname))return;if(!urls.has(url.pathname))urls.set(url.pathname,new Set());urls.get(url.pathname).add(url.search);});
    const page=await context.newPage();
    await page.goto(origin+site.replace(/index\.html$/,''),{waitUntil:'load'}).catch(()=>{});
    await page.waitForTimeout(2500);
    const duplicates=[...urls].filter(([,set])=>set.size>1).map(([path,set])=>`${path} ${[...set].join(' | ')}`);
    const unversioned=[...urls].filter(([path,set])=>result.versions[path]&&!classic.has(path)&&[...set].some(search=>search!==`?v=${result.versions[path]}`)).map(([path,set])=>`${path} ${[...set].join(' | ')}`);
    report.push({site,files:urls.size,duplicates,unversioned});
    await context.close();
  }
  const failed=report.filter(row=>row.duplicates.length||row.unversioned.length);
  assert.deepEqual(failed.map(row=>({site:row.site,duplicates:row.duplicates,unversioned:row.unversioned})),[],'Every JS file must be requested under one versioned URL');
  console.log(`SINGLE_MODULE_URLS=PASS ${Object.keys(result.versions).length} modules; ${report.map(row=>`${row.site.replace('/astrix-app/','').replace('/index.html','')||'app'} ${row.files}`).join(', ')} JS files, each under one versioned URL`);
}finally{
  await browser?.close();server.close();
}
