import {listParadoxLoadouts,deleteParadoxLoadout} from '../guardian-workspace-v2/paradox-build-space/paradox-saved-loadouts.mjs?v=20260905-manual-editor-1';
import {createBuildState} from '../guardian-workspace-v2/paradox-build-space/paradox-build-state.mjs?v=20260904-memory-safe-transfer-1';
import {createHandoffEnvelope} from '../guardian-workspace-v2/paradox-build-binding.mjs';
import {getBungieSession} from '../guardian-workspace-v2/guardian-bungie-auth.mjs?v=20260906-tool-intro-1';
import {loadPreparedPagePayload,reportPreparedPageStage} from '../../core/prepared-page-client.mjs?v=20260907-shared-page-load-1&transport=20260911-compact-plugs-1';
import {mountForgeShell} from '../guardian-workspace-v2/platform-forge-shell.mjs?v=20260907-shared-page-load-1';

mountForgeShell({rootSelector:'.apx-page-shell',gameId:'destiny-2',gameName:'Destiny 2',developerName:'Bungie',layout:'destination'});

const BUILD_SPACE_KEY='astrix:paradox-build-space:v1';
const byId=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nameOf=item=>String(item?.name||item?.displayName||'Unresolved item');
const hashOf=item=>Number(item?.hash??item?.itemHash??item?.bungieHash);
let records=[];
let selectedId='';

