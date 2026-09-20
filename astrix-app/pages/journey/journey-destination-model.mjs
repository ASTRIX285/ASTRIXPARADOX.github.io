const DESTINATION_NAME_ALIASES=Object.freeze({
  kepler:['Kepler'],
  'lawless-frontier':['Lawless Frontier','The Lawless Frontier'],
  'pale-heart':['Pale Heart','The Pale Heart'],
  'dreaming-city':['Dreaming City','The Dreaming City'],
  neomuna:['Neomuna'],europa:['Europa'],'throne-world':['Throne World',"Savathûn's Throne World","Savathun's Throne World"],
  nessus:['Nessus','Arcadian Valley'],edz:['EDZ','European Dead Zone'],moon:['Moon','The Moon'],cosmodrome:['Cosmodrome','The Cosmodrome']
});
const destinationNameKey=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function destinationNameMatches(key,value){
  const names=DESTINATION_NAME_ALIASES[key]||[globalThis.ForgeDestinations?.labelOf(key)||key];
  return names.some(name=>destinationNameKey(name)===destinationNameKey(value));
}

// Official Bungie manifest 244213.26.06.29.2000-1-bnet.65864.
// Lawless Frontier is an activity type, not a planet/destination alias.
export const KEPLER_DESTINATION_HASH=4076196532;
export const LAWLESS_FRONTIER_ACTIVITY_TYPE_HASH=2292427391;

export function destinationActivityMatches(key,activity,destination){
  if(!activity||activity.redacted)return false;
  if(key==='lawless-frontier')return Number(activity.activityTypeHash)===LAWLESS_FRONTIER_ACTIVITY_TYPE_HASH;
  if(key==='kepler')return Number(activity.destinationHash)===KEPLER_DESTINATION_HASH;
  return destinationNameMatches(key,destination?.displayProperties?.name);
}

export function destinationObjectiveMatches(key,objective,objectiveDefinition,activity,destinations={}){
  if(objective?.visible===false)return false;
  // A shared host destination alone cannot establish Lawless Frontier membership.
  if(key==='lawless-frontier')return destinationActivityMatches(key,activity);
  const hash=objective?.destinationHash||objectiveDefinition?.destinationHash;
  if(key==='kepler'&&Number(hash)===KEPLER_DESTINATION_HASH)return true;
  return destinationNameMatches(key,destinations[String(hash)]?.displayProperties?.name)
    ||destinationActivityMatches(key,activity,destinations[String(activity?.destinationHash)]);
}

// Bungie's Region Chests checklist, from the same pinned manifest as the maps.
export const REGION_CHEST_CHECKLIST_HASH=1697465175;

export function resolveRegionChestProgress({key,checklists={},profileStates={},characterStates={},activities={},locations={},destinations={}}){
  const definitions=Object.entries(checklists).filter(([,definition])=>/region chests?/i.test(`${definition?.displayProperties?.name||''} ${definition?.viewActionString||''}`));
  if(!definitions.length)return null;
  const chests=[];
  const seen=new Set();
  for(const [checklistHash,definition] of definitions){
    for(const entry of definition.entries||[]){
      const location=locations[String(entry.locationHash)];
      const releases=location?.locationReleases||[];
      const activity=activities[String(entry.activityHash)];
      const destination=[destinations[String(entry.destinationHash)],destinations[String(activity?.destinationHash)],...releases.map(release=>destinations[String(release.destinationHash)])]
        .find(row=>destinationNameMatches(key,row?.displayProperties?.name));
      if(!destination)continue;
      const id=`${checklistHash}-${entry.hash}`;
      if(seen.has(id))continue;
      seen.add(id);
      const release=releases.find(row=>String(row.destinationHash)===String(destination.hash));
      const bubble=(destination.bubbles||[]).find(row=>String(row.hash)===String(entry.bubbleHash));
      // Public region-chest locations often contain neither a name nor coordinates.
      // A verified destination is still sufficient to display the checklist entry.
      const place=[bubble?.displayProperties?.name,release?.displayProperties?.name,location?.displayProperties?.name,entry.displayProperties?.description,activity?.displayProperties?.name,destination.displayProperties.name]
        .map(value=>String(value||'').trim()).find(Boolean);
      const scope=entry.scope??definition.scope;
      const states=scope===0?profileStates:scope===1?characterStates:{};
      const state=states[checklistHash]?.[String(entry.hash)];
      chests.push({id,hash:entry.hash,checklistHash:Number(checklistHash),name:String(entry.displayProperties?.name||'Region chest').trim(),location:place,collected:typeof state==='boolean'?state:null});
    }
  }
  if(!chests.length)return null;
  return {key,total:chests.length,discovered:chests.filter(chest=>chest.collected===true).length,missing:chests.filter(chest=>chest.collected===false).length,unknown:chests.filter(chest=>chest.collected===null).length,chests};
}
