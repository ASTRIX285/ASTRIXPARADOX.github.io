#!/usr/bin/env python3
"""Extract a small served catalogue from a full generated Forge catalogue.

The full Bungie Manifest-expanded catalogue is an ephemeral CI intermediate.
Only records containing existing Forge curated information, or records already
marked as verified by the existing importer, are written to the committed
served catalogue.

This tool does not:

* infer gameplay effects;
* infer synergy;
* create relationships;
* perform name matching;
* perform fuzzy matching;
* rank items;
* modify curated information.

Ranking-field validation is deliberately restricted to Forge authored content.
Bungie's official manifest structures may legitimately contain fields such as
"tier", including artifact tier and column information.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


FORBIDDEN_FORGE_RANKING_FIELDS = {
    "rank",
    "ranking",
    "tier",
    "tierScore",
    "score",
    "position",
}

RECORD_COLLECTION_KEYS = {
    "weapons",
    "armor",
    "armour",
    "items",
    "components",
    "artifacts",
}

FORGE_TOP_LEVEL_METADATA_KEYS = {
    "schemaVersion",
    "generatedAt",
    "manifestVersion",
    "purpose",
    "scope",
}


class ExtractionFailure(RuntimeError):
    """Raised when a catalogue cannot be safely extracted."""


def load_json(path: Path) -> dict[str, Any]:
    """Load a JSON object from disk."""

    if not path.exists():
        raise ExtractionFailure(
            f"Missing input file: {path}"
        )

    try:
        value = json.loads(
            path.read_text(
                encoding="utf-8"
            )
        )
    except json.JSONDecodeError as error:
        raise ExtractionFailure(
            f"Invalid JSON in {path}: {error}"
        ) from error

    if not isinstance(value, dict):
        raise ExtractionFailure(
            f"Expected a JSON object in {path}"
        )

    return value


def write_json(
    path: Path,
    value: dict[str, Any],
) -> None:
    """Write deterministic, readable JSON."""

    path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    path.write_text(
        json.dumps(
            value,
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )


def find_forbidden_forge_fields(
    value: Any,
    path: str = "$",
) -> list[str]:
    """Find forbidden ranking keys inside Forge authored content only.

    Callers must pass only:

    * an ASTRIX curated object; or
    * explicitly identified ASTRIX top-level metadata.

    This function must never be called against an entire Bungie-derived record.
    """

    findings: list[str] = []

    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}"

            if (
                key
                in FORBIDDEN_FORGE_RANKING_FIELDS
            ):
                findings.append(
                    child_path
                )

            findings.extend(
                find_forbidden_forge_fields(
                    child,
                    child_path,
                )
            )

    elif isinstance(value, list):
        for index, child in enumerate(
            value
        ):
            findings.extend(
                find_forbidden_forge_fields(
                    child,
                    f"{path}[{index}]",
                )
            )

    return findings


def validate_top_level_forge_metadata(
    payload: dict[str, Any],
) -> list[str]:
    """Validate only Forge owned top-level metadata.

    Collection arrays and unknown Bungie-derived metadata are not recursively
    scanned. A forbidden field directly at the top level is still rejected.
    """

    findings: list[str] = []

    for key, value in payload.items():
        if key in RECORD_COLLECTION_KEYS:
            continue

        top_level_path = f"$.{key}"

        if (
            key
            in FORBIDDEN_FORGE_RANKING_FIELDS
        ):
            findings.append(
                top_level_path
            )

        if (
            key
            in FORGE_TOP_LEVEL_METADATA_KEYS
        ):
            findings.extend(
                find_forbidden_forge_fields(
                    value,
                    top_level_path,
                )
            )

    return findings


def validate_record_curated_content(
    records: list[Any],
    collection_name: str,
) -> list[str]:
    """Validate ranking fields only inside each record's curated object."""

    findings: list[str] = []

    for index, record in enumerate(
        records
    ):
        if not isinstance(record, dict):
            continue

        curated = record.get(
            "curated"
        )

        if curated is None:
            continue

        if not isinstance(curated, dict):
            raise ExtractionFailure(
                f"{collection_name}[{index}].curated "
                "must be an object or null."
            )

        findings.extend(
            find_forbidden_forge_fields(
                curated,
                (
                    f"$.{collection_name}"
                    f"[{index}].curated"
                ),
            )
        )

    return findings


def validate_forge_authored_content(
    payload: dict[str, Any],
) -> None:
    """Reject rankings introduced by Forge without scanning Bungie data."""

    findings = (
        validate_top_level_forge_metadata(
            payload
        )
    )

    for collection_name in (
        "weapons",
        "armor",
        "armour",
        "items",
        "components",
        "artifacts",
    ):
        records = payload.get(
            collection_name
        )

        if not isinstance(records, list):
            continue

        findings.extend(
            validate_record_curated_content(
                records,
                collection_name,
            )
        )

    if findings:
        raise ExtractionFailure(
            "Forbidden ranking fields were found "
            "inside Forge authored content:\n"
            + "\n".join(
                f"  - {path}"
                for path in findings
            )
        )


