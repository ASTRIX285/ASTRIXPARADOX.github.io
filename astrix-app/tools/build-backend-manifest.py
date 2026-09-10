#!/usr/bin/env python3
"""Prepare versioned, lossless public definition shards off the browser/Worker heap."""
import json, os, shutil, tempfile, urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'forge-manifest-worker/data'
LIMIT = 2 * 1024 * 1024
TYPES = (
    'InventoryItem SandboxPerk Artifact PlugSet Stat SocketCategory EquipableItemSet '
    'PresentationNode Record Objective Collectible Metric GuardianRank GuardianRankConstants '
    'Destination Activity Checklist Location SocketType DamageType BreakerType PowerCap Season SeasonPass'
).split()

JOURNEY_PUBLIC_ROOTS = (
    1163735237,  # Current Triumphs and Records catalogue
    498211331,   # Collection badges
    616318467,   # Current Titles
    1881970629,  # Legacy Titles
    2642502414,  # Patterns and Catalysts
    3741753466,  # Guardian Ranks
    1074663644,  # Metrics and Stat Trackers
)
JOURNEY_SOURCE_TYPES = {
    'DestinyInventoryItemDefinition',
    'DestinyPresentationNodeDefinition',
    'DestinyRecordDefinition',
    'DestinyObjectiveDefinition',
    'DestinyCollectibleDefinition',
    'DestinyMetricDefinition',
    'DestinyGuardianRankDefinition',
    'DestinyGuardianRankConstantsDefinition',
    'DestinyStatDefinition',
}
GUARDIAN_STAT_HASHES = (2996146975, 392767087, 1943323491, 1735777505, 144602215, 4244567218)

def fetch(url):
    headers = {'User-Agent': 'ASTRIX-PARADOX/Shared-Manifest'}
    if os.environ.get('BUNGIE_API_KEY'):
        headers['X-API-Key'] = os.environ['BUNGIE_API_KEY']
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=120) as response:
        return json.load(response)

