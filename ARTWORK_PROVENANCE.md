# Artwork provenance

Visual assets supplied for Forge remain developer-provided artwork. Code and
review notes must describe changes to those assets as integration, placement,
presentation, optimisation, or responsive treatment. They must not claim
authorship of the underlying artwork.

## Current branch integration

- `img/games/D2_JB.jpg` is developer-provided artwork.
- `img/brands/bungie-logo.svg` is the unmodified Bungie wordmark served by
  Bungie at `/7/ca/bungie/icons/logos/bungienet/bungie_logo_basic.svg`.
- `astrix-token-branch-preview.css` integrates that artwork as the subdued,
  responsive background on Main and Build Design.

## Journey destination maps, 20 September 2026

The nine destination pairs in `astrix-app/pages/journey/assets/maps/` integrate
the user-approved cleaned map batch derived from developer-provided Destiny 2
screenshots. The underlying Director artwork is Bungie's artwork. Generated
cleanup and the approved EDZ corner fill do not establish authorship of that art.
The 3840 x 2160 and 5760 x 3240 files are enlarged exports from smaller cleaned
masters, not native captures at those resolutions. Cosmodrome retains its existing
approved artwork. `astrix-app/data/journey-map-assets.json` records all 18 export
checksums and the corresponding master checksums. See the Journey integration
notes for coordinate calibration and public-data provenance.

## Link share image, 4 October 2026

`img/share/astrix-paradox-share-1200x630.jpg` is a 1200 x 630 crop of the
existing `astrix-app/pages/journey/assets/maps/astrix-paradox-map-placeholder-6k.webp`
map art with a lighter Forge Black wash, an Ember glow and a brightness lift.
It is presentation of the existing art for link previews, not new artwork. The
home page and The Hub use it as their `og:image` and `twitter:image`.

## The Aetherium hub card art, 5 October 2026

`img/games/aion2-the-aetherium.jpg` is NCSOFT's artwork, not ours. It is the
official AION 2 link share image (the `og:image` of https://aion2.plaync.com/),
downloaded on 5 October 2026 from NCSOFT's CDN at
`https://fizz-download.playnccdn.com/download/v2/buckets/marketing-platform/files/1a0f3211893-7c962f09-62b7-4a8c-a22c-addac86eb352`
(1200 x 630 PNG, 1,791,598 bytes, sha256
`ec5d8be8bda556d9eddcc46c91f282e8f174e496a3394afb4091ba469c90bdf3`). Approved by
Miguel for The Hub on 5 October 2026. The only change is a re-encode to a web
JPEG at the same 1200 x 630 size (quality 0.85, 146,150 bytes, sha256
`f0f42349ef4419b6c0a402b26807488ff59d5adbbc5bc31868682b89bb05b88e`). Nothing was
cropped, painted or added; The Hub card places and crops it with CSS. AION 2 and
its art are trademarks and copyrights of NCSOFT.
