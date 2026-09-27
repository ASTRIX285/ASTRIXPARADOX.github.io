import {getBungieSession} from '../guardian-workspace-v2/guardian-bungie-auth.mjs?v=20260913-live-character-2&refresh=20260927-1&recovery=20260927-1';
import {mountForgeShell} from '../guardian-workspace-v2/platform-forge-shell.mjs';
import {preloadReports} from '../../shared/reports-preload.mjs?v=20260925-reports-20c&refresh=20260927-1&recovery=20260927-1';
import {accountKey,createReportsLoader} from './reports-data.mjs?v=20260927-three-stage-1';
import {mountReports} from './reports-ui.mjs?v=20260927-difficulty-lists-1';
const root=document.querySelector('#reportsWorkspace');
mountForgeShell({rootSelector:'#reportsWorkspace',layout:'destination'});
let revision=0,displayedIdentity='',mounted=null;
async function start({force=false,session:providedSession}={}){
  const current=++revision;
  mounted?.destroy();mounted=null;
  root.innerHTML='<p role="status">Loading reports…</p>';
  try{
    const session=providedSession||await getBungieSession();
    displayedIdentity=accountKey(session);
    if(!session?.authenticated)return;
    const params=new URL(location.href).searchParams;
    const subjectId=params.get('subjectId'),subjectType=params.get('subjectType');
    const subject=subjectId&&/^\d+$/.test(subjectId)&&/^(1|2|3|5|6|10)$/.test(subjectType||'')?{membershipId:subjectId,membershipType:Number(subjectType)}:null;
    const snapshot=subject?await createReportsLoader({subject}).load(session,{force}):await preloadReports(session,{force});
    if(current!==revision||!snapshot)return;
    mounted=mountReports(root,snapshot);
    window.ForgeLoader?.ready?.(root);
  }catch{
    if(current!==revision)return;
    root.innerHTML='<p role="status">Reports unavailable. <button type="button" id="reportsRetry">Retry</button></p>';
    root.querySelector('#reportsRetry').addEventListener('click',()=>void start({force:true}));
    window.ForgeLoader?.ready?.(root);
  }
}
window.addEventListener('forge:bungie-session',event=>{
  if(!event.detail?.authenticated){revision++;displayedIdentity='';mounted?.destroy();mounted=null;root.replaceChildren();}
  else if(accountKey(event.detail)!==displayedIdentity)void start({session:event.detail});
});
void start();
