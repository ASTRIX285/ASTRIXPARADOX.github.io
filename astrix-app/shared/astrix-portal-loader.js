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
  if(window.APX_SKIP_PORTAL===true){
    var noop=function(){};
    document.documentElement.classList.remove('apx-booting');
    window.ForgeLoader={mount:noop,set:noop,status:noop,done:noop,ready:function(){return Promise.resolve();},authRequired:noop,authResolved:noop,skipped:true};
    return;
  }
  document.documentElement.classList.add('apx-booting');
  var LOGO = (window.APX_LOGO || '/img/logo.png');
  var gate, prog, pct, status, authPanel, authButton, pendingPct=0, pendingStatus='Opening portal', pendingDone=false, pendingAuthUrl='';
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
          '<strong>BUNGIE AUTHENTICATION</strong>'+
          '<span>Connect your Bungie account to load your live Guardian.</span>'+
          '<button class="apx-auth-button" type="button">CONNECT BUNGIE</button>'+
        '</div>'+
        '<p class="apx-status">Opening portal</p>'+
      '</div>'+
    '</div>';
  }
  function cache(){
    gate=document.querySelector('.apx-gate');
    if(!gate)return;
    prog=gate.querySelector('.apx-prog');pct=gate.querySelector('.apx-pct');status=gate.querySelector('.apx-status');
    authPanel=gate.querySelector('.apx-auth-panel');authButton=gate.querySelector('.apx-auth-button');
  }
  function applyAuth(){
    if(!gate||!authPanel||!authButton)return;
    var required=Boolean(pendingAuthUrl);
    gate.classList.toggle('is-auth-required',required);
    authPanel.hidden=!required;
    authButton.onclick=required?function(){window.location.href=pendingAuthUrl;}:null;
  }
  function apply(){
    if(prog)prog.style.setProperty('--p',pendingPct);
    if(pct)pct.textContent=pendingPct+'%';
    if(status)status.textContent=pendingStatus;
    applyAuth();
    if(pendingDone)finish();
  }
  function mount(){
    if(document.querySelector('.apx-gate')){
      cache();apply();document.documentElement.classList.remove('apx-booting');return;
    }
    if(!document.body)return;
    var wrap=document.createElement('div');wrap.innerHTML=markup();
    gate=wrap.firstElementChild;document.body.appendChild(gate);
    document.body.classList.add('apx-loading');cache();apply();
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
  function authRequired(url){
    pendingAuthUrl=String(url||'');pendingDone=false;
    setStatus('Bungie authentication required');applyAuth();
  }
  function authResolved(){pendingAuthUrl='';applyAuth();}
  function settleImage(image){
    if(image.complete)return image.decode?image.decode().catch(function(){}):Promise.resolve();
    return new Promise(function(resolve){
      var finish=function(){resolve();};
      image.addEventListener('load',finish,{once:true});
      image.addEventListener('error',finish,{once:true});
    }).then(function(){return image.decode?image.decode().catch(function(){}):undefined;});
  }
  function ready(root){
    var target=root&&root.querySelectorAll?root:document;
    var fonts=document.fonts&&document.fonts.ready?document.fonts.ready.catch(function(){}):Promise.resolve();
    var images=Array.prototype.slice.call(target.querySelectorAll('img')).filter(function(image){
      return !image.closest('[hidden]')&&getComputedStyle(image).display!=='none';
    });
    return Promise.all([fonts,Promise.all(images.map(settleImage))]).then(function(){
      return new Promise(function(resolve){requestAnimationFrame(function(){requestAnimationFrame(function(){done();resolve();});});});
    });
  }
  function finish(){
    if(!gate||gate.classList.contains('is-done'))return;
    pendingPct=100;
    if(prog)prog.style.setProperty('--p',100);
    if(pct)pct.textContent='100%';
    gate.classList.add('is-done');document.body.classList.remove('apx-loading');
    var removeGate=function(event){
      if(event.target!==gate)return;
      gate.removeEventListener('transitionend',removeGate);
      if(gate&&gate.parentNode)gate.remove();
    };
    gate.addEventListener('transitionend',removeGate);
  }
  function done(){if(pendingAuthUrl)return;pendingDone=true;set(100);if(gate)finish();}
  if(document.body)mount();
  else{
    var bodyObserver=new MutationObserver(function(){
      if(!document.body)return;
      bodyObserver.disconnect();mount();
    });
    bodyObserver.observe(document.documentElement,{childList:true});
    document.addEventListener('DOMContentLoaded',function(){bodyObserver.disconnect();mount();},{once:true});
  }
  window.ForgeLoader={mount:mount,set:set,status:setStatus,done:done,ready:ready,authRequired:authRequired,authResolved:authResolved};
})();
