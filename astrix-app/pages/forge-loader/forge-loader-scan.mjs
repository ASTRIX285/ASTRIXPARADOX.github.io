// Shared, parametrised Forge Matrix scanning and rendering. Used by both the Forge Loader selector
// page (which runs the search) and the Forge Loader results page (which recomputes the same search
// from a bookmarked or shared URL, or shows a cached result from the same browser tab).
import {ARMOUR_STAT_CAP,ARMOUR_STAT_KEYS,ARMOUR_STAT_LABELS,armourSetHash,armourStatVector} from '../vault/vault-armour-matcher.mjs?v=20260904-top-50-scan-1';
import {itemKey} from '../vault/vault-inventory.mjs?v=20260910-fixed-intrinsic-evidence-1';
import {itemTileMarkup} from '../../shared/guardian-inventory-workspace.mjs?v=20260913-breaker-icon-2';
import {perkTooltipAttributes} from '../guardian-workspace-v2/guardian-perk-tooltip.mjs';
import {naturalSetProtocols,openProtocolSolverEvidence} from './forge-loader-model.mjs?v=20260913-backend-solver-1&plain=20260925-2&anchor=20260927-1';

const CANDIDATE_BATCH_SIZE=50;
const ARMOUR_STAT_DEFINITION_HASHES=Object.freeze({health:392767087,melee:4244567218,grenade:1735777505,super:144602215,class:1943323491,weapon:2996146975});
const text=value=>String(value??'').trim();
const esc=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));

// Runs the exact backend search Forge Loader has always used. Never invents a combination: every
// candidate comes back from the Worker's exact scan over the profile's real armour instances.
async function scanArmourCombinations({authOrigin,session,binding,manifestVersion,sourceItems,exotic,setSelections=[],targets={},priorities={},limit=CANDIDATE_BATCH_SIZE,signal}={}){
  // URLs omit unset controls. The worker requires complete six-stat vectors;
  // zero means no target or priority, exactly as on the selector page.
  targets=Object.fromEntries(ARMOUR_STAT_KEYS.map(key=>[key,Number(targets[key]??0)]));
  priorities=Object.fromEntries(ARMOUR_STAT_KEYS.map(key=>[key,Number(priorities[key]??0)]));
  const solverItems=sourceItems.filter(item=>/^\d{1,30}$/.test(text(item.itemInstanceId))).map(item=>({
    itemInstanceId:text(item.itemInstanceId),itemHash:Number(item.itemHash||item.hash),slotIndex:Number(item.slotIndex),isExotic:Boolean(item.isExotic),stats:armourStatVector(item),setHash:armourSetHash(item)
  }));
  const requestBody={
    ...binding,manifestVersion,items:solverItems,
    fixedExoticHashes:exotic.hashes,fixedExoticSlot:exotic.slotIndex,setSelections,statPriorities:priorities,autoMaximum:true,
    targets,openProtocolMasks:setSelections.length?[]:openProtocolSolverEvidence(exotic,sourceItems),limit
  };
  const response=await fetch(new URL('/bungie/forge/armour-combinations',authOrigin),{method:'POST',credentials:'include',cache:'no-store',headers:{Accept:'application/json','Content-Type':'application/json','X-CSRF-Token':text(session?.csrfToken)},body:JSON.stringify(requestBody),signal});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result?.error==='manifest_version_changed'?'The Bungie manifest changed. Refresh Guardian data and search again.':result?.error||`Backend armour calculation failed (${response.status}).`);
  const itemsById=new Map(sourceItems.map(item=>[text(item.itemInstanceId),item]));
  const targetMaximums=Object.fromEntries(ARMOUR_STAT_KEYS.map(key=>[key,Math.min(ARMOUR_STAT_CAP,Math.max(0,Number(result.targetMaximums?.[key]||0)))]));
  let matchedBuilds=(Array.isArray(result.candidates)?result.candidates:[]).map(candidate=>({...candidate,items:candidate.itemInstanceIds.map(id=>itemsById.get(text(id))).filter(Boolean)})).filter(candidate=>candidate.items.length===5);
  Object.defineProperties(matchedBuilds,{combinationsEvaluated:{value:Number(result.combinationsEvaluated||0),enumerable:false},combinationsReturned:{value:matchedBuilds.length,enumerable:false},completeScan:{value:result.completeScan===true,enumerable:false}});
  return {matchedBuilds,targetMaximums};
}

