import {
  AuthRecord,
  type AccessBindingRecord,
  type AuthRecordValue,
  type Membership,
  type OAuthTransaction,
  type RecoveryTransaction,
  type SessionRecord
} from "./auth-record";
import { allowedOrigins, approvedReturnUrl, handlePreflight, json, withCors } from "./web";
import { profileSections } from "./profile-sections";
import { compactPreparedProfilePlugLists, enrichPreparedPageAccount } from "./page-semantics";

export { AuthRecord };

const BUNGIE_AUTHORIZE = "https://www.bungie.net/en/oauth/authorize";
const BUNGIE_TOKEN = "https://www.bungie.net/platform/app/oauth/token/";
const BUNGIE_MEMBERSHIPS = "https://www.bungie.net/Platform/User/GetMembershipsForCurrentUser/";
const BUNGIE_PLATFORM = "https://www.bungie.net/Platform";
const MANIFEST_METADATA_CACHE_KEY = "https://auth.astrixparadox.com/.cache/manifest-metadata/current";
const MANIFEST_METADATA_TTL_SECONDS = 60 * 60;
const SESSION_COOKIE = "astrix_session";
const OAUTH_TTL_MS = 10 * 60 * 1000;
const RECOVERY_TTL_MS = 2 * 60 * 1000;
const SESSION_TTL_MS = 400 * 24 * 60 * 60 * 1000;
const INTERNAL_ACCESS_HOST = "forge-auth.internal";
const ACCESS_IDENTITY_PATTERN = /^[a-f0-9]{64}$/;
const DESTINY_ACTION_CAPABILITIES = Object.freeze({
  captureSnapshot: true,
  transferItems: true,
  pullFromPostmaster: true,
  equipItems: true,
  verifyEquipment: true,
  insertSocketPlugFree: true,
  verifyFinalState: true,
  equipLoadout: true,
  snapshotLoadout: true,
  updateLoadoutIdentifiers: true,
  clearLoadout: true
});
const MANIFEST_COMPONENT_TYPES = new Set([
  "DestinyInventoryItemDefinition",
  "DestinySandboxPerkDefinition",
  "DestinyArtifactDefinition",
  "DestinyPlugSetDefinition",
  "DestinyStatDefinition",
  "DestinyStatGroupDefinition",
  "DestinySocketCategoryDefinition",
  "DestinyEquipableItemSetDefinition",
  "DestinyPresentationNodeDefinition", "DestinyRecordDefinition", "DestinyObjectiveDefinition",
  "DestinyCollectibleDefinition", "DestinyMetricDefinition", "DestinyGuardianRankDefinition",
  "DestinyGuardianRankConstantsDefinition", "DestinyDestinationDefinition", "DestinyActivityDefinition",
  "DestinyChecklistDefinition", "DestinyLocationDefinition", "DestinySocketTypeDefinition",
  "DestinyDamageTypeDefinition", "DestinyBreakerTypeDefinition", "DestinyPowerCapDefinition"
  , "DestinySeasonDefinition", "DestinySeasonPassDefinition"
]);
const LIVE_DEFINITION_TYPES = new Set([
  ...MANIFEST_COMPONENT_TYPES,
  "DestinyPresentationNodeDefinition",
  "DestinyRecordDefinition",
  "DestinyObjectiveDefinition",
  "DestinyGuardianRankDefinition",
  "DestinyGuardianRankConstantsDefinition",
  "DestinyDestinationDefinition",
  "DestinyActivityDefinition",
  "DestinyChecklistDefinition",
  "DestinyLocationDefinition",
  "DestinyMetricDefinition",
  "DestinyDamageTypeDefinition",
  "DestinyBreakerTypeDefinition",
  "DestinyEquipableItemSetDefinition"
]);

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  refresh_expires_in?: number;
  membership_id?: string;
};

type BungieMembershipResponse = {
  Response?: {
    destinyMemberships?: Array<{
      membershipType: number;
      membershipId: string;
      displayName?: string;
    }>;
    primaryMembershipId?: string;
    bungieNetUser?: {
      membershipId?: string;
      uniqueName?: string;
      displayName?: string;
      profilePicturePath?: string;
      profilePictureWidePath?: string;
    };
  };
  ErrorCode?: number;
  Message?: string;
};

type BungieApiResponse<T> = {
  Response?: T;
  ErrorCode?: number;
  ErrorStatus?: string;
  Message?: string;
};

type DestinyManifestResponse = {
  version?: string;
  jsonWorldComponentContentPaths?: Record<string, Record<string, string>>;
};

type DestinyItemComponent = { itemHash?: number; itemInstanceId?: string; overrideStyleItemHash?: number; versionNumber?: number; state?: number };
type DestinySocketComponent = { sockets?: Array<{ plugHash?: number }> };
type DestinyItemPlug = { plugItemHash?: number; plugHash?: number; canInsert?: boolean; enabled?: boolean };
type DestinyReusablePlugComponent = { plugs?: Record<string, DestinyItemPlug[]> };
type DestinyPlugSetsComponent = { plugs?: Record<string, DestinyItemPlug[]> };
type DestinyArtifactProfileScoped = { artifactHash?: number };
type DestinyArtifactTierItem = { itemHash?: number; isActive?: boolean; isVisible?: boolean };
type DestinyArtifactCharacterScoped = { tiers?: Array<{ items?: DestinyArtifactTierItem[] }> };
type DestinyLoadoutItemComponent = { itemInstanceId?: string; plugItemHashes?: number[] };
type DestinyLoadoutComponent = {
  colorHash?: number;
  iconHash?: number;
  nameHash?: number;
  items?: DestinyLoadoutItemComponent[];
  subclassOverrides?: DestinyLoadoutItemComponent[];
};
type DestinyProfilePayload = {
  characters?: { data?: Record<string, { characterId?: string }> };
  characterEquipment?: { data?: Record<string, { items?: DestinyItemComponent[] }> };
  characterInventories?: { data?: Record<string, { items?: DestinyItemComponent[] }> };
  profileInventory?: { data?: { items?: DestinyItemComponent[] } };
  characterLoadouts?: { data?: Record<string, { loadouts?: DestinyLoadoutComponent[] }> };
  profileProgression?: { data?: { seasonalArtifact?: DestinyArtifactProfileScoped } };
  characterProgressions?: { data?: Record<string, { seasonalArtifact?: DestinyArtifactCharacterScoped }> };
  profilePlugSets?: { data?: DestinyPlugSetsComponent };
  characterPlugSets?: { data?: Record<string, DestinyPlugSetsComponent> };
  itemComponents?: {
    sockets?: { data?: Record<string, DestinySocketComponent> };
    instances?: { data?: Record<string, { damageTypeHash?: number; breakerTypeHash?: number; gearTier?: number; itemLevel?: number; quality?: number; primaryStat?: { value?: number } }> };
    reusablePlugs?: { data?: Record<string, DestinyReusablePlugComponent> };
  };
  [key: string]: unknown;
};

const CHARACTER_PROFILE_COMPONENTS = [
  100, // Profiles
  102, // ProfileInventories
  103, // ProfileCurrencies
  104, // ProfileProgression
  200, // Characters
  201, // CharacterInventories
  202, // CharacterProgressions
  203, // CharacterRenderData
  204, // CharacterActivities
  205, // CharacterEquipment
  206, // CharacterLoadouts
  300, // ItemInstances
  302, // ItemPerks
  304, // ItemStats
  305, // ItemSockets
  309, // ItemPlugObjectives
  310  // ItemReusablePlugs
] as const;

const JOURNEY_PROFILE_COMPONENTS = [
  100, // Profiles
  102, // ProfileInventories
  104, // ProfileProgression
  200, // Characters
  201, // CharacterInventories
  202, // CharacterProgressions
  204, // CharacterActivities
  205, // CharacterEquipment
  700, // PresentationNodes
  800, // Collectibles: Journey badges and equipment collection state
  900, // Records
  1100, // Metrics
  1300  // Craftables
] as const;

const PROFILE_COMPONENTS = [
  ...CHARACTER_PROFILE_COMPONENTS,
  700, // PresentationNodes
  800, // Collectibles
  900, // Records
  1100, // Metrics
  1300  // Craftables
] as const;
const PROFILE_STAT_HASHES = [2996146975, 392767087, 1943323491, 1735777505, 144602215, 4244567218] as const;

function randomToken(): string {
  return crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
}

function publicBungieHeaders(env: Env): HeadersInit {
  return {
    "X-API-Key": env.BUNGIE_API_KEY,
    "User-Agent": "ASTRIX-PARADOX/alpha (+https://astrixparadox.com)"
  };
}

async function destinyManifest(env: Env, options: { forceRefresh?: boolean } = {}): Promise<DestinyManifestResponse> {
  let defaultCache: Cache | null = null;
  const cacheKey = new Request(MANIFEST_METADATA_CACHE_KEY, { method: "GET" });
  try {
    defaultCache = (caches as unknown as { default: Cache }).default;
    if (!options.forceRefresh) {
      const cached = await defaultCache.match(cacheKey);
      const cachedManifest = await cached?.json<DestinyManifestResponse>().catch(() => null);
      if (cachedManifest?.version && cachedManifest.jsonWorldComponentContentPaths?.en) return cachedManifest;
    }
  } catch {}

  const response = await fetch(`${BUNGIE_PLATFORM}/Destiny2/Manifest/`, { headers: publicBungieHeaders(env) });
  const payload = await response.json<BungieApiResponse<DestinyManifestResponse>>().catch(() => null);
  if (!response.ok || !payload?.Response?.version || !payload.Response.jsonWorldComponentContentPaths?.en) {
    throw new Error(`bungie_manifest_failed:${response.status}`);
  }
  if (defaultCache) {
    try {
      await defaultCache.put(cacheKey, new Response(JSON.stringify(payload.Response), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": `public, max-age=${MANIFEST_METADATA_TTL_SECONDS}`
        }
      }));
    } catch (error) {
      console.warn("manifest_metadata_cache_write_failed", { error: String(error) });
    }
  }
  return payload.Response;
}

async function refreshDestinyManifestMetadata(env: Env): Promise<void> {
  const manifest = await destinyManifest(env, { forceRefresh: true });
  console.log("bungie_manifest_metadata_refreshed", { version: manifest.version });
}

