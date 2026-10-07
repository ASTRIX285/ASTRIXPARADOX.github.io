import {getBungieSession} from '../guardian-workspace-v2/guardian-bungie-auth.mjs';
import {mountForgeShell} from '../guardian-workspace-v2/platform-forge-shell.mjs';
import {preloadReports,reportsHistoryFor,reportSectionKey,queueReportsPreparation} from '../../shared/reports-preload.mjs';
import {preparationQueue} from '../../core/prepared-page-client.mjs';
import {accountKey,createReportsLoader} from './reports-data.mjs';
import {mountReports} from './reports-ui.mjs';
const root=document.querySelector('#reportsWorkspace');
mountForgeShell({rootSelector:'#reportsWorkspace',layout:'destination'});
let revision=0,displayedIdentity='',mounted=null;
// Data age on the refresh icon: the overview's real fetch time, never shown as live.
const publishAge=snapshot=>document.dispatchEvent(new CustomEvent('forge:prepared-page-loaded',{detail:{page:'reports',payload:{preparedCache:{dataAt:snapshot.fetchedAt}},source:'reports'}}));
const ageWords=ms=>{const minutes=Math.floor(ms/60000);return minutes<1?'less than a minute ago':minutes<60?`${minutes} minute${minutes===1?'':'s'} ago`:`${Math.floor(minutes/60)} hour${minutes<120?'':'s'} ago`;};
async function start({force=false,session:providedSession}={}){
  const current=++revision;
  mounted?.destroy();mounted=null;
  root.innerHTML='<p role="status">Loading reports…</p>';
  let session=null,subject=null;
  try{
    session=providedSession||await getBungieSession();
    displayedIdentity=accountKey(session);
    if(!session?.authenticated)return;
    const params=new URL(location.href).searchParams;
    const subjectId=params.get('subjectId'),subjectType=params.get('subjectType');
    subject=subjectId&&/^\d+$/.test(subjectId)&&/^(1|2|3|5|6|10)$/.test(subjectType||'')?{membershipId:subjectId,membershipType:Number(subjectType)}:null;
    const snapshot=subject?await createReportsLoader({subject}).load(session,{force}):await preloadReports(session,{force});
    if(current!==revision||!snapshot)return;
    // The account's own reports share one history with background preparation.
    mounted=mountReports(root,snapshot,subject?{}:{history:await reportsHistoryFor(snapshot)});
    if(current!==revision){mounted.destroy();mounted=null;return;}
    publishAge(snapshot);
    if(!subject)queueReportsPreparation(session,preparationQueue(session));
    window.ForgeLoader?.ready?.(root);
  }catch(error){
    if(current!==revision)return;
    // Bungie not responding: the last built overview with its age, never presented as live.
    const stored=session?.authenticated?await createReportsLoader({subject}).stored(session).catch(()=>null):null;
    if(stored&&current===revision){
      mounted=mountReports(root,stored,subject?{}:{history:await reportsHistoryFor(stored)});
      const notice=document.createElement('p');notice.className='reports-offline';notice.setAttribute('role','status');
      notice.textContent=`Bungie is not responding. Showing reports from ${ageWords(Date.now()-stored.fetchedAt)}. `;
      const retry=document.createElement('button');retry.type='button';retry.id='reportsRetry';retry.className='rp-tab';retry.textContent='Retry';retry.addEventListener('click',()=>void start({force:true}));
      notice.append(retry);root.prepend(notice);publishAge(stored);
      window.ForgeLoader?.ready?.(root);
    }else{
      // Nothing built yet: the one shared recovery panel (sign-in and retry kept).
      const kind=window.ForgeLoader?.recover?.(error);
      root.innerHTML=`<p role="status">${window.ForgeLoader?.messages?.[kind]||''}</p>`;
    }
  }
}
// The refresh icon forces a full pull.
window.FORGE_REFRESH=()=>start({force:true});
document.addEventListener('forge:reports-section-picked',event=>{
  const session=window.FORGE_BUNGIE_SESSION;
  if(session?.authenticated)preparationQueue(session)?.front(reportSectionKey(event.detail?.activity));
});
window.addEventListener('forge:bungie-session',event=>{
  if(!event.detail?.authenticated){revision++;displayedIdentity='';mounted?.destroy();mounted=null;root.replaceChildren();}
  else if(accountKey(event.detail)!==displayedIdentity)void start({session:event.detail});
});
void start();
