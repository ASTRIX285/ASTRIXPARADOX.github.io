import {adviseWeaponRoll} from "../../core/weapon-roll-advisor.mjs?v=20260905-manual-editor-1";
import {classifyWeaponPlug} from './guardian-semantic-resolver.mjs?v=20260905-weapon-audit-1';

const INTELLIGENCE_URL=new URL("../../data/paradox-forge/intelligence/weapon-perk-intelligence.json",import.meta.url);
let intelligencePromise=null;

function loadIntelligence(){
  intelligencePromise??=fetch(INTELLIGENCE_URL,{cache:"no-cache"}).then(response=>{
    if(!response.ok)throw new Error(`Weapon perk intelligence unavailable (${response.status})`);
    return response.json();
  });
  return intelligencePromise;
}

function uniq(values=[]){return [...new Set(values.filter(Boolean).map(String))];}

function contextFromAnalysis(analysis={}){
  return {
    desiredTokens:uniq((analysis.weakLinks||[]).map(row=>row.effect)),
    emittedTokens:uniq((analysis.buildLoop||[]).map(row=>row.output)),
    preferredRoles:uniq((analysis.weaponContribution||[]).flatMap(row=>row.roles||[])),
    activityNeeds:uniq((analysis.activityCounters?.chains||[]).flatMap(row=>row.requirement?.requiredTokens||row.requirement?.needs||row.requiredTokens||row.needs||[]))
  };
}

function weaponInput(item={}){
  const semantics=item.weaponSemantics||{};
  const catalyst=semantics.catalyst||item.catalyst||null,catalystMasterworked=Boolean(catalyst?.progress?.masterworked||catalyst?.progress?.active);
  return {
    itemHash:item.hash??item.bungieHash??null,
    itemInstanceId:item.itemInstanceId??null,
    selectedPerkHashes:(semantics.selectedPerks||[]).map(perk=>String(perk.hash)),
    selectedPerks:(semantics.selectedPerks||[]).map(perk=>({hash:String(perk.hash),name:perk.name||"",socketIndex:perk.socketIndex})),
    fixedTraits:[semantics.intrinsic,...(semantics.exoticTraits||[]),...(catalystMasterworked?[catalyst]:[])].filter(Boolean),
    catalyst:catalyst?{hash:String(catalyst.hash||""),masterworked:catalystMasterworked,completed:Boolean(catalyst?.progress?.completed),inserted:Boolean(catalyst?.progress?.inserted)}:null,
    perkColumns:(semantics.alternativePerkColumns||[]).map(column=>({
      socketIndex:column.socketIndex,
      options:(column.options||[]).filter(option=>classifyWeaponPlug(option)==='perk'&&option.canInsert!==false&&option.isEnabled!==false).map(option=>({...option,socketIndex:column.socketIndex}))
    }))
  };
}

async function adviseLiveWeaponRolls(detail={},analysis={},capabilities={insertSocketPlugFree:false}){
  const intelligence=await loadIntelligence();
  const context=contextFromAnalysis(analysis);
  const recommendations=(detail.weapons||[]).filter(Boolean).map(item=>{
    const advice=adviseWeaponRoll({weapon:weaponInput(item),intelligence,context,capabilities});
    item.weaponRollAdvice=advice;
    return {weaponHash:item.hash??item.bungieHash??null,weaponName:item.name||"Weapon",itemInstanceId:item.itemInstanceId??null,...advice};
  });
  const stagedChanges=recommendations.flatMap(row=>row.stagedChanges||[]);
  const result={source:"paradox-curated-perk-intelligence",context,recommendations,stagedChanges,remotePerkMutationSupported:Boolean(capabilities.insertSocketPlugFree),requiresUserConfirmation:true};
  analysis.weaponRollAdvice=result;
  detail.weaponRollAdvice=result;
  if(typeof document!=="undefined")document.dispatchEvent(new CustomEvent("forge:weapon-roll-advice-changed",{detail:result}));
  return result;
}

export {adviseLiveWeaponRolls,contextFromAnalysis,weaponInput};
