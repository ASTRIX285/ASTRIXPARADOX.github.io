#!/usr/bin/env python3
"""Generate the Paradox Forge weapon-information catalogue.

Official weapon identity comes from Bungie's Destiny manifest.

Curated information comes from:

    astrix-app/data/weapon-information.curated.json

Generated output:

    astrix-app/data/weapon-information.json

Design rules:

* Stable weapon IDs use the Bungie item hash.
* Official Bungie data and curated Forge data remain separate.
* Rankings, tiers and leaderboard fields are forbidden.
* Curated records match by Bungie hash first.
* Name matching is allowed only when exactly one manifest record matches.
* Ambiguous or unresolved records are reported, never guessed.
* The generated file changes only when its meaningful content changes.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]

CURATED_PATH = (
    ROOT
    / "astrix-app"
    / "data"
    / "weapon-information.curated.json"
)

OUTPUT_PATH = (
    ROOT
    / "astrix-app"
    / "data"
    / "weapon-information.json"
)

API_ROOT = "https://www.bungie.net/Platform"
BUNGIE_ROOT = "https://www.bungie.net"

DESTINY_ITEM_TYPE_WEAPON = 3

AMMO_TYPES = {
    1: "Primary",
    2: "Special",
    3: "Power",
}

FORBIDDEN_FIELDS = {
    "rank",
    "ranking",
    "tier",
    "score",
    "position",
}

CONFIGURATION_FIELDS = {
    "barrel",
    "magazine",
    "battery",
    "blade",
    "guard",
    "masterwork",
    "perk1",
    "perk2",
    "originTrait",
}


class ImportFailure(RuntimeError):
    """Raised when weapon import cannot continue safely."""


def utc_now() -> str:
    """Return an ISO-8601 UTC timestamp."""

    return dt.datetime.now(
        dt.timezone.utc
    ).isoformat()


def canonical_json(value: Any) -> str:
    """Produce deterministic JSON used for hashing and comparisons."""

    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def digest_json(value: Any) -> str:
    """Return a SHA-256 digest of deterministic JSON content."""

    encoded = canonical_json(value).encode("utf-8")

    return hashlib.sha256(encoded).hexdigest()


def normalize_name(value: str) -> str:
    """Normalise weapon names for conservative exact matching."""

    return " ".join(
        str(value)
        .strip()
        .lower()
        .replace("’", "'")
        .split()
    )


def absolute_bungie_url(path: str) -> str:
    """Convert a Bungie content path into an absolute URL."""

    if path.startswith("http://") or path.startswith("https://"):
        return path

    return f"{BUNGIE_ROOT}{path}"


def api_get_json(
    url: str,
    api_key: str | None = None,
) -> dict[str, Any]:
    """Fetch and decode a Bungie JSON resource."""

    headers = {
        "Accept": "application/json",
        "User-Agent": "ASTRIX-Paradox-Forge/2.0",
    }

    if api_key:
        headers["X-API-Key"] = api_key

    request = urllib.request.Request(
        url,
        headers=headers,
    )

    try:
        with urllib.request.urlopen(
            request,
            timeout=180,
        ) as response:
            raw = response.read()
    except urllib.error.HTTPError as error:
        body = error.read().decode(
            "utf-8",
            errors="replace",
        )

        raise ImportFailure(
            f"Bungie request failed with HTTP "
            f"{error.code}: {url}\n{body[:500]}"
        ) from error
    except urllib.error.URLError as error:
        raise ImportFailure(
            f"Unable to reach Bungie: {url}: "
            f"{error.reason}"
        ) from error

    try:
        decoded = json.loads(
            raw.decode("utf-8")
        )
    except (
        UnicodeDecodeError,
        json.JSONDecodeError,
    ) as error:
        raise ImportFailure(
            f"Bungie returned invalid JSON: {url}"
        ) from error

    if not isinstance(decoded, dict):
        raise ImportFailure(
            f"Expected a JSON object from Bungie: {url}"
        )

    error_code = decoded.get("ErrorCode")

    if (
        error_code is not None
        and error_code != 1
    ):
        message = (
            decoded.get("Message")
            or decoded.get("ErrorStatus")
            or "Unknown Bungie API error"
        )

        raise ImportFailure(
            f"Bungie API error {error_code}: {message}"
        )

    return decoded


def find_forbidden_fields(
    value: Any,
    path: str = "$",
) -> list[str]:
    """Find ranking-related keys recursively."""

    matches: list[str] = []

    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}"

            if key in FORBIDDEN_FIELDS:
                matches.append(child_path)

            matches.extend(
                find_forbidden_fields(
                    child,
                    child_path,
                )
            )

    elif isinstance(value, list):
        for index, child in enumerate(value):
            matches.extend(
                find_forbidden_fields(
                    child,
                    f"{path}[{index}]",
                )
            )

    return matches


def load_curated_payload() -> dict[str, Any]:
    """Load and validate the curated source file."""

    if not CURATED_PATH.exists():
        raise ImportFailure(
            f"Missing curated input file: "
            f"{CURATED_PATH}"
        )

    try:
        payload = json.loads(
            CURATED_PATH.read_text(
                encoding="utf-8"
            )
        )
    except json.JSONDecodeError as error:
        raise ImportFailure(
            f"Invalid JSON in {CURATED_PATH}: "
            f"{error}"
        ) from error

    if not isinstance(payload, dict):
        raise ImportFailure(
            "Curated weapon file must be an object."
        )

    weapons = payload.get("weapons")

    if not isinstance(weapons, list):
        raise ImportFailure(
            "Curated weapon file must contain "
            "a weapons array."
        )

    forbidden = find_forbidden_fields(payload)

    if forbidden:
        raise ImportFailure(
            "Ranking fields are forbidden in curated "
            "weapon information:\n"
            + "\n".join(
                f"  - {path}"
                for path in forbidden
            )
        )

    for index, row in enumerate(weapons):
        if not isinstance(row, dict):
            raise ImportFailure(
                f"Curated weapons[{index}] "
                "must be an object."
            )

        name = row.get("name")
        bungie_hash = row.get("bungieHash")

        if not name and not bungie_hash:
            raise ImportFailure(
                f"Curated weapons[{index}] requires "
                "name or bungieHash."
            )

        if (
            bungie_hash is not None
            and (
                isinstance(bungie_hash, bool)
                or not isinstance(
                    bungie_hash,
                    (int, str),
                )
            )
        ):
            raise ImportFailure(
                f"Curated weapons[{index}].bungieHash "
                "must be an integer, string or null."
            )

        configuration = row.get(
            "recommendedConfiguration",
            {},
        )

        if not isinstance(configuration, dict):
            raise ImportFailure(
                f"Curated weapons[{index}]"
                ".recommendedConfiguration "
                "must be an object."
            )

        unknown_configuration = (
            set(configuration)
            - CONFIGURATION_FIELDS
        )

        if unknown_configuration:
            raise ImportFailure(
                f"Curated weapons[{index}] has "
                "unknown recommended-configuration "
                f"fields: "
                f"{sorted(unknown_configuration)}"
            )

    return payload


def get_component_paths(
    manifest: dict[str, Any],
) -> tuple[str, dict[str, str]]:
    """Return manifest version and English component paths."""

    response = manifest.get("Response")

    if not isinstance(response, dict):
        raise ImportFailure(
            "Bungie manifest response is missing."
        )

    version = str(
        response.get("version") or "unknown"
    )

    paths = (
        response
        .get(
            "jsonWorldComponentContentPaths",
            {},
        )
        .get("en", {})
    )

    if not isinstance(paths, dict):
        paths = {}

    inventory_path = paths.get(
        "DestinyInventoryItemDefinition"
    )

    damage_path = paths.get(
        "DestinyDamageTypeDefinition"
    )

    resolved: dict[str, str] = {}

    if inventory_path:
        resolved[
            "DestinyInventoryItemDefinition"
        ] = inventory_path

    if damage_path:
        resolved[
            "DestinyDamageTypeDefinition"
        ] = damage_path

    if resolved.get(
        "DestinyInventoryItemDefinition"
    ):
        return version, resolved

    aggregate_path = (
        response
        .get(
            "jsonWorldContentPaths",
            {},
        )
        .get("en")
    )

    if aggregate_path:
        resolved["aggregate"] = aggregate_path

        return version, resolved

    raise ImportFailure(
        "Bungie manifest did not provide an "
        "English inventory definition path."
    )


def load_manifest_definitions(
    paths: dict[str, str],
) -> tuple[
    dict[str, Any],
    dict[str, Any],
]:
    """Load inventory and damage-type definitions."""

    if "aggregate" in paths:
        aggregate = api_get_json(
            absolute_bungie_url(
                paths["aggregate"]
            )
        )

        inventory = aggregate.get(
            "DestinyInventoryItemDefinition",
            {},
        )

        damage_types = aggregate.get(
            "DestinyDamageTypeDefinition",
            {},
        )

    else:
        inventory = api_get_json(
            absolute_bungie_url(
                paths[
                    "DestinyInventoryItemDefinition"
                ]
            )
        )

        damage_types: dict[str, Any] = {}

        damage_path = paths.get(
            "DestinyDamageTypeDefinition"
        )

        if damage_path:
            damage_types = api_get_json(
                absolute_bungie_url(
                    damage_path
                )
            )

    if not isinstance(inventory, dict):
        raise ImportFailure(
            "DestinyInventoryItemDefinition "
            "was not a JSON object."
        )

    if not isinstance(damage_types, dict):
        damage_types = {}

    return inventory, damage_types


def damage_type_name(
    damage_type_hash: Any,
    damage_types: dict[str, Any],
) -> str | None:
    """Resolve a damage-type hash to its display name."""

    if damage_type_hash is None:
        return None

    definition = damage_types.get(
        str(damage_type_hash)
    )

    if not isinstance(definition, dict):
        return None

    display = definition.get(
        "displayProperties"
    )

    if not isinstance(display, dict):
        return None

    name = display.get("name")

    return (
        str(name).strip()
        if name
        else None
    )


def official_weapon_record(
    hash_text: str,
    item: dict[str, Any],
    damage_types: dict[str, Any],
) -> dict[str, Any]:
    """Convert a manifest weapon into the generated schema."""

    display = item.get(
        "displayProperties"
    )

    if not isinstance(display, dict):
        display = {}

    equipping = item.get(
        "equippingBlock"
    )

    if not isinstance(equipping, dict):
        equipping = {}

    bungie_hash = int(hash_text)

    ammo_type = AMMO_TYPES.get(
        equipping.get("ammoType"),
        "Unknown",
    )

    damage_hash = item.get(
        "defaultDamageTypeHash"
    )

    return {
        "id": f"weapon-{bungie_hash}",
        "bungieHash": bungie_hash,
        "name": str(
            display.get("name") or ""
        ),
        "icon": str(
            display.get("icon") or ""
        ),
        "watermark": str(
            item.get("iconWatermark") or ""
        ),
        "weaponType": str(
            item.get(
                "itemTypeDisplayName"
            )
            or ""
        ),
        "frame": None,
        "element": damage_type_name(
            damage_hash,
            damage_types,
        ),
        "ammoType": ammo_type,
        "season": None,
        "source": None,
        "officialDescription": str(
            display.get("description") or ""
        ),
        "official": {
            "itemType": item.get(
                "itemType",
                -1,
            ),
            "itemSubType": item.get(
                "itemSubType",
                -1,
            ),
            "itemCategoryHashes": item.get(
                "itemCategoryHashes",
                [],
            ),
            "defaultDamageTypeHash": (
                damage_hash
            ),
            "equippingBlock": (
                item.get("equippingBlock")
            ),
            "sockets": item.get("sockets"),
        },
        "curated": {
            "recommendedConfiguration": {},
            "usageNotes": "",
            "loopContribution": [],
            "stunValue": None,
            "ammoValue": None,
            "shieldValue": None,
            "chargeValue": None,
            "impactValue": None,
            "sources": [],
        },
        "verified": False,
    }


def clean_string_array(
    value: Any,
    field_name: str,
) -> list[str]:
    """Validate and normalise a list of strings."""

    if value is None:
        return []

    if not isinstance(value, list):
        raise ImportFailure(
            f"{field_name} must be an array."
        )

    cleaned: list[str] = []
    seen: set[str] = set()

    for item in value:
        if not isinstance(item, str):
            raise ImportFailure(
                f"{field_name} must contain "
                "strings only."
            )

        text = item.strip()

        if not text or text in seen:
            continue

        seen.add(text)
        cleaned.append(text)

    return cleaned


def curated_configuration(
    row: dict[str, Any],
) -> dict[str, list[str]]:
    """Validate the curated recommended configuration."""

    raw = row.get(
        "recommendedConfiguration",
        {},
    )

    result: dict[str, list[str]] = {}

    for key in CONFIGURATION_FIELDS:
        if key not in raw:
            continue

        values = clean_string_array(
            raw[key],
            (
                "recommendedConfiguration."
                f"{key}"
            ),
        )

        if values:
            result[key] = values

    return result


def curated_sources(
    value: Any,
) -> list[dict[str, str]]:
    """Validate curated source references."""

    if value is None:
        return []

    if not isinstance(value, list):
        raise ImportFailure(
            "sources must be an array."
        )

    result: list[dict[str, str]] = []

    for index, source in enumerate(value):
        if not isinstance(source, dict):
            raise ImportFailure(
                f"sources[{index}] must "
                "be an object."
            )

        title = str(
            source.get("title") or ""
        ).strip()

        publisher = str(
            source.get("publisher") or ""
        ).strip()

        date = str(
            source.get("date") or ""
        ).strip()

        if not title or not publisher or not date:
            raise ImportFailure(
                f"sources[{index}] requires "
                "title, publisher and date."
            )

        output = {
            "title": title,
            "publisher": publisher,
            "date": date,
        }

        url = str(
            source.get("url") or ""
        ).strip()

        if url:
            output["url"] = url

        result.append(output)

    return result


def optional_number(
    row: dict[str, Any],
    key: str,
) -> int | float | None:
    """Validate an optional numerical curated value."""

    value = row.get(key)

    if value is None or value == "":
        return None

    if (
        isinstance(value, bool)
        or not isinstance(
            value,
            (int, float),
        )
    ):
        raise ImportFailure(
            f"{key} must be a number or null."
        )

    return value


def build_curated_block(
    row: dict[str, Any],
) -> dict[str, Any]:
    """Convert a curated row into its generated block."""

    return {
        "recommendedConfiguration": (
            curated_configuration(row)
        ),
        "usageNotes": str(
            row.get("usageNotes") or ""
        ).strip(),
        "loopContribution": clean_string_array(
            row.get(
                "loopContribution",
                [],
            ),
            "loopContribution",
        ),
        "stunValue": optional_number(
            row,
            "stunValue",
        ),
        "ammoValue": optional_number(
            row,
            "ammoValue",
        ),
        "shieldValue": optional_number(
            row,
            "shieldValue",
        ),
        "chargeValue": optional_number(
            row,
            "chargeValue",
        ),
        "impactValue": optional_number(
            row,
            "impactValue",
        ),
        "sources": curated_sources(
            row.get("sources", [])
        ),
    }


def merge_curated_information(
    record: dict[str, Any],
    row: dict[str, Any],
) -> None:
    """Attach curated data to an official weapon record."""

    if row.get("frame") is not None:
        record["frame"] = str(
            row["frame"]
        ).strip() or None

    if row.get("element") is not None:
        record["element"] = str(
            row["element"]
        ).strip() or None

    if row.get("season") is not None:
        season = row["season"]

        if (
            isinstance(season, bool)
            or not isinstance(season, int)
            or season < 1
        ):
            raise ImportFailure(
                f"Invalid season for "
                f"{row.get('name')!r}."
            )

        record["season"] = season

    if row.get("source") is not None:
        record["source"] = str(
            row["source"]
        ).strip() or None

    record["curated"] = (
        build_curated_block(row)
    )

    record["verified"] = (
        row.get("verified") is True
    )


def existing_output() -> dict[str, Any] | None:
    """Load the previous generated catalogue when valid JSON."""

    if not OUTPUT_PATH.exists():
        return None

    try:
        value = json.loads(
            OUTPUT_PATH.read_text(
                encoding="utf-8"
            )
        )
    except json.JSONDecodeError:
        return None

    return value if isinstance(value, dict) else None


def meaningful_payload(
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Remove volatile metadata before comparison."""

    return {
        "schemaVersion": payload.get(
            "schemaVersion"
        ),
        "manifestVersion": payload.get(
            "manifestVersion"
        ),
        "curatedDigest": payload.get(
            "curatedDigest"
        ),
        "weapons": payload.get(
            "weapons",
            [],
        ),
    }


