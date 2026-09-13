/* ASTRIX PARADOX — resolved subclass / Super presentation bridge.
 * Subclass positions stay fixed. Bungie data only supplies artwork + active state.
 * Super chain is populated directly from event.detail.subclassBuild.
 */

import { cleanImageElement } from './guardian-bungie-icon-cleaner.mjs?v=20260824-icon-cleaner-2';
import {renderEquippedSubclass,renderSubclassPicker,renderSuperFormation} from './guardian-super-formation.mjs?v=20260829-subclass-identity-1';
import {mergeSubclassCatalog,mergeSuperOptions} from './guardian-super-catalog.mjs?v=20260829-subclass-identity-1';
import './guardian-artifact.mjs?v=20260906-all-page-data-1';

const leftPanelLockLink = document.querySelector('link[data-forge-left-panel-lock]') || document.createElement('link');
leftPanelLockLink.rel = 'stylesheet';
leftPanelLockLink.href = './guardian-left-panel-lock.css?v=20260826-four-fixes-1';
leftPanelLockLink.dataset.astrixLeftPanelLock = 'true';
if (!leftPanelLockLink.isConnected) document.head.appendChild(leftPanelLockLink);

const slotObservers = new Map();
const subclassIconCache = new Map();
const LEFT_PANEL_SLOT_TARGETS = Object.freeze({ abilityList:4, aspectList:2, fragList:5 });
const SUBCLASS_KEYS = Object.freeze(['arc','solar','void','stasis','strand','prismatic']);
const SUBCLASS_CACHE_KEY = 'astrix:bungie-subclass-icons-v1';

