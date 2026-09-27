import assert from 'node:assert/strict';
import {createReportsHistory,historyTotals,pgcrModel,difficultyFor,modifierNames,activityAnalysis,clearsConsistent,fireteamTotals} from '../pages/reports/reports-history.mjs';
import {readReportsRoute,runGroups,runRows,selectionArt,difficultyLabel} from '../pages/reports/reports-ui.mjs';
import {createReportsLoader,createReportsStore} from '../pages/reports/reports-data.mjs';
import {reportsRead} from '../../forge-auth-worker/src/reports-read.ts';
const value=value=>({basic:{value}});
const activity={id:'raids:fixture',series:'raids',totals:{entered:null,cleared:27,kills:70},variants:[{hash:'100',difficulty:'Normal'},{hash:'101',difficulty:'Master'}]};
const snapshot={identity:'3:1',characters:[{characterId:'1'},{characterId:'2'},{characterId:'3'}],catalogue:[activity]};
const calls=[];
const history=createReportsHistory(snapshot,{fetchImpl:async input=>{
  const url=new URL(input),page=Number(url.searchParams.get('page')),id=url.searchParams.get('characterId');calls.push(`${id}:${page}`);
  return Response.json({ErrorCode:1,Response:{activities:page<3?Array.from({length:4},(_,i)=>({period:new Date(Date.UTC(2026,8,27-page,0,4-i)).toISOString(),activityDetails:{instanceId:`${id}${page}${i}`,referenceId:i===0?101:100,directorActivityHash:i===0?101:100},values:{kills:value(100+page),deaths:value(0),completed:value(i===3?0:1),activityDurationSeconds:value(600)}})):[]}});
}});
await history.advance();
assert.equal(historyTotals(activity,history.runs(activity),history.complete()).kills,null,'Partial history cannot replace a lifetime total');
while(!history.complete())await history.advance();
const totals=historyTotals(activity,history.runs(activity),history.complete());
assert.equal(totals.entered,36);assert.equal(totals.cleared,27);assert.equal(totals.kills,3636,'Every page, every character, including failed runs');
assert.equal(calls.length,12);assert.equal(historyTotals(activity,history.runs(activity,'1'),true).kills,1212);
assert.equal(historyTotals(activity,[],false).entered,null);
assert.equal(historyTotals(activity,[],true).entered,null,'Clear evidence prevents a false zero entered');
assert.equal(difficultyFor({hash:'100',directorHash:'101'},activity),'Master','Selected director variant wins over a shared reference hash');
assert.equal(difficultyFor({hash:'999',directorHash:'100'},activity),'Standard');
const missing=[...history.runs(activity)];missing[0]={...missing[0],kills:null};assert.equal(historyTotals(activity,missing,true).kills,null);
const route=readReportsRoute('https://test/reports/?activity=raids%3Afixture&difficulty=Master&character=2&page=2&run=123',snapshot);
assert.deepEqual(route,{activity:'raids:fixture',series:'raids',difficulty:'Master',character:'2',page:2,run:'123'});
assert.equal(readReportsRoute('https://test/reports/?activity=bad&character=bad&page=-1&run=../123',snapshot).run,null);
const player=(id,values={})=>({characterId:id,player:{destinyUserInfo:{membershipId:id,membershipType:3,bungieGlobalDisplayName:'Guardian',bungieGlobalDisplayNameCode:7}},values:{kills:value(10),assists:value(3),deaths:value(0),killsDeathsRatio:value(10),completed:value(1),...values}});
const pgcr={period:'2026-09-27T00:00:00Z',activityDetails:{instanceId:'1',referenceId:100},activityWasStartedFromBeginning:false,selectedSkullHashes:[1234],entries:[player('1'),player('2')]};
const model=pgcrModel(pgcr);assert.deepEqual(model.badges,['Flawless','Duo']);assert.equal(model.players[0].name,'Guardian#0007');assert.equal(model.players[0].assists,3);assert.equal(model.players[0].kd,10);assert.equal(model.startedFromBeginning,false);
assert.equal(pgcrModel({...pgcr,entries:[player('1',{deaths:undefined})]}).flawless,null);
assert.equal(pgcrModel({...pgcr,entries:[player('1'),player('1')]}).fireteamSize,1,'Character switching does not invent an extra person');
assert.deepEqual(modifierNames(['1234','5678'],[{selectableActivitySkulls:[{activitySkull:{hash:1234,displayProperties:{name:'Fixture modifier'}}}]}]),[{hash:'1234',name:'Fixture modifier'},{hash:'5678',name:null}]);
assert.equal(modifierNames(null,[]),null);
const session={authenticated:true,activeDestinyMembership:{membershipType:3,membershipId:'123'},accessToken:'fixture-token'};
for(const kind of ['profile','aggregate','history']){
 const result=await reportsRead(new Request(`https://test/bungie/reports?kind=${kind}&characterId=1&subjectType=2&subjectId=999`),session,'fixture-key',async(input,init)=>{
  assert.ok(new URL(input).pathname.includes('/2/'));assert.ok(new URL(input).pathname.includes('/999/'));assert.equal(init.headers.Authorization,undefined,'Never send viewer OAuth token for someone else');
  if(kind==='profile')assert.equal(new URL(input).searchParams.get('components'),'100,200');return Response.json({ErrorCode:1,Response:{}});
 });assert.equal(result.status,200);
}
for(const query of ['subjectId=abc&subjectType=3','subjectId=123','subjectType=3','subjectId=123&subjectType=0'])assert.equal((await reportsRead(new Request(`https://test/bungie/reports?kind=profile&${query}`),session,'key',async()=>{throw Error('Must not fetch');})).status,400);
const result=await reportsRead(new Request('https://test/bungie/reports?kind=definition&definition=DestinyActivityDefinition&hash=100'),session,'key',async(input,init)=>{assert.equal(init.headers.Authorization,undefined);assert.equal(new URL(input).pathname,'/Platform/Destiny2/Manifest/DestinyActivityDefinition/100/');return Response.json({ErrorCode:1,Response:{}});});assert.equal(result.status,200);
assert.equal((await reportsRead(new Request('https://test/bungie/reports?kind=definition&definition=Other&hash=100'),session,'key')).status,400);
let time=0,pgcrCalls=0;
const controller=createReportsHistory(snapshot,{now:()=>time,store:createReportsStore(null),fetchImpl:async input=>{
 const url=new URL(input);if(url.pathname.includes('/pgcr/')){pgcrCalls++;return Response.json({ErrorCode:1,Response:pgcr});}
 return Response.json({ErrorCode:1,Response:url.searchParams.get('definition')==='DestinyActivityDefinition'?{displayProperties:{name:'Full activity: Master'},pgcrImage:'/img/art.png',selectableSkullCollectionHashes:[500]}:{selectableActivitySkulls:[{activitySkull:{hash:1234,displayProperties:{name:'Fixture modifier'}}}]}});
}});
assert.equal((await controller.detail('1')).name,'Full activity: Master');assert.equal((await controller.detail('1')).modifiers[0].name,'Fixture modifier');assert.equal(pgcrCalls,1);
time=24*60*60_000+1;await controller.pgcr('1');assert.equal(pgcrCalls,2,'Memory PGCR cache obeys TTL');
const subjectCalls=[];
const loader=createReportsLoader({subject:{membershipType:2,membershipId:'999'},store:createReportsStore(null),fetchImpl:async input=>{
 const url=new URL(input);subjectCalls.push(url);
 if(url.pathname.endsWith('/catalogue'))return Response.json({schema:'3-fixture',version:'1',activities:[]});
 return Response.json({ErrorCode:1,Response:url.searchParams.get('kind')==='profile'?{characters:{data:{1:{characterId:'1',classType:0}}}}:{activities:[]}});
}});
const external=await loader.load(session);assert.equal(external.identity,'3:123:subject:2:999');assert.equal(external.subject.membershipId,'999');
assert.ok(subjectCalls.filter(u=>!u.pathname.endsWith('/catalogue')).every(u=>u.searchParams.get('subjectId')==='999'));
console.log('REPORTS_THREE_STAGE=PASS');

