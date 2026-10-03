// Synthetic counts on real catalogue hashes (reports-catalogue-current.json), for the completed-only and
// Fastest tests. Not real account data and never used by the production page.
// Character 1 has clears in raids and dungeons; characters 2 and 3 have none. Vesper's Host was entered
// but never cleared. The Desert Perpetual has one full clear (40:00) and one checkpoint clear (02:55).
export const HASH=Object.freeze({
  desertStandard:'1044919065',salvationNormal:'2192826039',salvationStandard:'940375169',
  pantheonMorgeth:'2530656885',pantheonWarpriest:'145874766',warlordStandard:'2004855007',vesperNormal:'1915770060'
});
const value=v=>({basic:{value:v}});
const aggregate=(hash,entered,cleared,fastestSeconds)=>({activityHash:Number(hash),values:{activitiesEntered:value(entered),activityCompletions:value(cleared),activityKills:value(cleared*100),activityDeaths:value(entered),activitySecondsPlayed:value(entered*1800),fastestCompletionMsForActivity:value(fastestSeconds*1000),bestSingleGameScore:value(0)}});
export const aggregates={
  1:{activities:[
    aggregate(HASH.desertStandard,3,2,175),
    aggregate(HASH.salvationNormal,1,1,3000),aggregate(HASH.salvationStandard,2,2,2900),
    aggregate(HASH.pantheonMorgeth,1,1,600),aggregate(HASH.pantheonWarpriest,2,2,500),
    aggregate(HASH.warlordStandard,1,1,1500),
    aggregate(HASH.vesperNormal,2,0,0)
  ]},
  2:{activities:[]},
  3:{activities:[]}
};
// Character 1 run history, newest first. Ids are instance ids; starts are the PGCR start flags.
const run=(id,hash,day,duration,completed,started)=>({id,hash,day,duration,completed,started});
export const runs=[
  run('9000000001',HASH.desertStandard,20,2400,true,true),
  run('9000000002',HASH.desertStandard,19,175,true,false),
  run('9000000003',HASH.desertStandard,18,900,false,true),
  run('9000000004',HASH.salvationNormal,17,3000,true,true),
  run('9000000005',HASH.salvationStandard,16,2900,true,true),
  run('9000000006',HASH.salvationStandard,15,3100,true,true),
  run('9000000007',HASH.pantheonMorgeth,14,600,true,true),
  run('9000000008',HASH.pantheonWarpriest,13,500,true,true),
  run('9000000009',HASH.pantheonWarpriest,12,520,true,true),
  run('9000000010',HASH.warlordStandard,11,1500,true,true),
  run('9000000011',HASH.vesperNormal,10,800,false,true),
  run('9000000012',HASH.vesperNormal,9,700,false,true)
];
const period=day=>`2026-09-${String(day).padStart(2,'0')}T20:00:00Z`;
export const historyRow=r=>({period:period(r.day),activityDetails:{instanceId:r.id,referenceId:Number(r.hash),directorActivityHash:Number(r.hash)},
  values:{activityDurationSeconds:value(r.duration),completed:value(r.completed?1:0),kills:value(50),deaths:value(1),playerCount:value(3)}});
export const pgcr=id=>{
  const r=runs.find(row=>row.id===id);
  return {period:period(r.day),activityWasStartedFromBeginning:r.started,activityDetails:{instanceId:r.id,referenceId:Number(r.hash),directorActivityHash:Number(r.hash)},selectedSkullHashes:[],
    entries:[{characterId:'1',player:{characterClass:'Titan',destinyUserInfo:{bungieGlobalDisplayName:'Fixture',bungieGlobalDisplayNameCode:1,membershipId:'4611686018400000001',membershipType:3}},
      values:{kills:value(50),deaths:value(1),assists:value(5),killsDeathsRatio:value(50),completed:value(r.completed?1:0),activityDurationSeconds:value(r.duration),timePlayedSeconds:value(r.duration)}}]};
};
export const snapshotFor=catalogue=>({identity:'3:fixture',fetchedAt:1,subject:null,
  characters:[{characterId:'1',classType:0},{characterId:'2',classType:1},{characterId:'3',classType:2}],
  catalogue,aggregates:structuredClone(aggregates),milestones:{},records:{profile:null,characters:{}}});
