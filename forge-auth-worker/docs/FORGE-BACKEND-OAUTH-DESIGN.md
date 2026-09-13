# Forge backend and Bungie OAuth design

Status: design and scaffold only. No live OAuth, token exchange, secret access, session creation, Bungie API call or Destiny build logic is implemented in this branch.

## Locked architecture

- Frontend: GitHub Pages serves static browser files only.
- Backend: one Cloudflare Worker deployment named `astrix-destiny-backend`.
- Public frontend origin: `https://app.astrixparadox.com`.
- API hostname: `https://api.astrixparadox.com`.
- OAuth hostname: `https://auth.astrixparadox.com`.
- Final Bungie redirect URI: `https://auth.astrixparadox.com/bungie/callback`.

The redirect URI above must be provisioned, tested for reachability and then registered exactly in the Bungie application before token-exchange code is written. Do not add a trailing slash or alternate hostname unless the whole design is deliberately changed first.

Both `api.` and `auth.` may point to the same Worker deployment. The Worker separates them by hostname and route. Cloudflare Custom Domains should be used because each hostname is the Worker origin.

## Domain and route map

### `auth.astrixparadox.com`

| Method | Route | Purpose now | Future gated purpose |
|---|---|---|---|
| GET | `/health` | Public placeholder health response | Remains public and contains no secrets |
| GET | `/bungie/start` | Returns `501 OAuth gate closed` | Create state and PKCE values where applicable, then redirect to Bungie authorization |
| GET | `/bungie/callback` | Returns `501 OAuth gate closed` | Validate callback and perform server-side authorization-code exchange |
| GET | `/session` | Returns `501 OAuth gate closed` | Return minimal signed-in status, never Bungie tokens |
| POST | `/logout` | Returns `501 OAuth gate closed` | Revoke local session and delete the browser cookie |

### `api.astrixparadox.com`

| Method | Route | Purpose now | Future gated purpose |
|---|---|---|---|
| GET | `/v1/health` | Public placeholder health response | Operational health only |
| GET | `/v1/me` | Returns `501 OAuth gate closed` | Return minimal authenticated Forge profile |
| GET | `/v1/destiny/profile` | Returns `501 OAuth gate closed` | Read private Destiny profile data through server-held credentials |
| GET | `/v1/destiny/inventory` | Returns `501 OAuth gate closed` | Read inventory and vault data |

No Armor 3.0, loadout, scoring, stat, mod or recommendation routes belong in this step.

## Bungie permission scope

The required read-only scope is `ReadDestinyInventoryAndVault` with enum value `64`. Bungie's API documentation states that this is the only scope a Destiny 2 application needs for read operations against private Destiny 2 data, including inventory and vault data.

Do not request `MoveEquipDestinyItems` or other write scopes in the first login release. Adding write permissions would be a separate security and product decision.

## OAuth authorization-code flow design

This is the intended server-side flow. It is not implemented yet.

1. The browser opens `GET https://auth.astrixparadox.com/bungie/start`.
2. The Worker creates a cryptographically random, short-lived OAuth transaction record containing at least a state value, creation time, intended return path and one-time-use status.
3. The Worker stores that transaction server-side and sets only an opaque, short-lived transaction cookie in the browser.
4. The Worker redirects the browser to Bungie's authorization endpoint with the client ID, exact redirect URI, requested read-only scope and state value.
5. Bungie redirects the browser to `https://auth.astrixparadox.com/bungie/callback` with an authorization code and state value, or with an error.
6. The Worker validates hostname, callback path, transaction cookie, state, age and one-time-use status before doing anything else.
7. OAuth gate TODO: the Worker sends the authorization code to Bungie's token endpoint from the server. `BUNGIE_CLIENT_SECRET` is read only from Cloudflare's encrypted Worker secret binding. It is never sent to the browser.
8. OAuth gate TODO: the Worker validates the token response and stores Bungie access and refresh tokens server-side, encrypted at rest where supported.
9. The Worker creates a Forge session record that references the server-side Bungie token record.
10. The Worker sends the browser a short-lived opaque session cookie and redirects to an approved frontend return path.
11. Authenticated API calls send only the Forge session cookie. The Worker resolves the server-side session and uses the server-held Bungie access token when needed.
12. When the Bungie access token expires, the Worker uses the server-held refresh token. The refreshed tokens replace the previous server-side values atomically.

## Session and token-storage design

### Browser holds

The browser holds only an opaque Forge session identifier in a cookie. It must not hold the Bungie access token, Bungie refresh token or client secret.

Recommended production cookie:

- Name: `__Host-astrix_session`
- `Secure`
- `HttpOnly`
- `Path=/`
- `SameSite=Lax`
- No `Domain` attribute
- Short idle lifetime, with a separately enforced absolute lifetime server-side

Because a `__Host-` cookie cannot be shared across subdomains, authenticated API calls should be made through the same host that issued the cookie or the final deployment should deliberately use an auth gateway pattern. Before implementation, Miguel must approve one of these two options:

1. Recommended: the frontend calls authenticated endpoints through `auth.astrixparadox.com`, which internally routes API work to the same Worker.
2. Alternative: issue a carefully scoped parent-domain cookie for `.astrixparadox.com`. This is less isolated and needs an explicit security decision.

The scaffold keeps `api.` and `auth.` routes separate but does not issue cookies, so this decision remains open without blocking provisioning.

### Server stores

The server-side store must contain:

- Forge session ID hash
- Bungie membership/user reference
- encrypted Bungie access token
- encrypted Bungie refresh token
- access-token expiry
- refresh-token expiry if supplied
- created, last-used and absolute-expiry timestamps
- revocation status

