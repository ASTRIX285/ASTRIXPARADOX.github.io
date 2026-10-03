// Test inventory for the recorded "Consecration Titan PERFECTED" share (consecration.json,
// dim.gg/hnpxfxy). Item, plug, set and perk hashes are Bungie's own (consecration-manifest.json).
// Instance IDs, stat values, archetype rolls and the 11 energy capacity are test-only and never
// shown as real data. The four shared set pieces (Willbreaker's Watch and Resolve, Legacy's Oath
// Gauntlets and Greaves) are not owned; the Pantheos, Lustrous and Bulletsmith's pieces are what
// the old fit suggested, and the other Crota's Memory and Legacy's Oath pieces are in the Vault.
import {readFile} from 'node:fs/promises';
const read=name=>readFile(new URL(`./${name}`,import.meta.url),'utf8').then(JSON.parse);
export const CONSECRATION_CHARACTER='2305843009300000002';
export const CONSECRATION_SHARE='hnpxfxy';
export const CONSECRATION_LINK='https://dim.gg/hnpxfxy/Consecration-Titan-PERFECTED';
const BUCKET={helmet:3448274439,gauntlets:3551918588,chest:14239492,legs:20886954,classItem:1585787867,kinetic:1498876634,energy:2465295065,power:953998645,ghost:4023194814,vehicle:2025709351,ship:284967655,emblem:4274335291};
// Weapons, Health, Class, Grenade, Super, Melee (Armor 3.0 stat hashes).
const STAT={weapons:2996146975,health:392767087,class:1943323491,grenade:1735777505,super:144602215,melee:4244567218};
// Armour archetype plugs (Bungie's own, socket 6 of every Tier 5 armour piece).
const ARCHETYPE={brawler:3349393475,skirmisher:1687144140,paragon:4227065942,grenadier:2937665788,specialist:2230428468,gunner:1807652646,bulwark:549468645};
export const CONSECRATION_ARMOUR=[
  // [itemHash, bucket, location, test stats, test archetype]
  [2145853080,'helmet','equipped',{melee:30,super:20,grenade:12},'brawler'],      // Pantheos Resplendent Helm
  [2609656681,'gauntlets','equipped',{melee:30,super:18,grenade:14},'brawler'],   // Pantheos Resplendent Gauntlets
  [1774949103,'chest','equipped',{melee:28,super:20,grenade:12},'brawler'],       // Pantheos Resplendent Plate
  [2901598523,'legs','equipped',{melee:30,super:16,grenade:16},'brawler'],        // Pantheos Resplendent Greaves
  [266021826,'classItem','equipped',{class:30,melee:20,health:12},null],          // Stoicism (Exotic)
  [129329474,'helmet','vault',{super:30,health:20,melee:10},'paragon'],           // Legacy's Oath Helm
  [3046896869,'chest','vault',{health:30,melee:20,class:10},'bulwark'],           // Legacy's Oath Plate
  [1091402463,'gauntlets','vault',{melee:28,grenade:20,super:10},'brawler'],      // Willbreaker's Fists (Crota's Memory)
  [12652705,'legs','vault',{grenade:30,melee:18,class:12},'grenadier'],           // Willbreaker's Greaves (Crota's Memory)
  [3585698380,'helmet','carried',{weapons:30,melee:20,super:10},'gunner'],        // Lustrous Helm
  [2739996165,'gauntlets','carried',{grenade:28,melee:22,weapons:10},'grenadier'],// Lustrous Gauntlets
  [2901472731,'chest','vault',{class:30,melee:16,health:14},'specialist'],        // Lustrous Plate
  [2662868359,'legs','vault',{melee:24,super:20,health:16},'skirmisher'],         // Lustrous Greaves
  [2719710110,'helmet','vault',{weapons:30,health:20,melee:10},'gunner'],         // Bulletsmith's Ire Helm
  [1989682895,'gauntlets','vault',{melee:26,weapons:20,class:12},'brawler'],      // Bulletsmith's Ire Gauntlets
  [2530113265,'chest','vault',{weapons:28,melee:20,super:12},'gunner'],           // Bulletsmith's Ire Plate
  [2564183153,'legs','vault',{weapons:30,grenade:20,melee:10},'gunner']           // Bulletsmith's Ire Greaves
];
const OTHER=[[3371017761,'kinetic'],[4206550094,'energy'],[2466028274,'power'],[76764720,'ghost'],[3158812152,'vehicle'],[3403859120,'ship'],[1661191198,'emblem']];
export async function consecrationFixture(){
  const share=await read('consecration.json'),manifest=await read('consecration-manifest.json');
  const snapshot={version:manifest.version,tables:manifest.tables},items=manifest.tables.DestinyInventoryItemDefinition;
  const equipped=[],carried=[],vault=[],instances={},stats={},sockets={};
  let n=0;
  const add=(itemHash,bucket,where,values={},archetype=null)=>{
    const itemInstanceId=`69175290100000${String(++n).padStart(5,'0')}`,row={itemHash,itemInstanceId,bucketHash:BUCKET[bucket],quantity:1};
    ({equipped,carried,vault})[where].push(row);
    instances[itemInstanceId]={itemLevel:1,quality:0,isEquipped:where==='equipped',energy:{energyCapacity:11}};
    if(Object.keys(values).length)stats[itemInstanceId]={stats:Object.fromEntries(Object.entries(STAT).map(([key,hash])=>[hash,{statHash:hash,value:values[key]||0}]))};
    const entries=items[itemHash]?.sockets?.socketEntries||[];
    sockets[itemInstanceId]={sockets:entries.map((entry,index)=>{
      if(archetype&&index===6)return {plugHash:ARCHETYPE[archetype],isEnabled:true,isVisible:true};
      return entry.singleInitialItemHash?{plugHash:entry.singleInitialItemHash,isEnabled:true,isVisible:true}:{isEnabled:true,isVisible:false};
    })};
    return row;
  };
  for(const [hash,bucket,where,values,archetype] of CONSECRATION_ARMOUR)add(hash,bucket,where,values,archetype);
  for(const [hash,bucket] of OTHER)add(hash,bucket,'equipped');
  // The shared subclass, with the share's own plugs at the share's own socket indexes.
  const subclass=share.loadout.equipped.find(item=>item.socketOverrides),subclassId='6917529010000099999';
  equipped.push({itemHash:subclass.hash,itemInstanceId:subclassId,bucketHash:3284755031,quantity:1});
  const entries=items[subclass.hash]?.sockets?.socketEntries||[];
  sockets[subclassId]={sockets:entries.map((entry,index)=>{const hash=subclass.socketOverrides[index]||entry.singleInitialItemHash;return hash?{plugHash:hash,isEnabled:true,isVisible:true}:{isEnabled:true,isVisible:false};})};
  instances[subclassId]={itemLevel:1,quality:0,isEquipped:true};
  const profile={
    characters:{data:{[CONSECRATION_CHARACTER]:{characterId:CONSECRATION_CHARACTER,classType:0,light:2000,dateLastPlayed:'2026-10-01T00:00:00Z',emblemPath:'',emblemBackgroundPath:'',stats:{}}}},
    characterEquipment:{data:{[CONSECRATION_CHARACTER]:{items:equipped}}},
    characterInventories:{data:{[CONSECRATION_CHARACTER]:{items:carried}}},
    profileInventory:{data:{items:vault}},
    itemComponents:{instances:{data:instances},stats:{data:stats},sockets:{data:sockets},reusablePlugs:{data:{}}}
  };
  return {share,loadout:share.loadout,snapshot,profile,binding:{membershipId:'4611686018400000002',membershipType:'3'},characterId:CONSECRATION_CHARACTER};
}
