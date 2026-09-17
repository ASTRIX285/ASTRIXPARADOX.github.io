# Site-wide standardisation: initial audit and proposed contract

17 September 2026. Source baseline: `f6d6f52c9b126f29cce975d39cb3d9a38a4e70ea`.

Status: audit and design proposal only. No production CSS, data selection, backend computation or deployment changed in this branch. This is not a completed website-wide verification or a performance improvement claim.

## Confirmed scope

All public website pages and all tools, including Journey, Character, Forge Loader, Build Forge, Mission Reports, Inventory/Vault, Loadouts, dialogs, selectors and generated-build reviews. This supersedes the earlier Forge Loader/Journey/Mission Reports exclusions. Preserve the approved Forge Loader Exotic selector size. Character is the reference for equivalent gear, Super and ability roles. Preserve actual equipped state, the original snapshot, staged working changes, live-action safeguards and character isolation.

## Source inventory

19 HTML entry documents found, excluding archive/fixture/component fragments and search-engine verification files. Counts below are direct stylesheet links, not unique rules, requests measured in a browser, or proof of duplicated CSS. Legacy and diagnostic routes need reachability verification before removal or restyling.

| Entry document | Linked stylesheets | Shared density | Fluid image opt-in |
| --- | ---: | --- | --- |
| astrix-app/index.html | 6 | No | No |
| astrix-app/pages/forge-loader/index.html | 10 | Yes | No |
| astrix-app/pages/guardian-workspace-v1/index.html | 4 | Yes | No |
| astrix-app/pages/guardian-workspace-v2/index.html | 30 | Yes | Yes |
| astrix-app/pages/guardian-workspace-v2/paradox-build-space/index.html | 19 | Yes | Yes |
| astrix-app/pages/guardian-workspace-v2/shooting-range-test/index.html | 3 | No | No |
| astrix-app/pages/journey/index.html | 10 | Yes | No |
| astrix-app/pages/loadout/index.html | 8 | Yes | Yes |
| astrix-app/pages/mission-reports/index.html | 9 | Yes | No |
| astrix-app/pages/tool-intro/index.html | 4 | Yes | No |
| astrix-app/pages/vault/index.html | 11 | Yes | Yes |
| index.html | 3 | No | No |
| pages/clips.html | 3 | No | No |
| pages/games.html | 3 | No | No |
| pages/join.html | 3 | No | No |
| pages/news.html | 3 | No | No |
| pages/rebrand.html | 3 | No | No |
| pages/reviews.html | 3 | No | No |
| tools/index.html | 4 | No | No |

## Verified findings

1. **The warm brown comes from shared source definitions.** `astrix-app/astrix-tokens.css` defines brown-tinted surfaces and warm `.scene` gradients. Page-specific styles add further warm panels; changing one palette variable will not remove them all. The public website uses neutral black/charcoal and crimson in `css/style.css`. Consolidate semantic surface/text/action variables and remove competing definitions. Preserve game artwork and element/rarity information.
2. **Existing fluid sizing explicitly excludes three pages.** `astrix-app/shared/astrix-desktop-density.css` only activates its image unit on `.apx-fluid-icons`. Forge Loader, Journey and Mission Reports do not opt in. Its own comments record that text and workspace tracks do not share the image scale.
3. **Character has more than one intentional icon role.** `shared/guardian-inventory-workspace.css` gives Character inventory a native 50px square image with a 63px overall card including the badge; below its 1025px breakpoint the image is 48px. This is not permission to resize every Super, ability, preview and selector to 50px. Capture each current Character role and apply it to corresponding roles elsewhere.
4. **The existing unit is not the requested 122% maximum.** The shared clamp is divided by 61.44, with a 64px ceiling: maximum image multiplier is approximately 1.0417. Several other sizes use independent `cqi`, `vw`, rem or fixed-pixel rules. A common role-based scale contract must replace these competing paths.
5. **Forge Loader selector and selected-detail roles differ.** `.forge-exotic` consumes the 68px selector token; right-column detail identities consume the 56px card token. Preserve the selector baseline; review selected/result details against matching Character roles before choosing their final dimensions.
6. **Max Loadout preparation is currently browser-local.** `paradox-forge-preparation.mjs` creates a module Web Worker. `docs/forge-background-preparation.md` explicitly describes it as browser-local, not Cloudflare. It retains up to four results / 8 MiB and submits up to twelve variants. These are retained-data limits, not evidence that all combinations are precomputed.
7. **Some required inputs arrive too late for current preparation.** `prepareForgeBackground()` requires a staged decision, valid activity, compatible selected element, armour readiness and Exotic validation. Unknown activity must never be guessed. Prepare input-independent data earlier, then schedule scoring as soon as the user supplies the required context, before final Generate.
8. **Exact alternative weapon combinations are not part of the current warm list.** `preparationVariants()` varies element, objective and Super. Exact weapon instance combinations requested later can miss the cache. `scheduleForgePreparation()` also returns once a recommendation has been generated. Instrument cache hits/misses and invalidation before changing this policy.
9. **Backend workspace warming is sequential and stops on a failure.** `forge-auth-worker/src/index.ts`, `warmPreparedWorkspace()`, warms Character, Build Forge, Vault and Loadout in order; a failed page throws. Journey schedules this with `waitUntil`. This prepares page payloads, not final Max Loadout recommendations. Do not replace it with unbounded parallelism: memory and request budgets must be measured first.
10. **Loader thresholds are not measured page times.** `shared/astrix-portal-loader.js` has a 2800ms slow-load notice and an 1800ms upper wait for fonts/images, followed by two animation frames. The asset wait can finish earlier. Record data-ready, visible-content-ready and overlay-dismissed timestamps separately; do not report these constants as actual latency.

