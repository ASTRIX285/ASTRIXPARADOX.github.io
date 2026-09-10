import {classifyArmourPlug,classifyWeaponPlug,weaponPerkColumnRowCountForTier,weaponPerkRowCountForTier} from '../guardian-semantic-resolver.mjs?v=20260910-tier-zero-evidence-1';
import {explicitTokens} from './paradox-forge-intelligence.mjs';

const STAT_KEYS=Object.freeze(['health','melee','grenade','super','class','weapon']);
const WEAPON_BUCKETS=Object.freeze([1498876634,2465295065,953998645]);
const OBJECTIVE_TERMS=Object.freeze({
  balanced:['health','grenade','melee','class ability','super','weapon','orb of power'],
  dps:['weapon','super','radiant','weaken','ignite','volatile','precision','damage','reload'],
  'add-clear':['grenade','jolt','scorch','ignite','volatile','threadling','tangle','shatter','area','chain'],
  survivability:['health','cure','restoration','overshield','woven mail','invisibility','devour','resist'],
  'ability-uptime':['grenade','melee','class ability','super','ionic trace','orb of power','energy','cooldown']
});
const EMPTY_MOD=/^(empty|no)\b|empty (armou?r )?mod|no mod/i;
const SINGLE_COPY_MOD_TEXT=/similar (?:armou?r )?mod already applied|additional copies? (?:of this mod )?(?:provide|provides) no benefit|does not stack|cannot be stacked|only one copy/i;
const VERIFIED_SINGLE_COPY_MOD_HASHES=new Set([4004774872]); // Special Finisher; verified against the in-game duplicate warning.
const DAMAGE_ELEMENTS=Object.freeze(['arc','solar','void','stasis','strand','kinetic']);

const clone=value=>{try{return structuredClone(value);}catch{return JSON.parse(JSON.stringify(value??null));}};
const clean=value=>String(value??'').trim();
const lower=value=>clean(value).toLowerCase();
const itemHash=item=>Number(item?.hash??item?.itemHash??item?.bungieHash);
const itemIdentity=item=>String(item?.itemInstanceId||itemHash(item)||'');
const itemName=(item,fallback='Verified option')=>clean(item?.name||item?.displayName||item?.definition?.displayProperties?.name)||fallback;
const itemText=item=>[
  itemName(item,''),item?.description,item?.itemTypeDisplayName,item?.definition?.displayProperties?.description,
  item?.definition?.itemTypeDisplayName,item?.definition?.plug?.plugCategoryIdentifier,item?.element,item?.damageType,
  item?.elementDefinition?.displayProperties?.name,item?.definition?.defaultDamageTypeName,...(item?.definition?.traitIds||[])
].map(clean).filter(Boolean).join(' · ').toLowerCase();
const isExoticItem=item=>Boolean(item&&(item.isExotic===true||Number(item.tierType??item.definition?.inventory?.tierType)===6||/\bexotic\b/i.test([item.rarity,item.tier,item.tierTypeName,item.definition?.inventory?.tierTypeName].map(clean).join(' '))||item.definition?.equippingBlock?.uniqueLabelHash));
const uniqueByHash=rows=>{const seen=new Set();return (rows||[]).filter(Boolean).filter(row=>{const key=itemHash(row);if(!Number.isInteger(key)||seen.has(key))return false;seen.add(key);return true;});};
const objectiveName=value=>Object.hasOwn(OBJECTIVE_TERMS,lower(value))?lower(value):'balanced';

function itemElement(item={}){
  const declared=[item.element,item.damageType,item.elementDefinition?.displayProperties?.name,item.definition?.defaultDamageTypeName].map(lower);
  return DAMAGE_ELEMENTS.find(element=>declared.some(value=>value===element||value.includes(`${element} damage`)))||null;
}

function deriveLoadoutIntent(build={}){
  const anchor=build.forgeLoaderDecision?.buildAnchor||{},anchorText=itemText(anchor.perk||anchor),subclassText=[build.subclass,build.subclassName,build.subclassBuild?.name,build.subclassBuild?.super?.element,build.subclassBuild?.super?.elementDefinition?.displayProperties?.name].map(lower).join(' '),element=DAMAGE_ELEMENTS.find(value=>value!=='kinetic'&&subclassText.includes(value))||null,grenadeAnchor=/\bgrenade\b|scatter charge|nothing manacles/i.test(anchorText),sequence=[];
  const add=(name,description,weight)=>sequence.push({order:sequence.length+1,name,description,weight});
  add('Exotic and subclass anchor',[itemName(anchor,'Verified Exotic'),element?`${element.toUpperCase()} subclass`:null,grenadeAnchor?'grenade loop':null].filter(Boolean).join(' · '),52);
  if(element)add(`${element.toUpperCase()} owned weapon fit`,`${element} weapons enable matching weapon, Siphon and Artifact effects.`,46);
  if(grenadeAnchor){
    add('Grenade orb generation','Grenade final blows create an Orb of Power through a verified Firepower-style armour mod.',58);
    add('Grenade Super return','Grenade final blows grant Super energy through a verified Ashes to Assets-style armour mod.',56);
    add('Orb and Super loop','Orbs of Power and grenade final blows accelerate Super replenishment and ability uptime.',50);
  }
  add('Artifact bucket sequence','Fill each legal Artifact 2.0 bucket in order using the Exotic, subclass, weapons, Orbs of Power and Super loop.',42);
  return {schemaVersion:1,method:'deterministic-cross-system-loadout-loop-v1',element,grenadeAnchor,requiresMatchingWeapon:Boolean(element),sequence};
}

