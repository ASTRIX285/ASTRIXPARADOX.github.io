#!/usr/bin/env node
// Aetherium Worker: whitelist, five regions, param validation, KV cache, rate limit, CORS and
// upstream failure handling. Offline only: fetch is mocked with the #451 EU fixtures and the derived region fixtures.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createWorker,isWhitelistedUpstream,normaliseCharacterId,REGIONS,RATE_LIMIT,CACHE_TTL_SECONDS} from '../../aetherium-worker/src/index.mjs';
import {readFileSync as readText} from 'node:fs';
import {REGION_TABLE,deriveServers} from './fixtures/aion2/derive-region-fixtures.mjs';

const dir=fileURLToPath(new URL('./fixtures/aion2/eu/',import.meta.url));
const load=name=>JSON.parse(readFileSync(`${dir}${name}.json`,'utf8'));
const fixtures={
  search:load('astrix285-search'),
  info:load('astrix285-info'),
  equipment:load('astrix285-equipment'),
  item:load('astrix285-item-mainhand'),
  daevanion:load('astrix285-daevanion-11')
};
const [hit]=fixtures.search.list;
const ENCODED_ID=hit.characterId; // ends in %3D, as the search returns it
const PLAIN_ID=decodeURIComponent(ENCODED_ID);
const BASE='https://aion2.astrixparadox.com';
const SITE='https://astrixparadox.com';

function upstreamBody(url){
  const u=new URL(url);
  if(u.hostname==='api-search.plaync.com') return fixtures.search;
  if(u.pathname==='/en-us/api/gameinfo/servers') return deriveServers(u.searchParams.get('region'));
  return {'/api/character/info':fixtures.info,'/api/character/equipment':fixtures.equipment,
    '/api/character/equipment/item':fixtures.item,'/api/character/daevanion/detail':fixtures.daevanion}[u.pathname];
}

function mockFetch(override){
  const calls=[];
  const fn=async(url,init)=>{
    calls.push({url,init});
    if(override) return override(url,init);
    return new Response(JSON.stringify(upstreamBody(url)),{status:200,headers:{'Content-Type':'application/json'}});
  };
  fn.calls=calls;
  return fn;
}

function memoryKv(){
  const store=new Map();
  return {
    store,
    puts:[],
    async get(key,type){const v=store.get(key);return v===undefined?null:(type==='json'?JSON.parse(v):v);},
    async put(key,value,opts){this.puts.push({key,opts});store.set(key,value);}
  };
}

function req(path,{origin=SITE,ip='203.0.113.7',method='GET',headers={}}={}){
  const h=new Headers(headers);
  if(origin) h.set('Origin',origin);
  if(ip) h.set('CF-Connecting-IP',ip);
  return new Request(`${BASE}${path}`,{method,headers:h});
}

const charQs=`serverId=1308&characterId=${encodeURIComponent(ENCODED_ID)}&region=eu`;
let clock=Date.UTC(2026,9,5,12,0,0);
const now=()=>clock;

