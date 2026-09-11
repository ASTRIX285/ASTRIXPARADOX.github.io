import { bungieDefinitionHash, bungieDefinitionHashes, preparedDefinitions, preparedDefinitionTables, enrichEquipableSets, enrichOwnedWeaponDefinitions } from "./manifest-semantics.ts";

const SUBCLASS_BUCKET_HASH = 3284755031;
const WEAPON_BUCKETS = new Set([1498876634, 2465295065, 953998645]);
const GUARDIAN_STAT_HASHES = [2996146975, 392767087, 1943323491, 1735777505, 144602215, 4244567218];
const PAGE_INVENTORY_FIELDS = [
  "hash", "displayProperties", "displaySource", "sourceString",
  "itemType", "itemSubType", "itemTypeDisplayName", "itemTypeAndTierDisplayName",
  "classType", "inventory", "equippable", "collectibleHash",
  "iconWatermark", "iconWatermarkFeatured", "iconWatermarkShelved",
  "isFeaturedItem", "isHolofoil", "secondaryIcon", "screenshot",
  "defaultDamageTypeHash", "defaultDamageTypeName", "breakerTypeHash",
  "damageTypeHashes", "itemCategoryHashes", "traitIds", "traitHashes",
  "perks", "investmentStats", "plug", "tooltipNotifications",
  "equipableItemSetHash", "equippingBlock", "sockets", "stats", "quality",
  "resolvedSandboxPerks"
] as const;
const PAGE_PLUG_FIELDS = [
  "hash", "displayProperties", "displaySource", "sourceString",
  "itemType", "itemSubType", "itemTypeDisplayName", "itemTypeAndTierDisplayName",
  "classType", "inventory", "equippable", "collectibleHash",
  "iconWatermark", "iconWatermarkFeatured", "iconWatermarkShelved",
  "isFeaturedItem", "isHolofoil", "secondaryIcon", "screenshot",
  "defaultDamageTypeHash", "defaultDamageTypeName", "breakerTypeHash",
  "damageTypeHashes", "itemCategoryHashes", "traitIds", "traitHashes",
  "investmentStats", "plug", "tooltipNotifications", "equipableItemSetHash"
] as const;

type PreparedPageSemanticContext = {
  manifestVersion?: string;
  weaponDefinitionHashes?: Iterable<unknown>;
  expectedWeaponDefinitions?: number;
};

function addDefinitionHash(target: Set<number>, value: unknown): void {
  const hash = bungieDefinitionHash(value);
  if (hash !== null) target.add(hash);
}

async function resolveMissingInventoryDefinitions(
  payload: any,
  hashes: Iterable<unknown>,
  env: Env,
  manifestVersion = ""
): Promise<number[]> {
  const definitions: Record<string, Record<string, any>> = payload.definitions || (payload.definitions = {});
  const unique = bungieDefinitionHashes(hashes);
  const missing = unique.filter(hash => !definitions[String(hash)]);
  Object.assign(definitions, await preparedDefinitions("DestinyInventoryItemDefinition", missing, env, manifestVersion));
  return missing.filter(hash => !definitions[String(hash)]);
}

function equippedRows(payload: any): any[] {
  return Object.values(payload?.profile?.characterEquipment?.data || {}).flatMap((row: any) => row?.items || []);
}

function profileRows(payload: any): any[] {
  return [
    ...(payload?.profile?.profileInventory?.data?.items || []),
    ...Object.values(payload?.profile?.characterInventories?.data || {}).flatMap((row: any) => row?.items || []),
    ...equippedRows(payload)
  ];
}

function componentDefinitionHashes(payload: any, rows: any[]): Set<number> {
  const hashes = new Set<number>();
  const instances = new Set<string>();
  for (const item of rows) {
    addDefinitionHash(hashes, item?.itemHash);
    addDefinitionHash(hashes, item?.overrideStyleItemHash);
    if (item?.itemInstanceId) instances.add(String(item.itemInstanceId));
  }
  for (const [instanceId, component] of Object.entries(payload?.profile?.itemComponents?.sockets?.data || {})) {
    if (!instances.has(String(instanceId))) continue;
    for (const socket of (component as any)?.sockets || []) addDefinitionHash(hashes, socket?.plugHash);
  }
  for (const [instanceId, component] of Object.entries(payload?.profile?.itemComponents?.reusablePlugs?.data || {})) {
    if (!instances.has(String(instanceId))) continue;
    for (const plugs of Object.values((component as any)?.plugs || {})) {
      for (const plug of (plugs as any[]) || []) addDefinitionHash(hashes, plug?.plugItemHash ?? plug?.plugHash);
    }
  }
  return hashes;
}

