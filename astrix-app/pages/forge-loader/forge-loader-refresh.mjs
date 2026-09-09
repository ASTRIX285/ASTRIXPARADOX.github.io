import {createPreparedPageRefreshController} from '../guardian-workspace-v2/guardian-session-cache.mjs?v=20260906-page-refresh-1';

export const FORGE_REFRESH_MS=60*1000;
export function forgeInventorySignature(payload){
  const profile=payload?.profile||{};
  return JSON.stringify([payload?.manifestVersion,payload?.forgeArmourIndex?.generatedAt,profile.profileInventory,profile.characterInventories,profile.characterEquipment,profile.characterLoadouts,profile.itemComponents?.instances,profile.itemComponents?.stats,profile.itemComponents?.sockets]);
}
export function startForgeBackgroundRefresh({session,refresh,onError=()=>{},eventTarget=globalThis,documentTarget=globalThis.document,...clock}={}){
  const controller=createPreparedPageRefreshController({session,page:'loadout',intervalMs:FORGE_REFRESH_MS,retryMs:15*1000,...clock,refresh:()=>refresh({reason:'poll'}),onError});
  const check=()=>{if(documentTarget?.visibilityState!=='hidden')void Promise.resolve(controller.check()).catch(()=>{});};
  const resume=()=>{controller.start();check();};
  eventTarget?.addEventListener?.('focus',check);
  eventTarget?.addEventListener?.('online',check);
  eventTarget?.addEventListener?.('pageshow',resume);
  eventTarget?.addEventListener?.('pagehide',()=>controller.stop());
  documentTarget?.addEventListener?.('visibilitychange',check);
  controller.start();
  return controller;
}

// The manual check updates Exotic ownership only. General inventory, set
// choices and solver state remain the responsibility of the automatic poll.
export function mergeExoticCheckCatalogue(current,next){
  return {...current,armour:[...(current.armour||[]).filter(item=>!item.isExotic),...(next.armour||[]).filter(item=>item.isExotic)]};
}

export function bindExoticCheckControl(button,check,{onError=()=>{}}={}){
  if(!button)return;
  button.hidden=false;button.disabled=false;button.textContent='Check for new Exotic';
  button.addEventListener('click',async()=>{
    if(button.disabled)return;
    button.disabled=true;button.setAttribute('aria-busy','true');button.textContent='Checking Exotics…';
    try{await check();}catch(error){onError(error);}
    finally{button.disabled=false;button.setAttribute('aria-busy','false');button.textContent='Check for new Exotic';}
  });
}