// 1. Happy paths: each route hits exactly the documented upstream URL, with only fixed headers.
{
  const fetch=mockFetch();
  const worker=createWorker({fetch,now});
  const env={AION2_CACHE:memoryKv()};

  let res=await worker.fetch(req('/aion2/search?name=ASTRIX285&region=eu',{headers:{Cookie:'a=b',Authorization:'Bearer x','User-Agent':'visitor'}}),env);
  assert.equal(res.status,200);
  let body=await res.json();
  assert.deepEqual(body.list,fixtures.search.list);
  assert.deepEqual(body.pagination,fixtures.search.pagination);
  assert.equal(body.meta.cache,'miss');
  assert.equal(body.meta.region,'eu');
  assert.equal(body.meta.fetchedAt,new Date(clock).toISOString());
  assert.equal(fetch.calls[0].url,'https://api-search.plaync.com/aion2global/search/v2/character?keyword=ASTRIX285&page=1&size=40&region=eu&localeInfo=en-US');
  const sent=new Headers(fetch.calls[0].init.headers);
  assert.deepEqual([...sent.keys()].sort(),['accept','user-agent'],'Only fixed User-Agent and Accept go upstream');
  assert.notEqual(sent.get('user-agent'),'visitor');
  assert.equal(fetch.calls[0].init.redirect,'manual');

  fetch.calls.length=0;
  res=await worker.fetch(req(`/aion2/character?${charQs}`),env);
  assert.equal(res.status,200);
  body=await res.json();
  assert.deepEqual(body.info,fixtures.info);
  assert.deepEqual(body.equipment,fixtures.equipment);
  const q=`lang=en-US&region=eu&serverId=1308&characterId=${encodeURIComponent(PLAIN_ID)}`;
  assert.deepEqual(fetch.calls.map(c=>c.url).sort(),[
    `https://aion2.plaync.com/api/character/equipment?${q}`,
    `https://aion2.plaync.com/api/character/info?${q}`
  ]);
  assert.ok(fetch.calls[0].url.endsWith('%3D'),'characterId encoded exactly once (no %253D)');
  assert.ok(!fetch.calls[0].url.includes('%25'),'characterId never double-encoded');

  fetch.calls.length=0;
  res=await worker.fetch(req(`/aion2/item?${charQs}&id=110150028&enchantLevel=2&slotPos=1`),env);
  assert.equal(res.status,200);
  assert.equal((await res.json()).id,fixtures.item.id);
  assert.equal(fetch.calls[0].url,`https://aion2.plaync.com/api/character/equipment/item?${q}&id=110150028&enchantLevel=2&slotPos=1`);

  fetch.calls.length=0;
  res=await worker.fetch(req(`/aion2/daevanion?${charQs}&boardId=11`),env);
  assert.equal(res.status,200);
  assert.equal((await res.json()).nodeList.length,fixtures.daevanion.nodeList.length);
  assert.equal(fetch.calls[0].url,`https://aion2.plaync.com/api/character/daevanion/detail?${q}&boardId=11`);

  // Raw (decoded) id and single-encoded id normalise to the same upstream call.
  assert.equal(normaliseCharacterId(ENCODED_ID),PLAIN_ID);
  assert.equal(normaliseCharacterId(PLAIN_ID),PLAIN_ID);
}

