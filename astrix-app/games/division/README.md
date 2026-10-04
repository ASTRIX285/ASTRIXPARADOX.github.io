# Division WorkBench

WorkBench is the ASTRIX PARADOX build advisor for The Division. One WorkBench covers every Division title. Shared code lives here; each title gets its own folder.

```
astrix-app/games/division/
  index.mjs          game module (platform contract); returns pending until data exists
  docs/SCOPE.md      project scope
  schema/            shared JSON schemas (all titles)
  engine/            shared WorkBench engine (never forked per title)
  td2/               The Division 2
    data/            TD2 catalogue (provenance on every record)
    assets/          approved images only
    assets/manifest.json
astrix-app/platform/adapters/division/   manual, json, ubisoft (stub)
```

A later title (td3/) gets the same data/ and assets/ folders and reuses schema/ and engine/.

## Rules

The full gate is in `astrix-app/ARCHITECTURE-GATES.md` (Division gate). In short:

- No hardcoded item tables in engine, adapter or UI code. Game data comes from catalogue files through the schema loader.
- Every catalogue record has a `provenance` block (`platform/contracts/provenance.schema.json`): an `official-post` or an `in-game-capture`, each with a `gameVersion`. Datamined client data is never accepted. A field with no source yet is `{ "pending": true, "reason": "..." }`. Never a guessed value.
- Title folders hold `data/` and `assets/` only. No code in a title folder.
- Every file in an `assets/` folder is listed in that folder's `manifest.json` with `"useAllowed": "yes"` and `"approvedByMiguel": true`. A file matches the entry whose `id` is its name without extension. A web-sized copy is named `<id>.web.<ext>`.
- No Ubisoft sign-in, session tokens, scraping or private endpoints.

## Checks

```
node astrix-app/tools/validate-division.mjs
node astrix-app/tools/test-division-validator.mjs
node astrix-app/tools/validate-game-folders.mjs
node astrix-app/tools/test-game-folders.mjs
node astrix-app/tools/test-division-schema.mjs   (needs npm install --prefix astrix-app)
```

All five run on every PR through `.github/workflows/validate-division.yml`. The first four also run inside `paradox-validator.mjs`.

## Schemas and catalogue files

`schema/` holds one JSON Schema per record kind, shared by every title: weapon families, weapons, gear slots, attributes, brands, gear sets, named and exotic items, talents, mods, skills (variants and tier scaling), specializations, expertise and proficiency. `common.schema.json` holds the building blocks; every record builds on its `recordBase` (id, name, provenance, notes). `account-state.schema.json` models equipped items, loadouts and stash locations and keeps them empty until Ubisoft gives authorised access.

A catalogue file in `<title>/data/` is `{ "title": "td2", "kind": "<record kind>", "records": [ ... ] }`. Title-specific facts (the slot list, caps, counts) are records in the title's data, never part of a schema.