async function manifestMetadataRoute(request: Request, env: Env): Promise<Response> {
  const manifest = await destinyManifest(env);
  const english = manifest.jsonWorldComponentContentPaths?.en || {};
  const paths = Object.fromEntries([...MANIFEST_COMPONENT_TYPES].map(type => [type, english[type]]).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  if (Object.keys(paths).length !== MANIFEST_COMPONENT_TYPES.size) {
    return withCors(request, env, json({ error: "bungie_manifest_component_path_missing" }, 502));
  }
  return withCors(request, env, json({ version: manifest.version, jsonWorldComponentContentPaths: { en: paths } }, 200, {
    "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=300"
  }));
}

async function manifestComponentRoute(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "";
  const requestedVersion = url.searchParams.get("version") || "";
  if (!MANIFEST_COMPONENT_TYPES.has(type) || !requestedVersion) {
    return withCors(request, env, json({ error: "invalid_manifest_component_request" }, 400));
  }
  const manifest = await destinyManifest(env);
  if (manifest.version !== requestedVersion) {
    return withCors(request, env, json({ error: "manifest_version_changed", requestedVersion, currentVersion: manifest.version }, 409));
  }
  const path = manifest.jsonWorldComponentContentPaths?.en?.[type] || "";
  if (!path.startsWith("/common/destiny2_content/json/")) {
    return withCors(request, env, json({ error: "invalid_manifest_component_path" }, 502));
  }
  const bungieUrl = new URL(path, "https://www.bungie.net");
  if (bungieUrl.origin !== "https://www.bungie.net") {
    return withCors(request, env, json({ error: "invalid_manifest_component_origin" }, 502));
  }
  const upstream = await fetch(bungieUrl, { headers: { "User-Agent": "ASTRIX-PARADOX/alpha (+https://astrixparadox.com)" } });
  if (!upstream.ok || !upstream.body) {
    return withCors(request, env, json({ error: "bungie_manifest_component_failed", status: upstream.status }, 502));
  }
  const headers = new Headers({
    "Content-Type": upstream.headers.get("Content-Type") || "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "X-Manifest-Version": requestedVersion
  });
  return withCors(request, env, new Response(upstream.body, { status: 200, headers }));
}

async function manifestDefinitionTable(env: Env, manifest: DestinyManifestResponse, type: string): Promise<Record<string, Record<string, any>>> {
  const path = manifest.jsonWorldComponentContentPaths?.en?.[type] || "";
  if (!path.startsWith("/common/destiny2_content/json/")) throw new Error(`bungie_${type}_path_missing`);
  const bungieUrl = new URL(path, "https://www.bungie.net");
  if (bungieUrl.origin !== "https://www.bungie.net") throw new Error(`bungie_${type}_origin_invalid`);
  const cacheKey = new Request(`https://auth.astrixparadox.com/.cache/manifest/${encodeURIComponent(manifest.version || "unknown")}/${encodeURIComponent(type)}`);
  const defaultCache = (caches as unknown as { default: Cache }).default;
  let response = await defaultCache.match(cacheKey);
  if (!response) {
    const upstream = await fetch(bungieUrl, { headers: { "User-Agent": "ASTRIX-PARADOX/alpha (+https://astrixparadox.com)" } });
    if (!upstream.ok) throw new Error(`bungie_${type}_failed:${upstream.status}`);
    const headers = new Headers(upstream.headers);
    headers.set("Cache-Control", "public, max-age=3600");
    response = new Response(upstream.body, { status: 200, headers });
    await defaultCache.put(cacheKey, response.clone());
  }
  const table = await response.json<Record<string, Record<string, any>>>().catch(() => null);
  if (!table || typeof table !== "object" || Array.isArray(table)) throw new Error(`bungie_${type}_invalid`);
  return table;
}

async function currentSeasonRoute(request: Request, env: Env): Promise<Response> {
  const preparedResponse = await env.MANIFEST_DATA?.fetch(new Request("https://manifest/status")).catch(() => null);
  const prepared = preparedResponse?.ok
    ? await preparedResponse.json<{ currentSeason?: Record<string, unknown> }>().catch(() => null)
    : null;
  if (prepared?.currentSeason) {
    return withCors(request, env, json(prepared.currentSeason, 200, { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" }));
  }
  const manifest = await destinyManifest(env);
  const seasons = Object.values(await manifestDefinitionTable(env, manifest, "DestinySeasonDefinition"));
  const now = Date.now();
  const started = seasons.filter(season => {
    const start = Date.parse(String(season.startDate || ""));
    return Number.isFinite(start) && start <= now;
  }).sort((left, right) => Date.parse(String(right.startDate || "")) - Date.parse(String(left.startDate || "")));
  const activeSeason = started.find(season => {
    const end = Date.parse(String(season.endDate || ""));
    return !Number.isFinite(end) || now < end;
  }) || started[0];
  if (!activeSeason) return withCors(request, env, json({ error: "current_season_not_found" }, 404));

  const passEntries = Array.isArray(activeSeason.seasonPassList) ? activeSeason.seasonPassList : [];
  const activePassEntry = passEntries.find((entry: Record<string, any>) => {
    const start = Date.parse(String(entry.seasonPassStartDate || ""));
    const end = Date.parse(String(entry.seasonPassEndDate || ""));
    return (!Number.isFinite(start) || start <= now) && (!Number.isFinite(end) || now < end);
  }) || passEntries[passEntries.length - 1] || null;
  const passHash = Number(activePassEntry?.seasonPassHash ?? activeSeason.seasonPassHash);
  let seasonPass: Record<string, any> | null = null;
  if (Number.isInteger(passHash)) {
    const passes = await manifestDefinitionTable(env, manifest, "DestinySeasonPassDefinition");
    seasonPass = passes[String(passHash)] || null;
  }
  const seasonDisplay = activeSeason.displayProperties || {};
  const passImages = seasonPass?.images || {};
  return withCors(request, env, json({
    manifestVersion: manifest.version,
    season: {
      hash: activeSeason.hash ?? null,
      seasonNumber: activeSeason.seasonNumber ?? null,
      name: seasonDisplay.name || "",
      startDate: activeSeason.startDate || null,
      endDate: activeSeason.endDate || null,
      seasonPassProgressionHash: activeSeason.seasonPassProgressionHash ?? null
    },
    pass: seasonPass ? {
      hash: passHash,
      rewardProgressionHash: seasonPass.rewardProgressionHash ?? null,
      prestigeProgressionHash: seasonPass.prestigeProgressionHash ?? null,
      iconPath: passImages.iconImagePath || "",
      backgroundImagePath: passImages.themeBackgroundImagePath || ""
    } : null
  }, 200, { "Cache-Control": "public, max-age=300" }));
}

async function manifestDefinitionRoute(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "";
  const hash = url.searchParams.get("hash") || "";
  if (!LIVE_DEFINITION_TYPES.has(type) || !/^\d+$/.test(hash)) {
    return withCors(request, env, json({ error: "invalid_manifest_definition_request" }, 400));
  }
  const manifest = await destinyManifest(env);
  const defaultCache = (caches as unknown as { default: Cache }).default;
  const requestedVersion = url.searchParams.get("version");
  if (requestedVersion && requestedVersion !== manifest.version) {
    return withCors(request, env, json({ error: "manifest_version_changed", requestedVersion, currentVersion: manifest.version }, 409));
  }
  const cacheKey = new Request(`https://auth.astrixparadox.com/.cache/manifest-definition-v2/${requestedVersion ? "versioned" : "current"}/${encodeURIComponent(manifest.version || "unknown")}/${encodeURIComponent(type)}/${hash}`, { method: "GET" });
  const cached = await defaultCache.match(cacheKey).catch(() => null);
  if (cached) return withCors(request, env, cached);

  const response = await fetch(`${BUNGIE_PLATFORM}/Destiny2/Manifest/${type}/${hash}/`, { headers: publicBungieHeaders(env) });
  const payload = await response.json<BungieApiResponse<Record<string, unknown>>>().catch(() => null);
  if (!response.ok || !payload?.Response) {
    return withCors(request, env, json({ error: "bungie_manifest_definition_failed", status: response.status }, response.status === 404 ? 404 : 502));
  }
  const resolved = json({ type, hash: Number(hash), manifestVersion: manifest.version, definition: payload.Response }, 200, { "Cache-Control": requestedVersion ? "public, max-age=604800, immutable" : "public, max-age=300" });
  await defaultCache.put(cacheKey, resolved.clone()).catch(error => console.warn("manifest_definition_cache_write_failed", { type, hash, error: String(error) }));
  return withCors(request, env, resolved);
}

async function manifestDefinitionsRoute(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "";
  const hashes = [...new Set((url.searchParams.get("hashes") || "").split(","))];
  if (!LIVE_DEFINITION_TYPES.has(type) || !hashes.length || hashes.length > 48 || hashes.some(hash => !/^\d+$/.test(hash) || Number(hash) <= 0 || Number(hash) > 0xffffffff)) {
    return withCors(request, env, json({ error: "invalid_manifest_batch", maxHashes: 48 }, 400));
  }
  const manifest = await destinyManifest(env);
  if (url.searchParams.get("version") !== manifest.version) return withCors(request, env, json({ error: "manifest_version_changed", currentVersion: manifest.version }, 409));
  if (env.MANIFEST_DATA) {
    const prepared = new URL(url); prepared.pathname = "/definitions";
    const response = await env.MANIFEST_DATA.fetch(new Request(prepared)).catch(() => null);
    if (response?.ok) return withCors(request, env, response);
    // A new Bungie version can precede the next catalogue deployment. Resolve
    // current hashes directly until its complete prepared generation is ready.
  }
  const definitions: Record<string, unknown> = {};
  const unresolved: string[] = [];
  // Bounded parallel reads reuse the existing version-isolated public cache.
  for (let offset = 0; offset < hashes.length; offset += 6) {
    await Promise.all(hashes.slice(offset, offset + 6).map(async hash => {
      const single = new URL(url); single.pathname = "/bungie/manifest/definition";
      single.searchParams.delete("hashes"); single.searchParams.set("hash", hash);
      const response = await manifestDefinitionRoute(new Request(single, { headers: request.headers }), env);
      const payload = await response.json<{ definition?: unknown; manifestVersion?: string }>();
      if (response.ok && payload.manifestVersion === manifest.version && payload.definition) definitions[hash] = payload.definition;
      else unresolved.push(hash);
    }));
  }
  return withCors(request, env, json({ manifestVersion: manifest.version, type, definitions, unresolved }, 200, { "Cache-Control": unresolved.length ? "no-store" : "public, max-age=300" }));
}

function bindingInfo(value: unknown): { present: boolean; type: string; length: number | null } {
  return {
    present: typeof value === "string" ? value.length > 0 : value != null,
    type: typeof value,
    length: typeof value === "string" ? value.length : null
  };
}

function recordStub(env: Env, key: string): DurableObjectStub {
  return env.AUTH_RECORDS.get(env.AUTH_RECORDS.idFromName(key));
}

async function putRecord(env: Env, key: string, record: AuthRecordValue): Promise<void> {
  const response = await recordStub(env, key).fetch("https://auth-record/record", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record)
  });
  if (!response.ok) throw new Error(`auth_record_write_failed:${response.status}`);
}

async function takeOAuth(env: Env, state: string): Promise<OAuthTransaction | null> {
  const response = await recordStub(env, `oauth:${state}`).fetch("https://auth-record/take-oauth", { method: "POST" });
  if (!response.ok) return null;
  return response.json<OAuthTransaction>();
}

async function takeRecovery(env: Env, ticket: string): Promise<RecoveryTransaction | null> {
  const response = await recordStub(env, `recovery:${ticket}`).fetch("https://auth-record/take-recovery", { method: "POST" });
  if (!response.ok) return null;
  return response.json<RecoveryTransaction>();
}

async function getAccessBinding(env: Env, accessIdentityKey: string): Promise<AccessBindingRecord | null> {
  const response = await recordStub(env, `access:${accessIdentityKey}`).fetch("https://auth-record/record");
  if (!response.ok) return null;
  const value = await response.json<AuthRecordValue>();
  return value.kind === "access-binding" ? value : null;
}

async function putAccessBinding(env: Env, accessIdentityKey: string, sessionId: string, expiresAt: number): Promise<void> {
  await putRecord(env, `access:${accessIdentityKey}`, {
    kind: "access-binding",
    sessionId,
    createdAt: Date.now(),
    expiresAt
  });
}

async function deleteAccessBinding(env: Env, accessIdentityKey: string, sessionId: string): Promise<void> {
  const binding = await getAccessBinding(env, accessIdentityKey);
  if (binding?.sessionId !== sessionId) return;
  await recordStub(env, `access:${accessIdentityKey}`).fetch("https://auth-record/record", { method: "DELETE" });
}

async function getSession(env: Env, sessionId: string): Promise<SessionRecord | null> {
  const response = await recordStub(env, `session:${sessionId}`).fetch("https://auth-record/record");
  if (!response.ok) return null;
  const value = await response.json<AuthRecordValue>();
  return value.kind === "session" ? value : null;
}

async function putSession(env: Env, sessionId: string, session: SessionRecord): Promise<void> {
  await putRecord(env, `session:${sessionId}`, session);
}

async function deleteSession(env: Env, sessionId: string): Promise<void> {
  await recordStub(env, `session:${sessionId}`).fetch("https://auth-record/record", { method: "DELETE" });
}

async function revokeSession(env: Env, sessionId: string, session: SessionRecord | null): Promise<void> {
  await deleteSession(env, sessionId);
  if (session?.accessIdentityKey) await deleteAccessBinding(env, session.accessIdentityKey, sessionId);
}

async function renewSession(env: Env, sessionId: string, session: SessionRecord): Promise<SessionRecord> {
  const now = Date.now();
  const renewed: SessionRecord = {
    ...session,
    lastUsedAt: now,
    absoluteExpiresAt: now + SESSION_TTL_MS
  };
  await putSession(env, sessionId, renewed);
  if (renewed.accessIdentityKey) {
    await putAccessBinding(env, renewed.accessIdentityKey, sessionId, renewed.absoluteExpiresAt);
  }
  return renewed;
}

function cookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get("Cookie") || "";
  for (const pair of cookie.split(";")) {
    const [key, ...rest] = pair.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function sessionCookie(sessionId: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${maxAgeSeconds}`;
}

function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`;
}

async function startOAuth(request: Request, env: Env, accessIdentityKey?: string): Promise<Response> {
  const url = new URL(request.url);
  const clientId = (env.BUNGIE_CLIENT_ID || "").trim();
  if (!clientId) {
    return json({ error: "oauth_not_configured", missing: ["BUNGIE_CLIENT_ID"] }, 500);
  }

  const state = randomToken();
  const returnUrl = approvedReturnUrl(url.searchParams.get("return"), env);
  const tx: OAuthTransaction = {
    kind: "oauth-transaction",
    state,
    createdAt: Date.now(),
    returnUrl,
    used: false,
    ...(accessIdentityKey ? { accessIdentityKey } : {})
  };
  await putRecord(env, `oauth:${state}`, tx);

  const authorize = new URL(BUNGIE_AUTHORIZE);
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("state", state);
  return Response.redirect(authorize.toString(), 302);
}

async function exchangeCode(code: string, env: Env): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: env.BUNGIE_CLIENT_ID,
    client_secret: env.BUNGIE_CLIENT_SECRET,
    redirect_uri: env.OAUTH_REDIRECT_URI
  });
  const response = await fetch(BUNGIE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!response.ok) throw new Error(`bungie_token_exchange_failed:${response.status}:${await response.text()}`);
  return response.json<TokenResponse>();
}

async function fetchMemberships(accessToken: string, env: Env): Promise<BungieMembershipResponse> {
  const response = await fetch(BUNGIE_MEMBERSHIPS, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-API-Key": env.BUNGIE_API_KEY,
      "User-Agent": "ASTRIX-PARADOX/alpha (+https://astrixparadox.com)"
    }
  });
  if (!response.ok) throw new Error(`bungie_memberships_failed:${response.status}:${await response.text()}`);
  return response.json<BungieMembershipResponse>();
}

