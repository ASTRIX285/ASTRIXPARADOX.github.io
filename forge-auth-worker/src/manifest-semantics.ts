const MAX_BUNGIE_DEFINITION_HASH = 0xffffffff;
const WEAPON_BUCKET_HASHES = new Set([1498876634, 2465295065, 953998645]);

function bungieDefinitionHash(value: unknown): number | null {
  const hash = Number(value);
  return Number.isInteger(hash) && hash > 0 && hash <= MAX_BUNGIE_DEFINITION_HASH ? hash : null;
}

function bungieDefinitionHashes(values: Iterable<unknown>): number[] {
  return [...new Set([...values].map(bungieDefinitionHash).filter((hash): hash is number => hash !== null))];
}

async function preparedDefinitions(definitionType: string, hashes: Iterable<unknown>, env: Env): Promise<Record<string, Record<string, any>>> {
  const unique = bungieDefinitionHashes(hashes);
  if (!env.MANIFEST_DATA || !unique.length) return {};
  const statusResponse = await env.MANIFEST_DATA.fetch(new Request("https://manifest/status")).catch(() => null);
  const status = statusResponse?.ok ? await statusResponse.json<{ manifestVersion?: string }>().catch(() => null) : null;
  if (!status?.manifestVersion) return {};
  const response = await env.MANIFEST_DATA.fetch(new Request("https://manifest/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: status.manifestVersion, requests: { [definitionType]: unique } })
  })).catch(() => null);
  const payload = response?.ok
    ? await response.json<{ manifestVersion?: string; tables?: Record<string, Record<string, Record<string, any>>> }>().catch(() => null)
    : null;
  return payload?.manifestVersion === status.manifestVersion ? (payload.tables?.[definitionType] || {}) : {};
}

async function manifestDefinition(
  definitionType: string,
  hash: number,
  env: Env
): Promise<Record<string, any> | null> {
  if (bungieDefinitionHash(hash) === null) return null;
  const prepared = await preparedDefinitions(definitionType, [hash], env);
  return prepared[String(hash)] || null;
}

function preparedAccountPayload(payload: any): any {
  return payload?.transport === "prepared-page-stream-v1" && payload?.account
    ? payload.account
    : payload;
}

function profileItemRows(profile: any): any[] {
  return [
    ...(profile?.profileInventory?.data?.items || []),
    ...Object.values(profile?.characterInventories?.data || {}).flatMap((row: any) => row?.items || []),
    ...Object.values(profile?.characterEquipment?.data || {}).flatMap((row: any) => row?.items || [])
  ];
}

