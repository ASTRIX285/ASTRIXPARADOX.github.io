#!/usr/bin/env python3
"""Build beta-only Destiny identities directly from Bungie's current manifest.

Purpose:
- resolve every Destiny hash referenced by Paradox Forge beta fixtures;
- additionally resolve armour Exotic intrinsic plug hashes;
- preserve official Bungie identity only (name, description, icon, type metadata);
- never infer effects, synergy, ranking, scoring, or recommendations.

Requires:
  BUNGIE_API_KEY environment variable

Writes:
  astrix-app/data/paradox-forge/beta/beta-bungie-identities.json
"""

from __future__ import annotations

import json
import os
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "astrix-app" / "data"
BETA = DATA / "paradox-forge" / "beta"

FIXTURES_PATH = BETA / "ASTRIX_Paradox_Forge_Beta_Fixtures_v1.json"
OUTPUT_PATH = BETA / "beta-bungie-identities.json"

API_ROOT = "https://www.bungie.net/Platform"
BUNGIE_ROOT = "https://www.bungie.net"


def fetch_json(url: str, api_key: str | None = None) -> dict[str, Any]:
    headers = {
        "Accept": "application/json",
        "User-Agent": "ASTRIX-Paradox-Forge-Beta/1.0",
    }
    if api_key:
        headers["X-API-Key"] = api_key

    request = urllib.request.Request(url, headers=headers)

    with urllib.request.urlopen(request, timeout=180) as response:
        data = json.loads(response.read().decode("utf-8"))

    if isinstance(data, dict) and data.get("ErrorCode") not in (None, 1):
        raise RuntimeError(
            data.get("Message")
            or data.get("ErrorStatus")
            or "Bungie API error"
        )

    return data


def absolute(path: str) -> str:
    return path if path.startswith("http") else f"{BUNGIE_ROOT}{path}"


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(f"Missing file: {path}")

    value = json.loads(path.read_text(encoding="utf-8"))

    if not isinstance(value, dict):
        raise SystemExit(f"Expected JSON object: {path}")

    return value


def gather_fixture_hashes(fixtures: list[Any]) -> set[int]:
    wanted: set[int] = set()

    for fixture in fixtures:
        if not isinstance(fixture, dict):
            continue

        for value in fixture.get("allDestinyHashes", []):
            if isinstance(value, int):
                wanted.add(value)

    return wanted


def gather_intrinsic_hashes(
    inventory: dict[str, Any],
    fixtures: list[Any],
) -> set[int]:
    intrinsic: set[int] = set()

    equipped_hashes: set[int] = set()

    for fixture in fixtures:
        if not isinstance(fixture, dict):
            continue

        for item in fixture.get("rawDim", {}).get("equipped", []):
            if isinstance(item, dict) and isinstance(item.get("hash"), int):
                equipped_hashes.add(item["hash"])

    for item_hash in equipped_hashes:
        definition = inventory.get(str(item_hash))

        if not isinstance(definition, dict):
            continue

        sockets = definition.get("sockets") or {}

        for row in sockets.get("intrinsicSockets") or []:
            if not isinstance(row, dict):
                continue

            plug_hash = row.get("plugItemHash")

            if isinstance(plug_hash, int) and plug_hash:
                intrinsic.add(plug_hash)

    return intrinsic


def compact_definition(
    item_hash: int,
    definition: dict[str, Any],
) -> dict[str, Any]:
    display = definition.get("displayProperties") or {}
    equipping = definition.get("equippingBlock") or {}
    sockets = definition.get("sockets") or {}

    intrinsic_hashes = [
        row.get("plugItemHash")
        for row in sockets.get("intrinsicSockets") or []
        if isinstance(row, dict)
        and isinstance(row.get("plugItemHash"), int)
        and row.get("plugItemHash")
    ]

    return {
        "bungieHash": item_hash,
        "name": str(display.get("name") or ""),
        "description": str(display.get("description") or ""),
        "icon": str(display.get("icon") or ""),
        "iconWatermark": str(
            definition.get("iconWatermark")
            or ""
        ),
        "itemType": definition.get("itemType"),
        "itemSubType": definition.get("itemSubType"),
        "itemTypeDisplayName": str(
            definition.get("itemTypeDisplayName")
            or ""
        ),
        "classType": definition.get("classType"),
        "itemCategoryHashes": definition.get("itemCategoryHashes") or [],
        "traitIds": definition.get("traitIds") or [],
        "equippingBlock": {
            "equipmentSlotTypeHash": equipping.get(
                "equipmentSlotTypeHash"
            ),
            "ammoType": equipping.get("ammoType"),
            "uniqueLabelHash": equipping.get("uniqueLabelHash"),
        },
        "intrinsicPlugHashes": intrinsic_hashes,
        "source": "bungie-current-manifest",
    }


def main() -> int:
    api_key = os.environ.get("BUNGIE_API_KEY")

    if not api_key:
        raise SystemExit(
            "BUNGIE_API_KEY is not set. "
            "Set it in this shell before running the script."
        )

    fixtures_payload = load_json(FIXTURES_PATH)
    fixtures = fixtures_payload.get("fixtures")

    if not isinstance(fixtures, list):
        raise SystemExit("Fixture file must contain a fixtures array.")

    print("Fetching current Bungie manifest metadata...")

    manifest = fetch_json(
        f"{API_ROOT}/Destiny2/Manifest/",
        api_key,
    )

    response = manifest["Response"]
    manifest_version = str(response.get("version") or "unknown")

    paths = (
        response.get("jsonWorldComponentContentPaths", {})
        .get("en", {})
    )

    inventory_path = paths.get("DestinyInventoryItemDefinition")

    if not inventory_path:
        raise SystemExit(
            "Bungie manifest did not provide "
            "DestinyInventoryItemDefinition."
        )

    print(f"Manifest version: {manifest_version}")
    print("Downloading DestinyInventoryItemDefinition...")

    inventory = fetch_json(absolute(inventory_path))

    fixture_hashes = gather_fixture_hashes(fixtures)
    intrinsic_hashes = gather_intrinsic_hashes(
        inventory,
        fixtures,
    )

    wanted = fixture_hashes | intrinsic_hashes

    identities: list[dict[str, Any]] = []
    unresolved: list[int] = []

    for item_hash in sorted(wanted):
        definition = inventory.get(str(item_hash))

        if not isinstance(definition, dict):
            unresolved.append(item_hash)
            continue

        identities.append(
            compact_definition(
                item_hash,
                definition,
            )
        )

    output = {
        "schemaVersion": "1.0.0",
        "purpose": (
            "Beta-only official Destiny identity cache from Bungie's "
            "current English DestinyInventoryItemDefinition. "
            "Contains no Forge authored gameplay inference."
        ),
        "manifestVersion": manifest_version,
        "fixtureHashCount": len(fixture_hashes),
        "intrinsicHashCount": len(intrinsic_hashes),
        "requestedHashCount": len(wanted),
        "resolvedCount": len(identities),
        "unresolvedCount": len(unresolved),
        "identities": identities,
        "unresolvedHashes": unresolved,
    }

    OUTPUT_PATH.write_text(
        json.dumps(
            output,
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )

    print()
    print(f"Wrote: {OUTPUT_PATH}")
    print(f"Fixture hashes: {len(fixture_hashes)}")
    print(f"Extra Exotic intrinsic hashes: {len(intrinsic_hashes)}")
    print(f"Resolved direct from Bungie: {len(identities)}")
    print(f"Unresolved: {len(unresolved)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
