import json, urllib.request
PERKS=[4217417017,4217417018,4217417019,4217417020,4217417021,4217417022,4217417023,3619040072,3619040075,3619040074,3619040077,3619040076,3619040079,3619040078,3834273543,3834273540,3834273541,3834273538,3834273539,3834273536,3834273537,2903198438,2903198437,2903198436,2903198435,2903198434,2903198433,2903198432,2742146821,2742146822,2742146823,2742146816,2742146817,2742146818,2742146819]
WEAPONS=[4019651319,2965080304,17096506]
def getdef(kind,h):
 u=f'https://www.bungie.net/Platform/Destiny2/Manifest/{kind}/{h}/'
 req=urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'})
 with urllib.request.urlopen(req,timeout=30) as r:return json.loads(r.read().decode())['Response']
for h in PERKS:
 d=getdef('DestinyInventoryItemDefinition',h); p=d.get('displayProperties') or {}
 print('PERK='+json.dumps({'hash':h,'name':p.get('name'),'description':p.get('description')},separators=(',',':')))
for h in WEAPONS:
 d=getdef('DestinyInventoryItemDefinition',h); p=d.get('displayProperties') or {}
 print('WEAPON='+json.dumps({'hash':h,'name':p.get('name'),'itemTypeDisplayName':d.get('itemTypeDisplayName'),'itemSubType':d.get('itemSubType'),'damageTypeHashes':d.get('damageTypeHashes'),'defaultDamageTypeHash':d.get('defaultDamageTypeHash')},separators=(',',':')))