async function refreshAccessToken(sessionId: string, session: SessionRecord, env: Env): Promise<SessionRecord> {
  if (session.accessExpiresAt > Date.now() + 60_000) return session;
  if (!session.refreshToken || (session.refreshExpiresAt !== null && session.refreshExpiresAt <= Date.now())) {
    throw new Error("bungie_reauthentication_required");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: session.refreshToken,
    client_id: env.BUNGIE_CLIENT_ID,
    client_secret: env.BUNGIE_CLIENT_SECRET
  });
  const response = await fetch(BUNGIE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (response.status === 400 || response.status === 401) throw new Error("bungie_reauthentication_required");
  if (!response.ok) throw new Error(`bungie_token_refresh_failed:${response.status}`);

  const token = await response.json<TokenResponse>();
  if (!token.access_token || !Number.isFinite(token.expires_in) || token.expires_in <= 0) {
    throw new Error("bungie_token_refresh_invalid");
  }
  const now = Date.now();
  const refreshed: SessionRecord = {
    ...session,
    lastUsedAt: now,
    accessToken: token.access_token,
    refreshToken: token.refresh_token || session.refreshToken,
    accessExpiresAt: now + token.expires_in * 1000,
    refreshExpiresAt: token.refresh_expires_in ? now + token.refresh_expires_in * 1000 : session.refreshExpiresAt
  };
  await putSession(env, sessionId, refreshed);
  return refreshed;
}

function internalAccessIdentity(url: URL): string | null {
  const value = (url.searchParams.get("identity") || "").trim().toLowerCase();
  return ACCESS_IDENTITY_PATTERN.test(value) ? value : null;
}

async function accessRecoveryTicketRoute(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const accessIdentityKey = internalAccessIdentity(url);
  if (!accessIdentityKey) return json({ error: "invalid_access_identity" }, 400, { "Cache-Control": "no-store" });

  const binding = await getAccessBinding(env, accessIdentityKey);
  if (!binding || binding.expiresAt <= Date.now()) {
    if (binding) await deleteAccessBinding(env, accessIdentityKey, binding.sessionId);
    return json({ error: "bungie_session_not_bound" }, 404, { "Cache-Control": "no-store" });
  }
  const session = await getSession(env, binding.sessionId);
  if (!session || session.absoluteExpiresAt <= Date.now() || session.accessIdentityKey !== accessIdentityKey) {
    if (session) await revokeSession(env, binding.sessionId, session);
    else await deleteAccessBinding(env, accessIdentityKey, binding.sessionId);
    return json({ error: "bungie_session_not_bound" }, 404, { "Cache-Control": "no-store" });
  }
  if (!session.refreshToken || (session.refreshExpiresAt !== null && session.refreshExpiresAt <= Date.now())) {
    await revokeSession(env, binding.sessionId, session);
    return json({ error: "bungie_reauthentication_required" }, 401, { "Cache-Control": "no-store" });
  }

  const ticket = randomToken();
  const tx: RecoveryTransaction = {
    kind: "recovery-transaction",
    ticket,
    createdAt: Date.now(),
    returnUrl: approvedReturnUrl(url.searchParams.get("return"), env),
    sessionId: binding.sessionId,
    accessIdentityKey,
    used: false
  };
  await putRecord(env, `recovery:${ticket}`, tx);
  const recoveryUrl = new URL("/session/recover", env.OAUTH_REDIRECT_URI);
  recoveryUrl.searchParams.set("ticket", ticket);
  return json({ recoveryUrl: recoveryUrl.toString() }, 200, { "Cache-Control": "no-store" });
}

async function sessionRecoveryRoute(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const ticket = (url.searchParams.get("ticket") || "").trim().toLowerCase();
  if (!ACCESS_IDENTITY_PATTERN.test(ticket)) return json({ error: "invalid_recovery_ticket" }, 400, { "Cache-Control": "no-store" });
  const tx = await takeRecovery(env, ticket);
  if (!tx || tx.ticket !== ticket || Date.now() - tx.createdAt > RECOVERY_TTL_MS) {
    return json({ error: "invalid_or_expired_recovery_ticket" }, 400, { "Cache-Control": "no-store" });
  }

  const binding = await getAccessBinding(env, tx.accessIdentityKey);
  const storedSession = await getSession(env, tx.sessionId);
  if (!binding || binding.sessionId !== tx.sessionId || binding.expiresAt <= Date.now() ||
      !storedSession || storedSession.absoluteExpiresAt <= Date.now() ||
      storedSession.accessIdentityKey !== tx.accessIdentityKey) {
    if (storedSession) await revokeSession(env, tx.sessionId, storedSession);
    else if (binding) await deleteAccessBinding(env, tx.accessIdentityKey, tx.sessionId);
    return json({ error: "bungie_reauthentication_required" }, 401, { "Cache-Control": "no-store" });
  }

  let session: SessionRecord;
  try {
    session = await refreshAccessToken(tx.sessionId, storedSession, env);
  } catch (error) {
    if (error instanceof Error && error.message === "bungie_reauthentication_required") {
      await revokeSession(env, tx.sessionId, storedSession);
      return json({ error: "bungie_reauthentication_required" }, 401, { "Cache-Control": "no-store" });
    }
    throw error;
  }
  session = await renewSession(env, tx.sessionId, session);
  const returnUrl = new URL(tx.returnUrl);
  returnUrl.searchParams.set("bungie", "recovered");
  return new Response(null, {
    status: 302,
    headers: {
      Location: returnUrl.toString(),
      "Set-Cookie": sessionCookie(tx.sessionId, Math.floor(SESSION_TTL_MS / 1000)),
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer"
    }
  });
}

function equippedDefinitionHashes(profile: DestinyProfilePayload): number[] {
  const hashes = new Set<number>();
  const equipment = profile.characterEquipment?.data || {};
  for (const character of Object.values(equipment)) {
    for (const item of character.items || []) {
      if (Number.isInteger(item.itemHash)) hashes.add(Number(item.itemHash));
      if (Number.isInteger(item.overrideStyleItemHash)) hashes.add(Number(item.overrideStyleItemHash));
      if (!item.itemInstanceId) continue;
      const socketData = profile.itemComponents?.sockets?.data?.[item.itemInstanceId];
      for (const socket of socketData?.sockets || []) {
        if (Number.isInteger(socket.plugHash)) hashes.add(Number(socket.plugHash));
      }
    }
  }
  return [...hashes];
}

function ownedDefinitionHashes(profile: DestinyProfilePayload): number[] {
  const hashes = new Set<number>();
  const items = [
    ...(profile.profileInventory?.data?.items || []),
    ...Object.values(profile.characterInventories?.data || {}).flatMap(row => row.items || []),
    ...Object.values(profile.characterEquipment?.data || {}).flatMap(row => row.items || [])
  ];
  for (const item of items) {
    if (Number.isInteger(item.itemHash)) hashes.add(Number(item.itemHash));
    if (Number.isInteger(item.overrideStyleItemHash)) hashes.add(Number(item.overrideStyleItemHash));
    if (!item.itemInstanceId) continue;
    for (const socket of profile.itemComponents?.sockets?.data?.[item.itemInstanceId]?.sockets || []) {
      if (Number.isInteger(socket.plugHash)) hashes.add(Number(socket.plugHash));
    }
  }
  for (const row of Object.values(profile.characterLoadouts?.data || {})) {
    for (const loadout of row.loadouts || []) {
      for (const item of [...(loadout.items || []), ...(loadout.subclassOverrides || [])]) {
        for (const hash of item.plugItemHashes || []) if (Number.isInteger(hash)) hashes.add(Number(hash));
      }
    }
  }
  for (const reusable of Object.values(profile.itemComponents?.reusablePlugs?.data || {})) {
    for (const rows of Object.values(reusable.plugs || {})) {
      for (const plug of rows || []) {
        const hash = plug.plugItemHash ?? plug.plugHash;
        if (Number.isInteger(hash)) hashes.add(Number(hash));
      }
    }
  }
  return [...hashes];
}

async function preparedManifestTables(
  requests: Record<string, Iterable<number>>,
  env: Env,
  preparedVersion = "",
  preparedCurrentSeason?: Record<string, any>
): Promise<{ manifestVersion: string; tables: Record<string, Record<string, Record<string, unknown>>>; currentSeason?: Record<string, any> }> {
  if (!env.MANIFEST_DATA) return { manifestVersion: "", tables: {} };
  let manifestVersion = preparedVersion;
  let currentSeason = preparedCurrentSeason;
  if (!manifestVersion) {
    const statusResponse = await env.MANIFEST_DATA.fetch(new Request("https://manifest/status")).catch(() => null);
    const status = statusResponse?.ok
      ? await statusResponse.json<{ manifestVersion?: string; currentSeason?: Record<string, any> }>().catch(() => null)
      : null;
    manifestVersion = String(status?.manifestVersion || "");
    currentSeason = status?.currentSeason;
  }
  if (!manifestVersion) return { manifestVersion, tables: {} };
  const normalized = Object.fromEntries(Object.entries(requests).map(([type, hashes]) => [
    type,
    [...new Set([...hashes].map(Number).filter(hash => Number.isInteger(hash) && hash > 0 && hash <= UINT32_MAX))]
  ]).filter(([, hashes]) => (hashes as number[]).length));
  if (!Object.keys(normalized).length) return { manifestVersion, tables: {}, currentSeason };
  const response = await env.MANIFEST_DATA.fetch(new Request("https://manifest/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: manifestVersion, projection: "page", requests: normalized })
  })).catch(() => null);
  const payload = response?.ok
    ? await response.json<{ manifestVersion?: string; tables?: Record<string, Record<string, Record<string, unknown>>> }>().catch(() => null)
    : null;
  return payload?.manifestVersion === manifestVersion
    ? { manifestVersion, tables: payload.tables || {}, currentSeason }
    : { manifestVersion, tables: {}, currentSeason };
}

async function fetchPreparedManifestDefinitions(
  type: string,
  hashes: number[],
  env: Env
): Promise<Record<string, Record<string, unknown>>> {
  const uniqueHashes = [...new Set(hashes.filter(Number.isInteger))];
  if (!env.MANIFEST_DATA || !uniqueHashes.length || !LIVE_DEFINITION_TYPES.has(type)) return {};
  const statusResponse = await env.MANIFEST_DATA.fetch(new Request("https://manifest/status")).catch(() => null);
  const status = statusResponse?.ok
    ? await statusResponse.json<{ manifestVersion?: string }>().catch(() => null)
    : null;
  const manifestVersion = String(status?.manifestVersion || "");
  if (!manifestVersion) return {};
  const response = await env.MANIFEST_DATA.fetch(new Request("https://manifest/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: manifestVersion, projection: "page", requests: { [type]: uniqueHashes } })
  })).catch(() => null);
  const payload = response?.ok
    ? await response.json<{ manifestVersion?: string; tables?: Record<string, Record<string, Record<string, unknown>>> }>().catch(() => null)
    : null;
  return payload?.manifestVersion === manifestVersion ? (payload.tables?.[type] || {}) : {};
}

async function fetchManifestDefinitions(type: string, hashes: number[], accessToken: string, env: Env): Promise<Record<string, Record<string, unknown>>> {
  const uniqueHashes = [...new Set(hashes.filter(Number.isInteger))];
  void accessToken;
  return fetchPreparedManifestDefinitions(type, uniqueHashes, env);
}

function artifactPerkHashes(profile: DestinyProfilePayload): number[] {
  const hashes = new Set<number>();
  for (const progression of Object.values(profile.characterProgressions?.data || {})) {
    for (const tier of progression.seasonalArtifact?.tiers || []) {
      for (const item of tier.items || []) {
        if (Number.isInteger(item.itemHash)) hashes.add(Number(item.itemHash));
      }
    }
  }
  return [...hashes];
}

function definitionPlugCategory(definition: Record<string, unknown> | undefined): string {
  const plug = definition?.plug as { plugCategoryIdentifier?: unknown } | undefined;
  return String(plug?.plugCategoryIdentifier || "").toLowerCase();
}

function reusableSubclassPlugHashes(
  profile: DestinyProfilePayload,
  definitions: Record<string, Record<string, unknown>>
): number[] {
  const hashes = new Set<number>();
  for (const [characterId, character] of Object.entries(profile.characterEquipment?.data || {})) {
    for (const item of character.items || []) {
      if (!item.itemInstanceId) continue;
      const itemDefinition = definitions[String(item.itemHash)] || {};
      const typeName = String(itemDefinition.itemTypeDisplayName || "").toLowerCase();
      const displayName = String((itemDefinition.displayProperties as { name?: unknown } | undefined)?.name || "").toLowerCase();
      if (!typeName.includes("subclass") && !displayName.includes("subclass")) continue;
      const reusable = profile.itemComponents?.reusablePlugs?.data?.[item.itemInstanceId]?.plugs || {};
      for (const rows of Object.values(reusable)) {
        for (const row of rows || []) {
          const hash = row.plugItemHash ?? row.plugHash;
          if (Number.isInteger(hash)) hashes.add(Number(hash));
        }
      }
      const socketEntries = (itemDefinition.sockets as { socketEntries?: Array<{ reusablePlugSetHash?: number }> } | undefined)?.socketEntries || [];
      const plugSets = [profile.profilePlugSets?.data?.plugs, profile.characterPlugSets?.data?.[characterId]?.plugs];
      for (const entry of socketEntries) {
        const plugSetHash = Number(entry.reusablePlugSetHash);
        if (!Number.isInteger(plugSetHash)) continue;
        for (const plugs of plugSets) {
          for (const row of plugs?.[String(plugSetHash)] || []) {
            if (row.canInsert === false || row.enabled === false) continue;
            const hash = row.plugItemHash ?? row.plugHash;
            if (Number.isInteger(hash)) hashes.add(Number(hash));
          }
        }
      }
    }
  }
  return [...hashes];
}

