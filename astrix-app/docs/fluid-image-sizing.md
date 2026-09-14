# Fluid image sizing

Character introduces the shared mechanism. Build Forge, Vault and Loadout opt in
in separate dependent PRs. Journey, Mission Reports and Forge Loader do not opt
in. The separate in-game loadout-row revert is not part of this change.

## Baselines and ownership

The reference render is a 1920 CSS-pixel viewport at device scale 1. The existing
`clamp(40px,3.2vw,64px)` rail token evaluates to 61.44px at that width. The shared
image unit divides that same clamp by 61.44, preserving existing desktop pixel
sizes while applying one viewport response. The existing 40px and 64px bounds
are retained, not new unbounded growth limits. Text sizes and workspace tracks
are not driven by the image unit.

| Family | 1920px baseline | Owner |
| --- | --- | --- |
| Equipped/inventory weapon, armour, Ghost, ship and vehicle thumbnails | 50px square; 48px floor | Shared desktop density and item tile |
| Ability, aspect, fragment, Transcendence and Artifact slots | 61.44px | Shared Guardian rail |
| Super formation | 300px, exact existing PSD coordinates | Guardian Super formation; shared image unit |
| Equipped subclass crest / picker maximum | 68px / 56px, constrained by existing container | Shared image unit; Super formation / subclass picker |
| Hero emblem card | 300×88px | Shared hero cards |
| Brand, stat, mod/perk, overlays, account and inspector icon tiers | Existing named token values, converted without changing their desktop baseline | Shared desktop density |

DIM reference inspected at commit `18d686f0560de4e79633442de9e9748ed76e8167`:
[ItemIcon square width/height](https://github.com/DestinyItemManager/DIM/blob/18d686f0560de4e79633442de9e9748ed76e8167/src/app/inventory/ItemIcon.m.scss),
[50px normalization](https://github.com/DestinyItemManager/DIM/blob/18d686f0560de4e79633442de9e9748ed76e8167/src/app/_variables.scss),
[48px size floor](https://github.com/DestinyItemManager/DIM/blob/18d686f0560de4e79633442de9e9748ed76e8167/src/app/css-variables.ts),
[50px reset and 48px slider minimum](https://github.com/DestinyItemManager/DIM/blob/18d686f0560de4e79633442de9e9748ed76e8167/src/app/settings/SettingsPage.tsx).

Competing Character rail dimensions and tracks were removed from adaptive,
advisor, tune, super-feature, compact, beta and final-layout stylesheets. The
shared rail owns both legacy and current renderer sockets. The separate fixed
44px phone override and local mod-square override were removed. Hero dimensions
were removed from the Character card, adaptive and mobile layers; shared hero
CSS owns both desktop dimensions and narrow-container fitting.

The 100:122 tile composition remains the fallback for excluded destinations.
The explicit opt-in uses square art and tile dimensions, retaining the existing
footer and proportional state overlays. Default token fallbacks remain unchanged
for pages that do not opt in; aliases resolve at the root so excluded destinations
do not accidentally inherit another page's image scale.

## Browser evidence

Local Chromium 153, actual page HTML and stylesheets, deterministic layout
fixtures with production shared inventory/tile markup. Bungie requests and live
account mutations are not involved. Native viewport resizing: 390, 800, 1440,
1920, 2560 and 3400 CSS pixels. Each page was rendered at each width; these are
viewport tests, not an assertion that browser toolbar zoom was automated.

| Character family | 800px | 1440px | 1920px | 3400px |
| --- | ---: | ---: | ---: | ---: |
| Inventory square | 48 | 48 | 50 | 52.08 |
| Rail square | 40 | 46.08 | 61.44 | 64 |
| Super formation width | 195.31 | 225 | 300 | 312.5 |
| Hero card width | 195.31 | 225 | 300 | 312.5 |
| Hero card height | 57.28 | 66 | 88 | 91.66 |

Forge Loader, Journey and Mission Reports screenshots matched the baseline
pixel-for-pixel at all six widths. These tests include fixture hero artwork;
Forge Loader additionally receives fixture Exotic and staged-item artwork.

Validator contract updates are intentional: assert the shared owner and fluid
opt-in while preserving excluded-page fallbacks. They must not restore the old
fixed size overrides. Unrelated pre-existing profile-module assertions remain
unchanged (`validate-main-page-today`, `validate-super-formation`, and
`validate-journey-visual-pass`).
