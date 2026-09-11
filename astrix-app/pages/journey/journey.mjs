import {authStartUrl,getBungieSession} from '../guardian-workspace-v2/guardian-bungie-auth.mjs?v=20260902-shared-account-orbit-1';
import {guardianManifest} from './journey-manifest.mjs?v=20260906-all-page-data-1';
import {resolveRecordTree,patternTypeKey,seasonRankProgress,findDestinationNodes} from './journey-record-model.mjs?v=20260905-journey-repair-1';
import {resolveCollectionBadges} from './journey-collection-model.mjs?v=20260905-pattern-badges-1';
import {PREPARED_PAGE_REFRESH_MS,bindPreparedPageRefreshControl,createPreparedPageRefreshController} from '../guardian-workspace-v2/guardian-session-cache.mjs?v=20260906-page-refresh-1';
import {validateHandoffEnvelope} from '../guardian-workspace-v2/paradox-build-binding.mjs';
import {readCapture,readCaptureArchive} from '../guardian-workspace-v2/guardian-shooting-range-capture.mjs?v=20260902-journey-data-hooks-1';
import {buildMissionReportView,normaliseActivityHistory} from '../mission-reports/mission-reports-data.mjs?v=20260906-all-page-data-1';
import {initLocationSelector} from '../../shared/astrix-location-selector.mjs';
import {initJourneyLocationMaps,publishJourneyDestinationData,publishJourneyRegionChestProgress} from './journey-location-maps.mjs?v=20260905-journey-repair-1';
import {loadPreparedPagePayload,reportPreparedPageStage} from '../../core/prepared-page-client.mjs?v=20260907-shared-page-load-1';
import {mountForgeShell} from '../guardian-workspace-v2/platform-forge-shell.mjs?v=20260907-shared-page-load-1';

mountForgeShell({rootSelector:'.apx-page-shell',gameId:'destiny-2',gameName:'Destiny 2',developerName:'Bungie',layout:'destination'});

const resolving=document.getElementById('journeyResolving');
const signedOut=document.getElementById('journeySignedOut');
const dashboard=document.getElementById('journeyDashboard');
const status=document.getElementById('journeyAuthStatus');
const connectButton=document.getElementById('journeyConnectButton');
const refreshButton=document.getElementById('journeyRefreshButton');
const guardianUsage=document.getElementById('journeyGuardianUsage');
const vaultCard=document.getElementById('journeyVault');
const seasonRankCard=document.getElementById('journeySeasonRank');
const heroCards=document.getElementById('guardianCharacterCards');
const feedStatus=document.getElementById('journeyFeedStatus');
const trendEmpty=document.getElementById('journeyTrendEmpty');
const guardianClass=document.getElementById('journeyGuardianClass');
const guardianSubclass=document.getElementById('journeyGuardianSubclass');
const guardianRankSummary=document.getElementById('journeyGuardianRankSummary');
const guardianStats=document.getElementById('journeyGuardianStats');
const guardianCrest=document.getElementById('journeyGuardianCrest');
const guardianCrestEmpty=document.getElementById('journeyGuardianCrestEmpty');
const totalPlaytime=document.getElementById('journeyTotalPlaytime');
const recentActivityCard=document.getElementById('journeyRecentActivity');
const titleSealCard=document.getElementById('journeyTitleSeal');
const titleProgressCard=document.getElementById('journeyTitleProgress');
const triumphStatsCard=document.getElementById('journeyTriumphStats');
const metricActivities=document.getElementById('journeyMetricActivities');
const metricCompletion=document.getElementById('journeyMetricCompletion');
const metricPve=document.getElementById('journeyMetricPve');
const metricPvp=document.getElementById('journeyMetricPvp');
const trendChart=document.getElementById('journeyTrendChart');
const confidenceDonutValue=document.getElementById('journeyConfidenceDonutValue');
const confidenceHighPercent=document.getElementById('journeyConfidenceHighPercent');
const confidenceHigh=document.getElementById('journeyConfidenceHigh');
const confidenceMedium=document.getElementById('journeyConfidenceMedium');
const confidenceLow=document.getElementById('journeyConfidenceLow');
const confidenceStatus=document.getElementById('journeyConfidenceStatus');
const mostUsedCard=document.getElementById('journeyMostUsed');
const buildSummaryCard=document.getElementById('journeyBuildSummary');
const missionHighlightsCard=document.getElementById('journeyMissionHighlights');
const focusHeading=document.getElementById('journeyFocusHeading');
const focusStatus=document.getElementById('journeyFocusStatus');
const locationSelector=document.getElementById('journeyLocationSelector');
const destinationDetail=document.getElementById('journeyLocationDetail');
const titlesOpen=document.getElementById('journeyTitlesOpen');
const badgesOpen=document.getElementById('journeyBadgesOpen');
const triumphsOpen=document.getElementById('journeyTriumphsOpen');
const guardianRankOpen=document.getElementById('journeyGuardianRankOpen');
const recordsOpen=document.getElementById('journeyRecordsOpen');
const recordsPanel=document.getElementById('journeyRecordsPanel');
const recordsBack=document.getElementById('journeyRecordsBack');
const recordsStatus=document.getElementById('journeyRecordsStatus');
const titlesList=document.getElementById('journeyTitlesList');
const badgesList=document.getElementById('journeyBadgesList');
const titleDetailHero=document.getElementById('journeyTitleDetailHero');
const titleRequirementsHeading=document.getElementById('journeyTitleRequirementsHeading');
const titleRequirementsList=document.getElementById('journeyTitleRequirementsList');
const triumphCategoriesList=document.getElementById('journeyTriumphCategoriesList');
const triumphDetailHero=document.getElementById('journeyTriumphDetailHero');
const triumphSubcategories=document.getElementById('journeyTriumphSubcategories');
const triumphDetailList=document.getElementById('journeyTriumphDetailList');
const guardianRankHero=document.getElementById('journeyGuardianRankHero');
const guardianRankStrip=document.getElementById('journeyGuardianRankStrip');
const guardianRankObjectives=document.getElementById('journeyGuardianRankObjectives');
const recordsSections=document.getElementById('journeyRecordsSections');
const recordsDetailGroup=document.getElementById('journeyRecordsDetailGroup');
const recordsDetailHero=document.getElementById('journeyRecordsDetailHero');
const recordsTypes=document.getElementById('journeyRecordsTypes');
const recordsDetailHeading=document.getElementById('journeyRecordsDetailHeading');
const recordsSubcategories=document.getElementById('journeyRecordsSubcategories');
const recordsDetailList=document.getElementById('journeyRecordsDetailList');
const CLASS_NAMES=['TITAN','HUNTER','WARLOCK'];
const CLASS_USAGE_COLOURS=['#d3202f','#c9a84c','#4169e1'];
const STAT_ORDER=[2996146975,392767087,1943323491,1735777505,144602215,4244567218];
const RECENT_ACTIVITY_PENDING='Recent activity data is not connected.';
const BUNGIE_ORIGIN='https://www.bungie.net';
const JOURNEY_BOOTSTRAP_PROFILE_WAIT_MS=12*1000;
const JOURNEY_BOOTSTRAP_UI_WAIT_MS=6*1000;
const JOURNEY_LOADER_READY_WAIT_MS=6*1000;
const BUILD_SPACE_KEY='astrix:paradox-build-space:v1';
const BUILD_SNAPSHOT_KEY='astrix:guardian-build-snapshot:v1';
const LAST_LOADOUT_KEY='astrix:paradox-last-bungie-loadout:v1';
const BUILD_EVIDENCE_STORAGE_KEYS=new Set([BUILD_SPACE_KEY,BUILD_SNAPSHOT_KEY,LAST_LOADOUT_KEY,'astrix:shooting-range-capture:v1','astrix:shooting-range-capture-archive:v1']);
const numberFormatter=new Intl.NumberFormat('en-GB');
const activityDateFormatter=new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'});
// Journey resolves only the record definitions it needs. Downloading the full
// Character/Build equipment manifest here delayed profile and Triumph binding.
const manifestReady=Promise.resolve(guardianManifest);
let activeView='overview';
let selectedCharacterId='';
let selectedClassName='';
let verifiedProfile=null;
let journeySession=null;
let journeyActivityRequest=0;
let profileIdentityRequest=0;
let titleTriumphRequest=0;
let triumphSectionRequest=0;
let recordsCategoryRequest=0;
let recordsPanelRequest=0;
let guardianRankRequest=0;
let guardianRankObjectiveRequest=0;
let guardianRankSummaryRequest=0;
let destinationProgressRequest=0;
let destinationProgressQueue=Promise.resolve();
let activeRecordView='';
let selectedTitle=null;
let selectedTitleKind='titles';
let equippedTitleSummary=null;
let nextTitleSummary=null;
let titleCatalogueRootHash='';
let titleCataloguePromise=null;
let selectedTriumphCategory=null;
let selectedRecordSection=null;
let journeyBackgroundRefreshRequest=null;
let journeyRefreshController=null;
const journeyActivityCache=new Map();
let currentActivityEvidence=null;

function waitWithin(promise,timeoutMs){
  let timer=0;
  return Promise.race([
    Promise.resolve(promise).catch(error=>{console.info('[Forge Journey] noncritical bootstrap task unavailable',error);return null;}),
    new Promise(resolve=>{timer=globalThis.setTimeout(()=>resolve(null),timeoutMs);})
  ]).finally(()=>globalThis.clearTimeout(timer));
}

async function finishJourneyLoader(root=document){
  reportPreparedPageStage('ready','journey');
  let timer=0;
  await Promise.race([
    Promise.resolve(globalThis.ForgeLoader.ready(root)).catch(()=>globalThis.ForgeLoader.done()),
    new Promise(resolve=>{timer=globalThis.setTimeout(()=>{globalThis.ForgeLoader.done();resolve();},JOURNEY_LOADER_READY_WAIT_MS);})
  ]).finally(()=>globalThis.clearTimeout(timer));
}

function waitForHeroCards(){
  if(!heroCards||!heroCards.querySelector('.guardian-character-cards__status.is-pending'))return Promise.resolve();
  return new Promise(resolve=>document.addEventListener('forge:hero-cards-render-complete',resolve,{once:true}));
}

function waitForJourneyAtmosphere(){
  const key=globalThis.ForgeDestinations?.current();
  const src=globalThis.FORGE_LOCATION_VISUALS?.[key]?.image;
  if(!src)return Promise.resolve();
  return new Promise(resolve=>{
    const image=new Image();
    let settled=false;
    const finish=async()=>{if(settled)return;settled=true;try{if(image.decode)await image.decode();}catch{}resolve();};
    image.addEventListener('load',finish,{once:true});
    image.addEventListener('error',resolve,{once:true});
    image.src=src;
    if(image.complete)finish();
  });
}

const finiteNumber=value=>{
  if(value===null||value===undefined||value==='')return null;
  const number=Number(value);
  return Number.isFinite(number)?number:null;
};

function createRankBadge(rank,label=`Rank ${rank}`){
  const badge=document.createElement('span');
  badge.className='journey-rank-badge';
  badge.setAttribute('role','img');
  badge.setAttribute('aria-label',label);
  const number=document.createElement('strong');
  number.textContent=numberFormatter.format(rank);
  badge.appendChild(number);
  return badge;
}

async function currentSeasonMetadata(payload){
  if(payload?.currentSeason)return {season:payload.currentSeason};
  throw new Error('Prepared Journey data contains no current season.');
}

async function bindSeasonRank(payload){
  if(!seasonRankCard)return;
  renderDetailHero(seasonRankCard,{name:'Season Rank unavailable',description:'Current seasonal progression is awaiting verified Bungie data.'});
  try{
    const metadata=await currentSeasonMetadata(payload);
    const {active,rank}=seasonRankProgress(payload,String(journeyCharacterFor(payload)?.characterId||''),metadata);
    if(rank===null||rank===undefined)return;
    const completed=finiteNumber(active?.progressToNextLevel);
    const total=finiteNumber(active?.nextLevelAt);
    const seasonNumber=finiteNumber(metadata?.season?.seasonNumber);
    const seasonName=String(metadata?.season?.name||'CURRENT SEASON').trim();
    const description=[seasonNumber===null?'':`SEASON ${seasonNumber}`,seasonName].filter(Boolean).join(' · ');
    renderDetailHero(seasonRankCard,{name:`RANK ${rank}`,badge:rank,description,completed,total,unit:`XP TO RANK ${rank+1}`});
  }catch(error){console.info('[Forge Journey] current Season Rank unavailable',error);}
}

function bindGuardianUsage(payload){
  if(!guardianUsage)return false;
  const usage=CLASS_NAMES.map((name,index)=>({name,colour:CLASS_USAGE_COLOURS[index],minutes:0,power:null}));
  for(const character of Object.values(payload?.profile?.characters?.data||{})){
    const classType=Number(character?.classType);
    const minutes=finiteNumber(character?.minutesPlayedTotal);
    const power=finiteNumber(character?.light);
    if(!usage[classType]||minutes===null)continue;
    usage[classType].minutes+=Math.max(0,minutes);
    if(power!==null)usage[classType].power=Math.max(usage[classType].power??0,power);
  }
  const total=usage.reduce((sum,item)=>sum+item.minutes,0);
  guardianUsage.replaceChildren();
  if(total<=0){const empty=document.createElement('span');empty.className='apx-empty-state';empty.textContent='Verified class playtime is not available.';guardianUsage.appendChild(empty);return false;}
  usage.forEach(item=>{item.percent=item.minutes/total*100;});
  const top=[...usage].sort((left,right)=>right.minutes-left.minutes)[0];
  const layout=document.createElement('div');layout.className='journey-usage-layout';
  const chart=document.createElement('div');chart.className='journey-usage-chart';chart.style.setProperty('--titan-end',`${usage[0].percent}%`);chart.style.setProperty('--hunter-end',`${usage[0].percent+usage[1].percent}%`);chart.setAttribute('role','img');chart.setAttribute('aria-label',usage.map(item=>`${item.name} ${item.percent.toFixed(1)} percent`).join(', '));
  const centre=document.createElement('span');centre.innerHTML=`<small>MOST USED</small><strong>${top.name}</strong>`;chart.appendChild(centre);
  const table=document.createElement('table');table.className='journey-usage-table';table.setAttribute('aria-label','Guardian class usage');
  const body=document.createElement('tbody');
  usage.forEach(item=>{const row=document.createElement('tr');row.innerHTML=`<th><i class="journey-usage-dot" style="--usage-colour:${item.colour}"></i>${item.name}</th><td><strong>${item.percent.toFixed(1)}%</strong></td><td>${formatPlaytime(item.minutes)}${item.power===null?'':` · POWER ${numberFormatter.format(item.power)}`}</td>`;body.appendChild(row);});
  table.appendChild(body);layout.append(chart,table);guardianUsage.appendChild(layout);return true;
}

const VAULT_BUCKET=138197802, POSTMASTER_BUCKET=215593132, ARMOUR_ITEM_TYPE=2;
const SUBCLASS_BUCKET=3284755031;
function bindVault(payload){
  if(!vaultCard)return;
  const vaultItems=payload?.profile?.profileInventory?.data?.items;
  if(!Array.isArray(vaultItems))return;
  const stored=vaultItems.filter(item=>item?.bucketHash===VAULT_BUCKET);
  const storedDefinitions=stored.map(item=>payload?.definitions?.[String(item?.itemHash)]||null);
  const classificationComplete=storedDefinitions.every(Boolean);
  const armourCount=classificationComplete?storedDefinitions.filter(definition=>Number(definition?.itemType)===ARMOUR_ITEM_TYPE).length:null;
  const equipmentCount=classificationComplete?stored.length-armourCount:null;
  let postmasterMax=0;
  for(const char of Object.values(payload?.profile?.characterInventories?.data||{})){
    const pm=(char?.items||[]).filter(i=>i?.bucketHash===POSTMASTER_BUCKET).length;
    if(pm>postmasterMax)postmasterMax=pm;
  }
  vaultCard.replaceChildren();
  const total=document.createElement('div');
  total.className='journey-vault-total';
  total.innerHTML=`<span>ALL</span><strong>${numberFormatter.format(stored.length)}</strong>`;
  const breakdown=document.createElement('dl');
  breakdown.className='journey-vault-breakdown';
  breakdown.innerHTML=classificationComplete
    ?`<div><dt>ARMOUR</dt><dd>${numberFormatter.format(armourCount)}</dd></div><div><dt>WEAPONS &amp; EQUIPMENT</dt><dd>${numberFormatter.format(equipmentCount)}</dd></div>`
    :'<div><dt>ARMOUR</dt><dd>UNAVAILABLE</dd></div><div><dt>WEAPONS &amp; EQUIPMENT</dt><dd>UNAVAILABLE</dd></div>';
  vaultCard.append(total,breakdown);
  if(postmasterMax>=18){
    const warning=document.createElement('p');
    warning.className='journey-vault-warning';
    warning.textContent=`POSTMASTER NEAR CAPACITY · ${postmasterMax}/21 ON A GUARDIAN`;
    vaultCard.appendChild(warning);
  }
}

function bindGuardianStats(payload,character){
  if(!guardianStats)return;
  guardianStats.replaceChildren();
  const definitions=payload?.statDefinitions||{};
  for(const hash of STAT_ORDER){
    const definition=definitions[String(hash)]||null;
    const name=String(definition?.displayProperties?.name||`Guardian stat ${hash}`);
    const value=character?finiteNumber(character?.stats?.[String(hash)]):null;
    const item=document.createElement('span');
    item.className='journey-identity-stat';
    item.title=value===null?`${name} unavailable`:`${name} ${numberFormatter.format(value)}`;
    item.setAttribute('aria-label',item.title);
    const iconUrl=bungieIconUrl(definition?.displayProperties?.icon);
    if(iconUrl){
      const icon=document.createElement('img');
      icon.src=iconUrl;
      icon.alt='';
      icon.setAttribute('aria-hidden','true');
      icon.decoding='async';
      item.appendChild(icon);
    }else{
      const icon=document.createElement('i');
      icon.setAttribute('aria-hidden','true');
      item.appendChild(icon);
    }
    const output=document.createElement('strong');
    output.textContent=value===null?'—':numberFormatter.format(value);
    item.appendChild(output);
    guardianStats.appendChild(item);
  }
}

