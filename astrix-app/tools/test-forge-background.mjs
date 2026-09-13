import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {ForgePreparationClient,preparationVariants} from '../pages/guardian-workspace-v2/paradox-build-space/paradox-forge-preparation.mjs';
import {prepareForgeSequence} from '../pages/guardian-workspace-v2/paradox-build-space/paradox-forge-sequence.mjs';
import {voidLoopSource,nothingManaclesCandidate} from './validate-paradox-build-space.mjs';

const artifact={hash:999,artifactHash:999,name:'Test Artifact',seasonNumber:31,pointsUsed:2,state:'resolved',provenance:'bungie-character-progressions-202',perks:[
  {hash:9101,name:'Void Recovery',description:'Void effects grant overshield.',tierIndex:0,itemIndex:0,column:1,order:1,minimumUnlockPointsUsedRequirement:0},
  {hash:9102,name:'Grenade Engine',description:'Grenade final blows grant grenade energy.',tierIndex:0,itemIndex:1,column:1,order:2,minimumUnlockPointsUsedRequirement:0}
].map(p=>({...p,displayResolved:true,unresolved:false,isActive:true,isVisible:true,tierUnlocked:true})),activePerks:[]};
artifact.activePerks=artifact.perks;
const characterId='81001',weaponBuckets=[1498876634,2465295065,953998645],armourBuckets=[3448274439,3551918588,14239492,20886954,1585787867],weaponIds=new Map(),currentWeaponIds=new Set((voidLoopSource.weapons||[]).map(row=>String(row.itemInstanceId||'')));
const exactWeapon=(row,index)=>{const prior=String(row.itemInstanceId||row.hash||index);if(!weaponIds.has(prior))weaponIds.set(prior,String(82001+weaponIds.size));return {...row,itemHash:Number(row.itemHash??row.hash),itemInstanceId:weaponIds.get(prior),bucketHash:Number(row.bucketHash??weaponBuckets[index%3]),source:{kind:currentWeaponIds.has(prior)?'equipped':'vault',characterId:currentWeaponIds.has(prior)?characterId:null}};};
const exactArmour=(voidLoopSource.armour||[]).map((row,index)=>({...row,itemHash:Number(row.itemHash??row.hash),itemInstanceId:String(83001+index),bucketHash:armourBuckets[index],classType:1,source:{kind:'equipped',characterId}}));
const exoticAnchorId=exactArmour.find(row=>row.isExotic)?.itemInstanceId||exactArmour[1].itemInstanceId;
const build={...voidLoopSource,characterId,membershipId:'84001',membershipType:'3',characterClass:'hunter',weapons:(voidLoopSource.weapons||[]).map(exactWeapon),ownedWeapons:(voidLoopSource.ownedWeapons||[]).map(exactWeapon),armour:exactArmour,forgeLoaderDecision:{...voidLoopSource.forgeLoaderDecision,buildAnchor:{...voidLoopSource.forgeLoaderDecision.buildAnchor,selectedItemInstanceId:exoticAnchorId}},artifact,currentSeasonNumber:31,artifactConfiguration:{artifactHash:999,seasonNumber:31,selectedPerkHashes:[9101,9102],source:'bungie-live'},activityContext:{schemaVersion:1,key:'dps',name:'DPS',domain:'pve',source:'user-selected-build-context'}};
const before=JSON.stringify(build),variant={element:'void',objective:'dps',superHash:102},candidates=[{element:'void',candidate:nothingManaclesCandidate}];
const result=await prepareForgeSequence({build,candidate:nothingManaclesCandidate,...variant,currentSeasonNumber:31},{advise:async()=>{}});
assert.equal(result.patch.super.hash,102,'An explicitly selected verified Super must survive generation.');
assert.equal(result.patch.subclassBuild.grenade.hash,114,'Nothing Manacles must still force Scatter Grenade.');
assert.equal(result.patch.liveTransferPreflight.ready,true);
assert.equal(result.patch.artifactRecommendation.selectionStatus,'ready');
assert.equal(JSON.stringify(build),before,'Preparation cannot change live or staged inputs.');
assert.equal('ownedWeapons' in result.patch,false,'Prepared results must not duplicate the owned catalogue.');
const reviewOnlyResult=await prepareForgeSequence({build:{...build,membershipId:''},candidate:nothingManaclesCandidate,...variant,currentSeasonNumber:31},{advise:async()=>{}});
assert.ok(reviewOnlyResult.patch.recommendationGeneratedAt,'A coherent generated build must remain reviewable when Apply is unavailable.');
assert.equal(reviewOnlyResult.patch.liveTransferPreflight.ready,false,'Apply preflight blockers must be retained as review information.');
assert.match(reviewOnlyResult.patch.liveTransferPreflight.violations.join(' | '),/Bungie Guardian and Destiny membership binding/,'A generated review must explain why Apply remains blocked.');
await assert.rejects(prepareForgeSequence({build,candidate:nothingManaclesCandidate,...variant,superHash:999999}),/selected Super/);
await assert.rejects(prepareForgeSequence({build:{},candidate:nothingManaclesCandidate,...variant}),/Forge Loader/);
await assert.rejects(prepareForgeSequence({build:{...build,activityContext:null},candidate:nothingManaclesCandidate,...variant}),/Select Raid, DPS, Grandmaster, Crucible, PVE or PVP/,'Generate must return an explicit activity requirement instead of waiting indefinitely.');
const unresolvedWeapons=[...(build.ownedWeapons||[])].map(weapon=>({...weapon,weaponSemantics:{...(weapon.weaponSemantics||{}),perkModel:{...(weapon.weaponSemantics?.perkModel||{}),expectedRowCount:0,columns:[]}}}));
const partialAnchorPerk=build.forgeLoaderDecision.buildAnchor.perk,partialBuild={...build,weapons:build.weapons.map(weapon=>unresolvedWeapons.find(row=>row.itemInstanceId===weapon.itemInstanceId)||weapon),ownedWeapons:unresolvedWeapons,forgeLoaderDecision:{...build.forgeLoaderDecision,buildAnchor:{...build.forgeLoaderDecision.buildAnchor,perk:{...partialAnchorPerk,description:'',definition:{...(partialAnchorPerk.definition||{}),displayProperties:{...(partialAnchorPerk.definition?.displayProperties||{}),description:''}}}}}};
const partialResult=await prepareForgeSequence({build:partialBuild,candidate:nothingManaclesCandidate,...variant,currentSeasonNumber:31},{advise:async()=>{throw new Error('verified weapon effect text unavailable');}});
assert.equal(partialResult.patch.forgeEvidence.status,'partial','Optional missing effect text must terminate as an honest partial Working Build.');
assert.ok(partialResult.patch.forgeEvidence.pending.some(row=>row.code==='exotic-effect-description-unresolved'&&row.field==='forgeLoaderDecision.buildAnchor.perk.description'));
assert.ok(partialResult.patch.forgeEvidence.pending.some(row=>row.code==='weapon-perk-evidence-incomplete'));
assert.ok(partialResult.patch.forgeEvidence.pending.some(row=>row.code==='weapon-roll-advice-unavailable'));
assert.equal(partialResult.patch.recommendationStatus,'partial-review-required');

