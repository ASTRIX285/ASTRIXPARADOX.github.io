# Reports: three free stages

Cards show one activity family with art and name. Existing catalogue family grouping retains every variant on the activity page. No subscription, purchase or unlock check gates any stage.

Activity pages derive overall clears, difficulty clears/fastest and character clears from the same exact-hash history ledger. The selected director node wins when it belongs to the family; referenceId is the fallback. Runs never fall back to the first family variant. Variants with no runs show Not played once history is complete. Characters with incomplete runs and zero clears are retained. Aggregate totals remain separate coverage diagnostics, never redistributed into variant or character rows. Entered uses complete available history, with an explicit clear-count lower bound while pending or if Bungie's history is shorter than the aggregate. Kills sums each character's kills from every returned page, including incomplete runs. A missing kill value keeps the total pending. History is requested with mode 0, count 250, from page 0 through the empty terminal page for every character. The scan pauses on leaving the activity or an error; Retry resumes without dropping successful pages. Deleted characters are not returned by the current profile and cannot be reconstructed.

The old 70-kill Pantheon display used AggregateActivityStats activityKills. This implementation no longer treats that field as the history total. A synthetic regression deliberately supplies 70 aggregate kills and 27 clears, then verifies 3,636 kills over 36 participations, three characters and all four pages per character including terminal pages. These are fixture values, not Miguel's data. Miguel's corrected live Pantheon total remains unverified until he runs the new branch against Bungie.

Run lists deduplicate the PGCR ID across character switches. Kill totals still include each selected character's participation. Difficulty filtering happens before UI pagination. The selected director node takes precedence within the family; the run reference hash is the fallback. Unknown attribution never maps to the first variant. A common history watermark prevents an older character page from appearing ahead of unfetched newer history. All/character, series, activity, difficulty, page and run use query parameters with pushState/popstate. External fireteam-member links preserve the activity and use public Bungie reads with the API key only; the viewer's OAuth token never goes upstream for another member. Privacy failures remain unavailable.

PGCRs use /bungie/pgcr/<id>, coalesced requests and account-scoped memory/IndexedDB caches with a 24-hour TTL. Missing values stay pending, not zero. Fireteam size counts unique Bungie memberships. Flawless means every recorded player completed with zero recorded deaths. Solo/Duo/Trio describe recorded unique membership count on a completed PGCR, not triumph eligibility. Started-from-beginning is displayed separately because checkpoint runs exist. Flawless activity totals stay pending until history and every completed run's PGCR have returned.

Run art/full name come from the selected director activity definition, falling back to the reference hash when no director hash was returned. Player-selected modifiers come exclusively from PGCR selectedSkullHashes, resolved through Bungie's selectable skull collections. Missing hashes/names are not replaced with today's rotating modifiers. An empty selected list does not establish that all other historical modifiers were absent.

Sources: Bungie's official PGCR schema, activity definition schema and selectable skull schema:
- https://bungie-net.github.io/multi/schema_Destiny-HistoricalStats-DestinyPostGameCarnageReportData.html
- https://bungie-net.github.io/multi/schema_Destiny-Definitions-DestinyActivityDefinition.html
- https://bungie-net.github.io/multi/schema_Destiny-Definitions-Activities-DestinyActivitySelectableSkull.html

The consistency validator covers every family in the current public catalogue (670), all variants, three characters, failed runs, duplicate records and filtered characters. A Pantheon regression supplies 27 completed runs split 12/15 across two selected variants and 9/9/9 across characters despite a shared Morgeth reference hash. It rejects deliberately altered totals and missing breakdown rows. These are synthetic regression values, not live account claims.

Stage 3 is a full page, not a dialog or side panel. Each player uses their own PGCR completed value (1 true, 0 false, missing pending), characterClass and timePlayedSeconds. Team kills, assists, deaths and player-time totals require all contributing values. Kill shares are allocated in tenths by largest remainder so displayed values sum to exactly 100.0%; zero/missing team kills has no defined percentage and stays unavailable. This avoids a false 100% for a team with no recorded kills.

King's Fall run `17105004322` was inspected in the production PGCR view on 27 September 2026. The run timestamp is `2026-08-01T08:55:58Z`, shown as 09:55 BST, duration 05:38. Both player rows show Not completed; kills/deaths are 0/1 and 8/0. The deployed renderer reads each player's own PGCR completion value, so Not completed is correct for both observed rows. The regression fixture is an anonymized DOM projection of that Bungie-backed view, explicitly not a raw API capture. Unexposed class, assists, time, hashes and identities remain omitted rather than invented.

## Manual QA for Miguel

- Confirm each activity appears once, with image/name only, including Pantheon and all raid difficulties.
- Open King's Fall, Root of Nightmares and Deep Stone Crypt. Check account and each character. Previous observed account clears: 6, 4 and 14 respectively, not assertions about today's account.
- Confirm Root's zero-clear character shows 0, while All retains account clears.
- Open Pantheon. Wait for every history page. Confirm Morgeth Surpassing does not receive all family clears, exact variants with no runs say Not played, all characters with runs appear, and overall clears equal both breakdown sums. Compare Kills against Bungie history across all characters; compare Entered with aggregate clears and inspect any pending coverage.
- Select every difficulty from both the table and tabs. Confirm dimmed never-played tabs remain usable and runs stay newest first across pages.
- Open a run, inspect names/codes, emblems, class, completion, kills, assists, deaths, K/D, team-kill percentages, time in activity, totals, badges, start status and selected modifiers. Confirm percentages total 100.0% when team kills are known and positive. Recheck King’s Fall run 17105004322: both players should be Not completed. Reopen to exercise cache.
- Use Back/Forward, reload each stage URL, copy Share and open it in another tab. Follow a fireteam member and confirm the same activity, with honest handling of private histories.
- Check the full-width run page header, 32px emblems, every fireteam column and the totals row. Check Back to activity, Back to Reports, browser Back/Forward and reloading the run URL. Check Reports at 390px and that the fireteam table scrolls inside its container.

No live account writes, deploy or merge are part of this PR. Browser screenshot QA requires a working Chromium runtime; do not interpret unit validator success as a visual pass.
