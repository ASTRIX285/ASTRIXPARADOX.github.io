# Engine performance budget

Branch: perf/engine-budget. Baseline: e4f63fd6a88a723337c4573a0b0b9e612ab6c2e5. Rebased onto main after #342 (da3fab9cc079a1217b205562e45624ed412667a4), retaining the reports, DIM import and worker-limit fixes.

## Measurement boundary

These are Node fixture measurements on the same execution host, not live-account or browser paint measurements. Baseline was recorded before optimisation. Five iterations per compute stage, maximum shown; timings vary with host load and JIT warmup. The profile fixture contains 4,000 manifest definitions. Generation uses a 600-instance synthetic inventory derived from the existing regression fixture. No fixture data enters production.

| Stage | Before ms | After ms |
| --- | ---: | ---: |
| Profile fetch and join, uncached, simulated 200 ms fetch | 206.64 | 206.17 |
| Profile join, resident cache | 0.22 | 0.25 |
| Forge handoff packing computation | 56.61 | 40.87 |
| Weapon ranking | 28.52 | 24.86 |
| Generate computation, advice stubbed | 116.20 | 91.66 |
| Profile worker parse and normalise, including simulated 200 ms fetch | Not measured | 238.99 |
| Handoff worker, unprepared, including message transport | Not measured | 273.47 |
| Handoff retrieval after background preparation | Not measured | 0.01 |
| Generation worker, real advice and simulated 200 ms resource fetches | Not measured | 372.89 |
| DIM fetch, resolve and popup | Not measured | Integration pending |
| Browser click to first paint / all alternatives painted | Not measured | Pending browser QA |

## Implementation

- Profile JSON decoding/joining and initial profile activation run in a module Worker. DOM rendering remains in the document.
- Forge Loader warms a Worker-packed handoff while the player browses. Clicking reuses the same prepared promise. Existing atomic IndexedDB transfer and recovery remain intact.
- Workers precompute inventory-by-hash, weapon perk-model validations and armour stat vectors. Cache identity includes manifest version, snapshot revision, account, character and complete supplied inventory content. There is no TTL. Caches are worker-local and are released with worker teardown.
- Weapon search retains top four distinct hashes per equivalent slot coverage state. Strictly dominated prefixes are pruned. Exotic legality, matching-element requirements, ammo bonuses, tie ordering, selected alternatives and the complete legal-combination count are preserved.
- The existing search is retained as a test-only oracle. 57 comparisons cover objectives, inventory sizes, explicit alternatives and full sequence results. Time-of-run metadata is excluded from equality checks.
- First-result messages contain a complete validated best build. Alternatives are delivered afterwards. The review paints one build before filling alternatives, including cache hits. A changed selection cannot receive stale alternatives.
- Local timing records are bounded to 128 entries and contain stage labels and durations. `engineTimings()` exposes them. Profile page readiness and generation use two animation frames for paint-oriented diagnostics. The existing Forge Loader navigation timing survives the page transition.

## Tests and remaining gates

`test-engine-budget.mjs` fails above 1,000 ms for profile fixture load/worker processing, 2,000 ms for generation and 4,000 ms for handoff. Actual worker requests use simulated 200 ms resource fetches. `test-engine-stream-review.mjs` tests first paint, alternatives and stale selection handling. Both run in `paradox-validator.mjs`.

Full `paradox-validator.mjs`: exit 0. Includes scope, Journey, profile/account isolation, existing generation and new performance regressions. `git diff --check`: exit 0.

This PR does not yet satisfy the complete requested end-to-end contract:

1. DIM import is now present on main. Its performance instrumentation, worker migration and under-one-second gate remain pending. This rebase retains the main implementation.
2. Browser click-to-popup/paint and main-thread long-task tests have not run. Node timings do not establish a universal 3 to 4 second user-action guarantee.
Character switching, manual-entry and loadout-page normalizer calls also use the profile Worker. DOM rendering and message structured cloning still execute on the document thread and require browser long-task verification.

No production deployment, merge, Apply-flow change, fabricated game data or scoring-rule change is included.