async function fetchInventoryDefinitions(
  hashes: number[],
  accessToken: string,
  env: Env
): Promise<Record<string, Record<string, unknown>>> {
  const uniqueHashes = [...new Set(hashes.filter(hash => Number.isInteger(hash)))];
  void accessToken;
  return fetchPreparedManifestDefinitions("DestinyInventoryItemDefinition", uniqueHashes, env);
}

async function fetchArtifactDefinition(
  hash: number | null,
  accessToken: string,
  env: Env
): Promise<Record<string, unknown> | null> {
  if (!Number.isInteger(hash)) return null;
  void accessToken;
  return (await fetchPreparedManifestDefinitions("DestinyArtifactDefinition", [Number(hash)], env))[String(hash)] || null;
}

async function profileRoute(request: Request, env: Env): Promise<Response> {
  const requestUrl = new URL(request.url);
  const profileScope = requestUrl.searchParams.get("scope");
  const requestedComponents = profileScope === "character" || profileScope === "forge"
    ? CHARACTER_PROFILE_COMPONENTS
    : profileScope === "journey"
      ? JOURNEY_PROFILE_COMPONENTS
      : PROFILE_COMPONENTS;
  const sessionId = cookieValue(request, SESSION_COOKIE);
  if (!sessionId) return withCors(request, env, json({ authenticated: false, error: "authentication_required" }, 401));

  const storedSession = await getSession(env, sessionId);
  if (!storedSession || storedSession.absoluteExpiresAt <= Date.now()) {
    if (storedSession) await deleteSession(env, sessionId);
    return withCors(request, env, json(
      { authenticated: false, error: "session_expired" },
      401,
      { "Set-Cookie": clearSessionCookie() }
    ));
  }

  if (!storedSession.activeDestinyMembership) {
    return withCors(request, env, json({ error: "destiny_membership_not_found" }, 404));
  }

  let session: SessionRecord;
  try {
    session = await refreshAccessToken(sessionId, storedSession, env);
  } catch (error) {
    if (error instanceof Error && error.message === "bungie_reauthentication_required") {
      await deleteSession(env, sessionId);
      return withCors(request, env, json(
        { authenticated: false, error: "bungie_reauthentication_required" },
        401,
        { "Set-Cookie": clearSessionCookie() }
      ));
    }
    throw error;
  }

  const membership = session.activeDestinyMembership;
  if (!membership) {
    return withCors(request, env, json({ error: "destiny_membership_not_found" }, 404));
  }
  const profileUrl = new URL(
    `${BUNGIE_PLATFORM}/Destiny2/${membership.membershipType}/Profile/${encodeURIComponent(membership.membershipId)}/`
  );
  profileUrl.searchParams.set("components", requestedComponents.join(","));

  const displaySnapshot = requestUrl.searchParams.get("freshness") === "display";
  if (displaySnapshot) await putSession(env, sessionId, session);
  const response = displaySnapshot
    ? await recordStub(env, `session:${sessionId}`).fetch(new Request("https://internal/profile-snapshot", { method: "POST", body: JSON.stringify({ components: requestedComponents }) }))
    : await fetch(profileUrl, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "X-API-Key": env.BUNGIE_API_KEY,
      "User-Agent": "ASTRIX-PARADOX/alpha (+https://astrixparadox.com)"
    }
  });
  const payload = await response.json<BungieApiResponse<DestinyProfilePayload>>().catch(() => null);
  if (!response.ok || !payload?.Response) {
    console.error("bungie_profile_failed", {
      status: response.status,
      errorCode: payload?.ErrorCode,
      errorStatus: payload?.ErrorStatus
    });
    return withCors(request, env, json({
      error: "bungie_profile_failed",
      status: response.status,
      errorCode: payload?.ErrorCode ?? null,
      errorStatus: payload?.ErrorStatus ?? null
    }, response.status >= 400 && response.status < 500 ? response.status : 502));
  }

  const verifiedCharacterIds = Object.keys(payload.Response.characters?.data || {});
  if (requestUrl.searchParams.get("definitions") === "client-manifest") {
    await putSession(env, sessionId, { ...session, lastUsedAt: Date.now(), verifiedCharacterIds, verifiedCharactersAt: Date.now() });
    let sections = null;
    if (displaySnapshot && requestUrl.searchParams.get("delivery") === "sections") {
      const raw = requestUrl.searchParams.get("since") || "{}";
      if (raw.length > 8192) return withCors(request, env, json({ error: "section_revisions_too_large" }, 400));
      let since: Record<string,string>;
      try { since = JSON.parse(raw); } catch { return withCors(request, env, json({ error: "invalid_section_revisions" }, 400)); }
      if (!since || Array.isArray(since) || typeof since !== "object") return withCors(request, env, json({ error: "invalid_section_revisions" }, 400));
      sections = await profileSections(payload.Response, `${membership.membershipType}:${membership.membershipId}`, since);
    }
    return withCors(request, env, json({
      authenticated: true,
      membership,
      components: requestedComponents,
      profile: sections ? undefined : payload.Response,
      profileSections: sections,
      definitions: {},
      damageDefinitions: {},
      breakerDefinitions: {},
      gearAssets: {},
      manifestResolution: { mode: "client" },
      displaySnapshot: displaySnapshot ? { source: response.headers.get("X-Forge-Profile-Source"), fetchedAt: Number(response.headers.get("X-Forge-Profile-Fetched-At")), maxAgeMs: 15000 } : null
    }));
  }

  const baseDefinitionHashes = [...new Set([
    ...(profileScope === "forge" || profileScope === "journey" ? ownedDefinitionHashes(payload.Response) : equippedDefinitionHashes(payload.Response)),
    ...artifactPerkHashes(payload.Response)
  ])];
  const definitions = await fetchInventoryDefinitions(baseDefinitionHashes, session.accessToken, env);
  const reusableSubclassDefinitionHashes = reusableSubclassPlugHashes(payload.Response, definitions);
  const missingReusableSubclassHashes = reusableSubclassDefinitionHashes.filter(hash => !definitions[String(hash)]);
  if (missingReusableSubclassHashes.length) {
    Object.assign(definitions, await fetchInventoryDefinitions(missingReusableSubclassHashes, session.accessToken, env));
  }

  const requestedDefinitionHashes = [...new Set([...baseDefinitionHashes, ...reusableSubclassDefinitionHashes])];
  const damageTypeHashes = [...new Set(Object.values(payload.Response.itemComponents?.instances?.data || {}).map(row => Number(row.damageTypeHash)).filter(Number.isInteger))];
  const breakerTypeHashes = [...new Set([...Object.values(definitions).map(row => Number(row.breakerTypeHash)),...Object.values(payload.Response.itemComponents?.instances?.data || {}).map(row => Number(row.breakerTypeHash))].filter(Number.isInteger))];
  const collectibleHashes = [...new Set(Object.values(definitions).map(row => Number(row.collectibleHash)).filter(Number.isInteger))];
  const [damageDefinitions, breakerDefinitions, statDefinitions, collectibleDefinitions] = await Promise.all([
    fetchManifestDefinitions("DestinyDamageTypeDefinition", damageTypeHashes, session.accessToken, env),
    fetchManifestDefinitions("DestinyBreakerTypeDefinition", breakerTypeHashes, session.accessToken, env),
    fetchManifestDefinitions("DestinyStatDefinition", [...PROFILE_STAT_HASHES], session.accessToken, env),
    fetchManifestDefinitions("DestinyCollectibleDefinition", collectibleHashes, session.accessToken, env)
  ]);
  const unresolvedDefinitionHashes = requestedDefinitionHashes.filter(hash => !definitions[String(hash)]);
  const definitionCoverage = {
    requested: requestedDefinitionHashes.length,
    resolved: requestedDefinitionHashes.length - unresolvedDefinitionHashes.length,
    unresolved: unresolvedDefinitionHashes,
    complete: unresolvedDefinitionHashes.length === 0,
    characterCount: Object.keys(payload.Response.characterEquipment?.data || {}).length,
    reusableSubclassRequested: reusableSubclassDefinitionHashes.length,
    artifactPerkRequested: artifactPerkHashes(payload.Response).length
  };

  const artifactHashValue = payload.Response.profileProgression?.data?.seasonalArtifact?.artifactHash;
  const artifactHash = Number.isInteger(artifactHashValue) ? Number(artifactHashValue) : null;
  const artifactDefinition = await fetchArtifactDefinition(artifactHash, session.accessToken, env);
  const artifactCoverage = {
    hash: artifactHash,
    definitionResolved: Boolean(artifactDefinition),
    perkHashes: artifactPerkHashes(payload.Response),
    unresolvedPerkHashes: artifactPerkHashes(payload.Response).filter(hash => !definitions[String(hash)]),
    complete: artifactHash === null ? true : Boolean(artifactDefinition)
  };

  const gearAssets: Record<string, Record<string, unknown>> = {};
  const updatedSession = { ...session, lastUsedAt: Date.now(), verifiedCharacterIds, verifiedCharactersAt: Date.now() };
  await putSession(env, sessionId, updatedSession);
  return withCors(request, env, json({
    authenticated: true,
    membership,
    components: requestedComponents,
    profile: payload.Response,
    definitions,
    damageDefinitions,
    breakerDefinitions,
    statDefinitions,
    collectibleDefinitions,
    definitionCoverage,
    artifactDefinition,
    artifactCoverage,
    gearAssets,
    displaySnapshot: displaySnapshot ? {
      source: response.headers.get("X-Forge-Profile-Source"),
      fetchedAt: Number(response.headers.get("X-Forge-Profile-Fetched-At")),
      maxAgeMs: 5 * 60_000
    } : null
  }));
}

function allProfileItems(profile: DestinyProfilePayload): DestinyItemComponent[] {
  const rows: DestinyItemComponent[] = [];
  rows.push(...(profile.profileInventory?.data?.items || []));
  for (const inventory of Object.values(profile.characterInventories?.data || {})) rows.push(...(inventory.items || []));
  for (const equipment of Object.values(profile.characterEquipment?.data || {})) rows.push(...(equipment.items || []));
  return rows;
}

