async function preparedDefinitions(definitionType: string, hashes: Iterable<number>, env: Env): Promise<Record<string, Record<string, any>>> {
  const unique = [...new Set([...hashes].map(Number).filter(Number.isInteger))];
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
  if (!Number.isInteger(hash)) return null;
  const prepared = await preparedDefinitions(definitionType, [hash], env);
  return prepared[String(hash)] || null;
}

function equipableSetHash(itemDefinition: Record<string, any>): number | null {
  const value = itemDefinition?.equipableItemSetHash ?? itemDefinition?.equippingBlock?.equipableItemSetHash;
  const hash = Number(value);
  return Number.isInteger(hash) && hash > 0 ? hash : null;
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

  const perkHashes = [...new Set(
    Object.values(sets).flatMap((set: any) => (set?.setPerks || [])
      .map((perk: any) => Number(perk?.sandboxPerkHash))
      .filter(Number.isInteger))
  )];
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

export { manifestDefinition, preparedDefinitions, equipableSetHash, enrichEquipableSets };
