import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import vm from 'node:vm';
const root=new URL('../../',import.meta.url).pathname;
const read=path=>readFileSync(resolve(root,path),'utf8');
const portal='astrix-app/shared/astrix-portal-loader.js';
const files=execFileSync('git',['ls-files','*.html'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(path=>!path.startsWith('ASTRIX285.github.io/'));
const componentPattern=/<(?:div|section|main|aside|dialog|output)\b[^>]*(?:data-page-loader|(?:class|id)=["'][^"']*(?:apx-gate|apx-breach|forgeGenerationLoader|(?:[\w-]+-)?(?:loader|preloader|loading-gate|loading-screen|loading-overlay|splash))(?:\s|["']))/gi;
function assertOneLoader(html,label){
 const controllers=[...html.matchAll(/<script\b[^>]*src=["'][^"']*astrix-portal-loader\.js[^"']*["']/g)].length;
 const extra=[...html.matchAll(componentPattern)].length;
 assert.equal(controllers,1,`${label}: must have exactly one portal controller`);
 assert.equal(extra,0,`${label}: additional loader component`);
 // A preload fetches bytes only. No executable breach entry point is allowed.
 const preload='<link rel="modulepreload" href="/astrix-app/shared/astrix-breach-loader.mjs?v=20260927-single-skin-1">';
 assert.doesNotMatch(html.replace(preload,''),/astrix-breach-loader|tool-intro-panel|apx-navigation-progress/,`${label}: retired loader`);
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
  for(const url of ['/astrix-app/shared/astrix-breach-loader.mjs?v=20260927-single-skin-1','/astrix-app/vendor/three/three.module.js']){
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
function harness({auto=false,skip=false}={}){
 let mounted=0,ready=0,reloads=0;const listeners=new Map(),elements=new Map();
 const classes=()=>{const set=new Set();return {add:x=>set.add(x),remove:x=>set.delete(x),contains:x=>set.has(x),toggle:(x,v)=>v?set.add(x):set.delete(x)};};
 const node=()=>({classList:classes(),style:{setProperty(){}},addEventListener(){},removeEventListener(){},remove(){},querySelector(selector){if(!elements.has(selector))elements.set(selector,node());return elements.get(selector);}});
 let gate;const document={readyState:'complete',documentElement:{classList:classes()},body:{classList:classes(),appendChild:n=>{gate=n;mounted++;}},fonts:{ready:Promise.resolve()},querySelector:selector=>selector==='.apx-gate'?gate:null,querySelectorAll:()=>[],createElement:()=>({set innerHTML(value){},get firstElementChild(){return node();}}),addEventListener(){},dispatchEvent:event=>{if(event.type==='forge:portal-ready')ready++;}};
 const window={APX_AUTO_READY:auto,APX_SKIP_PORTAL:skip,location:{reload(){reloads++;},pathname:'/astrix-app/pages/journey/'},addEventListener:(name,fn)=>listeners.set(name,fn)};
 const context=vm.createContext({window,document,CustomEvent:class{constructor(type){this.type=type;}},Promise,setTimeout:()=>1,clearTimeout(){},requestAnimationFrame:fn=>fn(),getComputedStyle:()=>({display:'block'}),sessionStorage:{getItem:()=>null}});
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
assert.doesNotMatch(read(portal),/holdForBreach|hasWarmPage/);
assert.match(read(portal),/module.createBreach/,'The one tool loader must use the approved glass breach skin');
assert.match(read(portal),/RETRY LIVE DATA/);assert.match(read(portal),/CONTINUE WITHOUT LIVE DATA/);
console.log(`SINGLE_LOADER=PASS tool-pages=${checked} public-pages-without-loader=${publicPages} duplicate-components-rejected lifecycle-once recovery-preserved`);
