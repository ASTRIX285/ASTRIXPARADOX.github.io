// Build Fit: every shared weapon or armour piece the user does not own gets an explicit
// decision (approve the suggestion, choose another owned item, or leave the slot empty).
// Nothing is swapped without a decision, and no suggestion is shown as the sharer's item.
// Set bonuses come from DestinyEquipableItemSetDefinition and DestinySandboxPerkDefinition,
// stats from the user's own item instances; nothing here is invented.
import {inventoryIndex} from './resolve.mjs';
import {ARMOUR_SLOT_NAMES,ARMOUR_STATS,exoticPerk,itemStats,locationOf} from './fill.mjs';
import {sharedSocketGaps} from './adapt.mjs';
import {bungieArtwork} from '../../shared/loadout-details-model.mjs';
import {ARMOUR_BUCKETS,WEAPON_BUCKETS} from '../../pages/guardian-workspace-v2/guardian-perk-change-plan.mjs';
const ITEM='DestinyInventoryItemDefinition',SETS='DestinyEquipableItemSetDefinition',PERKS='DestinySandboxPerkDefinition';
export const WEAPON_SLOT_NAMES=Object.freeze({1498876634:'Kinetic',2465295065:'Energy',953998645:'Power'});
const SLOT_ORDER=[...WEAPON_BUCKETS,...ARMOUR_BUCKETS];
const setOf=definition=>Number(definition?.equippingBlock?.equipableItemSetHash||definition?.equipableItemSetHash||0)||null;
const nameOf=definition=>String(definition?.displayProperties?.name||'').trim();
const stable=(a,b)=>String(a.id).localeCompare(String(b.id));
const list=items=>items.length<2?items.join(''):`${items.slice(0,-1).join(', ')} and ${items.at(-1)}`;

/** Stat priority from the share's own stat sources: its armour mods and subclass plugs. */
export function sharedStatPriority(model,tables){
  const constraints=(model.statConstraints||[]).filter(row=>!row.legacy&&ARMOUR_STATS.includes(Number(row.statHash)));
  const statName=hash=>nameOf(tables.DestinyStatDefinition?.[hash])||`Stat ${hash}`;
  // A DIM stat target list is already in priority order.
  if(constraints.length)return {source:'targets',stats:constraints.map(row=>({statHash:Number(row.statHash),name:statName(row.statHash),value:row.minStat??0}))};
  const totals=new Map(ARMOUR_STATS.map(hash=>[hash,0]));
  const subclass=model.items.find(row=>row.kind==='subclass'&&row.equipped);
  const hashes=[...(model.parameters?.mods||[]),...(subclass?.sockets||[]).map(plug=>plug.hash).filter(Boolean)];
  for(const hash of hashes)for(const stat of tables[ITEM]?.[hash]?.investmentStats||[])if(totals.has(Number(stat.statTypeHash)))totals.set(Number(stat.statTypeHash),totals.get(Number(stat.statTypeHash))+Number(stat.value||0));
  const stats=[...totals].filter(([,value])=>value>0).sort((a,b)=>b[1]-a[1]||ARMOUR_STATS.indexOf(a[0])-ARMOUR_STATS.indexOf(b[0])).map(([statHash,value])=>({statHash,name:statName(statHash),value}));
  return {source:stats.length?'mods':'none',stats};
}

function archetypeOf(row,profile,tables){
  for(const socket of profile?.itemComponents?.sockets?.data?.[row.itemInstanceId]?.sockets||[]){
    const definition=tables[ITEM]?.[socket?.plugHash];
    if(definition?.plug?.plugCategoryIdentifier!=='armor_archetypes')continue;
    const primary=String(definition.displayProperties?.description||'').match(/Primary Stat:\s*([A-Za-z ]+?)\s*(?:\n|$)/)?.[1]||'';
    const statHash=ARMOUR_STATS.find(hash=>nameOf(tables.DestinyStatDefinition?.[hash]).toLowerCase()===primary.toLowerCase())||null;
    return {name:nameOf(definition),primary,statHash};
  }
  return null;
}

