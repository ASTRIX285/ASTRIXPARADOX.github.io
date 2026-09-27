import {packReportCards} from './reports-boxes.mjs?v=20260925-20c';
import {SERIES,viewModel,display,duration} from './reports-model.mjs?v=20260925-reports-20c';
import {createReportsHistory} from './reports-history.mjs?v=20260927-drilldown-1';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>Number.isFinite(value)?display(value):'Pending';
const elapsed=value=>Number.isFinite(value)?(value===0?'00:00':duration(value)):'Pending';
const date=value=>value?new Date(value).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'}):'Pending';
const completion=value=>value===true?'Completed':value===false?'Not completed':'Pending';
const className=row=>['Titan','Hunter','Warlock'][row?.classType]||'Guardian';
const art=activity=>`<div class="reports-art">${activity.image?`<img src="${escape(activity.image)}" alt="" width="320" height="180">`:''}<h2>${escape(activity.name)}</h2></div>`;
export const statList=(totals,keys)=>`<dl class="reports-stats">${keys.map(([key,label])=>`<div><dt>${label}</dt><dd>${key==='time'||key==='fastest'?elapsed(totals[key]):number(totals[key])}</dd></div>`).join('')}</dl>`;

export const difficultyRows=activity=>[...activity.difficulties].sort((a,b)=>(b.cleared??0)-(a.cleared??0)).map(row=>`<tr><th scope="row">${escape(row.difficulty==='-'?'Pending':row.difficulty)}</th><td>${number(row.cleared)}</td><td>${elapsed(row.fastest)}</td></tr>`).join('');