function requiredWeaponElement(mod){
  const value=itemText(mod);
  return DAMAGE_ELEMENTS.find(element=>new RegExp(`\\b${element}\\s+(?:weapon|siphon)`).test(value)||new RegExp(`\\b${element}\\b.{0,36}\\bweapon`).test(value))||null;
}

function modLoopRole(mod){
  const value=itemText(mod);
  if(/grenade final blows?/.test(value)&&/orbs? of power/.test(value))return 'grenade-orb';
  if(/grenade final blows?/.test(value)&&/super energy/.test(value))return 'grenade-super';
  if(requiredWeaponElement(mod)&&/siphon|orbs? of power/.test(value))return 'element-siphon';
  return null;
}

function modCompatibleWithWeapons(mod,build={}){
  const required=requiredWeaponElement(mod);
  if(!required)return {compatible:true,requiredElement:null};
  const matching=(build.weapons||[]).filter(weapon=>itemElement(weapon)===required);
  return {compatible:matching.length>0,requiredElement:required,matchingWeapons:matching.map(weapon=>({hash:itemHash(weapon),itemInstanceId:String(weapon.itemInstanceId||''),name:itemName(weapon)}))};
}

function statKey(name){
  const value=lower(name).replace(/[^a-z0-9]+/g,'');
  if(value==='class'||value==='classability')return 'class';
  if(value==='weapon'||value==='weapons')return 'weapon';
  return STAT_KEYS.find(key=>value===key)||null;
}

function modCost(mod){
  const value=mod?.energyCost??mod?.cost??mod?.definition?.plug?.energyCost??mod?.plug?.energyCost;
  const number=Number(value&&typeof value==='object'?(value.energyCost??value.value):value);
  return Number.isFinite(number)?Math.max(0,number):0;
}

function isVerifiedMod(mod){
  const hash=itemHash(mod),definition=mod?.definition;
  return Number.isInteger(hash)&&hash>0&&mod?.isEnabled!==false&&Boolean(definition&&Object.keys(definition).length)&&!EMPTY_MOD.test(itemName(mod,''))&&['general-mod','slot-mod'].includes(classifyArmourPlug(mod));
}

function modRuleMessages(mod){
  const definition=mod?.definition||{},plug=definition?.plug||mod?.plug||{};
  return [
    ...(plug?.insertionRules||[]).map(row=>row?.failureMessage),
    ...(plug?.enabledRules||[]).map(row=>row?.failureMessage),
    ...(definition?.tooltipNotifications||mod?.tooltipNotifications||[]).map(row=>row?.displayString??row?.displayText??row?.failureMessage)
  ].map(clean).filter(Boolean);
}

function singleCopyModEvidence(mod){
  const hash=itemHash(mod),message=modRuleMessages(mod).find(value=>SINGLE_COPY_MOD_TEXT.test(value));
  if(!Number.isInteger(hash)||hash<=0)return null;
  if(message)return {key:`single-copy:${hash}`,message};
  if(VERIFIED_SINGLE_COPY_MOD_HASHES.has(hash))return {key:`single-copy:${hash}`,message:'Destiny marks additional copies of this mod as providing no benefit.'};
  return null;
}

function modStats(mod){
  const output=Object.fromEntries(STAT_KEYS.map(key=>[key,0]));
  for(const row of mod?.statContributions||[]){
    if(row?.isConditionallyActive===true)continue;
    const key=statKey(row?.name);
    if(key)output[key]+=Number(row?.value||0);
  }
  return output;
}

function buildEvidence(build={}){
  const decision=build.forgeLoaderDecision||{},rows=[];
  const add=(kind,item,{name='',weight=1}={})=>{if(item)rows.push({kind,name:name||itemName(item,kind),tokens:explicitTokens(item),text:itemText(item),weight});};
  const anchor=decision?.buildAnchor||{},anchorPerk=anchor?.perk;
  add('selected Exotic armour',anchorPerk,{name:[anchor?.name,itemName(anchorPerk,'Exotic perk')].filter(Boolean).join(' · '),weight:5});
  for(const row of decision?.setProtocol||[])add(`${Number(row?.count)||0}-piece set`,row?.trait||row);
  const subclass=build.subclassBuild||{};
  for(const item of [subclass.super,...(subclass.abilities||[]),...(subclass.aspects||[]),...(subclass.fragments||[])])add('subclass',item);
  const selectedArtifact=new Set((build.artifactConfiguration?.selectedPerkHashes||build.artifactRecommendation?.selectedPerkHashes||[]).map(String));
  for(const perk of build.artifact?.perks||[])if(selectedArtifact.has(String(itemHash(perk))))add('Artifact',perk);
  for(const weapon of build.weapons||[]){add('weapon',weapon);for(const perk of weapon?.weaponSemantics?.selectedPerks||[])add('weapon perk',perk);}
  const intent=build.loadoutIntent||deriveLoadoutIntent(build);
  for(const step of intent.sequence||[])add(`build-loop step ${step.order}`,step,{name:step.name,weight:Number(step.weight||4)/10});
  return rows;
}

