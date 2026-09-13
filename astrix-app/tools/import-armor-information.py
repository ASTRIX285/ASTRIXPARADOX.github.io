#!/usr/bin/env python3
"""Generate Paradox Forge armour information from the Bungie manifest."""

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
CURATED_PATH = ROOT / "astrix-app/data/armor-information.curated.json"
OUTPUT_PATH = ROOT / "astrix-app/data/armor-information.json"
FORGE_INDEX_PATH = ROOT / "astrix-app/data/forge-armour-index.json"
API_ROOT = "https://www.bungie.net/Platform"
BUNGIE_ROOT = "https://www.bungie.net"
DESTINY_ITEM_TYPE_ARMOR = 2
ARTIFACT_TYPE_LABEL = "artifact"
ARTIFACT_PERK_TYPE_LABEL = "artifact perk"
CLASS_NAMES = {0: "Titan", 1: "Hunter", 2: "Warlock", 3: "Unknown"}
FORBIDDEN_FIELDS = {"rank", "ranking", "tier", "score", "position"}


class ImportFailure(RuntimeError):
    pass


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def digest_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def normalize_name(value: str) -> str:
    return " ".join(str(value).strip().lower().replace("’", "'").split())


def absolute_url(path: str) -> str:
    return path if path.startswith("http") else f"{BUNGIE_ROOT}{path}"


def get_json(url: str, api_key: str | None = None) -> dict[str, Any]:
    headers = {"Accept": "application/json", "User-Agent": "ASTRIX-Paradox-Forge/2.0"}
    if api_key:
        headers["X-API-Key"] = api_key
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            data = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError) as error:
        raise ImportFailure(f"Unable to fetch Bungie JSON: {url}: {error}") from error
    if not isinstance(data, dict):
        raise ImportFailure(f"Expected JSON object: {url}")
    if data.get("ErrorCode") not in (None, 1):
        raise ImportFailure(data.get("Message") or data.get("ErrorStatus") or "Bungie API error")
    return data


def find_forbidden(value: Any, path: str = "$") -> list[str]:
    found: list[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}"
            if key in FORBIDDEN_FIELDS:
                found.append(child_path)
            found.extend(find_forbidden(child, child_path))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            found.extend(find_forbidden(child, f"{path}[{index}]"))
    return found


