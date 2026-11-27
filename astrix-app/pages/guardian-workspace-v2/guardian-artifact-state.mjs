const num=value=>{if(value===null||value===undefined||value==='')return null;const n=Number(value);return Number.isFinite(n)?n:null;};
const itemHash=item=>num(item?.hash??item?.bungieHash??item?.itemHash);

function normalisePerks(rows=[]){
  return (Array.isArray(rows)?rows:[]).map(item=>({...item,hash:itemHash(item)})).filter(item=>item.hash!==null);
}
// Each active perk once, in Bungie's order (a perk offered in several socket buckets is still one perk).
function uniquePerks(rows=[]){
  return normalisePerks(rows).filter((item,index,list)=>list.findIndex(other=>other.hash===item.hash)===index);
}

function cloneObject(value){try{return structuredClone(value);}catch{return JSON.parse(JSON.stringify(value??null));}}

function resolveFixtureArtifactDefinition(artifacts={},requestedHash=null){
  const rows=Object.values(artifacts||{});
  const explicit=num(requestedHash);
  if(explicit===null)return rows[0]||null;
  return rows.find(row=>itemHash(row)===explicit)||null;
}

function resolveIntendedArtifactConfiguration(detail={},artifact=null,selectedHashes=[],fallback={}){
  const incoming=detail?.artifactConfiguration&&typeof detail.artifactConfiguration==='object'?detail.artifactConfiguration:{};
  const provenance=incoming.provenance&&typeof incoming.provenance==='object'
    ?cloneObject(incoming.provenance)
    :fallback.provenance&&typeof fallback.provenance==='object'
      ?cloneObject(fallback.provenance)
      :null;
  return {
    schemaVersion:1,
    artifactHash:num(incoming.artifactHash??itemHash(artifact)),
    seasonNumber:num(incoming.seasonNumber??artifact?.seasonNumber??fallback.seasonNumber),
    selectedPerkHashes:Array.isArray(selectedHashes)?[...new Set(selectedHashes.map(num).filter(value=>value!==null))]:null,
    source:String(incoming.source||fallback.source||'fixture-intent'),
    provenance
  };
}

function resolveArtifactViewState(detail={},fallback={}){
  const source=String(detail?.source||'').toLowerCase();
  const liveArtifact=detail?.artifact||null;
  const liveMode=source==='bungie-live'||source==='bungie-loadout'||source==='bungie-selected-loadout';

  if(liveMode){
    if(!liveArtifact){
      return {
        mode:'live',
        state:'state-unavailable',
        editable:false,
        artifact:null,
        perks:null,
        selectedHashes:null,
        allPerks:[],
        artifactConfiguration:detail?.artifactConfiguration||null,
        source
      };
    }
    const state=String(liveArtifact.state||'state-unavailable');
    const all=normalisePerks(liveArtifact.perks||[]);
    const explicit=uniquePerks(liveArtifact.activePerks||[]);
    const active=state==='state-unavailable'?null:(explicit.length?explicit:uniquePerks(all.filter(item=>item?.isActive===true)));
    return {
      mode:'live',
      state,
      editable:false,
      artifact:{...liveArtifact,hash:itemHash(liveArtifact)},
      perks:active,
      selectedHashes:state==='state-unavailable'?null:active.map(item=>item.hash),
      allPerks:all,
      artifactConfiguration:detail?.artifactConfiguration||liveArtifact.artifactConfiguration||null,
      source
    };
  }

  const fixtureArtifact=fallback.fixtureArtifact||null;
  const fixtureSelected=(fallback.fixtureSelected||[]).map(num).filter(value=>value!==null);
  return {
    mode:'fixture',
    state:'intended',
    editable:true,
    artifact:fixtureArtifact?{...fixtureArtifact,hash:itemHash(fixtureArtifact)}:null,
    perks:[],
    selectedHashes:Array.isArray(detail?.artifactConfiguration?.selectedPerkHashes)?detail.artifactConfiguration.selectedPerkHashes:fixtureSelected,
    allPerks:[],
    artifactConfiguration:detail?.artifactConfiguration||null,
    source:source||'fixture'
  };
}

export {resolveArtifactViewState,resolveFixtureArtifactDefinition,resolveIntendedArtifactConfiguration};
