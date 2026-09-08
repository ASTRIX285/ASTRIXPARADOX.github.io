/* ASTRIX PARADOX — semantic UI bridge
   Renders resolved live semantics into the approved Guardian Build Forge without
   redesigning its structure. Unknown evidence is shown as unknown, never inferred. */
import {paradoxDefinitionId,resolveItemWatermark} from '../../core/bungie-item-identity.mjs';
import {bindParadoxItemHover} from './paradox-item-hover.mjs?v=20260908-icon-hover-1';
import {weaponStatRows} from './guardian-weapon-stat-definitions.mjs';

const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const bungieIcon=v=>{const s=String(v??"");return !s?"":s.startsWith("http")?s:`https://www.bungie.net${s}`;};
const text=v=>String(v?.name??v?.displayName??v??"").trim();
const bungieHash=v=>{const hash=Number(v?.bungieHash??v?.hash??v?.itemHash);return Number.isInteger(hash)&&hash>0?hash:null;};
const hashAttribute=v=>{const hash=bungieHash(v),type=v?.identitySource||'DestinyInventoryItemDefinition';return hash?` data-bungie-hash="${hash}" data-bungie-definition-type="${esc(type)}" data-paradox-id="${esc(v?.paradoxId||paradoxDefinitionId(type,hash))}"`:"";};

function weaponDetailTile(item,label="",{square=false}={}){
  if(!item)return "";
  const icon=bungieHash(item)?bungieIcon(item.icon??item.displayProperties?.icon):"";
  return `<div class="weapon-detail-tile${square?' weapon-detail-tile--mod':''}" data-slot-shape="${square?'square':'circle'}"${hashAttribute(item)} title="${esc([text(item),item.description].filter(Boolean).join(" — "))}">${icon?`<img src="${esc(icon)}"${hashAttribute(item)} alt="">`:"◆"}${label?`<small>${esc(label)}</small>`:""}<span>${esc(text(item)||"Resolved item")}</span></div>`;
}

function uniqueByHash(items=[]){
  return (items||[]).filter((item,index,rows)=>item&&rows.findIndex(other=>{const hash=bungieHash(item),otherHash=bungieHash(other);return hash&&otherHash?hash===otherHash:other===item;})===index);
}

function hasResolvedIdentity(item){
  const name=text(item);
  return Boolean(bungieHash(item)&&name&&item?.unresolved!==true&&!/^unresolved\b/i.test(name));
}

const isExoticWeapon=item=>Boolean(item&&(item.isExotic===true||Number(item.tierType??item.definition?.inventory?.tierType)===6||/\bexotic\b/i.test([item.tier,item.tierTypeName,item.definition?.inventory?.tierTypeName].filter(Boolean).join(" "))));