// 2. Whitelist: unknown paths, wrong methods and bad params never reach upstream.
{
  const fetch=mockFetch();
  const worker=createWorker({fetch,now});
  const env={};
  const expect=async(path,status,error,opts)=>{
    const res=await worker.fetch(req(path,opts),env);
    assert.equal(res.status,status,`${path} -> ${status}`);
    assert.equal((await res.json()).error,error,`${path} -> ${error}`);
  };
  await expect('/aion2/characters',404,'not_found');
  await expect('/aion2/list',404,'not_found');
  await expect('/api/character/info?'+charQs,404,'not_found');
  await expect('/aion2/search%2F..%2Fcharacter',404,'not_found');
  await expect('/aion2/search/',404,'not_found');
  await expect('/aion2/search/extra?name=ASTRIX285',404,'not_found');
  await expect('/',404,'not_found');
  await expect('/aion2/search?name=ASTRIX285',405,'method_not_allowed',{method:'POST'});
  await expect('/aion2/search?name=',400,'invalid_name');
  await expect('/aion2/search',400,'invalid_name');
  await expect('/aion2/search?name='+'a'.repeat(25),400,'invalid_name');
  await expect('/aion2/search?name=ab%26size%3D1000',400,'invalid_name');
  await expect('/aion2/search?name=%3Cscript%3E',400,'invalid_name');
  await expect('/aion2/search?name=ASTRIX285&region=kr',400,'invalid_region');
  for(const bad of ['na','kr','tw','asia','sa','us','ru','']){
    if(bad==='') continue;
    await expect(`/aion2/search?name=ASTRIX285&region=${bad}`,400,'invalid_region');
    await expect(`/aion2/servers?region=${bad}`,400,'invalid_region');
    await expect(`/aion2/character?serverId=1308&characterId=${encodeURIComponent(ENCODED_ID)}&region=${bad}`,400,'invalid_region');
  }
  await expect('/aion2/search?name=ASTRIX285&region=__proto__',400,'invalid_region');
  await expect(`/aion2/character?serverId=13a8&characterId=${encodeURIComponent(ENCODED_ID)}`,400,'invalid_serverId');
  await expect(`/aion2/character?characterId=${encodeURIComponent(ENCODED_ID)}`,400,'invalid_serverId');
  await expect('/aion2/character?serverId=1308',400,'invalid_characterId');
  await expect('/aion2/character?serverId=1308&characterId=abc',400,'invalid_characterId');
  await expect('/aion2/character?serverId=1308&characterId=..%2F..%2Fadmin%3Fx%3D1',400,'invalid_characterId');
  await expect('/aion2/character?serverId=1308&characterId=%E0%A4%A',400,'invalid_characterId');
  await expect(`/aion2/item?${charQs}&id=1x&enchantLevel=2&slotPos=1`,400,'invalid_id');
  await expect(`/aion2/item?${charQs}&id=110150028&enchantLevel=-1&slotPos=1`,400,'invalid_enchantLevel');
  await expect(`/aion2/item?${charQs}&id=110150028&enchantLevel=2`,400,'invalid_slotPos');
  await expect(`/aion2/daevanion?${charQs}&boardId=eleven`,400,'invalid_boardId');
  await expect(`/aion2/daevanion?${charQs}`,400,'invalid_boardId');
  assert.equal(fetch.calls.length,0,'No rejected request reaches upstream');

  assert.deepEqual(Object.keys(REGIONS).sort(),['as','eu','la','nae','naw'],'Only the five official codes');
  for(const code of Object.keys(REGIONS)) assert.equal(REGIONS[code].enabled,true,code);
  assert.equal(Object.hasOwn(REGIONS,'na'),false);
  assert.ok(isWhitelistedUpstream('https://aion2.plaync.com/en-us/api/gameinfo/servers?lang=en-US&region=eu'));
  assert.equal(isWhitelistedUpstream('https://aion2.plaync.com/en-us/api/gameinfo/other'),false);
  assert.equal(isWhitelistedUpstream('https://api-search.plaync.com/en-us/api/gameinfo/servers'),false);
  assert.ok(isWhitelistedUpstream('https://aion2.plaync.com/api/character/info?x=1'));
  assert.ok(isWhitelistedUpstream('https://api-search.plaync.com/aion2global/search/v2/character?keyword=a'));
  for(const bad of ['http://aion2.plaync.com/api/character/info','https://aion2.plaync.com/api/character/list',
    'https://evil.example/api/character/info','https://aion2.plaync.com:8443/api/character/info',
    'https://api-search.plaync.com/aion2global/search/v2/guild','https://aion2.plaync.com.evil.example/api/character/info']){
    assert.equal(isWhitelistedUpstream(bad),false,bad);
  }
}

