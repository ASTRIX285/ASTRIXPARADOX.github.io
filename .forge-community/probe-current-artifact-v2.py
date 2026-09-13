import json,urllib.request,sqlite3,zipfile,io,gzip,datetime
from pathlib import Path
UA={'User-Agent':'Mozilla/5.0'}
def get(url):
 req=urllib.request.Request(url,headers=UA)
 with urllib.request.urlopen(req,timeout=120) as r:return r.read()
def signed(h): return h if h < 2**31 else h-2**32
def parse_dt(v): return datetime.datetime.fromisoformat(v.replace('Z','+00:00')) if v else None
meta=json.loads(get('https://www.bungie.net/Platform/Destiny2/Manifest/').decode())['Response']
mp=meta['mobileWorldContentPaths']['en']; payload=get('https://www.bungie.net'+mp); db=Path('/tmp/world.content')
if payload[:2]==b'PK':
 with zipfile.ZipFile(io.BytesIO(payload)) as z: db.write_bytes(z.read([n for n in z.namelist() if not n.endswith('/')][0]))
elif payload[:2]==b'\x1f\x8b': db.write_bytes(gzip.decompress(payload))
else: db.write_bytes(payload)
con=sqlite3.connect(str(db)); cur=con.cursor(); now=datetime.datetime.now(datetime.timezone.utc)
seasons=[json.loads(r[0]) for r in cur.execute('select json from DestinySeasonDefinition')]
current=[s for s in seasons if parse_dt(s.get('startDate')) and parse_dt(s.get('endDate')) and parse_dt(s['startDate'])<=now<parse_dt(s['endDate'])]
if len(current)!=1: raise RuntimeError('current season candidates='+str(len(current)))
s=current[0]; sh=s['hash']; candidates=[]
for (raw,) in cur.execute('select json from DestinyInventoryItemDefinition'):
 d=json.loads(raw); ah=(d.get('preview') or {}).get('artifactHash')
 if d.get('seasonHash')==sh and ah: candidates.append({'hash':d.get('hash'),'name':(d.get('displayProperties') or {}).get('name'),'artifactHash':ah})
artifacts=sorted({x['artifactHash'] for x in candidates})
if len(artifacts)!=1: raise RuntimeError('artifact candidates='+json.dumps(candidates))
ah=artifacts[0]; row=cur.execute('select json from DestinyArtifactDefinition where id=?',(signed(ah),)).fetchone()
if not row: raise RuntimeError('artifact missing')
a=json.loads(row[0])
print('CURRENT='+json.dumps({'seasonNumber':s['seasonNumber'],'seasonHash':sh,'seasonName':(s.get('displayProperties') or {}).get('name'),'artifactInventory':candidates,'artifactHash':ah},separators=(',',':')))
print('ARTIFACT_DEF='+json.dumps({'hash':a.get('hash'),'displayProperties':a.get('displayProperties'),'tiers':a.get('tiers')},separators=(',',':')))
con.close()
