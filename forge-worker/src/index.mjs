/**
 * ASTRIX PARADOX - CLOUDFLARE EDGE WORKER
 * Handles CORS preflight, Bungie API proxying, OAuth 2.0 token management,
 * and KV-backed manifest edge caching.
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key, X-Forge-Client",
  "Access-Control-Max-Age": "86400"
};

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
      ...extraHeaders
    }
  });
}

function errorResponse(message, status = 500, details = null) {
  return jsonResponse({ error: true, message, details }, status);
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      if (pathname === "/api/health" || pathname === "/health") {
        return jsonResponse({ status: "healthy", service: "forge-worker", environment: env.ENVIRONMENT || "production" });
      }

      if (pathname === "/auth/token" && request.method === "POST") {
        return handleOAuthToken(request, env);
      }

      if (pathname === "/auth/refresh" && request.method === "POST") {
        return handleOAuthRefresh(request, env);
      }

      if (pathname.startsWith("/manifest/cache/")) {
        return handleManifestCache(pathname, request, env, ctx);
      }

      if (pathname.startsWith("/api/bungie/")) {
        return handleBungieProxy(pathname, request, env);
      }

      return errorResponse(`Route not found: ${pathname}`, 404);
    } catch (err) {
      return errorResponse("Internal Edge Worker Error", 500, err.message);
    }
  }
};

async function handleOAuthToken(request, env) {
  const body = await request.json().catch(() => ({}));
  const { code } = body;

  if (!code) {
    return errorResponse("Missing authorization code", 400);
  }

  const tokenUrl = env.OAUTH_TOKEN_URL || "https://www.bungie.net/Platform/App/OAuth/Token/";
  const params = new URLSearchParams();
  params.append("grant_type", "authorization_code");
  params.append("code", code);
  params.append("client_id", env.BUNGIE_CLIENT_ID);
  if (env.BUNGIE_CLIENT_SECRET) {
    params.append("client_secret", env.BUNGIE_CLIENT_SECRET);
  }

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  });

  const data = await response.json();
  return jsonResponse(data, response.status);
}

async function handleOAuthRefresh(request, env) {
  const body = await request.json().catch(() => ({}));
  const { refresh_token } = body;

  if (!refresh_token) {
    return errorResponse("Missing refresh token", 400);
  }

  const tokenUrl = env.OAUTH_TOKEN_URL || "https://www.bungie.net/Platform/App/OAuth/Token/";
  const params = new URLSearchParams();
  params.append("grant_type", "refresh_token");
  params.append("refresh_token", refresh_token);
  params.append("client_id", env.BUNGIE_CLIENT_ID);
  if (env.BUNGIE_CLIENT_SECRET) {
    params.append("client_secret", env.BUNGIE_CLIENT_SECRET);
  }

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  });

  const data = await response.json();
  return jsonResponse(data, response.status);
}

async function handleManifestCache(pathname, request, env, ctx) {
  const cacheKey = pathname.replace("/manifest/cache/", "").trim();
  if (!cacheKey) {
    return errorResponse("Missing manifest cache key", 400);
  }

  if (request.method === "GET") {
    if (!env.FORGE_CACHE) {
      return errorResponse("KV binding FORGE_CACHE is not configured", 503);
    }

    const cachedData = await env.FORGE_CACHE.get(cacheKey, { type: "json" });
    if (cachedData) {
      return jsonResponse(cachedData, 200, { "X-Forge-Cache": "HIT" });
    }

    return errorResponse(`Manifest key '${cacheKey}' not found in edge cache`, 404, { "X-Forge-Cache": "MISS" });
  }

  if (request.method === "POST") {
    const payload = await request.json().catch(() => null);
    if (!payload) {
      return errorResponse("Invalid JSON payload for cache insertion", 400);
    }

    if (env.FORGE_CACHE) {
      ctx.waitUntil(env.FORGE_CACHE.put(cacheKey, JSON.stringify(payload), { expirationTtl: 604800 }));
    }

    return jsonResponse({ stored: true, key: cacheKey }, 201);
  }

  return errorResponse("Method Not Allowed", 405);
}

async function handleBungieProxy(pathname, request, env) {
  const subPath = pathname.replace("/api/bungie/", "");
  const targetUrl = new URL(`${env.BUNGIE_API_ROOT || "https://www.bungie.net/Platform"}/${subPath}`);

  const originalUrl = new URL(request.url);
  originalUrl.searchParams.forEach((value, key) => {
    targetUrl.searchParams.set(key, value);
  });

  const headers = new Headers();
  headers.set("X-API-Key", env.BUNGIE_API_KEY || "");
  headers.set("User-Agent", "ASTRIX-Paradox-Platform/1.0");

  const authHeader = request.headers.get("Authorization");
  if (authHeader) {
    headers.set("Authorization", authHeader);
  }

  const forwardOptions = {
    method: request.method,
    headers
  };

  if (request.method === "POST" || request.method === "PUT") {
    forwardOptions.body = await request.text();
    headers.set("Content-Type", request.headers.get("Content-Type") || "application/json");
  }

  const bungieResponse = await fetch(targetUrl.toString(), forwardOptions);
  const responseData = await bungieResponse.text();

  return new Response(responseData, {
    status: bungieResponse.status,
    headers: {
      "Content-Type": bungieResponse.headers.get("Content-Type") || "application/json",
      ...CORS_HEADERS
    }
  });
}
