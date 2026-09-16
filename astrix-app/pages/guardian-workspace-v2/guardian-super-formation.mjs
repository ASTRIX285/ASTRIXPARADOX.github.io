import {cleanImageElement} from './guardian-bungie-icon-cleaner.mjs?v=20260824-icon-cleaner-2';
import {LOADOUT_DEFINITIONS} from './guardian-loadout-definitions.mjs';
import {mergeSuperOptions} from './guardian-super-catalog.mjs?v=20260916-equipped-source-1';

const BUNGIE='https://www.bungie.net';
const SUBCLASS_KEYS=Object.freeze(['void','arc','solar','strand','stasis','prismatic']);
const ALTERNATE_SLOT_LAYOUTS=Object.freeze({
  0:Object.freeze([]),
  1:Object.freeze(['alternate-3']),
  2:Object.freeze(['alternate-3','alternate-4']),
  3:Object.freeze(['alternate-1','alternate-3','alternate-4']),
  4:Object.freeze(['alternate-1','alternate-3','alternate-4','alternate-2'])
});
const PRISMATIC_HEADER_ICON_HASH=814121290;
const PRISMATIC_HEADER_ICON=LOADOUT_DEFINITIONS.icons?.[PRISMATIC_HEADER_ICON_HASH]?.iconImagePath||'';
const SUBCLASS_PICKER_ICONS=Object.freeze({
  arc:'/common/destiny2_content/icons/949af7a61d60a8e6071282daafa9e6e9.png',
  solar:'/common/destiny2_content/icons/fedcb91b7ab0584c12f0e9fec730702b.png',
  void:'/common/destiny2_content/icons/32b112a9460e6f0e2b9ee15dc53fe1c1.png',
  stasis:'/common/destiny2_content/icons/6e441ffa8c8171ce9caf71e51b72fc19.png',
  strand:'/common/destiny2_content/icons/41c0024ce809085ac16f4e0777ea0ac4.png',
  prismatic:PRISMATIC_HEADER_ICON
});

function resolvedSuperIcon(item){
  if(!item)return '';
  const display=item?.definition?.displayProperties||item?.displayProperties||{};
  const sequenceFrame=Array.isArray(display?.iconSequences)
    ? display.iconSequences.flatMap(sequence=>Array.isArray(sequence?.frames)?sequence.frames:[]).find(Boolean)
    : '';
  return item.icon||display.icon||display.highResIcon||sequenceFrame||item?.definition?.secondaryIcon||item?.secondaryIcon||'';
}

function absoluteIcon(path){
  if(!path)return '';
  const value=String(path);
  return /^(?:https?:|data:|blob:)/i.test(value)?value:`${BUNGIE}${value}`;
}
function itemKey(item){return String(item?.hash??item?.itemHash??item?.name??resolvedSuperIcon(item)??'');}
function detectedSubclassKey(value,activeSuper){
  const text=[value,activeSuper?.element,activeSuper?.subclass,activeSuper?.damageType,activeSuper?.name].filter(Boolean).join(' ').toLowerCase();
  return SUBCLASS_KEYS.find(key=>text.includes(key))||'';
}
function subclassKey(value,activeSuper){return detectedSubclassKey(value,null)||detectedSubclassKey('',activeSuper)||'void';}
function uniqueItems(items){return items.filter(Boolean).filter((item,index,rows)=>rows.findIndex(other=>itemKey(other)===itemKey(item))===index);}
function subclassBuild(item){return item?.subclassBuild||item?.build||{};}

function resolveSuperFormationSlots({activeSuper=null,superOptions=[],subclass='',subclassCatalog=[],characterClass='hunter'}={}){
  const activeElement=subclassKey(subclass,activeSuper);
  const catalog=(Array.isArray(subclassCatalog)?subclassCatalog:[]).filter(Boolean).filter((item,index,rows)=>{
    const element=detectedSubclassKey([item?.element,item?.subclass,item?.key,item?.name,item?.displayName].filter(Boolean).join(' '),null);
    return element&&rows.findIndex(other=>detectedSubclassKey([other?.element,other?.subclass,other?.key,other?.name,other?.displayName].filter(Boolean).join(' '),null)===element)===index;
  });
  const activeSubclass=catalog.find(item=>detectedSubclassKey([item?.element,item?.subclass,item?.key,item?.name,item?.displayName].filter(Boolean).join(' '),null)===activeElement)||null;
  const activeBuild=subclassBuild(activeSubclass);
  const currentOptions=mergeSuperOptions(characterClass,activeElement,uniqueItems([
    activeSuper,
    ...(Array.isArray(superOptions)?superOptions:[]),
    ...(Array.isArray(activeBuild?.superOptions)?activeBuild.superOptions:[])
  ]));
  const requestedActive=currentOptions.some(item=>itemKey(item)===itemKey(activeSuper))?activeSuper:null;
  const resolvedActive=currentOptions.find(item=>itemKey(item)===itemKey(requestedActive))||null;
  const activeId=itemKey(resolvedActive);
  const entries=[{slot:'equipped',item:resolvedActive,role:'equipped-super-large',element:activeElement,selected:false}];
  const alternatives=currentOptions.filter(item=>itemKey(item)!==activeId).slice(0,4);
  const alternateSlots=ALTERNATE_SLOT_LAYOUTS[alternatives.length]||ALTERNATE_SLOT_LAYOUTS[4];
  alternatives.forEach((item,index)=>entries.push({slot:alternateSlots[index],item,role:'alternate-super',element:activeElement,selected:false}));
  for(const slot of ['alternate-1','alternate-2','alternate-3','alternate-4'])if(!entries.some(entry=>entry.slot===slot))entries.push({slot,item:null,role:'alternate-super',element:activeElement,selected:false});
  entries.push({slot:'alternate-5',item:resolvedActive,role:'equipped-super-small',element:activeElement,selected:Boolean(resolvedActive)});
  return {activeElement,activeSuper:resolvedActive,superOptions:currentOptions,entries};
}

