#!/usr/bin/env node
// The Guide's path engine (brief feature/aetherium-guide-path, 18 Oct 2026). Offline, no network.
//   - guide.json: every record and every step, gate and weekly item has a source; a step that names a progression
//     fact carries no level of its own (one value lives in one place) and the fact exists.
//   - guidePath: done / now / next at Lv 1, 12, 22, 35 and 45, ticks move a step to done, the weekly loop at the cap.
//   - Resets: daily 07:00 UTC, weekly Wednesday 07:00 UTC; ticks clear at their cycle's reset.
//   - contentGates: open now and the next item level gate; powerSteps by stage; snapshot changes.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NEXT_COUNT,clampGuideLevel,contentGates,countdown,factLevel,guidePath,lastReset,levelCap,nextReset,pathSteps,powerSteps,snapshotChanges,snapshotOf,tickValid,weeklyLoop,weeklyState} from '../games/aion2/engine/guide-advisor.mjs';

const root=new URL('../',import.meta.url);
const json=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));
const guide=json('games/aion2/data/advisor/guide.json');
const progression=json('games/aion2/data/advisor/progression.json');
const data={guide,progression};
const record=id=>guide.records.find(item=>item.id===id);

let failed=0;
const check=(name,fn)=>{try {fn();console.log(`  ok   ${name}`);} catch(error){failed++;console.log(`  FAIL ${name}\n${error.stack}`);}};
const ids=list=>list.map(step=>step.id);

