import "./guardian-semantic-interceptor.mjs?v=20260905-weapon-audit-1&roll=20260909-apply-1";
import {
  normaliseLiveProfile,
  loadSelectedLoadout,
  characterRoster,
  selectLiveCharacter
} from "./guardian-bungie-profile.mjs?v=20260906-page-data-recovery-1&roll=20260909-apply-1&transport=20260911-compact-plugs-1&tile=20260912-identities-1";
import { renderGuardianLoadouts } from "./guardian-loadouts.mjs?v=20260905-loadout-actions-1";
import {renderEquippedSubclass,renderSuperFormation} from "./guardian-super-formation.mjs?v=20260829-subclass-identity-1";
import {getBungieSession} from "./guardian-bungie-auth.mjs?v=20260912-global-icon-audit-1";
import {bindParadoxItemInspect} from "./paradox-item-hover.mjs?v=20260912-click-inspect-1";
import {confirmPostmasterCollectionIntent,confirmVaultTransferIntent,executePostmasterCollectionIntent,executeVaultTransferIntent,liveActionCapabilities,stagePostmasterCollectionIntent,stageVaultTransferIntent} from "./guardian-live-actions.mjs?v=20260912-shared-character-inventory-1";
import {createVaultCatalogue,itemKey} from "../vault/vault-inventory.mjs?v=20260912-shared-item-tile-5";
import {bindInventoryWorkspaceHovers,bindInventoryWorkspaceInteractions,equippedAndCarriedMarkup,postmasterMarkup} from "../../shared/guardian-inventory-workspace.mjs?v=20260912-shared-item-tile-5";
import {assertRenderablePagePayload} from "../../core/page-ready-contract.mjs?v=20260906-page-data-recovery-1";

const PLAYER_POWER_CAP = 550;
const VALID_CLASSES = ["hunter", "titan", "warlock"];
const VALID_SUBCLASSES = ["void", "solar", "arc", "stasis", "strand", "prismatic"];

const byId = id => document.getElementById(id);

const escapeHtml = value =>
  String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[character]));

const bungieUrl = path => {
  if (!path) return "";
  return path.startsWith("http") ? path : `https://www.bungie.net${path}`;
};

function resolvedDisplayIcon(item) {
  if (!item) return "";
  const display = item?.definition?.displayProperties || item?.displayProperties || {};
  const sequenceFrame = Array.isArray(display?.iconSequences)
    ? display.iconSequences.flatMap(sequence => Array.isArray(sequence?.frames) ? sequence.frames : []).find(Boolean)
    : "";
  return item.icon || display.icon || display.highResIcon || sequenceFrame || item?.definition?.secondaryIcon || item?.secondaryIcon || "";
}

const iconMarkup = (icon, name) => {
  const url = bungieUrl(icon);
  return url
    ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(name || '')}" loading="lazy" decoding="async" onerror="this.style.opacity=0">`
    : `<span class="ico-fb">◆</span>`;
};

const itemIconMarkup = item => iconMarkup(resolvedDisplayIcon(item), item?.name);

const emptyRailSlot = () => `<span class="rail-empty-slot" aria-hidden="true"></span>`;
const padRailSlots = (markup, filled, target) => `${markup}${Array.from({ length: Math.max(0, target - filled) }, emptyRailSlot).join("")}`;

const workspaceState = {
  characterId: null,
  characterClass: "hunter",
  subclass: "arc",
  subclassName: "Arcstrider",
  subclassIcon: "",
  renderUrl: null,
  power: PLAYER_POWER_CAP,
  stats: null,
  weapons: [],
  armour: [],
  emblem: null,
  ghost: null,
  shader: null,
  ornaments: []
};

const characterInventoryState={session:null,payload:null,catalogue:{items:[],postmasterItems:[]},activeCharacterId:'',detail:null,pendingAction:null,busy:false};

function characterInventoryStatus(message,state=''){
  const node=byId('characterInventoryStatus');
  if(node){node.textContent=message;node.className=`vault-runtime-status${state?` is-${state}`:''}`;}
}

