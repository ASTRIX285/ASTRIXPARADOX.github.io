// Build Fit URL contract. Pure functions only: no DOM, no storage.
// The URL carries the share, the public Bungie binding and the user's decisions, so a reload,
// a bookmark or a shared link opens the same build. Never tokens or account data.
import {parseDimInput} from '../../core/dim-import/share.mjs';
import {decodeDecisions,encodeDecisions} from '../../core/dim-import/fit.mjs';
const DIGITS=/^\d{1,32}$/;
function shareIdOf(value){
  const text=String(value||'').trim();if(!text)return '';
  try{return parseDimInput(text).shareId||'';}catch{return '';}
}
export function decodeFitUrl(search=''){
  const params=new URLSearchParams(search);
  return {
    dim:shareIdOf(params.get('dim')),
    characterId:DIGITS.test(params.get('characterId')||'')?params.get('characterId'):'',
    membershipId:DIGITS.test(params.get('membershipId')||'')?params.get('membershipId'):'',
    membershipType:/^\d{1,2}$/.test(params.get('membershipType')||'')?params.get('membershipType'):'',
    decisions:decodeDecisions(params.get('fit')||'')
  };
}
export function encodeFitUrl(selection={}){
  const params=new URLSearchParams();
  const dim=shareIdOf(selection.dim);if(dim)params.set('dim',dim);
  for(const key of ['characterId','membershipId','membershipType'])if(selection[key]&&/^\d+$/.test(String(selection[key])))params.set(key,String(selection[key]));
  const fit=encodeDecisions(selection.decisions||new Map());if(fit)params.set('fit',fit);
  return `?${params}`;
}
/** Build Fit for a share, from Build Review or the DIM import. */
export function buildFitUrl(selection,{location:here=globalThis.location}={}){
  const url=new URL('/astrix-app/pages/build-fit/',here.href);url.search=encodeFitUrl(selection);return url.href;
}
