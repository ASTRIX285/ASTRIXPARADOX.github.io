import { bungieDefinitionHashes, preparedDefinitionTables } from './manifest-semantics.ts';

/** Component 206 references instance IDs, not item hashes. Join account inventory
 * before resolving saved plugs. All reads stay on the prepared manifest binding. */
export async function enrichLoadoutDetails(payload: any, env: Env, version: string): Promise<void> {
  const profile = payload?.profile;
  if (!profile?.characterLoadouts?.data || !version || !env.MANIFEST_DATA) return;
  const items = [
    ...(profile.profileInventory?.data?.items || []),
    ...Object.values(profile.characterInventories?.data || {}).flatMap((v: any) => v?.items || []),
    ...Object.values(profile.characterEquipment?.data || {}).flatMap((v: any) => v?.items || [])
  ];
  const byId = new Map<string, any>(items.map((item: any) => [String(item.itemInstanceId), item] as [string, any]));
  const saved = Object.values(profile.characterLoadouts.data)
    .flatMap((v: any) => (v?.loadouts || []).flatMap((loadout: any) => loadout?.items || []));
  const hashes = bungieDefinitionHashes(saved.flatMap((item: any) => [
    byId.get(String(item.itemInstanceId))?.itemHash, ...(item.plugItemHashes || [])
  ]));
  const definitions = payload.definitions || (payload.definitions = {});
  const missing = hashes.filter(hash => !definitions[String(hash)]);
  const resolved = await preparedDefinitionTables({ DestinyInventoryItemDefinition: missing }, env, version);
  Object.assign(definitions, resolved.DestinyInventoryItemDefinition || {});
  const selectedDefinitions = hashes.map(hash => definitions[String(hash)]).filter(Boolean);
  const requests = {
    DestinySocketCategoryDefinition: bungieDefinitionHashes(selectedDefinitions.flatMap((row: any) =>
      (row.sockets?.socketCategories || []).map((socket: any) => socket.socketCategoryHash))),
    DestinySocketTypeDefinition: bungieDefinitionHashes(selectedDefinitions.flatMap((row: any) =>
      (row.sockets?.socketEntries || []).map((socket: any) => socket.socketTypeHash))),
    DestinyStatDefinition: bungieDefinitionHashes(selectedDefinitions.flatMap((row: any) =>
      (row.investmentStats || []).map((stat: any) => stat.statTypeHash)))
  };
  const tables = await preparedDefinitionTables(requests, env, version);
  let identifiers: any = null;
  try {
    const url = new URL('https://manifest/loadout-identifiers');
    url.searchParams.set('version', version);
    const response = await env.MANIFEST_DATA.fetch(new Request(url));
    if (response.ok) {
      const body: any = await response.json();
      if (body.manifestVersion === version) identifiers = body.tables;
    }
  } catch { /* An unavailable identity catalogue cannot fabricate choices. */ }
  payload.loadoutDetailsManifest = {
    manifestVersion: version,
    tables: { ...tables, ...(identifiers || {}) },
    identifiersAvailable: Boolean(identifiers),
    unresolved: hashes.filter(hash => !definitions[String(hash)])
  };
}
