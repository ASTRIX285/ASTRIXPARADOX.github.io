// Presentation model: exact instance IDs from Bungie's profile, never the viewed build.
export const isSavedLoadout=loadout=>Boolean(loadout&&(loadout.items?.length||loadout.subclassOverrides?.length));
const id=item=>String(item?.itemInstanceId||'');
export function profileItems(profile={}){
  return [...(profile.profileInventory?.data?.items||[]),...Object.values(profile.characterInventories?.data||{}).flatMap(row=>row.items||[]),...Object.values(profile.characterEquipment?.data||{}).flatMap(row=>row.items||[])];
}
export function loadoutStatus(loadout,profile={},characterId=''){
  if(!isSavedLoadout(loadout))return {state:'empty',label:'Empty',missing:0};
  const equipment=profile.characterEquipment?.data?.[characterId]?.items||[];
  const equipped=new Set(equipment.map(id));
  const available=new Set([...equipment,...(profile.characterInventories?.data?.[characterId]?.items||[]).filter(item=>Number(item.location)!==4&&Number(item.bucketHash)!==215593132),...(profile.profileInventory?.data?.items||[]).filter(item=>Number(item.location)!==4&&Number(item.bucketHash)!==215593132)].map(id));
  available.delete('');available.delete('0');equipped.delete('');equipped.delete('0');
  const items=loadout.items||[],missing=items.filter(item=>!available.has(id(item))).length;
  if(missing)return {state:'missing',label:`${missing} ${missing===1?'item':'items'} missing`,missing};
  if(!items.length)return {state:'missing',label:'Items unavailable',missing:0};
  const active=items.every(item=>equipped.has(id(item)));
  return {state:active?'equipped':'ready',label:active?'Equipped':'Ready',missing:0};
}
export function loadoutGear(loadout,profile={},definitions={}){
  const indexed=new Map(profileItems(profile).map(item=>[id(item),item]));
  return (loadout?.items||[]).map(saved=>{
    const item=indexed.get(id(saved)),def=definitions[String(item?.itemHash)]||{};
    return {itemInstanceId:id(saved),item,kind:Number(def.itemType),name:def.displayProperties?.name||'Item unavailable',icon:def.displayProperties?.icon||''};
  }).filter(row=>!row.item||[2,3].includes(row.kind));
}
// Only used after Bungie accepts Equip. The next profile replaces this projection.
export function acceptedEquipment(loadout,profile,characterId){
  if(loadoutStatus(loadout,profile,characterId).state==='missing')return profile;
  const indexed=new Map(profileItems(profile).map(item=>[id(item),item]));
  const selected=(loadout.items||[]).map(item=>indexed.get(id(item))).filter(Boolean);
  if(!selected.length)return profile;
  const buckets=new Set(selected.map(item=>item.bucketHash));
  const previous=profile.characterEquipment?.data?.[characterId]?.items||[];
  const items=[...previous.filter(item=>!buckets.has(item.bucketHash)),...selected];
  const selectedIds=new Set(selected.map(id));
  const carried=[...(profile.characterInventories?.data?.[characterId]?.items||[]),...previous.filter(item=>buckets.has(item.bucketHash))].filter(item=>!selectedIds.has(id(item)));
  return {...profile,characterEquipment:{...profile.characterEquipment,data:{...profile.characterEquipment?.data,[characterId]:{items}}},characterInventories:{...profile.characterInventories,data:{...profile.characterInventories?.data,[characterId]:{items:carried}}}};
}
