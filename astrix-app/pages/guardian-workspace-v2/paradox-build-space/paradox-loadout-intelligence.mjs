import {classifyArmourPlug,classifyWeaponPlug,weaponPerkColumnRowCountForTier,weaponPerkRowCountForTier} from '../guardian-semantic-resolver.mjs?v=20260910-tier-zero-evidence-1';
import {explicitTokens} from './paradox-forge-intelligence.mjs?plain=20260925-1';

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
const itemName=(item,fallback='Option')=>clean(item?.name||item?.displayName||item?.definition?.displayProperties?.name)||fallback;
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
  add('Exotic and subclass anchor',[itemName(anchor,'Exotic'),element?`${element.toUpperCase()} subclass`:null,grenadeAnchor?'grenade loop':null].filter(Boolean).join(' · '),52);
  if(element)add(`${element.toUpperCase()} weapon fit`,`${element} weapons enable matching weapon, Siphon and Artifact effects.`,46);
  if(grenadeAnchor){
    add('Grenade orb generation','Grenade final blows create an Orb of Power through a Firepower-style armour mod.',58);
    add('Grenade Super return','Grenade final blows grant Super energy through an Ashes to Assets-style armour mod.',56);
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
  if(!compatibility.compatible)return {score:Number.NEGATIVE_INFINITY,tokens:explicitTokens(mod),stats,reasons:[{kind:'weapon-element-conflict',label:`${itemName(mod)} requires a ${String(compatibility.requiredElement).toUpperCase()} weapon, but none is selected.`,score:Number.NEGATIVE_INFINITY}],compatible:false,requiredElement:compatibility.requiredElement,loopRole};
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
    for(const token of shared){const points=9*Math.max(1,Number(source.weight)||1);score+=points;reasons.push({kind:source.weight>1?'exotic-anchor-synergy':'synergy',label:`${token} wording matches ${source.kind} · ${source.name}.`,score:points,token});}
  }
  const objectiveTerms=OBJECTIVE_TERMS[objectiveName(objective)],text=itemText(mod);
  const objectiveMatches=objectiveTerms.filter(term=>text.includes(term)).slice(0,3);
  for(const term of objectiveMatches){score+=6;reasons.push({kind:'objective',label:`Explicit ${term} supports the ${objectiveName(objective)} objective.`,score:6,term});}
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
  if(!Number.isFinite(capacity))limitations.push(`${itemName(item,'Armour')}: energy capacity unavailable.`);
  for(const row of sockets)if(!row.options.length)limitations.push(`${itemName(item,'Armour')} socket ${row.socketIndex}: no insertable alternatives were supplied; the installed state is preserved.`);
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

