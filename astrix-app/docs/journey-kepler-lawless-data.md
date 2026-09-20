# Kepler and Lawless Frontier data preparation

Prepared 20 September 2026 against main e63d03b16191ac587cafc519f6cf94ed452ea564.

## Verified identities

The official Bungie Manifest endpoint returned version `244213.26.06.29.2000-1-bnet.65864`, matching the repository Journey catalogue. Destination, activity and activity-type tables were fetched directly from the English component paths returned by https://www.bungie.net/Platform/Destiny2/Manifest/.

| Journey key | Definition | Hash | Catalogue coverage |
| --- | --- | --- | --- |
| kepler | DestinyDestinationDefinition | 4076196532 | 29 current Triumph record leaves |
| kepler | DestinyPresentationNodeDefinition | 2140539821 | Kepler current Triumph branch |
| lawless-frontier | DestinyActivityTypeDefinition | 2292427391 | 176 non-redacted activity definitions |
| lawless-frontier | DestinyPresentationNodeDefinition | 3696748178 | 10 current Triumph record leaves |

Lawless Frontier is not a destination-name alias. Its activities use three destination hashes with blank display names in this snapshot: 682521729, 2227522752 and 2790172253. Do not classify all activities on Europa, Mars or Venus as Lawless Frontier. The unrelated Lawless Frontier presentation branch 1829493959 is under The Light, outside the current Triumph subtree; it is not substituted for the current activity records.

## Implemented

Journey-owned name, activity and objective matching now supports both keys. Lawless Frontier activity membership uses the official activity-type hash. Kepler uses its destination hash. Objective matching can use a definition's explicit destination/activity link when the profile objective omits that link. Existing profile-derived completion, character selection and unknown-state handling remain in use. No separate account data cache or blocking loader was added.

The shared destination selector, location HTML, CSS, map registry, map assets and other pages are unchanged. These keys become user-accessible when the agreed location sections and approved map batch are integrated. No deployment is included.

## Validation and remaining integration

`node astrix-app/tools/test-journey-destinations.mjs` checks real catalogue classification, host-destination isolation, hidden objectives, redaction and absent data.

`node astrix-app/tools/test-journey-records.mjs` executes the production record joins for all 11 locations: 608 unique records in total, including 29 Kepler and 10 Lawless Frontier. Missing profile completion stays unknown. Existing record, collection and bounded-cache checks pass.

Authenticated live account validation remains outstanding. Quest objectives without an explicit Bungie destination/activity link remain unassigned; no quest ownership or completion is inferred from text. Map coordinates and any further reputation/vendor sections require their own verified definitions and live profile data. Final map images and overlays are deferred until the full screenshot batch is approved.