function characterInventoryItem(key){
  return [...(characterInventoryState.catalogue.items||[]),...(characterInventoryState.catalogue.postmasterItems||[])].find(item=>itemKey(item)===String(key||''))||null;
}

function activeCharacterLabel(){
  const value=String(characterInventoryState.detail?.characterClass||'Guardian');
  return value.replace(/^./,letter=>letter.toUpperCase());
}

function renderCharacterInventory(){
  const host=byId('characterInventoryWorkspace'),payload=characterInventoryState.payload,characterId=String(characterInventoryState.activeCharacterId||'');
  if(!host)return;
  if(!payload?.profile||!characterId){
    host.innerHTML='<p class="vault-transfer-empty">Live Bungie inventory is unavailable for the active Guardian.</p>';
    return;
  }
  const character=payload.profile?.characters?.data?.[characterId]||null;
  if(!character){
    host.innerHTML='<p class="vault-transfer-empty">The active Guardian is not present in the latest Bungie profile.</p>';
    return;
  }
  const capabilities=liveActionCapabilities(characterInventoryState.session||{}),emblem=character.emblemBackgroundPath||character.emblemPath||'',style=emblem?` style="--vault-character-emblem:url('${escapeHtml(bungieUrl(emblem))}')"`:'';
  host.innerHTML=`<article class="vault-character-column is-active character-live-inventory"${style}>
    ${postmasterMarkup({characterId,items:characterInventoryState.catalogue.postmasterItems,characterLabel:activeCharacterLabel(),capabilities,activeCharacterId:characterId})}
    <div class="vault-character-inventory">
      <header class="vault-character-header"><div><span>ACTIVE GUARDIAN</span><h3>${escapeHtml(activeCharacterLabel().toUpperCase())}</h3></div><strong>${character.light===undefined?'':`✦ ${escapeHtml(character.light)}`}</strong></header>
      ${equippedAndCarriedMarkup({characterId,items:characterInventoryState.catalogue.items,capabilities,activeCharacterId:characterId})}
    </div>
  </article>`;
  bindInventoryWorkspaceHovers(host,{resolveItem:characterInventoryItem,bindInspect:bindParadoxItemInspect});
}

function updateCharacterInventory(detail={}){
  const source=String(detail.source||'');
  if(source!=='bungie-live'&&String(detail.loadoutSource||'')!=='bungie-live'){
    characterInventoryState.payload=null;
    characterInventoryState.activeCharacterId='';
    renderCharacterInventory();
    characterInventoryStatus('Connect Bungie to inspect the active Guardian inventory.');
    return;
  }
  try{
    const next=globalThis.FORGE_PAGE_PAYLOAD;
    assertRenderablePagePayload(next,'character');
    characterInventoryState.payload=next;
    characterInventoryState.catalogue=createVaultCatalogue(next);
    characterInventoryState.activeCharacterId=String(detail.characterId||'');
    characterInventoryState.detail=detail;
    renderCharacterInventory();
    characterInventoryStatus('Showing real equipped, carried, and Postmaster items for the active Guardian. Double click a Postmaster item to review a direct live equip.','good');
  }catch(error){
    characterInventoryState.payload=null;
    renderCharacterInventory();
    characterInventoryStatus(error?.message||'The active Guardian inventory could not be rendered.','error');
  }
}

function closeCharacterInventoryAction(){
  if(characterInventoryState.busy)return;
  const dialog=byId('characterInventoryActionDialog');
  if(dialog?.open)dialog.close();
  characterInventoryState.pendingAction=null;
  const progress=byId('characterInventoryActionProgress');
  if(progress)progress.textContent='';
}

function showCharacterInventoryAction(title,summary,action){
  characterInventoryState.pendingAction=action;
  byId('characterInventoryActionTitle').textContent=title;
  byId('characterInventoryActionSummary').textContent=summary;
  byId('characterInventoryActionProgress').textContent='Review the exact account change, then confirm.';
  const dialog=byId('characterInventoryActionDialog');
  if(typeof dialog?.showModal==='function')dialog.showModal();
  else dialog?.setAttribute('open','');
}