async function loadoutRoute(request: Request, env: Env): Promise<Response> {
  const requestUrl = new URL(request.url);
  const characterId = requestUrl.searchParams.get("characterId") || "";
  const index = Number(requestUrl.searchParams.get("index"));
  if (!characterId || !Number.isInteger(index) || index < 0 || index > 19) {
    return withCors(request, env, json({ error: "invalid_loadout_selection" }, 400));
  }

  const sessionId = cookieValue(request, SESSION_COOKIE);
  if (!sessionId) return withCors(request, env, json({ authenticated: false, error: "authentication_required" }, 401));
  const storedSession = await getSession(env, sessionId);
  if (!storedSession || storedSession.absoluteExpiresAt <= Date.now()) {
    if (storedSession) await deleteSession(env, sessionId);
    return withCors(request, env, json({ authenticated: false, error: "session_expired" }, 401, { "Set-Cookie": clearSessionCookie() }));
  }
  if (!storedSession.activeDestinyMembership) {
    return withCors(request, env, json({ error: "destiny_membership_not_found" }, 404));
  }

  let session: SessionRecord;
  try {
    session = await refreshAccessToken(sessionId, storedSession, env);
  } catch (error) {
    if (error instanceof Error && error.message === "bungie_reauthentication_required") {
      await deleteSession(env, sessionId);
      return withCors(request, env, json({ authenticated: false, error: "bungie_reauthentication_required" }, 401, { "Set-Cookie": clearSessionCookie() }));
    }
    throw error;
  }

  const membership = session.activeDestinyMembership;
  if (!membership) return withCors(request, env, json({ error: "destiny_membership_not_found" }, 404));
  await putSession(env, sessionId, session);
  const response = await recordStub(env, `session:${sessionId}`).fetch(new Request("https://internal/profile-snapshot", {
    method: "POST",
    body: JSON.stringify({ components: CHARACTER_PROFILE_COMPONENTS })
  }));
  const payload = await response.json<BungieApiResponse<DestinyProfilePayload>>().catch(() => null);
  if (!response.ok || !payload?.Response) {
    return withCors(request, env, json({ error: "bungie_loadout_profile_failed", status: response.status }, 502));
  }

  const profile = payload.Response;
  const loadout = profile.characterLoadouts?.data?.[characterId]?.loadouts?.[index];
  if (!loadout || (!(loadout.items?.length) && !(loadout.subclassOverrides?.length))) {
    return withCors(request, env, json({ error: "loadout_not_found" }, 404));
  }
  const byInstance = new Map(allProfileItems(profile).filter(item => item.itemInstanceId).map(item => [String(item.itemInstanceId), item]));
  const selectedRows = [...(loadout.items || []), ...(loadout.subclassOverrides || [])];
  const selectedByInstance = new Map<string, DestinyItemComponent & { plugItemHashes: number[] }>();
  for (const row of selectedRows) {
    const id = String(row.itemInstanceId || "");
    const item = id ? byInstance.get(id) : undefined;
    if (!item) continue;
    const prior = selectedByInstance.get(id);
    selectedByInstance.set(id, { ...item, plugItemHashes: row.plugItemHashes?.length ? row.plugItemHashes : (prior?.plugItemHashes || []) });
  }
  const selectedItems = [...selectedByInstance.values()];
  if (requestUrl.searchParams.get("definitions") === "client-manifest") {
    await putSession(env, sessionId, { ...session, lastUsedAt: Date.now() });
    return withCors(request, env, json({
      authenticated: true,
      membership,
      characterId,
      index,
      loadout,
      selectedItems,
      profile,
      definitions: {},
      damageDefinitions: {},
      breakerDefinitions: {},
      gearAssets: {},
      manifestResolution: { mode: "client" }
    }));
  }
  const definitionHashes = new Set<number>();
  for (const item of selectedItems) {
    if (Number.isInteger(item.itemHash)) definitionHashes.add(Number(item.itemHash));
    if (Number.isInteger(item.overrideStyleItemHash)) definitionHashes.add(Number(item.overrideStyleItemHash));
  }
  for (const item of selectedItems) {
    for (const plugHash of item.plugItemHashes) {
      if (Number.isInteger(plugHash)) definitionHashes.add(Number(plugHash));
    }
  }
  const hashes = [...definitionHashes];
  const definitions = await fetchInventoryDefinitions(hashes, session.accessToken, env);
  const selectedInstances = selectedItems.map(item => item.itemInstanceId ? profile.itemComponents?.instances?.data?.[item.itemInstanceId] : null).filter(Boolean);
  const damageTypeHashes = [...new Set(selectedInstances.map(row => Number(row?.damageTypeHash)).filter(Number.isInteger))];
  const breakerTypeHashes = [...new Set([...Object.values(definitions).map(row => Number(row.breakerTypeHash)),...selectedInstances.map(row => Number(row?.breakerTypeHash))].filter(Number.isInteger))];
  const collectibleHashes = [...new Set(Object.values(definitions).map(row => Number(row.collectibleHash)).filter(Number.isInteger))];
  const [damageDefinitions, breakerDefinitions, statDefinitions, collectibleDefinitions] = await Promise.all([
    fetchManifestDefinitions("DestinyDamageTypeDefinition", damageTypeHashes, session.accessToken, env),
    fetchManifestDefinitions("DestinyBreakerTypeDefinition", breakerTypeHashes, session.accessToken, env),
    fetchManifestDefinitions("DestinyStatDefinition", [...PROFILE_STAT_HASHES], session.accessToken, env),
    fetchManifestDefinitions("DestinyCollectibleDefinition", collectibleHashes, session.accessToken, env)
  ]);
  const unresolvedDefinitionHashes = hashes.filter(hash => !definitions[String(hash)]);
  const definitionCoverage = {
    requested: hashes.length,
    resolved: Object.keys(definitions).length,
    unresolved: unresolvedDefinitionHashes,
    complete: unresolvedDefinitionHashes.length === 0
  };
  const gearAssets: Record<string, Record<string, unknown>> = {};
  await putSession(env, sessionId, { ...session, lastUsedAt: Date.now() });
  return withCors(request, env, json({
    authenticated: true,
    membership,
    characterId,
    index,
    loadout,
    selectedItems,
    profile,
    definitions,
    damageDefinitions,
    breakerDefinitions,
    statDefinitions,
    collectibleDefinitions,
    definitionCoverage,
    gearAssets
  }));
}

type PagePayloadKind = "character" | "build-forge" | "journey" | "vault" | "loadout";
type LoadoutSemanticIndex = {
  manifestVersion?: string;
  weaponDefinitionHashes?: number[];
  loadoutCoverage?: { weaponDefinitions?: number };
};
type JourneySemanticIndex = {
  manifestVersion?: string;
  definitionHashes?: Record<string, number[]>;
};
const PAGE_PAYLOAD_KINDS = new Set<PagePayloadKind>(["character", "build-forge", "journey", "vault", "loadout"]);
const PAGE_READ_VIEWS: Record<PagePayloadKind, readonly string[]> = {
  character: ["characters", "equipped", "inventory", "saved-loadouts", "subclasses", "artifact"],
  "build-forge": ["characters", "equipped", "inventory", "saved-loadouts", "subclasses", "artifact", "manual-editor"],
  journey: ["destinations", "titles", "badges", "triumphs", "records", "quests", "dungeons-raids", "guardian-rank", "patterns-catalysts", "stat-trackers"],
  vault: ["characters", "inventory", "postmaster", "armour", "weapons", "optimiser"],
  loadout: ["characters", "inventory", "postmaster", "armour", "exotics", "set-bonuses", "saved-loadouts"]
};
const PAGE_REQUIRED_PROFILE_DATA: Record<PagePayloadKind, readonly string[]> = {
  character: ["characters.data", "profileInventory.data", "profileProgression.data", "characterInventories.data", "characterProgressions.data", "characterEquipment.data", "characterLoadouts.data", "itemComponents.instances.data", "itemComponents.stats.data", "itemComponents.sockets.data", "itemComponents.reusablePlugs.data"],
  "build-forge": ["characters.data", "profileInventory.data", "profileProgression.data", "characterInventories.data", "characterProgressions.data", "characterEquipment.data", "characterLoadouts.data", "itemComponents.instances.data", "itemComponents.perks.data", "itemComponents.stats.data", "itemComponents.sockets.data", "itemComponents.plugObjectives.data", "itemComponents.reusablePlugs.data"],
  journey: ["characters.data", "profileInventory.data", "profileProgression.data", "characterInventories.data", "characterProgressions.data", "characterActivities.data", "characterEquipment.data", "profilePresentationNodes.data", "characterPresentationNodes.data", "profileCollectibles.data", "characterCollectibles.data", "profileRecords.data", "characterRecords.data", "metrics.data", "characterCraftables.data"],
  vault: ["characters.data", "profileInventory.data", "characterInventories.data", "characterEquipment.data", "itemComponents.instances.data", "itemComponents.stats.data", "itemComponents.sockets.data", "itemComponents.reusablePlugs.data"],
  loadout: ["characters.data", "profileInventory.data", "characterInventories.data", "characterEquipment.data", "characterLoadouts.data", "itemComponents.instances.data", "itemComponents.stats.data", "itemComponents.sockets.data", "itemComponents.reusablePlugs.data"]
};

function hasPreparedProfileData(profile: Record<string, any>, path: string): boolean {
  return path.split(".").reduce<any>((value, key) => value?.[key], profile) !== undefined;
}

function projectPreparedProfileComponents(profile: Record<string, any>, page: PagePayloadKind): void {
  const allowedItemComponents = new Set(PAGE_REQUIRED_PROFILE_DATA[page]
    .filter(path => path.startsWith("itemComponents."))
    .map(path => path.split(".")[1]));
  if (!profile?.itemComponents || typeof profile.itemComponents !== "object") return;
  for (const key of Object.keys(profile.itemComponents)) {
    if (!allowedItemComponents.has(key)) delete profile.itemComponents[key];
  }
}
const JOURNEY_HASH_FIELDS: Record<string, string> = {
  presentationNodeHash: "DestinyPresentationNodeDefinition",
  presentationNodeHashes: "DestinyPresentationNodeDefinition",
  recordHash: "DestinyRecordDefinition",
  recordHashes: "DestinyRecordDefinition",
  completionRecordHash: "DestinyRecordDefinition",
  objectiveHash: "DestinyObjectiveDefinition",
  objectiveHashes: "DestinyObjectiveDefinition",
  collectibleHash: "DestinyCollectibleDefinition",
  collectibleHashes: "DestinyCollectibleDefinition",
  metricHash: "DestinyMetricDefinition",
  metricHashes: "DestinyMetricDefinition",
  guardianRankHash: "DestinyGuardianRankDefinition",
  guardianRankHashes: "DestinyGuardianRankDefinition",
  destinationHash: "DestinyDestinationDefinition",
  destinationHashes: "DestinyDestinationDefinition",
  activityHash: "DestinyActivityDefinition",
  activityHashes: "DestinyActivityDefinition",
  checklistHash: "DestinyChecklistDefinition",
  checklistHashes: "DestinyChecklistDefinition",
  locationHash: "DestinyLocationDefinition",
  locationHashes: "DestinyLocationDefinition",
  questHash: "DestinyInventoryItemDefinition",
  questHashes: "DestinyInventoryItemDefinition",
  stepHash: "DestinyInventoryItemDefinition",
  stepHashes: "DestinyInventoryItemDefinition",
  itemHash: "DestinyInventoryItemDefinition",
  itemHashes: "DestinyInventoryItemDefinition",
  trackingObjectiveHash: "DestinyObjectiveDefinition",
  recordCategoriesRootNodeHash: "DestinyPresentationNodeDefinition",
  recordSealsRootNodeHash: "DestinyPresentationNodeDefinition",
  collectionBadgesRootNodeHash: "DestinyPresentationNodeDefinition",
  craftingRootNodeHash: "DestinyPresentationNodeDefinition",
  metricsRootNodeHash: "DestinyPresentationNodeDefinition"
};

function addJourneyHash(target: Map<string, Set<number>>, type: string, value: unknown): void {
  const values = Array.isArray(value) ? value : [value];
  for (const raw of values) {
    const hash = Number(raw);
    if (!Number.isInteger(hash) || hash <= 0 || hash > UINT32_MAX) continue;
    if (!target.has(type)) target.set(type, new Set());
    target.get(type)!.add(hash);
  }
}

function collectJourneyHashes(value: unknown, target: Map<string, Set<number>>): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const row of value) collectJourneyHashes(row, target);
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const type = JOURNEY_HASH_FIELDS[key];
    if (type) addJourneyHash(target, type, child);
    collectJourneyHashes(child, target);
  }
}

function addComponentKeys(target: Map<string, Set<number>>, type: string, component: unknown): void {
  if (!component || typeof component !== "object" || Array.isArray(component)) return;
  for (const hash of Object.keys(component as Record<string, unknown>)) addJourneyHash(target, type, hash);
}

async function journeyManifestTables(
  profile: DestinyProfilePayload,
  env: Env,
  preparedVersion = "",
  preparedCurrentSeason?: Record<string, any>,
  preparedHashes: Record<string, Iterable<number>> = {}
): Promise<{
  manifestVersion: string;
  tables: Record<string, Record<string, Record<string, unknown>>>;
  currentSeason?: Record<string, any>;
  coverage: { complete: boolean; unresolved: Record<string, number[]> };
}> {
  const wanted = new Map<string, Set<number>>();
  const raw = profile as any;
  addComponentKeys(wanted, "DestinyPresentationNodeDefinition", raw.profilePresentationNodes?.data?.nodes);
  addComponentKeys(wanted, "DestinyRecordDefinition", raw.profileRecords?.data?.records);
  addComponentKeys(wanted, "DestinyCollectibleDefinition", raw.profileCollectibles?.data?.collectibles);
  addComponentKeys(wanted, "DestinyMetricDefinition", raw.metrics?.data?.metrics || raw.profileMetrics?.data?.metrics);
  addComponentKeys(wanted, "DestinyChecklistDefinition", raw.profileProgression?.data?.checklists);
  for (const component of Object.values(raw.characterPresentationNodes?.data || {}) as any[]) {
    addComponentKeys(wanted, "DestinyPresentationNodeDefinition", component?.nodes);
  }
  for (const component of Object.values(raw.characterRecords?.data || {}) as any[]) {
    addComponentKeys(wanted, "DestinyRecordDefinition", component?.records);
  }
  for (const component of Object.values(raw.characterCollectibles?.data || {}) as any[]) {
    addComponentKeys(wanted, "DestinyCollectibleDefinition", component?.collectibles);
  }
  for (const component of Object.values(raw.characterCraftables?.data || {}) as any[]) {
    addComponentKeys(wanted, "DestinyInventoryItemDefinition", component?.craftables);
  }
  for (const component of Object.values(raw.characterProgressions?.data || {}) as any[]) {
    addComponentKeys(wanted, "DestinyChecklistDefinition", component?.checklists);
  }
  addJourneyHash(wanted, "DestinyGuardianRankConstantsDefinition", 1);
  // Account inventory carries thousands of generic itemHash fields that are
  // unrelated to Journey records. Resolving them recursively rebuilt most of
  // the inventory manifest and could exhaust the Worker before first paint.
  // Traverse only Journey state components, then add equipped identities.
  // Vault category splits remain explicitly unavailable when the public
  // Journey catalogue does not classify every stored item.
  for (const component of [
    raw.profileProgression,
    raw.characterProgressions,
    raw.profilePresentationNodes,
    raw.characterPresentationNodes,
    raw.profileCollectibles,
    raw.characterCollectibles,
    raw.profileRecords,
    raw.characterRecords,
    raw.metrics,
    raw.characterCraftables
  ]) collectJourneyHashes(component, wanted);
  for (const equipment of Object.values(raw.characterEquipment?.data || {}) as any[]) {
    for (const item of equipment?.items || []) addJourneyHash(wanted, "DestinyInventoryItemDefinition", item?.itemHash);
  }

  const tables: Record<string, Record<string, Record<string, unknown>>> = {};
  const satisfied = Object.fromEntries(Object.entries(preparedHashes).map(([type, hashes]) => [
    type,
    new Set([...hashes].map(Number).filter(hash => Number.isInteger(hash)))
  ])) as Record<string, Set<number>>;
  let manifestVersion = preparedVersion;
  let currentSeason: Record<string, any> | undefined = preparedCurrentSeason;
  for (let round = 0; round < 16; round += 1) {
    const missing = Object.fromEntries([...wanted].map(([type, hashes]) => [
      type,
      [...hashes].filter(hash => !tables[type]?.[String(hash)] && !satisfied[type]?.has(hash))
    ]).filter(([, hashes]) => (hashes as number[]).length));
    if (!Object.keys(missing).length) break;
    const resolved = await preparedManifestTables(missing, env, manifestVersion, currentSeason);
    manifestVersion = resolved.manifestVersion || manifestVersion;
    currentSeason = resolved.currentSeason || currentSeason;
    let added = 0;
    for (const [type, rows] of Object.entries(resolved.tables)) {
      if (tables[type]) Object.assign(tables[type], rows);
      else tables[type] = rows;
      added += Object.keys(rows).length;
      collectJourneyHashes(rows, wanted);
    }
    if (!added) break;
  }
  const unresolved = Object.fromEntries([...wanted].map(([type, hashes]) => [
    type,
    [...hashes].filter(hash => !tables[type]?.[String(hash)] && !satisfied[type]?.has(hash))
  ]).filter(([, hashes]) => (hashes as number[]).length));
  return { manifestVersion, tables, currentSeason, coverage: { complete: !Object.keys(unresolved).length, unresolved } };
}