// 3. Cache: second identical request is a hit with no upstream call and its real age.
{
  const fetch=mockFetch();
  const worker=createWorker({fetch,now});
  const kv=memoryKv();
  const env={AION2_CACHE:kv};
  const waits=[];
  const ctx={waitUntil:p=>waits.push(p)};
  const firstAt=clock;
  let res=await worker.fetch(req(`/aion2/character?${charQs}`),env,ctx);
  assert.equal((await res.json()).meta.cache,'miss');
  await Promise.all(waits);
  assert.equal(fetch.calls.length,2);
  assert.equal(kv.puts.length,1);
  assert.equal(kv.puts[0].opts.expirationTtl,CACHE_TTL_SECONDS);
  assert.equal(CACHE_TTL_SECONDS,600,'10 minute cache');

  clock+=120_000;
  // Same character via the plain id, different param order and an ignored extra param: same key.
  res=await worker.fetch(req(`/aion2/character?region=eu&characterId=${encodeURIComponent(PLAIN_ID)}&serverId=1308&v=2`),env,ctx);
  assert.equal(res.status,200);
  const body=await res.json();
  assert.equal(body.meta.cache,'hit');
  assert.equal(body.meta.fetchedAt,new Date(firstAt).toISOString(),'Cached data keeps its original fetch time');
  assert.deepEqual(body.info,fixtures.info);
  assert.equal(fetch.calls.length,2,'Cache hit makes no upstream call');

  // Failures are never cached.
  const failing=createWorker({fetch:mockFetch(()=>new Response('nope',{status:500})),now});
  const kv2=memoryKv();
  await failing.fetch(req('/aion2/search?name=ASTRIX285'),{AION2_CACHE:kv2});
  assert.equal(kv2.puts.length,0);
}

// 4. Rate limit: 60 a minute per CF-Connecting-IP (raised from 30 for five regions), then 429, reset after the window.
{
  const fetch=mockFetch();
  const worker=createWorker({fetch,now});
  const env={AION2_CACHE:memoryKv()};
  assert.equal(RATE_LIMIT.limit,60,'60 a minute');
  assert.equal(RATE_LIMIT.windowMs,60_000);
  const toml=readText(new URL('../../aetherium-worker/wrangler.toml',import.meta.url),'utf8');
  assert.match(toml,/simple = \{ limit = 60, period = 60 \}/,'wrangler.toml binding matches the Worker');
  for(let i=0;i<RATE_LIMIT.limit;i++){
    const res=await worker.fetch(req('/aion2/search?name=ASTRIX285',{ip:'198.51.100.1'}),env);
    assert.equal(res.status,200,`request ${i+1} allowed`);
  }
  let res=await worker.fetch(req('/aion2/search?name=ASTRIX285',{ip:'198.51.100.1'}),env);
  assert.equal(res.status,429);
  assert.equal((await res.json()).error,'rate_limited');
  assert.equal(res.headers.get('Retry-After'),'60');
  assert.equal(res.headers.get('Access-Control-Allow-Origin'),SITE,'429 still readable by the site');
  res=await worker.fetch(req('/aion2/search?name=ASTRIX285',{ip:'198.51.100.2'}),env);
  assert.equal(res.status,200,'Other IPs are not affected');
  clock+=60_000;
  res=await worker.fetch(req('/aion2/search?name=ASTRIX285',{ip:'198.51.100.1'}),env);
  assert.equal(res.status,200,'Window resets after a minute');

  // Workers rate limit binding is honoured when configured.
  const bound=createWorker({fetch,now});
  const seen=[];
  res=await bound.fetch(req('/aion2/search?name=ASTRIX285',{ip:'198.51.100.9'}),{
    AION2_RATE_LIMITER:{limit:async({key})=>{seen.push(key);return {success:false};}}
  });
  assert.equal(res.status,429);
  assert.deepEqual(seen,['198.51.100.9']);
}