function formatPlaytime(minutes){
  if(!Number.isFinite(minutes))return '—';
  const total=Math.max(0,Math.round(minutes));
  const hours=Math.floor(total/60);
  return `${numberFormatter.format(hours)}h ${total%60}m`;
}

function bindActiveGuardian(payload){
  guardianClass.textContent='Guardian unavailable';
  guardianSubclass.textContent='Subclass awaiting verified data';
  bindGuardianStats(payload,null);
  guardianCrest.hidden=true;
  guardianCrest.removeAttribute('src');
  guardianCrestEmpty.hidden=false;
  totalPlaytime.textContent='—';

  const characters=Object.values(payload?.profile?.characters?.data||{});
  const accountMinutes=characters.map(character=>finiteNumber(character?.minutesPlayedTotal)).filter(Number.isFinite);
  totalPlaytime.textContent=accountMinutes.length?formatPlaytime(accountMinutes.reduce((sum,minutes)=>sum+minutes,0)):'—';
  const selected=characters.find(character=>String(character?.characterId||'')===selectedCharacterId)
    ||[...characters].sort((left,right)=>String(right?.dateLastPlayed||'').localeCompare(String(left?.dateLastPlayed||'')))[0];
  if(!selected)return;

  guardianClass.textContent=CLASS_NAMES[Number(selected.classType)]||'Guardian';
  bindGuardianStats(payload,selected);
  const emblemArtwork=selected.emblemBackgroundPath||selected.emblemPath;
  if(emblemArtwork){
    guardianCrest.src=new URL(emblemArtwork,BUNGIE_ORIGIN).toString();
    guardianCrest.hidden=false;
    guardianCrestEmpty.hidden=true;
  }
  const equipped=payload?.profile?.characterEquipment?.data?.[String(selected.characterId||'')]?.items||[];
  const subclassItem=equipped.find(item=>item?.bucketHash===SUBCLASS_BUCKET);
  const subclassName=subclassItem&&payload?.definitions?.[String(subclassItem.itemHash)]?.displayProperties?.name;
  if(subclassName)guardianSubclass.textContent=String(subclassName).toUpperCase();
}

function highestCompletedGuardianRank(payload){
  const profile=payload?.profile?.profile?.data||{};
  const completedRanks=[profile.lifetimeHighestGuardianRank,profile.currentGuardianRank,profile.renewedGuardianRank].map(finiteNumber).filter(rank=>rank!==null&&rank>=1);
  return completedRanks.length?Math.max(...completedRanks):null;
}

async function bindGuardianRankSummary(payload){
  if(!guardianRankSummary)return;
  const requestId=++guardianRankSummaryRequest;
  const rank=highestCompletedGuardianRank(payload);
  if(rank===null){
    renderGuardianRankSummary({rank:null});
    return;
  }
  const hooked=(payload?.journeyRecordOverview?.guardianRank?.ranks||[]).find(item=>finiteNumber(item?.rank)===rank);
  let name=String(hooked?.name||'').trim();
  let icon=bungieIconUrl(hooked?.iconPath);
  if(!name||!icon){
    try{
      await manifestReady;
      const constants=await guardianManifest.getAsync('DestinyGuardianRankConstantsDefinition',1);
      const rankHashes=constants?.guardianRankHashes||[];
      const definitions=await guardianManifest.getMany('DestinyGuardianRankDefinition',rankHashes);
      const rankHash=rankHashes[rank-1];
      const definition=Object.values(definitions).find(item=>finiteNumber(item?.rankNumber)===rank)||definitions[String(rankHash)]||null;
      name=name||String(definition?.displayProperties?.name||'').trim();
      icon=icon||bungiePresentationIcon(definition);
    }catch(error){console.info('[Forge Journey] Guardian Rank summary definition unavailable',error);}
  }
  if(requestId!==guardianRankSummaryRequest)return;
  renderGuardianRankSummary({rank,name:name||`Guardian Rank ${rank}`});
}

function renderGuardianRankSummary({rank,name=''}){
  if(!guardianRankSummary)return;
  guardianRankSummary.replaceChildren();
  guardianRankSummary.classList.toggle('has-no-icon',rank===null);
  if(rank!==null)guardianRankSummary.appendChild(createRankBadge(rank,`Highest completed Guardian Rank ${rank}`));
  const copy=document.createElement('div');
  copy.className='journey-record-detail-copy';
  const heading=document.createElement('h4');
  heading.textContent=rank===null?'Guardian Rank unavailable':name;
  const description=document.createElement('p');
  description.textContent=rank===null?'Highest completed Guardian Rank awaiting verified Bungie data.':`HIGHEST COMPLETED GUARDIAN RANK ${rank}`;
  const link=document.createElement('a');
  link.className='journey-record-link';
  link.id='journeyGuardianRankDetailsLink';
  link.href='#journeyGuardianRankHeading';
  link.textContent='VIEW GUARDIAN RANK DETAILS';
  copy.append(heading,description,link);
  guardianRankSummary.appendChild(copy);
}

function renderEquippedTitleSummary(title=null,unavailableText='Equipped title awaiting verified Bungie data.'){
  if(!titleSealCard)return;
  equippedTitleSummary=title;
  const name=title?.name||'Equipped title unavailable';
  const description=title?[`EQUIPPED TITLE AND SEAL${title.gilded?' · GILDED':''}`,title.description].filter(Boolean).join(' · '):unavailableText;
  renderDetailHero(titleSealCard,{name,icon:title?.icon||'',description,completed:title?.completed??null,total:title?.total??null,unit:title?.unit||'TITLE REQUIREMENTS'});
  const copy=titleSealCard.querySelector('.journey-record-detail-copy');
  if(!copy)return;
  const link=document.createElement('a');
  link.className='journey-record-link';
  link.id='journeyEquippedTitleDetailsLink';
  link.href='#journeyTitlesHeading';
  link.textContent=title?'VIEW TITLE DETAILS':'VIEW ALL TITLES';
  copy.appendChild(link);
}

function renderNextTitleSummary(title=null){
  if(!titleProgressCard)return;
  nextTitleSummary=title;
  renderDetailHero(titleProgressCard,{name:title?.name||'Next title unavailable',icon:title?.icon||'',description:title?.description||'Verified title progress is not available.',completed:title?.completed??null,total:title?.total??null,unit:title?.unit||'TITLE REQUIREMENTS'});
  const copy=titleProgressCard.querySelector('.journey-record-detail-copy');
  if(!copy)return;
  const link=document.createElement('a');
  link.className='journey-record-link';
  link.id='journeyNextTitleDetailsLink';
  link.href='#journeyTitlesHeading';
  link.textContent=title?'VIEW TITLE DETAILS':'VIEW ALL TITLES';
  copy.appendChild(link);
}

function resetRecentActivity(){
  if(!recentActivityCard)return null;
  recentActivityCard.querySelector('[data-journey-recent-list]')?.remove();
  const fallback=recentActivityCard.querySelector('.apx-empty-state');
  if(fallback){fallback.hidden=false;fallback.textContent=RECENT_ACTIVITY_PENDING;}
  return fallback;
}

async function resolveManifestDefinition(type,hash){
  if(hash===null||hash===undefined)return null;
  try{
    await manifestReady;
    return await guardianManifest.getAsync(type,hash);
  }catch{return null;}
}

function titleNameFor(recordDefinition,character,fallback){
  const titlesByGenderHash=recordDefinition?.titleInfo?.titlesByGenderHash||{};
  const titlesByGender=recordDefinition?.titleInfo?.titlesByGender||{};
  return String(titlesByGenderHash[String(character?.genderHash||'')]
    ||titlesByGender[character?.genderType]
    ||Object.values(titlesByGenderHash).find(Boolean)
    ||Object.values(titlesByGender).find(Boolean)
    ||fallback||'').trim();
}

function bungieIconUrl(path){
  if(typeof path!=='string'||!path)return '';
  try{
    const url=new URL(path,BUNGIE_ORIGIN);
    return url.origin===BUNGIE_ORIGIN?url.toString():'';
  }catch{return '';}
}

function bungiePresentationIcon(definition){
  return bungieIconUrl(definition?.displayProperties?.icon||definition?.originalIcon||definition?.rootViewIcon);
}

function titleRecordFor(payload,characterId,hash){
  return payload?.profile?.characterRecords?.data?.[characterId]?.records?.[String(hash)]
    ||payload?.profile?.profileRecords?.data?.records?.[String(hash)];
}

function titleRequirementRow(payload,characterId,entry,definition,objectiveDefinitions){
  const hash=finiteNumber(entry?.recordHash);
  const component=hash===null?null:titleRecordFor(payload,characterId,hash);
  const state=finiteNumber(component?.state);
  if(!definition||state!==null&&(state&16)===16)return null;
  const objectives=(Array.isArray(component?.objectives)?component.objectives:[]).filter(objective=>objective?.visible!==false).map(objective=>{
    const objectiveDefinition=objectiveDefinitions[String(objective?.objectiveHash)];
    return {hash:finiteNumber(objective?.objectiveHash),name:String(objectiveDefinition?.progressDescription||objectiveDefinition?.displayProperties?.name||'OBJECTIVE PROGRESS').trim(),completed:finiteNumber(objective?.progress),total:finiteNumber(objective?.completionValue),complete:objective?.complete===true};
  }).filter(objective=>objective.completed!==null&&objective.total!==null&&objective.total>0);
  const complete=state!==null?(state&4)!==4:objectives.length?objectives.every(objective=>objective.complete):null;
  return {hash,name:String(definition?.displayProperties?.name||'').trim(),icon:bungiePresentationIcon(definition),description:String(state!==null&&(state&8)===8?definition?.stateInfo?.obscuredDescription||'':definition?.displayProperties?.description||''),complete,objectives};
}

async function titlePresentationCatalog(payload){
  const rootHash=finiteNumber(payload?.profile?.profileRecords?.data?.recordSealsRootNodeHash);
  if(rootHash===null)return [];
  const cacheKey=String(rootHash);
  if(titleCatalogueRootHash===cacheKey&&titleCataloguePromise)return titleCataloguePromise;
  titleCatalogueRootHash=cacheKey;
  titleCataloguePromise=(async()=>{
    await manifestReady;
    const catalog=[];
    const seen=new Set();
    let pending=[{presentationNodeHash:rootHash,nodeDisplayPriority:0}];
    while(pending.length){
      const level=pending;
      pending=[];
      const definitions=await guardianManifest.getMany('DestinyPresentationNodeDefinition',level.map(entry=>entry.presentationNodeHash));
      level.sort((left,right)=>Number(left?.nodeDisplayPriority||0)-Number(right?.nodeDisplayPriority||0)).forEach(entry=>{
        const hash=String(entry?.presentationNodeHash||'');
        if(!hash||seen.has(hash))return;
        seen.add(hash);
        const definition=definitions[hash];
        if(!definition)return;
        if(finiteNumber(definition?.completionRecordHash)!==null)catalog.push({hash,definition});
        pending.push(...(definition?.children?.presentationNodes||[]));
      });
    }
    return catalog;
  })();
  try{return await titleCataloguePromise;}
  catch(error){
    if(titleCatalogueRootHash===cacheKey)titleCataloguePromise=null;
    throw error;
  }
}

async function titlePresentationCandidates(payload){
  try{
    const catalog=await titlePresentationCatalog(payload);
    if(catalog.length)return catalog;
  }catch(error){console.info('[Forge Journey] complete title catalogue unavailable',error);}
  return profileTitlePresentationCandidates(payload);
}

async function profileTitlePresentationCandidates(payload){
  const nodes=payload?.profile?.profilePresentationNodes?.data?.nodes||{};
  await manifestReady;
  const definitions=await guardianManifest.getMany('DestinyPresentationNodeDefinition',Object.keys(nodes));
  return Object.keys(nodes).map(hash=>({hash,definition:definitions[hash]})).filter(item=>item.definition&&finiteNumber(item.definition?.completionRecordHash)!==null);
}

function titleCollectionProgress(payload,characterId,item,completionRecordHash,view){
  const nodes=payload?.profile?.profilePresentationNodes?.data?.nodes||{};
  const node=nodes[String(item.hash)];
  const requirementEntries=(item.definition?.children?.records||[]).slice().sort((left,right)=>Number(left?.nodeDisplayPriority||0)-Number(right?.nodeDisplayPriority||0));
  const activityProgress=payload?.journeyTitleActivityProgress?.[String(item.hash)];
  const activityCompleted=finiteNumber(activityProgress?.completedActivities);
  const activityTotal=finiteNumber(activityProgress?.totalActivities);
  const nodeCompleted=finiteNumber(node?.progressValue);
  const nodeTotal=finiteNumber(node?.completionValue);
  const requirementStates=requirementEntries.map(entry=>finiteNumber(titleRecordFor(payload,characterId,entry?.recordHash)?.state));
  const hasVerifiedRequirements=requirementStates.some(state=>state!==null);
  let completed=null;
  let total=null;
  let unit=view==='badges'?'BADGE REQUIREMENTS':'TITLE REQUIREMENTS';
  if(activityCompleted!==null&&activityTotal!==null&&activityTotal>0){
    completed=activityCompleted;
    total=activityTotal;
    unit='ACTIVITIES';
  }else if(nodeCompleted!==null&&nodeTotal!==null&&nodeTotal>0){
    completed=nodeCompleted;
    total=nodeTotal;
  }else if(requirementEntries.length&&hasVerifiedRequirements){
    completed=requirementStates.filter(state=>state!==null&&(state&4)!==4).length;
    total=requirementEntries.length;
  }
  const state=finiteNumber(titleRecordFor(payload,characterId,completionRecordHash)?.state);
  const earned=view==='titles'&&state!==null&&(state&64)===64;
  return {completed,total,unit,earned,complete:earned||completed!==null&&total!==null&&total>0&&completed>=total,gilded:view==='titles'&&state!==null&&(state&128)===128,requirementEntries};
}

async function resolvedTitleCollectionFromCandidates(payload,character,view='titles',candidates=[]){
  const characterId=String(character?.characterId||'');
  const recordDefinitions=await guardianManifest.getMany('DestinyRecordDefinition',candidates.map(item=>item.definition?.completionRecordHash));
  const equippedHash=finiteNumber(character?.titleRecordHash);
  const titles=candidates.map(item=>{
    const completionRecordHash=finiteNumber(item.definition?.completionRecordHash);
    if(completionRecordHash===null)return null;
    const recordDefinition=recordDefinitions[String(completionRecordHash)];
    const hasTitle=recordDefinition?.titleInfo?.hasTitle===true;
    if(!recordDefinition?.titleInfo||(view==='titles')!==hasTitle)return null;
    const name=view==='badges'?String(item.definition?.displayProperties?.name||'').trim():titleNameFor(recordDefinition,character,item.definition?.displayProperties?.name);
    if(!name)return null;
    const progress=titleCollectionProgress(payload,characterId,item,completionRecordHash,view);
    return {hash:item.hash,completionRecordHash,name,detailName:String(item.definition?.displayProperties?.name||name).trim(),icon:bungiePresentationIcon(item.definition),description:String(item.definition?.displayProperties?.description||recordDefinition?.displayProperties?.description||'').trim(),completed:progress.completed,total:progress.total,unit:progress.unit,earned:progress.earned,complete:progress.complete,gilded:progress.gilded,equipped:equippedHash===completionRecordHash,requirements:null,requirementEntries:progress.requirementEntries,characterId};
  }).filter(Boolean);
  const progressRatio=item=>item.completed!==null&&item.total!==null&&item.total>0?item.completed/item.total:-1;
  return titles.sort((left,right)=>Number(right.equipped)-Number(left.equipped)||Number(right.earned)-Number(left.earned)||progressRatio(right)-progressRatio(left)||left.name.localeCompare(right.name));
}

async function resolvedProfileTitleCollection(payload,character,view='titles'){
  const candidates=await profileTitlePresentationCandidates(payload);
  return resolvedTitleCollectionFromCandidates(payload,character,view,candidates);
}

async function resolvedTitleCollection(payload,character,view='titles'){
  const candidates=await titlePresentationCandidates(payload);
  return resolvedTitleCollectionFromCandidates(payload,character,view,candidates);
}

async function presentationRecordCategories(entries,nodes,characterId,recordKind){
  const sections=[];
  const seen=new Set();
  let pending=(entries||[]).map(entry=>({entry,path:[]}));
  while(pending.length){
    const level=pending;
    pending=[];
    const definitions=await guardianManifest.getMany('DestinyPresentationNodeDefinition',level.map(item=>item.entry.presentationNodeHash));
    level.sort((left,right)=>Number(left.entry?.nodeDisplayPriority||0)-Number(right.entry?.nodeDisplayPriority||0)).forEach(item=>{
      const hash=String(item.entry?.presentationNodeHash||'');
      if(!hash||seen.has(hash))return;
      seen.add(hash);
      const definition=definitions[hash];
      const name=String(definition?.displayProperties?.name||'').trim();
      if(!definition||!name)return;
      const node=nodes?.[hash];
      const state=finiteNumber(node?.state);
      if(state!==null&&(state&1)===1)return;
      const path=[...item.path,name];
      const recordEntries=(definition?.children?.records||[]).slice().sort((left,right)=>Number(left?.nodeDisplayPriority||0)-Number(right?.nodeDisplayPriority||0));
      if(recordEntries.length)sections.push({key:hash,name:path.join(' · '),icon:bungiePresentationIcon(definition),completed:finiteNumber(node?.progressValue),total:finiteNumber(node?.completionValue),recordEntries,items:null,characterId,recordKind});
      pending.push(...(definition?.children?.presentationNodes||[]).map(entry=>({entry,path})));
    });
  }
  return sections;
}

