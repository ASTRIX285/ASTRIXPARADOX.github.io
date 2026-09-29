# Design System: ASTRIX PARADOX

The single source of truth for how ASTRIX PARADOX looks and behaves. Every agent (Claude, Codex, Google Stitch, impeccable) reads this before building or changing any page. Product scope and data rules live in `PRODUCT.md`. Where the two meet, the stricter rule wins. Miguel's own instructions override both.

## Configuration

| Surface | Variance | Motion | Density |
|---|---|---|---|
| Guardian Home, Tools hub (landing) | 7 Offset | 5 Fluid | 4 Balanced |
| Tool pages: Journey, Character, Forge Loader, Build Forge, Vault, Loadout, Reports | 4 Structured | 3 Restrained | 7 Dense |
| Item cards, popups, hover cards | 3 Precise | 3 Restrained | 7 Dense |
| Entry loader (portal, glass breach) | 6 | 7 Cinematic | 2 Airy |

## 1. Visual Theme and Atmosphere

A dark command console for Destiny 2 Guardians. Deep space charcoal grounds, one crimson action colour, gold for small labels and rarity, and authentic Bungie art doing the heavy visual lifting. It should feel established, crisp and fast, closer to a premium game companion than a web template. Data is the hero: numbers are large, condensed and exact; chrome stays quiet around them.

The site is dark only (`color-scheme: dark`). There is no light theme.

## 2. Color Palette and Roles

### Interface chrome (`css/astrix-palette.css`)

| Name | Hex | Role |
|---|---|---|
| Canvas Charcoal | `#161616` | Page ground |
| Panel Charcoal | `#222222` | Panels and cards |
| Raised Charcoal | `#2b2b2b` | Raised controls, secondary buttons |
| Primary Text | `#ededed` | Body and headings |
| Secondary Text | `#b8b8b8` | Supporting copy |
| Action Crimson | `#b22222` | The one primary action per page, active tab |
| Focus Sky | `#82c9ff` | Keyboard focus ring only |
| Success Teal | `#62d6ad` | Confirmed success state only |
| Border | `#414141` | Hairlines and card edges |
| Strong Border | `#616161` | Secondary button edges |

### Item cards (`paradox-item-cards.css`)

| Name | Hex | Role |
|---|---|---|
| Card Gold | `#e0b94f` | Exotic identity, card edge accents |
| Card Red | `#b51e2a` | Card emphasis |
| Card Violet | `#9d69ff` | Card detail accent |
| Card Teal | `#62e5b7` | Positive stat state |
| Card Copy | `#d8d3dc` | Card body text |
| Card Muted | `#9c96a4` | Card secondary text |

### Loader (`astrix-portal-loader.css`)

Gold `#ffd36a`, deep gold `#c88a26`, crimson `#d3202f`, red `#790810`, deep red `#260205`, warm text `#fff7e4`.

### Rules

- Game data colours are data owned. Element, rarity (Exotic gold, Legendary purple), damage type and breaker colours come from Bungie data and are never remapped onto interface tokens, and interface tokens are never used to fake them.
- One accent per page: crimson. Gold is a label and identity tone, not a second action colour.
- On large dark display type where `#b22222` fails contrast, use the lighter crimson `#ff4d64` for emphasis text only (as on Guardian Home). Buttons keep Action Crimson.
- Text contrast: 4.5:1 for body, 3:1 for text 24px and larger, including button labels and text over art.
- Banned: purple to blue AI gradients, neon outer glows, pure `#000000` or `#ffffff` large surfaces, gradient text on headings, a second saturated accent.

## 3. Typography Rules

| Role | Token | Stack |
|---|---|---|
| Interface and body | `--forge-font-ui` | bahnschrift, Segoe UI, Arial, sans-serif |
| Headings, nav, buttons, labels | `--forge-font-display` | bahnschrift-semicondensed, Segoe UI, Arial, sans-serif |
| Big numbers, names, tight labels | `--forge-font-condensed` | bahnschrift-condensed, Arial Narrow, Arial, sans-serif |

- Big numbers and item names: condensed, uppercase, heavy weight. Emphasis uses weight and colour, not a different family.
- Every column of digits uses `font-variant-numeric: tabular-nums`.
- Body text line length about 65 characters. Headings use `text-wrap: balance`.
- Labels never truncate mid-word: wrap, shorten deliberately, or widen the track.
- No new font hosts. Serif faces are not used.

## 4. Component Stylings

