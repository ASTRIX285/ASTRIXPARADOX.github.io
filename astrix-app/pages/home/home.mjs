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
  }catch(error){
    console.error('[Guardian Home]',error);
    setText('homeError',error?.message||'Guardian stats are unavailable right now.');show('homeError',true);
    globalThis.ForgeLoader?.blocked?.(error?.message||'Guardian stats are unavailable right now.');
  }
}

init();
