import {getBungieSession} from '../guardian-workspace-v2/guardian-bungie-auth.mjs?v=20260913-live-character-2';
import {mountForgeShell} from '../guardian-workspace-v2/platform-forge-shell.mjs';
import {preloadReports} from '../../shared/reports-preload.mjs?v=20260925-reports-20c';
import {accountKey} from './reports-data.mjs?v=20260925-reports-20c';
import {mountReports} from './reports-ui.mjs?v=20260925-reports-3&boxes=20260925-20c2';
const root=document.querySelector('#reportsWorkspace');
mountForgeShell({rootSelector:'#reportsWorkspace',layout:'destination'});
let revision=0,displayedIdentity='';
async function start({force=false,session:providedSession}={}){
  const current=++revision;
  root.innerHTML='<p role="status">Loading reports…</p>';
  try{
    const session=providedSession||await getBungieSession();
    displayedIdentity=accountKey(session);
    if(!session?.authenticated)return;
    const snapshot=await preloadReports(session,{force});
    if(current!==revision||!snapshot)return;
    mountReports(root,snapshot);
    window.ForgeLoader?.ready?.(root);
  }catch{
    if(current!==revision)return;
    root.innerHTML='<p role="status">Reports unavailable. <button type="button" id="reportsRetry">Retry</button></p>';
    root.querySelector('#reportsRetry').addEventListener('click',()=>void start({force:true}));
    window.ForgeLoader?.ready?.(root);
  }
}
window.addEventListener('forge:bungie-session',event=>{
  if(!event.detail?.authenticated){revision++;displayedIdentity='';root.replaceChildren();}
  else if(accountKey(event.detail)!==displayedIdentity)void start({session:event.detail});
});
void start();
