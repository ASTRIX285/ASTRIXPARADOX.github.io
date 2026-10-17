# Ranger level guidance (research record, 17 Oct 2026)

For The Aetherium's level planner (`engine/level-planner.mjs`). It records what published Ranger builds do at each level, every synergy between Ranger skills with the skill level it needs, and the logic check each trend passed or failed. The planner reads the data built from this record (`data/advisor/skills.json` values and synergies, `data/advisor/builds/ranger.json` ascent), never this file. It follows the Gladiator record (`gladiator.md`).

Status on every fact: **CONFIRMED** (quoted from the game tooltip data, or seen in game by Miguel), **REPORTED** (published builds or guides), **UNKNOWN** (no source). Sources stay in this record and the repo, never on a page.

## 0. How the builds were read

- questlog.gg public read API (no account). The Ranger skill build list holds 936 builds and serves 900. Reading each author's builds gave 934 Ranger builds from 768 authors.
- Players clone popular builds, so the 934 hold only 294 distinct configurations. **Every count below is over 224 distinct configurations** (at least 3 Specialty picks, clones and empty builds removed) unless it says "with copies".
- 128 of the 224 have a priority list (112 of them list a stigma), 125 save a macro, 12 are levelling builds by their title ("Early Game", "Starter", "Leveling", "Level phase", "Lvl 16" and the like).
- Tooltip data: questlog's game database for all 35 Ranger skill ids (unlock level, training table, cooldown, every Specialty option and the skill level it opens at). Counted as CONFIRMED.
- 482 Daevanion plans read from the same authors (247 distinct and non-empty).
- Caveat (REPORTED by three Gladiator build authors, same builder): a questlog skill level is the total level (trained plus Daevanion, rings, gear and Arcana), not trained points alone. Builds have no character level field, so level bands combine build titles, the training tables and guide advice.
- 100 of the 224 list 5 or more stigmas, which Global does not allow: stigma counts mean "chosen", not "equipped".
- Cross-checks: ExpCarry Ranger guide (updated 12 Oct 2026) and the AION2 Vault macro counts in our records.

## 1. Facts the planner rests on

| Fact | Value | Status |
|---|---|---|
| Stigma slots | Lv 22, 27, 32, 37, four on Global | CONFIRMED (Gladiator record) |
| Specialty options | Active skills: three options at skill Lv 8, one at 12, one at 16. Stigmas: one at stigma Lv 5, 10, 15 and 20 | CONFIRMED (tooltip) |
| Specialty slots | 1 slot at skill Lv 8, 2 at Lv 12, 3 at Lv 20 | CONFIRMED (Gladiator record, same builder) |
| Trainer levels | Skill Lv 8 and Lv 10 are sold only from a character level: Snipe, Tempest Shot, Snare Shot 19 and 25; Marking Shot 21 and 27; Drill Dart 22 and 28; Arrow Scattershot 23 and 29; Gale Arrow 25 and 31; Explosion Trap 26 and 32; Burst Arrow 28 and 34; Suppressing Arrow 30 and 36; Deadshot 32 and 38; Defiance 34 and 40 | CONFIRMED (tooltip training tables) |
| Skill unlocks | Snipe, Tempest Shot, Snare Shot 1; Marking Shot 3; Drill Dart 4; Arrow Scattershot 5; Gale Arrow 7; Explosion Trap 8; Burst Arrow 10; Suppressing Arrow 12; Deadshot 14; Defiance 16. Passives: Vigilant Eye 1, Concentrated Fire 6, Wind Vigor 9, Focused Eye 11, Hunter's Resolve 13, Unyielding Resolve 15, Rooting Eye 17, Melee Fire 21, Revitalization Contract 23, Hunter's Soul 25. Stigmas 22 | CONFIRMED |
| Cooldowns | Snipe, Tempest Shot, Arrow Scattershot none; Drill Dart 5 s; Marking Shot 10 s; Snare Shot 15 s; Gale Arrow, Burst Arrow, Deadshot, Explosion Trap, Suppressing Arrow 20 s; Defiance 60 s; Griffon Arrow, Explosive Arrow 45 s; Vaizel's Authority, Arrow Storm 60 s; Supporting Fire, Mother Nature's Breath 90 s; Bow of Blessing 120 s | CONFIRMED (tooltip) |
| Mastery cap | We hold 11 (Miguel, in game, 10 Oct 2026). Every source read says the trained cap is 10 | **Ruling needed** (the same open point as the Gladiator record) |
| Daevanion | Each of the first four boards has a +1 node for every Ranger active and passive (22 nodes a board), so at most +4 per skill. Boards open at Lv 12, 20, 30, 40, 45 | CONFIRMED (questlog node data); points earned per character level UNKNOWN |

