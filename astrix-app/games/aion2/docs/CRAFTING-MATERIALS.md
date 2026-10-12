# AION 2: vendors, crafting materials, fastest levelling and trading (12 Oct 2026)

Research for The Aetherium guidance pages (Milestones and Crafting). Follows on from `CRAFTING-RESEARCH.md` (11 Oct 2026). Every fact has a tag:
- CONFIRMED: two independent sources agree, or Miguel saw it in game.
- REPORTED: one source only. Show it with care, or check it in game first.
- CONFLICT: sources disagree.
- UNKNOWN: no source yet. The page shows "-" or "Not confirmed yet".

Sources are listed at the bottom and stay in the backend only, never on the page.

## 1. How crafting works (the short version)

- There are five crafting professions: Blacksmithing (weapons), Armorsmithing (armour), Handicrafting (accessories), Alchemy (manastones, soulstones, powders) and Cooking (food). CONFIRMED
- Proficiency runs from 1 to 100. REPORTED (gaming.tools describes 100 as the current cap)
- At 50 each profession stops growing. An upgrade quest starts on its own; you craft a test item, hand it in, and you become Professional. That lifts the cap. CONFIRMED for all five (gaming.tools gives the same pattern for each; allthings.how agrees for gathering)
- Every promotion also gives an Artwork, for example "Artwork: Artisan Blacksmith (Bound)". REPORTED
- Gathering follows the same pattern: Novice up to 50, then Professional through "[Upgrade] Essence Extraction Specialty Skill". CONFIRMED (see aion2-gathering-confirmed-12oct2026.md)

Note: `aion2-gathering-confirmed-12oct2026.md` is not in the repo yet. Pending.

## 2. The three kinds of material

Every recipe mixes these:

| Kind | Where it comes from | Examples |
|---|---|---|
| Raw | Gathered, or dropped by monsters | Orichalcum Ore, Sapphire Gemstone, Yggdrasil Log, Odyle, Raw Leather, Spiritstone, Fresh Raw Meat, Fresh Fruit, Cypri, Inina, Kukuru |
| Crafted | Made by another recipe first | Orichalcum Ingot, Strong Leather, Magic Crystal, Spiritstone Powder, Sapphire Decoration |
| Vendor (Bound) | Bought from a merchant for Kina. Bound, so it can't be sold on | Solvents, Catalyst, Abrasive, Ink, hammers, hardeners, softeners, cooking seasonings |
| Rare | Drops, achievements, events and activity rewards | Refining Stones, Splendent pieces, Balaur's Essence, Lesser Manastone, Soft Balaur Meat |

Which NPC sells each vendor item: UNKNOWN. Every source says only "shop" or "merchant". In-game check needed: which merchant, and in which town for each faction.

## 3. Vendor items by profession and tier (shop prices, Kina)

All prices are shop prices from gaming.tools (global 2.0.6.0, 8 Oct). REPORTED.

### Refining and gear crafts
| Item (Bound) | Used for | Tier | Price |
|---|---|---|---|
| Orichalcum Solvent | Orichalcum Ingot (Blacksmithing, Armorsmithing) | 1 to 50 | 400 per craft |
| Catalyst | Magic Crystal (Alchemy) | 1 to 50 | 400 per craft |
| Abrasive | Sapphire Decoration (Handicrafting) | 1 to 19 | 400 per craft |
| Professional Ink x2 | Intermediate Manastone and Soulstone (Alchemy) | 20 and up | 2,400 per craft |
| Zircon / Lazuli / Moonstone Hammer | Balaur Horn (Blacksmithing) | 51 / 65 / 80 | 4,650 / 5,600 / 6,550 |
| Lesser / Intermediate / Superior Dragon Leather Softener | Balaur Leather (Armorsmithing) | 51 / 65 / 80 | 4,650 / 5,600 / 6,550 |
| Lesser / Intermediate / Superior Dragon Scale Hardener | Balaur Scale (Alchemy, Handicrafting) | 51 / 65 / 80 | 4,650 / 5,600 / 6,550 |

Note: allthings.how listed Sandpaper as a vendor additive and gaming.tools lists Abrasive. Probably the same item under two names. CONFLICT until checked in game.

Note from the 11 Oct record (`CRAFTING-RESEARCH.md`, section 8): aion2.run lists them as two items, Sandpaper for Wood (2 logs + Sandpaper) and Abrasive for Gem Decoration (2 gems + Abrasive). So they may not be the same item. Still CONFLICT.

### Cooking seasonings
| Item (Bound) | Price each |
|---|---|
| Salt | 220 |
| Soy Sauce | 440 |
| Curry Powder | 440 |
| Cheese | 440 |
| Verteron Pepper | 880 |
| Raw Triora Noodles | 880 |
| Ulmus Oil | 880 |
| Abex Butter | 880 |

