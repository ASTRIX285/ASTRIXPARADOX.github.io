import {renderLoadoutIconLayout,renderLoadoutGridLayout,bindLoadoutIconDetails} from './loadout-icon-layout.mjs';
import {bungieArtwork} from './loadout-details-model.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const defaultActionRows=[['equip','Equip'],['prepare','Prepare equip'],['identifiers','Edit identifiers'],['save','Save to Armoury'],['share','Share'],['clear','Clear slot']];
let sequence=0;
function artwork(icon,label,className=''){
  const src=bungieArtwork(icon);
  return src?`<img class="${esc(className)}" src="${esc(src)}" alt="${esc(label)}" loading="lazy" decoding="async">`:`<span class="apx-ld-empty ${esc(className)}" role="img" aria-label="${esc(label)}"></span>`;
}
function socket(plug){
  const label=plug.empty?`Empty socket${plug.hash?' (definition unavailable)':''}`:plug.name||'Socket';
  const stats=(plug.statFocus||[]).map(stat=>`${stat.name} ${stat.value>0?'+':''}${stat.value}${stat.conditional?' (conditional)':''}`).join(', ');
  return `<div class="apx-ld-socket" tabindex="0" data-socket-index="${esc(plug.socketIndex)}" title="${esc([label,plug.description,stats].filter(Boolean).join('\n'))}">${artwork(plug.icon,label)}<span>${esc(label)}</span>${stats?`<small>${esc(stats)}</small>`:''}</div>`;
}
export function renderLoadoutDetailsContent(model,{presentation='rows'}={}){
  if(presentation==='icons')return renderLoadoutIconLayout(model);
  if(presentation==='grid')return renderLoadoutGridLayout(model);
  return (model.items||[]).map(item=>`<section class="apx-ld-item" data-item-kind="${esc(item.kind)}"><div class="apx-ld-gear">${artwork(item.icon,item.name)}<div><span class="apx-ld-kind">${esc(({subclass:'Subclass',weapon:'Weapon',armour:'Armour'})[item.kind]||'Saved item')}</span><h3>${esc(item.name||'Item unavailable')}</h3>${item.notOwned?'<p>Not in your inventory</p>':''}${item.alternative?`<p>Closest in your inventory: ${esc(item.alternative.definition?.displayProperties?.name||'')}</p>`:''}${item.match&&item.match.itemHash!==item.itemHash?`<p>Preselected: ${esc(item.match.definition?.displayProperties?.name||'')}</p>`:''}${item.description?`<p>${esc(item.description)}</p>`:''}${item.unresolved?'<p>Item unavailable</p>':''}</div></div><div class="apx-ld-groups">${(item.groups||[]).length?item.groups.map(group=>`<section class="apx-ld-group"><h4>${esc(group.label)}</h4><div class="apx-ld-sockets">${(group.plugs||[]).map(socket).join('')}</div></section>`).join(''):'<p class="apx-ld-note">No saved socket data</p>'}</div></section>`).join('')||'<p class="apx-ld-note">This slot has no saved items.</p>';
}
/** A presentation component only: no Bungie calls, account storage or source branching.
 * All source-specific actions and bindings are supplied by the host adapter. */
