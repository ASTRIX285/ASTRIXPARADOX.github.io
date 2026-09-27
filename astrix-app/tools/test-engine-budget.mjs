import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {Worker} from 'node:worker_threads';
import {performance} from 'node:perf_hooks';
import {build,candidates,variant,comboSource} from './fixtures/engine-budget.mjs';
import {largeBuild,measureEngine,payload} from './measure-engine-budget.mjs';
import {selectOwnedWeapons} from '../pages/guardian-workspace-v2/paradox-build-space/paradox-loadout-intelligence.mjs';
import {prepareForgeSequence} from '../pages/guardian-workspace-v2/paradox-build-space/paradox-forge-sequence.mjs';
import {createEnginePrecomputer} from '../core/engine-precompute.mjs';
import {ENGINE_BUDGETS,beginEngineTiming,engineTimings} from '../core/engine-timing.mjs';
import {EngineHandoffClient} from '../core/engine-handoff-client.mjs';
import {ForgePreparationClient} from '../pages/guardian-workspace-v2/paradox-build-space/paradox-forge-preparation.mjs';
const base=new URL('../pages/guardian-workspace-v2/paradox-build-space/',import.meta.url);
const oracleURL=new URL(`engine-reference-${process.pid}.mjs`,base),sequenceURL=new URL(`engine-sequence-reference-${process.pid}.mjs`,base);
const source=await readFile(new URL('paradox-loadout-intelligence.mjs',base),'utf8');
const old=await readFile(new URL('./fixtures/engine-weapon-reference.txt',import.meta.url),'utf8');
const start=source.indexOf('  // Exact dominance:'),end=source.indexOf('  const allPlans=',start);
assert.ok(start>0&&end>start);
let comparisons=0;
const clean=value=>JSON.parse(JSON.stringify(value,(key,row)=>['generatedAt','recommendationGeneratedAt','createdAt','checkedAt'].includes(key)?'<time>':row));
try{
 await writeFile(oracleURL,source.slice(0,start)+old+source.slice(end));
 const original=await import(oracleURL.href);
 const sequence=await readFile(new URL('paradox-forge-sequence.mjs',base),'utf8');
 await writeFile(sequenceURL,sequence.replace(/\.\/paradox-loadout-intelligence\.mjs[^']*/,`./${oracleURL.pathname.split('/').at(-1)}`));
 const oldSequence=await import(sequenceURL.href);
 let seed=123456;const random=()=>((seed=(1664525*seed+1013904223)>>>0)/2**32);
 for(const n of [0,1,3,12,60,600])for(const objective of ['balanced','dps','add-clear','survivability','ability-uptime']){
  const rows=comboSource.ownedWeapons?.length?comboSource.ownedWeapons:build.ownedWeapons;
  const inventory=Array.from({length:n},(_,i)=>({...rows[Math.floor(random()*rows.length)],itemInstanceId:String(1000000+i)}));
  const input={...build,ownedWeapons:inventory};
  const before=JSON.stringify(input),actual=selectOwnedWeapons({build:input,objective}),expected=original.selectOwnedWeapons({build:input,objective});
  assert.deepEqual(actual,expected,`Exact ranking ${n}/${objective}`);assert.equal(JSON.stringify(input),before);comparisons++;
  const alternative=expected.recommendation.combinations[1];
  if(alternative){const opts={build:input,objective,weaponInstanceIds:alternative.weapons.map(row=>row.itemInstanceId)};assert.deepEqual(selectOwnedWeapons(opts),original.selectOwnedWeapons(opts));comparisons++;}
 }
 for(const objective of ['balanced','dps','survivability']){
  const input={build:largeBuild,candidate:candidates[0].candidate,...variant,objective,currentSeasonNumber:31};
  const opts={advise:async()=>{}};
  assert.deepEqual(clean(await prepareForgeSequence(input,opts)),clean(await oldSequence.prepareForgeSequence(input,opts)));comparisons++;
 }
}finally{await Promise.all([unlink(oracleURL).catch(()=>{}),unlink(sequenceURL).catch(()=>{})]);}
const prepare=createEnginePrecomputer(),first=prepare(build);
assert.equal(prepare(structuredClone(build)),first,'An unchanged snapshot must reuse all tables.');
assert.equal(prepare({...build,objective:'dps'}),first,'Changing objective must not invalidate inventory tables.');
assert.notEqual(prepare({...build,profileSnapshot:'changed'}),first,'Snapshot revision changes invalidate tables.');
assert.notEqual(prepare({...build,manifestVersion:'changed'}),first,'Manifest changes invalidate tables.');
assert.notEqual(prepare({...build,weapons:build.weapons.slice(1)}),first,'Inventory changes invalidate tables.');
assert.notEqual(prepare({...build,membershipId:'other-test-account'}),first,'Account changes cannot reuse private data.');
assert.ok(first.inventoryByHash.size>0&&first.weaponModels.size>0&&first.armourStats.size>0);
assert.deepEqual(selectOwnedWeapons({build,precomputed:prepare(build)}),selectOwnedWeapons({build}));

function thread(module,handler){
 const url=new URL(module,import.meta.url).href;
 return new Worker(`const {parentPort}=require('node:worker_threads');globalThis.location={pathname:'/core/engine-worker.mjs',search:'',href:'https://example.invalid/core/engine-worker.mjs'};globalThis.fetch=async input=>{await new Promise(resolve=>setTimeout(resolve,200));const {readFile}=await import('node:fs/promises');const body=await readFile(new URL(String(input)),'utf8');return {ok:true,json:async()=>JSON.parse(body)};};(async()=>{const module=await import(${JSON.stringify(url)});const post=m=>parentPort.postMessage(m);const handle=${handler==='createForgeWorkerHandler'?'module.createForgeWorkerHandler(post)':`m=>module.${handler}(m,post)`};parentPort.on('message',handle);post({type:'boot'});})();`,{eval:true});
}
const boot=w=>new Promise((resolve,reject)=>{w.once('message',resolve);w.once('error',reject);});
const response=(w,send,match)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{cleanup();reject(new Error('Worker budget test timed out'));},4000);const receive=m=>{if(m.type==='error'||m.error){cleanup();reject(new Error(m.message||m.error));}else if(match(m)){cleanup();resolve(m);}};const cleanup=()=>{clearTimeout(timer);w.off('message',receive);};w.on('message',receive);w.postMessage(send);});
const workers=[];
try{
 const handoff=thread('../core/engine-handoff-worker.mjs','handleEngineHandoff');workers.push(handoff);await boot(handoff);
 const started=performance.now();await response(handoff,{id:1,build:largeBuild,binding:build},m=>m.id===1);const handoffMs=performance.now()-started;assert.ok(handoffMs<ENGINE_BUDGETS.handoff);
 const adapter={postMessage:m=>handoff.postMessage(m),terminate(){},set onmessage(fn){handoff.on('message',m=>fn({data:m}));},set onerror(fn){handoff.on('error',fn);}};
 const handoffClient=new EngineHandoffClient({workerFactory:()=>adapter}),binding={characterId:build.characterId,membershipId:build.membershipId,membershipType:build.membershipType};
 await handoffClient.prepare(largeBuild,binding);
 const warmHandoffStart=performance.now();await handoffClient.prepare(largeBuild,binding);const warmHandoffMs=performance.now()-warmHandoffStart;
 assert.ok(warmHandoffMs<ENGINE_BUDGETS.handoff);console.log('ENGINE_HANDOFF_WARM_MS',warmHandoffMs.toFixed(2));handoffClient.dispose();
 const forge=thread('../pages/guardian-workspace-v2/paradox-build-space/paradox-forge-worker.mjs','createForgeWorkerHandler');workers.push(forge);await boot(forge);
 forge.postMessage({type:'init',revision:1,build:largeBuild,candidates,season:31});
 const messages=[];forge.on('message',m=>messages.push(m));
 const start=performance.now();await response(forge,{type:'prepare',revision:1,jobs:[variant],requested:true},m=>m.type==='ready');const generateMs=performance.now()-start;
 assert.ok(generateMs<ENGINE_BUDGETS.generate,`Generate ${generateMs} ms`);
 assert.ok(messages.some(m=>m.type==='ready'&&m.timing?.marks.some(row=>row.stage==='precompute')));
 const full=messages.find(m=>m.type==='ready');
 if(full.result.patch.weaponSelectionRecommendation.combinations.length>1){const first=messages.find(m=>m.type==='first');assert.ok(first);assert.equal(first.result.patch.weaponSelectionRecommendation.combinations.length,1);assert.deepEqual(first.result.patch.weapons,full.result.patch.weapons);assert.ok(messages.indexOf(first)<messages.indexOf(full));}
 // Actual profile worker module must load without window/document and answer requests.
 const profile=thread('../core/engine-profile-worker.mjs','handleProfileTask');workers.push(profile);await boot(profile);
 const profileStart=performance.now();await new Promise(resolve=>setTimeout(resolve,200));
 const parsed=await response(profile,{id:2,type:'parse',text:JSON.stringify(payload),page:'character'},m=>m.id===2);
 const normalized=await response(profile,{id:4,type:'normalise',payload:parsed.result,session:{},characterId:'1'},m=>m.id===4);
 const profileMs=performance.now()-profileStart;assert.equal(normalized.result.characterId,'1');assert.ok(profileMs<ENGINE_BUDGETS.profile,`Profile ${profileMs} ms`);
 console.log('ENGINE_PROFILE_WORKER_MS',profileMs.toFixed(2));
 const bad=await new Promise(resolve=>{profile.once('message',resolve);profile.postMessage({id:3,type:'parse',text:'{}',page:'character'});});assert.ok(bad.error);
 console.log('ENGINE_WORKER_TIMINGS',JSON.stringify({handoffMs:+handoffMs.toFixed(2),generateMs:+generateMs.toFixed(2)}));
}finally{await Promise.all(workers.map(worker=>worker.terminate()));}
class FakeWorker{postMessage(){}terminate(){}emit(data){this.onmessage({data});}}
const w=new FakeWorker(),client=new ForgePreparationClient({workerFactory:()=>w});client.setInput(build,candidates,31);
const pending=client.get(variant,{first:true}),key=JSON.stringify(['void','dps',102]);w.emit({type:'first',revision:client.revision,key,result:{first:true}});assert.deepEqual(await pending,{first:true});
const finished=client.get(variant);w.emit({type:'ready',revision:client.revision,key,result:{full:true},bytes:20});assert.deepEqual(await finished,{full:true});assert.deepEqual(await client.get(variant),{full:true});client.dispose();
for(let i=0;i<140;i++)beginEngineTiming('test').end();assert.ok(engineTimings().length<=128);
const timing=await measureEngine();assert.ok(timing.profileWarm.maxMs<ENGINE_BUDGETS.profile);assert.ok(timing.profileCold.maxMs<ENGINE_BUDGETS.profile);assert.ok(timing.generate.maxMs<ENGINE_BUDGETS.generate);assert.ok(timing.handoffPack.maxMs<ENGINE_BUDGETS.handoff);
console.log('ENGINE_TIMINGS',JSON.stringify(timing));console.log(`ENGINE_EXACT_RESULTS=PASS comparisons=${comparisons}`);console.log('ENGINE_BUDGETS=PASS fixture compute and worker transport; browser paint pending; DIM performance integration pending');
