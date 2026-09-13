import {WEAPON_SOCKET_CATEGORIES,resolveItemWatermark} from '../../core/bungie-item-identity.mjs';
import {weaponStatBreakdown,weaponStatMarkup} from './guardian-weapon-stat-model.mjs?v=20260912-click-inspect-1';
import {bindWeaponSelection} from './guardian-weapon-selection.mjs?fix=20260909-apply-refresh-1';
import {weaponDetailTile,weaponPerkMatrixMarkup,weaponTraitHierarchyMarkup} from './guardian-weapon-presentation.mjs?v=20260913-square-intrinsic-1';

const BUNGIE_ORIGIN='https://www.bungie.net';
const bindings=new WeakMap();
const inspectBindings=new WeakMap();
let activeAnchor=null;
let inspectAnchor=null;
let installed=false;
let inspectInstalled=false;
let hideTimer=null;
let inspectTimer=null;

const esc=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const finite=value=>Number.isFinite(Number(value))?Number(value):null;
const itemHash=item=>{const hash=Number(item?.hash??item?.bungieHash??item?.itemHash);return Number.isInteger(hash)&&hash>0?hash:null;};
const itemName=(item,fallback='Resolved item')=>String(item?.name??item?.displayName??item?.displayProperties?.name??fallback).trim();
const asset=value=>{const path=String(value??'').trim();return !path?'':path.startsWith('http')?path:`${BUNGIE_ORIGIN}${path.startsWith('/')?'':'/'}${path}`;};
const itemIcon=item=>asset(item?.icon??item?.iconUrl??item?.displayProperties?.icon??item?.definition?.displayProperties?.icon);

function uniqueItems(items=[]){
  const seen=new Set();
  return items.filter(item=>{
    if(!item)return false;
    const key=itemHash(item)?`hash:${itemHash(item)}`:`name:${itemName(item).toLowerCase()}`;
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  });
}

function uniqueSocketItems(items=[]){
  const seen=new Set();
  return items.filter(item=>{
    if(!item)return false;
    const hash=itemHash(item),socket=finite(item?.socketIndex);
    const key=socket!==null?`socket:${socket}:${hash??itemName(item).toLowerCase()}`:hash?`hash:${hash}`:`name:${itemName(item).toLowerCase()}`;
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  });
}

function appearancePlugs(item={}){
  const socketPlugs=item?.socketCoverage?.plugs??[];
  const categoryPlugs=socketPlugs.filter(plug=>Number(plug?.socketCategoryHash)===WEAPON_SOCKET_CATEGORIES.cosmetics);
  return uniqueSocketItems([...(item?.appearancePlugs??[]),item?.shader,item?.ornament,...categoryPlugs]);
}

function inspectSocketMarkup(plug,label){
  const icon=itemIcon(plug);
  if(!icon)return '';
  const description=String(plug?.description??plug?.displayProperties?.description??'').trim();
  const title=[itemName(plug),description].filter(Boolean).join(' · ');
  return `<span class="paradox-inspect-socket" title="${esc(title)}" aria-label="${esc(`${label}: ${itemName(plug)}`)}"><img src="${esc(icon)}" alt=""><small>${esc(label)}</small></span>`;
}

function weaponInspectSockets(item={}){
  const semantics=item?.weaponSemantics??{};
  const support=(semantics.modSockets?.length?semantics.modSockets:[semantics.masterwork,semantics.mod,semantics.catalyst]).filter(Boolean);
  const sameIdentity=(left,right)=>Boolean(itemHash(left)&&itemHash(left)===itemHash(right));
  const rows=[
    ...support.map(plug=>({plug,label:sameIdentity(plug,semantics.catalyst)?'CATALYST':sameIdentity(plug,semantics.masterwork)?'MASTERWORK':'MOD'})),
    ...appearancePlugs(item).map(plug=>({plug,label:'COSMETIC'}))
  ];
  return uniqueSocketItems(rows.map(row=>row.plug)).map(plug=>{
    const row=rows.find(candidate=>candidate.plug===plug)||rows.find(candidate=>itemHash(candidate.plug)===itemHash(plug));
    return inspectSocketMarkup(plug,row?.label||'SOCKET');
  }).join('');
}

