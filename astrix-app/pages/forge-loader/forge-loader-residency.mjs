const text=value=>String(value??'').trim();
const itemInstanceId=item=>text(item?.itemInstanceId||item?.instanceId);

function accountItemRows(payload={}){
  const profile=payload?.profile||{},rows=[];
  rows.push(...(profile?.profileInventory?.data?.items||[]));
  for(const inventory of Object.values(profile?.characterInventories?.data||{}))rows.push(...(inventory?.items||[]));
  for(const equipment of Object.values(profile?.characterEquipment?.data||{}))rows.push(...(equipment?.items||[]));
  const unique=new Map();
  for(const item of rows){
    const instance=itemInstanceId(item);
    const key=instance||`uninstanced:${text(item?.itemHash)}:${text(item?.bucketHash)}:${unique.size}`;
    if(!unique.has(key))unique.set(key,item);
  }
  return [...unique.values()];
}

function liveSubclassRows(profileBuild={}){
  return (Array.isArray(profileBuild?.subclassCatalog)?profileBuild.subclassCatalog:[]).filter(row=>itemInstanceId(row));
}

function uniqueDefinitionCount(rows=[]){
  return new Set(rows.map(row=>text(row?.hash??row?.itemHash??row?.bungieHash)).filter(Boolean)).size;
}

function subclassFragmentCount(rows=[]){
  return uniqueDefinitionCount(rows.flatMap(row=>{
    const build=row?.subclassBuild||row?.build||{};
    return [...(build.fragments||[]),...(build.availableFragments||build.fragmentOptions||[])];
  }));
}

function hasVerifiedSubclassSockets(row={}){
  const build=row?.subclassBuild||row?.build||{};
  return build.socketsAvailable===true&&build.socketCoverage?.complete===true&&uniqueDefinitionCount([build.super,...(build.superOptions||[])])>0&&subclassFragmentCount([row])>0;
}

function sourceState(resident,complete,phase){
  if(!resident)return 'verifying';
  return phase==='ready'&&complete?'ready':'resident';
}

function forgeLoaderEvaluateReady(residency={},selectedSlots=new Map(),characterId=''){
  const selectedCount=selectedSlots instanceof Map?selectedSlots.size:Array.isArray(selectedSlots)?new Set(selectedSlots.map(row=>Number(row?.slotIndex)).filter(Number.isInteger)).size:0;
  return residency?.ready===true&&selectedCount===5&&Boolean(text(characterId));
}

function coverageComplete(coverage={}){
  return coverage?.complete===true;
}

function forgeLoaderManifestComplete(payload={}){
  return coverageComplete(payload?.pageReady?.coverage)
    &&coverageComplete(payload?.loadoutCoverage)
    &&coverageComplete(payload?.forgeArmourIndexCoverage)
    &&coverageComplete(payload?.weaponDefinitionCoverage)
    &&coverageComplete(payload?.subclassCatalogCoverage)
    &&coverageComplete(payload?.artifactCatalogCoverage);
}

function forgeLoaderResidency(payload={},options={}){
  const characterId=text(options.characterId),profile=payload?.profile||{},profileBuild=options.profileBuild||null,catalogue=options.catalogue||{},phase=options.phase||'verifying';
  const equipment=profile?.characterEquipment?.data?.[characterId],profileInventory=profile?.profileInventory?.data;
  const allItems=accountItemRows(payload),armourCount=Number(catalogue?.totals?.armour),weapons=Array.isArray(profileBuild?.ownedWeapons)?profileBuild.ownedWeapons:[];
  const subclasses=liveSubclassRows(profileBuild||{}),fragmentCount=subclassFragmentCount(subclasses),artifactCatalog=Array.isArray(payload?.artifactCatalog)?payload.artifactCatalog:[],artifact=profileBuild?.artifact||null;
  const manifestVersion=text(payload?.pageReady?.manifestVersion||options.manifestStatus?.version),weaponCoverage=payload?.weaponDefinitionCoverage||null;
  const expectedWeaponInstances=new Set(Array.isArray(weaponCoverage?.itemInstances)?weaponCoverage.itemInstances.map(text).filter(Boolean):[]).size;
  const weaponsComplete=Boolean(profileBuild)&&Array.isArray(profileBuild?.ownedWeapons)&&coverageComplete(weaponCoverage)&&weapons.length===expectedWeaponInstances;
  const manifestComplete=Boolean(manifestVersion)&&forgeLoaderManifestComplete(payload);
  const rows=[
    {key:'equipped',label:'Equipped loadout',resident:Array.isArray(equipment?.items),complete:Array.isArray(equipment?.items),detail:Array.isArray(equipment?.items)?`${equipment.items.length} equipped items resident`:'Awaiting verified Bungie equipment'},
    {key:'vault-armour',label:'Vault armour',resident:Array.isArray(profileInventory?.items)&&Number.isFinite(armourCount),complete:Array.isArray(profileInventory?.items)&&Number.isFinite(armourCount),detail:Number.isFinite(armourCount)?`${armourCount} armour items indexed`:'Awaiting verified Vault armour'},
    {key:'weapons',label:'Weapons',resident:Boolean(profileBuild)&&Array.isArray(profileBuild?.ownedWeapons),complete:weaponsComplete,detail:profileBuild&&Array.isArray(profileBuild?.ownedWeapons)?`${weapons.length} owned weapons indexed`:'Awaiting verified weapon instances'},
    {key:'subclass',label:'Subclass and fragments',resident:Boolean(profileBuild)&&subclasses.length>0,complete:subclasses.some(hasVerifiedSubclassSockets),detail:subclasses.length?`${subclasses.length} live subclass${subclasses.length===1?'':'es'} and ${fragmentCount} fragment options resolved`:'Awaiting live subclass sockets'},
    {key:'artifact',label:'Seasonal Artifact',resident:Boolean(profileBuild)&&Array.isArray(payload?.artifactCatalog),complete:Boolean(profileBuild)&&Array.isArray(payload?.artifactCatalog),detail:profileBuild?`${artifact?.name?`${text(artifact.name)} active · `:'No active Artifact reported · '}${artifactCatalog.length} verified definitions resident`:'Awaiting verified Artifact data'},
    {key:'manifest',label:'Manifest',resident:Boolean(manifestVersion),complete:manifestComplete,detail:manifestVersion?`Cached manifest ${manifestVersion}`:'Awaiting cached manifest'}
  ].map(row=>({...row,state:sourceState(row.resident,row.complete,phase)}));
  const ready=options.combinationsPrewarmed===true&&rows.every(row=>row.state==='ready');
  const durationMs=Math.max(0,Number(options.durationMs)||0);
  return {
    rows,
    itemCount:allItems.length,
    ready,
    summary:ready?`${allItems.length} items indexed · combinations pre-warmed · ready in ${(durationMs/1000).toFixed(1)}s`:'Verifying required Bungie sources. No unverified counts are shown.'
  };
}

export {accountItemRows,forgeLoaderEvaluateReady,forgeLoaderManifestComplete,forgeLoaderResidency,hasVerifiedSubclassSockets,liveSubclassRows,subclassFragmentCount};