function preparedPageEnvelope(
  request: Request,
  env: Env,
  account: Record<string, unknown>,
  prepared: Response
): Response {
  const encoder = new TextEncoder();
  const reader = prepared.body?.getReader();
  const accountJson = JSON.stringify(account);
  const prefix = encoder.encode(`{"schemaVersion":2,"transport":"prepared-page-stream-v1","account":`);
  const accountChunk = encoder.encode(accountJson);
  const preparedPrefix = encoder.encode(`,"prepared":`);
  const suffix = encoder.encode("}");
  const accountBytes = accountChunk.byteLength;
  console.info("prepared_page_account_budget", {
    page: (account as any)?.pageReady?.page || "unknown",
    accountBytes,
    definitions: Object.keys((account as any)?.definitions || {}).length,
    coverageComplete: (account as any)?.pageReady?.coverage?.complete === true
  });
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(prefix);
      controller.enqueue(accountChunk);
      controller.enqueue(preparedPrefix);
      try {
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) controller.enqueue(value);
          }
        } else {
          controller.enqueue(encoder.encode("{}"));
        }
        controller.enqueue(suffix);
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
    cancel(reason) {
      return reader?.cancel(reason);
    }
  });
  return withCors(request, env, new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Forge-Account-Bytes": String(accountBytes),
      "X-Forge-Page-Transport": "prepared-page-stream-v1"
    }
  }));
}

async function preparedJourneyAccountData(
  sessionId: string,
  profile: DestinyProfilePayload,
  env: Env
): Promise<{
  historicalStats: Record<string, unknown> | null;
  activityHistoryByCharacter: Record<string, Record<string, unknown>>;
  coverage: { complete: boolean; missing: string[] };
}> {
  const characterIds = Object.keys(profile.characters?.data || {});
  const stub = recordStub(env, `session:${sessionId}`);
  const requests = [
    ["historical-stats", { kind: "historical-stats" }],
    ...characterIds.map(characterId => [`activity-history:${characterId}`, { kind: "activity-history", characterId, count: 25, page: 0 }])
  ] as const;
  const resolved = await Promise.all(requests.map(async ([key, body]) => {
    const response = await stub.fetch(new Request("https://internal/prepared-read", {
      method: "POST",
      body: JSON.stringify(body)
    })).catch(() => null);
    const payload = response?.ok ? await response.json<Record<string, unknown>>().catch(() => null) : null;
    return [key, payload] as const;
  }));
  const byKey = new Map(resolved);
  const historicalStats = byKey.get("historical-stats") || null;
  const activityHistoryByCharacter = Object.fromEntries(characterIds.map(characterId => [
    characterId,
    byKey.get(`activity-history:${characterId}`) || null
  ]).filter(([, payload]) => payload));
  const missing = [
    ...(historicalStats ? [] : ["historical-stats"]),
    ...characterIds.filter(characterId => !activityHistoryByCharacter[characterId]).map(characterId => `activity-history:${characterId}`)
  ];
  return { historicalStats, activityHistoryByCharacter, coverage: { complete: !missing.length, missing } };
}

async function pagePayloadRoute(request: Request, env: Env, page: PagePayloadKind): Promise<Response> {
  const profileUrl = new URL(request.url);
  profileUrl.pathname = "/bungie/profile";
  profileUrl.search = "";
  profileUrl.searchParams.set("freshness", "display");
  profileUrl.searchParams.set("scope", page === "journey" ? "journey" : "forge");
  profileUrl.searchParams.set("definitions", "client-manifest");
  const preparedStatusPromise = preparedManifestTables({}, env);
  const profileResponse = await profileRoute(new Request(profileUrl, { headers: request.headers }), env);
  if (!profileResponse.ok) return profileResponse;
  const payload = await profileResponse.json<Record<string, any>>();

  const preparedStatus = await preparedStatusPromise;
  let preparedVersion = preparedStatus.manifestVersion;
  let currentSeason: Record<string, any> | undefined = preparedStatus.currentSeason;
  let pageBundleResponse: Response | null = null;
  let loadoutSemanticIndex: LoadoutSemanticIndex | null = null;
  let journeySemanticIndex: JourneySemanticIndex | null = null;
  if (env.MANIFEST_DATA && preparedVersion) {
    const bundleUrl = new URL("https://manifest/page-bundle");
    bundleUrl.searchParams.set("page", page === "journey" ? "journey" : page === "loadout" ? "loadout" : "common");
    bundleUrl.searchParams.set("version", preparedVersion);
    const indexUrl = new URL("https://manifest/page-index");
    indexUrl.searchParams.set("page", page === "journey" ? "journey" : "loadout");
    indexUrl.searchParams.set("version", preparedVersion);
    const [bundleResponse, indexResponse] = await Promise.all([
      env.MANIFEST_DATA.fetch(new Request(bundleUrl)).catch(() => null),
      page === "journey" || page === "loadout" || page === "build-forge"
        ? env.MANIFEST_DATA.fetch(new Request(indexUrl)).catch(() => null)
        : Promise.resolve(null)
    ]);
    if (bundleResponse?.ok && bundleResponse.body) pageBundleResponse = bundleResponse;
    if (page === "journey") {
      journeySemanticIndex = indexResponse?.ok
        ? await indexResponse.json<JourneySemanticIndex>().catch(() => null)
        : null;
      if (journeySemanticIndex?.manifestVersion !== preparedVersion) journeySemanticIndex = null;
    } else {
      loadoutSemanticIndex = indexResponse?.ok
        ? await indexResponse.json<LoadoutSemanticIndex>().catch(() => null)
        : null;
      if (loadoutSemanticIndex?.manifestVersion !== preparedVersion) loadoutSemanticIndex = null;
    }
  }

  if (page === "journey") {
    const prepared = await journeyManifestTables(
      payload.profile || {},
      env,
      preparedVersion,
      currentSeason,
      journeySemanticIndex?.definitionHashes || {}
    );
    preparedVersion = prepared.manifestVersion || preparedVersion;
    currentSeason = prepared.currentSeason || currentSeason;
    payload.journeyAccountManifestTables = prepared.tables;
    payload.journeyAccountDefinitionCoverage = prepared.coverage;
    payload.definitionCoverage = {
      requested: Object.values(prepared.tables).reduce((sum, rows) => sum + Object.keys(rows).length, 0),
      resolved: Object.values(prepared.tables).reduce((sum, rows) => sum + Object.keys(rows).length, 0),
      unresolved: Object.values(prepared.coverage.unresolved).flat(),
      complete: prepared.coverage.complete,
      source: "prepared-bulk-manifest"
    };
    const sessionId = cookieValue(request, SESSION_COOKIE);
    payload.preparedAccountData = sessionId
      ? await preparedJourneyAccountData(sessionId, payload.profile || {}, env)
      : { historicalStats: null, activityHistoryByCharacter: {}, coverage: { complete: false, missing: ["session"] } };
  }

  if (page === "loadout") {
    payload.definitionCoverage = {
      requested: 0,
      resolved: 0,
      unresolved: [],
      complete: Boolean(pageBundleResponse),
      source: "prepared-bulk-manifest"
    };
  }

  if (currentSeason?.season) {
    payload.currentSeason = currentSeason.season;
    payload.currentSeasonNumber = currentSeason.season.seasonNumber;
  }

  try {
    await enrichPreparedPageAccount(payload, env, page, {
      manifestVersion: preparedVersion,
      weaponDefinitionHashes: loadoutSemanticIndex?.weaponDefinitionHashes,
      expectedWeaponDefinitions: loadoutSemanticIndex?.loadoutCoverage?.weaponDefinitions
    });
  } catch (error) {
    console.error("prepared_page_semantic_enrichment_failed", {
      page,
      message: error instanceof Error ? error.message : String(error)
    });
  }

  const missing: string[] = [];
  if (!preparedVersion) missing.push("manifest-version");
  if (!pageBundleResponse) missing.push("prepared-page-bundle");
  for (const path of PAGE_REQUIRED_PROFILE_DATA[page]) {
    if (!hasPreparedProfileData(payload.profile || {}, path)) missing.push(`profile:${path}`);
  }
  if (payload.definitionCoverage?.complete !== true) missing.push("owned-item-definitions");
  if (page !== "journey" && page !== "loadout" && PROFILE_STAT_HASHES.some(hash => !payload.statDefinitions?.[String(hash)])) missing.push("guardian-stat-definitions");
  if (page === "journey") {
    if (payload.journeyAccountDefinitionCoverage?.complete !== true) missing.push("journey-account-definitions");
    if (payload.preparedAccountData?.coverage?.complete !== true) missing.push("journey-account-history");
    if (!payload.profile?.profileRecords?.data) missing.push("records");
    if (!payload.profile?.profilePresentationNodes?.data) missing.push("presentation-nodes");
    if (!payload.profile?.profileCollectibles?.data) missing.push("collectibles");
    if (!payload.profile?.metrics?.data && !payload.profile?.profileMetrics?.data) missing.push("metrics");
  }
  if (page === "build-forge" && !Number.isInteger(Number(payload.currentSeasonNumber))) missing.push("current-season");
  payload.pageReady = {
    page,
    manifestVersion: preparedVersion,
    definitionSource: "prepared-bulk-manifest",
    accountSource: payload.displaySnapshot?.source || "snapshot",
    generatedAt: Date.now(),
    views: PAGE_READ_VIEWS[page],
    datasets: {
      characters: Object.keys(payload.profile?.characters?.data || {}).length,
      ownedItems: allProfileItems(payload.profile || {}).length,
      inventoryDefinitions: Object.keys(payload.definitions || {}).length,
      accountManifestTables: Object.fromEntries(Object.entries(payload.journeyAccountManifestTables || {}).map(([type, rows]) => [type, Object.keys(rows as object).length])),
      preparedBundle: Boolean(pageBundleResponse)
    },
    coverage: { complete: missing.length === 0, missing }
  };
  projectPreparedProfileComponents(payload.profile || {}, page);
  compactPreparedProfilePlugLists(payload);
  const prepared = pageBundleResponse || new Response("{}", { headers: { "Content-Type": "application/json" } });
  return preparedPageEnvelope(request, env, payload, prepared);
}

