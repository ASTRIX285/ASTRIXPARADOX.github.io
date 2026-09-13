import json,urllib.request,sqlite3,zipfile,io,gzip,datetime
from pathlib import Path
UA={'User-Agent':'Mozilla/5.0'}
def get(url):
 req=urllib.request.Request(url,headers=UA)
 with urllib.request.urlopen(req,timeout=120) as r:return r.read()
def signed(h): return h if h < 2**31 else h-2**32
meta=json.loads(get('https://www.bungie.net/Platform/Destiny2/Manifest/').decode())['Response']
mp=meta['mobileWorldContentPaths']['en']; payload=get('https://www.bungie.net'+mp); db=Path('/tmp/world.content')
if payload[:2]==b'PK':
 with zipfile.ZipFile(io.BytesIO(payload)) as z: db.write_bytes(z.read([n for n in z.namelist() if not n.endswith('/')][0]))
elif payload[:2]==b'\x1f\x8b': db.write_bytes(gzip.decompress(payload))
else: db.write_bytes(payload)
con=sqlite3.connect(str(db)); cur=con.cursor()
seasons=[]
for (raw,) in cur.execute('select json from DestinySeasonDefinition'):
 d=json.loads(raw); seasons.append(d)
seasons.sort(key=lambda x:x.get('seasonNumber',-1), reverse=True)
print('SEASONS='+json.dumps([{k:s.get(k) for k in ['hash','seasonNumber','startDate','endDate','displayProperties']} for s in seasons[:8]],separators=(',',':')))
for s in seasons[:5]:
 sh=s.get('hash'); sn=s.get('seasonNumber'); rows=[]
 for (raw,) in cur.execute('select json from DestinyInventoryItemDefinition'):
  d=json.loads(raw)
  if d.get('seasonHash')==sh and (d.get('preview') or {}).get('artifactHash'):
   rows.append({'hash':d.get('hash'),'name':(d.get('displayProperties') or {}).get('name'),'seasonHash':d.get('seasonHash'),'artifactHash':(d.get('preview') or {}).get('artifactHash')})
 print('ARTIFACT_CANDIDATES='+json.dumps({'seasonNumber':sn,'seasonHash':sh,'rows':rows},separators=(',',':')))
con.close()
