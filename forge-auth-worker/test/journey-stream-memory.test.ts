import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return {shortCircuit:true,url:'data:text/javascript,export class DurableObject {}'};
 if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')&&!/\.[a-z]+$/.test(specifier)){
  const url=new URL(specifier+'.ts',context.parentURL);if(existsSync(url))return next(url.href,context);
 }return next(specifier,context);
}});
const {default:worker}=await import('../src/semantic-wrapper.ts');

// Production 27 Sep 2026: Journey JSON was cut off mid stream and the next request
// returned HTTP 503, because the Worker built four more pages and buffered whole
// copies of the Journey stream inside the same request. This guards all three causes.
test('a 45 MB Journey stream is pulled on demand, arrives complete and builds no other page',async t=>{
 const CHUNK=64*1024,TOTAL=45*1024*1024;
 let produced=0,bundleRequests:string[]=[],cacheWrites=0,cacheBytes=0,profileReads=0;
 const bundleStream=()=>{
  const head=new TextEncoder().encode('{"manifestVersion":"v1","publicData":"');
  const tail=new TextEncoder().encode('"}');
  const fill=new Uint8Array(CHUNK).fill(120);
  let sent=0,stage=0;
  return new ReadableStream<Uint8Array>({pull(controller){
   if(stage===0){controller.enqueue(head);stage=1;return;}
   if(sent<TOTAL){controller.enqueue(fill);sent+=CHUNK;produced+=CHUNK;return;}
   controller.enqueue(tail);controller.close();
  }},{highWaterMark:1});
 };
 const session={kind:'session',absoluteExpiresAt:Date.now()+86400000,accessExpiresAt:Date.now()+3600000,activeDestinyMembership:{membershipId:'4611686018400000001',membershipType:3},accessToken:'synthetic',refreshToken:'synthetic'};
 const env:any={APP_ORIGINS:'https://astrixparadox.com',BUNGIE_API_KEY:'synthetic',AUTH_RECORDS:{idFromName:(n:string)=>n,get:()=>({fetch:async(input:any,init:any)=>{
  const r=new Request(input,init),url=new URL(r.url);
  if(url.pathname==='/prepared-account'){if(r.method==='PUT'){cacheWrites++;cacheBytes+=(await r.arrayBuffer()).byteLength;return new Response(null,{status:204});}return new Response(null,{status:404});}
  return Response.json(session);
 }})},MANIFEST_DATA:{fetch:async(r:Request)=>{
  const url=new URL(r.url);
  if(url.pathname==='/page-bundle'){bundleRequests.push(url.searchParams.get('page')||'');return new Response(bundleStream(),{headers:{'Content-Type':'application/json'}});}
  return Response.json({manifestVersion:'v1',tables:{}});
 }}};
 t.mock.method(globalThis,'fetch',async(input:any)=>{
  const url=String(input?.url||input);
  if(/GetProfile|\/Profile\//.test(url))profileReads++;
  return Response.json({ErrorCode:1,Response:{characters:{data:{c:{characterId:'c',light:2000,classType:0}}},characterEquipment:{data:{c:{items:[]}}},characterInventories:{data:{c:{items:[]}}},profileInventory:{data:{items:[]}},itemComponents:{}}});
 });
 const jobs:Promise<any>[]=[];const ctx:any={waitUntil:(p:Promise<any>)=>jobs.push(p)};
 const response=await worker.fetch(new Request('https://auth.astrixparadox.com/bungie/page/journey?freshness=live',{headers:{Cookie:'astrix_session=synthetic'}}),env,ctx);
 assert.equal(response.status,200);
 const reader=response.body!.getReader();
 let received=0;const parts:Uint8Array[]=[];
 for(;;){
  const {done,value}=await reader.read();if(done)break;
  received+=value.byteLength;parts.push(value);
  // Backpressure: the Worker may never run far ahead of what the client consumed.
  // The bounded cache copy (16 MB cap) is the only allowed lead.
  assert.ok(produced<=received+17*1024*1024,`Worker buffered ${produced-received} bytes ahead of the client`);
 }
 await Promise.all(jobs);
 const body=new TextDecoder().decode(Buffer.concat(parts.map(p=>Buffer.from(p))));
 const parsed=JSON.parse(body);
 assert.equal(parsed.prepared.publicData.length,TOTAL,'The full public bundle must arrive intact');
 assert.deepEqual(bundleRequests,['journey'],'A Journey request must build no other page');
 assert.ok(cacheWrites===1&&cacheBytes<1024*1024,'Only the small account part may enter the backend cache, never the public bundle');
 console.log(`JOURNEY_STREAM_MEMORY=PASS bytes=${received} maxLead<=17MB otherPages=0 cacheWrites=${cacheWrites}`);
});
