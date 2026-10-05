/**
 * ASTRIX PARADOX - AETHERIUM ARMORY WORKER
 * Read-only edge proxy for the public AION 2 armory (NCSOFT). GET only.
 * No secrets, no cookies, no login. Visitor headers are never forwarded upstream.
 * Every upstream URL is built from fixed constants and validated parameters, so
 * the Worker can only reach the whitelisted armory endpoints. No route lists or
 * walks characters: search always asks for page 1 only.
 */

const CHARACTER_API = "https://aion2.plaync.com/api/character/";
const SEARCH_API = "https://api-search.plaync.com/aion2global/search/v2/character";
const UPSTREAM_HOSTS = new Set(["aion2.plaync.com", "api-search.plaync.com"]);
const UPSTREAM_HEADERS = Object.freeze({
  "User-Agent": "AstrixParadoxArmory/1.0 (+https://astrixparadox.com)",
  Accept: "application/json"
});

// Region allowlist. NA is listed so it can be switched on later, but stays off.
export const REGIONS = Object.freeze({
  eu: Object.freeze({ enabled: true, lang: "en-US" }),
  na: Object.freeze({ enabled: false, lang: "en-US" })
});

export const CACHE_TTL_SECONDS = 600;
export const RATE_LIMIT = Object.freeze({ limit: 30, windowMs: 60_000 });
export const UPSTREAM_TIMEOUT_MS = 8_000;
const CACHE_VERSION = "v1";

const ALLOWED_ORIGINS = new Set(["https://astrixparadox.com", "https://www.astrixparadox.com"]);
const LOCAL_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/;

const DIGITS = (max) => new RegExp(`^\\d{1,${max}}$`);
const RULES = Object.freeze({
  serverId: DIGITS(6),
  boardId: DIGITS(4),
  id: DIGITS(12),
  enchantLevel: DIGITS(3),
  slotPos: DIGITS(3)
});
const CHARACTER_ID = /^[A-Za-z0-9_\-+/]{8,128}={0,2}$/;
const NAME = /^[\p{L}\p{N}_-]{1,24}$/u;

// Expected top-level keys per upstream call. Anything else is a shape change.
const SHAPES = Object.freeze({
  search: ["list", "pagination"],
  info: ["profile"],
  equipment: ["equipment"],
  item: ["id"],
  daevanion: ["nodeList"]
});

class RequestError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

class UpstreamError extends Error {}

export function isAllowedOrigin(origin) {
  return typeof origin === "string" && (ALLOWED_ORIGINS.has(origin) || LOCAL_ORIGIN.test(origin));
}

function corsHeaders(origin) {
  if (!isAllowedOrigin(origin)) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}

function json(data, status, origin, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      ...corsHeaders(origin),
      ...extra
    }
  });
}

function readParam(params, key, rule) {
  const value = params.get(key);
  if (value === null || !rule.test(value)) throw new RequestError(400, `invalid_${key}`);
  return value;
}

function readRegion(params) {
  const region = (params.get("region") || "eu").toLowerCase();
  const config = Object.hasOwn(REGIONS, region) ? REGIONS[region] : null;
  if (!config) throw new RequestError(400, "invalid_region");
  if (!config.enabled) throw new RequestError(400, "region_disabled");
  return { region, lang: config.lang };
}

// The search returns characterId already URL-encoded (ending in %3D). Accept it
// raw or encoded, decode to the plain id, then encode exactly once upstream.
export function normaliseCharacterId(raw) {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 200) {
    throw new RequestError(400, "invalid_characterId");
  }
  let value = raw;
  if (value.includes("%")) {
    try {
      value = decodeURIComponent(value);
    } catch {
      throw new RequestError(400, "invalid_characterId");
    }
  }
  if (!CHARACTER_ID.test(value)) throw new RequestError(400, "invalid_characterId");
  return value;
}

function readName(params) {
  const raw = params.get("name");
  const name = typeof raw === "string" ? raw.trim().normalize("NFC") : "";
  if (!NAME.test(name)) throw new RequestError(400, "invalid_name");
  return name;
}

