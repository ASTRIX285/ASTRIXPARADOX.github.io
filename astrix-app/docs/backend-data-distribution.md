# Backend data distribution

Implemented on sandbox, based on 35e1d18. No Bungie mutations are part of these jobs.

## Responsibilities

| Surface | Shared preparation / delivery | Remaining work |
| --- | --- | --- |
| Journey | Prepared records, objectives, collectibles, presentation nodes, metrics, locations; existing bounded Journey shards; backend batches for misses; profile component revisions | Update only affected DOM sections instead of rerendering; split character inventory buckets |
| Character | Prepared equipment, subclass, sockets, perks, stats; private 15-second display snapshots; component revisions | Reduce retained normalized item catalogues and verify real mobile heap |
| Vault / Postmaster / carried | Shared definition batches and private inventory snapshot delivery, no whole manifest tables | Separate carried/Postmaster deltas and DOM rendering; existing Vault pagination retained |
| In-game loadouts | CharacterLoadouts component participates in revision delivery; detail definition lookups use shared backend | Loadout-detail snapshot reuse |
| PARADOX saved copies | Existing browser-local persistence remains separate | No server-side save migration in this change |
| Mission Reports | Activity definitions use bounded backend batches | Server-side report aggregation and activity-result caching |
| Forge Loader | Existing compact armour/Artifact catalogue plus shared missing-definition service | Narrow retained catalogues to needed owned items |
| Build Forge | Shared definitions and account display snapshots; existing bounded browser computation worker remains | Server-side solver needs measured CPU/memory limits and cancellation before migration |

## Shared public definitions

`build-backend-manifest.py` checks the official English manifest version, downloads
22 supported definition tables one at a time, retains every field, and partitions
them into <=2 MiB shards. It rejects mixed versions, oversized shards, and excess
asset counts. It publishes its index only after the complete build succeeds.
Existing matching output skips all table downloads. No private account data enters
these assets or GitHub's build cache.

`astrix-manifest-data` is a separate Worker with no public route or OAuth secrets.
The auth Worker calls it through MANIFEST_DATA. Each request returns at most 48
requested hashes. Missing/deploying generations fall back to the existing
version-isolated live definition path. Browser consumers retain at most 4096
definitions / 12 MiB in the shared lookup cache, without opening full IndexedDB
tables. This bound does not include page-owned item objects or decoded images.

The sandbox deploy prepares and deploys the data Worker before the auth Worker.
`refresh-backend-manifest.yml` provides the hourly refresh. GitHub scheduled
workflows run from the default branch: its hourly trigger is not active merely
because this file exists on sandbox. Promotion is required. Manual dispatch can
be used after GitHub recognizes the workflow. No direct main push is required.

## Private display data

Authentication is checked before snapshot access. Existing session Durable Objects
hold private snapshots keyed by membership and exact component set. Concurrent
requests are coalesced. Entries expire after 15 seconds and never fall back to
expired data when Bungie fails. Stored values are chunked below the object value
limit; payloads above 4 MiB are returned without persistence. Logout deletes the
session's storage. OAuth credentials are never part of a profile response.

Opt-in display requests can supply component revisions. The backend hashes each
returned component with the membership identity and sends only changed components.
The browser reconstructs the existing profile contract by reusing unchanged
components, retains no more than three raw scopes, and invalidates on account
change. Omitted components are removed; missing data is not invented as progress.
The existing page renderers still receive a complete profile contract.

Apply and readback do not request display freshness and bypass this cache entirely.
All account tests in the repository use labelled synthetic fixtures. Real-session
preflight, browser heap measurements, crash reproduction, and before/after loading
times remain separate authenticated verification. Passing these tests is not
evidence that the live-account or memory-crash checks have been completed.
