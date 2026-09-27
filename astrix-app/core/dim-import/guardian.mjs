import {SUBCLASS_BUCKET} from '../../pages/guardian-workspace-v2/guardian-perk-change-plan.mjs';
const valid=value=>Number.isInteger(value)&&value>=0&&value<3;
export function matchDimGuardian(loadout,snapshot,profile,preferredCharacterId=''){
  const definitions=snapshot.tables.DestinyInventoryItemDefinition||{},classes=new Set();
  if(valid(loadout.classType))classes.add(loadout.classType);
  for(const item of loadout.equipped||[]){
    const definition=definitions[item.hash];
    if(valid(definition?.classType))classes.add(definition.classType);
    if(definition?.inventory?.bucketTypeHash===SUBCLASS_BUCKET)for(const hash of Object.values(item.socketOverrides||{})){
      const plug=definitions[hash];if(valid(plug?.classType))classes.add(plug.classType);
    }
  }
  const anchor=definitions[loadout.parameters?.exoticArmorHash];if(valid(anchor?.classType))classes.add(anchor.classType);
  if(classes.size!==1)throw new Error(classes.size?'The shared class and equipment disagree. Check the DIM loadout.':'This share does not identify a Guardian class. Include its subclass in DIM.');
  const [classType]=classes;
  const matches=Object.entries(profile?.characters?.data||{}).filter(([,row])=>Number(row.classType)===classType).map(([id])=>id).sort();
  if(!matches.length)throw new Error(`No ${['Titan','Hunter','Warlock'][classType]} was found in your account. Refresh your Guardian data and try again.`);
  const characterId=matches.includes(String(preferredCharacterId))?String(preferredCharacterId):matches[0];
  return {classType,characterId};
}