function weaponPerkMatrixMarkup(item,{compact=false,recommendedHashes=[]}={}){
  const semantics=item?.weaponSemantics||{},model=semantics.perkModel||item?.weaponPerkModel||null;
  const recommended=new Set((recommendedHashes||[]).map(String));
  const modelColumns=model?.columns||[];
  const fallbackPerks=semantics.selectedPerks||item?.selectedPerks||[];
  const columns=modelColumns.length?modelColumns:fallbackPerks.map((perk,index)=>({socketIndex:Number.isInteger(Number(perk?.socketIndex))?Number(perk.socketIndex):index,options:[perk],selectedPlugHash:bungieHash(perk),family:"perk"}));
  if(!columns.length)return "";
  const expectedRows=Math.max(1,Number(model?.expectedRowCount||item?.weaponPerkRowCount)||1),rows=model?.rows||[];
  const rowMarkup=Array.from({length:expectedRows},(_,rowIndex)=>{
    const modelRow=rows[rowIndex]||null;
    const slots=columns.map((column,columnIndex)=>{
      const capacity=Math.max(1,Number(column?.expectedRowCount)||expectedRows),slot=modelRow?.slots?.find(row=>Number(row?.socketIndex)===Number(column.socketIndex))||null,perk=slot?.perk||column.options?.[rowIndex]||null,hash=String(bungieHash(perk)||""),selected=slot?slot.isSelected:Boolean(hash&&String(column.selectedPlugHash||"")===hash),icon=perk?bungieIcon(perk.icon??perk.displayProperties?.icon):"";
      if(!perk||!hash)return `<span class="weapon-perk-cell is-empty" data-perk-column="${columnIndex+1}" data-perk-capacity="${capacity}" aria-hidden="true"></span>`;
      const title=[text(perk),perk.description].filter(Boolean).join(" — ");
      return `<span class="weapon-perk-cell ${selected?"is-selected":""} ${recommended.has(hash)?"is-recommended":""} ${isEnhancedPerk(perk)?"is-enhanced":""} ${!selected&&perk?.canInsert===false?'is-unavailable':''}" data-slot-shape="circle" data-socket-index="${column.socketIndex}" data-perk-column="${columnIndex+1}" data-perk-capacity="${capacity}"${hashAttribute(perk)} title="${esc(title)}">${icon?`<img src="${esc(icon)}"${hashAttribute(perk)} alt="${esc(text(perk))}">`:'<span aria-hidden="true">◆</span>'}</span>`;
    }).join("");
    return `<div class="weapon-perk-row" data-perk-row="${rowIndex+1}"><span class="weapon-perk-row-label">${compact?"":`ROW ${rowIndex+1}`}</span>${slots}</div>`;
  }).join("");
  const tier=Number(model?.weaponTier??semantics.gearTier??item?.gearTier),tierLabel=Number.isInteger(tier)&&tier>0?`Tier ${tier}`:"Tier unresolved";
  return `<div class="weapon-perk-matrix ${compact?"is-compact":""}" style="--weapon-perk-columns:${columns.length}" data-weapon-tier="${Number.isInteger(tier)?tier:""}" data-perk-row-count="${expectedRows}" aria-label="${esc(`${tierLabel} weapon perks in ${expectedRows} row${expectedRows===1?"":"s"}`)}">${rowMarkup}</div>`;
}

function weaponTraitHierarchyMarkup(item,{compact=false}={}){
  const semantics=item?.weaponSemantics||{},candidateIntrinsic=semantics.intrinsic||item?.intrinsic||null,intrinsic=hasResolvedIdentity(candidateIntrinsic)?candidateIntrinsic:null,intrinsicTraits=uniqueByHash(semantics.intrinsicTraits||[]).filter(hasResolvedIdentity),exoticTraits=isExoticWeapon(item)?uniqueByHash([...intrinsicTraits.filter(trait=>bungieHash(trait)!==bungieHash(intrinsic)),...(semantics.exoticTraits||item?.exoticWeaponTraits||[])]).filter(hasResolvedIdentity):[];
  if(!intrinsic&&!exoticTraits.length)return "";
  const lead=intrinsic?`<div class="weapon-intrinsic-lead">${weaponDetailTile(intrinsic)}<div><b>${esc(text(intrinsic))}</b>${compact||!intrinsic.description?"":`<p>${esc(intrinsic.description)}</p>`}</div></div>`:"";
  const traits=exoticTraits.length?`<div class="weapon-exotic-traits"><h4>EXOTIC WEAPON TRAITS</h4>${exoticTraits.map(trait=>`<div class="weapon-exotic-trait">${weaponDetailTile(trait)}<div><b>${esc(text(trait))}</b>${compact||!trait.description?"":`<p>${esc(trait.description)}</p>`}</div></div>`).join("")}</div>`:"";
  return `<div class="weapon-trait-hierarchy ${compact?"is-compact":""}">${lead}${traits}</div>`;
}

