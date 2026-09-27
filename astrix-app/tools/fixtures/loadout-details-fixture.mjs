// Deliberately synthetic, offline test content. Never loaded by production pages.
import {WEAPON_BUCKETS,ARMOUR_BUCKETS,SUBCLASS_BUCKET} from '../../pages/guardian-workspace-v2/guardian-perk-change-plan.mjs';
import {LOADOUT_DEFINITIONS} from '../../pages/guardian-workspace-v2/guardian-loadout-definitions.mjs';
export function loadoutDetailsFixture(){
  const version='fixture-loadout-details-v1',definitions={};
  const names=Object.entries(LOADOUT_DEFINITIONS.names).slice(0,2),icons=Object.entries(LOADOUT_DEFINITIONS.icons).slice(0,2),colors=Object.entries(LOADOUT_DEFINITIONS.colors).slice(0,2);
  const icon=icons[0][1].iconImagePath;
  const makePlug=(hash,name,category,stats=[])=>{definitions[hash]={hash,displayProperties:{name,icon,description:`Offline fixture: ${name}`},plug:{plugCategoryIdentifier:category},investmentStats:stats};return hash;};
  const weaponPlugs=[makePlug(101,'Fixture selected barrel','barrels'),makePlug(102,'Fixture weapon mod','weapon.mods')];
  const armourPlugs=[makePlug(201,'Fixture general armour mod','armor.mods.general',[{statTypeHash:2996146975,value:5}]),makePlug(202,'Fixture shader','shader'),makePlug(203,'Fixture armour archetype','armor.archetype')];
  const subclassPlugs=[makePlug(301,'Fixture Super','titan.void.supers'),makePlug(302,'Fixture grenade','titan.void.grenades'),makePlug(303,'Fixture melee','titan.void.melee'),makePlug(304,'Fixture class ability','titan.void.class_abilities'),makePlug(305,'Fixture movement','titan.void.movement'),makePlug(306,'Fixture Aspect','titan.void.aspects'),makePlug(307,'Fixture Fragment','titan.void.fragments')];
  const equipment=[...WEAPON_BUCKETS,...ARMOUR_BUCKETS,SUBCLASS_BUCKET].map((bucketHash,i)=>{
    const itemHash=10000+i,itemInstanceId=String(100000+i),kind=i<3?'weapon':i<8?'armour':'subclass';
    const plugs=kind==='weapon'?weaponPlugs:kind==='armour'?armourPlugs:subclassPlugs;
    definitions[itemHash]={hash:itemHash,itemType:i<3?3:2,classType:0,inventory:{bucketTypeHash:bucketHash,tierType:5},displayProperties:{name:`Fixture ${kind} ${i+1}`,icon},sockets:{socketEntries:plugs.map(()=>({defaultVisible:true,socketTypeHash:401})),socketCategories:[{socketCategoryHash:402,socketIndexes:plugs.map((_,j)=>j)}]}};
    return {itemInstanceId,itemHash,bucketHash};
  });
  const savedItems=equipment.map((item,i)=>({itemInstanceId:item.itemInstanceId,plugItemHashes:i<3?[...weaponPlugs]:i<8?[...armourPlugs]:[...subclassPlugs]}));
  const loadout={nameHash:Number(names[0][0]),iconHash:Number(icons[0][0]),colorHash:Number(colors[0][0]),items:savedItems};
  const profile={characters:{data:{'1':{classType:0}}},characterActivities:{data:{'1':{currentActivityHash:0}}},characterEquipment:{data:{'1':{items:equipment}}},characterInventories:{data:{'1':{items:[]}}},profileInventory:{data:{items:[]}},characterLoadouts:{data:{'1':{loadouts:[loadout]}}},itemComponents:{sockets:{data:Object.fromEntries(savedItems.map(item=>[item.itemInstanceId,{sockets:item.plugItemHashes.map(plugHash=>({plugHash}))}]))},reusablePlugs:{data:{}}}};
  const manifest={manifestVersion:version,tables:{DestinyLoadoutNameDefinition:Object.fromEntries(names),DestinyLoadoutIconDefinition:Object.fromEntries(icons),DestinyLoadoutColorDefinition:Object.fromEntries(colors),DestinySocketCategoryDefinition:{402:{hash:402,displayProperties:{name:'Fixture sockets'}}},DestinySocketTypeDefinition:{401:{hash:401}},DestinyStatDefinition:{2996146975:{hash:2996146975,displayProperties:{name:'Weapons'}}}}};
  const session={authenticated:true,csrfToken:'fixture-only-not-a-secret',activeDestinyMembership:{membershipId:'123',membershipType:3},capabilities:{destinyActions:Object.fromEntries(['captureSnapshot','transferItems','equipItems','verifyEquipment','insertSocketPlugFree','verifyFinalState','updateLoadoutIdentifiers','clearLoadout'].map(key=>[key,true]))}};
  return {profile,definitions,manifest,manifestVersion:version,characterId:'1',membershipId:'123',membershipType:'3',index:0,session};
}