class FakeWorker{constructor(){this.sent=[];this.dead=false;}postMessage(message){this.sent.push(message);}terminate(){this.dead=true;}emit(message){this.onmessage({data:message});}}
const workers=[],client=new ForgePreparationClient({workerFactory:()=>{const w=new FakeWorker();workers.push(w);return w;},maxEntries:2,maxBytes:100});
client.setInput(build,candidates,31);const first=workers.at(-1),rev=client.revision,key=JSON.stringify(['void','dps',102]);
const pending=client.get(variant);first.emit({type:'ready',revision:rev,key,result,bytes:40});assert.equal(await pending,result);
const sent=first.sent.length;assert.equal(await client.get(variant),result);assert.equal(first.sent.length,sent,'A ready variant must be reused without another worker job.');
for(const [key,bytes] of [['b',50],['c',60]])first.emit({type:'ready',revision:rev,key,result:{key},bytes});
assert.ok(client.cache.size<=2&&client.bytes<=100,'Cache must obey entry and byte budgets.');
const oldRequest=client.get({...variant,objective:'balanced'});const rejected=assert.rejects(oldRequest,/inputs changed/);
client.setInput({...build,characterId:'another-guardian'},candidates,31);await rejected;assert.equal(first.dead,true);
first.emit({type:'ready',revision:rev,key,result,bytes:40});assert.equal(client.cache.size,0,'An old Guardian cannot populate the current cache.');
const second=workers.at(-1);second.emit({type:'started',revision:client.revision,key:'speculative'});
const priority=client.get(variant);assert.equal(second.dead,true,'Generate must interrupt unrelated speculation.');
workers.at(-1).emit({type:'ready',revision:client.revision,key,result,bytes:40});await priority;
const failing=client.get({...variant,objective:'survivability'});workers.at(-1).onerror();await assert.rejects(failing,/could not start/);
const retry=client.get({...variant,objective:'survivability'});workers.at(-1).emit({type:'ready',revision:client.revision,key:JSON.stringify(['void','survivability',102]),result,bytes:40});await retry;client.dispose();
const timeoutStatus=[],timeoutWorkers=[],timeoutClient=new ForgePreparationClient({workerFactory:()=>{const worker=new FakeWorker();timeoutWorkers.push(worker);return worker;},onStatus:message=>timeoutStatus.push(message),timeoutMs:10});
timeoutClient.setInput(build,candidates,31);await assert.rejects(timeoutClient.get(variant),/10 millisecond worker budget/,'A silent worker must terminate through the explicit client budget.');assert.equal(timeoutWorkers.at(-1).dead,true);assert.equal(timeoutStatus.at(-1).type,'unavailable');timeoutClient.dispose();
const variants=preparationVariants(candidates,variant);assert.deepEqual(variants[0],variant);assert.ok(variants.length<=12);assert.ok(variants.some(v=>v.superHash===101));assert.ok(variants.some(v=>v.objective==='ability-uptime'));

