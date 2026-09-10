import worker, { AuthRecord } from "./index";
import { bungieDefinitionHash, bungieDefinitionHashes, preparedDefinitions, enrichEquipableSets, enrichOwnedWeaponDefinitions } from "./manifest-semantics";
export { AuthRecord };

const SUBCLASS_BUCKET_HASH = 3284755031;
const WEAPON_BUCKETS = new Set([1498876634, 2465295065, 953998645]);

function definitionCategory(definition: Record<string, any> | undefined): string {
  return String(definition?.plug?.plugCategoryIdentifier || "").toLowerCase();
}

function isSuperDefinition(definition: Record<string, any> | undefined): boolean {
  const category = definitionCategory(definition);
  return category === "super" || category === "supers" || category.includes("super");
}

function addDefinitionHash(target: Set<number>, value: unknown): void {
  const hash = bungieDefinitionHash(value);
  if (hash !== null) target.add(hash);
}

async function resolveMissingInventoryDefinitions(payload: any, hashes: Iterable<unknown>, env: Env): Promise<number[]> {
  const definitions: Record<string, Record<string, any>> = payload.definitions || (payload.definitions = {});
  const unique = bungieDefinitionHashes(hashes);
  const missing = unique.filter(hash => !definitions[String(hash)]);
  Object.assign(definitions, await preparedDefinitions("DestinyInventoryItemDefinition", missing, env));
  return missing.filter(hash => !definitions[String(hash)]);
}

