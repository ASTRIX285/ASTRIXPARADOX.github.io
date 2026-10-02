// What a DIM share leaves out, filled from the user's own inventory and clearly
// marked as Paradox's picks. Every name, count and stat comes from Bungie
// definitions or the user's item instances; nothing here is invented.
import {ARMOUR_BUCKETS} from '../../pages/guardian-workspace-v2/guardian-perk-change-plan.mjs';
import {subclassCompatibilityEvidence} from '../../pages/guardian-workspace-v2/paradox-build-space/paradox-forge-intelligence.mjs';
import {bungieArtwork} from '../../shared/loadout-details-model.mjs?v=20260927-loadout-details-1&grid=20261001-1';
const ITEM='DestinyInventoryItemDefinition';
export const ARMOUR_SLOT_NAMES=Object.freeze({3448274439:'Helmet',3551918588:'Gauntlets',14239492:'Chest',20886954:'Legs',1585787867:'Class item'});
// Armor 3.0 stat order as Destiny shows it.
export const ARMOUR_STATS=Object.freeze([392767087,4244567218,1943323491,1735777505,144602215,2996146975]);
// The mod's own plug category names the armour slot it fits.
const MOD_SLOT=Object.freeze({'enhancements.v2_head':3448274439,'enhancements.v2_arms':3551918588,'enhancements.v2_chest':14239492,'enhancements.v2_legs':20886954,'enhancements.v2_class_item':1585787867});
export const TITLE_MATCH_LABEL="Named in the share's title, not pinned in the share";
const setOf=definition=>definition?.equipableItemSetHash||definition?.equippingBlock?.equipableItemSetHash||null;
const nameOf=definition=>String(definition?.displayProperties?.name||'').trim();
const stable=(a,b)=>String(a.itemInstanceId).localeCompare(String(b.itemInstanceId));

function locationOf(row,characterId){
  const kind=row?.source?.kind;
  if(kind==='vault')return 'In your Vault';
  if(kind==='equipped'||kind==='carried')return String(row.source.characterId)===String(characterId)?'On this Guardian':'On another Guardian';
  return 'In your inventory';
}
export function itemStats(row,profile){
  const stats=profile?.itemComponents?.stats?.data?.[row?.itemInstanceId]?.stats;
  if(!stats)return null;
  return Object.fromEntries(ARMOUR_STATS.map(hash=>[hash,Number(stats[hash]?.value||0)]));
}
const total=stats=>stats?ARMOUR_STATS.reduce((sum,hash)=>sum+stats[hash],0):null;

/** The Exotic perk of an owned Exotic armour piece: its current intrinsic plug, else the definition's. */
export function exoticPerk(row,profile,tables){
  const current=(profile?.itemComponents?.sockets?.data?.[row.itemInstanceId]?.sockets||[]).map(socket=>socket?.plugHash);
  const initial=(row.definition?.sockets?.socketEntries||[]).map(entry=>entry?.singleInitialItemHash);
  for(const hash of [...current,...initial]){
    const definition=tables[ITEM]?.[hash];
    if(definition?.plug?.plugCategoryIdentifier==='intrinsics'&&nameOf(definition))return {hash:Number(hash),name:nameOf(definition),description:definition.displayProperties?.description||'',definition};
  }
  return null;
}

/** Exotic armour for the share's class whose exact display name appears in the share title. */
export function titleNamedExotics(loadout,tables){
  const title=String(loadout?.name||''),byName=new Map();
  for(const definition of Object.values(tables[ITEM]||{})){
    if(definition?.inventory?.tierType!==6||!ARMOUR_BUCKETS.includes(definition.inventory?.bucketTypeHash)||definition.classType!==loadout.classType)continue;
    const name=nameOf(definition);if(!name||!title.includes(name))continue;
    if(!byName.has(name))byName.set(name,[]);byName.get(name).push(Number(definition.hash));
  }
  return [...byName].map(([name,hashes])=>({name,hashes:hashes.sort((a,b)=>a-b)}));
}

