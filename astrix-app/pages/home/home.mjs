import {AUTH_ORIGIN,authStartUrl,getBungieSession} from '../guardian-workspace-v2/guardian-bungie-auth.mjs?v=20260913-live-character-2&plain=20260925-2&refresh=20260927-1&recovery=20260927-4';
import {abilityCopy,classLine,dailySeed,durationCopy,format,modeCopy,selfCopy,sinceCopy,timeCopy,weaponLine} from './home-copy.mjs?v=20260928-1';

const byId=id=>document.getElementById(id);
const REQUEST_TIMEOUT_MS=15000;
const CLASS_COLOURS={Warlock:'var(--home-warlock)',Hunter:'var(--home-hunter)',Titan:'var(--home-titan)'};

function setText(id,text){const node=byId(id);if(node)node.textContent=text;}
function show(id,visible){const node=byId(id);if(node)node.hidden=!visible;}
function el(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}

function render(summary,seed){
  const time=timeCopy(summary.timePlayed);
  if(time){
    setText('homeTimePrefix',time.headline.prefix+' ');setText('homeTimeValue',time.headline.value);setText('homeTimeSuffix',' '+time.headline.suffix);
    setText('homeTimeDetail',time.detail);show('homeTime',true);
  }
  if(summary.displayName)setText('homeWelcome',`WELCOME BACK, ${summary.displayName.toUpperCase()}`);

  if(summary.mainCharacter&&summary.classShares?.length){
    setText('homeMainClass',summary.mainCharacter.className);
    setText('homeMainShare',`${summary.mainCharacter.share}% OF YOUR TIME`);
    setText('homeMainLine',classLine(summary.mainCharacter.className,seed)||'');
    const bars=byId('homeClassBars');bars.replaceChildren();
    for(const row of summary.classShares){
      const line=el('div','home-bar');
      const fill=el('span','home-bar-fill');fill.style.width=`${row.share}%`;fill.style.background=CLASS_COLOURS[row.className]||'var(--home-gold)';
      const track=el('span','home-bar-track');track.append(fill);
      line.append(el('span','home-bar-label',row.className),track,el('span','home-bar-value',`${row.share}%`));
      bars.append(line);
    }
    show('homeMain',true);
  }

  if(summary.topExoticWeapon){
    setText('homeWeaponName',summary.topExoticWeapon.name);
    setText('homeWeaponKills',`${format(summary.topExoticWeapon.kills)} kills`);
    setText('homeWeaponLine',weaponLine(summary.topExoticWeapon.kills,seed));
    const icon=byId('homeWeaponIcon');
    if(summary.topExoticWeapon.icon){icon.src=summary.topExoticWeapon.icon;icon.hidden=false;}
    show('homeWeapon',true);
  }
  const ability=abilityCopy(summary.abilityKills,seed);
  if(ability){
    setText('homeAbilityName',ability.label);setText('homeAbilityKills',`${format(ability.kills)} kills`);
    setText('homeAbilityLine',`${ability.line}${ability.others?` ${ability.others}.`:''}`);show('homeAbility',true);
  }
  const mode=modeCopy(summary.modes,seed);
  if(mode){
    setText('homeModeName',mode.label);setText('homeModeCount',`${format(mode.count)} ${mode.unit}`);setText('homeModeLine',mode.line);show('homeMode',true);
  }
  const self=selfCopy(summary.selfEliminations,seed);
  if(self){setText('homeSelfCount',format(self.count));setText('homeSelfLine',self.line);show('homeSelf',true);}

  if(summary.lastActivity){
    const parts=[summary.lastActivity.name,sinceCopy(summary.lastActivity.period)];
    const duration=summary.lastActivity.completed?durationCopy(summary.lastActivity.durationSeconds):null;
    setText('homeLastText',parts.filter(Boolean).join('. ')+(duration?`. Finished in ${duration}.`:'.'));
    show('homeLast',true);
  }
  if(Number.isFinite(summary.raidClears)){
    setText('homeRaidText',summary.raidClears>0?`${format(summary.raidClears)} raid clears. The raid bosses have noticed you.`:'No raid clears yet. The raids are waiting.');
    show('homeRaid',true);
  }
  show('homeStats',true);
}

function signedOut(){
  show('homeSignedOut',true);show('homeStats',false);
  const link=byId('homeConnect');const url=authStartUrl(location.href);
  if(url)link.href=url;
  globalThis.ForgeLoader?.done?.();
}

async function requestSummary(){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS);
  try{
    const response=await fetch(new URL('/bungie/home',AUTH_ORIGIN),{credentials:'include',cache:'no-store',headers:{Accept:'application/json'},signal:controller.signal});
    if(response.status===401)return {signedOut:true};
    if(!response.ok)throw new Error(`Guardian stats are unavailable right now (${response.status}). Retry in a moment.`);
    return {summary:await response.json()};
  }catch(error){
    if(error?.name==='AbortError')throw new Error('Guardian stats took too long to arrive. Retry in a moment.');
    throw error;
  }finally{clearTimeout(timer);}
}

