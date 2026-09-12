// Stable identities and presentation derived from Bungie definitions, never names.
export const WEAPON_TYPE_LABELS=Object.freeze({6:'Auto-Rifle',7:'Shotgun',8:'Machine Gun',9:'Hand Cannon',10:'Rocket Launcher',11:'Fusion Rifle',12:'Sniper Rifle',13:'Pulse Rifle',14:'Scout Rifle',17:'Sidearm',18:'Sword',22:'Linear Fusion Rifle',23:'Grenade Launcher',24:'Submachine Gun',25:'Trace Rifle',31:'Combat Bow',33:'Glaive'});
export const WEAPON_SOCKET_CATEGORIES=Object.freeze({perks:4241085061,mods:2685412949,intrinsic:3956125808,cosmetics:2048875504});
export const DESTINY_BREAKER_TYPE_HASHES=Object.freeze([485622768,2611060930,3178805705]);
export function bungieDefinitionHash(value){
  if(value===null||value===undefined||value==='')return null;
  const hash=Number(value);
  return Number.isInteger(hash)&&hash>0&&hash<=0xffffffff?hash:null;
}
export function paradoxDefinitionId(type,hash){
  const value=bungieDefinitionHash(hash);
  return value===null?null:`paradox:bungie:${type}:${value}`;
}
export function weaponTypeIdentity(definition={}){
  const subtype=Number(definition.itemSubType),label=WEAPON_TYPE_LABELS[subtype]||definition.itemTypeDisplayName||'Unclassified Weapon';
  return {id:`paradox:weapon-type:${subtype}`,subtype,label,bungieLabel:definition.itemTypeDisplayName||'',key:label.toLowerCase().replace(/[^a-z0-9]+/g,'-')};
}
export function weaponSocketSection(plug={}){
  const hash=Number(plug.socketCategoryHash??plug.socketTypeDefinition?.socketCategoryHash);
  for(const [section,value] of Object.entries(WEAPON_SOCKET_CATEGORIES))if(hash===value)return section;
  return null;
}
export function resolveItemWatermark(item={},definition=item.definition||{},context={}){
  const quality=definition.quality||{},rawVersion=item.versionNumber??context.versionNumber??quality.currentVersion;
  const versionNumber=rawVersion!==null&&rawVersion!==undefined&&Number.isInteger(Number(rawVersion))&&Number(rawVersion)>=0?Number(rawVersion):null;
  const versionIcon=versionNumber===null?'':quality.displayVersionWatermarkIcons?.[versionNumber]||'';
  const version=versionNumber===null?null:quality.versions?.[versionNumber];
  const cap=context.powerCapDefinitions?.[String(version?.powerCapHash)]?.powerCap;
  const shelved=Number.isFinite(cap)&&Number.isFinite(context.currentPowerCap)&&cap<context.currentPowerCap;
  let path='',source='unavailable';
  if(definition.isFeaturedItem===true&&definition.iconWatermarkFeatured){path=definition.iconWatermarkFeatured;source='iconWatermarkFeatured';}
  else if(versionIcon){path=versionIcon;source=`quality.displayVersionWatermarkIcons[${versionNumber}]`;}
  else if(shelved&&definition.iconWatermarkShelved){path=definition.iconWatermarkShelved;source='iconWatermarkShelved';}
  else if(definition.iconWatermark){path=definition.iconWatermark;source='iconWatermark';}
  return {icon:path?new URL(path,'https://www.bungie.net').href:'',path,source,versionNumber,itemHash:bungieDefinitionHash(item.itemHash??item.hash??definition.hash),definitionType:'DestinyInventoryItemDefinition',status:path?'resolved':'not-provided'};
}
export function resolveBreakerTypeDefinition(instance={},itemDefinition={},definitions={}){
  const hashes=[instance?.breakerTypeHash,itemDefinition?.breakerTypeHash].map(bungieDefinitionHash).filter(hash=>hash!==null);
  for(const hash of hashes){
    const definition=definitions?.[String(hash)];
    if(definition)return definition;
  }
  const enumValue=Number(instance?.breakerType);
  if(!Number.isInteger(enumValue)||enumValue<=0)return null;
  return Object.values(definitions||{}).find(definition=>Number(definition?.enumValue)===enumValue)||null;
}
