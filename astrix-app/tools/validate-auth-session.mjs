import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const intro=read('pages/tool-intro/tool-intro.mjs');
const guardian=read('pages/guardian-workspace-v2/guardian-bungie-auth.mjs');
const vault=read('pages/vault/vault.mjs');
const journey=read('pages/journey/journey.mjs');
const worker=readFileSync(new URL('../../forge-auth-worker/src/index.ts',import.meta.url),'utf8');
const withoutImports=source=>source.replace(/^import .*;\n/gm,'');
function harness(source,fetcher){
  const elements=new Map();
  const element=id=>{
    if(!elements.has(id))elements.set(id,{hidden:false,disabled:false,textContent:'',dataset:{},classList:{add(){},remove(){}},listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},setAttribute(){},append(){},appendChild(){},querySelector(){return null;}});
    return elements.get(id);
  };
  let navigations=0,authStarts=0,timer;
  const context=vm.createContext({ URL,URLSearchParams,AbortController,CustomEvent:class{},console:{info(){},warn(){},error(){}},
    fetch:fetcher,
    setTimeout(fn){timer=fn;return 1;},clearTimeout(){},
    location:{href:'https://astrixparadox.com/astrix-app/pages/tool-intro/',hostname:'astrixparadox.com',origin:'https://astrixparadox.com',search:'',replace(){navigations++;},assign(){navigations++;}},
    document:{addEventListener(){},getElementById:element,body:{classList:{add(){},remove(){}}}},
    readCachedBungieSession:()=>null,cacheBungieSession(){},toolIntroConfig:()=>({}),preloadForgeLoaderPayload:async()=>{},
    dispatchEvent(){},ForgeLoader:{authRequired(){authStarts++;},authResolved(){}}
  });
  vm.runInContext(source,context);
  vm.runInContext('authStartUrl=()=>{globalThis.authCalls=(globalThis.authCalls||0)+1;return "/connect";}',context);
  return {context,element,abort:()=>timer(),navigations:()=>navigations,authStarts:()=>authStarts+(context.authCalls||0)};
}
const failures=[
  ['503',async()=>Response.json({authenticated:'unknown'},{status:503})],
  ['network',async()=>{throw new TypeError('offline');}],
  ['bad JSON',async()=>new Response('{')],
  ['malformed 401',async()=>new Response('{',{status:401})],
  ['invalid session shape',async()=>Response.json({})],
  ['timeout',(_url,options)=>new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('aborted'))))]
];
for(const [name,fetcher] of failures){
  const h=harness(withoutImports(intro).split('if(!config)')[0],fetcher);
  const result=vm.runInContext('continueToGuardianJourney()',h.context);
  if(name==='timeout')h.abort();
  assert.equal(await result,false,name);
  assert.equal(h.authStarts(),0,`${name} must not construct authorization URL`);
  assert.equal(h.navigations(),0,`${name} must not navigate`);
  assert.equal(h.element('toolIntroCta').textContent,'Retry');
  assert.equal(h.element('toolIntroCta').disabled,false);
  h.context.fetch=async()=>Response.json({authenticated:true});
  assert.equal(await vm.runInContext('continueToGuardianJourney()',h.context),true,`${name}: retry succeeds`);
  assert.equal(h.navigations(),1);
  const g=harness(withoutImports(guardian).split('\ninstallStyles();')[0],fetcher);
  const pending=vm.runInContext('getBungieSession({force:true})',g.context);
  if(name==='timeout')g.abort();
  assert.equal((await pending).authenticated,null);
  assert.equal(g.authStarts(),0,`${name}: shared auth must not offer authorization`);
  assert.equal(g.navigations(),0);
}
for(const source of [withoutImports(intro).split('if(!config)')[0],withoutImports(guardian).split('\ninstallStyles();')[0]]){
  const h=harness(source,async()=>Response.json({authenticated:false},{status:401}));
  await vm.runInContext(source.includes('continueToGuardianJourney')?'continueToGuardianJourney()':'getBungieSession({force:true})',h.context);
  assert.ok(h.authStarts()>0,'Definitive signed-out response must retain sign-in');
}
assert.match(intro,/session\?\.authenticated!==false[\s\S]*?return false;[\s\S]*?location\.assign\(authStartUrl\(\)\)/);
assert.match(guardian,/if\(button\.dataset\.state==="disconnected"\) location\.href=authStartUrl\(\)/);
assert.match(guardian,/else if\(session\?\.authenticated===false\)\{\s*globalThis\.ForgeLoader\?\.authRequired\?\.\(authStartUrl\(\)\)/);
assert.match(vault,/if\(session\?\.authenticated===false\)\{\s*byId\('vaultConnectButton'\)\.href=authStartUrl\(\)/);
assert.match(journey,/else if\(session\?\.authenticated===false\)showSignedOut\(\);/);
assert.match(worker,/BUNGIE_AUTHORIZE = "https:\/\/www\.bungie\.net\/en\/oauth\/authorize"/);
assert.doesNotMatch([intro,guardian,worker].join('\n'),/PlayStation|Sony|\bPSN\b|searchParams\.set\(["'](?:reauth|platform)["']/i);
console.log('AUTH_SESSION_DEFINITIVE_SIGN_OUT_ONLY=PASS');
console.log('AUTH_SESSION_UNKNOWN_RETRY=PASS');

const guarded=harness(withoutImports(guardian).split('\ninstallStyles();')[0],async()=>Response.json({}));
// Restore the real URL function, including its guard, for callers such as Forge Loader.
vm.runInContext(guardian.slice(guardian.indexOf('function authStartUrl('),guardian.indexOf('async function requestAccessRecovery')),guarded.context);
for(const authenticated of [undefined,null,true]){
  guarded.context.FORGE_BUNGIE_SESSION={authenticated};
  assert.equal(vm.runInContext('authStartUrl()',guarded.context),null);
}
guarded.context.FORGE_BUNGIE_SESSION={authenticated:false};
assert.match(vm.runInContext('authStartUrl()',guarded.context),/\/bungie\/start\?/);
const portal=read('shared/astrix-portal-loader.js');
assert.match(portal,/function authRequired\(url\)\{\s*if\(!url\)\{authResolved\(\);blocked\('Bungie is not responding. Retry'\);return;\}/);
