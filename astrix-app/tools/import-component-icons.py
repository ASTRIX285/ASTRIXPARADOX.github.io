#!/usr/bin/env python3
"""Generate a small Forge component icon map from Bungie's English manifest.

The Bungie API key is sent only to the manifest index endpoint. The public
English aggregate manifest is downloaded without authentication, processed in
a temporary directory, and never committed.
"""

from __future__ import annotations

import argparse
import datetime as dt
import gzip
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

BUNGIE_ROOT = "https://www.bungie.net"
MANIFEST_INDEX_URL = f"{BUNGIE_ROOT}/Platform/Destiny2/Manifest/"
ICON_PATH_PREFIX = "/common/destiny2_content/icons/"
USER_AGENT = "ASTRIX-Manifest-Icon-Importer/1.0"


def normalize_name(value: object) -> str:
    """Match aspect-linkage.mjs: trim, collapse whitespace, lowercase."""
    return " ".join(str(value or "").strip().split()).lower()


def write_github_output(name: str, value: object) -> None:
    output_path = os.environ.get("GITHUB_OUTPUT")
    if not output_path:
        return
    with open(output_path, "a", encoding="utf-8") as output:
        output.write(f"{name}={value}\n")


def fetch_json(url: str, headers: dict[str, str] | None = None) -> Any:
    request = Request(url, headers={"User-Agent": USER_AGENT, **(headers or {})})
    try:
        with urlopen(request, timeout=120) as response:
            return json.load(response)
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Unable to fetch JSON from {url}: {error}") from error


def download_file(url: str, destination: Path) -> None:
    request = Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urlopen(request, timeout=600) as response, destination.open("wb") as output:
            if response.headers.get("Content-Encoding", "").lower() == "gzip":
                with gzip.GzipFile(fileobj=response) as compressed:
                    shutil.copyfileobj(compressed, output)
            else:
                shutil.copyfileobj(response, output)
    except (HTTPError, URLError, TimeoutError, OSError) as error:
        raise RuntimeError(f"Unable to download manifest content from {url}: {error}") from error


def resolve_english_manifest_path(manifest_response: dict[str, Any]) -> str:
    world_paths = manifest_response.get("jsonWorldContentPaths")
    if not isinstance(world_paths, dict):
        raise RuntimeError("Manifest response is missing jsonWorldContentPaths.")

    path = world_paths.get("en")
    if not isinstance(path, str) or not path:
        raise RuntimeError("Manifest response is missing jsonWorldContentPaths.en.")
    return path