function stageCharacterPostmasterCollection(characterId,requestedItemKey=''){
  try{
    const items=characterInventoryState.catalogue.postmasterItems.filter(item=>String(item?.source?.characterId||'')===String(characterId||'')&&/^\d+$/.test(String(item?.itemInstanceId||''))&&(!requestedItemKey||itemKey(item)===String(requestedItemKey))),intent=stagePostmasterCollectionIntent({characterId,items,session:characterInventoryState.session}),subject=items.length===1?items[0].name:`${items.length} exact items`;
    showCharacterInventoryAction('Confirm Postmaster pull',`Pull ${subject} from ${activeCharacterLabel()} Postmaster. Bungie must confirm every collected item before this view refreshes.`,{kind:'postmaster',intent});
  }catch(error){characterInventoryStatus(error?.message||'Postmaster collection cannot be staged.','error');}
}

function stageCharacterDirectEquip(requestedItemKey){
  const item=characterInventoryItem(requestedItemKey),characterId=characterInventoryState.activeCharacterId;
  if(!item||!characterId)return;
  try{
    if(item.source?.kind==='vault'){
      const intent=stageVaultTransferIntent({item,destination:{kind:'character',characterId},session:characterInventoryState.session,equipAfterTransfer:true});
      showCharacterInventoryAction('Confirm direct live equip',`Move ${item.name} from Vault to ${activeCharacterLabel()}, then equip that exact item. Bungie must confirm transfer and equip before this view changes.`,{kind:'transfer',intent});
      return;
    }
    if(item.source?.kind==='postmaster'){
      const intent=stagePostmasterCollectionIntent({characterId:String(item.source.characterId||''),targetCharacterId:characterId,items:[item],session:characterInventoryState.session,equipAfterCollection:true});
      showCharacterInventoryAction('Confirm direct live equip',`Collect ${item.name} from ${activeCharacterLabel()} Postmaster, then equip that exact item. Every step must be confirmed by Bungie.`,{kind:'postmaster',intent});
    }
  }catch(error){characterInventoryStatus(error?.message||'This direct live equip cannot be staged.','error');}
}

function characterInventoryFailure(result){
  const failed=[...(result?.steps||[])].reverse().find(row=>['failed','mismatch','blocked'].includes(row.status)),detail=failed?.detail;
  return detail?.payload?.Message||detail?.message||(Array.isArray(detail)?detail[0]:'')||failed?.label||'Bungie did not confirm the requested inventory state.';
}

async function performCharacterInventoryAction(){
  const action=characterInventoryState.pendingAction;
  if(!action||characterInventoryState.busy)return;
  const confirm=byId('characterInventoryActionConfirm'),cancel=byId('characterInventoryActionCancel'),progress=byId('characterInventoryActionProgress');
  characterInventoryState.busy=true;
  confirm.disabled=true;
  cancel.disabled=true;
  progress.textContent='Running fresh Bungie preflight. No local item position has changed.';
  let result=null;
  try{
    const onProgress=row=>{progress.textContent=row.label||'Waiting for Bungie confirmation.';};
    result=action.kind==='transfer'
      ?await executeVaultTransferIntent(confirmVaultTransferIntent(action.intent),{session:characterInventoryState.session,onProgress})
      :await executePostmasterCollectionIntent(confirmPostmasterCollectionIntent(action.intent),{session:characterInventoryState.session,onProgress});
    if(result.mutationCount>0)document.dispatchEvent(new CustomEvent('forge:bungie-profile-refresh-requested',{detail:{reason:'character-inventory-action',characterId:characterInventoryState.activeCharacterId}}));
    if(result.status==='applied'&&result.readback?.verified)characterInventoryStatus('The live inventory action was confirmed by Bungie. Refreshing the active Guardian from a fresh profile.','good');
    else characterInventoryStatus(`${result.status==='partial'?'The live action partially completed':'No live change was confirmed'}: ${characterInventoryFailure(result)}`,'error');
  }catch(error){
    if(result?.mutationCount>0)document.dispatchEvent(new CustomEvent('forge:bungie-profile-refresh-requested',{detail:{reason:'character-inventory-action-recovery',characterId:characterInventoryState.activeCharacterId}}));
    characterInventoryStatus(error?.message||'The Bungie action failed before confirmation.','error');
  }finally{
    characterInventoryState.busy=false;
    confirm.disabled=false;
    cancel.disabled=false;
    if(byId('characterInventoryActionDialog')?.open)byId('characterInventoryActionDialog').close();
    characterInventoryState.pendingAction=null;
  }
}