function verifiedTraitContext(effect){
  if(!effect)return null;
  const hash=Number(effect.hash??effect.plugHash??effect.bungieHash);
  return {hash:Number.isInteger(hash)&&hash>0?hash:null,name:text(effect.name),description:text(effect.description),icon:text(effect.icon)};
}

// The chosen Exotic weapon, its element (Bungie's own damage type, the only claim never inferred) and its
// catalyst state, exactly as read from the profile. A locked catalyst's effect text is never included.
function forgeWeaponAnchorContext(weaponGroup){
  const weapon=weaponGroup?.representative;if(!weaponGroup||!weapon)return null;
  const evidencePerks=[weapon.weaponSemantics?.intrinsic,...(weapon.weaponSemantics?.exoticTraits||[]),...(weapon.weaponSemantics?.selectedPerks||[])].filter(Boolean);
  const catalyst=weaponGroup.catalyst||{present:false,unlocked:false,active:false};
  if(catalyst.active&&weapon.weaponSemantics?.catalyst)evidencePerks.push(weapon.weaponSemantics.catalyst);
  return {
    identityKey:weaponGroup.key,
    name:weaponGroup.name,
    itemHashes:weaponGroup.hashes,
    selectedItemHash:Number(weapon.itemHash??weapon.hash)||null,
    selectedItemInstanceId:text(weapon.itemInstanceId),
    bucketHash:weaponGroup.bucketHash,
    elementHash:Number(weapon.damageTypeHash)||null,
    element:text(weapon.elementDefinition?.displayProperties?.name),
    catalyst:{present:catalyst.present,unlocked:catalyst.unlocked,active:catalyst.active},
    perks:evidencePerks.map(verifiedTraitContext).filter(Boolean)
  };
}

function forgeLoaderDecision({exoticGroup,candidate,index,setOptions,setSelections=[],weaponGroup=null,targetValues={},priorityValues={},armourStatCap=ARMOUR_STAT_CAP,armourStatKeys=ARMOUR_STAT_KEYS,combinationsEvaluated=0}={}){
  const exoticItem=candidate?.items?.find(item=>item?.isExotic)||null;
  if(!exoticGroup||!exoticItem)return null;
  const exoticPerk=exoticItem.exoticPerk||exoticItem.armourSemantics?.exoticPerk||null;
  return {
    schemaVersion:1,
    weaponAnchor:weaponGroup?forgeWeaponAnchorContext(weaponGroup):null,
    buildAnchor:{
      identityKey:exoticGroup.key,
      name:exoticGroup.name,
      itemHashes:exoticGroup.hashes,
      selectedItemHash:Number(exoticItem.itemHash??exoticItem.hash)||null,
      selectedItemInstanceId:text(exoticItem.itemInstanceId||exoticItem.instanceId),
      perk:verifiedTraitContext(exoticPerk)
    },
    statDirective:{
      targets:targetValues,
      priorities:priorityValues,
      achieved:Object.fromEntries(armourStatKeys.map(key=>[key,Math.min(armourStatCap,Number(candidate.stats?.[key]||0))])),
      allTargetsMet:Boolean(candidate.score?.met),
      shortfall:Number(candidate.score?.shortfall||0),
      rawTotal:Number(candidate.score?.total||0),
      modsApplied:false
    },
    setProtocol:(setSelections.length?setSelections.map(selection=>{
      const row=setOptions?.find(option=>Number(option.hash)===Number(selection.setHash));
      const effect=selection.count===2?row?.two?.effect:row?.four?.effect;
      return {setHash:Number(selection.setHash),count:Number(selection.count),setName:text(row?.name),trait:verifiedTraitContext(effect)};
    }):naturalSetProtocols(candidate).map(row=>({setHash:Number(row.setHash),count:Number(row.count),setName:text(row.setName),trait:verifiedTraitContext(row.trait)}))),
    ranking:{position:Number(index)+1,totalCombinations:Number(combinationsEvaluated),maximized:Number(index)===0}
  };
}

