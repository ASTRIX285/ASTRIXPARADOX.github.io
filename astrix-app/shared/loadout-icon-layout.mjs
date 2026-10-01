import {WEAPON_BUCKETS,ARMOUR_BUCKETS} from '../pages/guardian-workspace-v2/guardian-perk-change-plan.mjs';
import {bungieArtwork} from './loadout-details-model.mjs?v=20260927-loadout-details-1&grid=20261001-1';
// Build Forge renders at CSS zoom 0.75 on desktop. Rects are in visual pixels,
// style lengths in the element's own pixels, so convert before positioning.
const cssZoomOf=node=>{const own=Number(node?.currentCSSZoom);if(own>0)return own;try{const root=parseFloat(getComputedStyle(document.documentElement).zoom);return root>0?root:1;}catch{return 1;}};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function loadoutIcon(item,{large=false}={}){
  const name=item.name||'Empty socket',src=bungieArtwork(item.icon);
  const details=[item.description,item.notOwned?'Not in your inventory':'',item.alternative?`Closest in inventory: ${item.alternative.definition?.displayProperties?.name||''}`:'',...(item.statFocus||[]).map(stat=>`${stat.name}: ${stat.value>0?'+':''}${stat.value}${stat.conditional?' (conditional)':''}`)].filter(Boolean).join('\n');
  return `<button type="button" class="apx-build-icon${large?' apx-build-icon--gear':''}" aria-label="${esc(name)}" data-icon-name="${esc(name)}" data-icon-detail="${esc(details)}"${item.notOwned?' data-not-owned':''}>${src?`<img src="${esc(src)}" alt="" loading="lazy" decoding="async">`:'<span class="apx-ld-empty" aria-hidden="true"></span>'}</button>`;
}
function group(label,plugs=[]){return plugs.length?`<section class="apx-icon-group" aria-label="${esc(label)}"><h4>${esc(label)}</h4><div class="apx-icon-strip">${plugs.map(item=>loadoutIcon(item)).join('')}</div></section>`:'';}
export function renderEquipmentIcons(items=[]){return `<div class="apx-icon-strip apx-icon-equipment">${items.map(item=>`<div class="apx-icon-column">${loadoutIcon(item,{large:true})}${(item.groups||[]).map(g=>group(g.label,g.plugs)).join('')}</div>`).join('')}</div>`;}
export function renderLoadoutIconLayout(model){
  const rows=(model.items||[]).filter(row=>row.equipped!==false),subclass=rows.find(row=>row.kind==='subclass');
  const icon=(item,large=false)=>loadoutIcon({...item,description:'',statFocus:[],alternative:null,notOwned:false},{large}).replace(/ data-icon-detail="[^"]*"/,'');
  const strip=(label,items,large=false)=>items.length?`<div class="apx-compact-strip" role="group" aria-label="${esc(label)}">${items.map(item=>icon(item,large)).join('')}</div>`:'';
  const cosmetic=plug=>plug.semanticRole==='appearance'||/shader|ornament|memento|skin/.test(plug.definition?.plug?.plugCategoryIdentifier||'');
  const parameters=rows.filter(row=>row.kind==='parameters').flatMap(row=>row.groups||[]);
  const powers=['Super','Abilities','Aspects','Fragments','Other sockets'].flatMap(label=>subclass?.groups?.find(g=>g.label===label)?.plugs||[]);
  const sockets=rows.filter(row=>['weapon','armour'].includes(row.kind)).flatMap(row=>row.sockets||[]);
  // The seasonal artifact is its own section, as in DIM and in game, never mixed into mods.
  const artifact=parameters.filter(g=>g.label==='Artifact unlocks').flatMap(g=>g.plugs||[]);
  const extras=parameters.filter(g=>!['Stat targets','Set bonuses','Exotic armour','In-game identifiers','Artifact unlocks'].includes(g.label)).flatMap(g=>g.plugs||[]);
  const cosmetics=[...sockets,...extras].filter(cosmetic),mods=[...sockets,...extras].filter(plug=>!cosmetic(plug));
  const gear=kind=>rows.filter(row=>row.kind===kind).sort((a,b)=>(kind==='weapon'?WEAPON_BUCKETS:ARMOUR_BUCKETS).indexOf(a.bucketHash)-(kind==='weapon'?WEAPON_BUCKETS:ARMOUR_BUCKETS).indexOf(b.bucketHash));
  const unique=items=>items.filter((item,i)=>items.findIndex(other=>other.hash===item.hash)===i);
  const weapons=strip('Weapons',gear('weapon'),true),armour=strip('Armour',gear('armour'),true);
  const equipment=strip('Equipment',rows.filter(row=>row.kind==='item'),true);
  return `<div class="apx-compact-loadout"><div class="apx-compact-powers">${strip('Super and abilities',powers)}<div class="apx-compact-mods">${strip('Mods',mods)}${artifact.length?`<div class="apx-compact-artifact"><span class="apx-compact-label">Artifact</span>${strip('Artifact perks',artifact)}</div>`:''}</div></div><div class="apx-compact-gear">${weapons}${weapons&&armour?'<span class="apx-icon-divider" aria-hidden="true"></span>':''}${armour}</div>${cosmetics.length||equipment?`<div class="apx-compact-cosmetics">${strip('Cosmetics and shaders',unique(cosmetics))}${equipment}</div>`:''}${strip('Unequipped items',(model.items||[]).filter(row=>row.equipped===false),true)}</div>`;
}
// Compact grid for in-game loadouts (DIM's layout as reference, our tiles): one row per
// item, the item on the left and its sockets as icon tiles in the same row. No text under
// icons: name, description and stat effects live in the shared tooltip (hover, focus, tap).
const GRID_SUBCLASS_GROUPS=['Super','Abilities','Aspects','Fragments'];
const hiddenSocket=(group,plug)=>group.label==='Other sockets'&&plug.empty&&!plug.definition;
function gridPlug(plug){
  if(plug.empty)return `<span class="apx-ld-socket-empty" role="img" aria-label="Empty socket"></span>`;
  return loadoutIcon(plug);
}
function gridRow(item,label,groups,kind=item?.kind||''){
  const cells=groups.map(group=>({label:group.label,plugs:(group.plugs||[]).filter(plug=>!hiddenSocket(group,plug))})).filter(group=>group.plugs.length);
  const art=item?loadoutIcon({...item,name:item.unresolved?`${item.name}. Not in your inventory`:item.name},{large:true}):'<span class="apx-ld-socket-empty is-gear" role="img" aria-label="Empty slot"></span>';
  return `<div class="apx-ld-row" data-item-kind="${esc(kind)}" role="group" aria-label="${esc(label)}"><div class="apx-ld-row-item">${art}</div><div class="apx-ld-row-plugs">${cells.map(group=>`<div class="apx-ld-cell" role="group" aria-label="${esc(group.label)}">${group.plugs.map(gridPlug).join('')}</div>`).join('')}</div></div>`;
}
export function renderLoadoutGridLayout(model){
  const rows=model.items||[],subclass=rows.find(row=>row.kind==='subclass');
  const order=(kind,buckets)=>rows.filter(row=>row.kind===kind).sort((a,b)=>buckets.indexOf(a.bucketHash)-buckets.indexOf(b.bucketHash));
  const artifact=rows.filter(row=>row.kind==='parameters').flatMap(row=>row.groups||[]).filter(group=>group.label==='Artifact unlocks');
  const subclassGroups=subclass?GRID_SUBCLASS_GROUPS.map(label=>subclass.groups?.find(group=>group.label===label)).filter(Boolean):[];
  return `<div class="apx-ld-grid">${subclass?gridRow(subclass,'Subclass',subclassGroups):''}${artifact.length?gridRow({name:'Artifact',icon:''},'Artifact',artifact,'artifact'):''}${order('weapon',WEAPON_BUCKETS).map(item=>gridRow(item,item.name,item.groups||[])).join('')}${order('armour',ARMOUR_BUCKETS).map(item=>gridRow(item,item.name,item.groups||[])).join('')}${rows.filter(row=>row.kind==='unresolved').map(item=>gridRow(item,item.name,[])).join('')}</div>`;
}
// One tooltip outside the scrolling content: names remain available to pointer,
// keyboard and touch users without widening every tile. Text is never HTML.
export function bindLoadoutIconDetails(root){
  const doc=root.ownerDocument,tip=doc.createElement('div');
  tip.className='apx-icon-tooltip';tip.hidden=true;tip.setAttribute('role','tooltip');
  tip.id=`apx-icon-tip-${++tooltipSequence}`;root.append(tip);
  const controller=new doc.defaultView.AbortController(),options={signal:controller.signal};let active=null;
  function hide(){active?.removeAttribute('aria-describedby');active=null;tip.hidden=true;}
  function show(button){
    if(!button)return;hide();active=button;tip.replaceChildren();
    const heading=doc.createElement('strong');heading.textContent=button.dataset.iconName;tip.append(heading);
    if(button.dataset.iconDetail){const copy=doc.createElement('p');copy.textContent=button.dataset.iconDetail;tip.append(copy);}
    tip.hidden=false;button.setAttribute('aria-describedby',tip.id);
    const zoom=cssZoomOf(tip),visual=button.getBoundingClientRect(),rect={left:visual.left/zoom,bottom:visual.bottom/zoom},width=doc.documentElement.clientWidth,height=doc.documentElement.clientHeight;
    tip.style.left=`${Math.max(12,Math.min(rect.left,width-tip.offsetWidth-12))}px`;
    tip.style.top=`${Math.max(12,Math.min(rect.bottom+8,height-tip.offsetHeight-12))}px`;
  }
  const tile=event=>event.target.closest?.('[data-icon-name]');
  root.addEventListener('pointerover',event=>{if(event.pointerType!=='touch')show(tile(event));},options);
  root.addEventListener('pointerout',event=>{if(active&&!active.contains(event.relatedTarget)&&!tip.contains(event.relatedTarget)&&doc.activeElement!==active)hide();},options);
  root.addEventListener('focusin',event=>show(tile(event)),options);
  root.addEventListener('focusout',hide,options);
  root.addEventListener('click',event=>{const button=tile(event);if(button)show(button);else hide();},options);
  root.addEventListener('keydown',event=>{if(event.key==='Escape'&&!tip.hidden){event.preventDefault();event.stopPropagation();hide();}},options);
  root.addEventListener('scroll',hide,{...options,capture:true});
  doc.defaultView.addEventListener('resize',hide,options);
  return ()=>{controller.abort();hide();tip.remove();};
}
let tooltipSequence=0;
