import {DimShareClient} from './share.mjs';
import {ImportManifest,createImportStorage} from './cache.mjs';
import {resolveDimLoadout} from './resolve.mjs';
import {createDimActions} from './actions.mjs';
import {openLoadoutDetails} from '../../shared/loadout-details.mjs?v=20260927-dim-import-1';
import {sessionBinding} from '../../pages/guardian-workspace-v2/guardian-live-actions.mjs?v=20260905-manual-editor-2&plain=20260925-2';
const storage=createImportStorage(),shares=new DimShareClient({storage}),manifest=new ImportManifest({storage});
let selectedCharacterId='',current=null;
function context(){
  let stored='';try{stored=sessionStorage.getItem('astrix:selected-character-id')||'';}catch{}
  const characterId=selectedCharacterId||new URLSearchParams(location.search).get('characterId')||stored;
  const payload=globalThis.FORGE_PAGE_PAYLOAD||{};
  return {characterId,profile:payload.profile||{},session:globalThis.FORGE_BUNGIE_SESSION||{},manifestVersion:manifest.snapshot?.version||payload.manifestVersion};
}
function style(){
  if(document.querySelector('[data-dim-style]'))return;
  const link=document.createElement('link');link.rel='stylesheet';link.dataset.dimStyle='';link.href=new URL('../../shared/loadout-details.css?v=20260927-loadout-details-1',import.meta.url).href;document.head.append(link);
}
async function send(build){
  const [{createBuildState},{createHandoffEnvelope}]=await Promise.all([import('../../pages/guardian-workspace-v2/paradox-build-space/paradox-build-state.mjs'),import('../../pages/guardian-workspace-v2/paradox-build-binding.mjs')]);
  sessionStorage.setItem('astrix:paradox-build-space:v1',JSON.stringify(createHandoffEnvelope(createBuildState(build))));
  const target=new URL('../../pages/guardian-workspace-v2/paradox-build-space/',import.meta.url);
  for(const key of ['characterId','membershipId','membershipType'])target.searchParams.set(key,String(build[key]));
  location.assign(target.href);
}
export async function importDimLoadout(input,{returnFocus}={}){
  const started=performance.now();const before=context(),binding={...sessionBinding(before.session),characterId:before.characterId};
  const [loadout,snapshot]=await Promise.all([shares.load(input),manifest.ready()]);
  const now=context(),active=sessionBinding(now.session);
  if(now.characterId!==before.characterId||active.membershipId!==binding.membershipId||active.membershipType!==binding.membershipType)throw new Error('The account or Guardian changed. Paste the link again.');
  const model=resolveDimLoadout(loadout,{snapshot,profile:now.profile,binding});
  const actions=createDimActions(model,{getContext:context,save:async value=>(await import('../../pages/guardian-workspace-v2/paradox-build-space/paradox-saved-loadouts.mjs?v=20260905-manual-editor-2&plain=20260925-2&refresh=20260927-1')).saveParadoxLoadout(value),send,refresh:()=>document.dispatchEvent(new CustomEvent('forge:bungie-profile-refresh-requested',{detail:{reason:'dim-apply'}}))});
  current?.close();
  const disabledReasons={};if(!now.session.authenticated||!binding.characterId)for(const key of ['equip','save','forge'])disabledReasons[key]='Connect Bungie and select a Guardian to use this action.';
  current=openLoadoutDetails(model,{actions,actionRows:[['forge','Send to Build Forge'],['save','Save as PARADOX loadout'],['equip','Equip']],disabledReasons,returnFocus,onClose:()=>{current=null;}});
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  return {model,handle:current,renderMs:performance.now()-started};
}
export function mountDimImport(){
  if(document.querySelector('[data-import-dim]'))return;
  const host=document.querySelector('.working-build-actions')||document.querySelector('.topbar-actions');if(!host)return;
  style();const button=document.createElement('button');button.type='button';button.className='restore-btn';button.dataset.importDim='';button.textContent='Import DIM loadout';host.append(button);
  button.addEventListener('click',()=>{
    const dialog=document.createElement('dialog');dialog.className='apx-loadout-details';dialog.setAttribute('aria-label','Import DIM loadout');
    dialog.innerHTML='<header class="apx-ld-header"><h2>Import DIM loadout</h2><button type="button" data-close>Close</button></header><form class="apx-ld-scroll"><label>DIM link or share ID<input name="link" type="text" autocomplete="off" spellcheck="false" required aria-label="DIM link or share ID"></label><button type="submit">Import loadout</button><p role="status" aria-live="polite"></p></form>';
    document.body.append(dialog);dialog.showModal();dialog.querySelector('input').focus();let importing=false;
    const close=()=>{if(importing)return;dialog.close();dialog.remove();button.focus();};dialog.querySelector('[data-close]').onclick=close;dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    dialog.querySelector('form').addEventListener('submit',async event=>{event.preventDefault();if(importing)return;importing=true;dialog.querySelector('[type=submit]').disabled=true;dialog.querySelector('[role=status]').textContent='Loading loadout…';try{const input=dialog.querySelector('input').value;await importDimLoadout(input,{returnFocus:button});dialog.close();dialog.remove();}catch(error){dialog.querySelector('[role=status]').textContent=error.message;}finally{importing=false;dialog.querySelector('[type=submit]').disabled=false;}});
  });
  // Start indexing after the host has loaded; repeat version checks only on a
  // visible-tab return. Shares themselves never get background refetched.
  const warm=()=>{void manifest.ready().catch(()=>{});};
  if(globalThis.requestIdleCallback)requestIdleCallback(warm,{timeout:5000});else setTimeout(warm,1000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void manifest.refresh().catch(()=>{});});
  for(const name of ['forge:character-selected','forge:guardian-selection-changed','forge:guardian-loadout-context'])document.addEventListener(name,event=>{if(event.detail?.characterId)selectedCharacterId=String(event.detail.characterId);current?.invalidate('The Guardian data changed. Import this loadout again.');});
  globalThis.addEventListener('forge:bungie-session',()=>current?.invalidate('The account changed. Import this loadout again.'));
}
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mountDimImport,{once:true});else mountDimImport();}