function armourStatIcon(payload,key){
  const hash=ARMOUR_STAT_DEFINITION_HASHES[key],icon=text(payload?.statDefinitions?.[String(hash)]?.displayProperties?.icon);
  return icon?new URL(icon,'https://www.bungie.net').toString():'';
}

function candidateStatMarkup(candidate,{itemRow=false,payload=null,targets={}}={}){
  const stats=itemRow?armourStatVector(candidate):candidate.stats;
  return ARMOUR_STAT_KEYS.map(key=>{
    const value=itemRow?Number(stats[key]||0):Math.min(ARMOUR_STAT_CAP,Number(stats[key]||0)),target=Number(targets[key]||0);
    const state=target>0?(value>=target?' is-met':' is-short'):'';
    const icon=itemRow?'':armourStatIcon(payload,key);
    if(itemRow)return `<span class="forge-matrix-stat"><small>${esc(ARMOUR_STAT_LABELS[key].toUpperCase())}</small><b>${value}</b></span>`;
    const calculation=target>0?`TARGET ${target}`:'OPEN',label=`${ARMOUR_STAT_LABELS[key]} ${value}, ${calculation}`;
    const proportion=Math.max(0,Math.min(100,Number((value/ARMOUR_STAT_CAP*100).toFixed(2))));
    return `<span class="forge-matrix-stat${state}" aria-label="${esc(label)}" title="${esc(label)}"><span class="forge-matrix-stat-reading">${icon?`<img class="forge-matrix-stat-icon" src="${esc(icon)}" alt="" aria-hidden="true" decoding="async">`:`<small>${esc(ARMOUR_STAT_LABELS[key].toUpperCase())}</small>`}<b>${value}</b></span><em>${calculation}</em><span class="forge-matrix-stat-bar" aria-hidden="true"><i style="--forge-stat-fill:${proportion}%"></i></span></span>`;
  }).join('');
}

function candidateItemMeta(item){
  const details=[item.source?.label||'Items'];
  if(item.power!==null&&item.power!==undefined)details.push(`Power ${item.power}`);
  if(Number.isFinite(Number(item.energy?.capacity)))details.push(`Energy ${Number(item.energy.capacity)}`);
  if((Number(item.state||0)&4)!==0)details.push('Masterworked');
  return details.join(' · ');
}

function candidateItemMarkup(item){
  return `<div class="forge-breakdown-item"><button type="button" class="forge-breakdown-identity" data-inspect-item="${esc(itemKey(item))}" aria-label="Inspect ${esc(item.name)}">${itemTileMarkup(item,{kind:'armour'})}<span><b>${esc(item.name)}</b><small>${esc(item.slotLabel)} · ${esc(candidateItemMeta(item))}</small></span></button><div class="forge-breakdown-stats" aria-label="${esc(item.name)} armour stats">${candidateStatMarkup(item,{itemRow:true})}</div><span class="forge-breakdown-total"><small>TOTAL</small><b>${Number(item.totalStats||0)}</b></span></div>`;
}

function candidateSetProtocol(candidate,setSelections=[]){
  if(!setSelections.length){
    const protocols=candidate?.openProtocol?.protocols||naturalSetProtocols(candidate);
    return protocols.length?`OPEN · ${protocols.map(row=>`${row.count}P ${row.setName}`).join(' + ')}`:'OPEN · NO ACTIVE SET';
  }
  return setSelections.map(selection=>{
    const match=candidate.items.find(item=>Number(item?.setBonus?.hash??item?.armourSemantics?.set?.hash)===Number(selection.setHash));
    return `${selection.count}P ${match?.setBonus?.identity?.name||match?.armourSemantics?.set?.identity?.name||`SET ${selection.setHash}`}`;
  }).join(' + ');
}

