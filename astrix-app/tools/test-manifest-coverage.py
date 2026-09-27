#!/usr/bin/env python3
"""Offline synthetic pipeline fixtures. No account data or Bungie network calls."""
import contextlib
import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('backend_builder', Path(__file__).with_name('build-backend-manifest.py'))
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
REQUESTED = ('EquipableItemSet', 'LoadoutName', 'LoadoutIcon', 'LoadoutColor',
             'SandboxPerk', 'PlugSet', 'SocketType')
REQUIRED = ['Destiny' + name + 'Definition' for name in builder.TYPES]


class ManifestCoverage(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.out = self.root / 'forge-manifest-worker/data'
        self.stack = contextlib.ExitStack()
        self.stack.enter_context(patch.object(builder, 'ROOT', self.root))
        self.stack.enter_context(patch.object(builder, 'OUT', self.out))
        self.addCleanup(self.temp.cleanup)
        self.addCleanup(self.stack.close)

    def fixture(self, version='fixture-v1'):
        # Explicitly synthetic identities, never shipped as manifest data.
        tables = {table: {'101': {'hash': 101, 'displayProperties': {
            'name': 'Synthetic ' + table, 'icon': '/synthetic/icon.png'}}} for table in REQUIRED}
        tables['DestinyLoadoutNameDefinition'] = {'101': {'hash': 101, 'name': 'Synthetic loadout'}}
        tables['DestinyLoadoutIconDefinition'] = {'101': {'hash': 101, 'iconImagePath': '/synthetic/loadout.png'}}
        tables['DestinyLoadoutColorDefinition'] = {'101': {'hash': 101, 'colorImagePath': '/synthetic/colour.png'}}
        tables['DestinyInventoryItemDefinition']['101']['inventory'] = {'bucketTypeHash': 1498876634}
        tables['DestinyInventoryItemDefinition']['101']['itemType'] = 3
        tables['DestinyPresentationNodeDefinition'] = {
            str(value): {'hash': value, 'children': {}} for value in builder.JOURNEY_PUBLIC_ROOTS
        }
        tables['DestinyStatDefinition'] = {str(h): {'hash': h} for h in builder.GUARDIAN_STAT_HASHES}
        tables['DestinySeasonDefinition'] = {'101': {'hash': 101, 'startDate': '2000-01-01T00:00:00Z', 'seasonPassHash': 101}}
        tables['DestinyMetricDefinition']['101']['trackingObjectiveHash'] = 101
        manifest = {'version': version, 'jsonWorldComponentContentPaths': {'en': {
            table: f'/common/destiny2_content/json/{version}/{table}.json' for table in REQUIRED
        }}}
        return manifest, tables

    def prerequisites(self, version):
        for path, value in {
            'astrix-app/data/forge-armour-index.json': {'manifestVersion': version, 'definitions': {}, 'artifactCatalog': []},
            'astrix-app/data/journey-index/index.json': {'manifestVersion': version, 'endgameByDestination': {}},
        }.items():
            target = self.root / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(value))

    def run_build(self, manifest, tables, end_manifest=None):
        self.prerequisites(manifest['version'])
        paths = {'https://www.bungie.net' + path: table
                 for table, path in manifest['jsonWorldComponentContentPaths']['en'].items()}
        reads = []
        def fetch(url):
            reads.append(url)
            return copy.deepcopy(tables[paths[url]])
        with patch.object(builder, 'metadata', side_effect=[manifest, end_manifest or manifest]) as metadata, patch.object(builder, 'fetch', side_effect=fetch):
            with contextlib.redirect_stdout(io.StringIO()):
                changed = builder.main()
        return changed, reads, metadata.call_count

    def snapshot(self):
        return {str(p.relative_to(self.out)): hashlib.sha256(p.read_bytes()).hexdigest()
                for p in self.out.rglob('*') if p.is_file()}

    def index(self):
        return json.loads((self.out / 'index.json').read_text())

    def test_all_tables_present_lossless_and_version_matched(self):
        manifest, tables = self.fixture()
        changed, reads, checks = self.run_build(manifest, tables)
        self.assertTrue(changed)
        self.assertEqual(len(reads), len(REQUIRED))
        self.assertEqual(len(set(reads)), len(REQUIRED))
        self.assertEqual(checks, 2)
        index = self.index()
        self.assertEqual(set(index['tables']), set(REQUIRED))
        for short in REQUESTED:
            table = 'Destiny' + short + 'Definition'
            descriptor = index['tables'][table]
            self.assertEqual(descriptor['manifestVersion'], manifest['version'])
            self.assertEqual(descriptor['sourcePath'], manifest['jsonWorldComponentContentPaths']['en'][table])
            restored = {}
            for rows in builder.saved_shards(self.out / table, descriptor, manifest['version']):
                restored.update(rows)
            self.assertEqual(restored, tables[table])
            self.assertLessEqual(descriptor['maxShardBytes'], builder.LIMIT)
        for path in (self.out / 'pages').glob('*.json'):
            self.assertEqual(json.loads(path.read_text())['manifestVersion'], manifest['version'])

    def test_same_version_one_check_zero_table_downloads_or_writes(self):
        manifest, tables = self.fixture()
        self.run_build(manifest, tables)
        before = self.snapshot()
        changed, reads, checks = self.run_build(manifest, tables)
        self.assertFalse(changed)
        self.assertEqual(checks, 1)
        self.assertEqual(reads, [])
        self.assertEqual(self.snapshot(), before)

    def test_schema_change_cannot_redownload_same_version(self):
        manifest, tables = self.fixture()
        self.run_build(manifest, tables)
        index = self.index()
        del index['tables']['DestinyLoadoutNameDefinition']
        (self.out / 'index.json').write_text(json.dumps(index))
        before = self.snapshot()
        with patch.object(builder, 'metadata', return_value=manifest), patch.object(builder, 'fetch') as fetch:
            with self.assertRaisesRegex(ValueError, 'awaits a new Bungie version'):
                builder.main()
            fetch.assert_not_called()
        self.assertEqual(self.snapshot(), before)

    def test_retirement_cumulative_names_icons_types_and_reintroduction(self):
        v1, first = self.fixture()
        self.run_build(v1, first)
        v2, second = self.fixture('fixture-v2')
        second['DestinyInventoryItemDefinition'] = {'102': {**first['DestinyInventoryItemDefinition']['101'], 'hash': 102}}
        for short in REQUESTED:
            second['Destiny' + short + 'Definition'] = {}
        self.run_build(v2, second)
        index = self.index()
        for table in ['Destiny' + short + 'Definition' for short in REQUESTED] + ['DestinyInventoryItemDefinition']:
            descriptor = index['retiredTables'][table]
            self.assertEqual(descriptor['manifestVersion'], 'fixture-v2')
            archived = next(builder.saved_shards(self.out / 'retired' / table, descriptor, 'fixture-v2'))['101']
            original = first[table]['101']
            self.assertEqual(archived['type'], table)
            self.assertEqual(archived['name'], original.get('displayProperties', {}).get('name') or original.get('name'))
            self.assertEqual(archived['icon'], original.get('displayProperties', {}).get('icon') or original.get('iconImagePath') or original.get('colorImagePath'))
            self.assertEqual(archived['lastSeenVersion'], 'fixture-v1')
            self.assertEqual(archived['removedInVersion'], 'fixture-v2')
            self.assertNotIn('perks', archived)
        self.run_build(*self.fixture('fixture-v3'))
        self.assertTrue(self.index()['retiredTables'])
        v4 = self.fixture('fixture-v4')[0]
        self.run_build(v4, second)
        archived = json.loads((self.out / 'retired/DestinyLoadoutNameDefinition/0.json').read_text())['101']
        self.assertEqual(archived['lastSeenVersion'], 'fixture-v3')
        self.assertEqual(archived['removedInVersion'], 'fixture-v4')
        changed, reads, _ = self.run_build(v4, second)
        self.assertFalse(changed)
        self.assertFalse(reads)

    def test_version_race_leaves_previous_snapshot_and_archive(self):
        self.run_build(*self.fixture())
        before = self.snapshot()
        with self.assertRaisesRegex(ValueError, 'changed during preparation'):
            self.run_build(*self.fixture('fixture-v2'), end_manifest=self.fixture('fixture-v3')[0])
        self.assertEqual(self.snapshot(), before)

    def test_missing_table_not_misclassified_as_mass_retirement(self):
        manifest, tables = self.fixture()
        self.run_build(manifest, tables)
        before = self.snapshot()
        manifest['version'] = 'fixture-v2'
        del manifest['jsonWorldComponentContentPaths']['en']['DestinyLoadoutColorDefinition']
        with patch.object(builder, 'metadata', return_value=manifest), patch.object(builder, 'fetch') as fetch:
            with self.assertRaisesRegex(ValueError, 'Missing or unexpected'):
                builder.main()
            fetch.assert_not_called()
        self.assertEqual(self.snapshot(), before)

    def test_corrupt_previous_shard_never_discards_history(self):
        self.run_build(*self.fixture())
        (self.out / 'DestinyLoadoutNameDefinition/0.json').write_text('{}')
        before = self.snapshot()
        with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
            self.run_build(*self.fixture('fixture-v2'))
        self.assertEqual(self.snapshot(), before)

    def test_missing_or_mixed_version_cached_shards_fail_without_network(self):
        manifest, tables = self.fixture()
        self.run_build(manifest, tables)
        index = self.index()
        index['tables']['DestinyLoadoutIconDefinition']['manifestVersion'] = 'other-version'
        (self.out / 'index.json').write_text(json.dumps(index))
        with patch.object(builder, 'metadata', return_value=manifest), patch.object(builder, 'fetch') as fetch:
            with self.assertRaisesRegex(ValueError, 'does not match'):
                builder.main()
            fetch.assert_not_called()
        index['tables']['DestinyLoadoutIconDefinition']['manifestVersion'] = manifest['version']
        (self.out / 'index.json').write_text(json.dumps(index))
        (self.out / 'DestinyLoadoutIconDefinition/0.json').unlink()
        with patch.object(builder, 'metadata', return_value=manifest), patch.object(builder, 'fetch') as fetch:
            with self.assertRaises(FileNotFoundError):
                builder.main()
            fetch.assert_not_called()

    def test_publish_failure_restores_previous_snapshot(self):
        self.run_build(*self.fixture())
        before = self.snapshot()
        staging = self.root / 'staging'
        staging.mkdir()
        original = builder.os.replace
        def replace(source, target):
            if source == staging:
                raise OSError('synthetic publish failure')
            return original(source, target)
        with patch.object(builder.os, 'replace', side_effect=replace):
            with self.assertRaisesRegex(OSError, 'publish failure'):
                builder.publish_snapshot(staging)
        self.assertEqual(self.snapshot(), before)

    def test_cached_page_index_consistency_remains_required(self):
        manifest, tables = self.fixture()
        self.run_build(manifest, tables)
        path = self.out / 'pages/loadout-index.json'
        data = json.loads(path.read_text())
        data['weaponDefinitionHashes'] = []
        path.write_text(json.dumps(data))
        with patch.object(builder, 'metadata', return_value=manifest), patch.object(builder, 'fetch') as fetch:
            with self.assertRaisesRegex(ValueError, 'consistency mismatch'):
                builder.main()
            fetch.assert_not_called()

    def test_hourly_schedule_and_noop_deploy_gate(self):
        root = Path(__file__).resolve().parents[2]
        workflow = (root / '.github/workflows/refresh-backend-manifest.yml').read_text()
        self.assertIn("cron: '23 * * * *'", workflow)
        self.assertIn('restore-keys: backend-manifest-v1-', workflow)
        self.assertEqual(workflow.count("if: steps.manifest.outputs.changed == 'true'"), 2)
        auth = (root / 'forge-auth-worker/src/index.ts').read_text()
        service = (root / 'astrix-app/pages/guardian-workspace-v2/guardian-manifest-service.mjs').read_text()
        allowlist = auth[auth.index('const MANIFEST_COMPONENT_TYPES'):auth.index('const MANIFEST_COMPONENT_TYPES')+2200]
        for short in REQUESTED:
            name = 'Destiny' + short + 'Definition'
            self.assertIn(name, allowlist)
            self.assertIn(name, service)


if __name__ == '__main__':
    unittest.main(verbosity=2)
