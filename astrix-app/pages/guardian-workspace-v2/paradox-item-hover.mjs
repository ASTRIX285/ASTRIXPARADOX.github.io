import {resolveItemWatermark} from '../../core/bungie-item-identity.mjs';
import {weaponStatBreakdown,weaponStatMarkup} from './guardian-weapon-stat-model.mjs';
import {bindWeaponSelection} from './guardian-weapon-selection.mjs?fix=20260909-apply-refresh-1';
import {weaponDetailTile,weaponPerkMatrixMarkup,weaponTraitHierarchyMarkup} from './guardian-weapon-presentation.mjs?v=20260909-weapon-presentation-1';

const BUNGIE_ORIGIN='https://www.bungie.net';
const bindings=new WeakMap();
let activeAnchor=null;
let installed=false;
let hideTimer=null;

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

function weaponDetails(item){
  const semantics=item?.weaponSemantics??{};
  const support=(semantics.modSockets?.length?semantics.modSockets:[semantics.masterwork,semantics.mod,semantics.catalyst]).filter(Boolean);
  const hierarchy=weaponTraitHierarchyMarkup(item,{compact:true}),matrix=weaponPerkMatrixMarkup(item);
  const traits=hierarchy?`<section class="paradox-section paradox-hover-traits"><h3>INTRINSIC</h3>${hierarchy}</section>`:'';
  const perkRows=matrix?`<section class="paradox-section"><h3>WEAPON PERKS</h3>${matrix}</section>`:'';
  const supportRows=support.length?`<section class="paradox-section"><h3>WEAPON MODS</h3><div class="weapon-detail-tiles">${support.map(plug=>weaponDetailTile(plug,'Equipped',{square:true})).join('')}</div></section>`:'';
  return `<section class="paradox-section paradox-section--stats"><h3>WEAPON STATS</h3>${statMarkup(item,'weapon')}</section>${traits}${perkRows}${supportRows}`;
}

function armourDetails(item){
  const semantics=item?.armourSemantics??{};
  const identities=uniqueItems([semantics.archetype??item?.archetype,semantics.exoticPerk??item?.exoticPerk??item?.intrinsicTrait,semantics.set?.identity??item?.setBonus?.identity]);
  const mods=uniqueItems([semantics.masterwork??item?.masterwork,...(semantics.generalMods??item?.generalMods??[]),...(semantics.slotMods??item?.slotMods??[])]);
  const identityRows=identities.length?`<section class="paradox-section"><h3>ARCHETYPE AND TRAITS</h3><div class="paradox-hover-identities">${identities.map(identity=>detailTile(identity,'VERIFIED')).join('')}</div></section>`:'';
  const modRows=mods.length?`<section class="paradox-section"><h3>ARMOUR SOCKETS</h3><div class="paradox-socket-grid">${mods.map(mod=>detailTile(mod,'EQUIPPED')).join('')}</div></section>`:'';
  return `<section class="paradox-section paradox-section--stats"><h3>ARMOUR STATS</h3>${statMarkup(item,'armour')}</section>${identityRows}${modRows}`;
}

function cardMarkup(item,kind){
  const icon=itemIcon(item);
  const release=item?.releaseWatermark?.icon?{icon:asset(item.releaseWatermark.icon),source:item.releaseWatermark.source??'prepared-item'}:resolveItemWatermark(item??{},item?.definition??{});
  const type=item?.itemTypeDisplayName??item?.weaponType??item?.slotLabel??(kind==='weapon'?'Weapon':'Armour');
  const power=item?.power??item?.primaryStat?.value??'—';
  const source=item?.source?.label??(item?.itemInstanceId?'Exact owned instance':'Verified Bungie item');
  return `<article class="paradox-item-card paradox-item-card--${kind} paradox-item-hover-card" data-item-kind="${kind}">
    <header class="paradox-item-header"><div class="weapon-detail-icon">${icon?`<img src="${esc(icon)}" alt="">`:'<span class="ph-glyph" aria-hidden="true">◇</span>'}${release.icon?`<img class="paradox-release-watermark" src="${esc(asset(release.icon))}" data-watermark-source="${esc(release.source)}" alt="Release watermark">`:''}</div><div class="paradox-item-identity"><span class="paradox-kicker">PARADOX ${kind.toUpperCase()} MODEL</span><h2>${esc(itemName(item,kind))}</h2><p>${esc(type)}</p></div><div class="weapon-detail-power"><small>POWER</small><b>${esc(power)}</b></div></header>
    <div class="paradox-card-body">${kind==='weapon'?weaponDetails(item):armourDetails(item)}</div>
    <footer class="paradox-hover-foot"><span>${esc(String(source).toUpperCase())}</span><span>${item?.itemInstanceId?'EXACT BUNGIE INSTANCE':'BUNGIE DEFINITION'}</span></footer>
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
  host.innerHTML=cardMarkup(binding.item,binding.kind);
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

function bindParadoxItemHover(target,item,kind){
  if(!target||!item||!['armour','weapon'].includes(kind))return target;
  bindings.set(target,{item,kind});
  target.dataset.paradoxItemHover=kind;
  install();
  return target;
}

function bindParadoxItemHovers(root,items,kind,selector){
  if(!root)return;
  [...root.querySelectorAll(selector)].forEach((target,index)=>bindParadoxItemHover(target,items?.[index],kind));
}

export {bindParadoxItemHover,bindParadoxItemHovers};
