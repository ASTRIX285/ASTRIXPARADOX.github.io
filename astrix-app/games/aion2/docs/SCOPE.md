# The Aetherium: scope

Sources: the AION 2 vertical kickoff note and the fast track plan (both 5 Oct 2026), and the build brief
(Claude Docs, "ASTRIX AION 2 Build Brief").

## What it is

AION 2 is the next ASTRIX PARADOX game vertical. Its tool is The Aetherium. Test character: ASTRIX285,
EU server Meslamtaeda, Elyos Gladiator Lv 12, title "Draped in Sky".

The Hub lists every tool: The Forge (Destiny 2), WorkBench (Division), The Caster (WoW Forever, parked)
and The Aetherium (AION 2).

## Pages

| Page | Job | v1 |
| --- | --- | --- |
| Daeva Card | Search, character summary, 8-slot roster | Yes |
| Gear Ledger | Equipped gear, stigmas, Daevanion boards, stats | Yes |
| Ascent Plan | Ranked fix list with cause and effect | Yes |
| Workshop | Mastery tab, Daevanion planner, gear swap, macro editor | Yes |
| Ladder Watch | Ladder and PvP history | After launch |
| Atreia Atlas | Zones, rifts, Abyss, dungeons | After launch |

No page name repeats another tool's names or The Hub.

## v1 functionality

1. Game folder `astrix-app/games/aion2/` on the shared game-folder contract.
2. Armory Worker on Cloudflare: 5 whitelisted endpoints, 10 minute cache, per-IP rate limit, EU first.
3. Character model: one normalised shape built from the armory, the same for every class.
4. Gladiator catalogue: skill cooldowns, Specialty lines and stigma text from in-game captures, each with provenance.
5. Pages: Daeva Card, Gear Ledger, Ascent Plan, Workshop. A hub card on The Hub.
6. Advisor v1, level-aware, Gladiator: empty slots, low enchant against max, empty manastone slots, unspent
   Daevanion nodes, skill levels, plan-ahead unlocks (Ruinous Blow at Lv 14, stigmas at Lv 22) and a
   recommended macro stack.
7. Faction theme and the standing 3 to 4 second load bar.

Cut to go fast, back after launch: Ladder Watch, Atreia Atlas, NA and other regions, saved builds, compare.

Update 6 Oct 2026 (Miguel): the Ascent Plan covers all 8 classes from day one, not Gladiator only. A new
player picks class, role (Tank, Healer, Support or DPS) and level and gets skills to level, Specialty
picks, stigmas by slot level, Daevanion order, stats and a macro, each with its sources. With a Daeva
loaded it adds fixes from the armory first. Roles with no published build stay pending.

## Decisions

- Colour: the base follows the game UI (midnight navy, gold actions, ice-blue highlights). The accent
  adapts to faction: Elyos gold and sky blue, Asmodian violet and crimson, ASTRIX crimson before a
  character loads.
- The advisor is level-aware: no stigma advice before Lv 22, Daevanion advice only for open boards
  (Nezekan is open at Lv 12).
- Macros: a vertical stack of up to 4 rows on one key, the lowest row fires first, a no-cooldown filler
  on top. Macros are not in the armory data, so macro advice is recommendation-only.
- Global facts the advisor uses (6 Oct 2026 research): level cap 45 on EU and NA; stigma slots at Lv 22,
  27, 32 and 37; Daevanion boards at 12, 20, 30, 40 and 45; Specialty perks at skill Lv 8, 12 and 16 with
  slots at 8, 12 and 20 (three sources, to check in game). Guides disagree on macro order, so the page
  asks the player to check it in game until Miguel confirms it.
- Roster: up to 8 characters per account, added by name and saved on the device.
- The "equip the upgrades in your Cube" fix cannot be automatic (the Cube is not in the public data).
  It is replaced by "spend your open Nezekan nodes".

## Data

| Data | In the armory | Powers |
| --- | --- | --- |
| Profile, combat power, item level | Yes | Daeva Card, faction colour |
| Equipped gear | Yes | Gear Ledger, empty-slot fixes |
| Item detail: stats, max enchant, manastone slots | Yes | Enhancement fixes |
| Skills (35) with unlock and skill level | Yes | Mastery tab, macro stack, plan-ahead fixes |
| Stigmas (13, all need Lv 22) | Yes | Level-aware stigma plan |
| Daevanion boards and node grid | Yes | Daevanion fixes |
| Pet and wings | Yes | Gear Ledger |
| Ranking | Field present, null at Lv 12 | Ladder Watch later |
| Specialty picks, macros, Genus Insight, pet collection, Cube inventory | No | Manual entry or recommendation only |
| Skill cooldowns and Specialty text | No | Catalogue from in-game captures |

## Open items

- Skill cooldowns and Specialty lines for Gladiator, from in-game captures.
- Accessory slot names and positions (none equipped yet, so the armory does not list them).
- Check "The Aetherium" against in-game terms and competitor sites before launch.
