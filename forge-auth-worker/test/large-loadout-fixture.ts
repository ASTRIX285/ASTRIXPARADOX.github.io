import { readFile } from 'node:fs/promises';
/** Real public Bungie definitions and anonymised DIM selections, expanded to a
 * large inventory/loadout set. No player/account data is captured here. */
export async function largeLoadoutFixture() {
 const root=new URL('../../astrix-app/tools/fixtures/dim-import/',import.meta.url);
 const manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
 const shares=await Promise.all(['fixturea','fixtureb','fixturec'].map(async name=>JSON.parse(await readFile(new URL(name+'.json',root),'utf8')).loadout));
 const items=shares.flatMap(share=>share.equipped.map((item:any)=>({hash:item.hash,definition:manifest.tables.DestinyInventoryItemDefinition[item.hash],socketOverrides:item.socketOverrides||{},plugs:Object.values(item.socketOverrides||{}).map(hash=>manifest.tables.DestinyInventoryItemDefinition[String(hash)])})));
 return {manifest,shares,items};
}
