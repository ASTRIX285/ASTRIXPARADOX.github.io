import {LOADOUT_DEFINITIONS} from './guardian-loadout-definitions.mjs';
import {getBungieSession} from './guardian-bungie-auth.mjs?v=20260905-manual-editor-1';
import {stageBungieLoadoutAction,confirmBungieLoadoutAction,executeBungieLoadoutAction} from './guardian-live-actions.mjs?v=20260905-manual-editor-2';

const SLOT_COUNT=20;
const BUNGIE_ORIGIN='https://www.bungie.net';
const host=()=>document.querySelector('#guardianLoadouts');
let activeCharacterId='';
let activeGuardianLabel='Guardian';
let activeIndex=null;
let pendingIndex=null;
let currentLoadouts=[];
let menuState=null;

const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const absoluteAsset=path=>path?new URL(path,BUNGIE_ORIGIN).toString():'';
const manifestRow=(section,hash)=>LOADOUT_DEFINITIONS?.[section]?.[String(hash)]||null;

function loadoutIdentity(loadout){
  const name=manifestRow('names',loadout?.nameHash)?.name||'Saved Loadout';
  const icon=absoluteAsset(manifestRow('icons',loadout?.iconHash)?.iconImagePath);
  const color=absoluteAsset(manifestRow('colors',loadout?.colorHash)?.colorImagePath);
  return {name,icon,color};
}

function isSaved(loadout){return Boolean(loadout&&(loadout.items?.length||loadout.subclassOverrides?.length));}

function renderStatus(message,state='pending'){
  const target=host();if(!target)return;
  target.innerHTML=`<div class="guardian-loadouts-status is-${escapeHtml(state)}" role="status">${escapeHtml(message)}</div>`;
}

function ensureMenu(){
  let overlay=document.getElementById('guardianLoadoutMenu');if(overlay)return overlay;
  overlay=document.createElement('section');overlay.id='guardianLoadoutMenu';overlay.className='guardian-loadout-menu-overlay';overlay.hidden=true;overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','guardianLoadoutMenuTitle');document.body.appendChild(overlay);return overlay;
}

function actionCopy(action,index,identity){
  const slot=index+1,guardian=`${activeGuardianLabel} · Guardian ${activeCharacterId}`;
  if(action==='equip')return {eyebrow:'LIVE IN-GAME LOADOUT CHANGE',title:`APPLY BUNGIE SLOT ${slot} IN GAME?`,body:`Apply saved Bungie slot “${identity.name}” to ${guardian} in Destiny. This is the in-game loadout action, separate from the Build Forge Apply button. Destiny must be in orbit, a social space, or offline.`,confirm:'APPLY THIS IN-GAME LOADOUT'};
  if(action==='snapshot')return {eyebrow:'DESTRUCTIVE LOADOUT CHANGE',title:`OVERWRITE BUNGIE SLOT ${slot}?`,body:`Replace ${identity.name==='Saved Loadout'?'the empty slot':`“${identity.name}”`} in slot ${slot} with the items currently equipped on ${guardian}. This does not copy the un-applied PARADOX Working Build.`,confirm:'OVERWRITE THIS SLOT'};
  return {eyebrow:'DESTRUCTIVE LOADOUT CHANGE',title:`CLEAR BUNGIE SLOT ${slot}?`,body:`Remove the name, icon, colour and saved items from “${identity.name}” in slot ${slot} for ${guardian}.`,confirm:'CLEAR THIS SLOT'};
}

