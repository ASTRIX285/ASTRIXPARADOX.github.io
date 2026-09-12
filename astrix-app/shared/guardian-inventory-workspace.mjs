const DESTINY_ITEM_STATE=Object.freeze({locked:1,masterwork:4});

const WEAPON_BUCKETS=Object.freeze([
  Object.freeze({hash:1498876634,key:'primary',label:'Primary',kind:'weapon'}),
  Object.freeze({hash:2465295065,key:'special',label:'Special',kind:'weapon'}),
  Object.freeze({hash:953998645,key:'heavy',label:'Heavy',kind:'weapon'})
]);
const ARMOUR_BUCKETS=Object.freeze([
  Object.freeze({hash:3448274439,key:'helmet',label:'Helmet',kind:'armour'}),
  Object.freeze({hash:3551918588,key:'gauntlets',label:'Gauntlets',kind:'armour'}),
  Object.freeze({hash:14239492,key:'chest',label:'Chest',kind:'armour'}),
  Object.freeze({hash:20886954,key:'legs',label:'Legs',kind:'armour'}),
  Object.freeze({hash:1585787867,key:'class-item',label:'Class Item',kind:'armour'})
]);
const CHARACTER_EQUIPMENT_BUCKETS=Object.freeze([
  Object.freeze({hash:4023194814,key:'ghost',label:'Ghost',kind:'equipment'}),
  Object.freeze({hash:284967655,key:'ship',label:'Ship',kind:'equipment'}),
  Object.freeze({hash:2025709351,key:'sparrow',label:'Sparrow',kind:'equipment'})
]);
const EQUIPMENT_GROUPS=Object.freeze([...WEAPON_BUCKETS,...ARMOUR_BUCKETS]);
const INVENTORY_GROUPS=Object.freeze([...EQUIPMENT_GROUPS,...CHARACTER_EQUIPMENT_BUCKETS]);
const EQUIPMENT_GROUP_BY_HASH=new Map(INVENTORY_GROUPS.map((row,index)=>[row.hash,{...row,index}]));

const esc=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const text=value=>String(value??'').trim();
const itemKey=item=>String(item?.itemInstanceId||`${item?.itemHash||'unknown'}:${item?.source?.kind||'unknown'}:${item?.source?.characterId||''}`);
const asset=value=>{const path=text(value);return !path?'':path.startsWith('http')?path:`https://www.bungie.net${path.startsWith('/')?'':'/'}${path}`;};

function itemState(item={}){
  const raw=Number(item?.state||0);
  return {raw,locked:(raw&DESTINY_ITEM_STATE.locked)!==0,masterworked:(raw&DESTINY_ITEM_STATE.masterwork)!==0};
}

function sortInventoryWorkspaceItems(items=[]){
  return [...(Array.isArray(items)?items:[])].sort((left,right)=>{
    const leftOrder=left?.equipmentGroup?.index??INVENTORY_GROUPS.length,rightOrder=right?.equipmentGroup?.index??INVENTORY_GROUPS.length;
    if(leftOrder!==rightOrder)return leftOrder-rightOrder;
    if(Boolean(left?.isExotic)!==Boolean(right?.isExotic))return left.isExotic?-1:1;
    if(Number(right?.power||0)!==Number(left?.power||0))return Number(right?.power||0)-Number(left?.power||0);
    return String(left?.name||'').localeCompare(String(right?.name||''));
  });
}

function groupInventoryWorkspaceItems(items=[],groups=INVENTORY_GROUPS){
  const sorted=sortInventoryWorkspaceItems(items);
  return groups.map(group=>({...group,items:sorted.filter(item=>item?.equipmentGroup?.key===group.key)}));
}

function workspaceGroupLabel(group){
  if(group?.key==='special')return 'Secondary';
  if(group?.key==='legs')return 'Leg';
  return group?.label||'';
}

function directEquipAvailable(item,capabilities={},activeCharacterId=''){
  if(!/^\d+$/.test(String(item?.itemInstanceId||''))||!/^\d+$/.test(String(activeCharacterId||''))||!item?.equipmentGroup)return false;
  if(capabilities.equipItems!==true)return false;
  if(item?.source?.kind==='vault')return capabilities.transferItems===true;
  if(item?.source?.kind==='postmaster'){
    return capabilities.pullFromPostmaster===true&&capabilities.transferItems===true;
  }
  return false;
}

function powerIdentity(item={}){
  const kind=item?.equipmentGroup?.kind;
  const definition=kind==='weapon'
    ?item?.elementDefinition
    :kind==='armour'
      ?item?.armourSemantics?.archetype??item?.archetype
      :null;
  const display=definition?.displayProperties??definition?.definition?.displayProperties??{};
  return {
    icon:asset(definition?.icon??definition?.iconUrl??display.icon??definition?.transparentIconPath),
    label:text(definition?.name??definition?.displayName??display.name)
  };
}

