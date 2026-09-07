#!/usr/bin/env python3
"""Paradox validation gate for the live Bungie character selector."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PAGE = ROOT / "astrix-app" / "pages" / "guardian-workspace-v2"


def main() -> int:
    html = (PAGE / "index.html").read_text(encoding="utf-8")
    module = (PAGE / "guardian-character-cards.mjs").read_text(encoding="utf-8")
    profile = (PAGE / "guardian-bungie-profile.mjs").read_text(encoding="utf-8")
    styles = (PAGE / "guardian-character-cards.css").read_text(encoding="utf-8")
    hero_styles = (PAGE / "guardian-hero.css").read_text(encoding="utf-8")

    assert 'id="guardianCharacterCards"' in html
    assert 'src="./guardian-character-cards.mjs?v=' in html
    assert 'href="./guardian-character-cards.css?v=' in html
    assert '<div class="identity">' not in html
    assert "const MAX_CHARACTERS = 3" in module
    assert 'class="guardian-stat-icon"' in module
    assert "guardian-character-card__rank" not in module
    assert 'new CustomEvent("forge:character-selected"' in module
    assert '"forge:bungie-character-roster"' in module
    assert "function characterRoster(" in profile
    assert "function selectLiveCharacter(" in profile
    assert 'publishCharacterRoster(liveProfilePayload,detail.characterId)' in profile
    assert 'grid-template-columns:repeat(3' in styles
    assert "scroll-snap-type" not in styles
    assert "overflow-x:auto" not in styles
    assert "border-color:rgba(var(--stage-accent-rgb" in styles
    assert "background:rgba(7,9,14,.52)" in styles
    assert "font:800 13px bahnschrift,sans-serif" in styles
    assert "background:var(--character-emblem) 28px center/cover no-repeat" in styles
    assert "min-height:32px" in styles
    assert "width:var(--apx-icon-stat,1.25rem);height:var(--apx-icon-stat,1.25rem);flex:0 0 var(--apx-icon-stat,1.25rem)" in styles
    assert "gap:5px" in styles
    assert "left:34px;\n  right:50px" in styles
    assert "left:39px;\n  right:4px" in styles
    assert ".class-super-row{" in styles
    assert ".class-super-row .subclass-hero" in styles
    assert "grid-template-rows:auto 62px auto" in styles
    assert "transform:translateX(-50%) rotate(45deg)" in styles
    assert ".super-option.is-active{top:18px;left:50%;z-index:3}" in styles
    assert ".super-option:nth-child(2){top:2px;left:25%}" in styles
    assert ".super-option:nth-child(3){top:2px;left:75%}" in styles
    assert "scrollbar-width:none" in styles
    assert ".slice(0,4)" in (PAGE / "guardian-advisor-layer.mjs").read_text(encoding="utf-8")
    assert "left:50%!important" in hero_styles
    assert "top:50%!important" in hero_styles
    assert "transform:translate(-50%,-50%)!important" in hero_styles
    assert '.stage>.identity,.stage>.hero-stats{display:none!important}' in styles

    print("PARADOX_CHARACTER_CARDS=PASS")
    print("BUNGIE_CHARACTERS=3")
    print("EMBLEM_BACKGROUND=PASS")
    print("FULL_WORKSPACE_SELECTION_EVENT=PASS")
    print("DESKTOP_THREE_CARD_ROW=PASS")
    print("MOBILE_FIXED_CARD_RIBBON=PASS")
    print("LEGACY_IDENTITY_STATS_REMOVED=PASS")
    print("GUARDIAN_RANK_DEFERRED=PASS")
    print("STAT_ICON_BUNGIE_ARTWORK=PASS")
    print("STAT_VALUE_FIXED_RIBBON=PASS")
    print("STAT_ICON_SCALE=PASS")
    print("LEFT_CLASS_SUPER_ALIGNMENT=PASS")
    print("HERO_STATUS_CENTRED=PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