// Execute the actual worker handler and sequence on another thread without a DOM.
const workerURL=new URL('../pages/guardian-workspace-v2/paradox-build-space/paradox-forge-worker.mjs',import.meta.url).href;
const thread=new Worker(`const {parentPort}=require('node:worker_threads');(async()=>{globalThis.fetch=async input=>{const {readFile}=await import('node:fs/promises');const body=await readFile(new URL(String(input)),'utf8');return {ok:true,json:async()=>JSON.parse(body)};};const {createForgeWorkerHandler}=await import(${JSON.stringify(workerURL)});const receive=createForgeWorkerHandler(m=>parentPort.postMessage(m));parentPort.on('message',receive);parentPort.postMessage({type:'boot'});})().catch(e=>{throw e;});`,{eval:true});
try{
  await new Promise((resolve,reject)=>{thread.once('message',resolve);thread.once('error',reject);});
  const ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('worker test timeout')),10000);thread.on('message',m=>{if(m.type==='ready'){clearTimeout(timer);resolve(m);}if(m.type==='error'){clearTimeout(timer);reject(new Error(m.message));}});});
  thread.postMessage({type:'init',revision:7,build,candidates,season:31});thread.postMessage({type:'prepare',revision:7,jobs:[variant]});
  const message=await ready;assert.equal(message.revision,7);assert.equal(message.result.patch.super.hash,102);assert.equal(message.result.patch.liveTransferPreflight.ready,true);assert.ok(message.bytes>0);
}finally{await thread.terminate();}
console.log('FORGE_BACKGROUND_THREAD_AND_ISOLATION=PASS');
console.log('FORGE_BACKGROUND_SUPERS_ARTIFACT_AND_CACHE=PASS');
console.log('FORGE_BACKGROUND_PARTIAL_TIMEOUT_AND_ACTIVITY=PASS');