function candidateOf(row,profile,tables,characterId){
  const definition=row.definition,set=setOf(definition);
  return {id:String(row.itemInstanceId),itemHash:Number(row.itemHash),bucketHash:Number(definition.inventory?.bucketTypeHash),name:nameOf(definition),icon:bungieArtwork(definition.displayProperties?.icon),isExotic:definition.inventory?.tierType===6,setHash:set,setName:set?nameOf(tables[SETS]?.[set]):'',location:locationOf(row,characterId),stats:definition.itemType===2?itemStats(row,profile):null,archetype:definition.itemType===2?archetypeOf(row,profile,tables):null,itemTypeName:definition.itemTypeDisplayName||'',damageTypeHash:Number(definition.defaultDamageTypeHash||0)||null,itemSubType:definition.itemSubType,row};
}

// Which subclass ability a set perk's own text acts on, and the build's pick for it.
const ABILITY_WORDS=[['melee',/\bmelee/i],['grenade',/\bgrenade/i],['super',/\bsuper\b/i],['classAbility',/\bclass abilit/i]];
function perkSynergy(description,subclass){
  const picks={melee:subclass?.abilities?.find(plug=>plug.componentType==='melee'),grenade:subclass?.abilities?.find(plug=>plug.componentType==='grenade'),super:subclass?.super,classAbility:subclass?.abilities?.find(plug=>plug.componentType==='classAbility')};
  return ABILITY_WORDS.filter(([key,pattern])=>pattern.test(description)&&picks[key]?.name).map(([key])=>({key,name:picks[key].name}));
}
const ABILITY_LABEL={melee:'melee',grenade:'grenade',super:'Super',classAbility:'class ability'};

export function createFitPlan(adaptation,{snapshot,profile}){
  const tables=snapshot.tables,model=adaptation.model,report=adaptation.report,build=adaptation.build,characterId=String(build.characterId||'');
  const index=inventoryIndex(profile,tables,characterId);
  const rows=model.items.filter(row=>row.equipped&&['weapon','armour'].includes(row.kind)).sort((a,b)=>SLOT_ORDER.indexOf(a.bucketHash)-SLOT_ORDER.indexOf(b.bucketHash));
  const subclass=build.subclassBuild||{};
  const setPerks=hash=>(tables[SETS]?.[hash]?.setPerks||[]).map(perk=>({required:Number(perk.requiredSetCount),hash:Number(perk.sandboxPerkHash),name:nameOf(tables[PERKS]?.[perk.sandboxPerkHash])||`Unresolved perk ${perk.sandboxPerkHash}`,description:tables[PERKS]?.[perk.sandboxPerkHash]?.displayProperties?.description||''})).sort((a,b)=>a.required-b.required);
  const slots=rows.map(row=>{
    const comparison=report.comparisons.find(entry=>entry.bucketHash===row.bucketHash);
    const owned=comparison?.status==='matched'&&comparison.selected?(index.byBucket.get(row.bucketHash)||[]).find(item=>String(item.itemInstanceId)===String(comparison.selected.itemInstanceId)):null;
    const set=setOf(row.definition);
    const slot={bucketHash:row.bucketHash,kind:row.kind,slot:ARMOUR_SLOT_NAMES[row.bucketHash]||WEAPON_SLOT_NAMES[row.bucketHash]||'',
      shared:{itemHash:row.itemHash,name:row.name,icon:row.icon,isExotic:row.isExotic,setHash:set,setName:set?nameOf(tables[SETS]?.[set]):'',itemTypeName:row.definition?.itemTypeDisplayName||'',exoticPerk:row.isExotic&&row.kind==='armour'?exoticPerk({definition:row.definition,itemInstanceId:''},{},tables):null},
      target:row,owned:owned?candidateOf(owned,profile,tables,characterId):null,missing:!owned,candidates:[]};
    if(slot.missing)slot.candidates=(index.byBucket.get(row.bucketHash)||[]).filter(item=>item.definition?.itemType===(row.kind==='weapon'?3:2)).map(item=>candidateOf(item,profile,tables,characterId)).sort(stable);
    return slot;
  });
  const sharedCounts={};for(const slot of slots)if(slot.kind==='armour'&&slot.shared.setHash)sharedCounts[slot.shared.setHash]=(sharedCounts[slot.shared.setHash]||0)+1;
  const sharedPerks=Object.entries(sharedCounts).flatMap(([hash,count])=>setPerks(hash).filter(perk=>count>=perk.required).map(perk=>({setHash:Number(hash),setName:nameOf(tables[SETS]?.[hash]),...perk})));
  const plan={name:model.name,characterId,slots,sharedPerks,setPerks,priority:sharedStatPriority(model,tables),subclass,tables,profile};
  plan.suggestions=suggest(plan);
  return plan;
}

