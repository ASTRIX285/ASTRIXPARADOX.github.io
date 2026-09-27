# ASTRIX PARADOX

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Destiny 2 players reviewing their activities, characters and builds. Miguel owns the product and performs account sign-in and manual acceptance checks.

## Product Purpose

Make Bungie activity history and player results understandable through a free three-stage Reports flow: activity selection, difficulty analysis and run detail.

## Operating Context

Reports runs in the existing ASTRIX PARADOX static web application. The implementation uses vanilla HTML, CSS and JavaScript modules, with Cloudflare Workers for Bungie requests. Desktop and mobile web are supported, including 390px-wide screens.

## Capabilities and Constraints

- Every activity family appears once on the front page, with its selection image and name.
- All characters are included by default. A character filter remains available.
- Activity pages show totals, exact difficulty attribution, character breakdowns and paged run history.
- Standard and Normal share a presentation label. Each run retains its own activity hash attribution.
- Run details have their own URL and a full fireteam table. Completion comes from each player's PGCR values.
- Browser back, difficulty selection, paging, sharing and fireteam-member navigation remain functional.
- Use Bungie aggregate stats, activity history and cached PGCRs. Never invent account totals, completion, modifiers or missing values.
- Clear totals must agree across overall, difficulty and character breakdowns. Missing coverage remains explicit.
- Use Bungie activity selection art and authentic emblems. Do not copy Braytech layouts, code or imagery.
- Changes are delivered through a branch and PR. Merging, deployment and account sign-in remain with Miguel.

## Brand Commitments

ASTRIX PARADOX is the product name. Preserve the existing brand tokens, logo and authentic Bungie imagery. Use plain, concise labels without em dashes. Reports should be compact, activity-led and readable over its background.

## Evidence on Hand

The Reports modules, public catalogue fixture and regression tests live under `astrix-app/pages/reports/` and `astrix-app/tools/`. Synthetic test counts are not live account evidence. The King's Fall fixture records the observed completion states of run 17105004322; unobserved fields remain missing.

## Product Principles

- Make difficulty the entry point into activity analysis.
- Keep every displayed value traceable to returned Bungie data.
- Make navigation predictable across all three stages.
- Prioritize readable results and compact, usable controls.
