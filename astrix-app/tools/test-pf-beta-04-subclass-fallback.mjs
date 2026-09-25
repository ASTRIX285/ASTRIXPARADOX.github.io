import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ROOT=new URL('../',import.meta.url);
const FIXTURES_URL=new URL('data/paradox-forge/beta/ASTRIX_Paradox_Forge_Beta_Fixtures_v1.json',ROOT);
const IDENTITIES_URL=new URL('data/paradox-forge/beta/beta-component-identities.json',ROOT);
const MANIFEST_URL=new URL('data/paradox-forge/beta/beta-bungie-manifest-cache.json',ROOT);
const TRAIT_DIRECTION_URL=new URL('data/paradox-forge/beta/beta-bungie-manifest-cache-trait-direction-extension.json',ROOT);
const LOADER_URL=new URL('pages/guardian-workspace-v2/guardian-fixture-loader.mjs',ROOT);
const ENGINE_URL=new URL('pages/guardian-workspace-v2/guardian-paradox-engine.mjs',ROOT);

const BASELINE={high:3,medium:13,insufficient:7,low:0,totalLinks:35};
const readJson=async url=>JSON.parse(await readFile(url,'utf8'));
const fixtureLibrary=await readJson(FIXTURES_URL);
const identityLibrary=await readJson(IDENTITIES_URL);
const manifestLibrary=await readJson(MANIFEST_URL);
const identityByHash=new Map((identityLibrary.identities??[]).map(row=>[String(Number(row.bungieHash)),row]));

const directSubclassFixtures=[];
const fallbackFixtures=[];
for(const fixture of fixtureLibrary.fixtures??[]){
  const direct=(fixture.rawDim?.equipped??[]).some(row=>
    fixture.subclassHash!=null&&Number(row.hash)===Number(fixture.subclassHash)
  );
  if(direct)directSubclassFixtures.push(fixture.fixtureId);
  else fallbackFixtures.push(fixture.fixtureId);
}
assert.deepEqual(fallbackFixtures,['PF-BETA-04'],'Only PF-BETA-04 should require subclass fallback');
assert.equal(
  directSubclassFixtures.length,
  (fixtureLibrary.fixtures?.length??0)-fallbackFixtures.length,
  'Every fixture except PF-BETA-04 must retain its normal direct subclass path'
);

const listeners=new Map();
globalThis.document={
  readyState:'loading',
  addEventListener(type,handler){
    const rows=listeners.get(type)??[];
    rows.push(handler);
    listeners.set(type,rows);
  },
  dispatchEvent(event){
    for(const handler of listeners.get(event.type)??[])handler(event);
    return true;
  },
  getElementById(){return null;},
  querySelector(){return null;}
};
globalThis.CustomEvent=class CustomEvent{
  constructor(type,init={}){this.type=type;this.detail=init.detail;}
};

globalThis.fetch=async url=>{
  const value=String(url);
  if(value.includes('/bungie/manifest/definition')){
    const requestUrl=new URL(value),hash=requestUrl.searchParams.get('hash');
    const cached=manifestLibrary.inventoryItems?.[String(hash)]??null,identity=identityByHash.get(String(hash))??null;
    const display=cached?.display||{name:identity?.name??identity?.displayName??'',description:identity?.description??'',icon:identity?.icon??''};
    const definition=cached||identity?{...cached,hash:Number(hash),itemType:cached?.itemType,displayProperties:display}:null;
    return definition?{ok:true,status:200,json:async()=>({definition})}:{ok:false,status:404,json:async()=>({})};
  }
  let target=null;
  if(value.includes('ASTRIX_Paradox_Forge_Beta_Fixtures_v1.json'))target=FIXTURES_URL;
  else if(value.includes('beta-component-identities.json'))target=IDENTITIES_URL;
  else if(value.includes('beta-bungie-manifest-cache-trait-direction-extension.json'))target=TRAIT_DIRECTION_URL;
  else if(value.includes('beta-bungie-manifest-cache.json'))target=MANIFEST_URL;
  if(!target)return {ok:false,status:404,json:async()=>({})};
  const data=await readJson(target);
  return {ok:true,status:200,json:async()=>data};
};

const [{loadBetaFixture},{analyzeGuardianBuild}]=await Promise.all([
  import(LOADER_URL.href),
  import(ENGINE_URL.href)
]);

// Prompt 19 all-page regression: main's old single-definition HTTP mock no longer
// feeds the prepared-payload manifest service. Seed the same fixture definitions;
// keep every subclass, direction and full-fixture regression assertion unchanged.
const {guardianManifest}=await import(new URL('pages/guardian-workspace-v2/guardian-manifest-service.mjs',ROOT));
const definitions=Object.fromEntries([...new Set([...Object.keys(manifestLibrary.inventoryItems??{}),...identityByHash.keys()])].map(hash=>{
  const cached=manifestLibrary.inventoryItems?.[hash]??null,identity=identityByHash.get(hash)??null;
  const display=cached?.display||{name:identity?.name??identity?.displayName??'',description:identity?.description??'',icon:identity?.icon??''};
  return [hash,{...cached,hash:Number(hash),itemType:cached?.itemType,displayProperties:display}];
}));
guardianManifest.seedPayload({definitions});