function addExpandedDefinitionHashes(payload: any, definitions: Record<string, Record<string, any>>, hashes: Set<number>): void {
  const plugSetHashes = new Set<number>();
  for (const definition of Object.values(definitions)) {
    for (const entry of definition?.sockets?.socketEntries || []) {
      addDefinitionHash(hashes, entry?.singleInitialItemHash);
      const plugSetHash = bungieDefinitionHash(entry?.reusablePlugSetHash);
      if (plugSetHash !== null) plugSetHashes.add(plugSetHash);
    }
    for (const entry of definition?.sockets?.intrinsicSockets || []) addDefinitionHash(hashes, entry?.plugItemHash);
  }
  const plugSets = [
    payload?.profile?.profilePlugSets?.data?.plugs,
    ...Object.values(payload?.profile?.characterPlugSets?.data || {}).map((row: any) => row?.plugs)
  ];
  for (const plugSetHash of plugSetHashes) {
    for (const sets of plugSets) {
      for (const plug of sets?.[String(plugSetHash)] || []) {
        if (plug?.canInsert === false || plug?.enabled === false) continue;
        addDefinitionHash(hashes, plug?.plugItemHash ?? plug?.plugHash);
      }
    }
  }
}

function definitionHashesByField(definitions: Record<string, Record<string, any>>, field: string): number[] {
  return bungieDefinitionHashes(Object.values(definitions).map(definition => definition?.[field]));
}

async function enrichPageInventory(payload: any, env: Env, page: string, manifestVersion = ""): Promise<any> {
  if (!payload?.profile || !["character", "build-forge", "vault"].includes(page)) return payload;
  const rows = page === "character" ? equippedRows(payload) : profileRows(payload);
  const requested = componentDefinitionHashes(payload, rows);
  if (page !== "vault") {
    for (const progression of Object.values(payload.profile?.characterProgressions?.data || {}) as any[]) {
      for (const tier of progression?.seasonalArtifact?.tiers || []) {
        for (const item of tier?.items || []) addDefinitionHash(requested, item?.itemHash);
      }
    }
  }
  if (page === "build-forge") {
    for (const row of Object.values(payload.profile?.characterLoadouts?.data || {}) as any[]) {
      for (const loadout of row?.loadouts || []) {
        for (const item of [...(loadout?.items || []), ...(loadout?.subclassOverrides || [])]) {
          for (const hash of item?.plugItemHashes || []) addDefinitionHash(requested, hash);
        }
      }
    }
  }
  const instances = Object.values(payload.profile?.itemComponents?.instances?.data || {}) as any[];
  const first = await preparedDefinitionTables({
    DestinyInventoryItemDefinition: requested,
    DestinyStatDefinition: GUARDIAN_STAT_HASHES,
    DestinyDamageTypeDefinition: instances.map(row => row?.damageTypeHash),
    DestinyBreakerTypeDefinition: instances.map(row => row?.breakerTypeHash)
  }, env, manifestVersion);
  const definitions: Record<string, Record<string, any>> = payload.definitions || (payload.definitions = {});
  Object.assign(definitions, first.DestinyInventoryItemDefinition || {});
  addExpandedDefinitionHashes(payload, definitions, requested);
  const second = await preparedDefinitionTables({
    DestinyInventoryItemDefinition: [...requested].filter(hash => !definitions[String(hash)]),
    DestinySocketCategoryDefinition: Object.values(definitions).flatMap(definition => (
      definition?.sockets?.socketCategories || []
    ).map((row: any) => row?.socketCategoryHash)),
    DestinyCollectibleDefinition: definitionHashesByField(definitions, "collectibleHash"),
    DestinyDamageTypeDefinition: definitionHashesByField(definitions, "defaultDamageTypeHash"),
    DestinyBreakerTypeDefinition: definitionHashesByField(definitions, "breakerTypeHash")
  }, env, manifestVersion);
  Object.assign(definitions, second.DestinyInventoryItemDefinition || {});
  payload.statDefinitions = { ...(payload.statDefinitions || {}), ...(first.DestinyStatDefinition || {}) };
  payload.damageDefinitions = { ...(payload.damageDefinitions || {}), ...(first.DestinyDamageTypeDefinition || {}), ...(second.DestinyDamageTypeDefinition || {}) };
  payload.breakerDefinitions = { ...(payload.breakerDefinitions || {}), ...(first.DestinyBreakerTypeDefinition || {}), ...(second.DestinyBreakerTypeDefinition || {}) };
  payload.socketCategoryDefinitions = { ...(payload.socketCategoryDefinitions || {}), ...(second.DestinySocketCategoryDefinition || {}) };
  payload.collectibleDefinitions = { ...(payload.collectibleDefinitions || {}), ...(second.DestinyCollectibleDefinition || {}) };
  const unresolved = [...requested].filter(hash => !definitions[String(hash)]);
  payload.definitionCoverage = {
    requested: requested.size,
    resolved: requested.size - unresolved.length,
    unresolved,
    complete: unresolved.length === 0,
    source: "prepared-compact-page-projection"
  };
  return payload;
}