function scoreMod(mod,{build={},objective='balanced'}={}){
  const decision=build.forgeLoaderDecision?.statDirective||{},targets=decision.targets||{},achieved=decision.achieved||{},priorities=decision.priorities||{},stats=modStats(mod),reasons=[],evidence=buildEvidence(build),anchorStats=new Set(evidence.filter(source=>source.weight>1).flatMap(source=>source.tokens).map(token=>token==='class ability'?'class':STAT_KEYS.includes(token)?token:null).filter(Boolean));
  let score=0;
  const compatibility=modCompatibleWithWeapons(mod,build),intent=build.loadoutIntent||deriveLoadoutIntent(build),loopRole=modLoopRole(mod);
  if(!compatibility.compatible)return {score:Number.NEGATIVE_INFINITY,tokens:explicitTokens(mod),stats,reasons:[{kind:'weapon-element-conflict',label:`${itemName(mod)} requires a verified ${String(compatibility.requiredElement).toUpperCase()} weapon, but none is selected.`,score:Number.NEGATIVE_INFINITY}],compatible:false,requiredElement:compatibility.requiredElement,loopRole};
  if(intent.grenadeAnchor&&loopRole==='grenade-orb'){score+=260;reasons.push({kind:'required-loop-step',label:`${itemName(mod)} converts the selected Exotic grenade loop into Orb of Power generation.`,score:260,step:'grenade-orb'});}
  if(intent.grenadeAnchor&&loopRole==='grenade-super'){score+=240;reasons.push({kind:'required-loop-step',label:`${itemName(mod)} converts grenade final blows into faster Super replenishment.`,score:240,step:'grenade-super'});}
  if(loopRole==='element-siphon'&&compatibility.requiredElement===intent.element){score+=120;reasons.push({kind:'verified-weapon-loop',label:`${itemName(mod)} is enabled by the recommended ${String(intent.element).toUpperCase()} weapon selection.`,score:120,element:intent.element});}
  for(const key of STAT_KEYS){
    const value=Number(stats[key]||0);if(!value)continue;
    const target=Number(targets[key]||0),raw=Number(achieved[key]||0),shortfall=Math.max(0,target-raw),rank=Number(priorities[key]||0),anchorBonus=anchorStats.has(key)?12:0,weight=(rank>0?Math.max(4,12-rank):shortfall>0?5:2)+anchorBonus,points=value*weight;
    score+=points;reasons.push({kind:anchorBonus?'exotic-anchor-stat':'stat',label:`${value>0?'+':''}${value} ${key.toUpperCase()} supports ${anchorBonus?'the selected Exotic armour loop':rank>0?`priority ${rank}`:shortfall>0?`${shortfall}-point raw shortfall`:'the projected stat total'}.`,score:points,stat:key,value});
  }
  const tokens=explicitTokens(mod);
  for(const source of evidence){
    const shared=tokens.filter(token=>source.tokens.includes(token)).slice(0,2);
    for(const token of shared){const points=9*Math.max(1,Number(source.weight)||1);score+=points;reasons.push({kind:source.weight>1?'exotic-anchor-synergy':'synergy',label:`Verified ${token} wording matches ${source.kind} · ${source.name}.`,score:points,token});}
  }
  const objectiveTerms=OBJECTIVE_TERMS[objectiveName(objective)],text=itemText(mod);
  const objectiveMatches=objectiveTerms.filter(term=>text.includes(term)).slice(0,3);
  for(const term of objectiveMatches){score+=6;reasons.push({kind:'objective',label:`Explicit ${term} evidence supports the ${objectiveName(objective)} objective.`,score:6,term});}
  reasons.sort((left,right)=>right.score-left.score||left.label.localeCompare(right.label));
  return {score,tokens,stats,reasons,compatible:true,requiredElement:compatibility.requiredElement,loopRole};
}

function socketRows(item={}){
  const current=[...(item.generalMods||item.armourSemantics?.generalMods||[]),...(item.slotMods||item.armourSemantics?.slotMods||[])];
  const currentBySocket=new Map(current.filter(row=>Number.isInteger(Number(row?.socketIndex))).map(row=>[Number(row.socketIndex),row]));
  const options=item.armourModOptions||item.socketOptions||{};
  const indexes=new Set([...currentBySocket.keys(),...Object.keys(options).map(Number).filter(Number.isInteger)]);
  return [...indexes].sort((a,b)=>a-b).map(socketIndex=>{
    const currentPlug=currentBySocket.get(socketIndex)||null,available=uniqueByHash(options[String(socketIndex)]||options[socketIndex]||[]);
    const currentRole=classifyArmourPlug(currentPlug),role=['general-mod','slot-mod'].includes(currentRole)?currentRole:classifyArmourPlug(available.find(row=>['general-mod','slot-mod'].includes(classifyArmourPlug(row))));
    if(!['general-mod','slot-mod'].includes(role))return null;
    return {socketIndex,role,currentPlug,current:isVerifiedMod(currentPlug)?currentPlug:null,options:available.filter(row=>classifyArmourPlug(row)===role&&isVerifiedMod(row)&&row.canInsert!==false)};
  }).filter(Boolean);
}