const WEAPON_COMBINATION_LIMIT=4;
// These are transparent fit heuristics, not measured DPS or simulated combat.
const ACTIVITY_WEAPON_TERMS=Object.freeze({
  raid:['damage','precision','reload'],dps:['damage','precision','reload'],
  grandmaster:['stun','champion','barrier','overload','unstoppable','health'],
  crucible:['handling','accuracy','range','stability'],pvp:['handling','accuracy','range','stability'],
  pve:['final blows','reload','area']
});
function weaponEvidence(weapon){
  const semantics=weapon?.weaponSemantics||{},catalyst=semantics.catalyst||weapon?.catalyst,model=semantics.perkModel||weapon?.weaponPerkModel;
  const selected=model?.columns?.map(column=>(column.options||[]).find(option=>itemHash(option)===Number(column.selectedPlugHash))).filter(Boolean)||semantics.selectedPerks||[];
  // Score active effects, never the weapon's name/type/flavour text or every
  // mutually exclusive alternative perk as if they were equipped together.
  return [semantics.intrinsic,...(semantics.exoticTraits||[]),...selected,...(catalyst?.progress?.masterworked||catalyst?.progress?.active?[catalyst]:[])].filter(item=>item&&!item.unresolved);
}
function scoreWeapon(weapon,objective,sources,activity){
  const text=weaponEvidence(weapon).map(item=>clean(item.description||item.definition?.displayProperties?.description)).join(' · ').toLowerCase().replace(/grenade launchers?/g,'launcher'),tokens=explicitTokens(text).filter(token=>token!=='weapon'),reasons=[];
  let score=0;
  for(const token of tokens){
    const source=sources.filter(row=>row.tokens.includes(token)).sort((a,b)=>b.weight-a.weight)[0];
    if(!source)continue;
    const points=12*Math.max(1,Number(source.weight)||1);score+=points;
    reasons.push({kind:'perk-synergy',label:`${itemName(weapon,'Weapon')}: active perk ${token} wording supports ${source.kind} · ${source.name}.`,score:points,token});
  }
  const matches=terms=>terms.filter(term=>term!=='weapon'&&new RegExp(`\\b${term}\\b`).test(text));
  for(const term of matches(OBJECTIVE_TERMS[objectiveName(objective)])){score+=7;reasons.push({kind:'objective',label:`Active perk ${term} wording supports ${objectiveName(objective)}.`,score:7,term});}
  for(const term of matches(ACTIVITY_WEAPON_TERMS[activity]||[])){score+=7;reasons.push({kind:'activity',label:`Active perk ${term} wording supports ${activity.toUpperCase()}.`,score:7,term});}
  reasons.sort((a,b)=>b.score-a.score||a.label.localeCompare(b.label));
  const ammo=Number(weapon.ammoType??weapon.definition?.equippingBlock?.ammoType);
  return {weapon,score,reasons,tokens,ammo:[1,2,3].includes(ammo)?ammo:0};
}
const compareWeaponPlans=(a,b)=>b.score-a.score||a.changes-b.changes||a.signature.localeCompare(b.signature);
function extendWeaponPlan(plan,row,currentIds,intent){
  const weapon=row.weapon,ammo=[...plan.ammo];ammo[row.ammo]++;
  return {rows:[...plan.rows,row],score:plan.score+row.score,exoticCount:plan.exoticCount+Number(isExoticItem(weapon)),matching:plan.matching||Boolean(intent.element&&itemElement(weapon)===intent.element),ammo,changes:plan.changes+Number(!currentIds.has(itemIdentity(weapon))),signature:`${plan.signature}|${itemIdentity(weapon)}`,typeSignature:`${plan.typeSignature}|${itemHash(weapon)}`};
}
const emptyWeaponPlan=()=>({rows:[],score:0,exoticCount:0,matching:false,ammo:[0,0,0,0],changes:0,signature:'',typeSignature:''});
function finishWeaponPlan(plan,intent,activity){
  let score=plan.score;const reasons=[];
  if(plan.matching){score+=180;reasons.push({kind:'element-coverage',label:`Includes ${intent.element.toUpperCase()} weapon coverage for matching Siphon and Artifact effects.`,score:180});}
  if(plan.ammo[1]&&plan.ammo[2]){const points=['grandmaster','crucible','pvp'].includes(activity)?90:60;score+=points;reasons.push({kind:'ammo-coverage',label:'Primary and Special ammo roles are both covered.',score:points});}
  if(plan.ammo[3]){score+=20;reasons.push({kind:'ammo-coverage',label:'Includes a Heavy-ammo weapon.',score:20});}
  return {...plan,score,reasons};
}
function selectOwnedWeapons({build={},objective='balanced',baselineWeapons=build.weapons||[],weaponInstanceIds=[]}={}){
  const working={...build},resolvedObjective=objectiveName(objective||build.objective),intent=build.loadoutIntent||deriveLoadoutIntent(build),activity=lower(build.activityContext?.key||build.activityContext?.activityKey||build.activityContext?.name),currentIds=new Set(baselineWeapons.map(itemIdentity));
  const seen=new Set(),owned=[...(build.weapons||[]),...(build.ownedWeapons||[]),...(build.vaultWeapons||[]),...(build.inventoryWeapons||[])].filter(item=>{
    const key=itemIdentity(item);if(!item?.itemInstanceId||!item?.definition||!Object.keys(item.definition).length||!WEAPON_BUCKETS.includes(Number(item.bucketHash))||seen.has(key))return false;seen.add(key);return true;
  });
  const excluded=[],sources=buildEvidence({...working,weapons:[]}),rankedByBucket=WEAPON_BUCKETS.map(bucketHash=>owned.filter(item=>Number(item.bucketHash)===bucketHash).flatMap(weapon=>{
    const validation=validateWeaponModel({weapons:[weapon]});
    if(!validation.ready){excluded.push({itemInstanceId:itemIdentity(weapon),name:itemName(weapon),reason:validation.reason});return [];}
    return [scoreWeapon(weapon,resolvedObjective,sources,activity)];
  }));
  // Keep the best four distinct weapon sets per equivalent coverage state.
  // Every owned candidate is evaluated; no top-Legendary/Exotic preselection.
  // Future scores depend only on this state, so dominated prefixes can be
  // discarded without enumerating millions of full three-item combinations.
  let states=new Map([['initial',{count:1,plans:[emptyWeaponPlan()]}]]);
  for(const candidates of rankedByBucket){
    const next=new Map();
    for(const state of states.values())for(const row of candidates){
      const sample=extendWeaponPlan(state.plans[0],row,currentIds,intent);if(sample.exoticCount>1)continue;
      const key=JSON.stringify([sample.exoticCount,sample.matching,sample.ammo]),target=next.get(key)||{count:0,plans:[]};target.count+=state.count;
      for(const plan of state.plans)target.plans.push(extendWeaponPlan(plan,row,currentIds,intent));
      const distinct=new Set();target.plans.sort(compareWeaponPlans);target.plans=target.plans.filter(plan=>{if(distinct.has(plan.typeSignature))return false;distinct.add(plan.typeSignature);return true;}).slice(0,WEAPON_COMBINATION_LIMIT);next.set(key,target);
    }
    states=next;
  }
  const allPlans=[...states.values()].flatMap(state=>state.plans.map(plan=>finishWeaponPlan(plan,intent,activity))),hasMatching=allPlans.some(plan=>plan.matching),eligible=allPlans.filter(plan=>!intent.requiresMatchingWeapon||!hasMatching||plan.matching).sort(compareWeaponPlans),distinct=new Set(),ranked=eligible.filter(plan=>{if(distinct.has(plan.typeSignature))return false;distinct.add(plan.typeSignature);return true;}).slice(0,WEAPON_COMBINATION_LIMIT);
  let chosen=ranked[0]||null;
  if(weaponInstanceIds.length){
    const ids=new Set(weaponInstanceIds.map(String)),rows=rankedByBucket.map(candidates=>candidates.find(row=>ids.has(itemIdentity(row.weapon))));
    if(weaponInstanceIds.length!==3||ids.size!==3||rows.some(row=>!row))throw new Error('This combination no longer has three complete weapon instances. Generate fresh alternatives.');
    chosen=finishWeaponPlan(rows.reduce((plan,row)=>extendWeaponPlan(plan,row,currentIds,intent),emptyWeaponPlan()),intent,activity);
    if(chosen.exoticCount>1||intent.requiresMatchingWeapon&&hasMatching&&!chosen.matching)throw new Error('This combination violates the Exotic or matching-element build requirement. Generate fresh alternatives.');
  }
  const plans=chosen?[chosen,...ranked.filter(plan=>plan.typeSignature!==chosen.typeSignature)].slice(0,WEAPON_COMBINATION_LIMIT):[],decisions=WEAPON_BUCKETS.map((bucketHash,index)=>{
    const current=baselineWeapons.find(item=>Number(item?.bucketHash)===bucketHash)||null,row=chosen?.rows[index],choice=row?.weapon||current;
    return {bucketHash,current:clone(current),recommended:clone(choice),action:!row?'UNRESOLVED':current&&itemIdentity(current)===itemIdentity(choice)?'KEEP':current?'REPLACE':'ADD',score:row?.score||0,reasons:row?.reasons.slice(0,4)||[],candidateCount:owned.filter(item=>Number(item.bucketHash)===bucketHash).length,eligibleCandidateCount:rankedByBucket[index].length,isExotic:isExoticItem(choice)};
  });
  const combinations=plans.map((plan,index)=>({id:plan.signature,selected:index===0,score:plan.score,changedSlots:plan.changes,exoticCount:plan.exoticCount,reasons:[...plan.reasons,...plan.rows.flatMap(row=>row.reasons.slice(0,1))],weapons:plan.rows.map(row=>({itemInstanceId:itemIdentity(row.weapon),hash:itemHash(row.weapon),name:itemName(row.weapon),icon:row.weapon.icon||row.weapon.definition?.displayProperties?.icon||'',bucketHash:Number(row.weapon.bucketHash),element:itemElement(row.weapon),ammoType:row.ammo,source:row.weapon.source||null,isExotic:isExoticItem(row.weapon)}))}));
  working.weapons=decisions.map(row=>row.recommended).filter(Boolean);working.objective=resolvedObjective;working.loadoutIntent=intent;
  const limitations=[];if(!chosen)limitations.push('No complete legal weapon combination could be resolved; the existing selections require review.');if(excluded.length)limitations.push(`${excluded.length} weapon instance(s) lack selected-perk data and were excluded from alternatives.`);if(!(build.ownedWeapons?.length||build.vaultWeapons?.length||build.inventoryWeapons?.length))limitations.push('The broader inventory is unavailable; only the supplied equipped instances could be compared.');
  if(intent.requiresMatchingWeapon&&!chosen?.matching)limitations.push(`No complete ${String(intent.element).toUpperCase()} weapon combination was resolved; matching effects require review.`);
  const recommendation={schemaVersion:2,source:'bungie-owned-exact-weapon-instances',inventoryScope:build.ownedWeapons?.length||build.vaultWeapons?.length||build.inventoryWeapons?.length?'vault-character-and-equipped':'equipped-fallback',method:'owned-active-perk-combination-rank-v4',objective:resolvedObjective,activity,status:chosen?'review-required':'incomplete',decisions,combinations,candidateCount:owned.length,eligibleCandidateCount:rankedByBucket.flat().length,legalCombinationCount:[...states.values()].reduce((sum,state)=>sum+state.count,0),excluded,constraints:{maxExoticWeapons:1,selectedExoticWeaponCount:working.weapons.filter(isExoticItem).length,requiredElement:intent.element,matchingElementCount:intent.element?working.weapons.filter(item=>itemElement(item)===intent.element).length:0},limitations,requiresReview:true,liveTransferAuthorized:false,scoreBasis:'Active perk descriptions, selected objective/activity, element coverage and ammo roles; not measured damage.'};
  working.weaponSelectionRecommendation=recommendation;return {workingBuild:working,recommendation};
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
    if(!expectedRows||!Number.isFinite(Number(model.expectedRowCount))||Number(model.expectedRowCount)<expectedRows)violations.push(`${name}: the Tier ${Number.isInteger(tier)?tier:'unknown'} perk-row model is incomplete.`);
    if(!columns.length||model.complete===false||(model.unindexedPerks||[]).length)violations.push(`${name}: selected perk data is incomplete.`);
    const ordered=columns.map(column=>Number(column.socketIndex));
    if(columns.some(column=>column.socketIndex==null)||ordered.some(socketIndex=>!Number.isInteger(socketIndex)||socketIndex<0))violations.push(`${name}: perk columns require socket indexes.`);
    if(ordered.some((socketIndex,index)=>index>0&&socketIndex<=ordered[index-1]))violations.push(`${name}: perk columns do not preserve Bungie's socket order.`);
    for(const [index,column] of columns.entries()){
      const columnNumber=index+1,required=weaponPerkColumnRowCountForTier(tier,columnNumber);
      if(required&&(!Number.isFinite(Number(column.expectedRowCount))||Number(column.expectedRowCount)<required))violations.push(`${name}: perk column ${columnNumber} must contain at least ${required} row${required===1?'':'s'} at Tier ${tier}.`);
      // Tier rows are display capacity, not a minimum number of owned choices.
      // Require the selected perk; live Apply still verifies each socket change.
      const selectedHash=Number(column.selectedPlugHash);
      if(!Number.isInteger(selectedHash)||selectedHash<=0||column.selectedVisible===false||!(column.options||[]).some(option=>Number(option?.hash??option?.itemHash??option?.bungieHash)===selectedHash))violations.push(`${name}: the selected perk in column ${columnNumber} has no available option.`);
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
  if(intent.grenadeAnchor&&availableRoles.has('grenade-orb')&&!roles.has('grenade-orb'))violations.push('A grenade-to-Orb mod is available but missing from the recommendation.');
  if(intent.grenadeAnchor&&availableRoles.has('grenade-super')&&!roles.has('grenade-super'))violations.push('A grenade-to-Super mod is available but missing from the recommendation.');
  const matchingWeapons=(build.weapons||[]).filter(weapon=>itemElement(weapon)===intent.element);
  const matchingOwned=[...(build.ownedWeapons||[]),...(build.vaultWeapons||[]),...(build.inventoryWeapons||[])].filter(weapon=>itemElement(weapon)===intent.element);
  if(intent.requiresMatchingWeapon&&matchingOwned.length&&!matchingWeapons.length)violations.push(`A ${String(intent.element).toUpperCase()} weapon exists but none was selected.`);
  return {ready:violations.length===0,reason:violations[0]||'',violations:[...new Set(violations)],intent,weaponModel,coverage:{matchingWeaponCount:matchingWeapons.length,grenadeOrb:roles.has('grenade-orb'),grenadeSuper:roles.has('grenade-super'),elementSiphon:roles.has('element-siphon'),artifactPicks:Number(artifact?.selectedPerkHashes?.length||0),artifactLimit:Number(artifact?.selectionLimit||0)}};
}

function createLiveTransferPreflight(build={}){
  const generated=Boolean(build.recommendationGeneratedAt),coherence=generated?validateLoadoutCoherence(build):{ready:true,reason:'',violations:[]},weapons=(build.weapons||[]).filter(Boolean),armour=(build.armour||[]).filter(Boolean),violations=generated?[...coherence.violations]:[],warnings=[];
  if(!/^\d+$/.test(String(build.characterId||''))||!/^\d+$/.test(String(build.membershipId||build.bungieMembershipId||''))||!/^\d+$/.test(String(build.membershipType??'')))violations.push('Apply requires a Bungie Guardian and Destiny membership binding.');
  if(weapons.length!==3||weapons.some(item=>!/^\d+$/.test(String(item.itemInstanceId||''))))violations.push('Apply requires three weapon instance IDs.');
  if(armour.length!==5||armour.some(item=>!/^\d+$/.test(String(item.itemInstanceId||''))))violations.push('Apply requires five armour instance IDs.');
  const exotic=validateExoticLoadout(build,{requireArmourAnchor:false});if(!exotic.ready)violations.push(exotic.reason);
  const mods=validateArmourModLoadout(build);if(!mods.ready)violations.push(mods.reason);
  const locationKinds=new Set(['equipped','carried','vault','profile','postmaster']);
  for(const item of [...weapons,...armour])if(!locationKinds.has(String(item?.source?.kind||'')))violations.push(`${itemName(item,'Selected item')} is not in your inventory.`);
  if(!build.artifactConfiguration?.selectedPerkHashes?.length)warnings.push('No intended Artifact change is staged.');
  else warnings.push('Artifact choices are preserved as explicit in-game steps unless Bungie exposes a free socket mapping.');
  for(const change of build.manualSocketChanges||[])if(change?.remoteSupported===false)warnings.push(`${change.plugName||'A selected socket change'} must be completed in game.`);
  return {schemaVersion:2,status:violations.length?'blocked':'ready',ready:violations.length===0,checkedAt:new Date().toISOString(),mode:generated?'generated-recommendation':'manual-working-build',characterId:String(build.characterId||''),membershipId:String(build.membershipId||build.bungieMembershipId||''),membershipType:String(build.membershipType??''),violations:[...new Set(violations)],warnings:[...new Set(warnings)],coherence,scope:{weapons:weapons.map(item=>String(item.itemInstanceId||'')),armour:armour.map(item=>String(item.itemInstanceId||'')),artifactHash:Number(build.artifactConfiguration?.artifactHash)||null,artifactPerkHashes:[...(build.artifactConfiguration?.selectedPerkHashes||[])],manualSocketChanges:Number(build.manualSocketChanges?.length||0),armourModChanges:Number(build.armourModRecommendation?.summary?.replace||0)+Number(build.armourModRecommendation?.summary?.add||0)+Number(build.armourModRecommendation?.summary?.remove||0)}};
}

export {OBJECTIVE_TERMS,STAT_KEYS,WEAPON_BUCKETS,createLiveTransferPreflight,deriveLoadoutIntent,isExoticItem,isVerifiedMod,itemElement,modCost,modStats,recommendArmourMods,scoreMod,selectOwnedWeapons,validateArmourModLoadout,validateExoticLoadout,validateWeaponModel,validateLoadoutCoherence};
