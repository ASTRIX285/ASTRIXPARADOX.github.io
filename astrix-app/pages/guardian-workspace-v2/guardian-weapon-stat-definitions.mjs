// Shared by the weapon hover card and detail drawer.
// Verified against Bungie's DestinyStatDefinition and weapon StatGroup tables:
// manifest 244213.26.06.29.2000-1-bnet.65864, retrieved 2026-09-08.
// Each card renders only the stats present on that weapon instance.
import {paradoxDefinitionId} from '../../core/bungie-item-identity.mjs';

const WEAPON_STATS=Object.freeze([
  [4043523819,'Impact'],
  [3614673599,'Blast Radius'],
  [1240592695,'Range'],
  [2523465841,'Velocity'],
  [1591432999,'Accuracy'],
  [155624089,'Stability'],
  [943549884,'Handling'],
  [4188031367,'Reload Speed'],
  [1345609583,'Aim Assistance'],
  [3555269338,'Zoom'],
  [2714457168,'Airborne Effectiveness'],
  [1931675084,'Ammo Generation'],
  [2837207746,'Swing Speed'],
  [209426660,'Guard Resistance'],
  [3736848092,'Guard Endurance'],
  [1842278586,'Shield Duration'],
  [3022301683,'Charge Rate'],
  [3085395333,'Persistence'],
  [3481294762,'Heat Generated'],
  [4006394725,'Cooling Efficiency'],
  [4284893193,'Rounds Per Minute'],
  [2961396640,'Charge Time'],
  [447667954,'Draw Time'],
  [3871231066,'Magazine'],
  [925767036,'Ammo Capacity'],
  [2715839340,'Recoil Direction']
].map(row=>Object.freeze(row)));

function weaponStatRows(stats={}){
  return WEAPON_STATS.flatMap(([hash,name])=>{
    const row=stats?.[hash],raw=row&&typeof row==='object'?row.value:row;
    if(raw===null||raw===undefined||raw===''||typeof raw==='boolean')return [];
    const value=Number(raw);
    return Number.isFinite(value)?[{hash,name,value,paradoxId:paradoxDefinitionId('DestinyStatDefinition',hash)}]:[];
  });
}

export {WEAPON_STATS,weaponStatRows};
