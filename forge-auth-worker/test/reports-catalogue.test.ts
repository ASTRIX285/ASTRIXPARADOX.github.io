import {test} from 'node:test';
import assert from 'node:assert/strict';
import {activityIdentity,buildReportsCatalogue,reportsCatalogue,reportsCatalogueResponse,REPORTS_SCHEMA,validateReleaseCoverage} from '../src/reports-catalogue.ts';
import {fetchBungieDefinitions,BUNGIE_DEFINITION_USER_AGENT} from '../src/bungie-definition-fetch.ts';
function bungieResponse(response: Response, url='https://www.bungie.net/common/destiny2_content/json/activities.json'){
 Object.defineProperty(response,'url',{value:url});return response;
}
const definitions = {
  1:{hash:1,displayProperties:{name:'Last Wish: Normal'},activityModeTypes:[4],pgcrImage:'/img/raid.jpg'},
  2:{hash:2,displayProperties:{name:'Last Wish: Master'},activityModeTypes:[4]},
  3:{hash:3,displayProperties:{name:'Equilibrium: Standard'},activityTypeHash:608898761},
  4:{hash:4,displayProperties:{name:'The Desert Perpetual: Standard'},activityTypeHash:2043403989},
  5:{hash:5,displayProperties:{name:'Nightfall Grandmaster: The Arms Dealer'},originalDisplayProperties:{name:'Nightfall Grandmaster'},activityModeTypes:[46]},
  6:{hash:6,displayProperties:{name:'Ghosts of the Deep: Explorer (Matchmade)'},activityModeTypes:[82]}
};
function memoryCache(){
  const rows = new Map<string,Response>();
  return {rows,async match(request: Request){return rows.get(request.url)?.clone();},async put(request: Request,response: Response){rows.set(request.url,response);}};
}
test('slim rows retain variants and current type hashes, strip unrelated data, use release order',()=>{
  const slim=buildReportsCatalogue(definitions,'fixture');
  assert.equal(slim.schema,REPORTS_SCHEMA);
  assert.equal(slim.activities.length,6);
  assert.equal(slim.activities.filter(row=>row.name==='Last Wish').length,2);
  assert.equal(slim.activities.find(row=>row.hash==='4')?.series,'raids');
  assert.equal(slim.activities.find(row=>row.hash==='3')?.series,'dungeons');
  assert.deepEqual(activityIdentity(definitions[5]),{name:'The Arms Dealer',difficulty:'Grandmaster'});
  assert.deepEqual(activityIdentity(definitions[6]),{name:'Ghosts of the Deep',difficulty:'Explorer'});
  assert.equal(slim.activities.filter(row=>row.series==='raids')[0].name,'The Desert Perpetual');
  assert.deepEqual(Object.keys(slim.activities[0]).sort(),['difficulty','hash','name','pgcrImage','releaseOrder','series']);
  assert.equal(buildReportsCatalogue({1:{...definitions[1],redacted:true}},'fixture').activities.length,0);
  assert.equal(buildReportsCatalogue({1:{...definitions[1],isPlaylist:true}},'fixture').activities.length,0);
  assert.equal(buildReportsCatalogue({1:{...definitions[1],pgcrImage:'https://example.org/image.png'}},'fixture').activities[0].pgcrImage,'');
  // Prompt 20a-fix2 moves the strict assertion to CI; runtime must remain usable.
  for(const activityModeTypes of [[4],[82]]){
    const messages:string[]=[];
    const result=buildReportsCatalogue({1:{hash:1,displayProperties:{name:'Missing release'},activityModeTypes}},'fixture',message=>messages.push(message));
    assert.equal(result.activities.length,1);
    assert.equal(messages.length,1);
    assert.throws(()=>validateReleaseCoverage(result.activities),/Missing Reports release order/);
  }
});
test('edge catalogue is keyed by manifest version, public and contains no player data',async()=>{
  const cache=memoryCache();let fetches=0;
  const fetchImpl=async(input: URL|RequestInfo,options?: RequestInit)=>{fetches++;assert.equal(new URL(String(input)).origin,'https://www.bungie.net');/* Prompt 20a-hotfix: accepted public User-Agent and default redirect follow replace the failing policy. */assert.equal(new Headers(options?.headers).get('User-Agent'),BUNGIE_DEFINITION_USER_AGENT);assert.equal(new Headers(options?.headers).has('X-API-Key'),false);assert.equal(options?.redirect,undefined);return bungieResponse(Response.json(definitions));};
  const manifest={version:'v1',jsonWorldComponentContentPaths:{en:{DestinyActivityDefinition:'/common/destiny2_content/json/activities.json'}}};
  const request=new Request('https://auth.astrixparadox.com/bungie/reports/catalogue?ignored=account');
  const first=await reportsCatalogue(request,manifest,cache,fetchImpl);
  assert.equal(first.status,200);assert.equal(first.headers.get('Cache-Control'),'public, max-age=300');
  assert.equal(first.headers.get('Set-Cookie'),null);
  const payload=await first.json();
  assert.deepEqual(await (await reportsCatalogue(request,manifest,cache,fetchImpl)).json(),payload);assert.equal(fetches,1);
  assert.equal([...cache.rows.values()][0].headers.get('Cache-Control'),'public, max-age=31536000');
  assert.equal(new URL([...cache.rows.keys()][0]).searchParams.get('ignored'),null);
  await reportsCatalogue(request,{...manifest,version:'v2'},cache,fetchImpl);assert.equal(fetches,2);
});
test('invalid paths, failed upstreams and oversized bodies never enter cache',async()=>{
  const request=new Request('https://auth.astrixparadox.com/bungie/reports/catalogue'),cache=memoryCache();
  const manifest={version:'v1',jsonWorldComponentContentPaths:{en:{DestinyActivityDefinition:'/common/destiny2_content/json/activities.json'}}};
  await assert.rejects(reportsCatalogue(request,{version:'bad'},cache),/unavailable/);
  await assert.rejects(reportsCatalogue(request,manifest,cache,async()=>bungieResponse(new Response('fail',{status:429}))),/unavailable/);
  await assert.rejects(reportsCatalogue(request,manifest,cache,async()=>bungieResponse(new Response('{}',{headers:{'Content-Length':String(25*1024*1024)}}))),/unavailable/);
  let sent=0;
  await assert.rejects(reportsCatalogue(request,manifest,cache,async()=>bungieResponse(new Response(new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(1024*1024));if(++sent===25)controller.close();}})))),/too large/);
  assert.equal(cache.rows.size,0);
});