function characterQuery(ctx) {
  return `lang=${encodeURIComponent(ctx.lang)}&region=${encodeURIComponent(ctx.region)}`
    + `&serverId=${ctx.serverId}&characterId=${encodeURIComponent(ctx.characterId)}`;
}

function readCharacter(params) {
  const regionInfo = readRegion(params);
  const serverId = readParam(params, "serverId", RULES.serverId);
  const characterId = normaliseCharacterId(params.get("characterId") ?? "");
  return { ...regionInfo, serverId, characterId };
}

// Each route returns a normalised cache key plus the upstream calls it needs.
const ROUTES = Object.freeze({
  "/aion2/search"(params) {
    const { region, lang } = readRegion(params);
    const name = readName(params);
    const url = `${SEARCH_API}?keyword=${encodeURIComponent(name)}&page=1&size=40`
      + `&region=${encodeURIComponent(region)}&localeInfo=${encodeURIComponent(lang)}`;
    return {
      key: ["search", region, name],
      region,
      calls: [{ name: "search", url, shape: SHAPES.search }],
      build: ([search]) => search
    };
  },
  "/aion2/character"(params) {
    const ctx = readCharacter(params);
    const query = characterQuery(ctx);
    return {
      key: ["character", ctx.region, ctx.serverId, ctx.characterId],
      region: ctx.region,
      calls: [
        { name: "info", url: `${CHARACTER_API}info?${query}`, shape: SHAPES.info },
        { name: "equipment", url: `${CHARACTER_API}equipment?${query}`, shape: SHAPES.equipment }
      ],
      build: ([info, equipment]) => ({ info, equipment })
    };
  },
  "/aion2/item"(params) {
    const ctx = readCharacter(params);
    const id = readParam(params, "id", RULES.id);
    const enchantLevel = readParam(params, "enchantLevel", RULES.enchantLevel);
    const slotPos = readParam(params, "slotPos", RULES.slotPos);
    const url = `${CHARACTER_API}equipment/item?${characterQuery(ctx)}`
      + `&id=${id}&enchantLevel=${enchantLevel}&slotPos=${slotPos}`;
    return {
      key: ["item", ctx.region, ctx.serverId, ctx.characterId, id, enchantLevel, slotPos],
      region: ctx.region,
      calls: [{ name: "item", url, shape: SHAPES.item }],
      build: ([item]) => item
    };
  },
  "/aion2/daevanion"(params) {
    const ctx = readCharacter(params);
    const boardId = readParam(params, "boardId", RULES.boardId);
    const url = `${CHARACTER_API}daevanion/detail?${characterQuery(ctx)}&boardId=${boardId}`;
    return {
      key: ["daevanion", ctx.region, ctx.serverId, ctx.characterId, boardId],
      region: ctx.region,
      calls: [{ name: "daevanion", url, shape: SHAPES.daevanion }],
      build: ([board]) => board
    };
  }
});

export function isWhitelistedUpstream(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" || !UPSTREAM_HOSTS.has(parsed.hostname) || parsed.port) return false;
  if (parsed.hostname === "api-search.plaync.com") return parsed.pathname === "/aion2global/search/v2/character";
  return ["/api/character/info", "/api/character/equipment", "/api/character/equipment/item", "/api/character/daevanion/detail"]
    .includes(parsed.pathname);
}

function hasShape(body, keys) {
  return body !== null && typeof body === "object" && !Array.isArray(body)
    && keys.every((key) => Object.hasOwn(body, key) && body[key] !== null && body[key] !== undefined);
}

async function callUpstream(fetchImpl, call, timeoutMs) {
  if (!isWhitelistedUpstream(call.url)) throw new UpstreamError("not_whitelisted");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(call.url, {
      method: "GET",
      headers: { ...UPSTREAM_HEADERS },
      redirect: "manual",
      signal: controller.signal
    });
    if (!response || response.status !== 200) throw new UpstreamError(`status_${response?.status}`);
    const body = await response.json();
    if (!hasShape(body, call.shape)) throw new UpstreamError(`shape_${call.name}`);
    return body;
  } catch (error) {
    if (error instanceof UpstreamError) throw error;
    throw new UpstreamError(error?.name === "AbortError" ? "timeout" : "fetch_failed");
  } finally {
    clearTimeout(timer);
  }
}

