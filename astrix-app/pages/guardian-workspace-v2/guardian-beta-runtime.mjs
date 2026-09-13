/* ==========================================================================
   ASTRIX PARADOX - WORKSPACE BETA RUNTIME
   Pure telemetry runtime: manages armour inspector drawer, weapon cards,
   and stat bars without 2D/3D platform or hero canvas overhead.
   ========================================================================== */

import {resolveItemWatermark} from '../../core/bungie-item-identity.mjs';

const PLAYER_POWER_CAP = 550;
const STAT_CAP = 200;

const VALID_CLASSES = ["hunter", "titan", "warlock"];
const VALID_SUBCLASSES = ["void", "solar", "arc", "stasis", "strand", "prismatic"];
const byId = (id) => document.getElementById(id);
const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const bungieAsset = (value) => {
  const path = String(value ?? "");
  if (!path) return "";
  return path.startsWith("http") ? path : `https://www.bungie.net${path.startsWith("/") ? path : `/${path}`}`;
};
const itemName = (item, fallback = "Resolved item") => String(item?.name ?? item?.displayName ?? item?.displayProperties?.name ?? item ?? fallback).trim();
const itemIcon = (item) => bungieAsset(item?.icon ?? item?.iconUrl ?? item?.displayProperties?.icon);
const itemDescription = (item) => String(item?.description ?? item?.displayProperties?.description ?? "").trim();
const itemHash = (item) => {
  const value = Number(item?.bungieHash ?? item?.hash ?? item?.itemHash);
  return Number.isInteger(value) && value > 0 ? value : null;
};