def read_existing_manifest_version(output_path: Path) -> str | None:
    if not output_path.exists():
        return None
    try:
        existing = json.loads(output_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    version = existing.get("manifestVersion")
    return version if isinstance(version, str) else None


def load_inventory_definitions(aggregate_path: Path) -> dict[str, Any]:
    try:
        aggregate = json.loads(aggregate_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Unable to parse English manifest aggregate: {error}") from error

    if not isinstance(aggregate, dict):
        raise RuntimeError("English manifest aggregate must be a JSON object.")

    definitions = aggregate.get("DestinyInventoryItemDefinition")
    if not isinstance(definitions, dict):
        raise RuntimeError(
            "English manifest aggregate is missing DestinyInventoryItemDefinition."
        )
    return definitions


def load_overrides(path: "Path | None") -> dict[str, str]:
    """Load an optional id -> icon-path override map.

    Overrides win over name matching and are counted as matched. Every value
    must be a real manifest icon path (starts with ICON_PATH_PREFIX); anything
    else (including JSON null and helper keys prefixed with '_') is rejected so
    a bad or placeholder entry can never silently ship a wrong icon.
    """
    if not path:
        return {}
    try:
        raw = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(raw, dict):
        return {}
    overrides: dict[str, str] = {}
    for component_id, icon_path in raw.items():
        if not isinstance(component_id, str) or not component_id:
            continue
        if component_id.startswith("_"):
            # Reserved for human-readable comment keys in the override file.
            continue
        if isinstance(icon_path, str) and icon_path.startswith(ICON_PATH_PREFIX):
            overrides[component_id] = icon_path
    return overrides


def build_name_lookup(definitions: dict[str, Any]) -> dict[str, list[str]]:
    lookup: dict[str, list[str]] = {}

    for definition in definitions.values():
        if not isinstance(definition, dict):
            continue
        display = definition.get("displayProperties")
        if not isinstance(display, dict):
            continue

        name = display.get("name")
        icon = display.get("icon")
        if not isinstance(name, str) or not name.strip():
            continue
        if not isinstance(icon, str) or not icon.startswith(ICON_PATH_PREFIX):
            continue

        lookup.setdefault(normalize_name(name), []).append(icon)

    return lookup


def generate_icon_map(
    component_catalogue: dict[str, Any],
    definitions: dict[str, Any],
    manifest_version: str,
    overrides: dict[str, str] | None = None,
) -> tuple[dict[str, Any], list[str], list[str]]:
    components = component_catalogue.get("components")
    if not isinstance(components, list):
        raise RuntimeError("Component catalogue must contain a components array.")

    lookup = build_name_lookup(definitions)
    overrides = overrides or {}
    icons: dict[str, str] = {}
    unmatched: list[str] = []
    ambiguous: list[str] = []

    for component in components:
        if not isinstance(component, dict):
            continue

        component_id = component.get("id")
        component_name = component.get("name")
        if not isinstance(component_id, str) or not component_id:
            continue
        if not isinstance(component_name, str) or not component_name:
            continue

        # Override wins: a manually-verified id -> icon mapping short-circuits
        # name matching and counts as matched.
        if component_id in overrides:
            icons[component_id] = overrides[component_id]
            continue

        candidates = lookup.get(normalize_name(component_name), [])
        unique_candidates = sorted(set(candidates))

        if len(unique_candidates) == 1:
            icons[component_id] = unique_candidates[0]
        elif len(unique_candidates) > 1:
            # Log the actual candidate icon paths so ambiguous entries can be
            # resolved into overrides. Previously only the count was recorded.
            candidate_list = ", ".join(unique_candidates)
            ambiguous.append(
                f"{component_id} | {component_name} | {len(unique_candidates)} candidates: {candidate_list}"
            )
        else:
            unmatched.append(f"{component_id} | {component_name}")

    ordered_icons = dict(sorted(icons.items()))
    generated_at = (
        dt.datetime.now(dt.timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )

    result = {
        "manifestVersion": manifest_version,
        "generatedAt": generated_at,
        "totalComponents": len(components),
        "matchedComponents": len(ordered_icons),
        "icons": ordered_icons,
    }
    return result, unmatched, ambiguous


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--components",
        type=Path,
        default=Path("astrix-app/data/armor-3-components.json"),
        help="Forge component catalogue path.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("astrix-app/data/component-icons.json"),
        help="Generated static icon-map path.",
    )
    parser.add_argument(
        "--overrides",
        type=Path,
        default=Path("astrix-app/data/component-icons.overrides.json"),
        help="Optional id -> icon-path override map applied before name matching.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Regenerate even if the committed manifest version is unchanged.",
    )
    parser.add_argument(
        "--manifest-index-file",
        type=Path,
        help="Optional local manifest-index JSON fixture for validation.",
    )
    parser.add_argument(
        "--manifest-aggregate-file",
        type=Path,
        help="Optional local English aggregate JSON fixture for validation.",
    )
    return parser.parse_args()


def load_json_file(path: Path, label: str) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Unable to read {label}: {error}") from error


def main() -> int:
    args = parse_args()

    try:
        component_catalogue = load_json_file(args.components, "component catalogue")
        if not isinstance(component_catalogue, dict):
            raise RuntimeError("Component catalogue must be a JSON object.")

        if args.manifest_index_file:
            manifest_index = load_json_file(args.manifest_index_file, "manifest index fixture")
        else:
            api_key = os.environ.get("BUNGIE_API_KEY", "").strip()
            if not api_key:
                raise RuntimeError("BUNGIE_API_KEY is required.")
            manifest_index = fetch_json(
                MANIFEST_INDEX_URL,
                headers={"X-API-Key": api_key},
            )

        if not isinstance(manifest_index, dict):
            raise RuntimeError("Manifest index must be a JSON object.")

        manifest_response = manifest_index.get("Response")
        if not isinstance(manifest_response, dict):
            raise RuntimeError("Manifest index response is missing Response.")

        manifest_version = manifest_response.get("version")
        if not isinstance(manifest_version, str) or not manifest_version:
            raise RuntimeError("Manifest index response is missing a version.")

        previous_version = read_existing_manifest_version(args.output)
        print(f"Bungie manifest version: {manifest_version}")
        print(f"Committed icon-map version: {previous_version or 'none'}")

        if previous_version == manifest_version and not args.force:
            print("Manifest version is unchanged; no icon map was generated.")
            print("(Pass --force to regenerate anyway, e.g. to apply new overrides.)")
            write_github_output("changed", "false")
            write_github_output("manifest_version", manifest_version)
            return 0

        if previous_version == manifest_version and args.force:
            print("Manifest version unchanged, but --force was set; regenerating.")

        overrides = load_overrides(args.overrides)
        if overrides:
            print(f"Loaded {len(overrides)} icon override(s) from {args.overrides}.")

        if args.manifest_aggregate_file:
            aggregate_path = args.manifest_aggregate_file
            definitions = load_inventory_definitions(aggregate_path)
        else:
            manifest_path = resolve_english_manifest_path(manifest_response)
            manifest_url = (
                manifest_path
                if manifest_path.startswith("http://") or manifest_path.startswith("https://")
                else f"{BUNGIE_ROOT}{manifest_path}"
            )
            print(f"English manifest path: {manifest_path}")

            with tempfile.TemporaryDirectory(prefix="astrix-manifest-") as temporary_directory:
                aggregate_path = Path(temporary_directory) / "english-manifest.json"
                download_file(manifest_url, aggregate_path)
                definitions = load_inventory_definitions(aggregate_path)

        icon_map, unmatched, ambiguous = generate_icon_map(
            component_catalogue,
            definitions,
            manifest_version,
            overrides,
        )

        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(
            json.dumps(icon_map, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

        total = icon_map["totalComponents"]
        matched = icon_map["matchedComponents"]
        percentage = (matched / total * 100) if total else 0

        print(f"Matched components: {matched}/{total} ({percentage:.1f}%)")
        print(f"Unmatched components: {len(unmatched)}")
        for entry in unmatched:
            print(f"  UNMATCHED: {entry}")

        print(f"Ambiguous components: {len(ambiguous)}")
        for entry in ambiguous:
            print(f"  AMBIGUOUS: {entry}")

        write_github_output("changed", "true")
        write_github_output("manifest_version", manifest_version)
        write_github_output("matched", matched)
        write_github_output("total", total)
        write_github_output("unmatched", len(unmatched))
        write_github_output("ambiguous", len(ambiguous))
        return 0
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
