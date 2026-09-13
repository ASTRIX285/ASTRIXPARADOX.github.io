export function json(body: Record<string, unknown>, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...extraHeaders
    }
  });
}

export function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname.endsWith(".workers.dev");
}

export function allowedOrigins(env: Env): string[] {
  return env.APP_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean);
}

export function approvedReturnUrl(candidate: string | null, env: Env): string {
  if (!candidate) return env.DEFAULT_RETURN_URL;
  try {
    const url = new URL(candidate);
    return allowedOrigins(env).includes(url.origin) ? url.toString() : env.DEFAULT_RETURN_URL;
  } catch {
    return env.DEFAULT_RETURN_URL;
  }
}

export function withCors(request: Request, env: Env, response: Response): Response {
  const origin = request.headers.get("Origin");
  if (!origin) return response;
  if (!allowedOrigins(env).includes(origin)) return json({ error: "origin_not_allowed" }, 403);
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.append("Vary", "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function handlePreflight(request: Request, env: Env): Response {
  const origin = request.headers.get("Origin");
  if (!origin || !allowedOrigins(env).includes(origin)) return json({ error: "origin_not_allowed" }, 403);
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-CSRF-Token",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Max-Age": "600",
      "Vary": "Origin"
    }
  });
}
