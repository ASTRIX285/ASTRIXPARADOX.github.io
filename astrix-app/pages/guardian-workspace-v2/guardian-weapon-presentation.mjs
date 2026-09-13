import {paradoxDefinitionId} from '../../core/bungie-item-identity.mjs';
import {perkTooltipAttributes} from './guardian-perk-tooltip.mjs?v=20260909-weapon-presentation-1';
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const bungieIcon=v=>{const s=String(v??"");return !s?"":s.startsWith("http")?s:`https://www.bungie.net${s}`;};
const text=v=>String(v?.name??v?.displayName??v??"").trim();
const bungieHash=v=>{const hash=Number(v?.bungieHash??v?.hash??v?.itemHash);return Number.isInteger(hash)&&hash>0?hash:null;};
const hashAttribute=v=>{const hash=bungieHash(v),type=v?.identitySource||'DestinyInventoryItemDefinition';return hash?` data-bungie-hash="${hash}" data-bungie-definition-type="${esc(type)}" data-paradox-id="${esc(v?.paradoxId||paradoxDefinitionId(type,hash))}"`:"";};


function uniqueByHash(items=[]){
  return (items||[]).filter((item,index,rows)=>item&&rows.findIndex(other=>{const hash=bungieHash(item),otherHash=bungieHash(other);return hash&&otherHash?hash===otherHash:other===item;})===index);
}

function hasResolvedIdentity(item){
  const name=text(item);
  return Boolean(bungieHash(item)&&name&&item?.unresolved!==true&&!/^unresolved\b/i.test(name));
}

const isExoticWeapon=item=>Boolean(item&&(item.isExotic===true||Number(item.tierType??item.definition?.inventory?.tierType)===6||/\bexotic\b/i.test([item.tier,item.tierTypeName,item.definition?.inventory?.tierTypeName].filter(Boolean).join(" "))));

function weaponDetailTile(item,label="",{square=false}={}){
  if(!item)return "";
  const icon=bungieHash(item)?bungieIcon(item.icon??item.displayProperties?.icon):"";
  return `<div class="weapon-detail-tile${square?' weapon-detail-tile--mod':''}" data-slot-shape="${square?'square':'circle'}"${hashAttribute(item)} ${perkTooltipAttributes(item,label)}>${icon?`<img src="${esc(icon)}"${hashAttribute(item)} alt="">`:"◆"}</div>`;
}

