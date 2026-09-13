# Guardian Workspace v2 Design Specification

> Every feature must help the player make a better decision.

## 1. Purpose

Guardian Workspace v2 is the flagship Paradox Forge experience for Destiny 2 and the first full reference implementation of the wider Forge multigame platform.

It must feel immediately familiar to an experienced Destiny player while adding something Bungie's interface does not provide: transparent, context-aware reasoning about the player's equipped build, owned inventory and current activity.

The workspace is not a database page, chat window or static loadout viewer. It is an interactive decision surface that combines:

- live player identity
- verified game knowledge
- equipped build state
- encounter requirements
- explainable recommendations

## 2. Locked product rules

1. **Destiny familiarity first.** Preserve Destiny's visual and information hierarchy where it is already effective.
2. **Guardian remains the focal point.** The character render is the dominant visual element.
3. **Advisor, not database.** Every major surface must support a player decision.
4. **No invented data.** Official identity and imagery come from Bungie data. Forge intelligence remains verified and source-backed.
5. **No opaque recommendations.** Every recommendation must expose its evidence path.
6. **Preview and live state must never be confused.** Placeholder values are visibly labelled.
7. **Additive architecture.** Existing services, pipelines and imports remain valid.
8. **Platform boundary.** Generic reasoning belongs to the platform. Destiny terms and APIs remain inside the Destiny game module.

## 3. Primary user goal

A player opens the workspace and can answer, within seconds:

- Which Guardian and build am I viewing?
- What is currently equipped?
- How does the build loop work?
- What does this activity require?
- Where is my current build weak?
- What should I change, using items I actually own?
- Why is that change recommended?

## 4. Screen anatomy

### 4.1 Global navigation

Persistent top navigation:

- Activity
- Build
- Guardian
- Collections
- Fashion
- Vault
- Intelligence

Guardian is the active route for this workspace.

The account area shows:

- Bungie display name
- membership code when available
- current season
- connection state
- account menu

### 4.2 Left build rail

The left rail follows Destiny's subclass hierarchy.

#### Identity header

- subclass crest
- subclass name
- class name
- element
- power
- connected or preview state

#### Super

Show all valid supers for the selected class and subclass.

Each Super tile must expose:

- Bungie hash
- name
- icon
- equipped state
- unlocked state
- hover or focus explanation

Only one Super may be equipped at a time.

#### Abilities

Show the equipped and available:

- class ability
- movement ability
- melee
- grenade

Abilities use the same interaction pattern as Supers.

#### Aspects

Show class-specific Aspects only.

Each Aspect tile exposes:

- icon and name
- equipped state
- unlocked state
- fragment slot contribution
- verified outputs and triggers
- graph relationships used by Paradox analysis

#### Fragments

Show equipped Fragments first, followed by available unlocked Fragments and then locked Fragments.

The interface must make clear:

- current fragment capacity
- used slots
- stat modifiers
- equipped versus available state
- which build-loop edges each Fragment contributes

#### Seasonal Artifact

Show the current artifact and unlocked perks.

Artifact perks remain separate from the permanent subclass model because the artifact changes seasonally.

The workspace must distinguish:

- current artifact definition
- player unlock state
- equipped or active perk state where Bungie's API exposes it
- encounter counter contribution

### 4.3 Central Guardian stage

The Guardian render occupies the largest area of the screen.

The stage contains:

- live character render when available
- class and subclass ambient treatment
- equipped emblem or title treatment where appropriate
- equipped armour items around the render
- equipped weapons around the render
- power and core stat summary

The stage should use restrained motion:

- subtle element particles
- slow background geometry
- soft item hover focus
- reduced-motion fallback

No decorative animation may obscure item state or analysis.

### 4.4 Equipment strip

The lower equipment area shows:

- kinetic or first weapon slot
- energy or second weapon slot
- power weapon
- helmet
- gauntlets
- chest armour
- leg armour
- class item
- armour mods summary
- stat summary

Every equipment tile must support:

- official Bungie identity
- instance data when authenticated
- ownership state
- equipped state
- power
- element or damage type
- perk and socket summary
- ornament and shader overlay
- Paradox contribution summary

### 4.5 Right intelligence rail

The right rail is dynamic. It changes according to selection and activity context.

It contains four stacked areas.

#### Build analysis

Display evidence-backed measures such as:

- loop continuity
- survivability support
- crowd-control coverage
- add-clear support
- boss-damage support
- ability uptime support
- champion coverage
- element or surge match

These are not public tier rankings. They are contextual analysis outputs derived from explicit rules and evidence paths.

Each measure must be inspectable.

#### Why this build works

Render the primary cause-and-effect chain as a directed path.

Example structure:

```text
Dodge
  -> activates Aspect
  -> applies Invisibility
  -> Fragment extends duration
  -> safer repositioning and revives
```

Each node links back to its source definition and each edge exposes its verified mechanism.

#### Recommendations

Recommendations must be ordered by practical importance, not hidden global ranking.

Each recommendation contains:

- proposed change
- reason
- expected gain
- expected trade-off
- ownership and unlock status
- activity relevance
- full evidence path

The system must be able to say that no change is required.

#### Activity context

Show only when an activity is selected or inferred.

Include:

- activity name
- encounter or launch context
- champions
- surges or threats
- shield or element requirements when relevant
- modifiers
- player role where supplied

The same counter engine used for build reasoning points outward at this context.

## 5. Interaction model

### 5.1 Selection

Selecting any Super, ability, Aspect, Fragment, artifact perk, weapon, armour item or mod updates the intelligence rail without navigating away.

### 5.2 Hover and keyboard focus

Hover or focus provides a concise explanation. Selection provides the full analysis.

The interface must support keyboard navigation and visible focus states.

### 5.3 Compare mode

A later phase may allow a proposed replacement to be previewed without changing the Bungie account.

Compare mode must show:

- current state
- proposed state
- gained relationships
- lost relationships
- activity effect
- ownership requirement

### 5.4 Preview mode

Before authentication, the workspace may use a verified demonstration dataset.

Preview mode must visibly state:

- data is illustrative
- account is not connected
- values are not the visitor's live values

A fake connected state is forbidden.

## 6. Data ownership and service boundaries

### 6.1 Platform layer

The platform owns generic contracts for:

- player
- character
- equipment
- ability
- passive modifier
- encounter requirement
- recommendation
- evidence path
- game module

The platform must not contain Destiny-specific hashes, endpoint names or terminology.

### 6.2 Destiny 2 game module

The Destiny module maps Bungie concepts into platform concepts.

Examples:

- Guardian -> Character
- weapon and armour -> Equipment
- Super and grenade -> Ability
- Aspect, Fragment and artifact perk -> Passive modifier
- Champion and activity modifier -> Encounter requirement

The module owns:

- Bungie manifest integration
- Bungie profile component mapping
- Destiny-specific class and subclass rules
- Destiny-specific UI labels
- Destiny-specific renderer adapters

### 6.3 Player Identity

Player Identity owns authenticated state:

- memberships
- characters
- equipped item instances
- character inventories
- vault
- collections
- unlock state
- progression
- cosmetics

It does not own game definitions or build reasoning.

### 6.4 Destiny Knowledge

Destiny Knowledge owns static and curated definitions:

- weapons
- armour
- game components
- cosmetics
- activities and counters
- verified relationships

It does not own player-specific ownership or equipped state.

### 6.5 Reasoning

The reasoning layer consumes:

- verified game relationships
- player state
- activity context

It produces:

- evidence paths
- gaps
- conflicts
- recommendations
- trade-offs

It must never modify source catalogues.

## 7. Proposed component structure

