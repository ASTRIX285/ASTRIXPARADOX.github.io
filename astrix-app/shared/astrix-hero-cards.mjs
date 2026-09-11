import {getBungieSession} from '../pages/guardian-workspace-v2/guardian-bungie-auth.mjs?v=20260906-tool-intro-1';
import {loadPreparedPagePayload} from '../core/prepared-page-client.mjs?v=20260907-shared-page-load-1&transport=20260911-compact-plugs-1';

const BUNGIE_ORIGIN='https://www.bungie.net';
const CLASS_NAMES=['titan','hunter','warlock'];
const CLASS_ORDER={hunter:0,warlock:1,titan:2};
const STAT_ORDER=[2996146975,392767087,1943323491,1735777505,144602215,4244567218];
const SELECTED_CHARACTER_KEY='astrix:selected-character-id';
const MAX_CHARACTERS=3;
const IS_JOURNEY_PAGE=location.pathname.includes('/pages/journey/');
const IS_VAULT_PAGE=location.pathname.includes('/pages/vault/');
const IS_FORGE_LOADER_PAGE=location.pathname.includes('/pages/forge-loader/');
const IS_LOADOUT_PAGE=location.pathname.includes('/pages/loadout/');
const IS_MISSION_REPORTS_PAGE=location.pathname.includes('/pages/mission-reports/');
const IS_BUILD_FORGE_PAGE=location.pathname.includes('/paradox-build-space/');
const SHARES_PROFILE=IS_JOURNEY_PAGE||IS_MISSION_REPORTS_PAGE||IS_VAULT_PAGE||IS_FORGE_LOADER_PAGE||IS_LOADOUT_PAGE||IS_BUILD_FORGE_PAGE;
let journeyProfileSettled=false;
let settleJourneyProfile=()=>{};
if(SHARES_PROFILE){
  globalThis.FORGE_HERO_PROFILE_PROMISE=new Promise(resolve=>{settleJourneyProfile=resolve;});
}

const host=()=>document.querySelector('[data-forge-hero-cards]');
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const classLabel=value=>String(value||'Guardian').replace(/^./,letter=>letter.toUpperCase());
const absoluteIcon=path=>path?new URL(path,BUNGIE_ORIGIN).toString():'';

function renderStatus(message,state='unavailable'){
  const target=host();
  if(!target)return;
  target.innerHTML=`<div class="guardian-character-cards__status is-${escapeHtml(state)}" role="status">${escapeHtml(message)}</div>`;
}

function mostRecentCharacterId(characters){
  return String([...characters].sort((left,right)=>String(right?.dateLastPlayed||'').localeCompare(String(left?.dateLastPlayed||'')))[0]?.characterId||'');
}

function initialCharacterId(characters){
  if(!IS_VAULT_PAGE&&!IS_FORGE_LOADER_PAGE)return mostRecentCharacterId(characters);
  const requested=new URLSearchParams(location.search).get('characterId')||'';
  const preferred=[requested].map(String).find(characterId=>characters.some(character=>String(character.characterId)===characterId));
  return preferred||mostRecentCharacterId(characters);
}

function rememberCharacterId(characterId){
  try{sessionStorage.setItem(SELECTED_CHARACTER_KEY,String(characterId||''));}
  catch{}
}

function publishJourneyProfile(payload){
  if(!SHARES_PROFILE||journeyProfileSettled)return;
  journeyProfileSettled=true;
  globalThis.FORGE_HERO_PROFILE_PAYLOAD=payload||null;
  settleJourneyProfile(payload||null);
  document.dispatchEvent(new CustomEvent('forge:hero-profile-loaded',{detail:{payload:payload||null}}));
}

function heroProfilePage(){return IS_JOURNEY_PAGE||IS_MISSION_REPORTS_PAGE?'journey':IS_VAULT_PAGE?'vault':IS_FORGE_LOADER_PAGE||IS_LOADOUT_PAGE?'loadout':IS_BUILD_FORGE_PAGE?'build-forge':'character';}

function characterRoster(payload,definitions){
  return Object.values(payload?.profile?.characters?.data||{}).map(character=>{
    const characterClass=CLASS_NAMES[Number(character.classType)]||'hunter';
    return {
      characterId:String(character.characterId||''),
      characterClass,
      dateLastPlayed:character.dateLastPlayed||'',
      power:character.light??null,
      stats:STAT_ORDER.map(hash=>{
        const definition=definitions?.[String(hash)]||null;
        return [definition?.displayProperties?.name||`Unresolved Destiny stat ${hash}`,Number(character?.stats?.[hash]??0),absoluteIcon(definition?.displayProperties?.icon)];
      }),
      emblem:{icon:absoluteIcon(character.emblemPath),background:absoluteIcon(character.emblemBackgroundPath)}
    };
  }).sort((left,right)=>(CLASS_ORDER[left.characterClass]??9)-(CLASS_ORDER[right.characterClass]??9));
}

