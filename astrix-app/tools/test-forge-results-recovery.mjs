import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {ARMOUR_STAT_KEYS} from '../pages/vault/vault-armour-matcher.mjs';
import {WEAPON_BUCKETS} from '../pages/vault/vault-inventory.mjs';
import {decodeForgeResultsUrl,encodeForgeResultsUrl,scanArmourCombinations} from '../pages/forge-loader/forge-loader-scan.mjs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const selector=read('../pages/forge-loader/forge-loader.mjs');
const results=read('../pages/forge-loader/results/forge-loader-results.mjs');
function functionSource(source,name){
  const start=source.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start>=0,name);
  const end=source.indexOf('\n}\n',start);
  return source.slice(start,end+2);
}

// The reported bookmark has one target and no priorities. Omitted values mean
// no preference, not missing fields in the worker's strict six-stat contract.
const selection=decodeForgeResultsUrl('?characterId=2305843009264858730&exotic=3883286570&sets=1777208707%3A4&targets=melee%3A141');
const originalFetch=globalThis.fetch;
const requests=[];
globalThis.fetch=async(url,options)=>{
  const body=JSON.parse(options.body);requests.push(body);
  for(const vector of [body.targets,body.statPriorities]){
    assert.deepEqual(Object.keys(vector).sort(),[...ARMOUR_STAT_KEYS].sort());
    assert.ok(Object.values(vector).every(Number.isFinite),'Worker rejects missing stat values');
  }
  return new Response(JSON.stringify({candidates:[],targetMaximums:{},combinationsEvaluated:0}));
};
try{
  for(const state of [selection,decodeForgeResultsUrl('?characterId=1&exotic=3883286570')]){
    await scanArmourCombinations({authOrigin:'https://example.test',session:{},binding:{characterId:state.characterId},manifestVersion:'fixture',sourceItems:[],exotic:{hashes:[state.exoticHash],slotIndex:1},setSelections:state.setSelections,targets:state.targets,priorities:state.priorities});
  }
}finally{globalThis.fetch=originalFetch;}
assert.equal(requests[0].targets.melee,141);
assert.equal(requests[0].targets.health,0);
assert.ok(Object.values(requests[0].statPriorities).every(value=>value===0));
assert.ok(Object.values(requests[1].targets).every(value=>value===0));
for(const weaponInstanceId of ['', 'fixture-selected-copy']){
  const url=encodeForgeResultsUrl('https://example.test/results/',{...selection,weaponInstanceId});
  assert.equal(decodeForgeResultsUrl(url.search).weaponInstanceId,weaponInstanceId);
}

// Render only real inputs supplied by the catalogue; synthetic names stay here.
const groups=WEAPON_BUCKETS.map((bucket,index)=>({key:String(index),bucketHash:bucket.hash,name:`Fixture ${index}`,icon:`/fixture-${index}.png`,representative:{itemInstanceId:String(index)},catalyst:{present:false}}));
const nodes=new Map();
const byId=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',hidden:false});return nodes.get(id);};
runInNewContext(functionSource(selector,'renderExoticWeapons')+';renderExoticWeapons();',{
  byId,WEAPON_BUCKETS,exoticWeaponGroups:()=>groups,selectedExoticWeaponKey:'1',selectedExoticWeapon:()=>groups[1],esc:String,itemKey:item=>item.itemInstanceId
});
const markup=byId('forgeExoticWeaponSlots').innerHTML;
assert.match(markup,/>PRIMARY</);assert.match(markup,/>SECONDARY</);assert.match(markup,/>HEAVY</);
assert.equal((markup.match(/class="forge-exotic(?: is-selected)?"/g)||[]).length,3);
assert.equal((markup.match(/<img /g)||[]).length,3);
assert.doesNotMatch(markup,/<(?:b|small|em|span)[ >]|power/i,'Weapon tiles contain artwork only');
assert.match(markup,/is-selected[\s\S]*?aria-pressed="true"/);
assert.match(markup,/aria-label="Clear Fixture 1"/);
const canSearch=runInNewContext(functionSource(selector,'canSearch')+';canSearch();',{
  selectedExotic:()=>({}),activeTargetCount:()=>1,activePriorityCount:()=>0,setSelections:[],openProtocolChosen:false
});
assert.equal(canSearch,true,'A weapon anchor is optional');