function candidateSetProtocolIconMarkup(candidate,setSelections=[]){
  const protocols=!setSelections.length
    ?(candidate?.openProtocol?.protocols||naturalSetProtocols(candidate)).map(protocol=>{
      const match=candidate.items.find(item=>Number(item?.setBonus?.hash??item?.armourSemantics?.set?.hash)===Number(protocol.setHash));
      return {...protocol,set:match?.setBonus||match?.armourSemantics?.set||null};
    })
    :setSelections.map(selection=>{
      const match=candidate.items.find(item=>Number(item?.setBonus?.hash??item?.armourSemantics?.set?.hash)===Number(selection.setHash));
      const set=match?.setBonus||match?.armourSemantics?.set||null;
      return {count:selection.count,setName:set?.identity?.name||`SET ${selection.setHash}`,set,trait:selection.count===4?set?.fourPiece:set?.twoPiece};
    });
  const earnedTiers=protocols.flatMap(row=>{
    const tiers=[];
    if(Number(row.count)>=2&&(row.set?.twoPiece?.icon||(Number(row.count)===2&&row.trait?.icon)))tiers.push({...row,count:2,trait:row.set?.twoPiece||row.trait});
    if(Number(row.count)>=4&&(row.set?.fourPiece?.icon||row.trait?.icon))tiers.push({...row,count:4,trait:row.set?.fourPiece||row.trait});
    return tiers;
  });
  const icons=earnedTiers.map(row=>{
    const state=`${row.count} piece ${row.setName}`;
    return `<button type="button" class="forge-set-detail forge-matrix-protocol-icon" ${perkTooltipAttributes(row.trait,state)}><span class="forge-set-trait-icon"><img src="${esc(row.trait.icon)}" alt=""></span></button>`;
  });
  return icons.length?icons.join(''):'<span class="forge-matrix-protocol-empty" aria-label="No active set bonus">NONE</span>';
}

function candidateMarkup(candidate,index,{activeTargetCount=0,expandedCandidateIndex=-1,selectedCandidateIndex=-1,exoticIcon='',payload=null,targets={},setSelections=[]}={}){
  const hasTargets=activeTargetCount>0,outcome=!hasTargets?'MAXIMUM STAT LOAD':candidate.score.met?'ALL TARGETS MET':`${candidate.score.shortfall} POINT${candidate.score.shortfall===1?'':'S'} SHORT`;
  const expanded=expandedCandidateIndex===index,selected=selectedCandidateIndex===index,maximized=index===0;
  const exotic=candidate.items.find(item=>item.isExotic)||candidate.items[0],icon=exoticIcon||exotic?.icon||'';
  return `<article class="forge-candidate${candidate.score.met?' is-target-met':''}${selected?' is-selected':''}${maximized?' is-maximized':''}"><div class="forge-matrix-row"><button type="button" class="forge-matrix-expand" data-candidate-expand="${index}" aria-expanded="${expanded}" aria-controls="forgeLoadBreakdown${index}"><span><small>LOAD</small><b>${String(index+1).padStart(4,'0')}</b></span><i aria-hidden="true">⌄</i></button><button type="button" class="forge-matrix-exotic" data-inspect-item="${esc(itemKey(exotic))}" aria-label="Inspect ${esc(exotic?.name||'matched Exotic')} matched roll">${icon?`<img src="${esc(icon)}" alt="">`:''}<small>EXOTIC</small></button><div class="forge-matrix-stats" aria-label="Calculated unmodded armour stats">${candidateStatMarkup(candidate,{payload,targets})}</div><span class="forge-matrix-protocol"><small>SET PROTOCOL</small><span class="forge-matrix-protocol-icons">${candidateSetProtocolIconMarkup(candidate,setSelections)}</span></span><span class="forge-matrix-total"><small>RAW TOTAL</small><b>${candidate.score.total}</b></span><button type="button" class="forge-candidate-select" data-candidate-index="${index}" aria-pressed="${selected}">SELECT</button></div><div class="forge-load-breakdown" id="forgeLoadBreakdown${index}" ${expanded?'':'hidden'}><div class="forge-breakdown-heading"><div><span>${maximized?'MAXIMIZED LOAD':'LOAD BREAKDOWN'}</span><strong>Five exact Bungie armour instances · no mods</strong></div><span>${esc(outcome)}</span></div><div class="forge-breakdown-items">${candidate.items.map(candidateItemMarkup).join('')}</div><div class="forge-breakdown-summary"><div><small>UNMODDED ARMOUR TOTAL</small><strong>${candidate.score.total}</strong></div><div><small>ACTIVE SET PROTOCOL</small><strong>${esc(candidateSetProtocol(candidate,setSelections))}</strong></div><div class="forge-breakdown-actions"><button type="button" class="forge-candidate-select" data-candidate-index="${index}">${selected?'STAGED':'STAGE LOAD'}</button><button type="button" class="forge-candidate-evaluate" data-candidate-evaluate="${index}">EVALUATE IN BUILD FORGE</button></div></div></div></article>`;
}