function armourInspectSockets(item={}){
  const semantics=item?.armourSemantics??{};
  const functional=uniqueSocketItems([semantics.masterwork??item?.masterwork,...(semantics.generalMods??item?.generalMods??[]),...(semantics.slotMods??item?.slotMods??[])]);
  return `${functional.map(plug=>inspectSocketMarkup(plug,plug===semantics.masterwork||plug===item?.masterwork?'MASTERWORK':'MOD')).join('')}${appearancePlugs(item).map(plug=>inspectSocketMarkup(plug,'COSMETIC')).join('')}`;
}

function normaliseStats(item,kind){
  if(kind==='weapon'){
    const source=item?.weaponSemantics?.stats??item?.weaponStats??{};
    return weaponStatBreakdown(item);
  }
  const source=item?.armourSemantics?.stats??item?.stats??{};
  const rows=Array.isArray(source)?source:Object.entries(source).map(([hash,row])=>({...(row&&typeof row==='object'?row:{}),hash:Number(hash),value:row?.value??row}));
  return rows.map((row,index)=>({
    hash:finite(row?.hash),
    name:String(row?.name??row?.displayProperties?.name??`Stat ${index+1}`),
    icon:itemIcon(row),
    value:finite(row?.value)
  })).filter(row=>row.value!==null);
}

function statMarkup(item,kind){
  const rows=normaliseStats(item,kind);
  if(!rows.length)return '<p class="inspector-empty">No item stats were returned for this instance.</p>';
  const body=rows.map(row=>kind==='weapon'
    ? weaponStatMarkup([row])
    : `<div class="paradox-stat-row"><span>${row.icon?`<img src="${esc(row.icon)}" alt="">`:''}${esc(row.name)}</span><strong>${esc(row.value)}</strong><i><b style="width:${Math.max(0,Math.min(100,row.value))}%"></b></i></div>`).join('');
  const total=kind==='armour'?`<div class="paradox-stat-total"><span>TOTAL</span><strong>${rows.reduce((sum,row)=>sum+row.value,0)}</strong></div>`:'';
  return `<div class="${kind==='weapon'?'weapon-stats':'paradox-stat-list'}">${body}${total}</div>`;
}

function detailTile(item,label,{circle=false}={}){
  const icon=itemIcon(item);
  const description=String(item?.description??item?.displayProperties?.description??'').trim();
  const title=[itemName(item),description].filter(Boolean).join(' · ');
  return `<div class="${circle?'weapon-detail-tile':'paradox-socket-tile'}" title="${esc(title)}">${circle?`${icon?`<img src="${esc(icon)}" alt="">`:'<span aria-hidden="true">◆</span>'}<small>${esc(label)}</small>`:`<div class="paradox-socket-icon">${icon?`<img src="${esc(icon)}" alt="">`:'<span aria-hidden="true">◆</span>'}</div><small>${esc(label)}</small>`}<b>${esc(itemName(item))}</b></div>`;
}

function weaponDetails(item,{inspect=false}={}){
  const semantics=item?.weaponSemantics??{};
  const support=(semantics.modSockets?.length?semantics.modSockets:[semantics.masterwork,semantics.mod,semantics.catalyst]).filter(Boolean);
  const hierarchy=weaponTraitHierarchyMarkup(item,{compact:true,squareIntrinsic:inspect}),matrix=weaponPerkMatrixMarkup(item);
  const traits=hierarchy?`<section class="paradox-section paradox-hover-traits"><h3>INTRINSIC</h3>${hierarchy}</section>`:'';
  const perkRows=matrix?`<section class="paradox-section"><h3>WEAPON PERKS</h3>${matrix}</section>`:'';
  const inspectSockets=inspect?weaponInspectSockets(item):'';
  const supportRows=inspect
    ?inspectSockets?`<section class="paradox-section paradox-inspect-bottom"><h3>MODS AND COSMETICS</h3><div class="paradox-inspect-socket-strip">${inspectSockets}</div></section>`:''
    :support.length?`<section class="paradox-section"><h3>WEAPON MODS</h3><div class="weapon-detail-tiles">${support.map(plug=>weaponDetailTile(plug,'Equipped',{square:true})).join('')}</div></section>`:'';
  return `<section class="paradox-section paradox-section--stats"><h3>WEAPON STATS</h3>${statMarkup(item,'weapon')}</section>${traits}${perkRows}${supportRows}`;
}