const detail=await loadBetaFixture('PF-BETA-04');
const aspectRows=detail.aspects.map(row=>({hash:Number(row.hash),name:row.name,description:row.description,traitIds:row.traitIds??row.official?.traitIds??[]}));
assert.ok(aspectRows.some(row=>row.hash===4194622037&&row.name==='Tempest Strike'),'Tempest Strike must resolve from PF-BETA-04 socketOverrides');
assert.ok(aspectRows.some(row=>row.hash===4194622036&&row.name==='Flow State'),'Flow State must resolve from PF-BETA-04 socketOverrides');

const analysis=analyzeGuardianBuild(detail);
assert.ok(analysis.buildLoop.length>0,'PF-BETA-04 must produce a non-zero buildLoop after subclass recovery');
const forward=analysis.buildLoop.find(link=>
  Number(link.from?.hash)===4194622037&&link.output==='jolt'&&Number(link.to?.hash)===4194622036
);
assert.ok(forward,'Expected Tempest Strike -> jolt -> Flow State link is missing');
assert.ok(String(forward.source).includes('runtime-traitid-parsing'),'PF-BETA-04 forward jolt link must include runtime-traitid-parsing evidence');
assert.equal(forward.evidence?.directionalAnchor,'bungie-direction-description','PF-BETA-04 trait direction must be anchored by separate official Bungie direction evidence');
assert.equal(
  analysis.buildLoop.some(link=>Number(link.from?.hash)===4194622036&&link.output==='jolt'&&Number(link.to?.hash)===4194622037),
  false,
  'Flow State must not be inferred as a jolt producer into Tempest Strike'
);
assert.equal(
  (analysis.candidateRelationships??[]).some(row=>row.effect==='jolt'&&row.items?.some(x=>Number(x.hash)===4194622037)&&row.items?.some(x=>Number(x.hash)===4194622036)),
  false,
  'The PF-BETA-04 jolt pair has independent direction evidence and must not remain an unresolved candidate'
);

const fullRegression=[];
const distribution={high:0,medium:0,insufficient:0,low:0,totalLinks:0};
const suspicious=[];
for(const fixture of fixtureLibrary.fixtures??[]){
  const normalized=await loadBetaFixture(fixture.fixtureId);
  const result=analyzeGuardianBuild(normalized);
  distribution[result.confidence.level]=(distribution[result.confidence.level]??0)+1;
  distribution.totalLinks+=result.buildLoop.length;

  const keyRows=new Map();
  const keyCounts=new Map();
  const isTraitOnly=link=>{
    const sources=(link?.evidenceSources??[]).map(row=>row?.source).filter(Boolean);
    return String(link?.source)==='runtime-traitid-parsing' || (sources.length>0&&sources.every(source=>source==='runtime-traitid-parsing'));
  };
  for(const link of result.buildLoop){
    const key=`${Number(link.from?.hash)}|${link.output}|${Number(link.to?.hash)}`;
    const reverse=`${Number(link.to?.hash)}|${link.output}|${Number(link.from?.hash)}`;
    const reverseLink=keyRows.get(reverse);
    if(reverseLink&&(isTraitOnly(link)||isTraitOnly(reverseLink))){
      suspicious.push({fixtureId:fixture.fixtureId,type:'trait-created-symmetric',link:link.chain,reverse:reverseLink.chain});
    }
    keyRows.set(key,link);
    keyCounts.set(key,(keyCounts.get(key)??0)+1);
  }
  for(const [key,count] of keyCounts){
    if(count>1)suspicious.push({fixtureId:fixture.fixtureId,type:'duplicate',key,count});
  }

  fullRegression.push({
    fixtureId:fixture.fixtureId,
    confidence:result.confidence.level,
    blockers:result.confidence.blockers,
    buildLoopCount:result.buildLoop.length,
    traitLinks:result.buildLoop.filter(x=>String(x.source).includes('runtime-traitid-parsing')).map(x=>({chain:x.chain,source:x.source})),
    candidateRelationships:result.candidateRelationships??[]
  });
}

assert.deepEqual(suspicious,[],'Trait widening introduced duplicate or symmetric buildLoop links');

console.log(JSON.stringify({
  baseline:BASELINE,
  after:distribution,
  delta:{
    high:distribution.high-BASELINE.high,
    medium:distribution.medium-BASELINE.medium,
    insufficient:distribution.insufficient-BASELINE.insufficient,
    low:distribution.low-BASELINE.low,
    totalLinks:distribution.totalLinks-BASELINE.totalLinks
  },
  fallbackFixtures,
  directSubclassFixtureCount:directSubclassFixtures.length,
  pfBeta04:{
    aspects:aspectRows,
    confidence:analysis.confidence,
    buildLoop:analysis.buildLoop,
    candidateRelationships:analysis.candidateRelationships
  },
  suspicious,
  fullRegression
},null,2));
console.error('PF-BETA-04 traitId + full Alpha regression: PASS');
