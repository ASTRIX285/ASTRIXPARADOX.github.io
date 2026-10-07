// Build Review: DIM link to a reviewed, applyable build in four steps.
// Checkpoint 1 renders steps 1 and 2. Builder is not modified.
import {DimShareClient} from '../../core/dim-import/share.mjs';
import {ImportManifest,createImportStorage} from '../../core/dim-import/cache.mjs';
import {adaptDimLoadout} from '../../core/dim-import/adapt.mjs';
import {sendDimToForge} from '../../core/dim-import/handoff.mjs';
import {runProfileTask} from '../../core/engine-profile-client.mjs';
import {loadPreparedPagePayload,reportPreparedPageStage} from '../../core/prepared-page-client.mjs';
import {getBungieSession,authStartUrl} from '../guardian-workspace-v2/guardian-bungie-auth.mjs';
import {sessionBinding} from '../guardian-workspace-v2/guardian-live-actions.mjs';
import {normalisePreparedPagePayload} from '../guardian-workspace-v2/guardian-bungie-profile.mjs';
import {guardianManifest} from '../guardian-workspace-v2/guardian-manifest-service.mjs';
import {mountForgeShell} from '../guardian-workspace-v2/platform-forge-shell.mjs';
import {REVIEW_ACTIVITIES,REVIEW_OBJECTIVES,REVIEW_ELEMENTS,decodeReviewUrl,encodeReviewUrl,goalComplete} from './build-review-url.mjs';
import {prepareReviewState,supportedElements,entryReadiness} from './build-review-pipeline.mjs';
import {sharedBuildView,goalButtonLabel,goalSentence,elementReason,elementName} from './build-review-model.mjs';
import {renderSharedBuild} from './build-review-shared.mjs';
import {selectOwnedWeapons} from '../guardian-workspace-v2/paradox-build-space/paradox-loadout-intelligence.mjs';
import {buildFitUrl} from '../build-fit/build-fit-url.mjs';

mountForgeShell({rootSelector:'.apx-page-shell',gameId:'destiny-2',gameName:'Destiny 2',developerName:'Bungie',layout:'destination'});

const byId=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const storage=createImportStorage(),shares=new DimShareClient({storage}),manifest=new ImportManifest({storage});

const page={selection:decodeReviewUrl(location.search),session:null,payload:null,adaptation:null,view:null,reviewState:null,supported:new Set(),importElement:'',loading:true,error:'',unresolved:[],weapons:{state:'loading',rows:[],decisions:[]}};

// URL is the single source of truth for the user's answers.
function writeUrl({push=true}={}){
  const next=`${location.pathname}${encodeReviewUrl(page.selection)}`;
  if(next===`${location.pathname}${location.search}`)return;
  history[push?'pushState':'replaceState'](null,'',next);
}
function go(step){page.selection={...page.selection,step};writeUrl();page.selection=decodeReviewUrl(location.search);render();window.scrollTo({top:0,behavior:'smooth'});}
addEventListener('popstate',()=>{page.selection=decodeReviewUrl(location.search);render();});

function stepper(){
  const current=page.selection.step,labels=['SHARED BUILD','YOUR GOAL','ANALYSIS','USE IT'];
  const done=step=>step<current;
  return `<nav class="br-steps" aria-label="Build steps"><ol>${labels.map((label,index)=>{const step=index+1,state=step===current?'current':done(step)?'done':'todo';
    const inner=`<span class="br-step-mark" aria-hidden="true">${state==='done'?'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>':step}</span><span class="br-step-label">${label}</span>`;
    return `<li class="br-step is-${state}">${state==='done'?`<button type="button" data-go-step="${step}">${inner}</button>`:`<span${state==='current'?' aria-current="step"':''}>${inner}</span>`}</li>`;}).join('')}</ol></nav>`;
}

