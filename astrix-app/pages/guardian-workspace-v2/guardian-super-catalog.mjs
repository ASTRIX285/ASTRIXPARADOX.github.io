/* ASTRIX PARADOX — verified Destiny 2 subclass and Super identity catalogue.
 *
 * Source: Bungie DestinyInventoryItemDefinition manifest
 * Version audited: 244213.26.06.29.2000-1-bnet.65583 (2026-08-28)
 * Runtime socket data remains authoritative for equipped state. This catalogue
 * supplies the complete compatible selection set when Bungie profile sockets
 * only return the currently equipped plug.
 */

const MANIFEST_VERSION='244213.26.06.29.2000-1-bnet.65583';
const ELEMENT_ORDER=Object.freeze(['arc','solar','void','stasis','strand','prismatic']);
const CLASS_NAMES=Object.freeze(['titan','hunter','warlock']);

const SUBCLASSES=Object.freeze({
  hunter:Object.freeze([
    [2328211300,'arc','Arcstrider','/common/destiny2_content/icons/949af7a61d60a8e6071282daafa9e6e9.png'],
    [2240888816,'solar','Gunslinger','/common/destiny2_content/icons/fedcb91b7ab0584c12f0e9fec730702b.png'],
    [2453351420,'void','Nightstalker','/common/destiny2_content/icons/32b112a9460e6f0e2b9ee15dc53fe1c1.png'],
    [873720784,'stasis','Revenant','/common/destiny2_content/icons/6e441ffa8c8171ce9caf71e51b72fc19.png'],
    [3785442599,'strand','Threadrunner','/common/destiny2_content/icons/41c0024ce809085ac16f4e0777ea0ac4.png'],
    [4282591831,'prismatic','Prismatic Hunter','/common/destiny2_content/icons/fab506e62fa4f188bfe2fb6d56b39614.png']
  ]),
  titan:Object.freeze([
    [2932390016,'arc','Striker','/common/destiny2_content/icons/949af7a61d60a8e6071282daafa9e6e9.png'],
    [2550323932,'solar','Sunbreaker','/common/destiny2_content/icons/fedcb91b7ab0584c12f0e9fec730702b.png'],
    [2842471112,'void','Sentinel','/common/destiny2_content/icons/32b112a9460e6f0e2b9ee15dc53fe1c1.png'],
    [613647804,'stasis','Behemoth','/common/destiny2_content/icons/6e441ffa8c8171ce9caf71e51b72fc19.png'],
    [242419885,'strand','Berserker','/common/destiny2_content/icons/41c0024ce809085ac16f4e0777ea0ac4.png'],
    [1616346845,'prismatic','Prismatic Titan','/common/destiny2_content/icons/c1740d829e62afc40a9e57af4e3cad4c.png']
  ]),
  warlock:Object.freeze([
    [3168997075,'arc','Stormcaller','/common/destiny2_content/icons/949af7a61d60a8e6071282daafa9e6e9.png'],
    [3941205951,'solar','Dawnblade','/common/destiny2_content/icons/fedcb91b7ab0584c12f0e9fec730702b.png'],
    [2849050827,'void','Voidwalker','/common/destiny2_content/icons/32b112a9460e6f0e2b9ee15dc53fe1c1.png'],
    [3291545503,'stasis','Shadebinder','/common/destiny2_content/icons/6e441ffa8c8171ce9caf71e51b72fc19.png'],
    [4204413574,'strand','Broodweaver','/common/destiny2_content/icons/41c0024ce809085ac16f4e0777ea0ac4.png'],
    [3893112950,'prismatic','Prismatic Warlock','/common/destiny2_content/icons/652406349e99e3db0c3198f78af4eeae.png']
  ])
});