// The build's armour for one assignment: owned pieces stay; missing slots use the assignment.
function armourAt(plan,assignment){
  return plan.slots.filter(slot=>slot.kind==='armour').map(slot=>slot.missing?assignment.get(slot.bucketHash)||null:slot.owned);
}
function evaluate(plan,pieces){
  const counts={};for(const piece of pieces)if(piece?.setHash)counts[piece.setHash]=(counts[piece.setHash]||0)+1;
  const active=Object.entries(counts).flatMap(([hash,count])=>plan.setPerks(hash).filter(perk=>count>=perk.required).map(perk=>({setHash:Number(hash),...perk})));
  const key=perk=>`${perk.setHash}:${perk.required}`,activeKeys=new Set(active.map(key));
  const kept=plan.sharedPerks.filter(perk=>activeKeys.has(key(perk))).length;
  const synergy=active.filter(perk=>perkSynergy(perk.description,plan.subclass).length).length;
  const weights=new Map(plan.priority.stats.map((stat,i)=>[stat.statHash,plan.priority.stats.length-i]));
  const statScore=pieces.reduce((sum,piece)=>sum+[...weights].reduce((n,[hash,weight])=>n+weight*(piece?.stats?.[hash]||0),0),0);
  const top=plan.priority.stats[0]?.statHash,archetype=pieces.filter(piece=>top&&piece?.archetype?.statHash===top).length;
  const exotics=pieces.filter(piece=>piece?.isExotic).length;
  return {counts,active,activeKeys,kept,synergy,statScore,archetype,valid:exotics<=1};
}
const better=(a,b)=>b.kept-a.kept||b.synergy-a.synergy||b.statScore-a.statScore||b.archetype-a.archetype;

// One joint suggestion for every missing armour slot, so set bonuses can be kept across slots.
function suggest(plan){
  const suggestions=new Map(),missing=plan.slots.filter(slot=>slot.missing&&slot.kind==='armour'&&slot.candidates.length);
  const sharedSets=new Set(plan.sharedPerks.map(perk=>perk.setHash));
  const pools=missing.map(slot=>[...slot.candidates].sort((a,b)=>Number(sharedSets.has(b.setHash))-Number(sharedSets.has(a.setHash))||better(evaluate(plan,[a]),evaluate(plan,[b]))||stable(a,b)).slice(0,6));
  let best=null;
  const walk=(i,assignment)=>{
    if(i===pools.length){const score=evaluate(plan,armourAt(plan,assignment));if(score.valid&&(!best||better(score,best.score)<0))best={score,assignment:new Map(assignment)};return;}
    for(const candidate of pools[i]){assignment.set(missing[i].bucketHash,candidate);walk(i+1,assignment);}
    assignment.delete(missing[i].bucketHash);
  };
  walk(0,new Map());
  for(const [bucket,candidate] of best?.assignment||[])suggestions.set(bucket,candidate.id);
  for(const slot of plan.slots.filter(slot=>slot.missing&&slot.kind==='weapon')){const ranked=rankWeapons(plan,slot);if(ranked[0])suggestions.set(slot.bucketHash,ranked[0].id);}
  return suggestions;
}

function rankWeapons(plan,slot){
  const exoticElsewhere=plan.slots.some(other=>other.kind==='weapon'&&other!==slot&&!other.missing&&other.owned?.isExotic);
  return slot.candidates.filter(candidate=>!(candidate.isExotic&&exoticElsewhere)).map(candidate=>{
    const definition=slot.target.definition,sameType=candidate.itemSubType===definition?.itemSubType,sameElement=candidate.damageTypeHash&&candidate.damageTypeHash===Number(definition?.defaultDamageTypeHash);
    const gaps=sharedSocketGaps(slot.target,candidate.row,plan.profile);
    const reasons=[],costs=[];
    if(sameType)reasons.push(`Same weapon type as ${slot.shared.name}: ${candidate.itemTypeName}.`);
    if(sameElement)reasons.push(`Same damage type as ${slot.shared.name}.`);
    if(!sameType)costs.push(`A ${candidate.itemTypeName||'different weapon'}, not a ${slot.shared.itemTypeName||'weapon of the shared type'}.`);
    if(gaps.length)costs.push(`Lacks the sharer's perks: ${list(gaps)}.`);
    if(slot.shared.isExotic)costs.push(`${slot.shared.name}'s Exotic effect is not reproduced.`);
    reasons.push(candidate.location+'.');
    return {...candidate,reasons,costs,score:[Number(sameType),Number(Boolean(sameElement)),-gaps.length]};
  }).sort((a,b)=>b.score[0]-a.score[0]||b.score[1]-a.score[1]||b.score[2]-a.score[2]||stable(a,b));
}