function itemCard(row,{armour=false}={}){
  if(row.status==='empty')return `<li class="br-item is-empty"><span class="br-item-slot">${esc(row.label)}</span><span class="br-item-status">${esc(row.statusLabel)}</span></li>`;
  return `<li class="br-item is-${esc(row.status)}${row.isExotic?' is-exotic':''}${armour?' is-armour':''}">${row.icon?`<img src="${esc(row.icon)}" alt="" width="48" height="48" loading="lazy">`:'<span class="br-item-icon" aria-hidden="true"></span>'}<span class="br-item-text"><span class="br-item-slot">${esc(row.label)}${row.isExotic?' · Exotic':''}</span><strong>${esc(row.name)}</strong>${row.statusLabel?`<span class="br-item-status">${esc(row.statusLabel)}</span>`:''}</span></li>`;
}

function pasteForm(message=''){
  return `<section class="br-card br-paste" aria-labelledby="brPasteTitle"><h1 id="brPasteTitle">Paste a DIM loadout link</h1><p class="br-lede">Paste a dim.gg link or a DIM share ID. Paradox shows the build, checks your inventory and explains how it works.</p>
  <form id="brPasteForm" class="br-paste-form"><label for="brPasteInput">DIM link or share ID</label><div class="br-paste-row"><input id="brPasteInput" name="dim" type="text" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://dim.gg/…" required><button class="br-primary" type="submit">OPEN BUILD</button></div><p class="br-form-status" role="status">${esc(message)}</p></form></section>`;
}

function stepOne(){
  const view=page.view;if(!view)return '';
  const counts=view.counts;
  const inventory=`<section class="br-card br-side" aria-labelledby="brInventoryTitle"><h2 id="brInventoryTitle" class="br-kicker">YOUR INVENTORY</h2>${counts.total?`<p class="br-big">${counts.found} <span>of ${counts.total} shared items found</span></p><div class="br-meter" role="img" aria-label="${counts.found} of ${counts.total} shared items found"><i style="width:${Math.round(counts.found/counts.total*100)}%"></i></div>
    <ul class="br-facts"><li>${counts.guardian} on this Guardian</li><li>${counts.vault} in your Vault, moved only if you Apply</li>${counts.other?`<li>${counts.other} on another Guardian or in Postmaster</li>`:''}${counts.substituted?`<li>${counts.substituted} replaced by your closest match</li>`:''}<li>${counts.missing} missing</li></ul>`:'<p class="br-note">This share has no weapons or armour. Everything marked "Picked from your inventory" or "Suggestion" is Paradox\'s choice, not the sharer\'s.</p>'}
    ${view.missingNames.length?`<p class="br-note">Missing: ${esc(view.missingNames.join(', '))}.</p>`:''}${view.blockers.length?`<ul class="br-blockers">${view.blockers.map(line=>`<li>${esc(line)}</li>`).join('')}</ul>`:''}</section>`;
  // Shared items you do not own are never swapped without your decision: they go through Build Fit.
  const toFit=counts.missing+counts.substituted>0;
  const handoff=toFit?`<a class="br-secondary br-wide" id="brFit" href="${esc(buildFitUrl({dim:page.selection.dim,characterId:page.selection.characterId,membershipId:page.selection.membershipId,membershipType:page.selection.membershipType}))}">Fit to your inventory</a>`:'<button class="br-secondary br-wide" type="button" id="brManual">Send to Builder</button>';
  const next=`<button class="br-primary br-wide" type="button" data-go-step="2">NEXT: SET YOUR GOAL</button>${handoff}`;
  return `<div class="br-grid">
  <section class="br-card br-main" aria-labelledby="brStepTitle"><h1 id="brStepTitle">This is the build you imported</h1><p class="br-lede">Nothing has been analysed or changed yet. "From the share" is the sharer's build. Anything else is Paradox's pick from your inventory.</p>
    ${renderSharedBuild(view,{weapons:page.weapons})}
  </section>
  <aside class="br-rail">${inventory}<div class="br-actions">${next}</div></aside></div>`;
}

