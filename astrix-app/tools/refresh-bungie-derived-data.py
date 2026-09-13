#!/usr/bin/env python3
"""Refresh Forge Bungie derived Destiny data when the manifest changes.

This script deliberately updates only machine-generated Bungie identity/data
caches. It never edits curated Paradox intelligence, synergy rules, rankings,
recommendations, or hand-verified gameplay effects.

Generated targets:
- astrix-app/data/component-icons.json
- astrix-app/data/paradox-forge/beta/beta-bungie-manifest-cache.json
- astrix-app/pages/guardian-workspace-v2/guardian-loadout-definitions.mjs
- astrix-app/data/bungie-manifest-state.json
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "astrix-app"
DATA = APP / "data"
STATE_PATH = DATA / "bungie-manifest-state.json"
COMPONENT_ICONS = DATA / "component-icons.json"
BETA_CACHE = DATA / "paradox-forge" / "beta" / "beta-bungie-manifest-cache.json"
LOADOUT_DEFS = APP / "pages" / "guardian-workspace-v2" / "guardian-loadout-definitions.mjs"
MANIFEST_URL = "https://www.bungie.net/Platform/Destiny2/Manifest/"
USER_AGENT = {"User-Agent": "ASTRIX-Paradox-Forge-Manifest-Refresh/1.0"}


def github_output(name: str, value: object) -> None:
    target = os.environ.get("GITHUB_OUTPUT")
    if not target:
        return
    with open(target, "a", encoding="utf-8") as handle:
        handle.write(f"{name}={value}\n")


def fetch_manifest() -> dict[str, Any]:
    headers = dict(USER_AGENT)
    api_key = os.environ.get("BUNGIE_API_KEY", "").strip()
    if api_key:
        headers["X-API-Key"] = api_key
    request = urllib.request.Request(MANIFEST_URL, headers=headers)
    with urllib.request.urlopen(request, timeout=120) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if payload.get("ErrorCode") not in (None, 1):
        raise RuntimeError(payload.get("Message") or "Bungie manifest request failed")
    result = payload.get("Response")
    if not isinstance(result, dict):
        raise RuntimeError("Bungie manifest response was missing Response")
    return result


def read_state() -> dict[str, Any]:
    if not STATE_PATH.exists():
        return {}
    try:
        value = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def run(*args: str) -> None:
    print("+", " ".join(args), flush=True)
    subprocess.run(args, cwd=ROOT, check=True)


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise RuntimeError(f"Expected JSON object: {path}")
    return value


def loadout_manifest_version(path: Path) -> str | None:
    if not path.exists():
        return None
    text = path.read_text(encoding="utf-8")
    match = re.search(r'"manifestVersion":"([^"]+)"', text)
    return match.group(1) if match else None


def validate(expected_version: str) -> dict[str, Any]:
    errors: list[str] = []
    details: dict[str, Any] = {}

    if not COMPONENT_ICONS.exists():
        errors.append(f"Missing {COMPONENT_ICONS.relative_to(ROOT)}")
    else:
        icons = read_json(COMPONENT_ICONS)
        details["componentIconsVersion"] = icons.get("manifestVersion")
        details["componentIconCount"] = len(icons.get("icons") or {})
        if icons.get("manifestVersion") != expected_version:
            errors.append("component-icons.json manifestVersion does not match Bungie")

    if not BETA_CACHE.exists():
        errors.append(f"Missing {BETA_CACHE.relative_to(ROOT)}")
    else:
        beta = read_json(BETA_CACHE)
        details["betaCacheVersion"] = beta.get("manifestVersion")
        details["betaResolvedInventoryCount"] = beta.get("resolvedInventoryCount")
        details["betaUnresolvedInventoryCount"] = beta.get("unresolvedInventoryCount")
        if beta.get("manifestVersion") != expected_version:
            errors.append("beta-bungie-manifest-cache.json manifestVersion does not match Bungie")

    loadout_version = loadout_manifest_version(LOADOUT_DEFS)
    details["loadoutDefinitionsVersion"] = loadout_version
    if loadout_version != expected_version:
        errors.append("guardian-loadout-definitions.mjs manifestVersion does not match Bungie")

    if errors:
        raise RuntimeError("Refresh validation failed: " + "; ".join(errors))
    return details


def write_state(version: str, previous: str | None, details: dict[str, Any]) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "schemaVersion": "1.0.0",
        "manifestVersion": version,
        "previousManifestVersion": previous,
        "refreshedAt": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": "Bungie GetDestinyManifest",
        "generatedTargets": [
            str(COMPONENT_ICONS.relative_to(ROOT)),
            str(BETA_CACHE.relative_to(ROOT)),
            str(LOADOUT_DEFS.relative_to(ROOT)),
        ],
        "validation": details,
        "curatedDataModified": False,
    }
    STATE_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="Refresh even if the manifest version is unchanged")
    parser.add_argument("--check-only", action="store_true", help="Only compare current Bungie version with stored state")
    args = parser.parse_args()

    manifest = fetch_manifest()
    current = str(manifest.get("version") or "").strip()
    if not current:
        raise RuntimeError("Bungie returned an empty manifest version")

    state = read_state()
    previous = str(state.get("manifestVersion") or "").strip() or None
    changed = previous != current

    print(f"CURRENT_MANIFEST={current}")
    print(f"STORED_MANIFEST={previous or 'none'}")
    print(f"MANIFEST_CHANGED={'true' if changed else 'false'}")
    github_output("manifest_version", current)
    github_output("previous_manifest_version", previous or "")
    github_output("manifest_changed", str(changed).lower())

    if args.check_only:
        return 0

    if not changed and not args.force:
        github_output("refreshed", "false")
        print("Manifest unchanged; no generated data refresh required.")
        return 0

    run(sys.executable, str(APP / "tools" / "import-component-icons.py"), "--force")
    run(sys.executable, str(APP / "tools" / "build-beta-bungie-manifest-cache.py"))
    run(sys.executable, str(APP / "tools" / "build-guardian-loadout-definitions.py"))

    details = validate(current)
    write_state(current, previous, details)

    github_output("refreshed", "true")
    github_output("component_icon_count", details.get("componentIconCount", 0))
    github_output("beta_resolved", details.get("betaResolvedInventoryCount", 0))
    github_output("beta_unresolved", details.get("betaUnresolvedInventoryCount", 0))
    print(json.dumps({"manifestVersion": current, "previousManifestVersion": previous, **details}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
