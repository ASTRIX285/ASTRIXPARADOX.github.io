import {createPreparedPageRefreshController} from '../guardian-workspace-v2/guardian-session-cache.mjs?v=20260913-live-character-2&plain=20260925-2&refresh=20260927-1&recovery=20260927-3';

export const FORGE_REFRESH_MS=5*60*1000;
export function forgeInventorySignature(payload){
  const profile=payload?.profile||{};
  return JSON.stringify([payload?.pageReady?.manifestVersion||payload?.manifestVersion,payload?.pageReady?.coverage,payload?.definitionCoverage,payload?.weaponDefinitionCoverage,payload?.subclassCatalogCoverage,payload?.artifactCoverage,payload?.artifactCatalogCoverage,payload?.forgeArmourIndexCoverage,payload?.loadoutCoverage,payload?.forgeArmourIndex?.generatedAt,profile.profileInventory,profile.characterInventories,profile.characterEquipment,profile.characterLoadouts,profile.itemComponents?.instances,profile.itemComponents?.stats,profile.itemComponents?.sockets]);
}
export function startForgeBackgroundRefresh({session,refresh,onError=()=>{},eventTarget=globalThis,documentTarget=globalThis.document,...clock}={}){
  const controller=createPreparedPageRefreshController({session,page:'loadout',intervalMs:FORGE_REFRESH_MS,retryMs:15*1000,...clock,eventTarget,documentTarget,refresh:()=>refresh({reason:'poll'}),onError});
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