function equippedRows(payload: any): any[] {
  return Object.values(payload?.profile?.characterEquipment?.data || {}).flatMap((row: any) => row?.items || []);
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

async function enrichSubclassInventory(payload: any, env: Env): Promise<any> {
  const account = payload?.transport === "prepared-page-stream-v1" && payload?.account
    ? payload.account
    : payload;
  if (!account?.profile) return payload;
  const initialRows = subclassRows(account);
  await resolveMissingInventoryDefinitions(account, initialRows.map(row => row.item?.itemHash), env);
  const rows = subclassRows(account);
  const requested = new Set<number>();
  for (const { characterId, item } of rows) {
    if (!item?.itemInstanceId) continue;
    for (const socket of account.profile?.itemComponents?.sockets?.data?.[item.itemInstanceId]?.sockets || []) {
      addDefinitionHash(requested, socket?.plugHash);
    }
    const reusable = account.profile?.itemComponents?.reusablePlugs?.data?.[item.itemInstanceId]?.plugs || {};
    for (const plugs of Object.values(reusable)) {
      for (const row of (plugs as any[]) || []) {
        if (row?.canInsert === false || row?.enabled === false) continue;
        addDefinitionHash(requested, row?.plugItemHash ?? row?.plugHash);
      }
    }
    const definition = account.definitions?.[String(item.itemHash)] || {};
    for (const entry of definition?.sockets?.socketEntries || []) {
      addDefinitionHash(requested, entry?.singleInitialItemHash);
      const plugSetHash = bungieDefinitionHash(entry?.reusablePlugSetHash);
      if (plugSetHash === null) continue;
      for (const plugSets of [account.profile?.profilePlugSets?.data?.plugs, account.profile?.characterPlugSets?.data?.[characterId]?.plugs]) {
        for (const row of plugSets?.[String(plugSetHash)] || []) {
          if (row?.canInsert === false || row?.enabled === false) continue;
          addDefinitionHash(requested, row?.plugItemHash ?? row?.plugHash);
        }
      }
    }
  }
  const unresolved = await resolveMissingInventoryDefinitions(account, requested, env);
  account.subclassCatalogCoverage = {
    itemInstances: rows.map(row => String(row.item?.itemInstanceId || "")).filter(Boolean),
    requested: [...requested],
    resolved: [...requested].filter(hash => Boolean(account.definitions?.[String(hash)])),
    unresolved,
    complete: unresolved.length === 0
  };
  if (account.definitionCoverage && typeof account.definitionCoverage === "object") {
    const remaining = bungieDefinitionHashes(Array.isArray(account.definitionCoverage.unresolved) ? account.definitionCoverage.unresolved : [])
      .filter((hash: number) => !account.definitions?.[String(hash)]);
    const requestedCount = Number(account.definitionCoverage.requested) || 0;
    account.definitionCoverage = {
      ...account.definitionCoverage,
      resolved: Math.max(Number(account.definitionCoverage.resolved) || 0, requestedCount - remaining.length),
      unresolved: remaining,
      complete: remaining.length === 0
    };
    if (account.definitionCoverage.complete === true && account.pageReady?.coverage) {
      const missing = (Array.isArray(account.pageReady.coverage.missing) ? account.pageReady.coverage.missing : [])
        .filter((value: unknown) => value !== "owned-item-definitions");
      account.pageReady = {...account.pageReady, coverage: {complete: missing.length === 0, missing}};
    }
  }
  return payload;
}

async function enrichWeaponReusablePlugs(payload: any, env: Env): Promise<any> {
  const account = payload?.transport === "prepared-page-stream-v1" && payload?.account
    ? payload.account
    : payload;
  const profile = account?.profile;
  if (!profile) return payload;
  const definitions: Record<string, Record<string, any>> = account.definitions || (account.definitions = {});
  const reusableData = profile?.itemComponents?.reusablePlugs?.data || {};
  const weaponRows = equippedRows(account).filter((item: any) => {
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
  const unresolved = await resolveMissingInventoryDefinitions(account, requested, env);
  account.weaponReusablePlugs = byInstance;
  account.weaponReusableCoverage = {
    requested: [...requested],
    resolved: [...requested].filter(hash => Boolean(definitions[String(hash)])),
    unresolved,
    complete: unresolved.length === 0
  };
  return payload;
}

async function enrichLoadoutSupers(payload: any, env: Env): Promise<any> {
  if (!payload?.profile || !Array.isArray(payload?.selectedItems)) return payload;
  const definitions: Record<string, Record<string, any>> = payload.definitions || (payload.definitions = {});
  const subclass = payload.selectedItems.find((item: any) => {
    const definition = definitions[String(item?.itemHash)];
    return Number(definition?.inventory?.bucketTypeHash) === SUBCLASS_BUCKET_HASH;
  });
  if (!subclass?.itemInstanceId) return payload;

  const selectedHashes = Array.isArray(subclass.plugItemHashes) ? subclass.plugItemHashes.map((value: unknown) => bungieDefinitionHash(value)) : [];
  let superSocketIndex = selectedHashes.findIndex((hash: number | null) => hash !== null && isSuperDefinition(definitions[String(hash)]));
  if (superSocketIndex < 0) {
    const currentSockets = payload.profile?.itemComponents?.sockets?.data?.[subclass.itemInstanceId]?.sockets || [];
    superSocketIndex = currentSockets.findIndex((socket: any) => isSuperDefinition(definitions[String(socket?.plugHash)]));
  }
  if (superSocketIndex < 0) return payload;

  const candidateHashes = new Set<number>();
  const equippedHash = selectedHashes[superSocketIndex];
  if (equippedHash !== null && equippedHash !== undefined) candidateHashes.add(equippedHash);
  const reusable = payload.profile?.itemComponents?.reusablePlugs?.data?.[subclass.itemInstanceId]?.plugs || {};
  for (const row of reusable[String(superSocketIndex)] || reusable[superSocketIndex] || []) {
    addDefinitionHash(candidateHashes, row?.plugItemHash ?? row?.plugHash);
  }
  const subclassDefinition = definitions[String(subclass.itemHash)] || {};
  const manifestSocket = subclassDefinition?.sockets?.socketEntries?.[superSocketIndex];
  addDefinitionHash(candidateHashes, manifestSocket?.singleInitialItemHash);
  for (const row of manifestSocket?.reusablePlugItems || []) {
    addDefinitionHash(candidateHashes, row?.plugItemHash);
  }
  const plugSetHash = bungieDefinitionHash(manifestSocket?.reusablePlugSetHash);
  if (plugSetHash !== null) {
    const plugSets = [
      payload.profile?.profilePlugSets?.data?.plugs,
      payload.profile?.characterPlugSets?.data?.[payload.characterId]?.plugs
    ];
    for (const plugs of plugSets) {
      for (const row of plugs?.[String(plugSetHash)] || []) {
        if (row?.canInsert === false || row?.enabled === false) continue;
        addDefinitionHash(candidateHashes, row?.plugItemHash ?? row?.plugHash);
      }
    }
  }

  const unresolved = await resolveMissingInventoryDefinitions(payload, candidateHashes, env);
  payload.loadoutSuperCoverage = {
    subclassItemHash: Number(subclass.itemHash),
    subclassInstanceId: String(subclass.itemInstanceId),
    superSocketIndex,
    requested: [...candidateHashes],
    resolved: [...candidateHashes].filter(hash => isSuperDefinition(definitions[String(hash)])),
    unresolved,
    complete: unresolved.length === 0
  };
  return payload;
}

function logManifestEvidenceGaps(payload: any, page: string): void {
  const account = payload?.transport === "prepared-page-stream-v1" && payload?.account
    ? payload.account
    : payload;
  for (const gap of account?.weaponEffectCoverage?.missingEffectDescriptions || []) {
    console.warn("manifest_effect_evidence_missing", { page, ...gap });
  }
  for (const gap of account?.weaponEffectCoverage?.emptySandboxPerkDescriptions || []) {
    console.info("manifest_effect_evidence_fallback", { page, ...gap });
  }
  for (const hash of account?.weaponEffectCoverage?.sandboxPerkUnresolved || []) {
    console.warn("manifest_definition_unresolved", {
      page,
      definitionType: "DestinySandboxPerkDefinition",
      hash,
      field: "ownedWeapon.definition.perks.perkHash"
    });
  }
  for (const hash of account?.weaponDefinitionCoverage?.unresolved || []) {
    console.warn("manifest_definition_unresolved", {
      page,
      definitionType: "DestinyInventoryItemDefinition",
      hash,
      field: "ownedWeapon.socketDefinition"
    });
  }
}

async function rewriteJsonResponse(response: Response, transform: (payload: any) => Promise<any>): Promise<Response> {
  if (!response.ok) return response;
  const payload = await response.clone().json<any>().catch(() => null);
  if (!payload) return response;
  const updated = await transform(payload);
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(updated), { status: response.status, statusText: response.statusText, headers });
}

export default {
  scheduled(controller: ScheduledController, env: Env, context: ExecutionContext): void {
    worker.scheduled(controller, env, context);
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await worker.fetch(request, env);
    const url = new URL(request.url);
    const path = url.pathname;
    const pagePayload = path.startsWith("/bungie/page/") ? path.slice("/bungie/page/".length) : "";
    if (url.searchParams.get("definitions") === "client-manifest" && (path === "/bungie/profile" || path === "/v1/destiny/profile" || path === "/bungie/loadout" || path === "/v1/destiny/loadout")) return response;
    try {
      if (request.method === "GET" && (path === "/bungie/profile" || path === "/v1/destiny/profile")) {
        return await rewriteJsonResponse(response, async payload => {
          await enrichSubclassInventory(payload, env);
          await enrichEquipableSets(payload, env);
          await enrichWeaponReusablePlugs(payload, env);
          return payload;
        });
      }
      if (request.method === "GET" && (path === "/bungie/loadout" || path === "/v1/destiny/loadout")) {
        return await rewriteJsonResponse(response, async payload => {
          await enrichLoadoutSupers(payload, env);
          await enrichEquipableSets(payload, env);
          await enrichWeaponReusablePlugs(payload, env);
          return payload;
        });
      }
      if (request.method === "GET" && ["character", "build-forge", "journey", "vault", "loadout"].includes(pagePayload)) {
        return await rewriteJsonResponse(response, async payload => {
          await enrichSubclassInventory(payload, env);
          if (pagePayload === "loadout") await enrichOwnedWeaponDefinitions(payload, env);
          if (pagePayload === "build-forge") await enrichOwnedWeaponDefinitions(payload, env);
          await enrichEquipableSets(payload, env);
          await enrichWeaponReusablePlugs(payload, env);
          logManifestEvidenceGaps(payload, pagePayload);
          return payload;
        });
      }
    } catch (error) {
      console.error("semantic_enrichment_failed", { path, message: error instanceof Error ? error.message : String(error) });
    }
    return response;
  }
} satisfies ExportedHandler<Env>;
