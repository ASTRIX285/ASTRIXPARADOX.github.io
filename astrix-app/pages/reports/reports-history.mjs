import {bungieImage,stat} from './reports-model.mjs?v=20260925-reports-20c';
import {createReportsStore} from './reports-data.mjs?v=20260925-reports-20c';

export const RUN_PAGE_SIZE=20;
const completed=values=>{const value=stat(values,'completed');return value===1?true:value===0?false:null;};
export function historyRun(row,characterId){
  const details=row?.activityDetails;
  if(!/^\d+$/.test(details?.instanceId||'')||!details?.referenceId||!Number.isFinite(Date.parse(row.period)))throw new Error('Run history pending');
  return {id:String(details.instanceId),characterId:String(characterId),hash:String(details.referenceId),directorHash:String(details.directorActivityHash||''),period:row.period,
    duration:stat(row.values,'activityDurationSeconds'),completed:completed(row.values),kills:stat(row.values,'kills'),deaths:stat(row.values,'deaths')};
}
export function runMatches(run,activity){return activity.variants.some(row=>row.hash===run.hash||row.hash===run.directorHash);}
export function pgcrModel(report){
  if(!Array.isArray(report?.entries)||!report.entries.length)throw new Error('Run detail pending');
  const players=report.entries.map(entry=>{
    const user=entry.player?.destinyUserInfo||{};
    const name=user.bungieGlobalDisplayName||user.displayName||'Name pending';
    const code=user.bungieGlobalDisplayNameCode;
    return {characterId:String(entry.characterId||''),name:user.bungieGlobalDisplayName&&Number.isInteger(code)&&code>0?`${name}#${String(code).padStart(4,'0')}`:name,
      emblem:bungieImage(user.iconPath),kills:stat(entry.values,'kills'),deaths:stat(entry.values,'deaths'),completed:completed(entry.values),duration:stat(entry.values,'activityDurationSeconds')};
  });
  const durations=players.map(row=>row.duration).filter(Number.isFinite);
  return {period:Number.isFinite(Date.parse(report.period))?report.period:null,duration:durations.length?Math.max(...durations):null,players};
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
        const data=await request(`/bungie/reports?kind=history&characterId=${encodeURIComponent(id)}&page=${state.page}`);
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
    if(pgcrCache.has(id))return pgcrCache.get(id);
    if(pgcrFlights.has(id))return pgcrFlights.get(id);
    const task=(async()=>{
      const key=`reports-pgcr-v1:${snapshot.identity}:${id}`;
      const cached=await store.get(key);
      if(cached&&now()-cached.fetchedAt<24*60*60_000){const model=pgcrModel(cached.report);pgcrCache.set(id,model);return model;}
      const report=await request(`/bungie/pgcr/${id}`);
      if(String(report.activityDetails?.instanceId)!==id)throw new Error('Run detail pending');
      const model=pgcrModel(report);pgcrCache.set(id,model);await store.set(key,{fetchedAt:now(),report});return model;
    })();
    pgcrFlights.set(id,task);try{return await task;}finally{pgcrFlights.delete(id);}
  }
  return {advance,page,readPage,runs,complete,pgcr};
}
