import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return {shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent('export class DurableObject { constructor(ctx,env){this.ctx=ctx;this.env=env;} }')};
 if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')&&!/\.[a-z]+$/.test(specifier)){
  const url=new URL(specifier+'.ts',context.parentURL);if(existsSync(url))return next(url.href,context);
 }return next(specifier,context);
}});
const {default:worker,AuthRecord}=await import('../src/semantic-wrapper.ts');

const ACCOUNT_A={membershipType:3,membershipId:'4611686018400000001'};
const ACCOUNT_B={membershipType:3,membershipId:'4611686018400000002'};

class MemoryStorage {
 rows=new Map<string,any>();alarm=0;
 async get(key:string|string[]){if(Array.isArray(key))return new Map(key.filter(row=>this.rows.has(row)).map(row=>[row,this.rows.get(row)]));return this.rows.get(key);}
 async put(key:string,value:unknown){this.rows.set(key,value);}
 async delete(key:string|string[]){if(Array.isArray(key))return key.filter(row=>this.rows.delete(row)).length;return this.rows.delete(key);}
 async list({prefix='',limit=Infinity}:{prefix?:string;limit?:number}={}){return new Map([...this.rows].filter(([key])=>key.startsWith(prefix)).slice(0,limit));}
 async transaction<T>(fn:(tx:any)=>Promise<T>):Promise<T>{return fn(this);}
 async setAlarm(value:number){this.alarm=value;}
 async deleteAlarm(){this.alarm=0;}
}