/** Owned Exotic armour ranked by what its own perk text says about the shared subclass. */
export function rankOwnedExotics({index,profile,tables,subclass,characterId}){
  const best=new Map();
  for(const bucket of ARMOUR_BUCKETS)for(const row of index.byBucket.get(bucket)||[]){
    if(row.definition?.inventory?.tierType!==6)continue;
    const perk=exoticPerk(row,profile,tables);
    const evidence=perk?subclassCompatibilityEvidence({forgeLoaderDecision:{buildAnchor:{perk}}},subclass):{score:0,evidence:[]};
    const reasons=evidence.evidence.map(item=>item.label);
    if(!reasons.length)reasons.push(perk?`${perk.name} does not name this subclass, its abilities or its element.`:'Its Exotic perk is not resolved, so its fit is unknown.');
    const entry={hash:Number(row.itemHash),itemInstanceId:String(row.itemInstanceId),name:nameOf(row.definition),icon:bungieArtwork(row.definition.displayProperties?.icon),bucketHash:bucket,slot:ARMOUR_SLOT_NAMES[bucket],perk:perk?{hash:perk.hash,name:perk.name,description:perk.description}:null,score:evidence.score,reasons,location:locationOf(row,characterId),row};
    const prior=best.get(entry.hash);
    // One entry per Exotic: prefer the copy on this Guardian, then a stable instance.
    if(!prior||(prior.location!=='On this Guardian'&&entry.location==='On this Guardian'))best.set(entry.hash,entry);
  }
  return [...best.values()].sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)||stable(a,b));
}

/** Shared mods placed by the slot their own definition names. */
export function modsBySlot(hashes,tables){
  const slots=new Map(ARMOUR_BUCKETS.map(bucket=>[bucket,[]])),other=[];
  for(const hash of hashes||[]){
    const definition=tables[ITEM]?.[hash];
    const mod={hash:Number(hash),name:nameOf(definition),icon:bungieArtwork(definition?.displayProperties?.icon),description:definition?.displayProperties?.description||'',energy:definition?.plug?.energyCost?.energyCost??null,unresolved:!definition};
    const bucket=MOD_SLOT[definition?.plug?.plugCategoryIdentifier];
    if(bucket)slots.get(bucket).push(mod);else other.push(mod);
  }
  return {slots,other};
}

/**
 * Five armour pieces from the user's inventory. Requested set bonuses come first,
 * then stat targets, then the highest stat total. The chosen Exotic (if any) keeps
 * its slot. Every piece states why it was picked.
 */
