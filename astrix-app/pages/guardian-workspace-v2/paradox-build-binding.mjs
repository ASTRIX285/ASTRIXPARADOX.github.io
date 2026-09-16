const HANDOFF_SCHEMA=2;
const HANDOFF_TTL_MS=30*60*1000;
const text=value=>String(value??'').trim();
const integer=value=>Number.isInteger(Number(value))?Number(value):null;
const clone=value=>{try{return structuredClone(value);}catch{return JSON.parse(JSON.stringify(value??null));}};

const compactLoadoutItems=value=>Array.isArray(value)?value.map(row=>{
  const itemInstanceId=text(row?.itemInstanceId),plugItemHashes=Array.isArray(row?.plugItemHashes)?row.plugItemHashes.map(integer).filter(hash=>hash!==null):[];
  if(!itemInstanceId)return null;
  return plugItemHashes.length?{itemInstanceId,plugItemHashes}:{itemInstanceId};
}).filter(Boolean):[];

function compactBungieLoadouts(value){
  return Array.isArray(value)?value.slice(0,20).map(row=>{
    if(!row)return null;
    return {colorHash:integer(row.colorHash),iconHash:integer(row.iconHash),nameHash:integer(row.nameHash),items:compactLoadoutItems(row.items),subclassOverrides:compactLoadoutItems(row.subclassOverrides)};
  }):[];
}

function bindingOf(value={}){
  const source=value?.originalBuild||value;
  return {
    membershipId:String(source?.membershipId||source?.bungieMembershipId||source?.membership?.membershipId||''),
    membershipType:String(source?.membershipType||source?.membership?.membershipType||''),
    characterId:String(source?.characterId||'')
  };
}

function bindingsEqual(left={},right={}){
  const a=bindingOf(left),b=bindingOf(right);
  return a.characterId===b.characterId&&a.membershipId===b.membershipId&&a.membershipType===b.membershipType;
}

const CHARACTER_ARRAY_FIELDS=Object.freeze([
  'stats','weapons','ownedWeapons','armour','mods','ornaments','subclassCatalog',
  'superOptions','abilities','availableAbilities','aspects','availableAspects',
  'fragments','availableFragments','transcendenceOptions','transcendenceSlots',
  'availableArtifacts','artifactOptions','loadouts'
]);
const CHARACTER_NULL_FIELDS=Object.freeze([
  'subclassBuild','super','artifact','artifactConfiguration','emblem','ghost','shader',
  'renderData','itemRenderData','hashCoverage','semanticCoverage','coverage',
  'paradoxAnalysis','weaponRollAdvice'
]);

/* Partial updates may reuse state for one Guardian, but a character change is
 * a hard ownership boundary. Missing fields must clear instead of inheriting
 * the previously painted Guardian's equipped build. */
function characterScopedSelectionState(previous={},detail={}){
  const characterId=text(detail?.characterId||detail?.fixtureId);
  if(!characterId)return null;
  const sameCharacter=characterId===text(previous?.characterId||previous?.fixtureId);
  const next=sameCharacter?{...previous}:{characterId};
  Object.assign(next,detail,{characterId});
  for(const field of CHARACTER_ARRAY_FIELDS){
    if(Array.isArray(detail?.[field]))next[field]=[...detail[field]];
    else if(!sameCharacter)next[field]=[];
  }
  for(const field of CHARACTER_NULL_FIELDS){
    if(Object.prototype.hasOwnProperty.call(detail,field))next[field]=detail[field];
    else if(!sameCharacter)next[field]=null;
  }
  if(Object.hasOwn(detail,'subclassBuild')&&detail.subclassBuild===null)next.super=null;
  else if(detail.subclassBuild&&Object.hasOwn(detail.subclassBuild,'super'))next.super=detail.subclassBuild.super;
  else if(Object.hasOwn(detail,'super'))next.subclassBuild={...(next.subclassBuild||{}),super:detail.super};
  if(!sameCharacter){
    next.subclassName=text(detail.subclassName);
    next.subclassIcon=text(detail.subclassIcon);
    next.power=detail.power??null;
    next.selectedLoadoutIndex=Number.isInteger(detail.selectedLoadoutIndex)?detail.selectedLoadoutIndex:null;
    next.loadoutSource=text(detail.loadoutSource);
  }
  return next;
}

// A saved-slot highlight describes a match, not a user selection.
function isEquippedSelection(detail={}){
  return detail.loadoutSource==='currently-equipped'||(!Number.isInteger(detail.selectedLoadoutIndex)&&detail.loadoutSource!=='subclass-preview');
}
function isExplicitLoadoutSelection(detail={}){
  return Number.isInteger(detail.selectedLoadoutIndex)&&!isEquippedSelection(detail);
}

