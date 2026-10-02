// Build Review generation pipeline.
// The MIRRORED block below is copied verbatim from Build Forge
// (paradox-build-space.mjs). Build Forge is not modified by Build Review.
// tools/test-build-review.mjs fails if the two copies drift apart: change
// Build Forge first, then copy the same text here.
import {mergeSubclassCatalog} from '../guardian-workspace-v2/guardian-super-catalog.mjs';
import {BUILD_ELEMENTS,createDirectGenerationBuild,validateForgeGenerationEntry} from '../guardian-workspace-v2/paradox-build-space/paradox-build-recommendation.mjs';
import {filterExoticCompatibleSubclasses,hasVerifiedSubclassSockets} from '../guardian-workspace-v2/paradox-build-space/paradox-forge-intelligence.mjs';
import {createBuildState} from '../guardian-workspace-v2/paradox-build-space/paradox-build-state.mjs';
import {createVaultCatalogue,prepareArmourSelection} from '../vault/vault-inventory.mjs?stack=20261002-1';
import {createDimForgeState} from '../../core/dim-import/adapt.mjs?grid=20261001-1&fit=20261002-1';

// MIRRORED FROM BUILD FORGE: START
const elementOf=item=>{const text=[item?.element,item?.damageType,item?.name,item?.displayName,item?.definition?.itemTypeDisplayName,...(item?.definition?.traitIds||[])].filter(Boolean).join(' ').toLowerCase();return ['stasis','arc','strand','void','solar','prismatic'].find(value=>text.includes(value))||'unknown';};
const list=(...values)=>values.find(Array.isArray)||[];
function resolvedSubclassOptions(build){const options=list(build?.subclassCatalog,build?.availableSubclasses,build?.subclassOptions,build?.resolvedSubclasses,build?.catalog?.subclasses);const current={name:build?.subclassName||build?.subclass||'Subclass',element:build?.subclass,icon:build?.subclassIcon,subclassBuild:build?.subclassBuild};return mergeSubclassCatalog(options.length?options:[current],build?.characterClass||'hunter');}
function forgeVariants(build){return filterExoticCompatibleSubclasses(build,resolvedSubclassOptions(build).filter(hasVerifiedSubclassSockets)).map(candidate=>({element:elementOf(candidate),candidate})).filter(row=>BUILD_ELEMENTS.includes(row.element));}
const IMPORTED_SOURCES=new Set(['dim-import']);
function isImportedBuild(build={}){return IMPORTED_SOURCES.has(build?.loadoutSource)||IMPORTED_SOURCES.has(build?.source);}
const IMPORTED_KEEP=['name','source','loadoutSource','dimImport','importedParameters','equipment','dimTarget','dimAdaptation','manualSocketChanges','statConstraints'];
function importedGenerationBase(selected,equipped,armourByInstance){
  const weaponsByInstance=new Map((equipped.ownedWeapons||[]).map(item=>[String(item?.itemInstanceId),item]));
  const refresh=(item,catalogue,label)=>{
    const live=catalogue.get(String(item?.itemInstanceId||''));
    if(!live)throw new Error(`${item?.name||label} from the imported build is no longer in your inventory. Import the loadout again.`);
    return live;
  };
  const base={...equipped,
    weapons:(selected.weapons||[]).map((item,index)=>refresh(item,weaponsByInstance,`Weapon ${index+1}`)),
    armour:(selected.armour||[]).map((item,index)=>refresh(item,armourByInstance,`Armour piece ${index+1}`))};
  for(const key of Object.keys(selected))if(key.startsWith('subclass'))base[key]=selected[key];
  for(const key of IMPORTED_KEEP)if(Object.hasOwn(selected,key))base[key]=selected[key];
  return base;
}
// MIRRORED FROM BUILD FORGE: END

// Same steps as Build Forge "Improve this imported build" (startDirectGeneration,
// mode "equipped"), without any page state or rendering.
function prepareReviewState(adapted,{payload,equipped}){
  // Build Forge receives an import as createDimForgeState(build): the DIM
  // target is the protected Original, the adapted build is the Working Build.
  const imported=createDimForgeState(adapted),selected=imported.workingBuild;
  if(!isImportedBuild(selected))throw new Error('This is not an imported DIM build. Import the loadout again.');
  const inventory=createVaultCatalogue(payload),byInstance=new Map(inventory.armour.map(item=>[String(item.itemInstanceId),item]));
  const base=importedGenerationBase(selected,equipped,byInstance);
  const armour=prepareArmourSelection(payload,base.armour.map(item=>byInstance.get(String(item?.itemInstanceId))||item));
  const working=createDirectGenerationBuild(base,{mode:'equipped',armour,ownedArmour:inventory.armour,ownedWeapons:equipped.ownedWeapons});
  const next=createBuildState(equipped);next.workingBuild=working;next.originalBuild=imported.originalBuild;
  return next;
}

// Elements this Guardian can build, using Build Forge's own verified subclass
// and Exotic compatibility rules.
function supportedElements(build){return new Set(forgeVariants(build).map(row=>row.element));}
function entryReadiness(build){return validateForgeGenerationEntry(build);}

export {BUILD_ELEMENTS,elementOf,resolvedSubclassOptions,forgeVariants,isImportedBuild,IMPORTED_KEEP,importedGenerationBase,prepareReviewState,supportedElements,entryReadiness};
