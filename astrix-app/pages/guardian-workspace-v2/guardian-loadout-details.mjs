import {openLoadoutDetails} from '../../shared/loadout-details.mjs?v=20260927-loadout-details-1';
import {resolveInGameLoadout,loadoutFingerprint} from '../../shared/loadout-details-model.mjs?v=20260927-loadout-details-1';
import {createLoadoutDetailsActions} from '../../shared/loadout-details-actions.mjs?v=20260927-loadout-details-1';
import {sessionBinding,liveActionCapabilities} from './guardian-live-actions.mjs?v=20260905-manual-editor-2&plain=20260925-2';
let current=null,opening=null;

function ensureStyle(){
  const id='apx-loadout-details-style';
  if(document.getElementById(id)?.sheet)return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const link=document.getElementById(id)||document.createElement('link');
    link.onload=()=>resolve();link.onerror=()=>{link.remove();reject(new Error('Loadout Details styles could not be loaded. Retry.'));};
    if(!link.id){link.id=id;link.rel='stylesheet';link.href=new URL('../../shared/loadout-details.css?v=20260927-loadout-details-1',import.meta.url).href;document.head.append(link);}
  });
}
async function shareLoadout(data){
  const file=new File([JSON.stringify(data,null,2)],'paradox-loadout.json',{type:'application/json'});
  if(navigator.canShare?.({files:[file]})){await navigator.share({title:data.name,files:[file]});return;}
  const url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download='paradox-loadout.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function openGuardianLoadoutDetails({characterId,index,getCharacterId,returnFocus}={}){
  if(opening)return opening;
  opening=(async()=>{
    await ensureStyle();
    if(String(getCharacterId())!==String(characterId))throw new Error('The Guardian changed. Reopen Loadout details.');
    current?.close();if(current)throw new Error('Finish the current loadout action first.');
    const payload=globalThis.FORGE_PAGE_PAYLOAD||{},session=globalThis.FORGE_BUNGIE_SESSION||{},binding=sessionBinding(session);
    const resolve=profile=>resolveInGameLoadout({profile,definitions:payload.definitions,manifestVersion:payload.manifestVersion||payload.prepared?.manifestVersion,manifest:payload.loadoutDetailsManifest||{},characterId,index,...binding});
    let model=resolve(payload.profile||{});
    const capabilities=liveActionCapabilities(session),acceptedFingerprints=new Set([model.fingerprint]);
    const getContext=()=>({profile:globalThis.FORGE_PAGE_PAYLOAD?.profile,session:globalThis.FORGE_BUNGIE_SESSION,characterId:getCharacterId(),manifestVersion:globalThis.FORGE_PAGE_PAYLOAD?.manifestVersion});
    const actions=createLoadoutDetailsActions(model,{getContext,resolve,
      save:async input=>(await import('./paradox-build-space/paradox-saved-loadouts.mjs?v=20260905-manual-editor-2&plain=20260925-2&refresh=20260927-1&limits=20260927-1&recovery=20260927-2')).saveParadoxLoadout(input),
      share:shareLoadout,
      refresh:detail=>document.dispatchEvent(new CustomEvent('forge:bungie-profile-refresh-requested',{detail}))
    });
    const updateIdentifiers=actions.identifiers;
    actions.identifiers=async values=>{model=await updateIdentifiers(values);acceptedFingerprints.add(model.fingerprint);return model;};
    const disabledReasons={};
    if(!['captureSnapshot','equipItems','verifyEquipment','verifyFinalState'].every(key=>capabilities[key]))disabledReasons.equip=disabledReasons.prepare='Apply is unavailable in this session.';
    if(!capabilities.updateLoadoutIdentifiers||!['names','icons','colors'].every(key=>model.identifierChoices[key].length))disabledReasons.identifiers='Loadout identifier choices are unavailable. Refresh the Character page.';
    if(!capabilities.clearLoadout)disabledReasons.clear='Clear slot is unavailable in this session.';
    const events=['forge:guardian-selection-changed','forge:guardian-loadout-context','forge:bungie-profile-loaded'];
    const check=()=>{
      const context=getContext(),active=sessionBinding(context.session);
      if(!context.session?.authenticated||active.membershipId!==binding.membershipId||active.membershipType!==binding.membershipType||String(context.characterId)!==String(characterId))current?.invalidate();
      else if(!acceptedFingerprints.has(loadoutFingerprint(context.profile?.characterLoadouts?.data?.[characterId]?.loadouts?.[index])))current?.invalidate('The saved slot changed. Close and reopen its details.');
    };
    current=openLoadoutDetails(model,{actions,disabledReasons,returnFocus,onClose:()=>{events.forEach(event=>document.removeEventListener(event,check));globalThis.removeEventListener('forge:bungie-session',check);current=null;}});
    events.forEach(event=>document.addEventListener(event,check));globalThis.addEventListener('forge:bungie-session',check);
    return current;
  })().finally(()=>{opening=null;});
  return opening;
}