## 2. Trends by level (counts over 224 distinct builds)

### Core skills, all levels
- Drill Dart 216, Gale Arrow 214, Tempest Shot 214, Deadshot 213, Snipe 213, Marking Shot 212, Burst Arrow 211, Snare Shot 208, Explosion Trap 196, Suppressing Arrow 185, Arrow Scattershot 136, Defiance 116.
- Levelled highest: Deadshot and Gale Arrow (median 20, Lv 20 in 119 and 114), then Snipe, Drill Dart and Tempest Shot (median 16), Burst Arrow 14, the rest 12.
- First active skill in the priority list: Deadshot 67 of 112, Snipe 12, Tempest Shot 11, Gale Arrow 11, Drill Dart 6. Second: Gale Arrow 47, Deadshot 22, Drill Dart 16. Third: Drill Dart 56.
- First two passives in the priority list: Focused Eye 105, Hunter's Resolve 97.

### Lv 1 to 13 (before Deadshot)
- No Specialty is reachable by training before Lv 19 (the earliest trained Lv 8 is Snipe, Tempest Shot and Snare Shot at 19).
- Levelling builds (12): Deadshot, Snipe, Drill Dart, Gale Arrow and Tempest Shot are skill Lv 12 or more in 10 of 12 each; Snare Shot 9; Burst Arrow and Marking Shot 8.
- Levelling priority lists (5): Drill Dart first in 2 and second in the other 3, behind Deadshot.

### Lv 14 to 21 (Deadshot joins)
- First picks in levelling builds: Deadshot faster speed 12 of 12, Gale Arrow fewer-targets buff 10, Drill Dart faster speed 9, Marking Shot Perfect chance 9 and longer Precision 9, Tempest Shot fewer-targets damage 9, Snipe cuts Deadshot 8.

### Lv 22 to 37 (stigmas)
- Stigma in the first place of the priority list: Vaizel's Authority 94 of 112. Second: Bow of Blessing 55, Supporting Fire 41. Third: Supporting Fire 39, Griffon Arrow 29, Bow of Blessing 28. Fourth: Explosive Arrow 33, Griffon Arrow 33.
- Levelling stigmas (12): Vaizel's Authority 12, Explosive Arrow 11, Supporting Fire 11, Bow of Blessing 10, Griffon Arrow 5.
- One top build (most liked on the builder) says: Vaizel's Authority to stigma Lv 20 first, Explosive Arrow until Griffon Arrow reaches stigma Lv 15, then Bow of Blessing and Supporting Fire (REPORTED, 1).

### Lv 45
- All stigmas: Vaizel's Authority 210, Bow of Blessing 203, Supporting Fire 189, Griffon Arrow 161, Explosive Arrow 136, Mother Nature's Breath 50, Ambush Kick 24, Arrow Storm 23, Sealing Arrow 21.
- Sets of exactly four: Vaizel, Bow of Blessing, Supporting Fire, Griffon Arrow 56; the same with Explosive Arrow for Griffon Arrow 31; Vaizel, Bow of Blessing, Explosive Arrow, Griffon Arrow 11.
- ExpCarry (12 Oct): Vaizel's Authority, Bow of Blessing and Supporting Fire are the core, Griffon Arrow the standard fourth, Explosive Arrow or Mother Nature's Breath a swap for some content (REPORTED).
- Specialty picks: Deadshot faster speed 168, mobile 112, extra damage 101, ignores Block 71. Gale Arrow fewer-targets buff 167, mobile 138, shorter cooldown 111, longer buff 36. Tempest Shot fewer-targets damage 165, faster speed 121, skill Critical Hit 98, less MP 17. Snipe cuts Deadshot 150, Multi-Hit 107, Tempest Arrow chain 100, more MP 22. Drill Dart faster speed 137, Multi-Hit 127, fires twice 120. Marking Shot Perfect chance 150, longer Precision 140. Snare Shot mobile 145, faster speed 128. Burst Arrow mobile 142, fewer-targets damage 132.
- Stigma picks: Bow of Blessing Multi-Hit 125, Vaizel's Authority Perfect chance 122, Supporting Fire shot chance 111, Vaizel's Focused Eye 106.
- Daevanion (157 plans of 300 to 470 points): all four +1 nodes on Drill Dart 134, Deadshot 133, Snipe 131, Gale Arrow 131, Tempest Shot 127, Hunter's Soul 125, Hunter's Resolve 121, Focused Eye 118, Burst Arrow 112. Early plans (150 points or fewer, 23): a node on Drill Dart in 19, Snipe 17, Deadshot 17, Burst Arrow 16.

