import {LOADOUT_DEFINITIONS} from './guardian-loadout-definitions.mjs';
import {getBungieSession} from './guardian-bungie-auth.mjs?v=20260913-live-character-2';
import {stageBungieLoadoutAction,confirmBungieLoadoutAction,executeBungieLoadoutAction} from './guardian-live-actions.mjs?v=20260905-manual-editor-2';
import {isSavedLoadout,loadoutStatus,loadoutGear,acceptedEquipment} from './guardian-loadout-status.mjs?v=20260925-menu-1';
import {transferFailureReason} from '../vault/vault-transfer-feedback.mjs?v=20260925-feedback-1&columns=20260925-1&toast=20260925-1';

const SLOT_COUNT=20;
const host=()=>document.querySelector('#guardianLoadouts');
let activeCharacterId='',pendingIndex=null,currentLoadouts=[],menuState=null,mutationPending=false,profileProjection=null,projectionBase=null;
const isSaved=isSavedLoadout;
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const absoluteAsset=path=>{try{const url=new URL(path||'','https://www.bungie.net');return path&&url.origin==='https://www.bungie.net'?url.href:'';}catch{return '';}};
const manifestRow=(section,hash)=>LOADOUT_DEFINITIONS?.[section]?.[String(hash)]||null;
function loadoutIdentity(loadout){return {name:manifestRow('names',loadout?.nameHash)?.name||'Saved Loadout',icon:absoluteAsset(manifestRow('icons',loadout?.iconHash)?.iconImagePath),color:absoluteAsset(manifestRow('colors',loadout?.colorHash)?.colorImagePath)};}
function currentProfile(){const profile=globalThis.FORGE_PAGE_PAYLOAD?.profile||{};if(profile!==projectionBase)profileProjection=null;return profileProjection||profile;}
function renderStatus(message,state='pending'){const target=host();if(target)target.innerHTML=`<div class="guardian-loadouts-status is-${escapeHtml(state)}" role="status">${escapeHtml(message)}</div>`;}
function ensureMenu(){
  let menu=document.getElementById('guardianLoadoutMenu');if(menu)return menu;
  menu=document.createElement('section');menu.id='guardianLoadoutMenu';menu.className='guardian-loadout-dropdown';menu.hidden=true;menu.setAttribute('role','menu');menu.setAttribute('aria-label','Loadout actions');document.body.append(menu);return menu;
}
const trigger=index=>host()?.querySelector(`[data-loadout-more="${index}"]`);
function positionMenu(){
  if(menuState?.mode!=='menu')return;
  const menu=ensureMenu(),anchor=trigger(menuState.index)?.closest('.guardian-loadout-entry');if(!anchor){closeMenu();return;}
  const rect=anchor.getBoundingClientRect(),box=menu.getBoundingClientRect(),gap=4;
  menu.style.left=`${Math.max(4,Math.min(rect.left,innerWidth-box.width-4))}px`;
  menu.style.top=`${Math.max(4,Math.min(rect.bottom+gap+box.height<=innerHeight-4?rect.bottom+gap:rect.top-box.height-gap,innerHeight-box.height-4))}px`;
}
function closeMenu({focus=true}={}){
  const index=menuState?.index;menuState=null;ensureMenu().hidden=true;
  document.querySelector('#guardianLoadoutConfirm')?.remove();
  host()?.querySelectorAll('[aria-expanded]').forEach(button=>button.setAttribute('aria-expanded','false'));
  if(focus&&index!==undefined)trigger(index)?.focus();
}
function renderMenu(){
  const menu=ensureMenu();if(!menuState){menu.hidden=true;return;}
  const {index,loadout,mode,action,busy}=menuState;
  if(mode==='confirm'){
    menu.hidden=true;
    let panel=document.getElementById('guardianLoadoutConfirm');
    if(!panel){panel=document.createElement('dialog');panel.id='guardianLoadoutConfirm';panel.className='guardian-loadout-confirm';panel.setAttribute('aria-labelledby','guardianLoadoutConfirmName');document.body.append(panel);panel.addEventListener('cancel',event=>{event.preventDefault();if(!mutationPending)closeMenu();});}
    const identity=loadoutIdentity(loadout),gear=loadoutGear(loadout,currentProfile(),globalThis.FORGE_PAGE_PAYLOAD?.definitions||{});
    panel.innerHTML=`<header>${identity.icon?`<img src="${escapeHtml(identity.icon)}" alt="">`:''}<h2 id="guardianLoadoutConfirmName">${escapeHtml(identity.name)}</h2></header><div class="guardian-loadout-confirm-gear">${gear.map(item=>{const icon=absoluteAsset(item.icon);return icon?`<img src="${escapeHtml(icon)}" alt="${escapeHtml(item.name)}" title="${escapeHtml(item.name)}">`:'<span role="img" aria-label="Item unavailable">?</span>';}).join('')}</div><footer><button type="button" data-loadout-confirm-action="${action}" ${busy?'disabled':''} ${action==='clear'?'class="is-danger"':''}>${action==='clear'?`Clear slot ${index+1}`:'Equip'}</button><button type="button" data-loadout-menu-close ${busy?'disabled':''}>Cancel</button></footer>`;
    if(!panel.open)panel.showModal();return;
  }
  const saved=isSaved(loadout);
  const actions=[['view','Loadout details'],['equip','Equip'],['edit','Edit in Build Forge'],['save','Save as PARADOX loadout'],['snapshot','Overwrite with equipped gear'],['clear',`Clear slot ${index+1}`]];
  menu.innerHTML=actions.map(([value,label])=>`<button type="button" role="menuitem" tabindex="-1" data-loadout-menu-action="${value}" ${!saved&&value!=='snapshot'?'disabled':''} ${value==='clear'?'class="is-danger"':''}>${label}</button>`).join('');
  menu.hidden=false;trigger(index)?.setAttribute('aria-expanded','true');positionMenu();menu.querySelector('button:not(:disabled)')?.focus();
}
function openMenu(index){if(mutationPending||pendingIndex!==null)return;closeMenu({focus:false});menuState={index,characterId:activeCharacterId,loadout:currentLoadouts[index]||null,mode:'menu'};renderMenu();}
function selectLoadout(index,intent){
  if(!isSaved(currentLoadouts[index])||mutationPending||pendingIndex!==null)return;
  pendingIndex=index;render(currentLoadouts);closeMenu();
  document.dispatchEvent(new CustomEvent('forge:loadout-selected',{detail:{index,characterId:activeCharacterId,loadout:currentLoadouts[index],source:'bungie-live',intent}}));
}
export function loadoutFailureReason(error,action='equip'){
  const status=String(error?.payload?.ErrorStatus||''),message=String(error?.message||'');
  if(action==='equip'&&error?.payload&&(/DestinyCharacterNotInSocialSpace|DestinyCannotPerformActionAtThisLocation/.test(status)||/orbit|social space|offline|current (?:activity|location)/i.test(message)))return 'Must be in orbit, a social space or offline';
  if(/reconnect|session|token/i.test(message))return 'Reconnect Bungie';
  const mapped=transferFailureReason(message);return mapped==='Transfer failed'?'Loadout failed':mapped;
}
function showToast(identity,message,failed=false){
  let stack=document.getElementById('guardianLoadoutToasts');if(!stack){stack=document.createElement('section');stack.id='guardianLoadoutToasts';stack.className='guardian-loadout-toasts';stack.setAttribute('aria-label','Loadout updates');document.body.append(stack);}
  const toast=document.createElement('article');toast.className=`guardian-loadout-toast is-${failed?'error':'success'}`;
  toast.innerHTML=`${identity.icon?`<img src="${escapeHtml(identity.icon)}" alt="">`:''}<span role="${failed?'alert':'status'}">${escapeHtml(message)}</span><button type="button" aria-label="Dismiss notification">×</button>`;
  toast.querySelector('button').addEventListener('click',()=>toast.remove());stack.append(toast);
  if(!failed)setTimeout(()=>toast.remove(),2000);
}
async function confirmLoadoutMutation(action){
  if(!menuState||mutationPending)return;
  const {index,characterId,loadout}=menuState,identity=loadoutIdentity(loadout);
  mutationPending=true;menuState.busy=true;if(menuState.mode==='confirm')renderMenu();else ensureMenu().hidden=true;
  try{
    const confirmation=confirmBungieLoadoutAction(menuState.intent);
    let session=globalThis.FORGE_BUNGIE_SESSION;if(!session?.csrfToken)session=await getBungieSession({force:true});
    await executeBungieLoadoutAction(action,{characterId,index,session,confirmation});
    if(characterId===activeCharacterId){
      if(action==='clear'){currentLoadouts=[...currentLoadouts];currentLoadouts[index]=null;}
      if(action==='equip'){const profile=currentProfile();projectionBase=globalThis.FORGE_PAGE_PAYLOAD?.profile;profileProjection=acceptedEquipment(loadout,profile,characterId);}
      render(currentLoadouts);
    }
    if(action==='equip')document.dispatchEvent(new CustomEvent('forge:loadout-selected',{detail:{index,characterId,loadout,source:'bungie-live',intent:'equipped-in-game'}}));
    document.dispatchEvent(new CustomEvent('forge:bungie-profile-refresh-requested',{detail:{reason:`loadout-${action}`,characterId,index}}));
    document.dispatchEvent(new CustomEvent('forge:loadout-action-complete',{detail:{action,index,characterId}}));
    closeMenu();showToast(identity,action==='equip'?`Equipped ${identity.name}`:action==='clear'?`Cleared slot ${index+1}`:`Saved ${identity.name}`);
  }catch(error){closeMenu();showToast(identity,loadoutFailureReason(error,action),true);}
  finally{mutationPending=false;}
}
function render(loadouts=[]){
  const target=host();if(!target)return;currentLoadouts=Array.isArray(loadouts)?loadouts:[];
  target.innerHTML=Array.from({length:SLOT_COUNT},(_,index)=>{
    const loadout=currentLoadouts[index]||null,saved=isSaved(loadout),identity=loadoutIdentity(loadout),status=loadoutStatus(loadout,currentProfile(),activeCharacterId);
    const title=`${saved?identity.name:`Slot ${index+1}`} · ${status.label}`,colorStyle=identity.color?` style="--loadout-color-image:url(${escapeHtml(identity.color)})"`:'';
    return `<div class="guardian-loadout-entry"><button type="button" class="guardian-loadout-slot ${saved?'is-saved':'is-empty'} ${status.state==='equipped'?'is-active':''} ${pendingIndex===index?'is-loading':''}" data-loadout-slot="${index}" data-loadout-state="${status.state}" data-bungie-name-hash="${escapeHtml(loadout?.nameHash||'')}" data-bungie-icon-hash="${escapeHtml(loadout?.iconHash||'')}" data-bungie-color-hash="${escapeHtml(loadout?.colorHash||'')}" aria-label="${escapeHtml(title)}" title="${escapeHtml(title)}" aria-busy="${pendingIndex===index}" ${!saved?'disabled':''}${colorStyle}>${saved&&identity.icon?`<img class="guardian-loadout-icon" src="${escapeHtml(identity.icon)}" alt="">`:''}<small>${index+1}</small>${saved?`<span class="guardian-loadout-badge is-${status.state}" aria-label="${escapeHtml(status.label)}">${status.state==='missing'?'!':'✓'}</span>`:''}</button><button type="button" class="guardian-loadout-more" data-loadout-more="${index}" aria-label="Actions for slot ${index+1}" aria-haspopup="menu" aria-expanded="false" aria-controls="guardianLoadoutMenu">⋮</button></div>`;
  }).join('');
}
document.addEventListener('click',event=>{
  const target=event.target;
  const more=target.closest?.('[data-loadout-more]');if(more){openMenu(Number(more.dataset.loadoutMore));return;}
  const slot=target.closest?.('[data-loadout-slot]');if(slot){selectLoadout(Number(slot.dataset.loadoutSlot),'view-bungie-details');return;}
  if(target.closest?.('[data-loadout-menu-close]')){if(!mutationPending)closeMenu();return;}
  const confirm=target.closest?.('[data-loadout-confirm-action]');if(confirm){void confirmLoadoutMutation(confirm.dataset.loadoutConfirmAction);return;}
  const action=target.closest?.('[data-loadout-menu-action]');if(!action||!menuState){if(menuState?.mode==='menu'&&!target.closest?.('#guardianLoadoutMenu'))closeMenu({focus:false});return;}
  const value=action.dataset.loadoutMenuAction,index=menuState.index;
  if(value==='view'){selectLoadout(index,'view-bungie-details');return;}
  if(value==='edit'){selectLoadout(index,'edit-paradox-copy');return;}
  if(value==='save'){selectLoadout(index,'save-paradox-copy');return;}
  menuState={...menuState,mode:['equip','clear'].includes(value)?'confirm':'menu',action:value,intent:stageBungieLoadoutAction(value,{characterId:menuState.characterId,index,loadoutName:loadoutIdentity(menuState.loadout).name})};
  if(value==='snapshot')void confirmLoadoutMutation(value);else renderMenu();
});
document.addEventListener('keydown',event=>{
  if(!menuState)return;
  if(event.key==='Escape'){event.preventDefault();if(!mutationPending)closeMenu();return;}
  if(menuState.mode!=='menu')return;
  const buttons=[...ensureMenu().querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement);
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();}
  if(event.key==='Tab')closeMenu({focus:false});
});
globalThis.addEventListener('resize',positionMenu);document.addEventListener('scroll',positionMenu,true);
function acceptContext(detail={}){
  if(detail.source&&detail.source!=='bungie-live'){closeMenu();renderStatus('Connect Bungie to load in-game slots','disconnected');return;}
  const characterId=String(detail.characterId||activeCharacterId);
  if(characterId!==activeCharacterId)closeMenu({focus:false});activeCharacterId=characterId;pendingIndex=null;
  if(detail.loadoutsAvailable===true)render(detail.loadouts||[]);else renderStatus('Loadout data unavailable','unavailable');
}
document.addEventListener('forge:guardian-selection-changed',event=>acceptContext(event.detail));
document.addEventListener('forge:guardian-loadout-context',event=>acceptContext(event.detail));
document.addEventListener('forge:bungie-profile-loaded',()=>render(currentLoadouts));
document.addEventListener('forge:bungie-profile-refresh-requested',event=>{
  const detail=event.detail||{};
  if(detail.liveInventory?.profile){const profile=currentProfile();projectionBase=globalThis.FORGE_PAGE_PAYLOAD?.profile;profileProjection={...profile,...detail.liveInventory.profile};render(currentLoadouts);}
  else if(!String(detail.reason||'').startsWith('loadout-')){profileProjection=null;render(currentLoadouts);}
});
document.addEventListener('forge:guardian-loading',()=>renderStatus('Loading loadouts…','pending'));
document.addEventListener('forge:guardian-error',()=>renderStatus('Loadout data unavailable','unavailable'));
document.addEventListener('forge:loadout-loading',event=>{if(Number.isInteger(event.detail?.index))pendingIndex=event.detail.index;if(currentLoadouts.length)render(currentLoadouts);});
document.addEventListener('forge:loadout-error',()=>{pendingIndex=null;if(currentLoadouts.length)render(currentLoadouts);else renderStatus('Loadout data unavailable','unavailable');});
document.addEventListener('forge:beta-fixture-loaded',()=>renderStatus('Connect Bungie to load in-game slots','disconnected'));
renderStatus('Connect Bungie to load in-game slots','disconnected');
export {render as renderGuardianLoadouts,isSaved,loadoutIdentity,renderStatus as renderGuardianLoadoutStatus};