function pickGroup(name,legend,rows,selected,{disabled=new Map()}={}){
  return `<fieldset class="br-fieldset"><legend>${legend}</legend><div class="br-picks br-picks-${rows.length}">${rows.map(row=>{const reason=disabled.get(row.key);return `<button type="button" class="br-pick" data-pick="${name}" data-value="${esc(row.key)}" ${row.element?`data-element="${esc(row.key)}"`:''} aria-pressed="${String(selected===row.key)}"${reason?` disabled title="${esc(reason)}"`:''}>${esc(row.label)}</button>`;}).join('')}</div></fieldset>`;
}

function stepTwo(){
  const s=page.selection,view=page.view;if(!view)return '';
  const readiness=page.reviewState?entryReadiness(page.reviewState.workingBuild):{ready:false,reason:page.error||'Preparing your gear…'};
  const disabled=new Map(REVIEW_ELEMENTS.filter(key=>!page.supported.has(key)).map(key=>[key,`No ${elementName(key)} build option is available for this Guardian with this Exotic.`]));
  const elements=REVIEW_ELEMENTS.map(key=>({key,label:elementName(key).toUpperCase(),element:true}));
  const complete=goalComplete(s)&&readiness.ready&&page.supported.has(s.element);
  const label=readiness.ready?goalButtonLabel(s):'PREPARING YOUR GEAR';
  const sentence=goalSentence(s,{buildName:view.name,importElement:page.importElement});
  return `<div class="br-grid">
  <section class="br-card br-main" aria-labelledby="brStepTitle"><h1 id="brStepTitle">What should this build be good at?</h1><p class="br-lede">Three quick picks. Paradox uses them to rank every change it suggests.</p>
    ${pickGroup('activity','1 · WHERE WILL YOU PLAY IT?',REVIEW_ACTIVITIES,s.activity)}
    ${pickGroup('objective','2 · WHAT MATTERS MOST?',REVIEW_OBJECTIVES,s.objective)}
    ${pickGroup('element','3 · ELEMENT',elements,s.element,{disabled})}
    ${page.importElement&&s.element===page.importElement?`<p class="br-element-reason" data-element="${esc(s.element)}">${esc(elementReason(page.importElement,view.subclass.name))}</p>`:''}
  </section>
  <aside class="br-rail"><section class="br-card br-side" aria-labelledby="brAskTitle"><h2 id="brAskTitle" class="br-kicker">YOU ARE ASKING PARADOX TO</h2>${sentence?`<p class="br-sentence">${esc(sentence)}</p>`:'<p class="br-muted">Your picks appear here.</p>'}<ul class="br-facts"><li>Uses only gear you own</li><li>Keeps the Exotic armour anchor</li><li>Fills this season's artifact</li></ul></section>
    ${readiness.ready?'':`<p class="br-note" role="status">${esc(readiness.reason||'')}</p>`}
    <div class="br-actions"><button class="br-primary br-wide" type="button" id="brAnalyse"${complete?'':' disabled'}>${esc(label)}</button><button class="br-secondary br-wide" type="button" data-go-step="1">Back to shared build</button></div></aside></div>`;
}

function stepLocked(){
  return `<section class="br-card"><h1>Analysis</h1><p class="br-lede">Analysis arrives in the next Build Review update. Your picks are saved in this link.</p><button class="br-secondary" type="button" data-go-step="2">Back to your goal</button></section>`;
}

function header(){
  const name=page.view?.name||'Build Review';
  byId('brBuildName').textContent=name;
  byId('brChips').innerHTML=page.view?'<span class="br-chip">DIM import</span><span class="br-chip is-safe">Original protected</span>':'';
}