function loadSubclassIconCache() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SUBCLASS_CACHE_KEY) || '{}');
    Object.entries(saved).forEach(([key, value]) => {
      if (typeof value === 'string' && value) subclassIconCache.set(key, value);
    });
  } catch {}
}
function persistSubclassIconCache() { try { sessionStorage.setItem(SUBCLASS_CACHE_KEY, JSON.stringify(Object.fromEntries(subclassIconCache))); } catch {} }
loadSubclassIconCache();
function makeEmptyRailSlot(){const slot=document.createElement('span');slot.className='rail-empty-slot';slot.setAttribute('aria-hidden','true');return slot;}
function enforceSlotCount(id,target){const host=document.getElementById(id);if(!host)return;while(host.children.length<target)host.appendChild(makeEmptyRailSlot());}
function enforceLeftPanelSlots(){Object.entries(LEFT_PANEL_SLOT_TARGETS).forEach(([id,target])=>{enforceSlotCount(id,target);const host=document.getElementById(id);if(!host||slotObservers.has(id))return;const observer=new MutationObserver(()=>enforceSlotCount(id,target));observer.observe(host,{childList:true});slotObservers.set(id,observer);});}
function resolvedDisplayIcon(item){if(!item)return '';const display=item?.definition?.displayProperties||item?.displayProperties||{};const sequenceFrame=Array.isArray(display?.iconSequences)?display.iconSequences.flatMap(sequence=>Array.isArray(sequence?.frames)?sequence.frames:[]).find(Boolean):'';return item.icon||display.icon||display.highResIcon||sequenceFrame||item?.definition?.secondaryIcon||item?.secondaryIcon||'';}
function elementKey(item){const text=[item?.element,item?.subclass,item?.key,item?.name,item?.displayName,item?.definition?.displayProperties?.name].filter(Boolean).join(' ').toLowerCase();return SUBCLASS_KEYS.find(key=>text.includes(key))||'';}
function manifestElementIcon(item){if(!item)return '';const definition=item?.definition||{};const itemType=Number(definition.itemType??item?.itemType);const itemTypeName=String(definition.itemTypeDisplayName||item?.itemTypeDisplayName||'').toLowerCase();if(itemType!==16&&!itemTypeName.includes('subclass'))return '';const display=definition.displayProperties||item?.displayProperties||{};const sequenceFrame=Array.isArray(display?.iconSequences)?display.iconSequences.flatMap(sequence=>Array.isArray(sequence?.frames)?sequence.frames:[]).find(Boolean):'';return display.icon||display.highResIcon||sequenceFrame||item.icon||'';}
function manifestElementCatalog(catalog){return catalog.map(item=>({...item,icon:manifestElementIcon(item)}));}
function bungieUrl(path){if(!path)return '';return path.startsWith('http')?path:`https://www.bungie.net${path}`;}
function subclassCacheId(characterClass,element){return `${String(characterClass||'unknown').toLowerCase()}:${String(element||'').toLowerCase()}`;}
function cacheSubclassIcon(characterClass,element,icon){const src=bungieUrl(icon);if(!src||!SUBCLASS_KEYS.includes(element))return;subclassIconCache.set(subclassCacheId(characterClass,element),src);persistSubclassIconCache();}
function ingestSubclassCatalog(detail={}){const characterClass=String(detail.characterClass||'').toLowerCase();const catalog=Array.isArray(detail.subclassCatalog)?detail.subclassCatalog:[];catalog.forEach(item=>{const element=elementKey(item);cacheSubclassIcon(characterClass,element,manifestElementIcon(item));});const identity=detail.subclassIdentity||null;cacheSubclassIcon(characterClass,elementKey(identity),manifestElementIcon(identity));}
function dispatchGuardianSelection(detail){document.dispatchEvent(new CustomEvent('forge:guardian-selection-changed',{detail}));}
function syncEquippedSubclass(detail={}){ingestSubclassCatalog(detail);const element=String(detail.subclass||'').trim().toLowerCase();const characterClass=String(detail.characterClass||'Guardian').trim();const rawCatalog=Array.isArray(detail.subclassCatalog)?detail.subclassCatalog:[];const catalog=manifestElementCatalog(mergeSubclassCatalog(rawCatalog,characterClass));const identity=catalog.find(item=>elementKey(item)===element)||detail.subclassIdentity||null;const icon=manifestElementIcon(identity)||subclassIconCache.get(subclassCacheId(characterClass.toLowerCase(),element))||'';const picker=document.getElementById('subclassPicker');renderEquippedSubclass({root:document.getElementById('equippedSubclassSummary'),iconNode:document.getElementById('equippedSubclassIcon'),nameNode:document.getElementById('equippedSubclassName'),metaNode:document.getElementById('equippedSubclassMeta'),subclass:element,subclassName:detail.subclassName||element,characterClass,icon});renderSubclassPicker({root:picker,characterClass,subclass:element,subclassOptions:catalog,onSelect:item=>{const nextElement=elementKey(item);const nextBuild=item?.subclassBuild||item?.build||{};dispatchGuardianSelection({...detail,subclass:nextElement,subclassName:item?.name||item?.displayName||nextElement,subclassIcon:manifestElementIcon(item),subclassIdentity:item,subclassCatalog:catalog,subclassBuild:nextBuild,super:nextBuild.super||null,superOptions:nextBuild.superOptions||[]});}});}
function setDiamondFromItem(diamond,item,fallbackTitle=''){if(!diamond)return;const holder=diamond.querySelector('span');if(!holder)return;const icon=resolvedDisplayIcon(item);const title=String(item?.name||fallbackTitle||'').trim();const src=bungieUrl(icon);if(src){let img=holder.querySelector('img.super-feature__icon');if(!img){holder.textContent='';img=document.createElement('img');img.className='super-feature__icon';holder.appendChild(img);}img.alt=title;diamond.classList.add('has-live-icon');void cleanImageElement(img,src);}else{holder.textContent='◆';diamond.classList.remove('has-live-icon');}diamond.title=title||fallbackTitle;diamond.setAttribute('aria-label',title||fallbackTitle);}
function syncTranscendence(host,detail,isPrismatic){
  let block=document.getElementById('mainTranscendence')||host.parentElement?.querySelector('.prismatic-transcendence');
  if(!block){
    block=document.createElement('section');
    block.id='mainTranscendence';
    block.className='prismatic-transcendence';
    block.setAttribute('aria-label','Equipped Prismatic Transcendence');
    block.innerHTML='<span class="prismatic-transcendence__label">TRANSCENDENCE</span><div class="prismatic-transcendence__slots" id="mainTranscendenceSlots"></div>';
    host.parentElement?.insertBefore(block,host);
  }
  const slots=block.querySelector('.prismatic-transcendence__slots');
  if(!isPrismatic){
    block.hidden=true;
    slots?.replaceChildren();
    return;
  }
  const build=detail?.subclassBuild||{};
  const mappedSlots=(Array.isArray(build.transcendenceSlots)?build.transcendenceSlots:[]).map(row=>row?.equipped||row?.options?.find(item=>item?.equipped||item?.isEquipped)||null);
  const explicit=Array.isArray(build.transcendenceOptions)?build.transcendenceOptions.filter(Boolean):[];
  const derived=(Array.isArray(build.abilities)?build.abilities:[]).filter(item=>String(item?.definition?.plug?.plugCategoryIdentifier||item?.plugCategoryIdentifier||'').toLowerCase().includes('transcend'));
  const resolved=[...mappedSlots,...explicit,...derived].filter((item,index,rows)=>item&&rows.findIndex(other=>Number(other?.hash)===Number(item?.hash))===index).slice(0,2);
  block.hidden=false;
  slots?.replaceChildren();
  Array.from({length:2},(_,index)=>{
    const item=resolved[index]||null;
    const slot=document.createElement('button');
    slot.type='button';
    slot.disabled=true;
    slot.className='prismatic-transcendence__slot';
    slot.classList.toggle('is-equipped',Boolean(item));
    slot.dataset.transcendenceHash=String(item?.hash||'');
    slot.setAttribute('aria-pressed',String(Boolean(item)));
    slot.innerHTML='<span>◆</span>';
    slots?.appendChild(slot);
    setDiamondFromItem(slot,item,item?.name||`Prismatic Transcendence slot ${index+1} unresolved`);
  });
}
function populateSuperChain(detail={}){const host=document.getElementById('superFeatureCluster');if(!host)return;const characterClass=String(detail.characterClass||'hunter').toLowerCase();const subclass=String(detail.subclass||'').trim().toLowerCase();const catalog=mergeSubclassCatalog(detail.subclassCatalog,characterClass);const catalogEntry=catalog.find(item=>elementKey(item)===subclass)||null;const suppliedBuild=detail?.subclassBuild||{};const baseBuild=catalogEntry?.subclassBuild||{};const options=mergeSuperOptions(characterClass,subclass,[...(Array.isArray(baseBuild.superOptions)?baseBuild.superOptions:[]),...(Array.isArray(suppliedBuild.superOptions)?suppliedBuild.superOptions:[]),detail.super,suppliedBuild.super].filter(Boolean));const requested=[suppliedBuild.super,detail.super,baseBuild.super].find(candidate=>options.some(item=>String(item?.hash??item?.itemHash??'')===String(candidate?.hash??candidate?.itemHash??'')))||null;const active=options.find(item=>String(item?.hash??item?.itemHash??'')===String(requested?.hash??requested?.itemHash??''))||options[0]||null;renderSuperFormation({host,nameNode:document.getElementById('subclassName'),activeSuper:active,superOptions:options,subclass,subclassCatalog:catalog,characterClass,onSelect:item=>{const nextBuild={...baseBuild,...suppliedBuild,super:item,superOptions:options};const nextCatalog=catalog.map(entry=>elementKey(entry)===subclass?{...entry,subclassBuild:nextBuild}:entry);dispatchGuardianSelection({...detail,subclassCatalog:nextCatalog,subclassBuild:nextBuild,super:item,superOptions:options});}});syncTranscendence(host,detail,subclass==='prismatic');const label=document.getElementById('subclassName');if(label&&active?.name)label.dataset.superName=active.name;}
document.addEventListener('forge:guardian-selection-changed',event=>{const detail=event.detail||{};syncEquippedSubclass(detail);enforceLeftPanelSlots();queueMicrotask(()=>populateSuperChain(detail));});
document.addEventListener('forge:artifact-recommendations-changed',enforceLeftPanelSlots);
enforceLeftPanelSlots();