```text
astrix-app/
  components/
    guardian-workspace/
      guardian-workspace.mjs
      guardian-workspace.css
      guardian-stage.mjs
      subclass-loadout.mjs
      equipment-strip.mjs
      intelligence-rail.mjs
      activity-context.mjs
      recommendation-card.mjs
      evidence-path.mjs
      preview-state.mjs

  games/
    destiny-2/
      presentation/
        guardian-workspace-adapter.mjs
        destiny-icon-resolver.mjs
        destiny-character-renderer.mjs

  platform/
    contracts/
      workspace-state.mjs
      recommendation.mjs
      evidence-path.mjs

  domains/
    player-identity/
    destiny-knowledge/
    reasoning/
```

This structure is additive. Existing services remain in place and may be consumed through facades.

## 8. Workspace state contract

The UI should consume one composed state object rather than calling every service independently.

Illustrative shape:

```json
{
  "mode": "preview",
  "gameId": "destiny-2",
  "player": {},
  "character": {},
  "subclass": {
    "element": {},
    "supers": [],
    "abilities": [],
    "aspects": [],
    "fragments": [],
    "artifact": {}
  },
  "equipment": {
    "weapons": [],
    "armour": [],
    "mods": []
  },
  "cosmetics": {},
  "activity": null,
  "analysis": {
    "measures": [],
    "primaryLoop": null,
    "gaps": [],
    "recommendations": []
  }
}
```

The exact schema must be validated before production implementation.

## 9. Visual design system

### Layout

- widescreen-first, responsive down to tablet and mobile
- central Guardian remains visually dominant on desktop
- left and right rails collapse into tabs or drawers on smaller screens
- avoid dense dashboard styling

### Typography

- strong uppercase display type for subclass and section identity
- highly readable body type for explanations
- no decorative font in long analysis text

### Colour

- neutral black and graphite platform shell
- element colour drives subclass accents
- crimson remains the Paradox Forge brand accent
- gold reserved for power, rare highlights and important status
- green, amber and red used sparingly for verified status and conflicts

### Surfaces

- thin borders
- subtle translucency
- soft glow
- restrained corner radius
- generous negative space

### Imagery

- Bungie manifest icons and approved repository imagery only
- live Guardian render from the authenticated flow when available
- clear fallback state when an image cannot resolve

## 10. Accessibility and resilience

Required:

- semantic headings and landmarks
- keyboard-operable selectors
- visible focus states
- meaningful alt text
- colour-independent status indicators
- reduced-motion support
- loading, empty, error and stale-data states
- graceful handling of missing profile components
- no page failure when one image or optional component is unavailable

## 11. Implementation phases

### Phase 1: visual foundation

- production component shell
- responsive layout
- verified preview dataset
- subclass, equipment and analysis surfaces
- no live account requirement

### Phase 2: live identity

- Bungie OAuth integration
- memberships and character selector
- live equipped state
- inventory and collections overlay
- cosmetics and render integration

### Phase 3: verified intelligence

- knowledge-graph evidence paths
- build-loop explanation
- counter coverage
- gaps and conflicts
- source-backed recommendations

### Phase 4: activity adaptation

- selected activity context
- encounter requirements
- recommended changes and trade-offs
- comparison mode

### Phase 5: closed validation

- expert Destiny testers
- incorrect-recommendation capture
- edge-case account states
- new, returning and endgame player scenarios
- accessibility and performance testing

## 12. Acceptance criteria for v2 visual foundation

The first production implementation is accepted only when:

1. It clearly resembles an evolved Destiny character and subclass workspace.
2. Super, abilities, Aspects, Fragments and artifact are represented separately and correctly.
3. Class-specific records never leak across classes.
4. Preview values are clearly identified.
5. All displayed images come from verified sources or defined fallbacks.
6. The Guardian remains the central visual focus.
7. The intelligence rail can render evidence paths, recommendations and activity context from supplied state.
8. The workspace can run without OAuth using preview state.
9. Existing repositories, pipelines and services remain functional.
10. The implementation creates no new unverified synergy claims.

## 13. Definition of success

Guardian Workspace v2 succeeds when a player can look at their Guardian, recognise the Destiny structure immediately, understand the current build loop, see what the selected activity demands and trust every recommendation because the reasoning is visible.