export function openLoadoutDetails(model,{presentation='rows',actions={},actionRows=defaultActionRows,disabledReasons={},document:doc=globalThis.document,onClose=()=>{},returnFocus=doc?.activeElement}={}){
  if(!doc?.body)throw new Error('Loadout Details requires a document.');
  const dialog=doc.createElement('dialog'),id=`apx-loadout-details-${++sequence}`;
  dialog.className=`apx-loadout-details${presentation==='icons'?' apx-loadout-details--icons':presentation==='grid'?' apx-loadout-details--grid':''}`;dialog.setAttribute('aria-labelledby',`${id}-name`);dialog.setAttribute('aria-describedby',`${id}-source`);
  let busy=false,closed=false,invalid=false,review=null;
  dialog.innerHTML=`<header class="apx-ld-header"><div class="apx-ld-identity">${artwork(model.icon,model.name,'apx-ld-loadout-icon')}<div><p id="${id}-source">${esc(model.source?.label||'Loadout')}${Number.isInteger(model.slotNumber)?` · Slot ${model.slotNumber}`:''}</p><h2 id="${id}-name">${esc(model.name||'Loadout details')}</h2></div></div><button type="button" data-ld-close aria-label="Close loadout details">Close</button></header><nav class="apx-ld-actions" aria-label="Loadout actions">${actionRows.map(([key,label])=>`<button type="button" data-ld-action="${key}" ${!actions[key]||disabledReasons[key]?`disabled title="${esc(disabledReasons[key]||'Not available for this source')}"`:''}>${label}</button>`).join('')}</nav><div class="apx-ld-scroll"><p class="apx-ld-message" role="status" aria-live="polite"></p><section class="apx-ld-panel" hidden></section>${model.warning?`<p class="apx-ld-note">${esc(model.warning)}</p>`:''}<div class="apx-ld-content">${renderLoadoutDetailsContent(model,{presentation})}</div></div>`;
  const disposeIcons=['icons','grid'].includes(presentation)?bindLoadoutIconDetails(dialog):()=>{};
  const status=dialog.querySelector('.apx-ld-message'),panel=dialog.querySelector('.apx-ld-panel');
  const setStatus=(message,error=false)=>{status.textContent=String(message||'');status.setAttribute('role',error?'alert':'status');status.classList.toggle('is-error',error);};
  function syncBusy(){
    dialog.setAttribute('aria-busy',String(busy));
    dialog.querySelector('[data-ld-close]').disabled=busy;
    dialog.querySelectorAll('[data-ld-action]').forEach(button=>button.disabled=busy||invalid||!actions[button.dataset.ldAction]||Boolean(disabledReasons[button.dataset.ldAction]));
    panel.querySelectorAll('button,input,select,fieldset').forEach(control=>{control.disabled=busy||invalid||(control.hasAttribute('data-ld-confirm-apply')&&!review?.ready);});
  }
  async function run(fn){
    if(busy||closed||invalid)return;
    busy=true;syncBusy();
    try{await fn();}catch(error){if(!closed)setStatus(error?.message||'The action could not be completed.',true);}
    finally{busy=false;if(!closed)syncBusy();}
  }
  function showPanel(html){panel.innerHTML=html;panel.hidden=false;panel.scrollIntoView?.({block:'nearest'});panel.querySelector('input,select,button')?.focus();}
  function close(){if(closed||busy)return;closed=true;disposeIcons();dialog.close();dialog.remove();onClose();if(returnFocus?.isConnected)returnFocus.focus();}
  function reviewHtml(plan){
    const targets=plan.equipment?.targets||[];
    return `<h3>Review Apply</h3><p>${targets.length} equipment items. ${plan.socketChanges?.length||0} saved socket targets.</p><p>Nothing changes until you confirm Apply.</p>${(plan.blockers||[]).length?`<ul>${plan.blockers.map(row=>`<li>${esc(row)}</li>`).join('')}</ul>`:''}${(plan.inGameSteps||[]).length?`<h4>Complete in Destiny</h4><ul>${plan.inGameSteps.map(row=>`<li>${esc(row)}</li>`).join('')}</ul>`:''}<div class="apx-ld-form-actions"><button type="button" data-ld-confirm-apply ${plan.ready?'':'disabled'}>Confirm Apply</button><button type="button" data-ld-cancel>Cancel</button></div>`;
  }
  function identifiersHtml(){
    const choices=model.identifierChoices||{};
    return `<form data-ld-identifiers><h3>Edit identifiers</h3><fieldset><label>Name<select name="nameHash" required>${(choices.names||[]).map(row=>`<option value="${row.hash}" ${row.hash===Number(model.identifiers?.nameHash)?'selected':''}>${esc(row.name)}</option>`).join('')}</select></label>${[['icons','iconHash','Icon'],['colors','colorHash','Colour']].map(([key,field,label])=>`<fieldset><legend>${label}</legend><div class="apx-ld-options">${(choices[key]||[]).map(row=>`<label><input type="radio" name="${field}" value="${row.hash}" ${row.hash===Number(model.identifiers?.[field])?'checked':''} required>${artwork(row.icon,row.name||`${label} ${row.hash}`)}<span class="apx-ld-option-name">${esc(row.name||`${label} ${row.hash}`)}</span></label>`).join('')}</div></fieldset>`).join('')}</fieldset><div class="apx-ld-form-actions"><button type="submit">Save identifiers</button><button type="button" data-ld-cancel>Cancel</button></div></form>`;
  }
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('click',event=>{
    if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();return;}
    const target=event.target.closest?.('button');if(!target||target.disabled)return;
    if(target.hasAttribute('data-ld-close')){close();return;}
    if(target.hasAttribute('data-ld-cancel')){review=null;panel.hidden=true;panel.replaceChildren();dialog.querySelector('[data-ld-action="equip"]')?.focus();return;}
    if(target.hasAttribute('data-ld-confirm-apply')){void run(async()=>{
      if(!review?.ready)throw new Error('Prepare this loadout again before Apply.');
      const plan=review;review=null;setStatus('Applying loadout…');
      const result=await actions.apply(plan,{onProgress:progress=>setStatus(progress.label)});
      if(result?.manualSteps?.length)showPanel(`<h3>Complete in Destiny</h3><ul>${result.manualSteps.map(step=>`<li>${esc(step)}</li>`).join('')}</ul>`);else panel.hidden=true;setStatus(result?.message||'Apply completed.');
    });return;}
    if(target.hasAttribute('data-ld-confirm-clear')){void run(async()=>{await actions.clear();setStatus('Slot cleared.');invalid=true;panel.hidden=true;});return;}
    const key=target.dataset.ldAction;if(!key||!actions[key])return;
    if(key==='identifiers'){showPanel(identifiersHtml());return;}
    if(key==='save'){showPanel(`<form data-ld-save><h3>Save to Armoury</h3><label>Name<input name="name" value="${esc(model.name)}" maxlength="80" required></label><div class="apx-ld-form-actions"><button type="submit">Save loadout</button><button type="button" data-ld-cancel>Cancel</button></div></form>`);return;}
    if(key==='clear'){showPanel(`<h3>Clear slot ${esc(model.slotNumber)}</h3><p>Remove ${esc(model.name)} from this in-game slot? This does not delete your items.</p><div class="apx-ld-form-actions"><button type="button" data-ld-confirm-clear>Confirm clear slot</button><button type="button" data-ld-cancel>Cancel</button></div>`);return;}
    void run(async()=>{
      if(key==='equip'||key==='prepare'){setStatus('Checking the saved loadout…');review=await actions[key]();showPanel(reviewHtml(review));setStatus(review.ready?'Ready for your review. Nothing has been equipped.':'Apply is blocked. Review the reasons below.');}
      else{await actions[key]();setStatus(key==='forge'?'Sent to Builder.':'Share file prepared.');}
    });
  });
  dialog.addEventListener('submit',event=>{
    event.preventDefault();const form=event.target;if(!form.checkValidity())return;
    const values=Object.fromEntries(new doc.defaultView.FormData(form));
    if(form.hasAttribute('data-ld-save'))void run(async()=>{await actions.save(String(values.name));panel.hidden=true;setStatus('Saved as PARADOX loadout.');});
    if(form.hasAttribute('data-ld-identifiers'))void run(async()=>{
      const fresh=await actions.identifiers(Object.fromEntries(Object.entries(values).map(([key,value])=>[key,Number(value)])));
      if(fresh){model=fresh;dialog.querySelector(`#${id}-name`).textContent=model.name;const holder=dialog.querySelector('.apx-ld-identity');holder.firstElementChild.outerHTML=artwork(model.icon,model.name,'apx-ld-loadout-icon');}
      panel.hidden=true;setStatus('Identifiers updated.');
    });
  });
  // Broken official images become honest empty frames, never replacement artwork.
  dialog.addEventListener('error',event=>{if(event.target.tagName==='IMG'){const blank=doc.createElement('span');blank.className='apx-ld-empty';blank.setAttribute('role','img');blank.setAttribute('aria-label','Image unavailable');event.target.replaceWith(blank);}},true);
  doc.body.append(dialog);dialog.showModal();dialog.querySelector('[data-ld-close]').focus();
  return {dialog,close,invalidate(message='The account, Guardian or saved slot changed. Close and reopen these details.'){
    invalid=true;review=null;panel.hidden=true;setStatus(message,true);syncBusy();
  }};
}