function armourDetails(item,{inspect=false}={}){
  const semantics=item?.armourSemantics??{};
  const identities=uniqueItems([semantics.archetype??item?.archetype,semantics.exoticPerk??item?.exoticPerk??item?.intrinsicTrait,semantics.set?.identity??item?.setBonus?.identity]);
  const mods=uniqueItems([semantics.masterwork??item?.masterwork,...(semantics.generalMods??item?.generalMods??[]),...(semantics.slotMods??item?.slotMods??[])]);
  const identityRows=identities.length?`<section class="paradox-section"><h3>ARCHETYPE AND TRAITS</h3><div class="paradox-hover-identities">${identities.map(identity=>detailTile(identity,'VERIFIED')).join('')}</div></section>`:'';
  const inspectSockets=inspect?armourInspectSockets(item):'';
  const modRows=inspect
    ?inspectSockets?`<section class="paradox-section paradox-inspect-bottom"><h3>MODS AND COSMETICS</h3><div class="paradox-inspect-socket-strip">${inspectSockets}</div></section>`:''
    :mods.length?`<section class="paradox-section"><h3>ARMOUR SOCKETS</h3><div class="paradox-socket-grid">${mods.map(mod=>detailTile(mod,'EQUIPPED')).join('')}</div></section>`:'';
  return `<section class="paradox-section paradox-section--stats"><h3>ARMOUR STATS</h3>${statMarkup(item,'armour')}</section>${identityRows}${modRows}`;
}

function armourDefinitionDetails(item){
  const intrinsic=item?.armourSemantics?.exoticPerk??item?.exoticPerk??item?.intrinsicTrait??null;
  if(!intrinsic)return '<section class="paradox-section"><h3>INTRINSIC EXOTIC PERK</h3><p class="inspector-empty">Bungie did not return an intrinsic perk definition for this Exotic.</p></section>';
  const icon=itemIcon(intrinsic),description=String(intrinsic?.description??intrinsic?.displayProperties?.description??'').trim();
  return `<section class="paradox-section"><h3>INTRINSIC EXOTIC PERK</h3><div class="paradox-identity-card"><div class="paradox-identity-icon">${icon?`<img src="${esc(icon)}" alt="">`:'<span aria-hidden="true">◆</span>'}</div><div><small>EXOTIC ARMOUR TRAIT</small><b>${esc(itemName(intrinsic,'Intrinsic perk'))}</b>${description?`<p>${esc(description)}</p>`:''}</div></div></section>`;
}

function cardMarkup(item,kind,{contextLabel='',definitionOnly=false,presentation='hover'}={}){
  const icon=itemIcon(item);
  const release=item?.releaseWatermark?.icon?{icon:asset(item.releaseWatermark.icon),source:item.releaseWatermark.source??'prepared-item'}:resolveItemWatermark(item??{},item?.definition??{});
  const type=item?.itemTypeDisplayName??item?.weaponType??item?.slotLabel??(kind==='weapon'?'Weapon':'Armour');
  const tier=item?.tier??item?.tierTypeName??item?.definition?.inventory?.tierTypeName??(item?.isExotic?'Exotic':'');
  const metricLabel=definitionOnly?'RARITY':'POWER',metricValue=definitionOnly?tier:(item?.power??item?.primaryStat?.value??'—');
  const source=item?.source?.label??(item?.itemInstanceId?'Exact owned instance':'Verified Bungie item');
  const rarity=/\bexotic\b/i.test(String(tier))||item?.isExotic===true?'exotic':/\blegendary\b/i.test(String(tier))?'legendary':'standard';
  const presentationClass=presentation==='inspect'?'paradox-item-inspect-card':'paradox-item-hover-card';
  return `<article class="paradox-item-card paradox-item-card--${kind} ${presentationClass} is-${rarity}" data-item-kind="${kind}" data-item-rarity="${rarity}">
    <header class="paradox-item-header"><div class="weapon-detail-icon">${icon?`<img src="${esc(icon)}" alt="">`:'<span class="ph-glyph" aria-hidden="true">◇</span>'}${release.icon?`<img class="paradox-release-watermark" src="${esc(asset(release.icon))}" data-watermark-source="${esc(release.source)}" alt="Release watermark">`:''}</div><div class="paradox-item-identity"><span class="paradox-kicker">PARADOX ${kind.toUpperCase()} MODEL${contextLabel?` · ${esc(contextLabel)}`:''}</span><h2>${esc(itemName(item,kind))}</h2><p>${esc(type)}</p></div><div class="weapon-detail-power"><small>${metricLabel}</small><b>${esc(metricValue)}</b></div></header>
    <div class="paradox-card-body">${definitionOnly&&kind==='armour'?armourDefinitionDetails(item):kind==='weapon'?weaponDetails(item,{inspect:presentation==='inspect'}):armourDetails(item,{inspect:presentation==='inspect'})}</div>
    <footer class="paradox-hover-foot"><span>${esc(String(source).toUpperCase())}</span><span>${definitionOnly?'TYPE LEVEL BUNGIE DATA':item?.itemInstanceId?'EXACT BUNGIE INSTANCE':'BUNGIE DEFINITION'}</span></footer>
  </article>`;
}