const SUPERS=Object.freeze({
  hunter:Object.freeze({
    arc:Object.freeze([[3769507632,'Gathering Storm','/common/destiny2_content/icons/edf23f2e6951efcab4c4b10630b6f7c4.png'],[3769507633,'Arc Staff','/common/destiny2_content/icons/435489f514e2bf88d25c452a96f2dff9.png'],[3769507635,"Storm's Edge",'/common/destiny2_content/icons/515dafc7f95e310e26bf3189f640231c.png']]),
    solar:Object.freeze([[375052468,'Golden Gun: Marksman','/common/destiny2_content/icons/52f2eb1fefa20e9c7b064c190855d588.png'],[375052469,'Golden Gun: Deadshot','/common/destiny2_content/icons/e19ebe4d56d6f95d582703f6b481813f.png'],[375052471,'Blade Barrage','/common/destiny2_content/icons/0b01a6ddceb7b0e2e86ebcb7a6a83eaa.png']]),
    void:Object.freeze([[2722573681,'Shadowshot: Moebius Quiver','/common/destiny2_content/icons/986e8f2dd0699371d605a331bb63742a.png'],[2722573682,'Spectral Blades','/common/destiny2_content/icons/1fbfacd5dfe847c5cd0262c5616653ff.png'],[2722573683,'Shadowshot: Deadfall','/common/destiny2_content/icons/61feac4f1271ba6cecc29cc50e20ab5a.png']]),
    stasis:Object.freeze([[2625980631,'Silence and Squall','/common/destiny2_content/icons/a8bbee32ce8f259e7b9e112c0c8a401a.png']]),
    strand:Object.freeze([[2463983862,'Silkstrike','/common/destiny2_content/icons/3da7e8684b09600e90ea5c16f1edebe0.png']]),
    prismatic:Object.freeze([[2370269384,'Silkstrike','/common/destiny2_content/icons/3da7e8684b09600e90ea5c16f1edebe0.png'],[2370269388,"Storm's Edge",'/common/destiny2_content/icons/515dafc7f95e310e26bf3189f640231c.png'],[2370269389,'Shadowshot: Deadfall','/common/destiny2_content/icons/61feac4f1271ba6cecc29cc50e20ab5a.png'],[2370269390,'Golden Gun: Marksman','/common/destiny2_content/icons/52f2eb1fefa20e9c7b064c190855d588.png'],[2370269391,'Silence and Squall','/common/destiny2_content/icons/a8bbee32ce8f259e7b9e112c0c8a401a.png']])
  }),
  titan:Object.freeze({
    arc:Object.freeze([[119041298,'Thundercrash','/common/destiny2_content/icons/adb140aba83a6c14345852531d4ee2e0.png'],[119041299,'Fists of Havoc','/common/destiny2_content/icons/5bc4f4029b38fd41d0232460b4295600.png']]),
    solar:Object.freeze([[2747500760,'Burning Maul','/common/destiny2_content/icons/a0391bd2a8cf73c58cec261961db0136.png'],[2747500761,'Hammer of Sol','/common/destiny2_content/icons/9d1fd669f61cce4abd35dbefd22ba90c.png']]),
    void:Object.freeze([[4260353952,'Sentinel Shield','/common/destiny2_content/icons/a929ea604d638e5e99125e48f76989e2.png'],[4260353953,'Ward of Dawn','/common/destiny2_content/icons/1caf1eccf1072969ab93bd35fde62599.png'],[4260353955,'Twilight Arsenal','/common/destiny2_content/icons/ad8fd9cd668f4d980b29e26ade9e4369.png']]),
    stasis:Object.freeze([[2021620139,'Glacial Quake','/common/destiny2_content/icons/3c522f849a7d4d86d5224d7d5d5671a4.png']]),
    strand:Object.freeze([[3574662354,'Bladefury','/common/destiny2_content/icons/228496331415f6854ef589f33c2a2622.png']]),
    prismatic:Object.freeze([[2529942642,'Bladefury','/common/destiny2_content/icons/228496331415f6854ef589f33c2a2622.png'],[2529942644,'Thundercrash','/common/destiny2_content/icons/adb140aba83a6c14345852531d4ee2e0.png'],[2529942645,'Glacial Quake','/common/destiny2_content/icons/3c522f849a7d4d86d5224d7d5d5671a4.png'],[2529942646,'Twilight Arsenal','/common/destiny2_content/icons/ad8fd9cd668f4d980b29e26ade9e4369.png'],[2529942647,'Hammer of Sol','/common/destiny2_content/icons/9d1fd669f61cce4abd35dbefd22ba90c.png']])
  }),
  warlock:Object.freeze({
    arc:Object.freeze([[1081893460,'Stormtrance','/common/destiny2_content/icons/31a0445d352fd44b62c9a8dd2752ccdf.png'],[1081893461,'Chaos Reach','/common/destiny2_content/icons/b54195b2d82a31ae970ca85fb7fb0be7.png']]),
    solar:Object.freeze([[2274196884,'Song of Flame','/common/destiny2_content/icons/ed2e5deb9b67c0120468ee136f98f2b2.png'],[2274196886,'Daybreak','/common/destiny2_content/icons/89b89220e92c5b363d3e105c25a21640.png'],[2274196887,'Well of Radiance','/common/destiny2_content/icons/2f3615ddcd86ab7c50653d2d1847c3bf.png']]),
    void:Object.freeze([[1656118680,'Nova Warp','/common/destiny2_content/icons/feb001db8e9776bc822007c74564c1b6.png'],[1656118681,'Nova Bomb: Vortex','/common/destiny2_content/icons/e9dc1cc0179cda4d2445845cf8992a7e.png'],[1656118682,'Nova Bomb: Cataclysm','/common/destiny2_content/icons/b1efa0eaa710653d85e2fcf5321047fb.png']]),
    stasis:Object.freeze([[3683904166,"Winter's Wrath",'/common/destiny2_content/icons/c9f25c8f6d5e647366ffc4f71a825961.png']]),
    strand:Object.freeze([[1885339915,'Needlestorm','/common/destiny2_content/icons/2e486aef07bd3551c35807f416ba0b6c.png']]),
    prismatic:Object.freeze([[1869939001,'Needlestorm','/common/destiny2_content/icons/2e486aef07bd3551c35807f416ba0b6c.png'],[1869939004,'Nova Bomb: Cataclysm','/common/destiny2_content/icons/b1efa0eaa710653d85e2fcf5321047fb.png'],[1869939005,'Song of Flame','/common/destiny2_content/icons/ed2e5deb9b67c0120468ee136f98f2b2.png'],[1869939006,"Winter's Wrath",'/common/destiny2_content/icons/c9f25c8f6d5e647366ffc4f71a825961.png'],[1869939007,'Stormtrance','/common/destiny2_content/icons/31a0445d352fd44b62c9a8dd2752ccdf.png']])
  })
});

