// Build Fit: a shared DIM build against your inventory, on its own URL. Every shared weapon or
// armour piece you do not own needs your decision (approve the suggestion, choose another owned
// item, or leave the slot empty) before The Forge receives the build. Nothing is swapped without
// a decision, and a suggestion is never shown as the sharer's item.
import {DimShareClient} from '../../core/dim-import/share.mjs';
import {ImportManifest,createImportStorage} from '../../core/dim-import/cache.mjs';
import {adaptDimLoadout} from '../../core/dim-import/adapt.mjs';
import {createFitPlan,resolveFit,validDecisions,approveAll,fitChoices} from '../../core/dim-import/fit.mjs';
import {placeMods} from '../../core/dim-import/mods.mjs';
import {MOD_SLOT,ARMOUR_SLOT_NAMES} from '../../core/dim-import/fill.mjs';
import {sendDimToForge} from '../../core/dim-import/handoff.mjs';
import {loadPreparedPagePayload,reportPreparedPageStage} from '../../core/prepared-page-client.mjs';
import {getBungieSession,authStartUrl} from '../guardian-workspace-v2/guardian-bungie-auth.mjs';
import {sessionBinding} from '../guardian-workspace-v2/guardian-live-actions.mjs';
import {normalisePreparedPagePayload} from '../guardian-workspace-v2/guardian-bungie-profile.mjs';
import {guardianManifest} from '../guardian-workspace-v2/guardian-manifest-service.mjs';
import {mountForgeShell} from '../guardian-workspace-v2/platform-forge-shell.mjs';
import {decodeFitUrl,encodeFitUrl} from './build-fit-url.mjs';

mountForgeShell({rootSelector:'.apx-page-shell',gameId:'destiny-2',gameName:'Destiny 2',developerName:'Bungie',layout:'destination'});

const byId=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const storage=createImportStorage(),shares=new DimShareClient({storage}),manifest=new ImportManifest({storage});
const page={selection:decodeFitUrl(location.search),loading:true,error:'',notice:'',plan:null,adaptation:null,inputs:null,decisions:new Map(),picker:null,transfer:'idle'};

// The URL is the single store of decisions, so a reload, bookmark or shared link keeps them.
function writeUrl(){
  page.selection={...page.selection,decisions:page.decisions};
  const next=`${location.pathname}${encodeFitUrl(page.selection)}`;
  if(next!==`${location.pathname}${location.search}`)history.replaceState(null,'',next);
}

const icon=(item,size=48)=>item?.icon?`<img src="${esc(item.icon)}" alt="" width="${size}" height="${size}" loading="lazy">`:'<span class="bf-icon-empty" aria-hidden="true"></span>';
const lines=(rows,cls)=>rows?.length?`<ul class="bf-lines ${cls}">${rows.map(text=>`<li>${esc(text)}</li>`).join('')}</ul>`:'';
const DECISION_LABEL={approve:'Approved replacement',choose:'Your choice',empty:'Left empty'};

function pickCard(slot){
  const decision=slot.decision,item=decision?slot.item:slot.suggestion;
  if(decision?.type==='empty')return `<div class="bf-pick is-empty"><span class="bf-icon-empty" aria-hidden="true"></span><div class="bf-pick-text"><span class="bf-tag is-decided">${DECISION_LABEL.empty}</span><strong>Nothing in this slot</strong><p class="bf-muted">The Forge receives this slot empty.</p></div></div>`;
  if(!item)return `<div class="bf-pick is-none"><span class="bf-icon-empty" aria-hidden="true"></span><div class="bf-pick-text"><span class="bf-tag">No suggestion</span><strong>You own nothing for this slot</strong><p class="bf-muted">Leave it empty to continue.</p></div></div>`;
  return `<div class="bf-pick${decision?' is-decided':''}">${icon(item)}<div class="bf-pick-text"><span class="bf-tag${decision?' is-decided':''}">${decision?DECISION_LABEL[decision.type]:'Suggestion from your inventory'}</span><strong>${esc(item.name)}</strong>${item.setName?`<span class="bf-set">${esc(item.setName)}</span>`:''}${lines(item.reasons,'is-reason')}${lines(item.costs,'is-cost')}</div></div>`;
}