async function presentationLeafCategories(rootHash,nodes,childKey){
  const hash=finiteNumber(rootHash);
  if(hash===null)return null;
  const rootDefinition=await guardianManifest.getAsync('DestinyPresentationNodeDefinition',hash);
  if(!rootDefinition)return null;
  const sections=[];
  const seen=new Set();
  let pending=[{entry:{presentationNodeHash:hash,nodeDisplayPriority:0},path:[],root:true}];
  while(pending.length){
    const level=pending;
    pending=[];
    const definitions=await guardianManifest.getMany('DestinyPresentationNodeDefinition',level.map(item=>item.entry.presentationNodeHash));
    level.sort((left,right)=>Number(left.entry?.nodeDisplayPriority||0)-Number(right.entry?.nodeDisplayPriority||0)).forEach(item=>{
      const nodeHash=String(item.entry?.presentationNodeHash||'');
      if(!nodeHash||seen.has(nodeHash))return;
      seen.add(nodeHash);
      const definition=definitions[nodeHash];
      const name=String(definition?.displayProperties?.name||'').trim();
      if(!definition||!name)return;
      const node=nodes?.[nodeHash];
      const state=finiteNumber(node?.state);
      if(state!==null&&(state&1)===1)return;
      const path=item.root?[]:[...item.path,name];
      const entries=(definition?.children?.[childKey]||[]).slice().sort((left,right)=>Number(left?.nodeDisplayPriority||0)-Number(right?.nodeDisplayPriority||0));
      if(entries.length)sections.push({key:nodeHash,name:path.join(' · ')||name,path,icon:bungiePresentationIcon(definition),completed:finiteNumber(node?.progressValue),total:finiteNumber(node?.completionValue),entries});
      pending.push(...(definition?.children?.presentationNodes||[]).map(entry=>({entry,path,root:false})));
    });
  }
  return {
    root:{hash:String(hash),name:String(rootDefinition?.displayProperties?.name||'').trim(),icon:bungiePresentationIcon(rootDefinition),node:nodes?.[String(hash)]},
    sections
  };
}

async function recordPresentationTree(payload){
  return resolveRecordTree(payload,guardianManifest,String(journeyCharacterFor(payload)?.characterId||''));
}

async function currentRecordBranch(root,nodes){
  if(!root?.definition)return null;
  const entries=(root.definition?.children?.presentationNodes||[]).slice().sort((left,right)=>Number(left?.nodeDisplayPriority||0)-Number(right?.nodeDisplayPriority||0));
  if(!entries.length)return root;
  const definitions=await guardianManifest.getMany('DestinyPresentationNodeDefinition',entries.map(entry=>entry.presentationNodeHash));
  const rootName=recordCategoryKey(root.definition?.displayProperties?.name);
  const entry=entries.find(item=>recordCategoryKey(definitions[String(item.presentationNodeHash)]?.displayProperties?.name)===rootName);
  if(!entry)return root;
  const hash=String(entry.presentationNodeHash);
  return {entry,hash,definition:definitions[hash],node:nodes?.[hash]};
}

const DESTINATION_NAME_ALIASES=Object.freeze({
  'pale-heart':['Pale Heart','The Pale Heart'],
  'dreaming-city':['Dreaming City','The Dreaming City'],
  neomuna:['Neomuna'],europa:['Europa'],'throne-world':['Throne World',"Savathûn's Throne World","Savathun's Throne World"],
  nessus:['Nessus'],edz:['EDZ','European Dead Zone'],moon:['Moon','The Moon'],cosmodrome:['Cosmodrome','The Cosmodrome']
});
const destinationNameKey=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function destinationNameMatches(key,value){
  const names=DESTINATION_NAME_ALIASES[key]||[globalThis.ForgeDestinations?.labelOf(key)||key];
  return names.some(name=>destinationNameKey(name)===destinationNameKey(value));
}

function journeyCharacterFor(payload){
  const characters=payload?.profile?.characters?.data||{};
  return characters[selectedCharacterId]||Object.values(characters).sort((left,right)=>String(right?.dateLastPlayed||'').localeCompare(String(left?.dateLastPlayed||'')))[0]||null;
}

function destinationRecordItem(row){
  return {hash:row.hash,name:row.name,icon:row.icon,description:row.complete===null?`${row.description} · Progress unavailable`:row.description,completed:row.complete,objectives:(row.objectives||[]).map(objective=>({name:objective.name,current:objective.completed,total:objective.total,completed:objective.complete}))};
}

function destinationCategoryItem(section,label){
  const complete=section.completed!==null&&section.total!==null&&section.total>0&&section.completed>=section.total;
  return {name:section.name,icon:section.icon,description:label,current:section.completed,total:section.total,completed:complete};
}

async function destinationRecordSections(payload,key,characterId){
  const tree=await recordPresentationTree(payload);
  const nodes=tree?.nodes||{};
  const triumphRoot=tree?.triumphs;
  const destinations=await findDestinationNodes(triumphRoot,guardianManifest,name=>destinationNameMatches(key,name),nodes);
  const sections=[];
  for(const destination of destinations){
    const branchSections=await presentationRecordCategories([{presentationNodeHash:destination.hash}],nodes,characterId,'destination');
    sections.push(...branchSections);
  }
  const recordEntries=sections.flatMap(section=>section.recordEntries);
  const recordDefinitions=await guardianManifest.getMany('DestinyRecordDefinition',recordEntries.map(entry=>entry.recordHash));
  const objectiveDefinitions=await guardianManifest.getMany('DestinyObjectiveDefinition',Object.values(recordDefinitions).flatMap(definition=>definition?.objectiveHashes||[]));
  const recordsBySection=sections.map(section=>({section,records:section.recordEntries.map(entry=>{
    const definition=recordDefinitions[String(entry.recordHash)];
    const row=titleRequirementRow(payload,characterId,entry,definition,objectiveDefinitions);
    return row?{entry,definition,row,component:titleRecordFor(payload,characterId,entry.recordHash)}:null;
  }).filter(Boolean)}));
  const records=[];
  recordsBySection.forEach(({section,records:sectionRecords})=>{
    if(sectionRecords.length)records.push(destinationCategoryItem(section,'RECORD CATEGORY'),...sectionRecords.map(item=>destinationRecordItem(item.row)));
  });
  const activityHashes=[...new Set(recordsBySection.flatMap(({records})=>records.flatMap(item=>(item.component?.objectives||[]).map(objective=>finiteNumber(objective?.activityHash)).filter(hash=>hash!==null))))];
  const activityDefinitions=await guardianManifest.getMany('DestinyActivityDefinition',activityHashes);
  const activityDestinationDefinitions=await guardianManifest.getMany('DestinyDestinationDefinition',Object.values(activityDefinitions).map(definition=>definition?.destinationHash));
  const groups=new Map();
  recordsBySection.flatMap(({records})=>records).forEach(item=>{
    (item.component?.objectives||[]).filter(objective=>objective?.visible!==false).forEach(objective=>{
      const activityHash=finiteNumber(objective?.activityHash);
      const activity=activityDefinitions[String(activityHash)];
      const modes=activity?.activityModeTypes||[];
      const type=modes.includes(4)?'RAID':modes.includes(82)?'DUNGEON':'';
      const destination=activityDestinationDefinitions[String(activity?.destinationHash||'')];
      const name=String(activity?.displayProperties?.name||'').trim();
      if(!type||!name||!destinationNameMatches(key,destination?.displayProperties?.name))return;
      const groupKey=`${type}:${name}`;
      if(!groups.has(groupKey))groups.set(groupKey,{type,name,icon:bungiePresentationIcon(activity),records:new Map()});
      const group=groups.get(groupKey);
      if(!group.records.has(item.row.hash))group.records.set(item.row.hash,{item,objectiveHashes:new Set()});
      group.records.get(item.row.hash).objectiveHashes.add(finiteNumber(objective?.objectiveHash));
    });
  });
  const endgame=[];
  [...groups.values()].sort((left,right)=>left.type.localeCompare(right.type)||left.name.localeCompare(right.name)).forEach(group=>{
    const groupRecords=[...group.records.values()];
    endgame.push({name:`${group.type} · ${group.name}`,icon:group.icon,description:'ACTIVITY',current:groupRecords.filter(({item})=>item.row.complete).length,total:groupRecords.length,completed:groupRecords.length>0&&groupRecords.every(({item})=>item.row.complete)});
    groupRecords.forEach(({item,objectiveHashes})=>endgame.push(destinationRecordItem({...item.row,objectives:item.row.objectives.filter(objective=>objectiveHashes.has(objective.hash))})));
  });
  const catalogue=await guardianManifest.index();
  const destinationHashes=Object.keys(catalogue?.endgameByDestination||{});
  const officialDestinations=await guardianManifest.getMany('DestinyDestinationDefinition',destinationHashes);
  const endgameHashes=destinationHashes.filter(hash=>destinationNameMatches(key,officialDestinations[hash]?.displayProperties?.name)).flatMap(hash=>catalogue.endgameByDestination[hash]);
  const endgameDefinitions=await guardianManifest.getMany('DestinyActivityDefinition',endgameHashes);
  const seenActivities=new Set([...groups.values()].map(group=>group.name));
  for(const activity of Object.values(endgameDefinitions)){
    const name=activity.displayProperties?.name;if(!name||seenActivities.has(name))continue;seenActivities.add(name);
    const type=(activity.activityModeTypes||[]).includes(4)?'RAID':'DUNGEON';
    endgame.push({hash:activity.hash,name:`${type} · ${name}`,icon:bungiePresentationIcon(activity),description:'Activity catalogue · Completion progress unavailable',completed:null});
  }
  return {records,endgame};
}

async function destinationQuestRows(payload,key,characterId){
  const progression=payload?.profile?.characterProgressions?.data?.[characterId]||{};
  const statuses=(progression.quests||[]).map(status=>({status,questHash:finiteNumber(status?.questHash),stepHash:finiteNumber(status?.stepHash),objectives:status?.stepObjectives||[]}));
  Object.entries(progression.uninstancedItemObjectives||{}).forEach(([stepHash,objectives])=>statuses.push({status:{},questHash:null,stepHash:finiteNumber(stepHash),objectives:Array.isArray(objectives)?objectives:[]}));
  const itemDefinitions=await guardianManifest.getMany('DestinyInventoryItemDefinition',statuses.flatMap(item=>[item.questHash,item.stepHash]));
  const questHashes=statuses.map(item=>item.questHash??finiteNumber(itemDefinitions[String(item.stepHash)]?.objectives?.questlineItemHash)).filter(hash=>hash!==null);
  Object.assign(itemDefinitions,await guardianManifest.getMany('DestinyInventoryItemDefinition',questHashes));
  const objectiveDefinitions=await guardianManifest.getMany('DestinyObjectiveDefinition',statuses.flatMap(item=>item.objectives.map(objective=>objective?.objectiveHash)));
  const activityDefinitions=await guardianManifest.getMany('DestinyActivityDefinition',statuses.flatMap(item=>item.objectives.map(objective=>objective?.activityHash)));
  const destinationDefinitions=await guardianManifest.getMany('DestinyDestinationDefinition',[
    ...statuses.flatMap(item=>item.objectives.map(objective=>objective?.destinationHash)),
    ...Object.values(activityDefinitions).map(definition=>definition?.destinationHash)
  ]);
  const groups=new Map();
  statuses.forEach(item=>{
    const destinationObjectives=item.objectives.filter(objective=>objective?.visible!==false).filter(objective=>{
      const direct=destinationDefinitions[String(objective?.destinationHash||'')];
      const activity=activityDefinitions[String(objective?.activityHash||'')];
      const activityDestination=destinationDefinitions[String(activity?.destinationHash||'')];
      return destinationNameMatches(key,direct?.displayProperties?.name)||destinationNameMatches(key,activityDestination?.displayProperties?.name);
    });
    if(!destinationObjectives.length)return;
    const stepDefinition=itemDefinitions[String(item.stepHash)];
    const questHash=item.questHash??finiteNumber(stepDefinition?.objectives?.questlineItemHash);
    if(questHash===null)return;
    const questDefinition=itemDefinitions[String(questHash)]||stepDefinition;
    const groupName=String(questDefinition?.itemTypeAndTierDisplayName||stepDefinition?.itemTypeAndTierDisplayName||'QUESTS').trim();
    const objectives=destinationObjectives.map(objective=>({name:String(objectiveDefinitions[String(objective?.objectiveHash)]?.progressDescription||'OBJECTIVE PROGRESS').trim(),current:finiteNumber(objective?.progress),total:finiteNumber(objective?.completionValue),completed:objective?.complete===true})).filter(objective=>objective.current!==null&&objective.total!==null&&objective.total>0);
    const visibleObjectives=item.objectives.filter(objective=>objective?.visible!==false);
    const stepComplete=visibleObjectives.length>0&&visibleObjectives.every(objective=>objective?.complete===true);
    const questComplete=item.status?.completed===true;
    const quest={name:String(questDefinition?.displayProperties?.name||stepDefinition?.displayProperties?.name||'').trim(),icon:bungiePresentationIcon(questDefinition),description:String(questDefinition?.displayProperties?.description||''),completed:questComplete};
    const step={name:String(stepDefinition?.displayProperties?.name||quest.name).trim(),icon:bungiePresentationIcon(stepDefinition),description:String(stepDefinition?.displayProperties?.description||''),completed:stepComplete,objectives};
    if(!quest.name||!step.name)return;
    if(!groups.has(groupName))groups.set(groupName,[]);
    groups.get(groupName).push({quest,step});
  });
  const rows=[];
  for(const [groupName,quests] of groups){
    rows.push({name:groupName,description:'QUEST GROUP',current:quests.filter(item=>item.quest.completed).length,total:quests.length,completed:quests.length>0&&quests.every(item=>item.quest.completed)});
    quests.forEach(item=>rows.push(item.quest,item.step));
  }
  return rows;
}

async function bindRegionChestProgress(payload,key,characterId,requestId){
  const checklistStates={...(payload?.profile?.profileProgression?.data?.checklists||{}),...(payload?.profile?.characterProgressions?.data?.[characterId]?.checklists||{})};
  const checklistHashes=Object.keys(checklistStates);
  if(!checklistHashes.length)return;
  const checklistDefinitions=await guardianManifest.getMany('DestinyChecklistDefinition',checklistHashes);
  if(!Object.keys(checklistDefinitions).length)return;
  const entries=[];
  let regionChecklistFound=false;
  checklistHashes.forEach(hash=>{
    const definition=checklistDefinitions[hash];
    const label=`${definition?.displayProperties?.name||''} ${definition?.viewActionString||''}`;
    if(!/region chests?/i.test(label))return;
    regionChecklistFound=true;
    (definition?.entries||[]).forEach(entry=>entries.push({entry,state:checklistStates[hash]?.[String(entry?.hash)]}));
  });
  if(!regionChecklistFound)return;
  const activityDefinitions=await guardianManifest.getMany('DestinyActivityDefinition',entries.map(item=>item.entry?.activityHash));
  const locationDefinitions=await guardianManifest.getMany('DestinyLocationDefinition',entries.map(item=>item.entry?.locationHash));
  const destinationDefinitions=await guardianManifest.getMany('DestinyDestinationDefinition',[
    ...entries.map(item=>item.entry?.destinationHash),
    ...Object.values(activityDefinitions).map(definition=>definition?.destinationHash),
    ...Object.values(locationDefinitions).flatMap(definition=>(definition?.locationReleases||[]).map(release=>release?.destinationHash))
  ]);
  const matching=entries.filter(({entry})=>{
    const direct=destinationDefinitions[String(entry?.destinationHash||'')];
    const activity=activityDefinitions[String(entry?.activityHash||'')];
    const activityDestination=destinationDefinitions[String(activity?.destinationHash||'')];
    const location=locationDefinitions[String(entry?.locationHash||'')];
    return destinationNameMatches(key,direct?.displayProperties?.name)
      ||destinationNameMatches(key,activityDestination?.displayProperties?.name)
      ||(location?.locationReleases||[]).some(release=>destinationNameMatches(key,destinationDefinitions[String(release?.destinationHash||'')]?.displayProperties?.name));
  });
  const chests=matching.map(({entry,state})=>{
    const direct=destinationDefinitions[String(entry?.destinationHash||'')];
    const activity=activityDefinitions[String(entry?.activityHash||'')];
    const activityDestination=destinationDefinitions[String(activity?.destinationHash||'')];
    const locationDefinition=locationDefinitions[String(entry?.locationHash||'')];
    const locationDestination=(locationDefinition?.locationReleases||[]).map(release=>destinationDefinitions[String(release?.destinationHash||'')]).find(definition=>destinationNameMatches(key,definition?.displayProperties?.name));
    const destination=direct||activityDestination||locationDestination;
    const bubble=(destination?.bubbles||[]).find(item=>String(item?.hash)===String(entry?.bubbleHash));
    const location=String(bubble?.displayProperties?.name||locationDefinition?.displayProperties?.name||entry?.displayProperties?.description||activity?.displayProperties?.name||'').trim();
    return {name:String(entry?.displayProperties?.name||'').trim(),location,collected:typeof state==='boolean'?state:null};
  });
  if(requestId!==destinationProgressRequest||entries.length>0&&!matching.length||chests.some(chest=>!chest.name||!chest.location||chest.collected===null))return;
  publishJourneyRegionChestProgress({key,total:chests.length,discovered:chests.filter(chest=>chest.collected).length,chests});
}

async function bindDestinationProgress(payload,key=globalThis.ForgeDestinations?.current()){
  if(!payload||!key)return;
  const requestId=++destinationProgressRequest;
  publishJourneyDestinationData({key,loading:true,sections:{}});
  const task=async()=>{
    if(requestId!==destinationProgressRequest)return;
    await manifestReady;
    const character=journeyCharacterFor(payload);
    const characterId=String(character?.characterId||'');
    try{
      const regionChests=bindRegionChestProgress(payload,key,characterId,requestId).catch(()=>null);
      const [recordSections,quests]=await Promise.all([destinationRecordSections(payload,key,characterId),destinationQuestRows(payload,key,characterId)]);
      if(requestId!==destinationProgressRequest)return;
      publishJourneyDestinationData({key,sections:{records:recordSections.records,quests,endgame:recordSections.endgame}});
      await regionChests;
    }catch(error){
      if(requestId===destinationProgressRequest)publishJourneyDestinationData({key,error:'Destination records could not be loaded. Select this destination to retry.',sections:{}});
      console.info('[Forge Journey] destination records unavailable',error);
    }
  };
  destinationProgressQueue=destinationProgressQueue.catch(()=>null).then(task);
  return destinationProgressQueue;
}

