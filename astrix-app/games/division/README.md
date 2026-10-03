# Division WorkBench

WorkBench is the ASTRIX PARADOX build advisor for The Division. One WorkBench covers every Division title. Shared code lives here; each title gets its own folder.

```
astrix-app/games/division/
  schema/            shared JSON schemas (all titles)
  engine/            shared WorkBench engine (never forked per title)
  td2/               The Division 2
    data/            TD2 catalogue (source + gameVersion on every entry)
    assets/          approved images only
    assets/manifest.json
astrix-app/platform/adapters/division/   manual, json, ubisoft (stub)
```

A later title (td3/) gets the same data/ and assets/ folders and reuses schema/ and engine/.

## Rules

The full gate is in `astrix-app/ARCHITECTURE-GATES.md` (Division gate). In short:

- No hardcoded item tables in engine, adapter or UI code. Game data comes from catalogue files through the schema loader.
- Every catalogue entry has `source` (an http(s) URL to an official source) and `gameVersion`. An entry that can't be sourced yet has `"status": "pending"` and a `missing` list. Never a guessed value.
- Title folders hold `data/` and `assets/` only. No code in a title folder.
- Every file in an `assets/` folder is listed in that folder's `manifest.json` with `"useAllowed": "yes"` and `"approvedByMiguel": true`. A file matches the entry whose `id` is its name without extension. A web-sized copy is named `<id>.web.<ext>`.
- No Ubisoft sign-in, session tokens, scraping or private endpoints.

## Checks

```
node astrix-app/tools/validate-division.mjs
node astrix-app/tools/test-division-validator.mjs
```

Both run on every PR through `.github/workflows/validate-division.yml`, and inside `paradox-validator.mjs`.
