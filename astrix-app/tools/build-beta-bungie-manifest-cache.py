#!/usr/bin/env python3
"""Build a comprehensive beta-only Bungie manifest cache for Paradox Forge.

This script uses Bungie's current English manifest as the official source for
the Destiny identity/display data needed by the 23 beta fixtures.

It collects:
- every Destiny hash referenced by the enriched DIM fixtures;
- equipped item definitions;
- subclass socket override definitions;
- armour mod definitions from modsByBucket;
- Artifact perk definitions;
- Exotic intrinsic plug definitions;
- supporting bucket, damage type, stat, item category, socket type and class
  definitions referenced by those records.

It deliberately does NOT invent:
- gameplay effects;
- synergy;
- rankings/scores;
- recommendations;
- exact weapon instance rolls that are not present in the sanitised DIM fixture.

Requires:
    BUNGIE_API_KEY environment variable

Writes:
    astrix-app/data/paradox-forge/beta/beta-bungie-manifest-cache.json
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
OUTPUT_PATH = BETA / "beta-bungie-manifest-cache.json"

API_ROOT = "https://www.bungie.net/Platform"
BUNGIE_ROOT = "https://www.bungie.net"

COMPONENTS = (
    "DestinyInventoryItemDefinition",
    "DestinyArtifactDefinition",
    "DestinyInventoryBucketDefinition",
    "DestinyDamageTypeDefinition",
    "DestinyStatDefinition",
    "DestinyItemCategoryDefinition",
    "DestinySocketTypeDefinition",
    "DestinyClassDefinition",
)


def fetch_json(url: str, api_key: str | None = None) -> dict[str, Any]:
    headers = {
        "Accept": "application/json",
        "User-Agent": "ASTRIX-Paradox-Forge-Beta/1.0",
    }
    if api_key:
        headers["X-API-Key"] = api_key

    request = urllib.request.Request(url, headers=headers)

    with urllib.request.urlopen(request, timeout=240) as response:
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


def as_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return None


def add_hash(target: set[int], value: Any) -> None:
    resolved = as_int(value)
    if resolved is not None and resolved != 0:
        target.add(resolved)


def collect_fixture_hashes(fixtures: list[Any]) -> set[int]:
    wanted: set[int] = set()

    for fixture in fixtures:
        if not isinstance(fixture, dict):
            continue

        for value in fixture.get("allDestinyHashes", []):
            add_hash(wanted, value)

        raw = fixture.get("rawDim") or {}

        for collection in ("equipped", "unequipped"):
            for item in raw.get(collection, []) or []:
                if not isinstance(item, dict):
                    continue

                add_hash(wanted, item.get("hash"))

                overrides = item.get("socketOverrides") or {}
                if isinstance(overrides, dict):
                    for value in overrides.values():
                        add_hash(wanted, value)

        parameters = raw.get("parameters") or {}

        for value in parameters.get("mods", []) or []:
            add_hash(wanted, value)

        for value in parameters.get("perks", []) or []:
            add_hash(wanted, value)

        mods_by_bucket = parameters.get("modsByBucket") or {}
        if isinstance(mods_by_bucket, dict):
            for values in mods_by_bucket.values():
                for value in values or []:
                    add_hash(wanted, value)

        artifact = parameters.get("artifactUnlocks") or {}
        for value in artifact.get("unlockedItemHashes", []) or []:
            add_hash(wanted, value)

    return wanted


def display_summary(definition: dict[str, Any]) -> dict[str, Any]:
    display = definition.get("displayProperties") or {}

    return {
        "name": str(display.get("name") or ""),
        "description": str(display.get("description") or ""),
        "icon": str(display.get("icon") or ""),
        "hasIcon": bool(display.get("hasIcon")),
    }


def compact_inventory_item(
    item_hash: int,
    definition: dict[str, Any],
) -> dict[str, Any]:
    equipping = definition.get("equippingBlock") or {}
    sockets = definition.get("sockets") or {}

    intrinsic_plugs: list[int] = []
    for row in sockets.get("intrinsicSockets") or []:
        if not isinstance(row, dict):
            continue
        plug = as_int(row.get("plugItemHash"))
        if plug:
            intrinsic_plugs.append(plug)

    socket_entries: list[dict[str, Any]] = []
    for index, row in enumerate(sockets.get("socketEntries") or []):
        if not isinstance(row, dict):
            continue

        entry: dict[str, Any] = {
            "index": index,
            "socketTypeHash": row.get("socketTypeHash"),
            "singleInitialItemHash": row.get("singleInitialItemHash"),
            "reusablePlugSetHash": row.get("reusablePlugSetHash"),
            "randomizedPlugSetHash": row.get("randomizedPlugSetHash"),
            "defaultVisible": row.get("defaultVisible"),
            "hidePerksInItemTooltip": row.get("hidePerksInItemTooltip"),
        }

        reusable = []
        for plug_row in row.get("reusablePlugItems") or []:
            if isinstance(plug_row, dict):
                plug = as_int(plug_row.get("plugItemHash"))
                if plug:
                    reusable.append(plug)

        if reusable:
            entry["reusablePlugItemHashes"] = reusable

        socket_entries.append(entry)

    stats = definition.get("stats") or {}
    stat_rows = stats.get("stats") or {}

    return {
        "bungieHash": item_hash,
        "display": display_summary(definition),
        "iconWatermark": str(definition.get("iconWatermark") or ""),
        "itemType": definition.get("itemType"),
        "itemSubType": definition.get("itemSubType"),
        "itemTypeDisplayName": str(definition.get("itemTypeDisplayName") or ""),
        "classType": definition.get("classType"),
        "itemCategoryHashes": definition.get("itemCategoryHashes") or [],
        "traitIds": definition.get("traitIds") or [],
        "defaultDamageTypeHash": definition.get("defaultDamageTypeHash"),
        "equippingBlock": {
            "equipmentSlotTypeHash": equipping.get("equipmentSlotTypeHash"),
            "ammoType": equipping.get("ammoType"),
            "uniqueLabel": equipping.get("uniqueLabel"),
            "uniqueLabelHash": equipping.get("uniqueLabelHash"),
        },
        "intrinsicPlugHashes": intrinsic_plugs,
        "socketEntries": socket_entries,
        "statHashes": [
            as_int(key)
            for key in stat_rows.keys()
            if as_int(key) is not None
        ],
        "source": "bungie-current-manifest",
    }


def compact_support_definition(
    definition_hash: int,
    definition: dict[str, Any],
) -> dict[str, Any]:
    return {
        "hash": definition_hash,
        "display": display_summary(definition),
        "source": "bungie-current-manifest",
    }


def main() -> int:
    api_key = os.environ.get("BUNGIE_API_KEY")

    if api_key == "YOUR_BUNGIE_API_KEY":
        api_key = None

    fixtures_payload = load_json(FIXTURES_PATH)
    fixtures = fixtures_payload.get("fixtures")

    if not isinstance(fixtures, list):
        raise SystemExit("Fixture file must contain a fixtures array.")

    print("Fetching Bungie manifest metadata...")

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

    raw_components: dict[str, dict[str, Any]] = {}

    for component in COMPONENTS:
        path = paths.get(component)

        if not path:
            print(f"Skipping unavailable component: {component}")
            raw_components[component] = {}
            continue

        print(f"Downloading {component}...")
        raw_components[component] = fetch_json(absolute(path))

    inventory = raw_components["DestinyInventoryItemDefinition"]

    wanted_inventory = collect_fixture_hashes(fixtures)

    # Add intrinsic plugs from equipped armour/items.
    equipped_hashes: set[int] = set()
    for fixture in fixtures:
        if not isinstance(fixture, dict):
            continue

        for item in (fixture.get("rawDim") or {}).get("equipped", []) or []:
            if isinstance(item, dict):
                add_hash(equipped_hashes, item.get("hash"))

    intrinsic_hashes: set[int] = set()

    for item_hash in equipped_hashes:
        definition = inventory.get(str(item_hash))
        if not isinstance(definition, dict):
            continue

        sockets = definition.get("sockets") or {}

        for row in sockets.get("intrinsicSockets") or []:
            if isinstance(row, dict):
                add_hash(intrinsic_hashes, row.get("plugItemHash"))

    wanted_inventory |= intrinsic_hashes

    items: dict[str, Any] = {}
    unresolved_inventory: list[int] = []

    bucket_hashes: set[int] = set()
    damage_hashes: set[int] = set()
    stat_hashes: set[int] = set()
    category_hashes: set[int] = set()
    socket_type_hashes: set[int] = set()
    class_hashes: set[int] = set()

    for item_hash in sorted(wanted_inventory):
        definition = inventory.get(str(item_hash))

        if not isinstance(definition, dict):
            unresolved_inventory.append(item_hash)
            continue

        compact = compact_inventory_item(item_hash, definition)
        items[str(item_hash)] = compact

        add_hash(
            bucket_hashes,
            (definition.get("equippingBlock") or {}).get(
                "equipmentSlotTypeHash"
            ),
        )
        add_hash(damage_hashes, definition.get("defaultDamageTypeHash"))

        for value in definition.get("itemCategoryHashes") or []:
            add_hash(category_hashes, value)

        for value in compact["statHashes"]:
            add_hash(stat_hashes, value)

        for row in compact["socketEntries"]:
            add_hash(socket_type_hashes, row.get("socketTypeHash"))

    # Class definitions are tiny; keep all named class definitions for display.
    class_defs = raw_components["DestinyClassDefinition"]
    for key, definition in class_defs.items():
        if isinstance(definition, dict):
            display = definition.get("displayProperties") or {}
            if str(display.get("name") or "").strip():
                add_hash(class_hashes, key)

    support_specs = {
        "buckets": (
            raw_components["DestinyInventoryBucketDefinition"],
            bucket_hashes,
        ),
        "damageTypes": (
            raw_components["DestinyDamageTypeDefinition"],
            damage_hashes,
        ),
        "stats": (
            raw_components["DestinyStatDefinition"],
            stat_hashes,
        ),
        "itemCategories": (
            raw_components["DestinyItemCategoryDefinition"],
            category_hashes,
        ),
        "socketTypes": (
            raw_components["DestinySocketTypeDefinition"],
            socket_type_hashes,
        ),
        "classes": (
            raw_components["DestinyClassDefinition"],
            class_hashes,
        ),
    }

    support: dict[str, dict[str, Any]] = {}

    for name, (definitions, hashes) in support_specs.items():
        rows: dict[str, Any] = {}

        for definition_hash in sorted(hashes):
            definition = definitions.get(str(definition_hash))
            if isinstance(definition, dict):
                rows[str(definition_hash)] = compact_support_definition(
                    definition_hash,
                    definition,
                )

        support[name] = rows

    artifacts: dict[str, Any] = {}
    artifact_defs = raw_components["DestinyArtifactDefinition"]

    for key, definition in artifact_defs.items():
        if not isinstance(definition, dict):
            continue

        artifact_hash = as_int(key)
        if artifact_hash is None:
            continue

        tiers = []
        used = False

        for tier_index, tier in enumerate(definition.get("tiers") or [], start=1):
            item_hashes = []

            for row in tier.get("items") or []:
                if not isinstance(row, dict):
                    continue

                item_hash = as_int(row.get("itemHash"))

                if item_hash is not None:
                    item_hashes.append(item_hash)

                    if item_hash in wanted_inventory:
                        used = True

            tiers.append({
                "tier": tier_index,
                "itemHashes": item_hashes,
            })

        if used:
            artifacts[str(artifact_hash)] = {
                "bungieHash": artifact_hash,
                "display": display_summary(definition),
                "tiers": tiers,
                "source": "bungie-current-manifest",
            }

    output = {
        "schemaVersion": "1.0.0",
        "purpose": (
            "Beta-only official Bungie manifest cache for Paradox Forge "
            "reference fixtures. No Forge authored gameplay inference."
        ),
        "manifestVersion": manifest_version,
        "fixtureCount": len(fixtures),
        "inventoryHashCount": len(wanted_inventory),
        "intrinsicHashCount": len(intrinsic_hashes),
        "resolvedInventoryCount": len(items),
        "unresolvedInventoryCount": len(unresolved_inventory),
        "inventoryItems": items,
        "artifacts": artifacts,
        "support": support,
        "unresolvedInventoryHashes": unresolved_inventory,
    }

    OUTPUT_PATH.write_text(
        json.dumps(output, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    print()
    print(f"Wrote: {OUTPUT_PATH}")
    print(f"Manifest version: {manifest_version}")
    print(f"Beta fixtures: {len(fixtures)}")
    print(f"Inventory identities: {len(items)}")
    print(f"Exotic intrinsic identities included: {len(intrinsic_hashes)}")
    print(f"Unresolved inventory hashes: {len(unresolved_inventory)}")
    print(f"Referenced buckets: {len(support['buckets'])}")
    print(f"Referenced damage types: {len(support['damageTypes'])}")
    print(f"Referenced stats: {len(support['stats'])}")
    print(f"Referenced item categories: {len(support['itemCategories'])}")
    print(f"Referenced socket types: {len(support['socketTypes'])}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