// 5. CORS: allow the site and localhost, deny everything else.
{
  const fetch=mockFetch();
  const worker=createWorker({fetch,now});
  for(const origin of ['https://astrixparadox.com','https://www.astrixparadox.com','http://localhost:8000','http://localhost','http://127.0.0.1:5500']){
    const pre=await worker.fetch(req('/aion2/search?name=ASTRIX285',{origin,method:'OPTIONS',headers:{'Access-Control-Request-Method':'GET'}}),{});
    assert.equal(pre.status,204,`${origin} preflight`);
    assert.equal(pre.headers.get('Access-Control-Allow-Origin'),origin);
    assert.equal(pre.headers.get('Access-Control-Allow-Methods'),'GET, OPTIONS');
    assert.equal(pre.headers.get('Access-Control-Allow-Credentials'),null,'No credentials');
    const res=await worker.fetch(req('/aion2/search?name=ASTRIX285',{origin}),{});
    assert.equal(res.status,200);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'),origin);
    assert.match(res.headers.get('Vary'),/Origin/);
  }
  const before=fetch.calls.length;
  for(const origin of ['https://evil.example','http://astrixparadox.com','https://astrixparadox.com.evil.example',
    'https://localhost:8000','http://localhost.evil.example','http://127.0.0.2:80','null']){
    const pre=await worker.fetch(req('/aion2/search?name=ASTRIX285',{origin,method:'OPTIONS'}),{});
    assert.equal(pre.status,403,`${origin} preflight denied`);
    assert.equal(pre.headers.get('Access-Control-Allow-Origin'),null);
    const res=await worker.fetch(req('/aion2/search?name=ASTRIX285',{origin}),{});
    assert.equal(res.status,403,`${origin} denied`);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'),null);
    assert.equal((await res.json()).error,'origin_not_allowed');
  }
  assert.equal(fetch.calls.length,before,'Denied origins never reach upstream');
}

// 6. Upstream failure, timeout and shape change all return 502 armory_unavailable.
{
  const cases=[
    ['HTTP 500',()=>new Response('{}',{status:500})],
    ['HTTP 404',()=>new Response('{}',{status:404})],
    ['redirect',()=>new Response(null,{status:302,headers:{Location:'https://evil.example/'}})],
    ['network error',()=>{throw new TypeError('network');}],
    ['not JSON',()=>new Response('<html>maintenance</html>',{status:200})],
    ['JSON null',()=>new Response('null',{status:200})],
    ['JSON array',()=>new Response('[]',{status:200})]
  ];
  for(const [label,impl] of cases){
    const worker=createWorker({fetch:mockFetch(impl),now});
    for(const path of ['/aion2/search?name=ASTRIX285',`/aion2/character?${charQs}`,`/aion2/item?${charQs}&id=1&enchantLevel=0&slotPos=1`,`/aion2/daevanion?${charQs}&boardId=11`]){
      const res=await worker.fetch(req(path),{});
      assert.equal(res.status,502,`${label} ${path}`);
      assert.deepEqual(await res.json(),{error:'armory_unavailable'});
    }
  }

  // Timeout: upstream never answers, the abort signal fires.
  const hang=createWorker({timeoutMs:20,now,fetch:mockFetch((url,init)=>new Promise((_,reject)=>{
    init.signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})));
  }))});
  const t=await hang.fetch(req('/aion2/search?name=ASTRIX285'),{});
  assert.equal(t.status,502);
  assert.deepEqual(await t.json(),{error:'armory_unavailable'});

  // Shape change: drop the expected top-level key from each upstream body in turn.
  const drops=[
    ['/aion2/search?name=ASTRIX285','api-search.plaync.com','list'],
    ['/aion2/search?name=ASTRIX285','api-search.plaync.com','pagination'],
    [`/aion2/character?${charQs}`,'/api/character/info','profile'],
    [`/aion2/character?${charQs}`,'/api/character/equipment','equipment'],
    [`/aion2/item?${charQs}&id=110150028&enchantLevel=2&slotPos=1`,'/api/character/equipment/item','id'],
    [`/aion2/daevanion?${charQs}&boardId=11`,'/api/character/daevanion/detail','nodeList']
  ];
  for(const [path,match,key] of drops){
    const worker=createWorker({now,fetch:mockFetch(url=>{
      const body={...upstreamBody(url)};
      if(url.includes(match)&&(match.startsWith('/')?new URL(url).pathname===match:true)) delete body[key];
      return new Response(JSON.stringify(body),{status:200});
    })});
    const res=await worker.fetch(req(path),{});
    assert.equal(res.status,502,`missing ${key} on ${path}`);
    assert.deepEqual(await res.json(),{error:'armory_unavailable'});
  }
}

