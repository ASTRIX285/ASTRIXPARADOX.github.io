import {AUTH_ORIGIN} from '../guardian-workspace-v2/guardian-bungie-auth.mjs?v=20260902-shared-account-orbit-1';
import {guardianManifest} from '../guardian-workspace-v2/guardian-manifest-service.mjs?v=20260906-all-page-data-1';

const REQUEST_TIMEOUT_MS=30_000;
const BUNGIE_ORIGIN='https://www.bungie.net';
const SUBCLASS_BUCKET_HASH=3284755031;
const CLASS_NAMES=['titan','hunter','warlock'];
const STAT_ORDER=[2996146975,392767087,1943323491,1735777505,144602215,4244567218];
const PVP_MODES=new Set([5,10,12,15,19,25,31,32,37,38,39,41,42,43,44,45,48,49,50,51,52,53,54,55,56,57,59,60,61,62,65,67,68,69,70,71,72,73,74,80,81,84,88,89,90,91,92]);
const GAMBIT_MODES=new Set([63,75]);
const RAID_DUNGEON_MODES=new Set([4,82]);
const VANGUARD_MODES=new Set([3,16,17,18,46,47]);
const manifestReady=guardianManifest.ready();

/*
Internal activity shape. Every value is copied from or derived only from a
returned Bungie GetActivityHistory period. Missing live values remain null.
{
  instanceId, activityHash, activityName, mode, modeLabel, category, period,
  durationSeconds, durationDisplay, completed, buildSnapshot,
  stats:{kills,deaths,assists,timeSeconds,timeDisplay,kd,score}
}

Internal Mission Reports result.
{
  status:'ok'|'unavailable'|'unauthenticated', activities:[], context,
  characterId, lastSynced
}
The result never creates activities, milestones, build snapshots or values.
*/

const finiteNumber=value=>{
  if(value===null||value===undefined||value==='')return null;
  const number=Number(value);
  return Number.isFinite(number)?number:null;
};

const absoluteIcon=path=>{
  if(typeof path!=='string'||!path.trim())return '';
  try{return new URL(path,BUNGIE_ORIGIN).toString();}
  catch{return '';}
};

const statPair=(values,key)=>{
  const basic=values?.[key]?.basic;
  const value=finiteNumber(basic?.value);
  return {
    value,
    displayValue:typeof basic?.displayValue==='string'&&basic.displayValue.trim()?basic.displayValue.trim():null
  };
};

const completionValue=values=>{
  const value=statPair(values,'completed').value;
  if(value===null)return null;
  return value!==0;
};

async function manifestRequestUrl(path){
  await manifestReady;
  const url=new URL(path,AUTH_ORIGIN);
  if(path==='/bungie/profile')url.pathname='/bungie/page/journey';
  return url;
}

async function fetchJsonWithTimeout(url,{fetchImpl=globalThis.fetch?.bind(globalThis),timeoutMs=REQUEST_TIMEOUT_MS}={}){
  if(!fetchImpl)return {status:'unavailable',httpStatus:null,payload:null};
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetchImpl(url,{credentials:'include',headers:{Accept:'application/json'},signal:controller.signal});
    const payload=await response.json().catch(()=>({}));
    if(response.status===401)return {status:'unauthenticated',httpStatus:response.status,payload};
    if(!response.ok)return {status:'unavailable',httpStatus:response.status,payload};
    return {status:'ok',httpStatus:response.status,payload};
  }catch{
    return {status:'unavailable',httpStatus:null,payload:null};
  }finally{
    clearTimeout(timer);
  }
}

const activityRows=payload=>{
  const rows=payload?.Response?.activities??payload?.response?.activities??payload?.activities;
  return Array.isArray(rows)?rows:[];
};

const profileCharacters=payload=>{
  const data=payload?.profile?.characters?.data??payload?.Response?.characters?.data;
  return data&&typeof data==='object'?Object.values(data):[];
};

function mostRecentCharacterId(characters){
  return String([...characters]
    .filter(character=>character?.characterId)
    .sort((left,right)=>String(right?.dateLastPlayed||'').localeCompare(String(left?.dateLastPlayed||'')))[0]?.characterId||'');
}

async function resolveDefinition(type,hash){
  if(hash===null||hash===undefined)return null;
  try{
    await manifestReady;
    return await guardianManifest.getAsync(type,hash);
  }catch{
    return null;
  }
}

