// Public game definitions only. This Worker has no OAuth or account bindings.
// Retired definitions carry identity only, not fabricated gameplay fields.
function retiredIdentity(row,type){
  if(row.type!==type)throw new Error('retirement_type_mismatch');
  const label=typeof row.name==='string'&&row.name?`Retired: ${row.name}`:null;
  const result={hash:row.hash,retired:true,definitionType:type,
    retirement:{name:row.name,icon:row.icon,type,lastSeenVersion:row.lastSeenVersion,removedInVersion:row.removedInVersion},
    displayProperties:{...(label?{name:label}:{}),...(row.icon?{icon:row.icon}:{})}};
  for(const field of ['itemType','itemSubType','itemTypeDisplayName','iconImagePath','colorImagePath']){
    if(Object.hasOwn(row,field))result[field]=row[field];
  }
  if(type==='DestinyLoadoutNameDefinition'&&label)result.name=label;
  return result;
}

async function readDefinitions(env,index,type,hashes,projection='full'){
  const compact=projection==='page'&&index.pageTables?.[type];
  const current=compact||index.tables[type];
  async function read(descriptor,root,wanted){
    if(descriptor.manifestVersion!=null&&descriptor.manifestVersion!==index.manifestVersion)throw new Error('manifest_table_version_mismatch');
    if(!Number.isInteger(descriptor.shards)||descriptor.shards<1)throw new Error('invalid_shard_count');
    const groups=new Map(),definitions={};
    for(const hash of wanted){
      const shard=Number(hash)%descriptor.shards;
      if(!groups.has(shard))groups.set(shard,[]);
      groups.get(shard).push(hash);
    }
    // Read only requested bounded shards, never a complete table/archive.
    await Promise.all([...groups].map(async([shard,keys])=>{
      const response=await env.ASSETS.fetch(new Request(`https://assets/${root}/${shard}.json`));
      if(!response.ok)throw new Error('manifest_shard_unavailable');
      const rows=await response.json();
      for(const hash of keys)if(Object.hasOwn(rows,hash))definitions[hash]=rows[hash];
    }));
    return definitions;
  }
  const definitions=await read(current,compact?`page/${type}`:type,hashes);
  const missing=hashes.filter(hash=>!Object.hasOwn(definitions,hash));
  const archive=index.retiredTables?.[type];
  if(missing.length&&archive){
    const retired=await read(archive,`retired/${type}`,missing);
    for(const [hash,row] of Object.entries(retired))definitions[hash]=retiredIdentity(row,type);
  }
  return definitions;
}
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    const indexResponse=await env.ASSETS.fetch(new Request('https://assets/index.json'));
    if(!indexResponse.ok)return new Response(null,{status:503});
    const index=await indexResponse.json();
    if(request.method==='POST'&&url.pathname==='/resolve'){
      const body=await request.json().catch(()=>null);
      if(body?.version!==index.manifestVersion||!body?.requests||typeof body.requests!=='object')return new Response(null,{status:400});
      const projection=body?.projection==null?'full':String(body.projection);
      if(!['full','page'].includes(projection))return new Response(null,{status:400});
      const entries=Object.entries(body.requests);
      const total=entries.reduce((sum,[,hashes])=>sum+(Array.isArray(hashes)?hashes.length:0),0);
      if(total>20000||entries.some(([type,hashes])=>!index.tables[type]||!Array.isArray(hashes)))return new Response(null,{status:400});
      const tables={};
      await Promise.all(entries.map(async([type,hashes])=>{
        const unique=[...new Set(hashes.map(String))];
        if(unique.some(hash=>!/^\d+$/.test(hash)||Number(hash)<=0||Number(hash)>0xffffffff))throw new Error('invalid_hash');
        tables[type]=await readDefinitions(env,index,type,unique,projection);
      })).catch(()=>null);
      if(Object.keys(tables).length!==entries.length)return new Response(null,{status:503});
      return Response.json({manifestVersion:index.manifestVersion,projection,tables});
    }
    if(request.method!=='GET')return new Response(null,{status:405});
    if(url.pathname==='/status')return Response.json(index);
    // Only these three small official catalogues may be read in full. No Bungie calls.
    if(url.pathname==='/loadout-identifiers'){
      if(url.searchParams.get('version')!==index.manifestVersion)return new Response(null,{status:409});
      const types=['DestinyLoadoutNameDefinition','DestinyLoadoutIconDefinition','DestinyLoadoutColorDefinition'];
      const tables={};
      try{
        for(const type of types){
          const descriptor=index.tables?.[type];
          if(!descriptor||descriptor.manifestVersion!==index.manifestVersion||!Number.isInteger(descriptor.shards)||descriptor.shards<1||descriptor.shards>16||descriptor.definitions>2048)throw new Error('identifier_catalogue_unavailable');
          const rows={};
          for(let shard=0;shard<descriptor.shards;shard++){
            const response=await env.ASSETS.fetch(new Request(`https://assets/${type}/${shard}.json`));
            if(!response.ok)throw new Error('identifier_shard_unavailable');
            Object.assign(rows,await response.json());
          }
          if(Object.keys(rows).length!==descriptor.definitions||Object.values(rows).some(row=>row.retired))throw new Error('identifier_catalogue_incomplete');
          tables[type]=rows;
        }
      }catch{return new Response(null,{status:503});}
      return Response.json({manifestVersion:index.manifestVersion,tables});
    }
    if(url.pathname==='/page-bundle'){
      const page=url.searchParams.get('page');
      if(url.searchParams.get('version')!==index.manifestVersion||!['common','journey','loadout'].includes(page))return new Response(null,{status:400});
      return env.ASSETS.fetch(new Request(`https://assets/pages/${page}.json`));
    }
    if(url.pathname==='/page-index'){
      const page=url.searchParams.get('page');
      if(url.searchParams.get('version')!==index.manifestVersion||!['journey','loadout'].includes(page))return new Response(null,{status:400});
      return env.ASSETS.fetch(new Request(`https://assets/pages/${page}-index.json`));
    }
    if(url.pathname!=='/definitions')return new Response(null,{status:404});
    if(url.searchParams.get('version')!==index.manifestVersion)return Response.json({error:'manifest_version_changed'},{status:409});
    const type=url.searchParams.get('type'),table=index.tables[type];
    const hashes=[...new Set((url.searchParams.get('hashes')||'').split(','))];
    if(!table||hashes.length>48||hashes.some(h=>!/^\d+$/.test(h)||Number(h)<=0||Number(h)>0xffffffff))return new Response(null,{status:400});
    let definitions;
    try{definitions=await readDefinitions(env,index,type,hashes);}
    catch{return new Response(null,{status:503});}
    return Response.json({manifestVersion:index.manifestVersion,type,definitions,unresolved:hashes.filter(h=>!definitions[h])});
  }
};
