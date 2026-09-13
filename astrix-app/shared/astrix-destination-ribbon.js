(function installForgeDestinationRibbon(){
  'use strict';

  const destinations=Object.freeze([
    Object.freeze({key:'journey',label:'Journey',href:'/astrix-app/pages/journey/'}),
    Object.freeze({key:'character',label:'Character',href:'/astrix-app/pages/guardian-workspace-v2/'}),
    Object.freeze({key:'forge-loader',label:'Forge Loader',href:'/astrix-app/pages/forge-loader/'}),
    Object.freeze({key:'build-forge',label:'Build Forge',href:'/astrix-app/pages/guardian-workspace-v2/paradox-build-space/'}),
    Object.freeze({key:'mission-reports',label:'Mission Reports',href:'/astrix-app/pages/mission-reports/'}),
    Object.freeze({key:'vault',label:'Vault',href:'/astrix-app/pages/vault/'}),
    Object.freeze({key:'loadout',label:'Loadout',href:'/astrix-app/pages/loadout/'})
  ]);

  function handleKeyboard(event){
    const current=event.target.closest('a');
    if(!current)return;
    const links=Array.from(event.currentTarget.querySelectorAll('a'));
    const index=links.indexOf(current);
    if(index<0)return;
    let next=index;
    if(event.key==='ArrowRight')next=(index+1)%links.length;
    else if(event.key==='ArrowLeft')next=(index-1+links.length)%links.length;
    else if(event.key==='Home')next=0;
    else if(event.key==='End')next=links.length-1;
    else if(event.key==='Enter'||event.key===' '){event.preventDefault();current.click();return;}
    else return;
    event.preventDefault();
    links[next].focus();
  }

  function render(mount){
    const requested=String(mount.dataset.activeDestination||'journey').trim().toLowerCase();
    const active=destinations.some(destination=>destination.key===requested)?requested:'journey';
    const nav=document.createElement('nav');
    nav.className='apx-destination-ribbon';
    nav.setAttribute('aria-label','ASTRIX PARADOX destinations');
    const list=document.createElement('ul');
    destinations.forEach(destination=>{
      const item=document.createElement('li');
      const link=document.createElement('a');
      link.href=destination.href;
      link.textContent=destination.label;
      if(destination.key===active)link.setAttribute('aria-current','page');
      item.append(link);
      list.append(item);
    });
    list.addEventListener('keydown',handleKeyboard);
    nav.append(list);
    mount.replaceChildren(nav);
  }

  function init(){document.querySelectorAll('[data-forge-destination-ribbon]').forEach(render);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
