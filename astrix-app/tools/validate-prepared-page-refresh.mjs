import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {
  PREPARED_PAGE_REFRESH_MS,
  PROFILE_TTL_MS,
  bindPreparedPageRefreshControl,
  cacheBungieProfile,
  createPreparedPageRefreshController,
  markPreparedPageCheckSuccess,
  readCachedBungieProfile,
  readPreparedPageCheck
} from '../pages/guardian-workspace-v2/guardian-session-cache.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const read=path=>readFileSync(new URL(path,`file://${root}/`),'utf8');

function memoryStorage(){
  const rows=new Map();
  return {
    get length(){return rows.size;},
    key(index){return [...rows.keys()][index]??null;},
    getItem(key){return rows.has(String(key))?rows.get(String(key)):null;},
    setItem(key,value){rows.set(String(key),String(value));},
    removeItem(key){rows.delete(String(key));}
  };
}

function scheduler(){
  let nextId=1;
  const timers=new Map();
  return {
    timers,
    setTimer(callback,delay){const id=nextId++;timers.set(id,{callback,delay});return id;},
    clearTimer(id){timers.delete(id);},
    first(){return [...timers.values()][0]||null;}
  };
}

const flush=()=>new Promise(resolve=>setImmediate(resolve));
const session={authenticated:true,activeDestinyMembership:{membershipType:3,membershipId:'refresh-account'}};
const payload={pageReady:{page:'journey'},profile:{characters:{data:{guardian:{characterId:'guardian'}}}}};
const persistent=memoryStorage();
globalThis.localStorage=persistent;
globalThis.sessionStorage=memoryStorage();

assert.equal(PROFILE_TTL_MS,12*60*60*1000,'The cached payload trust ceiling must remain twelve hours.');
assert.equal(PREPARED_PAGE_REFRESH_MS,10*60*1000,'Prepared page checks must run every ten minutes.');
await cacheBungieProfile(session,payload,'journey');

const staleLoadout={pageReady:{page:'loadout'},profile:{characters:{data:{guardian:{characterId:'guardian'}}}}};
await cacheBungieProfile(session,staleLoadout,'loadout');
assert.equal(await readCachedBungieProfile(session,'loadout'),null,'A pre weapon coverage Loadout payload must be invalidated instead of painted for twelve hours.');
const currentLoadout={...staleLoadout,weaponDefinitionCoverage:{schemaVersion:1,itemInstances:[],complete:true}};
await cacheBungieProfile(session,currentLoadout,'loadout');
assert.deepEqual(await readCachedBungieProfile(session,'loadout'),currentLoadout,'The current exact weapon coverage payload must remain reloadable.');
console.log('PAGE_REFRESH_LOADOUT_CONTRACT_INVALIDATION=PASS');

let now=1_000_000;
markPreparedPageCheckSuccess(session,'journey',{storage:persistent,now:()=>now});
let backendCalls=0;
const pollScheduler=scheduler();
const pollController=createPreparedPageRefreshController({
  session,
  page:'journey',
  storage:persistent,
  now:()=>now,
  setTimer:pollScheduler.setTimer,
  clearTimer:pollScheduler.clearTimer,
  refresh:async()=>{backendCalls+=1;return payload;}
});
pollController.start();
assert.equal(pollScheduler.first()?.delay,PREPARED_PAGE_REFRESH_MS);
now+=PREPARED_PAGE_REFRESH_MS;
pollScheduler.first().callback();
await flush();
assert.equal(backendCalls,1,'Ten minutes without a reload must fire one prepared route request.');
assert.equal(readPreparedPageCheck(session,'journey',{storage:persistent}),now);
pollController.stop();
console.log(`PAGE_REFRESH_TEN_MINUTE_POLL=PASS elapsed=${PREPARED_PAGE_REFRESH_MS}ms backendCalls=${backendCalls}`);

const reloadElapsed=4*60*1000;
now+=reloadElapsed;
const reloadScheduler=scheduler();
let reloadBackendCalls=0;
const cached=await readCachedBungieProfile(session,'journey');
assert.deepEqual(cached,payload,'A reload inside the check window must serve the existing page cache.');
const reloadController=createPreparedPageRefreshController({
  session,
  page:'journey',
  storage:persistent,
  now:()=>now,
  setTimer:reloadScheduler.setTimer,
  clearTimer:reloadScheduler.clearTimer,
  refresh:async()=>{reloadBackendCalls+=1;return payload;}
});
reloadController.start();
await flush();
const remaining=PREPARED_PAGE_REFRESH_MS-reloadElapsed;
assert.equal(reloadBackendCalls,0,'A reload inside the check window must not issue a redundant prepared route request.');
assert.equal(reloadScheduler.first()?.delay,remaining);
reloadController.stop();
console.log(`PAGE_REFRESH_RELOAD_CACHE=PASS elapsed=${reloadElapsed}ms cacheHits=1 backendCalls=${reloadBackendCalls} remaining=${remaining}ms`);