function render(){
  const root=byId('brRoot');if(!root)return;
  header();
  if(page.loading){root.innerHTML=`${stepper()}<p class="br-status" role="status">Loading the shared build…</p>`;return;}
  if(!page.selection.dim){root.innerHTML=pasteForm(page.error);return;}
  if(!page.view){root.innerHTML=`${pasteForm(page.error)}${page.unresolved.length?`<section class="br-card br-paste"><h2 class="br-kicker">UNRESOLVED IN THIS SHARE</h2><ul class="br-facts">${page.unresolved.map(row=>`<li>${esc(row)}</li>`).join('')}</ul></section>`:''}`;return;}
  const body=page.selection.step===1?stepOne():page.selection.step===2?stepTwo():stepLocked();
  root.innerHTML=`${stepper()}${body}`;
  const heading=root.querySelector('h1');if(heading&&document.activeElement===document.body)heading.setAttribute('tabindex','-1');
}

document.addEventListener('click',event=>{
  const stepButton=event.target.closest('[data-go-step]');if(stepButton){go(Number(stepButton.dataset.goStep));return;}
  const pick=event.target.closest('[data-pick]');
  if(pick&&!pick.disabled){page.selection={...page.selection,[pick.dataset.pick]:pick.dataset.value,step:2};writeUrl({push:false});render();return;}
  if(event.target.closest('#brAnalyse')){go(3);return;}
  if(event.target.closest('#brManual')&&page.adaptation?.build){try{sendDimToForge(handoffBuild());}catch(error){page.error=error.message;render();}}
});
document.addEventListener('submit',event=>{
  if(event.target.id!=='brPasteForm')return;event.preventDefault();
  const value=new FormData(event.target).get('dim');
  const next=decodeReviewUrl(`?dim=${encodeURIComponent(String(value||''))}`);
  if(!next.dim){page.error='Paste a DIM share link or share ID.';render();byId('brPasteInput')?.focus();return;}
  page.selection={...page.selection,dim:next.dim,step:1};writeUrl();void load();
});

// Builder receives the share, Paradox's armour picks and, when the share has no
// weapons, the ranked weapon suggestions. Each carries its marker in dimAdaptation.
function handoffBuild(){
  const build=page.adaptation.build,decisions=page.weapons.state==='ready'?page.weapons.decisions:[];
  if(!decisions.length)return build;
  const comparisons=[...build.dimAdaptation.comparisons.filter(row=>row.kind!=='weapon'),...decisions.map(row=>({kind:'weapon',bucketHash:row.bucketHash,target:null,selected:row.recommended?{itemHash:Number(row.recommended.itemHash??row.recommended.hash),itemInstanceId:String(row.recommended.itemInstanceId||''),name:row.recommended.name||'',icon:row.recommended.icon||''}:null,status:row.recommended?'suggested':'unfilled',reasons:row.reasons.map(reason=>reason.label||String(reason)),missingSockets:[]}))];
  return {...build,weapons:decisions.map(row=>row.recommended||null),dimAdaptation:{...build.dimAdaptation,comparisons,weaponSuggestions:true}};
}

const WEAPON_SLOTS=['Kinetic','Energy','Power'];
function rankWeapons(equipped){
  if(page.view?.fill?.weapons.shared!==0){page.weapons={state:'none',rows:[],decisions:[]};return;}
  try{
    // The user's owned weapons, ranked by Builder's own engine for the shared subclass.
    const shared=page.adaptation.build;
    const {recommendation:ranked}=selectOwnedWeapons({build:{...equipped,characterClass:shared.characterClass,subclass:shared.subclass,subclassName:shared.subclassName,subclassBuild:shared.subclassBuild,weapons:[],ownedWeapons:equipped.ownedWeapons||[]},objective:'balanced',baselineWeapons:[]});
    const decisions=ranked.decisions.filter(row=>row.recommended);
    page.weapons={state:'ready',decisions,limitations:ranked.limitations||[],rows:decisions.map(row=>({slot:WEAPON_SLOTS[ranked.decisions.indexOf(row)]||'',name:row.recommended.name||row.recommended.definition?.displayProperties?.name||'',icon:row.recommended.icon||'',isExotic:row.isExotic,reasons:row.reasons.map(reason=>reason.label||String(reason))}))};
  }catch(error){page.weapons={state:'error',rows:[],decisions:[],message:error?.message||'Weapon suggestions are unavailable.'};}
  performance.mark('br:weapons-ranked');
}

