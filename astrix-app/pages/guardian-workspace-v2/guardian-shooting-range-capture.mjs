import {AUTH_ORIGIN,getBungieSession} from './guardian-bungie-auth.mjs?v=20260905-manual-editor-1';
import {captureMatchesCharacter,mergeCaptureArchive,selectCandidateActivities,chooseCandidateActivity,classifyCandidateEvidence,summarizeCaptureEvidence} from './guardian-shooting-range-evidence.mjs';

const CAPTURE_KEY='astrix:shooting-range-capture:v1';
const CAPTURE_ARCHIVE_KEY='astrix:shooting-range-capture-archive:v1';
const BUILD_SPACE_KEY='astrix:paradox-build-space:v1';
const SELECTED_CHARACTER_KEY='astrix:selected-character-id';

const clone=value=>{try{return structuredClone(value);}catch{return JSON.parse(JSON.stringify(value??null));}};
const asString=value=>String(value??'').trim();
const asNumber=value=>Number.isFinite(Number(value))?Number(value):null;

function selectedCharacterId(){
  try{return asString(sessionStorage.getItem(SELECTED_CHARACTER_KEY));}catch{return '';}
}

function readBuildSnapshot(){
  try{
    const state=JSON.parse(sessionStorage.getItem(BUILD_SPACE_KEY)||'null');
    return clone(state?.workingBuild||state?.originalBuild||null);
  }catch{return null;}
}

function readCapture(){
  try{return JSON.parse(sessionStorage.getItem(CAPTURE_KEY)||'null');}catch{return null;}
}

function readCaptureArchive(){
  try{
    const archive=JSON.parse(sessionStorage.getItem(CAPTURE_ARCHIVE_KEY)||'[]');
    return Array.isArray(archive)?archive:[];
  }catch{return [];}
}

function compactBuildSnapshot(build){
  if(!build||typeof build!=='object')return null;
  const itemIdentity=item=>({
    itemHash:asNumber(item?.itemHash??item?.hash),
    itemInstanceId:asString(item?.itemInstanceId??item?.instanceId),
    name:asString(item?.name??item?.displayProperties?.name)
  });
  const items=[
    ...(Array.isArray(build?.weapons)?build.weapons:[]),
    ...(Array.isArray(build?.armor)?build.armor:[]),
    ...(Array.isArray(build?.armour)?build.armour:[])
  ].map(itemIdentity).filter(item=>item.itemHash!==null||item.itemInstanceId||item.name);
  return {
    characterId:asString(build?.characterId),
    characterClass:asString(build?.characterClass??build?.className),
    subclassName:asString(build?.subclassName??build?.subclass),
    subclassHash:asNumber(build?.subclassHash),
    items
  };
}

function compactCaptureForArchive(capture){
  const candidates=(Array.isArray(capture?.candidates)?capture.candidates:[]).map(row=>({
    activity:{
      instanceId:asString(row?.activity?.instanceId),
      period:asString(row?.activity?.period),
      referenceId:asNumber(row?.activity?.referenceId),
      directorActivityHash:asNumber(row?.activity?.directorActivityHash),
      activityTypeHash:asNumber(row?.activity?.activityTypeHash),
      mode:asNumber(row?.activity?.mode),
      modes:Array.isArray(row?.activity?.modes)?row.activity.modes.map(asNumber).filter(value=>value!==null):[],
      completed:row?.activity?.completed===true
    },
    pgcr:row?.pgcr?{
      period:asString(row.pgcr.period),
      activityDetails:clone(row.pgcr.activityDetails||null),
      player:clone(row.pgcr.player||null),
      claimMetrics:clone(row.pgcr.claimMetrics||{})
    }:null,
    evidence:clone(row?.evidence||null),
    error:clone(row?.error||null)
  }));
  return {
    schemaVersion:asNumber(capture?.schemaVersion)||2,
    testId:asString(capture?.testId),
    status:asString(capture?.status),
    armedAt:asString(capture?.armedAt),
    collectedAt:asString(capture?.collectedAt),
    membership:clone(capture?.membership||null),
    characterId:asString(capture?.characterId),
    testDomain:asString(capture?.testDomain),
    calibrationType:asString(capture?.calibrationType),
    expectedActivity:clone(capture?.expectedActivity||null),
    baselineStatus:asString(capture?.baselineStatus),
    baselineError:clone(capture?.baselineError||null),
    buildSnapshot:compactBuildSnapshot(capture?.buildSnapshot),
    candidates,
    evidenceSummary:clone(capture?.evidenceSummary||null),
    candidateSelection:clone(capture?.candidateSelection||null),
    archivedEvidence:true
  };
}

