import {WEAPON_BUCKETS,ARMOUR_BUCKETS} from '../pages/guardian-workspace-v2/guardian-perk-change-plan.mjs';
import {bungieArtwork} from './loadout-details-model.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function loadoutIcon(item,{large=false}={}){
  const name=item.name||'Empty socket',src=bungieArtwork(item.icon);
  const details=[item.description,item.notOwned?'Not in your inventory':'',item.alternative?`Closest in inventory: ${item.alternative.definition?.displayProperties?.name||''}`:'',...(item.statFocus||[]).map(stat=>`${stat.name}: ${stat.value>0?'+':''}${stat.value}${stat.conditional?' (conditional)':''}`)].filter(Boolean).join('\n');
  return `<button type="button" class="apx-build-icon${large?' apx-build-icon--gear':''}" aria-label="${esc(name)}" data-icon-name="${esc(name)}" data-icon-detail="${esc(details)}"${item.notOwned?' data-not-owned':''}>${src?`<img src="${esc(src)}" alt="" loading="lazy" decoding="async">`:'<span class="apx-ld-empty" aria-hidden="true"></span>'}</button>`;
}
function group(label,plugs=[]){return plugs.length?`<section class="apx-icon-group" aria-label="${esc(label)}"><h4>${esc(label)}</h4><div class="apx-icon-strip">${plugs.map(item=>loadoutIcon(item)).join('')}</div></section>`:'';}
export function renderEquipmentIcons(items=[]){return `<div class="apx-icon-strip apx-icon-equipment">${items.map(item=>`<div class="apx-icon-column">${loadoutIcon(item,{large:true})}${(item.groups||[]).map(g=>group(g.label,g.plugs)).join('')}</div>`).join('')}</div>`;}
export function renderLoadoutIconLayout(model){
  const rows=model.items||[],equipped=rows.filter(row=>row.equipped!==false),subclass=equipped.find(row=>row.kind==='subclass');
  const section=(label,content)=>content?`<section class="apx-icon-section" aria-label="${esc(label)}"><h3>${esc(label)}</h3>${content}</section>`:'';
  const powers=subclass?`<div class="apx-icon-powers">${['Super','Abilities','Aspects','Fragments','Other sockets'].map(label=>group(label,subclass.groups?.find(g=>g.label===label)?.plugs)).join('')}</div>`:'';
  const gear=(kind,label)=>{const order=kind==='weapon'?WEAPON_BUCKETS:kind==='armour'?ARMOUR_BUCKETS:[];const items=equipped.filter(row=>row.kind===kind).sort((a,b)=>order.indexOf(a.bucketHash)-order.indexOf(b.bucketHash));return items.length?section(label,renderEquipmentIcons(items)):'';};
  return `${rows.some(row=>row.notOwned)?'<p class="apx-ld-note">Outlined items are not in your inventory. Inspect an icon to check its details.</p>':''}${section('Super & abilities',powers|| (subclass?loadoutIcon(subclass,{large:true}):''))}${gear('weapon','Weapons')}${gear('armour','Armour')}${gear('item','Equipment')}${section('Build settings',equipped.filter(row=>row.kind==='parameters').flatMap(row=>row.groups||[]).map(g=>group(g.label,g.plugs)).join(''))}${rows.some(row=>row.equipped===false)?section('Unequipped items',renderEquipmentIcons(rows.filter(row=>row.equipped===false))):''}`;
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
    const rect=button.getBoundingClientRect(),width=doc.documentElement.clientWidth,height=doc.documentElement.clientHeight;
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
