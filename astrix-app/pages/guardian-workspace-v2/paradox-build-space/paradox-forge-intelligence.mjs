import {superDefinitionsFor} from '../guardian-super-catalog.mjs?v=20260911-evidence-isolation-1';

/* Deterministic Build Forge recommendation composer.
 *
 * The composer is intentionally evidence-bound: it may choose only hashes that
 * already exist in the selected Guardian's verified Bungie subclass catalogue.
 * It scores explicit Manifest descriptions/trait IDs against the staged Forge
 * Loader Exotic, armour-set, stat and owned-weapon evidence. An injected
 * directed-loop analyser is used as the strongest signal; missing evidence is
 * recorded as a limitation instead of being invented.
 */

const ELEMENTS=Object.freeze(['arc','solar','strand','stasis','void','prismatic']);
const COMBAT_TERMS=Object.freeze([
  'amplified','blind','cure','devour','freeze','frozen','ignite','ignition',
  'invisibility','invisible','jolt','overshield','radiant','restoration','scorch',
  'sever','shatter','slow','suspend','suppression','suppress','threadling',
  'unravel','volatile','weaken','weakened','woven mail','ionic trace','tangle',
  'stasis crystal','stasis shard','orb of power','grenade','melee','class ability',
  'super','weapon'
]);
const ABILITY_SOCKETS=Object.freeze(['classAbility','movement','melee','grenade']);
const BEAM_WIDTH=18;

const clone=value=>{try{return structuredClone(value);}catch{return JSON.parse(JSON.stringify(value??null));}};
const clean=value=>String(value??'').trim();
const lower=value=>clean(value).toLowerCase();
const uniq=values=>[...new Set(values.filter(Boolean))];
const itemKey=item=>String(item?.hash??item?.itemHash??item?.bungieHash??'');
const itemName=(item,fallback='Verified component')=>clean(item?.name??item?.displayName??item?.definition?.displayProperties?.name)||fallback;
const regexEscape=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

function descriptionEvidence(item={}){
  const definition=item?.definition||{};
  return clean(item?.officialDescription||item?.description||item?.display?.description||item?.displayProperties?.description||definition?.displayProperties?.description);
}

function itemEvidence(item={}){
  const definition=item?.definition||{};
  const official=item?.official||{};
  return [
    itemName(item,''),item?.element,item?.subclass,item?.damageType,item?.description,item?.officialDescription,item?.display?.description,
    definition?.displayProperties?.description,definition?.itemTypeDisplayName,
    definition?.plug?.plugCategoryIdentifier,definition?.plug?.plugCategoryHash,
    ...(definition?.traitIds||[]),...(official?.traitIds||[]),...(item?.traitIds||[])
  ].map(clean).filter(Boolean).join(' · ').toLowerCase();
}

function explicitTokens(value){
  const text=typeof value==='string'?lower(value):itemEvidence(value);
  return uniq([
    ...ELEMENTS.filter(term=>text.includes(term)),
    ...COMBAT_TERMS.filter(term=>text.includes(term)).map(term=>term==='frozen'?'freeze':term==='ignition'?'ignite':term==='invisible'?'invisibility':term==='suppress'?'suppression':term==='weakened'?'weaken':term)
  ]);
}

function resolvedItem(item){
  const hash=Number(itemKey(item));
  if(!item||!Number.isInteger(hash)||hash<=0||item.unresolved===true||/^unresolved\b/i.test(itemName(item,'')))return false;
  const definition=item.definition;
  return Boolean((definition&&typeof definition==='object'&&Object.keys(definition).length)||item.source==='bungie-manifest'||clean(item.description||item.officialDescription));
}

function uniqueResolved(rows=[]){
  const seen=new Set();
  return (Array.isArray(rows)?rows:[]).filter(resolvedItem).filter(item=>{const key=itemKey(item);if(seen.has(key))return false;seen.add(key);return true;});
}

function subclassComponents(candidate={}){
  const sb=candidate.subclassBuild||candidate.build||{};
  return uniqueResolved([
    sb.super,...(sb.superOptions||[]),sb.classAbility,sb.movement,sb.melee,sb.grenade,
    ...Object.values(sb.abilityOptionsBySocket||{}).flat(),...(sb.abilities||[]),
    ...(sb.aspects||[]),...(sb.availableAspects||sb.aspectOptions||[]),
    ...(sb.fragments||[]),...(sb.availableFragments||sb.fragmentOptions||[])
  ]);
}