async function oauthCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  if (oauthError) return json({ error: "bungie_authorization_denied", detail: oauthError }, 400);
  if (!code || !state) return json({ error: "missing_oauth_parameters" }, 400);

  const tx = await takeOAuth(env, state);
  if (!tx || tx.state !== state || Date.now() - tx.createdAt > OAUTH_TTL_MS) {
    return json({ error: "invalid_or_expired_oauth_state" }, 400);
  }

  const token = await exchangeCode(code, env);
  const membershipData = await fetchMemberships(token.access_token, env);
  const destinyMemberships: Membership[] = (membershipData.Response?.destinyMemberships || []).map((m) => ({
    membershipType: m.membershipType,
    membershipId: m.membershipId,
    ...(m.displayName ? { displayName: m.displayName } : {})
  }));
  const primaryMembershipId = membershipData.Response?.primaryMembershipId || null;
  const activeDestinyMembership = destinyMemberships.find((m) => m.membershipId === primaryMembershipId) || destinyMemberships[0] || null;
  const now = Date.now();
  const sessionId = randomToken();
  const csrfToken = randomToken();
  const session: SessionRecord = {
    kind: "session",
    createdAt: now,
    lastUsedAt: now,
    absoluteExpiresAt: now + SESSION_TTL_MS,
    accessToken: token.access_token,
    refreshToken: token.refresh_token || "",
    accessExpiresAt: now + token.expires_in * 1000,
    refreshExpiresAt: token.refresh_expires_in ? now + token.refresh_expires_in * 1000 : null,
    bungieMembershipId: token.membership_id || null,
    destinyMemberships,
    primaryMembershipId,
    activeDestinyMembership,
    csrfToken,
    ...(tx.accessIdentityKey ? { accessIdentityKey: tx.accessIdentityKey } : {})
  };
  await putRecord(env, `session:${sessionId}`, session);
  if (tx.accessIdentityKey) {
    await putAccessBinding(env, tx.accessIdentityKey, sessionId, session.absoluteExpiresAt);
  }

  // Finish the one-time Bungie approval by preparing the private account data
  // before Forge opens. Later pages reuse this superset snapshot silently.
  const preparedProfiles = await Promise.all([CHARACTER_PROFILE_COMPONENTS, JOURNEY_PROFILE_COMPONENTS].map(components =>
    recordStub(env, `session:${sessionId}`).fetch(new Request("https://internal/profile-snapshot", {
      method: "POST",
      body: JSON.stringify({ components })
    }))
  )).catch(error => console.warn("initial_profile_snapshot_warm_failed", { error: String(error) }));
  const characterPayload = Array.isArray(preparedProfiles)
    ? await preparedProfiles[0]?.clone().json<BungieApiResponse<DestinyProfilePayload>>().catch(() => null)
    : null;
  const characterIds = Object.keys(characterPayload?.Response?.characters?.data || {});
  await Promise.all([
    recordStub(env, `session:${sessionId}`).fetch(new Request("https://internal/prepared-read", {
      method: "POST",
      body: JSON.stringify({ kind: "historical-stats" })
    })),
    ...characterIds.map(characterId => recordStub(env, `session:${sessionId}`).fetch(new Request("https://internal/prepared-read", {
      method: "POST",
      body: JSON.stringify({ kind: "activity-history", characterId, count: 25, page: 0 })
    })))
  ]).catch(error => console.warn("initial_account_data_warm_failed", { error: String(error) }));

  const returnUrl = new URL(tx.returnUrl);
  returnUrl.searchParams.set("bungie", "connected");
  return new Response(null, {
    status: 302,
    headers: {
      Location: returnUrl.toString(),
      "Set-Cookie": sessionCookie(sessionId, Math.floor(SESSION_TTL_MS / 1000)),
      "Cache-Control": "no-store"
    }
  });
}

async function sessionRoute(request: Request, env: Env): Promise<Response> {
  const sessionId = cookieValue(request, SESSION_COOKIE);
  if (!sessionId) return withCors(request, env, json({ authenticated: false }, 401));
  const storedSession = await getSession(env, sessionId);
  if (!storedSession || storedSession.absoluteExpiresAt <= Date.now()) {
    if (storedSession) await revokeSession(env, sessionId, storedSession);
    return withCors(request, env, json({ authenticated: false }, 401, { "Set-Cookie": clearSessionCookie() }));
  }
  let session: SessionRecord;
  try {
    session = await refreshAccessToken(sessionId, storedSession, env);
  } catch (error) {
    if (error instanceof Error && error.message === "bungie_reauthentication_required") {
      await revokeSession(env, sessionId, storedSession);
      return withCors(request, env, json(
        { authenticated: false, error: "bungie_reauthentication_required" },
        401,
        { "Set-Cookie": clearSessionCookie() }
      ));
    }
    throw error;
  }
  session = await renewSession(env, sessionId, session);
  return withCors(request, env, json({
    authenticated: true,
    bungieMembershipId: session.bungieMembershipId,
    destinyMemberships: session.destinyMemberships,
    primaryMembershipId: session.primaryMembershipId,
    activeDestinyMembership: session.activeDestinyMembership,
    accessExpiresAt: session.accessExpiresAt,
    csrfToken: session.csrfToken,
    capabilities: { destinyActions: DESTINY_ACTION_CAPABILITIES }
  }, 200, { "Set-Cookie": sessionCookie(sessionId, Math.floor(SESSION_TTL_MS / 1000)) }));
}

async function logoutRoute(request: Request, env: Env): Promise<Response> {
  const sessionId = cookieValue(request, SESSION_COOKIE);
  if (sessionId) await revokeSession(env, sessionId, await getSession(env, sessionId));
  return withCors(request, env, json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() }));
}

async function authenticatedSession(
  request: Request,
  env: Env
): Promise<{ sessionId: string; session: SessionRecord } | Response> {
  const sessionId = cookieValue(request, SESSION_COOKIE);
  if (!sessionId) {
    return withCors(request, env, json({ authenticated: false, error: "authentication_required" }, 401));
  }

  const storedSession = await getSession(env, sessionId);
  if (!storedSession || storedSession.absoluteExpiresAt <= Date.now()) {
    if (storedSession) await revokeSession(env, sessionId, storedSession);
    return withCors(request, env, json(
      { authenticated: false, error: "session_expired" },
      401,
      { "Set-Cookie": clearSessionCookie() }
    ));
  }

  try {
    const refreshed = await refreshAccessToken(sessionId, storedSession, env);
    const session = await renewSession(env, sessionId, refreshed);
    return { sessionId, session };
  } catch (error) {
    if (error instanceof Error && error.message === "bungie_reauthentication_required") {
      await revokeSession(env, sessionId, storedSession);
      return withCors(request, env, json(
        { authenticated: false, error: "bungie_reauthentication_required" },
        401,
        { "Set-Cookie": clearSessionCookie() }
      ));
    }
    throw error;
  }
}

function bungieHeaders(session: SessionRecord, env: Env): HeadersInit {
  return {
    Authorization: `Bearer ${session.accessToken}`,
    "X-API-Key": env.BUNGIE_API_KEY,
    "User-Agent": "ASTRIX-PARADOX/alpha (+https://astrixparadox.com)"
  };
}

type BungieActionKind = "equip-items" | "transfer-item" | "pull-from-postmaster" | "socket-plug-free" | "loadout-equip" | "loadout-snapshot" | "loadout-identifiers" | "loadout-clear";
type JsonObject = Record<string, unknown>;

const UINT32_MAX = 4_294_967_295;
const VERIFIED_CHARACTER_TTL_MS = 5 * 60 * 1000;

function decimalId(value: unknown): string | null {
  const resolved = String(value ?? "");
  return /^\d{1,30}$/.test(resolved) ? resolved : null;
}

function uint32(value: unknown): number | null {
  const resolved = Number(value);
  return Number.isInteger(resolved) && resolved >= 0 && resolved <= UINT32_MAX ? resolved : null;
}

async function actionRequestBody(request: Request): Promise<JsonObject | null> {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (Number.isFinite(length) && length > 32_768) return null;
  if (!String(request.headers.get("Content-Type") || "").toLowerCase().startsWith("application/json")) return null;
  const raw = await request.text().catch(() => "");
  if (!raw || new TextEncoder().encode(raw).byteLength > 32_768) return null;
  let payload: unknown = null;
  try { payload = JSON.parse(raw); } catch { return null; }
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload as JsonObject : null;
}

function mutationOriginAllowed(request: Request, env: Env): boolean {
  const origin = request.headers.get("Origin");
  return Boolean(origin && allowedOrigins(env).includes(origin));
}

async function verifySessionCharacter(auth: { sessionId: string; session: SessionRecord }, characterId: string, env: Env): Promise<SessionRecord | null> {
  const cached = auth.session.verifiedCharacterIds || [];
  if (cached.includes(characterId) && Date.now() - Number(auth.session.verifiedCharactersAt || 0) <= VERIFIED_CHARACTER_TTL_MS) return auth.session;
  const membership = auth.session.activeDestinyMembership;
  if (!membership) return null;
  const profileUrl = new URL(`${BUNGIE_PLATFORM}/Destiny2/${membership.membershipType}/Profile/${encodeURIComponent(membership.membershipId)}/`);
  profileUrl.searchParams.set("components", "200");
  const response = await fetch(profileUrl, { headers: bungieHeaders(auth.session, env) });
  const payload = await response.json<BungieApiResponse<DestinyProfilePayload>>().catch(() => null);
  if (!response.ok || !payload?.Response) return null;
  const verifiedCharacterIds = Object.keys(payload.Response.characters?.data || {});
  const updated = { ...auth.session, verifiedCharacterIds, verifiedCharactersAt: Date.now(), lastUsedAt: Date.now() };
  await putSession(env, auth.sessionId, updated);
  return verifiedCharacterIds.includes(characterId) ? updated : null;
}

function actionPayload(kind: BungieActionKind, body: JsonObject): { path: string; body: JsonObject; characterId: string } | null {
  const characterId = decimalId(body.characterId);
  const membershipType = Number(body.membershipType);
  if (!characterId || !Number.isInteger(membershipType)) return null;
  if (kind === "equip-items") {
    const itemIds = Array.isArray(body.itemIds) ? [...new Set(body.itemIds.map(decimalId).filter((value): value is string => Boolean(value)))] : [];
    if (!itemIds.length || itemIds.length > 12 || itemIds.length !== (body.itemIds as unknown[]).length) return null;
    return { path: "/Destiny2/Actions/Items/EquipItems/", characterId, body: { itemIds, characterId, membershipType } };
  }
  if (kind === "transfer-item") {
    const itemId = decimalId(body.itemId), itemReferenceHash = uint32(body.itemReferenceHash), stackSize = Number(body.stackSize);
    if (!itemId || itemReferenceHash === null || !Number.isInteger(stackSize) || stackSize !== 1 || typeof body.transferToVault !== "boolean") return null;
    return { path: "/Destiny2/Actions/Items/TransferItem/", characterId, body: { itemReferenceHash, stackSize, transferToVault: body.transferToVault, itemId, characterId, membershipType } };
  }
  if (kind === "pull-from-postmaster") {
    const itemId = decimalId(body.itemId), itemReferenceHash = uint32(body.itemReferenceHash), stackSize = Number(body.stackSize);
    if (!itemId || itemReferenceHash === null || !Number.isInteger(stackSize) || stackSize < 1 || stackSize > 9_999) return null;
    return { path: "/Destiny2/Actions/Items/PullFromPostmaster/", characterId, body: { itemReferenceHash, stackSize, itemId, characterId, membershipType } };
  }
  if (kind === "socket-plug-free") {
    const itemId = decimalId(body.itemId), plug = body.plug && typeof body.plug === "object" && !Array.isArray(body.plug) ? body.plug as JsonObject : null;
    const socketIndex = Number(plug?.socketIndex), socketArrayType = Number(plug?.socketArrayType), plugItemHash = uint32(plug?.plugItemHash);
    if (!itemId || !Number.isInteger(socketIndex) || socketIndex < 0 || socketIndex > 99 || ![0, 1].includes(socketArrayType) || plugItemHash === null) return null;
    return { path: "/Destiny2/Actions/Items/InsertSocketPlugFree/", characterId, body: { plug: { socketIndex, socketArrayType, plugItemHash }, itemId, characterId, membershipType } };
  }
  const loadoutIndex = Number(body.loadoutIndex);
  if (!Number.isInteger(loadoutIndex) || loadoutIndex < 0 || loadoutIndex > 19) return null;
  if (kind === "loadout-equip") return { path: "/Destiny2/Actions/Loadouts/EquipLoadout/", characterId, body: { loadoutIndex, characterId, membershipType } };
  if (kind === "loadout-clear") return { path: "/Destiny2/Actions/Loadouts/ClearLoadout/", characterId, body: { loadoutIndex, characterId, membershipType } };
  const identifiers: JsonObject = {};
  for (const key of ["colorHash", "iconHash", "nameHash"] as const) {
    if (body[key] === undefined) continue;
    const value = uint32(body[key]);
    if (value === null) return null;
    identifiers[key] = value;
  }
  const path = kind === "loadout-snapshot" ? "/Destiny2/Actions/Loadouts/SnapshotLoadout/" : "/Destiny2/Actions/Loadouts/UpdateLoadoutIdentifiers/";
  return { path, characterId, body: { ...identifiers, loadoutIndex, characterId, membershipType } };
}

