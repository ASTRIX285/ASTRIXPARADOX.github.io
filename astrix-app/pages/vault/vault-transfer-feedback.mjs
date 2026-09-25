import {createVaultDragScroll} from './vault-drag-scroll.mjs?v=20260925-four-columns-1';
// Presentation only: never mutate the catalogue, payload or Bungie request plan.
export function createVaultTransferFeedback({board,itemKey,characterLabel,canDrop}){
  const pending=new Map();
  let ghost=null,dragTile=null;
  const dragScroll=createVaultDragScroll({onScroll:(x,y)=>hover(document.elementFromPoint(x,y))});
  document.addEventListener('dragover',event=>{if(dragTile)dragScroll.update(event.clientX,event.clientY);});
  document.addEventListener('dragleave',event=>{if(!event.relatedTarget)dragScroll.stop();});
  document.addEventListener('drop',()=>clearDrag());
  document.addEventListener('dragend',()=>clearDrag());
  window.addEventListener('blur',()=>clearDrag());
  const keyOf=node=>node?.dataset?.inspectItem;
  const tileFor=key=>[...board.querySelectorAll('.vault-transfer-item[data-inspect-item]')].find(node=>keyOf(node)===key);
  const destinationOf=node=>{
    const root=node?.closest('[data-drop-kind]');
    return root?{kind:root.dataset.dropKind,characterId:root.dataset.dropCharacterId||null}:null;
  };
  const groupFor=(item,destination)=>[...board.querySelectorAll('.vault-transfer-group')].find(group=>{
    const at=destinationOf(group);
    return group.dataset.equipmentGroup===item.equipmentGroup?.key&&at?.kind===destination.kind&&String(at.characterId||'')===String(destination.characterId||'')&&!group.closest('.vault-postmaster-section');
  });
  const host=document.createElement('section');host.className='vault-transfer-toasts';host.setAttribute('aria-label','Inventory transfers');document.body.append(host);
  function toast(item,destination){
    const node=document.createElement('article');node.className='vault-transfer-toast is-moving';node.dataset.transferItem=itemKey(item);
    const icon=document.createElement('img');icon.src=item.icon||'';icon.alt='';
    const copy=document.createElement('div'),name=document.createElement('strong'),label=document.createElement('span'),status=document.createElement('span');
    name.textContent=item.name;label.textContent=`Transfer to ${destination.kind==='vault'?'Vault':characterLabel(destination.characterId)}`;
    status.className='vault-transfer-toast-status';status.setAttribute('role','status');status.textContent='Moving…';copy.append(name,label,status);
    const mark=document.createElement('span');mark.className='vault-transfer-toast-mark';mark.setAttribute('aria-hidden','true');
    const dismiss=document.createElement('button');dismiss.type='button';dismiss.textContent='×';dismiss.setAttribute('aria-label',`Dismiss transfer of ${item.name}`);dismiss.addEventListener('click',()=>node.remove());
    node.append(icon,copy,mark,dismiss);host.append(node);return {node,status,mark};
  }
  const resetEmpty=row=>{if(!row)return;const empty=row.querySelector('.vault-transfer-row-empty');if(empty)empty.hidden=Boolean(row.querySelector('.vault-transfer-item'));};
  function land(state){
    const row=groupFor(state.item,state.destination)?.querySelector('.vault-transfer-items');
    if(!row)return;
    const rendered=tileFor(state.key);
    if(rendered&&rendered!==state.node)state.node=rendered;
    const previous=state.node.parentElement;
    state.node.classList.remove('is-dragging');state.node.classList.add('is-moving');state.node.setAttribute('aria-busy','true');state.node.setAttribute('aria-disabled','true');state.node.draggable=false;
    row.append(state.node);resetEmpty(previous);resetEmpty(row);
  }
  function begin(queueKey,item,destination){
    const key=itemKey(item),node=tileFor(key);if(!node)return;
    const origin=destinationOf(node),parent=node.parentElement,index=[...parent.children].indexOf(node),marker=document.createElement('span');marker.hidden=true;marker.className='vault-transfer-origin';node.before(marker);
    const state={key,item,destination,origin,parent,index,marker,node,original:node,originalDraggable:node.draggable,toast:toast(item,destination)};
    pending.set(queueKey,state);land(state);
  }
  function finish(queueKey,{success,error}={}){
    const state=pending.get(queueKey);if(!state)return;
    pending.delete(queueKey);
    if(!success){
      const row=state.marker.isConnected?state.marker.parentElement:groupFor(state.item,state.origin)?.querySelector('.vault-transfer-items');
      const current=state.node.parentElement;
      if(state.node!==state.original)state.node.remove();
      state.node=state.original;
      if(row){if(state.marker.isConnected)state.marker.after(state.node);else row.insertBefore(state.node,row.children[state.index]||null);}
      resetEmpty(current);resetEmpty(row);
    }
    state.marker.remove();state.node.classList.remove('is-moving','is-dragging');state.node.removeAttribute('aria-busy');state.node.removeAttribute('aria-disabled');state.node.draggable=state.originalDraggable;
    const {node,status,mark}=state.toast;node.className=`vault-transfer-toast is-${success?'success':'error'}`;mark.textContent=success?'✓':'✕';status.setAttribute('role',success?'status':'alert');status.textContent=success?'Transfer complete':error||'Transfer failed';
    if(success)setTimeout(()=>node.remove(),3000);
  }
  function clearHover(){board.querySelectorAll('.is-drop-target').forEach(node=>node.classList.remove('is-drop-target'));}
  function clearDrag(){
    dragScroll.stop();clearHover();board.querySelectorAll('.is-drop-active').forEach(node=>node.classList.remove('is-drop-active'));
    dragTile?.classList.remove('is-dragging');ghost?.remove();ghost=null;dragTile=null;
  }
  function startDrag(item,tile,event){
    clearDrag();dragTile=tile;tile.classList.add('is-dragging');
    for(const group of board.querySelectorAll('.vault-transfer-group')){
      if(group.dataset.equipmentGroup===item.equipmentGroup?.key&&!group.closest('.vault-postmaster-section')&&canDrop(item,destinationOf(group)))group.classList.add('is-drop-active');
    }
    const art=tile.querySelector('.tile-art,.vault-transfer-art')||tile;
    ghost=art.cloneNode(true);ghost.classList.add('vault-drag-ghost');ghost.setAttribute('aria-hidden','true');
    ghost.style.width=`${art.getBoundingClientRect().width}px`;ghost.style.height=`${art.getBoundingClientRect().height}px`;document.body.append(ghost);
    if(event.dataTransfer){ghost.style.left='-1000px';ghost.style.top='0';event.dataTransfer.setDragImage?.(ghost,ghost.offsetWidth/2,ghost.offsetHeight/2);}
    else moveGhost(event.clientX,event.clientY);
  }
  function moveGhost(x,y){if(dragTile)dragScroll.update(x,y);if(ghost){ghost.style.left=`${x+12}px`;ghost.style.top=`${y+12}px`;}}
  function hover(target){clearHover();const group=target?.closest('.vault-transfer-group');if(group?.classList.contains('is-drop-active'))group.classList.add('is-drop-target');}
  return {begin,finish,clearHover,clearDrag,startDrag,moveGhost,hover,
    isMoving:key=>[...pending.values()].some(state=>state.key===key),
    progress:(key,message)=>{const state=pending.get(key);if(state)state.toast.status.textContent=message;},
    reconcile:()=>{for(const state of pending.values())land(state);},
    validTarget:(item,target)=>{const group=target?.closest('.vault-transfer-group');return Boolean(group&&group.dataset.equipmentGroup===item.equipmentGroup?.key&&!group.closest('.vault-postmaster-section')&&canDrop(item,destinationOf(group)));}
  };
}