const RECORD_SECTION_DEFINITIONS=[
  {key:'medals',name:'Medals',description:'Verified activity medals and earned counts.'},
  {key:'patterns-catalysts',name:'Patterns & Catalysts',description:'Weapon-pattern and catalyst objective progress.'},
  {key:'lore',name:'Lore',description:'Unlocked lore entries and collection progress.',optional:true},
  {key:'stat-trackers',name:'Stat Trackers',description:'Verified Guardian statistics and objective progress.'}
];
const PATTERN_CATALYST_TYPE_DEFINITIONS=[
  {key:'primary',name:'Primary Weapon Patterns',shortName:'Primary',categories:['Auto Rifles','Bows','Hand Cannons','Pulse Rifles','Scout Rifles','Sidearms','Submachine Guns']},
  {key:'special',name:'Special Weapon Patterns',shortName:'Special',categories:['Fusion Rifles','Glaives','Grenade Launchers','Shotguns','Sniper Rifles','Trace Rifles']},
  {key:'heavy',name:'Heavy Weapon Patterns',shortName:'Heavy',categories:['Grenade Launchers','Linear Fusion Rifles','Machine Guns','Rocket Launchers','Swords']},
  {key:'catalysts',name:'Exotic Catalysts',shortName:'Catalysts',categories:['Kinetic Weapons','Energy Weapons','Power Weapons']}
];
function makeJourneyRecordRow({hash,name,icon,description='',completed=null,total=null,threshold=null,unit='',gilded=false,complete=false,crafted=false,claimed=false,value=null,onSelect=null,objectives=[]}){
  const interactive=typeof onSelect==='function';
  const row=document.createElement(interactive?'button':'article');
  if(interactive){row.type='button';row.addEventListener('click',onSelect);}
  row.className=`journey-record-row${gilded?' is-gilded':''}${complete?' is-complete':''}${crafted?' is-crafted':''}${icon?'':' has-no-icon'}`;
  if(hash!==null&&hash!==undefined)row.dataset.presentationNodeHash=String(hash);
  if(icon){
    const image=document.createElement('img');
    image.className='journey-record-icon';
    image.src=icon;
    image.alt='';
    image.loading='lazy';
    row.appendChild(image);
  }
  const copy=document.createElement('div');
  copy.className='journey-record-copy';
  const title=document.createElement('strong');
  title.className='journey-record-title';
  title.textContent=`${name}${gilded?' · GILDED':crafted?' · CRAFTED':claimed?' · CLAIMED':''}`;
  if(complete||crafted){const check=document.createElement('span');check.className='journey-record-check';check.textContent='✓';title.appendChild(check);}
  copy.appendChild(title);
  if(description){const text=document.createElement('span');text.className='journey-record-description';text.textContent=description;copy.appendChild(text);}
  const verifiedProgress=completed!==null&&total!==null&&total>0;
  const hasValue=value!==null&&value!==undefined&&String(value)!=='';
  if(unit||verifiedProgress||hasValue){
    const progress=document.createElement('div');
    progress.className='journey-record-progress';
    const label=document.createElement('span');
    label.textContent=unit||'VERIFIED VALUE';
    const output=document.createElement('b');
    output.textContent=verifiedProgress?`${numberFormatter.format(completed)} / ${numberFormatter.format(total)}`:hasValue?(typeof value==='number'?numberFormatter.format(value):String(value)):'AWAITING VERIFIED COUNTS';
    progress.append(label,output);
    copy.appendChild(progress);
  }
  if(verifiedProgress){
    const bounded=Math.max(0,Math.min(total,completed));
    const track=document.createElement('div');
    track.className='journey-record-track';
    track.setAttribute('role','progressbar');
    track.setAttribute('aria-label',`${name} ${unit.toLowerCase()}`);
    track.setAttribute('aria-valuemin','0');
    track.setAttribute('aria-valuemax',String(total));
    track.setAttribute('aria-valuenow',String(bounded));
    const fill=document.createElement('i');
    fill.className='journey-record-fill';
    fill.style.width=`${bounded/total*100}%`;
    track.appendChild(fill);
    copy.appendChild(track);
  }
  const verifiedThreshold=finiteNumber(threshold);
  const thresholdValue=finiteNumber(value);
  if(verifiedThreshold!==null&&verifiedThreshold>0&&thresholdValue!==null){
    const bounded=Math.max(0,Math.min(verifiedThreshold,thresholdValue));
    const progress=document.createElement('div');
    progress.className='journey-record-progress';
    const label=document.createElement('span');
    label.textContent='COMPLETION THRESHOLD';
    const output=document.createElement('b');
    output.textContent=`${numberFormatter.format(verifiedThreshold)}${complete?' · MET':''}`;
    progress.append(label,output);
    const track=document.createElement('div');
    track.className='journey-record-track';
    track.setAttribute('role','progressbar');
    track.setAttribute('aria-label',`${name} completion threshold`);
    track.setAttribute('aria-valuemin','0');
    track.setAttribute('aria-valuemax',String(verifiedThreshold));
    track.setAttribute('aria-valuenow',String(bounded));
    const fill=document.createElement('i');
    fill.className='journey-record-fill';
    fill.style.width=`${bounded/verifiedThreshold*100}%`;
    track.appendChild(fill);
    copy.append(progress,track);
  }
  objectives.forEach(objective=>{
    if(objective.completed===null||objective.total===null||objective.total<=0)return;
    const bounded=Math.max(0,Math.min(objective.total,objective.completed));
    const progress=document.createElement('div');
    progress.className='journey-record-progress';
    const label=document.createElement('span');
    label.textContent=objective.name;
    const output=document.createElement('b');
    output.textContent=`${numberFormatter.format(objective.completed)} / ${numberFormatter.format(objective.total)}`;
    progress.append(label,output);
    const track=document.createElement('div');
    track.className='journey-record-track';
    track.setAttribute('role','progressbar');
    track.setAttribute('aria-label',`${name} ${objective.name.toLowerCase()}`);
    track.setAttribute('aria-valuemin','0');
    track.setAttribute('aria-valuemax',String(objective.total));
    track.setAttribute('aria-valuenow',String(bounded));
    const fill=document.createElement('i');
    fill.className='journey-record-fill';
    fill.style.width=`${bounded/objective.total*100}%`;
    track.appendChild(fill);
    copy.append(progress,track);
  });
  row.appendChild(copy);
  return row;
}

function renderJourneyRecordList(list,rows,emptyText,onSelect=null){
  if(!list)return;
  list.replaceChildren();
  if(!rows.length){
    const empty=document.createElement('span');
    empty.className='apx-empty-state journey-records-empty';
    empty.textContent=emptyText;
    list.appendChild(empty);
    return;
  }
  const pageSize=60;let offset=0;
  const controls=document.createElement('nav');controls.setAttribute('aria-label','Record pages');
  const paint=()=>{
    list.replaceChildren();
    const page=document.createDocumentFragment();
    rows.slice(offset,offset+pageSize).forEach(row=>page.appendChild(makeJourneyRecordRow({...row,onSelect:onSelect?()=>onSelect(row):null})));
    list.appendChild(page);
    if(rows.length>pageSize){
      controls.replaceChildren();
      for(const [label,next] of [['Previous',offset-pageSize],['Next',offset+pageSize]]){const button=document.createElement('button');button.type='button';button.textContent=label;button.disabled=next<0||next>=rows.length;button.addEventListener('click',()=>{offset=next;paint();});controls.appendChild(button);}
      const count=document.createElement('span');count.textContent=` ${offset+1}–${Math.min(offset+pageSize,rows.length)} of ${rows.length}`;controls.appendChild(count);list.appendChild(controls);
    }
  };
  paint();
}

function renderDetailHero(host,{name,icon='',badge=null,description='',completed=null,total=null,unit=''}){
  if(!host)return;
  host.replaceChildren();
  host.classList.toggle('has-no-icon',!icon&&badge===null);
  if(badge!==null)host.appendChild(createRankBadge(badge,`${name} rank ${badge}`));
  else if(icon){const image=document.createElement('img');image.className='journey-record-detail-icon';image.src=icon;image.alt='';host.appendChild(image);}
  const copy=document.createElement('div');
  copy.className='journey-record-detail-copy';
  const heading=document.createElement('h4');
  heading.textContent=name;
  copy.appendChild(heading);
  if(description){const text=document.createElement('p');text.textContent=description;copy.appendChild(text);}
  const verified=completed!==null&&total!==null&&total>0;
  if(verified){
    const progress=document.createElement('div');
    progress.className='journey-record-progress';
    progress.innerHTML=`<span>${unit}</span><b>${numberFormatter.format(completed)} / ${numberFormatter.format(total)}</b>`;
    const track=document.createElement('div');
    track.className='journey-record-track';
    const fill=document.createElement('i');
    fill.className='journey-record-fill';
    fill.style.width=`${Math.max(0,Math.min(total,completed))/total*100}%`;
    track.appendChild(fill);
    copy.append(progress,track);
  }
  host.appendChild(copy);
}

function normalizedProgressItem(item={},defaultUnit='OBJECTIVES'){
  const objectiveProgress=item?.objectiveProgress&&typeof item.objectiveProgress==='object'?item.objectiveProgress:{};
  const explicitCompleted=typeof item.completed==='number'?item.completed:null;
  let completed=finiteNumber(item.completedCount??item.completedObjectives??item.patternProgress??item.catalystProgress??objectiveProgress.progress??item.progressValue??explicitCompleted);
  let total=finiteNumber(item.totalCount??item.totalObjectives??item.patternTotal??item.catalystTotal??objectiveProgress.completionValue??item.completionValue??item.total);
  const complete=item.complete===true||item.completed===true||item.patternUnlocked===true||item.catalystComplete===true||objectiveProgress.complete===true;
  return {
    hash:item.recordHash??item.presentationNodeHash??item.metricHash??item.trackerHash??item.itemHash??item.hash,
    name:String(item.name||'').trim(),
    icon:bungieIconUrl(item.iconPath),
    description:String(item.description||'').trim(),
    completed,
    total,
    unit:String(item.unit||defaultUnit).trim().toUpperCase(),
    complete,
    crafted:item.crafted===true,
    gilded:item.gilded===true,
    value:item.value??(completed!==null&&!(total!==null&&total>0)?completed:null)
  };
}

function journeyRecordHookRows(payload,view){
  const source=view==='titles'?payload?.journeyRecordOverview?.titles:view==='badges'?payload?.journeyRecordOverview?.badges:payload?.journeyRecordOverview?.triumphCategories;
  if(!Array.isArray(source))return null;
  return source.map(item=>{
    if(view==='titles'||view==='badges'){
      const requirements=Array.isArray(item?.requirements)?item.requirements.map(row=>normalizedProgressItem(row,'OBJECTIVES')).filter(row=>row.name):[];
      const usesRequirements=item?.completedRequirements!==undefined||item?.totalRequirements!==undefined||requirements.length>0;
      const completed=finiteNumber(item?.completedRequirements??item?.completedActivities);
      const total=finiteNumber(item?.totalRequirements??item?.totalActivities);
      return {
        hash:item?.presentationNodeHash,
        name:String(view==='badges'?(item?.badgeName||item?.name||''):(item?.titleName||item?.name||'')).trim(),
        detailName:String(item?.collectionName||item?.name||item?.titleName||'').trim(),
        icon:bungieIconUrl(item?.iconPath),
        description:String(item?.description||'').trim(),
        completed:completed??(requirements.length?requirements.filter(row=>row.complete).length:null),
        total:total??(requirements.length?requirements.length:null),
        unit:usesRequirements?'TITLE REQUIREMENTS':'ACTIVITIES',
        gilded:item?.gilded===true,
        requirements
      };
    }
    const subcategories=Array.isArray(item?.subcategories)?item.subcategories.map(section=>({
      hash:section?.presentationNodeHash??section?.hash,
      name:String(section?.name||'').trim(),
      icon:bungieIconUrl(section?.iconPath),
      completed:finiteNumber(section?.completedTriumphs),
      total:finiteNumber(section?.totalTriumphs),
      items:(section?.triumphs||section?.records||section?.items||[]).map(row=>normalizedProgressItem(row,'TRIUMPHS')).filter(row=>row.name)
    })).filter(section=>section.name):[];
    const direct=(item?.triumphs||item?.records||[]).map(row=>normalizedProgressItem(row,'TRIUMPHS')).filter(row=>row.name);
    return {
      hash:item?.presentationNodeHash,
      name:String(item?.name||'').trim(),
      icon:bungieIconUrl(item?.iconPath),
      description:String(item?.description||'').trim(),
      completed:finiteNumber(item?.completedTriumphs),
      total:finiteNumber(item?.totalTriumphs),
      unit:'TRIUMPHS',
      subcategories:subcategories.length?subcategories:(direct.length?[{name:String(item?.name||'Triumphs'),items:direct}]:[])
    };
  }).filter(item=>item.hash!==null&&item.hash!==undefined&&item.name).sort((left,right)=>left.name.localeCompare(right.name));
}

function renderSubmenu(host,sections,onSelect){
  if(!host)return;
  host.replaceChildren();
  const fragment=document.createDocumentFragment();
  sections.forEach((section,index)=>{
    const button=document.createElement('button');
    button.type='button';
    button.textContent=section.name;
    button.setAttribute('aria-current',String(index===0));
    button.addEventListener('click',()=>{
      host.querySelectorAll('button').forEach(item=>item.setAttribute('aria-current',String(item===button)));
      onSelect(section);
    });
    fragment.appendChild(button);
  });
  host.appendChild(fragment);
  if(sections[0])onSelect(sections[0]);
}

function renderRecordTypes(host,types,onSelect){
  if(!host)return;
  host.replaceChildren();
  const fragment=document.createDocumentFragment();
  types.forEach((type,index)=>{
    const button=document.createElement('button');
    button.type='button';
    button.setAttribute('role','tab');
    button.setAttribute('aria-label',type.name);
    button.setAttribute('aria-current',String(index===0));
    button.setAttribute('aria-selected',String(index===0));
    if(type.icon){const image=document.createElement('img');image.src=type.icon;image.alt='';button.appendChild(image);}
    const label=document.createElement('span');
    label.textContent=type.shortName||type.name;
    button.appendChild(label);
    const counts=[];
    if(type.completed!==null&&type.total!==null&&type.total>0)counts.push(`${numberFormatter.format(type.completed)} / ${numberFormatter.format(type.total)}`);
    if(type.craftedCount!==null)counts.push(`${numberFormatter.format(type.craftedCount)} CRAFTED`);
    if(counts.length){const status=document.createElement('small');status.textContent=counts.join(' · ');button.appendChild(status);}
    button.addEventListener('click',()=>{
      host.querySelectorAll('button').forEach(item=>{const selected=item===button;item.setAttribute('aria-current',String(selected));item.setAttribute('aria-selected',String(selected));});
      onSelect(type);
    });
    fragment.appendChild(button);
  });
  host.appendChild(fragment);
  if(types[0])onSelect(types[0]);
}

function recordRootView(view){
  if(view==='title-detail')return selectedTitleKind;
  if(view==='triumph-detail')return 'triumphs';
  if(view==='records-detail')return 'records';
  return view;
}

function activateRecordView(view){
  activeRecordView=view;
  recordsPanel?.querySelectorAll('[data-journey-record-view]').forEach(group=>group.hidden=group.dataset.journeyRecordView!==view);
  const root=recordRootView(view);
  const headings={titles:'Titles',badges:'Badges',triumphs:'Triumphs','guardian-rank':'Guardian Rank',records:'Records'};
  if(focusHeading)focusHeading.textContent=headings[root]||'Guardian Records';
  if(focusStatus)focusStatus.textContent='VERIFIED BUNGIE RECORDS';
  if(recordsBack)recordsBack.textContent=view==='title-detail'?selectedTitleKind==='badges'?'Back to Badges':'Back to Titles':view==='triumph-detail'?'Back to Triumph Categories':view==='records-detail'?'Back to Records':'Back to Destination';
  setRecordSelectorState(root);
}

function showTitleDetail(title,kind='titles'){
  selectedTitle=title;
  selectedTitleKind=kind;
  activateRecordView('title-detail');
  const isBadge=kind==='badges';
  const label=isBadge?'BADGE':'TITLE';
  if(titleRequirementsHeading)titleRequirementsHeading.textContent=isBadge?'Badge Requirements':'Title Requirements';
  const detailName=title.detailName||title.name;
  const description=[title.description,title.name!==detailName?`${label} · ${title.name}`:''].filter(Boolean).join(' · ');
  renderDetailHero(titleDetailHero,{name:detailName,icon:title.icon,description,completed:title.completed,total:title.total,unit:`${label} PROGRESS`});
  if(Array.isArray(title.requirements)){renderJourneyRecordList(titleRequirementsList,title.requirements,`Verified requirements for this ${label.toLowerCase()} are not yet connected.`);return;}
  renderJourneyRecordList(titleRequirementsList,[],`Loading verified ${label.toLowerCase()} requirements.`);
  void (async()=>{
    const entries=title.requirementEntries||[];
    const recordDefinitions=await guardianManifest.getMany('DestinyRecordDefinition',entries.map(entry=>entry.recordHash));
    const objectiveHashes=Object.values(recordDefinitions).flatMap(definition=>definition?.objectiveHashes||[]);
    const objectiveDefinitions=await guardianManifest.getMany('DestinyObjectiveDefinition',objectiveHashes);
    const requirements=entries.map(entry=>titleRequirementRow(verifiedProfile,title.characterId,entry,recordDefinitions[String(entry.recordHash)],objectiveDefinitions)).filter(requirement=>requirement?.name);
    title.requirements=requirements;
    if(selectedTitle!==title)return;
    title.completed=requirements.filter(requirement=>requirement.complete).length;
    title.total=requirements.length;
    renderDetailHero(titleDetailHero,{name:detailName,icon:title.icon,description,completed:title.completed,total:title.total,unit:`${label} REQUIREMENTS`});
    renderJourneyRecordList(titleRequirementsList,requirements,`No verified requirements were returned for this ${label.toLowerCase()}.`);
  })();
}

