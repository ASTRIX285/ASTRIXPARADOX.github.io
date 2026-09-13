// Worker-safe Forge sequence. Selection and Artifact rules are shared with the established UI flow.
import {protectBuildState,createBuildState} from './paradox-build-state.mjs?v=20260904-memory-safe-transfer-1';
import {composeForgeRecommendation,hasVerifiedSubclassSockets,filterExoticCompatibleSubclasses,refreshForgeIntelligence} from './paradox-forge-intelligence.mjs?v=20260911-evidence-isolation-1';
import {analyzeLiveGuardian} from '../guardian-paradox-live-adapter.mjs?v=20260905-background-forge-1';
import {applyForgeArtifactRecommendation} from './paradox-artifact-selection.mjs?v=20260906-complete-build-transfer-1';
import {validateTierFiveArmour} from './paradox-build-recommendation.mjs';
import {createLiveTransferPreflight,deriveLoadoutIntent,recommendArmourMods,selectOwnedWeapons,validateArmourModLoadout,validateExoticLoadout,validateLoadoutCoherence} from './paradox-loadout-intelligence.mjs?v=20260910-generate-termination-1';
import {adviseLiveWeaponRolls} from '../guardian-weapon-roll-advisor.mjs?v=20260905-worker-preflight-1';
const FORGE_COMPUTATION_FIELDS=Object.freeze(['version','source','characterId','membershipId','membershipType','characterClass','selectedLoadoutIndex','subclass','subclassName','subclassIcon','subclassBuild','super','superOptions','classAbility','movement','melee','grenade','abilities','aspects','fragments','artifact','artifactConfiguration','weapons','armour','mods','stats','hashCoverage','statModel','coverage','semanticCoverage','paradoxEvidence','forgeLoaderDecision','objective','activityContext','locks']);
const FORGE_COMPOSED_FIELDS=Object.freeze(['subclass','subclassName','subclassIcon','subclassBuild','super','superOptions','classAbility','movement','melee','grenade','abilities','aspects','fragments']);
function forgeComputationProjection(build={}){return Object.fromEntries(FORGE_COMPUTATION_FIELDS.filter(key=>Object.hasOwn(build,key)).map(key=>[key,build[key]]));}
function mergeComposedRecommendation(build={},composed={}){const next={...build};for(const key of FORGE_COMPOSED_FIELDS)if(Object.hasOwn(composed,key))next[key]=composed[key];return next;}
const FORGE_ACTIVITY_KEYS=new Set(['raid','dps','grandmaster','crucible','pve','pvp']);
function forgeActivityKey(context){return String(context?.key||context?.activityKey||context?.name||'').trim().toLowerCase().replace(/[^a-z]+/g,'-').replace(/^-|-$/g,'');}
function hasForgeActivityContext(build={}){return FORGE_ACTIVITY_KEYS.has(forgeActivityKey(build.activityContext));}
function forgeEvidenceAssessment(build={},coherence={violations:[]},additional=[]){
  const pending=[];
  const add=row=>{if(row?.message&&!pending.some(item=>item.code===row.code&&item.message===row.message))pending.push(row);};
  const anchor=build.forgeLoaderDecision?.buildAnchor||{},perk=anchor.perk||{},effectText=String(perk.description||perk.definition?.displayProperties?.description||'').trim();
  if(!effectText)add({code:'exotic-effect-description-unresolved',field:'forgeLoaderDecision.buildAnchor.perk.description',hash:Number(perk.hash)||Number(anchor.selectedItemHash)||null,message:`${anchor.name||'Staged Exotic'} effect description is unresolved and was excluded from the evidence score.`});
  for(const message of coherence?.violations||[]){
    const weapon=(build.weapons||[]).find(item=>message.startsWith(`${item?.name||''}:`));
    add({code:/Artifact/i.test(message)?'artifact-evidence-incomplete':/perk|weapon/i.test(message)?'weapon-perk-evidence-incomplete':'optional-loadout-evidence-incomplete',field:/Artifact/i.test(message)?'artifactRecommendation':/perk|weapon/i.test(message)?'weapons.weaponPerkModel':'loadoutCoherence',hash:Number(weapon?.itemHash??weapon?.hash)||null,message});
  }
  for(const row of additional)add(row);
  return {schemaVersion:1,status:pending.length?'partial':'complete',critical:{stagedArmour:true,verifiedSubclass:true,activityContext:forgeActivityKey(build.activityContext)},pending,excludedFromEvidenceScore:[...new Set(pending.map(row=>row.field))],statement:pending.length?`Partial Working Build generated with ${pending.length} unresolved evidence field${pending.length===1?'':'s'} excluded from scoring.`:'All required and optional generation evidence resolved.'};
}