function activityCategory(mode,modeLabel=''){
  if(PVP_MODES.has(mode))return 'Crucible';
  if(GAMBIT_MODES.has(mode))return 'Gambit';
  if(RAID_DUNGEON_MODES.has(mode))return 'Raids & Dungeons';
  if(VANGUARD_MODES.has(mode))return 'Vanguard';
  const label=String(modeLabel).toLowerCase();
  if(/crucible|trials|iron banner|rumble|control|clash|supremacy|mayhem/.test(label))return 'Crucible';
  if(/gambit/.test(label))return 'Gambit';
  if(/raid|dungeon/.test(label))return 'Raids & Dungeons';
  if(/strike|nightfall|vanguard/.test(label))return 'Vanguard';
  if(/legend|exotic|campaign|dares/.test(label))return 'Legends';
  return 'Other';
}

function normaliseBuildSnapshot(period){
  const source=period?.buildSnapshot??period?.buildEvidence??null;
  if(!source||typeof source!=='object')return null;
  const id=String(source.id??source.snapshotId??source.buildId??'').trim();
  const name=String(source.name??source.buildName??'').trim();
  if(!id&&!name)return null;
  const images=rows=>(Array.isArray(rows)?rows:[]).map(item=>({
    name:String(item?.name||'').trim(),
    icon:absoluteIcon(item?.icon||item?.iconUrl||item?.displayProperties?.icon)
  })).filter(item=>item.name||item.icon);
  return {
    id,
    name,
    subtitle:String(source.subtitle??source.description??source.activityPurpose??'').trim(),
    weapons:images(source.weapons),
    armour:images(source.armour)
  };
}

async function normaliseActivity(period){
  const details=period?.activityDetails||{};
  const values=period?.values||{};
  const activityHash=finiteNumber(details.referenceId??details.directorActivityHash);
  const mode=finiteNumber(details.mode);
  const [activityDefinition,modeDefinition]=await Promise.all([
    resolveDefinition('DestinyActivityDefinition',activityHash),
    resolveDefinition('DestinyActivityModeDefinition',mode)
  ]);
  const activityDuration=statPair(values,'activityDurationSeconds');
  const timePlayed=statPair(values,'timePlayedSeconds');
  const kills=statPair(values,'kills').value;
  const deaths=statPair(values,'deaths').value;
  const assists=statPair(values,'assists').value;
  const reportedKd=statPair(values,'killsDeathsRatio').value;
  const derivedKd=reportedKd===null&&kills!==null&&deaths!==null&&deaths>0?kills/deaths:null;
  const modeLabel=String(modeDefinition?.displayProperties?.name||'').trim()||(mode===null?'Mode not returned':`Mode ${mode}`);
  return {
    instanceId:String(details.instanceId||''),
    activityHash,
    activityName:String(activityDefinition?.displayProperties?.name||'').trim()||(activityHash===null?'Activity definition unavailable':`Activity hash ${activityHash}`),
    mode,
    modeLabel,
    category:activityCategory(mode,modeLabel),
    period:typeof period?.period==='string'&&period.period.trim()?period.period:null,
    durationSeconds:activityDuration.value,
    durationDisplay:activityDuration.displayValue,
    completed:completionValue(values),
    buildSnapshot:normaliseBuildSnapshot(period),
    stats:{
      kills,
      deaths,
      assists,
      timeSeconds:timePlayed.value,
      timeDisplay:timePlayed.displayValue,
      kd:reportedKd??derivedKd,
      score:statPair(values,'score').value
    }
  };
}

async function normaliseActivityHistory(payload){
  return Promise.all(activityRows(payload).map(normaliseActivity));
}

async function statDefinition(payload,hash){
  return payload?.statDefinitions?.[String(hash)]||resolveDefinition('DestinyStatDefinition',hash);
}

async function normaliseCharacter(payload,character){
  const stats=(await Promise.all(STAT_ORDER.map(async hash=>{
    const value=finiteNumber(character?.stats?.[hash]);
    if(value===null)return null;
    const row=await statDefinition(payload,hash);
    const name=String(row?.displayProperties?.name||'').trim()||`Destiny stat ${hash}`;
    return [name,value,absoluteIcon(row?.displayProperties?.icon),hash];
  }))).filter(Boolean);
  const classType=finiteNumber(character?.classType);
  return {
    characterId:String(character?.characterId||''),
    characterClass:CLASS_NAMES[classType]||'guardian',
    power:finiteNumber(character?.light),
    stats,
    minutesPlayedTotal:finiteNumber(character?.minutesPlayedTotal),
    dateLastPlayed:typeof character?.dateLastPlayed==='string'?character.dateLastPlayed:null,
    emblem:{
      icon:absoluteIcon(character?.emblemPath),
      background:absoluteIcon(character?.emblemBackgroundPath)
    }
  };
}

