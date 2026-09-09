import {perkTooltipAttributes} from './guardian-perk-tooltip.mjs?v=20260909-weapon-presentation-1&roll=20260909-apply-1';
/* ==========================================================================
   ASTRIX PARADOX - GEAR & MOD MATRIX LAYOUT
   Builds the 5-column ARMOUR & MODS grid (Helmet, Gauntlets, Chest, Legs, Class Item)
   with 6 functional mod tiles each without tearing down sibling DOM blocks.
   ========================================================================== */

import "./guardian-semantic-ui.mjs?v=20260908-icon-hover-1&weapons=20260909-presentation-1&roll=20260909-apply-1";
import { openArmourDrawer } from "./guardian-beta-runtime.mjs?v=20260905-weapon-audit-1";
import { classifyArmourPlug } from "./guardian-semantic-resolver.mjs?v=20260905-weapon-audit-1&roll=20260909-apply-1";
import {resolveItemWatermark} from '../../core/bungie-item-identity.mjs';
import {bindParadoxItemHover} from './paradox-item-hover.mjs?v=20260908-icon-hover-1&weapons=20260909-presentation-1&roll=20260909-apply-1';

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const bungieIcon = (value) => {
  const path = String(value ?? "");
  return path.startsWith("/") ? `https://www.bungie.net${path}` : path;
};
const armourNames = ["Helmet", "Gauntlets", "Chest", "Legs", "Class Item"];
const armourArchetypeNames = new Set([
  "paragon", "grenadier", "specialist", "brawler", "bulwark", "gunner",
  "siegebreaker", "skirmisher", "demolitionist", "colossus", "reaver", "powerhouse"
]);

const MAIN_MOD_TILE_SIZE = "var(--pf-slot,52px)";

function syncModSizeToArtifact() {
  document.documentElement.style.setProperty("--pf-mod-size", MAIN_MOD_TILE_SIZE);
}

const plugText = (plug) => [
  plug?.semanticRole,
  plug?.name,
  plug?.displayName,
  plug?.itemTypeDisplayName,
  plug?.definition?.plug?.plugCategoryIdentifier,
  ...(plug?.definition?.traitIds ?? [])
].filter(Boolean).join(" ").toLowerCase();

const plugHash = (plug) => Number(plug?.hash ?? plug?.bungieHash);
const samePlug = (left, right) => Number.isFinite(plugHash(left)) && plugHash(left) === plugHash(right);
const isArmourTypeSymbol = (plug) => {
  if (!plug) return false;
  const text = plugText(plug);
  const name = String(plug?.name ?? plug?.displayName ?? "").trim().toLowerCase();
  return classifyArmourPlug(plug) === "archetype" || plug?.semanticRole === "archetype" || /armou?r[\s._-]*archetype/.test(text) || armourArchetypeNames.has(name);
};
const isIgnoredArmourPlug = (plug) => ["infuse", "exotic-perk"].includes(classifyArmourPlug(plug)) || /\binfus(e|ion)\b|semanticrole infuse|exotic[\s._-]*(armou?r[\s._-]*)?(intrinsic|perk)/.test(plugText(plug));
const roleMatches = (plug, role) => classifyArmourPlug(plug) === role || plug?.semanticRole === role || plugText(plug).includes(role);

function resolveArmourArchetype(item, armourTier) {
  const semantics = item?.armourSemantics ?? {};
  const explicit = semantics.archetype ?? item?.archetype ?? null;
  if (explicit) return explicit;
  const candidates = [
    ...(Array.isArray(item?.mods) ? item.mods : []),
    ...(Array.isArray(item?.socketCoverage?.plugs) ? item.socketCoverage.plugs : []),
    item?.masterwork,
    semantics.masterwork
  ].filter(Boolean);
  // Cached Armor 3.0 handoffs from the earlier mapper can label the type shield
  // as masterwork. Recover only a positively classified type shield for the art
  // overlay; never substitute an unrelated mod, Infuse or exotic-perk icon.
  return candidates.find(isArmourTypeSymbol) ?? null;
}