function installCharacterInventory(){
  const host=byId('characterInventoryWorkspace');
  bindInventoryWorkspaceInteractions(host,{onPullItem:stageCharacterPostmasterCollection,onPullAll:stageCharacterPostmasterCollection,onDirectEquip:stageCharacterDirectEquip});
  byId('characterInventoryActionCancel')?.addEventListener('click',closeCharacterInventoryAction);
  byId('characterInventoryActionConfirm')?.addEventListener('click',performCharacterInventoryAction);
  byId('characterInventoryActionDialog')?.addEventListener('cancel',event=>{event.preventDefault();if(!characterInventoryState.busy)closeCharacterInventoryAction();});
  getBungieSession().then(session=>{characterInventoryState.session=session;renderCharacterInventory();}).catch(()=>{});
}

let stageLoadingTimer = 0;
let renderSequence = 0;

function setStageState(state, message = "") {
  const stage = document.querySelector(".stage");
  if (stage) stage.dataset.state = state || "ready";
  clearTimeout(stageLoadingTimer);

  const titleNode = byId("stageStateTitle");
  const msgNode = byId("stageStateMessage");

  if (titleNode) {
    if (state === "loading") titleNode.textContent = "SYNCING TELEMETRY";
    else if (state === "error") titleNode.textContent = "TELEMETRY UNAVAILABLE";
    else titleNode.textContent = "GUARDIAN TELEMETRY";
  }

  if (msgNode) {
    if (state === "loading") msgNode.textContent = message || "Loading Guardian profile from Bungie API…";
    else if (state === "error") msgNode.textContent = message || "Guardian data could not be resolved.";
    else msgNode.textContent = message || "Select a character or loadout to inspect live data metrics.";
  }

  if (state === "loading") {
    stageLoadingTimer = setTimeout(() => {
      if (stage && stage.dataset.state !== "loading") return;
      if (stage) stage.dataset.state = "error";
      if (titleNode) titleNode.textContent = "REQUEST TIMEOUT";
      if (msgNode) msgNode.textContent = "Guardian data took too long. Refresh or reconnect Bungie.";
      document.dispatchEvent(new CustomEvent("forge:guardian-load-timeout"));
    }, 15000);
  }
}

function renderVerifiedPreview(data = {}) {
  const previewHost = byId("verifiedPreview") || byId("previewContainer") || byId("characterSummary");
  if (!previewHost) return;

  const title = escapeHtml(data.title || workspaceState.subclassName || "Equipped Setup");
  const desc = escapeHtml(data.description || "Telemetry synchronized from live Bungie profile");

  previewHost.innerHTML = `
    <div class="verified-header">
      <h4>${title}</h4>
      <p>${desc}</p>
    </div>
  `;
}

