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
test('runtime serves ten fresh profiles without reloading a matching public bundle',async t=>{
 let version='v1',bundleReads=0,profileReads=0,cacheWrites=0;const cacheBodies:string[]=[];
 const session={kind:'session',absoluteExpiresAt:Date.now()+86400000,accessExpiresAt:Date.now()+3600000,activeDestinyMembership:{membershipId:'4611686018400000001',membershipType:3},accessToken:'synthetic',refreshToken:'synthetic'};
 const env:any={APP_ORIGINS:'https://astrixparadox.com',BUNGIE_API_KEY:'synthetic',AUTH_RECORDS:{idFromName:(n:string)=>n,get:()=>({fetch:async(input:any,init:any)=>{
  const r=new Request(input,init),url=new URL(r.url);
  if(url.pathname==='/prepared-account'){if(r.method==='PUT'){cacheWrites++;cacheBodies.push(await r.text());return new Response(null,{status:204});}return new Response(null,{status:404});}
  return Response.json(session);
 }})},MANIFEST_DATA:{fetch:async(r:Request)=>{
  const path=new URL(r.url).pathname;
  if(path==='/page-bundle'){bundleReads++;return Response.json({manifestVersion:version,publicData:'d'.repeat(1024*1024),artifactCatalog:[]});}
  return Response.json({manifestVersion:version,tables:{}});
 }}};
 t.mock.method(globalThis,'fetch',async()=>{
  profileReads++;
  return Response.json({ErrorCode:1,Response:{characters:{data:{c:{characterId:'c',light:100+profileReads}}},characterEquipment:{data:{c:{items:[]}}},characterInventories:{data:{c:{items:[]}}},profileInventory:{data:{items:[]}},itemComponents:{}}});
 });
 const jobs:Promise<any>[]=[];const ctx:any={waitUntil:(p:Promise<any>)=>jobs.push(p)};
 const request=(cached='')=>worker.fetch(new Request('https://auth.astrixparadox.com/bungie/page/character?freshness=live'+(cached?'&manifestVersion='+cached:''),{headers:{Cookie:'astrix_session=synthetic'}}),env,ctx);
 const cold=await request();assert.equal(cold.status,200);const coldText=await cold.text();await Promise.all(jobs);
 assert.equal(bundleReads,1);assert.ok(coldText.length>1024*1024);
 const sizes=[];
 for(let i=0;i<10;i++){
  const r=await request('v1');assert.equal(r.status,200);const text=await r.text(),body=JSON.parse(text);
  assert.equal(body.account.authenticated,true);assert.equal(body.account.profile.characters.data.c.light,102+i);
  assert.deepEqual(body.prepared,{manifestVersion:'v1',bundleCached:true});sizes.push(text.length);
 }
 assert.equal(bundleReads,1);assert.equal(profileReads,11);await Promise.all(jobs);assert.equal(cacheWrites,11,'Every live build refreshes the account cache');
 assert.ok(cacheBodies.every(body=>!body.includes('publicData')&&!body.includes('bundleCached')),'The account cache never holds the public bundle or a bundle reference');
 assert.equal(new Set(sizes).size,1);assert.ok(sizes[0]<coldText.length-1024*1024);
 version='v2';const changed=await request('v1');assert.equal((await changed.json() as any).prepared.manifestVersion,'v2');assert.equal(bundleReads,2);await Promise.all(jobs);
 console.log(`PROFILE_ONLY_WORKER_BYTES cold=${coldText.length} warm=${sizes[0]} ten-loads-flat=true`);
});