function slotTile(slot){
  const shared=slot.shared;
  const head=`<div class="bf-shared">${icon(shared)}<div class="bf-shared-text"><span class="bf-slot-name">${esc(slot.slot)}${shared.isExotic?' · Exotic':''}</span><strong>${esc(shared.name)}</strong><span class="bf-from">From the share${shared.setName?` · ${esc(shared.setName)}`:''}</span></div></div>`;
  if(slot.state==='owned')return `<li class="bf-slot is-owned" data-bucket="${slot.bucketHash}"><div class="bf-tile">${head}<p class="bf-status is-ok">In your inventory · ${esc(slot.item.location)}</p></div></li>`;
  const decision=slot.decision?.type||'',choices=[['approve','Approve',!slot.suggestion],['choose','Choose another',!slot.candidates.length],['empty','Leave empty',false]];
  return `<li class="bf-slot is-missing${decision?' is-decided':''}" data-bucket="${slot.bucketHash}"><div class="bf-tile">${head}<p class="bf-status is-gone">Not in your inventory</p>${pickCard(slot)}
    <div class="bf-choices" role="group" aria-label="Your decision for ${esc(slot.slot)}">${choices.map(([type,label,disabled])=>`<button type="button" class="bf-choice" data-decide="${type}" data-bucket="${slot.bucketHash}" aria-pressed="${String(decision===type)}"${type==='choose'?' aria-haspopup="dialog"':''}${disabled?' disabled':''}>${label}</button>`).join('')}</div></div></li>`;
}

function setsPanel(fit){
  if(!fit.sets.length)return '<p class="bf-muted">No armour set bonus in the shared build or yours.</p>';
  return `<ul class="bf-sets">${fit.sets.map(set=>`<li class="bf-set-row${set.perks.some(perk=>perk.active)?' is-active':''}"><b>${esc(set.name)}</b><span class="bf-count">${set.count} piece${set.count===1?'':'s'}</span><ul>${set.perks.map(perk=>`<li class="bf-perk${perk.active?' is-active':''}" title="${esc(perk.description)}"><span class="bf-perk-need">${perk.required}</span><span>${esc(perk.name)}</span><small>${perk.active?'Active':'Inactive'}${perk.shared?' · in the shared build':''}</small></li>`).join('')}</ul></li>`).join('')}</ul>`;
}
function statsPanel(fit){
  return `<dl class="bf-stats">${fit.stats.map(stat=>`<div><dt>${esc(stat.name)}</dt><dd>${stat.value===null?'-':stat.value}</dd></div>`).join('')}</dl><p class="bf-note">Your armour pieces' stats as Bungie reports them.${fit.pendingArmour?` ${fit.pendingArmour} undecided slot${fit.pendingArmour===1?' is':'s are'} not counted yet.`:''}${fit.emptyArmour?` ${fit.emptyArmour} empty slot${fit.emptyArmour===1?'':'s'}.`:''}</p>`;
}