function renderEquippedSubclass({root,iconNode,nameNode,metaNode,subclass='',subclassName='',characterClass='',icon=''}={}){
  if(!root)return;
  const key=subclassKey([subclass,subclassName].filter(Boolean).join(' '),null);
  const classLabel=String(characterClass||'Guardian').trim();
  const suppliedLabel=String(subclassName||subclass||'Subclass').trim();
  const subclassLabel=SUBCLASS_KEYS.includes(key)?key:suppliedLabel;
  const identity=suppliedLabel.toLowerCase().includes(classLabel.toLowerCase())
    ? suppliedLabel
    : `${subclassLabel} ${classLabel}`;

  document.documentElement.dataset.subclass=key;
  root.dataset.subclass=key;
  if(nameNode)nameNode.textContent=identity.toUpperCase();
  if(metaNode)metaNode.textContent=`${classLabel} SUBCLASS`.toUpperCase();
  if(iconNode){
    const src=absoluteIcon(key==='prismatic'?PRISMATIC_HEADER_ICON:icon);
    iconNode.alt=src?`${identity} subclass icon`:'';
    iconNode.hidden=!src;
    root.classList.toggle('has-live-icon',Boolean(src));
    if(src)void cleanImageElement(iconNode,src);
    else iconNode.removeAttribute('src');
  }
}

function renderSubclassPicker({root,characterClass='',subclass='',subclassOptions=[],selectKind='',onSelect=null}={}){
  if(!root)return;
  const active=subclassKey(subclass,null);
  const options=Array.isArray(subclassOptions)?subclassOptions.filter(Boolean):[];
  root.querySelectorAll('.el[data-element]').forEach(button=>{
    const element=String(button.dataset.element||'').toLowerCase();
    const optionIndex=options.findIndex(item=>subclassKey([item?.element,item?.subclass,item?.key,item?.name,item?.displayName].filter(Boolean).join(' '),null)===element);
    const option=options[optionIndex]||null;
    const iconPath=SUBCLASS_PICKER_ICONS[element]||'';
    const icon=button.querySelector('.icon');
    const selected=element===active;
    const unlocked=Boolean(option)||(!options.length&&selected);
    button.onclick=null;
    button.onkeydown=null;
    button.removeAttribute('data-select-kind');
    button.removeAttribute('data-select-index');
    button.removeAttribute('data-bungie-hash');
    button.disabled=!unlocked;
    button.classList.toggle('is-locked',!unlocked);
    button.classList.toggle('is-active',selected);
    button.setAttribute('aria-selected',String(selected));
    button.dataset.bungieArtworkSource=element==='prismatic'?'DestinyLoadoutIconDefinition':'DestinyInventoryItemDefinition';
    button.dataset.bungieArtworkHash=element==='prismatic'?String(PRISMATIC_HEADER_ICON_HASH):String(option?.bungieHash??option?.hash??option?.itemHash??'');
    if(icon)icon.style.backgroundImage=iconPath?`url("${absoluteIcon(iconPath)}")`:'';
    if(!option)return;
    button.dataset.bungieHash=String(option?.bungieHash??option?.hash??option?.itemHash??'');
    if(selectKind){button.dataset.selectKind=selectKind;button.dataset.selectIndex=String(optionIndex);}
    if(typeof onSelect==='function'){
      const select=()=>onSelect(option,optionIndex,button);
      button.onclick=select;
      button.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select();}};
    }
  });
}

