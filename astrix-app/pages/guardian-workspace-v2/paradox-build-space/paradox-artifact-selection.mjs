import {recommendArtifactLoadout,recommendArtifactPerks} from '../guardian-artifact-recommender.mjs?v=20260906-complete-build-transfer-1';
import {createIntendedArtifactConfiguration,protectBuildState} from './paradox-build-state.mjs?v=20260904-memory-safe-transfer-1';

const clone=value=>{
  try{return structuredClone(value);}
  catch{return JSON.parse(JSON.stringify(value??null));}
};
const integer=value=>value===null||value===undefined||value===''?null:(Number.isInteger(Number(value))?Number(value):null);
const hashOf=value=>integer(value?.hash??value?.itemHash??value?.bungieHash??value?.artifactHash);
const sortedHashes=values=>[...new Set((Array.isArray(values)?values:[]).map(integer).filter(value=>value!==null))].sort((a,b)=>a-b);
function artifactPerkCatalogue(artifact={},recommendation=null){
  const rows=[
    ...(artifact?.perks||[]),
    ...(recommendation?.selectionSequence||[]).map(row=>row?.artifactPerk),
    ...(recommendation?.recommendations||[]).map(row=>row?.artifactPerk)
  ].filter(Boolean),catalogue=new Map();
  for(const row of rows){const hash=hashOf(row);if(hash===null)continue;catalogue.set(hash,{...clone(row),...(catalogue.get(hash)||{}),hash,bungieHash:integer(row?.bungieHash)??hash});}
  return [...catalogue.values()];
}

function recommendationFingerprint(build={},currentSeasonNumber=null){
  const artifact=build.artifact||{};
  return JSON.stringify({
    artifactPlanVersion:3,
    characterId:String(build.characterId||''),
    currentSeasonNumber:integer(currentSeasonNumber),
    artifactHash:hashOf(artifact),
    artifactSeason:integer(artifact.seasonNumber),
    pointsUsed:integer(artifact.pointsUsed),
    perks:(artifact.perks||[]).map(perk=>({hash:hashOf(perk),active:perk?.isActive===true,visible:perk?.isVisible===true,tierUnlocked:perk?.tierUnlocked===true})),
    availableArtifacts:(build.availableArtifacts||build.artifactOptions||[]).map(option=>({
      hash:hashOf(option),
      model:option?.availabilityModel||'',
      manifestVersion:option?.manifestVersion||null,
      slots:(option?.selectionSlots||[]).map(slot=>({capacity:integer(slot?.capacity),perkHashes:sortedHashes(slot?.perkHashes)})),
      perks:(option?.perks||[]).map(perk=>hashOf(perk))
    })),
    forgeLoaderDecision:build.forgeLoaderDecision||null,
    subclass:build.subclass||build.subclassName||'',
    super:hashOf(build.subclassBuild?.super||build.super),
    abilities:(build.subclassBuild?.abilities||build.abilities||[]).map(hashOf),
    aspects:(build.subclassBuild?.aspects||build.aspects||[]).map(hashOf),
    fragments:(build.subclassBuild?.fragments||build.fragments||[]).map(hashOf),
    weapons:(build.weapons||[]).map(weapon=>({hash:hashOf(weapon),itemInstanceId:String(weapon?.itemInstanceId||''),element:weapon?.element||weapon?.elementDefinition?.displayProperties?.name||'',type:weapon?.weaponType||weapon?.itemTypeDisplayName||weapon?.definition?.itemTypeDisplayName||'',selectedPerks:(weapon?.weaponSemantics?.selectedPerks||weapon?.selectedPerks||[]).map(hashOf)})),
    armourMods:(build.armour||[]).map(item=>({itemInstanceId:String(item?.itemInstanceId||''),mods:[...(item?.generalMods||item?.armourSemantics?.generalMods||[]),...(item?.slotMods||item?.armourSemantics?.slotMods||[])].map(hashOf)})),
    loadoutIntent:build.loadoutIntent||null
  });
}

function currentSeasonOf(build={},override=null){
  return integer(override??build.currentSeasonNumber??build.currentSeason?.seasonNumber);
}

