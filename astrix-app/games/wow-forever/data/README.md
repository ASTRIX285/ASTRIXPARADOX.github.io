# WoW Forever data

- `rules.json` rule values that are not in the client tables, each with an official-post source.
- `stat-types.json` stat type id to name map. Empty until each entry has a cited source.
- `generated/` the Forever database (classes, talent trees, spells, item sets, equippable items), built from the pinned client build by the pipeline, never by hand. The run manifest and header snapshot sit in `../pipeline/last-build/`.

## How data gets here

1. Run the "Refresh WoW Forever data" workflow with `list-builds` and confirm the pinned build in `../pipeline/forever-sources.json`.
2. Check one known talent with a prerequisite in that build and set `prereqRankBase` (0 or 1).
3. Run the workflow with `build`. Download the `wow-forever-db` artifact.
4. Review `manifest.json` (row counts, pending counts) and `header-snapshot.json`.
5. Copy the snapshot into `lockedHeaders`, commit the generated files under `generated/` on a branch and open a PR.

From then on, a client patch that renames or drops a column fails the build with `FOREVER_DB=HEADER_DRIFT` instead of shipping wrong data.

## Rules

- Every record has a provenance block. Every unresolved field is `{ "pending": true, "reason": "..." }`.
- No Wowhead scraping, no QuestieDB, no Retail or Classic Era data swapped in for Forever.
- Test fixtures in `../pipeline/test-fixtures/` are synthetic and must never be read by the app.
