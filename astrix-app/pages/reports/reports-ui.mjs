import {SERIES,viewModel,display,duration} from './reports-model.mjs?v=20260925-reports-1';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const art=activity=>`<div class="reports-art">${activity.image?`<img src="${escape(activity.image)}" alt="" width="320" height="180">`:''}<h2>${escape(activity.name)}</h2></div>`;
const statList=(totals,keys)=>`<dl class="reports-stats">${keys.map(([key,label])=>`<div><dt>${label}</dt><dd>${key==='time'?duration(totals[key]):display(totals[key])}</dd></div>`).join('')}</dl>`;
export function mountReports(root,snapshot){
  let selectedSeries='raids',character='all',selectedActivity=null;
  function render(){
    const series=SERIES.find(row=>row.id===selectedSeries),model=viewModel(snapshot,selectedSeries,character);
    const activity=model.activities.find(row=>row.id===selectedActivity);
    root.innerHTML=`<aside class="reports-sidebar"><h1>Reports</h1><nav aria-label="Activity series">${SERIES.map(row=>`<button type="button" data-series="${row.id}" aria-pressed="${row.id===selectedSeries}">${row.name}</button>`).join('')}</nav><h2>${series.name}</h2><p>${series.description}</p><label for="reportCharacter">Character</label><select id="reportCharacter"><option value="all">All</option>${snapshot.characters.map(row=>`<option value="${escape(row.characterId)}" ${character===row.characterId?'selected':''}>${['Titan','Hunter','Warlock'][row.classType]||'Guardian'}</option>`).join('')}</select>${statList(model.totals,[['entered','Entered'],['cleared','Cleared'],['kills','Kills'],['deaths','Deaths'],...(['raids','dungeons'].includes(selectedSeries)?[['flawless','Flawless']]:[]),['time','Time Played']])}<progress aria-label="Time Played compared with all series" max="${Math.max(1,SERIES.reduce((sum,row)=>sum+(viewModel(snapshot,row.id,character).totals.time||0),0))}" value="${model.totals.time||0}"></progress></aside><section class="reports-content" aria-label="${series.name}">${activity?detail(activity):grid(model.activities)}</section>`;
    root.querySelectorAll('[data-series]').forEach(button=>button.addEventListener('click',()=>{selectedSeries=button.dataset.series;selectedActivity=null;render();}));
    root.querySelector('#reportCharacter').addEventListener('change',event=>{character=event.target.value;render();});
    root.querySelectorAll('[data-activity]').forEach(button=>button.addEventListener('click',()=>{selectedActivity=button.dataset.activity;render();root.querySelector('[data-back]').focus();}));
    root.querySelector('[data-back]')?.addEventListener('click',()=>{selectedActivity=null;render();});
  }
  function grid(activities){
    return `<div class="reports-grid">${activities.map(activity=>`<button type="button" class="reports-card" data-activity="${escape(activity.id)}" aria-label="Open ${escape(activity.name)}">${art(activity)}<div class="reports-band"><div class="reports-band-head"><span>Difficulty</span><span>Cleared</span><span>Fastest</span></div>${activity.difficulties.map(row=>`<div class="reports-band-row"><span>${escape(row.difficulty)}</span><span>${row.cleared?display(row.cleared):'-'}</span><span>${duration(row.fastest)}</span></div>`).join('')}</div></button>`).join('')}</div>${activities.length?'':'<p>No activities available.</p>'}`;
  }
  function detail(activity){return `<button type="button" data-back>Back to ${SERIES.find(row=>row.id===selectedSeries).name}</button><div class="reports-detail"><article class="reports-detail-card">${art(activity)}${statList(activity.totals,[['entered','Entered'],['cleared','Cleared'],['score','Best Score'],['kills','Kills']])}<table><thead><tr><th>Difficulty</th><th>Cleared</th><th>Fastest</th><th>Score</th></tr></thead><tbody>${activity.difficulties.map(row=>`<tr><th scope="row">${escape(row.difficulty)}</th><td>${row.cleared?display(row.cleared):'-'}</td><td>${duration(row.fastest)}</td><td>${display(row.score)}</td></tr>`).join('')}</tbody></table></article><section id="reportsHistory" aria-label="Run history"></section></div>`;}
  render();return {render};
}