function visualIdentity(definition={}){
  const display=definition?.displayProperties??definition?.definition?.displayProperties??{};
  return {
    icon:asset(definition?.icon??definition?.iconUrl??display.icon??definition?.transparentIconPath),
    label:text(definition?.name??definition?.displayName??display.name)
  };
}

function tileSocketIdentities(item={},kind=''){
  const season=visualIdentity({icon:item?.releaseWatermark?.icon||item?.tierIcon});
  if(kind==='armour'){
    const archetype=item?.armourSemantics?.archetype??item?.archetype??null;
    return {
      season,
      corner:visualIdentity(archetype)
    };
  }
  if(kind==='weapon'){
    return {
      season,
      corner:visualIdentity(item?.weaponSemantics?.intrinsic??item?.intrinsic),
      champion:visualIdentity(item?.breakerDefinition),
      element:visualIdentity(item?.elementDefinition)
    };
  }
  return {season};
}

function tileIconMarkup(className,identity,fallbackLabel){
  if(!identity?.icon)return '';
  const label=identity.label||fallbackLabel;
  return `<span class="${className}" aria-label="${esc(label)}"><img src="${esc(identity.icon)}" alt="" loading="lazy" decoding="async"></span>`;
}

function verifiedItemTier(item={},state=itemState(item)){
  const value=[item?.gearTier,item?.armourTier,item?.armourSemantics?.tier]
    .map(Number)
    .find(tier=>Number.isInteger(tier)&&tier>=1&&tier<=5);
  return value??(state.masterworked?5:0);
}

function tierPipsMarkup(item,state,{legacy=false}={}){
  if(legacy)return state.masterworked?`<span class="vault-transfer-masterwork" aria-label="Masterworked">${Array.from({length:5},()=>'<i aria-hidden="true"></i>').join('')}</span>`:'';
  const tier=verifiedItemTier(item,state);
  if(!tier)return '';
  const tone=tier===5?'gold':'purple';
  return `<span class="tile-tier-strip" aria-label="Tier ${tier}${state.masterworked?' masterworked':''}"></span>${Array.from({length:tier},(_,index)=>`<i class="tile-tier-pip tile-tier-pip--${index+1} tile-tier-pip--${tone}" aria-hidden="true"></i>`).join('')}`;
}

function structuredItemTileMarkup(item,{kind,state,powerMark,power,quantity}={}){
  const sockets=tileSocketIdentities(item,kind),tier=verifiedItemTier(item,state),rarityClass=item?.isExotic?'item-tile--exotic':'item-tile--legendary',tierClass=tier?` item-tile--tier-${tier}`:'',masterworkClass=state.masterworked?' item-tile--masterworked':'',art=item?.icon?`<img src="${esc(item.icon)}" alt="" loading="lazy" decoding="async">`:'<span class="vault-transfer-icon-unavailable" aria-hidden="true">◇</span>',powerMarkup=item?.power===null||item?.power===undefined?'':`<span class="tile-power" aria-label="Power ${esc(item.power)}${powerMark.label?` ${esc(powerMark.label)}`:''}"><b>${esc(item.power)}</b></span>`,lock=state.locked?'<span class="tile-lock" aria-label="Locked"><i aria-hidden="true"></i></span>':'';
  return `<span class="item-tile item-tile--${esc(kind)} ${rarityClass}${tierClass}${masterworkClass}">
      <span class="tile-art">${art}</span>
      <span class="tile-footer">
        ${kind==='weapon'?tileIconMarkup('tile-intrinsic',sockets.champion,'Champion capability'):''}
        ${kind==='weapon'?tileIconMarkup('tile-element',sockets.element,'Elemental damage type'):''}
        ${powerMarkup}
      </span>
      ${tileIconMarkup('tile-corner-badge',sockets.corner,kind==='weapon'?'Weapon intrinsic':'Armour archetype')}
      ${tierPipsMarkup(item,state)}
      ${tileIconMarkup('tile-season-icon',sockets.season,'Season or source emblem')}
      ${quantity}${lock}
    </span>`;
}