function iconStrip(items){return `<ul class="bf-icons">${items.map(item=>`<li title="${esc([item.name,item.description].filter(Boolean).join(': '))}">${icon(item,40)}<span>${esc(item.name)}</span></li>`).join('')}</ul>`;}
function extrasPanel(fit){
  const build=page.adaptation.build,report=page.adaptation.report,sub=build.subclassBuild||{};
  // Only the plugs the share names; your own picks for sockets the share leaves out are not shown as shared.
  const sharedPlugs=new Set(page.inputs.loadout.equipped.flatMap(item=>Object.values(item.socketOverrides||{})).map(Number));
  const subclass=[sub.super,...(sub.abilities||[]),...(sub.aspects||[]),...(sub.fragments||[])].filter(plug=>plug&&sharedPlugs.has(Number(plug.hash)));
  const equipment=(build.equipment||[]).map(row=>({...row,description:row.notOwned?'Not in your inventory':'In your inventory'}));
  const unlocks=report.sharedBuild?.artifact?.unlocks||[];
  // Mod placement preview on the pieces as they stand: decided, owned, or the suggestion while undecided.
  const pieces=new Map(fit.slots.filter(slot=>slot.kind==='armour').map(slot=>{const item=slot.state==='undecided'?slot.suggestion:slot.item;return [slot.bucketHash,item?{itemInstanceId:item.id,definition:item.row.definition,name:item.name,pending:slot.state==='undecided'}:null];}));
  const parameters=page.inputs.loadout.parameters||{},placed=placeMods(pieces,parameters,page.inputs.snapshot.tables,page.inputs.profile);
  const total=(parameters.mods||[]).length+Object.values(parameters.modsByBucket||{}).flat().length;
  const modRows=[...pieces].filter(([,piece])=>piece).map(([bucket,piece])=>`<li><b>${esc(ARMOUR_SLOT_NAMES[bucket])}: ${esc(piece.name)}${piece.pending?' (suggested)':''}</b>${iconStrip((placed.byBucket.get(bucket)||[]).map(mod=>({...mod,description:mod.cost?`Energy ${mod.cost}`:''})))}</li>`).join('');
  const unplaced=placed.unplaced.map(mod=>{const waiting=fit.slots.find(slot=>slot.bucketHash===MOD_SLOT[mod.definition?.plug?.plugCategoryIdentifier]&&slot.state==='undecided');return `<li>${esc(mod.name)}: ${esc(waiting?`waiting for your ${waiting.slot} decision.`:mod.reason)}</li>`;}).join('');
  return `<section class="bf-card" aria-labelledby="bfModsTitle"><h2 id="bfModsTitle" class="bf-kicker">SHARED MODS AND COSMETICS (${total})</h2><p class="bf-muted">Each mod goes on the piece whose socket accepts it, within its energy. Anything that cannot go anywhere is listed with the reason.</p><ul class="bf-mods">${modRows}</ul>${unplaced?`<p class="bf-note">Not placed:</p><ul class="bf-lines is-cost">${unplaced}</ul>`:''}</section>
  <div class="bf-extras">
    <section class="bf-card" aria-labelledby="bfSubclassTitle"><h2 id="bfSubclassTitle" class="bf-kicker">SUBCLASS, AS SHARED</h2><p class="bf-strong">${esc(build.subclassName||'Subclass')}</p>${iconStrip(subclass)}</section>
    <section class="bf-card" aria-labelledby="bfEquipmentTitle"><h2 id="bfEquipmentTitle" class="bf-kicker">EQUIPMENT</h2>${equipment.length?iconStrip(equipment):'<p class="bf-muted">None in this share.</p>'}</section>
    <section class="bf-card" aria-labelledby="bfArtifactTitle"><h2 id="bfArtifactTitle" class="bf-kicker">ARTIFACT PICKS (${unlocks.length})</h2>${unlocks.length?iconStrip(unlocks):'<p class="bf-muted">None in this share.</p>'}</section>
  </div>`;
}

function continueLabel(fit){
  if(page.transfer==='busy')return 'OPENING THE FORGE…';
  if(fit.undecided)return `DECIDE ${fit.undecided} MORE ITEM${fit.undecided===1?'':'S'}`;
  return 'CONTINUE TO THE FORGE';
}

function picker(fit){
  const slot=fit.slots.find(row=>row.bucketHash===page.picker);if(!slot)return '';
  const current=slot.decision&&slot.decision.type!=='empty'?slot.decision.id:'';
  return `<dialog class="bf-sheet" id="bfPicker" aria-labelledby="bfPickerTitle"><header><div><p class="bf-kicker">CHOOSE ANOTHER</p><h2 id="bfPickerTitle">Your ${esc(slot.slot)} for ${esc(slot.shared.name)}</h2><p class="bf-muted">Ranked: same set pieces first, then set and ability fit, then this build's stat priority, then archetype.</p></div><button type="button" class="bf-close" data-close-picker aria-label="Close">Close</button></header>
  <ol class="bf-options">${slot.ranked.map((item,index)=>`<li class="bf-option${item.id===current?' is-current':''}">${icon(item)}<div class="bf-pick-text"><span class="bf-tag">${index===0?'Best fit':`#${index+1}`}${item.id===slot.suggestion?.id?' · Suggestion':''}</span><strong>${esc(item.name)}</strong>${item.setName?`<span class="bf-set">${esc(item.setName)}</span>`:''}${lines(item.reasons,'is-reason')}${lines(item.costs,'is-cost')}</div><button type="button" class="bf-use" data-use="${esc(item.id)}" data-bucket="${slot.bucketHash}" aria-pressed="${String(item.id===current)}">${item.id===current?'Chosen':'Use this'}</button></li>`).join('')}</ol></dialog>`;
}