function openWeaponDetail(item){
  let host=document.getElementById("weaponDetailDrawer");
  if(!host){
    document.body.insertAdjacentHTML("beforeend",`<div class="weapon-detail-backdrop" data-close-weapon></div><aside class="weapon-detail-drawer paradox-item-shell" id="weaponDetailDrawer" aria-hidden="true"><button class="weapon-detail-close" type="button" data-close-weapon aria-label="Close weapon details">✕</button><div class="weapon-detail-content"></div></aside>`);
    host=document.getElementById("weaponDetailDrawer");
    document.querySelectorAll("[data-close-weapon]").forEach(node=>node.addEventListener("click",()=>{document.body.classList.remove("weapon-detail-open");host?.setAttribute("aria-hidden","true");}));
  }
  const s=item?.weaponSemantics||{};
  const stats=s.stats||item?.weaponStats||{};
  const statRows=weaponStatRows(stats).map(({hash,name,value,paradoxId})=>`<div class="weapon-stat" data-bungie-hash="${hash}" data-bungie-definition-type="DestinyStatDefinition" data-paradox-id="${esc(paradoxId)}"><span>${esc(name)}</span><i><b style="width:${Math.max(0,Math.min(100,value))}%"></b></i><strong>${esc(value)}</strong></div>`).join("");
  const mods=(s.modSockets?.length?s.modSockets:[s.masterwork,s.mod,s.catalyst]).filter(hasResolvedIdentity);
  const supportLabel=plug=>bungieHash(plug)===bungieHash(s.catalyst)?`CATALYST · ${s.catalyst?.progress?.masterworked?"MASTERWORKED":s.catalyst?.progress?.inserted?"INSERTED":"RESOLVED"}`:/masterwork/.test(String(plug?.semanticRole||""))?"MASTERWORK":/weapon-mod|\bmod\b/.test(String(plug?.semanticRole||""))?"WEAPON MOD":"WEAPON SOCKET";
  const perkMatrix=weaponPerkMatrixMarkup(item),perkRows=Number(s.perkModel?.expectedRowCount||s.perkRowCount)||1,weaponTier=Number(s.perkModel?.weaponTier??s.gearTier??item?.gearTier),perkHeading=`WEAPON PERKS${Number.isInteger(weaponTier)&&weaponTier>0?` · TIER ${weaponTier}`:""} · ${perkRows} ROW${perkRows===1?"":"S"}`;
  const traitHierarchy=weaponTraitHierarchyMarkup(item);
  const perkRule='All returned perk choices are shown. Highlighted perks are equipped.';
  const release=resolveItemWatermark(item,item.definition||{});
  const content=host.querySelector(".weapon-detail-content");
  if(content)content.innerHTML=`<article class="paradox-item-card paradox-item-card--weapon" data-item-kind="weapon" data-weapon-tier="${Number.isInteger(weaponTier)?weaponTier:""}">
    <header class="paradox-item-header weapon-detail-head"><div class="weapon-detail-icon"${hashAttribute(item)}><img src="${esc(bungieIcon(item.icon))}" alt="">${release.icon?`<img class="paradox-release-watermark" src="${esc(release.icon)}" data-watermark-source="${esc(release.source)}" alt="Release watermark">`:''}</div><div class="paradox-item-identity"><span class="paradox-kicker">PARADOX WEAPON MODEL</span><h2>${esc(item.name||"Weapon")}</h2><p>${esc(item.weaponType||item.itemTypeDisplayName||"Weapon")}</p></div><div class="weapon-detail-power"><small>POWER</small><b>${esc(item.power??"—")}</b></div></header>
    ${item.description?`<p class="weapon-flavour">${esc(item.description)}</p>`:""}
    <div class="paradox-card-body">
      <section class="paradox-section paradox-section--stats"><h3>WEAPON STATS</h3><div class="weapon-stats">${statRows||'<p class="weapon-detail-empty">Stats unresolved.</p>'}</div></section>
      <section class="paradox-section paradox-section--traits"><h3>INTRINSIC &amp; EXOTIC TRAITS</h3>${traitHierarchy||'<p class="weapon-detail-empty">No resolved intrinsic trait evidence.</p>'}</section>
      <section class="paradox-section paradox-section--perks"><div class="paradox-section-heading"><h3>${perkHeading}</h3><span>SELECTED · OWNED ROLL</span></div><p class="paradox-rule-note">${esc(perkRule)}</p>${perkMatrix||'<p class="weapon-detail-empty">No resolved perk evidence.</p>'}</section>
      <section class="paradox-section paradox-section--support"><h3>WEAPON MODS</h3><div class="weapon-detail-tiles">${mods.map(x=>weaponDetailTile(x,supportLabel(x),{square:true})).join("")||'<p class="weapon-detail-empty">No resolved mod evidence.</p>'}</div></section>
    </div>
  </article>`;
  host.setAttribute("aria-hidden","false");document.body.classList.add("weapon-detail-open");
}

