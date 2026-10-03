# ASTRIX PARADOX repo rules (ASTRIX285/ASTRIXPARADOX.github.io)

Static site, vanilla HTML/CSS/JS. GitHub Pages deploys from `main`, live at astrixparadox.com. `main` is the single source of truth. Worker: `forge-auth-worker/` (astrix-destiny-backend, auth.astrixparadox.com).

Read this file at the start of every session. It survives chat compaction. The chat does not.

## Team and roles
- Claude Code (this session, on Miguel's PC) builds everything: visual, data, engine, Worker code. It branches, commits, pushes and opens PRs.
- Claude in chat is chief architect and reviewer. It pulls every PR, merges it onto current `main`, runs the validators and renders desktop and phone before replying "Green light - good to merge PR-XXX" or listing issues.
- Miguel merges. GPT does not commit.

## Sessions
- Start a new Claude Code chat for each big batch of work. Open it with the latest handover (project doc `claude/astrix-handover-*.md`, newest date) and the prompts for that batch.
- Before ending a batch, make sure every change is pushed and give Miguel the summary (see Reporting) so the next chat starts clean.
- Miguel's terminal is Windows PowerShell 5. Give him commands with Windows paths and `;` between commands. Never `&&` or `/c/` paths.

## Branches and PRs
- One brief = one branch = one PR. Never put two briefs on one branch.
- Always branch from the latest `origin/main`. Rebase onto `main` if it moves before you report.
- Branch names: `design/<task>`, `fix/<task>`, `feature/<task>`, `perf/<task>`, `chore/<task>`.
- Never commit, merge, reset or force-push `main`. Never run `gh pr merge`. Leave auto-merge off.
- Every change, review fixes included, is committed and pushed to the PR branch before you report. Nothing stays on disk only.
- Keep each PR inside its `.scope/<branch>.txt`. If the work needs a file outside that scope, stop and report it.
- When a PR conflicts after another merges, rebase it, keep both sides' changes, and report the new head SHA.

## Unattended runs
- When Miguel is away, do not stop to ask. Pick the option that keeps to the brief and these rules, list it under "Decisions I made" in the PR description, and carry on.
- If truly blocked (needs a sign-in, a Worker deploy, or would change the locked flow), push what you have as a draft PR with the reason and move to the next item.

## Files to leave alone
- Never edit the nested duplicate folder `ASTRIX285.github.io/`. Flag it if a task seems to need it.
- Never touch any untracked leftover worker folder from before the Forge rename. Move it to a backup outside the repo, never commit or delete it.
- Don't rename or move `astrix-app/`. Its folder path is a live URL path.
- `guardian-adaptive-layout.css` is the only file that sets the top-level `.workspace` grid columns.
- Perf tools: never write browser profiles, HAR, traces or results inside the repo. Never print or save cookies, tokens or auth headers.

## Data rules
- Never invent Destiny data or Bungie values. Every claim needs a real source (Bungie API or the prepared manifest). Missing data shows an honest pending or "-" state, never a guess.
- Never present cached data as live. Show its age.
- Current stats model is Armor 3.0: Weapons, Health, Class, Grenade, Super, Melee (1 to 200). Never the old Mobility/Resilience/Recovery/Discipline/Intellect/Strength.
- Never sign in to Bungie, PlayStation, Xbox, Steam, Epic or Twitch, and never script a browser through a sign-in (PlayStation blocks automated browsers). Miguel does every login in a normal Chrome window. End with a short manual QA checklist for him instead.
- Never commit secrets. Bungie keys live only in Cloudflare Worker secrets.

## Worker
- Merging anything under `forge-auth-worker/` to `main` deploys the Worker automatically (GitHub Action "Deploy Forge Destiny Auth Worker"). Say so clearly in the PR and give the rollback (revert the PR, or `npx wrangler rollback` in `forge-auth-worker`).
- Never run `wrangler deploy` yourself.

## Brand and design (source: DESIGN.md)
- Brand is "ASTRIX PARADOX" (all caps). "ASTRIX285" is Miguel's personal handle. Never rename either.
- The AX logo (designed by Miguel's son) never changes. It sits beside the ASTRIX wordmark in every header and in the menu drawer, on desktop and phone. Every logo links to "/".
- Palette: Forge Black #0e0c09, Panel #15130f, Raised #1f1c16, Ember #ba1f12, Ember-hi #e6391f, Deep #732022, Steel #8a8a89, hairlines #2e2a22 / #4a4538. Fonts: Michroma, Barlow, Barlow Semi Condensed. Use tokens, never hardcoded hex. No navy.
- Strobe stroke: 1.5px on the left and bottom edges, brightest at the bottom-left, fading out at the bottom-right corner, with a pulse. Standard on every tab and button and on the selected item, tools and public pages.
- Tiles: raised bevel (light top and left inner edge, dark bottom and right inner edge, soft drop shadow) with the notched top-right corner, unless a brief says flat.
- Diamond shapes stay diamonds: Super formation and subclass picker. Never put a square button frame around a diamond.
- ASTRIX PARADOX map background on every page (`body.ax-map`), translucent Panel sections.
- Authentic Bungie icons and art in every socket and tile. The paradox layer is ring/state only, never a recolour. Each activity uses its own art from the manifest, never a lookalike.
- No em-dashes or en-dashes anywhere in copy or comments.
- No visible alpha/beta labels, "authenticated" badges or build/version numbers on pages.
- Restores mean restore: if a brief says "restore", match the earlier commit exactly and change nothing else.
- Standing UX principle: a user should never have to struggle with the UI. Hold to DIM-level polish.

## Naming (visible labels)
- The Hub = the page that lists every tool (/hub/).
- The Forge = the Destiny 2 tool. Builder = its build page.
- WorkBench = the Division tool (not built yet).
- "Forge" is never used on its own for anything else a player can see.
- Labels only: file and folder names, URLs, CSS classes, JS identifiers, design tokens (e.g. "Forge Black"), Worker names, storage keys and the sandbox track name "FORGE AI INT DEV" keep their names.

## Speed standard (permanent)
- Every tool page usable in 3 to 4 seconds on a phone (Slow 4G, 4x CPU), signed in. Measure with `astrix-app/tools/perf/` before and after any change that can affect load, and report the numbers.
- Item moves land on screen as soon as Bungie accepts them. Reconcile with one background read, never block the UI on profile polling.
- Load only what the page needs. No full manifest or data files for features not on screen.

## Tool entry and navigation rule
- Show the portal loader only on a fresh navigation from the public entry, The Hub (/hub/, formerly /tools/). Never show its ring or breach skin on internal tool transfers, reloads, history traversal or direct links.
- Retain the outgoing page until the selected destination has fully rendered and reported readiness. Never show a half-built page. Reveal immediately when ready; 3 to 4 seconds is the maximum target, never an artificial delay.
- A failed transfer exposes recovery actions without a loader animation. Preserve authentication and retry controls.

## Cache keys
- Until `perf/single-module-instances` (#415) is merged: bump `?v=` on every changed shared file and on every page and module that loads it.
- After it merges: JS module versions live in one versions file and the generated import map. Bump the module there only. CSS and image `?v=` keys still bump in place.
- Run `node astrix-app/tools/build-module-versions.mjs` after changing any JS file. Import maps and `module-versions.json` list one module per line, sorted, with a blank line between entries, so PRs that bump different modules merge without conflicts. Never hand-edit or reflow them; `validate-single-module-urls.mjs` checks the layout.

## Validation (run after every change)
- `node astrix-app/tools/validate-scope-guard.mjs`
- `node astrix-app/tools/validate-journey-visual-pass.mjs`
- `node astrix-app/tools/paradox-validator.mjs`
- Plus every test the brief names and every test you touched.
All must exit 0 before a PR, apart from failures that already fail on `main` (list them).
- Design PRs: tests must check what the page looks like (computed styles, bounding boxes), not only that class names exist. Put before/after screenshots at 1600 and 390 in the PR description.

## Reporting
Report ONLY:
- PR number and link
- Branch
- Pushed head commit SHA (must match GitHub)
- Files changed
- Cache keys / versions bumped
- Validator and test exit codes
- Known failures that already fail on `main`
- "Decisions I made" (if any)
No code in chat.

## Locked user flow (Forge Loader to Builder)
Changes to any step below need Miguel's sign-off first. Do not add, remove, reorder or move a question between steps. Last changed 27 Sep 2026 (Miguel signed off on moving results to their own page and adding the weapon anchor).
1. Forge Loader (page title "Preparing The Forge"): the user picks an Exotic armour, an optional Exotic weapon anchor and a set bonus and stat focus. A live top-few-loads preview updates instantly as these change, using the shared search module. "Open Forge Matrix" carries the whole selection in a bookmarkable URL to the results page.
2. Results page (its own URL, reloadable, bookmarkable, shareable): the full ranked list, Staged armour and Enter Builder. Enter Builder is grey and disabled only when not ready, pulsing charcoal when ready, crimson with a visible progress state while transferring.
3. Builder: element, Build objective and Activity (Raid, Dungeon, Grandmaster, Crucible, General PvE) are all picked in the Elemental Build Options panel. If a weapon anchor is set, its element is pre-selected with a visible reason (e.g. "Solar suggested: One Thousand Voices deals Solar damage."); the user can pick a different one. There is no activity popup, and each question is asked once.
4. Generate stays disabled until all three are picked, and its label says what is missing. The engine receives the activity context exactly as before. An anchored Exotic weapon stays in its slot through generation.
