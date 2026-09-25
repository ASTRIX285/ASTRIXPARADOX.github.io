const BUNGIE='https://www.bungie.net';
const abs=path=>path?(String(path).startsWith('http')?String(path):`${BUNGIE}${path}`):'';
const numberOrNull=value=>{
  if(value===null||value===undefined||value==='')return null;
  const number=Number(value);
  return Number.isFinite(number)?number:null;
};
const definition=(definitions,hash)=>hash===null?null:(definitions?.[String(hash)]||null);

function displayItem(definitions,hash){
  const numericHash=numberOrNull(hash);
  const row=definition(definitions,numericHash);
  const displays=[row?.displayProperties,...(row?.resolvedSandboxPerks||[]).map(perk=>perk?.displayProperties)].filter(Boolean);
  const displayValue=key=>displays.find(display=>display?.[key])?.[key]||'';
  return {
    hash:numericHash,
    bungieHash:numericHash,
    name:displayValue('name')||`Unresolved Destiny definition ${numericHash}`,
    description:displayValue('description'),
    icon:abs(displayValue('icon')),
    definition:row,
    displayResolved:Boolean(row),
    unresolved:!row
  };
}

function createArtifactConfiguration({artifactHash=null,seasonNumber=null,selectedPerkHashes=null,source,provenance}={}){
  return {
    schemaVersion:1,
    artifactHash:numberOrNull(artifactHash),
    seasonNumber:numberOrNull(seasonNumber),
    selectedPerkHashes:Array.isArray(selectedPerkHashes)?[...new Set(selectedPerkHashes.map(numberOrNull).filter(value=>value!==null))]:null,
    source:String(source||'unknown'),
    provenance:provenance&&typeof provenance==='object'?structuredClone(provenance):null
  };
}

