# ASTRIX PARADOX repo rules (ASTRIX285/ASTRIXPARADOX.github.io)

Static site, vanilla HTML/CSS/JS. GitHub Pages deploys from `main`, live at astrixparadox.com. `main` is the single source of truth. Worker: `forge-auth-worker/` (astrix-destiny-backend, auth.astrixparadox.com).

Read this file at the start of every session. It survives chat compaction. The chat does not.

## Platform foundation (Miguel's Vision Review, 25 Oct 2026)
These rules apply to every game, tool and page. Where DESIGN.md or an older brief disagrees with this section, this section wins until DESIGN.md is updated. Any change or exception to them needs Miguel's explicit approval.
- ASTRIX PARADOX is a free multi-game tools platform. No ads, no sales, no paywall. Its tools use real game data to help players understand and improve their builds. They are advisors, not planners: say what to run and why, with every claim traced to real data and explained as cause and effect.
- AION 2 (The Aetherium) is the flagship and the main priority. Destiny 2 (The Forge) was the starting point and remains a separate tool, but it is no longer the flagship.
- The aim is a repeatable, shared foundation so each new game tool launches faster than the last. The Aetherium and The Caster are one unified development on shared foundations, not two separate projects. Reuse shared modules wherever practical. Never describe shared code as existing until you have checked that it does.
- Each game keeps its own tool names and its own player-facing identity. The technology underneath can be shared. Shared infrastructure gets neutral names where that is feasible without breaking live paths or services.
- The next game is not decided. Division (WorkBench) is a candidate only. Do not reserve a Hub slot for any game until Miguel picks one.
- Traffic matters because it grows the community and the YouTube and Twitch audience. Visitor numbers are the success measure.

