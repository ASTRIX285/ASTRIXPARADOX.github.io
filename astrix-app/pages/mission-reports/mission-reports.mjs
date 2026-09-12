import {getBungieSession} from '../guardian-workspace-v2/guardian-bungie-auth.mjs?v=20260912-global-icon-audit-1';
import {
  renderGuardianCharacterCards,
  renderGuardianCharacterCardStatus
} from '../guardian-workspace-v2/guardian-character-cards.mjs';
import {buildMissionReportView,loadMissionReports} from './mission-reports-data.mjs?v=20260906-page-payload-1';

const $=id=>document.getElementById(id);
const resolving=$('missionResolving');
const signedOut=$('missionSignedOut');
const workspace=$('missionWorkspace');
const connectAction=$('missionConnectAction');
const accountPill=document.getElementById('bungieAuthButton');
const feedStatus=$('missionFeedStatus');
const sourceState=$('missionSourceState');
const masteryList=$('missionMasteryList');
const masteryEmpty=$('missionMasteryEmpty');
const evidenceList=$('missionEvidenceList');
const evidenceEmpty=$('missionEvidenceEmpty');
const viewAllMastery=$('missionViewAllMastery');
const viewHistory=$('missionViewHistory');

const dateTimeFormatter=new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'});
const dateFormatter=new Intl.DateTimeFormat(undefined,{dateStyle:'medium'});
const numberFormatter=new Intl.NumberFormat();

let session=null;
let reportResult=null;
let allActivities=[];
let activeView='overview';
let timeFilter='all';
let masteryCategory='Vanguard';
let showAllMastery=false;
let showFullHistory=false;
let loadingCharacterId='';

function hasValue(value){
  return value!==null&&value!==undefined&&value!==''&&Number.isFinite(typeof value==='number'?value:0);
}

function formatDate(value,{withTime=false}={}){
  if(!value)return 'Not returned';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return String(value);
  return withTime?dateTimeFormatter.format(date):dateFormatter.format(date);
}

function formatDuration(seconds,displayValue=null){
  if(displayValue)return displayValue;
  if(!Number.isFinite(seconds))return 'Not returned';
  const total=Math.max(0,Math.round(seconds));
  const hours=Math.floor(total/3600);
  const minutes=Math.floor(total%3600/60);
  const remainder=total%60;
  return hours?`${hours}:${String(minutes).padStart(2,'0')}:${String(remainder).padStart(2,'0')}`:`${minutes}:${String(remainder).padStart(2,'0')}`;
}

function formatPlaytime(minutes){
  if(!Number.isFinite(minutes))return '—';
  const total=Math.max(0,Math.round(minutes));
  const hours=Math.floor(total/60);
  const remaining=total%60;
  return `${numberFormatter.format(hours)}h ${remaining}m`;
}

function completionLabel(value){
  if(value===true)return 'Completed';
  if(value===false)return 'Not completed';
  return 'Not returned';
}

function setDonut(element,value){
  const percent=Number.isFinite(value)?Math.min(100,Math.max(0,value)):0;
  element.style.strokeDasharray=`${percent} ${100-percent}`;
}

function showSignedOut(){
  resolving.hidden=true;
  workspace.hidden=true;
  signedOut.hidden=false;
  accountPill.textContent='BUNGIE CONNECTION REQUIRED';
  renderGuardianCharacterCardStatus('CONNECT BUNGIE TO LOAD CHARACTERS','unavailable');
  const control=document.querySelector('.bungie-auth-control');
  if(control&&connectAction&&!connectAction.contains(control))connectAction.append(control);
}

function showWorkspace(){
  resolving.hidden=true;
  signedOut.hidden=true;
  workspace.hidden=false;
}

