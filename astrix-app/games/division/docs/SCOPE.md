# ASTRIX PARADOX: Division WorkBench (Build Advisor): Project Scope (v1.2)

**6 September 2026, updated 3 October 2026** · Owner: Miguel De Sousa (brand: ASTRIX PARADOX, gamertag ASTRIX285)

Copied from the project doc `claude/division2-project-scope.md` on 3 October 2026. That doc stays the master; update this copy when it changes.

**Naming (decided 3 Oct 2026).**

- **The Hub** replaces the "Tools" page as the name of the page that lists every game tool. Route `/hub/`; `/tools/` redirects there so old links keep working.
- **The Forge** is the Destiny 2 tool (was Paradox Forge).
- **WorkBench** is the Division tool. No "2" in the name: one WorkBench with a game section per title (TD2 now, TD3 when it exists, TD1 as a config slot only). Routes `/hub/workbench/td2/`, later `/hub/workbench/td3/`.
- **Agent Profile** replaces "Agent Hub" for the Division player page, so it doesn't clash with The Hub.
- One tool name per game, and each name only ever means that tool.
- Code namespace: `games/division/` with per-title configs (`games/division/td2/`, later `td3/`). Shared WorkBench engine code sits in `games/division/` and never forks per title.

The manual build-builder flow in §7 is the WorkBench core screen.

Next project after the Destiny 2 companion. Decided 2026-09-06: Division 2 replaces the parked Path of Exile 2 companion as the active next build, and it is built as a new game vertical **inside** ASTRIX PARADOX (`games/division`, see Naming above) rather than as a standalone product, reusing the dormant multi-game platform architecture that was always intended for this ("land Destiny first, adapt the model to other games later"). This doc is the scoping brief for that build; it supersedes the PoE2 note as the "next project" pointer.

## 1. Why this shape (lessons carried over from the Destiny 2 build)

The Destiny 2 companion (Paradox Forge / Guardian Workspace) produced a working set of rules that should be treated as defaults here, not re-litigated per game:

- **Advisor, not planner/database.** The Destiny differentiator versus DIM/D2ArmorPicker was refusing to just list stats: every recommendation is a sourced, causally-explained claim (A's output feeds B's input). The same standard applies to Division 2: brand/set synergy and talent recommendations must be directed cause-and-effect, not "both good," and every number needs a real source.
- **No invented data, ever.** This is the single most important carried-over rule. The data-model list below already asks for a source + game-version field on every value, which is exactly the mechanism that made the Destiny catalogue trustworthy. Absent or unconfirmed data shows an honest pending state, never a filled-in guess.
- **Architecture separation pays off.** Destiny's split between manifest data, build format, calculation engine and presentation is why the engine could be genericized and mutation-tested. The Division 2 spec already asks for the same separation (catalogue / build format / calc engine / recommendation engine / import adapter / sharing). See §4, which maps it onto the existing ASTRIX structure instead of building it a second time.
- **CI must be wired in from day one.** The core finding from the Destiny build was that `main` and the builder's sandbox diverged because validators only ran locally and branch protection wasn't enforced: a builder could self-report green while `main` was red. For Division 2, the validator suite and its CI workflow should exist before the first feature PR, not be retrofitted later.
- **Team and workflow model carries over unchanged:** Miguel is owner/forensic validator/prompt-writer; Claude is validator/architect/designer who verifies from a clean clone rather than trusting a report; GPT/Codex is the in-repo builder, branch-only, reporting back only branch, commit, files changed and validator exit codes, never pasting code into chat. Branch + PR only, never a direct push or merge to `main`. Full corrected files when Miguel is given code, never snippets or diffs. PR reviews stay terse ("Green light - good to merge PR-XXXX"; elaborate only to flag an issue).
- **Never authenticate as the platform.** The standing rule "never sign in to Bungie/PlayStation/Xbox/Steam/Twitch/Epic: authenticated checks are Miguel's own" already covers Ubisoft Connect. It's restated in §6 because the Division 2 spec calls it out explicitly as a hard restriction, and it's worth keeping as one unified rule across every ASTRIX game vertical rather than a per-game exception.
- **Authentic assets, never recoloured.** Destiny's rule was real Bungie icon art in every socket, with the paradox layer as ring/state only. Division 2 has the same open question one level earlier: confirm Ubisoft's fan-content terms before using any Division 2 artwork at all (the spec flags this as a restriction, not yet resolved). Treat it as blocking asset work, not a footnote.

## 2. Product scope (initial side-project scope, as specified)

Unofficial, read-only tool. Players can:

- Manually recreate their current Division 2 build.
- Select weapons, gear, brands, sets, attributes, talents, mods, skills and specialization.
- Validate whether the build follows all game rules.
- Calculate resulting weapon damage, armour, skill tiers, critical chance/damage and other relevant statistics.
- Identify weak attributes, conflicting talents and missing brand/set synergies.
- Recommend alternative equipment and complete builds.
- Compare the current build with the recommended build.
- Save, duplicate and share builds through URLs.

Explicitly excluded from v1: Ubisoft account linking, automatic inventory synchronization.