function applyForgeArtifactRecommendation(state,{currentSeasonNumber=null,force=false}={}){
  if(!state?.originalBuild||!state?.workingBuild||!state.workingBuild.forgeLoaderDecision){
    return {state,applied:false,recommendation:null};
  }
  const build=state.workingBuild;
  const season=currentSeasonOf(build,currentSeasonNumber);
  const artifact=build.artifact||null;
  const effectiveArtifact=artifact&&integer(artifact.seasonNumber)===null&&season!==null?{...artifact,seasonNumber:season}:artifact;
  const artifactOptions=(build.availableArtifacts||build.artifactOptions||[]).filter(option=>option?.availabilityModel==='artifact-2-socket-buckets');
  const fingerprint=recommendationFingerprint({...build,artifact:effectiveArtifact},season);
  if(!force&&build.artifactRecommendation?.fingerprint===fingerprint){
    return {state,applied:false,recommendation:build.artifactRecommendation};
  }
  const recommendationBase=artifactOptions.length
    ?recommendArtifactLoadout(build,artifactOptions,{currentSeasonNumber:season})
    :recommendArtifactPerks(build,effectiveArtifact,{currentSeasonNumber:season,planFullBuild:true});
  const recommendation={...recommendationBase,fingerprint,userOverride:false,source:'paradox-forge-loader-artifact-fit'};
  // The protected Original Build never changes. Only Artifact fields are
  // replaced, so keep the large owned-inventory catalogues structurally shared.
  const next={...state,workingBuild:{...state.workingBuild}};
  next.workingBuild.currentSeasonNumber=season;
  next.workingBuild.artifactRecommendation=clone(recommendation);

  const completeSelection=recommendation.status==='current'
    && recommendation.selectionStatus==='ready'
    && recommendation.selectionLimit>0
    && recommendation.selectedPerkHashes.length===recommendation.selectionLimit
    && recommendation.selectedMatchedCount>0;
  if(!completeSelection)return {state:protectBuildState(next),applied:false,recommendation};

  const selectedArtifact=artifactOptions.find(option=>hashOf(option)===recommendation.artifactHash)||effectiveArtifact;
  const artifactPerks=artifactPerkCatalogue(selectedArtifact,recommendation);
  const prior=build.artifactConfiguration||selectedArtifact?.artifactConfiguration||artifact?.artifactConfiguration||null;
  const configuration=createIntendedArtifactConfiguration(selectedArtifact,prior);
  const selectedPerkHashes=sortedHashes(recommendation.selectedPerkHashes);
  next.workingBuild.artifact={...clone(selectedArtifact),perks:artifactPerks};
  next.workingBuild.artifactConfiguration={
    ...configuration,
    artifactHash:recommendation.artifactHash,
    seasonNumber:recommendation.seasonNumber??season,
    selectedPerkHashes,
    source:'paradox-forge-loader-recommendation',
    provenance:{
      provider:'paradox-forge',
      path:'workingBuild.artifactConfiguration',
      state:'recommended-working-build-only',
      derivedFrom:'workingBuild.forgeLoaderDecision',
      recommendationFingerprint:fingerprint,
      currentSeasonNumber:season,
      selectionModel:recommendation.selectionModel,
      upstream:clone(prior?.provenance||artifact?.artifactConfiguration?.provenance||null)
    }
  };
  if(next.workingBuild.artifact){
    next.workingBuild.artifact.seasonNumber=integer(next.workingBuild.artifact.seasonNumber)??season;
    next.workingBuild.artifact.state='recommended';
    next.workingBuild.artifact.activePerks=next.workingBuild.artifact.perks.filter(perk=>selectedPerkHashes.includes(hashOf(perk))).map(perk=>({...perk,isActive:true}));
    next.workingBuild.artifact.artifactConfiguration=clone(next.workingBuild.artifactConfiguration);
  }
  return {state:protectBuildState(next),applied:true,recommendation};
}

export {applyForgeArtifactRecommendation,artifactPerkCatalogue,currentSeasonOf,recommendationFingerprint};
