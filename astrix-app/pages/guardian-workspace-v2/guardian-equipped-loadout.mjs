const MIN_MATCHED_LOADOUT_ITEMS=5;

const instanceId=value=>{
  const id=String(value??'');
  return /^\d+$/.test(id)&&id!=='0'?id:'';
};

const plugHash=value=>{
  const hash=Number(value);
  return Number.isInteger(hash)&&hash>0?hash:0;
};

function loadoutRows(loadout={}){
  return Array.isArray(loadout?.items)?loadout.items:[];
}

function loadoutItemIds(loadout={}){
  return [...new Set(loadoutRows(loadout).map(row=>instanceId(row?.itemInstanceId)).filter(Boolean))];
}

function plugEvidence(profile={},loadout={}){
  const sockets=profile?.itemComponents?.sockets?.data||{};
  let compared=0;
  for(const row of loadoutRows(loadout)){
    const id=instanceId(row?.itemInstanceId);
    const expected=Array.isArray(row?.plugItemHashes)?row.plugItemHashes.map(plugHash):[];
    const actual=Array.isArray(sockets?.[id]?.sockets)?sockets[id].sockets:[];
    if(!id||!expected.length||!actual.length)continue;
    for(let index=0;index<expected.length;index+=1){
      const hash=expected[index];
      if(!hash)continue;
      const equippedHash=plugHash(actual[index]?.plugHash);
      if(!equippedHash)continue;
      compared+=1;
      if(equippedHash!==hash)return {matches:false,compared};
    }
  }
  return {matches:true,compared};
}

/**
 * Bungie component 206 exposes saved loadout contents but not a separate
 * "currently active slot" field. Resolve the active slot by comparing exact
 * int64 item instance IDs with component 205 and use component 305 socket
 * evidence to disambiguate loadouts that share the same gear.
 */
function equippedLoadoutCandidates(profile={},characterId=''){
  const id=String(characterId||'');
  const equippedRows=profile?.characterEquipment?.data?.[id]?.items;
  const loadouts=profile?.characterLoadouts?.data?.[id]?.loadouts;
  if(!Array.isArray(equippedRows)||!Array.isArray(loadouts))return [];
  const equippedIds=new Set(equippedRows.map(row=>instanceId(row?.itemInstanceId)).filter(Boolean));
  if(equippedIds.size<MIN_MATCHED_LOADOUT_ITEMS)return [];
  return loadouts.flatMap((loadout,index)=>{
    const itemIds=loadoutItemIds(loadout);
    if(itemIds.length<MIN_MATCHED_LOADOUT_ITEMS||!itemIds.every(itemId=>equippedIds.has(itemId)))return [];
    const plugs=plugEvidence(profile,loadout);
    return plugs.matches?[{index,itemCount:itemIds.length,plugCount:plugs.compared}]:[];
  }).sort((left,right)=>right.itemCount-left.itemCount||right.plugCount-left.plugCount||left.index-right.index);
}

function inferEquippedLoadoutIndex(profile={},characterId=''){
  const candidates=equippedLoadoutCandidates(profile,characterId);
  if(!candidates.length)return null;
  const best=candidates[0];
  const equallyExact=candidates.filter(candidate=>candidate.itemCount===best.itemCount&&candidate.plugCount===best.plugCount);
  return equallyExact.length===1?best.index:null;
}

export {MIN_MATCHED_LOADOUT_ITEMS,equippedLoadoutCandidates,inferEquippedLoadoutIndex,loadoutItemIds};