def write_github_outputs(
    values: dict[str, Any],
) -> None:
    """Write outputs for GitHub Actions."""

    output_path = os.environ.get(
        "GITHUB_OUTPUT"
    )

    if not output_path:
        return

    with open(
        output_path,
        "a",
        encoding="utf-8",
    ) as output:
        for key, value in values.items():
            if isinstance(value, bool):
                rendered = (
                    "true" if value else "false"
                )
            else:
                rendered = str(value)

            output.write(
                f"{key}={rendered}\n"
            )


def main() -> int:
    """Run the weapon import."""

    api_key = os.environ.get(
        "BUNGIE_API_KEY"
    )

    if not api_key:
        raise ImportFailure(
            "BUNGIE_API_KEY is required."
        )

    curated_payload = (
        load_curated_payload()
    )

    curated_rows = curated_payload[
        "weapons"
    ]

    curated_digest = digest_json(
        curated_rows
    )

    manifest = api_get_json(
        f"{API_ROOT}/Destiny2/Manifest/",
        api_key,
    )

    manifest_version, paths = (
        get_component_paths(manifest)
    )

    inventory, damage_types = (
        load_manifest_definitions(paths)
    )

    records: list[dict[str, Any]] = []

    by_hash: dict[
        int,
        dict[str, Any],
    ] = {}

    by_name: dict[
        str,
        list[dict[str, Any]],
    ] = {}

    for hash_text, item in inventory.items():
        if not isinstance(item, dict):
            continue

        if (
            item.get("itemType")
            != DESTINY_ITEM_TYPE_WEAPON
        ):
            continue

        display = item.get(
            "displayProperties"
        )

        if not isinstance(display, dict):
            continue

        name = str(
            display.get("name") or ""
        ).strip()

        if not name:
            continue

        try:
            record = official_weapon_record(
                hash_text,
                item,
                damage_types,
            )
        except (TypeError, ValueError):
            print(
                "Skipping invalid weapon hash: "
                f"{hash_text!r}",
                file=sys.stderr,
            )

            continue

        records.append(record)

        by_hash[
            record["bungieHash"]
        ] = record

        name_key = normalize_name(
            record["name"]
        )

        by_name.setdefault(
            name_key,
            [],
        ).append(record)

    unresolved: list[str] = []
    ambiguous: list[
        dict[str, Any]
    ] = []
    matched = 0

    for index, row in enumerate(
        curated_rows
    ):
        target: dict[str, Any] | None = None

        raw_hash = row.get("bungieHash")

        if (
            raw_hash is not None
            and raw_hash != ""
        ):
            try:
                target = by_hash.get(
                    int(raw_hash)
                )
            except (TypeError, ValueError):
                raise ImportFailure(
                    f"Curated weapons[{index}] has "
                    "an invalid bungieHash."
                )

        if target is None and row.get("name"):
            name_key = normalize_name(
                str(row["name"])
            )

            candidates = by_name.get(
                name_key,
                [],
            )

            if len(candidates) == 1:
                target = candidates[0]

            elif len(candidates) > 1:
                ambiguous.append(
                    {
                        "name": row["name"],
                        "candidateHashes": [
                            candidate[
                                "bungieHash"
                            ]
                            for candidate
                            in candidates
                        ],
                    }
                )

                continue

        if target is None:
            unresolved.append(
                str(
                    row.get("name")
                    or row.get("bungieHash")
                    or f"weapons[{index}]"
                )
            )

            continue

        merge_curated_information(
            target,
            row,
        )

        matched += 1

    records.sort(
        key=lambda record: (
            record["name"].lower(),
            record["bungieHash"],
        )
    )

    new_payload = {
        "schemaVersion": "2.0.0",
        "generatedAt": utc_now(),
        "manifestVersion": manifest_version,
        "curatedDigest": curated_digest,
        "weapons": records,
    }

    previous = existing_output()

    changed = (
        previous is None
        or meaningful_payload(previous)
        != meaningful_payload(new_payload)
    )

    if changed:
        OUTPUT_PATH.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        OUTPUT_PATH.write_text(
            json.dumps(
                new_payload,
                indent=2,
                ensure_ascii=False,
            )
            + "\n",
            encoding="utf-8",
        )

    elif previous is not None:
        # Preserve the existing generatedAt timestamp and
        # avoid rewriting the file when no meaningful data changed.
        new_payload["generatedAt"] = (
            previous.get("generatedAt")
            or new_payload["generatedAt"]
        )

    print(
        f"Manifest version: {manifest_version}"
    )

    print(
        f"Official weapon records: "
        f"{len(records)}"
    )

    print(
        f"Curated source rows: "
        f"{len(curated_rows)}"
    )

    print(
        f"Curated rows matched: {matched}"
    )

    print(
        f"Unresolved curated rows: "
        f"{len(unresolved)}"
    )

    print(
        f"Ambiguous curated rows: "
        f"{len(ambiguous)}"
    )

    print(
        f"Generated file changed: "
        f"{str(changed).lower()}"
    )

    if unresolved:
        print(
            "UNRESOLVED CURATED RECORDS:",
            file=sys.stderr,
        )

        for item in unresolved:
            print(
                f"  - {item}",
                file=sys.stderr,
            )

    if ambiguous:
        print(
            "AMBIGUOUS CURATED RECORDS:",
            file=sys.stderr,
        )

        for item in ambiguous:
            print(
                f"  - {item['name']}: "
                f"{item['candidateHashes']}",
                file=sys.stderr,
            )

    write_github_outputs(
        {
            "changed": changed,
            "manifest_version": (
                manifest_version
            ),
            "weapons": len(records),
            "curated": len(
                curated_rows
            ),
            "matched": matched,
            "unresolved": len(
                unresolved
            ),
            "ambiguous": len(
                ambiguous
            ),
        }
    )

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ImportFailure as error:
        print(
            f"ERROR: {error}",
            file=sys.stderr,
        )

        raise SystemExit(1)