function statMarkup(stats=[]){
  return stats.slice(0,6).map(([name,value,icon])=>{
    const iconMarkup=icon
      ?`<img class="guardian-stat-icon" src="${escapeHtml(icon)}" alt="" aria-hidden="true" decoding="async">`
      :'<span class="guardian-stat-icon is-unavailable" aria-hidden="true"></span>';
    return `<span class="guardian-character-card__stat" title="${escapeHtml(name)}" aria-label="${escapeHtml(name)} ${Number(value||0)}">${iconMarkup}<b>${Number(value||0)}</b></span>`;
  }).join('');
}

function render(characters,selectedId){
  const target=host();
  if(!target)return;
  const supplied=Array.isArray(characters)?characters.slice(0,MAX_CHARACTERS):[];
  if(!supplied.length){
    renderStatus('BUNGIE CHARACTERS UNAVAILABLE');
    return;
  }

  target.innerHTML=supplied.map(character=>{
    const selected=String(character.characterId)===String(selectedId||'');
    const emblemBackground=character.emblem?.background||character.emblem?.icon||'';
    const emblemStyle=emblemBackground?` style="--character-emblem:url('${escapeHtml(emblemBackground)}')"`:'';
    return `<button type="button" class="guardian-character-card${selected?' is-selected':''}" data-character-id="${escapeHtml(character.characterId)}" data-class="${escapeHtml(character.characterClass)}" aria-pressed="${selected}" aria-label="Select ${escapeHtml(classLabel(character.characterClass))}, power ${escapeHtml(character.power??'unavailable')}"${emblemStyle}>
      <span class="guardian-character-card__head">
        <span class="guardian-character-card__identity"><strong>${escapeHtml(classLabel(character.characterClass).toUpperCase())}</strong></span>
        <span class="guardian-character-card__power"><i aria-hidden="true">✦</i>${escapeHtml(character.power??'550')}</span>
      </span>
      <span class="guardian-character-card__stats">${statMarkup(character.stats)}</span>
    </button>`;
  }).join('');

  target.querySelectorAll('[data-character-id]').forEach(button=>button.addEventListener('click',()=>{
    const characterId=String(button.dataset.characterId||'');
    const characterClass=String(button.dataset.class||'');
    if(!characterId||!characterClass)return;
    target.querySelectorAll('[data-character-id]').forEach(card=>{
      const active=String(card.dataset.characterId)===characterId;
      card.classList.toggle('is-selected',active);
      card.setAttribute('aria-pressed',String(active));
    });
    rememberCharacterId(characterId);
    document.dispatchEvent(new CustomEvent('forge:character-selected',{detail:{characterId,characterClass,className:classLabel(characterClass)}}));
  }));
}

async function initForgeHeroCards(){
  const target=host();
  if(!target)return;
  try{
    renderStatus('LOADING BUNGIE CHARACTERS','pending');
    const session=await getBungieSession();
    if(session?.authenticated!==true){
      publishJourneyProfile(null);
      renderStatus('CONNECT BUNGIE TO LOAD CHARACTERS');
      return;
    }
    const page=heroProfilePage();
    const payload=await loadPreparedPagePayload(session,page,{sharedPayload:IS_FORGE_LOADER_PAGE?globalThis.FORGE_LOADER_PRELOAD_PAYLOAD:null});
    const definitions=payload.statDefinitions||{};
    publishJourneyProfile(payload);
    const characters=characterRoster(payload,definitions);
    const selectedId=mostRecentCharacterId(characters);
    const pageSelectedId=IS_VAULT_PAGE||IS_FORGE_LOADER_PAGE?initialCharacterId(characters):selectedId;
    rememberCharacterId(pageSelectedId);
    render(characters,pageSelectedId);
  }catch(error){
    console.info('[Forge Hero Cards] Bungie character cards unavailable',error);
    publishJourneyProfile(null);
    renderStatus('BUNGIE CHARACTERS UNAVAILABLE');
  }finally{
    document.dispatchEvent(new CustomEvent('forge:hero-cards-render-complete'));
  }
}

document.addEventListener('forge:prepared-page-refreshed',event=>{
  const next=event.detail?.payload;
  if(!SHARES_PROFILE||event.detail?.page!==heroProfilePage()||!next?.profile)return;
  globalThis.FORGE_HERO_PROFILE_PAYLOAD=next;
  const characters=characterRoster(next,next.statDefinitions||{});
  const selected=String(host()?.querySelector('.guardian-character-card.is-selected')?.dataset?.characterId||initialCharacterId(characters));
  render(characters,selected);
});

initForgeHeroCards();