function cacheKey(parts) {
  return [CACHE_VERSION, ...parts.map((part) => encodeURIComponent(part))].join(":");
}

async function readCache(kv, key) {
  if (!kv) return null;
  try {
    const hit = await kv.get(key, "json");
    return hit && typeof hit.fetchedAt === "string" && hit.payload ? hit : null;
  } catch {
    return null;
  }
}

function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

// In-memory fixed window per isolate. Used when no Workers rate limit binding
// is configured (local dev, tests) and as the per-isolate guard otherwise.
function createMemoryLimiter({ limit, windowMs }, now) {
  const hits = new Map();
  return (key) => {
    const t = now();
    const entry = hits.get(key);
    if (!entry || t - entry.start >= windowMs) {
      if (hits.size > 10_000) hits.clear();
      hits.set(key, { start: t, count: 1 });
      return true;
    }
    entry.count += 1;
    return entry.count <= limit;
  };
}

async function allowRequest(env, memoryLimiter, ip) {
  if (!memoryLimiter(ip)) return false;
  const binding = env?.AION2_RATE_LIMITER;
  if (binding && typeof binding.limit === "function") {
    try {
      const { success } = await binding.limit({ key: ip });
      return success !== false;
    } catch {
      return true;
    }
  }
  return true;
}

export function createWorker(options = {}) {
  const fetchImpl = options.fetch || ((...args) => fetch(...args));
  const now = options.now || (() => Date.now());
  const timeoutMs = options.timeoutMs ?? UPSTREAM_TIMEOUT_MS;
  const memoryLimiter = createMemoryLimiter(options.rateLimit || RATE_LIMIT, now);

  return {
    async fetch(request, env = {}, ctx = {}) {
      const origin = request.headers.get("Origin");
      const originRefused = origin !== null && !isAllowedOrigin(origin);

      if (request.method === "OPTIONS") {
        if (originRefused) return new Response(null, { status: 403, headers: { Vary: "Origin" } });
        return new Response(null, { status: 204, headers: corsHeaders(origin) });
      }
      if (originRefused) return json({ error: "origin_not_allowed" }, 403, origin);
      if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405, origin, { Allow: "GET, OPTIONS" });

      const url = new URL(request.url);
      const route = Object.hasOwn(ROUTES, url.pathname) ? ROUTES[url.pathname] : null;
      if (!route) return json({ error: "not_found" }, 404, origin);

      if (!(await allowRequest(env, memoryLimiter, clientIp(request)))) {
        return json({ error: "rate_limited" }, 429, origin, { "Retry-After": "60" });
      }

      let plan;
      try {
        plan = route(url.searchParams);
      } catch (error) {
        if (error instanceof RequestError) return json({ error: error.code }, error.status, origin);
        throw error;
      }

      const key = cacheKey(plan.key);
      const kv = env.AION2_CACHE;
      const cached = await readCache(kv, key);
      if (cached) {
        return json({ ...cached.payload, meta: { region: plan.region, fetchedAt: cached.fetchedAt, cache: "hit" } }, 200, origin, {
          "Cache-Control": "public, max-age=60"
        });
      }

      let payload;
      try {
        const bodies = await Promise.all(plan.calls.map((call) => callUpstream(fetchImpl, call, timeoutMs)));
        payload = plan.build(bodies);
      } catch {
        return json({ error: "armory_unavailable" }, 502, origin, { "Cache-Control": "no-store" });
      }

      const fetchedAt = new Date(now()).toISOString();
      if (kv) {
        const write = kv.put(key, JSON.stringify({ fetchedAt, payload }), { expirationTtl: CACHE_TTL_SECONDS })
          .catch(() => {});
        if (typeof ctx.waitUntil === "function") ctx.waitUntil(write);
        else await write;
      }
      return json({ ...payload, meta: { region: plan.region, fetchedAt, cache: "miss" } }, 200, origin, {
        "Cache-Control": "public, max-age=60"
      });
    }
  };
}

export default createWorker();
