// Shared, data-only refresh lifecycle. Header controls consume this same API.
export const ACTIVE_PROFILE_REFRESH_MS=5*60*1000;
const KEY=Symbol.for('astrix.active-profile-refresh.v1');
const shared=globalThis[KEY]||(globalThis[KEY]={controller:null,flight:null,listeners:new Set()});

export function getProfileRefreshState(){
  return shared.controller?.state()||{page:null,available:false,refreshing:false,lastUpdated:null};
}
export function notifyProfileRefreshState(){
  const state=getProfileRefreshState();
  for(const listener of shared.listeners){try{listener(state);}catch(error){console.error('[Profile refresh listener]',error);}}
  if(typeof globalThis.CustomEvent==='function')globalThis.document?.dispatchEvent?.(new CustomEvent('forge:profile-refresh-state',{detail:state}));
}
export function subscribeProfileRefresh(listener){
  if(typeof listener!=='function')throw new TypeError('A refresh state listener is required.');
  shared.listeners.add(listener);listener(getProfileRefreshState());
  return ()=>shared.listeners.delete(listener);
}
export function refreshProfile(){
  return shared.controller?.refreshNow()||Promise.resolve(null);
}

// Retain a finishing controller's lock until completion. Different accounts
// serialize without receiving each other's result.
function exclusive(key,operation){
  if(shared.flight){
    if(shared.flight.key===key)return shared.flight.promise;
    return shared.flight.promise.catch(()=>{}).then(()=>exclusive(key,operation));
  }
  const promise=Promise.resolve().then(operation).finally(()=>{
    if(shared.flight?.promise===promise)shared.flight=null;
  });
  shared.flight={key,promise};
  return promise;
}

export function createActiveProfileRefresh({
  key,page,refresh,isCurrent=()=>true,readSuccessfulAt=()=>0,saveSuccessfulAt=()=>{},
  intervalMs=ACTIVE_PROFILE_REFRESH_MS,retryMs=60*1000,activityMs=ACTIVE_PROFILE_REFRESH_MS,
  now=Date.now,setTimer=(fn,delay)=>setTimeout(fn,delay),clearTimer=id=>clearTimeout(id),
  documentTarget=globalThis.document,eventTarget=globalThis,onError=()=>{}
}={}){
  if(!key||typeof refresh!=='function')throw new TypeError('A profile identity and refresh callback are required.');
  if(![intervalMs,retryMs,activityMs].every(value=>Number.isFinite(value)&&value>0))throw new TypeError('Refresh intervals must be positive.');
  let running=false,suspended=false,timer=null,activeRequest=null,lastInteraction=null,lastSuccess=0,retryAt=0;
  const removers=[];
  const visible=()=>!suspended&&documentTarget?.visibilityState!=='hidden';
  const eligible=()=>running&&visible()&&isCurrent();
  const recent=()=>lastInteraction!==null&&Number(now())-lastInteraction<=activityMs;
  const lastSuccessfulAt=()=>Math.max(lastSuccess,Number(readSuccessfulAt())||0);
  const cancel=()=>{if(timer!==null)clearTimer(timer);timer=null;};
  function schedule(){
    cancel();
    if(!eligible()||!recent()||activeRequest)return;
    const last=lastSuccessfulAt();
    const due=retryAt||(last?last+intervalMs:Number(now()));
    timer=setTimer(()=>{timer=null;void check()?.catch(()=>{});},Math.max(0,due-Number(now())));
  }
  function run(reason){
    if(!eligible())return Promise.resolve(null);
    if(activeRequest)return activeRequest;
    if(reason==='poll'&&!recent())return Promise.resolve(null);
    cancel();
    activeRequest=exclusive(key,()=>{
      // Recheck visibility/account after a preceding account request finishes.
      if(!eligible()||(reason==='poll'&&!recent()))return null;
      return refresh({reason,force:true});
    }).then(result=>{
      if(!running||!isCurrent())return null;
      if(result===null||result===false||result===undefined)throw new Error('Profile refresh returned no payload.');
      lastSuccess=Number(now());retryAt=0;
      saveSuccessfulAt(lastSuccess);
      return result;
    }).catch(error=>{
      retryAt=Number(now())+Math.min(intervalMs,retryMs);
      onError(error,reason);
      throw error;
    }).finally(()=>{
      activeRequest=null;
      if(running)schedule();
      notifyProfileRefreshState();
    });
    notifyProfileRefreshState();
    return activeRequest;
  }
  function check(){
    if(!eligible()||!recent()){cancel();return null;}
    if(activeRequest)return activeRequest;
    const checked=lastSuccessfulAt();
    if(retryAt?Number(now())>=retryAt:(!checked||Number(now())-checked>=intervalMs))return run('poll');
    schedule();return null;
  }
  const interaction=()=>{
    if(!eligible())return;
    lastInteraction=Number(now());
    // Input resumes stale/idle polling without overriding a retry backoff.
    schedule();
  };
  const resume=()=>{
    if(!running)return;
    suspended=false;
    if(visible()&&isCurrent()){
      lastInteraction=Number(now());
      void run('resume').catch(()=>{});
    }
  };
  let wasHidden=documentTarget?.visibilityState==='hidden';
  const visibility=()=>{
    const hidden=documentTarget?.visibilityState==='hidden';
    if(hidden){wasHidden=true;cancel();notifyProfileRefreshState();}
    else if(wasHidden){wasHidden=false;resume();}
  };
  function listen(target,type,handler,options){
    target?.addEventListener?.(type,handler,options);
    removers.push(()=>target?.removeEventListener?.(type,handler,options));
  }
  const controller={
    start(){
      if(running)return this;
      shared.controller?.stop();
      shared.controller=this;running=true;suspended=false;
      wasHidden=documentTarget?.visibilityState==='hidden';
      for(const type of ['pointerdown','pointermove','keydown','wheel','touchstart'])listen(documentTarget,type,interaction,{passive:true});
      listen(documentTarget,'visibilitychange',visibility);
      listen(eventTarget,'pagehide',()=>{suspended=true;cancel();notifyProfileRefreshState();});
      listen(eventTarget,'pageshow',()=>{if(suspended)resume();});
      listen(eventTarget,'online',()=>{void check()?.catch(()=>{});});
      listen(eventTarget,'forge:bungie-session',()=>{if(!isCurrent())this.stop();});
      // Do not invent interaction on mount. Preserve cache-first initial paint.
      schedule();notifyProfileRefreshState();return this;
    },
    stop(){
      running=false;cancel();
      for(const remove of removers.splice(0))remove();
      if(shared.controller===this)shared.controller=null;
      notifyProfileRefreshState();
    },
    check,
    refreshNow(){if(eligible())lastInteraction=Number(now());return run('manual');},
    lastSuccessfulAt,
    state(){return {page,available:eligible(),refreshing:Boolean(activeRequest),lastUpdated:lastSuccessfulAt()||null};}
  };
  return controller;
}