function rankArmourModPlan(item,build,objective){
  const sockets=socketRows(item),energy=item.energy||item.armourSemantics?.energy||{},capacity=energy?.capacity===null||energy?.capacity===undefined?null:Number(energy.capacity),reportedUsed=energy?.used===null||energy?.used===undefined?null:Number(energy.used);
  const installed=sockets.map(row=>row.current).filter(Boolean),installedCost=installed.reduce((sum,mod)=>sum+modCost(mod),0),baseUsed=Number.isFinite(reportedUsed)?Math.max(0,reportedUsed-installedCost):0,limit=Number.isFinite(capacity)?capacity:Number.POSITIVE_INFINITY;
  let beam=[{score:0,used:baseUsed,choices:[],singleCopyKeys:new Set(),loopRoles:new Set()}];
  for(const socket of sockets){
    const scored=uniqueByHash([socket.current,...socket.options]).map(mod=>({mod,...scoreMod(mod,{build,objective})}));
    const useful=scored.filter(row=>row.compatible!==false&&(row.mod===socket.current||row.score>0)),choices=[...useful,{mod:null,score:0,stats:Object.fromEntries(STAT_KEYS.map(key=>[key,0])),reasons:[],loopRole:null}];
    const next=[];
    for(const state of beam)for(const choice of choices){
      const singleCopy=singleCopyModEvidence(choice.mod);if(singleCopy&&state.singleCopyKeys.has(singleCopy.key))continue;
      const used=state.used+modCost(choice.mod);if(used>limit)continue;
      const currentHash=itemHash(socket.current),choiceHash=itemHash(choice.mod),same=(!socket.current&&!choice.mod)||(Number.isInteger(currentHash)&&currentHash===choiceHash),stability=same?2:0,changePenalty=same?0:1;
      const singleCopyKeys=new Set(state.singleCopyKeys);if(singleCopy)singleCopyKeys.add(singleCopy.key);
      const repeatedLoopRole=choice.loopRole&&state.loopRoles.has(choice.loopRole),diversityPenalty=repeatedLoopRole?Math.min(220,Math.max(45,Math.round(choice.score*.72))):0,loopRoles=new Set(state.loopRoles);if(choice.loopRole)loopRoles.add(choice.loopRole);
      next.push({score:state.score+choice.score+stability-changePenalty-diversityPenalty,used,choices:[...state.choices,{socket,...choice}],singleCopyKeys,loopRoles});
    }
    next.sort((left,right)=>right.score-left.score||left.used-right.used||JSON.stringify(left.choices.map(row=>itemHash(row.mod)||0)).localeCompare(JSON.stringify(right.choices.map(row=>itemHash(row.mod)||0))));
    beam=next.slice(0,64);
  }
  const best=beam[0]||{score:0,used:Number.isFinite(reportedUsed)?reportedUsed:0,choices:[]};
  const decisions=best.choices.map(row=>{
    const before=row.socket.current,after=row.mod,beforeHash=itemHash(before),afterHash=itemHash(after);
    const action=(!before&&!after)||(before&&after&&beforeHash===afterHash)?'KEEP':!before&&after?'ADD':before&&!after?'REMOVE':'REPLACE';
    return {armourItemInstanceId:String(item.itemInstanceId||''),armourName:itemName(item,'Armour'),socketIndex:row.socket.socketIndex,role:row.socket.role,action,current:clone(before),recommended:clone(after),energyCost:modCost(after),score:row.score,reasons:row.reasons.slice(0,3),projectedStats:row.stats,verifiedOptions:row.socket.options.length};
  });
  const limitations=[];
  if(!sockets.length)limitations.push(`${itemName(item,'Armour')}: Bungie supplied no resolved functional mod sockets.`);
  if(!Number.isFinite(capacity))limitations.push(`${itemName(item,'Armour')}: energy capacity was not resolved, so no capacity claim is made.`);
  for(const row of sockets)if(!row.options.length)limitations.push(`${itemName(item,'Armour')} socket ${row.socketIndex}: no verified insertable alternatives were supplied; the installed state is preserved.`);
  const repeatedSingleCopyOptions=new Map();
  for(const row of sockets)for(const mod of uniqueByHash([row.current,...row.options])){const evidence=singleCopyModEvidence(mod);if(!evidence)continue;const existing=repeatedSingleCopyOptions.get(evidence.key)||{mod,evidence,sockets:new Set()};existing.sockets.add(row.socketIndex);repeatedSingleCopyOptions.set(evidence.key,existing);}
  for(const {mod,sockets:eligible} of repeatedSingleCopyOptions.values())if(eligible.size>1)limitations.push(`${itemName(item,'Armour')}: ${itemName(mod,'Mod')} is limited to one copy because Bungie marks additional copies as conflicting or non-beneficial.`);
  return {itemInstanceId:String(item.itemInstanceId||''),itemName:itemName(item,'Armour'),capacity:Number.isFinite(capacity)?capacity:null,reportedUsed:Number.isFinite(reportedUsed)?reportedUsed:null,projectedUsed:Number.isFinite(best.used)?best.used:null,score:best.score,decisions,limitations};
}

function projectedStats(build,decisions){
  const raw=Object.fromEntries(STAT_KEYS.map(key=>[key,Number(build.forgeLoaderDecision?.statDirective?.achieved?.[key]||0)])),currentContribution=Object.fromEntries(STAT_KEYS.map(key=>[key,decisions.reduce((sum,row)=>sum+Number(modStats(row.current||{})[key]||0),0)])),recommendedContribution=Object.fromEntries(STAT_KEYS.map(key=>[key,decisions.reduce((sum,row)=>sum+Number(modStats(row.recommended||{})[key]||0),0)]));
  const total=vector=>Object.fromEntries(STAT_KEYS.map(key=>[key,Math.max(0,Math.min(200,Number(raw[key]||0)+Number(vector[key]||0)))]));
  return {raw,currentContribution,currentTotal:total(currentContribution),recommendedContribution,recommendedTotal:total(recommendedContribution)};
}

