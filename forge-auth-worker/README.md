# Forge Destiny backend scaffold

This directory contains the Cloudflare Worker for the Forge Destiny backend.

It is intentionally stopped at the OAuth gate. The current routes are placeholders only and return either a health response or `501 OAuth gate closed`.

## What is not implemented

- Bungie authorization redirect
- authorization-code token exchange
- `BUNGIE_CLIENT_SECRET` access
- access-token or refresh-token storage
- sessions or cookies
- live Bungie API calls
- Armor 3.0 or build logic

## Local checks

```bash
npm install
npm run check
npm run dev
```

Local development uses the `workers.dev` or localhost fallback path matching in `src/index.ts`.

## Deploy only after review

```bash
npx wrangler login
npm run deploy
```

The scaffold leaves custom domains commented out in `wrangler.toml`. Miguel must provision and verify the Cloudflare zone and Worker before attaching:

- `api.astrixparadox.com`
- `auth.astrixparadox.com`

The exact proposed Bungie callback is:

```text
https://auth.astrixparadox.com/bungie/callback
```

Read `docs/FORGE-BACKEND-OAUTH-DESIGN.md` before changing any OAuth route or adding any secret.