test('Pantheon encounters and Epic hashes group without losing any variant',()=>{
  const names=['The Pantheon: Atraks Sovereign','Pantheon: Calus Resplendent','Featured Encore: Morgeth: The Pantheon','Featured Reprise: Argos: The Pantheon','The Desert Perpetual (Epic): Standard','The Desert Perpetual (Epic): Contest','The Desert Perpetual: Standard'];
  const input=Object.fromEntries(names.map((name,index)=>[index,{hash:index,displayProperties:{name},activityModeTypes:[4]}]));
  const result=buildReportsCatalogue(input,'grouping');
  assert.equal(result.activities.length,names.length);
  assert.equal(new Set(result.activities.map(row=>row.hash)).size,names.length);
  assert.deepEqual([...new Set(result.activities.map(row=>row.name))],['The Desert Perpetual','The Pantheon']);
  assert.deepEqual(result.activities.filter(row=>row.name==='The Pantheon').map(row=>row.difficulty),['Atraks Sovereign','Calus Resplendent','Morgeth','Argos']);
  assert.equal(result.activities.filter(row=>row.difficulty==='Epic').length,2);
  validateReleaseCoverage(result.activities);
});
test('missing release entries sort first and log once per name, not per variant',()=>{
  for(const [series,activityTypeHash] of [['raids',2043403989],['dungeons',608898761],['exotic',1227821118]] as const){
    const messages:string[]=[];
    const result=buildReportsCatalogue({...definitions,90:{hash:90,activityTypeHash,displayProperties:{name:'Unlisted: Normal'}},91:{hash:91,activityTypeHash,displayProperties:{name:'Unlisted: Master'}}},'unknown',message=>messages.push(message));
    assert.deepEqual(messages,[`Missing Reports release order: ${series}:Unlisted`]);
    assert.deepEqual(result.activities.filter(row=>row.series===series).slice(0,2).map(row=>row.hash),['90','91']);
    assert.throws(()=>validateReleaseCoverage(result.activities),/Missing Reports release order/);
  }
});
test('unlabelled variants fold into Normal or strike Standard only with labelled siblings',()=>{
  const input={...definitions,7:{hash:7,displayProperties:{name:'Last Wish'},activityModeTypes:[4]},8:{hash:8,displayProperties:{name:'The Arms Dealer'},activityModeTypes:[3]},9:{hash:9,displayProperties:{name:'Deep Stone Crypt'},activityModeTypes:[4]}};
  const rows=buildReportsCatalogue(input,'labels').activities;
  assert.equal(rows.find(row=>row.hash==='7')?.difficulty,'Normal');
  assert.equal(rows.find(row=>row.hash==='8')?.difficulty,'Standard');
  assert.equal(rows.find(row=>row.hash==='9')?.difficulty,'-');
});

