import assert from 'node:assert/strict';
import {fixture,definitions} from './fixtures/reports-fixture.mjs';
import {SERIES,aggregateRow,viewModel,catalogue,bungieImage,variantIdentity,slimCatalogue} from '../pages/reports/reports-model.mjs';
import {createReportsLoader,createReportsStore} from '../pages/reports/reports-data.mjs';
const all=viewModel(fixture,'raids');
assert.deepEqual(all.totals,{entered:12,cleared:8,kills:370,deaths:37,time:12000,fastest:700,score:125,flawless:null});
const raid=all.activities.find(row=>row.name==='Fixture Raid');
assert.equal(raid.variants.length,2);
assert.deepEqual(raid.difficulties.map(({difficulty,entered,cleared,fastest,score})=>({difficulty,entered,cleared,fastest,score})),[
  {difficulty:'Normal',entered:9,cleared:6,fastest:700,score:110},
  {difficulty:'Master',entered:3,cleared:2,fastest:950,score:125}
]);
assert.equal(viewModel(fixture,'raids','1').totals.entered,4);
assert.equal(viewModel(fixture,'raids','2').totals.kills,60);
assert.equal(viewModel(fixture,'raids','3').totals.cleared,4);
assert.equal(all.activities[0].name,'New Raid');
assert.equal(viewModel(fixture,'vanguard').activities.length,1);
assert.equal(viewModel(fixture,'vanguard').activities[0].variants.length,2);
assert.equal(aggregateRow({values:{}}).entered,null);
assert.equal(viewModel({...fixture,aggregates:{...fixture.aggregates,2:null}},'raids').totals.kills,null);
assert.equal(bungieImage('https://evil.test/img.jpg'),'');
assert.equal(bungieImage('//evil.test/img.jpg'),'');
assert.equal(bungieImage('/img/a.jpg'),'https://www.bungie.net/img/a.jpg');
const session={authenticated:true,activeDestinyMembership:{membershipType:3,membershipId:'123'}};
let calls=[],warmed=0,throttled=false;const waits=[];
const store=createReportsStore(null);
const loader=createReportsLoader({store,now:()=>1000,warmImages:async rows=>{warmed++;assert.equal(rows.length,8); /* Prompt 20a-fix2: four additional series fixtures. */},sleep:async ms=>waits.push(ms),fetchImpl:async (input,options)=>{
  const url=new URL(input);calls.push(url);
  // Prompt 20a-fix: preserve the public credential assertion at the slim boundary.
  assert.notEqual(url.hostname,'www.bungie.net','Browser never downloads full definitions');
  assert.notEqual(url.pathname,'/bungie/manifest','Browser requests only the slim catalogue');
  if(url.pathname==='/bungie/reports/catalogue'){
    assert.equal(options.credentials,'omit');
    return Response.json({schema:'3-fixture',version:'fixture-1',activities:fixture.catalogue.flatMap(group=>group.variants.map(row=>({...row,name:group.name,series:group.series,pgcrImage:group.image,releaseOrder:group.releaseTime})))});
  }
  if(url.searchParams.get('kind')==='profile')return Response.json({ErrorCode:1,Response:{characters:{data:Object.fromEntries(fixture.characters.map(row=>[row.characterId,row]))},characterProgressions:{data:{1:{milestones:{}}}},profileRecords:{data:{records:{5:{state:0}}}}}});
  const id=url.searchParams.get('characterId');
  if(id==='1'&&!throttled){throttled=true;return Response.json({ErrorCode:36,ThrottleSeconds:2},{status:429});}
  return Response.json({ErrorCode:1,Response:fixture.aggregates[id]});
}});
const [loaded,second]=await Promise.all([loader.load(session),loader.load(session)]);
assert.equal(loaded,second,'Concurrent preloads share one request set');
assert.equal(calls.filter(url=>url.searchParams.get('kind')==='aggregate').length,4,'Three characters plus one throttled retry');
assert.deepEqual(waits,[2000]);assert.equal(warmed,1);
assert.equal(loaded.records.profile.records[5].state,0);
const before=calls.length;await loader.load(session);assert.equal(calls.length,before,'Browser cache resumes without requests');
viewModel(loaded,'raids');viewModel(loaded,'dungeons','2');assert.equal(calls.length,before);
await loader.load({...session,activeDestinyMembership:{membershipType:3,membershipId:'456'}});assert.ok(calls.length>before,'Different accounts never reuse player snapshots');
assert.equal(await loader.load({authenticated:false}),null);
assert.equal(catalogue({redacted:{...definitions[100],redacted:true}}).length,0);
assert.deepEqual(variantIdentity({displayProperties:{name:'Nightfall Grandmaster: The Arms Dealer'},originalDisplayProperties:{name:'Nightfall Grandmaster'}}),{name:'The Arms Dealer',difficulty:'Grandmaster'});
assert.equal(catalogue({1:{hash:1,displayProperties:{name:'New raid: Standard'},activityTypeHash:2043403989}})[0].series,'raids');
assert.equal(catalogue({1:{hash:1,displayProperties:{name:'New dungeon: Standard'},activityTypeHash:608898761}})[0].series,'dungeons');
assert.equal(aggregateRow({values:{activityCompletions:{basic:{value:2}},fastestCompletionMsForActivity:{basic:{value:700000}}}}).cleared,2);
assert.equal(aggregateRow({values:{activityCompletions:{basic:{value:2}}}}).entered,null,'Clears must not masquerade as entered runs');
assert.equal(aggregateRow({values:{activityCompletions:{basic:{value:0}},fastestCompletionMsForActivity:{basic:{value:700000}}}}).fastest,null,'An uncompleted activity has no fastest clear');
assert.deepEqual(viewModel(loaded,'raids').totals,all.totals,'Slim projection preserves hand-computed totals');
assert.equal(loaded.catalogue.filter(row=>row.series==='raids')[0].name,'New Raid');
const alphabetic=slimCatalogue([{hash:'1',name:'Zulu',series:'story',difficulty:'-',releaseOrder:99},{hash:'2',name:'Alpha',series:'story',difficulty:'-',releaseOrder:1}]);
assert.deepEqual(alphabetic.map(row=>row.name),['Alpha','Zulu'],'Other series sort by name');
console.log('REPORTS_DATA=PASS');

// Prompt 20a-fix2: every series has a non-empty fixture and stable base labels.
for(const series of SERIES)assert.ok(fixture.catalogue.some(row=>row.series===series.id),series.id);
for(const series of ['raids','dungeons','exotic']){
  const rows=slimCatalogue([{hash:'1',name:'Known',series,difficulty:'Normal',releaseOrder:99},{hash:'2',name:'New',series,difficulty:'-',releaseOrder:null}]);
  assert.equal(rows[0].name,'New');
}
for(const series of ['raids','vanguard']){
  const rows=slimCatalogue([{hash:'1',name:'Mixed',series,difficulty:'Master',releaseOrder:1},{hash:'2',name:'Mixed',series,difficulty:'-',releaseOrder:1},{hash:'3',name:'Unknown',series,difficulty:'-',releaseOrder:1}]);
  assert.deepEqual(rows.find(row=>row.name==='Mixed').variants.map(row=>row.difficulty),['Master',series==='vanguard'?'Standard':'Normal']);
  assert.equal(rows.find(row=>row.name==='Unknown').variants[0].difficulty,'-');
}