function inventoryItemMarkup(item,{draggable=true,pullCharacterId='',capabilities={},activeCharacterId=''}={}){
  const key=itemKey(item),kind=item?.equipmentGroup?.kind||'',structured=kind==='weapon'||kind==='armour',sourceKind=String(item?.source?.kind||''),equipped=sourceKind==='equipped',state=itemState(item),canDrag=draggable&&capabilities.transferItems===true&&Boolean(item?.itemInstanceId)&&['equipped','carried','vault'].includes(sourceKind)&&(!equipped||capabilities.equipItems===true),canPull=Boolean(pullCharacterId)&&capabilities.pullFromPostmaster===true&&/^\d+$/.test(String(item?.itemInstanceId||'')),canDirectEquip=directEquipAvailable(item,capabilities,activeCharacterId),powerMark=powerIdentity(item),power=item?.power===null||item?.power===undefined?'':`<span class="vault-transfer-power" aria-label="Power ${esc(item.power)}${powerMark.label?` ${esc(powerMark.label)}`:''}">${powerMark.icon?`<img src="${esc(powerMark.icon)}" alt="">`:''}<b>${esc(item.power)}</b></span>`,quantity=Number(item?.quantity||1)>1?`<span class="vault-transfer-quantity" aria-label="Quantity ${esc(item.quantity)}">${esc(item.quantity)}</span>`:'';
  const masterwork=tierPipsMarkup(item,state,{legacy:true});
  const lock=state.locked?'<span class="vault-transfer-lock" aria-label="Locked"><i aria-hidden="true"></i></span>':'';
  const directHint=canDirectEquip?' Double click to review equipping this exact item on the active Guardian.':'';
  return `<article class="vault-transfer-item${structured?' has-item-tile':''}${item?.isExotic?' is-exotic':''}${equipped?' is-equipped':''}${canDrag?' is-draggable':''}" data-inspect-item="${esc(key)}" data-item-kind="${esc(kind)}" data-item-source="${esc(sourceKind)}" data-item-state="${state.raw}" title="${esc(item.name)}"${canDrag?` draggable="true" data-drag-item="${esc(key)}"`:''}${canDirectEquip?` data-direct-equip-item="${esc(key)}"`:''} tabindex="0" aria-label="${esc(item.name)}${equipped?' equipped':''}${state.locked?' locked':''}${state.masterworked?' masterworked':''}${canDrag?' draggable':''}.${esc(directHint)}">
    ${structured?structuredItemTileMarkup(item,{kind,state,powerMark,power,quantity}):`<span class="vault-transfer-art">${item?.icon?`<img src="${esc(item.icon)}" alt="" loading="lazy" decoding="async">`:'<span class="vault-transfer-icon-unavailable" aria-hidden="true">◇</span>'}${masterwork}${power}${quantity}${lock}</span>`}
    ${pullCharacterId?`<button class="vault-postmaster-pull" type="button" data-pull-postmaster-item="${esc(key)}" data-postmaster-character-id="${esc(pullCharacterId)}"${canPull?'':' disabled'}>PULL</button>`:''}
  </article>`;
}

function inventoryGroupsMarkup(items=[],{includeEmpty=false,equippedFirst=false,pullCharacterId='',capabilities={},activeCharacterId=''}={}){
  const groups=groupInventoryWorkspaceItems(items).filter(group=>includeEmpty||group.items.length);
  if(!groups.length)return '<p class="vault-transfer-empty">Bungie returned no supported inventory items for this section.</p>';
  let family='';
  return groups.map(group=>{
    const heading=group.kind!==family?(family=group.kind,`<h5 class="vault-transfer-family">${esc(group.kind==='weapon'?'WEAPONS':group.kind==='armour'?'ARMOUR':'EQUIPMENT')}</h5>`):'',ordered=equippedFirst?[...group.items].sort((left,right)=>Number(right?.source?.kind==='equipped')-Number(left?.source?.kind==='equipped')):group.items;
    return `${heading}<section class="vault-transfer-group" data-equipment-group="${esc(group.key)}"><header><strong>${esc(workspaceGroupLabel(group))}</strong><span>${ordered.length}</span></header><div class="vault-transfer-items">${ordered.length?ordered.map(item=>inventoryItemMarkup(item,{pullCharacterId,capabilities,activeCharacterId})).join(''):'<span class="vault-transfer-row-empty">EMPTY</span>'}</div></section>`;
  }).join('');
}