class RefreshButton extends EventTarget{
  constructor(){super();this.disabled=true;this.hidden=false;this.textContent='Refresh';this.attributes=new Map();}
  setAttribute(name,value){this.attributes.set(name,String(value));}
  getAttribute(name){return this.attributes.get(name)||null;}
  click(){this.dispatchEvent(new Event('click'));}
}

const manualScheduler=scheduler();
let manualCalls=0;
let manualReason='';
let requestObserved=()=>{};
const requestStarted=new Promise(resolve=>{requestObserved=resolve;});
const manualController=createPreparedPageRefreshController({
  session,
  page:'journey',
  storage:persistent,
  now:()=>now,
  setTimer:manualScheduler.setTimer,
  clearTimer:manualScheduler.clearTimer,
  refresh:async({reason})=>{manualCalls+=1;manualReason=reason;requestObserved();return payload;}
});
manualController.start();
const button=new RefreshButton();
bindPreparedPageRefreshControl(button,manualController);
button.click();
await requestStarted;
await flush();
assert.equal(manualCalls,1,'The manual Refresh click must issue a request immediately.');
assert.equal(manualReason,'manual');
assert.equal(button.textContent,'Refresh');
assert.equal(button.getAttribute('aria-busy'),'false');
manualController.stop();
console.log(`PAGE_REFRESH_MANUAL_BYPASS=PASS elapsed=0ms clicks=1 backendCalls=${manualCalls}`);

const sessionCache=read('astrix-app/pages/guardian-workspace-v2/guardian-session-cache.mjs');
const heroCards=read('astrix-app/shared/astrix-hero-cards.mjs');
const preparedClient=read('astrix-app/core/prepared-page-client.mjs');
const pages={
  journey:[read('astrix-app/pages/journey/index.html'),read('astrix-app/pages/journey/journey.mjs'),/loadPreparedPagePayload\(session,'journey'/],
  vault:[read('astrix-app/pages/vault/index.html'),read('astrix-app/pages/vault/vault.mjs'),/loadPreparedPagePayload\(session,'vault'/],
  loadout:[read('astrix-app/pages/forge-loader/index.html'),`${read('astrix-app/pages/forge-loader/forge-loader.mjs')}\n${read('astrix-app/pages/forge-loader/forge-loader-preload.mjs')}\n${read('astrix-app/pages/forge-loader/forge-loader-refresh.mjs')}`,/loadPreparedPagePayload\(session,'loadout'/]
};
assert.match(sessionCache,/PREPARED_PAGE_REFRESH_MS=10\*60\*1000/);
assert.match(sessionCache,/PREPARED_PAGE_CHECK_PREFIX[\s\S]*?localStorage/,'Successful check timestamps must survive a page reload.');
assert.match(heroCards,/loadPreparedPagePayload\(session,page/,'Shared Guardian cards must delegate reload cache policy to the shared page client.');
assert.match(preparedClient,/readCachedBungieProfile\(session,page\)[\s\S]*?if\(cached\?\.pageReady/,'The shared page client must not bypass a valid prepared page cache on reload.');
for(const [page,[html,runtime,requestPattern]] of Object.entries(pages)){
  const control=page==='loadout'?'forgeRefreshButton':`${page}RefreshButton`;
  assert.match(html,new RegExp(`id="${control}"[\\s\\S]*?>${page==='loadout'?'Check for new Exotic':'Refresh'}<`),`${page} must expose the manual Refresh control.`);
  assert.match(runtime,/createPreparedPageRefreshController/);
  assert.match(runtime,page==='loadout'?/bindExoticCheckControl/:/bindPreparedPageRefreshControl/);
  assert.match(runtime,requestPattern);
  assert.doesNotMatch(runtime,/bungie\/manifest\/definitions?|definitions\?type=/,'Refresh paths must never issue per item definition requests.');
}

console.log('PREPARED_PAGE_REFRESH_VALIDATOR=PASS');