// 7. No route walks characters: search always asks for page 1, size 40, whatever the visitor sends.
{
  const fetch=mockFetch();
  const worker=createWorker({fetch,now});
  await worker.fetch(req('/aion2/search?name=ASTRIX285&page=7&size=1000'),{});
  const u=new URL(fetch.calls[0].url);
  assert.equal(u.searchParams.get('page'),'1');
  assert.equal(u.searchParams.get('size'),'40');
  assert.equal(u.searchParams.getAll('page').length,1);
}

// 8. Five regions: each is accepted on every route, sends only its own code upstream, and caches on its own.
{
  assert.deepEqual(REGION_TABLE.map(row=>row.code).sort(),Object.keys(REGIONS).sort(),'Test table matches the allowlist');
  const fetch=mockFetch();
  const worker=createWorker({fetch,now});
  const kv=memoryKv();
  const env={AION2_CACHE:kv};
  for(const {code,servers} of REGION_TABLE){
    fetch.calls.length=0;
    let res=await worker.fetch(req(`/aion2/search?name=ASTRIX285&region=${code}`),env);
    assert.equal(res.status,200,`${code} search`);
    assert.equal((await res.json()).meta.region,code);
    assert.equal(new URL(fetch.calls[0].url).searchParams.get('region'),code);
    assert.equal(new URL(fetch.calls[0].url).searchParams.get('localeInfo'),'en-US');

    fetch.calls.length=0;
    res=await worker.fetch(req(`/aion2/character?serverId=1308&characterId=${encodeURIComponent(ENCODED_ID)}&region=${code}`),env);
    assert.equal(res.status,200,`${code} character`);
    assert.equal(fetch.calls.length,2);
    for(const call of fetch.calls){
      const u=new URL(call.url);
      assert.equal(u.hostname,'aion2.plaync.com','Same host in every region');
      assert.equal(u.searchParams.get('region'),code);
      assert.equal(u.searchParams.get('lang'),'en-US');
    }

    fetch.calls.length=0;
    res=await worker.fetch(req(`/aion2/servers?region=${code}`),env);
    assert.equal(res.status,200,`${code} servers`);
    const body=await res.json();
    assert.equal(body.serverList.length,servers,`${code} has ${servers} servers`);
    assert.equal(body.meta.region,code);
    assert.equal(fetch.calls.length,1);
    assert.equal(fetch.calls[0].url,`https://aion2.plaync.com/en-us/api/gameinfo/servers?lang=en-US&region=${code}`);
  }
  // A cache key per region: the same character in two regions is two upstream reads and two entries.
  const keys=new Set(kv.puts.map(put=>put.key));
  assert.equal(keys.size,kv.puts.length,'No two regions share a cache entry');
  assert.equal(kv.puts.length,REGION_TABLE.length*3);
  const before=fetch.calls.length;
  let res=await worker.fetch(req(`/aion2/servers?region=nae`),env);
  assert.equal((await res.json()).meta.cache,'hit','Repeat read is a hit');
  assert.equal(fetch.calls.length,before);
  res=await worker.fetch(req(`/aion2/servers?region=naw`),env);
  assert.equal((await res.json()).serverList.length,10,'NA West list is not the NA East list');
  // No region means Europe, and an unknown one is refused before any upstream call.
  fetch.calls.length=0;
  res=await worker.fetch(req('/aion2/servers'),{});
  assert.equal((await res.json()).meta.region,'eu');
  assert.ok(fetch.calls[0].url.endsWith('region=eu'));
  fetch.calls.length=0;
  res=await worker.fetch(req('/aion2/servers?region=na'),{});
  assert.equal(res.status,400);
  assert.equal(fetch.calls.length,0,'An unknown code never reaches upstream (it would silently answer with the NA East list)');
}

console.log('aetherium worker tests pass');