// Rendering ten entries never changes the backend search or invents extra rows.
for(const count of [0,2,50]){
  const rendered=[];const previewNodes=new Map();
  runInNewContext(functionSource(selector,'renderPreview')+';renderPreview();',{
    byId:id=>{if(!previewNodes.has(id))previewNodes.set(id,{});return previewNodes.get(id);},
    PREVIEW_COUNT:Number(selector.match(/const PREVIEW_COUNT=(\d+)/)[1]),matchedBuilds:Array.from({length:count},(_,i)=>({id:i})),
    selectedExotic:()=>({}),candidateMarkup:(row,index)=>{rendered.push(index);return String(index);},activeTargetCount:()=>0,
    expandedPreviewIndex:-1,payload:{},targetValues:()=>({}),setSelections:[]
  });
  assert.equal(rendered.length,Math.min(10,count));
}

// Exercise the actual results init with session/profile boundaries stubbed.
async function initialise({signedOut=false,unknown=false,missing=false,noExotic=false,weapon=false,fail=false}={}){
  const calls={done:0,blocked:[],auth:0};const pageNodes=new Map();
  const selectedCopy={itemInstanceId:'selected'};
  const context={
    installEvents(){},byId:id=>{if(!pageNodes.has(id))pageNodes.set(id,{});return pageNodes.get(id);},authStartUrl:()=>'/sign-in',
    selection:{characterId:missing?'':'1',exoticHash:3883286570,weaponInstanceId:weapon?'selected':''},
    session:null,payload:null,catalogue:null,profileBuild:null,activeCharacterClass:'',backendSolverReady:false,exoticGroup:null,weaponGroup:null,activeCharacterId:'1',
    getBungieSession:async()=>unknown?{authenticated:null}:signedOut?{authenticated:false,status:401,error:'bungie_reauthentication_required'}:{authenticated:true},
    reportPreparedPageStage(){},preloadForgeLoaderPayload:async()=>({profile:{characters:{data:{one:{characterId:'1'}}}},pageReady:{manifestVersion:'fixture'}}),
    guardianManifest:{seedPayload(){},applyForgeArmourIndex(){},hydratePayload:async()=>{},status:()=>({version:'fixture'}),tables:new Map()},
    createVaultCatalogue:()=>({armour:[]}),text:String,characterClass:()=> 'hunter',runProfileTask:async()=>({}),
    engineHandoff:{prepare:async()=>{}},membershipBinding:()=>({}),exoticCatalogueGroups:()=>noExotic?[]:[{hash:3883286570,owned:true}],ARMOUR_BUCKETS:[],
    ownedExoticWeaponGroups:()=>[{name:'Fixture selected weapon',representative:{itemInstanceId:'other-copy'},instances:[{itemInstanceId:'other-copy'},selectedCopy]}],weaponItems:()=>[],weaponCatalystState:()=>({present:false}),
    runSearch:async()=>{if(fail)throw new Error('Fixture solver failure');},console:{error(){}},
    ForgeLoader:{done(){calls.done++;},blocked(message){calls.blocked.push(message);},authRequired(){calls.auth++;}}
  };
  await runInNewContext(functionSource(results,'init')+';init();',context);
  return {calls,context,pageNodes};
}
for(const options of [{},{missing:true},{noExotic:true}])assert.equal((await initialise(options)).calls.done,1);
assert.equal((await initialise({signedOut:true})).calls.auth,1);
for(const options of [{unknown:true},{fail:true}]){
  const {calls}=await initialise(options);assert.equal(calls.auth,0);assert.equal(calls.done,0);assert.equal(calls.blocked.length,1);
}
const anchored=await initialise({weapon:true});
assert.equal(anchored.context.weaponGroup.representative.itemInstanceId,'selected','Preserve the exact selected instance, not the current representative');
assert.match(anchored.pageNodes.get('forgeResultsWeaponAnchor').textContent,/Fixture selected weapon/);

// An indefinitely pending solver request must abort, reject to init, and allow
// the portal's existing Retry Live Data control to appear.
let timeout,cleared=false;
const searchContext={
  byId:()=>({}),armourItems:()=>[],payload:{pageReady:{manifestVersion:'fixture'}},guardianManifest:{status:()=>({})},text:String,
  AbortController,setTimeout:fn=>{timeout=fn;return 1;},clearTimeout:()=>{cleared=true;},
  AUTH_ORIGIN:'https://example.test',session:{},membershipBinding:()=>({}),exoticGroup:{},selection:{setSelections:[],targets:{},priorities:{}},CANDIDATE_BATCH_SIZE:50,
  scanArmourCombinations:({signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})))),
  matchedBuilds:[],renderCandidates(){}
};
const waiting=runInNewContext(functionSource(results,'runSearch')+';runSearch();',searchContext);
timeout();await assert.rejects(waiting,/Forge Matrix search timed out/);assert.equal(cleared,true);
console.log('FORGE_RESULTS_RECOVERY=PASS sparse-url optional-weapon exact-instance top-ten error-lifecycle timeout');
