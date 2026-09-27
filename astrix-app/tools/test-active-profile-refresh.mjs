import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ACTIVE_PROFILE_REFRESH_MS,createActiveProfileRefresh,getProfileRefreshState,refreshProfile,subscribeProfileRefresh} from '../core/active-profile-refresh.mjs';
import {createPreparedPageRefreshController,markPreparedPageCheckSuccess} from '../pages/guardian-workspace-v2/guardian-session-cache.mjs';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const MINUTE=60_000;
assert.equal(ACTIVE_PROFILE_REFRESH_MS,5*MINUTE);

function harness({key='synthetic-account:journey',page='journey',...overrides}={}){
 let time=1_000_000,sequence=0,calls=0,concurrent=0,maximum=0,successfulAt=time,current=true;
 const timers=new Map(),doc=new EventTarget(),events=new EventTarget();doc.visibilityState='visible';
 let pending=null,fail=false,hold=false;
 const controller=createActiveProfileRefresh({key,page,documentTarget:doc,eventTarget:events,now:()=>time,
   setTimer(fn,delay){const id=++sequence;timers.set(id,{fn,at:time+delay});return id;},clearTimer:id=>timers.delete(id),
   readSuccessfulAt:()=>successfulAt,saveSuccessfulAt:value=>{successfulAt=value;},isCurrent:()=>current,
   refresh:async options=>{
     assert.equal(options.force,true);calls++;concurrent++;maximum=Math.max(maximum,concurrent);
     try{if(hold)await new Promise(resolve=>{pending=resolve;});if(fail)throw new Error('synthetic outage');return {profile:{},sequence:calls};}
     finally{concurrent--;}
   },...overrides
 });
 async function advance(ms){
   time+=ms;
   for(const [id,timer] of [...timers])if(timer.at<=time){timers.delete(id);timer.fn();}
   await flush();
 }
 return {controller,doc,events,timers,advance,
  input(type='pointerdown'){doc.dispatchEvent(new Event(type));},
  async visibility(state){doc.visibilityState=state;doc.dispatchEvent(new Event('visibilitychange'));await flush();},
  release(){pending?.();pending=null;},set hold(value){hold=value;},set fail(value){fail=value;},set current(value){current=value;},
  get calls(){return calls;},get maximum(){return maximum;},get time(){return time;},get successfulAt(){return successfulAt;}
 };
}

// Active cadence, idle pause, hidden pause, immediate return and cleanup.
{
 const h=harness();h.controller.start();
 assert.equal(h.timers.size,0);await h.advance(6*MINUTE);assert.equal(h.calls,0);
 h.input();await h.advance(0);assert.equal(h.calls,1);
 assert.equal(getProfileRefreshState().lastUpdated,h.time);
 h.input('keydown');await h.advance(5*MINUTE);assert.equal(h.calls,2);
 await h.advance(5*MINUTE+1);assert.equal(h.calls,2,'Idle tabs do not refresh');assert.equal(h.timers.size,0);
 h.input('wheel');await h.advance(0);assert.equal(h.calls,3,'Interaction resumes stale data');
 await h.visibility('hidden');await h.advance(30*MINUTE);h.input();assert.equal(h.calls,3);
 await refreshProfile();assert.equal(h.calls,3,'Manual path is paused while hidden');
 await h.visibility('visible');assert.equal(h.calls,4,'Returning refreshes immediately');
 await h.visibility('visible');assert.equal(h.calls,4,'Duplicate visibility events do not reload');
 h.events.dispatchEvent(new Event('pagehide'));await h.advance(10*MINUTE);assert.equal(h.calls,4);
 h.events.dispatchEvent(new Event('pageshow'));await flush();assert.equal(h.calls,5);
 h.events.dispatchEvent(new Event('pageshow'));await flush();assert.equal(h.calls,5);
 h.controller.stop();h.input();await h.advance(10*MINUTE);assert.equal(h.calls,5);assert.equal(h.timers.size,0);
 assert.deepEqual(getProfileRefreshState(),{page:null,available:false,refreshing:false,lastUpdated:null});
}