function armourReasons(plan,slot,candidate,score,alternatives){
  const reasons=[],costs=[];
  const partners=setHash=>plan.slots.filter(other=>other.kind==='armour'&&other!==slot).map(other=>other.missing?alternatives.context.get(other.bucketHash):other.owned).filter(piece=>piece?.setHash===setHash).map(piece=>piece.name);
  for(const perk of score.active.filter(perk=>perk.setHash===candidate.setHash)){
    const shared=plan.sharedPerks.some(row=>row.setHash===perk.setHash&&row.required===perk.required);
    const with_=partners(perk.setHash);
    reasons.push(`${shared?'Keeps':'Forms'} the ${candidate.setName} ${perk.required}-piece bonus (${perk.name})${with_.length?` with ${list(with_)}`:''}.`);
    for(const match of perkSynergy(perk.description,plan.subclass))reasons.push(`${perk.name} acts on your ${ABILITY_LABEL[match.key]} (${match.name}).`);
  }
  // A loss is only this choice's cost when another owned piece for this slot would keep it.
  for(const perk of plan.sharedPerks)if(!score.activeKeys.has(`${perk.setHash}:${perk.required}`)&&alternatives.keeps.has(`${perk.setHash}:${perk.required}`))costs.push(`Loses the ${perk.setName} ${perk.required}-piece bonus (${perk.name}).`);
  if(slot.shared.isExotic&&candidate.itemHash!==slot.shared.itemHash)costs.push(`${slot.shared.name}'s Exotic perk${slot.shared.exoticPerk?.name?` (${slot.shared.exoticPerk.name})`:''} is not reproduced.`);
  if(candidate.stats&&plan.priority.stats.length)reasons.push(`${plan.priority.stats.slice(0,3).map(stat=>`${stat.name} ${candidate.stats[stat.statHash]}`).join(', ')} (this build's top stats).`);
  else if(!candidate.stats)costs.push('Its stat values are not available.');
  if(candidate.archetype?.name)reasons.push(`${candidate.archetype.name} archetype${candidate.archetype.primary?`: primary stat ${candidate.archetype.primary}`:''}.`);
  reasons.push(candidate.location+'.');
  return {reasons,costs};
}

// Every owned item for one slot, ranked with the other slots as decided (or as suggested).
export function rankSlot(plan,slot,decisions=new Map()){
  if(slot.kind==='weapon')return rankWeapons(plan,slot);
  const context=new Map();
  for(const other of plan.slots.filter(row=>row.missing&&row.kind==='armour'&&row!==slot)){const id=chosenId(plan,other,decisions);context.set(other.bucketHash,id?other.candidates.find(row=>row.id===id)||null:null);}
  const otherExotic=plan.slots.some(other=>other.kind==='armour'&&other!==slot&&(other.missing?context.get(other.bucketHash):other.owned)?.isExotic);
  const scored=slot.candidates.filter(candidate=>!(candidate.isExotic&&otherExotic)).map(candidate=>({candidate,score:evaluate(plan,armourAt(plan,new Map([...context,[slot.bucketHash,candidate]])))}));
  const keeps=new Set(scored.flatMap(row=>[...row.score.activeKeys]));
  return scored.sort((a,b)=>better(a.score,b.score)||stable(a.candidate,b.candidate)).map(({candidate,score})=>({...candidate,...armourReasons(plan,slot,candidate,score,{context,keeps})}));
}

/** The item id a slot will use: a decision's item, or the suggestion while undecided. */
function chosenId(plan,slot,decisions){
  const decision=decisions.get(slot.bucketHash);
  if(decision)return decision.type==='empty'?null:decision.id;
  return plan.suggestions.get(slot.bucketHash)||null;
}

