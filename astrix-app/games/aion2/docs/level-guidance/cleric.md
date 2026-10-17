# Cleric level guidance (research record, 17 Oct 2026)

For The Aetherium's level planner (`engine/level-planner.mjs`). It records what published Cleric builds do at each level, every synergy between Cleric skills with the skill level it needs, and the logic check each trend passed or failed. The planner reads the data built from this record (`data/advisor/skills.json` values and synergies, `data/advisor/builds/cleric.json` ascent), never this file.

Status on every fact: **CONFIRMED** (quoted from the game tooltip data, or seen in game by Miguel), **REPORTED** (published builds or guides), **UNKNOWN** (no source). Sources stay in this record and the repo, never on a page.

Roles: **healer** (the class's main build) and **dps**. 52 published builds are named or tagged dps, so the dps role has its own build now. The Cleric has no team variants the planner can express (see section 6).

## 0. How the builds were read

- questlog.gg public read API (no account). 2,138 Cleric skill builds listed; full detail read for 974 builds from 677 authors.
- Players clone popular builds. **Every count below is over 307 distinct configurations** (at least 3 Specialty picks, clones and empty builds removed) unless it says otherwise.
- Role comes from the build's name and tags only (never from its contents, so the trends are not circular): healer 45, dps 52, PvP 33, no role named 177. "All builds" counts include all 307.
- Only 133 of the 307 list exactly four stigmas; the rest list five to thirteen ("chosen", not "equipped"). Stigma counts per role use the four-stigma builds: 18 healer, 26 dps.
- Tooltip data: questlog's game database for all 35 Cleric skill ids (unlock level, the character level each skill level is sold from, cooldown, every Specialty option and the skill level it opens at, the stigma perks at stigma Lv 5, 10, 15, 20). Counted as CONFIRMED.
- 378 Daevanion plans read (232 distinct and non-empty): 154 full plans (300 to 470 points), 10 early plans (150 points or fewer).
- MetaBot top-player data (151 Lv 45 Clerics, re-read 17 Oct 2026): what top players equip, not a ranking of what is strongest.
- Caveat (REPORTED, as for the Gladiator): a questlog skill level is the total level (trained plus Daevanion and gear), not trained points alone. Builds have no character level field, so level bands combine build titles (28 levelling builds), the training tables and guide advice.

## 1. Facts the planner rests on

| Fact | Value | Status |
|---|---|---|
| Stigma slots | Lv 22, 27, 32, 37 | CONFIRMED (tooltip: every stigma learnable from Lv 22; slot levels in two guides) |
| Specialty options | Three at skill Lv 8, one at Lv 12, one at Lv 16, for every active | CONFIRMED (tooltip) |
| Specialty slots | Skill Lv 8, 12 and 20 | REPORTED (MetaBot planner); the Gladiator record found the same in 555 builds |
| Trainer levels (skill Lv 8 and 10) | Earth's Retribution, Judgment Thunder, Debilitating Mark 19 and 25; Divine Aura 21 and 27; Chain of Torment 22 and 28; Lightning Strike Scattershot 23 and 29; Light of Regeneration 25 and 31; Condemnation 26 and 32; Healing Light 28 and 34; Radiant Recovery 30 and 36; Bolt 32 and 38; Defiance 34 and 40. Passives: Empyrean Lord's Grace 27 and 33, Healing Enhancement 29 and 35 | CONFIRMED (tooltip training tables) |
| Skill unlocks | Earth's Retribution, Judgment Thunder, Debilitating Mark 1; Divine Aura 3; Chain of Torment 4; Lightning Strike Scattershot 5; Light of Regeneration 7; Condemnation 8; Healing Light 10; Radiant Recovery 12; Bolt 14; Defiance 16. Passives used here: Empyrean Lord's Grace 9, Healing Enhancement 11, Earth's Grace 21, Radiant Benediction 25 | CONFIRMED |
| Cooldowns | Earth's Retribution 0, Judgment Thunder 0, Lightning Strike Scattershot 0, Condemnation 3, Healing Light 6, Debilitating Mark 10, Radiant Recovery 12, Chain of Torment 20, Divine Aura 30, Light of Regeneration 30, Bolt 45, Defiance 60. Stigmas: Light of Protection 5, Earth Punishment 30, Noble Aura, Prayer of Amplification, Yustiel's Power, Power Burst 60, Absolution, Benevolence 90, Summon Resurrection 120, Salvation 150 | CONFIRMED |
| Stigma levels | Stigma points per level: 1 for Lv 1 to 5, 2 for 6 to 10, 4 for 11 to 15, 8 for 16 to 20. Stigma perks open by themselves at stigma Lv 5, 10, 15 and 20 | CONFIRMED (tooltip); 29 stigma points by Lv 45 REPORTED (MetaBot) |
| Mastery cap | We hold 11 (Miguel, in game, 10 Oct 2026). MetaBot shows 10 with points | **Ruling needed** (the same open point as the Gladiator) |
| Daevanion | Boards open at Lv 12, 20, 30, 40, 45. One +1 node for every active skill on each of the first four boards (+4 at most); passives have two nodes on Nezekan | CONFIRMED (node data); points earned per character level UNKNOWN |
| Light of Protection and the Chanter | Its damage boost does not stack with the Chanter's Undefeated Mantra: only the higher skill level counts, the Mantra wins a tie | CONFIRMED (tooltip) |

## 2. Trends by level

### Core skills, all levels
- Chain of Torment is in 294 and Condemnation in 292 of the 307; MetaBot top players: every active on the bar, 90% to 99%.
- Condemnation is levelled highest (median 20, Lv 16 or more in 173 of 292).
- First active skill in the priority list: Condemnation 65 of 132, Earth's Retribution 18, Judgment Thunder 13, Radiant Recovery 8, Light of Regeneration 7.
- Stacks on one key: Light of Regeneration and Healing Light 74; Chain of Torment then Condemnation 35; Prayer of Amplification, Earth Punishment, Chain of Torment, Condemnation 27; Divine Aura then Judgment Thunder 26; Light of Regeneration, Prayer of Amplification, Chain of Torment, Condemnation 21; Earth Punishment, Divine Aura, Debilitating Mark, Judgment Thunder 18; Radiant Recovery and Healing Light 18; Debilitating Mark, Divine Aura, Light of Regeneration, Judgment Thunder 13.
- Macros: Prayer of Amplification then Divine Aura 12; Prayer of Amplification, Light of Regeneration, Earth's Retribution 7; Debilitating Mark, Divine Aura, Noble Aura, Chain of Torment, Judgment Thunder 6; Earth Punishment then Condemnation 6.

### Lv 1 to 10
- Before Lv 4 there is no Chain of Torment, so Condemnation (Lv 8) cannot fire before Lv 8 anyway.
- No Specialty is reachable by training (the earliest trained skill Lv 8 is at character Lv 19).
- Levelling guide (REPORTED, MetaBot editorial): Chain of Torment and Condemnation first, "almost all of the Cleric's solo damage"; Divine Aura is free damage every 30 s; heal only when the bar drops.
- Levelling builds (28): Condemnation in the top three of 12, Bolt 6, Divine Aura 6, Judgment Thunder 5, Radiant Recovery 5, Chain of Torment 5.

### Lv 10 to 20
- Nezekan opens at 12. Early Daevanion plans (10): +1 on Earth's Retribution 8, Divine Aura 8, Radiant Recovery 7, Chain of Torment 7, Condemnation 6, Healing Light 7, Light of Regeneration 6.

### Lv 20 to 30 (stigmas at 22)
- First stigma in the priority list (four-stigma builds): Earth Punishment 36 of 69, Light of Protection 15, Prayer of Amplification 6, Noble Aura 5.
- Levelling builds with four stigmas (7): Earth Punishment, Light of Protection, Prayer of Amplification, Noble Aura in 5.

### Lv 30 to 45
- All four-stigma builds (133): Earth Punishment 106, Light of Protection 103, Noble Aura 84, Prayer of Amplification 81, Summon Resurrection 50, Absolution 34, Benevolence 27, Yustiel's Power 18. The set Earth Punishment, Light of Protection, Noble Aura, Prayer of Amplification: 58.
- Top players (MetaBot, 151): Light of Protection 87%, Noble Aura 79%, Earth Punishment 65%, Summon Resurrection 64%, Prayer of Amplification 50%, Absolution 23%, Power Burst 20%, Salvation 16%, Benevolence 13%.
- Specialty picks (all 307): Condemnation crit reset 234, fewer-targets damage 202, multi-hit 140. Bolt +30% speed 224, +20% fewer targets 183. Healing Light +2 uses 223, +2% HP 137. Debilitating Mark -15% Defense 222, +10% reduction 175. Divine Aura +50% speed 217, +3 s 187. Chain of Torment +10% tolerance cut 215, +3 s 192. Judgment Thunder fewer-targets damage 210, extra Divine Punishment 150. Radiant Recovery -3 s 187, +1 use 148. Earth's Retribution Bolt cut 185, Discharge chance 180. Light of Regeneration +5% incoming heal 139, tolerance 131, +20% at half HP 111.
- Earth Punishment's Lv 5 perk and Condemnation's crit reset together: 119 of 307.
- Full Daevanion plans (154): all four +1 nodes on Condemnation 130, Empyrean Lord's Grace 113, Divine Aura 109, Earth's Retribution 109, Light of Regeneration 109, Bolt 107, Judgment Thunder 106, Chain of Torment 102, Healing Light 100.

### Healer (45 builds, 18 with four stigmas)
- Stigmas: Light of Protection 15, Summon Resurrection 12, Absolution 11, Earth Punishment 9, Benevolence 8, Prayer of Amplification 6, Noble Aura 6, Yustiel's Power 5.
- Sets: Earth Punishment, Light of Protection, Noble Aura, Prayer of Amplification 5; Absolution, Benevolence, Light of Protection, Summon Resurrection 4; Absolution, Light of Protection, Summon Resurrection, Yustiel's Power 3.
- Top three in the priority list: Condemnation 14, Radiant Recovery 10, Light of Regeneration 9, Healing Light 7. First: Light of Regeneration 6 and Condemnation 6 of 21.

### DPS (52 builds, 26 with four stigmas)
- Stigmas: Earth Punishment 26, Light of Protection 22, Noble Aura 22, Prayer of Amplification 20, Summon Resurrection 6. The set of those four: 15 of 26.
- First stigma in the priority list: Earth Punishment 6, Light of Protection 5, Prayer of Amplification 4 of 18.
- Top three in the priority list: Condemnation 17, Judgment Thunder 12, Chain of Torment 9.

## 3. Synergies, with the skill level each needs

| # | Synergy | Needs | Status |
|---|---|---|---|
| 1 | Condemnation fires only on a target with Chain of Torment | base | CONFIRMED |
| 2 | Chain of Torment: the target takes 5% more PvE damage from everyone for 10 s; +10% more with its Lv 12 option | base, Lv 12 option | CONFIRMED |
| 3 | Condemnation resets its cooldown on a critical hit | its Lv 12 option | CONFIRMED |
| 4 | Earth Punishment makes Condemnation always crit on its target | stigma Lv 5 | CONFIRMED |
| 5 | 3 and 4 together: Condemnation has no cooldown on that target for 10 s | Lv 12 option and stigma Lv 5 | REPORTED (both tooltips; whether the game adds a hidden limit is UNKNOWN; 119 builds pick both) |
| 6 | Earth's Retribution: Discharge (its follow-up) comes 20% more often; Discharge cuts Bolt by 7 s | Lv 8 option, Lv 12 option | CONFIRMED |
| 7 | Defiance adds the Blessing of Regeneration follow-up | its Lv 8 option | CONFIRMED |
| 8 | Noble Aura hits harder on a target with Debilitating Mark | stigma Lv 10 | CONFIRMED |
| 9 | Prayer of Amplification: Empyrean Lord's Grace counts 1.5 times; Earth's Grace counts 1.5 times | stigma Lv 10, Lv 15 | CONFIRMED |
| 10 | Healing Enhancement turns Attack into Heal Boost, so Attack (and Prayer of Amplification) raise your heals | Lv 11 passive | effect CONFIRMED, link REPORTED |
| 11 | Radiant Benediction: your attacks heal the party, once every 5 s | Lv 25 passive | CONFIRMED |
| 12 | Lightning Strike Scattershot fires only on a staggered target; stagger comes from Bolt (20 to 35), Earth Punishment 20, Chain of Torment 10, Debilitating Mark 10, Condemnation 7, Judgment Thunder 2, Power Burst 50 | base | CONFIRMED |
| 13 | Lightning Strike Scattershot cuts all cooldowns by 1 s a hit | its Lv 16 option | CONFIRMED |
| 14 | Cooldown cuts: Divine Aura -10 s (Lv 16), Healing Light -2 s (Lv 16), Radiant Recovery -3 s (Lv 8), Absolution -30 s (stigma Lv 5) | as listed | CONFIRMED |
| 15 | Light of Protection does not stack with the Chanter's Undefeated Mantra | base | CONFIRMED |
| 16 | "Lightning Strike Scattershot is a bait, it does less than the macro" | | REPORTED by one author, no numbers: not used |
| 17 | "Heals never go in the macro" | | REPORTED by one author; the logic agrees (own key) |

## 4. The logic check on each trend

The planner scores every choice by the role weights over each skill's values (damage, survival, party buff, MP; healing counts as survival, see section 6), counts a value only once what it rests on is in place, and uses trends only as a small tie-breaker.

| Trend | Logic check | Result |
|---|---|---|
| Chain of Torment then Condemnation on one key (35, and in every Condemnation stack) | Condemnation needs Chain of Torment (synergy 1), so Chain of Torment sits below it | PASSED. Stack B, both roles. Before Lv 4 stack B is empty; Condemnation joins at Lv 8 |
| Divine Aura and Debilitating Mark under Judgment Thunder (26, 18, 13) | Two cooldown skills under an always-ready one: the stack rule holds, and Judgment Thunder fills every gap | PASSED. Stack A is now Divine Aura, Debilitating Mark, Judgment Thunder (it was Judgment Thunder alone, from one macro site) |
| Earth Punishment on the Condemnation key (27 and 9) | Its crit only pays off on Condemnation (synergies 4, 5) | PASSED for dps: it joins stack B the level its slot opens (Lv 37). The healer does not slot it |
| Earth Punishment in stack A (18) | Its value is Condemnation's crit, which is on stack B | REJECTED |
| Prayer of Amplification on the Condemnation key or in the macro (48 stacks, 12 macros) | A 10 s burst buff: own key | REJECTED: "It belongs on its own key" |
| Light of Regeneration in stack B or the macro (21, 7) | A heal: you choose when it fires | REJECTED |
| Noble Aura in the macro (6) | A 300 s summon: press it once | REJECTED |
| Light of Regeneration and Healing Light on one key (74) | Two cooldown heals: the heal over time fires when ready, Healing Light the rest of the time | PASSED: the Heals key, both roles |
| Healer stigmas Light of Protection, Summon Resurrection, Absolution, Benevolence (15, 12, 11, 8 of 18) | Survival weighs most for a healer; Light of Protection cuts party damage taken all the time | PASSED. Slot order: Light of Protection 22, Absolution 27, Summon Resurrection 32, Benevolence 37 |
| Noble Aura and Earth Punishment for a healer (79% and 65% of top players) | Damage only; the heals are worth more to a healer | REJECTED for the healer, PASSED for dps |
| DPS stigmas Earth Punishment, Light of Protection, Noble Aura, Prayer of Amplification (26, 22, 22, 20 of 26) | All damage; Light of Protection is +10.5% damage all the time | PASSED. Slot order: Light of Protection 22, Prayer of Amplification 27, Noble Aura 32, Earth Punishment 37 |
| Earth Punishment first (6 of 18 dps) | By hand its Condemnation crit needs stigma Lv 5, which the plan cannot see; Light of Protection is on all the time | REJECTED: slot 1 takes Light of Protection |
| Condemnation levelled first (65 of 132; 17 of 52 dps) | Main damage hit | PASSED for dps from Lv 8. REJECTED for the healer: a heal comes first from Lv 7 |
| Light of Regeneration levelled first (6 of 21 healer) | Healing Light's Lv 8 pick (two more casts) is worth more | REJECTED: Healing Light first from Lv 10 |
| Light of Regeneration Lv 8 pick: +5% incoming heal (139) | +20% healing on anyone at half HP heals more when it matters (111 agree) | REJECTED: the planner picks +20% at half HP |
| Lightning Strike Scattershot on the bar (90% of top players) | No cooldown, staggered targets only: an own key for stagger windows | PASSED for dps (own key). The healer's keys go to heals; it stays in Not on your bar |
| Bolt kept off the macro | Charged: a macro fires stage 1 only | PASSED (own key) |

## 5. What the planner gives (by hand, no Daeva)

| Level | Healer | DPS |
|---|---|---|
| 1 | Stack A Debilitating Mark, Judgment Thunder; left click Earth's Retribution. Level Earth's Retribution | Same bar. Level Judgment Thunder, Earth's Retribution |
| 5 | Stack A Divine Aura, Debilitating Mark, Judgment Thunder; stack B Chain of Torment. Level Chain of Torment | Same bar, plus Lightning Strike Scattershot on its key. Level Judgment Thunder, Divine Aura, Chain of Torment |
| 12 | Stack B Chain of Torment, Condemnation; Heals key. Level Healing Light, Light of Regeneration, Radiant Recovery | Level Condemnation first |
| 22 | Light of Protection in slot 1. Level Healing Light | Light of Protection in slot 1. Level Condemnation, Bolt |
| 27 | Absolution in slot 2 | Prayer of Amplification in slot 2 |
| 37 | Benevolence in slot 4 | Earth Punishment in slot 4; it joins stack B |
| 45 | Light of Protection, Absolution, Summon Resurrection, Benevolence | Light of Protection, Prayer of Amplification, Noble Aura, Earth Punishment |

## 6. Open points

1. Mastery cap: our record holds 11 from Miguel's in-game capture; MetaBot shows 10. In-game check: the Mastery window's highest buyable level for one skill. (Same as the Gladiator.)
2. Healing has no value key in the planner (damage, enmity, survival, party buff, MP). Heals are weighed as survival (the party's). A ruling on a "healing" key, or that survival covers it, is needed.
3. Team variants: Light of Protection does not stack with a Chanter's Undefeated Mantra. A "with a Chanter" team would drop it, but the planner's teams are fixed (main tank, off-tank with a Templar, solo), so the Cleric has no team variant. Needs a planner change.
4. A skill a passing line trend adds later is not listed in Comes later before its level. The Cleric's adopted rows are in its own stacks instead, so nothing is lost; a planner fix would let trends do it.
5. Synergy 5 (no Condemnation cooldown inside Earth Punishment) rests on two tooltips; a hidden limit is UNKNOWN. In-game check: Condemnation on a target with Earth Punishment, count the casts in 10 s.
6. The dps build's stat order reuses the class guide's order (Attack first); no dps-only stat source was found.
7. Daevanion points earned per character level: UNKNOWN.

## Sources (read 17 Oct 2026)
- questlog.gg public read API: skill build list and build detail (974 Cleric builds, 677 authors; mrrosapony build 9541), game database tooltips (35 Cleric ids), Daevanion planner (378 plans) and node data.
- MetaBot: Cleric build planner and top-player data (151 players, re-read 17 Oct 2026), stigma and Daevanion guides.
- ExpCarry Cleric guide (6 Oct 2026); AION2 Vault common macros (14 Oct 2026).
- Our records: `MACRO-RESEARCH.md`, the Gladiator record (method).