function archiveCapture(capture){
  let archive=mergeCaptureArchive(readCaptureArchive().map(compactCaptureForArchive),compactCaptureForArchive(capture),5);
  while(archive.length){
    try{
      sessionStorage.setItem(CAPTURE_ARCHIVE_KEY,JSON.stringify(archive));
      return archive;
    }catch{
      archive=archive.slice(0,-1);
    }
  }
  try{sessionStorage.removeItem(CAPTURE_ARCHIVE_KEY);}catch{}
  return [];
}

function saveCapture(capture,{archivePrevious=false}={}){
  if(archivePrevious){
    const previous=readCapture();
    if(previous?.testId&&previous.testId!==capture?.testId)archiveCapture(previous);
  }
  const serialized=JSON.stringify(capture);
  try{
    sessionStorage.setItem(CAPTURE_KEY,serialized);
  }catch(error){
    try{sessionStorage.removeItem(CAPTURE_ARCHIVE_KEY);}catch{}
    sessionStorage.setItem(CAPTURE_KEY,serialized);
  }
  return capture;
}

function clearCapture(){
  try{sessionStorage.removeItem(CAPTURE_KEY);}catch{}
}

function membershipFromSession(session){
  const active=session?.activeDestinyMembership||session?.destinyMembership||null;
  const membershipType=asNumber(active?.membershipType);
  const membershipId=asString(active?.membershipId);
  if(!Number.isInteger(membershipType)||!membershipId)return null;
  return {membershipType,membershipId,displayName:asString(active?.displayName)};
}

function historyUrl({membershipType,membershipId,characterId,count=25,page=0}){
  if(typeof globalThis.FORGE_ACTIVITY_HISTORY_ENDPOINT==='function'){
    return globalThis.FORGE_ACTIVITY_HISTORY_ENDPOINT({membershipType,membershipId,characterId,count,page});
  }
  const url=new URL(`${AUTH_ORIGIN}/bungie/activity-history`);
  url.searchParams.set('membershipType',String(membershipType));
  url.searchParams.set('membershipId',membershipId);
  url.searchParams.set('characterId',characterId);
  url.searchParams.set('count',String(count));
  url.searchParams.set('page',String(page));
  return url.toString();
}

function pgcrUrl(instanceId){
  if(typeof globalThis.FORGE_PGCR_ENDPOINT==='function')return globalThis.FORGE_PGCR_ENDPOINT(instanceId);
  return `${AUTH_ORIGIN}/bungie/pgcr/${encodeURIComponent(instanceId)}`;
}

async function fetchJson(url,{timeoutMs=15000}={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(url,{credentials:'include',headers:{Accept:'application/json'},signal:controller.signal});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok){
      const error=new Error(payload?.error||`request failed (${response.status})`);
      error.status=response.status;
      error.url=url;
      if(response.status===404)error.code='backend-route-missing';
      throw error;
    }
    return payload;
  }finally{clearTimeout(timer);}
}

function activityRows(payload){
  const rows=payload?.Response?.activities
    ??payload?.activities
    ??payload?.activityHistory?.Response?.activities
    ??payload?.activityHistory?.activities
    ??[];
  return Array.isArray(rows)?rows:[];
}

function instanceIdOf(activity){
  return asString(activity?.activityDetails?.instanceId||activity?.instanceId);
}

function periodOf(activity){
  return asString(activity?.period||activity?.activityDetails?.period);
}

function activityIdentity(activity){
  const details=activity?.activityDetails||{};
  const completedValue=activity?.values?.completed?.basic?.value??activity?.values?.completed?.value??activity?.completed;
  return {
    instanceId:instanceIdOf(activity),
    period:periodOf(activity),
    referenceId:asNumber(details.referenceId),
    directorActivityHash:asNumber(details.directorActivityHash),
    activityTypeHash:asNumber(details.activityTypeHash||activity?.activityTypeHash),
    mode:asNumber(details.mode),
    modes:Array.isArray(details.modes)?details.modes.map(asNumber).filter(value=>value!==null):[],
    isPrivate:Boolean(details.isPrivate),
    completed:Number.isFinite(Number(completedValue))?Number(completedValue)===1:null,
    raw:clone(activity)
  };
}

async function pullActivityHistory({session=null,characterId=null,count=25,page=0}={}){
  const liveSession=session||await getBungieSession();
  if(!liveSession?.authenticated)throw new Error('Reconnect Bungie before collecting activity results.');
  const membership=membershipFromSession(liveSession);
  if(!membership)throw new Error('Active Destiny membership is unavailable from the session.');
  const cid=asString(characterId||selectedCharacterId());
  if(!cid)throw new Error('Select a Guardian before capturing activity history.');
  const endpoint=historyUrl({...membership,characterId:cid,count,page});
  const payload=await fetchJson(endpoint);
  return {membership,characterId:cid,endpoint,payload,activities:activityRows(payload).map(activityIdentity).filter(row=>row.instanceId)};
}

