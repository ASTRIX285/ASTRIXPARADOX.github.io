// Build Review view models. Pure functions: they only reshape what the DIM
// import, Bungie definitions and the Paradox engine already produced.
// Nothing here invents a name, count, reason or synergy.
import {ARMOUR_BUCKETS,WEAPON_BUCKETS} from '../guardian-workspace-v2/guardian-perk-change-plan.mjs';
import {REVIEW_ACTIVITIES,REVIEW_OBJECTIVES} from './build-review-url.mjs';
import {elementOf} from './build-review-pipeline.mjs';

const WEAPON_LABELS=['Kinetic','Energy','Power'];
const ARMOUR_LABELS=['Helmet','Gauntlets','Chest','Legs','Class item'];
const text=value=>String(value??'').trim();
const titleCase=value=>text(value).replace(/\b\w/g,letter=>letter.toUpperCase());
const ELEMENT_NAMES={arc:'Arc',solar:'Solar',strand:'Strand',stasis:'Stasis',void:'Void',prismatic:'Prismatic'};

export function elementName(key){return ELEMENT_NAMES[key]||'';}

function locationOf(source={},characterId=''){
  const kind=text(source.kind);
  if(kind==='vault')return 'vault';
  if(['equipped','carried'].includes(kind))return text(source.characterId)&&characterId&&text(source.characterId)!==characterId?'other':'guardian';
  if(kind==='postmaster')return 'postmaster';
  return kind?'other':'unknown';
}
const LOCATION_LABELS={guardian:'On this Guardian',vault:'In your Vault',other:'On another Guardian',postmaster:'In Postmaster',unknown:'In your inventory'};

function subclassView(build={},shareSubclass=null){
  const sb=build.subclassBuild||{};
  const element=elementOf({element:build.subclass,name:[build.subclassName,shareSubclass?.name].filter(Boolean).join(' '),definition:shareSubclass?.definition});
  return {
    element:element==='unknown'?'':element,
    name:text(build.subclassName||shareSubclass?.name),
    superName:text(sb.super?.name),
    aspects:(sb.aspects||[]).map(item=>text(item?.name)).filter(Boolean),
    fragments:(sb.fragments||[]).map(item=>text(item?.name)).filter(Boolean)
  };
}

// Signed in: the adaptation matched the share to this account's inventory.
export function sharedBuildView(adaptation){
  const build=adaptation?.build||{},report=adaptation?.report||{},characterId=text(build.characterId);
  const comparisons=report.comparisons||[];
  const byBucket=new Map(comparisons.map(row=>[Number(row.bucketHash),row]));
  const liveByInstance=new Map([...(build.weapons||[]),...(build.armour||[])].filter(Boolean).map(item=>[text(item.itemInstanceId),item]));
  const slot=(bucket,label)=>{
    const row=byBucket.get(bucket);if(!row)return {label,name:'',icon:'',status:'empty',statusLabel:'Not in this share',isExotic:false};
    const live=row.selected?liveByInstance.get(text(row.selected.itemInstanceId)):null;
    const status=row.status==='missing'?'missing':row.status==='substituted'?'substituted':locationOf(live?.source,characterId);
    const statusLabel=status==='missing'?'Missing from your inventory':status==='substituted'?`Closest match: ${text(row.selected?.name)}`:LOCATION_LABELS[status];
    return {label,name:text(row.target?.name),icon:text(row.target?.icon),status,statusLabel,isExotic:Boolean(live?.isExotic),reasons:row.reasons||[]};
  };
  const weapons=WEAPON_BUCKETS.map((bucket,index)=>slot(bucket,WEAPON_LABELS[index]));
  const armour=ARMOUR_BUCKETS.map((bucket,index)=>slot(bucket,ARMOUR_LABELS[index]));
  const gear=[...weapons,...armour].filter(row=>row.status!=='empty');
  const count=status=>gear.filter(row=>row.status===status).length;
  const missing=gear.filter(row=>row.status==='missing');
  return {
    name:text(build.name||report.sourceName),
    className:titleCase(build.characterClass||report.characterClass),
    subclass:subclassView(build),
    weapons,armour,
    counts:{total:gear.length,found:gear.length-missing.length,guardian:count('guardian'),vault:count('vault'),other:count('other')+count('postmaster'),substituted:count('substituted'),missing:missing.length},
    missingNames:missing.map(row=>row.name).filter(Boolean),
    blockers:(report.blockers||[]).map(text).filter(Boolean),
    artifactCarried:Boolean(build.importedParameters?.artifactUnlocks?.unlockedItemHashes?.length)
  };
}

// Step 2. The button always says what is still missing. It never says Ready
// while an answer is missing.
export function goalButtonLabel(selection={}){
  const missing=[selection.activity?'':'AN ACTIVITY',selection.objective?'':'AN OBJECTIVE',selection.element?'':'AN ELEMENT'].filter(Boolean);
  if(!missing.length)return 'ANALYSE BUILD';
  return `PICK ${missing.length>1?`${missing.slice(0,-1).join(', ')} AND ${missing.at(-1)}`:missing[0]}`;
}

export function goalSentence(selection={},{buildName='',importElement=''}={}){
  const activity=REVIEW_ACTIVITIES.find(row=>row.key===selection.activity),objective=REVIEW_OBJECTIVES.find(row=>row.key===selection.objective),element=elementName(selection.element);
  if(!activity||!objective||!element)return '';
  return `Improve ${text(buildName)||'this build'} for ${activity.sentence}, focused on ${objective.sentence}, ${importElement&&importElement!==selection.element?'switching to':'keeping'} ${element}.`;
}

export function elementReason(importElement,subclassName){
  const element=elementName(importElement);if(!element)return '';
  const name=text(subclassName);
  return `${element} is pre-selected: the imported build runs ${name&&!name.toLowerCase().includes(element.toLowerCase())?`${element} ${name}`:name||element}. Pick another to rebuild around it.`;
}
