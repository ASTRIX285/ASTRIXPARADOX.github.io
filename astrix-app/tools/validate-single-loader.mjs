import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const read=path=>readFileSync(resolve(root,path),'utf8');
const portal='astrix-app/shared/astrix-portal-loader.js';
const files=execFileSync('git',['ls-files','*.html'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(path=>!path.startsWith('ASTRIX285.github.io/'));
// JS module versions come from module-versions.json (one URL per module, 3 Oct 2026).
const breachUrl=`/astrix-app/shared/astrix-breach-loader.mjs?v=${JSON.parse(read('astrix-app/module-versions.json')).modules['/astrix-app/shared/astrix-breach-loader.mjs']}`;
// The generated import map lists module paths only; it loads nothing by itself.
const withoutImportMap=html=>html.replace(/<script type="importmap" data-module-versions>[\s\S]*?<\/script>/,'');
const componentPattern=/<(?:div|section|main|aside|dialog|output)\b[^>]*(?:data-page-loader|(?:class|id)=["'][^"']*(?:apx-gate|apx-breach|forgeGenerationLoader|(?:[\w-]+-)?(?:loader|preloader|loading-gate|loading-screen|loading-overlay|splash))(?:\s|["']))/gi;
function assertOneLoader(html,label){
 const controllers=[...html.matchAll(/<script\b[^>]*src=["'][^"']*astrix-portal-loader\.js[^"']*["']/g)].length;
 const extra=[...html.matchAll(componentPattern)].length;
 assert.equal(controllers,1,`${label}: must have exactly one portal controller`);
 assert.equal(extra,0,`${label}: additional loader component`);
 // A preload fetches bytes only. No executable breach entry point is allowed.
 const preload=`<link rel="modulepreload" href="${breachUrl}">`;
 assert.doesNotMatch(withoutImportMap(html).replace(preload,''),/astrix-breach-loader|tool-intro-panel|apx-navigation-progress/,`${label}: retired loader`);
}
function isTool(file){return file.startsWith('astrix-app/')&&!file.startsWith('astrix-app/pages/sign-in/');}
function assertNoLoader(html,label){
 assert.doesNotMatch(html,/astrix-portal-loader|ForgeLoader|APX_AUTO_READY|apx-booting|apx-loading/,`${label}: public navigation must not load or call the tool portal`);
 assert.equal([...html.matchAll(componentPattern)].length,0,`${label}: public loader component`);
}
let checked=0,publicPages=0;
for(const file of files){
 const html=read(file);
 if(!/<head\b/i.test(html)||/http-equiv=["']refresh/i.test(html))continue;
 const tool=isTool(file);
 if(tool){
  assertOneLoader(html,file);
  // The X entry skin needs no three.js (28 Sep 2026), so only its own module is preloaded.
  assert.doesNotMatch(html,/vendor\/three\/three\.module\.js/,`${file}: three.js is no longer preloaded`);
  for(const url of [breachUrl]){
   const tag=`<link rel="modulepreload" href="${url}">`;
   assert.equal(html.split(tag).length-1,1,`${file}: exactly one local module preload`);
   assert.ok(html.indexOf(tag)<html.indexOf('astrix-portal-loader.js'),`${file}: preload before controller`);
  }
  checked++;
 }
 else{assertNoLoader(html,file);publicPages++;}
 const sources=[...html.matchAll(/<script\b[^>]*src=["']([^"']+)["']/g)].map(row=>row[1].replaceAll('&amp;','&'));
 const visited=new Set();
 function inspect(url,base){
  if(/^(?:https?:)?\/\//.test(url))return;
  const path=resolve(url.startsWith('/')?root:base,url.replace(/^\//,'').split('?')[0]);
  if(!path.startsWith(root)||visited.has(path)||!existsSync(path)||!/[.]m?js$/.test(path))return;
  visited.add(path);const source=readFileSync(path,'utf8');
  if(!tool)assertNoLoader(source,path);
  if(path!==resolve(root,portal)){
   assert.equal([...source.matchAll(componentPattern)].length,0,`${file}: second loader injected by ${path.slice(root.length)}`);
   assert.doesNotMatch(source,/astrix-breach-loader|apx-navigation-progress|tool-intro-panel/);
  }
  for(const match of source.matchAll(/(?:from\s*|import\s*\(?|new URL\(\s*)["']([^"']+\.(?:mjs|js)(?:\?[^"']*)?)["']/g))inspect(match[1],dirname(path));
 }
 for(const source of sources)inspect(source,dirname(resolve(root,file)));
}
const simple='<script src="/astrix-app/shared/astrix-portal-loader.js"></script>';
assertNoLoader(read('scripts/build_clips.py'),'generated Clips template');
assert.throws(()=>assertNoLoader(simple,'public controller'),/public navigation/);
assert.throws(()=>assertNoLoader('<script>ForgeLoader.mount()</script>','public initializer'),/public navigation/);
assert.throws(()=>assertOneLoader(simple+'<script type="module" src="/astrix-app/shared/astrix-breach-loader.mjs"></script>','executable breach'),/retired loader/);
assert.throws(()=>assertOneLoader(simple+simple,'duplicate script'),/exactly one/);
assert.throws(()=>assertOneLoader(simple+'<div class="second-loader"></div>','duplicate component'),/additional loader/);
assert.throws(()=>assertOneLoader(simple+'<section data-page-loader></section>','duplicate component'),/additional loader/);

// Exercise the real controller, including a duplicated script, cache hints,
// repeated mount calls, late callbacks, failure recovery and tool auto-ready.
function harness({auto=false,skip=false,referrer='https://astrixparadox.com/tools/',navigationType='navigate'}={}){
 let mounted=0,ready=0,reloads=0;const listeners=new Map(),elements=new Map();
 const classes=()=>{const set=new Set();return {add:x=>set.add(x),remove:x=>set.delete(x),contains:x=>set.has(x),toggle:(x,v)=>v?set.add(x):set.delete(x)};};
 const node=()=>({classList:classes(),dataset:{},style:{setProperty(){}},addEventListener(){},removeEventListener(){},remove(){},querySelector(selector){if(!elements.has(selector))elements.set(selector,node());return elements.get(selector);}});
 let gate;const document={referrer,readyState:'complete',documentElement:{classList:classes()},body:{classList:classes(),appendChild:n=>{gate=n;mounted++;}},fonts:{ready:Promise.resolve()},querySelector:selector=>selector==='.apx-gate'?gate:null,querySelectorAll:()=>[],createElement:()=>({set innerHTML(value){},get firstElementChild(){return node();}}),addEventListener(){},dispatchEvent:event=>{if(event.type==='forge:portal-ready')ready++;}};
 const window={performance:{getEntriesByType:()=>[{type:navigationType}]},APX_AUTO_READY:auto,APX_SKIP_PORTAL:skip,location:{origin:'https://astrixparadox.com',reload(){reloads++;},pathname:'/astrix-app/pages/journey/'},addEventListener:(name,fn)=>listeners.set(name,fn)};
 const context=vm.createContext({URL,window,document,CustomEvent:class{constructor(type){this.type=type;}},Promise,setTimeout:()=>1,clearTimeout(){},requestAnimationFrame:fn=>fn(),getComputedStyle:()=>({display:'block'}),sessionStorage:{getItem:()=>null}});
 vm.runInContext(read(portal),context);vm.runInContext(read(portal),context);
 return {loader:window.ForgeLoader,elements,mounted:()=>mounted,ready:()=>ready,reloads:()=>reloads};
}
for(const skip of [false,true]){
 const h=harness({skip});assert.equal(h.mounted(),1);h.loader.mount();h.loader.requireData();assert.equal(h.mounted(),1);
 h.loader.blocked('Live data unavailable');assert.equal(h.mounted(),1);
 h.elements.get('.apx-retry-button').onclick();assert.equal(h.reloads(),1);
 h.elements.get('.apx-continue-button').onclick();assert.equal(h.loader.completed,true);assert.equal(h.ready(),1);
 h.loader.done();h.loader.mount();h.loader.blocked('Late background failure');h.loader.authRequired('/connect');assert.equal(h.mounted(),1);assert.equal(h.ready(),1);
}
const automaticTool=harness({auto:true});for(let i=0;i<8;i++)await Promise.resolve();assert.equal(automaticTool.loader.completed,true);assert.equal(automaticTool.mounted(),1);
for(const options of [
 {referrer:''},
 {referrer:'https://astrixparadox.com/astrix-app/pages/vault/'},
 {referrer:'https://other.example/tools/'},
 {navigationType:'reload'},
 {navigationType:'back_forward'}
]){
 const h=harness(options);h.loader.mount();h.loader.requireData();
 assert.equal(h.mounted(),0,'Only a fresh Tools entry may mount an animation');
 h.loader.done();h.loader.done();assert.equal(h.ready(),1,'A transfer without a loader still reports readiness once');
}
assert.doesNotMatch(read(portal),/holdForBreach|hasWarmPage/);
assert.match(read(portal),/module.createBreach/,'The one tool loader must use the approved entry skin module');
assert.match(read(portal),/apx-retry-button apx-recovery-primary" type="button">Retry</);assert.match(read(portal),/>Continue without live data</);
console.log(`SINGLE_LOADER=PASS tool-pages=${checked} public-pages-without-loader=${publicPages} duplicate-components-rejected lifecycle-once recovery-preserved`);
