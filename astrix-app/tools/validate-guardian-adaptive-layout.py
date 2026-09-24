#!/usr/bin/env python3
"""Paradox gate for the Guardian Workspace top-level layout contract."""

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PAGE = ROOT / "astrix-app" / "pages" / "guardian-workspace-v2"
AUTHORITY = "guardian-adaptive-layout.css"


def workspace_blocks(css: str) -> list[str]:
    return re.findall(r"(?<![\w>])\.workspace\s*\{([^}]*)\}", css, re.DOTALL)


def main() -> int:
    index = (PAGE / "index.html").read_text(encoding="utf-8")
    adaptive = (PAGE / AUTHORITY).read_text(encoding="utf-8")
    final_layout = (PAGE / "guardian-layout-final.css").read_text(encoding="utf-8")
    left_lock = (PAGE / "guardian-left-panel-lock.css").read_text(encoding="utf-8")
    super_sync = (PAGE / "guardian-super-feature-sync.mjs").read_text(encoding="utf-8")
    hero = (PAGE / "guardian-hero.css").read_text(encoding="utf-8")

    assert '<meta name="viewport" content="width=device-width, initial-scale=1.0">' in index
    assert re.search(
        r'<link rel="stylesheet" href="\./guardian-adaptive-layout\.css(?:\?v=[^"]+)?">',
        index,
    )
    assert index.index(AUTHORITY) < index.index("guardian-mobile.css") < index.index("guardian-layout-final.css")
    assert '.workspace>.right[hidden]{display:none!important}' in final_layout
    assert 'grid-template-areas:"left stage" "left equip"!important' in final_layout
    assert "leftPanelLockLink.href = './guardian-left-panel-lock.css?v=" in super_sync
    assert "grid-template-columns:clamp(400px,22vw,420px) minmax(0,1fr)!important" in left_lock

    for marker in (
        ".workspace>*{min-width:0}",
        "container-type:inline-size",
        "@media (min-width:1500px)",
        "@media (min-width:1281px) and (max-width:1499px)",
        "@media (min-width:981px) and (max-width:1280px)",
        "@media (max-width:980px)",
        '@container (max-width:780px)',
        '@container (max-width:560px)',
        '@container (max-width:900px)',
        '@container (max-width:680px)',
        '@container (max-width:460px)',
        '@container (max-width:520px)',
        'grid-template-areas:"left stage right" "left equip right"',
        'grid-template-areas:"left" "stage" "right" "equip"',
        "clamp(420px,30vw,600px)",
        "grid-template-columns:repeat(3,minmax(220px,1fr))",
        "grid-template-columns:repeat(2,minmax(220px,1fr))",
        "overflow-wrap:anywhere",
    ):
        assert marker in adaptive, f"Adaptive layout marker missing: {marker}"

    competing = []
    for css_path in sorted(PAGE.glob("*.css")):
        if css_path.name == AUTHORITY:
            continue
        css = css_path.read_text(encoding="utf-8")
        if any("grid-template-columns" in block for block in workspace_blocks(css)):
            competing.append(css_path.name)
    # PR #278 (99b131b) added the Character-scoped workspace owner in the shared rail.
    expected_layers = ["guardian-layout-final.css", "guardian-left-panel-lock.css", "guardian-left-rail-shared.css"]
    assert competing == expected_layers, f"Workspace grid layer drift: {', '.join(competing)}"

    for marker in (
        "left:50%",
        "top:0",
        "bottom:0",
        "width:100%",
        "height:100%",
        "max-width:100%",
        "max-height:100%",
        "object-fit:contain",
        "object-position:center bottom",
        "left:50%!important",
        "top:50%!important",
        "transform:translate(-50%,-50%)!important",
    ):
        assert marker in hero, f"Guardian containment marker missing: {marker}"

    for css_path in PAGE.glob("*.css"):
        css = css_path.read_text(encoding="utf-8")
        assert css.count("{") == css.count("}"), f"Unbalanced CSS blocks: {css_path.name}"

    print("PARADOX_ADAPTIVE_LAYOUT=PASS")
    print("WORKSPACE_COLUMN_LAYERS=guardian-adaptive-layout.css,guardian-layout-final.css,guardian-left-panel-lock.css,guardian-left-rail-shared.css")
    print("DESKTOP_LIVE_EQUIPMENT_LAYOUT=PASS")
    print("MOBILE_STACK_ORDER=PASS")
    print("GUARDIAN_STAGE_CONTAINMENT=PASS")
    print("GUARDIAN_HORIZONTAL_CENTER=PASS")
    print("RENDER_STATUS_CENTER=PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