function stagedMarkup(slot,index,selectedSlots){
  const item=selectedSlots.get(index);
  const contents=item?itemTileMarkup(item,{kind:'armour'}):'<span class="forge-stage-empty" aria-hidden="true">◇</span>';
  return item?`<button type="button" class="forge-staged-slot" data-inspect-item="${esc(itemKey(item))}" aria-label="Inspect staged ${esc(item.name)}, ${Number(item.totalStats||0)} total, ${esc(item.source?.label||'Items')}">${contents}</button>`:`<div class="forge-staged-slot" aria-label="${esc(slot.label)}, no item staged">${contents}</div>`;
}

// URL state for the results page: the whole selection lives in the query string, so a reload,
// a bookmark or a shared link reruns the same real search rather than depending on anything cached.
function encodeForgeResultsUrl(base,{characterId,exoticHash,weaponInstanceId='',setSelections=[],targets={},priorities={},selectIndex=0}={}){
  const url=new URL(base);
  if(characterId)url.searchParams.set('characterId',characterId);
  url.searchParams.set('exotic',String(exoticHash));
  if(weaponInstanceId)url.searchParams.set('weapon',String(weaponInstanceId));
  if(setSelections.length)url.searchParams.set('sets',setSelections.map(row=>`${row.setHash}:${row.count}`).join(','));
  const targetPairs=ARMOUR_STAT_KEYS.filter(key=>Number(targets[key])>0).map(key=>`${key}:${Number(targets[key])}`);
  if(targetPairs.length)url.searchParams.set('targets',targetPairs.join(','));
  const priorityPairs=ARMOUR_STAT_KEYS.filter(key=>Number(priorities[key])>0).map(key=>`${key}:${Number(priorities[key])}`);
  if(priorityPairs.length)url.searchParams.set('priorities',priorityPairs.join(','));
  if(Number.isInteger(selectIndex)&&selectIndex>0)url.searchParams.set('select',String(selectIndex));
  return url;
}

function decodeForgeResultsUrl(search){
  const params=new URLSearchParams(search);
  const parsePairs=value=>Object.fromEntries((value||'').split(',').filter(Boolean).map(row=>{const [key,amount]=row.split(':');return [key,Number(amount)||0];}));
  const setSelections=(params.get('sets')||'').split(',').filter(Boolean).map(row=>{const [hash,count]=row.split(':');return {setHash:Number(hash),count:Number(count)};}).filter(row=>Number.isInteger(row.setHash)&&[2,4].includes(row.count));
  return {
    characterId:text(params.get('characterId')),
    exoticHash:Number(params.get('exotic'))||0,
    weaponInstanceId:text(params.get('weapon')),
    setSelections,
    targets:parsePairs(params.get('targets')),
    priorities:parsePairs(params.get('priorities')),
    selectIndex:Math.max(0,Number(params.get('select'))||0)
  };
}

export {CANDIDATE_BATCH_SIZE,armourStatIcon,candidateItemMarkup,candidateItemMeta,candidateMarkup,candidateSetProtocol,candidateSetProtocolIconMarkup,candidateStatMarkup,decodeForgeResultsUrl,encodeForgeResultsUrl,forgeLoaderDecision,forgeWeaponAnchorContext,scanArmourCombinations,stagedMarkup,verifiedTraitContext};
