# Assassin level guidance (research record, 17 Oct 2026)

For The Aetherium's level planner (`engine/level-planner.mjs`). It records what published Assassin builds do at each level, every synergy between Assassin skills with the skill level it needs, and the logic check each trend passed or failed. The planner reads the data built from this record (`data/advisor/skills.json` values and synergies, `data/advisor/builds/assassin.json` ascent and macro), never this file.

Status on every fact: **CONFIRMED** (quoted from the game tooltip data, or seen in game by Miguel), **REPORTED** (published builds or guides), **UNKNOWN** (no source). Sources stay in this record and the repo, never on a page.

## 0. How the builds were read

- questlog.gg public read API (no account). 1,518 Assassin skill builds listed, 900 served; full detail read for 943 builds from 661 authors (every public build of each author).
- Players clone popular builds, so the 943 hold only 312 distinct configurations. **Every count below is over 248 distinct configurations** (at least 3 Specialty picks, clones and empty builds removed) unless it says "with copies".
- Levelling builds: 17 distinct (101 with copies) whose title says levelling, campaign, early or starter and not Lv 45.
- Tooltip data: questlog's game database for all 35 Assassin skill ids (unlock level, training table, cooldown, MP cost, every Specialty option and the skill level it opens at). Counted as CONFIRMED.
- Daevanion: 415 Assassin plans read from the same 661 authors, 230 distinct and non-empty; 136 of them spend 300 to 470 points (a full Season 1 plan).
- MetaBot top-player data: 150 top Assassins (stigmas, skill levels, Daevanion nodes), page read 17 Oct 2026, marked "Low sample" on the page.
- Caveat (REPORTED, Gladiator record): a questlog skill level is the total level (trained plus Daevanion, rings, gear and Arcana), not trained points alone. Builds have no character level field, so level bands combine build titles, the training tables and guide advice.
- 91 of the 248 list 5 or more stigmas, which Global does not allow: stigma counts mean "chosen", not "equipped".
- Role: every build read is a damage build. The Assassin has one role in The Aetherium (DPS) and no team variants. 27 builds are titled PvP; see section 6.

## 1. Facts the planner rests on

| Fact | Value | Status |
|---|---|---|
| Stigma slots | Lv 22, 27, 32, 37, four on Global | CONFIRMED (Gladiator record, same rule for every class) |
| Specialty slots | 1 slot at skill Lv 8, 2 at Lv 12, 3 at Lv 20. Lv 16 opens a fifth option, not a new slot | CONFIRMED (tooltip option levels, builder data) |
| Skill unlocks | Quick Slice, Savage Roar, Shadowstrike 1; Ambush 3; Heart Gore 4; Storm Rampage 5; Whirlwind Slice 7; Flash Slice 8; Infiltrate 10; Shadow Fall 12; Insignia Explosion 14; Defiance 16. Passives: Heightened Sixth Sense 1, Exploit Weakness 6, Apply Poison 9, Rear Smite 11, Assault Stance 13, Impact Hit 15, Ambush Stance 17, Defense Break 21, Revitalization Contract 23, Determination 25. Stigmas 22 | CONFIRMED (matches our icon list) |
| Trainer levels | Skill Lv 8 and Lv 10 are sold only from a character level: Quick Slice, Savage Roar, Shadowstrike 19 and 25; Ambush 21 and 27; Heart Gore 22 and 28; Storm Rampage 23 and 29; Whirlwind Slice 25 and 31; Flash Slice 26 and 32; Infiltrate 28 and 34; Shadow Fall 30 and 36; Insignia Explosion 32 and 38; Defiance 34 and 40. Passives: Exploit Weakness 24 and 30, Rear Smite 29 and 35, Assault Stance 31 and 37 | CONFIRMED (tooltip training tables) |
| Cooldowns | Quick Slice 0, Savage Roar 0, Storm Rampage 0, Heart Gore 5 s, Ambush, Flash Slice, Whirlwind Slice, Insignia Explosion 10 s, Shadowstrike, Infiltrate, Shadow Fall 20 s, Defiance 60 s. Stigmas: Evasion Stance 20 s, Triniel's Dagger 45 s, Savage Fang and Swift Contract 60 s, Illusive Clone 90 s | CONFIRMED |
| Mastery cap | We hold 11 (Miguel, in game, 10 Oct 2026). The Gladiator record's ruling on 11 against 10 stands for every class | Ruling pending (Gladiator record, section 6) |
| Daevanion | Boards Nezekan 12, Zikel 20, Vaizel 30, Triniel 40, Azphel 45. One +1 node for each active skill on each of the first four boards (3 points each), so at most +4 per active. Some passives have two nodes on Nezekan (Rear Smite, Assault Stance, Exploit Weakness, Apply Poison, Heightened Sixth Sense; 2 points each) | CONFIRMED (questlog board and node data) |
| Stigma points | 5 at Lv 27, 10 at 32, 15 at 37, 19 at 40, 29 at 45 | REPORTED (one guide, Gladiator record) |

