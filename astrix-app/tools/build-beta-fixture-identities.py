#!/usr/bin/env python3
"""Build the Paradox Forge beta identity cache.

Reads the enriched beta fixtures and resolves only identity fields against
existing Forge manifest-derived catalogues.

This tool does not infer effects, synergy, rankings, recommendations, or
verification state.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "astrix-app" / "data"
BETA_DIR = DATA / "paradox-forge" / "beta"

FIXTURES = BETA_DIR / "ASTRIX_Paradox_Forge_Beta_Fixtures_v1.json"
OUTPUT = BETA_DIR / "beta-component-identities.json"

SOURCES = (
    {
        "name": "game-components",
        "path": DATA / "game-components.json",
        "collections": ("components", "artifacts"),
        "kind": "gameComponent",
    },
    {
        "name": "weapons",
        "path": DATA / "weapon-information.json",
        "collections": ("weapons", "items"),
        "kind": "weapon",
    },
    {
        "name": "armor",
        "path": DATA / "armor-information.json",
        "collections": ("armor", "armour", "items"),
        "kind": "armor",
    },
)

IDENTITY_FIELDS = (
    "id",
    "bungieHash",
    "hash",
    "name",
    "displayName",
    "description",
    "officialDescription",
    "icon",
    "watermark",
    "componentType",
    "itemType",
    "itemSubType",
    "itemTypeDisplayName",
    "class",
    "classType",
    "subclass",
    "slot",
    "bucket",
    "bucketHash",
    "damageType",
    "damageTypeHash",
    "ammoType",
    "tierType",
    "tierTypeName",
    "isExotic",
)


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(f"Missing required file: {path}")

    value = json.loads(path.read_text(encoding="utf-8"))

    if not isinstance(value, dict):
        raise SystemExit(f"Expected JSON object: {path}")

    return value


def record_hash(row: dict[str, Any]) -> int | None:
    value = row.get("bungieHash", row.get("hash"))

    if isinstance(value, int):
        return value

    if isinstance(value, str) and value.isdigit():
        return int(value)

    return None


def identity_from(
    row: dict[str, Any],
    source_name: str,
    source_kind: str,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "source": source_name,
        "sourceKind": source_kind,
        "identitySource": "bungie-manifest-derived",
    }

    for field in IDENTITY_FIELDS:
        if field not in row:
            continue

        value = row[field]

        if value is None:
            continue

        result[field] = value

    h = record_hash(row)
    if h is not None:
        result["bungieHash"] = h
        result.pop("hash", None)

    # Preserve selected official Bungie identity metadata, but never curated
    # ASTRIX reasoning content.
    official = row.get("official")
    if isinstance(official, dict):
        allowed_official = {}

        for field in (
            "itemType",
            "itemSubType",
            "itemTypeDisplayName",
            "itemCategoryHashes",
            "traitIds",
        ):
            if field in official and official[field] is not None:
                allowed_official[field] = official[field]

        if allowed_official:
            result["official"] = allowed_official

    artifact = row.get("artifact")
    if isinstance(artifact, dict):
        allowed_artifact = {}

        for field in ("artifactHash", "tier", "column"):
            if field in artifact and artifact[field] is not None:
                allowed_artifact[field] = artifact[field]

        if allowed_artifact:
            result["artifact"] = allowed_artifact

    return result


def main() -> int:
    fixtures_payload = load_json(FIXTURES)
    fixtures = fixtures_payload.get("fixtures")

    if not isinstance(fixtures, list):
        raise SystemExit("Fixture file must contain a fixtures array.")

    wanted: set[int] = set()

    for fixture in fixtures:
        if not isinstance(fixture, dict):
            continue

        for value in fixture.get("allDestinyHashes", []):
            if isinstance(value, int):
                wanted.add(value)

    matches: dict[int, list[dict[str, Any]]] = {}
    source_counts: dict[str, int] = {}

    for config in SOURCES:
        payload = load_json(config["path"])
        found_in_source: set[int] = set()

        for collection in config["collections"]:
            rows = payload.get(collection, [])

            if not isinstance(rows, list):
                continue

            for row in rows:
                if not isinstance(row, dict):
                    continue

                h = record_hash(row)

                if h is None or h not in wanted:
                    continue

                matches.setdefault(h, []).append(
                    identity_from(
                        row,
                        config["name"],
                        config["kind"],
                    )
                )
                found_in_source.add(h)

        source_counts[config["name"]] = len(found_in_source)

    resolved: list[dict[str, Any]] = []
    collisions: list[dict[str, Any]] = []

    for h in sorted(matches):
        candidates = matches[h]

        # Prefer specialised identity catalogues over the generic
        # game-component catalogue when the same Bungie hash occurs
        # in more than one manifest-derived ASTRIX source.
        precedence = {
            "weapons": 0,
            "armor": 1,
            "game-components": 2,
        }

        selected = min(
            candidates,
            key=lambda candidate: precedence.get(
                candidate["source"],
                99,
            ),
        )

        resolved.append(selected)

        if len(candidates) > 1:
            collisions.append(
                {
                    "bungieHash": h,
                    "sources": [
                        candidate["source"]
                        for candidate in candidates
                    ],
                }
            )

    resolved_hashes = set(matches)
    unresolved = sorted(wanted - resolved_hashes)

    output = {
        "schemaVersion": "1.0.0",
        "purpose": (
            "Beta-only Bungie identity cache for Paradox Forge reference "
            "fixtures. Contains manifest-derived identity metadata only; "
            "ASTRIX curated reasoning is intentionally excluded."
        ),
        "fixtureSource": FIXTURES.name,
        "totalFixtureHashes": len(wanted),
        "resolvedCount": len(resolved_hashes),
        "unresolvedCount": len(unresolved),
        "sourceMatchCounts": source_counts,
        "collisionCount": len(collisions),
        "collisions": collisions,
        "identities": resolved,
        "unresolvedHashes": unresolved,
    }

    OUTPUT.write_text(
        json.dumps(output, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    print(f"Wrote: {OUTPUT}")
    print(f"Total fixture hashes: {len(wanted)}")
    print(f"Resolved: {len(resolved_hashes)}")
    print(f"Unresolved: {len(unresolved)}")

    for source, count in source_counts.items():
        print(f"{source}: {count}")

    print(f"Cross-source collisions: {len(collisions)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