function setDiamondFromItem(diamond,item,fallbackTitle='Super unavailable'){
  if(!diamond)return;
  const holder=diamond.querySelector('span');
  if(!holder)return;
  const title=String(item?.name||item?.displayName||fallbackTitle).trim();
  const src=absoluteIcon(resolvedSuperIcon(item));
  diamond.onclick=null;
  diamond.onkeydown=null;
  diamond.removeAttribute('data-select-kind');
  diamond.removeAttribute('data-select-index');
  diamond.removeAttribute('data-bungie-hash');
  if(src){
    let image=holder.querySelector('img.super-feature__icon');
    if(!image){holder.textContent='';image=document.createElement('img');image.className='super-feature__icon';holder.appendChild(image);}
    image.alt=title;
    image.decoding='async';
    image.src=src;
    image.dataset.bungieOriginalSrc=src;
    image.dataset.bungieArtworkSource='DestinyInventoryItemDefinition';
    diamond.classList.add('has-live-icon');
    diamond.dataset.bungieArtworkSource='DestinyInventoryItemDefinition';
    diamond.dataset.bungieHash=String(item?.bungieHash??item?.hash??item?.itemHash??'');
    diamond.tabIndex=0;
    diamond.setAttribute('role','button');
  }else{
    holder.replaceChildren();
    diamond.classList.remove('has-live-icon');
    delete diamond.dataset.bungieArtworkSource;
    diamond.tabIndex=-1;
    diamond.removeAttribute('role');
  }
  diamond.title=title;
  diamond.setAttribute('aria-label',title);
}

function renderSuperFormation({host,nameNode=null,activeSuper=null,superOptions=[],subclass='',subclassCatalog=[],characterClass='hunter',selectKind='',onSelect=null}={}){
  if(!host)return;
  const feature=host.closest('.super-feature')||host;
  const mapping=resolveSuperFormationSlots({activeSuper,superOptions,subclass,subclassCatalog,characterClass});
  const options=mapping.superOptions;
  const resolvedActive=mapping.activeSuper;
  const activeId=itemKey(resolvedActive);
  feature.dataset.superSubclass=mapping.activeElement;
  /* The exact six-slot PSD frame is structural. Unresolved alternates remain
   * visible as transparent frames instead of collapsing the formation. */
  const slots=['equipped','alternate-5','alternate-4','alternate-3','alternate-2','alternate-1'].map(key=>host.querySelector(`[data-super-slot="${key}"]`));
  const slotByKey=new Map(slots.map(slot=>[slot?.dataset?.superSlot,slot]));
  const resolvedCount=mapping.entries.filter(entry=>Boolean(entry.item)).length;
  host.dataset.superCount='6';
  feature.dataset.superCount='6';
  host.dataset.resolvedSuperCount=String(resolvedCount);
  feature.dataset.resolvedSuperCount=String(resolvedCount);
  host.dataset.activeSuper=activeId;
  host.dataset.superState=resolvedActive?'resolved':'unresolved';

  mapping.entries.forEach((entry,index)=>{
    const slot=slotByKey.get(entry.slot)||null;
    const item=entry.item||null;
    if(slot)slot.hidden=false;
    setDiamondFromItem(slot,item,entry.role.startsWith('equipped-super')?'Equipped Super unavailable':`${entry.element} Super unavailable`);
    slot?.classList.toggle('is-empty-super',!item);
    if(slot){slot.dataset.superRole=entry.role;slot.dataset.superElement=entry.element;}
    const selected=entry.selected&&Boolean(item);
    slot?.classList.toggle('is-selected',selected);
    slot?.classList.toggle('is-selected-super',selected);
    slot?.setAttribute('aria-current',selected?'true':'false');
    if(slot){slot.onclick=null;slot.onkeydown=null;delete slot.dataset.selectKind;delete slot.dataset.selectIndex;}
    if(!slot||!item)return;
    const optionIndex=options.findIndex(option=>itemKey(option)===itemKey(item));
    if(selectKind&&optionIndex>=0){slot.dataset.selectKind=selectKind;slot.dataset.selectIndex=String(optionIndex);}
    if(optionIndex>=0&&typeof onSelect==='function'){
      const select=()=>{
        slots.forEach(node=>{node?.classList.toggle('is-selected',node===slot);node?.classList.toggle('is-selected-super',node===slot);node?.setAttribute('aria-current',node===slot?'true':'false');});
        if(nameNode)nameNode.textContent=item.name||item.displayName||'SELECTED SUPER';
        onSelect(item,optionIndex,slot);
      };
      slot.onclick=select;
      slot.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select();}};
    }
  });

  if(nameNode)nameNode.textContent=resolvedActive?.name||resolvedActive?.displayName||'EQUIPPED SUPER UNAVAILABLE';
}

export {renderEquippedSubclass,renderSubclassPicker,renderSuperFormation,resolveSuperFormationSlots,resolvedSuperIcon,setDiamondFromItem};