function showBadgeDetail(badge){showTitleDetail(badge,'badges');}

function showTriumphDetail(category){
  selectedTriumphCategory=category;
  activateRecordView('triumph-detail');
  renderDetailHero(triumphDetailHero,{name:category.name,icon:category.icon,description:category.description,completed:category.completed,total:category.total,unit:'TRIUMPHS'});
  const renderSections=()=>{
    renderSubmenu(triumphSubcategories,category.subcategories||[],section=>{
      const requestId=++triumphSectionRequest;
      if(Array.isArray(section.items)){renderJourneyRecordList(triumphDetailList,section.items,'No verified Triumphs were returned for this subcategory.');return;}
      renderJourneyRecordList(triumphDetailList,[],'Loading verified Triumph records.');
      void (async()=>{
        const recordDefinitions=await guardianManifest.getMany('DestinyRecordDefinition',section.recordEntries.map(entry=>entry.recordHash));
        const objectiveDefinitions=await guardianManifest.getMany('DestinyObjectiveDefinition',Object.values(recordDefinitions).flatMap(definition=>definition?.objectiveHashes||[]));
        section.items=section.recordEntries.map(entry=>{
          const definition=recordDefinitions[String(entry.recordHash)];
          const row=titleRequirementRow(verifiedProfile,category.characterId,entry,definition,objectiveDefinitions);
          const state=finiteNumber(titleRecordFor(verifiedProfile,category.characterId,entry.recordHash)?.state);
          const score=finiteNumber(definition?.completionInfo?.ScoreValue);
          return row?{...row,unit:score===null?'':'TRIUMPH SCORE',value:score,claimed:state!==null&&(state&1)===1}:null;
        }).filter(item=>item?.name);
        if(selectedTriumphCategory===category&&requestId===triumphSectionRequest)renderJourneyRecordList(triumphDetailList,section.items,'No verified Triumphs were returned for this subcategory.');
      })();
    });
    if(!(category.subcategories||[]).length)renderJourneyRecordList(triumphDetailList,[],'No verified Triumph subcategories were returned.');
  };
  if(Array.isArray(category.subcategories)){renderSections();return;}
  triumphSubcategories?.replaceChildren();
  renderJourneyRecordList(triumphDetailList,[],'Loading verified Triumph subcategories.');
  void (async()=>{
    const sections=[];
    const seen=new Set();
    let pending=(category.nodeEntries||[]).map(entry=>({entry,path:[]}));
    while(pending.length){
      const level=pending;
      pending=[];
      const definitions=await guardianManifest.getMany('DestinyPresentationNodeDefinition',level.map(item=>item.entry.presentationNodeHash));
      level.sort((left,right)=>Number(left.entry?.nodeDisplayPriority||0)-Number(right.entry?.nodeDisplayPriority||0)).forEach(item=>{
        const hash=String(item.entry?.presentationNodeHash||'');
        if(!hash||seen.has(hash))return;
        seen.add(hash);
        const definition=definitions[hash];
        const name=String(definition?.displayProperties?.name||'').trim();
        if(!definition||!name)return;
        const path=[...item.path,name];
        const recordEntries=(definition?.children?.records||[]).slice().sort((left,right)=>Number(left?.nodeDisplayPriority||0)-Number(right?.nodeDisplayPriority||0));
        if(recordEntries.length){const node=category.nodes?.[hash];sections.push({hash,name:path.join(' · '),icon:bungiePresentationIcon(definition),completed:finiteNumber(node?.progressValue),total:finiteNumber(node?.completionValue),recordEntries,items:null});}
        pending.push(...(definition?.children?.presentationNodes||[]).map(entry=>({entry,path})));
      });
    }
    category.subcategories=sections;
    if(selectedTriumphCategory===category)renderSections();
  })();
}

async function bindTitleTriumphPanel(payload,view=recordRootView(activeRecordView)){
  const requestId=++titleTriumphRequest;
  const isTitleCollection=view==='titles'||view==='badges';
  const titleCollectionList=view==='badges'?badgesList:titlesList;
  const titleCollectionLabel=view==='badges'?'BADGES':'TITLES';
  const titleCollectionSelect=view==='badges'?showBadgeDetail:showTitleDetail;
  if(recordsStatus)recordsStatus.textContent='LOADING VERIFIED BUNGIE DEFINITIONS';
  const hookedRows=isTitleCollection?null:journeyRecordHookRows(payload,view);
  if(hookedRows){
    renderJourneyRecordList(isTitleCollection?titleCollectionList:triumphCategoriesList,hookedRows,isTitleCollection?`No verified Destiny ${titleCollectionLabel.toLowerCase()} were returned.`:'No verified Triumph category rows were returned.',isTitleCollection?titleCollectionSelect:showTriumphDetail);
    if(recordsStatus)recordsStatus.textContent=isTitleCollection?`${hookedRows.length} ${titleCollectionLabel}`:`${hookedRows.length} TRIUMPH CATEGORIES`;
    return;
  }
  const nodes=payload?.profile?.profilePresentationNodes?.data?.nodes||{};
  const characters=payload?.profile?.characters?.data||{};
  const character=characters[selectedCharacterId]||Object.values(characters).sort((left,right)=>String(right?.dateLastPlayed||'').localeCompare(String(left?.dateLastPlayed||'')))[0];
  const characterId=String(character?.characterId||'');
  if(view==='badges'){
    try{
      const result=await resolveCollectionBadges(payload,guardianManifest,characterId);
      if(requestId!==titleTriumphRequest)return;
      payload.journeyBadgeCoverage=result.coverage;
      renderJourneyRecordList(badgesList,result.badges,'Collection badges are unavailable in the current Bungie response.',showBadgeDetail);
      if(recordsStatus)recordsStatus.textContent=result.coverage.complete?`${result.badges.length} VERIFIED COLLECTION BADGES`:'COLLECTION BADGES · SOME BUNGIE DATA IS UNAVAILABLE';
    }catch(error){
      if(requestId!==titleTriumphRequest)return;
      renderJourneyRecordList(badgesList,[],'Collection badges could not be loaded. Reopen Badges to retry.');
      if(recordsStatus)recordsStatus.textContent='COLLECTION BADGES UNAVAILABLE';
    }
    return;
  }
  if(isTitleCollection){
    let profileTitles=[];
    try{profileTitles=await resolvedProfileTitleCollection(payload,character,view);}
    catch(error){console.info('[Forge Journey] profile title nodes unavailable',error);}
    if(requestId!==titleTriumphRequest)return;
    if(profileTitles.length){
      renderJourneyRecordList(titleCollectionList,profileTitles,`No verified Destiny ${titleCollectionLabel.toLowerCase()} were returned in the profile nodes.`,titleCollectionSelect);
      if(recordsStatus){
        const earned=view==='titles'?profileTitles.filter(title=>title.earned).length:null;
        recordsStatus.textContent=view==='titles'?`${profileTitles.length} VERIFIED TITLES · ${earned} EARNED · SYNCING COMPLETE CATALOGUE`:`${profileTitles.length} VERIFIED ${titleCollectionLabel} · SYNCING COMPLETE CATALOGUE`;
      }
    }
    let titles=[];
    try{titles=await resolvedTitleCollection(payload,character,view);}
    catch(error){console.info('[Forge Journey] title collection unavailable',error);}
    if(requestId!==titleTriumphRequest)return;
    renderJourneyRecordList(titleCollectionList,titles,`No Destiny ${titleCollectionLabel.toLowerCase()} definitions were returned from the verified Bungie seal catalogue.`,titleCollectionSelect);
    if(recordsStatus){
      const earned=view==='titles'?titles.filter(title=>title.earned).length:null;
      recordsStatus.textContent=view==='titles'?`${titles.length} TITLES · ${earned} EARNED`:`${titles.length} ${titleCollectionLabel}`;
    }
    return;
  }
  if(!Object.keys(nodes).length){
    renderJourneyRecordList(triumphCategoriesList,[],'Triumph presentation nodes are not present in the verified profile response.');
    if(recordsStatus)recordsStatus.textContent='VERIFIED RECORD DATA UNAVAILABLE';
    return;
  }
  await manifestReady;
  const tree=await recordPresentationTree(payload);
  const currentTriumph=tree?.triumphs;
  const currentTriumphDefinition=currentTriumph?.definition;
  const categoryEntries=currentTriumphDefinition?.children?.presentationNodes||[];
  const categoryDefinitions=await guardianManifest.getMany('DestinyPresentationNodeDefinition',categoryEntries.map(entry=>entry.presentationNodeHash));
  const categories=(currentTriumphDefinition?.children?.presentationNodes||[]).map(entry=>{
    const hash=String(entry.presentationNodeHash);
    const definition=categoryDefinitions[hash];
    const node=nodes[hash];
    const state=finiteNumber(node?.state);
    return state!==null&&(state&1)===1?null:{hash,name:String(definition?.displayProperties?.name||'').trim(),icon:bungiePresentationIcon(definition),description:String(definition?.displayProperties?.description||''),completed:finiteNumber(node?.progressValue),total:finiteNumber(node?.completionValue),unit:'TRIUMPHS',subcategories:null,nodeEntries:definition?.children?.presentationNodes||[],nodes,characterId};
  }).filter(item=>item?.name);
  if(requestId!==titleTriumphRequest)return;
  renderJourneyRecordList(triumphCategoriesList,categories,'No Triumph category presentation nodes were returned for this profile.',showTriumphDetail);
  if(recordsStatus)recordsStatus.textContent=`${categories.length} TRIUMPH CATEGORIES`;
}

function guardianRankRows(payload){
  const hook=payload?.journeyRecordOverview?.guardianRank||{};
  const profileRank=finiteNumber(payload?.profile?.profile?.data?.currentGuardianRank);
  const currentRank=finiteNumber(hook.currentRank)??profileRank;
  const supplied=Array.isArray(hook.ranks)?hook.ranks:[];
  const byRank=new Map(supplied.map(item=>[Number(item?.rank),item]));
  return {currentRank,currentRankName:String(hook.currentRankName||'').trim(),nextRank:finiteNumber(hook.nextRank),ranks:Array.from({length:11},(_,index)=>{
    const rank=index+1;
    const item=byRank.get(rank)||{};
    return {rank,name:String(item.name||`Rank ${rank}`).trim(),icon:bungieIconUrl(item.iconPath),description:String(item.description||'').trim(),completed:finiteNumber(item.completedObjectives),total:finiteNumber(item.totalObjectives),objectives:(item.objectives||[]).map(row=>normalizedProgressItem(row,'OBJECTIVES')).filter(row=>row.name)};
  })};
}

async function bindGuardianRankPanel(payload){
  const requestId=++guardianRankRequest;
  guardianRankObjectiveRequest+=1;
  let data=guardianRankRows(payload);
  if(!Array.isArray(payload?.journeyRecordOverview?.guardianRank?.ranks)){
    if(recordsStatus)recordsStatus.textContent='LOADING VERIFIED GUARDIAN RANKS';
    await manifestReady;
    const constants=await guardianManifest.getAsync('DestinyGuardianRankConstantsDefinition',1);
    const rankHashes=(constants?.guardianRankHashes||[]).slice(0,finiteNumber(constants?.rankCount)??11);
    const rankDefinitions=await guardianManifest.getMany('DestinyGuardianRankDefinition',rankHashes);
    const presentationDefinitions=await guardianManifest.getMany('DestinyPresentationNodeDefinition',rankHashes.map(hash=>rankDefinitions[String(hash)]?.presentationNodeHash));
    const nodes=payload?.profile?.profilePresentationNodes?.data?.nodes||{};
    const characters=payload?.profile?.characters?.data||{};
    const character=characters[selectedCharacterId]||Object.values(characters).sort((left,right)=>String(right?.dateLastPlayed||'').localeCompare(String(left?.dateLastPlayed||'')))[0];
    const characterId=String(character?.characterId||'');
    const currentRank=finiteNumber(payload?.profile?.profile?.data?.currentGuardianRank);
    const ranks=rankHashes.map((hash,index)=>{
      const definition=rankDefinitions[String(hash)];
      const rank=finiteNumber(definition?.rankNumber)??index+1;
      const presentationHash=String(definition?.presentationNodeHash||'');
      const presentation=presentationDefinitions[presentationHash];
      const node=nodes[presentationHash];
      return {rank,name:String(definition?.displayProperties?.name||`Rank ${rank}`).trim(),icon:bungiePresentationIcon(definition),description:String(definition?.displayProperties?.description||'').trim(),completed:finiteNumber(node?.progressValue),total:finiteNumber(node?.completionValue),objectives:null,nodeEntries:presentation?.children?.presentationNodes||[],characterId,nodes};
    });
    if(ranks.length)data={currentRank,currentRankName:ranks.find(item=>item.rank===currentRank)?.name||'',nextRank:currentRank===null?null:Math.min(ranks.length,currentRank+1),ranks};
  }
  if(requestId!==guardianRankRequest)return;
  const fallbackRank=data.currentRank===null?1:Math.min(11,Math.max(1,data.currentRank+1));
  const selected=data.ranks.find(item=>item.rank===(data.nextRank??fallbackRank))||data.ranks[0];
  guardianRankStrip?.replaceChildren();
  data.ranks.forEach(item=>{
    const button=document.createElement('button');
    button.type='button';
    button.textContent=String(item.rank);
    button.setAttribute('aria-current',String(item===selected));
    button.addEventListener('click',()=>{
      guardianRankStrip.querySelectorAll('button').forEach(row=>row.setAttribute('aria-current',String(row===button)));
      const next=data.currentRank===null?null:data.ranks.find(rank=>rank.rank===data.currentRank+1);
      const description=data.currentRank===null?'Current Guardian Rank unavailable':`CURRENT RANK ${data.currentRank}${data.currentRankName?` · ${data.currentRankName}`:''}${next?` · NEXT RANK ${next.rank} · ${next.name}`:' · MAXIMUM RANK'}`;
      renderDetailHero(guardianRankHero,{name:item.name,badge:item.rank,description,completed:item.completed,total:item.total,unit:'RANK PROGRESS'});
      const objectiveRequest=++guardianRankObjectiveRequest;
      if(Array.isArray(item.objectives)){renderJourneyRecordList(guardianRankObjectives,item.objectives,'No verified objectives were returned for this Guardian Rank.');return;}
      renderJourneyRecordList(guardianRankObjectives,[],'Loading verified Guardian Rank objectives.');
      void (async()=>{
        const sections=await presentationRecordCategories(item.nodeEntries,item.nodes,item.characterId,'guardian-rank');
        const recordEntries=sections.flatMap(section=>section.recordEntries);
        const recordDefinitions=await guardianManifest.getMany('DestinyRecordDefinition',recordEntries.map(entry=>entry.recordHash));
        const objectiveDefinitions=await guardianManifest.getMany('DestinyObjectiveDefinition',Object.values(recordDefinitions).flatMap(definition=>definition?.objectiveHashes||[]));
        item.objectives=sections.flatMap(section=>{
          const category={hash:section.key,name:section.name,icon:section.icon,completed:section.completed,total:section.total,unit:'CATEGORY PROGRESS',complete:section.completed!==null&&section.total!==null&&section.total>0&&section.completed>=section.total};
          const objectives=section.recordEntries.map(entry=>titleRequirementRow(payload,item.characterId,entry,recordDefinitions[String(entry.recordHash)],objectiveDefinitions)).filter(row=>row?.name);
          return [category,...objectives];
        });
        if(objectiveRequest===guardianRankObjectiveRequest)renderJourneyRecordList(guardianRankObjectives,item.objectives,'No verified objectives were returned for this Guardian Rank.');
      })();
    });
    guardianRankStrip?.appendChild(button);
  });
  guardianRankStrip?.querySelector('button[aria-current="true"]')?.click();
  if(recordsStatus)recordsStatus.textContent=data.currentRank===null?'GUARDIAN RANK DATA UNAVAILABLE':`CURRENT GUARDIAN RANK ${data.currentRank}`;
}

function recordCategoryKey(value){return String(value||'').trim().toLowerCase().replaceAll('&','and').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}

function patternsCatalystsTypes(source){
  const supplied=Array.isArray(source.types)?source.types:Array.isArray(source.categories)?source.categories:[];
  const byKey=new Map(supplied.map(type=>[recordCategoryKey(type?.key||type?.name),type]));
  return PATTERN_CATALYST_TYPE_DEFINITIONS.map(definition=>{
    const alternateKey=definition.key==='catalysts'?'exotic-catalysts':`${definition.key}-patterns`;
    const type=byKey.get(definition.key)||byKey.get(alternateKey)||byKey.get(recordCategoryKey(definition.name))||{};
    const suppliedCategories=Array.isArray(type.categories)?type.categories:Array.isArray(type.groups)?type.groups:[];
    const categoryByKey=new Map(suppliedCategories.map(category=>[recordCategoryKey(category?.key||category?.name),category]));
    const used=new Set();
    const categories=definition.categories.map(name=>{
      const key=recordCategoryKey(name);
      const category=categoryByKey.get(key)||{};
      used.add(key);
      return {key,name:String(category.name||name),items:(category.items||[]).map(item=>normalizedProgressItem(item,definition.key==='catalysts'?'CATALYST PROGRESS':'PATTERN PROGRESS')).filter(item=>item.name)};
    });
    suppliedCategories.forEach(category=>{
      const key=recordCategoryKey(category?.key||category?.name);
      if(!key||used.has(key)||!String(category?.name||'').trim())return;
      categories.push({key,name:String(category.name).trim(),items:(category.items||[]).map(item=>normalizedProgressItem(item,definition.key==='catalysts'?'CATALYST PROGRESS':'PATTERN PROGRESS')).filter(item=>item.name)});
    });
    return {key:definition.key,name:String(type.name||definition.name),shortName:String(type.shortName||definition.shortName),icon:bungieIconUrl(type.iconPath),completed:finiteNumber(type.completed??type.unlockedPatterns??type.completedCatalysts),total:finiteNumber(type.total??type.totalPatterns??type.totalCatalysts),craftedCount:finiteNumber(type.craftedCount),categories};
  });
}

