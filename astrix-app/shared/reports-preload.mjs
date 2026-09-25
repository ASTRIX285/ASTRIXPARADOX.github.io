import {AUTH_ORIGIN} from '../pages/guardian-workspace-v2/guardian-bungie-auth.mjs?v=20260913-live-character-2';
import {accountKey,createReportsLoader} from '../pages/reports/reports-data.mjs?v=20260925-reports-1';
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