function component(title,rows,{wide=false}={}){return `<section class="paradox-loadout-component${wide?' wide':''}"><h3>${esc(title)}</h3><ul>${rows.length?rows.map(row=>`<li>${esc(row)}</li>`).join(''):'<li>Not staged</li>'}</ul></section>`;}
function artifactRequiresInGameStep(build={}){const intended=[...new Set((build.artifactConfiguration?.selectedPerkHashes||[]).map(Number).filter(Number.isInteger))].sort((a,b)=>a-b),active=[...new Set((build.artifact?.activePerks||[]).filter(row=>row?.isActive!==false).map(hashOf).filter(Number.isInteger))].sort((a,b)=>a-b);return intended.length>0&&JSON.stringify(intended)!==JSON.stringify(active);}
function renderDetail(){
  const host=byId('paradoxLoadoutDetail'),record=records.find(row=>row.id===selectedId)||records[0];if(!host)return;
  if(!record){host.innerHTML='<div class="paradox-loadout-empty"><span><b>NO PARADOX LOADOUT SELECTED</b>Save a named Working Build from Build Forge. Bungie’s 20 in-game slots remain separate.</span></div>';return;}
  selectedId=record.id;const build=record.build||{},sb=build.subclassBuild||{},artifactHashes=build.artifactConfiguration?.selectedPerkHashes||[],manualSteps=(build.manualSocketChanges||[]).filter(change=>change?.remoteSupported===false).map(change=>`In game: set ${change.plugName||change.plugHash} on ${change.itemName||change.itemInstanceId}`).concat(artifactRequiresInGameStep(build)?'Artifact choices remain an in-game step.':[]);
  host.innerHTML=`<div class="paradox-loadout-detail-head"><div><small>PARADOX SAVED BUILD · REVISION ${Number(record.revision||1)}</small><h2>${esc(record.name)}</h2></div><div class="paradox-loadout-detail-actions"><button type="button" data-saved-action="open">OPEN IN BUILD FORGE</button><button type="button" data-saved-action="download">DOWNLOAD JSON</button><button type="button" class="is-danger" data-saved-action="delete">DELETE</button></div></div><p class="paradox-loadout-description">${esc(record.description||'No description supplied.')}</p><div class="paradox-loadout-component-grid">${component('WEAPONS',(build.weapons||[]).filter(Boolean).map(item=>`${nameOf(item)} · ${item.itemInstanceId||'instance unavailable'}`))}${component('ARMOUR',(build.armour||[]).filter(Boolean).map(item=>`${nameOf(item)} · ${item.itemInstanceId||'instance unavailable'}`))}${component('SUBCLASS & ABILITIES',[build.subclassName||build.subclass||'Subclass',sb.super&&`Super: ${nameOf(sb.super)}`,...(sb.abilities||[]).map(item=>nameOf(item)),...(sb.aspects||[]).map(item=>`Aspect: ${nameOf(item)}`),...(sb.fragments||[]).map(item=>`Fragment: ${nameOf(item)}`)].filter(Boolean),{wide:true})}${component('ARTIFACT',[build.artifact?.name||'Artifact',`${artifactHashes.length} intended perk${artifactHashes.length===1?'':'s'}`].filter(Boolean))}${component('PROVENANCE',[`${record.summary?.manualEditCount||0} manual edit${record.summary?.manualEditCount===1?'':'s'}`,record.source?.bungieLoadoutIndex==null?'Current equipped source':`Copied from Bungie slot ${record.source.bungieLoadoutIndex+1}`,...manualSteps])}</div><div class="paradox-loadout-binding">GUARDIAN ${esc(record.binding.characterId)} · MEMBERSHIP ${esc(record.binding.membershipType)}:${esc(record.binding.membershipId)} · UPDATED ${esc(new Date(record.updatedAt).toLocaleString())}</div>`;
}
function render(){
  const list=byId('paradoxLoadoutList'),count=byId('paradoxLoadoutCount');if(count)count.textContent=`${records.length} SAVED`;
  if(list)list.innerHTML=records.length?records.map(record=>`<button type="button" class="paradox-loadout-card${record.id===selectedId?' is-active':''}" data-saved-id="${esc(record.id)}"><span><b>${esc(record.name)}</b><span>${esc(record.summary?.subclass||record.binding.characterClass||'Guardian')} · ${Number(record.summary?.weaponCount||0)} weapons · ${Number(record.summary?.armourCount||0)} armour</span></span><em>R${Number(record.revision||1)}</em></button>`).join(''):'<div class="paradox-loadout-empty"><span><b>NO SAVED PARADOX BUILDS</b>Open Build Forge, edit or generate a Working Build, then choose Save PARADOX.</span></div>';
  renderDetail();
}
function selectedRecord(){return records.find(row=>row.id===selectedId)||null;}
function openRecord(record){
  if(!record)return;const state=createBuildState({...record.build,source:'paradox-saved-loadout',savedParadoxLoadoutId:record.id,savedParadoxLoadoutName:record.name,savedParadoxLoadoutDescription:record.description||''}),envelope=createHandoffEnvelope(state),serialized=JSON.stringify(envelope);let stored=false;
  for(const store of [sessionStorage,localStorage])try{store.setItem(BUILD_SPACE_KEY,serialized);stored=true;}catch{}
  if(!stored){const host=byId('paradoxLoadoutDetail');host?.insertAdjacentHTML('afterbegin','<div class="paradox-loadout-error" role="alert">This saved build is too large for the browser navigation handoff. Download its JSON before retrying.</div>');return;}
  const url=new URL('../guardian-workspace-v2/paradox-build-space/',location.href);url.searchParams.set('characterId',record.binding.characterId);url.searchParams.set('membershipId',record.binding.membershipId);url.searchParams.set('membershipType',record.binding.membershipType);location.href=url.toString();
}
function downloadRecord(record){if(!record)return;const blob=new Blob([JSON.stringify(record,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`${record.name.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase()||'paradox-loadout'}.json`;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);}
async function removeRecord(record){if(!record||!confirm(`Delete the PARADOX loadout “${record.name}”? This does not clear its Bungie source slot.`))return;await deleteParadoxLoadout(record.id);records=await listParadoxLoadouts();selectedId=records[0]?.id||'';render();}

document.addEventListener('click',event=>{const card=event.target.closest?.('[data-saved-id]');if(card){selectedId=card.dataset.savedId;render();return;}const action=event.target.closest?.('[data-saved-action]');if(!action)return;const record=selectedRecord();if(action.dataset.savedAction==='open')openRecord(record);else if(action.dataset.savedAction==='download')downloadRecord(record);else if(action.dataset.savedAction==='delete')void removeRecord(record);});

async function prepareVerifiedLoadoutPage(){
  reportPreparedPageStage('start','loadout');
  const session=await getBungieSession();
  reportPreparedPageStage('session','loadout');
  if(session?.authenticated!==true)return null;
  const payload=await loadPreparedPagePayload(session,'loadout',{sharedPayload:globalThis.FORGE_HERO_PROFILE_PAYLOAD});
  globalThis.FORGE_HERO_PROFILE_PAYLOAD=payload;
  return payload;
}

const [savedResult,preparedResult]=await Promise.allSettled([listParadoxLoadouts(),prepareVerifiedLoadoutPage()]);
records=savedResult.status==='fulfilled'?savedResult.value:[];
if(preparedResult.status==='rejected')console.info('[Forge Loadout] verified page data unavailable',preparedResult.reason);
selectedId=records[0]?.id||'';
reportPreparedPageStage('render','loadout');
render();
reportPreparedPageStage('ready','loadout');
window.ForgeLoader?.ready?.(document.querySelector('.apx-page-shell'));
