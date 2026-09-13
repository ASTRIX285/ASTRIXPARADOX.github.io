#!/usr/bin/env python3
"""Reproducible, exhaustive Bungie weapon reference catalogue, grouped by type.

Catalogue pools describe possible plugs, not ownership or permission to insert.
Use --download in CI, or --sqlite FILE --metadata FILE for an audited snapshot.
"""
from __future__ import annotations
import argparse
import collections
import datetime as dt
import hashlib
import io
import json
import sqlite3
import tempfile
import urllib.request
import zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
LABELS={6:'Auto-Rifle',7:'Shotgun',8:'Machine Gun',9:'Hand Cannon',10:'Rocket Launcher',11:'Fusion Rifle',12:'Sniper Rifle',13:'Pulse Rifle',14:'Scout Rifle',17:'Sidearm',18:'Sword',22:'Linear Fusion Rifle',23:'Grenade Launcher',24:'Submachine Gun',25:'Trace Rifle',31:'Combat Bow',33:'Glaive'}
SECTIONS={4241085061:'perks',2685412949:'mods',3956125808:'intrinsic',2048875504:'cosmetics'}

def encoded(value):return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
def stable_id(kind,hash_value):return f'paradox:bungie:{kind}:{hash_value}'
def write(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    data=encoded(value)+b'\n'
    if not path.exists() or path.read_bytes()!=data:path.write_bytes(data)
    return {'path':str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else path.name,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)}
def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'ASTRIX-PARADOX/weapon-audit'}),timeout=180) as response:return response.read()
def read_table(db,name):
    return {int(row['hash']):row for (raw,) in db.execute(f'SELECT json FROM {name}') for row in [json.loads(raw)]}
def pick(row,keys):return {key:row[key] for key in keys if key in row}
def compact_item(row):
    out=pick(row,('hash','displayProperties','itemType','itemSubType','itemTypeDisplayName','itemTypeAndTierDisplayName','inventory','quality','iconWatermark','iconWatermarkShelved','iconWatermarkFeatured','isFeaturedItem','isHolofoil','isAdept','plug','traitIds','traitHashes','itemCategoryHashes','perks','investmentStats','defaultDamageType','defaultDamageTypeHash','damageTypeHashes','breakerType','breakerTypeHash','equippingBlock','collectibleHash','redacted','blacklisted'))
    out['paradoxId']=stable_id('DestinyInventoryItemDefinition',row['hash'])
    if 'inventory' in out:out['inventory']=pick(out['inventory'],('bucketTypeHash','tierType','tierTypeName','tierTypeHash'))
    if 'quality' in out:out['quality']=pick(out['quality'],('currentVersion','versions','displayVersionWatermarkIcons'))
    if 'plug' in out:out['plug']=pick(out['plug'],('plugCategoryHash','plugCategoryIdentifier','isDummyPlug','plugStyle','plugAvailability','insertionRules','enabledRules'))
    if 'equippingBlock' in out:out['equippingBlock']=pick(out['equippingBlock'],('ammoType','equipmentSlotTypeHash'))
    return out