function uniqueDetailItems(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item) return false;
    const key = itemHash(item) ? `hash:${itemHash(item)}` : `name:${itemName(item).toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function paradoxIdentity(item, label) {
  if (!item) return "";
  const icon = itemIcon(item);
  return `<div class="paradox-identity-card"${itemHash(item) ? ` data-bungie-hash="${itemHash(item)}"` : ""}>
    <div class="paradox-identity-icon">${icon ? `<img src="${escapeHtml(icon)}" alt="">` : '<span aria-hidden="true">◆</span>'}</div>
    <div><small>${escapeHtml(label)}</small><b>${escapeHtml(itemName(item))}</b>${itemDescription(item) ? `<p>${escapeHtml(itemDescription(item))}</p>` : ""}</div>
  </div>`;
}

function armourDetailTile(item, label) {
  if (!item) return "";
  const icon = itemIcon(item);
  return `<div class="paradox-socket-tile"${itemHash(item) ? ` data-bungie-hash="${itemHash(item)}"` : ""} title="${escapeHtml([itemName(item), itemDescription(item)].filter(Boolean).join(" — "))}">
    <div class="paradox-socket-icon">${icon ? `<img src="${escapeHtml(icon)}" alt="">` : '<span aria-hidden="true">◆</span>'}</div>
    <small>${escapeHtml(label)}</small><b>${escapeHtml(itemName(item))}</b>
  </div>`;
}

function armourStats(item) {
  const source = item?.armourSemantics?.stats ?? item?.stats ?? {};
  const rows = Array.isArray(source)
    ? source.map((row, index) => Array.isArray(row) ? { name: row[0], value: row[1], icon: row[2], hash: row[3], order: index } : { ...row, order: index })
    : Object.entries(source).map(([hash, row], index) => ({
        ...(row && typeof row === "object" ? row : {}),
        hash: Number(hash),
        name: row?.name ?? row?.displayProperties?.name ?? "",
        icon: row?.icon ?? row?.displayProperties?.icon ?? "",
        value: row?.value ?? row,
        order: index
      }));
  return rows
    .map((row, index) => ({ ...row, name: String(row.name || `Stat ${index + 1}`), value: Number(row.value) }))
    .filter((row) => Number.isFinite(row.value));
}

function armourStatMarkup(item) {
  const rows = armourStats(item);
  if (!rows.length) return '<p class="inspector-empty">Item stats are not present in the resolved Bungie instance.</p>';
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return `<div class="paradox-stat-list">${rows.map((row) => `<div class="paradox-stat-row">
    <span>${itemIcon(row) ? `<img src="${escapeHtml(itemIcon(row))}" alt="">` : ""}${escapeHtml(row.name)}</span>
    <strong>${escapeHtml(row.value)}</strong><i><b style="width:${Math.max(0, Math.min(100, row.value))}%"></b></i>
  </div>`).join("")}<div class="paradox-stat-total"><span>TOTAL</span><strong>${total}</strong></div></div>`;
}

function armourEnergyMarkup(item) {
  const energy = item?.armourSemantics?.energy ?? item?.energy ?? null;
  const capacity = Number(energy?.capacity ?? energy?.energyCapacity);
  const used = Number(energy?.used ?? energy?.energyUsed);
  if (!Number.isFinite(capacity) || capacity < 1) return '<p class="inspector-empty">Energy capacity is not present in the resolved Bungie instance.</p>';
  const slots = Array.from({ length: Math.min(12, Math.max(1, Math.floor(capacity))) }, (_, index) => `<i class="${Number.isFinite(used) && index < used ? "is-used" : ""}" aria-hidden="true"></i>`).join("");
  return `<div class="paradox-energy"><div><b>${escapeHtml(capacity)} ENERGY</b><span>${Number.isFinite(used) ? `${escapeHtml(used)} used · ${escapeHtml(Math.max(0, capacity - used))} available` : "Usage unresolved"}</span></div><div class="paradox-energy-track" style="--energy-capacity:${Math.min(12, Math.floor(capacity))}">${slots}</div></div>`;
}

function armourModItems(item) {
  const semantics = item?.armourSemantics ?? {};
  const resolved = [semantics.masterwork ?? item?.masterwork, ...(semantics.generalMods ?? item?.generalMods ?? []), ...(semantics.slotMods ?? item?.slotMods ?? [])];
  const fallback = Array.isArray(item?.mods) ? item.mods.filter((plug) => !/infus|exotic[\s._-]*(armou?r[\s._-]*)?(intrinsic|perk)|archetype/i.test([plug?.semanticRole, itemName(plug), plug?.definition?.plug?.plugCategoryIdentifier].filter(Boolean).join(" "))) : [];
  return uniqueDetailItems([...resolved, ...fallback]);
}

function armourCosmeticItems(item) {
  return uniqueDetailItems([item?.shader, item?.ornament, item?.defaultAppearance].filter((entry) => entry && (typeof entry !== "string" || entry.trim())));
}

const previewStats = [
  ["Mobility", 100],
  ["Resilience", 42],
  ["Recovery", 70],
  ["Discipline", 101],
  ["Intellect", 28],
  ["Strength", 38]
];

const workspaceState = {
  characterId: null,
  characterClass: "hunter",
  subclass: "void",
  power: PLAYER_POWER_CAP,
  stats: null,
  weapons: [],
  armour: []
};

function normaliseSelection(detail = {}) {
  const characterClass = String(detail.characterClass ?? detail.className ?? detail.classType ?? workspaceState.characterClass).toLowerCase();
  const subclass = String(detail.subclass ?? workspaceState.subclass).toLowerCase();
  if (!VALID_CLASSES.includes(characterClass) || !VALID_SUBCLASSES.includes(subclass)) return null;
  return { ...workspaceState, ...detail, characterClass, subclass };
}

function setStageState(title, message = "") {
  const titleEl = byId("stageStateTitle");
  const msgEl = byId("stageStateMessage");
  if (titleEl && title) titleEl.textContent = title;
  if (msgEl && message) msgEl.innerHTML = message;
}

function renderStats(stats) {
  const values = Array.isArray(stats) && stats.length ? stats : previewStats;
  const target = byId("statsRow");
  if (!target) return;

  const total = values.reduce((sum, [, value]) => sum + Number(value || 0), 0);
  target.innerHTML =
    values
      .map(
        ([name, value]) =>
          `<div class="st"><span class="nm">${escapeHtml(name)}</span><span class="bar"><i style="width:${Math.min(
            100,
            (Number(value || 0) / STAT_CAP) * 100
          )}%"></i></span><span class="v">${Number(value || 0)}</span></div>`
      )
      .join("") + `<div class="st total"><span class="nm">Total</span><span></span><span class="v">${total}</span></div>`;
}