## Proposed visual contract

- Neutral black / charcoal surfaces; silver-white typography; the existing crimson brand accent. No brown, bronze, tan or warm tinted panel gradients.
- Keep Bungie artwork, subclass colours and rarity cues intact. Gold within item art/rarity is game data, not a new brown/gold surface theme.
- Retain the shared Bahnschrift font families. Proposed readable tool type roles: body 16px, controls 14px, secondary labels at least 12px, section titles 18px at the baseline. Confirm against actual Character render before migration. Marketing headings keep their own heading role.
- Application-controlled scale starts at 1.00 and never exceeds 1.22. This is distinct from browser zoom and device pixel ratio. Do not reset browser zoom, disable pinch zoom or use `maximum-scale` to block accessibility.
- Responsive tracks wrap when content no longer fits and distribute usable width evenly on wider viewports. Do not enlarge gear art to fill an arbitrary grid track. Avoid whole-page transforms that blur text or break hit areas.
- Use explicit minimum readable sizes. Narrow screens primarily change column count and spacing, rather than shrinking all text indefinitely.
- Audit all render locations, including item hover/inspect views, recommended-build overlays, activity dialogs, five armour slots and three weapon slots on all three classes. Consolidate each semantic role into one shared owner and remove redundant definitions.

Palette preview: `site-standardisation-preview.html`. It is a synthetic style sample, not a screenshot of a completed migration or a live Guardian.

## Backend preparation contract

Key results by authenticated account, character, equipped/staged inventory revision, exact item instances/socket choices, manifest/season, activity, objective, subclass/Super and locks. Never reuse another character's build. Cancel or ignore stale work. Retain original and working snapshots independently. Background preparation must not invoke equip/transfer actions.

Separate reusable data/eligibility indexing from expensive context-dependent scoring. Before selecting a server architecture, measure client CPU, backend CPU/wall time, payload size, cache-hit rate, recomputation and memory constraints. A result is ready only after computation and validation complete. Keep a bounded fallback for genuine cache misses and input changes; do not replace missing evidence with a fabricated recommendation.

## Validation and access status

The public homepage and Tools/Forge introduction were accessible in the review browser. At a 1363x936 CSS-pixel viewport the homepage body computed to 16px Bahnschrift with white text. This is a single observed viewport, not a zoom-range test. No authenticated Guardian data or live Worker performance traces have been measured for this audit. Prior local-preview restrictions are not bypassed.

Required acceptance runs: 390, 768, 1024, 1366, 1920 and 2560 CSS-pixel viewports; app scale 100% and 122%; browser zoom out/in independently; cold/warm/refresh navigation; Hunter/Warlock/Titan switching; default equipped and saved builds; Forge Loader staging; manual edits; prepared recommendation cache hit/miss; stale-input rejection; Restore Original; action confirmation safety. Check clipping, keyboard focus, font legibility, item ratios and matching character identity.

Report actual median and tail timings with sample count and conditions. Until those measurements exist, the requested page-load target and precomputed-combination readiness are unverified.

## Delivery sequence

1. Review this concrete palette and role contract against the current Character baseline.
2. Consolidate shared tokens and migrate page areas in reviewable PRs, including public pages and Forge Loader.
3. Instrument loading/preparation, then optimise the measured bottlenecks with bounded authenticated caches and regression tests.
4. Run the full page/character/viewport matrix and publish measured results and validator exit codes. Do not mark this audit as completion of those later steps.
