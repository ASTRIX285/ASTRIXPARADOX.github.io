import {loadoutFingerprint,loadoutWorkingBuild,loadoutShareDocument} from './loadout-details-model.mjs?v=20260927-loadout-details-1&grid=20261001-1';
import {createLiveTransferPlan} from '../pages/guardian-workspace-v2/guardian-perk-change-plan.mjs';
import {sessionBinding,liveActionCapabilities,requestFreshProfile,stageLiveTransferPreflight,confirmLiveTransferPlan,executeLiveTransferPlan,stageBungieLoadoutAction,confirmBungieLoadoutAction,executeBungieLoadoutAction} from '../pages/guardian-workspace-v2/guardian-live-actions.mjs?v=20260905-manual-editor-2&plain=20260925-2&stack=20261002-1';

/** Source-specific controller. Preparation is read-only; Apply requires the exact
 * prepared plan object returned by this controller and a separate confirmation. */
export function createLoadoutDetailsActions(initialModel,{getContext,resolve,save,share,refresh=()=>{},fetchImpl=globalThis.fetch,authOrigin,waitImpl}={}){
  let model=initialModel,busy=false,prepared=null;
  const binding={...model.binding},acceptedFingerprints=new Set([model.fingerprint]);
  function context({checkSlot=true}={}){
    const value=getContext(),session=value?.session,active=sessionBinding(session);
    if(!session?.authenticated||!session.csrfToken)throw new Error('Reconnect Bungie before changing this loadout.');
    if(active.membershipId!==binding.membershipId||active.membershipType!==binding.membershipType||String(value.characterId)!==binding.characterId)throw new Error('The account or Guardian changed. Reopen Loadout details.');
    if(value.manifestVersion&&value.manifestVersion!==model.manifestVersion)throw new Error('The manifest changed. Reopen Loadout details.');
    if(checkSlot&&!acceptedFingerprints.has(loadoutFingerprint(value.profile?.characterLoadouts?.data?.[binding.characterId]?.loadouts?.[binding.index])))throw new Error('This saved slot changed. Reopen Loadout details.');
    return value;
  }
  const guardedFetch=async(...args)=>{context();return fetchImpl(...args);};
  async function serial(fn){if(busy)throw new Error('A loadout action is already running.');busy=true;try{return await fn();}finally{busy=false;}}
  async function readBoundProfile(){
    const before=context();
    const payload=await requestFreshProfile({fetchImpl:guardedFetch,authOrigin});context();
    const profile=payload.profile||payload.Response||{};
    if(loadoutFingerprint(profile.characterLoadouts?.data?.[binding.characterId]?.loadouts?.[binding.index])!==model.fingerprint)throw new Error('This saved slot changed in Destiny. Refresh the page before continuing.');
    return {profile,session:before.session};
  }
  async function prepare(){return serial(async()=>{
    prepared=null;
    if(!model.items.length||model.items.some(item=>item.unresolved||item.retired||item.sockets.some(plug=>plug.unresolved||plug.retired)))throw new Error('Some saved items or plugs are unavailable. Refresh before preparing Apply.');
    const {profile,session}=await readBoundProfile();
    // Exact saved hashes only. Existing Apply decides what may be inserted for free.
    const build=loadoutWorkingBuild(model,profile);
    const plan=createLiveTransferPlan({build,originalBuild:build,capabilities:liveActionCapabilities(session)});
    prepared=plan.ready?await stageLiveTransferPreflight(plan,{session,fetchImpl:guardedFetch,authOrigin}):plan;
    context();return prepared;
  });}
  async function slotAction(action,identifiers={}){
    const {session}=await readBoundProfile();
    const confirmation=confirmBungieLoadoutAction(stageBungieLoadoutAction(action,{characterId:binding.characterId,index:binding.index,loadoutName:model.name}));
    await executeBungieLoadoutAction(action,{characterId:binding.characterId,index:binding.index,session,confirmation,identifiers,fetchImpl:guardedFetch,authOrigin});
    // A write acceptance is not a readback. Metadata and clear are checked explicitly.
    const result=await requestFreshProfile({fetchImpl:guardedFetch,authOrigin});context();
    const profile=result.profile||result.Response||{},slot=profile.characterLoadouts?.data?.[binding.characterId]?.loadouts?.[binding.index];
    refresh({reason:`loadout-${action}`,characterId:binding.characterId,index:binding.index});
    if(action==='identifiers'){
      if(!slot||Object.entries(identifiers).some(([key,value])=>Number(slot[key])!==value))throw new Error('Bungie accepted the identifiers, but readback is pending. Refresh before trying again.');
      model=resolve(profile);acceptedFingerprints.add(model.fingerprint);prepared=null;return model;
    }
    if(!profile.characterLoadouts?.data?.[binding.characterId]||slot?.items?.length)throw new Error('Bungie accepted Clear slot, but readback is pending. Refresh before trying again.');
    prepared=null;
  }
  return {
    equip:prepare,prepare,
    apply:(plan,{onProgress=()=>{}}={})=>serial(async()=>{
      context();if(plan!==prepared||!plan?.ready)throw new Error('Prepare this loadout again before Apply.');
      prepared=null;
      const {session}=await readBoundProfile();
      const result=await executeLiveTransferPlan(confirmLiveTransferPlan(plan),{session,fetchImpl:guardedFetch,authOrigin,waitImpl,onProgress});
      refresh({reason:'loadout-apply',characterId:binding.characterId,index:binding.index});
      if(result.status!=='applied')throw new Error('Apply did not fully complete. Refresh and review the current equipment before retrying.');
      return {message:result.inGameSteps?.length?'Equipment applied. Complete the listed manual socket steps in Destiny.':'Loadout applied and read back from Bungie.',manualSteps:result.inGameSteps||[],result};
    }),
    identifiers:values=>serial(async()=>{
      context();
      const choices=model.identifierChoices;
      for(const [key,list] of [['nameHash','names'],['iconHash','icons'],['colorHash','colors']])if(!choices?.[list]?.some(row=>row.hash===values[key]))throw new Error('Choose identifiers from the current Bungie manifest.');
      return slotAction('identifiers',values);
    }),
    clear:()=>serial(()=>slotAction('clear')),
    save:name=>serial(async()=>{const value=context();if(!name.trim())throw new Error('Enter a loadout name.');if(model.items.some(row=>row.unresolved))throw new Error('Resolve the missing items before saving a PARADOX loadout.');return save({name,build:loadoutWorkingBuild(model,value.profile)});}),
    share:()=>serial(()=>{context();return share(loadoutShareDocument(model));})
  };
}
