import {sessionBinding} from '../../pages/guardian-workspace-v2/guardian-live-actions.mjs?stack=20261002-1';
// A routine profile/session refresh is not an account or Guardian switch.
export function dimContextChanged(model,context){
  if(model.autoMatchedGuardian&&context.session?.authenticated!==true)return context.session?.authenticated===false;
  const binding=sessionBinding(context.session);
  return !context.session?.authenticated||(!model.autoMatchedGuardian&&String(context.characterId)!==String(model.binding.characterId))||binding.membershipId!==model.binding.membershipId||binding.membershipType!==model.binding.membershipType;
}
export function watchDimContext({document,window,getModel,getContext,onCharacter=()=>{},invalidate}){
  const check=()=>{const model=getModel();if(model&&dimContextChanged(model,getContext()))invalidate('The account or Guardian changed. Import this loadout again.');};
  const character=event=>{if(event.detail?.characterId)onCharacter(String(event.detail.characterId));check();};
  const names=['forge:character-selected','forge:guardian-selection-changed','forge:guardian-loadout-context'];
  for(const name of names)document.addEventListener(name,character);
  window.addEventListener('forge:bungie-session',check);
  return ()=>{for(const name of names)document.removeEventListener(name,character);window.removeEventListener('forge:bungie-session',check);};
}
