import {mountForgeShell} from './platform-forge-shell.mjs';

/* ========================================================================== 
   ASTRIX PARADOX - GUARDIAN CHARACTER CARDS
   Renders the 3-character top ribbon (Hunter, Warlock, Titan) from either
   live Bungie roster events or loaded Paradox beta fixtures.
   ========================================================================== */

mountForgeShell({rootSelector:'.workspace',gameId:'destiny-2',gameName:'Destiny 2',developerName:'Bungie'});

const host = () => document.querySelector("#guardianCharacterCards");
const MAX_CHARACTERS = 3;

let characters = [];
let selectedCharacterId = "";

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const classLabel = (value) => String(value || "Guardian").replace(/^./, (letter) => letter.toUpperCase());

function renderStatus(message, state = "disconnected") {
  const target = host();
  if (!target) return;
  target.innerHTML = `<div class="guardian-character-cards__status is-${escapeHtml(state)}" role="status">${escapeHtml(message)}</div>`;
}

function statMarkup(stats = []) {
  const statPairs = Array.isArray(stats) && stats.length && Array.isArray(stats[0])
    ? stats
    : [];

  return statPairs
    .slice(0, 6)
    .map(([name, value, icon]) => {
      const iconMarkup = icon
        ? `<img class="guardian-stat-icon" src="${escapeHtml(icon)}" alt="" aria-hidden="true" decoding="async">`
        : `<span class="guardian-stat-icon is-unavailable" aria-hidden="true"></span>`;
      return `<span class="guardian-character-card__stat" title="${escapeHtml(name)}" aria-label="${escapeHtml(name)} ${Number(value || 0)}">${iconMarkup}<b>${Number(value || 0)}</b></span>`;
    })
    .join("");
}

function render(nextCharacters = characters, nextSelectedId = selectedCharacterId) {
  const target = host();
  if (!target) return;

  const supplied = Array.isArray(nextCharacters) ? nextCharacters.slice(0, MAX_CHARACTERS) : [];
  if (!supplied.length) {
    characters = [];
    selectedCharacterId = "";
    renderStatus("NO BUNGIE CHARACTERS AVAILABLE", "unavailable");
    return;
  }

  characters = supplied;
  selectedCharacterId = String(nextSelectedId || "");

  target.innerHTML = characters
    .map((character) => {
      const selected = Boolean(selectedCharacterId) && String(character.characterId) === selectedCharacterId;
      const emblemBackground = character.emblem?.background || character.emblem?.icon || "";
      const emblemStyle = emblemBackground
        ? ` style="--character-emblem:url('${escapeHtml(emblemBackground)}')"`
        : "";
      return `<button type="button" class="guardian-character-card${selected ? " is-selected" : ""}" data-character-id="${escapeHtml(
        character.characterId
      )}" data-class="${escapeHtml(character.characterClass)}" aria-pressed="${selected}" aria-label="Select ${escapeHtml(
        classLabel(character.characterClass)
      )}, power ${escapeHtml(character.power ?? "unavailable")}"${emblemStyle}>
        <span class="guardian-character-card__head">
          <span class="guardian-character-card__identity"><strong>${escapeHtml(classLabel(character.characterClass).toUpperCase())}</strong></span>
          <span class="guardian-character-card__power"><i aria-hidden="true">✦</i>${escapeHtml(character.power ?? "550")}</span>
        </span>
        <span class="guardian-character-card__stats">${statMarkup(character.stats)}</span>
      </button>`;
    })
    .join("");

  target.querySelectorAll("[data-character-id]").forEach((button) =>
    button.addEventListener("click", () => {
      const characterId = String(button.dataset.characterId || "");
      const characterClass = String(button.dataset.class || "");
      if (!characterId || !characterClass) return;

      target.querySelectorAll("[data-character-id]").forEach((card) => {
        const active = String(card.dataset.characterId) === characterId;
        card.classList.toggle("is-selected", active);
        card.setAttribute("aria-pressed", String(active));
      });
      selectedCharacterId = characterId;

      document.dispatchEvent(new CustomEvent("forge:character-selected", { detail: { characterId, characterClass, className: classLabel(characterClass) } }));
    })
  );
}

document.addEventListener("forge:bungie-character-roster", (event) => render(event.detail?.characters || [], event.detail?.selectedCharacterId));

document.addEventListener("forge:guardian-selection-changed", (event) => {
  const chosenId = String(event.detail?.characterId || "");
  if (!chosenId) return;

  const target = host();
  if (!target) return;

  target.querySelectorAll("[data-character-id]").forEach((card) => {
    const matches = String(card.dataset.characterId) === chosenId;
    card.classList.toggle("is-selected", matches);
    card.setAttribute("aria-pressed", String(matches));
  });
  selectedCharacterId = chosenId;
});

document.addEventListener('forge:profile-error',()=>renderStatus('BUNGIE CHARACTERS UNAVAILABLE','unavailable'));
window.addEventListener('forge:bungie-session',event=>{if(event.detail?.authenticated===false)renderStatus('CONNECT BUNGIE TO LOAD CHARACTERS','unavailable');});
renderStatus("LOADING BUNGIE CHARACTERS", "pending");

export { render as renderGuardianCharacterCards, renderStatus as renderGuardianCharacterCardStatus };