function renderSubclassBuild(build = {}, subclassName = "Subclass") {
  const activeElement = (workspaceState.subclass || "arc").toLowerCase();
  const subclassIdentity = (Array.isArray(workspaceState.subclassCatalog) ? workspaceState.subclassCatalog : []).find(item => [item?.element,item?.subclass,item?.key,item?.name].filter(Boolean).join(" ").toLowerCase().includes(activeElement)) || null;
  document.documentElement.dataset.subclass = activeElement;

  renderEquippedSubclass({
    root: byId("equippedSubclassSummary"),
    iconNode: byId("equippedSubclassIcon"),
    nameNode: byId("equippedSubclassName"),
    metaNode: byId("equippedSubclassMeta"),
    subclass: activeElement,
    subclassName,
    characterClass: workspaceState.characterClass,
    icon: resolvedDisplayIcon(subclassIdentity) || workspaceState.subclassIcon || resolvedDisplayIcon(build.subclassDefinition || build.subclass || workspaceState.subclassDefinition || workspaceState.subclassItem)
  });

  const activeSuper = build.super || workspaceState.super || null;
  const superOptions = Array.isArray(build.superOptions) && build.superOptions.length
    ? build.superOptions
    : (Array.isArray(workspaceState.superOptions) && workspaceState.superOptions.length
      ? workspaceState.superOptions
      : (activeSuper ? [activeSuper] : []));

  const featureHost = byId("superFeatureCluster");
  if (featureHost) {
    renderSuperFormation({host:featureHost,nameNode:byId("subclassName"),activeSuper,superOptions,subclass:activeElement,subclassCatalog:workspaceState.subclassCatalog,characterClass:workspaceState.characterClass,onSelect:()=>{}});
  }

  const abilities = Array.isArray(build.abilities) ? build.abilities.slice(0, 4) : [];
  const abilityHost = byId("abilityList");
  if (abilityHost) {
    const markup = abilities.map(item => `
      <div class="ability-row" title="${escapeHtml(item.name)}">
        <span class="ico-badge">${itemIconMarkup(item)}</span>
        <div class="meta"><small>${escapeHtml(item.itemTypeDisplayName || subclassName)}</small><b>${escapeHtml(item.name)}</b></div>
      </div>
    `).join("");
    abilityHost.innerHTML = padRailSlots(markup, abilities.length, 4);
  }

  const aspects = Array.isArray(build.aspects) ? build.aspects.slice(0, 2) : [];
  const aspectHost = byId("aspectList");
  if (aspectHost) {
    const markup = aspects.map(item => `
      <div class="slot" title="${escapeHtml(item.name)}">
        <span class="ico-badge">${itemIconMarkup(item)}</span>
        <span class="nm">${escapeHtml(item.name)}</span>
      </div>
    `).join("");
    aspectHost.innerHTML = padRailSlots(markup, aspects.length, 2);
  }

  const fragments = Array.isArray(build.fragments) ? build.fragments.slice(0, 5) : [];
  const fragmentHost = byId("fragList");
  if (fragmentHost) {
    const markup = fragments.map(item => `
      <div class="slot" title="${escapeHtml(item.name)}">
        <span class="ico-badge">${itemIconMarkup(item)}</span>
        <span class="nm">${escapeHtml(item.name)}</span>
      </div>
    `).join("");
    fragmentHost.innerHTML = padRailSlots(markup, fragments.length, 5);
  }

  // guardian-artifact.mjs is the sole owner of Artifact identity and active
  // perk rendering. This renderer deliberately does not pad or infer that rail.
}

function settleImage(image) {
  if (!image?.src || image.hidden || image.closest("[hidden]")) return Promise.resolve();
  if (image.complete) return Promise.resolve();
  return Promise.race([
    typeof image.decode === "function" ? image.decode().catch(() => {}) : new Promise(resolve => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", resolve, { once: true });
    }),
    new Promise(resolve => setTimeout(resolve, 5000))
  ]);
}

function publishRenderComplete(detail = {}) {
  const sequence = ++renderSequence;
  requestAnimationFrame(() => requestAnimationFrame(async () => {
    if (sequence !== renderSequence) return;
    const roots = [
      byId("equippedSubclassSummary"), byId("superFeatureCluster"), byId("abilityList"),
      byId("aspectList"), byId("fragList"), byId("artPerks"),
      document.querySelector(".gear-weapons"), document.querySelector(".gear-combined"),
      byId("characterInventoryWorkspace"), byId("guardianCharacterCards"), byId("guardianLoadouts")
    ].filter(Boolean);
    const images = [...new Set(roots.flatMap(root => [...root.querySelectorAll("img")]))];
    await Promise.all(images.map(settleImage));
    if (sequence !== renderSequence) return;
    document.documentElement.dataset.guardianRenderComplete = "true";
    document.dispatchEvent(new CustomEvent("forge:guardian-render-complete", { detail: {
      characterId: String(detail.characterId || ""),
      selectedLoadoutIndex: Number.isInteger(detail.selectedLoadoutIndex) ? detail.selectedLoadoutIndex : null,
      superCount: Number(byId("superFeatureCluster")?.dataset.superCount || 0),
      renderedImages: images.filter(image => image.complete && image.naturalWidth > 0).length
    }}));
  }));
}