function resolveArtifactByProvenance(payload,characterId){
  const profile=payload?.profile||{};
  const definitions=payload?.definitions||{};
  const cid=String(characterId||'');
  const progressionData=profile?.characterProgressions?.data;
  const characterProgression=progressionData&&Object.prototype.hasOwnProperty.call(progressionData,cid)?progressionData[cid]:null;
  const seasonalArtifact=characterProgression?.seasonalArtifact;
  const profileArtifactHash=numberOrNull(profile?.profileProgression?.data?.seasonalArtifact?.artifactHash);
  const characterArtifactHash=numberOrNull(seasonalArtifact?.artifactHash);
  const artifactDefinition=payload?.artifactDefinition||null;
  const definitionHash=numberOrNull(artifactDefinition?.hash);
  const artifactHash=characterArtifactHash??profileArtifactHash??definitionHash;
  const manifestDefinition=definition(definitions,artifactHash);
  const resolvedArtifactDefinition=manifestDefinition||(definitionHash===artifactHash?artifactDefinition:null);
  const seasonNumber=numberOrNull(payload?.seasonNumber??payload?.currentSeasonNumber??payload?.artifactCoverage?.seasonNumber??resolvedArtifactDefinition?.seasonNumber);
  const base={hash:artifactHash,bungieHash:artifactHash,name:resolvedArtifactDefinition?.displayProperties?.name||`Unresolved Destiny definition ${artifactHash}`,description:resolvedArtifactDefinition?.displayProperties?.description||'',icon:abs(resolvedArtifactDefinition?.displayProperties?.icon),definition:resolvedArtifactDefinition,displayResolved:Boolean(resolvedArtifactDefinition),unresolved:!resolvedArtifactDefinition,seasonNumber,pointsUsed:numberOrNull(seasonalArtifact?.pointsUsed),coverage:payload?.artifactCoverage||null};
  const provenance={provider:'bungie',endpoint:'Destiny2.GetProfile',component:202,componentName:'CharacterProgressions',characterId:cid,path:`characterProgressions.data.${cid}.seasonalArtifact.tiers[].items[isActive=true]`};
  const unavailable=stateMessage=>{
    const artifactConfiguration=createArtifactConfiguration({artifactHash,seasonNumber,selectedPerkHashes:null,source:'bungie-live-state-unavailable',provenance:{...provenance,state:'state-unavailable'}});
    return {...base,state:'state-unavailable',provenance:'state-unavailable',perks:null,activePerks:null,unresolvedPerkHashes:[],artifactConfiguration,stateMessage};
  };

  if(!characterProgression||!seasonalArtifact||!Array.isArray(seasonalArtifact.tiers)){
    return unavailable('Artifact activation state for the selected character is unavailable.');
  }

  const definitionTiers=Array.isArray(resolvedArtifactDefinition?.tiers)?resolvedArtifactDefinition.tiers:[];
  const items=seasonalArtifact.tiers.flatMap((tier,tierIndex)=>{
    const definitionTier=definitionTiers.find(row=>numberOrNull(row?.tierHash)===numberOrNull(tier?.tierHash))||definitionTiers[tierIndex]||null;
    const definitionItems=Array.isArray(definitionTier?.items)?definitionTier.items:[];
    return (Array.isArray(tier?.items)?tier.items:[]).map((item,itemIndex)=>{
      const definitionItem=definitionItems.find(row=>numberOrNull(row?.itemHash)===numberOrNull(item?.itemHash))||definitionItems[itemIndex]||null;
      return {
        ...item,
        tierHash:numberOrNull(tier?.tierHash??definitionTier?.tierHash),
        tierIndex,
        itemIndex,
        column:tierIndex+1,
        order:itemIndex+1,
        tierTitle:String(definitionTier?.displayTitle||''),
        tierUnlocked:typeof tier?.isUnlocked==='boolean'?tier.isUnlocked:null,
        pointsToUnlock:numberOrNull(tier?.pointsToUnlock??definitionTier?.minimumUnlockPointsUsedRequirement),
        minimumUnlockPointsUsedRequirement:numberOrNull(definitionTier?.minimumUnlockPointsUsedRequirement??tier?.pointsToUnlock),
        definitionItemHash:numberOrNull(definitionItem?.itemHash)
      };
    });
  });
  if(!items.length){
    return unavailable('Bungie returned no Artifact tier item state for the selected character.');
  }
  if(items.some(item=>numberOrNull(item?.itemHash)===null||typeof item?.isActive!=='boolean'||typeof item?.isVisible!=='boolean')){
    return unavailable('Bungie returned incomplete Artifact tier activation data for the selected character.');
  }

  const perks=items.map(item=>({...displayItem(definitions,item.itemHash),isActive:item.isActive,isVisible:item.isVisible,tierHash:item.tierHash,tierIndex:item.tierIndex,itemIndex:item.itemIndex,column:item.column,order:item.order,tierTitle:item.tierTitle,tierUnlocked:item.tierUnlocked,pointsToUnlock:item.pointsToUnlock,minimumUnlockPointsUsedRequirement:item.minimumUnlockPointsUsedRequirement}));
  const activePerks=perks.filter(item=>item.isActive);
  const selectedPerkHashes=activePerks.map(item=>item.hash);
  const unresolvedPerkHashes=activePerks.filter(item=>item.unresolved).map(item=>item.hash);
  const state=activePerks.length?'resolved':'none-active';
  const artifactConfiguration=createArtifactConfiguration({artifactHash,seasonNumber,selectedPerkHashes,source:'bungie-live',provenance:{...provenance,state,manifestDefinitions:'DestinyInventoryItemDefinition'}});
  return {...base,state,provenance:'bungie-character-progressions-202',perks,activePerks,unresolvedPerkHashes,artifactConfiguration,stateMessage:activePerks.length?`${activePerks.length} applied Artifact perk(s) resolved from Bungie.`:'Bungie returned a complete Artifact state with no active perks.'};
}

function artifactUiState(artifact){
  if(!artifact||artifact.state==='state-unavailable')return {state:'state-unavailable',message:'Live Artifact activation state is unavailable.'};
  if(artifact.state==='resolved')return {state:'resolved',message:`${artifact.activePerks?.length||0} applied Artifact perk(s)`};
  if(artifact.state==='none-active')return {state:'none-active',message:'Bungie reports no active Artifact perks.'};
  return {state:'state-unavailable',message:'Live Artifact activation state is unavailable.'};
}

export {createArtifactConfiguration,resolveArtifactByProvenance,artifactUiState};
