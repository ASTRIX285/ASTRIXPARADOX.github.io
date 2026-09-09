import {inventoryLocations,sessionBinding,stageLiveTransferPreflight,confirmLiveTransferPlan,executeLiveTransferPlan} from './guardian-live-actions.mjs?roll=20260909-apply-1';
import {weaponStatBreakdown,weaponStatMarkup} from './guardian-weapon-stat-model.mjs';
import {GuardianManifestService} from './guardian-manifest-service.mjs?v=20260906-all-page-data-1&roll=20260909-apply-1';

// The page singleton is deliberately backend-only. This deferred reader uses
// the same manifest service/cache, but only asks for the small stat group table.
const weaponStatManifest=new GuardianManifestService({backend:false});
export function loadWeaponStatGroup(hash,service=weaponStatManifest){return service.getAsync('DestinyStatGroupDefinition',hash);}

export function weaponPerkPlan(item,choices,{session,payload}={}){
  const id=String(item.itemInstanceId||''),location=inventoryLocations(payload).locations.get(id);
  if(!location||!['equipped','carried'].includes(location.source.kind))throw new Error('Open this weapon on its current Guardian before applying perks.');
  if(location.itemHash!==Number(item.itemHash??item.hash))throw new Error('The weapon identity changed. Refresh its card.');
  const socketChanges=Object.entries(choices).map(([index,plug])=>({itemInstanceId:id,itemHash:location.itemHash,itemName:item.name,socketIndex:Number(index),socketArrayType:0,plugHash:Number(plug.bungieHash??plug.hash),plugName:plug.name,component:'weapon-perk'}));
  if(!socketChanges.length)throw new Error('Select a different perk first.');
  return {schemaVersion:1,kind:'weapon-perk-only',status:'staged',ready:true,blockers:[],...sessionBinding(session),characterId:location.source.characterId,
    equipment:{targets:[{itemInstanceId:id,itemHash:location.itemHash,bucketHash:location.bucketHash,name:item.name,kind:'weapon',isExotic:item.isExotic===true}]},socketChanges,
    phases:[{required:true,capability:'insertSocketPlugFree',label:'Weapon perk Apply'},{required:true,capability:'verifyFinalState',label:'Weapon perk verification'}]};
}

export function bindWeaponSelection(root,item){
  if(!root||!item?.itemInstanceId)return;
  root._weaponSelectionDispose?.();
  item={...item,definition:{...item.definition}};
  const choices={},columns=item.weaponSemantics?.perkModel?.columns||[];
  let busy=false,disposed=false,confirmed=false;
  const footer=document.createElement('div');footer.className='weapon-apply-footer';footer.hidden=true;
  footer.innerHTML='<p role="status" aria-live="polite"></p><button type="button">APPLY</button>';
  root.append(footer);
  const button=footer.querySelector('button'),status=footer.querySelector('p');
  function update(){
    root.querySelectorAll('.weapon-perk-cell[data-socket-index]').forEach(node=>{
      const index=Number(node.dataset.socketIndex),column=columns.find(value=>Number(value.socketIndex)===index);
      const hash=Number(node.dataset.bungieHash),option=column?.options?.find(value=>Number(value.bungieHash??value.hash)===hash);
      const equipped=Number(column?.selectedPlugHash),selected=Number(choices[index]?.bungieHash??choices[index]?.hash??equipped);
      const permitted=option?.canInsert===true&&option?.enabled!==false&&option?.isEnabled!==false;
      node.dataset.perkSelectable=permitted?'true':'false';
      node.dataset.perkState=confirmed?(hash===selected?'Equipped':'Available option'):hash===selected&&selected!==equipped?'Selected preview':hash===equipped?'Equipped':'Available option';
      node.setAttribute('aria-pressed',String(hash===selected));
      node.setAttribute('aria-disabled',String(!permitted&&hash!==equipped));
      node.classList.toggle('is-selected',hash===selected);
      node.classList.toggle('is-pending',!confirmed&&hash===selected&&selected!==equipped);
    });
    footer.hidden=!Object.keys(choices).length;
    button.disabled=busy;
    const stats=root.querySelector('.weapon-stats');
    if(stats)stats.innerHTML=weaponStatMarkup(weaponStatBreakdown(item,choices));
  }
  const select=event=>{
    const node=event.target.closest?.('.weapon-perk-cell[data-socket-index]');
    if(!node||busy)return;
    const index=Number(node.dataset.socketIndex),hash=Number(node.dataset.bungieHash),column=columns.find(value=>Number(value.socketIndex)===index);
    const option=column?.options?.find(value=>Number(value.bungieHash??value.hash)===hash);
    if(hash===Number(column?.selectedPlugHash))delete choices[index];
    else if(option?.canInsert===true&&option?.enabled!==false&&option?.isEnabled!==false)choices[index]=option;
    else return;
    status.textContent='Perk preview. APPLY changes this weapon in game.';update();
  };
  root.addEventListener('forge:perk-activate',select);
  button.addEventListener('click',async event=>{
    event.stopPropagation();if(busy)return;busy=true;button.disabled=true;
    try{
      const session=globalThis.FORGE_BUNGIE_SESSION;
      const plan=weaponPerkPlan(item,choices,{session,payload:globalThis.FORGE_PAGE_PAYLOAD});
      status.textContent='Checking this weapon with Bungie…';
      const staged=await stageLiveTransferPreflight(plan,{session});
      const result=await executeLiveTransferPlan(confirmLiveTransferPlan(staged),{session,onProgress:row=>{status.textContent=row.label;}});
      if(result.status!=='applied')throw new Error('Bungie did not confirm every selected perk. Refreshing the weapon to show its actual state.');
      confirmed=true;update();
      status.textContent='Applied and verified with Bungie.';
      button.hidden=true;
      root.querySelectorAll('[data-perk-selectable]').forEach(node=>{node.dataset.perkSelectable='false';});
      // Keep this snapshot immutable. The normal profile refresh supplies the new roll.
    }catch(error){status.textContent=error.message;button.disabled=false;busy=false;}
    finally{document.dispatchEvent(new CustomEvent('forge:bungie-profile-refresh-requested',{detail:{reason:'weapon-perks'}}));}
  });
  root._weaponSelectionDispose=()=>{disposed=true;root.removeEventListener('forge:perk-activate',select);footer.remove();};
  update();
  // The prepared profile gate deliberately forbids network hydration. Resolve
  // this small shared table only after the card exists, using the manifest cache.
  const groupHash=Number(item.definition.stats?.statGroupHash);
  if(!item.definition.resolvedStatGroup&&groupHash)void loadWeaponStatGroup(groupHash).then(group=>{
    if(group&&!disposed){item.definition.resolvedStatGroup=group;update();}
  }).catch(()=>{});
}
