/*
 * Forge Destiny backend local game data fallback.
 *
 * Purpose:
 *   Bungie remains the live-state source (character, equipment, socket hashes).
 *   This resolver fills ONLY definitions that Bungie's manifest hydration did
 *   not return, using the verified Forge game components dataset keyed by
 *   bungieHash.
 *
 * Production target: astrix-destiny-backend (auth.astrixparadox.com)
 * Do NOT wire this into the separate generic forge-worker.
 */

const DEFAULT_GAME_COMPONENTS_URL =
  "https://astrixparadox.com/astrix-app/data/game-components.json";

const PLUG_CATEGORY_BY_COMPONENT_TYPE = Object.freeze({
  super: "supers",
  aspect: "aspects",
  fragment: "fragments",
  grenade: "grenades",
  melee: "melee",
  classAbility: "class_abilities",
  movementAbility: "movement",
  subclass: "subclass",
  artifactPerk: "artifact_perks"
});

let componentIndexPromise = null;

function normaliseHash(hash) {
  const value = Number(hash);
  return Number.isInteger(value) && value > 0 ? String(value >>> 0) : "";
}

function componentToBungieDefinition(component) {
  if (!component) return null;

  const hash = Number(component.bungieHash);
  if (!Number.isInteger(hash) || hash <= 0) return null;

  const official = component.official || {};
  const componentType = String(component.componentType || "");
  const plugCategoryIdentifier =
    PLUG_CATEGORY_BY_COMPONENT_TYPE[componentType] || componentType || "forge_component";

  return {
    hash,
    displayProperties: {
      name: String(component.name || `Destiny component ${hash}`),
      description: String(component.officialDescription || ""),
      icon: String(component.icon || "")
    },
    itemType: Number.isInteger(official.itemType) ? official.itemType : 0,
    itemSubType: Number.isInteger(official.itemSubType) ? official.itemSubType : 0,
    itemTypeDisplayName: String(official.itemTypeDisplayName || componentType || ""),
    itemCategoryHashes: Array.isArray(official.itemCategoryHashes)
      ? official.itemCategoryHashes
      : [],
    traitIds: Array.isArray(official.traitIds) ? official.traitIds : [],
    sockets: official.sockets ?? null,
    plug: {
      plugCategoryIdentifier
    },
    _forge: {
      source: "game-components",
      componentType,
      class: component.class || "Unknown",
      subclass: component.subclass ?? null,
      verified: component.verified === true
    }
  };
}

async function fetchGameComponents(env = {}) {
  const url = String(env.FORGE_GAME_COMPONENTS_URL || DEFAULT_GAME_COMPONENTS_URL);
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cf: { cacheEverything: true, cacheTtl: 3600 }
  });

  if (!response.ok) {
    throw new Error(`forge_game_components_fetch_failed:${response.status}`);
  }

  const payload = await response.json();
  if (!payload || !Array.isArray(payload.components)) {
    throw new Error("forge_game_components_invalid_payload");
  }

  return payload.components;
}

async function getComponentIndex(env = {}) {
  if (!componentIndexPromise) {
    componentIndexPromise = fetchGameComponents(env)
      .then((components) => {
        const index = new Map();
        for (const component of components) {
          const key = normaliseHash(component?.bungieHash);
          if (!key) continue;
          index.set(key, component);
        }
        return index;
      })
      .catch((error) => {
        componentIndexPromise = null;
        throw error;
      });
  }

  return componentIndexPromise;
}

/**
 * Resolve only hashes that are missing from the Bungie definitions object.
 * Existing Bungie definitions always win.
 */
async function hydrateMissingDefinitionsFromForge(
  hashes,
  bungieDefinitions = {},
  env = {}
) {
  const merged = { ...(bungieDefinitions || {}) };
  const requested = [...new Set((hashes || []).map(normaliseHash).filter(Boolean))];
  const missing = requested.filter((hash) => !merged[hash]);

  if (!missing.length) {
    return {
      definitions: merged,
      coverage: {
        requested: requested.length,
        bungieResolved: requested.length,
        forgeResolved: 0,
        unresolved: []
      }
    };
  }

  let index;
  try {
    index = await getComponentIndex(env);
  } catch (error) {
    console.warn("forge_game_component_resolver_unavailable", {
      error: String(error)
    });
    return {
      definitions: merged,
      coverage: {
        requested: requested.length,
        bungieResolved: requested.length - missing.length,
        forgeResolved: 0,
        unresolved: missing
      }
    };
  }

  let forgeResolved = 0;
  for (const hash of missing) {
    const component = index.get(hash);
    const definition = componentToBungieDefinition(component);
    if (!definition) continue;
    merged[hash] = definition;
    forgeResolved += 1;
  }

  return {
    definitions: merged,
    coverage: {
      requested: requested.length,
      bungieResolved: requested.length - missing.length,
      forgeResolved,
      unresolved: requested.filter((hash) => !merged[hash])
    }
  };
}

export {
  componentToBungieDefinition,
  getComponentIndex,
  hydrateMissingDefinitionsFromForge,
  normaliseHash
};