Two errors in the PR #510 data, corrected here from the tooltip: Ambush engraves 2 Insignia only with its Lv 8 option and only on a back attack (not base); Storm Rampage cuts all cooldowns by 1 s a hit only with its Lv 16 option (not base).

## 2. Trends by level (counts over 248 distinct builds)

### Core skills, all levels
- Insignia Explosion and Heart Gore are in 243 of 248, Quick Slice 242, Savage Roar 240. Insignia Explosion and Heart Gore are levelled highest (median 16, Lv 16 or more in 134 each), then Quick Slice (median 15), Savage Roar and Storm Rampage (14).
- First active skill in the priority list: Heart Gore 65 of 150, Quick Slice 54, Insignia Explosion 18.
- Top players (MetaBot, 150): Quick Slice and Heart Gore average Lv 13.9, Insignia Explosion 13.6, Savage Roar 13.
- Macro (146 builds with one): Insignia Explosion in 107, Quick Slice 42, Savage Fang 39, Heart Gore 39, Savage Roar 24, Illusive Clone 24, Ambush 16, Whirlwind Slice 16, Storm Rampage 14, Triniel's Dagger 12. 140 of 152 macro builds save one macro, not two.
- Lines in that order: "Insignia Explosion" alone 42 (238 with copies); "Savage Fang, Insignia Explosion, Heart Gore, Savage Roar" 7 (23 with copies); "Insignia Explosion, Heart Gore, Savage Roar" 7 (25 with copies). Each is the same line with rows left out, in the same order. Against it: "Heart Gore, Insignia Explosion" 3 (13 with copies).
- AION2 Vault (REPORTED, 14 Oct 2026) gives "Insignia Explosion, Ambush, Storm Rampage, Savage Roar" as the most common line (27%). It is not in any of the 539 builds with a macro we read (no build holds those four together), so it is not used.

### Lv 1 to 13
- No Specialty is reachable by training (the earliest trained Lv 8 is at character Lv 19).
- Levelling builds (17): Quick Slice, Savage Roar, Insignia Explosion and Heart Gore at Lv 12 or more in 15 of 17 each; nothing else in more than 4.
- First active in their priority list: Quick Slice 12 of 16, Flash Slice 2, Heart Gore 2.

### Lv 14 to 21
- Insignia Explosion opens at 14 and joins the main line. Levelling macros: "Insignia Explosion" alone 7, "Insignia Explosion, Heart Gore, Savage Roar" 4.
- First picks in levelling builds: Savage Roar faster skill speed 17 of 17, Insignia Explosion Multi-Hit 16 and keep 2 stacks 15, Heart Gore HP absorb 14 and Multi-Hit at Lv 12 13, Quick Slice HP absorb 14 and Multi-Hit 8.

### Lv 22 to 37 (stigmas)
- Levelling stigmas (17): Swift Contract 17, Illusive Clone 16, Triniel's Dagger 15, Savage Fang 13, Evasion Stance 2.
- First stigma in the priority list: levelling builds Illusive Clone 12 of 16; all builds Illusive Clone 82 of 157, Triniel's Dagger 36, Swift Contract 22.

