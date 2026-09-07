import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const ROOT=new URL('../../',import.meta.url);
const read=path=>readFile(new URL(path,ROOT),'utf8');
const pages={
  'Build library':'astrix-app/index.html',
  'Guardian Journey':'astrix-app/components/guardian-workspace/guardian-workspace.html',
  'Guardian Main':'astrix-app/pages/guardian-workspace-v2/index.html',
  'Build Space':'astrix-app/pages/guardian-workspace-v2/paradox-build-space/index.html',
  'Shooting Range':'astrix-app/pages/guardian-workspace-v2/shooting-range-test/index.html',
  'Journey':'astrix-app/pages/journey/index.html',
  'Mission Reports':'astrix-app/pages/mission-reports/index.html',
  'Vault':'astrix-app/pages/vault/index.html',
  'Forge Loader':'astrix-app/pages/forge-loader/index.html',
  'Loadout':'astrix-app/pages/loadout/index.html'
};
const operationsHtml=await read('index.html');
const [portalCss,portalJs,mainProgress,buildModule,mainHtml,buildHtml,appModule,subclassModule,journeyModule,journeyPageModule,journeyMaps]=await Promise.all([
  read('astrix-app/shared/astrix-portal-loader.css'),
  read('astrix-app/shared/astrix-portal-loader.js'),
  read('astrix-app/pages/guardian-workspace-v2/guardian-portal-progress.mjs'),
  read('astrix-app/pages/guardian-workspace-v2/paradox-build-space/paradox-build-space.mjs'),
  read(pages['Guardian Main']),read(pages['Build Space']),read('astrix-app/app.js'),read('astrix-app/subclass-filter-ui.js'),
  read('astrix-app/components/guardian-workspace/guardian-workspace.mjs'),
  read('astrix-app/pages/journey/journey.mjs'),
  read('astrix-app/pages/journey/journey-location-maps.mjs')
]);

for(const [label,path] of Object.entries(pages)){
  const html=await read(path);
  assert.match(html,/astrix-portal-loader\.css/,`${label} must link the shared portal stylesheet`);
  assert.match(html,/window\.APX_LOGO=/,`${label} must configure the real site logo`);
  assert.match(html,/astrix-portal-loader\.js/,`${label} must load the shared portal controller early`);
}
assert.doesNotMatch(operationsHtml,/astrix-portal-loader\.(?:css|js)|window\.APX_LOGO=/,'Public homepage must not mount the tool portal loader');