function compactPageInventoryDefinitions(payload: any): void {
  const definitions = payload?.definitions;
  if (!definitions || typeof definitions !== "object" || Array.isArray(definitions)) return;
  const ownedItemHashes = new Set<number>();
  for (const item of profileRows(payload)) {
    addDefinitionHash(ownedItemHashes, item?.itemHash);
    addDefinitionHash(ownedItemHashes, item?.overrideStyleItemHash);
  }
  payload.definitions = Object.fromEntries(Object.entries(definitions).map(([hash, definition]) => [
    hash,
    Object.fromEntries((ownedItemHashes.has(Number(hash)) ? PAGE_INVENTORY_FIELDS : PAGE_PLUG_FIELDS)
      .filter(field => (definition as any)?.[field] !== undefined)
      .map(field => [field, (definition as any)[field]]))
  ]));
  if (payload.sandboxPerks && typeof payload.sandboxPerks === "object" && !Array.isArray(payload.sandboxPerks)) {
    payload.sandboxPerks = Object.fromEntries(Object.entries(payload.sandboxPerks).map(([hash, definition]) => [
      hash,
      Object.fromEntries(["hash", "displayProperties"].filter(field => (definition as any)?.[field] !== undefined).map(field => [field, (definition as any)[field]]))
    ]));
  }
}

function compactProfilePlugRows(rows: unknown): unknown[][] {
  if (!Array.isArray(rows)) return [];
  return rows.map(row => {
    const value = row as any;
    const tuple = [
      value?.plugItemHash, value?.plugHash, value?.canInsert, value?.enabled,
      value?.isEnabled, value?.isVisible, value?.enableFailIndexes, value?.insertFailIndexes
    ];
    while (tuple.length && tuple.at(-1) === undefined) tuple.pop();
    return tuple;
  });
}

function compactPreparedProfilePlugLists(payload: any): boolean {
  const profile = payload?.profile;
  if (!profile || typeof profile !== "object") return false;
  const dictionary: unknown[][][] = [];
  const byValue = new Map<string, number>();
  let referenceCount = 0;
  let rawRowsBytes = 0;
  let dictionaryBytes = 2;
  const reference = (rows: unknown): number => {
    const compact = compactProfilePlugRows(rows);
    const key = JSON.stringify(compact);
    rawRowsBytes += JSON.stringify(rows).length;
    referenceCount += 1;
    const prior = byValue.get(key);
    if (prior !== undefined) return prior;
    const index = dictionary.length;
    dictionary.push(compact);
    byValue.set(key, index);
    dictionaryBytes += key.length + 1;
    return index;
  };
  const itemRefs: Record<string, Record<string, number>> = {};
  for (const [instanceId, component] of Object.entries(profile?.itemComponents?.reusablePlugs?.data || {})) {
    const plugs = (component as any)?.plugs || {};
    itemRefs[instanceId] = Object.fromEntries(Object.entries(plugs).map(([socketIndex, rows]) => [socketIndex, reference(rows)]));
  }
  const profileSetRefs = Object.fromEntries(Object.entries(profile?.profilePlugSets?.data?.plugs || {}).map(([setHash, rows]) => [setHash, reference(rows)]));
  const characterSetRefs = Object.fromEntries(Object.entries(profile?.characterPlugSets?.data || {}).map(([characterId, component]) => [
    characterId,
    Object.fromEntries(Object.entries((component as any)?.plugs || {}).map(([setHash, rows]) => [setHash, reference(rows)]))
  ]));
  if (!Object.keys(itemRefs).length && !Object.keys(profileSetRefs).length && !Object.keys(characterSetRefs).length) return false;
  // The live payload showed that a mostly unique plug graph can make a
  // dictionary transport larger than the Bungie component it replaces. Use
  // this transport only for genuinely repeated lists and retain the exact raw
  // component otherwise. The captured repeated account path still clears this
  // gate by a wide margin.
  const estimatedCompactBytes = dictionaryBytes + (referenceCount * 16);
  const repeatedEnough = dictionary.length <= Math.max(64, Math.floor(referenceCount / 3));
  if (!repeatedEnough || estimatedCompactBytes >= rawRowsBytes * 0.8) return false;
  profile.preparedPlugLists = { schemaVersion: 1, dictionary, itemRefs, profileSetRefs, characterSetRefs };
  if (profile.itemComponents?.reusablePlugs) profile.itemComponents.reusablePlugs.data = {};
  if (profile.profilePlugSets?.data) profile.profilePlugSets.data.plugs = {};
  if (profile.characterPlugSets?.data) {
    for (const component of Object.values(profile.characterPlugSets.data) as any[]) component.plugs = {};
  }
  return true;
}