function renderWeapons(weapons = []) {
  const cards = Array.from(document.querySelectorAll(".weap-grid .weap"));
  if (!cards.length) return;

  const slotOrder = { Kinetic: 0, Special: 0, Primary: 1, Energy: 1, Power: 2, Heavy: 2 };
  const ordered = [null, null, null];

  weapons.forEach((weapon, index) => {
    const ammo = String(weapon?.ammoType ?? "");
    let slot = slotOrder[ammo];
    if (!Number.isInteger(slot)) slot = Math.min(index, 2);
    while (slot < 3 && ordered[slot]) slot++;
    if (slot < 3) ordered[slot] = weapon;
  });

  cards.forEach((card, index) => {
    const weapon = ordered[index];
    const art = card.querySelector(".art");
    const name = card.querySelector(".cap b");
    const meta = card.querySelector(".cap small");

    if (!weapon) {
      if (art) {
        art.classList.add("ph");
        art.innerHTML = '<span class="pw">—</span><span class="ph-glyph">⌖</span>';
      }
      if (meta) meta.textContent = "awaiting build data";
      return;
    }

    if (art) {
      art.classList.remove("ph");
      const icon = weapon.icon
        ? `<img src="${escapeHtml(weapon.icon)}" alt="${escapeHtml(weapon.name || "Weapon")}" onerror="this.style.display='none'">`
        : '<span class="ph-glyph">⌖</span>';
      art.innerHTML = `<span class="pw">${escapeHtml(String(weapon.power ?? ""))}</span>${icon}`;
    }

    if (name) name.textContent = weapon.name || "Unknown weapon";
    if (meta) {
      const details = [weapon.weaponType, weapon.element, weapon.ammoType].filter(Boolean);
      meta.textContent = details.join(" · ") || "Bungie identity resolved";
    }
    card.title = [weapon.name, weapon.weaponType, weapon.element, weapon.ammoType].filter(Boolean).join(" — ");
  });
}

