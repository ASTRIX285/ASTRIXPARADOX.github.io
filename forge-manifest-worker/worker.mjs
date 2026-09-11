// Public game definitions only. This Worker has no OAuth or account bindings.
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    const indexResponse=await env.ASSETS.fetch(new Request('https://assets/index.json'));
    if(!indexResponse.ok)return new Response(null,{status:503});
    const index=await indexResponse.json();
    if(request.method==='POST'&&url.pathname==='/resolve'){
      const body=await request.json().catch(()=>null);
      if(body?.version!==index.manifestVersion||!body?.requests||typeof body.requests!=='object')return new Response(null,{status:400});
      const entries=Object.entries(body.requests);
      const total=entries.reduce((sum,[,hashes])=>sum+(Array.isArray(hashes)?hashes.length:0),0);
      if(total>20000||entries.some(([type,hashes])=>!index.tables[type]||!Array.isArray(hashes)))return new Response(null,{status:400});
      const tables={};
      await Promise.all(entries.map(async([type,hashes])=>{
        const table=index.tables[type],unique=[...new Set(hashes.map(String))];
        if(unique.some(hash=>!/^\d+$/.test(hash)||Number(hash)<=0||Number(hash)>0xffffffff))throw new Error('invalid_hash');
        const groups=new Map();
        for(const hash of unique){const shard=Number(hash)%table.shards;if(!groups.has(shard))groups.set(shard,[]);groups.get(shard).push(hash);}
        const definitions={};
        await Promise.all([...groups].map(async([shard,wanted])=>{
          const response=await env.ASSETS.fetch(new Request(`https://assets/${type}/${shard}.json`));
          if(!response.ok)throw new Error('manifest_shard_unavailable');
          const rows=await response.json();
          for(const hash of wanted)if(rows[hash])definitions[hash]=rows[hash];
        }));
        tables[type]=definitions;
      })).catch(()=>null);
      if(Object.keys(tables).length!==entries.length)return new Response(null,{status:503});
      return Response.json({manifestVersion:index.manifestVersion,tables});
    }
    if(request.method!=='GET')return new Response(null,{status:405});
    if(url.pathname==='/status')return Response.json(index);
    if(url.pathname==='/page-bundle'){
      const page=url.searchParams.get('page');
      if(url.searchParams.get('version')!==index.manifestVersion||!['common','journey','loadout'].includes(page))return new Response(null,{status:400});
      return env.ASSETS.fetch(new Request(`https://assets/pages/${page}.json`));
    }
    if(url.pathname==='/page-index'){
      const page=url.searchParams.get('page');
      if(url.searchParams.get('version')!==index.manifestVersion||page!=='loadout')return new Response(null,{status:400});
      return env.ASSETS.fetch(new Request('https://assets/pages/loadout-index.json'));
    }
    if(url.pathname!=='/definitions')return new Response(null,{status:404});
    if(url.searchParams.get('version')!==index.manifestVersion)return Response.json({error:'manifest_version_changed'},{status:409});
    const type=url.searchParams.get('type'),table=index.tables[type];
    const hashes=[...new Set((url.searchParams.get('hashes')||'').split(','))];
    if(!table||hashes.length>48||hashes.some(h=>!/^\d+$/.test(h)||Number(h)<=0||Number(h)>0xffffffff))return new Response(null,{status:400});
    const groups=new Map();
    for(const hash of hashes){const shard=Number(hash)%table.shards;if(!groups.has(shard))groups.set(shard,[]);groups.get(shard).push(hash);}
    const definitions={};
    // Each shard is <= 2 MiB. Never parse a whole Bungie definition table here.
    for(const [shard,wanted] of groups){
      const response=await env.ASSETS.fetch(new Request(`https://assets/${type}/${shard}.json`));
      if(!response.ok)return new Response(null,{status:503});
      const rows=await response.json();
      for(const hash of wanted)if(rows[hash])definitions[hash]=rows[hash];
    }
    return Response.json({manifestVersion:index.manifestVersion,type,definitions,unresolved:hashes.filter(h=>!definitions[h])});
  }
};
