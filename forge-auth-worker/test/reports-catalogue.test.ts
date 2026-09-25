import {test} from 'node:test';
import assert from 'node:assert/strict';
import {activityIdentity,buildReportsCatalogue,reportsCatalogue,REPORTS_SCHEMA} from '../src/reports-catalogue.ts';
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
  for(const activityModeTypes of [[4],[82]])assert.throws(()=>buildReportsCatalogue({1:{hash:1,displayProperties:{name:'Missing release'},activityModeTypes}},'fixture'),/Missing Reports release order/);
});
test('edge catalogue is keyed by manifest version, public and contains no player data',async()=>{
  const cache=memoryCache();let fetches=0;
  const fetchImpl=async(input: URL|RequestInfo,options?: RequestInit)=>{fetches++;assert.equal(new URL(String(input)).origin,'https://www.bungie.net');assert.equal(options?.headers,undefined);assert.equal(options?.redirect,'error');return Response.json(definitions);};
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
  await assert.rejects(reportsCatalogue(request,manifest,cache,async()=>new Response('fail',{status:429})),/unavailable/);
  await assert.rejects(reportsCatalogue(request,manifest,cache,async()=>new Response('{}',{headers:{'Content-Length':String(25*1024*1024)}})),/unavailable/);
  let sent=0;
  await assert.rejects(reportsCatalogue(request,manifest,cache,async()=>new Response(new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(1024*1024));if(++sent===25)controller.close();}}))),/too large/);
  assert.equal(cache.rows.size,0);
});