// Real Worker routes and the real session Durable Object; only Bungie, the manifest
// service and Durable Object storage are replaced.
function harness(t:any){
 const now=Date.now();
 const storage=new MemoryStorage();
 storage.rows.set('record',{kind:'session',createdAt:now,lastUsedAt:now,absoluteExpiresAt:now+86400000,accessToken:'synthetic-access',refreshToken:'synthetic-refresh',accessExpiresAt:now+3600000,refreshExpiresAt:now+86400000,bungieMembershipId:'1',destinyMemberships:[ACCOUNT_A,ACCOUNT_B],primaryMembershipId:ACCOUNT_A.membershipId,activeDestinyMembership:ACCOUNT_A,csrfToken:'synthetic-csrf'});
 const records:Promise<unknown>[]=[];
 const env:any={APP_ORIGINS:'https://astrixparadox.com',BUNGIE_API_KEY:'synthetic',BUNGIE_CLIENT_ID:'synthetic',BUNGIE_CLIENT_SECRET:'synthetic'};
 const record=new AuthRecord({storage,id:{toString:()=>'synthetic'},waitUntil:(task:Promise<unknown>)=>records.push(task)} as any,env);
 const doCalls:string[]=[];
 env.AUTH_RECORDS={idFromName:(name:string)=>name,get:()=>({fetch:(input:any,init:any)=>{const request=new Request(input,init);doCalls.push(`${request.method} ${new URL(request.url).pathname}`);return record.fetch(request);}})};
 env.MANIFEST_DATA={fetch:async(request:Request)=>{
  const path=new URL(request.url).pathname;
  if(path==='/page-bundle')return Response.json({manifestVersion:'v1',publicData:'bundle',artifactCatalog:[]});
  if(path==='/status')return Response.json({manifestVersion:'v1'});
  return Response.json({manifestVersion:'v1',tables:{}});
 }};
 let bungieReads=0;
 t.mock.method(globalThis,'fetch',async(input:any)=>{
  const url=String(input?.url||input);
  if(!/bungie\.net\/Platform\/Destiny2\/\d+\/Profile\//.test(url))throw new Error(`Unexpected fetch ${url}`);
  bungieReads++;
  const membershipId=url.match(/Profile\/(\d+)\//)![1];
  return Response.json({ErrorCode:1,Response:{characters:{data:{c:{characterId:'c',light:1000+bungieReads,membershipId}}},characterEquipment:{data:{c:{items:[]}}},characterInventories:{data:{c:{items:[]}}},profileInventory:{data:{items:[]}},itemComponents:{}}});
 });
 t.mock.method(console,'info',()=>{});
 const jobs:Promise<unknown>[]=[];
 const ctx:any={waitUntil:(task:Promise<unknown>)=>jobs.push(task)};
 const page=async(query:string)=>{
  const response=await worker.fetch(new Request(`https://auth.astrixparadox.com/bungie/page/character?${query}`,{headers:{Cookie:'astrix_session=synthetic'}}),env,ctx);
  const text=await response.text();
  return {response,text,body:JSON.parse(text)};
 };
 const settle=async()=>{while(jobs.length||records.length){await Promise.all(jobs.splice(0));await Promise.all(records.splice(0));}};
 const metaKey=(account=ACCOUNT_A)=>`prepared-account:${account.membershipType}:${account.membershipId}:character:meta`;
 return {storage,record,env,page,settle,metaKey,doCalls,bungieReads:()=>bungieReads};
}

test('a returning visitor who holds the bundle gets the cached account part without a Bungie rebuild',async t=>{
 const h=harness(t);
 const first=await h.page('freshness=display');
 assert.equal(first.response.status,200);
 assert.equal(first.body.account.preparedCache,undefined,'A fresh build is not labelled as cached');
 await h.settle();
 assert.ok(h.storage.rows.get(h.metaKey()),'The account part is stored even though the bundle was sent');
 const reads=h.bungieReads();
 const held=await h.page('freshness=display&manifestVersion=v1');
 assert.equal(held.response.status,200);
 assert.equal(h.bungieReads(),reads,'No Bungie read on a cache hit');
 assert.equal(held.response.headers.get('X-Forge-Prepared-Page-Source'),'backend-cache');
 assert.match(held.response.headers.get('X-Forge-Prepared-Page-Age')||'',/^\d+$/);
 assert.deepEqual(held.body.prepared,{manifestVersion:'v1',bundleCached:true});
 assert.equal(held.body.account.preparedCache.source,'backend-cache');
 assert.equal(held.body.account.preparedCache.revalidating,false);
 assert.equal(held.body.account.preparedCache.dataAt,first.body.account.pageReady.accountDataAt);
 assert.deepEqual(held.body.account.profile,first.body.account.profile);
 const noBundle=await h.page('freshness=display');
 assert.equal(noBundle.body.account.preparedCache.source,'backend-cache','The cache is used when the client has no bundle too');
 assert.equal(noBundle.body.prepared.publicData,'bundle');
});

test('stale-while-revalidate serves the cached data with its age, then rebuilds and stores it',async t=>{
 const h=harness(t);
 const first=await h.page('freshness=display');await h.settle();
 const meta=h.storage.rows.get(h.metaKey());meta.dataAt-=5*60_000;
 const reads=h.bungieReads();
 const stale=await h.page('freshness=display&manifestVersion=v1');
 assert.equal(stale.body.account.preparedCache.revalidating,true);
 assert.ok(stale.body.account.preparedCache.ageMs>=5*60_000,'The real age of the data is reported');
 assert.ok(Number(stale.response.headers.get('X-Forge-Prepared-Page-Age'))>=300);
 assert.equal(stale.body.account.profile.characters.data.c.light,first.body.account.profile.characters.data.c.light,'The stale copy is served first');
 await h.settle();
 assert.equal(h.bungieReads(),reads+1,'Exactly one background rebuild, for this page only');
 const updated=await h.page('freshness=display&manifestVersion=v1');
 assert.equal(updated.body.account.preparedCache.source,'backend-cache');
 assert.ok(updated.body.account.preparedCache.ageMs<60_000);
 assert.equal(updated.body.account.profile.characters.data.c.light,1000+reads+1,'The rebuilt account replaced the stale one');
 assert.equal(updated.body.account.preparedCache.revalidating,false);
});

test('a live request never reads the cache and always rebuilds from Bungie',async t=>{
 const h=harness(t);
 await h.page('freshness=display');await h.settle();
 const reads=h.bungieReads();h.doCalls.length=0;
 const live=await h.page('freshness=live&manifestVersion=v1');
 assert.equal(h.bungieReads(),reads+1);
 assert.equal(live.body.account.preparedCache,undefined);
 assert.equal(live.body.account.pageReady.accountFreshness,'live');
 assert.equal(h.doCalls.includes('GET /prepared-account'),false,'Live never reads the cached account');
 await h.settle();
 const after=await h.page('freshness=display&manifestVersion=v1');
 assert.equal(after.body.account.profile.characters.data.c.light,live.body.account.profile.characters.data.c.light,'The live result refreshed the cache');
});

test('cached account data never crosses accounts and is cleared on sign-out',async t=>{
 const h=harness(t);
 await h.page('freshness=display');await h.settle();
 assert.ok(h.storage.rows.get(h.metaKey(ACCOUNT_A)));
 h.storage.rows.get('record').activeDestinyMembership=ACCOUNT_B;
 const switched=await h.page('freshness=display&manifestVersion=v1');
 assert.equal(switched.body.account.preparedCache,undefined,'Account B never receives account A data');
 assert.equal(switched.body.account.membership.membershipId,ACCOUNT_B.membershipId);
 assert.equal(switched.body.account.profile.characters.data.c.membershipId,ACCOUNT_B.membershipId);
 const write=await h.record.fetch(new Request(`https://internal/prepared-account?page=character&manifestVersion=v1&membership=${ACCOUNT_A.membershipType}:${ACCOUNT_A.membershipId}&dataAt=${Date.now()}`,{method:'PUT',body:'{"membership":"A"}'}));
 assert.equal(write.status,409,'A build for account A cannot be stored while account B is active');
 const read=await h.record.fetch(new Request('https://internal/prepared-account?page=character&manifestVersion=v1'));
 assert.equal(read.status,404,'Account A cache is not readable as account B');
 await h.settle();
 assert.ok(h.storage.rows.get(h.metaKey(ACCOUNT_B)));
 const out=await worker.fetch(new Request('https://auth.astrixparadox.com/logout',{method:'POST',headers:{Cookie:'astrix_session=synthetic'}}),h.env,{waitUntil(){}} as any);
 assert.equal(out.status,200);
 assert.deepEqual([...h.storage.rows.keys()].filter(key=>/^(prepared-account|prepared-page|profile):/.test(key)),[],'Sign-out removes every cached account part and profile copy');
});

test('the manifest fetch runs alongside the profile read and the payload stays identical',async t=>{
 const run=async(manifestDelay:number)=>{
  const events:string[]=[];
  const session={kind:'session',absoluteExpiresAt:Date.now()+86400000,accessExpiresAt:Date.now()+3600000,activeDestinyMembership:ACCOUNT_A,accessToken:'synthetic',refreshToken:'synthetic'};
  const env:any={APP_ORIGINS:'https://astrixparadox.com',BUNGIE_API_KEY:'synthetic',AUTH_RECORDS:{idFromName:(n:string)=>n,get:()=>({fetch:async(input:any,init:any)=>{
   const r=new Request(input,init),url=new URL(r.url);
   if(url.pathname==='/prepared-account')return new Response(null,{status:r.method==='PUT'?204:404});
   return Response.json(session);
  }})},MANIFEST_DATA:{fetch:async(r:Request)=>{
   const path=new URL(r.url).pathname;
   if(path==='/page-bundle'||path==='/page-index'){events.push(`${path}:start`);await new Promise(resolve=>setTimeout(resolve,manifestDelay));events.push(`${path}:end`);}
   if(path==='/page-bundle')return Response.json({manifestVersion:'v1',publicData:'bundle',artifactCatalog:[]});
   if(path==='/page-index')return Response.json({manifestVersion:'v1',weaponDefinitionHashes:[],definitionHashes:{}});
   return Response.json({manifestVersion:'v1',tables:{}});
  }}};
  const mock=t.mock.method(globalThis,'fetch',async()=>{
   events.push('profile:start');await new Promise(resolve=>setTimeout(resolve,20));events.push('profile:end');
   return Response.json({ErrorCode:1,Response:{characters:{data:{c:{characterId:'c',light:2000}}},characterEquipment:{data:{c:{items:[]}}},characterInventories:{data:{c:{items:[]}}},profileInventory:{data:{items:[]}},itemComponents:{}}});
  });
  const jobs:Promise<unknown>[]=[];
  const response=await worker.fetch(new Request('https://auth.astrixparadox.com/bungie/page/build-forge?freshness=live',{headers:{Cookie:'astrix_session=synthetic'}}),env,{waitUntil:(task:Promise<unknown>)=>jobs.push(task)} as any);
  const text=await response.text();await Promise.all(jobs);mock.mock.restore();
  return {events,text:text.replace(/"(generatedAt|accountDataAt)":\d+/g,'"$1":0')};
 };
 t.mock.method(console,'info',()=>{});
 const fast=await run(0),slow=await run(60);
 assert.ok(slow.events.indexOf('/page-bundle:start')<slow.events.indexOf('profile:end'),`Bundle fetch starts before the profile read ends: ${slow.events.join(', ')}`);
 assert.ok(slow.events.indexOf('/page-index:start')<slow.events.indexOf('profile:end'),'Index fetch starts before the profile read ends');
 assert.ok(slow.events.indexOf('profile:end')<slow.events.indexOf('/page-bundle:end'),'The slow manifest still finished after the profile read');
 assert.equal(slow.text,fast.text,'Fetch order never changes the payload');
});
