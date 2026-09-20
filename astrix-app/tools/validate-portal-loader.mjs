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
// Every destination must opt into the same prepared navigation asset generation.
for(const label of ['Guardian Main','Build Space','Journey','Mission Reports','Vault','Forge Loader','Loadout']){
  const html=await read(pages[label]);
  for(const resource of ['astrix-portal-loader.css','astrix-portal-loader.js','astrix-destination-ribbon.js']){
    const url=html.match(new RegExp(resource.replaceAll('.', '\\.')+'\\?[^"<>]+'))?.[0];
    assert.ok(url?.includes('ready=20260920-1'),`${label} must refresh ${resource} for prepared navigation`);
  }
}
assert.doesNotMatch(operationsHtml,/astrix-portal-loader\.(?:css|js)|window\.APX_LOGO=/,'Public homepage must not mount the tool portal loader');

assert.match(portalCss,/body\.apx-loading\{overflow:hidden!important\}/,'Portal must lock body scroll above page-specific layout rules');
assert.match(portalCss,/@media\(prefers-reduced-motion:reduce\)/,'Portal must freeze animation for reduced motion');
assert.match(portalJs,/role="status" aria-live="polite"/,'Portal must expose accessible live status');
assert.match(portalJs,/pendingPct=Math\.max\(pendingPct,v\)/,'Progress must remain monotonic across early page milestones');
assert.match(portalJs,/pendingDone=true/,'Render completion must queue safely before DOM mount');
assert.match(portalJs,/APX_SKIP_PORTAL===true[\s\S]*?skipped:true/,'Cached Guardian return must be able to bypass a second full portal sequence');
assert.match(portalJs,/authRequired:authRequired/,'Portal must expose a dedicated Bungie authentication state');
assert.match(portalJs,/function done\(\)\{if\(pendingAuthUrl\|\|pendingBlockedMessage\)return/,'Portal must not reveal an unauthenticated or unrendered application shell');
assert.match(portalJs,/SLOW_LOAD_NOTICE_MS=2800,ASSET_WAIT_MS=1800/,'Every data-page portal must report a slow verified-data load before the three-second target');
assert.match(portalJs,/if\(pendingAuthUrl\|\|pendingBlockedMessage\|\|pendingDone\)return;[\s\S]*?Still loading verified Guardian data[\s\S]*?SLOW_LOAD_NOTICE_MS/,'The three-second notice must never dismiss the verified-data gate');
assert.doesNotMatch(portalJs,/SLOW_LOAD_NOTICE_MS[\s\S]{0,240}?done\(\)/,'The slow-load notice must not expose an empty page.');
assert.match(portalCss,/\.apx-auth-panel/,'Portal must render the full-screen Bungie authentication panel');
assert.match(portalCss,/\.apx-failure-panel/,'Portal must render an actionable full-screen live-data failure panel');
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
assert.match(mainProgress,/const manifestReady=guardianManifest\.cached\(\)/,'Portal completion may inspect only the cached manifest state on the critical path');
assert.doesNotMatch(mainProgress,/await manifestReady|await sceneBackgroundReady/,'Portal completion must not block interaction on full manifest indexing or decorative imagery');
assert.match(mainProgress,/Promise\.allSettled\(\[manifestReady,sceneBackgroundReady\]\)/,'Non-critical manifest and background work must continue after the page becomes usable');
assert.match(mainProgress,/else setStage\('start'\)/,'Main portal must remain gated at the shared start stage until Bungie authentication completes');
assert.match(mainProgress,/forge:guardian-error[\s\S]*?loader\?\.blocked\?\.\(message\)/,'A terminal live profile error must remain behind the portal with a retry action.');
assert.match(mainProgress,/currentSession=window\.FORGE_BUNGIE_SESSION[\s\S]*?guardianRenderComplete/,'Main portal must reconcile a session or render that completed before listener registration');
assert.ok(mainHtml.indexOf('guardian-portal-progress.mjs')<mainHtml.indexOf('guardian-workspace-v2.mjs'),'Main progress listener must load before Guardian startup');
assert.match(mainHtml,/astrix:guardian-fast-return:v1/,'Main must consume the Build-to-Guardian fast-return marker before the portal mounts');
assert.match(buildHtml,/astrix:guardian-fast-return:v1/,'Build must consume the authenticated Main-to-Build fast-return marker before the portal mounts');
assert.match(buildModule,/markGuardianFastReturn\(\)/,'Build Back must preserve the authenticated Guardian session return path');
assert.doesNotMatch(mainProgress,/window\.addEventListener\('load'/,'Main progress must not use the generic window load event');
assert.match(buildModule,/const ready=Boolean\(build\),status=ready\?'ready':'pending'/,'An empty initial Build render must remain pending while the live profile resolves');
assert.match(buildModule,/emitLoad\('render',ready\?LOAD_STAGES\.READY:LOAD_STAGES\.SNAPSHOT,label,status\)/,'Only a populated Build render may report the ready milestone');
assert.match(mainHtml,/guardian-portal-progress\.mjs\?v=20260913-character-safe-2/,'Character must load the partial-data-safe progress module without a stale cache');
assert.match(buildHtml,/paradox-build-space\.mjs\?v=20260913-character-safe-2/,'Build Forge must refresh its partial-data-safe module graph');
assert.match(buildModule,/guardian-portal-progress\.mjs\?v=20260913-character-safe-2/,'Build must load the partial-data-safe progress module without a stale cache');
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
  let blocked=0;
  const window={ForgeLoader:{set(){},status(){},done(){completed++;},blocked(){blocked++;}},addEventListener:(name,fn)=>windowEvents.set(name,fn)};
  const source=mainProgress.replace(/^import .*;\n/gm,'').replace('const BACKGROUND_DECODE_TIMEOUT_MS=5*1000;','const BACKGROUND_DECODE_TIMEOUT_MS=1;');
  class HarnessImage{addEventListener(){}set src(value){this.currentSrc=value;}}
  const PREPARED_PAGE_STAGES={start:{percent:8,label:'Preparing verified Guardian data'},session:{percent:18,label:'Checking Bungie session'},request:{percent:42,label:'Loading prepared bulk manifest and Guardian data'},join:{percent:72,label:'Joining verified Guardian data to the prepared bulk manifest'},render:{percent:92,label:'Rendering verified page data'},ready:{percent:96,label:'Page ready'}};
  runInNewContext(source,{window,document,guardianManifest:{cached:()=>Promise.resolve()},PREPARED_PAGE_STAGES,PORTAL_TRANSITION_KEY:'test',sessionStorage:{getItem:()=>null,removeItem(){}},requestAnimationFrame:fn=>frames.push(fn),queueMicrotask,setTimeout,clearTimeout,URL,Image:HarnessImage,getComputedStyle:()=>({backgroundImage:stalledBackground?'url("/stalled-scene.webp")':'none'})});
  return {emit:(name,detail={})=>documentEvents.get(name)?.({detail}),settleHeader:()=>{headerPending=false;},done:()=>completed,blocked:()=>blocked,flush:async()=>{for(let i=0;i<8;i++){await new Promise(resolve=>setImmediate(resolve));frames.splice(0).forEach(fn=>fn());}}};
}
const loading=await loaderHarness();loading.emit('forge:build-render-complete',{status:'pending'});await loading.flush();assert.equal(loading.done(),0,'Empty initial build must stay covered.');
loading.settleHeader();loading.emit('forge:bungie-character-roster');loading.emit('forge:guardian-loadout-context');await loading.flush();assert.equal(loading.done(),0,'Resolved profile still needs its populated build render.');
loading.emit('forge:build-render-complete',{status:'ready'});await loading.flush();assert.equal(loading.done(),1,'Ready build plus settled header releases the loader.');
const delayedHeader=await loaderHarness();delayedHeader.emit('forge:build-render-complete',{status:'ready'});await delayedHeader.flush();assert.equal(delayedHeader.done(),0);delayedHeader.settleHeader();delayedHeader.emit('forge:bungie-character-roster');await delayedHeader.flush();assert.equal(delayedHeader.done(),1);
const failed=await loaderHarness();failed.emit('forge:build-render-complete',{status:'pending'});failed.settleHeader();failed.emit('forge:guardian-error');await failed.flush();assert.equal(failed.done(),0,'A terminal profile error must not expose an empty Build Forge.');assert.equal(failed.blocked(),1,'A terminal profile error must expose retry inside the portal.');
const stale=await loaderHarness();stale.settleHeader();stale.emit('forge:build-render-complete',{status:'ready'});stale.emit('forge:guardian-loading');await stale.flush();assert.equal(stale.done(),0,'A new load must cancel old completion.');
const stalledBackground=await loaderHarness({stalledBackground:true});stalledBackground.settleHeader();stalledBackground.emit('forge:build-render-complete',{status:'ready'});await stalledBackground.flush();assert.equal(stalledBackground.done(),1,'A decorative background that never loads or errors must not delay a genuinely ready Build Forge.');
const stalledCharacterBackground=await loaderHarness({stalledBackground:true,isBuildSpace:false});stalledCharacterBackground.emit('forge:guardian-render-complete');await stalledCharacterBackground.flush();assert.equal(stalledCharacterBackground.done(),1,'A decorative background that never loads or errors must not delay a genuinely rendered Character page.');
console.log('BUILD_LOADER_EVENT_ORDER=PASS');

// Synthetic DOM: the actual shared loader must not mount on a warm page,
// but authentication and missing/corrupt caches must still be recoverable.
function warmPortalHarness({warm=true,identity='3:synthetic-a',age=0,path='/astrix-app/pages/loadout/',storageError=false,preparedEntry=false}={}){
  const classes=()=>{const names=new Set();return {add:name=>names.add(name),remove:name=>names.delete(name),contains:name=>names.has(name),toggle:(name,on)=>on?names.add(name):names.delete(name)};};
  const node=()=>({classList:classes(),style:{setProperty(){}},hidden:true,textContent:'',addEventListener(){},removeEventListener(){},querySelector(){return node();}});
  let mounts=0,gate=null,markup='',assetReads=0;
  const document={documentElement:{classList:classes()},body:{classList:classes(),appendChild(value){gate=value;mounts++;}},querySelector:()=>gate,createElement(){return {set innerHTML(value){markup=value;},get firstElementChild(){return node();}};},addEventListener(){},get fonts(){assetReads++;throw new Error('Warm render must not wait for fonts');}};
  const session={authenticated:true,csrfToken:'synthetic',capabilities:{destinyActions:{}},activeDestinyMembership:{membershipId:'synthetic-a',membershipType:3}};
  const records={'astrix:bungie-session-cache:v1':JSON.stringify({session})};
  if(warm)records['astrix:bungie-page-cache:v4:loadout']=JSON.stringify({scope:'loadout',identity,savedAt:Date.now()-age});
  if(preparedEntry)records['astrix:prepared-navigation:v1']=JSON.stringify({path,at:Date.now()});
  const window={location:{pathname:path}};
  runInNewContext(portalJs,{window,document,sessionStorage:{getItem(key){if(storageError)throw new Error('denied');return records[key]||null;},removeItem(key){delete records[key];}},Date,Promise,setTimeout:()=>1,clearTimeout(){},requestAnimationFrame:fn=>fn()});
  return {loader:window.ForgeLoader,document,mounts:()=>mounts,markup:()=>markup,assetReads:()=>assetReads};
}
const warmPortal=warmPortalHarness();assert.equal(warmPortal.mounts(),0,'Warm page entry must not replay the portal');
assert.equal(warmPortal.document.documentElement.classList.contains('apx-booting'),false,'Warm page body must remain visible');
await warmPortal.loader.ready({querySelectorAll(){throw new Error('Warm render must not wait for images');}});
assert.equal(warmPortal.assetReads(),0);warmPortal.loader.mount();assert.equal(warmPortal.mounts(),0,'Completed navigation must not remount for background work');
const missingCache=warmPortalHarness();missingCache.loader.requireData();assert.equal(missingCache.mounts(),1,'A stale cache hint must fall back to a real data gate');
assert.doesNotMatch(missingCache.markup(),/apx-status|Opening portal|verified/i,'Loading copy must contain only the existing percentage, without status prose');
const reauth=warmPortalHarness();reauth.loader.authRequired('/connect');assert.equal(reauth.mounts(),1,'Warm navigation must retain account sign-in recovery');
const warmFailure=warmPortalHarness();warmFailure.loader.blocked('Synthetic unavailable data');assert.equal(warmFailure.mounts(),1,'A genuine first-render failure must still expose retry');
assert.equal(warmPortalHarness({identity:'3:another-account'}).mounts(),1,'Another account cache must never suppress the gate');
assert.equal(warmPortalHarness({age:12*60*60*1000+1}).mounts(),1,'An expired cache must use the cold path');
assert.equal(warmPortalHarness({storageError:true}).mounts(),1,'Unavailable storage must use the cold path');
assert.equal(warmPortalHarness({warm:false}).mounts(),1);
console.log('WARM_NAVIGATION_NO_PORTAL_OR_ASSET_WAIT=PASS');
console.log('WARM_NAVIGATION_AUTH_AND_CACHE_RECOVERY=PASS');

// Synthetic transition: keep the old page until the real render milestone
// AND a delayed visible image finish, not merely a cached account marker.
function transitionHarness({headerPending=false}={}){
  const documentEvents=new Map();
  const events=new Map(),timers=new Map(),classes=new Set();let timerId=0,gate=null,finishImage;
  const classList={add:name=>classes.add(name),remove:name=>classes.delete(name),contains:name=>classes.has(name),toggle:(name,on)=>on?classes.add(name):classes.delete(name)};
  const item=()=>({classList:{add(){},remove(){},contains:()=>false,toggle(){}},style:{setProperty(){}},querySelector:()=>item(),addEventListener(){},removeEventListener(){},remove(){if(this===gate)gate=null;}});
  const image={complete:false,closest:()=>null,getBoundingClientRect:()=>({width:50,height:50,top:10,left:10,right:60,bottom:60}),decode:()=>Promise.resolve(),addEventListener(name,fn){if(name==='load')finishImage=fn;},removeEventListener(){}};
  const document={documentElement:{classList,dataset:{}},body:{classList,appendChild:node=>{gate=node;}},fonts:{ready:Promise.resolve()},querySelector:selector=>selector==='.apx-gate'?gate:selector==='[data-forge-hero-cards]'&&headerPending?{}:null,querySelectorAll:selector=>selector==='img'?[image]:[],createElement:()=>({set innerHTML(value){},get firstElementChild(){return item();}}),addEventListener(name,fn){documentEvents.set(name,[...(documentEvents.get(name)||[]),fn]);}};
  const window={innerWidth:400,innerHeight:800,location:{pathname:'/astrix-app/pages/loadout/'},addEventListener:(name,fn)=>events.set(name,fn)};
  runInNewContext(portalJs,{window,document,sessionStorage:{getItem:()=>null,removeItem(){}},setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;},clearTimeout:id=>timers.delete(id),requestAnimationFrame:fn=>fn(),Promise,Date});
  let finishTransition;
  const transition={finished:new Promise(resolve=>{finishTransition=resolve;})};
  return {document,classes,loader:window.ForgeLoader,emit:()=>events.get('pagereveal')({viewTransition:transition}),header:()=>{headerPending=false;(documentEvents.get('forge:hero-cards-render-complete')||[]).forEach(fn=>fn());},image:()=>finishImage(),finish:()=>finishTransition(),timeout:()=>[...timers.values()].find(row=>row.ms===30000).fn(),gate:()=>gate};
}
const settleMicrotasks=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const reveal=transitionHarness();reveal.emit();
assert.ok(reveal.classes.has('apx-navigation-waiting'));
await settleMicrotasks();assert.ok(reveal.classes.has('apx-navigation-waiting'),'Cache availability alone must not reveal an unfinished destination');
reveal.loader.done();await settleMicrotasks();
assert.ok(reveal.classes.has('apx-navigation-waiting'),'Data rendering must not reveal a still-loading viewport image');
assert.equal(reveal.gate(),null,'The portal must be removed behind the outgoing snapshot, without a second portal fade');
reveal.image();await settleMicrotasks();
assert.ok(reveal.classes.has('apx-navigation-ready'));assert.equal(reveal.document.documentElement.dataset.navigationState,'ready');
reveal.finish();await settleMicrotasks();assert.equal(reveal.classes.has('apx-navigation-waiting'),false);
const recover=transitionHarness();recover.emit();recover.loader.blocked('Synthetic failure');await settleMicrotasks();assert.equal(recover.document.documentElement.dataset.navigationState,'recovery');
const stalled=transitionHarness();stalled.emit();stalled.timeout();await settleMicrotasks();assert.equal(stalled.document.documentElement.dataset.navigationState,'recovery','A stalled page must release to retry instead of permanently freezing the old view');
assert.match(portalCss,/@view-transition\{navigation:auto\}/);
assert.match(portalCss,/apx-navigation-waiting::view-transition-old\(root\)\{animation:apxNavigationHold 1s both paused/);
assert.match(portalCss,/prefers-reduced-motion:reduce[\s\S]*?apx-navigation-ready[\s\S]*?animation-duration:\.001s/);
console.log('DESTINATION_RENDER_AND_VISIBLE_ASSET_REVEAL=PASS');

const ribbonSource=await read('astrix-app/shared/astrix-destination-ribbon.js');
function navigationHarness(){
  const events=new Map(),requests=[],assigned=[],pending=new Map(),storage=new Map();let indicators=0;
  storage.set('astrix:bungie-session-cache:v1',JSON.stringify({session:{authenticated:true,activeDestinyMembership:{membershipId:'synthetic-a',membershipType:3}}}));
  const makeLink=path=>({href:`https://astrixparadox.com${path}`,target:'',hasAttribute:()=>false,setAttribute(){},removeAttribute(){},closest(){return this;}});
  const location={href:'https://astrixparadox.com/astrix-app/pages/journey/',origin:'https://astrixparadox.com',pathname:'/astrix-app/pages/journey/',assign:path=>assigned.push(path)};
  const document={currentScript:{src:'https://astrixparadox.com/astrix-app/shared/astrix-destination-ribbon.js'},readyState:'loading',visibilityState:'visible',body:{append(){indicators++;}},createElement:()=>({setAttribute(){},remove(){indicators--;}}),querySelectorAll:()=>[],addEventListener:(name,fn)=>events.set(name,fn)};
  const window={addEventListener:(name,fn)=>events.set(name,fn)};
  const fixturePrepare=destination=>{requests.push(destination.key);return new Promise((resolve,reject)=>pending.set(destination.key,{resolve,reject}));};
  const source=ribbonSource.replace('  function init(){','  prepareData=fixturePrepare;prepareResources=async()=>{};window.testNavigation={navigatePrepared,prepare};\n  function init(){');
  runInNewContext(source,{window,document,location,navigator:{},sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},URL,Date,Promise,fixturePrepare,setTimeout,clearTimeout});
  const click=(path,extra={})=>{let prevented=false;const link=makeLink(path);const event={button:0,target:link,preventDefault(){prevented=true;},...extra};const task=window.testNavigation.navigatePrepared(event);return {task,prevented:()=>prevented};};
  return {click,assigned,requests,pending,storage,events,indicators:()=>indicators};
}
const navigation=navigationHarness();
const firstNavigation=navigation.click('/astrix-app/pages/vault/');
assert.equal(firstNavigation.prevented(),true);assert.equal(navigation.assigned.length,0,'Current page must remain until destination preparation completes');
const replacementNavigation=navigation.click('/astrix-app/pages/loadout/');
navigation.pending.get('vault').resolve();await firstNavigation.task;
assert.equal(navigation.assigned.length,0,'A superseded click must not navigate when its old request completes');
navigation.pending.get('loadout').resolve();await replacementNavigation.task;
assert.deepEqual(navigation.assigned,['/astrix-app/pages/loadout/']);assert.equal(navigation.indicators(),0);
assert.equal(JSON.parse(navigation.storage.get('astrix:prepared-navigation:v1')).path,'/astrix-app/pages/loadout/');
const modified=navigation.click('/astrix-app/pages/vault/',{ctrlKey:true});await modified.task;assert.equal(modified.prevented(),false,'Modified clicks must keep native new-tab behavior');
const changed=navigationHarness();const changing=changed.click('/astrix-app/pages/vault/');changed.storage.delete('astrix:bungie-session-cache:v1');changed.pending.get('vault').resolve();await changing.task;assert.equal(changed.assigned.length,0,'Account changes cancel pending navigation');
const cancelled=navigationHarness();const cancelling=cancelled.click('/astrix-app/pages/vault/');cancelled.events.get('keydown')({key:'Escape'});cancelled.pending.get('vault').resolve();await cancelling.task;assert.equal(cancelled.assigned.length,0,'Escape leaves the current page usable');
const failedPreparation=navigationHarness();const failing=failedPreparation.click('/astrix-app/pages/vault/');failedPreparation.pending.get('vault').reject(new Error('Synthetic offline'));await failing.task;assert.deepEqual(failedPreparation.assigned,['/astrix-app/pages/vault/'],'Preparation failure must retain the destination normal sign-in/retry path');
assert.doesNotMatch(ribbonSource,/createElement\(['"]iframe|type=['"]speculationrules/,'Preparation must not execute another page or duplicate its account actions');
console.log('PREPARED_NAVIGATION_ORDER_CANCEL_ACCOUNT_AND_NATIVE_LINKS=PASS');

const delayedNavigationHeader=transitionHarness({headerPending:true});delayedNavigationHeader.emit();delayedNavigationHeader.loader.done();await settleMicrotasks();
assert.ok(delayedNavigationHeader.classes.has('apx-navigation-waiting'),'Header completion is part of page readiness');
delayedNavigationHeader.header();await settleMicrotasks();delayedNavigationHeader.image();await settleMicrotasks();
assert.equal(delayedNavigationHeader.document.documentElement.dataset.navigationState,'ready');
assert.equal(warmPortalHarness({preparedEntry:true}).mounts(),1,'Without native transitions a prepared click must retain its gate until the destination renderer finishes');
console.log('HEADER_READINESS_AND_NON_TRANSITION_FALLBACK=PASS');
const resourceCalls=[],consumed=[];
const resourceSource=ribbonSource.slice(ribbonSource.indexOf('  async function prepareResources('),ribbonSource.indexOf('  async function prepareData('));
const resourceContext={URL,AbortController,location:{origin:'https://astrixparadox.com'},setTimeout:()=>1,clearTimeout(){},
  DOMParser:class {parseFromString(markup){assert.equal(markup,'synthetic page');return {querySelectorAll:()=>[
    {getAttribute:key=>key==='href'?'./screen.css':null},
    {getAttribute:key=>key==='src'?'./screen.js':null},
    {getAttribute:key=>key==='src'?'./screen.js':null},
    {getAttribute:key=>key==='src'?'https://other.example/private.js':null}
  ]};}},
  fetch:async(url,options)=>{resourceCalls.push({url:String(url),options});return {ok:true,text:async()=> 'synthetic page',arrayBuffer:async()=>{consumed.push(String(url));return new ArrayBuffer(0);}};}
};
runInNewContext(resourceSource,resourceContext);
await resourceContext.prepareResources({href:'/astrix-app/pages/loadout/'});
assert.equal(resourceCalls.length,3,'Preparation requests only the document and distinct same-origin resources');
assert.equal(consumed.length,2,'Resource bodies must finish downloading before preparation resolves');
assert.ok(resourceCalls.every(row=>!row.options.method||row.options.method==='GET'),'Preparing a destination must perform no account mutations');
console.log('DESTINATION_RESOURCES_READ_ONLY_AND_FULLY_DOWNLOADED=PASS');
const modulePreloads=[];
resourceContext.DOMParser=class {parseFromString(){return {querySelectorAll:()=>[{getAttribute:key=>key==='type'?'module':key==='src'?'./screen.mjs':null}]};}};
resourceContext.document={
  createElement:tag=>{assert.equal(tag,'link');const handlers=new Map();return {relList:{supports:value=>value==='modulepreload'},addEventListener:(name,fn)=>handlers.set(name,fn),removeEventListener:name=>handlers.delete(name),remove(){},loaded:()=>handlers.get('load')()};},
  head:{append:link=>{modulePreloads.push(link);queueMicrotask(()=>link.loaded());}}
};
await resourceContext.prepareResources({href:'/astrix-app/pages/loadout/'});
assert.equal(modulePreloads.length,1);assert.equal(modulePreloads[0].rel,'modulepreload');
assert.equal(modulePreloads[0].href,'https://astrixparadox.com/astrix-app/pages/loadout/screen.mjs');
console.log('DESTINATION_MODULES_PREPARED_WITHOUT_EXECUTION=PASS');