async function pullPgcr(instanceId){
  const id=asString(instanceId);
  if(!id)throw new Error('Activity instanceId is required.');
  const endpoint=pgcrUrl(id);
  const payload=await fetchJson(endpoint);
  return {instanceId:id,endpoint,payload,pgcr:payload?.Response??payload?.pgcr?.Response??payload?.pgcr??payload};
}

function statValue(stat){
  const value=stat?.basic?.value??stat?.value;
  return Number.isFinite(Number(value))?Number(value):null;
}

function summarizePgcr(pgcr,{membershipId='',characterId=''}={}){
  const entries=Array.isArray(pgcr?.entries)?pgcr.entries:[];
  const target=entries.find(entry=>{
    const values=[
      entry?.player?.destinyUserInfo?.membershipId,
      entry?.player?.destinyUserInfo?.bungieGlobalDisplayName,
      entry?.characterId
    ].map(asString);
    return (membershipId&&values.includes(asString(membershipId)))||(characterId&&values.includes(asString(characterId)));
  })||entries[0]||null;
  const values=target?.values||{};
  const stats={};
  for(const [key,row] of Object.entries(values)){
    const value=statValue(row);
    if(value!==null)stats[key]=value;
  }
  const factualMetricKeys=['completed','completionReason','standing','score','teamScore','kills','deaths','assists','efficiency','killsDeathsRatio','killsDeathsAssists','activityDurationSeconds','timePlayedSeconds'];
  const claimMetrics=Object.fromEntries(factualMetricKeys.filter(key=>Object.hasOwn(stats,key)).map(key=>[key,stats[key]]));
  return {
    activityDetails:clone(pgcr?.activityDetails||null),
    period:asString(pgcr?.period),
    startingPhaseIndex:asNumber(pgcr?.startingPhaseIndex),
    entryCount:entries.length,
    matchedEntry:Boolean(target),
    player:{
      membershipId:asString(target?.player?.destinyUserInfo?.membershipId),
      displayName:asString(target?.player?.destinyUserInfo?.bungieGlobalDisplayName||target?.player?.destinyUserInfo?.displayName),
      characterId:asString(target?.characterId),
      classHash:asNumber(target?.player?.classHash),
      raceHash:asNumber(target?.player?.raceHash),
      genderHash:asNumber(target?.player?.genderHash),
      lightLevel:asNumber(target?.player?.lightLevel)
    },
    stats,
    claimMetrics,
    claimScope:{factual:'Bungie PGCR activity, completion, player, team, score and exposed performance metrics only.',causalPerkActivation:'inference-only',uptime:'inference-only'},
    rawEntry:clone(target)
  };
}

async function armShootingRangeCapture({characterId=null,buildSnapshot=null}={}){
  return armBuildTest({characterId,buildSnapshot,testDomain:'pve',calibrationType:'shooting-range'});
}

async function armBuildTest({characterId=null,buildSnapshot=null,testDomain='pve',calibrationType=null,expectedActivity=null}={}){
  const session=await getBungieSession();
  if(!session?.authenticated)throw new Error('Connect Bungie before arming a Build Test.');
  const membership=membershipFromSession(session);
  if(!membership)throw new Error('Active Destiny membership is unavailable.');
  const cid=asString(characterId||selectedCharacterId()||buildSnapshot?.characterId);
  if(!cid)throw new Error('Select the Guardian you will use for this Build Test.');
  const domain=asString(testDomain).toLowerCase()==='pvp'?'pvp':'pve';
  const immutableBuild=clone(buildSnapshot||readBuildSnapshot());
  if(!immutableBuild)throw new Error('A verified Working Build is required before arming a Build Test.');
  let baseline=[];
  let baselineError=null;
  try{
    const history=await pullActivityHistory({session,characterId:cid,count:25,page:0});
    baseline=history.activities.map(row=>row.instanceId);
  }catch(error){
    baselineError={message:error?.message||String(error),code:error?.code||null,status:error?.status||null,url:error?.url||null};
  }
  const capture={
    schemaVersion:2,
    testId:`BF-TEST-${Date.now()}`,
    armedAt:new Date().toISOString(),
    membership,
    characterId:cid,
    buildSnapshot:immutableBuild,
    testDomain:domain,
    calibrationType:domain==='pve'&&calibrationType==='shooting-range'?'shooting-range':null,
    expectedActivity:{
      activityHash:asNumber(expectedActivity?.activityHash),
      activityTypeHash:asNumber(expectedActivity?.activityTypeHash),
      mode:asNumber(expectedActivity?.mode),
      name:asString(expectedActivity?.name),
      mapHash:asNumber(expectedActivity?.mapHash),
      modifierHashes:Array.isArray(expectedActivity?.modifierHashes)?expectedActivity.modifierHashes.map(asNumber).filter(value=>value!==null):[],
      source:expectedActivity?.source==='bungie-definition'?'bungie-definition':'unselected'
    },
    baselineInstanceIds:baseline,
    baselineError,
    status:'armed'
  };
  return saveCapture(capture,{archivePrevious:true});
}

