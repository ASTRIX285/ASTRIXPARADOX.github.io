// Worker-safe Forge sequence. Selection and Artifact rules are shared with the established UI flow.
import {protectBuildState,createBuildState} from './paradox-build-state.mjs?v=20260904-memory-safe-transfer-1';
import {composeForgeRecommendation,hasVerifiedSubclassSockets,filterExoticCompatibleSubclasses} from './paradox-forge-intelligence.mjs?v=20260909-super-evidence-1';
import {analyzeLiveGuardian} from '../guardian-paradox-live-adapter.mjs?v=20260905-background-forge-1';
import {applyForgeArtifactRecommendation} from './paradox-artifact-selection.mjs?v=20260906-complete-build-transfer-1';
import {validateTierFiveArmour} from './paradox-build-recommendation.mjs';
import {createLiveTransferPreflight,deriveLoadoutIntent,recommendArmourMods,selectOwnedWeapons,validateArmourModLoadout,validateExoticLoadout,validateLoadoutCoherence} from './paradox-loadout-intelligence.mjs?v=20260906-complete-build-transfer-1';
import {adviseLiveWeaponRolls} from '../guardian-weapon-roll-advisor.mjs?v=20260905-worker-preflight-1';
const FORGE_COMPUTATION_FIELDS=Object.freeze(['version','source','characterId','membershipId','membershipType','characterClass','selectedLoadoutIndex','subclass','subclassName','subclassIcon','subclassBuild','super','superOptions','classAbility','movement','melee','grenade','abilities','aspects','fragments','artifact','artifactConfiguration','weapons','armour','mods','stats','hashCoverage','statModel','coverage','semanticCoverage','paradoxEvidence','forgeLoaderDecision','objective','activityContext','locks']);
const FORGE_COMPOSED_FIELDS=Object.freeze(['subclass','subclassName','subclassIcon','subclassBuild','super','superOptions','classAbility','movement','melee','grenade','abilities','aspects','fragments']);
function forgeComputationProjection(build={}){return Object.fromEntries(FORGE_COMPUTATION_FIELDS.filter(key=>Object.hasOwn(build,key)).map(key=>[key,build[key]]));}
function mergeComposedRecommendation(build={},composed={}){const next={...build};for(const key of FORGE_COMPOSED_FIELDS)if(Object.hasOwn(composed,key))next[key]=composed[key];return next;}

export async function prepareForgeSequence({build,candidate,element,objective='balanced',currentSeasonNumber=null,superHash=0},{onProgress=()=>{},advise=adviseLiveWeaponRolls}={}){
  if(!build?.forgeLoaderDecision||!validateTierFiveArmour(build).ready||!validateExoticLoadout(build,{requireArmourAnchor:true}).ready)throw new Error('Stage a verified Forge Loader armour result first.');
  if(!hasVerifiedSubclassSockets(candidate)||!filterExoticCompatibleSubclasses(build,[candidate]).length)throw new Error('The selected subclass is not compatible with the verified Forge Loader result.');
  if(superHash){
    const sb=candidate.subclassBuild||candidate.build,selected=[sb.super,...(sb.superOptions||[])].find(item=>Number(item?.hash??item?.bungieHash)===Number(superHash));
    if(!selected)throw new Error('The selected Super is not in this verified subclass catalogue.');
    candidate={...candidate,subclassBuild:{...sb,super:selected,superOptions:[selected]}};
  }
  const state=createBuildState(build);
  const updateForgeGenerationPhase=async message=>onProgress(message);
    let next=protectBuildState(state),working={...next.workingBuild};
    await updateForgeGenerationPhase('OPTIMISING VERIFIED SUBCLASS COMPONENTS…');
    const composed=composeForgeRecommendation({build:forgeComputationProjection(working),candidate,element:element,analyzeBuild:analyzeLiveGuardian,bounded:true});
    working=mergeComposedRecommendation(working,composed.workingBuild);working.recommendationGeneratedAt=new Date().toISOString();working.recommendationElement=element;working.recommendationStatus='review-required';working.forgeIntelligence={...composed.intelligence,generatedAt:working.recommendationGeneratedAt};working.paradoxAnalysis=composed.analysis||analyzeLiveGuardian(working)||null;next={...next,workingBuild:working,recommendation:{status:'review-required',generatedAt:working.recommendationGeneratedAt,element:element,source:'verified-forge-loader-working-build',intelligenceMethod:working.forgeIntelligence.method}};
    working.objective=objective;
    working.loadoutIntent=deriveLoadoutIntent(working);
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
    next=protectBuildState({...next,workingBuild:working});const finalArtifactResult=applyForgeArtifactRecommendation(next,{currentSeasonNumber,force:true});next=finalArtifactResult.state;working={...next.workingBuild};const coherence=validateLoadoutCoherence(working);if(!coherence.ready)throw new Error(coherence.reason);working.loadoutCoherence=coherence;working.liveTransferPreflight=createLiveTransferPreflight(working);
    await updateForgeGenerationPhase('VERIFYING RECOMMENDED WEAPON PERK ROLLS…');
    await advise(working,working.paradoxAnalysis||{}, {insertSocketPlugFree:false});if(working.forgeIntelligence&&working.paradoxAnalysis){working.forgeIntelligence.evidence={...working.forgeIntelligence.evidence,directedLinks:working.paradoxAnalysis.buildLoop?.length||0,strengths:working.paradoxAnalysis.strengths?.length||0,weakLinks:working.paradoxAnalysis.weakLinks?.length||0,confidence:working.paradoxAnalysis.confidence?.level||'evidence-limited',ownedWeaponCandidates:working.weaponSelectionRecommendation?.candidateCount||0,artifactSynergyScore:Number(working.artifactRecommendation?.totalScore||0),armourModDecisions:working.armourModRecommendation?.decisions?.length||0};working.forgeIntelligence.limitations=[...new Set([...(working.forgeIntelligence.limitations||[]),...(working.weaponSelectionRecommendation?.limitations||[]),...(working.armourModRecommendation?.limitations||[])])];}

  // Return changed selections/evidence only. Large input catalogues stay with the snapshot.
  const fields=[...FORGE_COMPOSED_FIELDS,'weapons','armour','mods','stats','statModel','artifact','artifactConfiguration','artifactRecommendation','currentSeasonNumber','objective','loadoutIntent','recommendationGeneratedAt','recommendationElement','recommendationStatus','forgeIntelligence','paradoxAnalysis','weaponSelectionRecommendation','armourModRecommendation','loadoutCoherence','liveTransferPreflight','weaponRollAdvice'];
  return {patch:Object.fromEntries(fields.filter(key=>Object.hasOwn(working,key)).map(key=>[key,working[key]])),recommendation:next.recommendation};
}
