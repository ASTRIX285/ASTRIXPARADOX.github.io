import {adaptDimLoadout} from './adapt.mjs?v=20260927-adapt-1';
import {sessionBinding} from '../../pages/guardian-workspace-v2/guardian-live-actions.mjs';
// Import actions only stage and save. They never mutate equipment in Destiny.
export function createDimActions(model,{getContext,getSnapshot,save,send}){
  let busy=false;
  function prepare(){
    const value=getContext(),binding=sessionBinding(value.session);
    if(!value.session?.authenticated)throw new Error('Connect Bungie before using this action.');
    if(binding.membershipId!==model.binding.membershipId||binding.membershipType!==model.binding.membershipType)throw new Error('The account changed. Import this loadout again.');
    const snapshot=getSnapshot();
    if(!snapshot)throw new Error('Loadout definitions are still loading. Try again.');
    // Re-match against current inventory and the imported class, never the
    // character selected behind the popup. The original share remains intact.
    return adaptDimLoadout(model.portableLoadout,{snapshot,profile:value.profile,binding,preferredCharacterId:model.binding.characterId,currentSeasonNumber:value.currentSeasonNumber});
  }
  async function run(action){if(busy)throw new Error('A loadout action is already running.');busy=true;try{return await action(prepare());}finally{busy=false;}}
  return {
    save:name=>run(({build})=>save({name,build})),
    forge:()=>run(({build})=>send(build))
  };
}
