"""Build public Journey catalogues from pinned Bungie definitions and measured controls.

No availability or Guardian completion is inferred from catalogue membership.
Requires numpy and Pillow. See docs/journey-map-integration.md for inputs.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

APP = Path(__file__).resolve().parents[1]


def read(path):
    return json.loads(Path(path).read_text())


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def canonical(value):
    return value.casefold().replace("’", "'").strip()


def build(args):
    manifest = read(args.manifest_dir / 'bungie-map-manifest.json')
    assert read(APP / 'data/journey-index/index.json')['manifestVersion'] == manifest['version'], 'Manifest snapshot mismatch'
    source = args.manifest_dir / 'bungie'
    destinations = read(source / 'DestinyDestinationDefinition.json')
    graphs = read(source / 'DestinyActivityGraphDefinition.json')
    locations = read(source / 'DestinyLocationDefinition.json')
    types = read(source / 'DestinyActivityTypeDefinition.json')
    activities = {}
    for path in sorted((APP / 'data/journey-index').glob('DestinyActivityDefinition-*.json')):
        activities.update(read(path)['definitions'])
    controls = read(APP / 'data/journey-map-calibration.json')
    registrations = read(APP / 'data/journey-map-registration.json')
    exports = {row['slug']: row for row in read(args.review_dir / 'manifest.json')['maps']}
    out = APP / 'pages/journey/assets/map-data'
    out.mkdir(exist_ok=True)
    evidence = {'manifestVersion': manifest['version'], 'sources': [], 'destinations': {}}
    for table in ['DestinyDestinationDefinition','DestinyActivityGraphDefinition','DestinyLocationDefinition','DestinyActivityTypeDefinition']:
        evidence['sources'].append({'table': table, 'url': 'https://www.bungie.net' + manifest['paths'][table], 'sha256': digest(source / f'{table}.json')})

    def activity(hash_value):
        row = activities.get(str(hash_value), {})
        props = row.get('displayProperties', {})
        if row.get('redacted') or not props.get('name'):
            return None
        return {'hash': int(hash_value), 'name': props['name'], 'description': props.get('description', ''), 'icon': props.get('icon', ''), 'activityType': types.get(str(row.get('activityTypeHash')), {}).get('displayProperties', {}).get('name', '')}

    for key, config in controls.items():
        dest = destinations[str(config['destinationHash'])]
        graph_hashes = [str(x['activityGraphHash']) for x in dest.get('activityGraphEntries', [])]
        nodes = [n for h in graph_hashes for n in graphs.get(h, {}).get('nodes', [])]
        by_node = {n['nodeId']: n for n in nodes}
        registration = None
        proof = {'destinationHash': config['destinationHash'], 'graphHashes': graph_hashes, 'graphNodeCount': len(nodes), 'unnamedNodes': []}
        if config['graphAnchors']:
            master = Image.open(args.review_dir / 'masters' / f'{key}.png')
            native = Image.open(args.review_dir / 'native-references' / f'{key}-source-aligned.png')
            preview = native.copy()
            preview.thumbnail((1672, 1100))
            ratio = np.array(native.size) / np.array(preview.size)
            reg = registrations[key]
            registration = np.array(reg['matrix']).copy()
            registration[:, :2] *= ratio * reg['source_scale']
            if config.get('manualRegistration'):
                manual = np.array(config['manualRegistration'])
                registration = np.linalg.lstsq(np.c_[manual[:, :2], np.ones(len(manual))], manual[:, 2:], rcond=None)[0].T
                residual = np.linalg.norm(np.c_[manual[:, :2], np.ones(len(manual))] @ registration.T - manual[:, 2:], axis=1)
                proof['registrationMaxControlErrorPx'] = round(float(max(residual)), 2)
                proof['registrationMethod'] = 'manual label controls; approximate'
            else:
                proof.update(registrationMethod='SIFT affine RANSAC; approximate', registrationInliers=reg['inliers'], registrationMedianErrorPx=round(reg['median_px'], 2))
            gx = np.array([[by_node[h]['position']['x'], by_node[h]['position']['y'], 1] for h, _, _ in config['graphAnchors']])
            gy = np.array([[x, y] for _, x, y in config['graphAnchors']])
            graph_to_preview = np.linalg.lstsq(gx, gy, rcond=None)[0].T
            proof['graphMaxControlErrorPx'] = round(float(max(np.linalg.norm(gx @ graph_to_preview.T - gy, axis=1))), 2)
            if proof['graphMaxControlErrorPx'] > 12:
                raise ValueError(f'{key}: graph controls disagree')
            proof.update(previewSize=list(preview.size), masterSize=list(master.size), graphToPreview=graph_to_preview.tolist(), previewToMaster=registration.tolist(), sourceReferenceSha256=exports[key]['reference_sha256'], masterSha256=exports[key]['master_sha256'])

        def master_position(mx, my, basis):
            export = exports[key]['exports'][0]
            sx, sy = np.array(export['resized_content_size']) / np.array(master.size)
            ox, oy = export['content_offset']
            px, py = 100 * (mx * sx + ox) / 3840, 100 * (my * sy + oy) / 2160
            if not (1 <= px <= 99 and 1 <= py <= 99):
                return None
            return {'x': round(float(px), 3), 'y': round(float(py), 3), 'basis': basis, 'approximate': True}

        def position(x, y, basis):
            if registration is None:
                return None
            mx, my = registration @ np.array([x, y, 1])
            return master_position(mx, my, basis)

        entries = []
        for node in nodes:
            variants = list({a['hash']: a for ref in node.get('activities', []) if (a := activity(ref['activityHash']))}.values())
            override = node.get('overrideDisplay', {}).get('name')
            if not variants and not override:
                proof['unnamedNodes'].append(node['nodeId'])
                continue
            names = list(dict.fromkeys(a['name'] for a in variants))
            name = override or names[0]
            if override in ['Normal', 'Legendary']:
                name = 'Campaign: ' + override
            type_names = {a['activityType'].casefold() for a in variants}
            kind = 'raid' if 'raid' in type_names else 'dungeon' if 'dungeon' in type_names else 'strike' if any('strike' in t or 'nightfall' in t for t in type_names) else 'activity'
            row = {'id': f'node-{node["nodeId"]}', 'type': kind, 'name': name, 'nodeId': node['nodeId'], 'variants': variants, 'position': None}
            if registration is not None:
                p = node['position']
                px, py = graph_to_preview @ np.array([p['x'], p['y'], 1])
                row['position'] = position(px, py, 'director-graph')
            entries.append(row)

        # Include every named destination bubble, even where no entrance position is known.
        for bubble in dest.get('bubbles', []):
            name = bubble.get('displayProperties', {}).get('name', '')
            if not name or name == 'RESTRICTED':
                continue
            entries.append({'id': f'area-{bubble["hash"]}', 'type': 'area', 'name': name, 'bubbleHash': bubble['hash'], 'variants': [], 'position': None})
        for hash_value, name, x, y in config.get('areaLabels', []):
            row = next(e for e in entries if e.get('bubbleHash') == hash_value and e['name'] == name)
            row['position'] = master_position(x, y, 'artwork-label')

        named_locations = {}
        for hash_value, location in locations.items():
            if location.get('redacted'):
                continue
            for release in location.get('locationReleases', []):
                if release.get('destinationHash') != config['destinationHash']:
                    continue
                props = release.get('displayProperties', {})
                if not props.get('name'):
                    continue
                kind = 'vendor' if location.get('vendorHash') else 'landing' if release.get('spawnPoint') else 'location'
                identity = (kind, canonical(props['name']))
                row = named_locations.setdefault(identity, {'id': f'location-{hash_value}', 'type': kind, 'name': props['name'], 'description': props.get('description', ''), 'locationHashes': [], 'vendorHashes': [], 'variants': [], 'position': None})
                if int(hash_value) not in row['locationHashes']:
                    row['locationHashes'].append(int(hash_value))
                vendor = location.get('vendorHash')
                if vendor and vendor not in row['vendorHashes']:
                    row['vendorHashes'].append(vendor)
                # Only join an explicit graph-node reference, never a similar name.
                linked = next((n for n in entries if n.get('nodeId') == release.get('activityGraphNodeHash')), None)
                if linked and linked.get('position'):
                    row['position'] = linked['position']
        for kind, name, x, y in config['points']:
            row = named_locations.get((kind, canonical(name)))
            if row is None:
                raise ValueError(f'{key}: measured point lacks official definition: {name}')
            row['position'] = position(x, y, 'screenshot-icon')
        entries.extend(named_locations.values())
        # Lost Sector activity definitions link to their matching destination bubble.
        for row in entries:
            if row['type'] != 'area':
                continue
            matched = [activity(h) for h, a in activities.items() if a.get('destinationHash') == config['destinationHash'] and canonical(a.get('displayProperties', {}).get('name', '').split(':')[0]) == canonical(row['name']) and 'lost sector' in types.get(str(a.get('activityTypeHash')), {}).get('displayProperties', {}).get('name', '').casefold()]
            row['variants'] = [v for v in matched if v]
            if row['variants']:
                row['type'] = 'lost-sector'
        entries.sort(key=lambda row: (row['type'], row['name'], row['id']))
        catalogue = {'key': key, 'destinationHash': config['destinationHash'], 'manifestVersion': manifest['version'], 'entries': entries}
        (out / f'{key}.mjs').write_text('// Generated by tools/build-journey-map-data.py. Catalogue presence does not establish availability.\nexport default ' + json.dumps(catalogue, ensure_ascii=False, separators=(',', ':')) + ';\n')
        proof.update(entries=len(entries), positioned=sum(bool(e['position']) for e in entries))
        evidence['destinations'][key] = proof
        print(key, proof['entries'], 'entries,', proof['positioned'], 'positions')
    (APP / 'data/journey-map-provenance.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest-dir', type=Path, required=True)
    parser.add_argument('--review-dir', type=Path, required=True)
    build(parser.parse_args())
