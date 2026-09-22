# Profile snapshot diagnostic loss, 22 September 2026

## Real Worker evidence

Read-only Cloudflare Workers Observability queries were run on 22 September 2026. No Worker deployment or account mutation was performed.

- Worker: `astrix-destiny-backend`.
- Deployed version recorded in the failure: `83716c00-ef6e-438f-a570-0066b9a0a56e`.
- Trace: `6c4afef5926e3d3f9b909cf3287ba570`.
- At `2026-09-22T18:10:38.957Z`, event `01M355037D0000000000000013` recorded `bungie_profile_failed`, status `502`, for `/bungie/page/journey?freshness=display`.
- Its source fields are only `level`, `message`, and `status`. Neither Bungie ErrorCode nor ErrorStatus was recorded.
- In the same trace, event `01M35503790000000000000009` recorded `POST https://internal/profile-snapshot` at `2026-09-22T18:10:38.953Z`, with wall time `29991` ms.
- The outer Journey invocation took `30625` ms. Both invocation outcomes were `ok`, meaning the Worker returned rather than crashing, not that its HTTP response succeeded.

The duration is consistent with the configured 30-second deadline. It does not prove a TimeoutError: the catch discarded the exception. Today's exact upstream ErrorCode, ErrorStatus, and failure category cannot be recovered from these records. They must not be relabelled as maintenance.

## Character path

`preparedPageRoute` in `src/index.ts` can serve a prepared page cache hit before fetching a profile. On a miss, both Character and Journey call `profileRoute`, with different component scopes. Display freshness uses `AuthRecord /profile-snapshot` in both cases; live freshness fetches Bungie directly. Snapshot cache keys include the component set. The Character browser client also loads prepared page data.

Consequently, Character is not categorically immune to this handler. Its reported success can coexist with a Journey miss through different cached data, component sets, or live freshness. A read-only query for `/bungie/page/character` from 18:05 to 18:15 UTC returned no events, so that query does not establish which path served Miguel's Character screen at the failure moment.

## Fix and limits

The upstream reader retains a typed failure category, upstream HTTP status when available, and the actual returned numeric ErrorCode and string ErrorStatus. ErrorStatus is bounded to 256 characters. Fetch rejection, deadline timeout, body read failure, invalid JSON, unsuccessful HTTP, unsuccessful Bungie envelope, and missing Response remain distinguishable. Unknown storage/cache failures are labelled separately. No raw response body, request URL, credentials, or arbitrary exception message is logged or relayed.

The Durable Object retains its 502 unavailable response and includes these diagnostics. The outer profile handler relays and logs those fields, preserving its existing HTTP-status policy and direct live-profile error handling. The loader logs failures even when invoked by a background snapshot refresh. Successful responses and cache eligibility remain unchanged.

The frontend is unchanged. No retry or guessed reset-window handling was added. No files under `astrix-app/pages/forge-loader/` were changed.

Official Bungie documentation maps `SystemDisabled` to code `5`: https://bungie-net.github.io/multi/schema_Exceptions-PlatformErrorCodes.html . This enum is used in automated test fixtures, not claimed as today's observed error.

Automated tests use synthetic upstream responses. They verify the actual AuthRecord handler with a stubbed platform/storage, error serialization and outer diagnostic mapping, timeout versus fetch rejection, invalid bodies, unchanged successful responses, and that failed snapshots are not cached. They are not a live Bungie reproduction. A post-deployment incident capture remains pending the normal verification and approval process.