This mirrors the Destiny build's own v1 shape almost exactly (manual build entry before any live account link): the API-independent-first sequencing is the same lesson applied to a second game.

## 3. Data the developer must model

- Weapons, weapon families and base statistics.
- Gear slots, brands and gear sets.
- One-, two-, three- and four-piece bonuses.
- Named items and exotic restrictions.
- Core and secondary attributes with minimum and maximum rolls.
- Weapon and armour talents, including activation requirements.
- Gear and skill mods.
- Skills, variants and skill-tier scaling.
- Specializations and their bonuses.
- Expertise, proficiency and upgrade effects.
- Equipped item, loadout and stash locations (modelled now, populated only once API access exists).

Every value carries a **source** and **game-version** field, so balance-patch changes can be traced and updated. This is the direct Division 2 equivalent of Destiny's "every claim needs a real Bungie citation." In the repo this is the shared provenance contract (`platform/contracts/provenance.schema.json`): an official post or an in-game capture, each with a game version.

## 4. Architecture: mapped onto the existing ASTRIX PARADOX platform

Per the platform-fit decision, this is not a parallel codebase. It plugs into the dormant multi-game structure at `astrix-app/` (`core/domains/games/platform/services`, governed by `ARCHITECTURE-GATES.md`) as a new `games/division` domain (per-title configs under it). The six components the spec asks for map onto existing or near-existing pieces:

| Spec component | Lives in | Notes |
|---|---|---|
| 1. Static game-data catalogue | `games/division/td2/data/` (new) | Items, talents, attributes, bonuses, calc rules: Division 2's own manifest-equivalent. Every entry needs source + game-version (§3). |
| 2. Player-build format | `core/` build-schema layer | Neutral JSON, game-agnostic where possible so `core` doesn't fork per game. Extends the prior-art build schemas already sitting inert in `astrix-app/` from the Destiny work (Stage 5 armor-3-components groundwork). |
| 3. Calculation engine | New `games/division/engine/` module (shared across titles), but **reuses the existing generic engines where the domain matches**: `synergy-engine` (brand/set/talent synergy, same directed cause-and-effect model as Destiny's aspect/fragment reasoning), `weapon-linkage` (weapon-to-effect chains, same pattern as Destiny's weapon-role engine), `counter-engine` (activity/enemy-type counters, same shape as champion coverage). Only build genuinely Division-2-specific logic (skill-tier scaling, expertise/recalibration math) from scratch. |
| 4. Recommendation engine | `build-composer` (existing, generic) | Scores builds against goals (DPS, survivability, skill damage, support, hybrid): the same generic scorer used for Destiny's exotic-build recommender, retargeted with Division 2 goal weights. |
| 5. Import adapter | `platform/adapters/division/` | Manual entry + exported-JSON import now; same adapter interface reserved for an eventual Ubisoft API plug-in, mirroring how the Destiny Worker sits behind a swappable adapter. |
| 6. Build-sharing system | `services/` (existing sharing/persistence service if one exists, else new) | Saved builds, version history, shareable links: same shape as the Destiny saved-loadout scaffold. |