// Pantheon regression: collapsed aggregate data must never assign runs to the
// first family variant, nor replace actual character attribution.
const pantheon={id:'raids:the pantheon',totals:{cleared:27,kills:70},variants:[
 {hash:'200',difficulty:'Morgeth Surpassing'},{hash:'201',difficulty:'Atraks Sovereign'},
 {hash:'202',difficulty:'Oryx Exalted'},{hash:'203',difficulty:'Nezarec Sublime'}]};
const pantheonRuns=Array.from({length:27},(_,i)=>({id:String(1000+i),characterId:String(i%3+1),hash:'200',directorHash:i<12?'201':'202',completed:true,duration:600+i,kills:100}));
const pa=activityAnalysis(pantheon,pantheonRuns,snapshot.characters,true);
assert.equal(pa.totals.cleared,27);assert.deepEqual(pa.characters.map(r=>r.cleared),[9,9,9]);
assert.deepEqual(pa.difficulties.map(r=>r.cleared),[0,12,15,0]);
assert.equal(pa.difficulties[0].notPlayed,true);assert.equal(pa.difficulties[3].notPlayed,true);
assert.ok(clearsConsistent(pa));
assert.equal(clearsConsistent({...pa,totals:{...pa.totals,cleared:28}}),false);
assert.equal(clearsConsistent({...pa,characters:pa.characters.slice(0,2)}),false);
assert.equal(clearsConsistent({...pa,difficulties:pa.difficulties.slice(1).map((r,i)=>({...r,cleared:r.cleared+(i===0?1:0)}))}),false);
assert.equal(activityAnalysis(pantheon,[],snapshot.characters,false).difficulties[0].notPlayed,false,'Unloaded is not unplayed');
assert.equal(difficultyFor({hash:'999',directorHash:'998'},pantheon),'Unresolved difficulty','Never default to first variant');
const failedOnly=activityAnalysis(pantheon,[{...pantheonRuns[0],completed:false}],snapshot.characters,true);
assert.equal(failedOnly.characters.length,1,'Include a character with runs even without clears');
assert.equal(failedOnly.difficulties[1].notPlayed,false);
// Exercise the invariant for every family in the public catalogue, every
// variant, all characters, incomplete runs and duplicate history rows.
const {readFileSync}=await import('node:fs');
const {slimCatalogue}=await import('../pages/reports/reports-model.mjs');
const catalogue=slimCatalogue(JSON.parse(readFileSync(new URL('./fixtures/reports-catalogue-current.json',import.meta.url))).activities);
for(const family of catalogue){
 const sample=family.variants.flatMap((v,i)=>snapshot.characters.map((c,j)=>({id:`${i}-${j}`,characterId:c.characterId,hash:v.hash,directorHash:v.hash,completed:j!==1,kills:10,duration:100+i})));
 const ledger=activityAnalysis({...family,totals:{cleared:null}},[...sample,...sample.slice(0,1)],snapshot.characters,true);
 assert.ok(clearsConsistent(ledger),family.id);
 assert.equal(ledger.totals.cleared,family.variants.length*2,family.id);
 for(const c of snapshot.characters){const filtered=activityAnalysis({...family,totals:{cleared:null}},sample.filter(r=>r.characterId===c.characterId),snapshot.characters,true);assert.ok(clearsConsistent(filtered),`${family.id}/${c.characterId}`);}
}
console.log(`REPORTS_CLEAR_CONSISTENCY=PASS ${catalogue.length} activity families`);