def build(db,metadata,output):
    version=metadata['Response']['version']
    tables={name:read_table(db,name) for name in ('DestinyInventoryItemDefinition','DestinyPlugSetDefinition','DestinySandboxPerkDefinition','DestinySocketCategoryDefinition','DestinySocketTypeDefinition')}
    inventory=tables['DestinyInventoryItemDefinition'];sets=tables['DestinyPlugSetDefinition'];sandbox=tables['DestinySandboxPerkDefinition']
    weapons=sorted((row for row in inventory.values() if row.get('itemType')==3),key=lambda row:row['hash'])
    armour=sorted((row for row in inventory.values() if row.get('itemType')==2),key=lambda row:row['hash'])
    if not weapons:raise RuntimeError('Official manifest contains no weapons')
    references=[];plugs=set();set_hashes=set();socket_hashes=set();category_hashes=set();perk_hashes=set();layouts={};entry_definitions={};grouped=collections.defaultdict(dict)
    def reference(table,hash_value,owner,path):
        if isinstance(hash_value,int) and hash_value>0:
            references.append({'table':table,'hash':hash_value,'owner':owner,'path':path})
    for row in weapons:
        key=str(row['hash']);sockets=row.get('sockets') or {}
        compact_sockets={'socketCategories':sockets.get('socketCategories',[]),'intrinsicSockets':sockets.get('intrinsicSockets',[]),'socketEntries':[{**pick(s,('socketTypeHash','singleInitialItemHash','reusablePlugSetHash','randomizedPlugSetHash','plugSources','defaultVisible')),'reusablePlugItems':[pick(p,('plugItemHash','currentlyCanRoll')) for p in s.get('reusablePlugItems',[])]} for s in sockets.get('socketEntries',[])]}
        entry_keys=[]
        for socket_entry in compact_sockets.pop('socketEntries'):
            entry_key=hashlib.sha256(encoded(socket_entry)).hexdigest()[:20];entry_definitions[entry_key]=socket_entry;entry_keys.append(entry_key)
        compact_sockets['socketEntryKeys']=entry_keys
        layout_key=hashlib.sha256(encoded(compact_sockets)).hexdigest()[:20]
        layouts[layout_key]=compact_sockets
        sections={str(index):SECTIONS.get(category['socketCategoryHash'],'unclassified') for category in sockets.get('socketCategories',[]) for index in category.get('socketIndexes',[])}
        archetypes=set();socket_catalogue=[]
        for category in sockets.get('socketCategories',[]):
            h=category['socketCategoryHash'];category_hashes.add(h);reference('DestinySocketCategoryDefinition',h,key,'sockets.socketCategories')
        for index,entry in enumerate(sockets.get('socketEntries',[])):
            initial=entry.get('singleInitialItemHash');pool=set();h=entry.get('socketTypeHash');socket_hashes.add(h);reference('DestinySocketTypeDefinition',h,key,f'socket:{index}')
            if initial:pool.add(initial)
            for plug in entry.get('reusablePlugItems',[]):
                if plug.get('plugItemHash'):pool.add(plug['plugItemHash'])
            for field in ('reusablePlugSetHash','randomizedPlugSetHash'):
                set_hash=entry.get(field)
                if not set_hash:continue
                set_hashes.add(set_hash);reference('DestinyPlugSetDefinition',set_hash,key,f'socket:{index}.{field}')
                pool.update(p['plugItemHash'] for p in sets.get(set_hash,{}).get('reusablePlugItems',[]) if p.get('plugItemHash'))
            for h in sorted(pool):reference('DestinyInventoryItemDefinition',h,key,f'socket:{index}.pool')
            plugs.update(pool)
            section=sections.get(str(index),'unclassified')
            if section=='intrinsic':archetypes.update(pool)
            socket_catalogue.append({'socketIndex':index,'paradoxId':f'{stable_id("DestinyInventoryItemDefinition",row["hash"])}:socket:{index}','socketTypeHash':entry.get('socketTypeHash'),'section':section,'defaultVisible':entry.get('defaultVisible'),'initialPlugHash':initial,'reusablePlugSetHash':entry.get('reusablePlugSetHash'),'randomizedPlugSetHash':entry.get('randomizedPlugSetHash'),'poolSize':len(pool)})
        for entry in sockets.get('intrinsicSockets',[]):
            h=entry.get('plugItemHash')
            if h:plugs.add(h);archetypes.add(h);reference('DestinyInventoryItemDefinition',h,key,'sockets.intrinsicSockets')
            h=entry.get('socketTypeHash')
            if h:socket_hashes.add(h);reference('DestinySocketTypeDefinition',h,key,'sockets.intrinsicSockets')
        for perk in row.get('perks',[]):
            h=perk.get('perkHash')
            if h:perk_hashes.add(h);reference('DestinySandboxPerkDefinition',h,key,'perks')
        subtype=row.get('itemSubType',0);label=LABELS.get(subtype,row.get('itemTypeDisplayName') or f'Unclassified {subtype}')
        result=compact_item(row)
        result.update({'weaponType':label,'bungieWeaponType':row.get('itemTypeDisplayName',''),'socketLayoutKey':layout_key,'socketCatalogue':socket_catalogue,'archetypePlugHashes':sorted(archetypes)})
        grouped[label.lower().replace(' ','-')][key]=result
    # Include every plug in every weapon pool, including legacy/non-rollable plugs.
    # Resolve their sandbox effects by hash without deduplicating equal names.
    # Bungie's weapon-mod category includes barrels, frames, traits and other
    # weapon plugs. Retain definitions not linked by any current weapon pool.
    linked_plugs=set(plugs)
    plugs.update(h for h,row in inventory.items() if row.get('plug') and 610365472 in row.get('itemCategoryHashes',[]))
    unlinked_plugs=sorted(plugs-linked_plugs)
    for h in sorted(plugs):
        for perk in inventory.get(h,{}).get('perks',[]):
            ph=perk.get('perkHash')
            if ph:perk_hashes.add(ph);reference('DestinySandboxPerkDefinition',ph,str(h),'perks')
    icon_hashes={row.get('displayProperties',{}).get('iconHash') for row in weapons+[inventory[h] for h in plugs if h in inventory]+[sandbox[h] for h in perk_hashes if h in sandbox]}
    icon_definitions={}
    for h in sorted(h for h in icon_hashes if isinstance(h,int) and h>0):
        signed=h if h<2**31 else h-2**32
        result=db.execute('SELECT json FROM DestinyIconDefinition WHERE id=?',(signed,)).fetchone()
        if result:icon_definitions[h]=json.loads(result[0])
    tables['DestinyIconDefinition']=icon_definitions
    for h in sorted(icon_hashes-{None,0}):reference('DestinyIconDefinition',h,'displayProperties','iconHash')
    components={
        'plugDefinitions':{str(h):compact_item(inventory[h]) for h in sorted(plugs) if h in inventory},
        'plugSetDefinitions':{str(h):{'hash':h,'paradoxId':stable_id('DestinyPlugSetDefinition',h),'reusablePlugItems':[pick(p,('plugItemHash','currentlyCanRoll','craftingRequirements')) for p in sets[h].get('reusablePlugItems',[])]} for h in sorted(set_hashes) if h in sets},
        'sandboxPerks':{str(h):{**sandbox[h],'paradoxId':stable_id('DestinySandboxPerkDefinition',h)} for h in sorted(perk_hashes) if h in sandbox},
        'socketTypeDefinitions':{str(h):tables['DestinySocketTypeDefinition'][h] for h in sorted(socket_hashes) if h in tables['DestinySocketTypeDefinition']},
        'socketCategoryDefinitions':{str(h):tables['DestinySocketCategoryDefinition'][h] for h in sorted(category_hashes) if h in tables['DestinySocketCategoryDefinition']},
        'socketLayouts':layouts,
        'socketEntries':entry_definitions,
        'iconDefinitions':{str(h):{**row,'paradoxId':stable_id('DestinyIconDefinition',h)} for h,row in icon_definitions.items()},
        'equipmentWatermarks':{str(row['hash']):{**pick(row,('hash','itemType','iconWatermark','iconWatermarkShelved','iconWatermarkFeatured','isFeaturedItem')),'quality':pick(row.get('quality',{}),('currentVersion','versions','displayVersionWatermarkIcons')),'paradoxId':stable_id('DestinyInventoryItemDefinition',row['hash'])} for row in weapons+armour}
    }
    # Each file is bounded for independent retrieval; browser pages need not load
    # the catalogue merely to display an already resolved owned item.
    files=[];component_files={}
    for name,records in components.items():
        entries=list(records.items());component_files[name]=[]
        for start in range(0,len(entries),200):
            filename=f'{name}-{start//200:03d}.json'
            file=write(output/filename,{'schemaVersion':1,'manifestVersion':version,name:dict(entries[start:start+200])});files.append(file);component_files[name].append(filename)
    by_type=[]
    for slug,records in sorted(grouped.items()):
        filename=f'weapons-{slug}.json';files.append(write(output/filename,{'schemaVersion':1,'manifestVersion':version,'weapons':records}))
        row=next(iter(records.values()));by_type.append({'key':slug,'label':row['weaponType'],'bungieLabel':row['bungieWeaponType'],'itemSubType':row['itemSubType'],'weapons':len(records),'weaponHashes':[int(h) for h in records],'file':filename})
    missing=[ref for ref in references if ref['hash'] not in tables[ref['table']]]
    missing_unique=sorted({(ref['table'],ref['hash']) for ref in missing})
    icon_rows=[(kind,h,row) for kind,rows in [('weapons',{r['hash']:r for r in weapons}),('plugs',{h:inventory[h] for h in plugs if h in inventory}),('sandboxPerks',{h:sandbox[h] for h in perk_hashes if h in sandbox})] for h,row in rows.items()]
    icons={kind:{'definitions':0,'withIconPath':0,'withoutIconPath':[],'iconHashReferences':0} for kind in ('weapons','plugs','sandboxPerks')}
    for kind,h,row in icon_rows:
        display=row.get('displayProperties') or {};state=icons[kind];state['definitions']+=1
        if display.get('icon'):state['withIconPath']+=1
        else:state['withoutIconPath'].append(h)
        if display.get('iconHash'):state['iconHashReferences']+=1
    counts={'weapons':len(weapons),'weaponTypes':len(by_type),'armourWatermarksAudited':len(armour),'weaponSockets':sum(len(r['socketCatalogue']) for rows in grouped.values() for r in rows.values()),'plugs':len(plugs),'unlinkedWeaponPlugs':len(unlinked_plugs),'plugSets':len(set_hashes),'sandboxPerks':len(perk_hashes),'iconDefinitions':len(icon_definitions),'references':len(references),'resolvedReferences':len(references)-len(missing),'unresolvedUniqueReferences':len(missing_unique)}
    report={'schemaVersion':1,'manifestVersion':version,'source':'https://www.bungie.net/Platform/Destiny2/Manifest/','sourceSqlitePath':metadata['Response'].get('mobileWorldContentPaths',{}).get('en'),'counts':counts,'weaponTypes':by_type,'coveragePercent':round(100*(len(references)-len(missing))/len(references),4) if references else 0,'allWeaponsIndexed':True,'allReferencesResolved':not missing,'unresolvedReferences':[{'table':t,'hash':h} for t,h in missing_unique],'unresolvedOccurrences':missing,'icons':icons,'watermarkCoverage':{'withReleaseWatermark':sum(bool(r.get('iconWatermark') or any(r.get('quality',{}).get('displayVersionWatermarkIcons',[]))) for r in weapons+armour),'totalEquipment':len(weapons)+len(armour)},'limitations':['Catalogue plug pools do not establish instance ownership or insertability.','Bungie definitions that omit artwork remain explicitly iconless; no icon is invented.','Redacted or API-absent items cannot be recovered from the public manifest.','Icon paths are mapped from Bungie definitions; remote image availability is a separate check.'],'validation':{'catalogue':'pass' if not missing else 'unresolved-source-references','liveAuthenticatedVisual':'pending','deployment':'pending'}}
    write(output/'index.json',{'schemaVersion':1,'manifestVersion':version,'source':report['source'],'weaponTypes':by_type,'components':component_files,'files':files,'counts':counts})
    report['unlinkedWeaponPlugHashes']=unlinked_plugs
    write(output.parent/'paradox-weapon-audit-report.json',report)
    print(json.dumps({'manifestVersion':version,**counts,'coveragePercent':report['coveragePercent'],'output':str(output)}))
    return report

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--sqlite');parser.add_argument('--metadata');parser.add_argument('--download',action='store_true');parser.add_argument('--output',type=Path,default=ROOT/'astrix-app/data/weapon-catalogue');args=parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='paradox-manifest-') as temp:
        if args.download:
            metadata=json.loads(fetch('https://www.bungie.net/Platform/Destiny2/Manifest/'))
            relative=metadata['Response']['mobileWorldContentPaths']['en'];raw=fetch('https://www.bungie.net'+relative)
            if raw[:2]==b'PK':
                with zipfile.ZipFile(io.BytesIO(raw)) as archive:
                    names=[n for n in archive.namelist() if not n.endswith('/')]
                    if len(names)!=1:raise RuntimeError('Unexpected Bungie manifest archive')
                    raw=archive.read(names[0])
            sqlite_path=Path(temp)/'world.content';sqlite_path.write_bytes(raw)
        else:
            if not args.sqlite or not args.metadata:parser.error('Use --download or both --sqlite and --metadata')
            metadata=json.loads(Path(args.metadata).read_text());sqlite_path=Path(args.sqlite)
        with sqlite3.connect(f'file:{sqlite_path}?mode=ro',uri=True) as db:build(db,metadata,args.output)

if __name__=='__main__':main()