### Macros
- Distinct builds: Griffon Arrow then Gale Arrow 16; Gale Arrow alone 13; Gale Arrow, Drill Dart, Vaizel's Authority 11; Gale Arrow, Drill Dart, Burst Arrow 10; Snare Shot alone 8; Gale Arrow, Drill Dart 6; Snare Shot then Gale Arrow 5.
- With copies: Gale Arrow 160, Snare Shot 154, Griffon Arrow then Gale Arrow 112.
- AION2 Vault (14 Oct, in our records): Gale Arrow, Drill Dart, Tempest Shot 53%; Griffon Arrow, Snare Shot, Burst Arrow 26%; Snare Shot, Explosive Arrow, Burst Arrow 25%. Deadshot (98%) and Marking Shot (96%) kept out of macros.

### PvP (17 distinct builds)
- Mother Nature's Breath 8 of 17, Sealing Arrow 6, Ensnaring Trap 5. The planner has no PvP role, so these are recorded only.

## 3. Synergies, with the skill level each needs

| # | Synergy | Needs | Status |
|---|---|---|---|
| 1 | Burst Arrow fires only on a slowed or rooted target | base | CONFIRMED |
| 2 | Snare Shot slows up to 4 enemies for 5 s (7 s with its Lv 16 option), so Burst Arrow can fire | base | CONFIRMED |
| 3 | Explosive Arrow hits 20% harder on a slowed or rooted target (30% at stigma Lv 10, 50% at Lv 20) | base | CONFIRMED |
| 4 | Marking Shot grants Precision, +300 Critical Hit for 10 s (15 s with its Lv 8 option) | base | CONFIRMED |
| 5 | Deadshot hits 35% harder with Precision | base | CONFIRMED |
| 6 | Snipe cuts Deadshot's cooldown by 1 s a hit | Snipe Lv 12 option | CONFIRMED |
| 7 | Snipe restores 120 MP a hit, no cooldown (144 with its Lv 8 option) | base | CONFIRMED |
| 8 | Drill Dart restores 100 MP on a Critical Hit | base | CONFIRMED |
| 9 | Gale Arrow cooldown 20 s to 10 s, the same as Gale lasts | Gale Arrow Lv 16 option | CONFIRMED |
| 10 | Arrow Scattershot fires only on a staggered target | base | CONFIRMED |
| 11 | Arrow Scattershot cuts all cooldowns by 1 s a hit | its Lv 16 option | CONFIRMED |
| 12 | Arrow Storm fills the Stagger gauge by 50, so Arrow Scattershot can fire | base | effect CONFIRMED, link REPORTED |
| 13 | Vaizel's Authority: a Critical Hit has a 50% chance to cut all cooldowns by 1 s | stigma Lv 20 | CONFIRMED |
| 14 | Vaizel's Authority makes Focused Eye count 1.5 times | stigma Lv 10 | CONFIRMED |
| 15 | Vaizel's Authority makes Hunter's Soul count 1.5 times | stigma Lv 15 | CONFIRMED |
| 16 | Hunter's Soul: 50% chance of extra Wind damage on a Critical Hit, so Bow of Blessing's +200 Critical Hit and Precision feed it | Lv 25 passive | effect CONFIRMED, link REPORTED |
| 17 | Concentrated Fire: 50% chance of extra Wind damage on a target taking damage over time (Drill Dart's Bleed, Griffon Arrow's burn) | Lv 6 passive | CONFIRMED |
| 18 | Rooting Eye: 50% chance of extra Wind damage on a slowed or rooted target (Snare Shot) | Lv 17 passive | CONFIRMED |
| 19 | Suppressing Arrow: 25% chance to reset its cooldown while you have Precision | its Lv 16 option | CONFIRMED |
| 20 | Defiance ignores cooldown cuts | base | CONFIRMED |
| 21 | Supporting Fire heals 1.5% HP a shot | base | CONFIRMED |
| 22 | "Snare Shot then Burst Arrow on the same key" | | REPORTED (macro counts); the planner keeps Snare Shot on stack A, see section 4 |

The planner reads 1, 3, 5, 6 and 16 as values (a value that rests on another skill counts once that skill can be placed), and 1, 2, 10 as the conditions that keep Burst Arrow and Arrow Scattershot from blocking their stack. Link 2 is stored as "setsUp", not "opens": see open point 3.

## 4. The logic check on each trend