async function collectShootingRangeResults({maxCandidates=5,expectedCharacterId=null}={}){
  return collectBuildTestResults({maxCandidates,expectedCharacterId});
}

async function collectBuildTestResults({maxCandidates=5,expectedCharacterId=null}={}){
  const capture=readCapture();
  if(!capture)throw new Error('No Build Test is armed.');
  if(expectedCharacterId&&!captureMatchesCharacter(capture,expectedCharacterId)){
    const error=new Error(`The saved capture belongs to character ${asString(capture.characterId)||'unknown'}, not the current Build Forge Guardian ${asString(expectedCharacterId)||'unknown'}.`);
    error.code='capture-character-mismatch';
    error.captureCharacterId=asString(capture.characterId);
    error.currentCharacterId=asString(expectedCharacterId);
    throw error;
  }
  const session=await getBungieSession();
  const history=await pullActivityHistory({session,characterId:capture.characterId,count:25,page:0});
  if(String(history.membership.membershipId)!==String(capture.membership?.membershipId)||Number(history.membership.membershipType)!==Number(capture.membership?.membershipType)){
    const error=new Error('The active Destiny membership does not match the membership bound when this Build Test was armed.');
    error.code='capture-membership-mismatch';
    throw error;
  }
  const baselineAvailable=!capture.baselineError;
  const candidates=selectCandidateActivities({
    activities:history.activities,
    baselineInstanceIds:capture.baselineInstanceIds||[],
    armedAt:capture.armedAt,
    baselineAvailable
  })
    .sort((a,b)=>String(b.period).localeCompare(String(a.period)))
    .slice(0,Math.max(1,Number(maxCandidates)||5));
  const results=[];
  for(const candidate of candidates){
    try{
      const pulled=await pullPgcr(candidate.instanceId);
      const pgcr=summarizePgcr(pulled.pgcr,{membershipId:history.membership.membershipId,characterId:capture.characterId});
      const completed=candidate.completed===true||pgcr.stats.completed===1;
      if(completed)results.push({activity:{...candidate,completed:true},pgcr,evidence:classifyCandidateEvidence({activity:candidate,pgcr}),rawPgcr:pulled.payload,pgcrEndpoint:pulled.endpoint});
    }catch(error){
      const failure={message:error?.message||String(error),code:error?.code||null,status:error?.status||null,url:error?.url||null};
      if(candidate.completed===true)results.push({activity:candidate,pgcr:null,evidence:classifyCandidateEvidence({activity:candidate,error:failure}),error:failure});
    }
  }
  const completed={
    ...capture,
    status:'collected',
    collectedAt:new Date().toISOString(),
    historyEndpoint:history.endpoint,
    baselineStatus:baselineAvailable?'available':'unavailable',
    candidates:results,
    evidenceSummary:summarizeCaptureEvidence(results),
    candidateSelection:chooseCandidateActivity(results,capture.expectedActivity||{})
  };
  saveCapture(completed);
  return completed;
}

function confirmCandidateActivity(instanceId,{expectedCharacterId=null}={}){
  const capture=readCapture();
  if(!capture||capture.status!=='collected')throw new Error('Pull completed Build Test results before confirming an activity.');
  if(expectedCharacterId&&!captureMatchesCharacter(capture,expectedCharacterId))throw new Error('This Build Test belongs to a different Guardian.');
  const id=asString(instanceId);
  const result=(capture.candidates||[]).find(row=>asString(row?.activity?.instanceId)===id);
  if(!result||result.activity?.completed!==true)throw new Error('Only a completed post-arm candidate can be confirmed.');
  const confirmed={...capture,candidateSelection:{status:'user-confirmed',selectedInstanceId:id,requiresUserConfirmation:false,choices:capture.candidates||[],confirmedAt:new Date().toISOString()}};
  saveCapture(confirmed);
  return confirmed;
}

export {
  CAPTURE_KEY,
  CAPTURE_ARCHIVE_KEY,
  BUILD_SPACE_KEY,
  membershipFromSession,
  activityRows,
  activityIdentity,
  summarizePgcr,
  pullActivityHistory,
  pullPgcr,
  armShootingRangeCapture,
  collectShootingRangeResults,
  armBuildTest,
  collectBuildTestResults,
  confirmCandidateActivity,
  captureMatchesCharacter,
  readCapture,
  readCaptureArchive,
  clearCapture
};