function applyRecommendedMods(item,decisions){
  const next=clone(item);if(!decisions.length)return next;
  const selected=decisions.map(row=>row.recommended?{...clone(row.recommended),socketIndex:row.socketIndex,semanticRole:row.role}:null).filter(Boolean),generalMods=selected.filter(row=>row.semanticRole==='general-mod').sort((a,b)=>a.socketIndex-b.socketIndex),slotMods=selected.filter(row=>row.semanticRole==='slot-mod').sort((a,b)=>a.socketIndex-b.socketIndex),masterwork=next.masterwork||next.armourSemantics?.masterwork||null;
  next.generalMods=generalMods;next.slotMods=slotMods;next.mods=[masterwork,...generalMods.slice(0,2),...slotMods.slice(0,3)];next.armourSemantics={...(next.armourSemantics||{}),generalMods,slotMods};
  return next;
}

function validateArmourModLoadout(build={}){
  const violations=[];
  for(const item of build.armour||[]){
    if(!item)continue;
    const seen=new Map(),mods=[...(item.generalMods||item.armourSemantics?.generalMods||[]),...(item.slotMods||item.armourSemantics?.slotMods||[])];
    for(const mod of mods){
      const evidence=singleCopyModEvidence(mod);if(!evidence)continue;
      const prior=seen.get(evidence.key);if(prior)violations.push({kind:'single-copy',armourItemInstanceId:String(item.itemInstanceId||''),armourName:itemName(item,'Armour'),modHash:itemHash(mod),modName:itemName(mod,'Mod'),socketIndexes:[Number(prior.socketIndex),Number(mod.socketIndex)].filter(Number.isFinite),reason:evidence.message});else seen.set(evidence.key,mod);
    }
    const capacity=Number(item?.energy?.capacity??item?.armourSemantics?.energy?.capacity),used=mods.reduce((sum,mod)=>sum+modCost(mod),0);
    if(Number.isFinite(capacity)&&capacity>=0&&used>capacity)violations.push({kind:'energy-capacity',armourItemInstanceId:String(item.itemInstanceId||''),armourName:itemName(item,'Armour'),energyUsed:used,energyCapacity:capacity,reason:`${itemName(item,'Armour')} uses ${used}/${capacity} armour energy.`});
  }
  const first=violations[0];
  return {ready:violations.length===0,reason:first?`Invalid armour-mod plan: ${first.kind==='energy-capacity'?first.reason:`${first.modName} cannot be recommended more than once on ${first.armourName}.`}`:'',violations};
}

function recommendArmourMods({build={},objective='balanced'}={}){
  // Keep the large verified catalogues structurally shared. This function only
  // replaces the five Working Build armour rows and its recommendation record.
  const working={...(build||{})},resolvedObjective=objectiveName(objective||working.objective);working.loadoutIntent=working.loadoutIntent||deriveLoadoutIntent(working);const items=(working.armour||[]).filter(Boolean),itemPlans=items.map(item=>rankArmourModPlan(item,working,resolvedObjective)),decisions=itemPlans.flatMap(row=>row.decisions),limitations=itemPlans.flatMap(row=>row.limitations);
  const byItem=new Map(itemPlans.map(row=>[row.itemInstanceId,row]));
  working.armour=(working.armour||[]).map(item=>item?applyRecommendedMods(item,byItem.get(String(item.itemInstanceId||''))?.decisions||[]):item);
  const validation=validateArmourModLoadout(working),selectedRoles=[...new Set(decisions.map(row=>modLoopRole(row.recommended)).filter(Boolean))],plan={schemaVersion:1,source:'bungie-item-sockets-and-reusable-plugs',method:'deterministic-energy-bounded-mod-beam-v3-cross-system-loop',objective:resolvedObjective,status:validation.ready?'review-required':'invalid',rawStatsModFree:true,projectedStats:projectedStats(working,decisions),items:itemPlans,decisions,loopCoverage:{grenadeOrb:selectedRoles.includes('grenade-orb'),grenadeSuper:selectedRoles.includes('grenade-super'),elementSiphon:selectedRoles.includes('element-siphon'),selectedRoles},summary:{keep:decisions.filter(row=>row.action==='KEEP').length,replace:decisions.filter(row=>row.action==='REPLACE').length,add:decisions.filter(row=>row.action==='ADD').length,remove:decisions.filter(row=>row.action==='REMOVE').length},constraints:{singleCopyConflicts:validation.violations.length},validation,limitations:[...new Set(limitations)],requiresReview:true,liveTransferAuthorized:false};
  working.objective=resolvedObjective;working.armourModRecommendation=plan;
  return {workingBuild:working,recommendation:plan};
}

