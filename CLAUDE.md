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

## Locked user flow (Forge Loader to Build Forge)
Changes to any step below need Miguel's sign-off first. Do not add, remove, reorder or move a question between steps. Last changed 27 Sep 2026 (Miguel signed off on moving results to their own page and adding the weapon anchor).
1. Forge Loader: the user picks an Exotic armour, an optional Exotic weapon anchor and a set bonus and stat focus. A live top-few-loads preview updates instantly as these change, using the shared search module. "Open Forge Matrix" carries the whole selection in a bookmarkable URL to the results page.
2. Results page (its own URL, reloadable, bookmarkable, shareable): the full ranked list, Staged armour and Enter Build Forge. Enter Build Forge is grey and disabled only when not ready, pulsing charcoal when ready, crimson with a visible progress state while transferring.
3. Build Forge: element, Build objective and Activity (Raid, Dungeon, Grandmaster, Crucible, General PvE) are all picked in the Elemental Build Options panel. If a weapon anchor is set, its element is pre-selected with a visible reason (e.g. "Solar suggested: One Thousand Voices deals Solar damage."); the user can pick a different one. There is no activity popup, and each question is asked once.
4. Generate stays disabled until all three are picked, and its label says what is missing. The engine receives the activity context exactly as before. An anchored Exotic weapon stays in its slot through generation.

## Tool entry and navigation rule
- Show the portal loader only on a fresh navigation from the public Tools entry. Never show its ring or breach skin on internal tool transfers, reloads, history traversal or direct links.
- Retain the outgoing page snapshot until the selected destination has populated and reported readiness. Reveal immediately when ready; 3 to 4 seconds is the maximum target, never an artificial delay.
- A failed transfer exposes recovery actions without a loader animation. Preserve authentication and retry controls.