console.log('guide.json');
check('has the path, gates, weekly and power records, each with provenance',()=>{
  for(const id of ['path','gates','weekly','power']){
    const item=record(id);
    assert.ok(item,`record ${id}`);
    assert.ok(Array.isArray(item.provenance)&&item.provenance.length,`${id} provenance`);
  }
});
check('a fact step has no level or source of its own, and its fact gives a level',()=>{
  for(const step of record('path').steps){
    if(step.fact){
      assert.equal(step.level,undefined,`${step.id} copies a level`);
      assert.equal(step.provenance,undefined,`${step.id} copies a source`);
      assert.ok(Number.isFinite(factLevel(progression,step.fact,step.pick??null)),`${step.id} fact ${step.fact} gives no level`);
    } else {
      assert.ok(Number.isFinite(step.level),`${step.id} level`);
      assert.ok(step.provenance?.length,`${step.id} has no source`);
    }
  }
});
check('every gate and weekly item has a source; every step gate exists',()=>{
  const gates=new Set(record('gates').gates.map(gate=>gate.id));
  for(const gate of record('gates').gates)assert.ok(gate.provenance?.length&&Number.isFinite(gate.itemLevel)&&Number.isFinite(gate.level),gate.id);
  for(const item of record('weekly').items){
    assert.ok(item.provenance?.length,item.id);
    assert.ok(['daily','weekly','energy'].includes(item.cycle),`${item.id} cycle`);
    if(item.gate)assert.ok(gates.has(item.gate),`${item.id} gate`);
  }
  for(const step of [...record('path').steps,...record('power').steps])if(step.gate)assert.ok(gates.has(step.gate),`${step.id} gate ${step.gate}`);
});
check('wiki facts checked against the pages (entry level and item level)',()=>{
  const g=Object.fromEntries(record('gates').gates.map(gate=>[gate.id,[gate.level,gate.itemLevel]]));
  assert.deepEqual(g['krao-exploration'],[20,200]);
  assert.deepEqual(g['urugugu-exploration'],[28,300]);
  assert.deepEqual(g['fire-exploration'],[35,500]);
  assert.deepEqual(g['krao-conquest'],[45,700]);
  assert.deepEqual(g['vakron'],[45,1400]);
  assert.deepEqual(g['urugugu-conquest'],[45,1600]);
  assert.deepEqual(g['fire-conquest'],[45,2100]);
  assert.deepEqual(g['horn-den'],[45,2100]);
  assert.deepEqual(g['ascension-trial'],[45,1000]);
  assert.deepEqual(g['transcendence'],[45,1600]);
});
check('a Nightmare try is used on a clear, an Ascension Trial try on entry',()=>{
  const items=Object.fromEntries(record('weekly').items.map(item=>[item.id,item]));
  assert.match(items.nightmare.text,/only when you clear/);
  assert.match(items['ascension-trial'].text,/used on entry/);
  assert.deepEqual(record('weekly').reset,{daily:{hourUtc:7},weekly:{weekdayUtc:3,hourUtc:7}});
});
check('the side-mission rewards are not guessed (no quest reward claims)',()=>{
  assert.doesNotMatch(JSON.stringify(guide),/side.?(mission|quest)[^"]*reward/i);
});

console.log('guidePath');
check('the steps resolve their levels from progression.json',()=>{
  const steps=Object.fromEntries(pathSteps(data).map(step=>[step.id,step.level]));
  assert.equal(steps['board-nezekan'],12);
  assert.equal(steps['board-zikel'],20);
  assert.equal(steps.stigmas,22);
  assert.deepEqual([steps['stigma-2'],steps['stigma-3'],steps['stigma-4']],[27,32,37]);
  assert.equal(steps['unique-gear'],35);
  assert.equal(steps['level-cap'],levelCap(progression));
  assert.equal(steps['krao-exploration'],20);
});
check('a fact step takes its source from the fact',()=>{
  const step=pathSteps(data).find(item=>item.id==='stigmas');
  assert.equal(step.source.id,'stigma-unlock');
  assert.ok(step.provenance.length);
});
check('Lv 1: crafting and saving now, nothing done, Nezekan next',()=>{
  const path=guidePath(1,data);
  assert.deepEqual(ids(path.now),['crafting-start','save-stones']);
  assert.deepEqual(path.done,[]);
  assert.equal(path.next[0].id,'board-nezekan');
  assert.equal(path.next.length,NEXT_COUNT);
  assert.equal(path.weekly,null);
});
check('Lv 22: stigmas now, older unlocks done, the second slot next',()=>{
  const path=guidePath(22,data);
  assert.ok(ids(path.now).includes('stigmas'));
  assert.ok(ids(path.done).includes('board-nezekan'));
  assert.ok(ids(path.done).includes('krao-exploration'));
  assert.equal(path.next[0].id,'stigma-2');
  assert.ok(ids(path.now).includes('save-stones'),'still saving before Unique gear');
});
check('Lv 35: Unique gear and Fire Temple now, saving passed',()=>{
  const path=guidePath(35,data);
  assert.deepEqual(ids(path.now).sort(),['fire-exploration','unique-gear']);
  const passed=path.done.find(step=>step.id==='save-stones');
  assert.equal(passed.why,'passed');
});
check('Lv 45: the cap steps now, nothing next, the weekly loop shows',()=>{
  const path=guidePath(45,data);
  for(const id of ['level-cap','board-azphel','draupnir','sealed','final-quest','conquest'])assert.ok(ids(path.now).includes(id),id);
  assert.deepEqual(path.next,[]);
  assert.ok(path.weekly);
  assert.equal(path.weekly.items.length,6);
});
check('a ticked step moves to done; a level past the cap is clamped',()=>{
  const path=guidePath(99,data,{ticked:['draupnir']});
  assert.equal(path.level,45);
  assert.ok(!ids(path.now).includes('draupnir'));
  assert.equal(path.done.find(step=>step.id==='draupnir').why,'ticked');
});
check('a missing level throws; clampGuideLevel rounds and bounds',()=>{
  assert.throws(()=>guidePath('x',data));
  assert.equal(clampGuideLevel(0),1);
  assert.equal(clampGuideLevel('30.4'),30);
  assert.equal(clampGuideLevel(null),null);
  assert.equal(clampGuideLevel(''),null);
});

console.log('resets');
check('weekly reset is Wednesday 07:00 UTC',()=>{
  // Sunday 18 Oct 2026 12:00 UTC: the last weekly reset was Wednesday 14 Oct 07:00, the next Wednesday 21 Oct 07:00.
  const now=Date.UTC(2026,9,18,12);
  assert.equal(new Date(lastReset(now,'weekly',data)).toISOString(),'2026-10-14T07:00:00.000Z');
  assert.equal(new Date(nextReset(now,'weekly',data)).toISOString(),'2026-10-21T07:00:00.000Z');
  // Wednesday 06:59 is still the old week; 07:00 starts the new one.
  assert.equal(new Date(lastReset(Date.UTC(2026,9,21,6,59),'weekly',data)).toISOString(),'2026-10-14T07:00:00.000Z');
  assert.equal(new Date(lastReset(Date.UTC(2026,9,21,7),'weekly',data)).toISOString(),'2026-10-21T07:00:00.000Z');
});
check('daily reset is 07:00 UTC',()=>{
  assert.equal(new Date(lastReset(Date.UTC(2026,9,18,6),'daily',data)).toISOString(),'2026-10-17T07:00:00.000Z');
  assert.equal(new Date(nextReset(Date.UTC(2026,9,18,6),'daily',data)).toISOString(),'2026-10-18T07:00:00.000Z');
});
check('countdown splits days, hours and minutes',()=>{
  assert.deepEqual(countdown(Date.UTC(2026,9,18,12),Date.UTC(2026,9,21,7)),{ms:(2*24+19)*3600000,days:2,hours:19,minutes:0});
  assert.equal(countdown(10,5).ms,0);
});
check('a weekly tick clears at the Wednesday reset, a daily tick at 07:00, energy keeps it',()=>{
  const tick='2026-10-20T20:00:00.000Z';
  assert.equal(tickValid(tick,'weekly',Date.UTC(2026,9,21,6),data),true);
  assert.equal(tickValid(tick,'weekly',Date.UTC(2026,9,21,7),data),false);
  assert.equal(tickValid(tick,'daily',Date.UTC(2026,9,21,6),data),true);
  assert.equal(tickValid(tick,'daily',Date.UTC(2026,9,21,8),data),false);
  assert.equal(tickValid(tick,'energy',Date.UTC(2027,0,1),data),true);
  assert.equal(tickValid('not a date','weekly',Date.now(),data),false);
});
check('weeklyState marks items done for the current cycle only',()=>{
  const ticks={'ascension-trial':'2026-10-15T10:00:00.000Z',nightmare:'2026-10-15T10:00:00.000Z'};
  const state=Object.fromEntries(weeklyState(data,ticks,Date.UTC(2026,9,18,12)).map(item=>[item.id,item.done]));
  assert.equal(state['ascension-trial'],true);
  assert.equal(state.nightmare,false);
  assert.equal(state.shugo,false);
});
check('the weekly loop links each gated item to its gate',()=>{
  const trial=weeklyLoop(data).items.find(item=>item.id==='ascension-trial');
  assert.equal(trial.gate.itemLevel,1000);
  assert.equal(trial.unlock,45);
});

console.log('contentGates and powerSteps');
check('item level 795 at Lv 45: Krao and Draupnir open, the Ascension Trial next',()=>{
  const gates=contentGates(795,45,data);
  assert.ok(ids(gates.open).includes('krao-conquest'));
  assert.ok(ids(gates.open).includes('draupnir-exploration'));
  assert.equal(gates.next.id,'ascension-trial');
  assert.equal(gates.next.needsItemLevel,205);
  assert.equal(gates.nextByLevel,null);
});
check('item level 250 at Lv 22: Krao open, Urugugu next by level',()=>{
  const gates=contentGates(250,22,data);
  assert.deepEqual(ids(gates.open),['krao-exploration']);
  assert.equal(gates.next,null);
  assert.equal(gates.nextByLevel.id,'urugugu-exploration');
});
check('an unknown item level opens nothing and names no next gate',()=>{
  const gates=contentGates(null,45,data);
  assert.equal(gates.itemLevel,null);
  assert.deepEqual(gates.open,[]);
  assert.equal(gates.next,null);
});
check('power order by stage: save before Lv 35, Unique growth from 35, Arcana at the cap',()=>{
  assert.deepEqual(ids(powerSteps(20,data).now),['daevanion','save']);
  assert.deepEqual(ids(powerSteps(35,data).now),['daevanion','unique-growth','manastones','soul-binding']);
  assert.deepEqual(ids(powerSteps(45,data).now),['daevanion','unique-growth','manastones','soul-binding','arcana']);
  assert.ok(ids(powerSteps(20,data).later).includes('arcana'));
});

console.log('snapshots');
check('snapshotOf keeps level, combat power, item level and grade and enchant per slot',()=>{
  const snap=snapshotOf({profile:{level:45,combatPower:40662,itemLevel:795},gear:[{slot:'Weapon',name:'Sword',grade:'Unique',enchant:10},{slot:'Helmet',empty:true}]});
  assert.deepEqual(snap,{level:45,combatPower:40662,itemLevel:795,gear:{Weapon:{name:'Sword',grade:'Unique',enchant:10}}});
});
check('snapshotChanges lists what moved, and nothing for the same snapshot',()=>{
  const a={level:44,combatPower:30000,itemLevel:700,gear:{Weapon:{name:'Sword',grade:'Epic',enchant:5},Gloves:{name:'G',grade:'Unique',enchant:3}}};
  const b={level:45,combatPower:40662,itemLevel:795,gear:{Weapon:{name:'Blade',grade:'Unique',enchant:0},Gloves:{name:'G',grade:'Unique',enchant:7},Boots:{name:'B',grade:'Unique',enchant:0}}};
  const kinds=snapshotChanges(a,b).map(change=>`${change.kind}${change.slot?`:${change.slot}`:''}`);
  assert.deepEqual(kinds,['level','combatPower','itemLevel','grade:Weapon','enchant:Gloves','new:Boots']);
  assert.deepEqual(snapshotChanges(a,a),[]);
  assert.deepEqual(snapshotChanges(null,b),[]);
  assert.deepEqual(snapshotChanges({...a,gear:{}},{...a,gear:b.gear}),[],'no slot by slot compare against a snapshot with no gear');
});

console.log(failed?`AION2_GUIDE=FAIL ${failed}`:'AION2_GUIDE=PASS');
process.exit(failed?1:0);
