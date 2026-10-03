import {boundedStringify} from '../bounded-json.mjs';
import {createDimForgeState} from './adapt.mjs';
import {createHandoffEnvelope} from '../../pages/guardian-workspace-v2/paradox-build-binding.mjs';
export function sendDimToForge(build,{storage=globalThis.sessionStorage,location=globalThis.location}={}){
  const envelope=createHandoffEnvelope(createDimForgeState(build));
  const value=boundedStringify(envelope,'DIM Build Forge handoff');
  try{storage.setItem('astrix:paradox-build-space:v1',value);}catch{throw new Error('Build Forge could not store this import. Free some browser storage and try again.');}
  const target=new URL('../../pages/guardian-workspace-v2/paradox-build-space/',import.meta.url);
  for(const key of ['characterId','membershipId','membershipType'])target.searchParams.set(key,String(build[key]));
  location.assign(target.href);
}
