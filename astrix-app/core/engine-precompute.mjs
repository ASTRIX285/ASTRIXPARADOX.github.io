import {armourStatVector} from '../pages/vault/vault-armour-matcher.mjs?v=20260904-top-50-scan-1';
import {validateWeaponModel} from '../pages/guardian-workspace-v2/paradox-build-space/paradox-loadout-intelligence.mjs?perf=20260927-1';

// Worker-owned cache. The complete supplied inventory is the snapshot identity;
// no TTL and no reuse across manifest, account, character, socket or stat changes.
export function createEnginePrecomputer(){
  let key=null,value=null;
  return build=>{
    const weapons=[...(build.weapons||[]),...(build.ownedWeapons||[]),...(build.vaultWeapons||[]),...(build.inventoryWeapons||[])].filter(Boolean);
    const armour=[...(build.armour||[]),...(build.ownedArmour||[])].filter(Boolean);
    const next=JSON.stringify([build.manifestVersion||null,build.profileSnapshot||null,build.membershipType,build.membershipId,build.characterId,weapons,armour]);
    if(next===key)return value;
    const inventoryByHash=new Map(),weaponModels=new Map(),armourStats=new Map(),seen=new Set();
    for(const item of [...weapons,...armour]){
      const id=String(item.itemInstanceId||'');if(!id||seen.has(id))continue;seen.add(id);
      const hash=Number(item.itemHash??item.hash),rows=inventoryByHash.get(hash)||[];rows.push(item);inventoryByHash.set(hash,rows);
    }
    for(const item of weapons){const id=String(item.itemInstanceId||'');if(id&&!weaponModels.has(id))weaponModels.set(id,{model:item.weaponSemantics?.perkModel||item.weaponPerkModel||null,validation:validateWeaponModel({weapons:[item]})});}
    for(const item of armour){const id=String(item.itemInstanceId||'');if(id&&!armourStats.has(id))armourStats.set(id,armourStatVector(item));}
    key=next;value={inventoryByHash,weaponModels,armourStats};return value;
  };
}