const shares=fireteamTotals([1,1,1].map(kills=>({kills,assists:1,deaths:1,timePlayed:100,completed:true})));
assert.deepEqual(shares.killShares,[33.4,33.3,33.3]);
assert.equal(shares.killShares.reduce((n,v)=>n+Math.round(v*10),0),1000);
assert.deepEqual(shares.teamTotals,{kills:3,assists:3,deaths:3,timePlayed:300,kd:1,completed:3,killShare:100});
for(const kills of [[1,2,3,4,5,6],[0,50,50],[3,97],[100,0,0],[8,8,8,8,8,8,8]]){
 const result=fireteamTotals(kills.map(kills=>({kills})));
 assert.equal(result.killShares.reduce((n,v)=>n+Math.round(v*10),0),1000);
 assert.ok(result.killShares.every((v,i)=>Math.abs(v-kills[i]/result.teamTotals.kills*100)<=.1));
}
assert.deepEqual(fireteamTotals([{kills:0},{kills:0}]).killShares,[null,null]);
assert.deepEqual(fireteamTotals([{kills:5},{kills:null}]).killShares,[null,null]);
const ownCompletion=pgcrModel({entries:[player('1',{completed:value(0)}),player('2',{completed:value(1)}),player('3',{completed:undefined})]});
assert.deepEqual(ownCompletion.players.map(p=>p.completed),[false,true,null]);
assert.equal(ownCompletion.teamTotals.completed,null);
const classAndTime=pgcrModel({entries:[{...player('1'),player:{...player('1').player,characterClass:'Warlock'},values:{...player('1').values,timePlayedSeconds:value(120),activityDurationSeconds:value(338)}}]});
assert.equal(classAndTime.players[0].className,'Warlock');assert.equal(classAndTime.players[0].timePlayed,120);assert.equal(classAndTime.duration,338);
console.log('REPORTS_FIRETEAM_TOTALS=PASS');
const kingsFall=JSON.parse(readFileSync(new URL('./fixtures/reports-kings-fall-20260801.json',import.meta.url)));
const kingsFallModel=pgcrModel(kingsFall.report);
assert.equal(kingsFall.report.activityDetails.instanceId,'17105004322');
assert.equal(kingsFallModel.period,'2026-08-01T08:55:58Z');
assert.equal(kingsFall.source.durationSeconds,338);
assert.deepEqual(kingsFallModel.players.map(p=>p.completed),kingsFall.source.expectedCompletion);
assert.deepEqual(kingsFallModel.players.map(p=>p.kills),[0,8]);
assert.deepEqual(kingsFallModel.players.map(p=>p.deaths),[1,0]);
assert.deepEqual(kingsFallModel.killShares,[0,100]);
assert.equal(kingsFallModel.teamTotals.completed,0);
assert.equal(kingsFallModel.players[0].assists,null,'Unobserved values are not invented');
assert.equal(kingsFallModel.players[0].timePlayed,null);
console.log('REPORTS_KINGS_FALL_17105004322=PASS both players Not completed');