// Timer, input, manual clicks and visible return share one pending request.
{
 const h=harness();h.controller.start();h.hold=true;
 const states=[];const unsubscribe=subscribeProfileRefresh(state=>states.push(state));
 const one=refreshProfile(),two=refreshProfile();assert.equal(one,two);
 await flush();assert.equal(h.calls,1);assert.equal(getProfileRefreshState().refreshing,true);
 h.input();await h.advance(5*MINUTE);assert.equal(h.calls,1);
 await h.visibility('hidden');await h.visibility('visible');
 assert.equal(refreshProfile(),one);assert.equal(h.calls,1);
 h.release();await one;assert.equal(h.maximum,1);assert.equal(h.successfulAt,h.time);
 assert.ok(states.some(state=>state.refreshing));assert.equal(states.at(-1).refreshing,false);
 unsubscribe();h.controller.stop();
}

// Failures retain the successful timestamp and input cannot bypass backoff.
{
 const h=harness();h.controller.start();const before=h.successfulAt;
 h.fail=true;await assert.rejects(refreshProfile(),/synthetic outage/);
 assert.equal(h.successfulAt,before);assert.equal(getProfileRefreshState().lastUpdated,before);
 h.input();await h.advance(30_000);assert.equal(h.calls,1);
 h.fail=false;await h.advance(30_000);assert.equal(h.calls,2);assert.equal(h.successfulAt,h.time);
 h.controller.stop();
}

// Account replacement is serialized and does not inherit the old result.
{
 const a=harness({key:'synthetic-a:journey'});a.hold=true;a.controller.start();const old=refreshProfile();await flush();
 const b=harness({key:'synthetic-b:journey'});b.controller.start();const fresh=refreshProfile();await flush();
 assert.equal(b.calls,0);a.release();assert.equal(await old,null);await fresh;assert.equal(b.calls,1);
 b.current=false;b.events.dispatchEvent(new Event('forge:bungie-session'));await b.advance(10*MINUTE);
 assert.equal(getProfileRefreshState().available,false);assert.equal(b.calls,1);assert.equal(b.timers.size,0);
}

// Blocked browser storage falls back to a real in-memory successful timestamp.
{
 const session={authenticated:true,activeDestinyMembership:{membershipType:3,membershipId:'synthetic-storage'}};
 let now=2_000_000,calls=0;const doc=new EventTarget();doc.visibilityState='visible';
 const storage={getItem(){throw new Error('denied');},setItem(){throw new Error('denied');}};
 const controller=createPreparedPageRefreshController({session,page:'vault',documentTarget:doc,eventTarget:new EventTarget(),storage,now:()=>now,
   setTimer:()=>1,clearTimer(){},refresh:async()=>{calls++;return {profile:{}};}}).start();
 assert.equal(getProfileRefreshState().lastUpdated,null);
 await refreshProfile();assert.equal(getProfileRefreshState().lastUpdated,now);
 now+=1000;assert.equal(controller.check(),null);assert.equal(calls,1);
 markPreparedPageCheckSuccess(session,'vault',{storage,now:()=>now});assert.equal(getProfileRefreshState().lastUpdated,now);
 globalThis.FORGE_BUNGIE_SESSION={authenticated:false};
 assert.equal(await refreshProfile(),null);assert.equal(calls,1);
 controller.stop();delete globalThis.FORGE_BUNGIE_SESSION;
}

// Real adapters, including Character/Build, use the shared lifecycle.
for(const [path,pattern] of [
 ['../pages/journey/journey.mjs',/createPreparedPageRefreshController/],
 ['../pages/vault/vault.mjs',/createPreparedPageRefreshController/],
 ['../pages/loadout/paradox-loadouts.mjs',/createPreparedPageRefreshController/],
 ['../pages/forge-loader/forge-loader-refresh.mjs',/FORGE_REFRESH_MS=5\*60\*1000/],
 ['../pages/guardian-workspace-v2/guardian-bungie-profile.mjs',/page:currentPagePayloadKind\(\)[\s\S]*?loadLiveProfile\(session,\{background:true\}\)/]
])assert.match(await readFile(new URL(path,import.meta.url),'utf8'),pattern);
console.log('ACTIVE_PROFILE_REFRESH=PASS five-minute activity, hidden/idle pause, return, single flight, retry, timestamps, account isolation, adapters');