function ensureStyle(){
  if(document.getElementById("guardianSemanticUiStyle"))return;
  const style=document.createElement("style");
  style.id="guardianSemanticUiStyle";
  style.textContent=`
    .semantic-meta{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px;min-height:16px}
    .semantic-chip{display:inline-flex;align-items:center;max-width:100%;padding:2px 5px;border:1px solid rgba(255,255,255,.12);border-radius:3px;background:rgba(255,255,255,.035);font:600 9px/1.2 Inter,sans-serif;letter-spacing:.025em;color:rgba(255,255,255,.7);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .semantic-chip.active{border-color:rgba(99,255,193,.3);color:rgba(171,255,220,.92)}
    .semantic-chip.warn{border-color:rgba(255,193,92,.28);color:rgba(255,214,142,.9)}
    .semantic-detail{margin-top:4px;font:500 9px/1.3 Inter,sans-serif;color:rgba(255,255,255,.52);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .weap.semantic-live .cap small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .gear-slot .gear-semantic-summary{padding:0 2px 5px}
    .stats-row .stat.semantic-enhanced,.stats-row .stat-box.semantic-enhanced{box-shadow:inset 0 0 0 1px rgba(118,210,255,.28)}
    .stats-row .semantic-threshold{font-size:8px;letter-spacing:.06em;color:rgba(145,220,255,.82)}
  `;
  document.head.appendChild(style);
}

function weaponSubtitle(item){
  const s=item?.weaponSemantics;
  if(!s)return "Awaiting resolved weapon semantics";
  const parts=[];
  if(s.intrinsic)parts.push(text(s.intrinsic));
  if(s.selectedPerks?.length)parts.push(s.selectedPerks.map(text).filter(Boolean).join(" · "));
  if(s.masterwork)parts.push(text(s.masterwork));
  if(s.mod)parts.push(text(s.mod));
  if(s.catalyst)parts.push(`Catalyst: ${text(s.catalyst)}${s.catalyst?.progress?.active?" active":" inactive"}`);
  if(s.champion?.breakerType!=null||s.champion?.breakerTypeHash!=null)parts.push("Champion capability resolved");
  return parts.filter(Boolean).join(" · ")||"No active perk evidence resolved";
}

function isEnhancedPerk(perk){
  if(perk?.isEnhanced===true||perk?.enhanced===true||perk?.definition?.isEnhanced===true)return true;
  const category=String(perk?.definition?.plug?.plugCategoryIdentifier||perk?.plugCategoryIdentifier||"").toLowerCase();
  const traits=[...(perk?.definition?.traitIds||[]),...(perk?.traitIds||[])].map(value=>String(value).toLowerCase());
  return category.includes("enhanced")||traits.some(value=>value.includes("enhanced"))||/^enhanced\b/i.test(String(perk?.name||perk?.displayProperties?.name||""));
}

function weaponMasterworkRank(item){
  if(item?.isExotic)return 10;
  const plug=item?.weaponSemantics?.masterwork;
  const values=(plug?.definition?.investmentStats||[]).map(row=>Math.abs(Number(row?.value))).filter(Number.isFinite);
  return values.length?Math.max(0,Math.min(10,values[0])):null;
}

