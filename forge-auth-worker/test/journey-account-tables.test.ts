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

// Production 28 Sep 2026: a veteran account's Journey page was 60.7 MB on the
// wire, 47.5 MB of it account definitions (33.2 MB inventory items, 7 MB
// collectibles) that Journey never renders. Journey resolves only the item
// identities it shows: equipment and quest steps, projected to display fields.
test('Journey account definitions skip collectible, reward and craftable items',async t=>{
 const requested:Record<string,Set<string>>={};
 const EQUIPPED=1001,QUEST=2001,STEP=2002,UNINSTANCED=2003,QUESTLINE=2004,REWARD=3001,COLLECTIBLE_ITEM=3002,CRAFTABLE=3003,COLLECTIBLE=4001,RECORD=5001;
 const session={kind:'session',absoluteExpiresAt:Date.now()+86400000,accessExpiresAt:Date.now()+3600000,activeDestinyMembership:{membershipId:'synthetic',membershipType:3},accessToken:'synthetic',refreshToken:'synthetic'};
 const row=(type:string,hash:string)=>type==='DestinyInventoryItemDefinition'
  ?{hash:Number(hash),displayProperties:{name:`Item ${hash}`,icon:'/i.png'},itemTypeAndTierDisplayName:'Quest Step',inventory:{bucketTypeHash:1,tierType:2,stackUniqueLabel:'x'},objectives:{questlineItemHash:hash===String(STEP)?QUESTLINE:0,objectiveHashes:[],displayActivityHashes:[1]},sockets:{socketEntries:[{singleInitialItemHash:REWARD}]},perks:[{perkHash:1}],investmentStats:[{statTypeHash:1}]}
  :type==='DestinyRecordDefinition'?{hash:Number(hash),displayProperties:{name:'Record'},rewardItems:[{itemHash:REWARD}]}
  :{hash:Number(hash)};
 const env:any={APP_ORIGINS:'https://astrixparadox.com',BUNGIE_API_KEY:'synthetic',AUTH_RECORDS:{idFromName:(n:string)=>n,get:()=>({fetch:async(input:any,init:any)=>{
  const r=new Request(input,init),url=new URL(r.url);
  if(url.pathname==='/prepared-page')return new Response(null,{status:r.method==='PUT'?204:404});
  if(url.pathname==='/prepared-read')return Response.json({Response:{}});
  return Response.json(session);
 }})},MANIFEST_DATA:{fetch:async(r:Request)=>{
  const url=new URL(r.url);
  if(url.pathname==='/resolve'){
   const body=await r.json() as any;const tables:any={};
   for(const [type,hashes] of Object.entries(body.requests) as [string,number[]][]){
    requested[type]??=new Set();tables[type]={};
    for(const hash of hashes){requested[type].add(String(hash));tables[type][String(hash)]=row(type,String(hash));}
   }
   return Response.json({manifestVersion:'v1',projection:'page',tables});
  }
  if(url.pathname==='/page-bundle')return Response.json({manifestVersion:'v1',manifestTables:{}});
  if(url.pathname==='/page-index')return Response.json({manifestVersion:'v1',definitionHashes:{}});
  return Response.json({manifestVersion:'v1'});
 }}};
 t.mock.method(globalThis,'fetch',async()=>Response.json({ErrorCode:1,Response:{
  characters:{data:{c:{characterId:'c',light:2000,classType:0}}},
  characterEquipment:{data:{c:{items:[{itemHash:EQUIPPED}]}}},
  characterInventories:{data:{c:{items:[]}}},profileInventory:{data:{items:[{itemHash:9999,bucketHash:138197802},{itemHash:9998,bucketHash:1}]}},
  characterProgressions:{data:{c:{quests:[{questHash:QUEST,stepHash:STEP,stepObjectives:[]}],uninstancedItemObjectives:{[UNINSTANCED]:[]}}}},
  profileCollectibles:{data:{collectibles:{[COLLECTIBLE]:{state:0}},collectionBadgesRootNodeHash:498211331}},
  characterCollectibles:{data:{c:{collectibles:{[COLLECTIBLE]:{state:0}}}}},
  profileRecords:{data:{records:{[RECORD]:{state:0,objectives:[]}}}},
  characterCraftables:{data:{c:{craftables:{[CRAFTABLE]:{visible:true,sockets:[]}},craftingRootNodeHash:3442838224}}},
  itemComponents:{}
 }}));
 const jobs:Promise<any>[]=[];
 const response=await worker.fetch(new Request('https://auth.astrixparadox.com/bungie/page/journey?freshness=live',{headers:{Cookie:'astrix_session=synthetic'}}),env,{waitUntil:(p:Promise<any>)=>jobs.push(p)} as any);
 assert.equal(response.status,200);
 const parsed=JSON.parse(await response.text());await Promise.all(jobs);
 const items=[...(requested.DestinyInventoryItemDefinition||[])].sort();
 assert.deepEqual(items,[EQUIPPED,QUEST,STEP,UNINSTANCED,QUESTLINE,9999].map(String).sort(),'only equipped, vault, quest, step and questline items');
 assert.ok(!requested.DestinyCollectibleDefinition?.has(String(COLLECTIBLE)),'account collectibles are not resolved');
 assert.ok(requested.DestinyRecordDefinition?.has(String(RECORD)),'account records still resolve');
 assert.ok(requested.DestinyPresentationNodeDefinition?.has('3442838224'),'crafting root node still resolves for Patterns');
 const tableItems=parsed.account.journeyAccountManifestTables.DestinyInventoryItemDefinition;
 const step=tableItems[String(STEP)];
 assert.equal(step.displayProperties.name,`Item ${STEP}`);
 assert.equal(step.objectives.questlineItemHash,QUESTLINE);
 assert.equal(step.inventory.bucketTypeHash,1);
 for(const field of ['sockets','perks','investmentStats'])assert.ok(!(field in step),`${field} is not shipped to Journey`);
 assert.ok(!('stackUniqueLabel' in step.inventory));
});