function componentAliases(item={}){
  const name=lower(itemName(item,''));
  return uniq([name,name.includes(':')?name.split(':')[0].trim():'']).filter(value=>value.length>=5&&!['super','grenade','melee','aspect','fragment'].includes(value));
}

function descriptionNamesComponent(description,item){
  const text=lower(description);
  return componentAliases(item).some(alias=>new RegExp(`\\b${regexEscape(alias)}\\b`,'i').test(text));
}

function scopedElements(description,terms){
  const sentences=lower(description).split(/[.!?\n]+/).filter(Boolean);
  return ELEMENTS.filter(element=>sentences.some(sentence=>sentence.includes(element)&&terms.some(term=>sentence.includes(term))));
}

function superScopedElements(description){
  const sentences=lower(description).split(/[.!?;\n]+/).filter(Boolean);
  return ELEMENTS.filter(element=>sentences.some(sentence=>{
    if(!sentence.includes(element))return false;
    if(/\bsuper(?:s|'s)?\b/.test(sentence))return true;
    return sentence.includes(`${element} damage`)&&/(increase|bonus|improve|enhance|empower|additional|final blow|defeat|kill|grant)/.test(sentence);
  }));
}

function componentKind(item={}){
  const text=lower([item?.componentType,item?.abilityType,item?.type,item?.definition?.itemTypeDisplayName,item?.definition?.plug?.plugCategoryIdentifier].filter(Boolean).join(' '));
  return ['grenade','melee','class ability'].find(kind=>text.includes(kind.replace(' ',''))||text.includes(kind))||'';
}

function subclassCompatibilityEvidence(build={},candidate={}){
  const perk=build.forgeLoaderDecision?.buildAnchor?.perk,description=descriptionEvidence(perk),element=elementOf(candidate),evidence=[];
  if(!perk||!description)return {candidateHash:itemKey(candidate),element,status:'unknown',restrictive:false,score:0,evidence};
  const named=subclassComponents(candidate).filter(item=>descriptionNamesComponent(description,item));
  for(const item of named)evidence.push({
    code:'exotic-explicit-component',score:500,componentHash:Number(itemKey(item)),componentName:itemName(item),
    label:`${itemName(perk,'The staged Exotic perk')} explicitly names ${itemName(item)} in its verified effect.`,sourceText:description
  });
  const elements=scopedElements(description,['damage','ability','abilities','grenade','melee','super']);
  if(element&&elements.includes(element))evidence.push({
    code:'exotic-explicit-element',score:220,element,
    label:`${itemName(perk,'The staged Exotic perk')} explicitly scopes its verified effect to ${element.toUpperCase()}.`,sourceText:description
  });
  return {
    candidateHash:itemKey(candidate),element,status:evidence.length?'evidenced':'no-explicit-subclass-restriction',
    restrictive:evidence.length>0,score:evidence.reduce((sum,row)=>sum+row.score,0),evidence
  };
}

function superInvestmentEvidence(build={}){
  const directive=build.forgeLoaderDecision?.statDirective||{},hasAchieved=Object.hasOwn(directive?.achieved||{},'super'),achieved=hasAchieved?Number(directive.achieved.super):null,priority=Number(directive?.priorities?.super);
  const intellect=(Array.isArray(build.stats)?build.stats:[]).find(row=>lower(Array.isArray(row)?row[0]:row?.name).includes('intellect'));
  const profileValue=intellect?Number(Array.isArray(intellect)?intellect[1]:intellect?.value):null;
  const value=Number.isFinite(achieved)?achieved:Number.isFinite(profileValue)?profileValue:null;
  return value===null?null:{
    code:'super-investment-context',score:0,value,priority:Number.isInteger(priority)&&priority>0?priority:null,
    label:`Verified Super investment is ${value}${Number.isInteger(priority)&&priority>0?` with Forge Loader priority ${priority}`:''}. This is build context and does not prove one Super is stronger.`
  };
}

function knownSuperComponents(build={}){
  return uniqueResolved(ELEMENTS.flatMap(element=>superDefinitionsFor(build.characterClass||'hunter',element)));
}

function isSuperComponent(item={}){
  return lower([item?.componentType,item?.abilityType,item?.type,item?.definition?.itemTypeDisplayName,item?.definition?.plug?.plugCategoryIdentifier].filter(Boolean).join(' ')).includes('super');
}

function rankExoticSuperSynergy(build={},candidates=[]){
  const perk=build.forgeLoaderDecision?.buildAnchor?.perk,perkName=itemName(perk,'Staged Exotic perk'),description=descriptionEvidence(perk),investment=superInvestmentEvidence(build),entries=[];
  const rows=Array.isArray(candidates)?candidates:[],allSupers=uniqueResolved(rows.flatMap(candidate=>subclassComponents(candidate).filter(isSuperComponent))),catalogueSupers=knownSuperComponents(build);
  const namedSuperAliases=uniq([...allSupers,...catalogueSupers].flatMap(componentAliases));
  const genericSuperClauses=lower(description).split(/[.!?;\n]+/).map(clean).filter(clause=>/\bsuper(?:s|'s)?\b/i.test(clause)&&!namedSuperAliases.some(alias=>clause.includes(alias)));
  const unavailableExplicitSupers=catalogueSupers.filter(item=>descriptionNamesComponent(description,item)&&!allSupers.some(candidate=>componentAliases(candidate).some(alias=>componentAliases(item).includes(alias))));
  for(const candidate of rows){
    const element=elementOf(candidate),components=subclassComponents(candidate),supers=components.filter(isSuperComponent),support=components.filter(item=>!isSuperComponent(item));
    const namedSupport=support.filter(item=>descriptionNamesComponent(description,item)),namedAbilityKinds=uniq(namedSupport.map(componentKind));
    const superElements=superScopedElements(description);
    const energyBridges=support.filter(item=>{const text=lower(descriptionEvidence(item));return /\bsuper energy\b/.test(text)&&namedAbilityKinds.some(kind=>text.includes(kind));});
    for(const superItem of supers){
      const evidence=[];
      if(description){
        if(descriptionNamesComponent(description,superItem))evidence.push({
          code:'exotic-explicit-super',score:900,label:`${perkName} explicitly names ${componentAliases(superItem).find(alias=>lower(description).includes(alias))||itemName(superItem)}.`,sourceText:description
        });
        if(genericSuperClauses.length)evidence.push({
          code:'exotic-super-effect',score:260,label:`${perkName} has an explicit general Super effect that applies to ${itemName(superItem)}.`,sourceText:genericSuperClauses.join('; ')
        });
        if(element&&superElements.includes(element))evidence.push({
          code:'exotic-super-element',score:240,label:`${perkName} explicitly affects ${element.toUpperCase()} Super or damage output used by ${itemName(superItem)}.`,sourceText:description
        });
        for(const component of namedSupport){
          const supportText=descriptionEvidence(component),superAlias=componentAliases(superItem).find(alias=>lower(supportText).includes(alias));
          if(superAlias)evidence.push({
            code:'exotic-component-super-bridge',score:220,label:`${perkName} explicitly supports ${itemName(component)}, whose verified definition explicitly names ${superAlias}.`,sourceText:description,supportText
          });
          else if(/\bsuper energy\b/i.test(supportText))evidence.push({
            code:'exotic-component-super-energy-bridge',score:150,label:`${perkName} explicitly supports ${itemName(component)}, whose verified definition supplies Super energy to ${itemName(superItem)}.`,sourceText:description,supportText
          });
        }
        for(const component of energyBridges){
          const supportText=descriptionEvidence(component),kind=namedAbilityKinds.find(value=>lower(supportText).includes(value))||'subclass ability';
          evidence.push({
            code:'exotic-ability-super-energy-bridge',score:150,label:`${perkName} explicitly supports a ${kind} used by ${itemName(component)}, whose verified definition grants Super energy to ${itemName(superItem)}.`,sourceText:description,supportText
          });
        }
      }
      const score=evidence.reduce((sum,row)=>sum+row.score,0),context=investment?[investment]:[];
      entries.push({
        super:superItem,superHash:Number(itemKey(superItem)),superName:itemName(superItem),candidateHash:itemKey(candidate),element,
        score,evidenceStatus:score>0?'evidenced':description?'no-direct-evidence':'unknown',evidence,context,
        limitation:description
          ?`No genuine Super synergy is stated for ${itemName(superItem)} by ${perkName} or the resolved supporting subclass definitions.`
          :'The staged Exotic perk has no resolved effect description, so Super synergy is unknown.'
      });
    }
  }
  entries.sort((left,right)=>right.score-left.score||left.superName.localeCompare(right.superName)||left.superHash-right.superHash);
  let priorScore=null,rank=0;
  entries.forEach((entry,index)=>{if(entry.score!==priorScore){rank=index+1;priorScore=entry.score;}entry.rank=entry.score>0?rank:null;});
  const strongest=entries[0]?.score||0;
  entries.forEach(entry=>{entry.recommended=strongest>0&&entry.score===strongest;});
  return {
    schemaVersion:1,anchor:{hash:Number(itemKey(perk))||null,name:perkName,description},
    status:!description?'unknown':strongest>0?'evidenced':'no-direct-super-synergy',entries,
    limitations:unavailableExplicitSupers.map(item=>`${perkName} explicitly names ${itemName(item)}, which is not available in the resolved Super options for this subclass.`),
    limitation:description&&strongest===0?`No genuine Super synergy is stated by ${perkName} for the resolved Supers. No Super is ranked as preferred.`:''
  };
}

function hasVerifiedSubclassSockets(candidate={}){
  const sb=candidate.subclassBuild||candidate.build||{};
  if(sb.socketsAvailable!==true||sb.socketCoverage?.complete===false||!uniqueResolved([sb.super,...(sb.superOptions||[])]).length)return false;
  const abilitiesReady=ABILITY_SOCKETS.every(socket=>uniqueResolved([sb[socket],...(sb.abilityOptionsBySocket?.[socket]||[])]).length);
  const aspectsReady=uniqueResolved([...(sb.aspects||[]),...(sb.availableAspects||sb.aspectOptions||[])]).length>0;
  const fragmentsReady=uniqueResolved([...(sb.fragments||[]),...(sb.availableFragments||sb.fragmentOptions||[])]).length>0;
  return abilitiesReady&&aspectsReady&&fragmentsReady;
}

function selectedComponents(build={}){
  const sb=build.subclassBuild||{};
  return [sb.super,...(sb.abilities||[]),...(sb.aspects||[]),...(sb.fragments||[])].filter(Boolean);
}

function selectedArtifactPerks(build={}){
  const artifact=build.artifact||{},configuration=build.artifactConfiguration||artifact.artifactConfiguration||{},configured=Array.isArray(configuration.selectedPerkHashes)?configuration.selectedPerkHashes:null;
  const selectedHashes=new Set((configured??(artifact.activePerks||[]).map(itemKey)).map(String));
  const rows=[...(artifact.perks||[]),...(artifact.activePerks||[]),...(build.artifactRecommendation?.selectionSequence||[]).map(row=>row?.artifactPerk)].filter(Boolean);
  return uniqueResolved(rows.filter(row=>selectedHashes.has(itemKey(row))));
}

function currentSelectionSnapshot(build={}){
  const reference=item=>({hash:Number(itemKey(item))||null,itemInstanceId:clean(item?.itemInstanceId)||null});
  const subclass=build.subclassBuild||{};
  return {
    characterId:clean(build.characterId)||null,
    weapons:(build.weapons||[]).map(item=>({...reference(item),perkHashes:(item?.weaponSemantics?.selectedPerks||[]).map(perk=>Number(itemKey(perk))).filter(Number.isInteger)})),
    armour:(build.armour||[]).map(reference),
    artifact:{hash:Number(itemKey(build.artifact))||null,selectedPerkHashes:selectedArtifactPerks(build).map(perk=>Number(itemKey(perk))).filter(Number.isInteger)},
    subclass:{superHash:Number(itemKey(subclass.super))||null,abilityHashes:(subclass.abilities||[]).map(item=>Number(itemKey(item))).filter(Number.isInteger),aspectHashes:(subclass.aspects||[]).map(item=>Number(itemKey(item))).filter(Number.isInteger),fragmentHashes:(subclass.fragments||[]).map(item=>Number(itemKey(item))).filter(Number.isInteger)}
  };
}

function optionSources(build={}){
  const decision=build.forgeLoaderDecision||{},sources=[],seen=new Set();
  const add=(kind,item,{name='',weight=1}={})=>{
    if(!item)return;
    const key=itemKey(item)||`${itemName(item,'')}|${descriptionEvidence(item)}`;
    if(key&&seen.has(key))return;
    if(key)seen.add(key);
    sources.push({kind,item,name:name||itemName(item,kind),tokens:explicitTokens(item),weight});
  };
  const anchor=decision?.buildAnchor||{},anchorPerk=anchor?.perk;
  add('selected Exotic armour',anchorPerk,{name:[anchor?.name,itemName(anchorPerk,'Exotic perk')].filter(Boolean).join(' · '),weight:5});
  for(const row of decision?.setProtocol||[])add(`${Number(row?.count)||0}-piece armour set`,row?.trait||row);
  for(const armour of build.armour||[]){
    const semantics=armour?.armourSemantics||{};
    add(`${itemName(armour,'selected armour')} intrinsic`,semantics.exoticPerk||armour?.exoticPerk||armour?.intrinsicTrait);
    add(`${itemName(armour,'selected armour')} archetype`,semantics.archetype||armour?.archetype);
    for(const effect of [semantics.set?.twoPiece,semantics.set?.fourPiece].filter(row=>row?.active!==false))add(`${Number(effect?.requiredSetCount)||0}-piece selected armour set`,effect);
  }
  for(const weapon of build.weapons||[]){
    add('owned weapon',weapon);
    for(const perk of weapon?.weaponSemantics?.selectedPerks||[])add(`${itemName(weapon,'weapon')} perk`,perk);
  }
  for(const perk of selectedArtifactPerks(build))add('selected Artifact perk',perk);
  return sources.filter(source=>source.tokens.length||source.weight>1);
}

function filterExoticCompatibleSubclasses(build={},candidates=[]){
  const rows=(Array.isArray(candidates)?candidates:[]).filter(Boolean),reports=rows.map(candidate=>subclassCompatibilityEvidence(build,candidate)),restricted=reports.filter(report=>report.restrictive);
  if(!restricted.length)return rows;
  const matching=new Set(restricted.map(report=>report.candidateHash));
  return rows.filter(candidate=>matching.has(itemKey(candidate)));
}

function elementOf(value){
  const text=typeof value==='string'?lower(value):itemEvidence(value);
  return ELEMENTS.find(element=>text.includes(element))||'';
}

function stageVerifiedSubclassCandidate(build={},candidate={}){
  const working=clone(build)||{};
  const supplied=candidate.subclassBuild||candidate.build||{};
  working.subclassName=itemName(candidate,working.subclassName||working.subclass||'Subclass');
  working.subclass=candidate.key||candidate.element||candidate.subclass||working.subclass;
  working.subclassIcon=candidate.icon||candidate?.definition?.displayProperties?.icon||working.subclassIcon||'';
  working.subclassBuild=clone(supplied);
  return synchroniseSubclassProjection(working);
}

function synchroniseSubclassProjection(build={}){
  const sb=build.subclassBuild||{};
  const abilities=ABILITY_SOCKETS.map(key=>sb[key]).filter(Boolean);
  sb.abilities=abilities.length?abilities:uniqueResolved(sb.abilities||[]);
  const byType=new Map((sb.abilities||[]).map(item=>[lower(item?.componentType||item?.abilityType||item?.type),item]));
  if(!sb.classAbility)sb.classAbility=byType.get('classability')||null;
  if(!sb.movement)sb.movement=byType.get('movementability')||byType.get('movement')||null;
  if(!sb.melee)sb.melee=byType.get('melee')||null;
  if(!sb.grenade)sb.grenade=byType.get('grenade')||null;
  sb.abilities=ABILITY_SOCKETS.map(key=>sb[key]).filter(Boolean);
  build.subclassBuild=sb;
  build.super=sb.super||null;
  build.superOptions=clone(sb.superOptions||[]);
  build.classAbility=sb.classAbility||null;
  build.movement=sb.movement||null;
  build.melee=sb.melee||null;
  build.grenade=sb.grenade||null;
  build.abilities=clone(sb.abilities||[]);
  build.aspects=clone(sb.aspects||[]);
  build.fragments=clone(sb.fragments||[]);
  return build;
}

function componentEvidenceScore(item,context={}){
  const tokens=explicitTokens(item),reasons=[];
  const add=(code,label,score,evidence=null)=>reasons.push({code,label,score,evidence});
  const superEvidence=isSuperComponent(item)?context.superEvidence?.get(itemKey(item)):null;
  if(superEvidence){
    for(const row of superEvidence.evidence)add(row.code,row.label,row.score,{componentHash:Number(itemKey(item)),sourceKind:'selected Exotic armour',sourceName:context.superSynergy?.anchor?.name||'',sourceText:row.sourceText||'',supportText:row.supportText||'',superText:row.superText||''});
  }
  for(const source of superEvidence?[]:(context.sources||[])){
    for(const token of tokens.filter(value=>source.tokens.includes(value)).slice(0,3)){
      const points=36*Math.max(1,Number(source.weight)||1);
      add(`mechanic:${token}:${source.kind}`,`${itemName(item)} shares verified ${token} evidence with ${source.kind} · ${source.name}`,points,{componentHash:Number(itemKey(item)),sourceKind:source.kind,sourceName:source.name,token});
    }
    const componentName=lower(itemName(item,'')),sourceText=itemEvidence(source.item);
    if(source.weight>1&&componentName.length>=4&&sourceText.includes(componentName))add('exotic-anchor-exact-ability',`${source.name} explicitly names ${itemName(item)}; it is required for the selected Exotic armour loop.`,360,{componentHash:Number(itemKey(item)),sourceKind:source.kind,sourceName:source.name,componentName:itemName(item)});
  }
  const element=elementOf(item);
  if(context.element&&context.element!=='prismatic'&&element===context.element)add('element-match',`${itemName(item)} matches the requested ${context.element.toUpperCase()} damage build`,18,{element});
  const priorities=context.priorities||{};
  for(const stat of ['health','melee','grenade','super','class','weapon']){
    const rank=Number(priorities[stat]);
    if(!Number.isInteger(rank)||rank<1||rank>6||!tokens.includes(stat==='class'?'class ability':stat))continue;
    add(`stat-priority:${stat}`,`${itemName(item)} has explicit ${stat} evidence for Forge Loader priority ${rank}`,Math.max(6,24-(rank-1)*3),{stat,rank});
  }
  reasons.sort((left,right)=>right.score-left.score||left.label.localeCompare(right.label));
  return {score:reasons.reduce((sum,row)=>sum+row.score,0),tokens,reasons};
}

function analysisScore(analysis={}){
  const links=Array.isArray(analysis?.buildLoop)?analysis.buildLoop.length:0;
  const strengths=Array.isArray(analysis?.strengths)?analysis.strengths.length:0;
  const weakLinks=Array.isArray(analysis?.weakLinks)?analysis.weakLinks.length:0;
  const confidence=String(analysis?.confidence?.level||'').toLowerCase();
  const confidencePoints={high:80,medium:45,low:10,insufficient:0}[confidence]||0;
  return {score:(links*120)+(strengths*20)-(weakLinks*45)+confidencePoints,links,strengths,weakLinks,confidence:confidence||'evidence-limited'};
}

function evaluate(build,context,analyzeBuild){
  const projected=synchroniseSubclassProjection(build);
  const components=selectedComponents(projected),componentRows=components.map(item=>({item,...componentEvidenceScore(item,context)}));
  const signature=JSON.stringify({super:itemKey(projected.subclassBuild?.super),abilities:(projected.subclassBuild?.abilities||[]).map(itemKey),aspects:(projected.subclassBuild?.aspects||[]).map(itemKey).sort(),fragments:(projected.subclassBuild?.fragments||[]).map(itemKey).sort()});
  const cached=context.cache?.get(signature);
  if(cached)return {build:projected,componentRows,signature,...cached};
  let analysis=null;
  try{analysis=typeof analyzeBuild==='function'?analyzeBuild(projected):null;}catch{analysis=null;}
  const directed=analysisScore(analysis||{});
  const componentScore=componentRows.reduce((sum,row)=>sum+row.score,0);
  const coveredElements=uniq(components.flatMap(explicitTokens).filter(token=>ELEMENTS.includes(token)&&token!=='prismatic'));
  const prismaticScore=context.element==='prismatic'?coveredElements.length*28:0;
  const retainedComponents=components.filter(item=>context.baselineKeys?.has(itemKey(item))).length,stabilityScore=retainedComponents*2;
  const evaluated={analysis,score:directed.score+componentScore+prismaticScore+stabilityScore,directed,componentScore,stabilityScore,coveredElements};
  if(context.bounded&&context.cache.size>=512)context.cache.delete(context.cache.keys().next().value);
  context.cache?.set(signature,evaluated);
  return {build:projected,componentRows,signature,...evaluated};
}

function rank(states,context,analyzeBuild,width=BEAM_WIDTH){
  const seen=new Map();
  for(const state of states){
    const row=evaluate(state,context,analyzeBuild),prior=seen.get(row.signature);
    if(!prior||row.score>prior.score)seen.set(row.signature,row);
    if(context.bounded&&seen.size>width){const rows=[...seen.values()].sort((left,right)=>right.score-left.score||right.directed.links-left.directed.links||left.signature.localeCompare(right.signature));seen.delete(rows.at(-1).signature);}
  }
  return [...seen.values()].sort((left,right)=>right.score-left.score||right.directed.links-left.directed.links||left.signature.localeCompare(right.signature)).slice(0,width);
}

function combinations(rows,count){
  if(count<=0)return [[]];
  const output=[];
  const visit=(start,picked)=>{if(picked.length===count){output.push(picked);return;}for(let index=start;index<=rows.length-(count-picked.length);index+=1)visit(index+1,[...picked,rows[index]]);};
  visit(0,[]);
  return output;
}

function fragmentCapacity(build={},options=[]){
  const aspects=build.subclassBuild?.aspects||[];
  const explicit=aspects.map(item=>Number(item?.fragmentSlots??item?.fragmentSlotCount??item?.definition?.plug?.fragmentSlots)).filter(Number.isFinite);
  if(explicit.length===aspects.length&&explicit.length)return Math.max(0,Math.min(5,explicit.reduce((sum,value)=>sum+value,0)));
  const equipped=build.subclassBuild?.fragments||[];
  return Math.max(0,Math.min(5,equipped.length||options.length));
}

function branchBuild(build,bounded=false){return bounded?{...build,subclassBuild:{...build.subclassBuild}}:clone(build);}
function* expand(rows,options,make){for(const row of rows)for(const item of options(row))yield make(row,item);}
function setAbility(build,key,item,bounded=false){
  const next=branchBuild(build,bounded);next.subclassBuild[key]=clone(item);return synchroniseSubclassProjection(next);
}

function decisionLedger(result,context){
  const rows=result.componentRows.map(row=>({
    componentHash:Number(itemKey(row.item)),componentName:itemName(row.item),componentType:clean(row.item?.componentType||row.item?.definition?.itemTypeDisplayName||'subclass component'),score:row.score,
    reasons:row.reasons.slice(0,3),evidenceStatus:row.reasons.length?'verified-match':'verified-identity-retained'
  }));
  rows.sort((left,right)=>right.score-left.score||left.componentName.localeCompare(right.componentName));
  const limitations=[];
  if(!result.analysis)limitations.push('Directed-loop analysis was unavailable; component choices use explicit Forge Loader evidence matches only.');
  if(result.directed.links===0)limitations.push('No directed producer-to-consumer loop is proven by the currently resolved descriptions.');
  if(context.element==='prismatic'){
    const missing=['arc','solar','void','stasis','strand'].filter(element=>!result.coveredElements.includes(element));
    if(missing.length)limitations.push(`Verified Prismatic component evidence does not cover: ${missing.join(', ')}.`);
  }
  return {rows,limitations};
}

function intelligenceRecord({build,result,context,requested,superSynergy}){
  const ledger=decisionLedger(result,context);
  return {
    schemaVersion:1,source:'verified-forge-loader-bungie-catalogue',method:'deterministic-evidence-beam-v1',element:requested,status:'review-required',score:result.score,
    evidence:{forgeSources:context.sources.map(source=>({kind:source.kind,name:source.name,tokens:source.tokens})),selectionSnapshot:currentSelectionSnapshot(build),directedLinks:result.directed.links,strengths:result.directed.strengths,weakLinks:result.directed.weakLinks,confidence:result.directed.confidence,componentScore:result.componentScore,stabilityScore:result.stabilityScore},
    superSynergy:{...superSynergy,entries:superSynergy.entries.map(({super:superDefinition,...row})=>row)},
    prismaticCoverage:requested==='prismatic'?{covered:result.coveredElements,missing:['arc','solar','void','stasis','strand'].filter(value=>!result.coveredElements.includes(value))}:null,
    decisions:ledger.rows,limitations:[...new Set([...ledger.limitations,...(superSynergy.limitations||[])])],requiresReview:true,liveTransferAuthorized:false
  };
}

function refreshForgeIntelligence({build={},element='',analyzeBuild=null,bounded=true}={}){
  const base=synchroniseSubclassProjection(clone(build)||{}),requested=ELEMENTS.includes(lower(element))?lower(element):elementOf(base.subclass||base.subclassName||'');
  if(!requested)throw new TypeError('A verified elemental build option is required.');
  const candidate={element:requested,subclassBuild:base.subclassBuild};
  const superSynergy=rankExoticSuperSynergy(base,[candidate]);
  const context={bounded,element:requested,sources:optionSources(base),superSynergy,superEvidence:new Map(superSynergy.entries.map(row=>[String(row.superHash),row])),priorities:base?.forgeLoaderDecision?.statDirective?.priorities||{},baselineKeys:new Set(selectedComponents(base).map(itemKey)),cache:new Map()};
  const result=evaluate(base,context,analyzeBuild);
  return {workingBuild:result.build,analysis:result.analysis,intelligence:intelligenceRecord({build:result.build,result,context,requested,superSynergy})};
}

function composeForgeRecommendation({build={},candidate={},element='',analyzeBuild=null,bounded=false}={}){
  const requested=ELEMENTS.includes(lower(element))?lower(element):elementOf(candidate);
  if(!requested)throw new TypeError('A verified elemental build option is required.');
  if(!hasVerifiedSubclassSockets(candidate))throw new TypeError('The selected element does not have a complete verified Bungie subclass socket set.');
  let base=stageVerifiedSubclassCandidate(build,candidate);
  const superSynergy=rankExoticSuperSynergy(base,[candidate]);
  const context={bounded,element:requested,sources:optionSources(base),superSynergy,superEvidence:new Map(superSynergy.entries.map(row=>[String(row.superHash),row])),priorities:base?.forgeLoaderDecision?.statDirective?.priorities||{},baselineKeys:new Set(selectedComponents(base).map(itemKey)),cache:new Map()};
  let beam=[evaluate(base,context,analyzeBuild)];

  const superOptions=uniqueResolved(base.subclassBuild?.superOptions||[]);
  if(superOptions.length)beam=rank(expand([base],()=>superOptions,(base,item)=>{const next=branchBuild(base,bounded);next.subclassBuild.super=clone(item);return next;}),context,analyzeBuild);

  for(const socket of ABILITY_SOCKETS){
    const fallback=beam[0]?.build?.subclassBuild?.[socket];
    const options=uniqueResolved([...(base.subclassBuild?.abilityOptionsBySocket?.[socket]||[]),fallback]);
    if(!options.length)continue;
    beam=rank(expand(beam,()=>options,(row,item)=>setAbility(row.build,socket,item,bounded)),context,analyzeBuild);
  }

  const aspectOptions=uniqueResolved([...(base.subclassBuild?.availableAspects||base.subclassBuild?.aspectOptions||[]),...(base.subclassBuild?.aspects||[])]).slice(0,12);
  const aspectCount=Math.min(2,Math.max(base.subclassBuild?.aspects?.length||0,Math.min(2,aspectOptions.length)));
  if(aspectOptions.length&&aspectCount){
    const aspectSets=combinations(aspectOptions,aspectCount);
    beam=rank(expand(beam,()=>aspectSets,(row,set)=>{const next=branchBuild(row.build,bounded);next.subclassBuild.aspects=clone(set);return synchroniseSubclassProjection(next);}),context,analyzeBuild);
  }

  const fragmentOptions=uniqueResolved([...(base.subclassBuild?.availableFragments||base.subclassBuild?.fragmentOptions||[]),...(base.subclassBuild?.fragments||[])]);
  const capacity=Math.min(fragmentOptions.length,fragmentCapacity(beam[0]?.build||base,fragmentOptions));
  if(fragmentOptions.length&&capacity){
    beam=beam.map(row=>{const next=branchBuild(row.build,bounded);next.subclassBuild.fragments=[];return evaluate(synchroniseSubclassProjection(next),context,analyzeBuild);});
    for(let slot=0;slot<capacity;slot+=1){
      beam=rank(expand(beam,row=>fragmentOptions.filter(item=>!(row.build.subclassBuild.fragments||[]).some(selected=>itemKey(selected)===itemKey(item))),(row,item)=>{const next=branchBuild(row.build,bounded);next.subclassBuild.fragments=[...(next.subclassBuild.fragments||[]),clone(item)];return synchroniseSubclassProjection(next);}),context,analyzeBuild);
      if(!beam.length)break;
    }
  }

  const best=beam[0]||evaluate(base,context,analyzeBuild);
  return {
    workingBuild:best.build,
    analysis:best.analysis,
    intelligence:intelligenceRecord({build:best.build,result:best,context,requested,superSynergy})
  };
}

export {ABILITY_SOCKETS,COMBAT_TERMS,ELEMENTS,composeForgeRecommendation,explicitTokens,filterExoticCompatibleSubclasses,hasVerifiedSubclassSockets,rankExoticSuperSynergy,refreshForgeIntelligence,resolvedItem,stageVerifiedSubclassCandidate,subclassCompatibilityEvidence,synchroniseSubclassProjection};