const routeRequest=new Request('https://auth.astrixparadox.com/bungie/reports/catalogue');
const routeManifest={version:'fixture',jsonWorldComponentContentPaths:{en:{DestinyActivityDefinition:'/common/destiny2_content/json/activities.json'}}};
test('native fetch follows an upstream 302 to Bungie with the public User-Agent',async()=>{
 const visited:string[]=[],headers:string[]=[];
 // Native fetch transports fixture bytes through this dispatcher and handles
 // the 302 itself. redirect:error rejects before the second request.
 const dispatcher={dispatch(options:any,handler:any){
  visited.push(`${options.origin}${options.path}`);
  queueMicrotask(()=>{
   handler.onConnect(()=>{});
   if(visited.length===1){
    handler.onHeaders(302,[Buffer.from('location'),Buffer.from('https://www.bungie.net/common/destiny2_content/json/redirected.json')],()=>{},'Found');
   }else{
    handler.onHeaders(200,[Buffer.from('content-type'),Buffer.from('application/json')],()=>{},'OK');
    handler.onData(Buffer.from(JSON.stringify(definitions)));
   }
   handler.onComplete([]);
  });return true;
 }};
 const fetchImpl:typeof fetch=(input,options)=>{
  headers.push(new Headers(options?.headers).get('User-Agent')||'');
  return fetch(input,{...options,dispatcher} as RequestInit);
 };
 const response=await reportsCatalogueResponse(routeRequest,async()=>routeManifest,memoryCache(),fetchImpl);
 assert.equal(response.status,200);
 assert.equal((await response.json()).activities.length,6);
 assert.deepEqual(visited,['https://www.bungie.net/common/destiny2_content/json/activities.json','https://www.bungie.net/common/destiny2_content/json/redirected.json']);
 assert.deepEqual(headers,[BUNGIE_DEFINITION_USER_AGENT]);
});
test('shared definition helper rejects foreign or missing final origins',async()=>{
 for(const url of ['https://example.org/activities.json','http://www.bungie.net/activities.json','']){
  await assert.rejects(fetchBungieDefinitions(new URL('https://www.bungie.net/common/destiny2_content/json/activities.json'),async()=>bungieResponse(Response.json(definitions),url)),/unavailable/);
 }
});
test('each catalogue route failure reports its stage without leaking upstream secrets',async()=>{
 const secret='secret-token-and-api-key';
 const cases=[
  {stage:'manifest',load:async()=>{throw new Error(secret);},status:null},
  {stage:'manifest',load:async()=>({}),status:null},
  {stage:'fetch',fetch:async()=>{throw new Error(secret);},status:null},
  {stage:'fetch',fetch:async()=>bungieResponse(new Response(secret,{status:429})),status:429},
  {stage:'size',fetch:async()=>bungieResponse(new Response('{}',{headers:{'Content-Length':String(25*1024*1024)}})),status:200},
  {stage:'size',fetch:async()=>bungieResponse(new Response(new ReadableStream({start(controller){controller.error(new Error(secret));}}))),status:200},
  {stage:'parse',fetch:async()=>bungieResponse(new Response(secret)),status:200},
  {stage:'build',fetch:async()=>bungieResponse(Response.json(null)),status:200},
  {stage:'cache',cache:{async match(){throw new Error(secret);},async put(){}},status:null},
  {stage:'cache',cache:{async match(){return undefined;},async put(){throw new Error(secret);}},status:200}
 ];
 const original=console.error,logs:unknown[][]=[];console.error=(...args)=>logs.push(args);
 try{
  for(const fixture of cases){
   logs.length=0;const cache=fixture.cache||memoryCache();
   const response=await reportsCatalogueResponse(routeRequest,fixture.load||(async()=>routeManifest),cache,fixture.fetch||(async()=>bungieResponse(Response.json(definitions))));
   assert.equal(response.status,502);assert.equal(response.headers.get('Cache-Control'),'no-store');
   assert.deepEqual(await response.json(),{error:'reports_catalogue_unavailable',stage:fixture.stage});
   assert.equal(logs.length,1);assert.equal(logs[0][0],'reports_catalogue_failed');
   const diagnostic=logs[0][1] as {stage:string;message:string;bungieStatus:number|null};
   assert.deepEqual(Object.keys(diagnostic),['stage','message','bungieStatus']);
   assert.equal(diagnostic.stage,fixture.stage);assert.equal(diagnostic.bungieStatus,fixture.status);
   assert.ok(diagnostic.message.length>0);assert.ok(!JSON.stringify(logs).includes(secret));
   if('rows' in cache)assert.equal(cache.rows.size,0);
  }
 }finally{console.error=original;}
});
