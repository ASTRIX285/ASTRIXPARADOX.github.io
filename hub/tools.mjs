const trigger=document.querySelector('.tools-mission-trigger');
const modal=document.querySelector('#toolsMissionModal');
const dialog=document.querySelector('#toolsMissionDialog');

if(trigger&&modal&&dialog){
  const closeControls=[...modal.querySelectorAll('[data-mission-close]')];
  const focusableSelector='a[href],button:not([disabled])';
  let previousFocus=null;

  const openMission=()=>{
    previousFocus=document.activeElement;
    modal.hidden=false;
    document.body.classList.add('tools-mission-open');
    dialog.focus();
  };

  const closeMission=()=>{
    modal.hidden=true;
    document.body.classList.remove('tools-mission-open');
    previousFocus?.focus();
  };

  trigger.addEventListener('click',openMission);
  closeControls.forEach(control=>control.addEventListener('click',closeMission));

  document.addEventListener('keydown',event=>{
    if(modal.hidden)return;
    if(event.key==='Escape'){
      event.preventDefault();
      closeMission();
      return;
    }
    if(event.key!=='Tab')return;

    const focusable=[...dialog.querySelectorAll(focusableSelector)];
    const first=focusable[0];
    const last=focusable.at(-1);
    if(!first||!last)return;

    if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog)){
      event.preventDefault();
      last.focus();
    }else if(!event.shiftKey&&document.activeElement===last){
      event.preventDefault();
      first.focus();
    }
  });
}
