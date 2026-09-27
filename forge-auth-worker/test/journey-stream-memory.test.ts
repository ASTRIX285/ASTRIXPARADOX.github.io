import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
registerHooks({resolve(specifier,context,next){
  if(specifier==='cloudflare:workers')return {shortCircuit:true,url:'data:text/javascript,export class DurableObject {}'};
  if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')&&!/\.[a-z]+$/.test(specifier)){
    const url=new URL(specifier+'.ts',context.parentURL);if(existsSync(url))return next(url.href,context);
  }return next(specifier,context);
}});
const {pagePayloadRoute}=await import('../src/index.ts');
const MiB=1024*1024,ceiling=128*MiB,resident=100*MiB;

test('45 MB Journey stream respects a simulated 128 MB ceiling with a slow consumer and profile-only cache',async t=>{
  const session={kind:'session',absoluteExpiresAt:Date.now()+86400000,accessExpiresAt:Date.now()+3600000,activeDestinyMembership:{membershipId:'synthetic',membershipType:3},accessToken:'synthetic',refreshToken:'synthetic'};
  const profile=Object.fromEntries(['characters','profileInventory','profileProgression','characterInventories','characterProgressions','characterActivities','characterEquipment','profilePresentationNodes','characterPresentationNodes','profileCollectibles','characterCollectibles','profileRecords','characterRecords','metrics','characterCraftables'].map(k=>[k,{data:{}}]));
  profile.characters.data={c:{characterId:'c'}};
  let produced=0,consumed=0,peak=resident,profileReads=0,bundleReads=0,cacheBody='',version='v1',cancelled=false;
  const expectedHash=createHash('sha256');
  const prefix=Buffer.from('{"manifestVersion":"v1","padding":"'),suffix=Buffer.from('"}');
  const publicBytes=45*MiB,fillBytes=publicBytes-prefix.length-suffix.length;
  function publicStream(){
    let remaining=fillBytes,stage=0;
    return new ReadableStream<Uint8Array>({pull(controller){
      const bytes=stage++===0?prefix:remaining?Buffer.alloc(Math.min(64*1024,remaining),120):suffix;
      if(stage>1&&remaining)remaining-=bytes.length;
      produced+=bytes.length;expectedHash.update(bytes);
      // Reserve 100 MB for the account/runtime. Track all unread public bytes,
      // including a slow client or a tee branch. Buffering 45 MB must fail.
      peak=Math.max(peak,resident+produced-consumed);
      assert.ok(peak<=ceiling,`simulated Worker memory ${peak} exceeds ${ceiling}`);
      controller.enqueue(bytes);
      if(bytes===suffix)controller.close();
    },cancel(){cancelled=true;}});
  }
  const env:any={APP_ORIGINS:'https://astrixparadox.com',BUNGIE_API_KEY:'synthetic',AUTH_RECORDS:{idFromName:(n:string)=>n,get:()=>({fetch:async(input:any,init:any)=>{
    const r=new Request(input,init),url=new URL(r.url);
    if(url.pathname==='/prepared-page'){
      assert.equal(url.searchParams.get('manifestVersion'),`profile-v1:${version}`);
      if(r.method==='PUT'){
        cacheBody=await r.text();const body=JSON.parse(cacheBody);
        assert.deepEqual(Object.keys(body).sort(),['authenticated','components','displaySnapshot','membership','profile']);
        assert.ok(cacheBody.length<10000);return new Response(null,{status:204});
      }
      return cacheBody?new Response(cacheBody):new Response(null,{status:404});
    }
    if(url.pathname==='/prepared-read')return Response.json({Response:{activities:[]}});
    return Response.json(session);
  }})},MANIFEST_DATA:{fetch:async(r:Request)=>{
    const path=new URL(r.url).pathname;
    if(path==='/page-bundle'){bundleReads++;return new Response(publicStream());}
    return Response.json({manifestVersion:version,tables:{},definitionHashes:{DestinyGuardianRankConstantsDefinition:[1]}});
  }}};
  t.mock.method(globalThis,'fetch',async()=>{profileReads++;return Response.json({ErrorCode:1,Response:profile});});
  // A cache tee would allocate a second complete envelope even with a fast
  // consumer. It is forbidden independently of the memory simulation.
  t.mock.method(Response.prototype,'clone',()=>{throw new Error('Worker must not clone streamed page responses');});
  const jobs:Promise<any>[]=[];const ctx:any={waitUntil:(job:Promise<any>)=>jobs.push(job)};
  const request=(freshness='live',cached='')=>new Request(`https://auth.astrixparadox.com/bungie/page/journey?freshness=${freshness}${cached?'&manifestVersion='+cached:''}`,{headers:{Cookie:'astrix_session=synthetic'}});
  const start=performance.now();
  const response=await pagePayloadRoute(request(),env,'journey',ctx,{warmWorkspace:false});
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.ok(produced<=64*1024,'Public data must wait for downstream demand');
  const accountBytes=Number(response.headers.get('X-Forge-Account-Bytes'));
  const envelopePrefix=Buffer.byteLength('{"schemaVersion":2,"transport":"prepared-page-stream-v1","account":');
  const publicStart=envelopePrefix+accountBytes+Buffer.byteLength(',"prepared":');
  const actualHash=createHash('sha256');let received=0,last='';
  const reader=response.body!.getReader();
  while(true){
    const {done,value}=await reader.read();if(done)break;
    const start=Math.max(0,publicStart-received),end=Math.min(value.length,publicStart+publicBytes-received);
    if(end>start){actualHash.update(value.subarray(start,end));consumed+=end-start;}
    received+=value.length;last=Buffer.from(value).toString();
    if(consumed%(1024*1024)<65536)await new Promise(resolve=>setTimeout(resolve,1));
  }
  await Promise.all(jobs);
  assert.equal(received,publicStart+publicBytes+1);assert.equal(last,'}');
  assert.equal(actualHash.digest('hex'),expectedHash.digest('hex'),'All public bytes arrive unchanged');
  assert.equal(consumed,publicBytes);assert.equal(profileReads,1);assert.ok(cacheBody);
  const warm=await pagePayloadRoute(request('display','v1'),env,'journey',undefined,{warmWorkspace:false});
  const warmBody=await warm.json() as any;
  assert.equal(warm.headers.get('X-Forge-Prepared-Page-Source'),'backend-cache');
  assert.equal(warmBody.prepared.bundleCached,true);assert.equal(profileReads,1);assert.equal(bundleReads,1);
  assert.deepEqual(warmBody.account.profile,profile);
  const refreshed=await pagePayloadRoute(request('display','v1'),env,'journey',ctx,{warmWorkspace:false});
  await refreshed.body?.cancel();await Promise.all(jobs);
  assert.equal(profileReads,2,'Warm display refreshes the live profile in the background');
  assert.equal(bundleReads,1,'Background refresh never downloads the public bundle');
  assert.equal(cancelled,false);
  console.log(`JOURNEY_STREAM bytes=${received} wallMs=${(performance.now()-start).toFixed(1)} simulatedPeakBytes=${peak} ceilingBytes=${ceiling}`);
});
