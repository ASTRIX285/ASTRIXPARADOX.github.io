(function installForgeDestinationRibbon(){
  'use strict';

  const destinations=Object.freeze([
    Object.freeze({key:'journey',label:'Journey',href:'/astrix-app/pages/journey/'}),
    Object.freeze({key:'character',label:'Character',href:'/astrix-app/pages/guardian-workspace-v2/'}),
    Object.freeze({key:'forge-loader',label:'Forge Loader',href:'/astrix-app/pages/forge-loader/'}),
    Object.freeze({key:'build-forge',label:'Build Forge',href:'/astrix-app/pages/guardian-workspace-v2/paradox-build-space/'}),
    Object.freeze({key:'reports',label:'Reports',href:'/astrix-app/pages/reports/'}),
    Object.freeze({key:'vault',label:'Storage',href:'/astrix-app/pages/vault/'}),
    Object.freeze({key:'loadout',label:'Armoury',href:'/astrix-app/pages/loadout/'})
  ]);

  const scriptUrl=document.currentScript?.src||new URL('/astrix-app/shared/astrix-destination-ribbon.js?plain=20260925-2&refresh=20260927-1&logo=20261001-1&shell=20261001-mobile-1',location.href).href;
  const prepared=new Map();
  let navigationRevision=0,intentTimer=null;
  const pageKinds={'journey':'journey','character':'character','forge-loader':'loadout','build-forge':'build-forge','vault':'vault','loadout':'loadout','mission-reports':'journey','reports':'journey'};
  function accountIdentity(){
    try{
      // An unavailable answer during a Bungie outage must not hide the signed-in account.
      const session=[window.FORGE_BUNGIE_SESSION,JSON.parse(sessionStorage.getItem('astrix:bungie-session-cache:v1')||'null')?.session].find(row=>row?.authenticated===true);
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
    const {isJourneyPreview}=await import(new URL('./local-preview.mjs?v=20260925-local-preview-1',scriptUrl).href);
    if(isJourneyPreview())return;
    const {readCachedBungieSession}=await import(new URL('../pages/guardian-workspace-v2/guardian-session-cache.mjs?v=20260913-live-character-2&plain=20260925-2&refresh=20260927-1',scriptUrl).href);
    const session=readCachedBungieSession();
    if(!session?.authenticated)return;
    if(destination.key==='reports'){
      const {preloadReports}=await import(new URL('./reports-preload.mjs?v=20260925-reports-20c&refresh=20260927-1',scriptUrl).href);
      await preloadReports(session);return;
    }
    const {loadPreparedPagePayload}=await import(new URL('../core/prepared-page-client.mjs?v=20260913-workspace-preload-1&transport=20260911-compact-plugs-1&navigation=20260920-ready-1&plain=20260925-2&refresh=20260927-1&shell=20261001-mobile-1',scriptUrl).href);
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
  function clearNavigation(){
    navigationRevision++;
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
    // Hover/focus prefetch stays opportunistic. Only the destination shows a loader.
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

  // Tab icons for the slim bar (approved Tool navigation ribbon board, 28 Sep 2026).
  const ICONS=Object.freeze({
    home:'<path d="M3 11l9-7 9 7v9H3z"/>',
    journey:'<circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16"/>',
    character:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    'forge-loader':'<path d="M12 3l8 5v8l-8 5-8-5V8z"/>',
    'build-forge':'<path d="M4 20l7-7M14 4l6 6-4 4-6-6z"/>',
    reports:'<path d="M5 20V10M12 20V4M19 20v-7"/>',
    vault:'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M9 12h6"/>',
    loadout:'<rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/>'
  });
  function withIcon(link,key,label){
    link.title=label;
    const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');
    icon.setAttribute('class','ax-tab-icon');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');
    icon.setAttribute('fill','none');icon.setAttribute('stroke','currentColor');icon.setAttribute('stroke-width','2');icon.setAttribute('stroke-linecap','round');icon.setAttribute('stroke-linejoin','round');
    icon.innerHTML=ICONS[key]||'';
    const text=document.createElement('span');text.textContent=label;
    link.replaceChildren(icon,text);
  }
  // Header brand: the AX logo beside the ASTRIX wordmark with the red X.
  function brandHeader(){
    document.querySelectorAll('header.apx-destination-header .apx-destination-brand').forEach(found=>{
      if(found.dataset.axBrand)return;
      // The ASTRIX PARADOX brand always links to the main home page, on every tool page.
      let brand=found;
      if(found.tagName!=='A'){brand=document.createElement('a');for(const {name,value} of [...found.attributes])brand.setAttribute(name,value);brand.append(...found.childNodes);found.replaceWith(brand);}
      brand.dataset.axBrand='1';brand.setAttribute('href','/');brand.setAttribute('aria-label','ASTRIX PARADOX home');
      const image=brand.querySelector('img');if(image){image.src='/img/ax-logo-160.webp';image.alt='';image.width=49;image.height=40;}
      const words=document.createElement('span');words.className='ax-wordmark';
      words.innerHTML='<span class="ax-wordmark-top">ASTRI<b>X</b></span><span class="ax-wordmark-sub">PARADOX</span>';
      brand.querySelector(':scope>span')?.replaceWith(words);
    });
  }
  // The tab row sits exactly under the header, whatever height the Guardian cards give it.
  function trackHeader(){
    const header=document.querySelector('header.apx-destination-header');
    if(!header)return;
    const apply=()=>document.documentElement.style.setProperty('--ax-shell-top',`${header.offsetHeight}px`);
    apply();
    if('ResizeObserver' in window)new ResizeObserver(apply).observe(header);
  }
  // Miguel, 30 Sep 2026: the ribbon stays full and solid; the page scrolls behind it.
  function watchScroll(){trackHeader();}

  function render(mount){
    const requested=String(mount.dataset.activeDestination||'journey').trim().toLowerCase();
    const active=destinations.some(destination=>destination.key===requested)?requested:'journey';
    const nav=document.createElement('nav');
    nav.className='apx-destination-ribbon';
    nav.setAttribute('aria-label','ASTRIX PARADOX destinations');
    const list=document.createElement('ul');
    // Guardian Home is always one click away, on every tool page.
    const homeItem=document.createElement('li');
    homeItem.className='apx-destination-ribbon__home';
    const homeLink=document.createElement('a');
    homeLink.href='/astrix-app/pages/home/';
    homeLink.setAttribute('aria-label','Guardian Home');
    withIcon(homeLink,'home','Home');
    homeItem.append(homeLink);
    list.append(homeItem);
    destinations.forEach(destination=>{
      const item=document.createElement('li');
      const link=document.createElement('a');
      link.href=destination.href;
      withIcon(link,destination.key,destination.label);
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
    const slim=document.createElement('span');slim.className='ax-slim-brand';
    const mark=document.createElement('span');mark.className='ax-slim-mark';mark.setAttribute('aria-hidden','true');mark.innerHTML='A<b>X</b>';
    const name=document.createElement('strong');
    name.textContent=(document.querySelector('header.apx-destination-header .apx-destination-header-copy strong')?.textContent||destinations.find(row=>row.key===active)?.label||'').trim().toUpperCase();
    slim.append(mark,name);
    nav.append(slim,list);
    mount.replaceChildren(nav);
  }

  async function warmReports(session){
    const {isJourneyPreview}=await import(new URL('./local-preview.mjs?v=20260925-local-preview-1',scriptUrl).href);
    if(isJourneyPreview())return;
    if(!session?.authenticated)return;
    void import(new URL('./reports-preload.mjs?v=20260925-reports-20c&refresh=20260927-1',scriptUrl).href)
      .then(module=>module.preloadReports(session)).catch(()=>{});
  }
  window.addEventListener('forge:bungie-session',event=>warmReports(event.detail));
  // ---------- Tool shell on every tool page (Miguel, 1 Oct 2026) ----------
  // Header actions at all widths: refresh icon, Bungie emblem, and up to 1199px a menu
  // icon that opens the tools drawer from the left. Phone and tablet show only the active
  // Guardian card; tapping it lists the other two. The last Guardian is remembered per account.
  const SHELL_QUERY='(max-width: 1199px)';
  const LAST_GUARDIAN_PREFIX='astrix:last-guardian:v1:';
  const SELECTED_CHARACTER_KEY='astrix:selected-character-id';
  const REFRESH_ICON='<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M20 11a8 8 0 1 0-2.34 5.66" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M20 4v7h-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const MENU_ICON='<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square"/></svg>';
  const CLOSE_ICON='<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square"/></svg>';
  const shellHeader=()=>document.querySelector('header.apx-destination-header')||document.querySelector('header.home-top');
  function iconButton(className,label,icon){const button=document.createElement('button');button.type='button';button.className=`ax-icon-btn ${className}`;button.setAttribute('aria-label',label);button.innerHTML=icon;return button;}
  function activeShellKey(){
    const requested=String(document.querySelector('[data-forge-destination-ribbon]')?.dataset.activeDestination||'').trim().toLowerCase();
    if(requested)return requested;
    return location.pathname.includes('/pages/home/')?'home':'';
  }

  // Remember the selected Guardian per account; seed the page's selection before cards render.
  function rememberGuardian(characterId){try{const account=accountIdentity();if(account&&characterId)localStorage.setItem(LAST_GUARDIAN_PREFIX+account,String(characterId));}catch{}}
  function seedGuardian(){
    try{
      const account=accountIdentity();if(!account||sessionStorage.getItem(SELECTED_CHARACTER_KEY))return;
      const last=localStorage.getItem(LAST_GUARDIAN_PREFIX+account);if(last)sessionStorage.setItem(SELECTED_CHARACTER_KEY,last);
    }catch{}
  }
  document.addEventListener('forge:character-selected',event=>{rememberGuardian(event.detail?.characterId);closeCardList();});
  window.addEventListener('forge:bungie-session',seedGuardian);

  // Phone and tablet: only the active card shows; tapping it lists the other two.
  function closeCardList(){const cards=document.getElementById('guardianCharacterCards');if(cards){cards.classList.remove('ax-cards-open');cards.querySelector('.guardian-character-card.is-selected')?.setAttribute('aria-expanded','false');}}
  document.addEventListener('click',event=>{
    if(!matchMedia(SHELL_QUERY).matches)return;
    const card=event.target.closest?.('#guardianCharacterCards .guardian-character-card');if(!card)return;
    const cards=card.closest('#guardianCharacterCards');
    if(card.classList.contains('is-selected')){
      event.preventDefault();event.stopImmediatePropagation();
      const open=!cards.classList.contains('ax-cards-open');cards.classList.toggle('ax-cards-open',open);card.setAttribute('aria-expanded',String(open));
    }
  },true);

  // Refresh: the page's existing refresh (its bound .apx-data-refresh control or a
  // registered FORGE_REFRESH), else a reload for pages that only load once.
  function wireRefresh(icon){
    let running=false;
    const proxy=()=>document.querySelector('.apx-data-refresh:not([disabled])')||document.querySelector('.apx-data-refresh');
    // Writes only on a real change, and ignores the icon's own attributes, so the
    // observer below can never feed itself.
    const sync=()=>{
      const control=proxy(),busy=running||control?.getAttribute('aria-busy')==='true';
      const disabled=busy||Boolean(control&&control.disabled&&typeof window.FORGE_REFRESH!=='function');
      if(icon.getAttribute('aria-busy')!==String(busy))icon.setAttribute('aria-busy',String(busy));
      if(icon.disabled!==disabled)icon.disabled=disabled;
    };
    // Watches only the page's own refresh control (aria-busy and disabled). While the page has
    // not rendered it yet, a child-list watch looks for it and stops as soon as it appears.
    let watched=null;
    const controlWatch=new MutationObserver(sync);
    const finder=new MutationObserver(()=>{if(proxy())bind();});
    function bind(){
      const control=proxy();
      if(control===watched)return;
      controlWatch.disconnect();watched=control;
      if(control){finder.disconnect();controlWatch.observe(control,{attributes:true,attributeFilter:['aria-busy','disabled']});}
      else finder.observe(document.body,{childList:true,subtree:true});
      sync();
    }
    bind();
    icon.addEventListener('click',async()=>{
      if(icon.disabled)return;
      bind();
      const control=proxy();
      if(control&&!control.disabled){control.click();sync();return;}
      if(typeof window.FORGE_REFRESH==='function'){
        running=true;sync();
        try{await window.FORGE_REFRESH();}catch(error){console.info('[Forge shell] refresh unavailable',error);}
        finally{running=false;sync();}
        return;
      }
      location.reload();
    });
    sync();
  }

  // Tools drawer from the left: focus is trapped while open and returns to the menu icon.
  function buildDrawer(menu){
    const active=activeShellKey();
    const drawer=document.createElement('div');drawer.className='ax-drawer';drawer.id='axToolDrawer';drawer.hidden=true;
    const links=[{key:'home',label:'Home',href:'/astrix-app/pages/home/'},...destinations];
    drawer.innerHTML=`<div class="ax-drawer-backdrop" data-drawer-close></div><nav class="ax-drawer-panel" role="dialog" aria-modal="true" aria-label="ASTRIX PARADOX tools"><div class="ax-drawer-head"><a class="ax-drawer-brand" href="/" aria-label="ASTRIX PARADOX home"><span class="ax-wordmark"><span class="ax-wordmark-top">ASTRI<b>X</b></span><span class="ax-wordmark-sub">PARADOX</span></span></a></div><ul class="ax-drawer-links">${links.map(row=>`<li><a href="${row.href}"${row.key===active?' aria-current="page"':''}>${row.label}</a></li>`).join('')}</ul></nav>`;
    const panel=drawer.querySelector('.ax-drawer-panel'),close=iconButton('ax-drawer-close','Close tool menu',CLOSE_ICON);
    drawer.querySelector('.ax-drawer-head').append(close);
    const focusable=()=>[...panel.querySelectorAll('a[href],button:not([disabled])')];
    function setOpen(open){
      if(open===!drawer.hidden)return;
      menu.setAttribute('aria-expanded',String(open));document.body.classList.toggle('ax-drawer-open',open);
      if(open){drawer.hidden=false;requestAnimationFrame(()=>drawer.classList.add('is-open'));(panel.querySelector('[aria-current="page"]')||focusable()[0])?.focus();}
      else{drawer.classList.remove('is-open');drawer.hidden=true;menu.focus();}
    }
    menu.addEventListener('click',()=>setOpen(drawer.hidden));
    drawer.addEventListener('click',event=>{if(event.target.closest('[data-drawer-close],.ax-drawer-close')||event.target.closest('.ax-drawer-links a'))setOpen(false);});
    drawer.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();setOpen(false);return;}
      if(event.key!=='Tab')return;
      const items=focusable(),first=items[0],last=items.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    });
    matchMedia(SHELL_QUERY).addEventListener?.('change',event=>{if(!event.matches)setOpen(false);});
    document.body.append(drawer);
  }

  // The actions wrapper takes the Bungie emblem's place in each header layout (it carries
  // the same class), so desktop positions are unchanged: refresh, emblem, then menu.
  function mountShell(){
    const header=shellHeader();if(!header||document.querySelector('.ax-shell-actions'))return;
    const actions=document.createElement('div');actions.className='bungie-auth-control ax-shell-actions';
    const refresh=iconButton('ax-refresh-btn','Refresh Guardian data',REFRESH_ICON),menu=iconButton('ax-menu-btn','Open tool menu',MENU_ICON);
    menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-controls','axToolDrawer');
    actions.append(refresh,menu);
    const place=auth=>{if(auth.parentElement===actions)return;auth.before(actions);actions.insertBefore(auth,menu);};
    const auth=document.getElementById('bungieAuthControl');
    if(auth)place(auth);
    else{
      (header.querySelector(':scope > .topbar-actions')||header).append(actions);
      const watch=new MutationObserver(()=>{const found=document.getElementById('bungieAuthControl');if(found){watch.disconnect();place(found);}});
      watch.observe(header,{childList:true,subtree:true});setTimeout(()=>watch.disconnect(),10000);
    }
    wireRefresh(refresh);buildDrawer(menu);
  }

  function init(){seedGuardian();brandHeader();document.querySelectorAll('[data-forge-destination-ribbon]').forEach(render);mountShell();watchScroll();warmReports(window.FORGE_BUNGIE_SESSION);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