async function equippedSubclass(payload,characterId){
  const equipment=payload?.profile?.characterEquipment?.data?.[characterId]?.items;
  if(!Array.isArray(equipment))return null;
  for(const item of equipment){
    const hash=finiteNumber(item?.itemHash);
    if(hash===null)continue;
    const row=payload?.definitions?.[String(hash)]||await resolveDefinition('DestinyInventoryItemDefinition',hash);
    if(finiteNumber(row?.inventory?.bucketTypeHash)!==SUBCLASS_BUCKET_HASH)continue;
    const name=String(row?.displayProperties?.name||'').trim();
    return name?{hash,name,icon:absoluteIcon(row?.displayProperties?.icon)}:null;
  }
  return null;
}

async function normaliseMissionProfile(payload,session={},preferredCharacterId=''){
  const rawCharacters=profileCharacters(payload);
  const characters=await Promise.all(rawCharacters.map(character=>normaliseCharacter(payload,character)));
  const classOrder={hunter:0,warlock:1,titan:2};
  characters.sort((left,right)=>(classOrder[left.characterClass]??9)-(classOrder[right.characterClass]??9));
  const selectedCharacterId=String(preferredCharacterId||mostRecentCharacterId(rawCharacters));
  const selected=characters.find(character=>character.characterId===selectedCharacterId)||characters[0]||null;
  const subclass=selected?await equippedSubclass(payload,selected.characterId):null;
  const minutes=characters.map(character=>character.minutesPlayedTotal).filter(Number.isFinite);
  const displayName=String(payload?.membership?.displayName||session?.activeDestinyMembership?.displayName||'').trim();
  const guardianRank=finiteNumber(payload?.profile?.profileProgression?.data?.currentGuardianRank??payload?.profile?.profileProgression?.data?.highestCurrentGuardianRank);
  return {
    displayName,
    characters,
    selectedCharacterId:selected?.characterId||'',
    guardian:selected?{
      characterId:selected.characterId,
      className:selected.characterClass,
      subclassName:subclass?.name||null,
      subclassIcon:subclass?.icon||'',
      emblem:selected.emblem,
      totalPlaytimeMinutes:minutes.length?minutes.reduce((total,value)=>total+value,0):null,
      accountAgeDays:null,
      journeyLevel:null,
      journeyXp:null,
      journeyXpTarget:null,
      guardianRank,
      verified:true
    }:null
  };
}

async function resolveCharacterId(session,{fetchImpl}={}){
  const sessionCharacterId=String(session?.activeDestinyMembership?.characterId||session?.characterId||'');
  if(sessionCharacterId)return {status:'ok',characterId:sessionCharacterId};
  const profileRequest=await fetchJsonWithTimeout(await manifestRequestUrl('/bungie/profile'),{fetchImpl});
  if(profileRequest.status!=='ok')return {status:profileRequest.status,characterId:'',payload:null};
  guardianManifest.seedPayload(profileRequest.payload);
  const characters=profileCharacters(profileRequest.payload);
  const characterId=rememberedCharacterId(characters)||mostRecentCharacterId(characters);
  return characterId?{status:'ok',characterId,payload:profileRequest.payload}:{status:'unavailable',characterId:'',payload:profileRequest.payload};
}

async function loadActivityHistory({session=globalThis.FORGE_BUNGIE_SESSION,characterId='',mode=null,page=0,fetchImpl}={}){
  if(session?.authenticated!==true)return {status:'unauthenticated',activities:[]};
  let resolvedCharacterId=String(characterId||'');
  if(!resolvedCharacterId){
    const resolution=await resolveCharacterId(session,{fetchImpl});
    if(resolution.status!=='ok')return {status:resolution.status,activities:[]};
    resolvedCharacterId=resolution.characterId;
  }
  const url=await manifestRequestUrl('/bungie/activity-history');
  url.searchParams.set('characterId',resolvedCharacterId);
  if(mode!==null&&mode!==undefined&&String(mode).trim()!=='')url.searchParams.set('mode',String(mode));
  if(Number.isInteger(Number(page))&&Number(page)>=0)url.searchParams.set('page',String(Number(page)));

  // Miguel must add this /bungie/activity-history proxy route to the deployed auth Worker for live history data.
  const request=await fetchJsonWithTimeout(url,{fetchImpl});
  if(request.status!=='ok')return {status:request.status,activities:[]};
  return {status:'ok',activities:await normaliseActivityHistory(request.payload),characterId:resolvedCharacterId};
}