function weaponEvidence(weapon){const semantics=weapon?.weaponSemantics||{},catalyst=semantics.catalyst||weapon?.catalyst,catalystMasterworked=Boolean(catalyst?.progress?.masterworked||catalyst?.progress?.active);return [weapon,semantics.intrinsic,...(semantics.exoticTraits||[]),...(semantics.selectedPerks||[]),...(semantics.alternativePerkColumns||[]).flatMap(column=>column.options||[]),...(catalystMasterworked?[catalyst]:[])].filter(Boolean);}
function scoreWeapon(weapon,objective,currentIds,sources,intent){
  const evidence=weaponEvidence(weapon),tokens=[...new Set(evidence.flatMap(explicitTokens))],text=evidence.map(itemText).join(' · '),reasons=[];
  let score=currentIds.has(itemIdentity(weapon))?2:0;
  const element=itemElement(weapon);
  if(intent?.requiresMatchingWeapon&&element===intent.element){score+=180;reasons.push({kind:'required-element-fit',label:`${itemName(weapon,'Weapon')} is a verified ${String(element).toUpperCase()} weapon that enables matching Siphon and Artifact effects.`,score:180,element});}
  for(const source of sources){for(const token of tokens.filter(value=>source.tokens.includes(value)).slice(0,3)){const points=12*Math.max(1,Number(source.weight)||1);score+=points;reasons.push({kind:source.weight>1?'exotic-anchor-synergy':'synergy',label:`${itemName(weapon,'Weapon')} has verified ${token} evidence matching ${source.kind} · ${source.name}.`,score:points,token});}}
  for(const term of OBJECTIVE_TERMS[objectiveName(objective)].filter(term=>text.includes(term)).slice(0,5)){score+=7;reasons.push({kind:'objective',label:`Explicit ${term} wording supports the ${objectiveName(objective)} objective.`,score:7,term});}
  reasons.sort((left,right)=>right.score-left.score||left.label.localeCompare(right.label));
  return {weapon,score,reasons,tokens};
}

function selectOwnedWeapons({build={},objective='balanced'}={}){
  // Weapon selection changes three exact instances only. Deep-cloning the full
  // Vault here multiplies memory use and can stall Chrome on larger accounts.
  const working={...(build||{})},resolvedObjective=objectiveName(objective||working.objective);working.loadoutIntent=working.loadoutIntent||deriveLoadoutIntent(working);const ownedSources=[...(working.ownedWeapons||[]),...(working.vaultWeapons||[]),...(working.inventoryWeapons||[]),...(working.weapons||[])],seenOwned=new Set(),owned=ownedSources.filter(item=>item?.itemInstanceId&&item?.definition&&Object.keys(item.definition).length).filter(item=>{const key=itemIdentity(item);if(!key||seenOwned.has(key))return false;seenOwned.add(key);return true;}),currentIds=new Set((working.weapons||[]).map(itemIdentity)),sources=buildEvidence({...working,weapons:[]}),decisions=[],selected=[];
  const rankedByBucket=WEAPON_BUCKETS.map(bucketHash=>owned.filter(item=>Number(item.bucketHash)===bucketHash).map(item=>scoreWeapon(item,resolvedObjective,currentIds,sources,working.loadoutIntent)).sort((left,right)=>right.score-left.score||itemName(left.weapon).localeCompare(itemName(right.weapon))||itemIdentity(left.weapon).localeCompare(itemIdentity(right.weapon))));
  let plans=[{rows:[],score:0,exoticCount:0,signature:''}];
  for(const candidates of rankedByBucket){
    const options=[candidates.find(row=>!isExoticItem(row.weapon)),candidates.find(row=>isExoticItem(row.weapon))].filter(Boolean);
    const choices=options.length?options:[null],next=[];
    for(const plan of plans)for(const row of choices){const exoticCount=plan.exoticCount+Number(isExoticItem(row?.weapon));if(exoticCount>1)continue;const identity=itemIdentity(row?.weapon);next.push({rows:[...plan.rows,row],score:plan.score+Number(row?.score||0),exoticCount,signature:`${plan.signature}|${identity}`});}
    plans=next.sort((left,right)=>right.score-left.score||left.signature.localeCompare(right.signature));
  }
  const chosenPlan=plans[0]||{rows:[null,null,null],exoticCount:0};
  for(const [index,bucketHash] of WEAPON_BUCKETS.entries()){
    const candidates=rankedByBucket[index],best=chosenPlan.rows[index]||null,current=(working.weapons||[]).find(item=>Number(item?.bucketHash)===bucketHash)||null,choice=best?.weapon||current;
    if(choice)selected.push(clone(choice));
    const exoticExcluded=candidates.find(row=>isExoticItem(row.weapon)&&itemIdentity(row.weapon)!==itemIdentity(choice)),reasons=(best?.reasons||[]).slice(0,4);
    if(exoticExcluded&&chosenPlan.exoticCount===1&&!isExoticItem(choice))reasons.push({kind:'equip-rule',label:`${itemName(exoticExcluded.weapon,'Exotic weapon')} was excluded because Destiny permits only one Exotic weapon in a loadout.`,score:0});
    decisions.push({bucketHash,current:clone(current),recommended:clone(choice),action:current&&choice&&itemIdentity(current)===itemIdentity(choice)?'KEEP':current&&choice?'REPLACE':choice?'ADD':'UNRESOLVED',score:best?.score||0,reasons,candidateCount:candidates.length,isExotic:isExoticItem(choice)});
  }
  working.weapons=selected;working.objective=resolvedObjective;
  const limitations=[];if(!(working.ownedWeapons||[]).length)limitations.push('A broader owned-weapon catalogue was unavailable; current equipped weapons were retained.');for(const row of decisions)if(!row.candidateCount)limitations.push(`Weapon bucket ${row.bucketHash}: no verified exact owned instance was resolved.`);
  const selectedExoticWeaponCount=selected.filter(isExoticItem).length,matchingElementCount=working.loadoutIntent.element?selected.filter(item=>itemElement(item)===working.loadoutIntent.element).length:0;if(working.loadoutIntent.requiresMatchingWeapon&&!matchingElementCount)limitations.push(`No exact owned ${String(working.loadoutIntent.element).toUpperCase()} weapon instance could be selected; matching Siphon and Artifact effects are blocked.`);const recommendation={schemaVersion:1,source:'bungie-owned-exact-weapon-instances',inventoryScope:(working.ownedWeapons||[]).length?'vault-character-and-equipped':'equipped-fallback',method:'deterministic-owned-weapon-evidence-rank-v3-element-loop-exotic-constrained',objective:resolvedObjective,status:'review-required',decisions,candidateCount:owned.length,constraints:{maxExoticWeapons:1,selectedExoticWeaponCount,requiredElement:working.loadoutIntent.element,matchingElementCount},limitations,requiresReview:true,liveTransferAuthorized:false};
  working.weaponSelectionRecommendation=recommendation;
  return {workingBuild:working,recommendation};
}