async function bungieActionRoute(request: Request, env: Env, kind: BungieActionKind): Promise<Response> {
  if (!mutationOriginAllowed(request, env)) return withCors(request, env, json({ error: "origin_not_allowed" }, 403));
  const auth = await authenticatedSession(request, env);
  if (auth instanceof Response) return auth;
  if (!request.headers.get("X-CSRF-Token") || request.headers.get("X-CSRF-Token") !== auth.session.csrfToken) {
    return withCors(request, env, json({ error: "csrf_validation_failed" }, 403));
  }
  const requestBody = await actionRequestBody(request);
  if (!requestBody) return withCors(request, env, json({ error: "invalid_action_request" }, 400));
  const membership = auth.session.activeDestinyMembership;
  if (!membership || Number(requestBody.membershipType) !== membership.membershipType) return withCors(request, env, json({ error: "membership_mismatch" }, 403));
  const action = actionPayload(kind, requestBody);
  if (!action) return withCors(request, env, json({ error: "invalid_action_request" }, 400));
  const verifiedSession = await verifySessionCharacter(auth, action.characterId, env);
  if (!verifiedSession) return withCors(request, env, json({ error: "character_binding_mismatch" }, 403));

  const headers = new Headers(bungieHeaders(verifiedSession, env));
  headers.set("Content-Type", "application/json");
  const upstream = await fetch(`${BUNGIE_PLATFORM}${action.path}`, { method: "POST", headers, body: JSON.stringify(action.body) });
  const payload = await upstream.json<BungieApiResponse<unknown>>().catch(() => null);
  if (!upstream.ok || !payload || Number(payload.ErrorCode ?? 1) !== 1) {
    console.warn("bungie_action_failed", { kind, status: upstream.status, errorCode: payload?.ErrorCode, errorStatus: payload?.ErrorStatus });
    const status = upstream.status >= 400 && upstream.status < 500 ? upstream.status : Number(payload?.ErrorCode ?? 1) !== 1 ? 409 : 502;
    return withCors(request, env, json((payload || { error: "bungie_action_failed" }) as JsonObject, status));
  }
  await putSession(env, auth.sessionId, { ...verifiedSession, lastUsedAt: Date.now() });
  return withCors(request, env, json(payload as JsonObject));
}

async function bungieAccountRoute(request: Request, env: Env): Promise<Response> {
  const auth = await authenticatedSession(request, env);
  if (auth instanceof Response) return auth;

  const membershipData = await fetchMemberships(auth.session.accessToken, env);
  const account = membershipData.Response?.bungieNetUser;
  if (!account) {
    return withCors(request, env, json({ error: "bungie_account_not_found" }, 404));
  }

  await putSession(env, auth.sessionId, { ...auth.session, lastUsedAt: Date.now() });
  return withCors(request, env, json({
    authenticated: true,
    membershipId: account.membershipId || auth.session.bungieMembershipId,
    uniqueName: account.uniqueName || null,
    displayName: account.displayName || account.uniqueName || auth.session.activeDestinyMembership?.displayName || null,
    profilePicturePath: account.profilePicturePath || null,
    profilePictureWidePath: account.profilePictureWidePath || null
  }));
}

async function activityHistoryRoute(request: Request, env: Env): Promise<Response> {
  const auth = await authenticatedSession(request, env);
  if (auth instanceof Response) return auth;

  const membership = auth.session.activeDestinyMembership;
  if (!membership) {
    return withCors(request, env, json({ error: "destiny_membership_not_found" }, 404));
  }

  const requestUrl = new URL(request.url);
  const membershipType = Number(requestUrl.searchParams.get("membershipType"));
  const membershipId = requestUrl.searchParams.get("membershipId")?.trim() || "";
  const characterId = requestUrl.searchParams.get("characterId")?.trim() || "";
  const count = Number(requestUrl.searchParams.get("count") ?? 25);
  const page = Number(requestUrl.searchParams.get("page") ?? 0);

  if (
    !Number.isInteger(membershipType) ||
    !/^\d+$/.test(membershipId) ||
    !/^\d+$/.test(characterId) ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 25 ||
    !Number.isInteger(page) ||
    page < 0
  ) {
    return withCors(request, env, json({ error: "invalid_activity_history_request" }, 400));
  }

  if (
    membershipType !== membership.membershipType ||
    membershipId !== membership.membershipId
  ) {
    return withCors(request, env, json({ error: "membership_mismatch" }, 403));
  }

  const response = await recordStub(env, `session:${auth.sessionId}`).fetch(new Request("https://internal/prepared-read", {
    method: "POST",
    body: JSON.stringify({ kind: "activity-history", characterId, count, page })
  }));
  const payload = await response.json<BungieApiResponse<Record<string, unknown>>>().catch(() => null);
  if (!response.ok || !payload?.Response) {
    console.error("bungie_activity_history_failed", {
      status: response.status,
      errorCode: payload?.ErrorCode,
      errorStatus: payload?.ErrorStatus,
      characterId
    });
    return withCors(request, env, json({
      error: "bungie_activity_history_failed",
      status: response.status,
      errorCode: payload?.ErrorCode ?? null,
      errorStatus: payload?.ErrorStatus ?? null
    }, response.status >= 400 && response.status < 500 ? response.status : 502));
  }

  return withCors(request, env, json(payload as Record<string, unknown>, 200, {
    "X-Forge-Account-Source": response.headers.get("X-Forge-Account-Source") || "snapshot"
  }));
}

async function historicalStatsRoute(request: Request, env: Env): Promise<Response> {
  const auth = await authenticatedSession(request, env);
  if (auth instanceof Response) return auth;

  const membership = auth.session.activeDestinyMembership;
  if (!membership) {
    return withCors(request, env, json({ error: "destiny_membership_not_found" }, 404));
  }

  const response = await recordStub(env, `session:${auth.sessionId}`).fetch(new Request("https://internal/prepared-read", {
    method: "POST",
    body: JSON.stringify({ kind: "historical-stats" })
  }));
  const payload = await response.json<BungieApiResponse<Record<string, unknown>>>().catch(() => null);
  if (!response.ok || !payload?.Response) {
    console.error("bungie_historical_stats_failed", {
      status: response.status,
      errorCode: payload?.ErrorCode,
      errorStatus: payload?.ErrorStatus
    });
    return withCors(request, env, json({
      error: "bungie_historical_stats_failed",
      status: response.status,
      errorCode: payload?.ErrorCode ?? null,
      errorStatus: payload?.ErrorStatus ?? null
    }, response.status >= 400 && response.status < 500 ? response.status : 502));
  }

  return withCors(request, env, json(payload as Record<string, unknown>, 200, {
    "X-Forge-Account-Source": response.headers.get("X-Forge-Account-Source") || "snapshot"
  }));
}

async function pgcrRoute(request: Request, env: Env, instanceId: string): Promise<Response> {
  const auth = await authenticatedSession(request, env);
  if (auth instanceof Response) return auth;

  if (!/^\d+$/.test(instanceId)) {
    return withCors(request, env, json({ error: "invalid_activity_instance_id" }, 400));
  }

  const response = await recordStub(env, `session:${auth.sessionId}`).fetch(new Request("https://internal/prepared-read", {
    method: "POST",
    body: JSON.stringify({ kind: "pgcr", instanceId })
  }));
  const payload = await response.json<BungieApiResponse<Record<string, unknown>>>().catch(() => null);
  if (!response.ok || !payload?.Response) {
    console.error("bungie_pgcr_failed", {
      status: response.status,
      errorCode: payload?.ErrorCode,
      errorStatus: payload?.ErrorStatus,
      instanceId
    });
    return withCors(request, env, json({
      error: "bungie_pgcr_failed",
      status: response.status,
      errorCode: payload?.ErrorCode ?? null,
      errorStatus: payload?.ErrorStatus ?? null
    }, response.status >= 400 && response.status < 500 ? response.status : 502));
  }

  return withCors(request, env, json(payload as Record<string, unknown>, 200, {
    "X-Forge-Account-Source": response.headers.get("X-Forge-Account-Source") || "snapshot"
  }));
}

export default {
  scheduled(_controller: ScheduledController, env: Env, context: ExecutionContext): void {
    context.waitUntil(refreshDestinyManifestMetadata(env).catch(error => {
      console.error("bungie_manifest_metadata_refresh_failed", {
        message: error instanceof Error ? error.message : String(error)
      });
    }));
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    try {
      if (url.hostname === INTERNAL_ACCESS_HOST) {
        if (request.method === "GET" && url.pathname === "/internal/access/start") {
          const accessIdentityKey = internalAccessIdentity(url);
          return accessIdentityKey
            ? startOAuth(request, env, accessIdentityKey)
            : json({ error: "invalid_access_identity" }, 400, { "Cache-Control": "no-store" });
        }
        if (request.method === "GET" && url.pathname === "/internal/access/recovery-ticket") {
          return accessRecoveryTicketRoute(request, env);
        }
        return json({ error: "not_found" }, 404, { "Cache-Control": "no-store" });
      }
      if (request.method === "OPTIONS") return handlePreflight(request, env);
      if (request.method === "GET" && (url.pathname === "/health" || url.pathname === "/v1/health")) {
        return json({ service: "forge-destiny-backend", status: "ready" });
      }
      if (request.method === "GET" && url.pathname === "/diagnostics/runtime-bindings") {
        return json({
          BUNGIE_API_KEY: bindingInfo(env.BUNGIE_API_KEY),
          BUNGIE_CLIENT_ID: bindingInfo(env.BUNGIE_CLIENT_ID),
          BUNGIE_CLIENT_SECRET: bindingInfo(env.BUNGIE_CLIENT_SECRET),
          OAUTH_REDIRECT_URI: bindingInfo(env.OAUTH_REDIRECT_URI)
        }, 200, { "Cache-Control": "no-store" });
      }
      if (request.method === "GET" && url.pathname === "/bungie/start") return startOAuth(request, env);
      if (request.method === "GET" && url.pathname === "/diagnostics/data") {
        const response = await env.MANIFEST_DATA?.fetch(new Request("https://manifest/status")).catch(() => null);
        const prepared = response?.ok ? await response.json<{ manifestVersion: string; tables: Record<string,unknown> }>() : null;
        const manifest = await destinyManifest(env);
        return withCors(request, env, json({ prepared: Boolean(prepared), manifestVersion: manifest.version, preparedVersion: prepared?.manifestVersion || null, tables: Object.keys(prepared?.tables || {}), current: prepared?.manifestVersion === manifest.version }, 200, { "Cache-Control": "no-store" }));
      }
      if (request.method === "GET" && url.pathname === "/bungie/callback") return oauthCallback(request, env);
      if (request.method === "GET" && url.pathname === "/session") return sessionRoute(request, env);
      if (request.method === "GET" && url.pathname === "/session/recover") return sessionRecoveryRoute(request, env);
      if (request.method === "GET" && url.pathname === "/bungie/account") return bungieAccountRoute(request, env);
      if (request.method === "GET" && url.pathname === "/bungie/manifest") return manifestMetadataRoute(request, env);
      if (request.method === "GET" && url.pathname === "/bungie/manifest/component") return manifestComponentRoute(request, env);
      if (request.method === "GET" && url.pathname === "/bungie/manifest/definition") return manifestDefinitionRoute(request, env);
      if (request.method === "GET" && url.pathname === "/bungie/manifest/definitions") return manifestDefinitionsRoute(request, env);
      if (request.method === "GET" && url.pathname === "/bungie/current-season") return currentSeasonRoute(request, env);
      if (request.method === "GET" && url.pathname.startsWith("/bungie/page/")) {
        const page = decodeURIComponent(url.pathname.slice("/bungie/page/".length)) as PagePayloadKind;
        return PAGE_PAYLOAD_KINDS.has(page)
          ? pagePayloadRoute(request, env, page)
          : withCors(request, env, json({ error: "page_payload_not_found" }, 404));
      }
      if (request.method === "GET" && (url.pathname === "/bungie/profile" || url.pathname === "/v1/destiny/profile")) {
        return profileRoute(request, env);
      }
      if (request.method === "GET" && (url.pathname === "/bungie/loadout" || url.pathname === "/v1/destiny/loadout")) {
        return loadoutRoute(request, env);
      }
      if (request.method === "GET" && url.pathname === "/bungie/activity-history") {
        return activityHistoryRoute(request, env);
      }
      if (request.method === "GET" && url.pathname === "/bungie/historical-stats") {
        return historicalStatsRoute(request, env);
      }
      if (request.method === "GET" && url.pathname.startsWith("/bungie/pgcr/")) {
        return pgcrRoute(request, env, decodeURIComponent(url.pathname.slice("/bungie/pgcr/".length)));
      }
      if (request.method === "POST" && url.pathname === "/bungie/actions/equip-items") return bungieActionRoute(request, env, "equip-items");
      if (request.method === "POST" && url.pathname === "/bungie/actions/transfer-item") return bungieActionRoute(request, env, "transfer-item");
      if (request.method === "POST" && url.pathname === "/bungie/actions/pull-from-postmaster") return bungieActionRoute(request, env, "pull-from-postmaster");
      if (request.method === "POST" && url.pathname === "/bungie/actions/socket-plug-free") return bungieActionRoute(request, env, "socket-plug-free");
      if (request.method === "POST" && url.pathname === "/bungie/actions/loadout/equip") return bungieActionRoute(request, env, "loadout-equip");
      if (request.method === "POST" && url.pathname === "/bungie/actions/loadout/snapshot") return bungieActionRoute(request, env, "loadout-snapshot");
      if (request.method === "POST" && url.pathname === "/bungie/actions/loadout/identifiers") return bungieActionRoute(request, env, "loadout-identifiers");
      if (request.method === "POST" && url.pathname === "/bungie/actions/loadout/clear") return bungieActionRoute(request, env, "loadout-clear");
      if (request.method === "POST" && url.pathname === "/logout") return logoutRoute(request, env);
      return withCors(request, env, json({ error: "not_found" }, 404));
    } catch (error) {
      console.error("worker_request_failed", {
        path: url.pathname,
        message: error instanceof Error ? error.message : String(error)
      });
      return withCors(request, env, json({
        error: "server_error",
        path: url.pathname
      }, 500));
    }
  }
} satisfies ExportedHandler<Env>;