function renderGuardianContext(context){
  const guardian=context?.guardian||null;
  const characters=Array.isArray(context?.characters)?context.characters:[];
  if(characters.length){
    renderGuardianCharacterCards(characters.map(character=>({
      ...character,
      power:character.power??'Unavailable'
    })),context.selectedCharacterId);
  }else{
    renderGuardianCharacterCardStatus('BUNGIE CHARACTERS UNAVAILABLE','unavailable');
  }

  accountPill.textContent=context?.displayName?`BUNGIE: ${context.displayName}`:'BUNGIE ACCOUNT';
  $('missionGuardianClass').textContent=guardian?.className||'Guardian unavailable';
  $('missionGuardianSubclass').textContent=guardian?.subclassName||'Subclass unavailable';
  $('missionVerifiedGuardian').hidden=guardian?.verified!==true;
  $('missionTotalPlaytime').textContent=formatPlaytime(guardian?.totalPlaytimeMinutes);
  $('missionAccountAge').textContent=Number.isFinite(guardian?.accountAgeDays)?`${numberFormatter.format(guardian.accountAgeDays)} days`:'—';
  $('missionJourneyLevel').textContent=Number.isFinite(guardian?.journeyLevel)?numberFormatter.format(guardian.journeyLevel):'—';

  const crest=$('missionGuardianCrest');
  const crestEmpty=$('missionGuardianCrestEmpty');
  const crestSource=guardian?.subclassIcon||guardian?.emblem?.icon||'';
  if(crestSource){
    crest.src=crestSource;
    crest.hidden=false;
    crestEmpty.hidden=true;
  }else{
    crest.removeAttribute('src');
    crest.hidden=true;
    crestEmpty.hidden=false;
  }

  const xpCurrent=guardian?.journeyXp;
  const xpTarget=guardian?.journeyXpTarget;
  const hasXp=Number.isFinite(xpCurrent)&&Number.isFinite(xpTarget)&&xpTarget>0;
  $('missionXpBar').style.width=hasXp?`${Math.min(100,Math.max(0,xpCurrent/xpTarget*100))}%`:'0%';
  $('missionXpText').textContent=hasXp?`${numberFormatter.format(xpCurrent)} / ${numberFormatter.format(xpTarget)} XP`:'XP source unavailable';
  document.querySelector('.mission-xp')?.setAttribute('aria-label',hasXp?`${xpCurrent} of ${xpTarget} Journey XP`:'Journey XP unavailable');
}

function renderMetric(valueElement,verifiedElement,value,noteElement,note,formatter=value=>numberFormatter.format(value)){
  const available=hasValue(value);
  valueElement.textContent=available?formatter(value):'—';
  verifiedElement.hidden=!available;
  noteElement.textContent=note;
}

function filteredActivities(){
  let rows=[...allActivities];
  if(activeView==='pve')rows=rows.filter(activity=>activity.category!=='Crucible');
  if(activeView==='pvp')rows=rows.filter(activity=>activity.category==='Crucible');
  if(activeView==='build')rows=rows.filter(activity=>activity.buildSnapshot);
  if(timeFilter==='30-days'){
    const cutoff=Date.now()-30*24*60*60*1000;
    rows=rows.filter(activity=>{
      const time=Date.parse(activity.period||'');
      return Number.isFinite(time)&&time>=cutoff;
    });
  }
  return rows;
}

function renderSummary(summary){
  renderMetric(
    $('missionMetricActivities'),$('missionMetricActivitiesVerified'),summary.totalActivities,
    $('missionMetricActivitiesNote'),'Returned by live history'
  );
  renderMetric(
    $('missionMetricCompletion'),$('missionMetricCompletionVerified'),summary.completionRate,
    $('missionMetricCompletionNote'),'From activities with completion evidence',value=>`${value}%`
  );
  renderMetric(
    $('missionMetricPve'),$('missionMetricPveVerified'),summary.pveClears,
    $('missionMetricPveNote'),'Completed non-PVP activities'
  );
  renderMetric(
    $('missionMetricPvp'),$('missionMetricPvpVerified'),summary.pvpKd,
    $('missionMetricPvpNote'),'Aggregated from returned PVP kills and deaths',value=>value.toFixed(2)
  );
  setDonut($('missionCompletionDonut'),summary.completionRate);
}

function createTextElement(tag,className,text){
  const element=document.createElement(tag);
  if(className)element.className=className;
  element.textContent=text;
  return element;
}

function masteryRow(row){
  const details=document.createElement('details');
  details.className='mission-mastery-row';
  const summary=document.createElement('summary');
  const grid=document.createElement('div');
  grid.className='mission-mastery-summary';

  const activity=document.createElement('span');
  activity.className='mission-row-activity';
  activity.append(createTextElement('strong','',row.activityName),createTextElement('small','',row.modeLabel));
  grid.append(
    activity,
    createTextElement('span','',numberFormatter.format(row.completions)),
    createTextElement('span','',Number.isFinite(row.bestResult)?numberFormatter.format(row.bestResult):'Not returned'),
    createTextElement('span','',formatDate(row.lastPlayed)),
    createTextElement('span','',Number.isFinite(row.successRate)?`${row.successRate}%`:'Not returned'),
    createTextElement('span','',row.buildUsed||'Not returned'),
    createTextElement('span','mission-mastery-chevron','›')
  );
  summary.append(grid);

  const detail=document.createElement('div');
  detail.className='mission-mastery-detail';
  detail.append(
    createTextElement('span','',`Evidence rows: ${numberFormatter.format(row.evidenceCount)}`),
    createTextElement('span','',`Mode: ${row.modeLabel}`),
    createTextElement('span','',`Category: ${row.category}`),
    createTextElement('span','',row.buildUsed?`Build: ${row.buildUsed}`:'Build evidence not returned')
  );
  details.append(summary,detail);
  return details;
}