// Warm the next pages' documents once Home is on screen. Never on data saver.
function prepareNextPages(){
  if(navigator.connection?.saveData||document.visibilityState!=='visible')return;
  const run=()=>{for(const href of ['../journey/','../guardian-workspace-v2/','../forge-loader/','../vault/']){
    if(document.head.querySelector(`link[rel="prefetch"][href="${href}"]`))continue;
    const link=document.createElement('link');link.rel='prefetch';link.href=href;document.head.append(link);
  }};
  if('requestIdleCallback' in window)requestIdleCallback(run,{timeout:3000});else setTimeout(run,1500);
}

const CLIENT_URL='../../core/prepared-page-client.mjs?v=20260913-workspace-preload-1&transport=20260911-compact-plugs-1&navigation=20260919-1&plain=20260925-2&refresh=20260927-1&recovery=20260927-4';
const BUNDLE_CACHE_URL='../../core/prepared-bundle-cache.mjs';
const JOURNEY_SLOW_MS=30000;

function readyStage(state,percent,text){
  const bar=byId('homeReady');if(!bar)return;
  bar.hidden=false;bar.dataset.state=state;
  byId('homeReadyFill').style.width=`${percent}%`;
  byId('homeReadyBar').setAttribute('aria-valuenow',String(percent));
  setText('homeReadyTitle',state==='ready'?'READY':state==='slow'?'STILL LOADING':'DATA LOADING');
  setText('homeReadyStage',text);
}

// Fetch Journey's page files into the HTTP cache without running them.
async function warmJourneyFiles(signal){
  const href=new URL('../journey/',location.href);
  const response=await fetch(href,{credentials:'same-origin',cache:'force-cache',signal});
  if(!response.ok)throw new Error('Journey files unavailable');
  const markup=new DOMParser().parseFromString(await response.text(),'text/html');
  const urls=new Set();
  for(const node of markup.querySelectorAll('link[rel="stylesheet"][href],link[rel="modulepreload"][href],script[src]')){
    const url=new URL(node.getAttribute('href')||node.getAttribute('src'),href);
    if(url.origin===location.origin)urls.add(url.href);
  }
  await Promise.all([...urls].map(url=>fetch(url,{credentials:'same-origin',cache:'force-cache',signal}).then(r=>r.arrayBuffer()).catch(()=>{})));
}

// Prepare Journey after Home is on screen and show the Guardian when it is safe to enter.
// SEE MORE is never blocked; the bar only reports progress. Skipped on Data Saver.
async function prepareJourney(session){
  if(navigator.connection?.saveData)return;
  const controller=new AbortController();
  const slow=setTimeout(()=>readyStage('slow',85,'Journey is taking longer than usual. You can still enter.'),JOURNEY_SLOW_MS);
  try{
    readyStage('loading',15,'Preparing Journey: page files');
    await warmJourneyFiles(controller.signal);
    readyStage('loading',45,'Preparing Journey: Guardian data');
    const {loadPreparedPagePayload}=await import(CLIENT_URL);
    await loadPreparedPagePayload(session,'journey',{quiet:true,publish:false});
    // READY only when the public catalogue is really stored for Journey to reuse.
    // The save runs in the background, so give it a few seconds to land.
    readyStage('loading',80,'Preparing Journey: saving catalogue');
    const {hasPreparedBundle}=await import(BUNDLE_CACHE_URL);
    let stored=false;
    for(let attempt=0;attempt<10&&!stored;attempt++){
      stored=await hasPreparedBundle('journey');
      if(!stored)await new Promise(done=>setTimeout(done,500));
    }
    clearTimeout(slow);
    if(!stored){readyStage('slow',85,'Journey could not be stored on this device. The first open may take longer.');return;}
    readyStage('ready',100,'Journey is prepared. Safe to enter.');
    document.querySelectorAll('a.home-cta[href="../journey/"]').forEach(link=>link.dataset.ready='true');
  }catch(error){
    clearTimeout(slow);
    console.warn('[Guardian Home] Journey preparation',error);
    readyStage('slow',85,'Journey is taking longer than usual. You can still enter.');
  }
}

async function init(){
  const session=await getBungieSession();
  if(session?.authenticated===false){signedOut();return;}
  if(session?.authenticated!==true){globalThis.ForgeLoader?.blocked?.('Bungie is not responding. Retry in a moment.');return;}
  try{
    const result=await requestSummary();
    if(result.signedOut){signedOut();return;}
    const membership=session.activeDestinyMembership||{};
    render(result.summary,dailySeed(`${membership.membershipType}:${membership.membershipId}`));
    globalThis.ForgeLoader?.done?.();
    prepareNextPages();
    prepareJourney(session);
  }catch(error){
    console.error('[Guardian Home]',error);
    setText('homeError',error?.message||'Guardian stats are unavailable right now.');show('homeError',true);
    globalThis.ForgeLoader?.blocked?.(error?.message||'Guardian stats are unavailable right now.');
  }
}

init();