// URL form: "<bucketHash>:a<id>" approve, ":c<id>" choose another, ":e" leave empty; joined by ".".
export function decodeDecisions(text){
  const decisions=new Map();
  for(const part of String(text||'').split('.')){
    const match=part.match(/^(\d{1,10}):(?:(a|c)(\d{1,20})|(e))$/);if(!match)continue;
    decisions.set(Number(match[1]),match[4]?{type:'empty'}:{type:match[2]==='a'?'approve':'choose',id:match[3]});
  }
  return decisions;
}
export function encodeDecisions(decisions){
  return [...decisions].sort((a,b)=>a[0]-b[0]).map(([bucket,decision])=>`${bucket}:${decision.type==='empty'?'e':`${decision.type==='approve'?'a':'c'}${decision.id}`}`).join('.');
}
/** Decisions that still point at an owned candidate; anything else is dropped as undecided. */
export function validDecisions(plan,decisions){
  const valid=new Map();
  for(const slot of plan.slots.filter(row=>row.missing)){
    const decision=decisions.get(slot.bucketHash);if(!decision)continue;
    if(decision.type==='empty'||slot.candidates.some(row=>row.id===decision.id))valid.set(slot.bucketHash,decision);
  }
  return valid;
}
export function approveAll(plan,decisions){
  const next=new Map(decisions);
  for(const slot of plan.slots.filter(row=>row.missing&&!next.has(row.bucketHash))){const id=plan.suggestions.get(slot.bucketHash);if(id)next.set(slot.bucketHash,{type:'approve',id});}
  return next;
}

/** The build as decided so far: per slot item, set bonuses and stat totals. */
export function resolveFit(plan,decisions=new Map()){
  const slots=plan.slots.map(slot=>{
    if(!slot.missing)return {...slot,state:'owned',decision:null,item:slot.owned,ranked:[]};
    const decision=decisions.get(slot.bucketHash)||null,ranked=rankSlot(plan,slot,decisions);
    const suggestionId=plan.suggestions.get(slot.bucketHash)||null,suggestion=ranked.find(row=>row.id===suggestionId)||null;
    const item=decision&&decision.type!=='empty'?ranked.find(row=>row.id===decision.id)||slot.candidates.find(row=>row.id===decision.id)||null:null;
    return {...slot,state:decision?'decided':'undecided',decision,item,suggestion,ranked};
  });
  const armour=slots.filter(slot=>slot.kind==='armour'),pieces=armour.map(slot=>slot.item||null);
  const score=evaluate(plan,pieces),tables=plan.tables;
  const setHashes=[...new Set([...plan.sharedPerks.map(perk=>perk.setHash),...Object.keys(score.counts).map(Number)])];
  const sets=setHashes.map(hash=>({hash,name:nameOf(tables[SETS]?.[hash]),count:score.counts[hash]||0,shared:plan.sharedPerks.some(perk=>perk.setHash===hash),perks:plan.setPerks(hash).map(perk=>({...perk,active:(score.counts[hash]||0)>=perk.required,shared:plan.sharedPerks.some(row=>row.setHash===hash&&row.required===perk.required)}))})).filter(set=>set.shared||set.perks.some(perk=>perk.active));
  const known=armour.every(slot=>slot.state==='undecided'||!slot.item||slot.item.stats);
  const stats=ARMOUR_STATS.map(hash=>({statHash:hash,name:nameOf(tables.DestinyStatDefinition?.[hash])||`Stat ${hash}`,value:known?pieces.reduce((sum,piece)=>sum+(piece?.stats?.[hash]||0),0):null}));
  const undecided=slots.filter(slot=>slot.state==='undecided');
  return {slots,sets,stats,undecided:undecided.length,emptyArmour:armour.filter(slot=>slot.state!=='undecided'&&!slot.item).length,pendingArmour:armour.filter(slot=>slot.state==='undecided').length,ready:!undecided.length};
}

/** Item instance per decided slot, for the handoff. Owned shared items keep their own instance. */
export function fitChoices(plan,decisions){
  const fit=resolveFit(plan,decisions);
  if(!fit.ready)throw new Error('Decide every missing item first.');
  return new Map(fit.slots.map(slot=>[slot.bucketHash,slot.item?{itemInstanceId:slot.item.id,status:slot.state==='owned'?'matched':slot.decision.type==='approve'?'approved':'chosen',reasons:slot.state==='owned'?['Same item']:[...(slot.item.reasons||[]),...(slot.item.costs||[])]}:{itemInstanceId:null,status:'empty',reasons:['Left empty by your choice.']}]));
}

