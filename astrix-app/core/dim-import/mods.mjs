// Shared armour mods placed on the build's own pieces, by Bungie socket types and energy.
import {ARMOUR_SLOT_NAMES,MOD_SLOT} from './fill.mjs';
import {bungieArtwork} from '../../shared/loadout-details-model.mjs';
import {ARMOUR_BUCKETS} from '../../pages/guardian-workspace-v2/guardian-perk-change-plan.mjs';
const ITEM='DestinyInventoryItemDefinition';
const nameOf=definition=>String(definition?.displayProperties?.name||'').trim();
/**
 * Shared armour mods on the pieces that can take them. A mod goes to a socket whose Bungie socket
 * type accepts its plug category, never over the piece's energy. Shared per-slot cosmetics go on
 * their own slot. Anything that cannot be placed is returned with the reason, never dropped.
 */
export function placeMods(pieces,parameters,tables,profile){
  const byBucket=new Map(),unplaced=[],room=new Map();
  const describe=hash=>{const definition=tables[ITEM]?.[hash];return {hash:Number(hash),name:nameOf(definition)||`Unresolved mod ${hash}`,icon:bungieArtwork(definition?.displayProperties?.icon),definition,cost:Number(definition?.plug?.energyCost?.energyCost||0),category:Number(definition?.plug?.plugCategoryHash||0)};};
  for(const [bucket,piece] of pieces){
    if(!piece)continue;byBucket.set(bucket,[]);
    const instance=profile?.itemComponents?.instances?.data?.[piece.itemInstanceId],reusable=profile?.itemComponents?.reusablePlugs?.data?.[piece.itemInstanceId]?.plugs||{};
    const sockets=(piece.definition?.sockets?.socketEntries||[]).map((entry,socketIndex)=>({socketIndex,whitelist:new Set((tables.DestinySocketTypeDefinition?.[entry.socketTypeHash]?.plugWhitelist||[]).map(row=>Number(row.categoryHash))),reusable:reusable[socketIndex]||null,used:false}));
    const capacity=Number(instance?.energy?.energyCapacity);
    room.set(bucket,{sockets,energy:Number.isFinite(capacity)?capacity:null,piece});
  }
  const fits=(slot,mod)=>slot.sockets.find(socket=>!socket.used&&socket.whitelist.has(mod.category)&&(!socket.reusable||socket.reusable.some(plug=>Number(plug.plugItemHash)===mod.hash&&plug.canInsert!==false)));
  const put=(bucket,mod)=>{
    const slot=room.get(bucket);if(!slot)return `No ${ARMOUR_SLOT_NAMES[bucket]||'armour piece'} in this build to hold it.`;
    const socket=fits(slot,mod);if(!socket)return `No free socket on ${nameOf(slot.piece.definition)} accepts it.`;
    if(slot.energy!==null&&mod.cost>slot.energy)return `Not enough energy on ${nameOf(slot.piece.definition)}: needs ${mod.cost}, ${slot.energy} left.`;
    socket.used=true;if(slot.energy!==null)slot.energy-=mod.cost;byBucket.get(bucket).push({socketIndex:socket.socketIndex,...mod});return '';
  };
  for(const [bucket,hashes] of Object.entries(parameters?.modsByBucket||{}))for(const hash of hashes){const mod=describe(hash),why=put(Number(bucket),mod);if(why)unplaced.push({...mod,reason:why});}
  // Slot-specific mods first, so general and tuning mods never take their energy.
  const mods=(parameters?.mods||[]).map(describe);
  // The mod's own plug category names its armour slot; general and tuning mods name none.
  const slotOf=mod=>MOD_SLOT[mod.definition?.plug?.plugCategoryIdentifier];
  const fixed=mods.filter(mod=>slotOf(mod)!==undefined),open=mods.filter(mod=>slotOf(mod)===undefined);
  for(const mod of fixed){const why=put(slotOf(mod),mod);if(why)unplaced.push({...mod,reason:why});}
  for(const mod of open){
    if(!mod.definition){unplaced.push({...mod,reason:'Its definition is not in the manifest.'});continue;}
    const reasons=[];let placed=false;
    for(const bucket of ARMOUR_BUCKETS){if(!room.has(bucket))continue;const why=put(bucket,mod);if(!why){placed=true;break;}reasons.push(why);}
    if(!placed)unplaced.push({...mod,reason:room.size?reasons.find(text=>text.startsWith('Not enough'))||'No piece in this build has a free socket that accepts it.':'No armour in this build to hold it.'});
  }
  return {byBucket,unplaced};
}