async function loadMissionReports({session=globalThis.FORGE_BUNGIE_SESSION,characterId='',fetchImpl}={}){
  if(session?.authenticated!==true)return {status:'unauthenticated',activities:[],context:null,characterId:'',lastSynced:null};
  const profileRequest=await fetchJsonWithTimeout(await manifestRequestUrl('/bungie/profile'),{fetchImpl});
  if(profileRequest.status==='unauthenticated')return {status:'unauthenticated',activities:[],context:null,characterId:'',lastSynced:null};
  if(profileRequest.status==='ok')guardianManifest.seedPayload(profileRequest.payload);
  const context=profileRequest.status==='ok'?await normaliseMissionProfile(profileRequest.payload,session,characterId):null;
  const resolvedCharacterId=String(context?.selectedCharacterId||characterId||session?.activeDestinyMembership?.characterId||session?.characterId||'');
  if(!resolvedCharacterId)return {status:'unavailable',activities:[],context,characterId:'',lastSynced:null};
  const history=await loadActivityHistory({session,characterId:resolvedCharacterId,fetchImpl});
  return {
    status:history.status,
    activities:history.activities,
    context,
    characterId:resolvedCharacterId,
    lastSynced:history.status==='ok'?new Date().toISOString():null
  };
}

function buildActivityTrends(activities=[]){
  const sourced=Array.isArray(activities)?activities:[];
  const completionEvidence=sourced.filter(activity=>typeof activity?.completed==='boolean');
  const completedCount=completionEvidence.filter(activity=>activity.completed).length;
  const modeCounts=new Map();
  sourced.forEach(activity=>{
    const label=String(activity?.modeLabel||'').trim();
    if(label)modeCounts.set(label,(modeCounts.get(label)||0)+1);
  });
  return {
    completion:completionEvidence.length?{
      completed:completedCount,
      total:completionEvidence.length,
      percent:Math.round(completedCount/completionEvidence.length*100)
    }:null,
    distribution:[...modeCounts.entries()]
      .map(([modeLabel,count])=>({modeLabel,count,percent:sourced.length?Math.round(count/sourced.length*100):0}))
      .sort((left,right)=>right.count-left.count||left.modeLabel.localeCompare(right.modeLabel))
  };
}

function successRate(activities){
  const values=activities.filter(activity=>typeof activity?.completed==='boolean');
  return values.length?Math.round(values.filter(activity=>activity.completed).length/values.length*100):null;
}

function aggregateKd(activities){
  const kills=activities.map(activity=>activity?.stats?.kills).filter(Number.isFinite);
  const deaths=activities.map(activity=>activity?.stats?.deaths).filter(Number.isFinite);
  if(!kills.length||!deaths.length)return null;
  const deathTotal=deaths.reduce((total,value)=>total+value,0);
  return deathTotal>0?kills.reduce((total,value)=>total+value,0)/deathTotal:null;
}

function masteryRows(activities){
  const groups=new Map();
  activities.forEach(activity=>{
    const key=`${activity.activityHash??activity.activityName}:${activity.mode??''}`;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(activity);
  });
  return [...groups.values()].map(rows=>{
    const sorted=[...rows].sort((left,right)=>String(right.period||'').localeCompare(String(left.period||'')));
    const scores=rows.map(activity=>activity?.stats?.score).filter(Number.isFinite);
    const builds=rows.map(activity=>activity.buildSnapshot?.name).filter(Boolean);
    const buildCounts=new Map();
    builds.forEach(name=>buildCounts.set(name,(buildCounts.get(name)||0)+1));
    const buildUsed=[...buildCounts.entries()].sort((left,right)=>right[1]-left[1]||left[0].localeCompare(right[0]))[0]?.[0]||null;
    return {
      activityName:rows[0].activityName,
      modeLabel:rows[0].modeLabel,
      category:rows[0].category,
      completions:rows.filter(activity=>activity.completed===true).length,
      bestResult:scores.length?Math.max(...scores):null,
      lastPlayed:sorted[0]?.period||null,
      successRate:successRate(rows),
      buildUsed,
      evidenceCount:rows.length
    };
  }).sort((left,right)=>right.completions-left.completions||String(right.lastPlayed||'').localeCompare(String(left.lastPlayed||'')));
}

