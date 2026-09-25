# ASTRIX PARADOX repo rules (ASTRIX285/ASTRIX285.github.io)

Static site, vanilla HTML/CSS/JS. GitHub Pages deploys from `main`. `main` is the single source of truth.

## Team and scope
- Claude Code owns VISUAL work: CSS, HTML layout, cards, Journey, tools page, brand tokens, accessibility.
- GPT/Codex owns DATA work: fixtures, engine `.mjs` files, weapon-role logic, manifest, Cloudflare workers, validator logic.
- If a visual task needs a data or `.mjs` change, stop and report it. Don't edit GPT's scope.
- Claude in chat writes the prompts and verifies PRs from a clean clone.

## Branches
- Always branch from `main`, after pulling `origin/main`.
- Do NOT use `sandbox`. It is stale and far behind `main`.
- Branch names: `design/<task>` for visual work, `chore/<task>` for housekeeping.
- Never commit, merge, reset or force-push `main`.
- PRs go into `main`.

## Files to leave alone
- Only edit files under the repo root `astrix-app/` etc. There is a nested duplicate folder `ASTRIX285.github.io/` inside the repo. Never edit it; flag it if a task seems to need it.
- Never touch any untracked leftover worker folder from before the Forge rename if one appears locally. Move it to a backup outside the repo, never commit or delete it.
- Don't rename or move `astrix-app/`. Its folder path is a live URL path.
- `guardian-adaptive-layout.css` is the only file that sets the top-level `.workspace` grid columns.

## Data rules
- Never invent Destiny data or Bungie values. Every claim needs a real source. Missing data shows an honest pending state.
- Current stats model is Armor 3.0: Weapons, Health, Class, Grenade, Super, Melee (1 to 200). Never the old Mobility/Resilience/Recovery/Discipline/Intellect/Strength.
- Never sign in to Bungie, PlayStation, Xbox, Steam, Epic or Twitch. Miguel does all logins. End with a short manual QA checklist for him instead.
- Never commit secrets. Bungie keys live only in Cloudflare Worker secrets.

## Brand and design
- Brand is "ASTRIX PARADOX" (all caps). "ASTRIX285" is Miguel's personal handle. Never rename either.
- Authentic Bungie icons stay in every socket. The paradox layer is ring/state only, never a recolour.
- Two token systems exist: `astrix-app/astrix-tokens.css` (Character, Build Forge) and `--apx-*` in `astrix-app/shared/astrix-destination-ribbon.css` (Journey family). Check which one a page actually loads before using tokens.
- No hardcoded hex colours for brand or role colours. Add a token instead.
- No visible alpha/beta labels, "authenticated" badges or build/version numbers on pages.
- Standing UX principle: a user should never have to struggle with the UI. Hold to DIM-level polish.

## Validation (run after every change)
- `node astrix-app/tools/validate-scope-guard.mjs`
- `node astrix-app/tools/validate-journey-visual-pass.mjs`
- `node astrix-app/tools/paradox-validator.mjs`
All must exit 0 before a PR.

## Reporting
Report ONLY: branch, commit, files changed, validator exit codes, PR number. No code in chat.
