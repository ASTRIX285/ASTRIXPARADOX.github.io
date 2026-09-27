# Manifest coverage and active profile refresh

## Before this change

Main `388713e3b8af1a8fc94aaac61a80e63529340726` used a ten-minute prepared-page
timer without a recent-interaction gate. Forge Loader overrode this with a
one-minute timer. Character/Build performed a startup background refresh.
The requested five-minute active-refresh policy did not exist.

## Manifest coverage and history

EquipableItemSet, SandboxPerk, PlugSet and SocketType were already included.
LoadoutName, LoadoutIcon and LoadoutColor are now included. The runtime audit also
found StatGroup in weapon selection, ActivityMode in Mission Reports, and
Place/Vendor in Journey maps; these are included with matching metadata-proxy and
client service allowlists. No OAuth behaviour or auth deployment is changed.

Each current, compact and retired table descriptor carries the snapshot version.
Current descriptors preserve Bungie's exact metadata content path. Generated
shards carry SHA-256 digests. All downloads use one metadata response; a second
version check rejects a manifest change during the build. Existing page-bundle
version, closure and index-consistency checks remain mandatory.

The hourly schedule remains `23 * * * *`. An unchanged version performs one
metadata check, validates local cached files, downloads no tables, rebuilds
nothing, saves no new cache and does not deploy. An existing same-version
snapshot missing newly required tables reports coverage pending until Bungie's
version changes. A code/schema change never authorizes downloading unchanged
tables. A cold cache requires an initial snapshot.

For a new version, compare every table with the previous cached snapshot. Keep a
cumulative table-namespaced retirement archive of supplied name, icon and type,
last-seen version and removal version. Preserve top-level loadout name,
iconImagePath and colorImagePath where present. Missing values stay absent.
The resolver reads current definitions first and archive shards only for missing
hashes. Archived results expose `retired: true`, a `retirement` record and
`Retired: <name>` where a real name exists. They do not invent stats, perks,
sockets or gameplay capability. Reintroduced current definitions take precedence.

The existing Actions cache prefix is retained so older snapshots and accumulated
history survive rebuilds. Missing/corrupt indexed shards fail closed. Publication
retains a rollback copy until replacement succeeds. History never retained before
this feature, or lost with the entire cache, cannot be reconstructed. This branch
does not generate or deploy production manifest data. Synthetic test identities
are confined to offline fixtures.

## Header API for Claude

Import `/astrix-app/core/active-profile-refresh.mjs?v=20260927-active-profile-1`.

- `refreshProfile()` returns the active refresh Promise. Repeated clicks share the
  same request. A resolved null means no visible/authenticated adapter is
  available; rejection means failure.
- `getProfileRefreshState()` returns `page`, `available`, `refreshing` and
  `lastUpdated` (epoch milliseconds or null). This is the last successful
  prepared-profile check, not Bungie's last item-change time.
- `subscribeProfileRefresh(listener)` immediately supplies state and then changes,
  and returns an unsubscribe function. The document also dispatches
  `forge:profile-refresh-state` with the same detail.

A global Symbol registry prevents differently tagged module aliases from creating
competing controllers. This PR adds no header markup, styling or refresh icon.
Show unknown timestamps honestly and reflect the shared pending state.

## Active lifecycle

Journey, Vault, Loadout, Forge Loader and Character/Build use the shared controller
with existing forced prepared-profile refresh/render functions. Ordinary pointer,
keyboard, wheel and touch interaction activates the five-minute schedule.
Untouched or idle tabs do not poll. Hidden/page-hidden tabs cancel timers;
an in-flight request may complete. A visible return refreshes immediately,
coalescing with a pending request. Duplicate visible events do not refresh twice.

Manual, timer and resume paths share one lock. A replacement account waits for
the previous request and cannot inherit its result. Sign-out/account changes stop
old controllers. Failures retain the last successful timestamp and retry only
when visible/recently active. Denied storage uses in-memory successful timestamps,
not fabricated update times or repeated requests on every input. Existing
Loadout editor/action guards remain, and cached initial display does not await
the live background request. No per-item definition polling loop is added.

## Validation and manual QA

`test-manifest-coverage.py` covers version-matched table generation, zero-download
unchanged checks, migration gates, cumulative removals, metadata shapes,
reintroduction, version races, corrupt/missing caches, rollback and retained
bundle/index consistency. `test-manifest-retirement.mjs` covers GET/bulk/compact
resolution, current precedence, version mismatches and absent metadata.
`test-active-profile-refresh.mjs` covers active/idle/hidden/resume, single-flight,
retry, timestamps, account replacement, storage failure and production adapters.
All are registered in the full validator and the PR's read-only CI workflow.

Miguel: sign in personally, check two active five-minute refreshes, hide/return,
click the future header control during a pending request, and verify Loadout
editor selections remain. Offline tests do not claim a real Bungie login,
browser-rendered pass or native Windows run.