The planner scores every choice by the role weights (damage 3, survival 1, MP 1; no Ranger skill buffs the party or holds Enmity) over each skill's values, counts a value only once what it rests on is in place, and uses trends only as a small tie-breaker.

| Trend | Logic check | Result |
|---|---|---|
| Gale Arrow, Drill Dart, Tempest Shot as a macro (Vault 53%) | Gale Arrow is the buff and needs no condition; Tempest Shot is always ready, so it sits last and blocks nothing | PASSED. The set-up stack holds them, under Snare Shot |
| Snare Shot alone (8, 154 with copies) and Snare Shot then Gale Arrow (5) | Its Slow is what Burst Arrow needs and what Explosive Arrow and Rooting Eye reward; 15 s cooldown | PASSED. Snare Shot is row 0 of the set-up stack from Lv 1 |
| Snare Shot and Burst Arrow on one key (Vault 26% and 25%) | Burst Arrow fires only on a slowed target. On its own key it never blocks: it waits for the Slow from the set-up stack | PASSED in a different form: Burst Arrow is on the pay-off stack, Snare Shot on the set-up stack |
| Gale Arrow, Drill Dart, Vaizel's Authority (11, 58 with copies) | A 10 s burst buff, pressed with the other burst buffs | REJECTED: "It belongs on its own key" |
| Griffon Arrow then Gale Arrow (16, 112 with copies) | Griffon Arrow is already on the pay-off stack | REJECTED for the set-up stack ("Already on this key") |
| Gale Arrow, Drill Dart, Burst Arrow (10, 55 with copies) | Burst Arrow is already on the pay-off stack | REJECTED for the set-up stack |
| Deadshot or Marking Shot in a macro (2 and 11 builds) | Deadshot is charged (a macro fires stage 1 only); Marking Shot moves you | REJECTED: both keep their own key, as 98% and 96% of Vault macros do |
| Drill Dart first while levelling (5 of 5 levelling lists, first or second) | A 5 s cooldown hit on up to 4 enemies with a Bleed: the most damage of the early kit | PASSED Lv 4 to 13. At Lv 1 to 3 Snipe comes first (MP; Drill Dart unlocks at 4) |
| Deadshot levelled first (67 of 112) | Hardest hit, 35% more with Precision from Lv 3, and Snipe's Lv 12 option cuts its cooldown | PASSED from Lv 14 |
| Vaizel's Authority as the first stigma (94 of 112, 12 of 12 levelling) | Attack +20% for 10 s every 60 s: the largest damage value of any stigma | PASSED. Slot 1 at Lv 22 |
| Bow of Blessing as the second stigma (55 of 112 lists) | Before its stigma Lv 10 and 15 options, a 10 s crit buff every 120 s is worth less than a 45 s group hit with a burn | REJECTED: slot 2 at Lv 27 takes Griffon Arrow. Bow of Blessing goes in slot 4 at Lv 37 |
| Griffon Arrow in the four (161, 56 sets; ExpCarry's standard fourth) | A 45 s group hit with a 10 s burn; Concentrated Fire procs on burning targets | PASSED. Slot 2 at Lv 27 |
| Supporting Fire in the four (189) | An orb that fires and heals for 15 s every 90 s | PASSED. Slot 3 at Lv 32 |
| Explosive Arrow while levelling (11 of 12 levelling builds; one top build: until Griffon Arrow is stigma Lv 15) | Logic agrees it is strong at low stigma levels (20% more on a slowed target, and Snare Shot slows from Lv 1). But the planner ranks stigmas once for every level, and by hand it cannot see stigma levels, so it cannot swap Explosive Arrow out when Griffon Arrow reaches Lv 15 | NOT EXPRESSED: Explosive Arrow stays a listed swap (ranked 5). **Ruling needed**, open point 2 |
| Mother Nature's Breath (50) | Survival only: 20% less PvE damage for 6 s | REJECTED for DPS (ranked 7); a listed swap for hard fights |
| Tempest Shot less MP (our old pick, 17 builds) | Up to 12% more damage on fewer targets is worth more (165 builds agree) | REJECTED: the planner picks the damage |
| Deadshot mobile at Lv 8 (our old pick, 112 builds) | Faster speed (168) is more damage; mobile is the common second pick at Lv 12, which the planner does not model (one pick per level) | REJECTED for the Lv 8 slot |
| Gale Arrow longer buff (36) | 15 s buff on a 20 s cooldown helps until skill Lv 16 cuts the cooldown to 10 s; after that it adds nothing. Mobile keeps the stack from rooting you | REJECTED: mobile (138) |
| Focused Eye and Hunter's Resolve first among passives (105 and 97) | Small flat gains; the planner levels a skill outside the key skills only when the role weighs it 4 or more | Not levelled by the plan; their Daevanion nodes are tier 2 |
| Suppressing Arrow on the bar (164 of 224) | A 20 s single-target hit that stuns NPCs | Not on the build's bar: **ruling needed**, open point 4 |

## 5. What the planner gives (by hand, no Daeva, DPS)

| Level | Set-up stack (key A) | Pay-off stack (key B) | Stigmas open | Level first | Next |
|---|---|---|---|---|---|
| 1 | Snare Shot, Tempest Shot | none | none | Snipe | Lv 3: Marking Shot gets its own key |
| 5 | Snare Shot, Drill Dart, Tempest Shot | Arrow Scattershot | none | Drill Dart | Lv 7: Gale Arrow joins the set-up stack |
| 12 | Snare Shot, Gale Arrow, Drill Dart, Tempest Shot | Burst Arrow, Arrow Scattershot | none | Drill Dart | Lv 14: Deadshot gets its own key |
| 22 | same | same | Vaizel's Authority | Deadshot | Lv 27: Griffon Arrow in slot 2 |
| 27 | same | Burst Arrow, Griffon Arrow, Arrow Scattershot | + Griffon Arrow | Deadshot | Lv 30: Vaizel board |
| 32 | same | same | + Supporting Fire | Deadshot | Lv 37: Bow of Blessing in slot 4 |
| 37 | same | same | + Bow of Blessing | Deadshot | Lv 40: Triniel board |
| 45 | same | same | Vaizel's Authority, Griffon Arrow, Supporting Fire, Bow of Blessing | Deadshot | none |

Snipe is the main attack at every level. Own keys keep their place from Lv 1 (a skill still to come leaves its key free): Vaizel's Authority, Bow of Blessing, Supporting Fire, Deadshot, Arrow Storm, Explosion Trap, Mother Nature's Breath, Defiance, Marking Shot. Explosive Arrow stays in the pay-off stack's data and shows in Comes later ("Needs a stigma slot").

Daevanion by hand: Nezekan from Lv 12 with Drill Dart, Snipe, Gale Arrow and Tempest Shot +1 now; Deadshot's node waits for Lv 14.

## 6. The PR #510 macro stacks, re-checked

- Set-up stack (Snare Shot, Gale Arrow, Drill Dart, Tempest Shot) and pay-off stack (Explosive Arrow, Burst Arrow, Griffon Arrow, Arrow Scattershot): every row passes the stack rule at every level, and the logic checks in section 4 hold. No published top build runs these exact stacks, so `verified` stays false and the Skill Bar and Macro screens keep their "Not confirmed yet" tag.
- The stacks now carry a name (Set-up stack, Pay-off stack) so the Next line can say which one a skill joins, and own keys keep the listed order so a burst buff still to come keeps its key free.

## 7. Open points

1. Mastery cap: our record holds 11 from Miguel's in-game capture; every source read says 10 (the Gladiator ruling covers both).
2. Stigma swap by stigma level: Explosive Arrow while levelling, then Griffon Arrow once it is stigma Lv 15. The planner cannot express it (one stigma ranking for every level; stigma levels unknown by hand). Choices: keep today's answer (Griffon Arrow from Lv 27, Explosive Arrow a swap), or a planner change in its own PR.
3. Cross-key set-up: Snare Shot on the set-up stack slows for Burst Arrow and Explosive Arrow on the pay-off stack. The planner looks for an opener on the same key only; as an "opens" link it puts Snare Shot on both keys (its own bar check flags it). Stored as "setsUp"; the bar is right today because Snare Shot is on key A from Lv 1.
4. Suppressing Arrow: in 185 of 224 builds and on the bar in 164, but the build's bar has no key for it. Adding an own key changes the macro builder's Ranger bar: needs Miguel's say.
5. Daevanion points earned per character level: UNKNOWN, so by hand the plan names the board and its first nodes, not how many points you have.
6. PvP: 17 builds lean on Mother Nature's Breath and Sealing Arrow; the planner has no PvP role or team for the Ranger.

## Sources (read 17 Oct 2026)
- questlog.gg public read API: Ranger skill build list and build detail (934 builds, 768 authors), game database skill tooltips (35 Ranger ids), Daevanion planner (482 plans).
- ExpCarry Ranger build guide (updated 12 Oct 2026).
- Our records: `MACRO-RESEARCH.md` (AION2 Vault macro counts, 14 Oct 2026), `builds/ranger.json` provenance (MetaBot Ranger build and stigma guide, ExpCarry, Daeva Guides macros, The Games Wiki Ranger skills).