function armourModSequence(item, armourTier, archetype) {
  const semantics = item?.armourSemantics ?? {};
  const raw = Array.isArray(item?.mods) ? item.mods : [];
  const masterworkSource = item?.masterwork ?? semantics.masterwork ?? raw.find(plug => roleMatches(plug, "masterwork")) ?? null;
  const level = Number(item?.masterworkLevel ?? semantics.masterworkLevel ?? armourTier);
  const sourceIsType = samePlug(masterworkSource, archetype) || isArmourTypeSymbol(masterworkSource);
  const masterwork = (masterworkSource || Number.isFinite(level)) ? {
    ...(sourceIsType ? {} : (masterworkSource ?? {})),
    name: Number.isFinite(level) ? `Masterwork Level ${level}` : masterworkSource?.name ?? "Masterwork Level",
    semanticRole: "masterwork",
    energyCost: Number.isFinite(level) ? level : masterworkSource?.energyCost ?? ""
  } : null;
  const socketPlugs = Array.isArray(item?.socketCoverage?.plugs) ? item.socketCoverage.plugs : [];
  const sourceFor = (direct, resolved, role) => {
    if (Array.isArray(direct) && direct.length) return direct;
    if (Array.isArray(resolved) && resolved.length) return resolved;
    const rawMatches = raw.filter(plug => roleMatches(plug, role));
    return rawMatches.length ? rawMatches : socketPlugs.filter(plug => roleMatches(plug, role));
  };
  const generalSource = sourceFor(item?.generalMods, semantics.generalMods, "general-mod");
  const slotSource = sourceFor(item?.slotMods, semantics.slotMods, "slot-mod");
  const clean = rows => rows.filter(plug => plug && !isArmourTypeSymbol(plug) && !isIgnoredArmourPlug(plug));
  return [masterwork, ...clean(generalSource).slice(0, 2), ...clean(slotSource).slice(0, 3)];
}

function modTile(mod) {
  const name = mod?.name ?? mod?.displayName ?? "Empty mod slot";
  const icon = bungieIcon(mod?.icon ?? mod?.iconUrl ?? mod?.displayProperties?.icon);
  const rawCost = mod?.energyCost ?? mod?.cost ?? mod?.definition?.plug?.energyCost ?? mod?.plug?.energyCost ?? "";
  const cost = rawCost && typeof rawCost === "object"
    ? rawCost.energyCost ?? rawCost.value ?? ""
    : rawCost;
  const isMasterwork = mod?.semanticRole === "masterwork";
  const isMasterworkGold = isMasterwork && Number(cost) >= 5;
  return `<button class="gear-mod ${isMasterwork ? "is-masterwork" : ""} ${isMasterworkGold ? "is-masterwork-gold" : ""}" data-slot-role="${isMasterwork ? "masterwork" : "armour-mod"}" type="button" title="${esc(name)}" aria-label="${esc(name)}" ${cost !== "" ? `data-cost="${esc(cost)}"` : ""}>${
    icon ? `<img src="${esc(icon)}" alt="">` : isMasterwork ? '<span class="gear-masterwork-symbol" aria-hidden="true">◆</span>' : '<span class="ph-glyph">◆</span>'
  }</button>`;
}

function armourSetStrip(set) {
  if (!set) return "";
  // Missing definitions are validation telemetry, not a player-facing set bonus.
  // Render only exact Bungie set identities and perk thresholds.
  if (!set.identity || set.unresolved) return "";
  const thresholds = [set.twoPiece, set.fourPiece].filter(Boolean);
  return `<div class="armour-set-strip" title="${esc(set.identity.name ?? "Resolved armour set")}">
    <span class="armour-set-thresholds">${thresholds.map(effect => { const effectIcon = bungieIcon(effect.icon); return `<span class="armour-set-threshold ${effect.active ? "is-active" : ""}" title="${esc([`${effect.requiredSetCount}-piece`, effect.name, effect.description].filter(Boolean).join(" — "))}">${effectIcon ? `<img src="${esc(effectIcon)}" alt="${esc(effect.name ?? `${effect.requiredSetCount}-piece set perk`)}">` : ""}</span>`; }).join("")}</span>
  </div>`;
}