`ARCHITECTURE-GATES.md` carries the Division gate alongside the existing Armor 3.0 gate (a schema gate forbidding hardcoded item tables, forcing the manifest-parsing pattern that made Destiny's weapon-role engine hardcode-free).

## 5. Ubisoft access required for full functionality (later phase)

To become a DIM-style connected companion, Ubisoft/Massive would need to provide:

- Developer registration and an application/client ID.
- OAuth authorization with refreshable user tokens.
- Read-only character and platform identity.
- Complete inventory and stash contents.
- Item instance IDs and exact attribute rolls.
- Equipped weapons, armour, skills and specialization.
- Saved loadouts and item locations.
- Expertise, recalibration and optimization information.
- Static manifest or item-definition endpoints.
- Update timestamps or delta endpoints.
- Documented rate limits, caching rules and API versioning.
- Written permission for commercial/community-tool use.

Write access (equipping builds, moving items) is a later phase again, gated the same way the Destiny live-transfer executor is currently gated: built, but disabled until explicitly authorized.

**None of this blocks the prototype.** Automatic account synchronization should not be funded until Ubisoft provides documented access. The entire v1 scope in §2 is achievable with manual entry only.

## 6. Restrictions (hard rules, same class as the existing Destiny standing rules)

The developer must not:

- Reverse-engineer private Ubisoft Connect authentication.
- Capture or reuse Ubisoft session tokens.
- Scrape authenticated Ubisoft services.
- Inspect game memory or intercept network traffic.
- Automate inventory changes.
- Present the product as officially endorsed.
- Copy artwork or protected assets without confirming Ubisoft's fan-content terms.

This folds into the existing platform-wide rule (never sign in to Bungie/PlayStation/Xbox/Steam/Twitch/Epic: Miguel's own auth only): the same rule, Ubisoft added to the list.

## 7. First development milestone (2 to 4 week prototype)

- A reliable Division 2 item schema.
- One complete manual build-builder flow (the WorkBench).
- Accurate stat and set-bonus calculations.
- Five build objectives.
- Current-versus-recommended comparison.
- Shareable build URLs.
- An API adapter interface reserved for Ubisoft integration.

**Go/no-go test:** can the prototype reproduce real community builds accurately, and are its recommendations something players consider useful? This is the same bar the Destiny engine was held to in its own validation (the "iiz3rvi" ground-truth build comparison): stripped known-good community builds are the honest test, never tuning to reproduce a specific answer key.

## 8. Open decisions / risks

- **`ARCHITECTURE-GATES.md` update.** Done: the Division gate landed in Phase 0 (3 Oct 2026) and now uses the shared provenance and pending contracts.
- **Fan-content terms.** Ubisoft's stance on fan-made tool artwork hasn't been checked yet; asset work should not start until confirmed (same class of blocker Destiny hit with Bungie imagery, but unresolved here). Wireframes use neutral placeholders only.
- **Brand presentation.** Whether Division 2 gets its own ASTRIX-PARADOX-styled UI skin (matching the crimson/gold identity) or a neutral treatment hasn't been decided. Still open; decide before the WorkBench UI pass.
- **CI scope.** Decided: Division checks run in their own workflow (`.github/workflows/validate-division.yml`) on every PR, and inside `paradox-validator.mjs`.

## 9. Strategic position (added 3 Oct 2026)

- **Division 2 = legacy benchmark and publisher-outreach target.** The manual WorkBench prototype is the product demo. Its second job is to back a concrete request to Ubisoft/Massive for authorised read-only character, inventory and loadout access. If that access is granted, Division 2 becomes a top-three commercial prospect straight away.
- **Division 3 = number one API watchlist candidate.** Approach Massive/Ubisoft early with a concrete proposal covering read-only inventory, builds, progression and OAuth scopes. As of Oct 2026 there is no confirmed release date, platform list, API or third-party developer programme. Insider reporting (Tom Henderson, Jan 2025) put launch at 2027 at the earliest.
- **Do not invest heavily in a Division 2 integration** built on private Ubisoft endpoints, scraping or reverse-engineered auth. Build the manual prototype, then use it to support the partnership request.
- **The Division (1):** advisor fit 7/10, API readiness 1/10, roughly 450 Steam players online. Lowest priority. The framework stays game-agnostic so a TD1 slot/attribute config could be added, but no TD1 work is planned.

## 10. Market evidence (research snapshot)

- The Division 2: about 4,900 concurrent Steam players at the snapshot, excluding Ubisoft Connect, Epic and consoles, and still receiving content updates.
- Franchise passed 40 million players (Ubisoft, 2023).
- Ubisoft officially supports up to 12 in-game saved combinations of gear, skills and weapons, so loadouts are a first-class concept in the game.
- Demand for build sharing is proven by Build Station, the mx Division Builds tool and the open-source Division 2 Loadout project. All are manual planners with locally stored data, which is the same v1 shape as the WorkBench. The WorkBench differentiator is the advisor layer (sourced cause-and-effect synergy and recommendations), not the planner.

## 11. What data can actually be pulled from Division servers (checked 3 Oct 2026)

- **No official Ubisoft API** for inventory, gear, loadouts or character for TD1, TD2 or TD3. Ubisoft Connect sign-in does not authorise third-party game-data access.
- **Public career stats only, via third parties.** Tracker Network exposes a Division 2 API with two endpoints (player search and profile stats by platform ubi/psn/xbl). Stats only, no gear or inventory. Needs a Tracker Network developer key and their terms. TheDivisionTab runs an unofficial stats API but doesn't document where its data comes from, so it should not be used until its source is confirmed.
- **Design consequence:** every WorkBench screen is built on the hand-sourced catalogue plus manual entry. Public career stats are an optional, clearly labelled extra on the Agent page. Anything that needs inventory or loadouts is designed in as a locked "requires Ubisoft authorised access" state, wired to the reserved adapter.

## 12. Sourcing (added 3 Oct 2026, fast-track plan)

Ubisoft doesn't publish full stat tables; patch notes list changes, not every value. So the catalogue accepts two source kinds:

- **Official post:** patch notes, ubisoft.com news, developer posts. Wins when one exists.
- **In-game capture:** Miguel reads the value in game (gear tooltip, brand set screen, skill menu) and records it with the game version, date and screen. Only the value is committed, never the screenshot.

Datamined client data, fan wikis and guides are never a source for the Division catalogue.

## Status

**Parked:** Path of Exile 2 companion, superseded as "next project" by this decision (2026-09-06). Its OAuth 2.1 confidential + public PKCE research stays on file if PoE2 is revisited later.

**Next (3 Oct 2026):** Target is WorkBench live (beta) before Tuesday 3 November 2026, when The Division 2: Echoes of Central Park launches. Phase 0 (architecture gate + CI) is done. Order of work: shared game-folder contract, item schema and build format, then the WorkBench editor. Figma framework and per-page wireframes: https://www.figma.com/design/naXvtfvKTHqMbgrMiiBxLt (spec in `claude/division2-workbench-wireframe-spec-3oct2026.md`).
