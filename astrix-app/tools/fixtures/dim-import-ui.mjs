// Isolated browser regression fixture. All action I/O is synthetic; no account
// credentials, live mutations, or account storage are used by this page.
import {loadoutDetailsFixture} from './loadout-details-fixture.mjs';
import {resolveDimLoadout} from '../../core/dim-import/resolve.mjs';
import {createDimActions} from '../../core/dim-import/actions.mjs';
import {watchDimContext} from '../../core/dim-import/context.mjs';
import {openLoadoutDetails} from '../../shared/loadout-details.mjs';
const assert=(value,message)=>{if(!value)throw new Error(message);};
const settle=()=>new Promise(resolve=>setTimeout(resolve,30));
const f=loadoutDetailsFixture(),context={session:f.session,profile:f.profile,characterId:'1',manifestVersion:f.manifestVersion};
const loadout={name:'Offline button test',classType:0,equipped:f.profile.characterEquipment.data['1'].items.map(item=>({hash:item.itemHash,socketOverrides:{}})),unequipped:[],parameters:{}};
const model=resolveDimLoadout(loadout,{snapshot:{version:f.manifestVersion,tables:{...f.manifest.tables,DestinyInventoryItemDefinition:f.definitions}},profile:f.profile,binding:{membershipId:'123',membershipType:'3',characterId:'1'}});
const events=[];
const actions=createDimActions(model,{getContext:()=>context,save:value=>events.push(['save',value]),send:value=>events.push(['forge',value]),deps:{
  requestFreshProfile:async()=>({profile:f.profile}),createLiveTransferPlan:()=>({ready:true,equipment:{targets:[]},socketChanges:[],inGameSteps:[]}),
  stageLiveTransferPreflight:async plan=>plan,confirmLiveTransferPlan:plan=>plan,executeLiveTransferPlan:async()=>{events.push(['apply']);return {status:'applied'};}
}});
const handle=openLoadoutDetails(model,{presentation:'icons',actions,actionRows:[['forge','Send to Build Forge'],['save','Save as PARADOX loadout'],['equip','Equip']]});
const dispose=watchDimContext({document,window,getModel:()=>model,getContext:()=>context,onCharacter:id=>{context.characterId=id;},invalidate:message=>handle.invalidate(message)});
try{
  for(let i=0;i<10;i++){
    document.dispatchEvent(new CustomEvent('forge:guardian-loadout-context',{detail:{characterId:'1'}}));
    window.dispatchEvent(new CustomEvent('forge:bungie-session'));
  }
  assert([...handle.dialog.querySelectorAll('[data-ld-action]')].every(button=>!button.disabled),'Same-Guardian refresh disabled actions');
  handle.dialog.querySelector('[data-ld-action="forge"]').click();await settle();
  assert(events[0]?.[0]==='forge','Send to Build Forge did not run');
  handle.dialog.querySelector('[data-ld-action="save"]').click();
  handle.dialog.querySelector('[data-ld-save]').requestSubmit();await settle();
  assert(events[1]?.[0]==='save','Save did not run');
  handle.dialog.querySelector('[data-ld-action="equip"]').click();await settle();
  assert(events.length===2,'Equip changed items before confirmation');
  assert(!handle.dialog.querySelector('[data-ld-confirm-apply]').disabled,'Review was not ready');
  handle.dialog.querySelector('[data-ld-confirm-apply]').click();await settle();
  assert(events[2]?.[0]==='apply','Confirm Apply did not run');
  const tile=handle.dialog.querySelector('[data-icon-name]');tile.focus();
  const tip=handle.dialog.querySelector('[role=tooltip]');
  assert(!tip.hidden&&tip.textContent.includes(tile.dataset.iconName),'Keyboard focus did not reveal the item name');
  tile.click();assert(!tip.hidden,'Tap did not reveal the item name');
  tile.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  assert(tip.hidden&&handle.dialog.open,'Escape must close the tooltip before the dialog');
  document.dispatchEvent(new CustomEvent('forge:character-selected',{detail:{characterId:'2'}}));
  assert([...handle.dialog.querySelectorAll('[data-ld-action]')].every(button=>button.disabled),'Guardian change did not invalidate actions');
  document.body.dataset.testResult='PASS';
}catch(error){document.body.dataset.testResult='FAIL';document.body.dataset.testError=error.message;throw error;}
finally{dispose();handle.close();}
const [share,snapshot]=await Promise.all(['fixtureb','manifest'].map(name=>fetch(new URL(`./dim-import/${name}.json`,import.meta.url)).then(response=>response.json())));
const visual=resolveDimLoadout(share.loadout,{snapshot});visual.name='Imported loadout';
openLoadoutDetails(visual,{presentation:'icons',actions:{forge:()=>{},save:()=>{},equip:async()=>({ready:false,blockers:['Offline preview. No live equipment changes.']})},actionRows:[['forge','Send to Build Forge'],['save','Save as PARADOX loadout'],['equip','Equip']]});