export function mountReports(root,snapshot,{history=createReportsHistory(snapshot)}={}){
  let selectedSeries='raids',character='all',selectedActivity=null,selectedRun=null,pageIndex=0;
  let busy=false,error='',runData=null,runError=false,revision=0,disposed=false,historyQueued=false;
  const views=new Map(),cards=new Map(),detailViews=new Map();
  const layout=()=>{if(!disposed)for(const view of views.values())if(!view.hidden)packReportCards(view.querySelector('.reports-grid'));};
  const observer=new ResizeObserver(()=>requestAnimationFrame(layout));
  const currentActivity=()=>viewModel(snapshot,selectedSeries,character).activities.find(row=>row.id===selectedActivity);
  function summary(activity,id=character){
    const runs=history?.runs(activity,id)||[],complete=history?.complete(id)||false;
    const totals={...activity.totals};
    // A full-history fallback can fill absent aggregate fields. A partial page
    // must never be passed off as an account clear total or lifetime best.
    if(complete&&runs.every(row=>row.completed!==null)){
      if(totals.cleared===null)totals.cleared=runs.filter(row=>row.completed).length;
      if(totals.fastest===null){const clears=runs.filter(row=>row.completed);if(clears.length&&clears.every(row=>row.duration>0))totals.fastest=Math.min(...clears.map(row=>row.duration));}
    }
    return {...totals,lastPlayed:runs[0]?.period||null,historyComplete:complete};
  }
  function cardBand(activity){
    const totals=summary(activity);
    return `${statList(totals,[['cleared','Clears'],['fastest','Fastest']])}<dl class="reports-stats"><div><dt>Last played</dt><dd>${totals.lastPlayed?escape(date(totals.lastPlayed)):totals.historyComplete?'No runs returned':'Pending'}</dd></div></dl>`;
  }
  function details(activity){
    const characters=snapshot.characters.filter(row=>character==='all'||row.characterId===character);
    return `${statList(summary(activity),[['cleared','Clears'],['fastest','Fastest'],['kills','Kills']])}<h3>Clears by difficulty</h3><table><thead><tr><th>Difficulty</th><th>Clears</th><th>Fastest</th></tr></thead><tbody>${difficultyRows(activity)}</tbody></table><h3>Clears by character</h3><table><thead><tr><th>Character</th><th>Clears</th><th>Fastest</th></tr></thead><tbody>${characters.map(row=>{
      const data=viewModel(snapshot,selectedSeries,row.characterId).activities.find(item=>item.id===activity.id),totals=summary(data,row.characterId);
      return `<tr><th scope="row">${className(row)}</th><td>${number(totals.cleared)}</td><td>${elapsed(totals.fastest)}</td></tr>`;
    }).join('')}</tbody></table>`;
  }
  function runHistory(activity){
    const state=history?.readPage(activity,character,pageIndex)||{rows:[],complete:false};
    return `<h2>Runs</h2><p>Newest first. Times use your local time zone.</p><p role="status">${busy?'Loading runs…':error||(!state.rows.length?(state.complete?'No runs returned.':'Older runs pending. Continue loading to search further back.'):'')}</p><ol class="reports-runs">${state.rows.map(run=>{
      const variant=activity.variants.find(row=>row.hash===run.hash)||activity.variants.find(row=>row.hash===run.directorHash);
      return `<li><button type="button" data-run="${escape(run.id)}"><time datetime="${escape(run.period)}">${escape(date(run.period))}</time><span>${className(snapshot.characters.find(row=>row.characterId===run.characterId))} · ${escape(variant?.difficulty==='-'?'Difficulty pending':variant?.difficulty||'Difficulty pending')}</span><span>${elapsed(run.duration)} · ${completion(run.completed)}</span></button></li>`;
    }).join('')}</ol><nav class="reports-paging" aria-label="Run pages"><button type="button" data-previous ${pageIndex===0||busy?'disabled':''}>Previous</button><span>Page ${pageIndex+1}</span><button type="button" data-next ${!state.hasNext||busy?'disabled':''}>Next</button>${!state.complete||error?`<button type="button" data-load-runs ${busy?'disabled':''}>${error?'Retry':'Load older runs'}</button>`:''}</nav>`;
  }
  function runDetail(){
    if(!runData)return `<p role="status">${runError?'Run detail pending.':'Loading fireteam…'}</p>${runError?'<button type="button" data-retry-run>Retry</button>':''}`;
    return `<h2>Fireteam</h2><p>${escape(date(runData.period))} · ${elapsed(runData.duration)}</p><ul class="reports-fireteam">${runData.players.map(player=>`<li>${player.emblem?`<img src="${escape(player.emblem)}" alt="" width="48" height="48">`:'<span>Emblem pending</span>'}<div><h3>${escape(player.name)}</h3><dl class="reports-stats"><div><dt>Kills</dt><dd>${number(player.kills)}</dd></div><div><dt>Deaths</dt><dd>${number(player.deaths)}</dd></div><div><dt>Completion</dt><dd>${completion(player.completed)}</dd></div></dl></div></li>`).join('')}</ul>`;
  }
  root.innerHTML=`<aside class="reports-sidebar"><h1>Reports</h1><nav aria-label="Activity series">${SERIES.map(row=>`<button type="button" data-series="${row.id}">${row.name}</button>`).join('')}</nav><h2 data-series-title></h2><p data-series-description></p><label for="reportCharacter">Character</label><select id="reportCharacter"><option value="all">All characters</option>${snapshot.characters.map(row=>`<option value="${escape(row.characterId)}">${className(row)}</option>`).join('')}</select><div data-totals></div><progress aria-label="Time Played compared with all series"></progress><div data-history-state></div></aside><section class="reports-content"></section>`;
  const content=root.querySelector('.reports-content');
  for(const series of SERIES){
    const view=document.createElement('section');view.hidden=true;view.setAttribute('aria-label',series.name);
    const model=viewModel(snapshot,series.id,character);
    view.innerHTML=`<div class="reports-grid">${model.activities.map(activity=>`<article class="reports-card" data-activity="${escape(activity.id)}"><button type="button" class="reports-open" aria-label="Open ${escape(activity.name)}">${art(activity)}</button><div class="reports-band">${cardBand(activity)}</div></article>`).join('')}</div>${model.activities.length?'':'<p>No activities available.</p>'}`;
    content.append(view);views.set(series.id,view);observer.observe(view.querySelector('.reports-grid'));
    for(const card of view.querySelectorAll('.reports-card'))observer.observe(card);
    for(const card of view.querySelectorAll('[data-activity]'))cards.set(card.dataset.activity,{card,art:card.querySelector('.reports-art')});
  }
  function restoreArt(){if(selectedActivity){const entry=cards.get(selectedActivity);entry.card.querySelector('.reports-open').prepend(entry.art);}}
  function render(){
    if(disposed)return;
    const series=SERIES.find(row=>row.id===selectedSeries),model=viewModel(snapshot,selectedSeries,character);
    root.querySelector('[data-series-title]').textContent=series.name;
    root.querySelector('[data-series-description]').textContent=series.description;
    root.querySelector('[data-totals]').innerHTML=statList(model.totals,[['cleared','Clears'],['kills','Kills'],['deaths','Deaths'],['time','Time Played']]);
    root.querySelector('[data-history-state]').innerHTML=`<p role="status">${busy?'Loading history…':error||''}</p>${history&&!history.complete()?`<button type="button" data-load-runs ${busy?'disabled':''}>${error?'Retry history':'Load older history'}</button>`:''}`;
    const progress=root.querySelector('progress');progress.max=Math.max(1,SERIES.reduce((sum,row)=>sum+(viewModel(snapshot,row.id,character).totals.time||0),0));progress.value=model.totals.time||0;
    root.querySelectorAll('[data-series]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.series===selectedSeries)));
    for(const [id,view] of views)view.hidden=id!==selectedSeries||selectedActivity!==null;
    for(const [id,view] of detailViews)view.hidden=id!==selectedActivity;
    for(const activity of model.activities)cards.get(activity.id).card.querySelector('.reports-band').innerHTML=cardBand(activity);
    const activity=model.activities.find(row=>row.id===selectedActivity);
    if(activity){
      let view=detailViews.get(activity.id);
      if(!view){
        view=document.createElement('section');view.setAttribute('aria-label',activity.name);
        view.innerHTML=`<button type="button" data-back>Back to ${series.name}</button><div class="reports-detail"><article class="reports-detail-card"><div data-detail-art></div><div data-detail-stats></div></article><section class="reports-history" aria-label="Run history"></section></div>`;
        content.append(view);detailViews.set(activity.id,view);
      }
      view.querySelector('[data-back]').textContent=selectedRun?`Back to ${activity.name}`:`Back to ${series.name}`;
      view.querySelector('[data-detail-art]').append(cards.get(activity.id).art);
      view.querySelector('[data-detail-stats]').innerHTML=details(activity);
      view.querySelector('.reports-history').innerHTML=selectedRun?runDetail():runHistory(activity);view.hidden=false;
    }
    layout();
  }
  async function loadHistory(){
    if(!history||disposed)return;
    if(busy){historyQueued=true;return;}
    busy=true;error='';render();
    try{
      const activity=currentActivity();
      if(activity)await history.page(activity,character,pageIndex);
      else for(let round=0;round<5&&!history.complete()&&!disposed;round++){
        await history.advance();
        if(viewModel(snapshot,selectedSeries,character).activities.filter(row=>row.totals.cleared>0).every(row=>history.runs(row,character).length))break;
      }
    }catch{error='History pending. Retry to continue.';}
    finally{busy=false;render();if(historyQueued){historyQueued=false;void loadHistory();}}
  }
  async function loadRun(id){
    const token=++revision;selectedRun=id;runData=null;runError=false;render();
    try{const data=await history.pgcr(id);if(token===revision)runData=data;}
    catch{if(token===revision)runError=true;}
    if(token===revision)render();
  }
  function click(event){
    const button=event.target.closest('button');if(!root.contains(event.target))return;
    const card=event.target.closest('[data-activity]');
    if(card){selectedActivity=card.dataset.activity;selectedRun=null;pageIndex=0;revision++;render();detailViews.get(selectedActivity).querySelector('[data-back]').focus();void loadHistory();return;}
    if(!button)return;
    if(button.hasAttribute('data-run')){void loadRun(button.dataset.run);detailViews.get(selectedActivity).querySelector('[data-back]').focus();}
    else if(button.hasAttribute('data-retry-run'))void loadRun(selectedRun);
    else if(button.hasAttribute('data-load-runs'))void loadHistory();
    else if(button.hasAttribute('data-previous')){pageIndex=Math.max(0,pageIndex-1);render();}
    else if(button.hasAttribute('data-next')){pageIndex++;render();void loadHistory();}
    else if(button.hasAttribute('data-series')){revision++;restoreArt();selectedSeries=button.dataset.series;selectedActivity=null;selectedRun=null;pageIndex=0;render();}
    else if(button.hasAttribute('data-back')){
      revision++;
      if(selectedRun){const previous=selectedRun;selectedRun=null;render();detailViews.get(selectedActivity).querySelector(`[data-run="${previous}"]`)?.focus();}
      else{const previous=selectedActivity;restoreArt();selectedActivity=null;render();cards.get(previous).card.querySelector('.reports-open').focus();}
    }
  }
  const change=event=>{revision++;character=event.target.value;selectedRun=null;pageIndex=0;render();if(selectedActivity)void loadHistory();};
  root.addEventListener('click',click);
  root.querySelector('#reportCharacter').addEventListener('change',change);
  render();void loadHistory();
  return {render,destroy(){disposed=true;revision++;observer.disconnect();root.removeEventListener('click',click);root.querySelector('#reportCharacter')?.removeEventListener('change',change);}};
}