### Lv 37 to 45
- All stigmas: Illusive Clone 234, Swift Contract 217, Triniel's Dagger 208, Savage Fang 187, Evasion Stance 107, Throw Shadowblade 56. All four of the set together: 158. Top players (MetaBot): Illusive Clone 95%, Swift Contract 90%, Savage Fang 77%, Triniel's Dagger 71%, Evasion Stance 39%, Throw Shadowblade 24%.
- Triniel's Dagger at stigma Lv 10 or more: 164 of 208 (its cooldown cut opens at 10).
- Specialty picks: Heart Gore Multi-Hit (Lv 12) 155, cooldown reset (Lv 16) 118, HP absorb 82, +20% crit 73, 1 Insignia 47. Insignia Explosion Multi-Hit 167, keep 2 stacks 146, Lv 16 cooldown 98, Lv 12 stun 36. Quick Slice Insignia Explosion cut (Lv 12) 158, Multi-Hit 122, Lv 16 crit 78, HP absorb 63, more MP 33. Savage Roar faster skill speed 194, Shadowstrike cut (Lv 12) 125, fewer-targets damage 74, less MP 26.
- Daevanion (136 plans of 300 to 470 points): all four +1 nodes on Quick Slice 126, Heart Gore 120, Insignia Explosion 112, Savage Roar 105; passives Rear Smite 107, Exploit Weakness 103, Assault Stance 100. Unique nodes taken in full by about 131 of 136: Critical Damage Boost, Damage Boost, Combat Speed, Cooldown Reduction. Top players: Heart Gore +1 on Nezekan and Insignia Explosion +1 on Zikel 98%.

## 3. Synergies, with the skill level each needs

| # | Synergy | Needs | Status |
|---|---|---|---|
| 1 | Heart Gore fires only after a critical hit | base | CONFIRMED |
| 2 | Illusive Clone removes Heart Gore's cooldown for 10 s, and deals 20% of your damage again | stigma slotted | CONFIRMED |
| 3 | Heart Gore resets its cooldown on a critical hit | its Lv 16 option | CONFIRMED |
| 4 | Quick Slice lands as a critical hit, so Heart Gore can fire after it | its Lv 16 option | CONFIRMED |
| 5 | Exploit Weakness: +100 Critical Hit, so Heart Gore fires more often | passive, Lv 6 | effect CONFIRMED, link REPORTED |
| 6 | Insignia Explosion: damage and stun chance rise with each Insignia, up to 5 | base | CONFIRMED |
| 7 | Savage Fang engraves 5 Insignia at once | stigma slotted | CONFIRMED |
| 8 | Savage Roar engraves 1 Insignia each cast | base | CONFIRMED |
| 9 | Ambush engraves 2 Insignia on a back attack | its Lv 8 option | CONFIRMED |
| 10 | Heart Gore engraves 1 Insignia | its Lv 8 option | CONFIRMED |
| 11 | Shadow Fall engraves 3 Insignia | its Lv 8 option | CONFIRMED |
| 12 | Exploit Weakness clones engrave Insignia | passive, 7% on a critical hit | CONFIRMED |
| 13 | Insignia Explosion keeps 2 stacks after it fires | its Lv 8 option | CONFIRMED |
| 14 | Quick Slice cuts Insignia Explosion by 1 s a hit | its Lv 12 option | CONFIRMED |
| 15 | Insignia Explosion cooldown 10 s to 7 s | its Lv 16 option | CONFIRMED |
| 16 | Savage Roar cuts Shadowstrike by 1 s a hit | its Lv 12 option | CONFIRMED |
| 17 | Triniel's Dagger cuts all your cooldowns by 10% a hit | stigma Lv 10 | CONFIRMED |
| 18 | Storm Rampage fires only on a staggered target | base | CONFIRMED |
| 19 | Storm Rampage cuts all your cooldowns by 1 s a hit | its Lv 16 option | CONFIRMED |
| 20 | Savage Fang does 50 stagger gauge damage (100 at stigma Lv 10), so Storm Rampage fires | stigma | effect CONFIRMED, link REPORTED |
| 21 | Shadow Fall fires only on a stunned target (5% on Incapacitated Immunity) | base | CONFIRMED |
| 22 | Shadowstrike and Insignia Explosion stun, so Shadow Fall can fire | base | CONFIRMED |
| 23 | Swift Contract: Combat Speed +20% for 10 s | stigma slotted | CONFIRMED |
| 24 | Swift Contract: skills cost 20% less MP for its 10 s | stigma Lv 5 | CONFIRMED |
| 25 | Swift Contract makes Rear Smite count 1.5 times (Assault Stance at stigma Lv 15) | stigma Lv 10 | CONFIRMED |
| 26 | Illusive Clone makes Exploit Weakness count 1.5 times | stigma Lv 15 | CONFIRMED |
| 27 | Quick Slice restores 100 MP a hit, no cooldown; Heart Gore restores 100 MP | base | CONFIRMED |
| 28 | Evasion Stance: 110 MP and stamina once on an evasion | stigma | CONFIRMED |
| 29 | Ambush L12 option: 50% chance to set off Whirlwind Slice | its Lv 12 option | CONFIRMED |
| 30 | Defiance ignores cooldown cuts | base | CONFIRMED |
| 31 | "Whirlwind Slice needs an evasion" | | the tooltip wording ties its stun to an evasion; whether the skill itself needs one is UNKNOWN: not used |