function subclassRows(payload: any): Array<{ characterId: string; item: any }> {
  const definitions: Record<string, Record<string, any>> = payload?.definitions || {};
  const rows: Array<{ characterId: string; item: any }> = [];
  for (const source of [payload?.profile?.characterEquipment?.data, payload?.profile?.characterInventories?.data]) {
    for (const [characterId, inventory] of Object.entries(source || {})) {
      for (const item of (inventory as any)?.items || []) {
        const definition = definitions[String(item?.itemHash)];
        if (Number(item?.bucketHash ?? definition?.inventory?.bucketTypeHash) === SUBCLASS_BUCKET_HASH) rows.push({ characterId, item });
      }
    }
  }
  return rows.filter((row, index, all) => all.findIndex(other => String(other.item?.itemInstanceId || other.item?.itemHash) === String(row.item?.itemInstanceId || row.item?.itemHash)) === index);
}

async function enrichSubclassInventory(payload: any, env: Env, manifestVersion = ""): Promise<any> {
  if (!payload?.profile) return payload;
  const initialRows = subclassRows(payload);
  await resolveMissingInventoryDefinitions(payload, initialRows.map(row => row.item?.itemHash), env, manifestVersion);
  const rows = subclassRows(payload);
  const requested = new Set<number>();
  for (const { characterId, item } of rows) {
    if (!item?.itemInstanceId) continue;
    for (const socket of payload.profile?.itemComponents?.sockets?.data?.[item.itemInstanceId]?.sockets || []) {
      addDefinitionHash(requested, socket?.plugHash);
    }
    const reusable = payload.profile?.itemComponents?.reusablePlugs?.data?.[item.itemInstanceId]?.plugs || {};
    for (const plugs of Object.values(reusable)) {
      for (const row of (plugs as any[]) || []) {
        if (row?.canInsert === false || row?.enabled === false) continue;
        addDefinitionHash(requested, row?.plugItemHash ?? row?.plugHash);
      }
    }
    const definition = payload.definitions?.[String(item.itemHash)] || {};
    for (const entry of definition?.sockets?.socketEntries || []) {
      addDefinitionHash(requested, entry?.singleInitialItemHash);
      const plugSetHash = bungieDefinitionHash(entry?.reusablePlugSetHash);
      if (plugSetHash === null) continue;
      for (const plugSets of [payload.profile?.profilePlugSets?.data?.plugs, payload.profile?.characterPlugSets?.data?.[characterId]?.plugs]) {
        for (const row of plugSets?.[String(plugSetHash)] || []) {
          if (row?.canInsert === false || row?.enabled === false) continue;
          addDefinitionHash(requested, row?.plugItemHash ?? row?.plugHash);
        }
      }
    }
  }
  const unresolved = await resolveMissingInventoryDefinitions(payload, requested, env, manifestVersion);
  payload.subclassCatalogCoverage = {
    itemInstances: rows.map(row => String(row.item?.itemInstanceId || "")).filter(Boolean),
    requested: [...requested],
    resolved: [...requested].filter(hash => Boolean(payload.definitions?.[String(hash)])),
    unresolved,
    complete: unresolved.length === 0
  };
  if (payload.definitionCoverage && typeof payload.definitionCoverage === "object") {
    const remaining = bungieDefinitionHashes(Array.isArray(payload.definitionCoverage.unresolved) ? payload.definitionCoverage.unresolved : [])
      .filter(hash => !payload.definitions?.[String(hash)]);
    const requestedCount = Number(payload.definitionCoverage.requested) || 0;
    payload.definitionCoverage = {
      ...payload.definitionCoverage,
      resolved: Math.max(Number(payload.definitionCoverage.resolved) || 0, requestedCount - remaining.length),
      unresolved: remaining,
      complete: remaining.length === 0
    };
  }
  return payload;
}