async function enrichOwnedWeaponDefinitions(payload: any, env: Env): Promise<any> {
  const account = preparedAccountPayload(payload);
  if (!account?.profile) return payload;
  const definitions: Record<string, Record<string, any>> = account.definitions || (account.definitions = {});
  const allItems = profileItemRows(account.profile);
  const preparedWeaponHashes = new Set(bungieDefinitionHashes(
    payload?.prepared?.weaponDefinitionHashes || payload?.weaponDefinitionHashes || []
  ));
  const expectedWeaponDefinitions = Number(payload?.prepared?.loadoutCoverage?.weaponDefinitions ?? payload?.loadoutCoverage?.weaponDefinitions);
  const hasPreparedWeaponIndex = Number.isInteger(expectedWeaponDefinitions) && expectedWeaponDefinitions >= 0;
  const weaponIndexComplete = hasPreparedWeaponIndex
    ? preparedWeaponHashes.size > 0 && expectedWeaponDefinitions === preparedWeaponHashes.size
    : account.definitionCoverage?.complete === true;
  const uniqueWeapons = new Map<string, any>();
  for (const item of allItems) {
    const itemHash = bungieDefinitionHash(item?.itemHash);
    const itemDefinition = definitions[String(item?.itemHash)];
    const isWeapon = itemHash !== null && (
      preparedWeaponHashes.has(itemHash)
      || WEAPON_BUCKET_HASHES.has(Number(itemDefinition?.inventory?.bucketTypeHash))
      || WEAPON_BUCKET_HASHES.has(Number(item?.bucketHash))
    );
    if (!isWeapon) continue;
    const instanceId = String(item?.itemInstanceId || "");
    if (instanceId && !uniqueWeapons.has(instanceId)) uniqueWeapons.set(instanceId, item);
  }
  const socketData = account.profile?.itemComponents?.sockets?.data || {};
  const requested = new Set<number>();
  const missingSocketInstances: string[] = [];
  for (const [instanceId, item] of uniqueWeapons) {
    const itemHash = bungieDefinitionHash(item?.itemHash);
    const styleHash = bungieDefinitionHash(item?.overrideStyleItemHash);
    if (itemHash !== null) requested.add(itemHash);
    if (styleHash !== null) requested.add(styleHash);
    const socketRow = socketData[instanceId];
    if (!socketRow || !Array.isArray(socketRow.sockets)) {
      missingSocketInstances.push(instanceId);
      continue;
    }
    for (const socket of socketRow.sockets) {
      const plugHash = bungieDefinitionHash(socket?.plugHash);
      if (plugHash !== null) requested.add(plugHash);
    }
  }
  Object.assign(definitions, await preparedDefinitions(
    "DestinyInventoryItemDefinition",
    [...requested].filter(hash => !definitions[String(hash)]),
    env
  ));
  // Bungie's fixed weapon effect can live on the initial intrinsic socket even
  // when the instance socket row is absent. Resolve that real manifest mapping
  // instead of falling back to the item's often empty SandboxPerk row.
  const intrinsicEvidence = new Map<number, number>();
  for (const item of uniqueWeapons.values()) {
    const itemHash = bungieDefinitionHash(item?.itemHash);
    const itemDefinition = itemHash === null ? null : definitions[String(itemHash)];
    const intrinsicHash = bungieDefinitionHash(itemDefinition?.sockets?.socketEntries?.[0]?.singleInitialItemHash);
    if (itemHash !== null && intrinsicHash !== null) {
      requested.add(intrinsicHash);
      intrinsicEvidence.set(itemHash, intrinsicHash);
    }
  }
  Object.assign(definitions, await preparedDefinitions(
    "DestinyInventoryItemDefinition",
    [...requested].filter(hash => !definitions[String(hash)]),
    env
  ));
  const sandboxPerkHashes = bungieDefinitionHashes([...uniqueWeapons.values()].flatMap(item => {
    const itemHash = bungieDefinitionHash(item?.itemHash);
    return itemHash === null ? [] : (definitions[String(itemHash)]?.perks || []).map((perk: any) => perk?.perkHash);
  }));
  const sandboxPerks: Record<string, Record<string, any>> = account.sandboxPerks || (account.sandboxPerks = {});
  Object.assign(sandboxPerks, await preparedDefinitions(
    "DestinySandboxPerkDefinition",
    sandboxPerkHashes.filter(hash => !sandboxPerks[String(hash)]),
    env
  ));
  for (const item of uniqueWeapons.values()) {
    const itemHash = bungieDefinitionHash(item?.itemHash);
    if (itemHash === null) continue;
    const itemDefinition = definitions[String(itemHash)];
    if (!itemDefinition) continue;
    itemDefinition.resolvedSandboxPerks = (itemDefinition.perks || [])
      .map((perk: any) => sandboxPerks[String(perk?.perkHash)])
      .filter(Boolean);
  }
  const unresolved = [...requested].filter(hash => !definitions[String(hash)]);
  const missingEffectDescriptions = [...intrinsicEvidence].map(([itemHash, plugHash]) => {
    const definition = definitions[String(plugHash)];
    const description = String(definition?.displayProperties?.description || "").trim();
    return description ? null : {
      itemHash,
      plugHash,
      field: "DestinyInventoryItemDefinition.displayProperties.description",
      reason: definition ? "empty-description" : "definition-unresolved"
    };
  }).filter(Boolean);
  const emptySandboxPerkDescriptions = sandboxPerkHashes.map(perkHash => {
    const definition = sandboxPerks[String(perkHash)];
    if (!definition || String(definition?.displayProperties?.description || "").trim()) return null;
    const itemHash = [...uniqueWeapons.values()].map(item => bungieDefinitionHash(item?.itemHash)).find(hash => (
      hash !== null && (definitions[String(hash)]?.perks || []).some((perk: any) => Number(perk?.perkHash) === perkHash)
    ));
    return {
      itemHash: itemHash ?? null,
      perkHash,
      field: "DestinySandboxPerkDefinition.displayProperties.description",
      reason: "empty-description",
      fallbackPlugHash: typeof itemHash !== "number" ? null : intrinsicEvidence.get(itemHash) ?? null
    };
  }).filter(Boolean);
  account.weaponDefinitionCoverage = {
    itemInstances: [...uniqueWeapons.keys()],
    requested: [...requested],
    resolved: [...requested].filter(hash => Boolean(definitions[String(hash)])),
    unresolved,
    missingSocketInstances,
    schemaVersion: 1,
    source: "prepared-owned-weapon-definitions",
    indexDefinitions: preparedWeaponHashes.size,
    complete: weaponIndexComplete && unresolved.length === 0 && missingSocketInstances.length === 0
  };
  account.weaponEffectCoverage = {
    schemaVersion: 1,
    source: "bungie-fixed-intrinsic-socket-and-sandbox-perk",
    intrinsicEvidence: Object.fromEntries([...intrinsicEvidence].map(([itemHash, plugHash]) => [String(itemHash), plugHash])),
    sandboxPerkRequested: sandboxPerkHashes,
    sandboxPerkUnresolved: sandboxPerkHashes.filter(hash => !sandboxPerks[String(hash)]),
    missingEffectDescriptions,
    emptySandboxPerkDescriptions,
    complete: missingEffectDescriptions.length === 0
  };
  return payload;
}

