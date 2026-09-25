# Reports A

This PR adds the aggregate browser data layer, seven series, character filtering,
activity cards, difficulty tables and activity details. History, PGCRs and
encounters belong to PR B, which must branch from main after A merges.

The existing session authenticates GET /bungie/reports. The new read route streams
profile components 100, 200, 202 and 900, or one AggregateActivityStats request per
character. It does not persist responses in Durable Objects, KV or edge caches.
It preserves Bungie's error envelope and Retry-After. Credentials stay in the
existing service. Browser snapshots are keyed by membership type and ID in
IndexedDB; concurrent preparation is coalesced. A session event starts preparation
alongside the existing hero profile. Public definitions and unmodified image URLs
come from Bungie. Card image preparation has eight concurrent requests; failed art
stays absent instead of initiating another request when selected.

## Data limits requiring review

- Aggregate `activityCompletions` means Cleared, not Entered. Entered reads
  `activitiesEntered` only when returned; otherwise it is `-`. History in B can
  supply run counts. Flawless remains `-` until run data supports it.
- Fastest reads `fastestCompletionMsForActivity`, divided by 1000. A zero clear
  count cannot produce a fastest clear. Score reads `bestSingleGameScore`.
- Newest-first sorting uses the checked-in public release-order table for raids,
  dungeons and Exotic missions. Other series sort by name. Mission variants share
  the mission's debut order. Featured Pantheon encounters share their content
  release wave, rather than moving every weekly rotation. The runtime builder and
  offline validator reject any uncovered raid, dungeon or Exotic mission.
- Unlabelled difficulties remain `-`. Display names supply labelled difficulties;
  generic original names such as "Nightfall Grandmaster" must not collapse
  different strikes. Activity type hashes also classify newer raids and dungeons
  whose mode arrays are absent.
- Counts sum the current character roster. Absent aggregate rows represent no
  reported activity; missing stat fields remain unknown. Account requests must
  all succeed before a new snapshot is published.

References used for the API contract (no competitor implementation copied):

- https://bungie-net.github.io/multi/operation_get_Destiny2-GetDestinyAggregateActivityStats.html
- https://bungie-net.github.io/multi/schema_Destiny-Definitions-DestinyActivityDefinition.html
- https://github.com/Bungie-net/api/issues/434 (fastest field and zero-completion case)
- https://github.com/Bungie-net/api/issues/2026 (aggregate completion semantics)

## Verification

`node astrix-app/tools/paradox-validator.mjs` includes the three existing Python
validators, scope guard, Reports fixtures and the footer validator. Footer coverage
includes every tracked HTML page; verification tokens and component fragments are
not documents. Existing ribbon assertions now require exactly seven routes and
retain the exact order, hero mounts and resource versions.

`node astrix-app/tools/test-reports-browser.mjs` checks 1363, 1920 and 2560 widths,
220–320px cards, 8px radius, text/document overflow and zero requests when switching
series or opening activities. This environment has no Chromium. Its installation
failed with an invalid archive. **NOT RUN: Chromium missing.** No screenshots or
rendered measurements are claimed.

The referenced `claude/astrix-rights-check-25sep2026.md` is absent from the base
checkout. The task's explicit rights requirements are applied, including the
footer. No Cloudflare changes, deployment or merge were performed.

## Prompt 20a-fix

The public GET `/bungie/reports/catalogue` route fetches Activity definitions only
inside the Worker. Downloads are bounded at 24 MiB. The edge cache key includes
manifest version and catalogue/release-table revision; cached public projections
last one year, while the stable client URL has a five-minute TTL. No credentials
or player data enter this route or its edge cache. Existing account snapshots
remain browser-only. The browser requests only the slim projection, even when
preloading Reports from another page. The browser snapshot key changed to avoid
reusing the old catalogue schema.

Measured with the Worker builder against Bungie's current English manifest,
`244213.26.06.29.2000-1-bnet.65864`: **349,632 bytes** of UTF-8 JSON,
**2,045 variants**, compared with **10,988,279 bytes** of full definitions. This is
an uncompressed local build measurement, not a deployed endpoint measurement.
The checked-in public fixture records that exact response for offline coverage.

Every series grid and image node is built during preparation. Detail shells are
built once on first open; their art moves the existing card node. Later switches
use `hidden`. Character changes update text without creating images. The browser
assertions still require zero requests of every kind, and now reject new image
nodes, repeated-open requests and multiline band cells at both 220 and 320px.
The normalized test-server root retains its path boundary. Its resource smoke
checks pass before Chromium launch. **NOT RUN: Chromium missing.**