function renderMastery(rows){
  const categoryRows=rows.filter(row=>row.category===masteryCategory);
  const visible=showAllMastery?categoryRows:categoryRows.slice(0,5);
  masteryList.replaceChildren(...visible.map(masteryRow));
  masteryEmpty.hidden=categoryRows.length>0;
  masteryEmpty.textContent=categoryRows.length?'':'No verified activities were returned for this category.';
  viewAllMastery.disabled=categoryRows.length<=5;
  viewAllMastery.textContent=`${showAllMastery?'SHOW RECENT':'VIEW ALL'} ${masteryCategory.toUpperCase()} ACTIVITIES`;
}

function snapshotStrip(activity){
  const strip=document.createElement('div');
  strip.className='mission-snapshot-strip';
  const items=[...(activity.buildSnapshot?.weapons||[]),...(activity.buildSnapshot?.armour||[])].filter(item=>item.icon).slice(0,4);
  if(items.length){
    items.forEach(item=>{
      const image=document.createElement('img');
      image.src=item.icon;
      image.alt=item.name||'Build item';
      image.loading='lazy';
      strip.append(image);
    });
  }else{
    strip.append(createTextElement('span','mission-snapshot-placeholder','—'));
    strip.setAttribute('aria-label','Build snapshot not returned');
  }
  return strip;
}

function evidenceRow(activity){
  const row=document.createElement('article');
  row.className='mission-evidence-row';
  const tag=activity.category==='Crucible'?'PVP':activity.category==='Gambit'?'PVE/PVP':'PVE';
  const tagElement=createTextElement('span',`mission-evidence-tag${tag==='PVP'?'':' is-pve'}`,tag);
  const name=document.createElement('div');
  name.className='mission-evidence-name';
  name.append(createTextElement('strong','',activity.activityName),createTextElement('small','',activity.modeLabel));
  const analyse=document.createElement('a');
  analyse.className='mission-analyse-link';
  analyse.href='../guardian-workspace-v2/paradox-build-space/';
  analyse.textContent='ANALYSE';
  const external=document.createElement('a');
  external.className='mission-external-link';
  external.href='../guardian-workspace-v2/paradox-build-space/';
  external.setAttribute('aria-label',`Open ${activity.activityName} in Build Forge`);
  external.textContent='↗';
  row.append(
    tagElement,
    name,
    createTextElement('span','mission-evidence-cell',completionLabel(activity.completed)),
    createTextElement('time','mission-evidence-cell',formatDate(activity.period,{withTime:true})),
    createTextElement('span','mission-evidence-cell',formatDuration(activity.durationSeconds,activity.durationDisplay)),
    snapshotStrip(activity),
    analyse,
    external
  );
  return row;
}

function renderEvidence(activities){
  const sorted=[...activities].sort((left,right)=>String(right.period||'').localeCompare(String(left.period||'')));
  const visible=showFullHistory?sorted:sorted.slice(0,5);
  evidenceList.replaceChildren(...visible.map(evidenceRow));
  evidenceEmpty.hidden=sorted.length>0;
  evidenceEmpty.textContent=sorted.length?'':'No activity rows were returned by the connected live feed.';
  viewHistory.disabled=sorted.length<=5;
  viewHistory.textContent=showFullHistory?'SHOW RECENT ACTIVITY':'VIEW FULL ACTIVITY HISTORY';
}

