import {AUTH_ORIGIN} from '../pages/guardian-workspace-v2/guardian-bungie-auth.mjs';
import {accountKey,createReportsLoader} from '../pages/reports/reports-data.mjs';
import {loadReportsHistory} from '../pages/reports/reports-history.mjs';
import {SERIES,viewModel} from '../pages/reports/reports-model.mjs';
import {completed} from '../pages/reports/reports-boxes.mjs';
const retainedImages=new Map();
async function warmImages(groups){
  const urls=[...new Set(groups.map(row=>row.image).filter(Boolean))];
  const failed=new Set();
  let next=0;
  await Promise.all(Array.from({length:Math.min(8,urls.length)},async()=>{
    while(next<urls.length){
      const url=urls[next++];
      if(!retainedImages.has(url)){
        const image=new Image();
        const ready=new Promise(resolve=>{
          const timer=setTimeout(()=>{image.src='';resolve(false);},15000);
          image.onload=()=>{clearTimeout(timer);resolve(true);};
          image.onerror=()=>{clearTimeout(timer);resolve(false);};
        });
        retainedImages.set(url,{image,ready});image.src=url;
      }
      if(!await retainedImages.get(url).ready)failed.add(url);
    }
  }));
  // Failed art remains absent, so opening a card never initiates a retry.
  for(const group of groups)if(failed.has(group.image))group.image='';
}
const loader=createReportsLoader({origin:AUTH_ORIGIN,warmImages});
let activeIdentity='';
export async function preloadReports(session,options){
  const identity=accountKey(session);activeIdentity=identity;
  if(!identity){globalThis.APX_REPORTS_SNAPSHOT=null;return null;}
  const snapshot=await loader.load(session,options);
  if(activeIdentity!==identity||accountKey(globalThis.FORGE_BUNGIE_SESSION)!==identity)return null;
  globalThis.APX_REPORTS_SNAPSHOT=snapshot;
  globalThis.dispatchEvent(new CustomEvent('forge:reports-ready',{detail:{identity}}));
  return snapshot;
}

// Background preparation (4 Oct 2026): after the overview, the account's run history is scanned
// once (kept per account by reports-history.mjs), then each completed activity's section is built
// one at a time, newest runs first. One history controller per account, shared with the page.
const histories=new Map();
export function reportsHistoryFor(snapshot){
  const key=snapshot?.identity||'';
  if(!histories.has(key)){for(const other of histories.keys())if(other!==key)histories.delete(other);histories.set(key,loadReportsHistory(snapshot,{origin:AUTH_ORIGIN}));}
  return histories.get(key);
}
export const reportSectionKey=activityId=>`reports:${activityId}`;
export function completedReportActivities(snapshot){
  const seen=new Map();
  for(const series of SERIES)for(const activity of viewModel(snapshot,series.id,'all').activities.filter(completed))if(!seen.has(activity.id))seen.set(activity.id,activity);
  return [...seen.values()];
}
export function queueReportsPreparation(session,queue,{constrained=false}={}){
  if(!queue)return null;
  const overview=queue.add('reports',()=>preloadReports(session));
  if(constrained)return overview;
  void overview.then(async snapshot=>{
    if(!snapshot)return;
    const history=await reportsHistoryFor(snapshot);
    void queue.add('reports:history',()=>history.prepareSection(null,{limit:0}));
    for(const activity of completedReportActivities(snapshot))void queue.add(reportSectionKey(activity.id),()=>history.prepareSection(activity));
  }).catch(()=>{});
  return overview;
}
