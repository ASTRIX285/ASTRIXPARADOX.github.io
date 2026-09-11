import {requestPreparedPagePayload} from '../../core/prepared-page-client.mjs?v=20260907-shared-page-load-1&transport=20260911-compact-plugs-1';
import {paradoxDefinitionId} from '../../core/bungie-item-identity.mjs';

const WEAPON_BUCKETS=new Set([1498876634,2465295065,953998645]);
const pick=(value,keys)=>Object.fromEntries(keys.filter(key=>value?.[key]!==undefined).map(key=>[key,value[key]]));
const statRows=value=>value?Object.fromEntries(Object.entries(value).map(([hash,row])=>[hash,pick(row,['statHash','value'])])):null;

// Only public definition fields and equipped item evidence cross this boundary.
// Never serialize the account envelope, session, request, or response headers.
export function weaponDiagnostics(payload,{capturedAt=new Date().toISOString()}={}){
  const profile=payload?.profile;
  if(!profile?.characterEquipment?.data)throw new Error('Equipped weapon data is unavailable.');
  const definitions=payload.definitions||{};
  const components=profile.itemComponents||{};
  const hashes=new Set();
  const missing=[];
  const weapons=[];
  for(const [characterId,equipment] of Object.entries(profile.characterEquipment.data)){
    const carried=profile.characterInventories?.data?.[characterId];
    if(!carried)missing.push({characterId,component:'characterInventories'});
    const items=[...(equipment?.items||[]).map(item=>({item,location:'equipped'})),...(carried?.items||[]).map(item=>({item,location:'carried'}))];
    for(const {item,location} of items){
      if(!WEAPON_BUCKETS.has(Number(item.bucketHash)))continue;
      const id=item.itemInstanceId;
      const read=type=>{
        const row=components[type]?.data?.[id];
        if(!row)missing.push({itemInstanceId:id,component:type});
        return row;
      };
      const instance=read('instances');
      const stats=read('stats');
      const sockets=read('sockets');
      const reusable=read('reusablePlugs');
      hashes.add(String(item.itemHash));
      const plug=row=>{
        if(row?.plugItemHash)hashes.add(String(row.plugItemHash));
        return pick(row,['plugHash','plugItemHash','isEnabled','isVisible','enabled','canInsert','enableFailIndexes','insertFailIndexes']);
      };
      const socketRows=sockets?.sockets?.map((row,socketIndex)=>{
        if(row?.plugHash)hashes.add(String(row.plugHash));
        return {socketIndex,...plug(row)};
      })??null;
      weapons.push({
        characterId,
        location,
        classType:profile.characters?.data?.[characterId]?.classType??null,
        paradoxId:paradoxDefinitionId('DestinyInventoryItemDefinition',item.itemHash),
        item:pick(item,['itemHash','itemInstanceId','bucketHash','state','versionNumber','overrideStyleItemHash']),
        instance:instance?{...pick(instance,['gearTier','itemLevel','quality','isEquipped','damageType','damageTypeHash']),primaryStat:instance.primaryStat?pick(instance.primaryStat,['statHash','value']):null}:null,
        stats:statRows(stats?.stats),
        sockets:socketRows,
        reusablePlugs:reusable?.plugs?Object.fromEntries(Object.entries(reusable.plugs).map(([index,rows])=>[index,rows.map(plug)])):null
      });
    }
  }
  if(!weapons.length)throw new Error('No equipped weapons were returned.');
  const publicDefinitions={};
  for(const hash of hashes){
    const definition=definitions[hash];
    if(!definition){missing.push({definitionHash:hash,component:'definitions'});continue;}
    publicDefinitions[hash]={
      paradoxId:paradoxDefinitionId('DestinyInventoryItemDefinition',hash),
      ...pick(definition,['hash','displayProperties','itemType','itemSubType','itemTypeDisplayName','inventory','investmentStats','stats','sockets','plug','traitIds','traitHashes','tooltipNotifications'])
    };
  }
  const statHashes=new Set(weapons.flatMap(weapon=>Object.keys(weapon.stats||{})));
  for(const definition of Object.values(publicDefinitions))for(const row of definition.investmentStats||[])statHashes.add(String(row.statTypeHash));
  const statDefinitions={};
  for(const hash of statHashes){
    const definition=payload.statDefinitions?.[hash]||payload.manifestTables?.DestinyStatDefinition?.[hash];
    if(definition)statDefinitions[hash]=pick(definition,['hash','displayProperties','aggregationType','hasComputedBlock']);
    else missing.push({definitionHash:hash,component:'statDefinitions'});
  }
  return {
    schemaVersion:1,
    source:'authenticated-character-page-response',
    capturedAt,
    manifestVersion:payload.pageReady?.manifestVersion??null,
    displaySnapshot:pick(payload.displaySnapshot,['source','fetchedAt','maxAgeMs']),
    scope:'Equipped and carried weapons across all returned characters; excludes armour and vault.',
    weapons,definitions:publicDefinitions,statDefinitions,missing
  };
}

function downloadJson(data){
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const link=document.createElement('a');
  link.href=url;
  link.download=`astrix-weapon-diagnostics-${data.capturedAt.replace(/[:.]/g,'-')}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60_000);
}

export function installWeaponDiagnostics(button,status,{request=requestPreparedPagePayload,download=downloadJson}={}){
  if(!button||!status)return;
  if(button.dataset?.diagnosticsBound)return;
  if(button.dataset)button.dataset.diagnosticsBound='true';
  button.addEventListener('click',async()=>{
    if(button.disabled)return;
    button.disabled=true;
    status.textContent='Loading equipped weapon diagnostics...';
    try{
      const data=weaponDiagnostics(await request('character'));
      await download(data);
      status.textContent=`Download prepared for ${data.weapons.length} equipped and carried weapons${data.missing.length?' with missing data flagged':''}. Attach the JSON file to the engineering chat.`;
    }catch{
      status.textContent='Could not export equipped weapon data from your current connection. No file was downloaded. Your sign-in has not been changed.';
    }finally{
      button.disabled=false;
    }
  });
}

export function mountWeaponDiagnostics(root=document.querySelector('.gear-weapons')){
  if(!root)return;
  let button=document.getElementById('downloadWeaponDiagnostics'),status=document.getElementById('weaponDiagnosticsStatus');
  let bar=root.querySelector('.weapon-diagnostics');
  if(!bar){bar=document.createElement('div');bar.className='weapon-diagnostics';root.prepend(bar);}
  if(!button){button=document.createElement('button');button.id='downloadWeaponDiagnostics';button.type='button';button.textContent='Download weapon diagnostics';}
  if(!status){status=document.createElement('p');status.id='weaponDiagnosticsStatus';status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.textContent='Export equipped and carried weapon data. No login credentials are included.';}
  button.setAttribute('aria-describedby',status.id);bar.append(button,status);
  installWeaponDiagnostics(button,status);
}
if(typeof document!=='undefined')mountWeaponDiagnostics();
