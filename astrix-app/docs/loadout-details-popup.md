# Prompt 3: Loadout Details popup

## Entry and component

The Character loadout menu's existing **Loadout details** action lazily loads
`guardian-loadout-details.mjs`. Viewing is independent of the main equipment
selection. Existing slot click, edit, overwrite and menu mutation flows are not
rewired by this task.

`openLoadoutDetails(resolvedLoadout, options)` in `shared/loadout-details.mjs`
accepts a resolved presentation object. The component has no account loader,
Bungie client or storage dependency. `options.actions` supplies source-specific
callbacks; absent callbacks remain visibly disabled. `disabledReasons` supplies
accessible reasons. The returned handle exposes `dialog`, `close()` and
`invalidate(message)`. Native dialog focus containment, Escape, close button,
background inertness and return focus are retained. Busy mutations cannot be
closed or submitted twice.

Resolved object contract, schemaVersion 1:

- `name`, `icon`, `slotNumber` (optional), `source: {kind, label}`.
- `items`: ordered rows with `kind`, `name`, `icon`, `unresolved` and `groups`.
- Each group has `label` and `plugs`. Each plug has its original `socketIndex`,
  `hash`, `name`, `description`, `icon`, `empty`, `unresolved`, and optional
  `statFocus: [{name, value, conditional}]`.
- The in-game adapter additionally supplies its bound account/Guardian/index,
  snapshot fingerprint and version-matched identifier choices. These fields are
  not required by the renderer. A future saved/DIM adapter can supply the same
  presentation contract without importing the in-game adapter.

The popup is min(80vw, 1400px) by 90vh, fullscreen below 720px, internally
scrolling. All text is at least 12px. CSS is scoped to this component and uses
the existing site palette. Item artwork is never recoloured or replaced by
synthetic game symbols. Unresolved or failed artwork becomes an empty frame.

## Data path

`enrichLoadoutDetails` joins component 206's itemInstanceId against real profile,
carried and equipped item rows, including saved Vault items. Selected plugs come
only from the loadout's plugItemHashes, retaining array/socket indexes and
repeated mods. Current equipped plugs are not substituted for missing saved
plugs. Unknown definitions remain empty/unavailable. Saved item totals are not
inferred from current instance stats; only supplied plug investment-stat focus
values are displayed, with conditional values labelled.

The prepared Character/Build backend resolves missing item, plug, socket and
stat definitions through the manifest service binding. The bounded
`/loadout-identifiers?version=` manifest route returns only the three small
loadout identity tables. It refuses mixed/missing versions or incomplete
catalogues. It never requests Bungie content. The browser performs no per-item
or manifest downloads when opening details. Retired identity metadata survives
final page compaction and cannot be applied as current gameplay data.

## Actions

- Equip and Prepare equip run the existing `createLiveTransferPlan` and
  `stageLiveTransferPreflight`. Both are read-only until a separate Confirm Apply
  click. Only that click confirms the exact returned plan and calls the existing
  `executeLiveTransferPlan`, including fresh checks, capabilities, transfer,
  equipment verification, socket legality and final readback. A prepared plan
  cannot be replayed. Unsupported socket changes remain explicit in-game steps.
- Edit identifiers lists only current Bungie choices and uses the existing
  UpdateLoadoutIdentifiers route. All three hashes are validated against the
  supplied catalogue before posting; successful readback is required before
  showing updated identifiers.
- Clear slot requires an explicit confirmation and successful readback. It does
  not delete equipment.
- Save uses the existing PARADOX storage/sync API with the exact saved selection,
  not the character's currently equipped sockets. It does not navigate away.
- Share invokes native file sharing when available or exports a JSON file. It
  does not claim to create a hosted share URL. The portable document contains
  only name, manifest version, gear hashes and selected indexed plugs. It
  excludes account IDs, instance IDs, credentials and unrelated inventory.

All actions use one controller lock and reject changed account, Guardian,
manifest or saved-slot bindings. Fresh reads detect remote slot changes before
writes. In-flight actions cannot silently switch to a different account.

## Official API sources

- https://bungie-net.github.io/multi/schema_Destiny-Components-Loadouts-DestinyLoadoutItemComponent.html
- https://bungie-net.github.io/multi/operation_post_Destiny2-UpdateLoadoutIdentifiers.html
- https://bungie-net.github.io/multi/schema_Destiny-Requests-Actions-DestinyLoadoutUpdateActionRequest.html

## Validation

The registered model/actions suite exercises component 206 mapping, all nine
rows, saved/current separation, repeated mods, missing definitions, source-neutral
rendering, HTML escaping, Apply confirmation/replay/concurrency, stale bindings,
identifier readback, save and credential-free sharing. Backend tests exercise
actual prepared-page enrichment, Vault references, bounded batches, catalogue
versions and missing-data behaviour. The separate browser test opens the actual
menu and integration under Character's full stylesheet cascade at 390, 719,
720, 1363 and 2560px. All service calls are intercepted fixtures, not a login.

Synthetic data is confined to the offline test fixture. Browser fixture artwork
responses are test PNGs at original Bungie paths; this is not a live-account
artwork or equipment-verification claim.

## Miguel's manual QA

1. Sign into Bungie yourself. Open a saved slot through Loadout details. Compare
   its identity, subclass, weapons, armour, selected sockets and stat focus with
   Destiny. Check a loadout containing Vault gear and an unavailable item.
2. Prepare equip and cancel; confirm no equipment changed. Review and confirm
   Apply from a safe game state. Check blocked actions, manual socket steps,
   double clicks, refresh/Guardian changes and final equipment in Destiny.
3. Change name/icon/colour and verify persistence. Save a PARADOX copy and inspect
   its selected plugs. Share the JSON. Clear only a disposable test slot after
   confirming. Check Escape, focus return, internal scrolling and phone sizing.

No merge, deployment or Bungie login is part of this PR.