A Durable Object or another server-side datastore may be used. Cloudflare KV alone should not be chosen for security-sensitive rotating session state without reviewing its consistency model. The final store is still a Miguel decision before implementation.

### Logout

`POST /logout` will:

1. require an allowed origin and CSRF protection;
2. revoke the server-side Forge session;
3. remove or invalidate the linked token record according to the retention policy;
4. return an expired cookie using the exact original cookie attributes;
5. never return Bungie tokens.

## CORS and browser security

- Allow production browser requests only from `https://app.astrixparadox.com`.
- Development origins must be separately enumerated and must never use `*` with credentials.
- Send `Access-Control-Allow-Credentials: true` only for routes that require the session cookie.
- Allow only the required methods and headers.
- Reject unrecognised origins rather than reflecting them.
- Add `Vary: Origin` when returning an origin-specific CORS response.
- State-changing endpoints require CSRF protection in addition to `SameSite` cookies.
- Redirect return paths must be selected from a server-side allowlist to prevent open redirects.
- Authentication responses should use `Cache-Control: no-store`.
- Logs must redact authorization codes, cookies, access tokens, refresh tokens and secrets.

## Secret handling

`BUNGIE_CLIENT_SECRET` will live only in Cloudflare's encrypted Worker secret store. It must never be placed in:

- GitHub Pages files;
- browser JavaScript;
- a generated bundle;
- `wrangler.toml` variables;
- repository files;
- GitHub Actions output that becomes downloadable by the browser;
- logs or error responses.

The secret name may be declared later for deployment validation, but no code in this scaffold reads it.

## Provisioning checklist for Miguel

### Cloudflare account and zone

- [ ] Sign in to or create the Cloudflare account that will own Forge production infrastructure.
- [ ] Add `astrixparadox.com` as an active Cloudflare zone if it is not already managed there.
- [ ] Confirm the registrar nameservers point to Cloudflare and the zone is active.
- [ ] Confirm there are no conflicting CNAME or Worker route records for `api.astrixparadox.com` or `auth.astrixparadox.com`.

### Worker creation

- [ ] Install Node.js LTS locally.
- [ ] From `forge-worker/`, run `npm install`.
- [ ] Run `npx wrangler login` and approve access to the correct Cloudflare account.
- [ ] Run `npm run check`.
- [ ] Run `npm run deploy` only after reviewing the Worker name and account.
- [ ] Confirm the placeholder Worker responds on its temporary `workers.dev` address.

### Custom domains

- [ ] In Cloudflare Workers & Pages, open `astrix-destiny-backend`.
- [ ] Add custom domain `api.astrixparadox.com`.
- [ ] Add custom domain `auth.astrixparadox.com`.
- [ ] Allow Cloudflare to create the DNS records and certificates.
- [ ] Confirm `https://api.astrixparadox.com/v1/health` returns the placeholder JSON response.
- [ ] Confirm `https://auth.astrixparadox.com/health` returns the placeholder JSON response.
- [ ] Confirm `https://auth.astrixparadox.com/bungie/callback` returns the intentional `501 OAuth gate closed` response.

### Bungie application

- [ ] Keep the Bungie application configured as a confidential client.
- [ ] Set the exact redirect URI to `https://auth.astrixparadox.com/bungie/callback`.
- [ ] Request only `ReadDestinyInventoryAndVault` for the read-only first release.
- [ ] Confirm the registered origin and application website values are consistent with the final frontend domain.
- [ ] Do not paste the Bungie client secret into any frontend, GitHub Pages or repository file.

### Server-side storage and secrets

- [ ] Choose the server-side session/token datastore, recommended starting option: Durable Objects with a documented retention and deletion policy.
- [ ] Create the `BUNGIE_CLIENT_SECRET` Worker secret through Cloudflare dashboard or `wrangler secret put` only after the Worker exists.
- [ ] Create any future token-encryption key as a separate Worker secret.
- [ ] Confirm deployed secret values are hidden and not logged.

### Six OAuth-gate conditions

OAuth implementation remains blocked until Miguel confirms all six:

- [ ] 1. Cloudflare Worker platform is provisioned.
- [ ] 2. `api.astrixparadox.com` and `auth.astrixparadox.com` resolve to the Worker.
- [ ] 3. `https://auth.astrixparadox.com/bungie/callback` is locked and registered with Bungie.
- [ ] 4. Worker encrypted secret storage is configured.
- [ ] 5. The session and server-side token datastore are selected.
- [ ] 6. CORS, cookie-host strategy, CSRF and logout behaviour are approved.

## Miguel versus scaffolded work

### Miguel must do

- Own or access the Cloudflare account and active DNS zone.
- Deploy the Worker to his Cloudflare account.
- Attach both custom domains and verify certificates and DNS.
- Register the exact redirect URI in the Bungie developer application.
- Add the Bungie client secret through Cloudflare's secret UI or Wrangler prompt.
- Choose the final session datastore and cookie-host strategy.
- Confirm all six OAuth-gate conditions in writing.

### This branch scaffolds

- The locked hostname and route design.
- The exact proposed Bungie callback URI.
- The authorization-code flow and session security design.
- A TypeScript Worker with health and gated placeholder handlers.
- Local scripts and configuration for validation and deployment.
- No secret values, token exchange, session code or Bungie calls.

## Pending decisions

1. Whether authenticated browser calls use the `auth.` host as a gateway, or whether a parent-domain cookie is accepted for direct `api.` calls. The auth-gateway approach is recommended.
2. The final server-side datastore for sessions and refresh tokens. Durable Objects are recommended for the first design review.
3. Session idle and absolute lifetime values.
4. Whether a staging hostname and separate Bungie application will be created before production authentication work.

Until these are settled and all six gates are confirmed, the OAuth placeholder routes must continue returning `501`.