function weaponPerkMatrixMarkup(item,{compact=false,recommendedHashes=[]}={}){
  const semantics=item?.weaponSemantics||{},model=semantics.perkModel||item?.weaponPerkModel||null;
  const recommended=new Set((recommendedHashes||[]).map(String));
  const modelColumns=model?.columns||[];
  const fallbackPerks=semantics.selectedPerks||item?.selectedPerks||[];
  const columns=modelColumns.length?modelColumns:fallbackPerks.map((perk,index)=>({socketIndex:Number.isInteger(Number(perk?.socketIndex))?Number(perk.socketIndex):index,options:[perk],selectedPlugHash:bungieHash(perk),family:"perk"}));
  if(!columns.length)return "";
  const expectedRows=Math.max(1,Number(model?.expectedRowCount||item?.weaponPerkRowCount)||1),rows=model?.rows||[];
  const rowMarkup=Array.from({length:expectedRows},(_,rowIndex)=>{
    const modelRow=rows[rowIndex]||null;
    const slots=columns.map((column,columnIndex)=>{
      const capacity=Math.max(1,Number(column?.expectedRowCount)||expectedRows),slot=modelRow?.slots?.find(row=>Number(row?.socketIndex)===Number(column.socketIndex))||null,perk=slot?.perk||column.options?.[rowIndex]||null,hash=String(bungieHash(perk)||""),selected=slot?slot.isSelected:Boolean(hash&&String(column.selectedPlugHash||"")===hash),icon=perk?bungieIcon(perk.icon??perk.displayProperties?.icon):"";
      if(!perk||!hash)return `<span class="weapon-perk-cell is-empty" data-perk-column="${columnIndex+1}" data-perk-capacity="${capacity}" aria-hidden="true"></span>`;
      
      return `<span class="weapon-perk-cell ${selected?"is-selected":""} ${recommended.has(hash)?"is-recommended":""} ${isEnhancedPerk(perk)?"is-enhanced":""} ${!selected&&perk?.canInsert===false?'is-unavailable':''}" data-slot-shape="circle" data-socket-index="${column.socketIndex}" data-perk-column="${columnIndex+1}" data-perk-capacity="${capacity}"${hashAttribute(perk)} ${perkTooltipAttributes(perk,selected?"Equipped":"Available option")}>${icon?`<img src="${esc(icon)}"${hashAttribute(perk)} alt="${esc(text(perk))}">`:'<span aria-hidden="true">◆</span>'}</span>`;
    }).join("");
    return `<div class="weapon-perk-row" data-perk-row="${rowIndex+1}"><span class="weapon-perk-row-label">${compact?"":`ROW ${rowIndex+1}`}</span>${slots}</div>`;
  }).join("");
  const tier=Number(model?.weaponTier??semantics.gearTier??item?.gearTier),tierLabel=Number.isInteger(tier)&&tier>0?`Tier ${tier}`:"Tier unresolved";
  return `<div class="weapon-perk-matrix ${compact?"is-compact":""}" style="--weapon-perk-columns:${columns.length}" data-weapon-tier="${Number.isInteger(tier)?tier:""}" data-perk-row-count="${expectedRows}" aria-label="${esc(`${tierLabel} weapon perks in ${expectedRows} row${expectedRows===1?"":"s"}`)}">${rowMarkup}</div>`;
}

function weaponTraitHierarchyMarkup(item,{compact=false,squareIntrinsic=false}={}){
  const semantics=item?.weaponSemantics||{},candidateIntrinsic=semantics.intrinsic||item?.intrinsic||null,intrinsic=hasResolvedIdentity(candidateIntrinsic)?candidateIntrinsic:null,intrinsicTraits=uniqueByHash(semantics.intrinsicTraits||[]).filter(hasResolvedIdentity),exoticTraits=isExoticWeapon(item)?uniqueByHash([...intrinsicTraits.filter(trait=>bungieHash(trait)!==bungieHash(intrinsic)),...(semantics.exoticTraits||item?.exoticWeaponTraits||[])]).filter(hasResolvedIdentity):[];
  if(!intrinsic&&!exoticTraits.length)return "";
  const lead=intrinsic?`<div class="weapon-intrinsic-lead">${weaponDetailTile(intrinsic,"",{square:squareIntrinsic})}</div>`:"";
  const traits=exoticTraits.length?`<div class="weapon-exotic-traits"><h4>EXOTIC WEAPON TRAITS</h4>${exoticTraits.map(trait=>`<div class="weapon-exotic-trait">${weaponDetailTile(trait)}</div>`).join("")}</div>`:"";
  return `<div class="weapon-trait-hierarchy ${compact?"is-compact":""}">${lead}${traits}</div>`;
}

function isEnhancedPerk(perk){
  if(perk?.isEnhanced===true||perk?.enhanced===true||perk?.definition?.isEnhanced===true)return true;
  const category=String(perk?.definition?.plug?.plugCategoryIdentifier||perk?.plugCategoryIdentifier||"").toLowerCase();
  const traits=[...(perk?.definition?.traitIds||[]),...(perk?.traitIds||[])].map(value=>String(value).toLowerCase());
  return category.includes("enhanced")||traits.some(value=>value.includes("enhanced"))||/^enhanced\b/i.test(String(perk?.name||perk?.displayProperties?.name||""));
}

export {weaponDetailTile,weaponPerkMatrixMarkup,weaponTraitHierarchyMarkup,isEnhancedPerk};
