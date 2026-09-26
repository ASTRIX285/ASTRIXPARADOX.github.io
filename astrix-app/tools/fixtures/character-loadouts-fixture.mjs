import {LOADOUT_DEFINITIONS} from '../../pages/guardian-workspace-v2/guardian-loadout-definitions.mjs';
const nameHashes=Object.keys(LOADOUT_DEFINITIONS.names).map(Number),iconHashes=Object.keys(LOADOUT_DEFINITIONS.icons).map(Number),colorHashes=Object.keys(LOADOUT_DEFINITIONS.colors).map(Number);
const weaponBuckets=[1498876634,2465295065,953998645],armourBuckets=[3448274439,3551918588,14239492,20886954,1585787867];
const gear=start=>Array.from({length:8},(_,index)=>({itemInstanceId:String(start+index),itemHash:100+index,bucketHash:index<3?weaponBuckets[index]:armourBuckets[index-3],location:1}));
const plug=(hash,name,socketIndex)=>({hash,name,socketIndex,icon:'/common/destiny2_content/icons/fixture.png',definition:{displayProperties:{name,icon:'/common/destiny2_content/icons/fixture.png'}}});
export function characterLoadoutsFixture(){
  const equipped=gear(1000),ready=gear(2000),other=gear(3000),subclass={itemInstanceId:'2099',itemHash:199,bucketHash:3284755031,location:1};
  const plugHashes=ready.map((_,index)=>[9000+index*10,9001+index*10]);plugHashes[7].push(99999);
  const loadout=(items,index,withSockets=false)=>({nameHash:nameHashes[index],iconHash:iconHashes[index%iconHashes.length],colorHash:colorHashes[index%colorHashes.length],items:items.map(({itemInstanceId},itemIndex)=>({itemInstanceId,plugItemHashes:withSockets?plugHashes[itemIndex]||[]:[]})),subclassOverrides:withSockets?[{itemInstanceId:subclass.itemInstanceId,plugItemHashes:[9800,9801,9802,9803,9804,9805,9806]}]:[]});
  const loadouts=[loadout(equipped,0),loadout(ready,1,true),loadout([...equipped.slice(0,6),other[0],{itemInstanceId:'9999'}],2),null];
  const definitions=Object.fromEntries([...equipped,...ready,subclass].map((row,index)=>[row.itemHash,{itemType:index===16?16:index%8<3?3:2,displayProperties:{name:index===16?'Fixture subclass':`Fixture gear ${index%8+1}`,icon:'/common/destiny2_content/icons/fixture.png'},inventory:{bucketTypeHash:row.bucketHash}}]));
  const detailItem=(item,index,kind)=>{
    const sockets=plugHashes[index].slice(0,2).map((hash,socketIndex)=>plug(hash,`${kind==='weapon'?'Saved perk':'Saved mod'} ${index+1}.${socketIndex+1}`,socketIndex));
    if(kind==='weapon')return {...item,name:`Fixture weapon ${index+1}`,icon:'/common/destiny2_content/icons/fixture.png',intrinsic:sockets[0],selectedPerks:[sockets[1]],weaponSemantics:{modSockets:[]}};
    return {...item,name:`Fixture armour ${index-2}`,icon:'/common/destiny2_content/icons/fixture.png',armourSemantics:{masterwork:sockets[0],generalMods:[sockets[1]],slotMods:[],archetype:index===3?sockets[0]:null,unknownPlugs:[]},appearancePlugs:[]};
  };
  const subclassPlugs=[plug(9800,'Saved super',0),plug(9801,'Saved class ability',1),plug(9802,'Saved movement',2),plug(9803,'Saved melee',3),plug(9804,'Saved grenade',4),plug(9805,'Saved aspect',5),plug(9806,'Saved fragment',6)];
  const detail={source:'bungie-live',loadoutSource:'bungie-live',loadoutActionIntent:'view-bungie-details',characterId:'1',selectedLoadoutIndex:1,subclassItemInstanceId:subclass.itemInstanceId,subclassItem:{...subclass,name:'Fixture subclass',icon:'/common/destiny2_content/icons/fixture.png'},subclassName:'Fixture subclass',subclassIcon:'/common/destiny2_content/icons/fixture.png',super:subclassPlugs[0],abilities:subclassPlugs.slice(1,5),aspects:[subclassPlugs[5]],fragments:[subclassPlugs[6]],weapons:ready.slice(0,3).map((item,index)=>detailItem(item,index,'weapon')),armour:ready.slice(3).map((item,index)=>detailItem(item,index+3,'armour'))};
  const profile={characterEquipment:{data:{'1':{items:equipped},'2':{items:other}}},characterInventories:{data:{'1':{items:[...ready.slice(0,4),subclass]},'2':{items:[]}}},profileInventory:{data:{items:ready.slice(4).map(row=>({...row,location:2}))}},characterLoadouts:{data:{'1':{loadouts}}}};
  return {profile,definitions,loadouts,detail,identifierChoices:{nameHash:nameHashes[2],iconHash:iconHashes[2],colorHash:colorHashes[2]},names:loadouts.map(row=>row?LOADOUT_DEFINITIONS.names[row.nameHash].name:'')};
}