function renderMenu(){
  const overlay=ensureMenu();if(!menuState){overlay.hidden=true;document.body.classList.remove('loadout-menu-open');return;}
  const {index,loadout,mode='menu',action='',busy=false,result=null,error=''}=menuState,saved=isSaved(loadout),identity=loadoutIdentity(loadout),slot=index+1;
  if(mode==='confirm'){
    const copy=actionCopy(action,index,identity);
    overlay.innerHTML=`<div class="guardian-loadout-menu-dialog"><header><small>${copy.eyebrow}</small><h2 id="guardianLoadoutMenuTitle">${escapeHtml(copy.title)}</h2><p>${escapeHtml(copy.body)}</p></header>${error?`<div class="guardian-loadout-menu-status is-bad">${escapeHtml(error)}</div>`:''}<footer><button type="button" data-loadout-menu-close ${busy?'disabled':''}>CANCEL</button><button type="button" class="is-danger" data-loadout-confirm-action="${escapeHtml(action)}" ${busy?'disabled':''}>${busy?'CONTACTING BUNGIE…':copy.confirm}</button></footer></div>`;
  }else if(mode==='result'){
    const ok=!error;
    overlay.innerHTML=`<div class="guardian-loadout-menu-dialog"><header><small>${ok?'BUNGIE READBACK REQUESTED':'BUNGIE ACTION INCOMPLETE'}</small><h2 id="guardianLoadoutMenuTitle">${ok?'LOADOUT ACTION COMPLETED':'LOADOUT ACTION FAILED'}</h2><p>${escapeHtml(error||result||'The in-game loadout action completed. The Guardian profile is refreshing.')}</p></header><footer><button type="button" data-loadout-menu-close>DONE</button></footer></div>`;
  }else{
    overlay.innerHTML=`<div class="guardian-loadout-menu-dialog"><header><small>IN-GAME LOADOUT · BUNGIE SLOT ${slot}</small><h2 id="guardianLoadoutMenuTitle">${escapeHtml(saved?identity.name:'EMPTY SLOT')}</h2><p>${escapeHtml(activeGuardianLabel)} · Guardian ${escapeHtml(activeCharacterId)} · choose an explicit action.</p></header><div class="guardian-loadout-menu-actions">${saved?`<button type="button" data-loadout-menu-action="view"><b>VIEW DETAILS</b><span>Load this saved Bungie slot for inspection.</span></button><button type="button" data-loadout-menu-action="edit"><b>EDIT A PARADOX COPY</b><span>Load this slot into a separate Working Build.</span></button><button type="button" data-loadout-menu-action="save"><b>SAVE AS PARADOX COPY</b><span>Load it, then name a browser-only PARADOX copy.</span></button><button type="button" data-loadout-menu-action="equip"><b>Apply</b><span>Apply this saved Bungie slot in game; separate from Build Forge Apply. Final confirmation required.</span></button>`:''}<button type="button" data-loadout-menu-action="snapshot"><b>${saved?'OVERWRITE SLOT':'SAVE CURRENT EQUIPMENT'}</b><span>Snapshot the items currently equipped in Destiny.</span></button>${saved?'<button type="button" class="is-danger" data-loadout-menu-action="clear"><b>CLEAR SLOT</b><span>Remove this Bungie loadout after confirmation.</span></button>':''}</div><footer><button type="button" data-loadout-menu-close>CLOSE</button></footer></div>`;
  }
  overlay.hidden=false;document.body.classList.add('loadout-menu-open');queueMicrotask(()=>overlay.querySelector('button')?.focus());
}

function closeMenu(){menuState=null;renderMenu();}
function openMenu(index){if(pendingIndex!==null)return;menuState={index,loadout:currentLoadouts[index]||null,mode:'menu'};renderMenu();}

function selectLoadout(index,intent){
  if(!isSaved(currentLoadouts[index])||pendingIndex!==null)return;
  pendingIndex=index;render(currentLoadouts);closeMenu();
  document.dispatchEvent(new CustomEvent('forge:loadout-selected',{detail:{index,characterId:activeCharacterId,loadout:currentLoadouts[index],source:'bungie-live',intent}}));
}

async function confirmLoadoutMutation(action){
  if(!menuState||menuState.busy)return;
  const index=menuState.index;menuState={...menuState,busy:true,error:''};renderMenu();
  try{
    let session=globalThis.FORGE_BUNGIE_SESSION;if(!session?.csrfToken)session=await getBungieSession({force:true});
    const confirmation=confirmBungieLoadoutAction(menuState.intent);
    await executeBungieLoadoutAction(action,{characterId:activeCharacterId,index,session,confirmation});
    if(action==='clear'){currentLoadouts=[...currentLoadouts];currentLoadouts[index]=null;if(activeIndex===index)activeIndex=null;render(currentLoadouts);}
    if(action==='equip')document.dispatchEvent(new CustomEvent('forge:loadout-selected',{detail:{index,characterId:activeCharacterId,loadout:currentLoadouts[index],source:'bungie-live',intent:'equipped-in-game'}}));
    document.dispatchEvent(new CustomEvent('forge:bungie-profile-refresh-requested',{detail:{reason:`loadout-${action}`,characterId:activeCharacterId,index}}));
    document.dispatchEvent(new CustomEvent('forge:loadout-action-complete',{detail:{action,index,characterId:activeCharacterId}}));
    menuState={...menuState,busy:false,mode:'result',result:`Bungie slot ${index+1} was ${action==='snapshot'?'overwritten from current in-game equipment':action==='clear'?'cleared':'equipped'}.`,error:''};renderMenu();
  }catch(error){menuState={...menuState,busy:false,mode:'result',error:error?.message||'The Bungie loadout action failed.'};renderMenu();}
}