function createArmourDrawer() {
  if (byId("armourDrawer")) return;
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="armour-drawer-backdrop" data-close-drawer hidden></div>
     <aside class="armour-drawer paradox-item-shell" id="armourDrawer" aria-hidden="true" hidden>
       <button class="armour-drawer-close" type="button" data-close-drawer aria-label="Close armour inspector">✕</button>
       <article class="paradox-item-card paradox-item-card--armour" data-item-kind="armour">
       <header class="paradox-item-header armour-drawer-head">
         <div class="weapon-detail-icon" id="armourDrawerIcon"></div>
         <div class="paradox-item-identity"><span class="paradox-kicker">PARADOX ARMOUR MODEL</span><h2 id="armourDrawerTitle">Armour slot</h2><p id="armourDrawerType">Armour</p></div>
         <div class="weapon-detail-power"><small>POWER</small><b id="armourDrawerPower">—</b></div>
       </header>
       <div class="armour-drawer-tabs paradox-card-tabs" role="tablist">
         <button class="armour-tab" data-tab="build" aria-selected="true">OVERVIEW</button>
         <button class="armour-tab" data-tab="appearance" aria-selected="false">APPEARANCE</button>
         <button class="armour-tab" data-tab="mods" aria-selected="false">MODS</button>
       </div>
       <section class="armour-panel active" data-panel="build"></section>
       <section class="armour-panel" data-panel="appearance"></section>
       <section class="armour-panel" data-panel="mods"></section>
       </article>
     </aside>`
  );

  document.querySelectorAll("[data-close-drawer]").forEach((el) => el.addEventListener("click", closeArmourDrawer));
  document.querySelectorAll(".armour-tab").forEach((tab) =>
    tab.addEventListener("click", () => {
      document.querySelectorAll(".armour-tab").forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
      document.querySelectorAll(".armour-panel").forEach((p) => p.classList.toggle("active", p.dataset.panel === tab.dataset.tab));
    })
  );
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeArmourDrawer();
  });
}

export function openArmourDrawer(index, item) {
  const names = ["Helmet", "Gauntlets", "Chest Armour", "Leg Armour", "Class Item"];
  const resolved = item || null;
  byId("armourDrawerTitle").textContent = resolved?.name || names[index] || "Armour";
  byId("armourDrawerType").textContent = resolved?.itemTypeDisplayName || names[index] || "Armour";
  byId("armourDrawerPower").textContent = resolved?.power ?? "—";
  const resolvedIcon = itemIcon(resolved);
  const release=resolveItemWatermark(resolved||{},resolved?.definition||{});
  byId("armourDrawerIcon").innerHTML = resolvedIcon ? `<img src="${escapeHtml(resolvedIcon)}" alt="">${release.icon?`<img class="paradox-release-watermark" src="${escapeHtml(release.icon)}" data-watermark-source="${escapeHtml(release.source)}" alt="Release watermark">`:''}` : '<span class="ph-glyph" aria-hidden="true">◇</span>';
  const fallback = '<div class="inspector-empty">Awaiting exact Bungie character and inventory data.</div>';
  const semantics = resolved?.armourSemantics ?? {};
  const exoticPerk = semantics.exoticPerk ?? resolved?.exoticPerk ?? resolved?.intrinsicTrait ?? null;
  const archetype = semantics.archetype ?? resolved?.archetype ?? null;
  const set = semantics.set ?? resolved?.setBonus ?? null;
  const identities = [
    paradoxIdentity(archetype, "ARMOUR ARCHETYPE"),
    paradoxIdentity(exoticPerk, "EXOTIC ARMOUR TRAIT"),
    paradoxIdentity(set?.identity, "ARMOUR SET"),
    paradoxIdentity(set?.twoPiece, "2-PIECE SET PERK"),
    paradoxIdentity(set?.fourPiece, "4-PIECE SET PERK")
  ].filter(Boolean).join("");
  const mods = resolved ? armourModItems(resolved) : [];
  const cosmetics = resolved ? armourCosmeticItems(resolved) : [];

  document.querySelector('[data-panel="build"]').innerHTML = resolved
    ? `<div class="paradox-card-body">
        <section class="paradox-section paradox-section--stats"><h3>ARMOUR STATS</h3>${armourStatMarkup(resolved)}</section>
        <section class="paradox-section paradox-section--energy"><h3>ENERGY</h3>${armourEnergyMarkup(resolved)}</section>
        <section class="paradox-section paradox-section--traits"><h3>ARCHETYPE &amp; TRAITS</h3>${identities || '<p class="inspector-empty">No resolved archetype or trait evidence.</p>'}</section>
       </div>`
    : fallback;
  document.querySelector('[data-panel="appearance"]').innerHTML = resolved
    ? `<div class="paradox-card-body"><section class="paradox-section"><h3>ARMOUR COSMETICS</h3><div class="paradox-socket-grid">${cosmetics.map((entry, cosmeticIndex) => armourDetailTile(entry, cosmeticIndex === 0 ? "Shader" : "Ornament")).join("") || '<p class="inspector-empty">No resolved shader or ornament evidence.</p>'}</div></section></div>`
    : fallback;
  document.querySelector('[data-panel="mods"]').innerHTML = mods.length
    ? `<div class="paradox-card-body"><section class="paradox-section"><div class="paradox-section-heading"><h3>ARMOUR MODS</h3><span>MASTERWORK · 2 GENERAL · 3 SLOT</span></div><div class="paradox-socket-grid">${mods.map((mod, modIndex) => armourDetailTile(mod, modIndex === 0 && /masterwork/i.test([mod?.semanticRole, itemName(mod)].join(" ")) ? "Masterwork" : "Armour mod")).join("")}</div></section></div>`
    : fallback;

  document.querySelectorAll(".armour-tab").forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.tab === "build")));
  document.querySelectorAll(".armour-panel").forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === "build"));

  document.body.classList.add("armour-drawer-open");
  document.querySelector(".armour-drawer-backdrop")?.removeAttribute("hidden");
  byId("armourDrawer")?.removeAttribute("hidden");
  byId("armourDrawer")?.setAttribute("aria-hidden", "false");
}

export function closeArmourDrawer() {
  document.body.classList.remove("armour-drawer-open");
  document.querySelector(".armour-drawer-backdrop")?.setAttribute("hidden", "");
  byId("armourDrawer")?.setAttribute("aria-hidden", "true");
  byId("armourDrawer")?.setAttribute("hidden", "");
}

function applyGuardianSelection(detail) {
  const next = normaliseSelection(detail);
  if (!next) return;
  Object.assign(workspaceState, next);

  if (next.power != null) document.querySelectorAll("[data-power-cap]").forEach((el) => (el.textContent = next.power));
  if (next.stats) renderStats(next.stats);
  if (Array.isArray(next.weapons)) renderWeapons(next.weapons);

  setStageState("GUARDIAN PROFILE ACTIVE", `${next.className ? next.className.toUpperCase() : "GUARDIAN"} · ${next.subclassName ? next.subclassName.toUpperCase() : "SUBCLASS"}`);
}

document.addEventListener("forge:guardian-selection-changed", (event) => {
  try {
    applyGuardianSelection(event.detail);
  } catch (error) {
    console.error("[Forge Guardian render]", error);
  }
});

createArmourDrawer();
renderStats(previewStats);

document.dispatchEvent(new CustomEvent("forge:guardian-workspace-ready", { detail: { version: "0.2.0-beta" } }));