def encode(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()

def metadata():
    url = 'https://www.bungie.net/Platform/Destiny2/Manifest/' if os.environ.get('BUNGIE_API_KEY') else 'https://auth.astrixparadox.com/bungie/manifest'
    payload = fetch(url)
    return payload.get('Response', payload)

def shard_table(rows, directory):
    count = 1
    encoded = {str(h): encode(row) for h, row in rows.items()}
    while True:
        groups = [[] for _ in range(count)]
        sizes = [2] * count
        for h, value in encoded.items():
            n = int(h) % count
            entry = encode(h) + b':' + value
            groups[n].append(entry)
            sizes[n] += len(entry) + 1
        if max(sizes) <= LIMIT:
            break
        count *= 2
        if count > 8192:
            raise ValueError('Definition shard exceeds the bounded asset budget')
    directory.mkdir(parents=True)
    for n, entries in enumerate(groups):
        (directory / f'{n}.json').write_bytes(b'{' + b','.join(entries) + b'}')
    return {'shards': count, 'definitions': len(rows), 'maxShardBytes': max(sizes)}

def journey_compact_tables(directory):
    tables = {}
    for path in directory.glob('Destiny*Definition-*.json'):
        table = path.name.rsplit('-', 1)[0]
        payload = json.loads(path.read_text(encoding='utf-8'))
        tables.setdefault(table, {}).update(payload.get('definitions') or {})
    return tables

def journey_item_projection(definition):
    fields = (
        'hash', 'displayProperties', 'itemType', 'itemSubType', 'itemTypeDisplayName',
        'classType', 'inventory', 'equippable', 'collectibleHash', 'iconWatermark',
        'secondaryIcon', 'screenshot', 'sourceData', 'loreHash'
    )
    return {field: definition[field] for field in fields if field in definition}

def journey_public_tables(tables):
    nodes = tables.get('DestinyPresentationNodeDefinition') or {}
    wanted = {
        'DestinyPresentationNodeDefinition': set(),
        'DestinyRecordDefinition': set(),
        'DestinyObjectiveDefinition': set(),
        'DestinyCollectibleDefinition': set(),
        'DestinyMetricDefinition': set(),
        'DestinyInventoryItemDefinition': set(),
        'DestinyGuardianRankDefinition': set(),
        'DestinyGuardianRankConstantsDefinition': set(),
    }
    pending = list(JOURNEY_PUBLIC_ROOTS)
    while pending:
        hash_value = str(pending.pop())
        if hash_value in wanted['DestinyPresentationNodeDefinition']:
            continue
        definition = nodes.get(hash_value)
        if not definition:
            continue
        wanted['DestinyPresentationNodeDefinition'].add(hash_value)
        children = definition.get('children') or {}
        pending.extend(row.get('presentationNodeHash') for row in children.get('presentationNodes', []) if row.get('presentationNodeHash'))
        wanted['DestinyRecordDefinition'].update(str(row['recordHash']) for row in children.get('records', []) if row.get('recordHash'))
        wanted['DestinyCollectibleDefinition'].update(str(row['collectibleHash']) for row in children.get('collectibles', []) if row.get('collectibleHash'))
        wanted['DestinyMetricDefinition'].update(str(row['metricHash']) for row in children.get('metrics', []) if row.get('metricHash'))
        if definition.get('completionRecordHash'):
            wanted['DestinyRecordDefinition'].add(str(definition['completionRecordHash']))
        if definition.get('objectiveHash'):
            wanted['DestinyObjectiveDefinition'].add(str(definition['objectiveHash']))

    # Metrics are a bounded public table. Keeping the complete table ensures a
    # player's returned metricsRootNodeHash can always be rendered locally.
    wanted['DestinyMetricDefinition'].update((tables.get('DestinyMetricDefinition') or {}).keys())
    for hash_value in wanted['DestinyRecordDefinition']:
        definition = (tables.get('DestinyRecordDefinition') or {}).get(hash_value) or {}
        wanted['DestinyObjectiveDefinition'].update(str(value) for value in definition.get('objectiveHashes', []) if value)
    for hash_value in wanted['DestinyMetricDefinition']:
        definition = (tables.get('DestinyMetricDefinition') or {}).get(hash_value) or {}
        if definition.get('trackingObjectiveHash'):
            wanted['DestinyObjectiveDefinition'].add(str(definition['trackingObjectiveHash']))
    for hash_value in wanted['DestinyCollectibleDefinition']:
        definition = (tables.get('DestinyCollectibleDefinition') or {}).get(hash_value) or {}
        if definition.get('itemHash'):
            wanted['DestinyInventoryItemDefinition'].add(str(definition['itemHash']))
    wanted['DestinyGuardianRankDefinition'].update((tables.get('DestinyGuardianRankDefinition') or {}).keys())
    wanted['DestinyGuardianRankConstantsDefinition'].update((tables.get('DestinyGuardianRankConstantsDefinition') or {}).keys())

    result = {}
    unresolved = {}
    for table, hashes in wanted.items():
        source = tables.get(table) or {}
        result[table] = {
            hash_value: journey_item_projection(source[hash_value]) if table == 'DestinyInventoryItemDefinition' else source[hash_value]
            for hash_value in hashes if hash_value in source
        }
        missing = sorted(hash_value for hash_value in hashes if hash_value not in source)
        if missing:
            unresolved[table] = missing
    missing_roots = [value for value in JOURNEY_PUBLIC_ROOTS if str(value) not in result['DestinyPresentationNodeDefinition']]
    return result, {
        'roots': list(JOURNEY_PUBLIC_ROOTS),
        'definitionCounts': {table: len(rows) for table, rows in result.items()},
        'unresolved': unresolved,
        'missingRoots': missing_roots,
        'complete': not unresolved and not missing_roots,
    }

def main():
    manifest = metadata()
    version = manifest['version']
    required = ['Destiny' + name + 'Definition' for name in TYPES]
    current = OUT / 'index.json'
    if current.exists():
        index = json.loads(current.read_text())
        page_paths = [OUT / f'pages/{page}.json' for page in ('common', 'journey', 'loadout')]
        journey_page = json.loads((OUT / 'pages/journey.json').read_text()) if (OUT / 'pages/journey.json').exists() else {}
        loadout_page = json.loads((OUT / 'pages/loadout.json').read_text()) if (OUT / 'pages/loadout.json').exists() else {}
        page_bundles_current = (
            all(path.exists() for path in page_paths)
            and journey_page.get('journeyCoverage', {}).get('complete') is True
            and loadout_page.get('loadoutCoverage', {}).get('complete') is True
            and loadout_page.get('loadoutCoverage', {}).get('weaponDefinitions') == len(loadout_page.get('weaponDefinitionHashes') or [])
            and bool(loadout_page.get('weaponDefinitionHashes'))
        )
        if index.get('schemaVersion') == 1 and index.get('manifestVersion') == version and set(index.get('tables', {})) == set(required) and page_bundles_current:
            print('BACKEND_MANIFEST_CURRENT=' + version)
            return
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=OUT.parent) as temp:
        staging = Path(temp) / 'data'
        staging.mkdir()
        index = {'schemaVersion': 1, 'manifestVersion': version, 'tables': {}}
        page_rows = {}
        for table in required:
            path = manifest['jsonWorldComponentContentPaths']['en'][table]
            if not path.startswith('/common/destiny2_content/json/'):
                raise ValueError('Unexpected Bungie manifest path')
            rows = fetch('https://www.bungie.net' + path)
            index['tables'][table] = shard_table(rows, staging / table)
            if table in JOURNEY_SOURCE_TYPES or table in ('DestinyActivityDefinition', 'DestinyDestinationDefinition', 'DestinySeasonDefinition', 'DestinySeasonPassDefinition'):
                page_rows[table] = rows
            print(table, index['tables'][table], flush=True)
            if table not in page_rows:
                del rows
        if sum(t['shards'] for t in index['tables'].values()) + 1 > 19000:
            raise ValueError('Backend catalogue exceeds the static asset count budget')
        # Reject a manifest change during generation rather than publish mixed data.
        if metadata()['version'] != version:
            raise ValueError('Bungie manifest changed during preparation; retry required')
        def timestamp(value):
            try:
                return datetime.fromisoformat(str(value).replace('Z', '+00:00')).timestamp()
            except ValueError:
                return None
        now = datetime.now(timezone.utc).timestamp()
        seasons = sorted(page_rows['DestinySeasonDefinition'].values(), key=lambda row: timestamp(row.get('startDate')) or 0, reverse=True)
        active_season = next((row for row in seasons if (timestamp(row.get('startDate')) or now + 1) <= now and (timestamp(row.get('endDate')) is None or now < timestamp(row.get('endDate')))), None)
        if not active_season:
            raise ValueError('Current season is missing from the prepared manifest')
        pass_entries = active_season.get('seasonPassList') or []
        active_pass_entry = next((row for row in pass_entries if (timestamp(row.get('seasonPassStartDate')) is None or timestamp(row.get('seasonPassStartDate')) <= now) and (timestamp(row.get('seasonPassEndDate')) is None or now < timestamp(row.get('seasonPassEndDate')))), pass_entries[-1] if pass_entries else {})
        pass_hash = str(active_pass_entry.get('seasonPassHash') or active_season.get('seasonPassHash') or '')
        season_pass = page_rows['DestinySeasonPassDefinition'].get(pass_hash)
        season_display = active_season.get('displayProperties') or {}
        pass_images = (season_pass or {}).get('images') or {}
        index['currentSeason'] = {
            'manifestVersion': version,
            'season': {
                'hash': active_season.get('hash'),
                'seasonNumber': active_season.get('seasonNumber'),
                'name': season_display.get('name') or '',
                'startDate': active_season.get('startDate'),
                'endDate': active_season.get('endDate'),
                'seasonPassProgressionHash': active_season.get('seasonPassProgressionHash'),
            },
            'pass': {
                'hash': int(pass_hash),
                'rewardProgressionHash': season_pass.get('rewardProgressionHash'),
                'prestigeProgressionHash': season_pass.get('prestigeProgressionHash'),
                'iconPath': pass_images.get('iconImagePath') or '',
                'backgroundImagePath': pass_images.get('themeBackgroundImagePath') or '',
            } if season_pass and pass_hash.isdigit() else None,
        }
        (staging / 'index.json').write_bytes(encode(index))
        forge_index = ROOT / 'astrix-app/data/forge-armour-index.json'
        forge_payload = json.loads(forge_index.read_text(encoding='utf-8'))
        if forge_payload.get('manifestVersion') != version:
            raise ValueError('Forge page bundle does not match the prepared manifest')
        pages = staging / 'pages'
        pages.mkdir()
        (pages / 'common.json').write_bytes(encode({
            'manifestVersion': version,
            'page': 'common',
            'artifactCatalog': forge_payload.get('artifactCatalog') or [],
        }))
        forge_definitions = forge_payload.get('definitions') or {}
        loadout_collectible_hashes = {
            str(row.get('collectibleHash'))
            for row in forge_definitions.values()
            if row.get('collectibleHash')
        }
        collectible_source = page_rows['DestinyCollectibleDefinition']
        loadout_collectibles = {
            hash_value: {
                key: collectible_source[hash_value][key]
                for key in ('hash', 'displayProperties', 'sourceString')
                if key in collectible_source[hash_value]
            }
            for hash_value in loadout_collectible_hashes
            if hash_value in collectible_source
        }
        unresolved_loadout_collectibles = sorted(loadout_collectible_hashes - set(loadout_collectibles))
        weapon_bucket_hashes = {1498876634, 2465295065, 953998645}
        weapon_definition_hashes = sorted(
            int(hash_value)
            for hash_value, row in page_rows['DestinyInventoryItemDefinition'].items()
            if (row.get('inventory') or {}).get('bucketTypeHash') in weapon_bucket_hashes
        )
        if not weapon_definition_hashes:
            raise ValueError('Loadout weapon definition index is empty')
        loadout_coverage = {
            'collectibleHashes': len(loadout_collectible_hashes),
            'collectibleDefinitions': len(loadout_collectibles),
            'unresolvedCollectibleHashes': unresolved_loadout_collectibles,
            'weaponDefinitions': len(weapon_definition_hashes),
            'complete': not unresolved_loadout_collectibles,
        }
        if not loadout_coverage['complete']:
            raise ValueError('Loadout acquisition source catalogue is incomplete')
        (pages / 'loadout.json').write_bytes(encode({
            'manifestVersion': version,
            'page': 'loadout',
            'forgeArmourIndex': forge_payload,
            'weaponDefinitionHashes': weapon_definition_hashes,
            'collectibleDefinitions': loadout_collectibles,
            'loadoutCoverage': loadout_coverage,
        }))
        journey_index_path = ROOT / 'astrix-app/data/journey-index/index.json'
        journey_index = json.loads(journey_index_path.read_text(encoding='utf-8'))
        if journey_index.get('manifestVersion') != version:
            raise ValueError('Journey page bundle does not match the prepared manifest')
        compact_journey_tables = journey_compact_tables(journey_index_path.parent)
        journey_sources = {
            table: {**page_rows.get(table, {}), **compact_journey_tables.get(table, {})}
            for table in set(page_rows) | set(compact_journey_tables)
        }
        journey_tables, journey_coverage = journey_public_tables(journey_sources)
        if not journey_coverage['complete']:
            raise ValueError('Journey public catalogue closure is incomplete')
        endgame = journey_index.get('endgameByDestination') or {}
        destination_hashes = set(endgame)
        activity_hashes = {str(value) for values in endgame.values() for value in values}
        journey_tables['DestinyDestinationDefinition'] = {key: page_rows['DestinyDestinationDefinition'][key] for key in destination_hashes if key in page_rows['DestinyDestinationDefinition']}
        journey_tables['DestinyActivityDefinition'] = {key: page_rows['DestinyActivityDefinition'][key] for key in activity_hashes if key in page_rows['DestinyActivityDefinition']}
        journey_tables['DestinyStatDefinition'] = {
            str(hash_value): page_rows['DestinyStatDefinition'][str(hash_value)]
            for hash_value in GUARDIAN_STAT_HASHES
            if str(hash_value) in page_rows['DestinyStatDefinition']
        }
        if len(journey_tables['DestinyStatDefinition']) != len(GUARDIAN_STAT_HASHES):
            raise ValueError('Journey Guardian stat definitions are incomplete')
        (pages / 'journey.json').write_bytes(encode({
            'manifestVersion': version,
            'page': 'journey',
            'journeyIndex': {'endgameByDestination': endgame},
            'manifestTables': journey_tables,
            'journeyCoverage': journey_coverage,
        }))
        if OUT.exists():
            shutil.rmtree(OUT)
        shutil.move(str(staging), OUT)
    print('BACKEND_MANIFEST_PREPARED=' + version)

if __name__ == '__main__':
    main()