function ensureLayoutPlaceholders() {
  const targets = [["abilityList",4],["aspectList",2],["fragList",5],["artPerks",7]];
  targets.forEach(([id,count]) => {
    const host = byId(id);
    if (!host || host.children.length) return;
    host.innerHTML = Array.from({ length: count }, emptyRailSlot).join("");
  });
}

function renderStats(stats = []) {
  const host = byId("statsGrid");
  if (!host) return;
  host.innerHTML = stats.map(([name, val]) => `
    <div class="stat-box">
      <span>${escapeHtml(name)}</span>
      <b>${Number(val) || 0}</b>
    </div>
  `).join("");
}

function updateIdentityCosmetics(data = {}) {
  const shaderNode = document.querySelector(".cos.sw.shader");
  const ghostNode = document.querySelector(".cos.sw.ghost");
  const shaderEl = shaderNode?.nextElementSibling?.querySelector("b");
  const ghostEl = ghostNode?.nextElementSibling?.querySelector("b");
  if (shaderEl) shaderEl.textContent = data.shader?.name || data.shader || "Default";
  if (ghostEl) ghostEl.textContent = data.ghost?.name || data.ghost || "Default";
}

function normaliseSelection(detail = {}) {
  const characterClass = String(
    detail.characterClass ?? detail.className ?? detail.classType ?? workspaceState.characterClass
  ).toLowerCase();
  const subclass = String(detail.subclass ?? workspaceState.subclass).toLowerCase();
  if (!VALID_CLASSES.includes(characterClass) || !VALID_SUBCLASSES.includes(subclass)) return null;
  return { ...workspaceState, ...detail, characterClass, subclass };
}

function applyGuardianSelection(detail) {
  const next = normaliseSelection(detail);
  if (!next) return;
  Object.assign(workspaceState, next);

  const stage = document.querySelector(".stage");
  const platform = byId("guardianPlatform");
  if (stage) {
    stage.dataset.class = next.characterClass;
    stage.dataset.subclass = next.subclass;
  }
  if (platform) {
    platform.classList.remove(...VALID_SUBCLASSES);
    platform.classList.add(next.subclass);
  }

  document.documentElement.dataset.subclass = (next.subclass || "arc").toLowerCase();

  const subclassBuild = next.subclassBuild || {
    super: next.super || null,
    superOptions: Array.isArray(next.superOptions) ? next.superOptions : [],
    abilities: Array.isArray(next.abilities) ? next.abilities : [],
    aspects: Array.isArray(next.aspects) ? next.aspects : [],
    fragments: Array.isArray(next.fragments) ? next.fragments : []
  };
  renderSubclassBuild({...subclassBuild,artifact:next.artifact||null}, next.subclassName);
  if (Array.isArray(next.stats)) renderStats(next.stats);
  updateIdentityCosmetics(next);
  renderVerifiedPreview(next);
  setStageState("ready");
  publishRenderComplete(next);
}

document.addEventListener("forge:guardian-selection-changed", event => {
  try {
    applyGuardianSelection(event.detail);
    updateCharacterInventory(event.detail);
  } catch (error) {
    console.error("[Forge Guardian render]", error);
    setStageState("error", "Guardian data arrived, but the workspace could not render it.");
  }
});

document.addEventListener("forge:guardian-loading", () => setStageState("loading", "Loading Guardian data…"));
document.addEventListener("forge:guardian-error", event =>
  setStageState("error", event.detail?.message || "Guardian data could not be loaded.")
);

ensureLayoutPlaceholders();
installCharacterInventory();
setStageState("ready");

export { renderSubclassBuild, renderStats, renderVerifiedPreview, resolvedDisplayIcon };