def has_meaningful_value(
    value: Any,
) -> bool:
    """Return whether an existing curated value contains meaningful content."""

    if value is None:
        return False

    if isinstance(value, bool):
        return value

    if isinstance(value, str):
        return bool(
            value.strip()
        )

    if isinstance(
        value,
        (int, float),
    ):
        return True

    if isinstance(value, list):
        return any(
            has_meaningful_value(item)
            for item in value
        )

    if isinstance(value, dict):
        return any(
            has_meaningful_value(child)
            for child in value.values()
        )

    return False


def is_curated_or_verified(
    record: dict[str, Any],
) -> bool:
    """Select only records already curated or explicitly verified."""

    if record.get("verified") is True:
        return True

    curated = record.get(
        "curated"
    )

    return (
        isinstance(curated, dict)
        and has_meaningful_value(
            curated
        )
    )


def copy_metadata(
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Copy catalogue metadata without copying full record collections."""

    result: dict[str, Any] = {}

    for key, value in payload.items():
        if key in RECORD_COLLECTION_KEYS:
            continue

        result[key] = value

    return result


def require_record_array(
    payload: dict[str, Any],
    key: str,
) -> list[Any]:
    """Return a required record array."""

    records = payload.get(key)

    if not isinstance(records, list):
        raise ExtractionFailure(
            "Generated catalogue must "
            f"contain a {key} array."
        )

    return records


def extract_selected_records(
    records: list[Any],
) -> list[dict[str, Any]]:
    """Retain existing curated or verified records without modification."""

    return [
        record
        for record in records
        if (
            isinstance(record, dict)
            and is_curated_or_verified(
                record
            )
        )
    ]


def extract_weapon_catalogue(
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Extract the committed weapon catalogue."""

    records = require_record_array(
        payload,
        "weapons",
    )

    result = copy_metadata(
        payload
    )

    result["weapons"] = (
        extract_selected_records(
            records
        )
    )

    return result


def extract_armor_catalogue(
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Extract the committed armour catalogue."""

    source_key = next(
        (
            key
            for key in (
                "armor",
                "armour",
                "items",
            )
            if isinstance(
                payload.get(key),
                list,
            )
        ),
        None,
    )

    if source_key is None:
        raise ExtractionFailure(
            "Generated armour catalogue must "
            "contain an armor, armour or items array."
        )

    records = require_record_array(
        payload,
        source_key,
    )

    result = copy_metadata(
        payload
    )

    # The served service and schema use the canonical US-spelling key.
    result["armor"] = (
        extract_selected_records(
            records
        )
    )

    return result


def extract_game_component_catalogue(
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Extract curated components and artifacts.

    Bungie-owned fields such as:

        component.artifact.tier
        component.artifact.column
        artifact.tiers[].tier

    are preserved when their containing record is selected. They are not
    interpreted as ASTRIX ranking fields.
    """

    component_records = (
        require_record_array(
            payload,
            "components",
        )
    )

    artifact_records = (
        require_record_array(
            payload,
            "artifacts",
        )
    )

    result = copy_metadata(
        payload
    )

    result["components"] = (
        extract_selected_records(
            component_records
        )
    )

    result["artifacts"] = (
        extract_selected_records(
            artifact_records
        )
    )

    return result


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""

    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--kind",
        required=True,
        choices=(
            "weapon",
            "armor",
            "game-component",
        ),
    )

    parser.add_argument(
        "--input",
        required=True,
        type=Path,
    )

    parser.add_argument(
        "--output",
        required=True,
        type=Path,
    )

    return parser.parse_args()


def main() -> int:
    """Run extraction."""

    args = parse_args()
    payload = load_json(
        args.input
    )

    validate_forge_authored_content(
        payload
    )

    if args.kind == "weapon":
        output = (
            extract_weapon_catalogue(
                payload
            )
        )

        counts = {
            "servedWeapons": len(
                output["weapons"]
            ),
        }

    elif args.kind == "armor":
        output = (
            extract_armor_catalogue(
                payload
            )
        )

        counts = {
            "servedArmor": len(
                output["armor"]
            ),
        }

    else:
        output = (
            extract_game_component_catalogue(
                payload
            )
        )

        counts = {
            "servedComponents": len(
                output["components"]
            ),
            "servedArtifacts": len(
                output["artifacts"]
            ),
        }

    write_json(
        args.output,
        output,
    )

    print(
        json.dumps(
            {
                "kind": args.kind,
                "input": str(
                    args.input
                ),
                "output": str(
                    args.output
                ),
                **counts,
                "outputBytes": (
                    args.output.stat().st_size
                ),
            },
            indent=2,
        )
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(
        main()
    )