function validateExoticLoadout(build={}, {requireArmourAnchor=false}={}){
  const exoticArmour=(build.armour||[]).filter(isExoticItem),exoticWeapons=(build.weapons||[]).filter(isExoticItem),anchorId=String(build.forgeLoaderDecision?.buildAnchor?.selectedItemInstanceId||''),anchorMatch=anchorId?exoticArmour.some(item=>itemIdentity(item)===anchorId):false;
  if(exoticArmour.length>1)return {ready:false,reason:'Destiny permits only one Exotic armour piece. Return to Forge Loader and stage a legal armour result.',exoticArmourCount:exoticArmour.length,exoticWeaponCount:exoticWeapons.length};
  if(requireArmourAnchor&&exoticArmour.length!==1)return {ready:false,reason:'The selected Forge Loader Exotic armour piece is missing from this build.',exoticArmourCount:exoticArmour.length,exoticWeaponCount:exoticWeapons.length};
  if(requireArmourAnchor&&anchorId&&!anchorMatch)return {ready:false,reason:'The staged Exotic armour instance does not match the Forge Loader build anchor.',exoticArmourCount:exoticArmour.length,exoticWeaponCount:exoticWeapons.length};
  if(exoticWeapons.length>1)return {ready:false,reason:'Destiny permits only one Exotic weapon. Paradox must replace the additional Exotic before review.',exoticArmourCount:exoticArmour.length,exoticWeaponCount:exoticWeapons.length};
  return {ready:true,reason:'',exoticArmourCount:exoticArmour.length,exoticWeaponCount:exoticWeapons.length};
}

function validateWeaponModel(build={}){
  const violations=[];
  for(const weapon of (build.weapons||[]).filter(Boolean)){
    const semantics=weapon.weaponSemantics||{},model=semantics.perkModel||weapon.weaponPerkModel||{},tier=Number(model.weaponTier??semantics.gearTier??weapon.gearTier),name=itemName(weapon,'Weapon'),columns=model.columns||[];
    const expectedRows=weaponPerkRowCountForTier(tier);
    if(!expectedRows||!Number.isFinite(Number(model.expectedRowCount))||Number(model.expectedRowCount)<expectedRows)violations.push(`${name}: the verified Tier ${Number.isInteger(tier)?tier:'unknown'} perk-row model is incomplete.`);
    const ordered=columns.map(column=>Number(column.socketIndex));
    if(ordered.some((socketIndex,index)=>index>0&&socketIndex<ordered[index-1]))violations.push(`${name}: perk columns do not preserve Bungie's socket order.`);
    for(const [index,column] of columns.entries()){
      const columnNumber=index+1,required=weaponPerkColumnRowCountForTier(tier,columnNumber);
      if(required&&(!Number.isFinite(Number(column.expectedRowCount))||Number(column.expectedRowCount)<required))violations.push(`${name}: perk column ${columnNumber} must contain at least ${required} row${required===1?'':'s'} at Tier ${tier}.`);
      if(required&&(column.options||[]).length<required)violations.push(`${name}: Bungie evidence for perk column ${columnNumber} contains fewer than ${required} verified options.`);
      if((column.options||[]).some(option=>classifyWeaponPlug(option)!=='perk'))violations.push(`${name}: a non-perk socket was placed in perk column ${columnNumber}.`);
    }
    const modSockets=semantics.modSockets||[];
    if(modSockets.some(option=>classifyWeaponPlug(option)==='infuse'))violations.push(`${name}: Infuse must not enter the weapon-mod model.`);
    if(modSockets.some(option=>!['masterwork','weapon-mod','catalyst'].includes(classifyWeaponPlug(option))))violations.push(`${name}: a perk or trait was incorrectly placed in the weapon-mod row.`);
  }
  return {ready:violations.length===0,reason:violations[0]||'',violations:[...new Set(violations)]};
}

