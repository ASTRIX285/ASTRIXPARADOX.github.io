/* =====================================================================
   ASTRIX PARADOX — GLOBAL PORTAL LOADER controller
   Include on every page AFTER astrix-portal-loader.css.
   API:
     ForgeLoader.mount()        // shows the portal as soon as <body> exists
     ForgeLoader.set(pct)       // 0..100, updates ring + %
     ForgeLoader.status(text)   // optional status line
     ForgeLoader.done()         // fade out — call when the page is RENDERED
     ForgeLoader.ready(root)    // wait for fonts/images + final paint, then fade
   Set the logo path once:  window.APX_LOGO = '/img/logo.png';
   ===================================================================== */
(function(){
  // Keep the outgoing browser snapshot visible until the destination has
  // rendered its data and decoded the images actually inside the viewport.
  var navigationTransition=null,navigationRendered=false,navigationAssets=null,navigationTimer=null,navigationRecovering=false,headerRendered=false;
  function navigationImageReady(image){
    if(image.complete)return image.decode?image.decode().catch(function(){}):Promise.resolve();
    return new Promise(function(resolve){
      var finish=function(){
        image.removeEventListener('load',finish);image.removeEventListener('error',finish);
        resolve(image.decode?image.decode().catch(function(){}):undefined);
      };
      image.addEventListener('load',finish,{once:true});image.addEventListener('error',finish,{once:true});
    });
  }
  document.addEventListener?.('forge:hero-cards-render-complete',function(){headerRendered=true;});
  function navigationVisibleAssets(){
    if(navigationAssets)return navigationAssets;
    var headerReady=headerRendered||!document.querySelector('[data-forge-hero-cards]')||document.querySelector('[data-forge-hero-cards] .guardian-character-card')
      ?Promise.resolve():new Promise(function(resolve){document.addEventListener('forge:hero-cards-render-complete',resolve,{once:true});});
    navigationAssets=headerReady.then(function(){
    var images=Array.prototype.slice.call(document.querySelectorAll('img')).filter(function(image){
      if(image.closest('[hidden],.apx-gate'))return false;
      var rect=image.getBoundingClientRect();
      return rect.width>0&&rect.height>0&&rect.bottom>0&&rect.right>0&&rect.top<window.innerHeight&&rect.left<window.innerWidth;
    });
    var backgrounds=[];
    if(typeof Image==='function'){
      var urls=new Set();
      [document.body].concat(Array.prototype.slice.call(document.querySelectorAll('.scene.immersive,[data-forge-hero-cards] .guardian-character-card'))).forEach(function(node){
        if(!node)return;
        [null,'::before','::after'].forEach(function(pseudo){
          var value=getComputedStyle(node,pseudo).backgroundImage||'';
          var densities=Array.from(value.matchAll(/url\(["']?([^"')]+)["']?\)\s*([0-9.]+)(?:dppx|x)/g));
          if(value.includes('image-set(')&&densities.length){
            densities.sort(function(a,b){return Number(a[2])-Number(b[2]);});
            var choice=densities.find(function(row){return Number(row[2])>=(window.devicePixelRatio||1);})||densities[densities.length-1];
            urls.add(choice[1]);return;
          }
          var pattern=/url\(["']?([^"')]+)["']?\)/g,match;
          while((match=pattern.exec(value)))urls.add(match[1]);
        });
      });
      urls.forEach(function(url){var image=new Image();image.src=url;backgrounds.push(navigationImageReady(image));});
    }
    var fonts=document.fonts&&document.fonts.ready?document.fonts.ready.catch(function(){}):Promise.resolve();
    return Promise.race([
      Promise.all([fonts,Promise.all(images.map(navigationImageReady)),Promise.all(backgrounds)]),
      new Promise(function(resolve){setTimeout(resolve,1800);})
    ]);
    });
    return navigationAssets;
  }
  function revealNavigation(terminal){
    if(!navigationTransition)return;
    var transition=navigationTransition;
    if(terminal)navigationRecovering=true;
    Promise.resolve(terminal?undefined:navigationVisibleAssets()).then(function(){
      if(navigationTransition!==transition||(!terminal&&navigationRecovering))return;
      clearTimeout(navigationTimer);
      document.documentElement.classList.remove('apx-navigation-waiting');
      document.documentElement.classList.add('apx-navigation-ready');
      document.documentElement.dataset.navigationState=terminal?'recovery':'ready';
    });
  }
  function navigationRenderComplete(){navigationRendered=true;revealNavigation(false);}
  if(typeof window.addEventListener==='function')window.addEventListener('pagereveal',function(event){
    if(!event.viewTransition)return;
    navigationTransition=event.viewTransition;navigationRecovering=false;
    document.documentElement.classList.remove('apx-navigation-ready');
    document.documentElement.classList.add('apx-navigation-waiting');
    document.documentElement.dataset.navigationState='rendering';
    navigationTimer=setTimeout(function(){
      window.ForgeLoader?.blocked?.('This page could not finish loading. Retry to continue.');
      revealNavigation(true);
    },30000);
    var cleanup=function(){
      clearTimeout(navigationTimer);navigationTransition=null;
      if(!navigationRendered)window.ForgeLoader?.requireData?.();
      document.documentElement.classList.remove('apx-navigation-waiting');
      document.documentElement.classList.remove('apx-navigation-ready');
    };
    event.viewTransition.finished.then(cleanup,cleanup);
    if(navigationRendered)revealNavigation(false);
  });
  if(window.APX_SKIP_PORTAL===true){
    var noop=function(){};
    document.documentElement.classList.remove('apx-booting');
    window.ForgeLoader={mount:noop,set:noop,status:noop,done:navigationRenderComplete,ready:function(){navigationRenderComplete();return Promise.resolve();},authRequired:noop,authResolved:noop,blocked:noop,skipped:true};
    return;
  }
  // A matching page cache lets navigation paint without replaying the portal.
  // This is only a presentation hint. The page client still validates the
  // cached payload and reopens the gate if it has to fetch missing data.
  function hasWarmPage(){
    try{
      var path=window.location.pathname;
      var page=path.includes('/paradox-build-space/')?'build-forge':
        /\/pages\/guardian-workspace-v2\/(?:index\.html)?$/.test(path)?'character':
        path.includes('/pages/journey/')||path.includes('/pages/mission-reports/')?'journey':
        path.includes('/pages/vault/')?'vault':
        path.includes('/pages/loadout/')||path.includes('/pages/forge-loader/')?'loadout':'';
      if(!page)return false;
      var session=JSON.parse(sessionStorage.getItem('astrix:bungie-session-cache:v1')||'null')?.session;
      var membership=session?.activeDestinyMembership;
      if(!session?.authenticated||!session?.csrfToken||!session?.capabilities?.destinyActions||!membership?.membershipId)return false;
      var identity=String(membership.membershipType)+':'+String(membership.membershipId);
      var marker=JSON.parse(sessionStorage.getItem('astrix:bungie-page-cache:v4:'+page)||'null');
      var age=Date.now()-Number(marker?.savedAt||0);
      return marker?.identity===identity&&marker?.scope===page&&age>=0&&age<=12*60*60*1000;
    }catch{return false;}
  }
  var preparedNavigation=false;
  try{
    var incoming=JSON.parse(sessionStorage.getItem('astrix:prepared-navigation:v1')||'null');
    sessionStorage.removeItem('astrix:prepared-navigation:v1');
    preparedNavigation=incoming?.path===window.location.pathname&&Date.now()-Number(incoming?.at||0)<30000;
  }catch{}
  // Unsupported/aborted view transitions retain a real loading gate. A cache
  // marker alone must never expose the destination before its renderer ends.
  var warmNavigation=hasWarmPage()&&!preparedNavigation;
  if(!warmNavigation)document.documentElement.classList.add('apx-booting');
  else document.documentElement.classList.remove('apx-booting');
  var LOGO = (window.APX_LOGO || '/img/logo.png');
  var SLOW_LOAD_NOTICE_MS=2800,ASSET_WAIT_MS=1800;
  var gate, prog, pct, status, authPanel, authButton, failurePanel, failureMessage, retryButton, noticeTimer, pendingPct=0, pendingStatus='Opening portal', pendingDone=false, pendingAuthUrl='', pendingBlockedMessage='';
  function markup(){
    return ''+
    '<div class="apx-gate" role="status" aria-live="polite" aria-label="Loading">'+
      '<div class="apx-stage">'+
        '<div class="apx-pct">0%</div>'+
        '<div class="apx-portal">'+
          '<div class="apx-aura"></div>'+
          '<div class="apx-tunnel"><i></i><i></i><i></i><i></i><i></i></div>'+
          '<div class="apx-ring a"></div>'+
          '<div class="apx-ring b"></div>'+
          '<div class="apx-prog"></div>'+
          '<div class="apx-core"></div>'+
          '<div class="apx-brandcore">'+
            '<div class="apx-pulse"></div>'+
            '<div class="apx-pulse-ring"></div>'+
            '<div class="apx-pulse-ring two"></div>'+
            '<img class="apx-logo" src="'+LOGO+'" alt="">'+
          '</div>'+
        '</div>'+
        '<div class="apx-brand">ASTRIX <em>PARADOX</em></div>'+
        '<div class="apx-auth-panel" hidden>'+
          '<strong>BUNGIE SIGN-IN</strong>'+
          '<span>Connect your Bungie account to load your live Guardian.</span>'+
          '<button class="apx-auth-button" type="button">CONNECT BUNGIE</button>'+
        '</div>'+
        '<div class="apx-failure-panel" hidden>'+
          '<strong>LIVE GUARDIAN DATA UNAVAILABLE</strong>'+
          '<span></span>'+
          '<button class="apx-auth-button apx-retry-button" type="button">RETRY LIVE DATA</button>'+
        '</div>'+
        // Loading copy is percentage-only. Status calls remain API-compatible.
      '</div>'+
    '</div>';
  }
  function cache(){
    gate=document.querySelector('.apx-gate');
    if(!gate)return;
    prog=gate.querySelector('.apx-prog');pct=gate.querySelector('.apx-pct');status=gate.querySelector('.apx-status');
    authPanel=gate.querySelector('.apx-auth-panel');authButton=authPanel&&authPanel.querySelector('.apx-auth-button');
    failurePanel=gate.querySelector('.apx-failure-panel');failureMessage=failurePanel&&failurePanel.querySelector('span');retryButton=failurePanel&&failurePanel.querySelector('.apx-retry-button');
  }
  function applyAuth(){
    if(!gate||!authPanel||!authButton)return;
    var required=Boolean(pendingAuthUrl);
    gate.classList.toggle('is-auth-required',required);
    authPanel.hidden=!required;
    authButton.onclick=required?function(){window.location.href=pendingAuthUrl;}:null;
  }
  function applyBlocked(){
    if(!gate||!failurePanel)return;
    var blocked=Boolean(pendingBlockedMessage);
    gate.classList.toggle('is-live-blocked',blocked);
    failurePanel.hidden=!blocked;
    if(failureMessage)failureMessage.textContent=pendingBlockedMessage;
    if(retryButton)retryButton.onclick=blocked?function(){window.location.reload();}:null;
  }
  function apply(){
    if(prog)prog.style.setProperty('--p',pendingPct);
    if(pct)pct.textContent=pendingPct+'%';
    if(status)status.textContent=pendingStatus;
    applyAuth();applyBlocked();
    if(pendingDone)finish();
  }
  function mount(){
    if(warmNavigation||pendingDone)return;
    if(document.querySelector('.apx-gate')){
      cache();gate.classList.remove('is-done');document.body.classList.add('apx-loading');apply();document.documentElement.classList.remove('apx-booting');return;
    }
    if(!document.body)return;
    var wrap=document.createElement('div');wrap.innerHTML=markup();
    gate=wrap.firstElementChild;document.body.appendChild(gate);
    document.body.classList.add('apx-loading');cache();apply();
    clearTimeout(noticeTimer);noticeTimer=setTimeout(function(){
      if(pendingAuthUrl||pendingBlockedMessage||pendingDone)return;
      setStatus('Still loading Guardian data');
    },SLOW_LOAD_NOTICE_MS);
    document.documentElement.classList.remove('apx-booting');
  }
  function set(v){
    v=Math.max(0,Math.min(100,Math.round(Number(v)||0)));
    pendingPct=Math.max(pendingPct,v);
    if(prog)prog.style.setProperty('--p',pendingPct);
    if(pct)pct.textContent=pendingPct+'%';
  }
  function setStatus(t){
    pendingStatus=String(t||'Opening portal');
    if(status)status.textContent=pendingStatus;
  }
  function requireData(){
    if(pendingDone)return;
    warmNavigation=false;mount();
  }
  function authRequired(url){
    if(!url){authResolved();blocked('Bungie is not responding. Retry');return;}
    pendingAuthUrl=String(url||'');pendingBlockedMessage='';pendingDone=false;
    warmNavigation=false;mount();setStatus('Sign in to Bungie');applyAuth();revealNavigation(true);
  }
  function authResolved(){pendingAuthUrl='';applyAuth();}
  function blocked(message){
    pendingBlockedMessage=String(message||'Live Guardian data is unavailable.');pendingDone=false;
    warmNavigation=false;mount();setStatus('Live Guardian data unavailable');applyBlocked();revealNavigation(true);
  }
  function settleImage(image){
    if(image.complete)return image.decode?image.decode().catch(function(){}):Promise.resolve();
    var load=new Promise(function(resolve){
      var finish=function(){resolve();};
      image.addEventListener('load',finish,{once:true});
      image.addEventListener('error',finish,{once:true});
    }).then(function(){return image.decode?image.decode().catch(function(){}):undefined;});
    return Promise.race([load,new Promise(function(resolve){setTimeout(resolve,ASSET_WAIT_MS);})]);
  }
  function ready(root){
    if(warmNavigation){done();return Promise.resolve();}
    var target=root&&root.querySelectorAll?root:document;
    var fonts=document.fonts&&document.fonts.ready?document.fonts.ready.catch(function(){}):Promise.resolve();
    var images=Array.prototype.slice.call(target.querySelectorAll('img')).filter(function(image){
      return !image.closest('[hidden]')&&getComputedStyle(image).display!=='none';
    });
    var assets=Promise.all([fonts,Promise.all(images.map(settleImage))]);
    return Promise.race([assets,new Promise(function(resolve){setTimeout(resolve,ASSET_WAIT_MS);})]).then(function(){
      return new Promise(function(resolve){requestAnimationFrame(function(){requestAnimationFrame(function(){done();resolve();});});});
    });
  }
  function finish(){
    if(!gate||gate.classList.contains('is-done'))return;
    clearTimeout(noticeTimer);pendingPct=100;
    if(prog)prog.style.setProperty('--p',100);
    if(pct)pct.textContent='100%';
    gate.classList.add('is-done');document.body.classList.remove('apx-loading');
    if(navigationTransition){gate.remove();gate=null;return;}
    var removeGate=function(event){
      if(event.target!==gate||!pendingDone)return;
      gate.removeEventListener('transitionend',removeGate);
      if(gate&&gate.parentNode)gate.remove();
    };
    gate.addEventListener('transitionend',removeGate);
  }
  function done(){if(pendingAuthUrl||pendingBlockedMessage)return;pendingDone=true;set(100);if(gate)finish();navigationRenderComplete();}
  if(document.body)mount();
  else{
    var bodyObserver=new MutationObserver(function(){
      if(!document.body)return;
      bodyObserver.disconnect();mount();
    });
    bodyObserver.observe(document.documentElement,{childList:true});
    document.addEventListener('DOMContentLoaded',function(){bodyObserver.disconnect();mount();},{once:true});
  }
  window.ForgeLoader={requireData:requireData,mount:mount,set:set,status:setStatus,done:done,ready:ready,authRequired:authRequired,authResolved:authResolved,blocked:blocked};
})();
