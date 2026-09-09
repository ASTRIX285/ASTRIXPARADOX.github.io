const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function perkTooltipAttributes(item,label=''){
  const definition=item?.definition||{};
  const name=item?.name||item?.displayName||item?.displayProperties?.name||definition.displayProperties?.name||'Unresolved perk';
  const description=item?.description||item?.displayProperties?.description||definition.displayProperties?.description||'';
  const category=item?.itemTypeDisplayName||definition.itemTypeDisplayName||'';
  return `data-paradox-perk-tooltip data-perk-name="${esc(name)}" data-perk-description="${esc(description)}" data-perk-category="${esc(category)}" data-perk-state="${esc(label)}" tabindex="0" role="button" aria-label="${esc(name)} details"`;
}

export function perkTooltipMarkup(data){
  return `<header><strong>${esc(data.perkName)}</strong>${data.perkCategory?`<span>${esc(data.perkCategory)}</span>`:''}</header><div>${data.perkDescription?`<p>${esc(data.perkDescription)}</p>`:'<p>Description not returned by Bungie.</p>'}${data.perkState?`<small>${esc(data.perkState)}</small>`:''}</div>`;
}

let anchor=null,host=null,hideTimer=null;
function hide(){
  clearTimeout(hideTimer);
  anchor?.classList.remove('is-perk-inspected');anchor?.removeAttribute('aria-describedby');anchor=null;
  if(host)host.hidden=true;
}
function show(target){
  hide();anchor=target;
  if(!host){
    host=document.createElement('aside');host.id='paradoxPerkTooltip';host.className='paradox-perk-tooltip';host.setAttribute('role','tooltip');document.body.append(host);
    host.addEventListener('pointerenter',()=>clearTimeout(hideTimer));
    host.addEventListener('pointerleave',event=>{if(!anchor?.contains(event.relatedTarget))hideTimer=setTimeout(hide,180);});
  }
  host.innerHTML=perkTooltipMarkup(target.dataset);host.hidden=false;
  target.classList.add('is-perk-inspected');target.setAttribute('aria-describedby',host.id);
  const bounds=target.getBoundingClientRect(),width=host.offsetWidth,height=host.offsetHeight,pad=8;
  host.style.left=`${Math.max(pad,Math.min(bounds.right+8,innerWidth-width-pad))}px`;
  host.style.top=`${Math.max(pad,Math.min(bounds.top,innerHeight-height-pad))}px`;
}
if(typeof document!=='undefined'){
  const target=event=>event.target.closest?.('[data-paradox-perk-tooltip]');
  document.addEventListener('pointerover',event=>{const node=target(event);if(node&&!node.contains(event.relatedTarget))show(node);});
  document.addEventListener('pointerout',event=>{if(target(event)===anchor&&!anchor?.contains(event.relatedTarget)&&!host?.contains(event.relatedTarget))hideTimer=setTimeout(hide,180);});
  document.addEventListener('focusin',event=>{const node=target(event);if(node)show(node);});
  document.addEventListener('focusout',event=>{if(target(event)===anchor)hide();});
  document.addEventListener('click',event=>{const node=target(event);if(node){event.stopPropagation();show(node);}else if(!host?.contains(event.target))hide();},true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')hide();else if(['Enter',' '].includes(event.key)&&target(event)){event.preventDefault();event.stopPropagation();show(target(event));}},true);
  addEventListener('resize',hide,{passive:true});addEventListener('scroll',hide,{passive:true,capture:true});
}