async function preparedPayload(session){
  const raw=await loadPreparedPagePayload(session,'loadout',{sharedPayload:globalThis.FORGE_HERO_PROFILE_PAYLOAD});
  const normalized=normalisePreparedPagePayload(raw);
  guardianManifest.seedPayload(normalized);
  if(normalized.forgeArmourIndex&&!guardianManifest.applyForgeArmourIndex(normalized,normalized.forgeArmourIndex))throw new Error('The armour index does not match this profile. Reload to retry.');
  return guardianManifest.hydratePayload(normalized,{allowNetwork:false,waitForManifest:false});
}

async function load(){
  performance.mark('br:load-start');
  page.loading=true;page.error='';page.unresolved=[];page.weapons={state:'loading',rows:[],decisions:[]};page.view=null;page.adaptation=null;page.reviewState=null;page.supported=new Set();render();
  reportPreparedPageStage('start','loadout');
  try{
    const sessionPromise=page.session?Promise.resolve(page.session):getBungieSession();
    if(!page.selection.dim){page.session=await sessionPromise.catch(()=>null);return;}
    // The account payload needs only the session, so it loads alongside the share and manifest.
    const payloadPromise=page.payload?Promise.resolve(page.payload):sessionPromise.then(session=>session?.authenticated?preparedPayload(session):null);
    payloadPromise.catch(()=>{});
    const [loadout,snapshot,session]=await Promise.all([shares.load(page.selection.dim),manifest.ready(),sessionPromise.catch(()=>null)]);
    page.session=session;reportPreparedPageStage('session','loadout');
    if(session?.authenticated){
      page.payload=page.payload||await payloadPromise;
      const binding=sessionBinding(session),payload=page.payload;
      const adaptation=adaptDimLoadout(loadout,{snapshot,profile:payload.profile,binding,preferredCharacterId:page.selection.characterId,currentSeasonNumber:payload.currentSeasonNumber??null});
      page.adaptation=adaptation;page.view=sharedBuildView(adaptation);
      page.selection={...page.selection,characterId:String(adaptation.build.characterId||''),membershipId:String(binding.membershipId||''),membershipType:String(binding.membershipType||'')};
      writeUrl({push:false});
      page.importElement=page.view.subclass.element;
      if(!page.selection.element&&page.importElement){page.selection={...page.selection,element:page.importElement};writeUrl({push:false});}
      page.loading=false;render();performance.mark('br:shared-build-rendered');
      // Step 2 needs the same prepared gear Builder uses. It runs after
      // step 1 has painted so the shared build appears first.
      try{
        const equipped=await runProfileTask('normalise',{payload,session,characterId:adaptation.build.characterId});
        rankWeapons(equipped);render();
        page.reviewState=prepareReviewState(handoffBuild(),{payload,equipped});
        page.supported=supportedElements(page.reviewState.workingBuild);
      }catch(error){page.error=error?.message||'Your gear could not be prepared.';if(page.weapons.state==='loading')page.weapons={state:'error',rows:[],decisions:[],message:page.error};}
    }else if(session?.authenticated===false){
      // Same sign-in gate as every tool page, but return here with the link.
      globalThis.ForgeLoader?.authRequired?.(authStartUrl(location.href));
      return;
    }else{
      globalThis.ForgeLoader?.recover?.({code:session?.error||'bungie_unavailable'});
      return;
    }
  }catch(error){
    page.error=error?.message||'This DIM loadout could not be loaded.';
    page.unresolved=Array.isArray(error?.unresolved)?error.unresolved:[];
    console.error('[Build Review]',error);
  }finally{
    page.loading=false;render();
    reportPreparedPageStage('ready','loadout');
    globalThis.ForgeLoader?.ready?.(document.querySelector('.apx-page-shell'));
  }
}

void load();