async function enrichWeaponReusablePlugs(payload: any, env: Env, manifestVersion = ""): Promise<any> {
  const profile = payload?.profile;
  if (!profile) return payload;
  const definitions: Record<string, Record<string, any>> = payload.definitions || (payload.definitions = {});
  const reusableData = profile?.itemComponents?.reusablePlugs?.data || {};
  const weaponRows = equippedRows(payload).filter((item: any) => {
    const definition = definitions[String(item?.itemHash)];
    return WEAPON_BUCKETS.has(Number(definition?.inventory?.bucketTypeHash));
  });
  const requested = new Set<number>();
  const byInstance: Record<string, Record<string, number[]>> = {};
  for (const item of weaponRows) {
    if (!item?.itemInstanceId) continue;
    const plugs = reusableData[item.itemInstanceId]?.plugs || {};
    const socketMap: Record<string, number[]> = {};
    for (const [socketIndex, rows] of Object.entries(plugs)) {
      const hashes = bungieDefinitionHashes((rows as any[]).map(row => row?.plugItemHash ?? row?.plugHash));
      if (!hashes.length) continue;
      socketMap[String(socketIndex)] = [...new Set(hashes)];
      hashes.forEach(hash => requested.add(hash));
    }
    byInstance[String(item.itemInstanceId)] = socketMap;
  }
  const unresolved = await resolveMissingInventoryDefinitions(payload, requested, env, manifestVersion);
  payload.weaponReusablePlugs = byInstance;
  payload.weaponReusableCoverage = {
    requested: [...requested],
    resolved: [...requested].filter(hash => Boolean(definitions[String(hash)])),
    unresolved,
    complete: unresolved.length === 0
  };
  return payload;
}

function logManifestEvidenceGaps(payload: any, page: string): void {
  for (const gap of payload?.weaponEffectCoverage?.missingEffectDescriptions || []) {
    console.warn("manifest_effect_evidence_missing", { page, ...gap });
  }
  for (const gap of payload?.weaponEffectCoverage?.emptySandboxPerkDescriptions || []) {
    console.info("manifest_effect_evidence_fallback", { page, ...gap });
  }
  for (const hash of payload?.weaponEffectCoverage?.sandboxPerkUnresolved || []) {
    console.warn("manifest_definition_unresolved", {
      page,
      definitionType: "DestinySandboxPerkDefinition",
      hash,
      field: "ownedWeapon.definition.perks.perkHash"
    });
  }
  for (const hash of payload?.weaponDefinitionCoverage?.unresolved || []) {
    console.warn("manifest_definition_unresolved", {
      page,
      definitionType: "DestinyInventoryItemDefinition",
      hash,
      field: "ownedWeapon.socketDefinition"
    });
  }
}

async function enrichPreparedPageAccount(
  payload: any,
  env: Env,
  page: string,
  context: PreparedPageSemanticContext = {}
): Promise<any> {
  const manifestVersion = String(context.manifestVersion || "");
  await enrichPageInventory(payload, env, page, manifestVersion);
  await enrichSubclassInventory(payload, env, manifestVersion);
  if (page === "loadout" || page === "build-forge") {
    await enrichOwnedWeaponDefinitions(payload, env, context);
  }
  await enrichEquipableSets(payload, env, manifestVersion);
  await enrichWeaponReusablePlugs(payload, env, manifestVersion);
  compactPageInventoryDefinitions(payload);
  logManifestEvidenceGaps(payload, page);
  return payload;
}

export { compactPreparedProfilePlugLists, enrichPreparedPageAccount };