export function pickArmour({index,profile,tables,parameters={},constraints=[],exotic=null}){
  const targets=constraints.filter(row=>!row.legacy);
  const sets=parameters.setBonuses||{};
  const statName=hash=>nameOf(tables.DestinyStatDefinition?.[hash])||`Stat ${hash}`;
  const setName=hash=>nameOf(tables.DestinyEquipableItemSetDefinition?.[hash])||`Unresolved set ${hash}`;
  const pools=ARMOUR_BUCKETS.map(bucket=>{
    if(exotic&&exotic.bucketHash===bucket)return {bucket,candidates:[exotic.row]};
    const rows=(index.byBucket.get(bucket)||[]).filter(row=>row.definition?.inventory?.tierType===5).map(row=>({row,stats:itemStats(row,profile)}));
    const individual=row=>(sets[setOf(row.row.definition)]?1e6:0)+targets.reduce((n,c)=>n+Math.min(row.stats?.[c.statHash]||0,c.minStat||0)*1e3,0)+(total(row.stats)||0);
    return {bucket,candidates:rows.sort((a,b)=>individual(b)-individual(a)||stable(a.row,b.row)).slice(0,8).map(entry=>entry.row)};
  });
  // Exhaustive over at most 8 candidates per slot: exact, deterministic, small.
  let best=null;
  const evaluate=chosen=>{
    const counts={},stats=Object.fromEntries(ARMOUR_STATS.map(hash=>[hash,0]));let missing=0,known=true;
    for(const row of chosen){if(!row){missing++;continue;}const set=setOf(row.definition);if(set)counts[set]=(counts[set]||0)+1;const values=itemStats(row,profile);if(!values)known=false;for(const hash of ARMOUR_STATS)stats[hash]+=values?.[hash]||0;}
    const setDeficit=Object.entries(sets).reduce((n,[hash,count])=>n+Math.max(0,Number(count)-(counts[hash]||0)),0);
    const statDeficit=targets.reduce((n,c)=>n+Math.max(0,(c.minStat??0)-(stats[c.statHash]||0))+Math.max(0,(stats[c.statHash]||0)-(c.maxStat??200)),0);
    return {loss:missing*1e9+setDeficit*1e6+statDeficit*1e3-total(stats),counts,stats,known};
  };
  const walk=(slot,chosen)=>{
    if(slot===pools.length){const scored=evaluate(chosen);if(!best||scored.loss<best.loss||(scored.loss===best.loss&&chosen.map(r=>r?.itemInstanceId||'').join()<best.chosen.map(r=>r?.itemInstanceId||'').join()))best={...scored,chosen:[...chosen]};return;}
    const options=pools[slot].candidates.length?pools[slot].candidates:[null];
    for(const row of options){chosen.push(row);walk(slot+1,chosen);chosen.pop();}
  };
  walk(0,[]);
  const picks=pools.map(({bucket,candidates},i)=>{
    const row=best.chosen[i];if(!row)return {bucketHash:bucket,slot:ARMOUR_SLOT_NAMES[bucket],row:null,reasons:[`No ${ARMOUR_SLOT_NAMES[bucket]} for this class in your inventory.`]};
    const stats=itemStats(row,profile),reasons=[];
    if(exotic&&exotic.row===row)reasons.push(exotic.reason);
    const set=setOf(row.definition);
    if(set&&sets[set])reasons.push(`Counts toward ${setName(set)}: ${best.counts[set]} of ${sets[set]} requested pieces.`);
    for(const c of targets){const value=stats?.[c.statHash]||0;if(value&&(best.stats[c.statHash]||0)-value<(c.minStat??0))reasons.push(`Adds ${value} ${statName(c.statHash)} toward the ${c.minStat??0} target.`);}
    if(!reasons.length&&stats){
      const others=candidates.filter(other=>other!==row).map(other=>total(itemStats(other,profile))||0);
      reasons.push(others.every(value=>value<=total(stats))?`Highest stat total of your ${ARMOUR_SLOT_NAMES[bucket]} pieces: ${total(stats)}.`:`Stat total ${total(stats)}.`);
    }
    if(!stats)reasons.push('Stat values for this piece are not available.');
    return {bucketHash:bucket,slot:ARMOUR_SLOT_NAMES[bucket],row,stats,reasons};
  });
  const formedSets=Object.entries(best.counts).map(([hash,count])=>{
    const definition=tables.DestinyEquipableItemSetDefinition?.[hash];
    return {hash:Number(hash),name:setName(hash),count,requested:sets[hash]??null,unresolved:!definition,perks:(definition?.setPerks||[]).map(perk=>({required:perk.requiredSetCount,name:nameOf(tables.DestinySandboxPerkDefinition?.[perk.sandboxPerkHash])||`Unresolved perk ${perk.sandboxPerkHash}`,active:count>=perk.requiredSetCount}))};
  });
  const requestedSets=Object.entries(sets).map(([hash,count])=>({hash:Number(hash),name:setName(hash),required:Number(count),reached:best.counts[hash]||0,unresolved:!tables.DestinyEquipableItemSetDefinition?.[hash]}));
  const statTotals=ARMOUR_STATS.map(hash=>({statHash:hash,name:statName(hash),value:best.known?best.stats[hash]:null}));
  const statTargets=targets.map(c=>({statHash:c.statHash,name:statName(c.statHash),min:c.minStat??0,max:c.maxStat??200,reached:best.known?best.stats[c.statHash]:null,met:best.known?best.stats[c.statHash]>=(c.minStat??0)&&best.stats[c.statHash]<=(c.maxStat??200):null}));
  return {picks,formedSets,requestedSets,statTotals,statTargets};
}
