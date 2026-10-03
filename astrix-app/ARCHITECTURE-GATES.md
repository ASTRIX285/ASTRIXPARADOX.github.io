# Forge Destiny architecture gates

This document records the decisions and mandatory gates that apply after the static visual prototype.

## Current phase

The `/astrix-app/` prototype is static HTML, CSS and JavaScript with placeholder Destiny content. It contains no Bungie OAuth flow, no backend calls, no live account data and no build recommendation logic.

## Backend decision required before OAuth

GitHub Pages is not a backend. `ASTRIX285.github.io` can serve the static frontend only and must never receive or expose `BUNGIE_CLIENT_SECRET`.

Before any authentication code is implemented, the project owner must select and configure a separate server-side host. Recommended first choice for this project: **Cloudflare Workers**.

Proposed production separation:

- `app.astrixparadox.com` serves the static web application.
- `api.astrixparadox.com` serves authenticated Forge API endpoints from Cloudflare Workers.
- `auth.astrixparadox.com` may serve OAuth-specific routes from the same Worker deployment, or it may redirect to equivalent routes under `api.astrixparadox.com`. The final route arrangement must be fixed before the Bungie redirect URI is registered.

The backend choice is not complete until the Worker account, deployment, environment variables, DNS records and redirect URI are configured.

## Secret handling

`BUNGIE_CLIENT_SECRET` must be stored only in the selected backend host's encrypted server-side secret store. For Cloudflare Workers this means a Worker secret, configured through the Cloudflare dashboard or Wrangler secret command.

The browser may receive a short-lived session cookie or another deliberately designed session token, but it must never receive:

- `BUNGIE_CLIENT_SECRET`
- a source file containing the secret
- a generated JavaScript bundle containing the secret
- a GitHub Actions substitution that writes the secret into browser-downloadable output

GitHub Actions secrets are build-time values only. They are not runtime secrets for GitHub Pages and must not be used to inject the Bungie client secret into static files.

## OAuth gate

No login or OAuth code may be written until all of the following are confirmed:

1. Backend platform selected and provisioned.
2. Backend domain confirmed.
3. Bungie redirect URI confirmed and registered.
4. Server-side secret storage configured.
5. Session and token-storage approach documented.
6. CORS, cookie and logout behaviour agreed.

Creating the Bungie application and choosing a confidential client type are preparatory steps only. The login flow has not started.

## Armor 3.0 gate

No real armour scoring, stat targets, mod recommendations, loadout optimisation or build recommendation logic may use the legacy six-stat armour model.

The rules engine must first be designed for the Armor 3.0 system introduced with Edge of Fate in July 2025, including:

- Weapons, Health, Class, Grenade, Super and Melee stats
- the 200 stat cap
- gear tiers
- armour set bonuses
- three-stat armour archetypes

The prototype may display neutral placeholder cards and labels, but it must not imply that legacy-stat calculations are valid.

## Division gate

Applies to the Division WorkBench (`astrix-app/games/division/` and `astrix-app/platform/adapters/division/`). Added 3 October 2026, before any Division feature code.

1. No hardcoded item tables in engine, adapter or UI code. All game data comes from catalogue files through the schema loader.
2. Every catalogue record carries a `provenance` block from the shared contract (`astrix-app/platform/contracts/provenance.schema.json`). Division accepts two kinds: `official-post` (url, gameVersion, retrievedOn) and `in-game-capture` (capturedBy, capturedOn, gameVersion, where, note; only the value is committed, never a screenshot). `client-data` is rejected for Division because it would mean datamined values. A field with no source yet is `{ "pending": true, "reason": "..." }` (`pending.schema.json`), never a guess. A record can be partly pending.
3. Engine code lives in `games/division/engine/` and never forks per title. Title folders (`td2/`, later `td3/`) hold `data/` and `assets/` only.
4. Every image under `games/division/*/assets/` appears in that folder's `manifest.json` with `"useAllowed": "yes"` and `"approvedByMiguel": true`. No image is committed until Ubisoft's fan content terms are confirmed.
5. No Ubisoft sign-in, session token capture, scraping of authenticated services or private endpoints. The Ubisoft adapter stays a stub until Ubisoft gives authorised access.

Enforced by `astrix-app/tools/validate-division.mjs` and its self-test `test-division-validator.mjs`, run on every PR by `.github/workflows/validate-division.yml`.

## Game folder contract

Applies to every folder under `astrix-app/games/`. Added 3 October 2026.

1. Each game folder has `index.mjs` (a module that passes `platform/contracts/game-module.mjs`), `schema/`, `docs/SCOPE.md` and `README.md`.
2. Data lives in `data/` for a single-title game, or `<title>/data/` for a multi-title game (Division: `td2/data/`). Schemas live in `schema/`, never in a data folder.
3. Every data record has a valid provenance block (`platform/contracts/provenance.schema.json`): `official-post`, `in-game-capture` or `client-data`. Every pending field is `{ "pending": true, "reason": "..." }` (`platform/contracts/pending.schema.json`).
4. A game that can't meet a rule yet is listed by name and rule in `EXEMPTIONS` in `astrix-app/tools/validate-game-folders.mjs`, with a reason. An exemption that is no longer needed fails the check, so it gets removed.

Enforced by `astrix-app/tools/validate-game-folders.mjs` and its self-test `test-game-folders.mjs`, run inside `paradox-validator.mjs` and by `.github/workflows/validate-division.yml`.

## Next implementation sequence

1. Review and approve the visual prototype.
2. Select and provision the backend host.
3. Confirm `api.` and `auth.` domain routing.
4. Document and implement the OAuth flow server-side.
5. Update the data model and rules specification for Armor 3.0.
6. Only then implement live inventory, build analysis and recommendations.