## 4. The logic check on each trend

The planner scores every choice by the role weights (DPS: damage 3, survival 1, MP 1; no party buffs in the kit) over each skill's values, counts a value only once what it rests on is in place (a skill level, a stigma in a slot, a skill unlocked), and uses trends only as a small tie-breaker.

| Trend | Logic check | Result |
|---|---|---|
| One main line "Savage Fang, Insignia Explosion, Heart Gore, Savage Roar" (7, 23 with copies; 49 more, 263 with copies, run a shorter form in the same order) | Savage Fang's 5 Insignia (7) come right before Insignia Explosion spends them (6); Heart Gore only fires after a crit (1), so it sits above the filler; Savage Roar is always ready and goes last, so it blocks nothing | PASSED. The planner's line; rows the Daeva cannot place yet wait in Comes later |
| PR #510's two stacks (build and spend) | No published build runs Ambush, Storm Rampage or Triniel's Dagger in a line with these; 140 of 152 macro builds save one macro | REPLACED by the one main line, as the Gladiator's was |
| Quick Slice in the macro (42) | It is the main attack, held with the macro key | REJECTED: "It belongs on its own key" |
| Illusive Clone in the macro (24) | A 90 s burst buff, pressed with Swift Contract before Savage Fang | REJECTED |
| Ambush in the macro (16) | 30% more only from behind: you press it when you are behind | REJECTED |
| Whirlwind Slice in the macro (16) | The line is full from Lv 32; its trigger wording is UNKNOWN (31) | REJECTED |
| Storm Rampage in the macro (14; 6 run it as the whole macro) | Fires only on a stagger (18): a stagger window skill, as the Gladiator's Sword Aura Rampage | REJECTED |
| Triniel's Dagger in the macro (12) | Back attack bonus; it opens the burst with the buffs | REJECTED: own key, in the opener |
| AION2 Vault's "Insignia Explosion, Ambush, Storm Rampage, Savage Roar" (27%) | Not found in 539 builds with a macro | Not used |
| Illusive Clone first stigma (12 of 16 levelling; 82 of 157) | Worth the most damage: Heart Gore free for 10 s plus 20% extra (2) | PASSED: slot 1 at Lv 22 |
| Triniel's Dagger first stigma (36 of 157) | At stigma Lv 1 it is one hit from behind; its cooldown cut (17) needs stigma Lv 10 | REJECTED by hand. With a Daeva whose Triniel's Dagger is Lv 10 the cut counts and it moves to slot 2 |
| Set of four Illusive Clone, Swift Contract, Savage Fang, Triniel's Dagger (158; top players 95, 90, 77, 71%) | Each has damage the role weighs; Swift Contract's speed beats Savage Fang's single hit, which beats Triniel's Dagger at stigma Lv 1 | PASSED: slots 22, 27, 32, 37 in that order |
| Triniel's Dagger before Savage Fang (208 against 187 builds) | True only once its stigma Lv 10 cut counts | REJECTED by hand; PASSED with a Daeva at stigma Lv 10 |
| Evasion Stance (107; 39% of top players) | Survival and MP only; the role weighs damage | REJECTED: ranked 5th, listed as a swap |
| Quick Slice levelled first while levelling (12 of 16) | It is held all the time: MP and damage on every hit | PASSED to Lv 13. From 14 Insignia Explosion, your hardest hit, comes first |
| Heart Gore levelled first (65 of 150) | Inside Illusive Clone it fires on every crit | PASSED from Lv 22 |
| Heart Gore HP absorb at Lv 8 (82, the most common) | +20% crit (73) is more damage and fires Heart Gore again sooner | REJECTED: the planner picks +20% crit |
| Insignia Explosion Multi-Hit at Lv 8 (167) | Half its hits land twice. Keep 2 stacks (146) adds less: Savage Roar refills stacks every cast | PASSED |
| Quick Slice Multi-Hit at Lv 8 (122) | More damage than HP absorb (63) or more MP (33) | PASSED |
| Savage Roar faster skill speed at Lv 8 (194) | More hits in every window | PASSED |
| Exploit Weakness levelled (median 14; 103 of 136 plans take all its nodes) | +100 crit feeds Heart Gore (5) | PASSED: levelled from Lv 6 |
| Rear Smite and Assault Stance levelled | A flat few per cent each; Wisdom Stones go to the line first | Not levelled by Mastery; first in the Daevanion passive tier |
| Daevanion: Heart Gore, Quick Slice, Insignia Explosion, Savage Roar on every board (120, 126, 112, 105 of 136) | The four skills of the main line and the main attack | PASSED: tier 1 of the route |

