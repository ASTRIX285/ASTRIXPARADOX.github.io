/* =====================================================================
   ASTRIX PARADOX — GLOBAL PORTAL LOADER controller
   Include on tool pages only, after astrix-portal-loader.css.
   API:
     ForgeLoader.mount()        // shows the portal as soon as <body> exists
     ForgeLoader.set(pct)       // 0..100, updates ring + %
     ForgeLoader.status(text)   // optional status line
     ForgeLoader.done()         // fade out — call when the page is RENDERED
     ForgeLoader.ready(root)    // wait for fonts/images + final paint, then fade
   Set the logo path once:  window.APX_LOGO = '/img/logo.png';
   ===================================================================== */
(function(){
  if(window.ForgeLoader?.owner==='astrix-portal')return;
  // Only a fresh navigation from the public Tools entry can show animation.
  // Reloads, bookmarks, history and transfers between tools never mount it.
  var entryPortal=false;
  try{
    var source=new URL(document.referrer);
    var navigationType=window.performance?.getEntriesByType('navigation')[0]?.type;
    entryPortal=source.origin===window.location.origin&&/^\/tools(?:\/|\/index\.html)?$/.test(source.pathname)&&(!navigationType||navigationType==='navigate');
  }catch{}
  var loaderScriptSrc=(document.currentScript&&document.currentScript.src)||'';
  var breach=null,breachStarted=false,skin='',skinTimer=null,breachAbort=null;
  var BREACH_READY_MS=1200;
  // A page chooses once. Late imports cannot replace the fallback or revive a gate.
  function chooseSkin(next){
    if(skin||pendingDone||!gate)return false;
    skin=next;clearTimeout(skinTimer);
    gate.classList.add(next==='breach'?'is-breach':'ring-visible');
    gate.classList.remove('breach-pending');
    if(next==='ring')breachAbort?.abort();
    return true;
  }
  function startBreach(){
    if(!entryPortal||breachStarted||!gate||pendingDone)return;
    breachStarted=true;
    if(!loaderScriptSrc||!window.WebGLRenderingContext||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){chooseSkin('ring');return;}
    var deadline=Date.now()+BREACH_READY_MS;
    breachAbort=new AbortController();
    skinTimer=setTimeout(function(){chooseSkin('ring');},BREACH_READY_MS);
    var host=document.createElement('div');host.className='apx-breach-stage';host.setAttribute('aria-hidden','true');gate.insertBefore(host,gate.firstChild);
    import(new URL('./astrix-breach-loader.mjs?v=20260927-single-skin-1',loaderScriptSrc).href)
      .then(function(module){
        if(skin||pendingDone||Date.now()>=deadline){chooseSkin('ring');return null;}
        return module.createBreach({host:host,logoUrl:LOGO,lowTier:(navigator.hardwareConcurrency||8)<=4,signal:breachAbort.signal});
      })
      .then(function(api){
        if(!api){host.remove();return;}
        if(Date.now()>=deadline)chooseSkin('ring');
        if(!chooseSkin('breach')){api.dispose();host.remove();return;}
        breach=api;api.setProgress(pendingPct/100);
      }).catch(function(){host.remove();chooseSkin('ring');});
  }
  function disposeBreach(){clearTimeout(skinTimer);breachAbort?.abort();if(breach){breach.dispose();breach=null;}}
  // Keep the outgoing browser snapshot visible until the destination has
  // rendered its data and decoded the images actually inside the viewport.
  var navigationTransition=null,navigationRendered=false,navigationAssets=null,navigationTimer=null,navigationRecovering=false,headerRendered=false;
  // A slow but healthy page is revealed with its own progress at 4 s. Only a page
  // that has still not rendered after 30 s is treated as a failure.
  var NAVIGATION_REVEAL_MS=4000,NAVIGATION_FAILURE_MS=30000,navigationFailureTimer=null;
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
  function revealNavigation(terminal,state){
    if(!navigationTransition)return;
    var transition=navigationTransition;
    if(terminal)navigationRecovering=true;
    Promise.resolve(terminal?undefined:navigationVisibleAssets()).then(function(){
      if(navigationTransition!==transition||(!terminal&&navigationRecovering))return;
      clearTimeout(navigationTimer);
      document.documentElement.classList.remove('apx-navigation-waiting');
      document.documentElement.classList.add('apx-navigation-ready');
      document.documentElement.dataset.navigationState=state||(terminal?'recovery':'ready');
    });
  }
  function navigationRenderComplete(){navigationRendered=true;clearTimeout(navigationFailureTimer);revealNavigation(false);}
  if(typeof window.addEventListener==='function')window.addEventListener('pagereveal',function(event){
    if(!event.viewTransition)return;
    navigationTransition=event.viewTransition;navigationRecovering=false;
    document.documentElement.classList.remove('apx-navigation-ready');
    document.documentElement.classList.add('apx-navigation-waiting');
    document.documentElement.dataset.navigationState='rendering';
    navigationTimer=setTimeout(function(){
      // Slow is not failed: show the destination and let it report its own progress.
      revealNavigation(true,'loading');
    },NAVIGATION_REVEAL_MS);
    clearTimeout(navigationFailureTimer);
    navigationFailureTimer=setTimeout(function(){
      if(navigationRendered||pendingDone)return;
      window.ForgeLoader?.blocked?.('This page could not finish loading. Retry to continue.');
      document.documentElement.dataset.navigationState='recovery';
    },NAVIGATION_FAILURE_MS);
    var cleanup=function(){
      clearTimeout(navigationTimer);navigationTransition=null;
      document.documentElement.classList.remove('apx-navigation-waiting');
      document.documentElement.classList.remove('apx-navigation-ready');
    };
    event.viewTransition.finished.then(cleanup,cleanup);
    if(navigationRendered)revealNavigation(false);
  });
  var warmNavigation=false;
  if(entryPortal)document.documentElement.classList.add('apx-booting');
  var LOGO = (window.APX_LOGO || '/img/logo.png');
  var SLOW_LOAD_NOTICE_MS=2800,ASSET_WAIT_MS=1800;
  var gate, prog, pct, status, authPanel, authButton, failurePanel, failureMessage, retryButton, continueButton, noticeTimer, pendingPct=0, pendingStatus='Opening portal', pendingDone=false, pendingAuthUrl='', pendingBlockedMessage='';
  function markup(){
    return ''+
    '<div class="apx-gate '+(entryPortal?'breach-pending':'is-recovery')+'" role="status" aria-live="polite" aria-label="Loading">'+
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
        '<div class="apx-brand"><span class="apx-brand-kicker">AI GAMING INTELLIGENCE</span><span class="apx-brand-word"><span class="apx-brand-chrome">ASTRI</span><b>X</b></span><em>PARADOX</em></div>'+
        '<div class="apx-auth-panel" hidden>'+
          '<strong>BUNGIE SIGN-IN</strong>'+
          '<span>Connect your Bungie account to load your live Guardian.</span>'+
          '<button class="apx-auth-button" type="button">CONNECT BUNGIE</button>'+
        '</div>'+
        '<div class="apx-failure-panel" hidden>'+
          '<strong>LIVE GUARDIAN DATA UNAVAILABLE</strong>'+
          '<span></span>'+
          '<button class="apx-auth-button apx-retry-button" type="button">RETRY LIVE DATA</button>'+
          '<button class="apx-auth-button apx-continue-button" type="button">CONTINUE WITHOUT LIVE DATA</button>'+
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
    failurePanel=gate.querySelector('.apx-failure-panel');failureMessage=failurePanel&&failurePanel.querySelector('span');retryButton=failurePanel&&failurePanel.querySelector('.apx-retry-button');continueButton=failurePanel&&failurePanel.querySelector('.apx-continue-button');
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
    if(continueButton)continueButton.onclick=blocked?function(){pendingBlockedMessage='';pendingAuthUrl='';applyBlocked();applyAuth();done();}:null;
  }
  function apply(){
    if(prog)prog.style.setProperty('--p',pendingPct);
    if(pct)pct.textContent=pendingPct+'%';
    if(status)status.textContent=pendingStatus;
    applyAuth();applyBlocked();
    if(pendingDone)finish();
  }
  function mount(){
    if(warmNavigation||pendingDone||(!entryPortal&&!pendingAuthUrl&&!pendingBlockedMessage))return;
    if(gate||document.querySelector('.apx-gate')){
      cache();gate.classList.remove('is-done');document.body.classList.add('apx-loading');apply();document.documentElement.classList.remove('apx-booting');return;
    }
    if(!document.body)return;
    var wrap=document.createElement('div');wrap.innerHTML=markup();
    gate=wrap.firstElementChild;document.body.appendChild(gate);
    document.body.classList.add('apx-loading');cache();apply();startBreach();
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
    if(breach)breach.setProgress(pendingPct/100);
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
    if(pendingDone)return;
    if(!url){authResolved();blocked('Bungie is not responding. Retry');return;}
    pendingAuthUrl=String(url||'');pendingBlockedMessage='';pendingDone=false;
    warmNavigation=false;mount();setStatus('Sign in to Bungie');applyAuth();revealNavigation(true);
  }
  function authResolved(){pendingAuthUrl='';applyAuth();}
  function blocked(message){
    if(pendingDone)return;
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
    disposeBreach();
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
  window.addEventListener?.('pageshow',function(event){
    if(!event.persisted)return;
    entryPortal=false;disposeBreach();clearTimeout(noticeTimer);
    document.documentElement.classList.remove('apx-booting');
    if(!gate)return;
    gate.classList.remove('breach-pending','ring-visible','is-breach');
    if(pendingAuthUrl||pendingBlockedMessage){gate.classList.add('is-recovery');return;}
    gate.remove();gate=null;document.body.classList.remove('apx-loading');
  });
  function done(){if(pendingAuthUrl||pendingBlockedMessage||pendingDone)return;pendingDone=true;set(100);if(gate)finish();document.dispatchEvent?.(new CustomEvent('forge:portal-ready'));navigationRenderComplete();}
  if(document.body)mount();
  else{
    var bodyObserver=new MutationObserver(function(){
      if(!document.body)return;
      bodyObserver.disconnect();mount();
    });
    bodyObserver.observe(document.documentElement,{childList:true});
    document.addEventListener('DOMContentLoaded',function(){bodyObserver.disconnect();mount();},{once:true});
  }
  window.ForgeLoader={owner:'astrix-portal',get completed(){return pendingDone;},requireData:requireData,mount:mount,set:set,status:setStatus,done:done,ready:ready,authRequired:authRequired,authResolved:authResolved,blocked:blocked};
  if(window.APX_AUTO_READY===true){if(document.readyState==='complete')void ready();else window.addEventListener('load',function(){void ready();},{once:true});}
})();