function recordsFrameworkSections(payload){
  const supplied=payload?.journeyRecordOverview?.records?.sections;
  const byKey=new Map((Array.isArray(supplied)?supplied:[]).map(section=>[String(section?.key||''),section]));
  return RECORD_SECTION_DEFINITIONS.map(definition=>{
    const source=byKey.get(definition.key)||{};
    const completed=finiteNumber(source.completed);
    const total=finiteNumber(source.total);
    const sourceCategories=Array.isArray(source.categories)?source.categories:[];
    const hasVerifiedData=source.available===true||completed!==null||total!==null||sourceCategories.some(category=>[category?.allItems,category?.all?.items,category?.all,category?.items].some(items=>Array.isArray(items)&&items.length));
    if(definition.optional&&!hasVerifiedData)return null;
    let categories=definition.key==='patterns-catalysts'?[]:sourceCategories.map(category=>{
      const allItems=Array.isArray(category?.allItems)?category.allItems:Array.isArray(category?.all?.items)?category.all.items:Array.isArray(category?.all)?category.all:Array.isArray(category?.items)?category.items:[];
      const rows=(definition.key==='stat-trackers'?allItems:category?.items||[]).map(item=>{
        const row=normalizedProgressItem(item,definition.key==='stat-trackers'?'TRACKER VALUE':'PROGRESS');
        return row;
      }).filter(item=>item.name);
      return {key:String(category?.key||category?.name||''),name:String(category?.name||'').trim(),items:rows};
    }).filter(category=>category.name);
    return {key:definition.key,name:String(source.name||definition.name),description:String(source.description||definition.description),icon:bungieIconUrl(source.iconPath),completed,total,unit:completed!==null&&total!==null&&total>0?'RECORDS':'',categories,types:definition.key==='patterns-catalysts'?patternsCatalystsTypes(source):[]};
  }).filter(Boolean);
}

async function verifiedCraftablePatternTypes(payload,characterId){
  const components=payload?.profile?.characterCraftables?.data||{};
  let componentCharacterId=characterId;
  let component=components[componentCharacterId];
  if(!component){
    const fallback=Object.entries(components).find(([,item])=>finiteNumber(item?.craftingRootNodeHash)!==null);
    componentCharacterId=String(fallback?.[0]||'');
    component=fallback?.[1];
  }
  // Public pattern identity does not depend on private craftable instance state.
  const rootHash=finiteNumber(component?.craftingRootNodeHash)||3442838224;
  componentCharacterId=componentCharacterId||characterId;
  const nodes={
    ...(payload?.profile?.profilePresentationNodes?.data?.nodes||{}),
    ...(payload?.profile?.characterPresentationNodes?.data?.[componentCharacterId]?.nodes||{})
  };
  const tree=await presentationLeafCategories(rootHash,nodes,'records');
  if(!tree)return null;
  const entries=tree.sections.flatMap(section=>section.entries);
  const recordDefinitions=await guardianManifest.getMany('DestinyRecordDefinition',entries.map(entry=>entry.recordHash));
  const objectiveDefinitions=await guardianManifest.getMany('DestinyObjectiveDefinition',Object.values(recordDefinitions).flatMap(definition=>definition?.objectiveHashes||[]));
  const types=new Map(PATTERN_CATALYST_TYPE_DEFINITIONS.filter(type=>type.key!=='catalysts').map(type=>[type.key,{key:type.key,icon:'',categories:new Map(),completed:0,total:0}]));
  tree.sections.forEach(section=>{
    const categoryName=String(section.path.at(-1)||section.name||'').trim();
    const type=types.get(patternTypeKey(section.path));
    if(!categoryName||!type)return;
    section.entries.forEach(entry=>{
      const hash=finiteNumber(entry?.recordHash);
      if(hash===null)return;
      const definition=recordDefinitions[String(hash)];
      const row=titleRequirementRow(payload,componentCharacterId,entry,definition,objectiveDefinitions);
      if(!row?.name)return;
      const categoryKey=recordCategoryKey(categoryName);
      if(!type.categories.has(categoryKey))type.categories.set(categoryKey,{key:categoryKey,name:categoryName,icon:section.icon,items:[]});
      type.categories.get(categoryKey).items.push({
        ...row,
        unit:'PATTERN PROGRESS',
        value:row.complete===null?'PROGRESS UNAVAILABLE':row.complete?'UNLOCKED':'INCOMPLETE'
      });
      if(!type.icon)type.icon=section.icon;
      type.total+=1;
      if(row.complete===null)type.unknown=true;
      if(row.complete)type.completed+=1;
    });
  });
  return [...types.values()].map(type=>({...type,total:type.total||null,completed:type.total&&!type.unknown?type.completed:null,categories:[...type.categories.values()]}));
}

function mergeVerifiedPatternTypes(section,verifiedTypes){
  if(!section||!Array.isArray(verifiedTypes))return;
  verifiedTypes.forEach(verified=>{
    const type=section.types?.find(item=>item.key===verified.key);
    if(!type)return;
    const categories=new Map((type.categories||[]).map(category=>[recordCategoryKey(category.key||category.name),category]));
    verified.categories.forEach(category=>{
      const key=recordCategoryKey(category.key||category.name);
      const existing=categories.get(key);
      if(existing){
        const rows=new Map((existing.items||[]).map(item=>[String(item.hash),item]));
        category.items.forEach(item=>rows.set(String(item.hash),item));
        existing.items=[...rows.values()];
      }else{
        type.categories.push(category);
        categories.set(key,category);
      }
    });
    if(verified.icon)type.icon=verified.icon;
    type.completed=verified.completed;
    type.total=verified.total;
  });
  const counted=(section.types||[]).filter(type=>type.completed!==null&&type.total!==null&&type.total>0);
  if(counted.length){section.completed=counted.reduce((total,type)=>total+type.completed,0);section.total=counted.reduce((total,type)=>total+type.total,0);}
}

async function verifiedStatTrackerSection(payload){
  const component=payload?.profile?.metrics?.data;
  const metrics=component?.metrics;
  const rootHash=finiteNumber(component?.metricsRootNodeHash);
  if(rootHash===null||!metrics||typeof metrics!=='object')return null;
  const nodes=payload?.profile?.profilePresentationNodes?.data?.nodes||{};
  const tree=await presentationLeafCategories(rootHash,nodes,'metrics');
  if(!tree)return null;
  const metricEntries=tree.sections.flatMap(section=>section.entries);
  const metricDefinitions=await guardianManifest.getMany('DestinyMetricDefinition',metricEntries.map(entry=>entry.metricHash));
  const objectiveDefinitions=await guardianManifest.getMany('DestinyObjectiveDefinition',Object.values(metricDefinitions).map(definition=>definition?.trackingObjectiveHash));
  const groups=new Map();
  tree.sections.forEach(section=>{
    const rows=section.entries.map(entry=>{
      const hash=finiteNumber(entry?.metricHash);
      if(hash===null)return null;
      const state=metrics[String(hash)];
      const definition=metricDefinitions[String(hash)];
      const progress=state?.objectiveProgress;
      const current=finiteNumber(progress?.progress);
      const total=finiteNumber(progress?.completionValue);
      const name=String(definition?.displayProperties?.name||'').trim();
      if(!state||state.invisible===true||!definition||definition.redacted===true||current===null||!name)return null;
      const objective=objectiveDefinitions[String(definition?.trackingObjectiveHash||'')];
      const hasThreshold=total!==null&&total>0;
      const lifetimeExceedsThreshold=hasThreshold&&current>total;
      return {
        hash,
        name,
        icon:bungiePresentationIcon(definition),
        description:String(definition?.displayProperties?.description||objective?.progressDescription||'').trim(),
        completed:hasThreshold&&!lifetimeExceedsThreshold?current:null,
        total:hasThreshold&&!lifetimeExceedsThreshold?total:null,
        threshold:lifetimeExceedsThreshold?total:null,
        unit:lifetimeExceedsThreshold||!hasThreshold?'TRACKER VALUE':'TRACKER PROGRESS',
        value:lifetimeExceedsThreshold||!hasThreshold?current:null,
        complete:progress?.complete===true,
        gilded:false
      };
    }).filter(Boolean);
    if(!rows.length)return;
    const groupName=String(section.path[0]||section.name).trim();
    const groupKey=recordCategoryKey(groupName);
    if(!groups.has(groupKey))groups.set(groupKey,{key:groupKey,name:groupName,all:new Map(),leaves:[]});
    const group=groups.get(groupKey);
    rows.forEach(row=>group.all.set(String(row.hash),row));
    group.leaves.push({key:section.key,name:section.name,items:rows});
  });
  const categories=[];
  groups.forEach(group=>{
    categories.push({key:`${group.key}-all`,name:`${group.name} · ALL`,items:[...group.all.values()]});
    if(group.leaves.length>1||group.leaves[0]?.name!==group.name)categories.push(...group.leaves);
  });
  if(!categories.length)return null;
  return {
    icon:tree.root.icon,
    completed:finiteNumber(tree.root.node?.progressValue),
    total:finiteNumber(tree.root.node?.completionValue),
    categories
  };
}

function showRecordsDetail(section){
  if(section.load&&!section.loaded){
    selectedRecordSection=section;
    activateRecordView('records-detail');
    renderDetailHero(recordsDetailHero,{name:section.name,description:section.description});
    recordsSubcategories?.replaceChildren();recordsTypes?.replaceChildren();
    renderJourneyRecordList(recordsDetailList,[],'Loading records…');
    if(!section.loading)section.loading=section.load().then(()=>{section.loaded=true;}).finally(()=>{section.loading=null;});
    void section.loading.then(()=>{if(selectedRecordSection===section)showRecordsDetail(section);}).catch(()=>{if(selectedRecordSection===section)renderJourneyRecordList(recordsDetailList,[],'Records could not be loaded. Select this section to retry.');});
    return;
  }
  selectedRecordSection=section;
  activateRecordView('records-detail');
  renderDetailHero(recordsDetailHero,{name:section.name,icon:section.icon,description:section.description,completed:section.completed,total:section.total,unit:'SECTION PROGRESS'});
  const renderCategory=(category,emptyText)=>{
    const requestId=++recordsCategoryRequest;
    if(Array.isArray(category.items)){renderJourneyRecordList(recordsDetailList,category.items,emptyText);return;}
    renderJourneyRecordList(recordsDetailList,[],'Loading verified Bungie records.');
    void (async()=>{
      const recordDefinitions=await guardianManifest.getMany('DestinyRecordDefinition',category.recordEntries.map(entry=>entry.recordHash));
      const objectiveDefinitions=await guardianManifest.getMany('DestinyObjectiveDefinition',Object.values(recordDefinitions).flatMap(definition=>definition?.objectiveHashes||[]));
      category.items=category.recordEntries.map(entry=>{
        const definition=recordDefinitions[String(entry.recordHash)];
        const row=titleRequirementRow(verifiedProfile,category.characterId,entry,definition,objectiveDefinitions);
        const component=titleRecordFor(verifiedProfile,category.characterId,entry.recordHash);
        const earned=category.recordKind==='medals'?finiteNumber(component?.completedCount):null;
        return row?{...row,unit:earned===null?'':'EARNED',value:earned}:null;
      }).filter(item=>item?.name);
      if(selectedRecordSection===section&&requestId===recordsCategoryRequest)renderJourneyRecordList(recordsDetailList,category.items,emptyText);
    })();
  };
  const patternsCatalysts=section.key==='patterns-catalysts';
  recordsDetailGroup?.classList.toggle('is-patterns-catalysts',patternsCatalysts);
  if(recordsTypes)recordsTypes.hidden=!patternsCatalysts;
  if(patternsCatalysts){
    renderRecordTypes(recordsTypes,section.types||[],type=>{
      if(recordsDetailHeading)recordsDetailHeading.textContent=type.name;
      renderSubmenu(recordsSubcategories,type.categories||[],category=>renderCategory(category,type.key==='catalysts'?'No verified catalyst records were returned for this weapon group.':'No patterns for this weapon type were returned in the Bungie catalogue.'));
    });
    return;
  }
  recordsTypes?.replaceChildren();
  if(recordsDetailHeading)recordsDetailHeading.textContent='Record Categories';
  renderSubmenu(recordsSubcategories,section.categories||[],category=>{
    renderCategory(category,section.key==='stat-trackers'?'Verified Stat Trackers for this category are not yet connected.':'No verified records were returned for this category.');
  });
  if(!(section.categories||[]).length)renderJourneyRecordList(recordsDetailList,[],'Verified Record categories are not yet connected.');
}

async function bindRecordsPanel(payload){
  const panelRequest=++recordsPanelRequest;
  let sections=recordsFrameworkSections(payload);
  const nodes=payload?.profile?.profilePresentationNodes?.data?.nodes;
  if(!Array.isArray(payload?.journeyRecordOverview?.records?.sections)&&nodes&&typeof nodes==='object'){
    if(recordsStatus)recordsStatus.textContent='LOADING VERIFIED BUNGIE RECORDS';
    await manifestReady;
    const tree=await recordPresentationTree(payload);
    const characters=payload?.profile?.characters?.data||{};
    const character=characters[selectedCharacterId]||Object.values(characters).sort((left,right)=>String(right?.dateLastPlayed||'').localeCompare(String(left?.dateLastPlayed||'')))[0];
    const characterId=String(character?.characterId||'');
    if(tree){
      for(const [sectionKey,rootName,recordKind] of [['medals','Medals','medals'],['lore','Lore','lore'],['patterns-catalysts','Exotic Catalysts','catalysts']]){
        const root=tree.roots.find(item=>recordCategoryKey(item.definition?.displayProperties?.name)===recordCategoryKey(rootName));
        const current=await currentRecordBranch(root,tree.nodes);
        const currentDefinition=current?.definition;
        if(!currentDefinition)continue;
        const categories=await presentationRecordCategories(currentDefinition?.children?.presentationNodes||[],nodes,characterId,recordKind);
        const currentNode=current?.node;
        let section=sections.find(item=>item.key===sectionKey);
        if(sectionKey==='lore'&&categories.length){
          const definition=RECORD_SECTION_DEFINITIONS.find(item=>item.key==='lore');
          section={...definition,icon:bungiePresentationIcon(currentDefinition),completed:finiteNumber(currentNode?.progressValue),total:finiteNumber(currentNode?.completionValue),unit:'',categories};
          sections.splice(Math.min(2,sections.length),0,section);
        }
        if(sectionKey==='patterns-catalysts'){
          const catalysts=section?.types?.find(type=>type.key==='catalysts');
          if(catalysts)Object.assign(catalysts,{icon:bungiePresentationIcon(currentDefinition),completed:finiteNumber(currentNode?.progressValue),total:finiteNumber(currentNode?.completionValue),categories});
        }else if(section&&sectionKey!=='lore')Object.assign(section,{icon:bungiePresentationIcon(currentDefinition),completed:finiteNumber(currentNode?.progressValue),total:finiteNumber(currentNode?.completionValue),categories});
      }
    }
  }
  const characterId=String(journeyCharacterFor(payload)?.characterId||'');
  const [patternTypes,statTrackers]=[null,null];
  for(const section of sections){
    if(section.key==='patterns-catalysts')section.load=async()=>mergeVerifiedPatternTypes(section,await verifiedCraftablePatternTypes(payload,characterId));
    if(section.key==='stat-trackers')section.load=async()=>Object.assign(section,await verifiedStatTrackerSection(payload)||{});
  }
  mergeVerifiedPatternTypes(sections.find(section=>section.key==='patterns-catalysts'),patternTypes);
  const statTrackerSection=sections.find(section=>section.key==='stat-trackers');
  if(statTrackerSection&&statTrackers)Object.assign(statTrackerSection,statTrackers);
  if(panelRequest!==recordsPanelRequest||activeRecordView!=='records')return;
  renderJourneyRecordList(recordsSections,sections,'Record sections are unavailable.',showRecordsDetail);
  if(recordsStatus)recordsStatus.textContent=`${sections.length} RECORD SECTIONS${sections.some(section=>section.key==='lore')?'':' · LORE AWAITING VERIFIED DATA'}`;
}

function setRecordSelectorState(view){
  [[titlesOpen,'titles'],[badgesOpen,'badges'],[triumphsOpen,'triumphs'],[guardianRankOpen,'guardian-rank'],[recordsOpen,'records']].forEach(([button,key])=>{
    if(!button)return;
    const selected=view===key;
    button.setAttribute('aria-current',String(selected));
    button.setAttribute('aria-expanded',String(selected));
  });
  locationSelector?.querySelectorAll('.apx-loc[data-loc]').forEach(button=>button.setAttribute('aria-current','false'));
}