function weaponSupportIconsMarkup(item){
  const semantics=item?.weaponSemantics||{};
  const fallback=[semantics.mod||semantics.selectedMod||item?.weaponMod||item?.mod,semantics.masterwork,semantics.catalyst].filter(Boolean);
  const sockets=semantics.modSockets?.length?semantics.modSockets:fallback;
  return sockets.filter(plug=>bungieHash(plug)).map(plug=>{
    const icon=bungieIcon(plug.icon||plug.displayProperties?.icon||plug.definition?.displayProperties?.icon),name=text(plug)||'Resolved support socket';
    const role=bungieHash(plug)===bungieHash(semantics.masterwork)?'masterwork':bungieHash(plug)===bungieHash(semantics.catalyst)?'catalyst':'mod';
    const index=Number.isInteger(plug.socketIndex)?` data-socket-index="${plug.socketIndex}"`:'';
    return `<span class="weapon-support-icon is-${role}${icon?'':' is-icon-unavailable'}" data-slot-shape="square"${index}${hashAttribute(plug)} title="${esc(name+(icon?'':' — icon unavailable'))}">${icon?`<img src="${esc(icon)}"${hashAttribute(plug)} alt="${esc(name)}">`:'<span aria-label="Icon unavailable">?</span>'}</span>`;
  }).join('');
}

function renderWeapons(weapons=[]){
  const cards=[...document.querySelectorAll(".gear-weapons .weap-grid .weap")];
  cards.forEach((card,index)=>{
    const item=weapons[index];
    if(!item)return;
    card.classList.add("semantic-live");
    if(!card.dataset.weaponDetailBound){card.dataset.weaponDetailBound="true";card.tabIndex=0;card.setAttribute("role","button");card.addEventListener("click",()=>{const current=card._forgeWeapon;if(current)openWeaponDetail(current);});card.addEventListener("keydown",event=>{if((event.key==="Enter"||event.key===" ")&&card._forgeWeapon){event.preventDefault();openWeaponDetail(card._forgeWeapon);}});}
    card._forgeWeapon=item;
    const art=card.querySelector(".art");
    const icon=bungieIcon(item.icon);
    const rank=weaponMasterworkRank(item);
    const hasRank=Number.isFinite(rank)&&rank>0;
    const seasonIcon=bungieIcon(item?.releaseWatermark?.icon??resolveItemWatermark(item,item.definition||{}).icon);
    const gearTier=Math.max(0,Math.min(5,Number(item.gearTier)||0));
    card.classList.toggle("is-level-gold",hasRank&&rank>=10);
    const semantics=item.weaponSemantics||{};
    const intrinsicIcon=bungieHash(semantics.intrinsic)?bungieIcon(semantics.intrinsic?.icon):"";
    const championIcon=bungieIcon(item.breakerDefinition?.displayProperties?.icon);
    const elementIcon=bungieIcon(item.elementDefinition?.displayProperties?.icon||item.elementDefinition?.transparentIconPath);
    if(art){
      art.classList.toggle("ph",!icon);
      const power=Number(item.power)||"—";
      art.innerHTML=`${icon?`<img class="weapon-art-image" src="${esc(icon)}" alt="${esc(item.name||"Weapon")}">`:'<span class="ph-glyph">⌖</span>'}${seasonIcon||gearTier?`<span class="weapon-tier-rail">${seasonIcon?`<span class="weapon-season-icon" title="Season/source emblem"><img src="${esc(seasonIcon)}" alt=""></span>`:""}${Array.from({length:gearTier},()=>'<i class="weapon-tier-diamond" aria-hidden="true"></i>').join("")}</span>`:""}<span class="weapon-right-rail">${intrinsicIcon?`<span class="weapon-corner-icon is-intrinsic"${hashAttribute(semantics.intrinsic)} title="Intrinsic trait"><img src="${esc(intrinsicIcon)}"${hashAttribute(semantics.intrinsic)} alt=""></span>`:""}${championIcon?`<span class="weapon-corner-icon is-champion" title="Champion capability"><img src="${esc(championIcon)}" alt=""></span>`:""}</span>${hasRank&&rank<10?`<span class="weapon-rank" title="Weapon mod rank">LVL ${esc(rank)}</span>`:""}<span class="weapon-power">${elementIcon?`<img src="${esc(elementIcon)}" alt="">`:""}<b>${esc(power)}</b></span>`;
    }
    const cap=card.querySelector(".cap");
    if(cap)cap.innerHTML=`<b>${esc(item.name||"Weapon")}</b><small title="${esc(weaponSubtitle(item))}">${esc(weaponSubtitle(item))}</small>`;
    let perkStrip=card.querySelector(".weapon-perk-strip");
    if(!perkStrip){perkStrip=document.createElement("div");perkStrip.className="weapon-perk-strip";perkStrip.setAttribute("aria-label","Resolved weapon perks");card.append(perkStrip);}
    const recommendedHashes=(item?.weaponRollAdvice?.best?.options||[]).map(option=>option?.hash).filter(Boolean),perkMatrix=weaponPerkMatrixMarkup(item,{compact:true,recommendedHashes});
    perkStrip.innerHTML=perkMatrix;
    perkStrip.hidden=!perkMatrix;
    let supportStrip=card.querySelector(".weapon-support-icons");
    if(!supportStrip){supportStrip=document.createElement("div");supportStrip.className="weapon-support-icons";supportStrip.setAttribute("aria-label","Equipped weapon mods, masterwork and catalyst");card.append(supportStrip);}
    supportStrip.innerHTML=weaponSupportIconsMarkup(item);
    supportStrip.hidden=!supportStrip.innerHTML;
    bindParadoxItemHover(art||card,item,'weapon');
  });
}

