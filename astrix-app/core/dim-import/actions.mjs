import {dimWorkingBuild} from './resolve.mjs';
import {createLiveTransferPlan} from '../../pages/guardian-workspace-v2/guardian-perk-change-plan.mjs';
import {sessionBinding,liveActionCapabilities,requestFreshProfile,stageLiveTransferPreflight,confirmLiveTransferPlan,executeLiveTransferPlan} from '../../pages/guardian-workspace-v2/guardian-live-actions.mjs?v=20260905-manual-editor-2&plain=20260925-2';
/** Importing, saving and handing off never call a Bungie mutation. Only Apply
 * accepts the exact, unconsumed preflight after the popup's confirmation click. */
export function createDimActions(model,{getContext,save,send,refresh=()=>{},fetchImpl=globalThis.fetch,authOrigin,deps={}}){
  const api={createLiveTransferPlan,liveActionCapabilities,requestFreshProfile,stageLiveTransferPreflight,confirmLiveTransferPlan,executeLiveTransferPlan,...deps};
  let busy=false,prepared=null;
  function context(){
    const value=getContext(),binding=sessionBinding(value.session);
    if(!value.session?.authenticated||!value.session.csrfToken)throw new Error('Connect Bungie before using this action.');
    if(binding.membershipId!==model.binding.membershipId||binding.membershipType!==model.binding.membershipType||String(value.characterId)!==String(model.binding.characterId))throw new Error('The account or Guardian changed. Import this loadout again.');
    if(value.manifestVersion&&value.manifestVersion!==model.manifestVersion)throw new Error('The manifest changed. Import this loadout again.');
    if(model.classType<3&&value.profile?.characters?.data?.[value.characterId]?.classType!==model.classType)throw new Error('Select a Guardian matching this loadout class.');
    return value;
  }
  const guardedFetch=(...args)=>{context();return fetchImpl(...args);};
  async function serial(fn){if(busy)throw new Error('A loadout action is already running.');busy=true;try{return await fn();}finally{busy=false;}}
  async function prepare(){return serial(async()=>{
    prepared=null;const value=context();
    if(model.items.some(row=>row.retired||row.sockets?.some(plug=>plug.retired)))throw new Error('Retired items cannot be applied.');
    const fresh=await api.requestFreshProfile({fetchImpl:guardedFetch,authOrigin});context();
    const profile=fresh.profile||fresh.Response||{};
    const build=dimWorkingBuild(model,profile,{forApply:true});
    const plan=api.createLiveTransferPlan({build,originalBuild:build,capabilities:api.liveActionCapabilities(value.session)});
    const manual=model.items.filter(row=>row.kind==='parameters').flatMap(row=>row.groups.filter(group=>!['Stat targets','Set bonuses','Exotic armour','In-game identifiers','Armour perks'].includes(group.label)).flatMap(group=>group.plugs.map(plug=>`${group.label}: ${plug.name}`)));
    plan.inGameSteps=[...(plan.inGameSteps||[]),...manual];
    prepared=plan.ready?await api.stageLiveTransferPreflight(plan,{session:value.session,fetchImpl:guardedFetch,authOrigin}):plan;
    context();return prepared;
  });}
  return {
    equip:prepare,
    apply:(plan,{onProgress=()=>{}}={})=>serial(async()=>{
      const value=context();if(plan!==prepared||!plan?.ready)throw new Error('Prepare this import again before Apply.');prepared=null;
      const result=await api.executeLiveTransferPlan(api.confirmLiveTransferPlan(plan),{session:value.session,fetchImpl:guardedFetch,authOrigin,onProgress});
      refresh();if(result.status!=='applied')throw new Error('Apply did not fully complete. Refresh and review your equipment.');
      return {message:'Equipment applied. Review any remaining steps in Destiny.',manualSteps:[...(result.inGameSteps||[]),...(plan.inGameSteps||[])]};
    }),
    save:name=>serial(()=>{const value=context();return save({name,build:dimWorkingBuild(model,value.profile)});}),
    forge:()=>serial(()=>{const value=context();return send(dimWorkingBuild(model,value.profile));})
  };
}
