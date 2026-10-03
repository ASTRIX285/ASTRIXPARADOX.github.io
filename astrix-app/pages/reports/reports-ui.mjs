import {SERIES,viewModel,display,duration} from './reports-model.mjs';
import {createReportsHistory,normalizeDifficulty,difficultyFor,activityAnalysis,clearsConsistent,RUN_PAGE_SIZE} from './reports-history.mjs';
import {boxRows} from './reports-boxes.mjs';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>Number.isFinite(value)?display(value):'Pending';
const elapsed=value=>Number.isFinite(value)?(value===0?'00:00':duration(value)):'Pending';
const date=value=>value?new Date(value).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'}):'Pending';
const completion=value=>value===true?'Completed':value===false?'Not completed':'Pending';
export const difficultyLabel=value=>value==='-'?'Completed':value;
const className=row=>['Titan','Hunter','Warlock'][row?.classType]||'Guardian';
const art=activity=>`<div class="reports-art">${activity.image?`<img src="${escape(activity.image)}" alt="" width="320" height="180" loading="lazy" decoding="async">`:''}<h2>${escape(activity.name)}</h2></div>`;
export const statList=(totals,keys)=>`<dl class="reports-stats">${keys.map(([key,label])=>`<div><dt>${label}</dt><dd>${key==='time'||key==='fastest'?elapsed(totals[key]):number(totals[key])}</dd></div>`).join('')}</dl>`;

export const difficultyRows=activity=>[...activity.difficulties].sort((a,b)=>(b.cleared??0)-(a.cleared??0)).map(row=>`<tr><th scope="row">${escape(row.difficulty==='-'?'Pending':row.difficulty)}</th><td>${number(row.cleared)}</td><td>${elapsed(row.fastest)}</td></tr>`).join('');

export function readReportsRoute(url,snapshot){
  const q=new URL(url).searchParams;
  const activity=snapshot.catalogue.find(a=>a.id===q.get('activity'));
  return {series:activity?.series|| (SERIES.some(s=>s.id===q.get('series'))?q.get('series'):'raids'),activity:activity?.id||null,
    character:snapshot.characters.some(c=>c.characterId===q.get('character'))?q.get('character'):'all',difficulty:normalizeDifficulty(q.get('difficulty')||'All'),
    page:/^\d+$/.test(q.get('page')||'')?Math.min(100000,Number(q.get('page'))):0,run:activity&&/^\d+$/.test(q.get('run')||'')?q.get('run'):null};
}
// Group the current newest-first page without losing its original run IDs.
export function runGroups(activity,rows){
  const groups=new Map();
  for(const row of rows){const label=difficultyFor(row,activity);if(!groups.has(label))groups.set(label,[]);groups.get(label).push(row);}
  return [...groups].map(([difficulty,runs])=>({difficulty,runs}));
}
export function runRows(activity,rows){
  return runGroups(activity,rows).map(group=>`<section class="reports-run-group" aria-label="${escape(difficultyLabel(group.difficulty))} runs"><h3>${escape(difficultyLabel(group.difficulty))}</h3><ol class="reports-runs">${group.runs.map(r=>`<li><button type="button" data-run="${escape(r.id)}"><time datetime="${escape(r.period)}">${escape(date(r.period))}</time><span class="reports-run-result" data-result="${r.completed===true?'completed':r.completed===false?'incomplete':'pending'}">${completion(r.completed)}</span></button></li>`).join('')}</ol></section>`).join('');
}
export const selectionArt=activity=>activity.image||'';
// Activity tile (3 Oct 2026): art at 16:9 with the name over it, then one row per difficulty with
// clears and fastest time from the same view model, "-" when there is none.
const none=value=>!Number.isFinite(value)||value<=0;
export const tileBand=activity=>`<span class="rp-band" aria-label="Clears and fastest times"><span class="rp-band-head">Difficulty</span><span class="rp-band-head">Clears</span><span class="rp-band-head">Fastest</span>${boxRows(activity).map(row=>`<span class="rp-band-name">${escape(row.difficulty)}</span><span>${none(row.cleared)?'-':display(row.cleared)}</span><span>${none(row.fastest)?'-':duration(row.fastest)}</span>`).join('')}</span>`;