function classKey(value){const key=String(value||'').trim().toLowerCase();return CLASS_NAMES.includes(key)?key:'hunter';}
function elementKey(value){const text=typeof value==='string'?value:[value?.element,value?.subclass,value?.key,value?.name,value?.displayName].filter(Boolean).join(' ');return ELEMENT_ORDER.find(key=>String(text).toLowerCase().includes(key))||'';}
function itemKey(item){return String(item?.hash??item?.itemHash??item?.bungieHash??'');}
function displayDefinition(name,icon,extra={}){return {displayProperties:{name,icon},...extra};}
function superItem([hash,name,icon],characterClass,element){return {hash,bungieHash:hash,name,icon,element,subclass:element,characterClass,source:'bungie-manifest',definition:displayDefinition(name,icon,{plug:{plugCategoryIdentifier:`${characterClass}.${element==='prismatic'?'prism':element}.supers`}})};}
function subclassItem([hash,element,name,icon],characterClass){return {hash,bungieHash:hash,name,icon,element,subclass:element,key:element,characterClass,source:'bungie-manifest',definition:displayDefinition(name,icon,{itemType:16,itemTypeDisplayName:'Subclass'})};}
function mergeByHash(canonical,runtime){
  const supplied=new Map((Array.isArray(runtime)?runtime:[]).filter(Boolean).map(item=>[itemKey(item),item]));
  const merged=canonical.map(item=>{const live=supplied.get(itemKey(item));return live?{...item,...live,hash:Number(live.hash??live.itemHash??item.hash),bungieHash:Number(live.bungieHash??live.hash??live.itemHash??item.hash),icon:live.icon||live?.definition?.displayProperties?.icon||item.icon,definition:{...item.definition,...(live.definition||{}),displayProperties:{...item.definition.displayProperties,...(live?.definition?.displayProperties||{}),name:live.name||live?.definition?.displayProperties?.name||item.name,icon:live.icon||live?.definition?.displayProperties?.icon||item.icon}}}:item;});
  for(const item of supplied.values())if(!merged.some(row=>itemKey(row)===itemKey(item)))merged.push(item);
  return merged;
}
function superDefinitionsFor(characterClass,element){const cls=classKey(characterClass),key=elementKey(element);return (SUPERS[cls]?.[key]||[]).map(row=>superItem(row,cls,key));}
function mergeSuperOptions(characterClass,element,runtimeOptions=[]){
  const canonical=superDefinitionsFor(characterClass,element);
  const allowed=new Set(canonical.map(item=>itemKey(item)));
  const cls=classKey(characterClass),key=elementKey(element),plugElement=key==='prismatic'?'prism':key;
  const compatible=(Array.isArray(runtimeOptions)?runtimeOptions:[]).filter(item=>{
    if(allowed.has(itemKey(item)))return true;
    // New manifest Supers may postdate this catalogue; require exact plug identity.
    const category=String(item?.definition?.plug?.plugCategoryIdentifier||'').toLowerCase();
    return Number(itemKey(item))>0&&item?.unresolved!==true&&category===`${cls}.${plugElement}.supers`;
  });
  return mergeByHash(canonical,compatible);
}
function subclassDefinitionsFor(characterClass){const cls=classKey(characterClass);return (SUBCLASSES[cls]||[]).map(row=>{const item=subclassItem(row,cls);const options=mergeSuperOptions(cls,item.element,[]);return {...item,subclassBuild:{super:null,superOptions:options}};});}
function mergeSubclassCatalog(runtimeCatalog=[],characterClass='hunter'){
  const cls=classKey(characterClass),runtime=Array.isArray(runtimeCatalog)?runtimeCatalog.filter(Boolean):[];
  return subclassDefinitionsFor(cls).map(canonical=>{
    const live=runtime.find(item=>elementKey(item)===canonical.element)||null;
    const liveBuild=live?.subclassBuild||live?.build||{};
    const options=mergeSuperOptions(cls,canonical.element,[liveBuild.super,...(Array.isArray(liveBuild.superOptions)?liveBuild.superOptions:[])].filter(Boolean));
    const selectedKey=itemKey(liveBuild.super);
    const selected=options.find(item=>itemKey(item)===selectedKey)||null;
    const definition={...(live?.definition||{}),...canonical.definition,displayProperties:{...(live?.definition?.displayProperties||{}),...canonical.definition.displayProperties}};
    return {...canonical,...(live||{}),hash:canonical.hash,bungieHash:canonical.hash,name:canonical.name,icon:canonical.icon,definition,element:canonical.element,subclass:canonical.element,key:canonical.element,characterClass:cls,subclassBuild:{...canonical.subclassBuild,...liveBuild,super:selected,superOptions:options}};
  });
}

export {CLASS_NAMES,ELEMENT_ORDER,MANIFEST_VERSION,SUBCLASSES,SUPERS,classKey,elementKey,mergeSubclassCatalog,mergeSuperOptions,subclassDefinitionsFor,superDefinitionsFor};