function showGuardianRecordPanel(view){
  if(!destinationDetail||!recordsPanel||!['titles','badges','triumphs','guardian-rank','records'].includes(view))return;
  const destinationHeight=Math.ceil(destinationDetail.getBoundingClientRect().height);
  if(destinationHeight>0)recordsPanel.style.height=`${destinationHeight}px`;
  destinationDetail.hidden=true;
  recordsPanel.hidden=false;
  selectedRecordSection=null;selectedTriumphCategory=null;recordsPanelRequest+=1;
  activateRecordView(view);
  if(view==='titles'||view==='badges'||view==='triumphs'){
    if(verifiedProfile)void bindTitleTriumphPanel(verifiedProfile,view).catch(()=>{if(recordRootView(activeRecordView)===view){renderJourneyRecordList(view==='triumphs'?triumphCategoriesList:view==='badges'?badgesList:titlesList,[],'Records could not be loaded. Reopen this section to retry.');if(recordsStatus)recordsStatus.textContent='RECORDS UNAVAILABLE';}});
    else if(recordsStatus)recordsStatus.textContent='AWAITING VERIFIED BUNGIE RECORDS';
  }else if(view==='guardian-rank')void bindGuardianRankPanel(verifiedProfile||{});
  else void bindRecordsPanel(verifiedProfile||{}).catch(()=>{if(recordRootView(activeRecordView)==='records'){renderJourneyRecordList(recordsSections,[],'Records could not be loaded. Reopen Records to retry.');if(recordsStatus)recordsStatus.textContent='RECORDS UNAVAILABLE';}});
  recordsBack?.focus();
}

function handleRecordBack(){
  if(activeRecordView==='title-detail'){activateRecordView(selectedTitleKind);selectedTitle=null;return;}
  if(activeRecordView==='triumph-detail'){activateRecordView('triumphs');selectedTriumphCategory=null;return;}
  if(activeRecordView==='records-detail'){activateRecordView('records');selectedRecordSection=null;return;}
  showDestinationPanel();
}

function showDestinationPanel(returnFocus=true){
  const previousRoot=recordRootView(activeRecordView);
  selectedRecordSection=null;selectedTriumphCategory=null;recordsPanelRequest+=1;
  titleTriumphRequest+=1;
  if(!destinationDetail||!recordsPanel)return;
  recordsPanel.hidden=true;
  recordsPanel.style.removeProperty('height');
  destinationDetail.hidden=false;
  if(focusHeading)focusHeading.textContent='Destination focus';
  if(focusStatus)focusStatus.textContent='PERMANENT CENTRE';
  activeRecordView='';
  setRecordSelectorState('');
  const currentLocation=globalThis.ForgeDestinations?.current();
  locationSelector?.querySelector(`.apx-loc[data-loc="${currentLocation}"]`)?.setAttribute('aria-current','true');
  if(returnFocus)({titles:titlesOpen,badges:badgesOpen,triumphs:triumphsOpen,'guardian-rank':guardianRankOpen,records:recordsOpen}[previousRoot])?.focus();
}

function renderRecentActivity(activities=[]){
  const fallback=resetRecentActivity();
  if(!recentActivityCard||!activities.length)return;
  const list=document.createElement('div');
  list.dataset.journeyRecentList='';
  for(const activity of activities.slice(0,5)){
    const row=document.createElement('p');
    const period=typeof activity?.period==='string'&&activity.period?new Date(activity.period):null;
    const date=period&&!Number.isNaN(period.getTime())?activityDateFormatter.format(period):'DATE NOT RETURNED';
    const state=activity?.completed===null||activity?.completed===undefined?'COMPLETION NOT RETURNED':activity.completed?'COMPLETED':'NOT COMPLETED';
    row.textContent=`${String(activity?.activityName||'ACTIVITY NAME UNAVAILABLE').toLocaleUpperCase('en-GB')} · ${date} · ${state}`;
    list.appendChild(row);
  }
  if(fallback)fallback.hidden=true;
  recentActivityCard.appendChild(list);
}

const historicalValue=(mode,key)=>finiteNumber(mode?.allTime?.[key]?.basic?.value);

function resetMetric(element,text){
  if(!element)return;
  element.textContent='—';
  const card=element.closest('.mission-metric-card');
  const label=element.nextElementSibling;
  if(label)label.textContent=text;
  const tick=card?.querySelector('.mission-verified-tick');
  if(tick)tick.hidden=true;
}

function setMetric(element,value,label){
  if(!element)return;
  element.textContent=value;
  if(element.nextElementSibling)element.nextElementSibling.textContent=label;
  const tick=element.closest('.mission-metric-card')?.querySelector('.mission-verified-tick');
  if(tick)tick.hidden=false;
}

async function bindHistoricalStats(session,payload=verifiedProfile){
  resetMetric(metricActivities,'Awaiting live history');
  resetMetric(metricCompletion,'Awaiting completion evidence');
  resetMetric(metricPve,'Awaiting PVE evidence');
  resetMetric(metricPvp,'Awaiting PVP evidence');
  if(session?.authenticated!==true)return;
  try{
    const historical=payload?.preparedAccountData?.historicalStats;
    const results=historical?.Response?.mergedAllCharacters?.results
      ??historical?.response?.mergedAllCharacters?.results
      ??historical?.mergedAllCharacters?.results
      ??historical?.results;
    const pve=results?.allPvE;
    const pvp=results?.allPvP;
    const pveEntered=historicalValue(pve,'activitiesEntered');
    const pvpEntered=historicalValue(pvp,'activitiesEntered');
    const pveCleared=historicalValue(pve,'activitiesCleared');
    const pvpCleared=historicalValue(pvp,'activitiesCleared');
    const kd=historicalValue(pvp,'killsDeathsRatio');
    if(pveEntered!==null&&pvpEntered!==null)setMetric(metricActivities,numberFormatter.format(pveEntered+pvpEntered),'Verified career total');
    if(pveEntered!==null&&pveEntered>0&&pveCleared!==null)setMetric(metricCompletion,`${Math.round(pveCleared/pveEntered*100)}%`,'Verified PvE completion');
    if(pveCleared!==null)setMetric(metricPve,numberFormatter.format(pveCleared),'Verified career clears');
    if(kd!==null)setMetric(metricPvp,kd.toFixed(2),'Verified career K/D');
  }catch{}
}

