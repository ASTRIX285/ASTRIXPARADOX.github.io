(function installForgeDestinationRibbon(){
  'use strict';

  const destinations=Object.freeze([
    Object.freeze({key:'journey',label:'Journey',href:'/astrix-app/pages/journey/'}),
    Object.freeze({key:'character',label:'Character',href:'/astrix-app/pages/guardian-workspace-v2/'}),
    Object.freeze({key:'forge-loader',label:'Forge Loader',href:'/astrix-app/pages/forge-loader/'}),
    Object.freeze({key:'build-forge',label:'Build Forge',href:'/astrix-app/pages/guardian-workspace-v2/paradox-build-space/'}),
    // Mission Reports is temporarily hidden from navigation; its page remains intact.
    Object.freeze({key:'vault',label:'Vault',href:'/astrix-app/pages/vault/'}),
    Object.freeze({key:'loadout',label:'Loadout',href:'/astrix-app/pages/loadout/'})
  ]);

  const scriptUrl=document.currentScript?.src||new URL('/astrix-app/shared/astrix-destination-ribbon.js',location.href).href;
  const prepared=new Map();
  let navigationRevision=0,intentTimer=null,progress=null;
  const pageKinds={'journey':'journey','character':'character','forge-loader':'loadout','build-forge':'build-forge','vault':'vault','loadout':'loadout','mission-reports':'journey'};
  function accountIdentity(){
    try{
      const session=window.FORGE_BUNGIE_SESSION||JSON.parse(sessionStorage.getItem('astrix:bungie-session-cache:v1')||'null')?.session;
      const membership=session?.activeDestinyMembership;
      return session?.authenticated&&membership?.membershipId?`${membership.membershipType}:${membership.membershipId}`:'';
    }catch{return '';}
  }
  function destinationFor(link){
    if(!link||link.hasAttribute('download')||link.target&&link.target!=='_self')return null;
    const url=new URL(link.href,location.href);
    if(url.origin!==location.origin||url.search||url.hash)return null;
    return destinations.find(row=>row.href===url.pathname&&row.href!==location.pathname)||null;
  }
  async function prepareResources(destination){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
    try{
      const response=await fetch(destination.href,{credentials:'same-origin',cache:'force-cache',signal:controller.signal});
      if(!response.ok)throw new Error('Page resources unavailable');
      const markup=new DOMParser().parseFromString(await response.text(),'text/html');
      const seen=new Set();
      const resources=[...markup.querySelectorAll('link[rel="stylesheet"][href],script[src]')];
      await Promise.all(resources.map(node=>{
        const url=new URL(node.getAttribute('href')||node.getAttribute('src'),new URL(destination.href,location.origin));
        if(url.origin!==location.origin||seen.has(url.href))return;
        seen.add(url.href);
        if(node.getAttribute('type')==='module'){
          const preload=document.createElement('link');
          if(preload.relList?.supports('modulepreload'))return new Promise(resolve=>{
            const finish=()=>{
              preload.removeEventListener('load',finish);preload.removeEventListener('error',finish);
              controller.signal.removeEventListener('abort',finish);preload.remove();resolve();
            };
            preload.rel='modulepreload';preload.href=url.href;
            preload.addEventListener('load',finish,{once:true});preload.addEventListener('error',finish,{once:true});
            controller.signal.addEventListener('abort',finish,{once:true});
            if(controller.signal.aborted){finish();return;}
            document.head.append(preload);
          });
        }
        // Warm public resources without executing another page's scripts or
        // mounting duplicate account handlers, editors or Bungie actions.
        return fetch(url,{credentials:'same-origin',cache:'force-cache',signal:controller.signal}).then(resource=>resource.arrayBuffer()).catch(()=>{});
      }));
    }finally{clearTimeout(timer);}
  }
  async function prepareData(destination){
    const {readCachedBungieSession}=await import(new URL('../pages/guardian-workspace-v2/guardian-session-cache.mjs?v=20260913-live-character-2',scriptUrl).href);
    const session=readCachedBungieSession();
    if(!session?.authenticated)return;
    const {loadPreparedPagePayload}=await import(new URL('../core/prepared-page-client.mjs?v=20260913-workspace-preload-1&transport=20260911-compact-plugs-1&navigation=20260920-ready-1',scriptUrl).href);
    await loadPreparedPagePayload(session,pageKinds[destination.key],{quiet:true,publish:false});
  }
  function prepare(destination){
    const identity=accountIdentity(),key=`${identity}:${destination.key}`;
    const existing=prepared.get(key);
    if(existing&&Date.now()-existing.startedAt<60000)return existing.promise;
    const promise=Promise.all([prepareResources(destination),prepareData(destination)]);
    prepared.set(key,{startedAt:Date.now(),promise});
    promise.catch(()=>{if(prepared.get(key)?.promise===promise)prepared.delete(key);});
    return promise;
  }
  function showProgress(value){
    if(!progress){
      progress=document.createElement('output');progress.className='apx-navigation-progress';
      progress.setAttribute('role','status');progress.setAttribute('aria-live','polite');
      document.body.append(progress);
    }
    progress.textContent=`${value}%`;
  }
  function clearNavigation(){
    navigationRevision++;progress?.remove();progress=null;
    document.querySelectorAll('.apx-destination-ribbon [aria-busy]').forEach(link=>link.removeAttribute('aria-busy'));
  }
  function prepareIntent(event){
    clearTimeout(intentTimer);
    if(navigator.connection?.saveData||document.visibilityState==='hidden')return;
    const destination=destinationFor(event.target.closest('a'));
    if(!destination)return;
    intentTimer=setTimeout(()=>{void prepare(destination).catch(()=>{});},event.type==='pointerdown'?0:120);
  }
  async function navigatePrepared(event){
    if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    const link=event.target.closest('a'),destination=destinationFor(link);
    if(!destination)return;
    event.preventDefault();clearTimeout(intentTimer);clearNavigation();
    const revision=navigationRevision,identity=accountIdentity();
    link.setAttribute('aria-busy','true');showProgress(8);
    try{await prepare(destination);}catch{/* Normal navigation retains sign-in and retry recovery. */}
    if(revision!==navigationRevision)return;
    if(identity!==accountIdentity()){clearNavigation();return;}
    try{sessionStorage.setItem('astrix:prepared-navigation:v1',JSON.stringify({path:destination.href,at:Date.now()}));}catch{}
    clearNavigation();location.assign(destination.href);
  }
  window.addEventListener('pageshow',clearNavigation);
  let observedIdentity=accountIdentity();
  window.addEventListener('forge:bungie-session',()=>{
    const next=accountIdentity();
    if(next!==observedIdentity){observedIdentity=next;prepared.clear();clearNavigation();}
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){clearTimeout(intentTimer);clearNavigation();}});

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
    list.addEventListener('click',navigatePrepared);
    list.addEventListener('pointerover',prepareIntent);
    list.addEventListener('focusin',prepareIntent);
    list.addEventListener('pointerdown',prepareIntent);
    list.addEventListener('pointerleave',()=>clearTimeout(intentTimer));
    nav.append(list);
    mount.replaceChildren(nav);
  }

  function init(){document.querySelectorAll('[data-forge-destination-ribbon]').forEach(render);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