function ensureHost(){
  if(typeof document==='undefined')return null;
  let host=document.getElementById('paradoxItemHover');
  if(host)return host;
  host=document.createElement('aside');
  host.id='paradoxItemHover';
  host.className='paradox-item-hover paradox-item-shell';
  host.hidden=true;
  host.setAttribute('aria-hidden','true');
  host.addEventListener('pointerenter',()=>clearTimeout(hideTimer));
  host.addEventListener('pointerleave',event=>{if(!activeAnchor?.contains(event.relatedTarget))hideTimer=setTimeout(hide,180);});
  document.documentElement.append(host);
  return host;
}

function hide(){
  clearTimeout(hideTimer);
  const host=typeof document==='undefined'?null:document.getElementById('paradoxItemHover');
  activeAnchor=null;
  if(host){host.hidden=true;host.setAttribute('aria-hidden','true');host.replaceChildren();}
}

function position(host,anchor){
  if(!host||!anchor?.isConnected)return hide();
  const gap=10,pad=8,bounds=anchor.getBoundingClientRect();
  const available=Math.max(1,Math.floor(bounds.top-gap-pad));
  host.style.maxHeight=`${available}px`;
  host.style.width=`min(31rem, calc(100vw - ${pad*2}px))`;
  const width=host.offsetWidth;
  const height=Math.min(host.scrollHeight,available);
  const left=Math.max(pad,Math.min(bounds.left+(bounds.width-width)/2,innerWidth-width-pad));
  host.style.left=`${Math.round(left)}px`;
  host.style.top=`${Math.max(pad,Math.round(bounds.top-gap-height))}px`;
}

function show(anchor){
  clearTimeout(hideTimer);
  const binding=bindings.get(anchor);
  const host=ensureHost();
  if(!binding||!host)return;
  activeAnchor=anchor;
  host.innerHTML=cardMarkup(binding.item,binding.kind,binding.options);
  if(binding.kind==='weapon')bindWeaponSelection(host,binding.item);
  host.hidden=false;
  host.setAttribute('aria-hidden','false');
  requestAnimationFrame(()=>position(host,anchor));
}

