// Phone and tablet item actions for Character and Storage (one shared system).
// A tap on an item opens its item card (weapons and armour, paradox-item-hover.mjs) or, for items
// without one, a small action sheet with the item icon, name and the actions the page offers:
// Pull to <Guardian> for Postmaster items, and on Storage Move to <Guardian> / Move to Vault.
// When an action cannot run, its button stays visible, disabled, with the plain reason.
// Failed Postmaster pulls keep a plain reason on the control: no room, cannot be pulled, or
// session expired. Pages supply the actions; this module never contacts Bungie itself.

const esc=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));

export const COMPACT_INVENTORY=globalThis.matchMedia?.('(max-width: 1199px)')||null;
export const isCompactInventory=()=>Boolean(COMPACT_INVENTORY?.matches);

export const POSTMASTER_FAILURES=Object.freeze({
  session:Object.freeze({short:'RECONNECT',retry:true,reason:'Your Bungie session expired. Reconnect Bungie, then pull again.'}),
  room:Object.freeze({short:'NO ROOM',retry:true,reason:"No room for this item. Make space in this Guardian's inventory, then pull again."}),
  locked:Object.freeze({short:"CAN'T PULL",retry:false,reason:'Bungie says this item cannot be pulled from the Postmaster.'})
});

// Plain reason for a failed Postmaster pull, from the action result or a thrown error.
export function postmasterFailure(result,thrown=null,resultMessage=()=>''){
  const row=thrown?null:[...(result?.steps||[])].reverse().find(step=>['failed','mismatch','blocked'].includes(step.status)&&step.phase!=='readback'),detail=thrown?{status:thrown.status,payload:thrown.payload,message:thrown.message}:(row?.detail||{});
  const payload=detail?.payload||{},words=`${payload.ErrorStatus||''} ${payload.error||''} ${payload.Message||''} ${detail?.message||''}`.toLowerCase();
  if(Number(detail?.status)===401||/reauthentication|webauth|session (?:has )?expired|reconnect bungie|live-action token/.test(words))return POSTMASTER_FAILURES.session;
  if(/no.?room|not enough (?:inventory |storage )?space|(?:inventory|storage|destination|bucket) (?:is )?full/.test(words))return POSTMASTER_FAILURES.room;
  if(/not.?transfer|nontransfer|cannot be (?:transferred|pulled)|item ?not ?found|uniqueness/.test(words))return POSTMASTER_FAILURES.locked;
  const reason=row?resultMessage(result):String(thrown?.message||'');
  return reason?{short:'RETRY',retry:true,reason}:null;
}

// Whether a Postmaster pull can run now, and if not, why.
export function postmasterPullState({session,capabilities={},failure=null}={}){
  if(!session?.authenticated)return {ready:false,reason:'Connect Bungie to pull items from the Postmaster.'};
  if(capabilities.pullFromPostmaster!==true)return {ready:false,reason:'Bungie has not allowed Postmaster pulls for this session. Reconnect Bungie to try again.'};
  if(failure)return {ready:failure.retry,reason:failure.reason};
  return {ready:true,reason:''};
}

// Desktop PULL buttons carry the same plain reason after a failed pull.
export function decoratePostmasterPullButtons(host,failures){
  for(const [key,failure] of failures||[]){
    const button=[...(host?.querySelectorAll?.('[data-pull-postmaster-item]')||[])].find(node=>node.dataset.pullPostmasterItem===key);
    if(!button)continue;
    button.textContent=failure.short;button.title=failure.reason;button.setAttribute('aria-label',`${failure.short}: ${failure.reason}`);
    if(!failure.retry)button.disabled=true;
  }
}

let openSheet=null;
export function closeItemSheet({restoreFocus=true}={}){
  if(!openSheet)return;
  const {node,anchor}=openSheet;openSheet=null;node.remove();
  if(restoreFocus&&anchor?.isConnected)anchor.focus({preventScroll:true});
}

// The action sheet: item icon (Bungie's own, untouched), name, a subtitle and the actions.
export function openItemSheet(item,{actions=[],subtitle='',anchor=null}={}){
  closeItemSheet({restoreFocus:false});
  if(!actions.length)return null;
  const node=document.createElement('div');
  node.className='inventory-item-sheet-layer';
  node.innerHTML=`<div class="inventory-item-sheet-backdrop" data-item-sheet-close></div>
    <section class="inventory-item-sheet" role="dialog" aria-modal="true" aria-labelledby="inventoryItemSheetName">
      <header>${item?.icon?`<img src="${esc(item.icon)}" alt="" decoding="async">`:'<span class="vault-transfer-icon-unavailable" aria-hidden="true">◇</span>'}
        <div><strong id="inventoryItemSheetName">${esc(item?.name||'Item')}</strong><span>${esc(subtitle)}</span></div>
        <button type="button" class="inventory-item-sheet-close" data-item-sheet-close aria-label="Close">✕</button></header>
      ${actions.map((action,index)=>`<button type="button" class="inventory-item-sheet-action" data-item-sheet-action="${index}"${action.disabled?` disabled${action.reason?` aria-describedby="inventoryItemSheetReason${index}"`:''}`:''}>${esc(action.label)}</button>${action.reason?`<p class="inventory-item-sheet-reason" id="inventoryItemSheetReason${index}">${esc(action.reason)}</p>`:''}`).join('')}
    </section>`;
  node.addEventListener('click',event=>{
    if(event.target.closest('[data-item-sheet-close]')){closeItemSheet();return;}
    const button=event.target.closest('[data-item-sheet-action]'),action=button&&!button.disabled?actions[Number(button.dataset.itemSheetAction)]:null;
    if(action){closeItemSheet({restoreFocus:false});action.run();}
  });
  node.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();closeItemSheet();return;}
    if(event.key!=='Tab')return;
    const focusable=[...node.querySelectorAll('button:not([disabled])')];
    if(!focusable.length)return;
    const first=focusable[0],last=focusable.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
  document.body.append(node);
  openSheet={node,anchor};
  (node.querySelector('[data-item-sheet-action]:not([disabled])')||node.querySelector('.inventory-item-sheet-close')).focus({preventScroll:true});
  return node;
}

// Items without an item card open the sheet on tap (phone and tablet only). Items with an item card
// get the same actions inside the card (paradox-item-hover.mjs options.actions).
export function bindItemSheet(board,{resolveItem,actionsFor,subtitleFor=()=>''}){
  const open=event=>{
    if(!isCompactInventory()||event.target.closest?.('button'))return false;
    const tile=event.target.closest?.('[data-inspect-item]');
    if(!tile||!board.contains(tile)||tile.hasAttribute('data-paradox-item-inspect'))return false;
    const item=resolveItem(tile.dataset.inspectItem),actions=item?actionsFor(item):[];
    if(!actions.length)return false;
    openItemSheet(item,{actions,subtitle:subtitleFor(item),anchor:tile});return true;
  };
  board?.addEventListener('click',open);
  board?.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&open(event))event.preventDefault();});
}