function render(loadouts=[]){
  const target=host();if(!target)return;
  const rows=Array.isArray(loadouts)?loadouts:[];currentLoadouts=rows;
  target.innerHTML=Array.from({length:SLOT_COUNT},(_,index)=>{
    const loadout=rows[index]||null,saved=isSaved(loadout);
    if(!saved){const title=`Empty Bungie loadout slot ${index+1} · open actions`;return `<button type="button" class="guardian-loadout-slot is-empty" data-loadout-slot="${index}" aria-label="${title}" title="${title}"><span class="guardian-loadout-empty-label" aria-hidden="true">EMPTY</span><small>${index+1}</small></button>`;}
    const identity=loadoutIdentity(loadout),title=`${identity.name}, Bungie loadout slot ${index+1} · open actions`,colorStyle=identity.color?` style="--loadout-color-image:url(${escapeHtml(identity.color)})"`:'';
    const icon=identity.icon?`<img class="guardian-loadout-icon" src="${escapeHtml(identity.icon)}" alt="" loading="eager" decoding="async">`:'<span class="guardian-loadout-icon-fallback" aria-hidden="true">◆</span>';
    return `<button type="button" class="guardian-loadout-slot is-saved ${activeIndex===index?'is-active':''} ${pendingIndex===index?'is-loading':''}" data-loadout-slot="${index}" data-bungie-name-hash="${escapeHtml(loadout.nameHash||'')}" data-bungie-icon-hash="${escapeHtml(loadout.iconHash||'')}" data-bungie-color-hash="${escapeHtml(loadout.colorHash||'')}" aria-label="${escapeHtml(title)}" title="${escapeHtml(title)}" aria-busy="${pendingIndex===index}"${colorStyle}>${icon}<span class="guardian-loadout-name" aria-hidden="true">${escapeHtml(identity.name)}</span><small>${index+1}</small></button>`;
  }).join('');
  target.querySelectorAll('[data-loadout-slot]').forEach(button=>button.addEventListener('click',()=>openMenu(Number(button.dataset.loadoutSlot))));
}

document.addEventListener('click',event=>{
  const close=event.target.closest?.('[data-loadout-menu-close]');if(close){closeMenu();return;}
  const confirm=event.target.closest?.('[data-loadout-confirm-action]');if(confirm){void confirmLoadoutMutation(confirm.dataset.loadoutConfirmAction);return;}
  const action=event.target.closest?.('[data-loadout-menu-action]');if(!action||!menuState)return;
  const value=action.dataset.loadoutMenuAction,index=menuState.index;
  if(value==='view'){selectLoadout(index,'view-bungie-details');return;}
  if(value==='edit'){selectLoadout(index,'edit-paradox-copy');return;}
  if(value==='save'){selectLoadout(index,'save-paradox-copy');return;}
  const identity=loadoutIdentity(menuState.loadout);menuState={...menuState,mode:'confirm',action:value,intent:stageBungieLoadoutAction(value,{characterId:activeCharacterId,index,loadoutName:identity.name})};renderMenu();
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menuState)closeMenu();});

document.addEventListener('forge:guardian-selection-changed',event=>{
  if(event.detail?.source!=='bungie-live'){renderStatus('Connect Bungie to load in-game slots','disconnected');return;}
  if(event.detail?.loadoutsAvailable!==true){renderStatus('Bungie loadout component unavailable','unavailable');return;}
  activeCharacterId=String(event.detail?.characterId||activeCharacterId||'');activeGuardianLabel=String(event.detail?.characterClass||event.detail?.displayName||'Guardian').toUpperCase();activeIndex=Number.isInteger(event.detail?.selectedLoadoutIndex)?event.detail.selectedLoadoutIndex:null;pendingIndex=null;render(event.detail?.loadouts||[]);
});
document.addEventListener('forge:guardian-loadout-context',event=>{
  const detail=event.detail||{};activeCharacterId=String(detail.characterId||activeCharacterId||'');activeGuardianLabel=String(detail.characterClass||detail.displayName||activeGuardianLabel||'Guardian').toUpperCase();if(Number.isInteger(detail.selectedLoadoutIndex))activeIndex=detail.selectedLoadoutIndex;pendingIndex=null;if(detail.loadoutsAvailable===true)render(detail.loadouts||[]);else renderStatus('Bungie loadout component unavailable','unavailable');
});
document.addEventListener('forge:guardian-loading',()=>renderStatus('Loading Bungie loadouts…','pending'));
document.addEventListener('forge:guardian-error',()=>renderStatus('Loadout data unavailable','unavailable'));
document.addEventListener('forge:loadout-loading',event=>{if(Number.isInteger(event.detail?.index))pendingIndex=event.detail.index;if(currentLoadouts.length)render(currentLoadouts);});
document.addEventListener('forge:loadout-error',()=>{pendingIndex=null;if(currentLoadouts.length)render(currentLoadouts);else renderStatus('Loadout data unavailable','unavailable');});
document.addEventListener('forge:beta-fixture-loaded',()=>renderStatus('Connect Bungie to load in-game slots','disconnected'));
renderStatus('Connect Bungie to load in-game slots','disconnected');

export {render as renderGuardianLoadouts,isSaved,loadoutIdentity,renderStatus as renderGuardianLoadoutStatus};
