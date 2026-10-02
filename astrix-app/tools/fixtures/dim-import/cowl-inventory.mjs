// Test inventory for the recorded "Mactics' Arc Assassins Cowl Hunter" share (cowl.json).
// Item hashes and plugs are Bungie's own (cowl-manifest.json). Instance IDs and stat
// values are test-only and never shown as real data.
import {readFile} from 'node:fs/promises';
const read=name=>readFile(new URL(`./${name}`,import.meta.url),'utf8').then(JSON.parse);
export const COWL_CHARACTER='2305843009300000001';
const BUCKET={helmet:3448274439,gauntlets:3551918588,chest:14239492,legs:20886954,classItem:1585787867,kinetic:1498876634,energy:2465295065,power:953998645};
// Weapons, Health, Class, Grenade, Super, Melee (Armor 3.0 stat hashes).
const STAT={weapons:2996146975,health:392767087,class:1943323491,grenade:1735777505,super:144602215,melee:4244567218};
const ARMOUR=[
  // [itemHash, bucket, location, test stats]
  [3400283633,'helmet','vault',{melee:30,class:20,health:10}],            // Assassin's Cowl
  [3721047650,'helmet','carried',{grenade:30,super:20,weapons:10}],       // Wormhusk Crown
  [656307180,'helmet','carried',{health:28,melee:22,class:12}],           // Prime Zealot Mask
  [2749457084,'gauntlets','vault',{melee:32,grenade:18,health:10}],       // Liar's Handshake
  [4105572261,'gauntlets','equipped',{grenade:26,class:20,weapons:14}],   // Prime Zealot Gloves
  [368733543,'chest','vault',{super:30,health:20,class:10}],              // Raiden Flux
  [2245093627,'chest','equipped',{health:30,melee:20,grenade:12}],        // Prime Zealot Cuirass
  [157934631,'legs','equipped',{class:24,weapons:20,super:14}],           // Prime Zealot Strides
  [157934631,'legs','vault',{class:30,melee:22,health:16}],               // Prime Zealot Strides, better roll
  [601809810,'classItem','equipped',{grenade:20,melee:20,super:10}]       // Shattered Vault Cloak
];
const WEAPONS=[[42435996,'kinetic'],[3824673936,'kinetic'],[738446555,'energy'],[3946054154,'energy'],[2155534128,'power'],[3489054606,'power']];
export async function cowlFixture(){
  const share=await read('cowl.json'),manifest=await read('cowl-manifest.json');
  const snapshot={version:manifest.version,tables:manifest.tables},items=manifest.tables.DestinyInventoryItemDefinition;
  const equipped=[],carried=[],vault=[],instances={},stats={},sockets={};
  let n=0;
  const add=(itemHash,bucket,where,values={})=>{
    const itemInstanceId=`69175290000000${String(++n).padStart(5,'0')}`,row={itemHash,itemInstanceId,bucketHash:BUCKET[bucket],quantity:1};
    ({equipped,carried,vault})[where].push(row);
    instances[itemInstanceId]={itemLevel:1,quality:0,isEquipped:where==='equipped',energy:{energyCapacity:10}};
    if(Object.keys(values).length)stats[itemInstanceId]={stats:Object.fromEntries(Object.values(STAT).map(hash=>[hash,{statHash:hash,value:0}]).map(([hash,row])=>[hash,{...row,value:values[Object.keys(STAT).find(key=>STAT[key]===hash)]||0}]))};
    sockets[itemInstanceId]={sockets:(items[itemHash]?.sockets?.socketEntries||[]).map(entry=>entry.singleInitialItemHash?{plugHash:entry.singleInitialItemHash,isEnabled:true,isVisible:true}:{isEnabled:true,isVisible:false})};
    return row;
  };
  for(const [hash,bucket,where,values] of ARMOUR)add(hash,bucket,where,values);
  for(const [index,[hash,bucket]] of WEAPONS.entries())add(hash,bucket,index%2?'vault':'equipped');
  const subclass=share.loadout.equipped[0];
  equipped.push({itemHash:subclass.hash,itemInstanceId:'6917529000000099999',bucketHash:3284755031,quantity:1});
  sockets['6917529000000099999']={sockets:Object.values(subclass.socketOverrides).map(plugHash=>({plugHash,isEnabled:true,isVisible:true}))};
  const profile={
    characters:{data:{[COWL_CHARACTER]:{characterId:COWL_CHARACTER,classType:1,light:2000}}},
    characterEquipment:{data:{[COWL_CHARACTER]:{items:equipped}}},
    characterInventories:{data:{[COWL_CHARACTER]:{items:carried}}},
    profileInventory:{data:{items:vault}},
    itemComponents:{instances:{data:instances},stats:{data:stats},sockets:{data:sockets},reusablePlugs:{data:{}}}
  };
  return {share,loadout:share.loadout,snapshot,profile,binding:{membershipId:'4611686018400000001',membershipType:'3'},characterId:COWL_CHARACTER};
}
