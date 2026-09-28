// Build Review URL contract. Pure functions only: no DOM, no storage.
// The URL carries choices, never tokens, item instances or account data
// beyond the public Bungie binding the other tool pages already use.
import {parseDimInput} from '../../core/dim-import/share.mjs';

export const REVIEW_ACTIVITIES=Object.freeze([
  Object.freeze({key:'raid',label:'RAID',sentence:'a Raid'}),
  Object.freeze({key:'dungeon',label:'DUNGEON',sentence:'a Dungeon'}),
  Object.freeze({key:'grandmaster',label:'GRANDMASTER',sentence:'Grandmasters'}),
  Object.freeze({key:'crucible',label:'CRUCIBLE',sentence:'the Crucible'}),
  Object.freeze({key:'pve',label:'GENERAL PVE',sentence:'general PvE'})
]);
export const REVIEW_OBJECTIVES=Object.freeze([
  Object.freeze({key:'balanced',label:'BALANCED',sentence:'balance'}),
  Object.freeze({key:'dps',label:'DPS',sentence:'DPS'}),
  Object.freeze({key:'add-clear',label:'ADD CLEAR',sentence:'add clear'}),
  Object.freeze({key:'survivability',label:'SURVIVABILITY',sentence:'survivability'}),
  Object.freeze({key:'ability-uptime',label:'ABILITY UPTIME',sentence:'ability uptime'})
]);
export const REVIEW_ELEMENTS=Object.freeze(['arc','solar','strand','stasis','void','prismatic']);
export const REVIEW_STEPS=Object.freeze([1,2,3,4]);

const DIGITS=/^\d{1,32}$/;
const pick=(value,allowed)=>allowed.includes(value)?value:'';
const keys=rows=>rows.map(row=>row.key);

function shareIdOf(value){
  const text=String(value||'').trim();if(!text)return '';
  try{return parseDimInput(text).shareId||'';}catch{return '';}
}

export function decodeReviewUrl(search=''){
  const params=new URLSearchParams(search);
  const selection={
    dim:shareIdOf(params.get('dim')),
    characterId:DIGITS.test(params.get('characterId')||'')?params.get('characterId'):'',
    membershipId:DIGITS.test(params.get('membershipId')||'')?params.get('membershipId'):'',
    membershipType:/^\d{1,2}$/.test(params.get('membershipType')||'')?params.get('membershipType'):'',
    activity:pick(params.get('activity')||'',keys(REVIEW_ACTIVITIES)),
    objective:pick(params.get('objective')||'',keys(REVIEW_OBJECTIVES)),
    element:pick(params.get('element')||'',REVIEW_ELEMENTS),
    step:Number(params.get('step'))||1
  };
  selection.step=reachableStep(selection,selection.step);
  return selection;
}

// A step is reachable only when every earlier answer is present and valid.
// Missing or invalid values fall back to the earliest incomplete step.
export function reachableStep(selection,requested=1){
  const wanted=REVIEW_STEPS.includes(Number(requested))?Number(requested):1;
  if(!selection?.dim)return 1;
  if(wanted<=2)return wanted;
  if(!goalComplete(selection))return 2;
  return wanted;
}

export function goalComplete(selection={}){return Boolean(selection.activity&&selection.objective&&selection.element);}

export function encodeReviewUrl(selection={}){
  const params=new URLSearchParams();
  const dim=shareIdOf(selection.dim);if(dim)params.set('dim',dim);
  for(const key of ['characterId','membershipId','membershipType'])if(selection[key]&&/^\d+$/.test(String(selection[key])))params.set(key,String(selection[key]));
  const activity=pick(selection.activity||'',keys(REVIEW_ACTIVITIES));if(activity)params.set('activity',activity);
  const objective=pick(selection.objective||'',keys(REVIEW_OBJECTIVES));if(objective)params.set('objective',objective);
  const element=pick(selection.element||'',REVIEW_ELEMENTS);if(element)params.set('element',element);
  params.set('step',String(reachableStep({dim,activity,objective,element},selection.step)));
  return `?${params}`;
}
