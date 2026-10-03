const BUILD_STATE_VERSION = 1;
const BUILD_PERSISTENCE_SCHEMA_VERSION = 1;
const VALIDATION_STATUS = Object.freeze({UNTESTED:'untested',INITIAL:'initial-result',PROVISIONAL:'provisionally-validated',REPEATED:'repeatedly-validated',INVALIDATED:'not-validated'});
const PERSISTED_SHARED_BUILD_KEYS=Object.freeze(['ownedWeapons','vaultWeapons','inventoryWeapons','ownedArmour','subclassCatalog','availableArtifacts','artifactOptions','availableActivities','activityCatalog','gearAssets','itemRenderData','renderData','loadouts']);
const PERSISTED_TRANSIENT_BUILD_KEYS=Object.freeze(['liveTransferPreflight','liveTransferPlan','liveTransferResult','sessionCacheRestored','loadoutActionIntent']);
function clone(value){try{return structuredClone(value);}catch{return JSON.parse(JSON.stringify(value??null));}}
function freezeDeep(value){if(!value||typeof value!=='object'||Object.isFrozen(value))return value;Object.freeze(value);Object.values(value).forEach(freezeDeep);return value;}
function itemIdentity(item){if(!item)return null;return String(item.itemInstanceId||item.instanceId||item.hash||item.bungieHash||item.name||'');}
function numberOrNull(value){if(value===null||value===undefined||value==='')return null;const number=Number(value);return Number.isFinite(number)?number:null;}
function createIntendedArtifactConfiguration(candidate={},previous=null){
  const embedded=candidate?.artifactConfiguration&&typeof candidate.artifactConfiguration==='object'?candidate.artifactConfiguration:{};
  const prior=previous&&typeof previous==='object'?previous:{};
  const selectedSource=Array.isArray(embedded.selectedPerkHashes)?embedded.selectedPerkHashes:Array.isArray(candidate?.selectedPerkHashes)?candidate.selectedPerkHashes:Array.isArray(candidate?.activePerks)?candidate.activePerks.map(item=>item?.hash??item?.bungieHash??item?.itemHash):Array.isArray(prior.selectedPerkHashes)?prior.selectedPerkHashes:null;
  const selectedPerkHashes=Array.isArray(selectedSource)?[...new Set(selectedSource.map(numberOrNull).filter(value=>value!==null))]:null;
  const upstream=embedded.provenance&&typeof embedded.provenance==='object'?clone(embedded.provenance):prior.provenance&&typeof prior.provenance==='object'?clone(prior.provenance):null;
  return {schemaVersion:1,artifactHash:numberOrNull(candidate?.artifactHash??candidate?.hash??candidate?.bungieHash??embedded.artifactHash??prior.artifactHash),seasonNumber:numberOrNull(candidate?.seasonNumber??candidate?.artifactSeason??embedded.seasonNumber??prior.seasonNumber),selectedPerkHashes,source:'paradox-build-space-intended',provenance:{provider:'paradox-forge',path:'workingBuild.artifactConfiguration',state:'intended',derivedFrom:String(candidate?.source||embedded.source||prior.source||'resolved-artifact-option'),upstream}};
}
function toggleIntendedArtifactPerk(artifact,previous,index){
  const target=Array.isArray(artifact?.perks)?artifact.perks[index]:null;
  if(!target||target.isVisible===false||target.tierUnlocked===false)return previous&&typeof previous==='object'?clone(previous):createIntendedArtifactConfiguration(artifact,previous);
  const hash=numberOrNull(target.hash??target.itemHash??target.bungieHash);
  const configuration=createIntendedArtifactConfiguration(artifact,previous);
  if(hash===null)return configuration;
  const hashes=new Set((Array.isArray(configuration.selectedPerkHashes)?configuration.selectedPerkHashes:[]).map(numberOrNull).filter(value=>value!==null));
  if(hashes.has(hash))hashes.delete(hash);
  else{
    if(artifact?.availabilityModel==='artifact-2-socket-buckets'){
      const tierIndex=numberOrNull(target?.tierIndex);
      const slot=(artifact?.selectionSlots||[]).find(row=>numberOrNull(row?.tierIndex)===tierIndex);
      const capacity=Math.max(0,numberOrNull(slot?.capacity)??0);
      const sameBucket=(artifact?.perks||[]).filter(perk=>numberOrNull(perk?.tierIndex)===tierIndex&&hashes.has(numberOrNull(perk?.hash??perk?.itemHash??perk?.bungieHash)));
      while(capacity>0&&sameBucket.length>=capacity){
        const removed=sameBucket.shift();
        hashes.delete(numberOrNull(removed?.hash??removed?.itemHash??removed?.bungieHash));
      }
      if(capacity===0)return configuration;
    }
    hashes.add(hash);
  }
  return {...configuration,selectedPerkHashes:[...hashes],source:'paradox-working-build-intended',provenance:{...(configuration.provenance||{}),intent:'working-build-selection'}};
}
function needsIntendedArtifactConfiguration(build={}){
  const source=String(build.source||'').toLowerCase();
  return ['fixture','beta','saved','share','dim'].some(marker=>source.includes(marker));
}
function artifactConfigurationForBuild(build={}){
  const explicit=build.artifactConfiguration||build.artifact?.artifactConfiguration||null;
  if(explicit&&typeof explicit==='object')return clone(explicit);
  if(!needsIntendedArtifactConfiguration(build)||!build.artifact)return null;
  return createIntendedArtifactConfiguration(build.artifact,null);
}
function normalizeBuild(build={}){
  const normalized=clone(build||{});
  normalized.version=BUILD_STATE_VERSION;
  normalized.characterId=String(normalized.characterId||'');
  normalized.selectedLoadoutIndex=Number.isInteger(normalized.selectedLoadoutIndex)?normalized.selectedLoadoutIndex:null;
  normalized.subclassBuild=normalized.subclassBuild&&typeof normalized.subclassBuild==='object'?normalized.subclassBuild:{};
  normalized.artifact=normalized.artifact&&typeof normalized.artifact==='object'?normalized.artifact:null;
  normalized.artifactConfiguration=artifactConfigurationForBuild(normalized);
  normalized.weapons=Array.isArray(normalized.weapons)?normalized.weapons:[];
  normalized.armour=Array.isArray(normalized.armour)?normalized.armour:[];
  normalized.stats=Array.isArray(normalized.stats)?normalized.stats:[];
  normalized.paradoxAnalysis=normalized.paradoxAnalysis&&typeof normalized.paradoxAnalysis==='object'?normalized.paradoxAnalysis:null;
  normalized.weaponRollAdvice=normalized.weaponRollAdvice&&typeof normalized.weaponRollAdvice==='object'?normalized.weaponRollAdvice:null;
  normalized.locks=normalized.locks&&typeof normalized.locks==='object'?normalized.locks:{};
  normalized.objective=normalized.objective||null;
  normalized.activityContext=normalized.activityContext&&typeof normalized.activityContext==='object'?normalized.activityContext:null;
  return normalized;
}
function createBuildState(sourceBuild){const normalized=normalizeBuild(sourceBuild||{});const original=freezeDeep(normalized);return {version:BUILD_STATE_VERSION,createdAt:new Date().toISOString(),originalBuild:original,workingBuild:clone(normalized),recommendation:null,validationRecords:[]};}
function createWorkingBuildPatch(build={}){
  const working={...build};
  if(build.subclassBuild&&typeof build.subclassBuild==='object')working.subclassBuild={...build.subclassBuild};
  if(build.artifact&&typeof build.artifact==='object')working.artifact={...build.artifact};
  if(build.artifactConfiguration&&typeof build.artifactConfiguration==='object')working.artifactConfiguration={...build.artifactConfiguration,selectedPerkHashes:Array.isArray(build.artifactConfiguration.selectedPerkHashes)?[...build.artifactConfiguration.selectedPerkHashes]:build.artifactConfiguration.selectedPerkHashes};
  if(Array.isArray(build.manualEdits))working.manualEdits=[...build.manualEdits];
  if(Array.isArray(build.manualSocketChanges))working.manualSocketChanges=[...build.manualSocketChanges];
  return working;
}
function compactPersistenceBuild(build={}){
  const compact={...build};
  for(const key of PERSISTED_TRANSIENT_BUILD_KEYS)delete compact[key];
  return compact;
}
function createBuildPersistenceSnapshot(state={}){
  if(!state?.originalBuild||!state?.workingBuild)return null;
  const metadata={...state};delete metadata.originalBuild;delete metadata.workingBuild;
  const originalBuild=compactPersistenceBuild(state.originalBuild),workingPatch=compactPersistenceBuild(state.workingBuild);
  for(const key of PERSISTED_SHARED_BUILD_KEYS)if(Object.hasOwn(originalBuild,key))delete workingPatch[key];
  return {schemaVersion:BUILD_PERSISTENCE_SCHEMA_VERSION,savedAt:new Date().toISOString(),metadata,originalBuild,workingPatch,sharedBuildKeys:PERSISTED_SHARED_BUILD_KEYS.filter(key=>Object.hasOwn(originalBuild,key))};
}
function restoreBuildPersistenceSnapshot(snapshot={}){
  if(snapshot?.schemaVersion!==BUILD_PERSISTENCE_SCHEMA_VERSION||!snapshot.originalBuild||!snapshot.workingPatch)return null;
  const originalBuild=freezeDeep(snapshot.originalBuild),workingBuild={...originalBuild,...snapshot.workingPatch};
  return protectBuildState({...snapshot.metadata,version:BUILD_STATE_VERSION,originalBuild,workingBuild,validationRecords:Array.isArray(snapshot.metadata?.validationRecords)?snapshot.metadata.validationRecords:[]});
}
function protectBuildState(state={}){
  if(!state?.originalBuild||!state?.workingBuild)return state;
  if(Object.isFrozen(state.originalBuild)&&Array.isArray(state.validationRecords))return state;
  const protectedState=clone(state);
  protectedState.originalBuild=freezeDeep(protectedState.originalBuild);
  protectedState.validationRecords=Array.isArray(protectedState.validationRecords)?protectedState.validationRecords:[];
  return protectedState;
}
function restoreWorkingBuild(state={}){if(!state?.originalBuild)return state;return {...state,workingBuild:clone(state.originalBuild),recommendation:null,restoredAt:new Date().toISOString()};}
function diffSlot(prefix,before,after,index){const a=itemIdentity(before);const b=itemIdentity(after);if(a===b)return null;return {path:`${prefix}.${index}`,before:clone(before),after:clone(after),beforeId:a,afterId:b};}
function itemSocketSignature(item){const plugs=Array.isArray(item?.socketCoverage?.plugs)?item.socketCoverage.plugs:[];return JSON.stringify(plugs.map(row=>[Number(row?.socketIndex),numberOrNull(row?.hash??row?.itemHash??row?.bungieHash)]).filter(row=>Number.isInteger(row[0])&&row[1]!==null).sort((left,right)=>left[0]-right[0]));}
function artifactConfigurationSignature(configuration){if(!configuration||typeof configuration!=='object')return null;const selectedPerkHashes=Array.isArray(configuration.selectedPerkHashes)?[...new Set(configuration.selectedPerkHashes.map(numberOrNull).filter(value=>value!==null))].sort((a,b)=>a-b):null;return JSON.stringify({artifactHash:numberOrNull(configuration.artifactHash),seasonNumber:numberOrNull(configuration.seasonNumber),selectedPerkHashes});}
function diffBuilds(original={},working={}){const changes=[];['subclass','subclassName'].forEach(path=>{if(String(original?.[path]??'')!==String(working?.[path]??''))changes.push({path,before:original?.[path]??null,after:working?.[path]??null});});const a=original.subclassBuild||{},b=working.subclassBuild||{};if(itemIdentity(a.super)!==itemIdentity(b.super))changes.push({path:'subclassBuild.super',before:clone(a.super),after:clone(b.super),beforeId:itemIdentity(a.super),afterId:itemIdentity(b.super)});['abilities','aspects','fragments'].forEach(key=>{const left=Array.isArray(a[key])?a[key]:[],right=Array.isArray(b[key])?b[key]:[],count=Math.max(left.length,right.length);for(let i=0;i<count;i++){const c=diffSlot(`subclassBuild.${key}`,left[i],right[i],i);if(c)changes.push(c);}});if(itemIdentity(original.artifact)!==itemIdentity(working.artifact))changes.push({path:'artifact',before:clone(original.artifact),after:clone(working.artifact),beforeId:itemIdentity(original.artifact),afterId:itemIdentity(working.artifact)});if(artifactConfigurationSignature(original.artifactConfiguration)!==artifactConfigurationSignature(working.artifactConfiguration))changes.push({path:'artifactConfiguration',before:clone(original.artifactConfiguration),after:clone(working.artifactConfiguration)});for(const key of ['weapons','armour']){const left=Array.isArray(original[key])?original[key]:[],right=Array.isArray(working[key])?working[key]:[],count=Math.max(left.length,right.length);for(let i=0;i<count;i++){const c=diffSlot(key,left[i],right[i],i);if(c)changes.push(c);else if(itemSocketSignature(left[i])!==itemSocketSignature(right[i]))changes.push({path:`${key}.${i}.sockets`,before:itemSocketSignature(left[i]),after:itemSocketSignature(right[i]),beforeId:itemIdentity(left[i]),afterId:itemIdentity(right[i])});}}return changes;}
function createValidationRecord({build,testId=null,targetActivity='Vanguard Master Operation',objective=null}={}){const snapshot=normalizeBuild(build||{});return {schemaVersion:1,testId:testId||`PF-TEST-${Date.now()}`,createdAt:new Date().toISOString(),status:VALIDATION_STATUS.UNTESTED,targetActivity,objective:objective||snapshot.objective||null,characterId:snapshot.characterId,selectedLoadoutIndex:snapshot.selectedLoadoutIndex,buildSnapshot:freezeDeep(clone(snapshot)),activityInstanceId:null,pgcr:null,buildIntegrity:'unverified',baseline:null,outcome:null};}
const PORTABLE_BUILD_SCHEMA_VERSION=1;
const PORTABLE_BUILD_KINDS=Object.freeze(['saved-build','shared-build']);
function completePortableArtifactConfiguration(configuration){
  return Boolean(configuration&&typeof configuration==='object'&&numberOrNull(configuration.artifactHash)!==null&&numberOrNull(configuration.seasonNumber)!==null&&Array.isArray(configuration.selectedPerkHashes)&&String(configuration.source||'').trim()&&configuration.provenance&&typeof configuration.provenance==='object'&&!Array.isArray(configuration.provenance));
}
function portableArtifactMatches(build,configuration){
  const resolvedHash=numberOrNull(build?.artifact?.hash??build?.artifact?.itemHash??build?.artifact?.bungieHash);
  return resolvedHash===null||resolvedHash===numberOrNull(configuration?.artifactHash);
}
function serializePortableBuild(state,{kind='saved-build'}={}){
  if(!PORTABLE_BUILD_KINDS.includes(kind))throw new TypeError('Unsupported portable Builder snapshot kind.');
  const source=state?.workingBuild||state;
  const build=normalizeBuild(source||{});
  if(!build.characterId)throw new TypeError('Portable Builder snapshots require a characterId.');
  if(!completePortableArtifactConfiguration(build.artifactConfiguration))throw new TypeError('Portable Builder snapshots require an explicit intended Artifact configuration.');
  if(!portableArtifactMatches(build,build.artifactConfiguration))throw new TypeError('Portable Builder Artifact identity does not match the intended configuration.');
  return JSON.stringify({schemaVersion:PORTABLE_BUILD_SCHEMA_VERSION,kind,createdAt:new Date().toISOString(),build});
}
function deserializePortableBuild(serialized,{expectedKind=null}={}){
  try{
    const envelope=typeof serialized==='string'?JSON.parse(serialized):clone(serialized);
    if(!envelope||envelope.schemaVersion!==PORTABLE_BUILD_SCHEMA_VERSION||!PORTABLE_BUILD_KINDS.includes(envelope.kind))return null;
    if(expectedKind&&envelope.kind!==expectedKind)return null;
    const build=normalizeBuild(envelope.build||{});
    if(!build.characterId||!completePortableArtifactConfiguration(build.artifactConfiguration)||!portableArtifactMatches(build,build.artifactConfiguration))return null;
    return createBuildState(build);
  }catch{return null;}
}
export {BUILD_STATE_VERSION,BUILD_PERSISTENCE_SCHEMA_VERSION,VALIDATION_STATUS,PORTABLE_BUILD_SCHEMA_VERSION,PORTABLE_BUILD_KINDS,PERSISTED_SHARED_BUILD_KEYS,clone,freezeDeep,itemIdentity,createIntendedArtifactConfiguration,toggleIntendedArtifactPerk,artifactConfigurationForBuild,normalizeBuild,createBuildState,createWorkingBuildPatch,createBuildPersistenceSnapshot,restoreBuildPersistenceSnapshot,protectBuildState,restoreWorkingBuild,diffBuilds,createValidationRecord,completePortableArtifactConfiguration,serializePortableBuild,deserializePortableBuild};