function postmasterMarkup({characterId,items=[],characterLabel='Guardian',capabilities={},activeCharacterId=''}={}){
  const rows=(Array.isArray(items)?items:[]).filter(item=>text(item?.source?.characterId)===text(characterId)),equipment=rows.filter(item=>item.equipmentGroup),other=rows.filter(item=>!item.equipmentGroup),transferable=rows.filter(item=>/^\d+$/.test(String(item?.itemInstanceId||''))),collectReady=Boolean(transferable.length)&&capabilities.pullFromPostmaster===true;
  const groups=inventoryGroupsMarkup(equipment,{pullCharacterId:characterId,capabilities,activeCharacterId}),otherMarkup=other.length?`<h5 class="vault-transfer-family">OTHER POSTMASTER ITEMS</h5><div class="vault-transfer-items">${other.map(item=>inventoryItemMarkup(item,{draggable:false,pullCharacterId:characterId,capabilities,activeCharacterId})).join('')}</div>`:'';
  return `<section class="vault-character-section vault-postmaster-section"><header><div><h4>${esc(String(characterLabel).toUpperCase())} POSTMASTER</h4><span>${rows.length} ITEM${rows.length===1?'':'S'}</span></div><button type="button" data-collect-postmaster="${esc(characterId)}"${collectReady?'':' disabled'}>PULL ALL</button></header>${rows.length?`${groups}${otherMarkup}`:'<p class="vault-transfer-empty">Bungie reports no items in this Postmaster.</p>'}</section>`;
}

function equippedAndCarriedMarkup({characterId,items=[],capabilities={},activeCharacterId='',sectionLabel='EQUIPPED AND CARRIED'}={}){
  const rows=(Array.isArray(items)?items:[]).filter(item=>['equipped','carried'].includes(item?.source?.kind)&&text(item?.source?.characterId)===text(characterId));
  return `<section class="vault-character-section vault-equipped-carried-section"><header><div><h4>${esc(sectionLabel)}</h4><span>${rows.length} ITEMS</span></div></header>${inventoryGroupsMarkup(rows,{includeEmpty:true,equippedFirst:true,capabilities,activeCharacterId})}</section>`;
}

function vaultOnlyMarkup({items=[],capabilities={},activeCharacterId=''}={}){
  const rows=(Array.isArray(items)?items:[]).filter(item=>item?.source?.kind==='vault');
  return `<section class="vault-only-section" data-drop-kind="vault"><header><div><span>SHARED ACCOUNT STORAGE</span><h3>VAULT ONLY</h3></div><strong>${rows.length} SORTED ITEM${rows.length===1?'':'S'}</strong></header><p>Drop carried or equipped items here. The shared account pool stays within the width of the three Guardian columns and wraps inside each Bungie category.</p>${inventoryGroupsMarkup(rows,{includeEmpty:true,capabilities,activeCharacterId})}</section>`;
}

function bindInventoryWorkspaceHovers(root,{resolveItem=()=>null,bindHover=()=>{}}={}){
  root?.querySelectorAll?.('[data-inspect-item]').forEach(target=>{
    const item=resolveItem(target.dataset.inspectItem),kind=item?.equipmentGroup?.kind;
    if(kind==='weapon'||kind==='armour')bindHover(target,item,kind,{contextLabel:item.source?.kind==='vault'?'VAULT':''});
  });
}

function bindInventoryWorkspaceInteractions(root,{onPullItem=()=>{},onPullAll=()=>{},onDirectEquip=()=>{}}={}){
  if(!root)return ()=>{};
  const click=event=>{
    const itemButton=event.target.closest?.('[data-pull-postmaster-item]');
    if(itemButton&&!itemButton.disabled){onPullItem(itemButton.dataset.postmasterCharacterId,itemButton.dataset.pullPostmasterItem);return;}
    const allButton=event.target.closest?.('[data-collect-postmaster]');
    if(allButton&&!allButton.disabled)onPullAll(allButton.dataset.collectPostmaster);
  };
  const doubleClick=event=>{
    if(event.target.closest?.('button'))return;
    const tile=event.target.closest?.('[data-direct-equip-item]');
    if(tile){event.preventDefault();onDirectEquip(tile.dataset.directEquipItem);}
  };
  root.addEventListener('click',click);
  root.addEventListener('dblclick',doubleClick);
  return ()=>{root.removeEventListener('click',click);root.removeEventListener('dblclick',doubleClick);};
}

export {
  ARMOUR_BUCKETS,
  CHARACTER_EQUIPMENT_BUCKETS,
  DESTINY_ITEM_STATE,
  EQUIPMENT_GROUPS,
  EQUIPMENT_GROUP_BY_HASH,
  INVENTORY_GROUPS,
  WEAPON_BUCKETS,
  bindInventoryWorkspaceHovers,
  bindInventoryWorkspaceInteractions,
  directEquipAvailable,
  equippedAndCarriedMarkup,
  groupInventoryWorkspaceItems,
  inventoryGroupsMarkup,
  inventoryItemMarkup,
  itemKey,
  itemState,
  postmasterMarkup,
  sortInventoryWorkspaceItems,
  vaultOnlyMarkup,
  workspaceGroupLabel
};