## 5. What the planner gives (by hand, no Daeva)

| Level | Main line (Quick Slice held) | Stigmas | Mastery, first steps | Next |
|---|---|---|---|---|
| 1 | Savage Roar | none | Quick Slice, Savage Roar | Lv 3 Ambush on its own key |
| 5 | Heart Gore, Savage Roar | none | Quick Slice, Heart Gore, Savage Roar | Lv 7 Whirlwind Slice |
| 12 | Heart Gore, Savage Roar | none | Quick Slice, Heart Gore, Savage Roar, Exploit Weakness | Lv 14 Insignia Explosion joins the line |
| 22 | Insignia Explosion, Heart Gore, Savage Roar | Illusive Clone | Heart Gore, Insignia Explosion, Quick Slice | Lv 27 Swift Contract |
| 27 | same | + Swift Contract | same | Lv 30 Vaizel board |
| 32 | Savage Fang, Insignia Explosion, Heart Gore, Savage Roar | + Savage Fang | same | Lv 37 Triniel's Dagger |
| 37 | same | + Triniel's Dagger | same | Lv 40 Triniel board |
| 45 | same | Illusive Clone, Swift Contract, Savage Fang, Triniel's Dagger | same | none |

Own keys, left to right, keep their place from Lv 1 (a key waits free until its skill comes): Illusive Clone, Swift Contract, Triniel's Dagger, Ambush, Whirlwind Slice, Storm Rampage, Shadow Fall, Defiance, Shadowstrike, Flash Slice, Infiltrate. Opener: Illusive Clone, Swift Contract, Triniel's Dagger.

## 6. Open points

1. Two picks at one option level: most builds take two Lv 8 options on one skill once slot 2 opens at skill Lv 12 (Insignia Explosion Multi-Hit and keep 2 stacks, 146 builds; Quick Slice and Savage Roar too). The planner holds one pick per option level, so it shows the Lv 12 option in slot 2. **Ruling needed** on whether the planner should offer a second Lv 8 pick (a planner change, not in this brief).
2. PvP: 27 PvP builds swap in Shadow Walk 15, Evasion Stance 14, Throw Shadowblade 11, Shadowstep 10 and Evasion Contract 10. The Aetherium has no PvP role. **Ruling needed** on whether to add one.
3. Mastery cap 11 against 10: the Gladiator record's ruling covers this class too.
4. Whirlwind Slice: whether it needs an evasion to fire is UNKNOWN from the tooltip wording. In-game check: press it on a training dummy without dodging.
5. Daevanion points earned per character level: UNKNOWN, so by hand the plan names the board and its first nodes, not how many points you have.
6. Passives other than Exploit Weakness, Rear Smite and Assault Stance, and stigmas other than the set of four and Evasion Stance, have no catalogue record yet, so the planner gives them no value.

## Sources (read 17 Oct 2026)
- questlog.gg public read API: skill build list and build detail (943 Assassin builds, 661 authors; grobmotoriker builds 9176 and 9177, the most liked), game database skill tooltips (35 Assassin ids), Daevanion planner (415 plans, Daevanion board and node data).
- MetaBot: Assassin build data (150 top players), read 17 Oct 2026; stigma guide.
- EZG Assassin PvE build, stigma and macro (27 Sep 2026); AION2 Vault most common macros (14 Oct 2026); Daeva Guides macros; The Games Wiki Assassin skills.
- Our records: `MACRO-RESEARCH.md` (sections 3 and 6), `gladiator.md` (method and shared facts).
