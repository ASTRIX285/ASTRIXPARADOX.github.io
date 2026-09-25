import {LOADOUT_DEFINITIONS} from '../../pages/guardian-workspace-v2/guardian-loadout-definitions.mjs';
const names=Object.keys(LOADOUT_DEFINITIONS.names),iconHash=Number(Object.keys(LOADOUT_DEFINITIONS.icons)[0]),colorHash=Number(Object.keys(LOADOUT_DEFINITIONS.colors)[0]);
const gear=(start)=>Array.from({length:8},(_,i)=>({itemInstanceId:String(start+i),itemHash:100+i,bucketHash:200+i,location:1}));
export function characterLoadoutsFixture(){
 const equipped=gear(1000),ready=gear(2000),other=gear(3000);
 const loadout=(items,index)=>({nameHash:Number(names[index]),iconHash,colorHash,items:items.map(({itemInstanceId})=>({itemInstanceId,plugItemHashes:[]}))});
 const loadouts=[loadout(equipped,0),loadout(ready,1),loadout([...equipped.slice(0,6),other[0],{itemInstanceId:'9999'}],2),null];
 const definitions=Object.fromEntries(equipped.map((row,i)=>[row.itemHash,{itemType:i<3?3:2,displayProperties:{name:`Fixture gear ${i+1}`,icon:'/common/destiny2_content/icons/fixture.png'},inventory:{bucketTypeHash:row.bucketHash}}]));
 const profile={characterEquipment:{data:{'1':{items:equipped},'2':{items:other}}},characterInventories:{data:{'1':{items:ready.slice(0,4)},'2':{items:[]}}},profileInventory:{data:{items:ready.slice(4).map(row=>({...row,location:2}))}},characterLoadouts:{data:{'1':{loadouts}}}};
 return {profile,definitions,loadouts,names:loadouts.map(row=>row?LOADOUT_DEFINITIONS.names[row.nameHash].name:'')};
}
