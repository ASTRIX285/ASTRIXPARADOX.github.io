import {setBonusOptions} from './forge-loader-model.mjs?v=20260904-top-50-scan-1';
import {resolveArmourSet} from '../guardian-workspace-v2/guardian-armour-set-resolver.mjs';
import {perkTooltipAttributes} from '../guardian-workspace-v2/guardian-perk-tooltip.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const setOf=item=>item?.setBonus||item?.armourSemantics?.set;

export function unresolvedForgeSets(items=[]){
  return [...new Set(items.map(setOf).filter(set=>set?.hash&&(set.unresolved||!set.identity)).map(set=>set.hash))];
}

export function forgeSetListOptions(items,exotic,selections,payload,className){
  const options=new Map(setBonusOptions(items,exotic,selections).map(row=>[row.hash,row]));
  const ownedHashes=new Set(items.map(setOf).filter(Boolean).map(set=>Number(set.hash)));
  const classType=['titan','hunter','warlock'].indexOf(className);
  for(const definition of Object.values(payload?.definitions||{})){
    if(definition?.itemType!==2||![classType,3].includes(Number(definition.classType)))continue;
    const set=resolveArmourSet(payload,{definition});
    if(!set||set.unresolved||!set.identity||(!set.twoPiece&&!set.fourPiece)||options.has(set.hash))continue;
    const unavailable=effect=>({checked:false,disabled:true,feasible:false,owned:false,effect});
    options.set(set.hash,{hash:set.hash,...set.identity,twoPiece:set.twoPiece,fourPiece:set.fourPiece,usableSlots:0,two:unavailable(set.twoPiece),four:unavailable(set.fourPiece)});
  }
  return [...options.values()].map(row=>({...row,owned:ownedHashes.has(row.hash),icon:row.icon||row.twoPiece?.icon||row.fourPiece?.icon||''})).sort((a,b)=>a.name.localeCompare(b.name));
}

export function forgeSetListMarkup(options){
  if(!options.length)return '<div class="forge-empty">No verified armour set definitions are available.</div>';
  return options.map(row=>{
    const details=[row.description,...[row.twoPiece,row.fourPiece].filter(Boolean).map(effect=>`${effect.requiredSetCount} pieces · ${effect.name}\n${effect.description}`)].filter(Boolean).join('\n\n');
    const state=`${row.owned?'Owned set':'Not owned'} · ${row.usableSlots} compatible slots with this Exotic`;
    return `<article class="forge-set" data-forge-set="${row.hash}"><button type="button" class="forge-set-head" ${perkTooltipAttributes({name:row.name,description:details,itemTypeDisplayName:'Armour set'},state)}><span class="forge-set-icon${row.owned?' is-owned':''}">${row.icon?`<img src="${esc(row.icon)}" alt="">`:''}</span><strong>${esc(row.name)}</strong></button><div class="forge-set-choices">${[2,4].map(count=>{
      const choice=count===2?row.two:row.four,effect=choice.effect;
      const label=`${count} PIECE${effect?.name?` · ${effect.name}`:''}`;
      const reason=choice.checked?'Selected':choice.disabled?'Unavailable with current owned pieces and selected set requirements':'Available with owned pieces';
      return `<div class="forge-set-choice${choice.owned?' is-owned':' is-unowned'}${choice.disabled?' is-disabled':''}"><input type="checkbox" aria-label="${esc(`${row.name}: ${label}`)}" data-set-hash="${row.hash}" data-set-count="${count}" ${choice.checked?'checked':''} ${choice.disabled?'disabled':''}><button type="button" class="forge-set-detail" ${perkTooltipAttributes({name:effect?.name||`${count}-piece bonus`,description:effect?.description||'',itemTypeDisplayName:`${row.name} · ${count} pieces`},reason)}>${effect?.icon?`<span class="forge-set-trait-icon"><img src="${esc(effect.icon)}" alt=""></span>`:''}<b>${esc(label)}</b></button></div>`;
    }).join('')}</div></article>`;
  }).join('');
}