export function mountReports(root,snapshot,{history=createReportsHistory(snapshot)}={}){
  let state=readReportsRoute(location.href,snapshot),disposed=false,busy=false,error='',runData=null,runId=null,runError='',token=0;
  const reports=new Map(),failedReports=new Set();
  let opened=state.activity;
  let enriching=false;
  const activity=()=>viewModel(snapshot,state.series,state.character).activities.find(a=>a.id===state.activity);
  const rows=a=>[...new Map(history.runs(a,state.character).filter(r=>state.difficulty==='All'||difficultyFor(r,a)===state.difficulty).map(r=>[r.id,r])).values()];
  function navigate(change){
    const previous=state;state={...state,...change};if(state.activity)opened=state.activity;const url=new URL(location.href);
    for(const key of ['series','activity','character','difficulty','page','run']){
      const value=state[key];if(value===null||value==='all'||value==='All'||value===0)url.searchParams.delete(key);else url.searchParams.set(key,value);
    }
    window.history.pushState({},'',url);sync();restoreFocus(previous);
  }
  const analysis=a=>activityAnalysis(a,history.runs(a,state.character),snapshot.characters,history.complete(state.character));
  function difficultyTable(data){return data.difficulties.map(d=>`<tr><th scope="row"><button data-difficulty="${escape(d.difficulty)}" aria-pressed="${d.difficulty===state.difficulty}">${escape(difficultyLabel(d.difficulty))}</button></th><td>${d.notPlayed?'Not played':data.pending?'Pending':number(d.cleared)}</td><td>${d.notPlayed?'Not played':data.pending?'Pending':elapsed(d.fastest)}</td></tr>`).join('');}
  function details(a){
    const all=history.runs(a,state.character),data=analysis(a),totals={...data.totals};
    if(!clearsConsistent(data))throw new Error('Reports clear breakdown is inconsistent');
    if(data.pending){totals.cleared=null;totals.entered=null;}
    const lowerBound=Math.max(data.aggregateCleared||0,data.totals.cleared);
    const known=all.filter(r=>r.completed===true),finished=totals.entered!==null&&history.complete(state.character)&&known.every(r=>reports.has(r.id)&&reports.get(r.id).flawless!==null);
    if(finished&&all.every(r=>r.completed!==null))totals.flawless=known.filter(r=>reports.get(r.id).flawless).length;
    const entered=totals.entered===null&&lowerBound>0?`At least ${number(lowerBound)} · history pending`:number(totals.entered);
    return `${art(a)}<dl class="reports-stats"><div><dt>Entered</dt><dd>${entered}</dd></div></dl>${statList(totals,[['cleared','Cleared'],['flawless','Flawless'],['kills','Kills']])}<details class="reports-explainer"><summary>About these totals</summary><p>Kills cover all returned history pages for the selected characters. Flawless means completed with no recorded fireteam deaths.</p></details><table><thead><tr><th>Difficulty</th><th>Cleared</th><th>Fastest</th></tr></thead><tbody>${difficultyTable(data)}</tbody></table><h3>Clears by character</h3><table><thead><tr><th>Character</th><th>Cleared</th></tr></thead><tbody>${data.characters.map(c=>`<tr><th scope="row">${className(c)}</th><td>${data.pending?'Pending':number(c.cleared)}</td></tr>`).join('')}</tbody></table>${data.pending?'<p class="reports-note">Clear breakdown pending complete history.</p>':''}${data.aggregateMismatch?`<p class="reports-note">Bungie aggregate: ${number(data.aggregateCleared)} clears. Available run history: ${number(data.totals.cleared)}. Breakdowns use returned runs; historical coverage differs.</p>`:''}`;
  }
  function runList(a){
    const list=rows(a),page=list.slice(state.page*RUN_PAGE_SIZE,(state.page+1)*RUN_PAGE_SIZE);
    return `<div class="reports-tabs" aria-label="Difficulty">${['All',...analysis(a).difficulties.map(d=>d.difficulty)].map(d=>{
      const never=d!=='All'&&analysis(a).difficulties.find(row=>row.difficulty===d)?.notPlayed;
      return `<button data-difficulty="${escape(d)}" aria-pressed="${d===state.difficulty}" class="rp-tab${never?' reports-unplayed':''}">${escape(difficultyLabel(d))}</button>`;
    }).join('')}</div><header class="reports-history-heading"><h2>Runs <span>${number(list.length)}</span></h2><p>Newest first within each difficulty. Local date and time.</p></header><p class="reports-history-status" role="status">${error|| (busy?'Loading all history pages…':history.complete(state.character)?'All available history pages loaded.':'History pending.')}</p>${error||failedReports.size?'<button class="rp-tab" data-retry>Retry pending data</button>':''}${runRows(a,page)}${!page.length?`<p>${history.complete(state.character)?'No runs returned for this selection.':'Runs pending.'}</p>`:''}<nav class="reports-paging" aria-label="Run pages"><button class="rp-tab" data-page="${state.page-1}" ${state.page===0?'disabled':''}>Previous</button><span>Page ${state.page+1}</span><button class="rp-tab" data-page="${state.page+1}" ${(state.page+1)*RUN_PAGE_SIZE>=list.length?'disabled':''}>Next</button></nav>`;
  }
  function memberLink(p){const url=new URL(location.href);url.searchParams.set('subjectId',p.membershipId);url.searchParams.set('subjectType',p.membershipType);for(const key of ['run','page','character','difficulty'])url.searchParams.delete(key);return url.href;}
  const percent=value=>Number.isFinite(value)?`${value.toFixed(1)}%`:'Not available';
  function runPage(a){
    const variant=a.variants.find(v=>v.hash===runData?.directorHash)||a.variants.find(v=>v.hash===runData?.hash);
    const name=runData?.name||(variant?[a.name,variant.variant,variant.difficulty==='-'?'':variant.difficulty].filter(Boolean).join(' · '):a.name);
    const image=selectionArt(a);
    const modifiers=!runData?'<p>Modifiers pending.</p>':runData.modifiers===null?'<p>Modifiers not provided by Bungie for this run.</p>':runData.modifiers?.length?`<ul>${runData.modifiers.map(m=>`<li>${escape(m.name||'Modifier name pending')}</li>`).join('')}</ul>`:'<p>No player-selected modifiers recorded. Other historical modifiers are not provided.</p>';
    const totals=runData?.teamTotals;
    return `<article class="reports-run-page rp-panel"><header class="reports-run-feature">${image?`<img class="reports-run-backdrop" src="${escape(image)}" alt="">`:''}<div class="reports-run-heading"><h1 tabindex="-1">${escape(name)}</h1><div class="reports-run-meta"><time${runData?.period?` datetime="${escape(runData.period)}"`:''}>${escape(date(runData?.period))}</time><span><span class="reports-meta-label">Duration</span> ${elapsed(runData?.duration)}</span></div><p class="reports-badges">${(runData?.badges||[]).map(b=>`<span>${b}</span>`).join('')}</p><details class="reports-run-modifiers"><summary>Modifiers</summary>${modifiers}</details></div></header><nav class="reports-paging"><button class="rp-tab" data-back-activity>Back to ${escape(a.name)}</button><button class="rp-tab" data-back>Back to Reports</button><button class="rp-tab" data-share>Share</button></nav><p data-share-status role="status"></p>${!runData?`<p role="status">${runError||'Loading fireteam…'}</p>${runError?'<button class="rp-tab" data-retry-run>Retry</button>':''}`:`<details class="reports-explainer"><summary>Run context</summary><p>Badges describe recorded players and deaths, including checkpoint runs. Started from beginning: ${runData.startedFromBeginning===null?'Not provided':runData.startedFromBeginning?'Yes':'No'}.</p></details><h2 class="reports-fireteam-heading">Fireteam <span>${runData.players.length} players</span></h2><div class="reports-table-scroll" tabindex="0" aria-label="Fireteam results"><table class="reports-player-table"><thead><tr>${['Emblem','Player','Class','Kills','Assists','Deaths','K/D','% of team kills','Time in activity','Completed'].map(label=>`<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${runData.players.map((p,i)=>`<tr><td>${p.emblem?`<img src="${escape(p.emblem)}" alt="" width="32" height="32">`:'Pending'}</td><th scope="row">${p.membershipId&&p.membershipType?`<a href="${escape(memberLink(p))}">${escape(p.name)}</a>`:escape(p.name)}</th><td>${escape(p.className||'Pending')}</td><td>${number(p.kills)}</td><td>${number(p.assists)}</td><td>${number(p.deaths)}</td><td>${number(p.kd)}</td><td>${percent(runData.killShares[i])}</td><td>${elapsed(p.timePlayed)}</td><td><span class="reports-run-result" data-result="${p.completed===true?'completed':p.completed===false?'incomplete':'pending'}">${completion(p.completed)}</span></td></tr>`).join('')}</tbody><tfoot><tr><th colspan="3" scope="row">Totals</th><td>${number(totals.kills)}</td><td>${number(totals.assists)}</td><td>${number(totals.deaths)}</td><td>${totals.deaths===0?'No deaths':number(totals.kd)}</td><td>${percent(totals.killShare)}</td><td>${elapsed(totals.timePlayed)}</td><td>${totals.completed===null?'Pending':`${totals.completed} / ${runData.players.length}`}</td></tr></tfoot></table></div><p>Time totals sum each player's time in activity. Kill shares use one decimal place and balanced rounding.${totals.killShare===null?' Percentages are unavailable when team kills are zero or missing.':''}</p>`}</article>`;
  }
  root.innerHTML='<div class="reports-stage"></div>';
  const stage=root.querySelector('.reports-stage');
  let renderedRunKey='';
  function render(){
    if(disposed)return;
    const focused=document.activeElement;
    const focusKey=focused&&stage.contains(focused)?['data-run','data-difficulty','data-series','data-page'].find(k=>focused.hasAttribute(k)):null;
    const focusValue=focusKey?focused.getAttribute(focusKey):null;
    const characterFocused=focused?.id==='reportCharacter';
    const a=activity(),model=viewModel(snapshot,state.series,state.character);
    if(a&&state.run){
      const key=`${state.run}:${runData?'ready':runError}`;
      if(key!==renderedRunKey){stage.innerHTML=runPage(a);renderedRunKey=key;stage.querySelector('h1')?.focus({preventScroll:true});}
      return;
    }
    renderedRunKey='';
    stage.innerHTML=`<aside class="reports-sidebar"><h1>Reports</h1>${snapshot.subject?'<p>Viewing fireteam member</p>':''}<nav class="rp-strip" aria-label="Activity series">${SERIES.map(s=>`<button class="rp-tab" data-series="${s.id}" aria-pressed="${s.id===state.series}">${s.name}</button>`).join('')}</nav><div class="reports-character-filter"><label for="reportCharacter">Character</label><select id="reportCharacter" class="rp-select"><option value="all">All characters</option>${snapshot.characters.map(c=>`<option value="${escape(c.characterId)}" ${c.characterId===state.character?'selected':''}>${className(c)}</option>`).join('')}</select></div></aside><section class="reports-content">${a?`<button class="rp-tab" data-back>Back to Reports</button><div class="reports-detail"><article class="reports-detail-card rp-panel is-open">${details(a)}</article><section class="reports-history rp-panel">${runList(a)}</section></div>`:`<header class="reports-collection-heading"><h2>${escape(SERIES.find(s=>s.id===state.series)?.name||'Activities')}</h2><p>Select an activity to explore its runs.</p></header><div class="reports-grid rp-section">${model.activities.map(a=>`<article class="reports-card rp-tile${a.id===opened?' is-selected':''}"><button class="reports-open rp-tile-face" data-activity="${escape(a.id)}"${a.id===opened?' aria-current="true"':''}>${art(a)}${tileBand(a)}</button></article>`).join('')}</div>`}</section>`;
    if(characterFocused)stage.querySelector('#reportCharacter').focus({preventScroll:true});
    if(focusKey)[...stage.querySelectorAll(`[${focusKey}]`)].find(e=>e.getAttribute(focusKey)===focusValue)?.focus({preventScroll:true});
  }

  async function enrich(){
    if(enriching||disposed||!state.activity)return;enriching=true;
    try{
      const a=activity();if(!a)return;
      const all=history.runs(a,state.character),visible=rows(a).slice(state.page*RUN_PAGE_SIZE,(state.page+1)*RUN_PAGE_SIZE);
      const ids=[...new Set([...visible,...all.filter(r=>r.completed===true)].map(r=>r.id))].filter(id=>!reports.has(id)&&!failedReports.has(id));
      let next=0;await Promise.all(Array.from({length:Math.min(3,ids.length)},async()=>{while(next<ids.length&&!disposed&&state.activity===a.id){const id=ids[next++];try{reports.set(id,await history.pgcr(id));}catch{failedReports.add(id);}render();}}));
    }finally{enriching=false;if(!disposed&&state.activity&&history.runs(activity(),state.character).some(r=>(r.completed===true||rows(activity()).slice(state.page*RUN_PAGE_SIZE,(state.page+1)*RUN_PAGE_SIZE).some(v=>v.id===r.id))&&!reports.has(r.id)&&!failedReports.has(r.id)))void enrich();}
  }
  async function scan(){
    if(busy||disposed||!state.activity)return;busy=true;error='';render();
    try{while(!history.complete()&&!disposed&&state.activity){await history.advance();render();void enrich();}}catch{error='History pending. Retry to continue.';}
    finally{busy=false;render();void enrich();}
  }
  async function loadRun(){
    if(!state.run||state.run===runId)return;runId=state.run;runData=null;runError='';const id=runId,revision=++token;render();
    try{const data=await history.detail(id);if(!disposed&&revision===token){runData=data;reports.set(id,data);}}catch{if(revision===token)runError='Run detail pending. Bungie may have restricted or unavailable data.';}render();
  }
  function sync(){if(!state.run){token++;runId=null;runData=null;runError='';}render();void scan();void enrich();void loadRun();}
  function click(event){
    const b=event.target.closest('button');if(!b||!root.contains(b))return;
    if(b.hasAttribute('data-activity'))navigate({activity:b.dataset.activity,difficulty:'All',page:0,run:null});
    else if(b.hasAttribute('data-series'))navigate({series:b.dataset.series,activity:null,run:null,page:0,difficulty:'All'});
    else if(b.hasAttribute('data-difficulty'))navigate({difficulty:b.dataset.difficulty,page:0,run:null});
    else if(b.hasAttribute('data-run'))navigate({run:b.dataset.run});
    else if(b.hasAttribute('data-page'))navigate({page:Math.max(0,Number(b.dataset.page))});
    else if(b.hasAttribute('data-back'))navigate({activity:null,run:null,page:0,difficulty:'All'});
    else if(b.hasAttribute('data-back-activity'))navigate({run:null});
    else if(b.hasAttribute('data-retry')){failedReports.clear();void scan();void enrich();}
    else if(b.hasAttribute('data-retry-run')){runId=null;void loadRun();}
    else if(b.hasAttribute('data-share'))void Promise.resolve().then(()=>navigator.clipboard.writeText(location.href)).then(()=>{stage.querySelector('[data-share-status]').textContent='Link copied.';},()=>{stage.querySelector('[data-share-status]').textContent='Copy the current URL to share this run.';});
  }
  const change=e=>{if(e.target.id==='reportCharacter')navigate({character:e.target.value,page:0,run:null});};
  const PHONE=globalThis.matchMedia?.('(max-width:1199px)');
  const shellCharacter=e=>{const id=String(e.detail?.characterId||'');if(PHONE?.matches&&snapshot.characters.some(c=>c.characterId===id)&&id!==state.character)navigate({character:id,page:0,run:null});};
  function restoreFocus(previous){
    if(previous.run&&!state.run&&state.activity)[...root.querySelectorAll('[data-run]')].find(b=>b.dataset.run===previous.run)?.focus();
    else if(previous.activity&&!state.activity)[...root.querySelectorAll('[data-activity]')].find(b=>b.dataset.activity===previous.activity)?.focus();
    else if(!previous.activity&&state.activity&&!state.run)root.querySelector('[data-back]')?.focus();
  }
  const pop=()=>{const previous=state;state=readReportsRoute(location.href,snapshot);sync();restoreFocus(previous);};
  root.addEventListener('click',click);root.addEventListener('change',change);window.addEventListener('popstate',pop);document.addEventListener('forge:character-selected',shellCharacter);
  sync();return {render,destroy(){disposed=true;token++;root.removeEventListener('click',click);root.removeEventListener('change',change);window.removeEventListener('popstate',pop);document.removeEventListener('forge:character-selected',shellCharacter);}};
}