function equipableSetHash(itemDefinition: Record<string, any>): number | null {
  const value = itemDefinition?.equipableItemSetHash ?? itemDefinition?.equippingBlock?.equipableItemSetHash;
  return bungieDefinitionHash(value);
}

async function enrichEquipableSets(payload: any, env: Env): Promise<any> {
  if (payload?.transport === "prepared-page-stream-v1") {
    if (payload.account?.definitions) await enrichEquipableSets(payload.account, env);
    return payload;
  }
  const inventory = payload?.definitions || {};
  const setHashes = [...new Set(
    Object.values(inventory)
      .map((definition: any) => equipableSetHash(definition))
      .filter((hash): hash is number => Number.isInteger(hash))
  )];
  if (!setHashes.length) {
    payload.equipableItemSets = payload.equipableItemSets || {};
    payload.sandboxPerks = payload.sandboxPerks || {};
    return payload;
  }

  const sets: Record<string, Record<string, any>> = { ...(payload.equipableItemSets || {}) };
  Object.assign(sets, await preparedDefinitions("DestinyEquipableItemSetDefinition", setHashes.filter(hash => !sets[String(hash)]), env));

  const perkHashes = bungieDefinitionHashes(
    Object.values(sets).flatMap((set: any) => (set?.setPerks || []).map((perk: any) => perk?.sandboxPerkHash))
  );
  const sandboxPerks: Record<string, Record<string, any>> = { ...(payload.sandboxPerks || {}) };
  Object.assign(sandboxPerks, await preparedDefinitions("DestinySandboxPerkDefinition", perkHashes.filter(hash => !sandboxPerks[String(hash)]), env));

  payload.equipableItemSets = sets;
  payload.sandboxPerks = sandboxPerks;
  payload.armourSetCoverage = {
    requested: setHashes,
    resolved: setHashes.filter(hash => Boolean(sets[String(hash)])),
    unresolved: setHashes.filter(hash => !sets[String(hash)]),
    perkRequested: perkHashes,
    perkResolved: perkHashes.filter(hash => Boolean(sandboxPerks[String(hash)])),
    perkUnresolved: perkHashes.filter(hash => !sandboxPerks[String(hash)]),
    complete: setHashes.every(hash => Boolean(sets[String(hash)])) && perkHashes.every(hash => Boolean(sandboxPerks[String(hash)]))
  };
  return payload;
}

export { bungieDefinitionHash, bungieDefinitionHashes, manifestDefinition, preparedDefinitions, equipableSetHash, enrichEquipableSets, enrichOwnedWeaponDefinitions };
