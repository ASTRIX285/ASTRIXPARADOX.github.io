import {boxRows,packReportCards} from './reports-boxes.mjs?v=20260925-20c';
import {SERIES,viewModel,display,duration} from './reports-model.mjs?v=20260925-reports-20c';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const art=activity=>`<div class="reports-art">${activity.image?`<img src="${escape(activity.image)}" alt="" width="320" height="180">`:''}<h2>${escape(activity.name)}</h2></div>`;
const statList=(totals,keys)=>`<dl class="reports-stats">${keys.map(([key,label])=>`<div><dt>${label}</dt><dd>${key==='time'?duration(totals[key]):display(totals[key])}</dd></div>`).join('')}</dl>`;
const band=(activity,expanded=false)=>`<div class="reports-band-head"><span>Difficulty</span><span>Cleared</span><span>Fastest</span></div>${boxRows(activity).map((row,index)=>`<div class="reports-band-row"${index>=5&&!expanded?' hidden':''}><span class="reports-band-label" title="${escape(row.difficulty)}">${escape(row.difficulty)}</span><span>${row.cleared?display(row.cleared):'-'}</span><span>${duration(row.fastest)}</span></div>`).join('')}${activity.difficulties.length>5?`<button type="button" class="reports-expand" data-expand="${escape(activity.id)}" aria-expanded="${expanded}">${expanded?'Show less':`Show all (${activity.difficulties.length})`}</button>`:''}`;
const details=activity=>`${statList(activity.totals,[['entered','Entered'],['cleared','Cleared'],['score','Best Score'],['kills','Kills']])}<table><thead><tr><th>Difficulty</th><th>Cleared</th><th>Fastest</th><th>Score</th></tr></thead><tbody>${boxRows(activity).map(row=>`<tr><th scope="row">${escape(row.difficulty)}</th><td>${row.cleared?display(row.cleared):'-'}</td><td>${duration(row.fastest)}</td><td>${display(row.score)}</td></tr>`).join('')}</tbody></table>`;
export function mountReports(root,snapshot){
  let selectedSeries='raids',character='all',selectedActivity=null;
  const views=new Map(),cards=new Map(),detailViews=new Map(),expanded=new Set();
  const layout=()=>{for(const view of views.values())if(!view.hidden)packReportCards(view.querySelector('.reports-grid'));};
  const observer=new ResizeObserver(()=>requestAnimationFrame(layout));
  // Prompt 20a-fix: images are created only during preparation, before interaction.
  root.innerHTML=`<aside class="reports-sidebar"><h1>Reports</h1><nav aria-label="Activity series">${SERIES.map(row=>`<button type="button" data-series="${row.id}">${row.name}</button>`).join('')}</nav><h2 data-series-title></h2><p data-series-description></p><label for="reportCharacter">Character</label><select id="reportCharacter"><option value="all">All</option>${snapshot.characters.map(row=>`<option value="${escape(row.characterId)}">${['Titan','Hunter','Warlock'][row.classType]||'Guardian'}</option>`).join('')}</select><div data-totals></div><progress aria-label="Time Played compared with all series"></progress></aside><section class="reports-content"></section>`;
  const content=root.querySelector('.reports-content');
  for(const series of SERIES){
    const view=document.createElement('section');view.hidden=true;view.setAttribute('aria-label',series.name);
    const model=viewModel(snapshot,series.id,character);
    view.innerHTML=`<div class="reports-grid">${model.activities.map(activity=>`<article class="reports-card" data-activity="${escape(activity.id)}"><button type="button" class="reports-open" aria-label="Open ${escape(activity.name)}">${art(activity)}</button><div class="reports-band">${band(activity)}</div></article>`).join('')}</div>${model.activities.length?'':'<p>No activities available.</p>'}`;
    content.append(view);views.set(series.id,view);observer.observe(view.querySelector('.reports-grid'));
    for(const card of view.querySelectorAll('.reports-card'))observer.observe(card);
    for(const card of view.querySelectorAll('[data-activity]'))cards.set(card.dataset.activity,{card,art:card.querySelector('.reports-art')});
  }
  function restoreArt(){
    if(selectedActivity){const entry=cards.get(selectedActivity);entry.card.querySelector('.reports-open').prepend(entry.art);}
  }
  function render(){
    const series=SERIES.find(row=>row.id===selectedSeries),model=viewModel(snapshot,selectedSeries,character);
    root.querySelector('[data-series-title]').textContent=series.name;
    root.querySelector('[data-series-description]').textContent=series.description;
    root.querySelector('[data-totals]').innerHTML=statList(model.totals,[['entered','Entered'],['cleared','Cleared'],['kills','Kills'],['deaths','Deaths'],...(['raids','dungeons'].includes(selectedSeries)?[['flawless','Flawless']]:[]),['time','Time Played']]);
    const progress=root.querySelector('progress');progress.max=Math.max(1,SERIES.reduce((sum,row)=>sum+(viewModel(snapshot,row.id,character).totals.time||0),0));progress.value=model.totals.time||0;
    root.querySelectorAll('[data-series]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.series===selectedSeries)));
    for(const [id,view] of views)view.hidden=id!==selectedSeries||selectedActivity!==null;
    for(const [id,view] of detailViews)view.hidden=id!==selectedActivity;
    for(const activity of model.activities)cards.get(activity.id).card.querySelector('.reports-band').innerHTML=band(activity,expanded.has(activity.id));
    const activity=model.activities.find(row=>row.id===selectedActivity);
    if(activity){
      let view=detailViews.get(activity.id);
      if(!view){
        view=document.createElement('section');view.setAttribute('aria-label',activity.name);
        view.innerHTML=`<button type="button" data-back>Back to ${series.name}</button><div class="reports-detail"><article class="reports-detail-card"><div data-detail-art></div><div data-detail-stats></div></article><section aria-label="Run history"></section></div>`;
        content.append(view);detailViews.set(activity.id,view);
      }
      view.querySelector('[data-detail-art]').append(cards.get(activity.id).art);
      view.querySelector('[data-detail-stats]').innerHTML=details(activity);view.hidden=false;
    }
    layout();
  }
  root.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!root.contains(event.target))return;
    const toggle=event.target.closest('[data-expand]');
    if(toggle){const id=toggle.dataset.expand;if(expanded.has(id))expanded.delete(id);else expanded.add(id);render();cards.get(id).card.querySelector('[data-expand]').focus();return;}
    const card=event.target.closest('[data-activity]');
    if(card){selectedActivity=card.dataset.activity;render();detailViews.get(selectedActivity).querySelector('[data-back]').focus();return;}
    if(!button)return;
    if(button.hasAttribute('data-series')){restoreArt();selectedSeries=button.dataset.series;selectedActivity=null;render();}
    else if(button.hasAttribute('data-activity')){selectedActivity=button.dataset.activity;render();detailViews.get(selectedActivity).querySelector('[data-back]').focus();}
    else if(button.hasAttribute('data-back')){const previous=selectedActivity;restoreArt();selectedActivity=null;render();cards.get(previous).card.querySelector('.reports-open').focus();}
  });
  root.querySelector('#reportCharacter').addEventListener('change',event=>{character=event.target.value;render();});
  render();return {render};
}
