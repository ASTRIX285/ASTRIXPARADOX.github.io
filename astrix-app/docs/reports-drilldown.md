# Reports drill-down

Branch: `feat/reports-drilldown`. PR only. No merge or deployment.

Cards default to all current characters and show aggregate clears, fastest and
last played. Difficulty/encounter lists live in the activity view, alongside
per-character clears. Runs are paged newest first; each row preserves the Bungie
character, date/time, activity duration and explicit completion value.

`GET /bungie/reports?kind=history&characterId=...&page=...` binds membership to the
existing session and requests Bungie GetActivityHistory with mode 0 and count 250.
It preserves throttling and does not cache account data at the edge. Deploying the
Worker through the normal reviewed process is required before the new history
route works in production. Until then, history remains pending with Retry.

History advances at most five source pages per character per interaction. Load
older runs continues the scan; no arbitrary lifetime cap exists. Results remain
behind a shared timestamp boundary until every selected character has been read
that far. Repeated source pages fail with Retry rather than loop or duplicate.
Clears come from aggregate stats, not a partial history count. A full scan can
fill missing totals or fastest values. The sum covers the current character roster;
Bungie cannot return the run history of characters no longer in that roster.

PGCRs use the existing `/bungie/pgcr/<id>` route. Successful results are cached in
the browser for 24 hours, keyed by account and run. Requests coalesce. Errors and
empty PGCRs are not cached. Each player's completion is independent; missing
values stay Pending and zero remains zero. Bungie emblem URLs are not recoloured.

References:
- https://bungie-net.github.io/multi/operation_get_Destiny2-GetActivityHistory.html
- https://bungie-net.github.io/multi/schema_Destiny-HistoricalStats-DestinyHistoricalStatsActivity.html
- https://bungie-net.github.io/multi/schema_Destiny-HistoricalStats-DestinyPostGameCarnageReportEntry.html
- https://bungie-net.github.io/multi/schema_Destiny-HistoricalStats-DestinyPlayer.html

## Observed account baseline

Read from the signed-in ASTRIX285 live Reports UI on 27 September 2026 with All
selected. This is the current production aggregate display, not an execution of
this branch and not a claim of independently fetched raw aggregate responses.

| Activity | All clears | Fastest | Titan clears / fastest | Warlock clears / fastest | Hunter clears / fastest |
| --- | ---: | --- | --- | --- | --- |
| King's Fall | 6 | 56:19 | 2 / 1:50:23 | 3 / 56:19 | 1 / 3:29:35 |
| Root of Nightmares | 4 | 35:53 | 1 / 2:21:55 | 3 / 35:53 | Pending: live UI showed "-" / "-" |
| Deep Stone Crypt | 14 | 14:54 | 4 / 1:20:18 | 6 / 14:54 | 4 / 1:25:17 |

Last-played dates are pending live branch validation. The production page has no
last-played field. No invented account values or fixture numbers are used here.

## Validation limits

Data fixtures cover unequal character history pages, account filtering, global
ordering, pagination, null versus zero, throttling, repeat-page rejection, PGCR
coalescing, persisted account isolation and session-bound Worker history URLs.
The existing browser test now covers six widths, the three drill-down levels,
PGCR reuse, real public catalogue grouping, and Mission Reports/Loadout at 390px.
It could not run here: Chromium is absent and its download returned an invalid
archive. The available remote browser cannot open the local preview. No rendered
390px measurements or visual pass is claimed. Review these in the draft PR before
merging. The three required repository validators pass.

## Miguel's manual QA

- [ ] After the reviewed Worker update, open Reports with your existing Bungie session.
- [ ] Check King's Fall, Root of Nightmares and Deep Stone Crypt clears, fastest and last played against your account. Record all-character and individual-character values.
- [ ] Filter Titan, Hunter and Warlock; return to All characters and confirm totals.
- [ ] Open The Pantheon. Encounter names appear on its activity page, not its front card.
- [ ] Open an activity, check both breakdowns, page through runs, and load older runs.
- [ ] Open a completed and incomplete run; check each player's name, emblem, kills, deaths and completion.
- [ ] Reopen a run and confirm its PGCR is reused. Retry a failed request.
- [ ] At 390px check Reports cards, activity and fireteam, Mission Reports and a populated Loadout. No page content should extend outside the screen; designated gear rails may scroll.
- [ ] Change character while history is loading; sign out and back in and confirm no previous account content appears.
