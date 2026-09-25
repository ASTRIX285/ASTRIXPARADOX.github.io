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
- Newest-first sorting uses a positive definition `releaseTime`. Bungie's current
  manifest checked on 25 September has **zero nonzero releaseTime values**.
  Undated activities consequently sort by name. Complete historical release
  ordering remains unresolved; manifest index and first account play are not
  treated as release dates. This PR does not claim that the current catalogue
  meets newest-first ordering.
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
