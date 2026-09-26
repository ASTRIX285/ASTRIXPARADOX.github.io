import {LOADOUT_DEFINITIONS} from './guardian-loadout-definitions.mjs';
import {getBungieSession} from './guardian-bungie-auth.mjs?v=20260913-live-character-2&plain=20260925-2';
import {stageBungieLoadoutAction,confirmBungieLoadoutAction,executeBungieLoadoutAction} from './guardian-live-actions.mjs?v=20260905-manual-editor-2&plain=20260925-2';
import {isSavedLoadout,loadoutStatus,loadoutGear,acceptedEquipment} from './guardian-loadout-status.mjs?v=20260925-menu-1';
import {transferFailureReason} from '../vault/vault-transfer-feedback.mjs?v=20260925-feedback-1&columns=20260925-1&toast=20260925-1';

const SLOT_COUNT=20;
const host=()=>document.querySelector('#guardianLoadouts');
let activeCharacterId='',pendingIndex=null,currentLoadouts=[],menuState=null,detailState=null,mutationPending=false,profileProjection=null,projectionBase=null,sharedLinkOpened=false;
const isSaved=isSavedLoadout;
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const absoluteAsset=path=>{try{const url=new URL(path||'','https://www.bungie.net');return path&&url.origin==='https://www.bungie.net'?url.href:'';}catch{return '';}};
const manifestRow=(section,hash)=>LOADOUT_DEFINITIONS?.[section]?.[String(hash)]||null;
function loadoutIdentity(loadout){return {name:manifestRow('names',loadout?.nameHash)?.name||'Saved Loadout',icon:absoluteAsset(manifestRow('icons',loadout?.iconHash)?.iconImagePath),color:absoluteAsset(manifestRow('colors',loadout?.colorHash)?.colorImagePath)};}
const hashOf=row=>Number(row?.hash??row?.itemHash??row?.bungieHash);
const uniqueRows=rows=>rows.filter((row,index,all)=>row&&all.findIndex(other=>hashOf(other)===hashOf(row)&&Number(other?.socketIndex??-1)===Number(row?.socketIndex??-1))===index);
function selectedSocketRows(loadoutItem,resolved=[]){
  const byHash=new Map(uniqueRows(resolved).filter(row=>Number.isInteger(hashOf(row))).map(row=>[hashOf(row),row]));
  return (loadoutItem?.plugItemHashes||[]).map((value,socketIndex)=>{
    const hash=Number(value),row=byHash.get(hash);
    return row?{...row,socketIndex:Number.isInteger(Number(row.socketIndex))?Number(row.socketIndex):socketIndex,unavailable:false}:{hash:Number.isInteger(hash)?hash:null,socketIndex,unavailable:true,name:'Unavailable socket',icon:''};
  });
}
function loadoutDetailRows(loadout,detail={}){
  const raw=[...(loadout?.items||[]),...(loadout?.subclassOverrides||[])],rawById=new Map(raw.map(row=>[String(row?.itemInstanceId||''),row]));
  const subclassCandidates=[detail.super,...(detail.abilities||[]),...(detail.aspects||[]),...(detail.fragments||[])].filter(Boolean);
  const subclassRaw=rawById.get(String(detail.subclassItemInstanceId||''))||(loadout?.subclassOverrides||[])[0]||null;
  const itemRows=(items,kind)=>Array.from(items||[]).filter(Boolean).map(item=>{
    const source=rawById.get(String(item?.itemInstanceId||''))||null;
    const semantics=item?.armourSemantics||{};
    const resolved=kind==='weapon'
      ?[item.intrinsic,...(item.selectedPerks||[]),...(item.weaponSemantics?.modSockets||[]),item.weaponMod,item.catalyst,...(item.weaponSemantics?.unknownPlugs||[])].filter(Boolean)
      :[semantics.masterwork,semantics.archetype,semantics.exoticPerk,item.masterwork,item.archetype,item.intrinsicTrait,...(semantics.generalMods||item.generalMods||[]),...(semantics.slotMods||item.slotMods||[]),...(item.mods||[]),item.shader,item.ornament,...(item.appearancePlugs||[]),...(semantics.unknownPlugs||[])].filter(Boolean);
    return {kind,item,source,sockets:selectedSocketRows(source,resolved)};
  }).filter(row=>row.source);
  const weapons=itemRows(detail.weapons,'weapon'),armour=itemRows(detail.armour,'armour');
  const resolvedIds=new Set([detail.subclassItemInstanceId,...weapons.map(row=>row.item.itemInstanceId),...armour.map(row=>row.item.itemInstanceId)].map(String));
  return {subclass:{item:detail.subclassItem||{name:detail.subclassName||'Subclass',icon:detail.subclassIcon||''},source:subclassRaw,sockets:selectedSocketRows(subclassRaw,subclassCandidates)},weapons,armour,unavailable:raw.filter(row=>!resolvedIds.has(String(row?.itemInstanceId||'')))};
}
function currentProfile(){const profile=globalThis.FORGE_PAGE_PAYLOAD?.profile||{};if(profile!==projectionBase)profileProjection=null;return profileProjection||profile;}
function renderStatus(message,state='pending'){const target=host();if(target)target.innerHTML=`<div class="guardian-loadouts-status is-${escapeHtml(state)}" role="status">${escapeHtml(message)}</div>`;}
function ensureMenu(){
  let menu=document.getElementById('guardianLoadoutMenu');if(menu)return menu;
  menu=document.createElement('section');menu.id='guardianLoadoutMenu';menu.className='guardian-loadout-dropdown';menu.hidden=true;menu.setAttribute('role','menu');menu.setAttribute('aria-label','Loadout actions');document.body.append(menu);return menu;
}
function ensureDetails(){
  let panel=document.getElementById('guardianLoadoutDetails');if(panel)return panel;
  panel=document.createElement('dialog');panel.id='guardianLoadoutDetails';panel.className='guardian-loadout-details';panel.setAttribute('aria-labelledby','guardianLoadoutDetailsName');document.body.append(panel);
  panel.addEventListener('cancel',event=>{event.preventDefault();if(!mutationPending)closeDetails();});
  panel.addEventListener('close',()=>{const opener=detailState?.opener;detailState=null;opener?.isConnected&&opener.focus();});
  return panel;
}
function socketMarkup(socket){
  const icon=absoluteAsset(socket?.icon||socket?.definition?.displayProperties?.icon),name=socket?.unavailable?'Empty or unavailable socket':String(socket?.name||socket?.definition?.displayProperties?.name||'Unnamed socket');
  return `<span class="guardian-loadout-detail-socket ${socket?.unavailable?'is-empty':''}" ${socket?.unavailable?'data-empty-socket':''} title="${escapeHtml(name)}">${icon?`<img src="${escapeHtml(icon)}" alt="">`:`<span aria-hidden="true">${socket?.unavailable?'−':'?'}</span>`}<small>${escapeHtml(name)}</small></span>`;
}
function itemMarkup(row){
  const item=row.item||{},icon=absoluteAsset(item.icon||item.definition?.displayProperties?.icon),name=String(item.name||item.definition?.displayProperties?.name||'Unavailable saved item');
  const sockets=row.sockets.length?row.sockets.map(socketMarkup).join(''):'<span class="guardian-loadout-detail-socket is-empty" data-empty-socket><span aria-hidden="true">−</span><small>Empty socket</small></span>';
  return `<article class="guardian-loadout-detail-row" data-loadout-row-kind="${row.kind}"><div class="guardian-loadout-detail-item">${icon?`<img src="${escapeHtml(icon)}" alt="">`:'<span aria-hidden="true">?</span>'}<strong>${escapeHtml(name)}</strong></div><div class="guardian-loadout-detail-sockets">${sockets}</div></article>`;
}
function renderDetails(){
  if(!detailState)return;const panel=ensureDetails(),{index,loadout,detail}=detailState,identity=loadoutIdentity(loadout);
  if(!detail){panel.innerHTML=`<header class="guardian-loadout-detail-header">${identity.icon?`<img src="${escapeHtml(identity.icon)}" alt="">`:''}<div><small>Slot ${index+1}</small><h2 id="guardianLoadoutDetailsName">${escapeHtml(identity.name)}</h2></div><button type="button" data-loadout-details-close aria-label="Close loadout details">×</button></header><p class="guardian-loadout-detail-loading" role="status">Resolving saved sockets…</p>`;if(!panel.open)panel.showModal();return;}
  const rows=loadoutDetailRows(loadout,detail),subclass={kind:'subclass',item:rows.subclass.item,sockets:rows.subclass.sockets};
  panel.innerHTML=`<header class="guardian-loadout-detail-header">${identity.icon?`<img src="${escapeHtml(identity.icon)}" alt="">`:''}<div><small>Slot ${index+1}</small><h2 id="guardianLoadoutDetailsName">${escapeHtml(identity.name)}</h2></div><button type="button" data-loadout-details-close aria-label="Close loadout details">×</button></header><nav class="guardian-loadout-detail-actions" aria-label="Loadout actions">${[['equip','Equip'],['prepare','Prepare equip'],['identifiers','Edit identifiers'],['save','Save as PARADOX loadout'],['share','Share'],['clear','Clear slot']].map(([value,label])=>`<button type="button" data-loadout-detail-action="${value}" ${mutationPending?'disabled':''}>${label}</button>`).join('')}</nav><section class="guardian-loadout-detail-list" aria-label="Saved loadout sockets">${itemMarkup(subclass)}${rows.weapons.map(itemMarkup).join('')}${rows.armour.map(itemMarkup).join('')}${rows.unavailable.map(()=>itemMarkup({kind:'unavailable',item:null,sockets:[]})).join('')}</section><p class="guardian-loadout-detail-note">Sockets shown are the saved selections returned by Bungie. Unresolved item or plug identifiers remain unavailable.</p>`;
  if(!panel.open)panel.showModal();
}
function openDetails(index){
  if(!isSaved(currentLoadouts[index])||mutationPending||pendingIndex!==null)return;const active=document.activeElement,opener=active?.matches?.('[data-loadout-slot]')?active:trigger(index);
  detailState={index,characterId:activeCharacterId,loadout:currentLoadouts[index],detail:null,opener};renderDetails();selectLoadout(index,'view-bungie-details');
}
function closeDetails(){if(mutationPending)return;const panel=ensureDetails();if(panel.open)panel.close();else detailState=null;}
function ensureIdentifiers(){
  let panel=document.getElementById('guardianLoadoutIdentifiers');if(panel)return panel;
  panel=document.createElement('dialog');panel.id='guardianLoadoutIdentifiers';panel.className='guardian-loadout-identifiers';panel.setAttribute('aria-labelledby','guardianLoadoutIdentifiersName');document.body.append(panel);
  panel.addEventListener('cancel',event=>{event.preventDefault();if(!mutationPending)panel.close();});return panel;
}
function definitionOptions(section,selected){return Object.entries(LOADOUT_DEFINITIONS?.[section]||{}).map(([hash,row],index)=>`<option value="${hash}" ${Number(hash)===Number(selected)?'selected':''}>${escapeHtml(row.name||`${section.slice(0,-1)} ${index+1}`)}</option>`).join('');}
function openIdentifiers(){
  if(!detailState)return;const loadout=detailState.loadout,panel=ensureIdentifiers();
  panel.innerHTML=`<form method="dialog"><header><h2 id="guardianLoadoutIdentifiersName">Edit loadout identifiers</h2><button type="button" data-loadout-identifiers-cancel aria-label="Close identifier editor">×</button></header><label>Name<select name="nameHash">${definitionOptions('names',loadout.nameHash)}</select></label><label>Icon<select name="iconHash">${definitionOptions('icons',loadout.iconHash)}</select></label><label>Colour<select name="colorHash">${definitionOptions('colors',loadout.colorHash)}</select></label><footer><button type="submit" data-loadout-identifiers-save>Update identifiers</button><button type="button" data-loadout-identifiers-cancel>Cancel</button></footer></form>`;
  if(!panel.open)panel.showModal();panel.querySelector('select')?.focus();
}
async function updateIdentifiers(form){
  if(!detailState||mutationPending)return;const {index,characterId}=detailState,identifiers=Object.fromEntries(['nameHash','iconHash','colorHash'].map(key=>[key,Number(new FormData(form).get(key))]));
  mutationPending=true;renderDetails();ensureIdentifiers().querySelectorAll('button,select').forEach(node=>node.disabled=true);
  try{
    const intent=stageBungieLoadoutAction('identifiers',{characterId,index,loadoutName:loadoutIdentity(detailState.loadout).name}),confirmation=confirmBungieLoadoutAction(intent);
    let session=globalThis.FORGE_BUNGIE_SESSION;if(!session?.csrfToken)session=await getBungieSession({force:true});
    await executeBungieLoadoutAction('identifiers',{characterId,index,session,confirmation,identifiers});
    const updated={...detailState.loadout,...identifiers};currentLoadouts=[...currentLoadouts];currentLoadouts[index]=updated;detailState.loadout=updated;ensureIdentifiers().close();render(currentLoadouts);renderDetails();
    document.dispatchEvent(new CustomEvent('forge:bungie-profile-refresh-requested',{detail:{reason:'loadout-identifiers',characterId,index}}));showToast(loadoutIdentity(updated),'Updated loadout identifiers');
  }catch(error){ensureIdentifiers().close();showToast(loadoutIdentity(detailState.loadout),loadoutFailureReason(error,'identifiers'),true);}
  finally{mutationPending=false;renderDetails();}
}
async function shareLoadout(){
  if(!detailState)return;const {characterId,index,loadout}=detailState,url=new URL(location.href);url.searchParams.set('loadoutCharacter',characterId);url.searchParams.set('loadoutSlot',String(index+1));
  try{if(navigator.share)await navigator.share({title:`${loadoutIdentity(loadout).name} · Slot ${index+1}`,url:url.href});else await navigator.clipboard.writeText(url.href);showToast(loadoutIdentity(loadout),'Share link ready');}catch(error){if(error?.name!=='AbortError')showToast(loadoutIdentity(loadout),'Share unavailable',true);}
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
    const title=`${saved?identity.name:`Slot ${index+1} · EMPTY`} · ${status.label}`,colorStyle=identity.color?` style="--loadout-color-image:url(${escapeHtml(identity.color)})"`:'';
    return `<div class="guardian-loadout-entry"><button type="button" class="guardian-loadout-slot ${saved?'is-saved':'is-empty'} ${status.state==='equipped'?'is-active':''} ${pendingIndex===index?'is-loading':''}" data-loadout-slot="${index}" data-loadout-state="${status.state}" data-bungie-name-hash="${escapeHtml(loadout?.nameHash||'')}" data-bungie-icon-hash="${escapeHtml(loadout?.iconHash||'')}" data-bungie-color-hash="${escapeHtml(loadout?.colorHash||'')}" aria-label="${escapeHtml(title)}" title="${escapeHtml(title)}" aria-busy="${pendingIndex===index}" ${!saved?'disabled':''}${colorStyle}>${saved&&identity.icon?`<img class="guardian-loadout-icon" src="${escapeHtml(identity.icon)}" alt="">`:''}<small>${index+1}</small>${saved?`<span class="guardian-loadout-badge is-${status.state}" aria-label="${escapeHtml(status.label)}">${status.state==='missing'?'!':'✓'}</span>`:''}</button><button type="button" class="guardian-loadout-more" data-loadout-more="${index}" aria-label="Actions for slot ${index+1}" aria-haspopup="menu" aria-expanded="false" aria-controls="guardianLoadoutMenu">⋮</button></div>`;
  }).join('');
}
document.addEventListener('click',event=>{
  const target=event.target;
  if(target.closest?.('[data-loadout-details-close]')){closeDetails();return;}
  if(target.closest?.('[data-loadout-identifiers-cancel]')){if(!mutationPending)ensureIdentifiers().close();return;}
  const detailAction=target.closest?.('[data-loadout-detail-action]');if(detailAction&&detailState){
    const value=detailAction.dataset.loadoutDetailAction,{index,characterId,loadout}=detailState;
    if(value==='identifiers'){openIdentifiers();return;}
    if(value==='share'){void shareLoadout();return;}
    if(value==='prepare'||value==='save'){closeDetails();selectLoadout(index,value==='prepare'?'edit-paradox-copy':'save-paradox-copy');return;}
    if(value==='equip'||value==='clear'){
      menuState={index,characterId,loadout,mode:'confirm',action:value,intent:stageBungieLoadoutAction(value,{characterId,index,loadoutName:loadoutIdentity(loadout).name})};closeDetails();renderMenu();return;
    }
  }
  const more=target.closest?.('[data-loadout-more]');if(more){openMenu(Number(more.dataset.loadoutMore));return;}
  const slot=target.closest?.('[data-loadout-slot]');if(slot){openDetails(Number(slot.dataset.loadoutSlot));return;}
  if(target.closest?.('[data-loadout-menu-close]')){if(!mutationPending)closeMenu();return;}
  const confirm=target.closest?.('[data-loadout-confirm-action]');if(confirm){void confirmLoadoutMutation(confirm.dataset.loadoutConfirmAction);return;}
  const action=target.closest?.('[data-loadout-menu-action]');if(!action||!menuState){if(menuState?.mode==='menu'&&!target.closest?.('#guardianLoadoutMenu'))closeMenu({focus:false});return;}
  const value=action.dataset.loadoutMenuAction,index=menuState.index;
  if(value==='view'){openDetails(index);return;}
  if(value==='edit'){selectLoadout(index,'edit-paradox-copy');return;}
  if(value==='save'){selectLoadout(index,'save-paradox-copy');return;}
  menuState={...menuState,mode:['equip','clear'].includes(value)?'confirm':'menu',action:value,intent:stageBungieLoadoutAction(value,{characterId:menuState.characterId,index,loadoutName:loadoutIdentity(menuState.loadout).name})};
  if(value==='snapshot')void confirmLoadoutMutation(value);else renderMenu();
});
document.addEventListener('submit',event=>{if(event.target.closest?.('#guardianLoadoutIdentifiers')){event.preventDefault();void updateIdentifiers(event.target);}});
document.addEventListener('keydown',event=>{
  if(!menuState)return;
  if(event.key==='Escape'){event.preventDefault();if(!mutationPending)closeMenu();return;}
  if(menuState.mode!=='menu')return;
  const buttons=[...ensureMenu().querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement);
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();}
  if(event.key==='Tab')closeMenu({focus:false});
});
globalThis.addEventListener('resize',positionMenu);document.addEventListener('scroll',positionMenu,true);
function acceptContext(event){
  const detail=event.detail||{};
  if(detail.loadoutSource==='bungie-live'){pendingIndex=null;if(currentLoadouts.length)render(currentLoadouts);return;}
  if(event.detail?.source!=="bungie-live"){closeMenu();renderStatus('Connect Bungie to load in-game slots','disconnected');return;}
  const characterId=String(detail.characterId||activeCharacterId);
  if(characterId!==activeCharacterId){closeMenu({focus:false});if(detailState)closeDetails();}activeCharacterId=characterId;pendingIndex=null;
  if(event.detail?.loadoutsAvailable!==true){renderStatus("Loadout data unavailable","unavailable");return;}
  render(detail.loadouts||[]);const params=new URLSearchParams(location.search),sharedIndex=Number(params.get('loadoutSlot'))-1;if(!sharedLinkOpened&&params.get('loadoutCharacter')===characterId&&Number.isInteger(sharedIndex)&&isSaved(currentLoadouts[sharedIndex])){sharedLinkOpened=true;queueMicrotask(()=>openDetails(sharedIndex));}
}
document.addEventListener('forge:guardian-selection-changed',acceptContext);
document.addEventListener('forge:guardian-loadout-context',acceptContext);
document.addEventListener('forge:bungie-profile-loaded',()=>render(currentLoadouts));
document.addEventListener('forge:bungie-profile-refresh-requested',event=>{
  const detail=event.detail||{};
  if(detail.liveInventory?.profile){const profile=currentProfile();projectionBase=globalThis.FORGE_PAGE_PAYLOAD?.profile;profileProjection={...profile,...detail.liveInventory.profile};render(currentLoadouts);}
  else if(!String(detail.reason||'').startsWith('loadout-')){profileProjection=null;render(currentLoadouts);}
});
document.addEventListener('forge:guardian-loading',()=>renderStatus('Loading loadouts…','pending'));
document.addEventListener('forge:guardian-error',()=>renderStatus('Loadout data unavailable','unavailable'));
document.addEventListener('forge:loadout-loading',event=>{if(Number.isInteger(event.detail?.index))pendingIndex=event.detail.index;if(currentLoadouts.length)render(currentLoadouts);});
document.addEventListener('forge:loadout-error',()=>{pendingIndex=null;if(detailState){const identity=loadoutIdentity(detailState.loadout);closeDetails();showToast(identity,'Loadout details unavailable',true);}if(currentLoadouts.length)render(currentLoadouts);else renderStatus('Loadout data unavailable','unavailable');});
document.addEventListener('forge:bungie-loadout-loaded',event=>{
  const detail=event.detail||{};pendingIndex=null;if(currentLoadouts.length)render(currentLoadouts);
  if(detailState&&String(detail.characterId||'')===detailState.characterId&&detail.loadoutActionIntent==='view-bungie-details'){detailState.detail=detail;renderDetails();}
});
document.addEventListener('forge:beta-fixture-loaded',()=>renderStatus('Connect Bungie to load in-game slots','disconnected'));
renderStatus('Connect Bungie to load in-game slots','disconnected');
export {render as renderGuardianLoadouts,isSaved,loadoutIdentity,renderStatus as renderGuardianLoadoutStatus};