def load_curated() -> dict[str, Any]:
    if not CURATED_PATH.exists():
        raise ImportFailure(f"Missing curated file: {CURATED_PATH}")
    try:
        payload = json.loads(CURATED_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ImportFailure(f"Invalid curated JSON: {error}") from error
    rows = payload.get("armor") if isinstance(payload, dict) else None
    if not isinstance(rows, list):
        raise ImportFailure("Curated armour file must contain an armor array")
    forbidden = find_forbidden(payload)
    if forbidden:
        raise ImportFailure("Forbidden ranking fields: " + ", ".join(forbidden))
    for index, row in enumerate(rows):
        if not isinstance(row, dict) or (not row.get("name") and not row.get("bungieHash")):
            raise ImportFailure(f"armor[{index}] requires name or bungieHash")
    return payload


def manifest_paths(manifest: dict[str, Any]) -> tuple[str, dict[str, str]]:
    response = manifest.get("Response") or {}
    version = str(response.get("version") or "unknown")
    component = response.get("jsonWorldComponentContentPaths", {}).get("en", {})
    inventory = component.get("DestinyInventoryItemDefinition")
    if inventory:
        paths = {
            definition_type: component[definition_type]
            for definition_type in (
                "DestinyInventoryItemDefinition",
                "DestinyStatDefinition",
                "DestinyEquipableItemSetDefinition",
                "DestinySandboxPerkDefinition",
                "DestinyPlugSetDefinition",
                "DestinySocketCategoryDefinition",
            )
            if component.get(definition_type)
        }
        return version, paths
    aggregate = response.get("jsonWorldContentPaths", {}).get("en")
    if aggregate:
        return version, {"aggregate": aggregate}
    raise ImportFailure("No English Bungie manifest path returned")


def load_definitions(
    paths: dict[str, str],
    manifest_version: str,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    if "aggregate" in paths:
        aggregate = get_json(absolute_url(paths["aggregate"]))
        return (
            aggregate.get("DestinyInventoryItemDefinition", {}),
            aggregate.get("DestinyStatDefinition", {}),
            aggregate.get("DestinyEquipableItemSetDefinition", {}),
            aggregate.get("DestinySandboxPerkDefinition", {}),
            aggregate.get("DestinyPlugSetDefinition", {}),
            aggregate.get("DestinySocketCategoryDefinition", {}),
        )
    proxy_origin = os.environ.get("FORGE_AUTH_ORIGIN", "").rstrip("/")

    def load_component(definition_type: str) -> dict[str, Any]:
        path = paths.get(definition_type)
        if not path:
            return {}
        if proxy_origin:
            from urllib.parse import urlencode

            query = urlencode({"type": definition_type, "version": manifest_version})
            return get_json(f"{proxy_origin}/bungie/manifest/component?{query}")
        return get_json(absolute_url(path))

    return (
        load_component("DestinyInventoryItemDefinition"),
        load_component("DestinyStatDefinition"),
        load_component("DestinyEquipableItemSetDefinition"),
        load_component("DestinySandboxPerkDefinition"),
        load_component("DestinyPlugSetDefinition"),
        load_component("DestinySocketCategoryDefinition"),
    )


def compact_display(definition: dict[str, Any]) -> dict[str, Any]:
    display = definition.get("displayProperties") or {}
    return {
        key: display[key]
        for key in ("name", "description", "icon")
        if display.get(key) not in (None, "")
    }


def forge_armour_definition(hash_text: str, item: dict[str, Any]) -> dict[str, Any]:
    inventory = item.get("inventory") or {}
    equipping = item.get("equippingBlock") or {}
    definition: dict[str, Any] = {
        "hash": int(hash_text),
        "itemType": item.get("itemType", -1),
        "itemSubType": item.get("itemSubType", -1),
        "classType": item.get("classType", 3),
        "itemTypeDisplayName": str(item.get("itemTypeDisplayName") or ""),
        "displayProperties": compact_display(item),
        "inventory": {
            key: inventory[key]
            for key in ("tierType", "tierTypeName", "bucketTypeHash")
            if inventory.get(key) is not None
        },
        "equippingBlock": {
            key: equipping[key]
            for key in ("equipmentSlotTypeHash", "equipableItemSetHash")
            if equipping.get(key) is not None
        },
    }
    sockets = item.get("sockets") or {}
    socket_entries = []
    for entry in sockets.get("socketEntries") or []:
        if not isinstance(entry, dict):
            continue
        compact_entry = {
            key: entry[key]
            for key in ("singleInitialItemHash", "reusablePlugSetHash")
            if entry.get(key) is not None
        }
        socket_entries.append(compact_entry)
    socket_categories = [
        {
            "socketCategoryHash": row["socketCategoryHash"],
            "socketIndexes": row.get("socketIndexes") or [],
        }
        for row in sockets.get("socketCategories") or []
        if isinstance(row, dict) and isinstance(row.get("socketCategoryHash"), int)
    ]
    if socket_entries or socket_categories:
        definition["sockets"] = {"socketEntries": socket_entries, "socketCategories": socket_categories}
    for key in ("equipableItemSetHash", "collectibleHash", "displaySource", "iconWatermark", "iconWatermarkShelved", "iconWatermarkFeatured", "isFeaturedItem"):
        if item.get(key) not in (None, ""):
            definition[key] = item[key]
    quality = item.get("quality") or {}
    if quality:
        definition["quality"] = {key: quality[key] for key in ("currentVersion", "displayVersionWatermarkIcons") if key in quality}
    return definition


def compact_set_definition(hash_text: str, definition: dict[str, Any]) -> dict[str, Any]:
    return {
        "hash": int(hash_text),
        "displayProperties": compact_display(definition),
        "setPerks": [
            {
                key: perk[key]
                for key in ("requiredSetCount", "sandboxPerkHash")
                if perk.get(key) is not None
            }
            for perk in definition.get("setPerks") or []
            if isinstance(perk, dict)
        ],
    }


def compact_plug_definition(hash_text: str, definition: dict[str, Any]) -> dict[str, Any]:
    inventory = definition.get("inventory") or {}
    plug = definition.get("plug") or {}
    compact_plug = {
        key: plug[key]
        for key in ("plugCategoryIdentifier", "plugCategoryHash", "energyCost")
        if plug.get(key) is not None
    }
    for rules_key in ("insertionRules", "enabledRules"):
        rules = [
            {"failureMessage": str(rule.get("failureMessage") or "")}
            for rule in plug.get(rules_key) or []
            if isinstance(rule, dict) and str(rule.get("failureMessage") or "").strip()
        ]
        if rules:
            compact_plug[rules_key] = rules
    compact: dict[str, Any] = {
        "hash": int(hash_text),
        "itemType": definition.get("itemType", -1),
        "itemSubType": definition.get("itemSubType", -1),
        "classType": definition.get("classType", 3),
        "itemTypeDisplayName": str(definition.get("itemTypeDisplayName") or ""),
        "displayProperties": compact_display(definition),
        "inventory": {
            key: inventory[key]
            for key in ("tierType", "tierTypeName", "bucketTypeHash")
            if inventory.get(key) is not None
        },
        "plug": compact_plug,
        "investmentStats": [
            {
                key: stat[key]
                for key in ("statTypeHash", "value", "isConditionallyActive")
                if stat.get(key) is not None
            }
            for stat in definition.get("investmentStats") or []
            if isinstance(stat, dict) and isinstance(stat.get("statTypeHash"), int)
        ],
    }
    tooltip_notifications = [
        {
            key: notification[key]
            for key in ("displayString", "displayStyle")
            if notification.get(key) not in (None, "")
        }
        for notification in definition.get("tooltipNotifications") or []
        if isinstance(notification, dict) and str(notification.get("displayString") or "").strip()
    ]
    if tooltip_notifications:
        compact["tooltipNotifications"] = tooltip_notifications
    for key in ("traitIds", "itemCategoryHashes", "iconWatermark"):
        if definition.get(key) not in (None, "", []):
            compact[key] = definition[key]
    return compact


def artifact_catalog(
    inventory: dict[str, Any],
    plug_set_definitions: dict[str, Any],
    sandbox_perks: dict[str, Any],
    manifest_version: str,
) -> list[dict[str, Any]]:
    """Build the compact legal Artifact 2.0 socket catalogue for Build Forge."""

    def item_type(definition: dict[str, Any]) -> str:
        return str(
            definition.get("itemTypeDisplayName")
            or definition.get("itemTypeAndTierDisplayName")
            or ""
        ).strip().lower()

    def entry_plug_hashes(entry: dict[str, Any]) -> list[int]:
        hashes = {
            int(row["plugItemHash"])
            for row in entry.get("reusablePlugItems") or []
            if isinstance(row, dict) and isinstance(row.get("plugItemHash"), int)
        }
        plug_set_hash = entry.get("reusablePlugSetHash")
        plug_set = plug_set_definitions.get(str(plug_set_hash)) if isinstance(plug_set_hash, int) else None
        for row in (plug_set or {}).get("reusablePlugItems") or []:
            plug_hash = row.get("plugItemHash") if isinstance(row, dict) else None
            if isinstance(plug_hash, int):
                hashes.add(plug_hash)
        return sorted(hashes)

    catalog: list[dict[str, Any]] = []
    for hash_text, definition in inventory.items():
        if not isinstance(definition, dict) or item_type(definition) != ARTIFACT_TYPE_LABEL:
            continue
        entries = (definition.get("sockets") or {}).get("socketEntries") or []
        grouped: list[dict[str, Any]] = []
        groups_by_key: dict[str, dict[str, Any]] = {}
        for socket_index, entry in enumerate(entries):
            if not isinstance(entry, dict):
                continue
            plug_hashes = entry_plug_hashes(entry)
            if not plug_hashes:
                continue
            plug_set_hash = entry.get("reusablePlugSetHash")
            group_key = f"plugset:{plug_set_hash}" if isinstance(plug_set_hash, int) else f"socket:{socket_index}"
            group = groups_by_key.get(group_key)
            if group is None:
                group = {
                    "plugSetHash": plug_set_hash if isinstance(plug_set_hash, int) else None,
                    "socketIndexes": [],
                    "perkHashes": set(),
                    "firstSocketIndex": socket_index,
                }
                groups_by_key[group_key] = group
                grouped.append(group)
            group["socketIndexes"].append(socket_index)
            group["perkHashes"].update(plug_hashes)

        selection_slots: list[dict[str, Any]] = []
        for group in sorted(grouped, key=lambda row: row["firstSocketIndex"]):
            perk_hashes = sorted(
                perk_hash
                for perk_hash in group["perkHashes"]
                if item_type(inventory.get(str(perk_hash)) or {}) == ARTIFACT_PERK_TYPE_LABEL
            )
            if not perk_hashes or not group["socketIndexes"]:
                continue
            tier_index = len(selection_slots)
            selection_slots.append({
                "tierIndex": tier_index,
                "bucket": tier_index + 1,
                "capacity": len(group["socketIndexes"]),
                "socketIndexes": list(group["socketIndexes"]),
                "plugSetHash": group["plugSetHash"],
                "perkHashes": perk_hashes,
            })
        if not selection_slots:
            continue

        perks: list[dict[str, Any]] = []
        seen_perks: set[tuple[int, int]] = set()
        for slot in selection_slots:
            for item_index, perk_hash in enumerate(slot["perkHashes"]):
                identity = (slot["tierIndex"], perk_hash)
                if identity in seen_perks:
                    continue
                seen_perks.add(identity)
                perk_definition = inventory.get(str(perk_hash)) or {}
                display = compact_display(perk_definition)
                sandbox_hashes = [
                    int(row["perkHash"])
                    for row in perk_definition.get("perks") or []
                    if isinstance(row, dict) and isinstance(row.get("perkHash"), int)
                ]
                sandbox_displays = [
                    compact_display(sandbox_perks[str(sandbox_hash)])
                    for sandbox_hash in sandbox_hashes
                    if isinstance(sandbox_perks.get(str(sandbox_hash)), dict)
                ]
                resolved_name = str(display.get("name") or next(
                    (row.get("name") for row in sandbox_displays if row.get("name")),
                    f"Artifact perk {perk_hash}",
                ))
                resolved_description = str(display.get("description") or " ".join(dict.fromkeys(
                    str(row.get("description") or "").strip()
                    for row in sandbox_displays
                    if str(row.get("description") or "").strip()
                )))
                resolved_icon = str(display.get("icon") or next(
                    (row.get("icon") for row in sandbox_displays if row.get("icon")),
                    "",
                ))
                perks.append({
                    "hash": perk_hash,
                    "bungieHash": perk_hash,
                    "sandboxPerkHash": sandbox_hashes[0] if sandbox_hashes else None,
                    "name": resolved_name,
                    "description": resolved_description,
                    "icon": absolute_url(resolved_icon) if resolved_icon else "",
                    "definition": compact_plug_definition(str(perk_hash), perk_definition),
                    "displayResolved": bool(resolved_name and resolved_description),
                    "unresolved": not bool(resolved_name and resolved_description),
                    "isActive": False,
                    "isVisible": True,
                    "tierUnlocked": True,
                    "tierIndex": slot["tierIndex"],
                    "column": slot["bucket"],
                    "order": item_index + 1,
                    "itemIndex": item_index,
                    "tierTitle": f"BUCKET {slot['bucket']}",
                    "bucketCapacity": slot["capacity"],
                    "plugSetHash": slot["plugSetHash"],
                })

        display = compact_display(definition)
        artifact_hash = int(hash_text)
        catalog.append({
            "hash": artifact_hash,
            "bungieHash": artifact_hash,
            "name": str(display.get("name") or f"Artifact {artifact_hash}"),
            "description": str(display.get("description") or ""),
            "icon": absolute_url(str(display.get("icon") or "")) if display.get("icon") else "",
            "definition": compact_plug_definition(hash_text, definition),
            "displayResolved": bool(display.get("name")),
            "unresolved": not bool(display.get("name")),
            "availabilityModel": "artifact-2-socket-buckets",
            "source": "hourly-compact-manifest",
            "manifestVersion": manifest_version,
            "state": "catalogued",
            "provenance": "bungie-artifact-2-hourly-index",
            "selectionSlots": selection_slots,
            "selectionLimit": sum(slot["capacity"] for slot in selection_slots),
            "perks": perks,
            "activePerks": [],
        })

    return sorted(catalog, key=lambda row: (row["name"].lower(), row["hash"]))


def pack_forge_index(payload: dict[str, Any]) -> dict[str, Any]:
    """Deduplicate repeated data without dropping any definition fields."""
    templates: list[dict[str, Any]] = []
    template_ids: dict[str, int] = {}
    entries: list[dict[str, Any]] = []
    entry_ids: dict[str, int] = {}
    keep = {"hash", "itemType", "displayProperties", "socketLayoutKey", "collectibleHash", "displaySource", "iconWatermark"}

    def intern(value: dict[str, Any], rows: list[dict[str, Any]], ids: dict[str, int]) -> int:
        key = canonical_json(value)
        if key not in ids:
            ids[key] = len(rows)
            rows.append(value)
        return ids[key]

    packed = dict(payload)
    for kind in ("definitions", "plugDefinitions"):
        packed[kind] = {}
        for hash_text, row in sorted(payload[kind].items(), key=lambda pair: int(pair[0])):
            template = {key: value for key, value in row.items() if key not in keep}
            identity = {key: value for key, value in row.items() if key in keep}
            packed[kind][hash_text] = {**identity, "templateId": intern(template, templates, template_ids)}
    packed["socketLayouts"] = {}
    for key, layout in sorted(payload["socketLayouts"].items()):
        packed["socketLayouts"][key] = {
            **{name: value for name, value in layout.items() if name != "socketEntries"},
            "socketEntryIds": [intern(entry, entries, entry_ids) for entry in layout.get("socketEntries", [])],
        }
    qualities: list[dict[str, Any]] = []
    quality_ids: dict[str, int] = {}
    for template in templates:
        if "quality" in template:
            template["qualityId"] = intern(template.pop("quality"), qualities, quality_ids)
    packed.update({"schemaVersion": 5, "transportEncoding": "shared-definitions-v1", "definitionTemplates": templates, "socketEntryDefinitions": entries, "qualityDefinitions": qualities})
    return packed


def forge_index_payload(
    manifest_version: str,
    inventory: dict[str, Any],
    stat_definitions: dict[str, Any],
    set_definitions: dict[str, Any],
    sandbox_perks: dict[str, Any],
    plug_set_definitions: dict[str, Any],
    socket_category_definitions: dict[str, Any],
) -> dict[str, Any]:
    armour = {
        hash_text: forge_armour_definition(hash_text, item)
        for hash_text, item in inventory.items()
        if isinstance(item, dict)
        and item.get("itemType") == DESTINY_ITEM_TYPE_ARMOR
        and (item.get("displayProperties") or {}).get("name")
    }
    socket_layouts: dict[str, dict[str, Any]] = {}
    for definition in armour.values():
        sockets = definition.pop("sockets", None)
        if not sockets:
            continue
        layout_key = hashlib.sha256(canonical_json(sockets).encode("utf-8")).hexdigest()[:16]
        if layout_key in socket_layouts and socket_layouts[layout_key] != sockets:
            layout_key = hashlib.sha256(canonical_json(sockets).encode("utf-8")).hexdigest()
        socket_layouts[layout_key] = sockets
        definition["socketLayoutKey"] = layout_key
    set_hashes = {
        int(value)
        for definition in armour.values()
        for value in (
            definition.get("equipableItemSetHash"),
            (definition.get("equippingBlock") or {}).get("equipableItemSetHash"),
        )
        if isinstance(value, int) and value > 0
    }
    compact_sets = {
        str(hash_value): compact_set_definition(str(hash_value), set_definitions[str(hash_value)])
        for hash_value in sorted(set_hashes)
        if isinstance(set_definitions.get(str(hash_value)), dict)
    }
    perk_hashes = {
        int(perk["sandboxPerkHash"])
        for definition in compact_sets.values()
        for perk in definition.get("setPerks") or []
        if isinstance(perk.get("sandboxPerkHash"), int)
    }
    compact_perks = {
        str(hash_value): {
            "hash": hash_value,
            "displayProperties": compact_display(sandbox_perks[str(hash_value)]),
        }
        for hash_value in sorted(perk_hashes)
        if isinstance(sandbox_perks.get(str(hash_value)), dict)
    }
    compact_stats = {
        hash_text: {
            "hash": int(hash_text),
            "displayProperties": compact_display(definition),
        }
        for hash_text, definition in stat_definitions.items()
        if isinstance(definition, dict) and (definition.get("displayProperties") or {}).get("name")
    }
    plug_set_hashes = {
        int(entry["reusablePlugSetHash"])
        for layout in socket_layouts.values()
        for entry in layout.get("socketEntries") or []
        if isinstance(entry, dict) and isinstance(entry.get("reusablePlugSetHash"), int)
    }
    plug_hashes = {
        int(entry["singleInitialItemHash"])
        for layout in socket_layouts.values()
        for entry in layout.get("socketEntries") or []
        if isinstance(entry, dict) and isinstance(entry.get("singleInitialItemHash"), int) and int(entry["singleInitialItemHash"]) > 0
    }
    for item in inventory.values():
        if not isinstance(item, dict) or item.get("itemType") != DESTINY_ITEM_TYPE_ARMOR:
            continue
        for entry in (item.get("sockets") or {}).get("socketEntries") or []:
            if not isinstance(entry, dict):
                continue
            for row in entry.get("reusablePlugItems") or []:
                plug_hash = row.get("plugItemHash") if isinstance(row, dict) else None
                if isinstance(plug_hash, int) and plug_hash > 0:
                    plug_hashes.add(plug_hash)
    for plug_set_hash in plug_set_hashes:
        plug_set = plug_set_definitions.get(str(plug_set_hash)) or {}
        for row in plug_set.get("reusablePlugItems") or []:
            plug_hash = row.get("plugItemHash") if isinstance(row, dict) else None
            if isinstance(plug_hash, int) and plug_hash > 0:
                plug_hashes.add(plug_hash)
    compact_plugs = {
        str(hash_value): compact_plug_definition(str(hash_value), inventory[str(hash_value)])
        for hash_value in sorted(plug_hashes)
        if isinstance(inventory.get(str(hash_value)), dict)
    }
    socket_category_hashes = {
        int(category["socketCategoryHash"])
        for layout in socket_layouts.values()
        for category in layout.get("socketCategories") or []
        if isinstance(category, dict) and isinstance(category.get("socketCategoryHash"), int)
    }
    compact_socket_categories = {
        str(hash_value): {
            "hash": hash_value,
            "displayProperties": compact_display(socket_category_definitions[str(hash_value)]),
        }
        for hash_value in sorted(socket_category_hashes)
        if isinstance(socket_category_definitions.get(str(hash_value)), dict)
    }
    compact_artifacts = artifact_catalog(inventory, plug_set_definitions, sandbox_perks, manifest_version)
    return pack_forge_index({
        "schemaVersion": 5,
        "manifestVersion": manifest_version,
        "generatedAt": utc_now(),
        "definitions": armour,
        "socketLayouts": socket_layouts,
        "equipableItemSets": compact_sets,
        "sandboxPerks": compact_perks,
        "statDefinitions": compact_stats,
        "plugDefinitions": compact_plugs,
        "socketCategoryDefinitions": compact_socket_categories,
        "artifactCatalog": compact_artifacts,
    })


def write_forge_index(payload: dict[str, Any]) -> bool:
    previous = None
    if FORGE_INDEX_PATH.exists():
        try:
            previous = json.loads(FORGE_INDEX_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            previous = None
    meaningful_keys = ("schemaVersion", "manifestVersion", "definitions", "socketLayouts", "equipableItemSets", "sandboxPerks", "statDefinitions", "plugDefinitions", "socketCategoryDefinitions", "artifactCatalog", "transportEncoding", "definitionTemplates", "socketEntryDefinitions", "qualityDefinitions")
    changed = previous is None or any(previous.get(key) != payload.get(key) for key in meaningful_keys)
    if changed:
        FORGE_INDEX_PATH.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + "\n", encoding="utf-8")
    return changed


def stat_name(stat_hash: int, definitions: dict[str, Any]) -> str | None:
    definition = definitions.get(str(stat_hash), {})
    name = (definition.get("displayProperties") or {}).get("name")
    return str(name).strip() if name else None


def investment_stats(item: dict[str, Any], stat_definitions: dict[str, Any]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for stat in item.get("investmentStats") or []:
        stat_hash = stat.get("statTypeHash")
        if not isinstance(stat_hash, int) or stat_hash <= 0:
            continue
        result.append({
            "statTypeHash": stat_hash,
            "name": stat_name(stat_hash, stat_definitions),
            "value": stat.get("value", 0),
            "isConditionallyActive": bool(stat.get("isConditionallyActive", False)),
        })
    return result


def armor_slot(item: dict[str, Any]) -> str:
    return str(item.get("itemTypeDisplayName") or "Unknown")


def official_record(hash_text: str, item: dict[str, Any], stat_definitions: dict[str, Any]) -> dict[str, Any]:
    display = item.get("displayProperties") or {}
    bungie_hash = int(hash_text)
    class_type = item.get("classType", 3)
    class_name = "Any" if class_type == 3 else CLASS_NAMES.get(class_type, "Unknown")
    return {
        "id": f"armor-{bungie_hash}",
        "bungieHash": bungie_hash,
        "name": str(display.get("name") or ""),
        "icon": str(display.get("icon") or ""),
        "watermark": str(item.get("iconWatermark") or ""),
        "armorSlot": armor_slot(item),
        "className": class_name,
        "rarity": str((item.get("inventory") or {}).get("tierTypeName") or ""),
        "officialDescription": str(display.get("description") or ""),
        "official": {
            "itemType": item.get("itemType", -1),
            "itemSubType": item.get("itemSubType", -1),
            "itemCategoryHashes": item.get("itemCategoryHashes", []),
            "classType": class_type,
            "equippingBlock": item.get("equippingBlock"),
            "sockets": item.get("sockets"),
            "investmentStats": investment_stats(item, stat_definitions),
            "stats": item.get("stats"),
        },
        "curated": {"setName": None, "setTags": [], "usageNotes": "", "sources": []},
        "verified": False,
    }


def clean_tags(value: Any) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
        raise ImportFailure("setTags must be an array of strings")
    return list(dict.fromkeys(item.strip() for item in value if item.strip()))


def clean_sources(value: Any) -> list[dict[str, str]]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise ImportFailure("sources must be an array")
    result: list[dict[str, str]] = []
    for source in value:
        if not isinstance(source, dict):
            raise ImportFailure("Each source must be an object")
        title = str(source.get("title") or "").strip()
        publisher = str(source.get("publisher") or "").strip()
        date = str(source.get("date") or "").strip()
        if not title or not publisher or not date:
            raise ImportFailure("Each source requires title, publisher and date")
        cleaned = {"title": title, "publisher": publisher, "date": date}
        if source.get("url"):
            cleaned["url"] = str(source["url"]).strip()
        result.append(cleaned)
    return result


def merge_curated(record: dict[str, Any], row: dict[str, Any]) -> None:
    record["curated"] = {
        "setName": str(row.get("setName") or "").strip() or None,
        "setTags": clean_tags(row.get("setTags", [])),
        "usageNotes": str(row.get("usageNotes") or "").strip(),
        "sources": clean_sources(row.get("sources", [])),
    }
    record["verified"] = row.get("verified") is True


def meaningful(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "schemaVersion": payload.get("schemaVersion"),
        "manifestVersion": payload.get("manifestVersion"),
        "curatedDigest": payload.get("curatedDigest"),
        "armor": payload.get("armor", []),
    }


def write_outputs(values: dict[str, Any]) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    if not path:
        return
    with open(path, "a", encoding="utf-8") as output:
        for key, value in values.items():
            output.write(f"{key}={'true' if value is True else 'false' if value is False else value}\n")


def main() -> int:
    api_key = os.environ.get("BUNGIE_API_KEY")
    proxy_origin = os.environ.get("FORGE_AUTH_ORIGIN", "").rstrip("/")
    if not api_key and not proxy_origin:
        raise ImportFailure("BUNGIE_API_KEY or FORGE_AUTH_ORIGIN is required")
    curated_payload = load_curated()
    curated_rows = curated_payload["armor"]
    curated_digest = digest_json(curated_rows)
    if api_key:
        manifest = get_json(f"{API_ROOT}/Destiny2/Manifest/", api_key)
    else:
        manifest = {"Response": get_json(f"{proxy_origin}/bungie/manifest")}
    manifest_version, paths = manifest_paths(manifest)
    inventory, stat_definitions, set_definitions, sandbox_perks, plug_set_definitions, socket_category_definitions = load_definitions(paths, manifest_version)
    forge_index = forge_index_payload(
        manifest_version,
        inventory,
        stat_definitions,
        set_definitions,
        sandbox_perks,
        plug_set_definitions,
        socket_category_definitions,
    )
    forge_index_changed = write_forge_index(forge_index)

    records: list[dict[str, Any]] = []
    by_hash: dict[int, dict[str, Any]] = {}
    by_name: dict[str, list[dict[str, Any]]] = {}
    for hash_text, item in inventory.items():
        if not isinstance(item, dict) or item.get("itemType") != DESTINY_ITEM_TYPE_ARMOR:
            continue
        name = str((item.get("displayProperties") or {}).get("name") or "").strip()
        if not name:
            continue
        try:
            record = official_record(hash_text, item, stat_definitions)
        except (TypeError, ValueError):
            continue
        records.append(record)
        by_hash[record["bungieHash"]] = record
        by_name.setdefault(normalize_name(name), []).append(record)

    matched = 0
    unresolved: list[str] = []
    ambiguous: list[str] = []
    for row in curated_rows:
        target = None
        if row.get("bungieHash") not in (None, ""):
            target = by_hash.get(int(row["bungieHash"]))
        if target is None and row.get("name"):
            candidates = by_name.get(normalize_name(row["name"]), [])
            if len(candidates) == 1:
                target = candidates[0]
            elif len(candidates) > 1:
                ambiguous.append(str(row["name"]))
                continue
        if target is None:
            unresolved.append(str(row.get("name") or row.get("bungieHash")))
            continue
        merge_curated(target, row)
        matched += 1

    records.sort(key=lambda row: (row["name"].lower(), row["bungieHash"]))
    payload = {
        "schemaVersion": "1.0.0",
        "generatedAt": utc_now(),
        "manifestVersion": manifest_version,
        "curatedDigest": curated_digest,
        "armor": records,
    }
    previous = None
    if OUTPUT_PATH.exists():
        try:
            previous = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            previous = None
    forge_index_only = os.environ.get("FORGE_INDEX_ONLY") == "1"
    changed = False if forge_index_only else previous is None or meaningful(previous) != meaningful(payload)
    if changed and not forge_index_only:
        OUTPUT_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"Manifest version: {manifest_version}")
    print(f"Official armour records: {len(records)}")
    print(f"Forge armour index records: {len(forge_index['definitions'])}; changed: {forge_index_changed}")
    print(f"Forge armour plug records: {len(forge_index['plugDefinitions'])}")
    print(f"Forge Artifact 2.0 records: {len(forge_index['artifactCatalog'])}")
    print(f"Curated rows: {len(curated_rows)}")
    print(f"Matched: {matched}; unresolved: {len(unresolved)}; ambiguous: {len(ambiguous)}")
    write_outputs({
        "changed": changed,
        "manifest_version": manifest_version,
        "armor": len(records),
        "curated": len(curated_rows),
        "matched": matched,
        "unresolved": len(unresolved),
        "ambiguous": len(ambiguous),
        "forge_index_changed": forge_index_changed,
        "artifact_catalog": len(forge_index["artifactCatalog"]),
    })
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ImportFailure as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