function install(){
  if(installed||typeof document==='undefined')return;
  installed=true;
  document.addEventListener('pointerover',event=>{const anchor=event.target.closest?.('[data-paradox-item-hover]');if(anchor&&bindings.has(anchor)&&!anchor.contains(event.relatedTarget))show(anchor);});
  document.addEventListener('pointerout',event=>{const anchor=event.target.closest?.('[data-paradox-item-hover]');if(anchor===activeAnchor&&!anchor.contains(event.relatedTarget)&&!document.getElementById('paradoxItemHover')?.contains(event.relatedTarget))hideTimer=setTimeout(hide,180);});
  document.addEventListener('focusin',event=>{const anchor=event.target.closest?.('[data-paradox-item-hover]');if(anchor&&bindings.has(anchor)&&!anchor.contains(event.relatedTarget))show(anchor);});
  document.addEventListener('focusout',event=>{const anchor=event.target.closest?.('[data-paradox-item-hover]');if(anchor===activeAnchor&&!anchor.contains(event.relatedTarget))hide();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')hide();});
  addEventListener('resize',hide,{passive:true});
  addEventListener('scroll',hide,{passive:true,capture:true});
}

function bindParadoxItemHover(target,item,kind,options={}){
  if(!target||!item||!['armour','weapon'].includes(kind))return target;
  bindings.set(target,{item,kind,options});
  target.dataset.paradoxItemHover=kind;
  install();
  return target;
}

function closeInspect({restoreFocus=true}={}){
  clearTimeout(inspectTimer);
  const host=typeof document==='undefined'?null:document.getElementById('paradoxItemInspect');
  const backdrop=typeof document==='undefined'?null:document.getElementById('paradoxItemInspectBackdrop');
  const anchor=inspectAnchor;
  inspectAnchor=null;
  document?.body?.classList.remove('paradox-inventory-inspect-open');
  if(host){host.hidden=true;host.setAttribute('aria-hidden','true');host.replaceChildren();}
  if(backdrop)backdrop.hidden=true;
  if(restoreFocus&&anchor?.isConnected)anchor.focus({preventScroll:true});
}

function ensureInspectHost(){
  if(typeof document==='undefined')return null;
  let backdrop=document.getElementById('paradoxItemInspectBackdrop');
  if(!backdrop){
    backdrop=document.createElement('div');
    backdrop.id='paradoxItemInspectBackdrop';
    backdrop.className='paradox-inventory-inspect-backdrop';
    backdrop.hidden=true;
    backdrop.addEventListener('click',()=>closeInspect());
    document.documentElement.append(backdrop);
  }
  let host=document.getElementById('paradoxItemInspect');
  if(!host){
    host=document.createElement('aside');
    host.id='paradoxItemInspect';
    host.className='forge-item-inspect paradox-inventory-inspect paradox-item-shell';
    host.hidden=true;
    host.setAttribute('aria-hidden','true');
    host.setAttribute('aria-modal','true');
    host.setAttribute('role','dialog');
    host.addEventListener('click',event=>{if(event.target.closest?.('[data-close-paradox-inspect]'))closeInspect();});
    document.documentElement.append(host);
  }
  return {host,backdrop};
}

function openInspect(anchor){
  clearTimeout(inspectTimer);
  const binding=inspectBindings.get(anchor),portal=ensureInspectHost();
  if(!binding||!portal)return;
  hide();
  inspectAnchor=anchor;
  portal.host.innerHTML=`<button class="paradox-inventory-inspect-close" type="button" data-close-paradox-inspect aria-label="Close item details">✕</button>${cardMarkup(binding.item,binding.kind,{...binding.options,presentation:'inspect'})}`;
  portal.backdrop.hidden=false;
  portal.host.hidden=false;
  portal.host.setAttribute('aria-hidden','false');
  document.body.classList.add('paradox-inventory-inspect-open');
  portal.host.querySelector('[data-close-paradox-inspect]')?.focus({preventScroll:true});
}

function installInspect(){
  if(inspectInstalled||typeof document==='undefined')return;
  inspectInstalled=true;
  document.addEventListener('click',event=>{
    const anchor=event.target.closest?.('[data-paradox-item-inspect]');
    if(!anchor||!inspectBindings.has(anchor)||event.target.closest?.('button'))return;
    clearTimeout(inspectTimer);
    inspectTimer=setTimeout(()=>openInspect(anchor),220);
  });
  document.addEventListener('dblclick',event=>{
    if(event.target.closest?.('[data-paradox-item-inspect]'))clearTimeout(inspectTimer);
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&inspectAnchor){event.preventDefault();closeInspect();return;}
    const anchor=event.target.closest?.('[data-paradox-item-inspect]');
    if(anchor&&inspectBindings.has(anchor)&&(event.key==='Enter'||event.key===' ')){
      event.preventDefault();
      openInspect(anchor);
    }
  });
}

function bindParadoxItemInspect(target,item,kind,options={}){
  if(!target||!item||!['armour','weapon'].includes(kind))return target;
  inspectBindings.set(target,{item,kind,options});
  delete target.dataset.paradoxItemHover;
  target.dataset.paradoxItemInspect=kind;
  installInspect();
  return target;
}

function bindParadoxItemHovers(root,items,kind,selector){
  if(!root)return;
  [...root.querySelectorAll(selector)].forEach((target,index)=>bindParadoxItemHover(target,items?.[index],kind));
}

export {bindParadoxItemHover,bindParadoxItemHovers,bindParadoxItemInspect};