function trendPath(values,maxValue){
  if(values.length<2||!Number.isFinite(maxValue)||maxValue<=0)return '';
  return values.map((value,index)=>{
    const x=18+(index/(values.length-1))*290;
    const y=134-(Math.max(0,Math.min(maxValue,value))/maxValue)*114;
    return `${index?'L':'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
}

function resetCurrentForm(){
  if(!trendChart||!trendEmpty)return;
  trendChart.querySelectorAll('.mission-chart-line').forEach(path=>path.setAttribute('d',''));
  trendChart.setAttribute('aria-label','No verified performance trend available');
  trendEmpty.hidden=false;
  const dates=trendChart.closest('.mission-current-form')?.querySelectorAll('.mission-chart-dates span');
  if(dates?.length===2){dates[0].textContent='—';dates[1].textContent='—';}
}

function renderCurrentForm(view){
  resetCurrentForm();
  if(!trendChart||!trendEmpty||!view)return;
  const pveSeries=Array.isArray(view?.trends?.pve)?view.trends.pve:[];
  const pvpSeries=Array.isArray(view?.trends?.pvp)?view.trends.pvp:[];
  const pvePath=trendPath(pveSeries.map(point=>point.value),100);
  const pvpValues=pvpSeries.map(point=>point.value);
  const pvpPath=trendPath(pvpValues,Math.max(1,...pvpValues));
  if(!pvePath&&!pvpPath)return;
  trendChart.querySelector('[data-journey-trend="pve"]')?.setAttribute('d',pvePath);
  trendChart.querySelector('[data-journey-trend="pvp"]')?.setAttribute('d',pvpPath);
  trendChart.setAttribute('aria-label','Verified 30-day PVE success and PVP K/D trends');
  trendEmpty.hidden=true;
  const dated=[...pveSeries,...pvpSeries].filter(point=>point?.date).sort((left,right)=>left.date.localeCompare(right.date));
  const dates=trendChart.closest('.mission-current-form')?.querySelectorAll('.mission-chart-dates span');
  if(dates?.length===2&&dated.length){
    dates[0].textContent=activityDateFormatter.format(new Date(`${dated[0].date}T00:00:00Z`));
    dates[1].textContent=activityDateFormatter.format(new Date(`${dated[dated.length-1].date}T00:00:00Z`));
  }
}

function resetEvidenceConfidence(){
  confidenceDonutValue?.setAttribute('stroke-dasharray','0 100');
  if(confidenceHighPercent)confidenceHighPercent.textContent='—';
  if(confidenceHigh)confidenceHigh.textContent='—';
  if(confidenceMedium)confidenceMedium.textContent='—';
  if(confidenceLow)confidenceLow.textContent='—';
  if(confidenceStatus)confidenceStatus.textContent='Confidence is calculated only from returned live activity fields.';
}

function renderEvidenceConfidence(confidence){
  resetEvidenceConfidence();
  if(!confidence)return;
  confidenceDonutValue?.setAttribute('stroke-dasharray',`${confidence.highPercent} ${100-confidence.highPercent}`);
  if(confidenceHighPercent)confidenceHighPercent.textContent=`${confidence.highPercent}%`;
  if(confidenceHigh)confidenceHigh.textContent=`${numberFormatter.format(confidence.high)} · ${confidence.highPercent}%`;
  if(confidenceMedium)confidenceMedium.textContent=`${numberFormatter.format(confidence.medium)} · ${confidence.mediumPercent}%`;
  if(confidenceLow)confidenceLow.textContent=`${numberFormatter.format(confidence.low)} · ${confidence.lowPercent}%`;
  if(confidenceStatus)confidenceStatus.textContent=`Coverage across ${numberFormatter.format(confidence.total)} returned live activity records.`;
}

function setEvidenceEmpty(mount,text){
  if(!mount)return;
  mount.className='apx-empty-state';
  mount.replaceChildren(document.createTextNode(text));
}

function renderEvidenceRows(mount,rows=[]){
  if(!mount||!rows.length)return;
  const list=document.createElement('dl');
  list.className='journey-evidence-rows';
  for(const row of rows){
    const item=document.createElement('div');
    const label=document.createElement('dt');
    const value=document.createElement('dd');
    label.textContent=row.label;
    value.textContent=row.value;
    item.append(label,value);
    list.appendChild(item);
  }
  mount.className='journey-evidence-list';
  mount.replaceChildren(list);
}

function renderMissionHighlights(activities=[],view=null){
  setEvidenceEmpty(missionHighlightsCard,'No verified activity history is available for Mission Report highlights.');
  if(!activities.length||!view)return;
  const rows=[];
  const leader=view.mastery?.[0];
  if(leader)rows.push({label:'ACTIVITY LEADER',value:`${leader.activityName} · ${numberFormatter.format(leader.evidenceCount)} RUN${leader.evidenceCount===1?'':'S'}`});
  const latest=[...activities].filter(activity=>activity?.period).sort((left,right)=>String(right.period).localeCompare(String(left.period)))[0];
  if(latest){
    const date=new Date(latest.period);
    const dateLabel=Number.isNaN(date.getTime())?'DATE NOT RETURNED':activityDateFormatter.format(date);
    const state=typeof latest.completed==='boolean'?(latest.completed?'COMPLETED':'NOT COMPLETED'):'COMPLETION NOT RETURNED';
    rows.push({label:'LATEST RESULT',value:`${latest.activityName} · ${dateLabel} · ${state}`});
  }
  if(view.summary?.completionRate!==null)rows.push({label:'RETURNED COMPLETION',value:`${view.summary.completionRate}% ACROSS ${numberFormatter.format(view.summary.totalActivities)} RECORDS`});
  else if(view.summary?.pvpKd!==null)rows.push({label:'RETURNED PVP K/D',value:Number(view.summary.pvpKd).toFixed(2)});
  renderEvidenceRows(missionHighlightsCard,rows);
}

function storageValue(store,key,options){
  try{
    const parsed=JSON.parse(store.getItem(key)||'null');
    return parsed?validateHandoffEnvelope(parsed,options):null;
  }catch{return null;}
}

function readJourneyBuildState(session,characterId){
  const membership=session?.activeDestinyMembership||{};
  const expected={
    expectedCharacterId:String(characterId||''),
    expectedMembershipId:String(membership.membershipId||''),
    expectedMembershipType:String(membership.membershipType||'')
  };
  const sources=[
    [BUILD_SPACE_KEY,'WORKING BUILD'],
    [LAST_LOADOUT_KEY,'BUNGIE LOADOUT'],
    [BUILD_SNAPSHOT_KEY,'CURRENT EQUIPPED']
  ];
  for(const [key,label] of sources){
    for(const store of [sessionStorage,localStorage]){
      const payload=storageValue(store,key,{...expected,allowLegacy:false});
      const build=payload?.workingBuild||payload?.originalBuild||payload;
      if(build&&String(build.characterId||'')===String(characterId||''))return {build,label,key};
    }
  }
  return null;
}

function renderBuildSummary(session=journeySession){
  setEvidenceEmpty(buildSummaryCard,'No verified Build Forge state is available for this Guardian.');
  if(session?.authenticated!==true||!selectedCharacterId)return;
  const result=readJourneyBuildState(session,selectedCharacterId);
  if(!result)return;
  const build=result.build;
  const className=String(build.characterClass||build.className||selectedClassName||'GUARDIAN').toLocaleUpperCase('en-GB');
  const subclass=String(build.subclassName||build.subclass||'SUBCLASS NOT RETURNED').toLocaleUpperCase('en-GB');
  const loadout=Number.isInteger(build.selectedLoadoutIndex)?`BUNGIE LOADOUT ${build.selectedLoadoutIndex+1}`:result.label;
  const weapons=Array.isArray(build.weapons)?build.weapons.length:0;
  const armour=Array.isArray(build.armour)?build.armour.length:Array.isArray(build.armor)?build.armor.length:0;
  const rows=[
    {label:'LINKED BUILD',value:`${className} · ${subclass}`},
    {label:'SOURCE',value:loadout},
    {label:'EQUIPMENT SNAPSHOT',value:`${weapons} WEAPONS · ${armour} ARMOUR`}
  ];
  if(build.paradoxAnalysis)rows.push({label:'PARADOX EVIDENCE',value:'LIVE ANALYSIS LINKED'});
  renderEvidenceRows(buildSummaryCard,rows);
}

function buildSnapshotIdentity(snapshot={}){
  const itemIdentity=item=>String(item?.itemInstanceId??item?.instanceId??item?.itemHash??item?.hash??item?.name??'').trim();
  const items=[
    ...(Array.isArray(snapshot.weapons)?snapshot.weapons:[]),
    ...(Array.isArray(snapshot.armour)?snapshot.armour:[]),
    ...(Array.isArray(snapshot.armor)?snapshot.armor:[]),
    ...(Array.isArray(snapshot.items)?snapshot.items:[])
  ].map(itemIdentity).filter(Boolean).sort();
  const id=String(snapshot.id??snapshot.snapshotId??snapshot.buildId??'').trim();
  const name=String(snapshot.name??snapshot.buildName??'').trim();
  const className=String(snapshot.characterClass??snapshot.className??'').trim();
  const subclass=String(snapshot.subclassName??snapshot.subclass??'').trim();
  const loadout=Number.isInteger(snapshot.selectedLoadoutIndex)?snapshot.selectedLoadoutIndex:null;
  const fingerprint=id||name||[className,subclass,loadout??'',...items].join('|');
  if(!fingerprint.replaceAll('|',''))return null;
  const label=name||(loadout!==null?`BUNGIE LOADOUT ${loadout+1}`:[subclass,className,'BUILD'].filter(Boolean).join(' '));
  return {fingerprint,label:label.toLocaleUpperCase('en-GB')};
}

function captureEvidenceRows(session=journeySession){
  const membership=session?.activeDestinyMembership||{};
  const captures=[readCapture(),...readCaptureArchive()].filter(Boolean);
  const seen=new Set();
  const rows=[];
  for(const capture of captures){
    const testId=String(capture?.testId||'');
    if(testId&&seen.has(testId))continue;
    if(testId)seen.add(testId);
    if(String(capture?.characterId||'')!==selectedCharacterId)continue;
    if(String(capture?.membership?.membershipId||'')!==String(membership.membershipId||''))continue;
    if(String(capture?.membership?.membershipType||'')!==String(membership.membershipType||''))continue;
    const completed=(capture?.candidates||[]).some(candidate=>candidate?.activity?.completed===true);
    if(capture?.status!=='collected'||!completed)continue;
    const identity=buildSnapshotIdentity(capture.buildSnapshot||{});
    if(identity)rows.push({...identity,source:'BUILD TEST'});
  }
  return rows;
}

function renderMostUsed(activities=[],session=journeySession){
  setEvidenceEmpty(mostUsedCard,'No verified Build Test or Mission Report loadout evidence has been recorded.');
  const activityRows=activities.map(activity=>{
    const identity=buildSnapshotIdentity(activity?.buildSnapshot||{});
    return identity?{...identity,source:'MISSION REPORT'}:null;
  }).filter(Boolean);
  const evidence=[...captureEvidenceRows(session),...activityRows];
  if(!evidence.length)return;
  const groups=new Map();
  for(const row of evidence){
    const current=groups.get(row.fingerprint)||{...row,count:0,sources:new Set()};
    current.count+=1;
    current.sources.add(row.source);
    groups.set(row.fingerprint,current);
  }
  const winner=[...groups.values()].sort((left,right)=>right.count-left.count||left.label.localeCompare(right.label))[0];
  const percent=Math.round(winner.count/evidence.length*100);
  renderEvidenceRows(mostUsedCard,[
    {label:'MOST OBSERVED BUILD',value:winner.label},
    {label:'VERIFIED USAGE',value:`${winner.count} OF ${evidence.length} SAMPLES · ${percent}%`},
    {label:'EVIDENCE SOURCE',value:[...winner.sources].join(' + ')}
  ]);
}

function bindJourneyCrossPageEvidence(activities=currentActivityEvidence?.activities||[]){
  renderBuildSummary();
  renderMostUsed(activities);
}

function journeyActivityCacheKey(session,characterId){
  const membership=session?.activeDestinyMembership||{};
  return `${membership.membershipType||''}:${membership.membershipId||''}:${characterId}`;
}

async function fetchJourneyActivityEvidence(session,characterId,{force=false}={}){
  const membership=session?.activeDestinyMembership;
  if(session?.authenticated!==true||!membership?.membershipType||!membership?.membershipId||!characterId)return null;
  const key=journeyActivityCacheKey(session,characterId);
  const cached=journeyActivityCache.get(key);
  if(cached?.promise)return cached.promise;
  if(!force&&cached?.status==='ok'&&Date.now()-cached.fetchedAt<PREPARED_PAGE_REFRESH_MS)return cached;
  const promise=(async()=>{
    try{
      const prepared=verifiedProfile?.preparedAccountData?.activityHistoryByCharacter?.[characterId];
      if(!prepared)throw new Error('Prepared Journey data contains no activity history for this Guardian.');
      const activities=await normaliseActivityHistory(prepared);
      const evidence={status:'ok',characterId,activities,view:buildMissionReportView(activities),fetchedAt:Date.now()};
      journeyActivityCache.set(key,evidence);
      return evidence;
    }catch(error){
      console.info('[Forge Journey] activity evidence unavailable',error);
      if(cached?.status==='ok'){journeyActivityCache.set(key,cached);return cached;}
      journeyActivityCache.delete(key);
      return {status:'unavailable',characterId,activities:[],view:null,fetchedAt:Date.now()};
    }
  })();
  journeyActivityCache.set(key,{...cached,promise});
  return promise;
}

function renderJourneyActivityEvidence(evidence){
  const activities=evidence?.status==='ok'?evidence.activities:[];
  const view=evidence?.status==='ok'?evidence.view:null;
  renderRecentActivity(activities);
  renderCurrentForm(view);
  renderEvidenceConfidence(view?.confidence||null);
  renderMissionHighlights(activities,view);
  renderMostUsed(activities);
}

async function bindJourneyActivityEvidence(session,{force=false}={}){
  const characterId=selectedCharacterId;
  if(session?.authenticated!==true||!characterId){
    currentActivityEvidence=null;
    renderJourneyActivityEvidence(null);
    return null;
  }
  const requestId=++journeyActivityRequest;
  const evidence=await fetchJourneyActivityEvidence(session,characterId,{force});
  if(requestId!==journeyActivityRequest||characterId!==selectedCharacterId)return null;
  currentActivityEvidence=evidence;
  renderJourneyActivityEvidence(evidence);
  renderJourneyContextStatus();
  return evidence;
}

async function bindTitleAndProgression(payload){
  const requestId=++profileIdentityRequest;
  renderEquippedTitleSummary();
  renderNextTitleSummary();
  if(triumphStatsCard)triumphStatsCard.innerHTML='<span class="apx-empty-state">No verified Triumph or progression values are available.</span>';

  const characters=payload?.profile?.characters?.data||{};
  const character=characters[selectedCharacterId]
    ||Object.values(characters).sort((left,right)=>String(right?.dateLastPlayed||'').localeCompare(String(left?.dateLastPlayed||'')))[0];
  const characterId=String(character?.characterId||'');
  const titleHash=finiteNumber(character?.titleRecordHash);

  const records=payload?.profile?.profileRecords?.data;
  const lifetimeScore=finiteNumber(records?.lifetimeScore);
  if(triumphStatsCard&&lifetimeScore!==null){
    const activeScore=finiteNumber(records?.activeScore);
    const legacyScore=finiteNumber(records?.legacyScore);
    triumphStatsCard.replaceChildren();
    const total=document.createElement('div');total.className='journey-triumph-total';total.innerHTML=`<span>TRIUMPH SCORE</span><strong>${numberFormatter.format(lifetimeScore)}</strong>`;
    const breakdown=document.createElement('dl');breakdown.className='journey-triumph-breakdown';breakdown.innerHTML=`<div><dt>ACTIVE</dt><dd>${activeScore===null?'—':numberFormatter.format(activeScore)}</dd></div><div><dt>LEGACY</dt><dd>${legacyScore===null?'—':numberFormatter.format(legacyScore)}</dd></div>`;
    triumphStatsCard.append(total,breakdown);
  }

  let profileTitles=[];
  try{profileTitles=await resolvedProfileTitleCollection(payload,character,'titles');}
  catch(error){console.info('[Forge Journey] title summary profile nodes unavailable',error);}
  if(requestId!==profileIdentityRequest)return;
  const profileEquipped=titleHash===null?null:profileTitles.find(title=>title.completionRecordHash===titleHash);
  if(profileEquipped)renderEquippedTitleSummary(profileEquipped);
  const profileNext=profileTitles.filter(title=>!title.earned&&title.completed!==null&&title.total!==null&&title.total>0&&title.completed<title.total)
    .sort((left,right)=>(right.completed/right.total)-(left.completed/left.total)||(left.total-left.completed)-(right.total-right.completed))[0];
  if(profileNext)renderNextTitleSummary(profileNext);

  let titles=[];
  try{titles=await resolvedTitleCollection(payload,character,'titles');}
  catch(error){console.info('[Forge Journey] title summary catalogue unavailable',error);}
  if(requestId!==profileIdentityRequest)return;
  let equipped=titleHash===null?null:titles.find(title=>title.completionRecordHash===titleHash);
  if(!equipped&&titleHash!==null){
    const definition=await resolveManifestDefinition('DestinyRecordDefinition',titleHash);
    if(requestId!==profileIdentityRequest)return;
    const name=titleNameFor(definition,character,definition?.displayProperties?.name);
    const state=finiteNumber(titleRecordFor(payload,characterId,titleHash)?.state);
    if(name)equipped={completionRecordHash:titleHash,name,detailName:name,icon:bungiePresentationIcon(definition),description:String(definition?.displayProperties?.description||'').trim(),completed:null,total:null,unit:'TITLE REQUIREMENTS',earned:state!==null&&(state&64)===64,complete:state!==null&&(state&64)===64,gilded:state!==null&&(state&128)===128,requirements:null,requirementEntries:[],characterId};
  }
  if(equipped)renderEquippedTitleSummary(equipped);
  else renderEquippedTitleSummary(null,character&&titleHash===null?'No title is equipped on the selected Guardian.':'Equipped title awaiting verified Bungie data.');

  const next=titles.filter(title=>!title.earned&&title.completed!==null&&title.total!==null&&title.total>0&&title.completed<title.total)
    .sort((left,right)=>(right.completed/right.total)-(left.completed/left.total)||(left.total-left.completed)-(right.total-right.completed))[0];
  renderNextTitleSummary(next||null);
}

function bindProfileCards(payload){
  bindGuardianUsage(payload);bindVault(payload);bindActiveGuardian(payload);void bindGuardianRankSummary(payload);void bindSeasonRank(payload);void bindTitleAndProgression(payload);void bindHistoricalStats(journeySession,payload);
  if(recordsPanel&&!recordsPanel.hidden){
    const root=recordRootView(activeRecordView);
    if(root==='titles'||root==='badges'||root==='triumphs')void bindTitleTriumphPanel(payload,root);
    else if(root==='guardian-rank')bindGuardianRankPanel(payload);
    else if(root==='records')bindRecordsPanel(payload);
  }
}

function renderJourneyContextStatus(){
  if(!feedStatus)return;
  const guardian=selectedClassName||'GUARDIAN';
  const evidence=currentActivityEvidence?.characterId===selectedCharacterId?currentActivityEvidence:null;
  const source=evidence?.status==='ok'
    ?`${numberFormatter.format(evidence.activities.length)} VERIFIED ACTIVITY RECORDS`
    :evidence?.status==='unavailable'?'ACTIVITY EVIDENCE UNAVAILABLE':'AWAITING VERIFIED ACTIVITY DATA';
  feedStatus.textContent=`${guardian} · ${activeView.toUpperCase()} · ${source}`;
}

function renderJourneyContext(){
  dashboard.dataset.journeyView=activeView;
  if(selectedCharacterId)dashboard.dataset.characterId=selectedCharacterId;
  else delete dashboard.dataset.characterId;
  document.querySelectorAll('[data-journey-character-panel]').forEach(panel=>{
    panel.dataset.characterId=selectedCharacterId;
    panel.dataset.journeyView=activeView;
  });
  renderJourneyContextStatus();
  document.querySelectorAll('[data-journey-metric]').forEach(card=>{
    const lens=card.dataset.journeyMetric;
    card.hidden=activeView==='pve'&&lens==='pvp'||activeView==='pvp'&&lens==='pve';
  });
  document.querySelectorAll('[data-journey-trend]').forEach(item=>{
    const lens=item.dataset.journeyTrend;
    item.hidden=activeView==='pve'&&lens==='pvp'||activeView==='pvp'&&lens==='pve';
  });
  const lensName=activeView==='pve'?'PVE ':activeView==='pvp'?'PVP ':'';
  trendEmpty.textContent=`${lensName}performance trends require live dated activity evidence.`;
  if(verifiedProfile)bindProfileCards(verifiedProfile);
}

function selectJourneyCharacter(characterId,className){
  const nextCharacterId=String(characterId||'');
  const characterChanged=nextCharacterId!==selectedCharacterId;
  selectedCharacterId=nextCharacterId;
  selectedClassName=String(className||'').toUpperCase();
  if(characterChanged){
    currentActivityEvidence=null;
    renderJourneyActivityEvidence(null);
  }
  renderJourneyContext();
  if(verifiedProfile)void bindDestinationProgress(verifiedProfile);
  bindJourneyCrossPageEvidence();
  if(journeySession)void bindJourneyActivityEvidence(journeySession);
}

function syncSelectedCharacterFromCards(){
  const selected=heroCards?.querySelector('.guardian-character-card.is-selected');
  if(!selected)return;
  selectJourneyCharacter(selected.dataset.characterId,selected.dataset.class);
}

function selectJourneyView(view){
  const button=document.querySelector(`[data-journey-view="${view}"]`);
  if(!button)return;
  activeView=button.dataset.journeyView;
  document.querySelectorAll('[data-journey-view]').forEach(item=>item.setAttribute('aria-selected',String(item===button)));
  renderJourneyContext();
}

document.querySelectorAll('[data-journey-view]').forEach(button=>button.addEventListener('click',()=>{
  selectJourneyView(button.dataset.journeyView);
}));

titlesOpen?.addEventListener('click',()=>showGuardianRecordPanel('titles'));
badgesOpen?.addEventListener('click',()=>showGuardianRecordPanel('badges'));
triumphsOpen?.addEventListener('click',()=>showGuardianRecordPanel('triumphs'));
guardianRankOpen?.addEventListener('click',()=>showGuardianRecordPanel('guardian-rank'));
guardianRankSummary?.addEventListener('click',event=>{
  if(!event.target.closest('#journeyGuardianRankDetailsLink'))return;
  event.preventDefault();
  showGuardianRecordPanel('guardian-rank');
});
titleSealCard?.addEventListener('click',event=>{
  if(!event.target.closest('#journeyEquippedTitleDetailsLink'))return;
  event.preventDefault();
  showGuardianRecordPanel('titles');
  if(equippedTitleSummary)showTitleDetail(equippedTitleSummary,'titles');
});
titleProgressCard?.addEventListener('click',event=>{
  if(!event.target.closest('#journeyNextTitleDetailsLink'))return;
  event.preventDefault();
  showGuardianRecordPanel('titles');
  if(nextTitleSummary)showTitleDetail(nextTitleSummary,'titles');
});
recordsOpen?.addEventListener('click',()=>showGuardianRecordPanel('records'));
recordsBack?.addEventListener('click',handleRecordBack);
locationSelector?.addEventListener('click',event=>{if(event.target.closest('.apx-loc[data-loc]'))showDestinationPanel(false);});

document.addEventListener('forge:character-selected',event=>{
  selectJourneyCharacter(event.detail?.characterId,event.detail?.className||event.detail?.characterClass);
});
document.addEventListener('forge:destination-changed',event=>{if(verifiedProfile)void bindDestinationProgress(verifiedProfile,event.detail?.key);});

if(heroCards){
  new MutationObserver(syncSelectedCharacterFromCards).observe(heroCards,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
}

function hasJourneyRecordComponents(payload){
  return payload?.profile?.profilePresentationNodes?.data?.nodes&&payload?.profile?.profileRecords?.data;
}

async function readVerifiedProfile(session){
  const sharedProfile=await waitWithin(globalThis.FORGE_HERO_PROFILE_PROMISE,JOURNEY_BOOTSTRAP_PROFILE_WAIT_MS);
  try{
    const resolved=await loadPreparedPagePayload(session,'journey',{sharedPayload:sharedProfile});
    if(resolved?.profile?.characters?.data&&hasJourneyRecordComponents(resolved)){
      guardianManifest.prime(resolved);
      return resolved;
    }
    return null;
  }catch(error){
    console.info('[Forge Journey] verified Bungie profile unavailable',error);
    return null;
  }
}

async function fetchJourneyProfileRefresh(){
  const payload=await loadPreparedPagePayload(journeySession,'journey',{force:true});
  guardianManifest.prime(payload);
  return payload;
}

async function refreshJourneyProfile({reason='poll'}={}){
  if(journeySession?.authenticated!==true)return null;
  if(journeyBackgroundRefreshRequest)return journeyBackgroundRefreshRequest;
  journeyBackgroundRefreshRequest=(async()=>{
    const profile=await fetchJourneyProfileRefresh();
    if(!profile?.profile?.characters?.data)throw new Error('Journey refresh returned no Guardian data.');
    verifiedProfile=profile;
    bindProfileCards(profile);
    await bindDestinationProgress(profile);
    await bindJourneyActivityEvidence(journeySession,{force:true});
    bindJourneyCrossPageEvidence();
    document.dispatchEvent(new CustomEvent('forge:journey-profile-refreshed',{detail:{reason,refreshedAt:Date.now(),payload:profile}}));
    document.dispatchEvent(new CustomEvent('forge:prepared-page-refreshed',{detail:{page:'journey',payload:profile}}));
    return profile;
  })();
  try{return await journeyBackgroundRefreshRequest;}
  finally{journeyBackgroundRefreshRequest=null;}
}

function startJourneyBackgroundRefresh(){
  if(journeyRefreshController)return;
  journeyRefreshController=createPreparedPageRefreshController({
    session:journeySession,
    page:'journey',
    refresh:options=>refreshJourneyProfile(options),
    onError:error=>console.info('[Forge Journey] background profile refresh unavailable',error)
  });
  bindPreparedPageRefreshControl(refreshButton,journeyRefreshController,{
    onError:error=>console.info('[Forge Journey] manual profile refresh unavailable',error)
  });
  if(refreshButton){
    document.getElementById('bungieAuthControl')?.prepend(refreshButton);
    refreshButton.hidden=false;
  }
  journeyRefreshController.start();
  const refreshWhenVisible=()=>{
    if(document.visibilityState==='hidden')return;
    bindJourneyCrossPageEvidence();
    void journeyRefreshController.check();
  };
  document.addEventListener('visibilitychange',refreshWhenVisible);
  globalThis.addEventListener('focus',refreshWhenVisible);
  globalThis.addEventListener('storage',event=>{
    if(BUILD_EVIDENCE_STORAGE_KEYS.has(event.key))bindJourneyCrossPageEvidence();
  });
}

function showSignedOut(){
  resolving.hidden=true;
  dashboard.hidden=true;
  signedOut.hidden=false;
  status.textContent='BUNGIE CONNECTION REQUIRED';
  if(refreshButton)refreshButton.hidden=true;
  if(connectButton)connectButton.href=authStartUrl();
  globalThis.ForgeLoader.authResolved();
  void finishJourneyLoader(signedOut);
}

function showJourneyUnavailable(message='Journey data is unavailable. Retry the page or reconnect Bungie.'){
  resolving.hidden=false;
  dashboard.hidden=true;
  signedOut.hidden=true;
  status.textContent='JOURNEY DATA UNAVAILABLE';
  const copy=resolving.querySelector('p:last-child');
  if(copy)copy.textContent=message;
  void finishJourneyLoader(resolving);
}

let locationSelectorReady=false;
let locationMapReady=Promise.resolve();
function showJourney(){
  resolving.hidden=true;
  signedOut.hidden=true;
  dashboard.hidden=false;
  status.textContent='JOURNEY READY';
  renderJourneyContext();
  bindJourneyCrossPageEvidence();
  if(!locationSelectorReady){
    locationSelectorReady=true;
    // Reactive art-backdrop atmosphere + destination selector. Honest empty checklist
    // until a verified data provider (opts.getChecklist) is wired with the mechanics.
    initLocationSelector({
      mount:document.getElementById('journeyLocationSelector'),
      detail:document.getElementById('journeyLocationDetail')
    });
    locationMapReady=initJourneyLocationMaps(document.getElementById('journeyLocationDetail'));
  }
  return locationMapReady;
}

try{
  reportPreparedPageStage('start','journey');
  const session=await getBungieSession();
  reportPreparedPageStage('session','journey');
  const authenticated=session?.authenticated===true&&globalThis.FORGE_BUNGIE_SESSION?.authenticated===true;
  if(authenticated){
    journeySession=session;
    const heroCardsReady=waitForHeroCards();
    const profile=await readVerifiedProfile(session);
    if(!profile?.profile?.characters?.data)throw new Error('Prepared Journey data is unavailable. Retry the page or reconnect Bungie.');
    verifiedProfile=profile;
    bindProfileCards(profile);
    void bindDestinationProgress(profile);
    const mapReady=showJourney();
    startJourneyBackgroundRefresh();
    reportPreparedPageStage('render','journey');
    await Promise.all([
      waitWithin(heroCardsReady,JOURNEY_BOOTSTRAP_UI_WAIT_MS),
      waitWithin(mapReady,JOURNEY_BOOTSTRAP_UI_WAIT_MS),
      waitWithin(waitForJourneyAtmosphere(),JOURNEY_BOOTSTRAP_UI_WAIT_MS)
    ]);
    await finishJourneyLoader(document);
  }
  else showSignedOut();
}catch(error){
  console.info('[Forge Journey] existing Bungie session unavailable',error);
  if(journeySession?.authenticated===true){
    showJourneyUnavailable(error?.message||'Journey data is unavailable. Retry the page or reconnect Bungie.');
  }else showSignedOut();
}