assert.match(portalCss,/body\.apx-loading\{overflow:hidden!important\}/,'Portal must lock body scroll above page-specific layout rules');
assert.match(portalCss,/@media\(prefers-reduced-motion:reduce\)/,'Portal must freeze animation for reduced motion');
assert.match(portalJs,/role="status" aria-live="polite"/,'Portal must expose accessible live status');
assert.match(portalJs,/pendingPct=Math\.max\(pendingPct,v\)/,'Progress must remain monotonic across early page milestones');
assert.match(portalJs,/pendingDone=true/,'Render completion must queue safely before DOM mount');
assert.match(portalJs,/APX_SKIP_PORTAL===true[\s\S]*?skipped:true/,'Cached Guardian return must be able to bypass a second full portal sequence');
assert.match(portalJs,/authRequired:authRequired/,'Portal must expose a dedicated Bungie authentication state');
assert.match(portalJs,/function done\(\)\{if\(pendingAuthUrl\)return/,'Portal must not reveal an unauthenticated application shell');
assert.match(portalCss,/\.apx-auth-panel/,'Portal must render the full-screen Bungie authentication panel');
assert.match(portalCss,/astrix-paradox-map-placeholder-4k\.webp/,'Portal must use the ASTRIX PARADOX map artwork');
assert.match(portalCss,/--apx-loader-crimson:#d3202f/,'Portal must use the approved bright crimson treatment');
assert.match(portalCss,/--apx-loader-gold:#ffd36a/,'Portal must use the approved bright gold treatment');
assert.doesNotMatch(portalCss,/--apx-(?:cyan|blue|glow|deep):/,'Portal must not retain the old blue palette');
assert.match(portalJs,/function ready\(root\)[\s\S]*?document\.fonts[\s\S]*?querySelectorAll\('img'\)[\s\S]*?requestAnimationFrame/,'Portal ready state must wait for fonts, visible images and final paint');

assert.doesNotMatch(mainHtml,/guardian-loading-gate|guardianLoadingProgress|data-lit-edges/,'Main legacy red-diamond gate must be removed');
assert.doesNotMatch(buildHtml,/build-loading-gate|buildLoadingProgress|data-lit-edges/,'Build legacy hex gate must be removed');
assert.match(mainProgress,/forge:guardian-render-complete',\(\)=>\{if\(!isBuildSpace\)finishAfterPaint/,'Character completion must not reveal Build Forge before its own render completes');
assert.match(mainProgress,/document\.querySelectorAll\('\.scene\.immersive'\)/,'Portal completion must inspect the shared scene background');
assert.match(mainProgress,/image\.addEventListener\('load',async\(\)=>\{try\{await image\.decode\(\);\}/,'Portal completion must wait for CSS background decoding');
assert.match(mainProgress,/const BACKGROUND_DECODE_TIMEOUT_MS=5\*1000;[\s\S]*?const timeout=setTimeout\(finish,BACKGROUND_DECODE_TIMEOUT_MS\)/,'A stalled decorative background must not strand Character and Build Forge at the manifest milestone');
assert.match(mainProgress,/await manifestReady;[\s\S]*?await sceneBackgroundReady;/,'Portal must retain its cover until manifest and scene background are both ready');
assert.match(mainProgress,/else setStage\('start'\)/,'Main portal must remain gated at the shared start stage until Bungie authentication completes');
assert.match(mainProgress,/currentSession=window\.FORGE_BUNGIE_SESSION[\s\S]*?guardianRenderComplete/,'Main portal must reconcile a session or render that completed before listener registration');
assert.ok(mainHtml.indexOf('guardian-portal-progress.mjs')<mainHtml.indexOf('guardian-workspace-v2.mjs'),'Main progress listener must load before Guardian startup');
assert.match(mainHtml,/astrix:guardian-fast-return:v1/,'Main must consume the Build-to-Guardian fast-return marker before the portal mounts');
assert.match(buildHtml,/astrix:guardian-fast-return:v1/,'Build must consume the authenticated Main-to-Build fast-return marker before the portal mounts');
assert.match(buildModule,/markGuardianFastReturn\(\)/,'Build Back must preserve the authenticated Guardian session return path');
assert.doesNotMatch(mainProgress,/window\.addEventListener\('load'/,'Main progress must not use the generic window load event');
assert.match(buildModule,/const ready=Boolean\(build\),status=ready\?'ready':'pending'/,'An empty initial Build render must remain pending while the live profile resolves');
assert.match(buildModule,/emitLoad\('render',ready\?LOAD_STAGES\.READY:LOAD_STAGES\.SNAPSHOT,label,status\)/,'Only a populated Build render may report the ready milestone');
assert.match(mainHtml,/guardian-portal-progress\.mjs\?v=20260906-all-page-data-1/,'Character must load the prepared page payload progress module without a stale cache');
assert.match(buildHtml,/paradox-build-space\.mjs\?v=20260906-live-equip-1/,'Build Forge must refresh its parent module for the repaired Apply and review layout');
assert.match(buildModule,/guardian-portal-progress\.mjs\?v=20260906-all-page-data-1/,'Build must load the prepared page payload progress module without a stale cache');
assert.match(buildModule,/reportPreparedPageStage\(preparedStage,'build-forge'/,'Build real milestones must update the shared prepared page controller');

assert.match(appModule,/forge:build-catalogue-rendered/,'Build library must publish catalogue render completion');
assert.match(subclassModule,/forge:subclass-filter-rendered/,'Build library must publish subclass-filter render completion');
assert.match(journeyModule,/renderGuardian\(root, state\);[\s\S]*?ForgeLoader\?\.set\(88\)/,'Guardian Journey must report progress after its state is painted');
assert.match(journeyPageModule,/function waitForHeroCards\(\)[\s\S]*?forge:hero-cards-render-complete/,'Journey loader must wait for the header character cards');
assert.match(journeyPageModule,/function waitForJourneyAtmosphere\(\)[\s\S]*?FORGE_LOCATION_VISUALS[\s\S]*?image\.decode/,'Journey loader must decode the active destination atmosphere');
assert.match(journeyPageModule,/await Promise\.all\(\[[\s\S]*?waitWithin\(heroCardsReady,JOURNEY_BOOTSTRAP_UI_WAIT_MS\)[\s\S]*?waitWithin\(mapReady,JOURNEY_BOOTSTRAP_UI_WAIT_MS\)[\s\S]*?waitWithin\(waitForJourneyAtmosphere\(\),JOURNEY_BOOTSTRAP_UI_WAIT_MS\)[\s\S]*?\]\)/,'Journey must settle every independently rendered surface behind bounded waits');
assert.match(journeyPageModule,/function finishJourneyLoader\(root=document\)[\s\S]*?ForgeLoader\.ready\(root\)[\s\S]*?finishJourneyLoader\(document\)/,'Journey final readiness must include the header and body-level artwork');
assert.doesNotMatch(journeyPageModule,/ForgeLoader\.ready\(dashboard\)/,'Journey must not limit loader readiness to the dashboard subtree');
assert.match(journeyMaps,/forge:journey-location-map-render-complete/,'Journey location map must publish a durable render-complete event');
assert.match(journeyMaps,/if\(image\.complete\)queueMicrotask\(\(\)=>finish\(image\.naturalWidth>0\?'ready':'unavailable'\)\)/,'Journey map completion must reconcile cached images');
assert.match(journeyMaps,/try\{if\(status==='ready'&&image\.decode\)await image\.decode\(\);\}catch\{\}/,'Journey map completion must wait for image decoding');

console.log('GLOBAL_PORTAL_SINGLE_OWNER=PASS');
console.log('GLOBAL_PORTAL_ALL_DATA_PAGES=PASS');
console.log('GLOBAL_PORTAL_PUBLIC_HOMEPAGE_BYPASS=PASS');
console.log('GLOBAL_PORTAL_REAL_RENDER_COMPLETION=PASS');
console.log('GLOBAL_PORTAL_ACCESSIBILITY_MOTION=PASS');

assert.match(mainProgress,/buildRenderStatus==='pending'&&profileSettled/,'An empty initial render must not release a profile still loading.');
assert.match(mainProgress,/if\(!isBuildSpace\|\|!buildHeaderSettled\(\)\)return/,'Build readiness must include settled character cards.');
assert.match(mainProgress,/if\(revision===finishRevision\)loader\?\.done\(\)/,'A superseded render cannot dismiss the loader.');
assert.match(buildHtml,/window\.APX_SKIP_PORTAL=false/,'Build entry must retain its loader even after a fast-return marker.');

// Exercise the actual progress controller through asynchronous event ordering.
const {runInNewContext}=await import('node:vm');
async function loaderHarness({stalledBackground=false,isBuildSpace=true}={}){
  const documentEvents=new Map(),windowEvents=new Map(),frames=[];let headerPending=true,completed=0;
  const document={querySelector:selector=>selector==='.build-space'?(isBuildSpace?{}:null):selector.includes('is-pending')&&headerPending?{}:null,querySelectorAll:selector=>stalledBackground&&selector==='.scene.immersive'?[{}]:[],documentElement:{dataset:{}},baseURI:'https://sandbox.astrixparadox.com/',addEventListener:(name,fn)=>documentEvents.set(name,fn)};
  const window={ForgeLoader:{set(){},status(){},done(){completed++;}},addEventListener:(name,fn)=>windowEvents.set(name,fn)};
  const source=mainProgress.replace(/^import .*;\n/gm,'').replace('const BACKGROUND_DECODE_TIMEOUT_MS=5*1000;','const BACKGROUND_DECODE_TIMEOUT_MS=1;');
  class HarnessImage{addEventListener(){}set src(value){this.currentSrc=value;}}
  const PREPARED_PAGE_STAGES={start:{percent:8,label:'Preparing verified Guardian data'},session:{percent:18,label:'Checking Bungie session'},request:{percent:42,label:'Loading prepared bulk manifest and Guardian data'},join:{percent:72,label:'Joining verified Guardian data to the prepared bulk manifest'},render:{percent:92,label:'Rendering verified page data'},ready:{percent:96,label:'Page ready'}};
  runInNewContext(source,{window,document,guardianManifest:{ready:()=>Promise.resolve()},PREPARED_PAGE_STAGES,PORTAL_TRANSITION_KEY:'test',sessionStorage:{getItem:()=>null,removeItem(){}},requestAnimationFrame:fn=>frames.push(fn),queueMicrotask,setTimeout,clearTimeout,URL,Image:HarnessImage,getComputedStyle:()=>({backgroundImage:stalledBackground?'url("/stalled-scene.webp")':'none'})});
  return {emit:(name,detail={})=>documentEvents.get(name)?.({detail}),settleHeader:()=>{headerPending=false;},done:()=>completed,flush:async()=>{for(let i=0;i<8;i++){await new Promise(resolve=>setImmediate(resolve));frames.splice(0).forEach(fn=>fn());}}};
}
const loading=await loaderHarness();loading.emit('forge:build-render-complete',{status:'pending'});await loading.flush();assert.equal(loading.done(),0,'Empty initial build must stay covered.');
loading.settleHeader();loading.emit('forge:bungie-character-roster');loading.emit('forge:guardian-loadout-context');await loading.flush();assert.equal(loading.done(),0,'Resolved profile still needs its populated build render.');
loading.emit('forge:build-render-complete',{status:'ready'});await loading.flush();assert.equal(loading.done(),1,'Ready build plus settled header releases the loader.');
const delayedHeader=await loaderHarness();delayedHeader.emit('forge:build-render-complete',{status:'ready'});await delayedHeader.flush();assert.equal(delayedHeader.done(),0);delayedHeader.settleHeader();delayedHeader.emit('forge:bungie-character-roster');await delayedHeader.flush();assert.equal(delayedHeader.done(),1);
const failed=await loaderHarness();failed.emit('forge:build-render-complete',{status:'pending'});failed.settleHeader();failed.emit('forge:guardian-error');await failed.flush();assert.equal(failed.done(),1,'A terminal profile error must expose recovery.');
const stale=await loaderHarness();stale.settleHeader();stale.emit('forge:build-render-complete',{status:'ready'});stale.emit('forge:guardian-loading');await stale.flush();assert.equal(stale.done(),0,'A new load must cancel old completion.');
const stalledBackground=await loaderHarness({stalledBackground:true});stalledBackground.settleHeader();stalledBackground.emit('forge:build-render-complete',{status:'ready'});await new Promise(resolve=>setTimeout(resolve,10));await stalledBackground.flush();assert.equal(stalledBackground.done(),1,'A decorative background that never loads or errors must release a genuinely ready Build Forge after the bounded decode wait.');
const stalledCharacterBackground=await loaderHarness({stalledBackground:true,isBuildSpace:false});stalledCharacterBackground.emit('forge:guardian-render-complete');await new Promise(resolve=>setTimeout(resolve,10));await stalledCharacterBackground.flush();assert.equal(stalledCharacterBackground.done(),1,'A decorative background that never loads or errors must release a genuinely rendered Character page after the bounded decode wait.');
console.log('BUILD_LOADER_EVENT_ORDER=PASS');
