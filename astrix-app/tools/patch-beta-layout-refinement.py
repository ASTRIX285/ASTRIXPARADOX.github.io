#!/usr/bin/env python3
from pathlib import Path

root = Path("astrix-app/pages/guardian-workspace-v2")
css = root / "guardian-workspace-v2-beta.css"

block = r"""
/* Forge beta layout refinement: identity padding + equipment proportions */

.stage .identity {
  padding: 18px 22px 20px 24px !important;
  box-sizing: border-box;
}

.stage .id-head {
  margin-top: 2px !important;
}

.stage .id-metrics,
.stage .id-cosmetics {
  margin-top: 10px !important;
}

/* Make the weapons panel narrower and give the width to Armour & Mods */
.equip {
  display: grid !important;
  grid-template-columns: minmax(240px, 24%) minmax(0, 76%) !important;
  gap: 10px !important;
}

.equip > .eq:first-child {
  min-width: 0 !important;
}

.equip > .eq:nth-child(2) {
  min-width: 0 !important;
}

.weap-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  gap: 6px !important;
}

.weap-grid .weap,
.weap-grid .weap .art {
  min-width: 0 !important;
  width: 100% !important;
}

.weap-grid .weap .art {
  aspect-ratio: 1 / 1 !important;
}

.arm-grid {
  width: 100% !important;
  grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
  gap: 8px !important;
}

@media (max-width: 1400px) {
  .stage .identity {
    padding: 16px 18px 18px 20px !important;
  }

  .equip {
    grid-template-columns: minmax(220px, 26%) minmax(0, 74%) !important;
  }
}
"""

existing = css.read_text(encoding="utf-8") if css.exists() else ""
marker = "/* Forge beta layout refinement: identity padding + equipment proportions */"

if marker in existing:
    start = existing.index(marker)
    css.write_text(existing[:start].rstrip() + "\n\n" + block.strip() + "\n", encoding="utf-8")
else:
    css.write_text(existing.rstrip() + "\n\n" + block.strip() + "\n", encoding="utf-8")

print(f"Updated: {css}")