## 4. Fastest levelling route per profession

Two rules every guide agrees on:
1. Level with the single craft, not the x10 batch. CONFIRMED (repeated on all five gaming.tools pages)
2. Set aside the promotion test materials before you reach 50. CONFIRMED

Other advice: from about 21, each level needs far more materials, so start stockpiling early. Spend Refining Stones and Splendent pieces on gear you actually want, not on proficiency alone. REPORTED

### Blacksmithing (weapons)
| Proficiency | Cheapest craft | Needs | Kina |
|---|---|---|---|
| 1 to 50 | Orichalcum Ingot | 2 Orichalcum Ore + 1 Orichalcum Solvent | 400 |
| Optional 3+ | Orichalcum Longsword | 3 Ingot, 5 Refining Stone, 2 Odyle | - |
| Optional 15+ / 30+ | Expert's / Artisan's Longsword | Splendent Longsword (from a crafting combo), Expert's or Artisan's Refining Stones, Fine or Pure Ore, Fine or Pure Odyle | - |
| 51 to 64 | Fine Thick Balaur Horn | 2 Balaur's Essence + Zircon Hammer | 4,650 |
| 65 to 79 | Fine Hard Balaur Horn | 2 Balaur's Essence + Lazuli Hammer | 5,600 |
| 80 to 100 | Fine Durable Balaur Horn | 2 Balaur's Essence + Moonstone Hammer | 6,550 |
| Promotion at 50 | Novice Blacksmith's Hammer | 6 Orichalcum Ingot + 3 Odyle | quest 1902020 |

### Armorsmithing (armour)
| Proficiency | Cheapest craft | Needs | Kina |
|---|---|---|---|
| 1 to 50 | Orichalcum Ingot, Strong Leather | Ingot as above; Strong Leather is 2 Raw Leather | 400 / - |
| Optional 3+ | Orichalcum Helm (and other slots) | 1 Ingot, 3 Strong Leather, 2 Refining Stone, 1 Odyle | - |
| 51 to 64 | Tanned Thick Balaur Leather | 2 Balaur's Essence + Lesser Softener | 4,650 |
| 65 to 79 | Tanned Hard Balaur Leather | 2 Balaur's Essence + Intermediate Softener | 5,600 |
| 80 to 100 | Tanned Durable Balaur Leather | 2 Balaur's Essence + Superior Softener | 6,550 |
| Promotion at 50 | Novice Armorsmith's Fabric | 6 Orichalcum Ingot + 3 Odyle | quest 1902030 |

### Handicrafting (accessories)
| Proficiency | Cheapest craft | Needs | Kina |
|---|---|---|---|
| 1 to 19 | Sapphire Decoration | 2 Sapphire Gemstone + 1 Abrasive | 400 |
| 20 to 50 | Expert's and Artisan's rings | Splendent pieces | - |
| 51 to 100 | Enhanced Balaur Scales | 2 Balaur's Essence + Scale Hardener | 4,650 / 5,600 / 6,550 |
| Promotion at 50 | Novice Handicrafter's Magnifying Glass | 4 Yggdrasil Wood, 2 Sapphire Decoration, 3 Odyle | quest 1902040 |

### Alchemy
Alchemy has the cheapest early route: the powder and paper crafts cost no Kina at all.
| Proficiency | Cheapest craft | Needs | Kina |
|---|---|---|---|
| 1 to 4 | Magic Crystal | 2 Spiritstone + 1 Catalyst | 400 |
| 5 to 50 | Spiritstone Powder or Yggdrasil Paper (3 per craft) | 1 Spiritstone, or 1 Yggdrasil Log | 0 |
| 20 to 50 | Sapphire, Diamond or Ruby Powder (3 per craft) | 1 gemstone | 0 |
| Optional 20+ / 25+ | Intermediate Manastone / Soulstone | 5 Lesser stones, 3 Spiritstone Powder, 2 Professional Ink | 2,400 |
| 51 to 64 | Enhanced Thick Balaur Scale | 2 Balaur's Essence + Lesser Hardener | 4,650 |
| 65 to 79 | Enhanced Hard Balaur Scale | 2 Balaur's Essence + Intermediate Hardener | 5,600 |
| 80 to 100 | Enhanced Durable Balaur Scale | 2 Balaur's Essence + Superior Hardener | 6,550 |
| Promotion at 50 | Novice Alchemist's Scale | 6 Magic Crystal, 2 Spiritstone Powder, 3 Odyle | quest 1902050 |

