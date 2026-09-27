export const OAUTH_TTL_MS = 30 * 60 * 1000;
export const OAUTH_INTRO_COOKIE = "astrix_oauth_intro";
const RECOVERY_URL = "https://astrixparadox.com/astrix-app/pages/sign-in/";

export function oauthRecovery(returnUrl?: string): Response {
  const target = new URL(RECOVERY_URL);
  if (returnUrl) target.searchParams.set("return", returnUrl);
  return new Response(null, { status: 302, headers: {
    Location: target.toString(), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer"
  } });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
}

export function oauthIntro(returnUrl: string, internal = false): Response {
  const action = internal ? "/__astrix/bungie/start" : "/bungie/start";
  // A normal navigation avoids form-action checks on the subsequent Bungie redirect.
  const continueUrl = action + "?" + new URLSearchParams({ return: returnUrl, continue: "1" });
  return new Response(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign in | ASTRIX PARADOX</title>
<link rel="stylesheet" href="https://astrixparadox.com/css/astrix-palette.css">
<link rel="stylesheet" href="https://astrixparadox.com/astrix-app/pages/sign-in/sign-in.css?continue=20260927">
<link rel="stylesheet" href="https://use.typekit.net/tnp6kbq.css">
<link rel="stylesheet" href="https://astrixparadox.com/css/astrix-site-typography.css">
</head><body><main><p class="brand">ASTRIX PARADOX</p><h1>Sign in with Bungie</h1>
<p>You'll sign in through Bungie. The first time, Bungie asks which platform you play on, then it remembers you.</p>
<a class="sign-in-continue" href="${escapeHtml(continueUrl)}">Continue</a>
</main><footer>Destiny 2 content and materials are trademarks and copyrights of Bungie, Inc. ASTRIX PARADOX is not affiliated with or endorsed by Bungie.</footer></body></html>`, { headers: {
    "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; style-src https://astrixparadox.com https://use.typekit.net https://p.typekit.net; font-src https://use.typekit.net; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
  } });
}
