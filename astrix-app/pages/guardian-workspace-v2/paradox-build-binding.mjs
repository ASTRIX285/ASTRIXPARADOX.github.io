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

function shouldReplaceBuildState(currentState,detail={},options={}){
  if(detail?.source!=="bungie-live"||!detail.characterId)return false;
  if(!currentState?.originalBuild||!currentState?.workingBuild)return true;
  const incomingCharacterId=String(detail.characterId||'');
  const explicitlySelectedCharacterId=String(options.explicitlySelectedCharacterId||'');
  const explicitCharacterChange=Boolean(explicitlySelectedCharacterId)&&explicitlySelectedCharacterId===incomingCharacterId;
  const explicitLoadoutChange=Number.isInteger(detail.selectedLoadoutIndex);
  if(explicitCharacterChange||explicitLoadoutChange)return true;
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

export {HANDOFF_SCHEMA,HANDOFF_TTL_MS,bindingOf,bindingsEqual,compactBungieLoadouts,shouldReplaceBuildState,repairMissingBuildBinding,mergePreparedLoadoutContext,createHandoffEnvelope,validateHandoffEnvelope};