### Cooking
| Proficiency | Cheapest craft | Needs | Kina |
|---|---|---|---|
| 1 to 50 | Fruit Salad, Curry Meat Stirfry, Kukuru Fried Meat or Grilled Cypri (pick whichever ingredients you hold) | 1 drop or gathered item + seasonings | 880 |
| 5+ | Steamed Cypri, Inina Pasta | 1 gathered item + seasonings | 1,320 |
| 30 to 45 | Artisan's versions | 3 to 5 of each ingredient, more seasoning | 1,760 to 4,400 |
| 60+ | White Dragon's Chopped Steak | Soft Balaur Meat, 3 Mela, 3 Coriolus, 5 Verteron Pepper, 1 Odyle | 4,400 |
| Promotion at 50 | Novice Chef's Seasoning | 10 Fresh Raw Meat, 6 Fresh Fruit, 4 Inina | quest ID not listed |

Cooking 75 to 100: the source page was cut off. UNKNOWN past 75.
How much proficiency each craft gives: UNKNOWN. No source gives XP per craft, so we can't yet say "about N crafts to reach 50". Don't show a craft count until we have it.

## 5. The quickest way to level everything (advisor logic)

What the guidance page can say with what we have:
1. Gather as you quest. Gathered Ore, Gemstones, Logs and Odyle feed every 1 to 50 route, and gathering levels at the same time.
2. Start with Alchemy if Kina is short: Spiritstone Powder and Yggdrasil Paper cost 0 Kina from 5 to 50.
3. Blacksmithing and Armorsmithing share the Orichalcum Ingot, so one stock of Ore and Solvent levels both. Both promotions need 6 Ingots and 3 Odyle, so craft 12 extra Ingots and keep 6 Odyle before 50.
4. Odyle appears in four of the five promotions (3 each). Keep at least 12 Odyle, plus 3 more for Handicrafting's own test.
5. From 51, every gear profession uses 2 Balaur's Essence per craft. Essence comes from Expeditions and drops, so it becomes the real limit, not Kina. Run Expeditions before you push past 50.
6. Kina per craft roughly goes 400, then 4,650, 5,600 and 6,550. Show the climb so players budget.

All of point 5 depends on a REPORTED drop source. Points 1 to 4 follow straight from the recipe tables.

## 6. Trading

| Fact | Status |
|---|---|
| Direct player-to-player trade is disabled on Global servers (no trade window, no Kina transfer). NC calls it an anti-bot measure, with no return date | CONFIRMED (timesaver, games.gg) |
| The Market (auction style: list at a Kina price, anyone buys) is the only way to trade | CONFIRMED |
| The Market unlocks at Level 45, and Membership doesn't bypass that | REPORTED (games.gg; another source also says 45) |
| Buying on the Market needs the Special Quai Membership ($14.99 for 30 days, tied to one server) | CONFIRMED |
| Selling also needs Membership | CONFLICT: timesaver says yes; games.gg implies it but doesn't say it outright |
| The Kina to Quna Exchange needs Membership | CONFIRMED |
| Kina (Bound) can't be used on the Market; only normal Kina can | REPORTED |
| Market fee or tax percentage | UNKNOWN |
| Listing limit, listing time and cancelling | UNKNOWN |
| Trading by mail | UNKNOWN |
| Every vendor crafting item is Bound, so it can't be sold; the crafted results may be sellable | REPORTED (item names carry "(Bound)") |
| Buying Kina from third-party sellers leads to account action | REPORTED |

On the page, say plainly: "You can't trade with other players directly. The Market opens at Level 45 and needs Membership to buy." Don't call the game pay-to-win and don't push Membership. Show the facts and let the player decide.

## 7. In-game checks for Miguel (one session)

1. Which merchant sells the Bound crafting items (Solvent, Catalyst, Abrasive or Sandpaper, Ink, hammers, softeners, hardeners, seasonings), and in which town on each faction.
2. Craft one Orichalcum Ingot and note how much proficiency it gives at a low level and at about 20.
3. Open the Market: is there a sell fee shown, how many listings are allowed, and for how long?
4. Can a player without Membership list an item for sale?
5. Is Abrasive the same item as Sandpaper?
6. The Cooking promotion quest ID, and the Cooking recipes past 75.
7. Where Balaur's Essence drops (Expedition names).

## Sources (backend only)
- gaming.tools: Blacksmithing, Armorsmithing, Handicrafting, Alchemy, Cooking leveling guides (AION 2 Global 2.0.6.0, updated 8 Oct 2026). Shop prices only.
- allthings.how: AION 2 crafting materials guide (6 Oct 2026); Professional upgrade guide.
- games.gg: "Aion 2 Market Guide: How Trading and the Quna Exchange Work" (8 Oct 2026, Global).
- timesaver: AION 2 trading guide (24 Sep 2026).