export async function prepareForgeSequence({build,candidate,element,objective='balanced',currentSeasonNumber=null,superHash=0},{onProgress=()=>{},advise=adviseLiveWeaponRolls}={}){
  if(!build?.forgeLoaderDecision||!validateTierFiveArmour(build).ready||!validateExoticLoadout(build,{requireArmourAnchor:true}).ready)throw new Error('Stage a verified Forge Loader armour result first.');
  if(!hasVerifiedSubclassSockets(candidate)||!filterExoticCompatibleSubclasses(build,[candidate]).length)throw new Error('The selected subclass is not compatible with the verified Forge Loader result.');
  if(!hasForgeActivityContext(build))throw new Error('Select Raid, DPS, Grandmaster, Crucible, PVE or PVP before generating this build.');
  if(superHash){
    const sb=candidate.subclassBuild||candidate.build,selected=[sb.super,...(sb.superOptions||[])].find(item=>Number(item?.hash??item?.bungieHash)===Number(superHash));
    if(!selected)throw new Error('The selected Super is not in this verified subclass catalogue.');
    candidate={...candidate,subclassBuild:{...sb,super:selected,superOptions:[selected]}};
  }
  const state=createBuildState(build),updateForgeGenerationPhase=async message=>onProgress(message),additionalPending=[];
  let next=protectBuildState(state),working={...next.workingBuild};
  await updateForgeGenerationPhase('OPTIMISING VERIFIED SUBCLASS COMPONENTS…');
  const composed=composeForgeRecommendation({build:forgeComputationProjection(working),candidate,element:element,analyzeBuild:analyzeLiveGuardian,bounded:true});
  working=mergeComposedRecommendation(working,composed.workingBuild);
  working.recommendationGeneratedAt=new Date().toISOString();working.recommendationElement=element;working.recommendationStatus='review-required';working.forgeIntelligence={...composed.intelligence,generatedAt:working.recommendationGeneratedAt};working.paradoxAnalysis=composed.analysis||analyzeLiveGuardian(working)||null;
  next={...next,workingBuild:working,recommendation:{status:'review-required',generatedAt:working.recommendationGeneratedAt,element,source:'verified-forge-loader-working-build',intelligenceMethod:working.forgeIntelligence.method}};
  working.objective=objective;working.loadoutIntent=deriveLoadoutIntent(working);
  await updateForgeGenerationPhase('RANKING ALL VERIFIED OWNED WEAPONS…');
  const initialWeaponResult=selectOwnedWeapons({build:working,objective:objective});working=initialWeaponResult.workingBuild;working.paradoxAnalysis=analyzeLiveGuardian(working)||working.paradoxAnalysis||null;
  await updateForgeGenerationPhase('BUILDING GRENADE, ORB AND SUPER MOD LOOP…');
  const provisionalModResult=recommendArmourMods({build:working,objective:objective});working=provisionalModResult.workingBuild;
  await updateForgeGenerationPhase('MATCHING ARTIFACT SYNERGY…');
  next=protectBuildState({...next,workingBuild:working});const artifactResult=applyForgeArtifactRecommendation(next,{currentSeasonNumber,force:true});next=artifactResult.state;working={...next.workingBuild};
  await updateForgeGenerationPhase('RE-RANKING OWNED WEAPONS WITH ARTIFACT FIT…');
  const artifactAwareWeaponResult=selectOwnedWeapons({build:working,objective:objective});working=artifactAwareWeaponResult.workingBuild;working.paradoxAnalysis=analyzeLiveGuardian(working)||working.paradoxAnalysis||null;
  const generatedExoticValidation=validateExoticLoadout(working,{requireArmourAnchor:true});if(!generatedExoticValidation.ready)throw new Error(generatedExoticValidation.reason);
  await updateForgeGenerationPhase('OPTIMISING VERIFIED ARMOUR MOD CHANGES…');
  const modResult=recommendArmourMods({build:working,objective:objective});working=modResult.workingBuild;const generatedModValidation=validateArmourModLoadout(working);if(!generatedModValidation.ready)throw new Error(generatedModValidation.reason);working.paradoxAnalysis=analyzeLiveGuardian(working)||working.paradoxAnalysis||null;
  await updateForgeGenerationPhase('FINALISING ORDERED ARTIFACT PICKS…');
  next=protectBuildState({...next,workingBuild:working});const finalArtifactResult=applyForgeArtifactRecommendation(next,{currentSeasonNumber,force:true});next=finalArtifactResult.state;working={...next.workingBuild};const coherence=validateLoadoutCoherence(working);working.loadoutCoherence=coherence;
  await updateForgeGenerationPhase('VERIFYING RECOMMENDED WEAPON PERK ROLLS…');
  try{await advise(working,working.paradoxAnalysis||{}, {insertSocketPlugFree:false});}
  catch(error){additionalPending.push({code:'weapon-roll-advice-unavailable',field:'weaponRollAdvice',hash:null,message:`Weapon roll advice remains pending: ${error?.message||'verified perk evidence was unavailable'}.`});}
  working.forgeEvidence=forgeEvidenceAssessment(working,coherence,additionalPending);
  working.recommendationStatus=working.forgeEvidence.status==='partial'?'partial-review-required':'review-required';
  const refreshedIntelligence=refreshForgeIntelligence({build:forgeComputationProjection(working),element,analyzeBuild:analyzeLiveGuardian,bounded:true});
  working.forgeIntelligence={...refreshedIntelligence.intelligence,generatedAt:working.recommendationGeneratedAt};
  working.paradoxAnalysis=refreshedIntelligence.analysis||working.paradoxAnalysis||analyzeLiveGuardian(working)||null;
  if(working.forgeIntelligence&&working.paradoxAnalysis){working.forgeIntelligence.evidence={...working.forgeIntelligence.evidence,directedLinks:working.paradoxAnalysis.buildLoop?.length||0,strengths:working.paradoxAnalysis.strengths?.length||0,weakLinks:working.paradoxAnalysis.weakLinks?.length||0,confidence:working.paradoxAnalysis.confidence?.level||'evidence-limited',ownedWeaponCandidates:working.weaponSelectionRecommendation?.candidateCount||0,artifactSynergyScore:Number(working.artifactRecommendation?.totalScore||0),armourModDecisions:working.armourModRecommendation?.decisions?.length||0,excludedPendingFields:working.forgeEvidence.excludedFromEvidenceScore.length};working.forgeIntelligence.limitations=[...new Set([...(working.forgeIntelligence.limitations||[]),...(working.weaponSelectionRecommendation?.limitations||[]),...(working.armourModRecommendation?.limitations||[]),...working.forgeEvidence.pending.map(row=>row.message)])];}
  working.liveTransferPreflight=createLiveTransferPreflight(working);
  next=protectBuildState({...next,workingBuild:working,recommendation:{...next.recommendation,status:working.recommendationStatus,evidenceStatus:working.forgeEvidence.status}});

  // Return changed selections/evidence only. Large input catalogues stay with the snapshot.
  const fields=[...FORGE_COMPOSED_FIELDS,'weapons','armour','mods','stats','statModel','artifact','artifactConfiguration','artifactRecommendation','currentSeasonNumber','objective','activityContext','loadoutIntent','recommendationGeneratedAt','recommendationElement','recommendationStatus','forgeIntelligence','forgeEvidence','paradoxAnalysis','weaponSelectionRecommendation','armourModRecommendation','loadoutCoherence','liveTransferPreflight','weaponRollAdvice'];
  return {patch:Object.fromEntries(fields.filter(key=>Object.hasOwn(working,key)).map(key=>[key,working[key]])),recommendation:next.recommendation};
}

export {FORGE_ACTIVITY_KEYS,forgeActivityKey,forgeEvidenceAssessment,hasForgeActivityContext};