function shouldReplaceBuildState(currentState,detail={},options={}){
  if(detail?.source!=="bungie-live"||!detail.characterId)return false;
  if(!currentState?.originalBuild||!currentState?.workingBuild)return true;
  const incomingCharacterId=String(detail.characterId||'');
  const explicitlySelectedCharacterId=String(options.explicitlySelectedCharacterId||'');
  const explicitCharacterChange=Boolean(explicitlySelectedCharacterId)&&explicitlySelectedCharacterId===incomingCharacterId;
  const explicitLoadoutChange=isExplicitLoadoutSelection(detail);
  if(explicitCharacterChange||explicitLoadoutChange)return true;
  const currentCharacterId=bindingOf(currentState.originalBuild).characterId;
  if(currentCharacterId&&currentCharacterId!==incomingCharacterId)return false;
  // Automatic profile hydration must never replace an existing protected
  // Working Build. Only an explicit character or Bungie-slot selection may do
  // that; relying on a transient route query loses the build after hydration.
  return false;
}

function repairMissingBuildBinding(currentState,detail={}){
  if(!currentState?.originalBuild||!currentState?.workingBuild)return currentState;
  const current=bindingOf(currentState),incoming=bindingOf(detail);
  if(!current.characterId||current.characterId!==incoming.characterId)return currentState;
  if(current.membershipId&&current.membershipId!==incoming.membershipId)return currentState;
  if(current.membershipType&&current.membershipType!==incoming.membershipType)return currentState;
  const membershipId=current.membershipId||incoming.membershipId,membershipType=current.membershipType||incoming.membershipType;
  if(!membershipId||!membershipType||(membershipId===current.membershipId&&membershipType===current.membershipType))return currentState;
  const bind=build=>({...build,membershipId,membershipType});
  return {...currentState,originalBuild:bind(currentState.originalBuild),workingBuild:bind(currentState.workingBuild)};
}

function mergePreparedLoadoutContext(currentState,detail={}){
  if(detail?.source!=='bungie-live'||detail?.loadoutsAvailable!==true||!Array.isArray(detail.loadouts)||!currentState?.originalBuild||!currentState?.workingBuild)return currentState;
  const current=bindingOf(currentState),incoming=bindingOf(detail);
  if(!current.characterId||current.characterId!==incoming.characterId)return currentState;
  if(current.membershipId&&incoming.membershipId&&current.membershipId!==incoming.membershipId)return currentState;
  if(current.membershipType&&incoming.membershipType&&current.membershipType!==incoming.membershipType)return currentState;
  const loadouts=compactBungieLoadouts(detail.loadouts),signature=JSON.stringify(loadouts);
  if(currentState.originalBuild.loadoutsAvailable===true&&currentState.workingBuild.loadoutsAvailable===true&&JSON.stringify(currentState.originalBuild.loadouts||[])===signature&&JSON.stringify(currentState.workingBuild.loadouts||[])===signature)return currentState;
  const merge=build=>({...build,loadoutsAvailable:true,loadouts:clone(loadouts)});
  return {...currentState,originalBuild:merge(currentState.originalBuild),workingBuild:merge(currentState.workingBuild)};
}

function createHandoffEnvelope(payload,{savedAt=Date.now()}={}){
  return {schemaVersion:HANDOFF_SCHEMA,savedAt,binding:bindingOf(payload),payload};
}

function validateHandoffEnvelope(envelope,{expectedCharacterId='',expectedMembershipId='',expectedMembershipType='',allowLegacy=false,now=Date.now()}={}){
  if(!envelope||typeof envelope!=='object')return null;
  if(envelope.schemaVersion!==HANDOFF_SCHEMA)return allowLegacy&&envelope.characterId?envelope:null;
  if(!envelope.payload||now-Number(envelope.savedAt||0)>HANDOFF_TTL_MS)return null;
  const binding=bindingOf(envelope.binding),payloadBinding=bindingOf(envelope.payload);
  if(!binding.characterId||!bindingsEqual(binding,payloadBinding))return null;
  if(expectedCharacterId&&binding.characterId!==String(expectedCharacterId))return null;
  if(expectedMembershipId&&binding.membershipId!==String(expectedMembershipId))return null;
  if(expectedMembershipType&&binding.membershipType!==String(expectedMembershipType))return null;
  return envelope.payload;
}

export {isEquippedSelection,isExplicitLoadoutSelection,HANDOFF_SCHEMA,HANDOFF_TTL_MS,bindingOf,bindingsEqual,compactBungieLoadouts,characterScopedSelectionState,shouldReplaceBuildState,repairMissingBuildBinding,mergePreparedLoadoutContext,createHandoffEnvelope,validateHandoffEnvelope};
