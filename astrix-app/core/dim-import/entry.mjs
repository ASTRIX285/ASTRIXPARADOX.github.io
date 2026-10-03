import {watchDimContext} from './context.mjs';
import {DimShareClient,parseDimInput} from './share.mjs';
import {ImportManifest,createImportStorage} from './cache.mjs';
import {adaptDimLoadout} from './adapt.mjs';
import {sendDimToForge} from './handoff.mjs';
import {createDimActions} from './actions.mjs';
import {openLoadoutDetails} from '../../shared/loadout-details.mjs';
import {sessionBinding} from '../../pages/guardian-workspace-v2/guardian-live-actions.mjs';
const storage=createImportStorage(),shares=new DimShareClient({storage}),manifest=new ImportManifest({storage});
let selectedCharacterId='',current=null,currentModel=null;
function context(){
  let stored='';try{stored=sessionStorage.getItem('astrix:selected-character-id')||'';}catch{}
  const characterId=selectedCharacterId||new URLSearchParams(location.search).get('characterId')||stored;
  const payload=globalThis.FORGE_PAGE_PAYLOAD||{};
  return {characterId,profile:payload.profile||{},session:globalThis.FORGE_BUNGIE_SESSION||{},currentSeasonNumber:payload.currentSeasonNumber,manifestVersion:manifest.snapshot?.version||payload.manifestVersion};
}
function style(){
  if(document.querySelector('[data-dim-style]'))return;
  const link=document.createElement('link');link.rel='stylesheet';link.dataset.dimStyle='';link.href=new URL('../../shared/loadout-details.css?v=20260928-fit-row-1&grid=20261001-1',import.meta.url).href;document.head.append(link);
}
export async function importDimLoadout(input,{returnFocus}={}){
  const started=performance.now();const before=context(),binding={...sessionBinding(before.session),characterId:before.characterId};
  const [loadout,snapshot]=await Promise.all([shares.load(input),manifest.ready()]);
  const now=context(),active=sessionBinding(now.session);
  if(active.membershipId!==binding.membershipId||active.membershipType!==binding.membershipType)throw new Error('The account changed. Paste the link again.');
  const {model}=adaptDimLoadout(loadout,{snapshot,profile:now.profile,binding,preferredCharacterId:now.characterId,currentSeasonNumber:now.currentSeasonNumber});
  const actions=createDimActions(model,{getContext:context,getSnapshot:()=>manifest.snapshot,save:async value=>(await import('../../pages/guardian-workspace-v2/paradox-build-space/paradox-saved-loadouts.mjs')).saveParadoxLoadout(value),send:sendDimToForge});
  current?.close();
  const disabledReasons={};if(!now.session.authenticated||!model.binding.characterId)for(const key of ['save','forge'])disabledReasons[key]='Connect Bungie and select a Guardian to use this action.';
  currentModel=model;
  current=openLoadoutDetails(model,{presentation:'icons',actions,actionRows:[['forge','Send to Build Forge'],['save','Save to Armoury']],disabledReasons,returnFocus,onClose:()=>{current=null;currentModel=null;}});
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  return {model,handle:current,renderMs:performance.now()-started};
}
// A DIM share link opens Build Review on its own URL (Miguel, 28 Sep 2026). Only a
// loadout embedded in a DIM app link, which cannot travel in a URL, opens here.
export function buildReviewUrl(input,{characterId='',location:here=globalThis.location}={}){
  let parsed;try{parsed=parseDimInput(input);}catch{return '';}
  if(!parsed.shareId)return '';
  const url=new URL('/astrix-app/pages/build-review/',here.href);
  url.searchParams.set('dim',parsed.shareId);if(/^\d+$/.test(String(characterId)))url.searchParams.set('characterId',String(characterId));url.searchParams.set('step','1');
  return url.href;
}
export function mountDimImport(){
  if(document.querySelector('[data-import-dim]'))return;
  const host=document.querySelector('.working-build-actions')||document.querySelector('.topbar-actions');if(!host)return;
  style();const button=document.createElement('button');button.type='button';button.className='restore-btn';button.dataset.importDim='';button.textContent='Import DIM loadout';host.append(button);
  button.addEventListener('click',()=>{
    const dialog=document.createElement('dialog');dialog.id='dimImportDialog';dialog.className='apx-loadout-details dim-import-dialog';dialog.setAttribute('aria-label','Import DIM loadout');
    dialog.innerHTML='<header class="apx-ld-header dim-import-hero"><div><p class="dim-import-kicker">LOADOUT IMPORT</p><h2>Import DIM loadout</h2><p class="dim-import-intro">Bring your next build to the forge.</p></div><button type="button" data-close aria-label="Close DIM import">Close</button></header><form class="apx-ld-scroll dim-import-form"><label for="dimImportLink">DIM link or share ID</label><p id="dimImportHint">Paste a shared loadout link from DIM, or its share ID.</p><input id="dimImportLink" name="link" type="text" placeholder="https://dim.gg/…" autocomplete="off" spellcheck="false" required aria-describedby="dimImportHint" aria-label="DIM link or share ID"><button class="dim-import-submit" type="submit">Import loadout</button><p class="dim-import-status" role="status" aria-live="polite"></p></form>';
    document.body.append(dialog);dialog.showModal();dialog.querySelector('input').focus();let importing=false;
    const close=()=>{if(importing)return;dialog.close();dialog.remove();button.focus();};dialog.querySelector('[data-close]').onclick=close;dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    dialog.querySelector('form').addEventListener('submit',async event=>{event.preventDefault();if(importing)return;importing=true;dialog.querySelector('[type=submit]').disabled=true;dialog.querySelector('[role=status]').textContent='Loading loadout…';try{const input=dialog.querySelector('input').value;const review=buildReviewUrl(input,{characterId:context().characterId});if(review){importing=false;location.assign(review);return;}await importDimLoadout(input,{returnFocus:button});dialog.close();dialog.remove();}catch(error){dialog.querySelector('[role=status]').textContent=error.message;}finally{importing=false;dialog.querySelector('[type=submit]').disabled=false;}});
  });
  // Start indexing after the host has loaded; repeat version checks only on a
  // visible-tab return. Shares themselves never get background refetched.
  const warm=()=>{void manifest.ready().catch(()=>{});};
  if(globalThis.requestIdleCallback)requestIdleCallback(warm,{timeout:5000});else setTimeout(warm,1000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void manifest.refresh().catch(()=>{});});
  watchDimContext({document,window:globalThis,getModel:()=>currentModel,getContext:context,onCharacter:id=>{selectedCharacterId=id;},invalidate:message=>current?.invalidate(message)});
}
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mountDimImport,{once:true});else mountDimImport();}
