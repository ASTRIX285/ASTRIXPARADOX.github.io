// Early page data for The Forge (perf, 26 Nov 2026).
// Loaded as the first element of each Forge tool page head (a plain blocking script, above every
// stylesheet, the import map and the module preloads), with the page kind in data-page.
// It starts the signed-in reads the page needs as soon as the HTML arrives and leaves the
// in-flight requests on globalThis.FORGE_EARLY_PAGE_DATA. The page code takes them over
// (guardian-bungie-auth.mjs for /session and /bungie/account, core/prepared-page-client.mjs for
// /bungie/page/<kind>), so each request is sent once. Nothing here renders or decides anything.
// - Signed out it sends nothing: it needs this tab's verified session, or a sign-in seen on this
//   browser before (then only the /session check the page makes anyway, handed over).
// - Reads only. No Bungie write and no item action, prerendered or not.
// - It sends the page data request only when the page itself would send it now: no fresh copy of
//   this page in this tab (the page shows that copy first), or the Character and Builder refresh
//   that follows a copy older than a minute.
(function(){
  'use strict';
  if(globalThis.FORGE_EARLY_PAGE_DATA)return;
  var script=document.currentScript;
  var page=String(script&&script.dataset&&script.dataset.page||'');
  var KINDS={character:1,'build-forge':1,journey:1,vault:1,loadout:1};
  var AUTH=globalThis.FORGE_AUTH_ORIGIN||'https://auth.astrixparadox.com';
  var SESSION_KEY='astrix:bungie-session-cache:v1';
  var PAGE_MARKER_PREFIX='astrix:bungie-page-cache:v4:';
  var CHECK_PREFIX='astrix:bungie-page-check:v1:';
  var PROFILE_TTL_MS=12*60*60*1000;
  var FRESH_DISPLAY_MS=60*1000;
  var state={page:KINDS[page]?page:'',session:null,pages:{}};
  globalThis.FORGE_EARLY_PAGE_DATA=state;

  function read(storage,key){try{return JSON.parse(storage.getItem(key)||'null');}catch(error){return null;}}
  function membershipOf(session){return session&&session.activeDestinyMembership||{};}
  // The same identity strings as guardian-session-cache.mjs and guardian-bungie-auth.mjs.
  function identityOf(session){
    var member=membershipOf(session);
    var id=String(member.membershipId||session&&session.primaryMembershipId||session&&session.bungieMembershipId||'');
    return id?String(member.membershipType==null?'':member.membershipType)+':'+id:'';
  }
  function accountKey(session){
    var member=membershipOf(session);
    return String(member.membershipType==null?'':member.membershipType)+':'+String(member.membershipId||session&&session.bungieMembershipId||'');
  }
  function verified(session){
    return Boolean(session&&session.authenticated===true&&session.csrfToken&&session.capabilities&&session.capabilities.destinyActions);
  }
  function withTimeout(ms,run){
    var controller=typeof AbortController==='function'?new AbortController():null;
    var timer=controller?setTimeout(function(){controller.abort();},ms):null;
    return run(controller&&controller.signal).then(function(value){clearTimeout(timer);return value;},function(error){clearTimeout(timer);throw error;});
  }

  // /bungie/account, shared exactly as guardian-bungie-auth.mjs requestAccount() shares it.
  function startAccount(session){
    var key=accountKey(session),current=globalThis.FORGE_BUNGIE_ACCOUNT_REQUEST;
    if(current&&current.key===key)return;
    var promise=withTimeout(12000,function(signal){
      return fetch(new URL('/bungie/account',AUTH),{credentials:'include',headers:{Accept:'application/json'},signal:signal}).then(function(response){
        return response.json().catch(function(){return {};}).then(function(account){
          if(!response.ok)throw new Error(account&&account.error||'account:'+response.status);
          return account;
        });
      });
    });
    var entry={key:key,promise:promise,early:true};
    globalThis.FORGE_BUNGIE_ACCOUNT_REQUEST=entry;
    promise.catch(function(){if(globalThis.FORGE_BUNGIE_ACCOUNT_REQUEST===entry)globalThis.FORGE_BUNGIE_ACCOUNT_REQUEST=null;});
  }

  // The prepared manifest version this browser holds for the page (core/prepared-bundle-cache.mjs).
  function bundleKind(kind){return kind==='journey'?'journey':kind==='loadout'?'loadout':'common';}
  function storedManifestVersion(kind){
    return new Promise(function(resolve){
      var settled=false,db=null;
      function finish(value){if(settled)return;settled=true;clearTimeout(timer);try{db&&db.close();}catch(error){}resolve(value);}
      var timer=setTimeout(function(){finish('');},1500);
      try{
        if(typeof indexedDB==='undefined')return finish('');
        var request=indexedDB.open('astrix-prepared-public-bundles',1);
        request.onupgradeneeded=function(){request.result.createObjectStore('bundles',{keyPath:'kind'});};
        request.onerror=request.onblocked=function(){finish('');};
        request.onsuccess=function(){
          db=request.result;if(settled){db.close();return;}
          try{
            var lookup=db.transaction('bundles','readonly').objectStore('bundles').get(bundleKind(kind)+'@version');
            lookup.onsuccess=function(){finish(String(lookup.result&&lookup.result.manifestVersion||''));};
            lookup.onerror=function(){finish('');};
          }catch(error){finish('');}
        };
      }catch(error){finish('');}
    });
  }

  // What the page will ask for first: nothing (it shows its own fresh copy), display or live.
  function pageFreshness(session,kind){
    var marker=read(sessionStorage,PAGE_MARKER_PREFIX+kind);
    var fresh=marker&&marker.identity===identityOf(session)&&marker.scope===kind&&Date.now()-Number(marker.savedAt||0)<=PROFILE_TTL_MS;
    if(!fresh)return 'display';
    if((kind==='character'||kind==='build-forge')&&Date.now()-Number(marker.savedAt||0)>=FRESH_DISPLAY_MS)return 'live';
    return '';
  }

  function startPage(session,kind){
    var freshness=pageFreshness(session,kind);
    if(!freshness)return;
    var identity=identityOf(session),slot=kind+':'+freshness;
    if(state.pages[slot])return;
    var entry={page:kind,freshness:freshness,identity:identity,manifestVersion:'',taken:false};
    entry.response=storedManifestVersion(kind).then(function(version){
      entry.manifestVersion=version;
      var url=new URL('/bungie/page/'+kind,AUTH);
      url.searchParams.set('freshness',freshness);
      if(version)url.searchParams.set('manifestVersion',version);
      entry.url=url.href;
      return withTimeout(30000,function(signal){return fetch(url,{credentials:'include',cache:'no-store',headers:{Accept:'application/json'},signal:signal});});
    });
    entry.response.catch(function(){});
    state.pages[slot]=entry;
  }

  function startSignedIn(session){
    startAccount(session);
    if(state.page)startPage(session,state.page);
  }

  try{
    var cached=read(sessionStorage,SESSION_KEY);
    if(verified(cached&&cached.session)){startSignedIn(cached.session);return;}
    // A new tab: the page checks /session first anyway. Start that check now only when this
    // browser has seen a sign-in before, and hand the answer to the page.
    var seen=false;
    for(var index=0;index<localStorage.length;index++){if(String(localStorage.key(index)||'').indexOf(CHECK_PREFIX)===0){seen=true;break;}}
    if(!seen)return;
    var response=withTimeout(12000,function(signal){return fetch(AUTH+'/session',{credentials:'include',headers:{Accept:'application/json'},signal:signal});});
    state.session={response:response,taken:false};
    response.then(function(answer){
      if(!answer.ok)return;
      return answer.clone().json().then(function(session){if(session&&session.authenticated===true)startSignedIn(session);});
    }).catch(function(){});
  }catch(error){}
})();