export function armourCard(index, item) {
  const name = item?.name ?? armourNames[index];
  const icon = bungieIcon(item?.icon ?? item?.iconUrl ?? item?.displayProperties?.icon);
  const rarity = String(item?.rarity ?? item?.tier ?? "").toLowerCase();
  const manifestExoticPerk = item?.armourSemantics?.exoticPerk ?? item?.exoticPerk ?? item?.intrinsicTrait ?? null;
  const isExotic = item?.isExotic === true || rarity.includes("exotic") || Boolean(manifestExoticPerk);
  const trait = isExotic ? manifestExoticPerk : null;
  const slotCount = 6;
  const armourTier = Number(item?.armourTier ?? item?.armourSemantics?.tier ?? item?.gearTier);
  const isTierFive = Number.isFinite(armourTier) && armourTier >= 5;
  const seasonIcon = bungieIcon(item?.releaseWatermark?.icon ?? resolveItemWatermark(item||{},item?.definition||{}).icon);
  const archetype = resolveArmourArchetype(item, armourTier);
  const mods = armourModSequence(item, armourTier, archetype);
  const archetypeIcon = bungieIcon(archetype?.icon ?? archetype?.displayProperties?.icon);
  const archetypeTitle = [archetype?.name ?? archetype?.displayName, archetype?.description].filter(Boolean).join(" — ");
  const armourSet = !isExotic ? item?.armourSemantics?.set ?? item?.setBonus ?? null : null;
  const setStrip = armourSetStrip(armourSet);
  const twoPieceActive = armourSet?.twoPiece?.active === true;
  const fourPieceActive = armourSet?.fourPiece?.active === true;
  const setBonusIcon = bungieIcon(armourSet?.identity?.icon || armourSet?.twoPiece?.icon || armourSet?.fourPiece?.icon);
  const setBonusTitle = [armourSet?.identity?.name, "Bungie armour set bonus"].filter(Boolean).join(" — ");
  const traitIcon = bungieIcon(trait?.icon ?? trait?.displayProperties?.icon);
  const traitTitle = [trait?.name ?? trait?.displayName, trait?.description].filter(Boolean).join(" — ");

  return `<article class="gear-slot ${isExotic ? "exotic" : ""} ${isTierFive ? "is-level-gold" : ""} ${armourSet?.identity ? "has-set-bonus" : ""} ${twoPieceActive ? "is-set-2-active" : ""} ${fourPieceActive ? "is-set-4-active" : ""}" data-armour-index="${index}">
    <div class="gear-slot-label">${esc(name)}</div>
    <div class="gear-arm-row">
      <div class="gear-arm-anchor">
        <div class="arm ${icon ? "" : "ph"}" tabindex="0" role="button" title="${esc(name)}">
          <span class="lv">${esc(item?.power ?? "—")}</span>${seasonIcon || Number.isFinite(armourTier) && armourTier > 0 ? `<span class="armour-tier-rail" title="${Number.isFinite(armourTier) && armourTier > 0 ? `Verified armour tier ${esc(armourTier)}` : "Bungie season/source emblem"}">${seasonIcon ? `<span class="armour-season-icon" title="Bungie season/source emblem"><img src="${esc(seasonIcon)}" alt=""></span>` : ""}${Number.isFinite(armourTier) && armourTier > 0 ? Array.from({ length: Math.min(5, Math.floor(armourTier)) }, () => '<i class="armour-tier-diamond" aria-hidden="true"></i>').join("") : ""}</span>` : ""}
          ${icon ? `<img src="${esc(icon)}" alt="">` : '<span class="ph-glyph">◇</span>'}
          ${archetypeIcon ? `<span class="armour-archetype-icon" title="${esc(archetypeTitle || "Verified armour archetype")}"><img src="${esc(archetypeIcon)}" alt="${esc(archetype?.name ?? "Armour archetype")}"></span>` : ""}

          ${setBonusIcon ? `<span class="armour-set-bonus-icon" title="${esc(setBonusTitle)}"><img src="${esc(setBonusIcon)}" alt="${esc(armourSet?.identity?.name ?? "Armour set bonus")}"></span>` : ""}
        </div>
      </div>
      ${isExotic && traitIcon ? `<div class="armour-set-strip armour-exotic-trait-strip"><span class="armour-set-thresholds"><span class="armour-set-threshold is-active" ${perkTooltipAttributes(trait,'Exotic armour trait')} data-paradox-id="${esc(trait.paradoxId||'')}" data-bungie-hash="${esc(trait.bungieHash??trait.hash??'')}"><img src="${esc(traitIcon)}" alt=""></span></span></div>` : setStrip}
    </div>
    <div class="gear-slot-divider"></div>
    <div class="gear-mods" data-slot-count="${slotCount}">${Array.from({ length: slotCount }, (_, i) => modTile(mods[i])).join("")}</div>
  </article>`;
}

export function buildGear(armour = []) {
  const gear = document.querySelector(".gear-combined");
  if (!gear) return;
  const columns = gear.querySelector(".gear-columns");
  if (!columns) return;

  columns.innerHTML = Array.from({ length: 5 }, (_, i) => armourCard(i, armour[i])).join("");

  columns.querySelectorAll(".gear-slot").forEach((slotEl, idx) => {
    const art=slotEl.querySelector(".arm");
    art?.addEventListener("click", () => openArmourDrawer(idx, armour[idx]));
    bindParadoxItemHover(art,armour[idx],"armour");
  });

  requestAnimationFrame(() => {
    syncModSizeToArtifact();
    requestAnimationFrame(syncModSizeToArtifact);
  });
}

function initialise() {
  const equip = document.querySelector(".equip");
  if (!equip) return;
  equip.classList.add("gear-layout-active");
  buildGear([]);
}

document.addEventListener("forge:guardian-selection-changed", (e) => {
  if (Array.isArray(e.detail?.armour)) buildGear(e.detail.armour);
});

window.addEventListener("resize", () => requestAnimationFrame(syncModSizeToArtifact));
initialise();
