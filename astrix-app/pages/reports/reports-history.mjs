import {bungieImage,stat} from './reports-model.mjs?v=20260925-reports-20c';
import {createReportsStore} from './reports-data.mjs?v=20260925-reports-20c';

export const RUN_PAGE_SIZE=20;
const completed=values=>{const value=stat(values,'completed');return value===1?true:value===0?false:null;};
export function historyRun(row,characterId){
  const details=row?.activityDetails;
  if(!/^\d+$/.test(details?.instanceId||'')||!(details?.referenceId||details?.directorActivityHash)||!Number.isFinite(Date.parse(row.period)))throw new Error('Run history pending');
  return {id:String(details.instanceId),characterId:String(characterId),hash:String(details.referenceId||''),directorHash:String(details.directorActivityHash||''),period:row.period,
    duration:stat(row.values,'activityDurationSeconds'),completed:completed(row.values),kills:stat(row.values,'kills'),deaths:stat(row.values,'deaths'),fireteamSize:stat(row.values,'playerCount')};
}
export function runMatches(run,activity){return activity.variants.some(row=>row.hash===run.hash||row.hash===run.directorHash);}
export function pgcrModel(report){
  if(!Array.isArray(report?.entries)||!report.entries.length)throw new Error('Run detail pending');
  const players=report.entries.map(entry=>{
    const user=entry.player?.destinyUserInfo||{};
    const name=user.bungieGlobalDisplayName||user.displayName||'Name pending';
    const code=user.bungieGlobalDisplayNameCode;
    return {characterId:String(entry.characterId||''),name:user.bungieGlobalDisplayName&&Number.isInteger(code)&&code>0?`${name}#${String(code).padStart(4,'0')}`:name,
      className:entry.player?.characterClass||null,timePlayed:stat(entry.values,'timePlayedSeconds'),membershipId:String(user.membershipId||''),membershipType:user.membershipType,assists:stat(entry.values,'assists'),kd:stat(entry.values,'killsDeathsRatio'),emblem:bungieImage(user.iconPath),kills:stat(entry.values,'kills'),deaths:stat(entry.values,'deaths'),completed:completed(entry.values),duration:stat(entry.values,'activityDurationSeconds')};
  });
  const durations=players.map(row=>row.duration).filter(Number.isFinite);
  const flawless=players.some(p=>p.completed===false||p.deaths>0)?false:players.every(p=>p.completed===true&&p.deaths===0)?true:null;
  const members=new Set(players.map(p=>`${p.membershipType}:${p.membershipId}`));
  const size=players.every(p=>p.membershipId&&p.membershipType)?members.size:null;
  return {startedFromBeginning:typeof report.activityWasStartedFromBeginning==='boolean'?report.activityWasStartedFromBeginning:null,selectedSkullHashes:Array.isArray(report.selectedSkullHashes)?report.selectedSkullHashes.filter(Number.isInteger).map(String):null,hash:String(report.activityDetails?.referenceId||''),directorHash:String(report.activityDetails?.directorActivityHash||''),flawless,fireteamSize:size,badges:[...(flawless?['Flawless']:[]),...(size>=1&&size<=3&&players.some(p=>p.completed===true)?[['Solo','Duo','Trio'][size-1]]:[])],period:Number.isFinite(Date.parse(report.period))?report.period:null,duration:durations.length?Math.max(...durations):null,players,...fireteamTotals(players)};
}
// One controller per signed-in snapshot. No player data in shared/edge caches.
export function createReportsHistory(snapshot,{origin='https://auth.astrixparadox.com',fetchImpl=globalThis.fetch?.bind(globalThis),store=createReportsStore(),now=Date.now,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
  const streams=new Map(snapshot.characters.map(row=>[row.characterId,{page:0,done:false,through:Infinity,runs:new Map()}]));
  const pgcrFlights=new Map(),pgcrCache=new Map();
  let flight=null;
  async function request(path){
    for(let attempt=0;attempt<4;attempt++){
      const response=await fetchImpl(new URL(path,origin).href,{credentials:'include',signal:AbortSignal.timeout(30_000)});
      const payload=await response.json();
      if(response.status===429||payload?.ErrorCode===36){
        const retry=response.headers?.get('Retry-After');
        const delay=Number(payload?.ThrottleSeconds)||Number(retry)||(Date.parse(retry)-now())/1000||1;
        if(attempt<3){await sleep(Math.max(1,Math.min(delay,60))*1000);continue;}
      }
      if(!response.ok||payload?.ErrorCode!==1||!payload.Response)throw new Error('Reports pending. Retry.');
      return payload.Response;
    }
    throw new Error('Reports pending. Retry.');
  }
  function selection(characterId){return [...streams].filter(([id])=>characterId==='all'||id===characterId).map(([,row])=>row);}
  function runs(activity,characterId='all'){
    const selected=selection(characterId);
    // Only publish the range fetched for every selected character. A less active
    // character's older page cannot jump ahead of an unfetched busy character.
    const through=Math.max(-Infinity,...selected.filter(row=>!row.done).map(row=>row.through));
    const rows=selected.flatMap(row=>[...row.runs.values()]).filter(row=>Date.parse(row.period)>through&&(!activity||runMatches(row,activity)));
    return rows.sort((a,b)=>Date.parse(b.period)-Date.parse(a.period)||b.id.localeCompare(a.id)||a.characterId.localeCompare(b.characterId));
  }
  function complete(characterId='all'){return selection(characterId).every(row=>row.done);}
  async function advance(){
    if(flight)return flight;
    flight=(async()=>{
      const results=await Promise.allSettled([...streams].filter(([,row])=>!row.done).map(async([id,state])=>{
        const subject=snapshot.subject?`&subjectType=${snapshot.subject.membershipType}&subjectId=${encodeURIComponent(snapshot.subject.membershipId)}`:'';
        const data=await request(`/bungie/reports?kind=history&characterId=${encodeURIComponent(id)}&page=${state.page}${subject}`);
        if(data.activities!==undefined&&!Array.isArray(data.activities))throw new Error('Run history pending');
        const rows=(data.activities||[]).map(row=>historyRun(row,id));
        if(rows.length&&state.page>0&&rows.every(row=>state.runs.has(`${row.id}:${id}`)))throw new Error('Run history did not advance');
        for(const row of rows)state.runs.set(`${row.id}:${id}`,row);
        state.page++;state.done=rows.length===0;
        if(rows.length)state.through=Math.min(...rows.map(row=>Date.parse(row.period)));
      }));
      const failed=results.find(row=>row.status==='rejected');if(failed)throw failed.reason;
    })();
    try{await flight;}finally{flight=null;}
  }
  async function page(activity,characterId='all',pageIndex=0){
    // Bounded work per interaction, with an explicit continuation if this activity
    // is far back in the account history. Never label a partial scan as empty.
    for(let round=0;round<5&&!complete(characterId)&&runs(activity,characterId).length<(pageIndex+1)*RUN_PAGE_SIZE+1;round++)await advance();
    return readPage(activity,characterId,pageIndex);
  }
  function readPage(activity,characterId='all',pageIndex=0){
    const rows=runs(activity,characterId),end=(pageIndex+1)*RUN_PAGE_SIZE;
    return {rows:rows.slice(pageIndex*RUN_PAGE_SIZE,end),hasNext:rows.length>end,complete:complete(characterId),searching:rows.length<=end&&!complete(characterId)};
  }
  async function pgcr(id){
    if(!/^\d+$/.test(id))throw new Error('Invalid run');
    const memo=pgcrCache.get(id);if(memo&&now()-memo.fetchedAt<24*60*60_000)return memo.model;
    if(pgcrFlights.has(id))return pgcrFlights.get(id);
    const task=(async()=>{
      const key=`reports-pgcr-v1:${snapshot.identity}:${id}`;
      const cached=await store.get(key);
      if(cached&&now()-cached.fetchedAt<24*60*60_000){const model=pgcrModel(cached.report);pgcrCache.set(id,{model,fetchedAt:cached.fetchedAt});return model;}
      const report=await request(`/bungie/pgcr/${id}`);
      if(String(report.activityDetails?.instanceId)!==id)throw new Error('Run detail pending');
      const model=pgcrModel(report);pgcrCache.set(id,{model,fetchedAt:now()});await store.set(key,{fetchedAt:now(),report});return model;
    })();
    pgcrFlights.set(id,task);try{return await task;}finally{pgcrFlights.delete(id);}
  }
  const definitionCache=new Map();
  async function definition(type,hash){
    const key=`${type}:${hash}`;
    if(!definitionCache.has(key))definitionCache.set(key,request(`/bungie/reports?kind=definition&definition=${type}&hash=${encodeURIComponent(hash)}`).catch(error=>{definitionCache.delete(key);throw error;}));
    return definitionCache.get(key);
  }
  async function detail(id){
    const model=await pgcr(id);
    let activity=null,collections=[];
    try{
      activity=await definition('DestinyActivityDefinition',model.directorHash||model.hash);
      const hashes=[...new Set([...(activity.selectableSkullCollectionHashes||[]),...(activity.selectableSkullCollections||[]).map(row=>row.selectableSkullCollectionHash)])].filter(Number.isInteger);
      if(model.selectedSkullHashes?.length)collections=await Promise.all(hashes.map(hash=>definition('DestinyActivitySelectableSkullCollectionDefinition',hash).catch(()=>null)));
    }catch{/* PGCR remains usable when a definition is unavailable. */}
    return {...model,name:activity?.displayProperties?.name||null,image:bungieImage(activity?.pgcrImage),modifiers:modifierNames(model.selectedSkullHashes,collections)};
  }
  return {advance,page,readPage,runs,complete,pgcr,detail};
}

export const normalizeDifficulty=label=>String(label).replace(/(^| · )Normal$/, '$1Standard');

export function difficultyFor(run,activity){
  // The director hash identifies the selected node/version. Reference is the
  // fallback when that node is absent from this family, never variants[0].
  const variant=activity.variants.find(v=>v.hash===run.directorHash)||activity.variants.find(v=>v.hash===run.hash);
  return normalizeDifficulty(variant?.variant?[variant.variant,variant.difficulty==='-'?'':variant.difficulty].filter(Boolean).join(' · '):variant?.difficulty||'Unresolved difficulty');
}
export function historyTotals(activity,rows,complete){
  const sum=key=>complete&&rows.every(row=>Number.isFinite(row[key]))?rows.reduce((total,row)=>total+row[key],0):null;
  const cleared=activity.totals.cleared;
  // Aggregate kills are not a substitute for a complete history scan.
  const entered=complete&&rows.length>=(cleared||0)?rows.length:null;
  return {...activity.totals,entered,kills:sum('kills'),flawless:null};
}

export function modifierNames(hashes,collections){
  if(hashes===null)return null;
  const skulls=collections.flatMap(c=>(c?.selectableActivitySkulls||[]).map(s=>s.activitySkull));
  return hashes.map(hash=>({hash,name:skulls.find(s=>String(s?.hash)===hash)?.displayProperties?.name||null}));
}

// Both breakdowns use the same exact-hash run ledger. Aggregate buckets are
// deliberately excluded: they can collapse historical variants into one hash.
export function activityAnalysis(activity,records,characters,complete=false){
  const rows=[...new Map(records.filter(row=>runMatches(row,activity)).map(row=>[`${row.id}:${row.characterId}`,row])).values()];
  const count=selected=>({entered:selected.length,cleared:selected.filter(r=>r.completed===true).length,
    fastest:selected.some(r=>r.completed===true&&r.duration>0)?Math.min(...selected.filter(r=>r.completed===true&&r.duration>0).map(r=>r.duration)):null,
    notPlayed:complete&&selected.length===0});
  const labels=[...new Set(activity.variants.map(v=>difficultyFor({hash:v.hash,directorHash:v.hash},activity)))];
  for(const row of rows)if(!labels.includes(difficultyFor(row,activity)))labels.push(difficultyFor(row,activity));
  const difficulties=labels.map(difficulty=>({difficulty,...count(rows.filter(r=>difficultyFor(r,activity)===difficulty))}));
  const ids=[...new Set(rows.map(r=>r.characterId))];
  const byCharacter=ids.map(characterId=>({...characters.find(c=>c.characterId===characterId),characterId,...count(rows.filter(r=>r.characterId===characterId))}));
  const totals={...historyTotals(activity,rows,complete),...count(rows)};
  const pending=!complete||rows.some(r=>r.completed===null);
  const aggregateCleared=activity.totals.cleared;
  return {totals,difficulties,characters:byCharacter,pending,aggregateCleared,
    aggregateMismatch:complete&&Number.isFinite(aggregateCleared)&&aggregateCleared!==totals.cleared};
}
export function clearsConsistent(analysis){
  return analysis.totals.cleared===analysis.difficulties.reduce((n,r)=>n+r.cleared,0)
    &&analysis.totals.cleared===analysis.characters.reduce((n,r)=>n+r.cleared,0);
}

// Allocate tenths by largest remainder so displayed shares sum to 100.0%.
// Zero or missing team kills has no defined percentage, never an invented 100%.
export function fireteamTotals(players){
  const sum=key=>players.length&&players.every(p=>Number.isFinite(p[key]))?players.reduce((n,p)=>n+p[key],0):null;
  const kills=sum('kills'),assists=sum('assists'),deaths=sum('deaths'),timePlayed=sum('timePlayed');
  let killShares=players.map(()=>null);
  if(kills>0){
    const exact=players.map(p=>p.kills/kills*1000),units=exact.map(Math.floor);
    const order=exact.map((v,i)=>({i,remainder:v-units[i]})).sort((a,b)=>b.remainder-a.remainder||a.i-b.i);
    const left=1000-units.reduce((n,v)=>n+v,0);
    for(let i=0;i<left;i++)units[order[i].i]++;
    killShares=units.map(n=>n/10);
  }
  return {killShares,teamTotals:{kills,assists,deaths,timePlayed,kd:kills!==null&&deaths>0?kills/deaths:null,
    completed:players.every(p=>typeof p.completed==='boolean')?players.filter(p=>p.completed===true).length:null,killShare:kills>0?100:null}};
}