function validateLoadoutCoherence(build={}){
  const violations=[],intent=build.loadoutIntent||deriveLoadoutIntent(build),exotic=validateExoticLoadout(build,{requireArmourAnchor:true}),mods=validateArmourModLoadout(build),weaponModel=validateWeaponModel(build),artifact=build.artifactRecommendation||null,selectedMods=(build.armour||[]).flatMap(item=>[...(item?.generalMods||item?.armourSemantics?.generalMods||[]),...(item?.slotMods||item?.armourSemantics?.slotMods||[])]);
  if(!exotic.ready)violations.push(exotic.reason);
  if(!mods.ready)violations.push(mods.reason);
  if(!weaponModel.ready)violations.push(...weaponModel.violations);
  for(const mod of selectedMods){const compatibility=modCompatibleWithWeapons(mod,build);if(!compatibility.compatible)violations.push(`${itemName(mod)} requires a selected ${String(compatibility.requiredElement).toUpperCase()} weapon.`);}
  if(artifact&&!(artifact.selectionStatus==='ready'&&artifact.selectionLimit>0&&artifact.selectedPerkHashes?.length===artifact.selectionLimit))violations.push('The complete legal Artifact selection was not resolved.');
  const roles=new Set(selectedMods.map(modLoopRole).filter(Boolean)),available=(build.armour||[]).flatMap(item=>Object.values(item?.armourModOptions||item?.socketOptions||{}).flat()).filter(Boolean),availableRoles=new Set(available.map(modLoopRole).filter(Boolean));
  if(intent.grenadeAnchor&&availableRoles.has('grenade-orb')&&!roles.has('grenade-orb'))violations.push('A verified grenade-to-Orb mod is available but missing from the recommendation.');
  if(intent.grenadeAnchor&&availableRoles.has('grenade-super')&&!roles.has('grenade-super'))violations.push('A verified grenade-to-Super mod is available but missing from the recommendation.');
  const matchingWeapons=(build.weapons||[]).filter(weapon=>itemElement(weapon)===intent.element);
  const matchingOwned=[...(build.ownedWeapons||[]),...(build.vaultWeapons||[]),...(build.inventoryWeapons||[])].filter(weapon=>itemElement(weapon)===intent.element);
  if(intent.requiresMatchingWeapon&&matchingOwned.length&&!matchingWeapons.length)violations.push(`A verified owned ${String(intent.element).toUpperCase()} weapon exists but none was selected.`);
  return {ready:violations.length===0,reason:violations[0]||'',violations:[...new Set(violations)],intent,weaponModel,coverage:{matchingWeaponCount:matchingWeapons.length,grenadeOrb:roles.has('grenade-orb'),grenadeSuper:roles.has('grenade-super'),elementSiphon:roles.has('element-siphon'),artifactPicks:Number(artifact?.selectedPerkHashes?.length||0),artifactLimit:Number(artifact?.selectionLimit||0)}};
}

function createLiveTransferPreflight(build={}){
  const generated=Boolean(build.recommendationGeneratedAt),coherence=generated?validateLoadoutCoherence(build):{ready:true,reason:'',violations:[]},weapons=(build.weapons||[]).filter(Boolean),armour=(build.armour||[]).filter(Boolean),violations=generated?[...coherence.violations]:[],warnings=[];
  if(!/^\d+$/.test(String(build.characterId||''))||!/^\d+$/.test(String(build.membershipId||build.bungieMembershipId||''))||!/^\d+$/.test(String(build.membershipType??'')))violations.push('Apply requires a Bungie Guardian and Destiny membership binding.');
  if(weapons.length!==3||weapons.some(item=>!/^\d+$/.test(String(item.itemInstanceId||''))))violations.push('Apply requires three exact owned weapon instance IDs.');
  if(armour.length!==5||armour.some(item=>!/^\d+$/.test(String(item.itemInstanceId||''))))violations.push('Apply requires five exact owned armour instance IDs.');
  const exotic=validateExoticLoadout(build,{requireArmourAnchor:false});if(!exotic.ready)violations.push(exotic.reason);
  const mods=validateArmourModLoadout(build);if(!mods.ready)violations.push(mods.reason);
  const locationKinds=new Set(['equipped','carried','vault','profile','postmaster']);
  for(const item of [...weapons,...armour])if(!locationKinds.has(String(item?.source?.kind||'')))violations.push(`${itemName(item,'Selected item')} is missing verified owned-location evidence.`);
  if(!build.artifactConfiguration?.selectedPerkHashes?.length)warnings.push('No intended Artifact change is staged.');
  else warnings.push('Artifact choices are preserved as explicit in-game steps unless Bungie exposes a verified free socket mapping.');
  for(const change of build.manualSocketChanges||[])if(change?.remoteSupported===false)warnings.push(`${change.plugName||'A selected socket change'} must be completed in game.`);
  return {schemaVersion:2,status:violations.length?'blocked':'ready',ready:violations.length===0,checkedAt:new Date().toISOString(),mode:generated?'generated-recommendation':'manual-working-build',characterId:String(build.characterId||''),membershipId:String(build.membershipId||build.bungieMembershipId||''),membershipType:String(build.membershipType??''),violations:[...new Set(violations)],warnings:[...new Set(warnings)],coherence,scope:{weapons:weapons.map(item=>String(item.itemInstanceId||'')),armour:armour.map(item=>String(item.itemInstanceId||'')),artifactHash:Number(build.artifactConfiguration?.artifactHash)||null,artifactPerkHashes:[...(build.artifactConfiguration?.selectedPerkHashes||[])],manualSocketChanges:Number(build.manualSocketChanges?.length||0),armourModChanges:Number(build.armourModRecommendation?.summary?.replace||0)+Number(build.armourModRecommendation?.summary?.add||0)+Number(build.armourModRecommendation?.summary?.remove||0)}};
}

export {OBJECTIVE_TERMS,STAT_KEYS,WEAPON_BUCKETS,createLiveTransferPreflight,deriveLoadoutIntent,isExoticItem,isVerifiedMod,itemElement,modCost,modStats,recommendArmourMods,scoreMod,selectOwnedWeapons,validateArmourModLoadout,validateExoticLoadout,validateWeaponModel,validateLoadoutCoherence};