// Standard and Normal are one presentation bucket; original hashes remain exact.
const aliases={...activity,image:'https://www.bungie.net/img/selection.jpg',variants:[{hash:'10',difficulty:'Standard'},{hash:'11',difficulty:'Normal'},{hash:'12',difficulty:'Master'}]};
const aliasRuns=[{id:'1',hash:'11',characterId:'1',period:'2026-08-03T10:00:00Z',completed:true,duration:300,kills:10},{id:'2',hash:'12',characterId:'2',period:'2026-08-02T10:00:00Z',completed:false,duration:100,kills:5},{id:'3',hash:'10',characterId:'2',period:'2026-08-01T10:00:00Z',completed:true,duration:400,kills:20}];
const aliasAnalysis=activityAnalysis(aliases,aliasRuns,snapshot.characters,true);
assert.deepEqual(aliasAnalysis.difficulties.map(d=>[d.difficulty,d.cleared]),[['Standard',2],['Master',0]]);
assert.ok(clearsConsistent(aliasAnalysis));
assert.deepEqual(runGroups(aliases,aliasRuns).map(g=>[g.difficulty,g.runs.map(r=>r.id)]),[['Standard',['1','3']],['Master',['2']]]);
const rendered=runRows(aliases,aliasRuns);
assert.match(rendered,/<h3>Standard<\/h3>/);assert.match(rendered,/<h3>Master<\/h3>/);
assert.equal((rendered.match(/data-run=/g)||[]).length,3);
assert.match(rendered,/Completed/);assert.match(rendered,/Not completed/);
assert.doesNotMatch(rendered,/Titan|Warlock|Hunter|Fireteam|05:00/);
assert.equal(readReportsRoute('https://test/reports/?difficulty=Normal',snapshot).difficulty,'Standard');
assert.equal(difficultyFor({hash:'5'},{variants:[{hash:'5',variant:'Coda',difficulty:'Normal'}]}),'Coda · Standard');
assert.equal(selectionArt(aliases),'https://www.bungie.net/img/selection.jpg');
assert.equal(selectionArt({image:''}),'','Do not substitute a different run image');
console.log('REPORTS_DIFFICULTY_LISTS=PASS');

assert.equal(difficultyLabel('-'),'Completed');
assert.equal(difficultyLabel('Master'),'Master');
const unlabelledRows=runRows({variants:[{hash:'1',difficulty:'-'}]},[{id:'77',hash:'1',period:'2026-09-27T10:00:00Z',completed:false}]);
assert.match(unlabelledRows,/<h3>Completed<\/h3>/);
assert.match(unlabelledRows,/Not completed/,'The difficulty caption must not change actual completion');
assert.doesNotMatch(unlabelledRows,/Unspecified/);
console.log('REPORTS_COMPLETED_CAPTION=PASS');