function pathFromPoints(points){
  if(!Array.isArray(points)||!points.length)return '';
  const values=points.map(point=>point.value);
  const min=Math.min(...values);
  const max=Math.max(...values);
  const range=max-min||1;
  const width=286;
  return points.map((point,index)=>{
    const x=18+(points.length===1?width/2:index/(points.length-1)*width);
    const y=132-(point.value-min)/range*104;
    return `${index?'L':'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
}

function renderTrends(trends){
  const pve=trends?.pve||[];
  const pvp=trends?.pvp||[];
  $('missionPveTrendLine').setAttribute('d',pathFromPoints(pve));
  $('missionPvpTrendLine').setAttribute('d',pathFromPoints(pvp));
  const all=[...pve,...pvp].sort((left,right)=>left.date.localeCompare(right.date));
  $('missionTrendEmpty').hidden=all.length>0;
  $('missionTrendStart').textContent=all.length?formatDate(all[0].date):'—';
  $('missionTrendEnd').textContent=all.length?formatDate(all.at(-1).date):'—';
  $('missionTrendChart').setAttribute('aria-label',all.length?'Performance trend derived from live activities in the last 30 days':'No verified performance trend available');
}

function renderConfidence(confidence){
  const available=Boolean(confidence);
  $('missionConfidenceHigh').textContent=available?`${confidence.highPercent}%`:'—';
  $('missionConfidenceHighRow').textContent=available?`${confidence.high} · ${confidence.highPercent}%`:'—';
  $('missionConfidenceMediumRow').textContent=available?`${confidence.medium} · ${confidence.mediumPercent}%`:'—';
  $('missionConfidenceLowRow').textContent=available?`${confidence.low} · ${confidence.lowPercent}%`:'—';
  setDonut($('missionConfidenceDonut'),available?confidence.highPercent:null);
  $('missionConfidenceEmpty').hidden=available;
}

function sparklinePath(values){
  if(!Array.isArray(values)||!values.length)return '';
  const min=Math.min(...values);
  const max=Math.max(...values);
  const range=max-min||1;
  return values.map((value,index)=>{
    const x=4+(values.length===1?116:index/(values.length-1)*232);
    const y=40-(value-min)/range*34;
    return `${index?'L':'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
}

function renderBuildCard(type,evidence){
  const card=document.querySelector(`[data-build-card="${type}"]`);
  const verified=card.querySelector('[data-build-verified]');
  const name=card.querySelector('[data-build-name]');
  const subtitle=card.querySelector('[data-build-subtitle]');
  const sample=card.querySelector('[data-build-sample]');
  const metric=card.querySelector('[data-build-metric]');
  const sparkline=card.querySelector('[data-build-sparkline]');
  const thumbnails=card.querySelector('[data-build-thumbnails]');
  verified.hidden=!evidence?.verified;
  name.textContent=evidence?.name||'No verified build evidence';
  subtitle.textContent=evidence?.subtitle||'Build snapshots are not returned by the current activity feed.';
  sample.textContent=Number.isFinite(evidence?.sampleSize)?numberFormatter.format(evidence.sampleSize):'—';
  metric.textContent=Number.isFinite(evidence?.metric)?(evidence.metricType==='success-rate'?`${evidence.metric}%`:evidence.metric.toFixed(2)):'—';
  sparkline.setAttribute('d',sparklinePath(evidence?.sparkline||[]));
  const items=[...(evidence?.weapons||[]),...(evidence?.armour||[])].filter(item=>item.icon).slice(0,6);
  if(items.length){
    thumbnails.replaceChildren(...items.map(item=>{
      const image=document.createElement('img');
      image.src=item.icon;
      image.alt=item.name||'Build item';
      image.loading='lazy';
      return image;
    }));
    thumbnails.setAttribute('aria-label','Verified build item thumbnails');
  }else{
    thumbnails.replaceChildren(...Array.from({length:6},()=>createTextElement('span','','—')));
    thumbnails.setAttribute('aria-label','Build item thumbnails unavailable');
  }
}

function renderLastSynced(value){
  $('missionLastSynced').textContent=value?formatDate(value,{withTime:true}):'';
  if(value)$('missionLastSynced').dateTime=value;
  else $('missionLastSynced').removeAttribute('datetime');
}

function renderLiveReport(){
  const activities=filteredActivities();
  const view=buildMissionReportView(activities);
  renderSummary(view.summary);
  renderMastery(view.mastery);
  renderEvidence(activities);
  renderTrends(view.trends);
  renderConfidence(view.confidence);
  renderBuildCard('pve',view.buildEvidence.pve);
  renderBuildCard('pvp',view.buildEvidence.pvp);
}

function renderUnavailable(){
  const emptySummary={totalActivities:null,completionRate:null,pveClears:null,pvpKd:null};
  renderSummary(emptySummary);
  masteryList.replaceChildren();
  masteryEmpty.hidden=false;
  masteryEmpty.textContent='Activity mastery will appear once verified activity history is available.';
  evidenceList.replaceChildren();
  evidenceEmpty.hidden=false;
  evidenceEmpty.textContent='Activity history will appear once the live feed is connected.';
  viewAllMastery.disabled=true;
  viewHistory.disabled=true;
  renderTrends({pve:[],pvp:[]});
  renderConfidence(null);
  renderBuildCard('pve',null);
  renderBuildCard('pvp',null);
  renderLastSynced(null);
}

async function loadReport(characterId=''){
  if(loadingCharacterId===characterId&&feedStatus.textContent==='LOADING LIVE FEED')return;
  loadingCharacterId=characterId;
  feedStatus.textContent='LOADING LIVE FEED';
  sourceState.textContent='REQUESTING BUNGIE HISTORY';
  const result=await loadMissionReports({session,characterId});
  reportResult=result;
  renderGuardianContext(result.context);
  if(result.status==='unauthenticated'){
    showSignedOut();
    return;
  }
  showWorkspace();
  allActivities=result.activities;
  if(result.status==='unavailable'){
    feedStatus.textContent='LIVE FEED UNAVAILABLE';
    sourceState.textContent='WORKER ROUTE REQUIRED';
    renderUnavailable();
    return;
  }
  feedStatus.textContent='LIVE BUNGIE DATA';
  sourceState.textContent='SOURCE · BUNGIE ACTIVITY HISTORY';
  renderLastSynced(result.lastSynced);
  renderLiveReport();
}

document.querySelectorAll('[data-mission-view]').forEach(button=>button.addEventListener('click',()=>{
  activeView=button.dataset.missionView;
  document.querySelectorAll('[data-mission-view]').forEach(item=>item.setAttribute('aria-selected',String(item===button)));
  if(reportResult?.status==='ok')renderLiveReport();
}));

document.querySelectorAll('[data-mastery-category]').forEach(button=>button.addEventListener('click',()=>{
  masteryCategory=button.dataset.masteryCategory;
  showAllMastery=false;
  document.querySelectorAll('[data-mastery-category]').forEach(item=>item.classList.toggle('is-active',item===button));
  if(reportResult?.status==='ok')renderMastery(buildMissionReportView(filteredActivities()).mastery);
}));

document.querySelectorAll('input[name="missionTime"]').forEach(input=>input.addEventListener('change',()=>{
  if(!input.checked)return;
  timeFilter=input.value;
  if(reportResult?.status==='ok')renderLiveReport();
}));

viewAllMastery.addEventListener('click',()=>{
  showAllMastery=!showAllMastery;
  if(reportResult?.status==='ok')renderMastery(buildMissionReportView(filteredActivities()).mastery);
});

viewHistory.addEventListener('click',()=>{
  showFullHistory=!showFullHistory;
  if(reportResult?.status==='ok')renderEvidence(filteredActivities());
});

document.querySelectorAll('.mission-section-nav a').forEach(link=>link.addEventListener('click',()=>{
  document.querySelectorAll('.mission-section-nav a').forEach(item=>{
    const active=item===link;
    item.classList.toggle('is-active',active);
    if(active)item.setAttribute('aria-current','page');
    else item.removeAttribute('aria-current');
  });
}));

document.addEventListener('forge:character-selected',event=>{
  const characterId=String(event.detail?.characterId||'');
  if(characterId&&characterId!==reportResult?.characterId)loadReport(characterId).catch(error=>{
    console.info('[Forge Mission Reports] selected character history unavailable',error);
    renderUnavailable();
  });
});

try{
  globalThis.ForgeLoader.set(12);globalThis.ForgeLoader.status('Connecting Mission Reports');
  session=await getBungieSession();
  const authenticated=session?.authenticated===true&&globalThis.FORGE_BUNGIE_SESSION?.authenticated===true;
  if(!authenticated){
    showSignedOut();
    globalThis.ForgeLoader.set(96);globalThis.ForgeLoader.status('Mission Reports connection state rendered');
    await globalThis.ForgeLoader.ready(signedOut);
  }else{
    showWorkspace();
    await loadReport();
    globalThis.ForgeLoader.set(96);globalThis.ForgeLoader.status('Mission Reports rendered');
    await globalThis.ForgeLoader.ready(workspace);
  }
}catch(error){
  console.info('[Forge Mission Reports] live activity history unavailable',error);
  showWorkspace();
  accountPill.textContent='BUNGIE STATUS UNAVAILABLE';
  feedStatus.textContent='LIVE FEED UNAVAILABLE';
  sourceState.textContent='WORKER ROUTE REQUIRED';
  renderGuardianCharacterCardStatus('BUNGIE CHARACTERS UNAVAILABLE','unavailable');
  renderUnavailable();
  globalThis.ForgeLoader.set(96);globalThis.ForgeLoader.status('Mission Reports state rendered');
  await globalThis.ForgeLoader.ready(workspace);
}