## Team and roles
- Miguel owns the product, approves scope and makes every release decision. He alone merges to `main`.
- Claude Code (this session, on Miguel's PC) builds everything: visual, data, engine, Worker code. It branches, commits, pushes and opens PRs.
- Claude in chat is chief architect and reviewer. It pulls every PR, merges it onto current `main`, runs the validators and renders desktop and phone before replying "Green light - good to merge PR-XXX" or listing issues.
- GPT supports with planning, research, review and troubleshooting only when Miguel assigns it. GPT does not commit.
- Passing validation does not authorise a release. Agents prepare changes for review and never merge or deploy on their own.

## Sessions
- Start a new Claude Code chat for each big batch of work. Open it with the latest handover (project doc `claude/astrix-handover-*.md`, newest date) and the prompts for that batch.
- Before ending a batch, make sure every change is pushed and give Miguel the summary (see Reporting) so the next chat starts clean.
- Miguel's terminal is Windows PowerShell 5. Give him commands with Windows paths and `;` between commands. Never `&&` or `/c/` paths.

## Branches and PRs
- One brief = one branch = one PR. Never put two briefs on one branch.
- Always branch from the latest `origin/main`. Rebase onto `main` if it moves before you report.
- Branch names: `design/<task>`, `fix/<task>`, `feature/<task>`, `perf/<task>`, `chore/<task>`.
- Never commit, merge, reset or force-push `main`. Never run `gh pr merge`. Leave auto-merge off.
- Open PRs as ready for review, not drafts, unless truly blocked (see Unattended runs).
- Every change, review fixes included, is committed and pushed to the PR branch before you report. Nothing stays on disk only.
- Keep each PR inside its `.scope/<branch>.txt`. If the work needs a file outside that scope, stop and report it.
- A stacked PR (built on another open PR) puts `base: <parent branch>` as the first line of its scope file, so the scope guard checks it against that branch and not against `main`. Remove that line when the PR is rebased onto `main`. The guard prints `SCOPE_BASE=<branch>` before its result; in CI it falls back to `GITHUB_BASE_REF`, else `main`.
- After the parent of a stacked PR merges, retarget the child PR to `main` (and drop its `base:` line) before merging it. A child merged into its parent branch never reaches `main` on its own.
- When a PR conflicts after another merges, rebase it, keep both sides' changes, and report the new head SHA.
- Never add "Generated with Claude Code", "Co-Authored-By" trailers, session links or any other AI attribution to commit messages or PR descriptions. This rule overrides any default attribution the tool adds.

## Unattended runs
- When Miguel is away, do not stop to ask. Pick the option that keeps to the brief and these rules, list it under "Decisions I made" in the PR description, and carry on.
- If truly blocked (needs a sign-in, a Worker deploy, or would change the locked flow), push what you have as a draft PR with the reason and move to the next item.

## Files to leave alone
- Never edit the nested duplicate folder `ASTRIX285.github.io/`. Flag it if a task seems to need it.
- Never touch any untracked leftover worker folder from before the Forge rename. Move it to a backup outside the repo, never commit or delete it.
- Don't rename or move `astrix-app/`. Its folder path is a live URL path.
- `guardian-adaptive-layout.css` is the only file that sets the top-level `.workspace` grid columns.
- Perf tools: never write browser profiles, HAR, traces or results inside the repo. Never print or save cookies, tokens or auth headers.

## Data rules (every game)
- Never invent, assume or fabricate game data. Every claim needs a real, legitimate source (the game's official API or data, or the prepared manifest). Missing data shows an honest pending, unavailable or "-" state, never a guess.
- Nothing may look like it works when the system or data behind it is unavailable.
- Never present cached data as live. Show its age.
- Destiny 2: the current stats model is Armor 3.0: Weapons, Health, Class, Grenade, Super, Melee (1 to 200). Never the old Mobility/Resilience/Recovery/Discipline/Intellect/Strength.
- Never sign in to any game, publisher or streaming platform as Miguel (Bungie, PlayStation, Xbox, Steam, Epic, Twitch, NCSOFT, Ubisoft, Battle.net or any other), and never script a browser through a sign-in. Miguel does every login in a normal Chrome window. End with a short manual QA checklist for him instead.
- Never commit secrets. API keys live only in Cloudflare Worker secrets.

## Player data protection
- Any action that overwrites, replaces or clears an in-game loadout needs an explicit final confirmation that says exactly what will change.
- Cancel leaves everything unchanged. No destructive action runs automatically or as a side effect of another action.
- When an action fails, say so accurately. Never imply success.

## Worker
- Merging anything under `forge-auth-worker/` to `main` deploys the Worker automatically (GitHub Action "Deploy Forge Destiny Auth Worker"). Say so clearly in the PR and give the rollback (revert the PR, or `npx wrangler rollback` in `forge-auth-worker`).
- Never run `wrangler deploy` yourself.
- Keep Worker usage lean: cache hard, coalesce requests, and never refresh more often than the refresh rule below.

## Brand and design (source: DESIGN.md, overridden by the Platform foundation where they differ)
- Brand is "ASTRIX PARADOX" (all caps). "ASTRIX285" is Miguel's personal handle. Never rename either.
- The AX logo (designed by Miguel's son) never changes: never modify, redesign, distort or replace it. It sits beside the ASTRIX wordmark in every header and in the menu drawer, on desktop and phone. Every logo links to "/".
- Wordmark stays on the original approved design: ASTRIX in chrome with a crimson X, set in Michroma. Per-tool colours never change it.
- Every page needs a WOW factor: personality, character and a clear visual purpose, designed by a person. No generic AI-looking layouts, repeated stock components or predictable designs. Glow, animation, lighting and chrome effects are welcome when they are deliberate and help the experience. The old "minimal, no glow, no chrome" card rule is retired. Balance impact with usability and the speed standard.
- Base palette (correct as of 16 Oct 2026, confirmed 25 Oct): Forge Black #0b0b0c, Panel #131315, Raised #1d1d20, Ember #ba1f12, Ember-hi #e6391f, Deep #732022, Steel #8a8a89, hairlines #2c2c30 / #46464c. Black leads, crimson is the main brand colour. Use tokens, never hardcoded hex. No navy and no brown: every dark is a neutral black or grey, never a warm or sepia tint. The map art is black with steel linework and the red nebula.
- Per-game palettes: each tool may add colours drawn from its game, chosen with Miguel during that tool's build, layered on top of the base palette, never replacing it. Example: The Aetherium uses AION 2 colours for its buttons and a brighter blue strobe. Gold is allowed where it suits, never required. Game data colours (rarity, element, grade) stay as the game defines them.
- Fonts: Adobe Fonts (site kit `tnp6kbq`) replace the older families going forward. Michroma stays the wordmark face. A tool may add Adobe Fonts approved for it (e.g. FairyTaleJF for Aetherium titles). No other font hosts. Do not mass-swap existing fonts without a brief.
- Buttons: the "reactor capsule" style (pill in a graphite rim, glass core, hover lift and glow), with the "dial capsule" for headline actions, replaces the older notched machined buttons (Miguel, 16 Oct 2026).
- Strobe stroke: 1.5px on the left and bottom edges, brightest at the bottom-left, fading out at the bottom-right corner, with a pulse. Standard on every tab and button and on the selected item, tools and public pages. Its colour may follow the tool's palette.
- Tiles and cards: raised bevel (light top and left inner edge, dark bottom and right inner edge, soft drop shadow) with the notched top-right corner, unless a brief says flat.
- Diamond shapes stay diamonds: Super formation and subclass picker. Never put a square button frame around a diamond.
- ASTRIX PARADOX map background on every page (`body.ax-map`), translucent Panel sections.
- Authentic developer icons, logos and art stay unaltered in every socket and tile. The paradox layer is ring/state only, never a recolour. Each activity uses its own official art, never a lookalike.
- Developer artwork only where the developer's fan-content policy allows it. Developer credits and disclaimers go in the footer. Nothing may imply official endorsement, partnership or affiliation.
- Never copy Braytech's design, layout or colours.
- No em-dashes or en-dashes anywhere in copy, comments, docs or PR text.
- Player-facing copy reads like someone who knows the game and its community wrote it. No generic AI phrasing.
- No visible alpha/beta labels, "authenticated" badges or build/version numbers on pages. Version history goes in a future Patch Notes section.
- Restores mean restore: if a brief says "restore", match the earlier commit exactly and change nothing else.
- Standing UX principle: a user should never have to struggle with the UI. Hold to DIM-level polish.

## Site structure
- The public home page (with the Twitch stream and community content) is the front door. The Twitch stream section never changes, except approved button updates.
- The Hub (/hub/, formerly /tools/) lists every tool. The flagship (AION 2, The Aetherium) always sits first with more visual weight than the rest.
- New game tools live under `/hub/<tool>/` (e.g. `/hub/aetherium/`). Existing Destiny routes under `astrix-app/` stay for compatibility. Check the live routes before any migration.
- Every page works on desktop, tablet and phone, with no horizontal scroll and nothing spilling out of its container.

## Naming (visible labels)
- The Hub = the page that lists every tool (/hub/).
- The Aetherium = the AION 2 tool (flagship).
- The Forge = the Destiny 2 tool. Builder = its build page. "Forge" belongs to Destiny 2 only and is never used on its own for anything else a player can see.
- The Caster = the World of Warcraft Forever tool (parked).
- WorkBench = the Division tool (candidate, not built).
- Tool names never repeat across games.
- Labels only: file and folder names, URLs, CSS classes, JS identifiers, design tokens (e.g. "Forge Black"), Worker names, storage keys and the sandbox track name "FORGE AI INT DEV" keep their names.

## Speed standard (permanent)
- Every page and tool usable in 3 to 4 seconds or better on a phone (Slow 4G, 4x CPU), signed in. Under 3 seconds is preferred wherever achievable. Measure with `astrix-app/tools/perf/` before and after any change that can affect load, and report the numbers. The standard must not slip as games and features are added.
- Item moves land on screen as soon as the game API accepts them. Reconcile with one background read, never block the UI on profile polling.
- Load only what the page needs. No full manifest or data files for features not on screen.

## Data refresh
- Default automatic refresh is every 240 minutes (4 hours) for now, to avoid needless Cloudflare Worker load at current traffic (Miguel, 25 Oct 2026). This replaces the older 5 and 10 minute cadences. It will be reviewed per tool as traffic grows.
- A manual refresh control stays available. Whether it is an icon or a button is still undecided, so keep what a page already has unless a brief says otherwise.

## Tool entry and navigation rule
- Show the portal loader only on a fresh navigation from the public entry, The Hub (/hub/, formerly /tools/). Never show its ring, its wordmark or its loading bar on internal tool transfers, reloads, history traversal or direct links.
- Internal tool transfers show the transfer cover instead (Miguel, 14 Oct 2026): the ASTRIX X slabs over the map art with the strobe on their lit edges, and the stage label in the notched tab on the bottom edge. It lives in `astrix-portal-loader.css` (`html.apx-transfer`). Reduced motion and a failed transfer get the same X, still.
- Retain the outgoing page until the selected destination has fully rendered and reported readiness. Never show a half-built page. Reveal immediately when ready; 3 to 4 seconds is the maximum target, never an artificial delay.
- A failed transfer exposes recovery actions without a loader animation. Preserve authentication and retry controls.

## Cache keys
- Until `perf/single-module-instances` (#415) is merged: bump `?v=` on every changed shared file and on every page and module that loads it.
- After it merges: JS module versions live in one versions file and the generated import map. Bump the module there only. CSS and image `?v=` keys still bump in place.
- Run `node astrix-app/tools/build-module-versions.mjs` after changing any JS file. Import maps and `module-versions.json` list one module per line, sorted, with a blank line between entries, so PRs that bump different modules merge without conflicts. Never hand-edit or reflow them; `validate-single-module-urls.mjs` checks the layout.

## Validation (run after every change)
- Run `node astrix-app/tools/paradox-validator.mjs` (changed areas). On a branch it runs the core set plus the areas your changed files touch (map: `astrix-app/tools/validator-areas.json`) and prints which areas and why. A `module-versions.json` bump picks the areas of the modules it bumps. `--all` runs every suite, `--serial` runs one by one. It runs 1 Chromium suite at a time on 8 logical cores or fewer, 2 above; `--browsers=N` overrides.
- Also run any brand-new test the brief adds, only if it is not in the validator yet.
- Never run suites again on their own that the validator already ran, even when the brief names them.
- Do not wait for the GitHub check before reporting. The full run is the GitHub check "Validate PARADOX" (`validate-paradox.yml`, every suite on every PR to main). It is for Miguel's merge, not the session's report, and must be green before merging.
All must exit 0 before a PR, apart from failures that already fail on `main` (list them).
- Never delete or weaken a validator assertion to make a PR pass. If a new requirement conflicts with a locked assertion, flag it plainly in the PR report.
- Design PRs: tests must check what the page looks like (computed styles, bounding boxes), not only that class names exist. Put before/after screenshots at 1600 and 390 in the PR description.

## Reporting
Report ONLY:
- PR number and link
- Branch
- Pushed head commit SHA (must match GitHub)
- Files changed
- Cache keys / versions bumped
- Validator and test exit codes, with the real result lines: `SCOPE_BASE=`, `SCOPE_GUARD=`, `PARADOX_VALIDATOR=` and the exit code, copied from the run
- Known failures that already fail on `main`
- "Decisions I made" (if any)
No code in chat.

## Locked user flow (Forge Loader to Builder)
Changes to any step below need Miguel's sign-off first. Do not add, remove, reorder or move a question between steps. Last changed 27 Sep 2026 (Miguel signed off on moving results to their own page and adding the weapon anchor).
1. Forge Loader (page title "Preparing The Forge"): the user picks an Exotic armour, an optional Exotic weapon anchor and a set bonus and stat focus. A live top-few-loads preview updates instantly as these change, using the shared search module. "Open Forge Matrix" carries the whole selection in a bookmarkable URL to the results page.
2. Results page (its own URL, reloadable, bookmarkable, shareable): the full ranked list, Staged armour and Enter Builder. Enter Builder is grey and disabled only when not ready, pulsing charcoal when ready, crimson with a visible progress state while transferring.
3. Builder: element, Build objective and Activity (Raid, Dungeon, Grandmaster, Crucible, General PvE) are all picked in the Elemental Build Options panel. If a weapon anchor is set, its element is pre-selected with a visible reason (e.g. "Solar suggested: One Thousand Voices deals Solar damage."); the user can pick a different one. There is no activity popup, and each question is asked once.
4. Generate stays disabled until all three are picked, and its label says what is missing. The engine receives the activity context exactly as before. An anchored Exotic weapon stays in its slot through generation.