function renderStats(detail){
  const host=document.getElementById("statsRow");
  if(!host)return;
  const entries=Array.isArray(detail?.stats)?detail.stats:[];
  const model=detail?.statModel||{};
  host.innerHTML=entries.map(([name,value])=>{
    const row=model[name]||model[String(name)]||{};
    const enhanced=Boolean(row.enhancedThresholdReached);
    return `<div class="stat ${enhanced?"semantic-enhanced":""}"><span>${esc(name)}</span><b>${esc(value)}</b>${enhanced?'<small class="semantic-threshold">100+ ENHANCED</small>':""}</div>`;
  }).join("");
}

function renderArtifactStatus(detail){
  const host=document.querySelector(".grp--artifact .artifact-copy");
  if(!host)return;
  host.querySelector(".semantic-detail")?.remove();
  const v=detail?.artifactValidation;
  if(!v)return;
  const label=v.activeCount==null
    ? "Artifact state unresolved"
    : v.activeCount===0
      ? "No active perks reported by Bungie"
      : `${v.activeCount} applied perk${v.activeCount===1?"":"s"}${v.noDuplicateActiveHashes?" · unique":" · duplicate hash detected"}`;
  host.insertAdjacentHTML("beforeend",`<span class="semantic-detail">${esc(label)}</span>`);
}

function renderCoverage(detail){
  const node=document.querySelector(".gear-combined .tools");
  if(!node)return;
  const armour=detail?.hashCoverage?.armour;
  const weapons=detail?.hashCoverage?.weapons;
  const unknown=(armour?.unresolved?.length||0)+(armour?.semanticUnknown?.length||0)+(weapons?.unresolved?.length||0)+(weapons?.semanticUnknown?.length||0);
  node.textContent=unknown?`PARTIAL EVIDENCE`:`EVIDENCE VERIFIED`;
  node.title=unknown?"Unresolved/unclassified evidence is excluded from Paradox claims":"All equipped armour and weapon semantic evidence resolved";
}

function render(detail){
  if(!detail||detail.source!=="bungie-live")return;
  ensureStyle();
  requestAnimationFrame(()=>{
    renderWeapons(detail.weapons||[]);
    renderStats(detail);
    renderArtifactStatus(detail);
    renderCoverage(detail);
  });
}

document.addEventListener("forge:guardian-selection-changed",event=>render(event.detail));
ensureStyle();

export {render,renderWeapons,openWeaponDetail,weaponPerkMatrixMarkup,weaponTraitHierarchyMarkup};