function render(){
  const root=byId('bfRoot');if(!root)return;
  byId('bfBuildName').textContent=page.plan?.name||'Build Fit';
  if(page.loading){root.innerHTML='<p class="bf-status-line" role="status">Loading the shared build…</p>';return;}
  if(!page.plan){root.innerHTML=`<section class="bf-card bf-message"><h1>Build Fit</h1><p>${esc(page.error||'Open a DIM link in Build Review first.')}</p><a class="bf-secondary" href="../build-review/${page.selection.dim?`?dim=${encodeURIComponent(page.selection.dim)}`:''}">Open Build Review</a></section>`;return;}
  const fit=resolveFit(page.plan,page.decisions),missing=fit.slots.filter(slot=>slot.state!=='owned'),owned=fit.slots.length-missing.length;
  const approvable=missing.filter(slot=>slot.state==='undecided'&&slot.suggestion).length;
  const focus=document.activeElement?.closest?.('[data-decide],[data-use]');const refocus=focus?`[data-bucket="${focus.dataset.bucket}"][data-${focus.dataset.decide?'decide':'use'}="${focus.dataset.decide||focus.dataset.use}"]`:'';
  root.innerHTML=`<div class="bf-grid">
    <section class="bf-main" aria-labelledby="bfTitle">
      <div class="bf-card bf-intro"><h1 id="bfTitle">Fit this build to your inventory</h1><p class="bf-lede">${owned} of ${fit.slots.length} shared weapons and armour are in your inventory. ${missing.length?`Decide each of the other ${missing.length}: approve the suggestion, choose another of your items, or leave the slot empty.`:'Nothing to decide.'}</p>${page.notice?`<p class="bf-note" role="status">${esc(page.notice)}</p>`:''}
        ${missing.length?`<button type="button" class="bf-secondary bf-approve-all" id="bfApproveAll"${approvable?'':' disabled'}>APPROVE ALL SUGGESTIONS${approvable?` (${approvable})`:''}</button>`:''}</div>
      <ol class="bf-slots">${fit.slots.map(slotTile).join('')}</ol>
    </section>
    <div class="bf-more">${extrasPanel(fit)}</div>
    <aside class="bf-rail" aria-label="The build as decided">
      <section class="bf-card"><h2 class="bf-kicker">DECISIONS</h2><p class="bf-big">${missing.length-fit.undecided} <span>of ${missing.length} decided</span></p></section>
      <section class="bf-card" aria-labelledby="bfSetsTitle"><h2 id="bfSetsTitle" class="bf-kicker">SET BONUSES</h2>${setsPanel(fit)}</section>
      <section class="bf-card" aria-labelledby="bfStatsTitle"><h2 id="bfStatsTitle" class="bf-kicker">ARMOUR STATS</h2>${statsPanel(fit)}${page.plan.priority.stats.length?`<p class="bf-note">This build's stat priority, from its ${page.plan.priority.source==='targets'?'DIM stat targets':'shared mods and fragments'}: ${esc(page.plan.priority.stats.map(stat=>stat.name).join(', '))}.</p>`:''}</section>
      <button type="button" class="bf-primary bf-continue${page.transfer==='busy'?' is-busy':''}" id="bfContinue"${fit.ready&&page.transfer!=='busy'?'':' disabled'} aria-describedby="bfContinueNote">${continueLabel(fit)}</button>
      <p class="bf-note" id="bfContinueNote">${fit.ready?'The Forge receives exactly these choices.':'Continue unlocks when every missing item has a decision.'}${page.error?` ${esc(page.error)}`:''}</p>
    </aside></div>${picker(fit)}`;
  const dialog=byId('bfPicker');if(dialog&&!dialog.open){dialog.showModal();dialog.querySelector('[data-use][aria-pressed="true"],[data-use]')?.focus();}
  if(refocus&&!dialog)root.querySelector(refocus)?.focus();
}

function decide(bucket,decision){
  const next=new Map(page.decisions);if(decision)next.set(bucket,decision);else next.delete(bucket);
  page.decisions=next;page.notice='';writeUrl();render();
}

document.addEventListener('click',event=>{
  const choice=event.target.closest('[data-decide]');
  if(choice&&!choice.disabled){
    const bucket=Number(choice.dataset.bucket),type=choice.dataset.decide;
    if(type==='approve'){const id=page.plan.suggestions.get(bucket);if(id)decide(bucket,{type:'approve',id});}
    else if(type==='empty')decide(bucket,{type:'empty'});
    else{page.picker=bucket;render();}
    return;
  }
  const use=event.target.closest('[data-use]');
  if(use){const bucket=Number(use.dataset.bucket);page.picker=null;decide(bucket,{type:'choose',id:use.dataset.use});document.querySelector(`[data-bucket="${bucket}"][data-decide="choose"]`)?.focus();return;}
  if(event.target.closest('[data-close-picker]')){const bucket=page.picker;page.picker=null;render();document.querySelector(`[data-bucket="${bucket}"][data-decide="choose"]`)?.focus();return;}
  if(event.target.closest('#bfApproveAll')){page.decisions=approveAll(page.plan,page.decisions);writeUrl();render();return;}
  if(event.target.closest('#bfContinue'))void continueToForge();
});
document.addEventListener('cancel',event=>{if(event.target.id==='bfPicker'){event.preventDefault();const bucket=page.picker;page.picker=null;render();document.querySelector(`[data-bucket="${bucket}"][data-decide="choose"]`)?.focus();}},true);

// The Forge receives the share with exactly the decided items, the shared mods on their pieces,
// the subclass as shared, the artifact picks and the equipment.
async function continueToForge(){
  if(page.transfer==='busy')return;
  try{
    const choices=fitChoices(page.plan,page.decisions),inputs=page.inputs;
    page.transfer='busy';page.error='';render();
    await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
    const {build}=adaptDimLoadout(inputs.loadout,{snapshot:inputs.snapshot,profile:inputs.profile,binding:inputs.binding,preferredCharacterId:page.selection.characterId,currentSeasonNumber:inputs.currentSeasonNumber,choices});
    sendDimToForge(build);
  }catch(error){page.transfer='idle';page.error=error?.message||'The Forge could not receive this build. Try again.';render();}
}

async function preparedPayload(session){
  const raw=await loadPreparedPagePayload(session,'loadout',{sharedPayload:globalThis.FORGE_HERO_PROFILE_PAYLOAD});
  const normalized=normalisePreparedPagePayload(raw);
  guardianManifest.seedPayload(normalized);
  if(normalized.forgeArmourIndex&&!guardianManifest.applyForgeArmourIndex(normalized,normalized.forgeArmourIndex))throw new Error('The armour index does not match this profile. Reload to retry.');
  return guardianManifest.hydratePayload(normalized,{allowNetwork:false,waitForManifest:false});
}

async function load(){
  reportPreparedPageStage('start','loadout');
  try{
    if(!page.selection.dim)return;
    const [loadout,snapshot,session]=await Promise.all([shares.load(page.selection.dim),manifest.ready(),getBungieSession().catch(()=>null)]);
    reportPreparedPageStage('session','loadout');
    if(session?.authenticated===false){globalThis.ForgeLoader?.authRequired?.(authStartUrl(location.href));return;}
    if(!session?.authenticated)throw new Error('Bungie is not responding. Reload to retry.');
    const payload=await preparedPayload(session),binding=sessionBinding(session);
    const adaptation=adaptDimLoadout(loadout,{snapshot,profile:payload.profile,binding,preferredCharacterId:page.selection.characterId,currentSeasonNumber:payload.currentSeasonNumber??null});
    page.inputs={loadout,snapshot,profile:payload.profile,binding,currentSeasonNumber:payload.currentSeasonNumber??null};
    page.adaptation=adaptation;page.plan=createFitPlan(adaptation,{snapshot,profile:payload.profile});
    const decisions=validDecisions(page.plan,page.selection.decisions);
    if(decisions.size<page.selection.decisions.size)page.notice='Some decisions in this link point at items you do not own, so those slots need deciding again.';
    page.decisions=decisions;
    page.selection={...page.selection,characterId:String(adaptation.build.characterId||''),membershipId:String(binding.membershipId||''),membershipType:String(binding.membershipType||'')};
    writeUrl();
  }catch(error){
    page.error=error?.message||'This DIM loadout could not be loaded.';
    console.error('[Build Fit]',error);
  }finally{
    page.loading=false;render();
    reportPreparedPageStage('ready','loadout');
    globalThis.ForgeLoader?.ready?.(document.querySelector('.apx-page-shell'));
  }
}
void load();