- **Buttons (tool pages, `astrix-app/shared/astrix-tool-shell.css`, approved 28 Sep 2026):** machined with one notched corner. Primary (Apply, Arm, Connect Bungie): Ember Red `#ba1f12` bevel with a lit top edge and a single sheen sweep on hover. Everything else: dark bevel with a steel hairline. Choices (activity, objective, element, tabs): selected gets a crimson left edge and a faint deep-red wash, never a heavy fill. Improve stays secondary (only selected items and the one confirm action are red). Focus ring steel. Disabled at 50 percent opacity. Minimum touch target 44px. Labels fit one line at desktop, one to three words, one label per intent.
- **Tool ribbon (approved 28 Sep 2026):** row 1 is the AX logo beside the ASTRIX wordmark (red X), the tool name, and the Guardian cards on the right (notched, crimson edge on the active Guardian). Row 2 is plain-text tabs, never boxed buttons: the current tool is white with a crimson underline that strobes gently. Scrolling down slides the ribbon away; scrolling up brings back a slim 52px bar with the logo mark, tool name and icon tabs (names on hover). Back at the top it is full again. `astrix-destination-ribbon.js` owns the behaviour (one passive, frame-throttled scroll listener: the only one allowed).
- **Equipped gear:** a slow crimson breathing frame with a light travelling round it; equipped weapons pulse out of step. Bungie's icon inside is never recoloured.
- **Item cards:** dark panel, gold hairline edge, 14px radius, authentic Bungie icon at the shared icon-size tokens (`--apx-icon-*`), perk matrix in a grid. Card heights follow content; rows of cards align edges and baselines.
- **Super selection:** the approved diamond geometry. Never replaced with a square icon.
- **Hover and inspect cards:** type level hover card on selector tiles; full instance inspect only where an instance is known. Always reachable by tap and keyboard, not hover alone.
- **Loader:** one shared portal controller (`astrix-portal-loader.js`). On a fresh entry from Tools it shows the approved concept (`astrix-breach-loader.mjs`, plain DOM and SVG, no three.js): slabs forming the X across the screen with a strobe on their edges, AI GAMING INTELLIGENCE over the chrome ASTRIX wordmark with the red X and PARADOX, and LOADING YOUR GUARDIAN in a notched tab on the bottom edge. Reduced motion gets the same wordmark and tab, still. No glass, no rings, no gold. One skin per load. No page may add a second loader.
- **States:** every data surface ships loading (shape matched), empty, error with retry, signed out (connect prompt, no stats) and partial (missing sections marked unavailable, the rest renders).

## 5. Landing Pages (Guardian Home, Tools)

- The hero fits the first viewport: headline max 2 lines at desktop, supporting line max 20 words, primary action visible without scrolling, at most four text elements.
- The days played headline is the Guardian Home signature. Stats come from one small request and every card hides when its stat is missing.
- Playful copy is fixed templates chosen by thresholds from real numbers. Never generated per player, never insulting, never claiming more than the number shows.

## 6. Layout Principles

- Vanilla HTML and CSS. Sibling groups use CSS grid or flex with `gap`, never per-element margin stacks or percentage flex maths.
- Side gutter at least 16px at every width. Content max width about 1320px on landing pages.
- `guardian-adaptive-layout.css` is the only authority for the top-level workspace grid.
- Cards only where elevation means hierarchy; otherwise spacing and hairlines. One corner-radius system per surface.
- Long lists (more than 5) become grouped columns, tabs, scroll-snap rows or a top list with view all.

## 7. Responsive Rules

- Designed and tested at 390px and 1440px. No horizontal page scroll at any width.
- Every multi-column layout declares its single-column fallback under 768px.
- Mobile icon rows scroll horizontally inside their own container, never the page.
- Touch targets at least 44px on phones.

## 8. Motion and Interaction

- Every animation must communicate hierarchy, sequence, feedback or a state change. Otherwise remove it.
- Animate `transform` and `opacity` only. No scroll event listeners except the tool ribbon's single passive listener; otherwise use IntersectionObserver or CSS scroll-driven animation.
- `prefers-reduced-motion` collapses loops, parallax and count-ups to their final static values.
- Content is complete at rest. Nothing waits at opacity 0 for an observer.
- One signature moment per page at most.

## 9. Performance Budget

- Every tool page usable within 3 seconds warm and 4 seconds cold, on desktop and on a 4G phone.
- No third-party script on the critical path. Heavy assets (three.js, hover and inspect cards, background workers) load after the first render.
- A file is imported under exactly one URL, so the browser never loads it twice.
- The backend never builds other pages inside a page request, and never buffers a whole streamed page in Worker memory.

## 10. Data and Imagery Honesty

- Every number, name and icon comes from Bungie data or the manifest. Missing data hides its element or shows an honest unavailable state. Never zero-fill, estimate or show sample data to a real player. Mocks are labelled SAMPLE DATA.
- Authentic Bungie icons in every item, perk, mod and ability socket. The ASTRIX layer is a ring or state only, never a recolour.
- Bungie attribution footer on every page. No implied affiliation.

## 11. Copy

- Plain player language: Exotic, Super, Vault, loadout, Guardian.
- Zero em dashes and en dashes anywhere visible. Use a period, comma, colon or plain hyphen. Ranges use a hyphen.
- No alpha, beta, version or build labels on pages.
- No filler verbs (elevate, seamless, unleash, next-gen). Errors say what went wrong and how to retry.

## 12. Anti-Patterns (Banned)

- A second loader, spinner overlay or intro panel on any page.
- Section-number eyebrows (01 / 4), scroll cues, decorative status dots, version footers.
- Div-built fake screenshots or fake dashboards.
- Pills or tags laid over Bungie art.
- Middle-dot chains as the default separator.
- Three identical feature cards in a row as a default layout.
- Recoloured or redrawn Bungie icons, invented stats, placeholder names like Acme or Jane Doe on real pages.