function confidenceBreakdown(activities){
  if(!activities.length)return null;
  const levels={high:0,medium:0,low:0};
  activities.forEach(activity=>{
    const evidence=[
      activity.activityHash,activity.mode,activity.period,activity.durationSeconds,
      activity.completed,activity.stats?.kills,activity.stats?.deaths,activity.stats?.assists
    ];
    const present=evidence.filter(value=>value!==null&&value!==undefined&&value!=='').length/evidence.length;
    if(present>=.8)levels.high+=1;
    else if(present>=.5)levels.medium+=1;
    else levels.low+=1;
  });
  const total=activities.length;
  return {
    high:levels.high,
    medium:levels.medium,
    low:levels.low,
    highPercent:Math.round(levels.high/total*100),
    mediumPercent:Math.round(levels.medium/total*100),
    lowPercent:Math.round(levels.low/total*100),
    total
  };
}

function trendSeries(activities){
  const cutoff=Date.now()-30*24*60*60*1000;
  const rows=activities.filter(activity=>{
    const time=Date.parse(activity?.period||'');
    return Number.isFinite(time)&&time>=cutoff;
  });
  const days=new Map();
  rows.forEach(activity=>{
    const date=new Date(activity.period).toISOString().slice(0,10);
    if(!days.has(date))days.set(date,[]);
    days.get(date).push(activity);
  });
  const pve=[];
  const pvp=[];
  [...days.entries()].sort(([left],[right])=>left.localeCompare(right)).forEach(([date,dayRows])=>{
    const pveRows=dayRows.filter(activity=>activity.category!=='Crucible'&&activity.category!=='Gambit');
    const pvpRows=dayRows.filter(activity=>activity.category==='Crucible');
    const pveValue=successRate(pveRows);
    const pvpValue=aggregateKd(pvpRows);
    if(pveValue!==null)pve.push({date,value:pveValue});
    if(pvpValue!==null)pvp.push({date,value:Number(pvpValue.toFixed(3))});
  });
  return {pve,pvp};
}

function buildEvidence(activities,category){
  const rows=activities.filter(activity=>{
    if(!activity.buildSnapshot)return false;
    if(category==='PVE')return activity.category!=='Crucible'&&activity.category!=='Gambit';
    return activity.category===category;
  });
  if(!rows.length)return null;
  const groups=new Map();
  rows.forEach(activity=>{
    const snapshot=activity.buildSnapshot;
    const key=snapshot.id||snapshot.name;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(activity);
  });
  const candidates=[...groups.values()].map(group=>{
    const snapshot=group[0].buildSnapshot;
    const metric=category==='Crucible'?aggregateKd(group):successRate(group);
    return {
      id:snapshot.id,
      name:snapshot.name,
      subtitle:snapshot.subtitle,
      sampleSize:group.length,
      metric,
      metricType:category==='Crucible'?'kd':'success-rate',
      sparkline:group.map(activity=>category==='Crucible'?activity.stats?.kd:(typeof activity.completed==='boolean'?(activity.completed?1:0):null)).filter(Number.isFinite),
      weapons:snapshot.weapons,
      armour:snapshot.armour,
      verified:true
    };
  }).filter(candidate=>candidate.metric!==null);
  return candidates.sort((left,right)=>right.metric-left.metric||right.sampleSize-left.sampleSize)[0]||null;
}

function buildMissionReportView(activities=[]){
  const sourced=Array.isArray(activities)?activities:[];
  const pvp=sourced.filter(activity=>activity.category==='Crucible');
  const pve=sourced.filter(activity=>activity.category!=='Crucible'&&activity.category!=='Gambit');
  return {
    summary:{
      totalActivities:sourced.length,
      completionRate:successRate(sourced),
      pveClears:pve.filter(activity=>activity.completed===true).length,
      pvpKd:aggregateKd(pvp)
    },
    mastery:masteryRows(sourced),
    trends:trendSeries(sourced),
    confidence:confidenceBreakdown(sourced),
    buildEvidence:{
      pve:buildEvidence(sourced,'PVE'),
      pvp:buildEvidence(sourced,'Crucible')
    },
    milestones:[],
    recentProgression:[]
  };
}

export {
  buildActivityTrends,
  buildMissionReportView,
  loadActivityHistory,
  loadMissionReports,
  normaliseActivityHistory,
  normaliseMissionProfile
};
