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
