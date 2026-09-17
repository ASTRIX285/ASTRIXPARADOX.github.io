import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {
  PAGE_VIEWS,
  assertPreparedPagePayload,
  assertRenderablePagePayload,
  renderablePagePayloadCoverage
} from '../core/page-ready-contract.mjs';

const root=new URL('../',import.meta.url);
const runtimeFiles=[
  'shared/astrix-hero-cards.mjs',
  'pages/guardian-workspace-v2/guardian-bungie-profile.mjs',
  'pages/guardian-workspace-v2/paradox-build-space/paradox-build-space.mjs',
  'pages/journey/journey.mjs',
  'pages/vault/vault.mjs',
  'pages/forge-loader/forge-loader-preload.mjs'
];

function partialPayload(page){
  return {
    profile:{characters:{data:{guardian:{characterId:'guardian',classType:0}}}},
    definitions:{},
    definitionCoverage:{complete:false,requested:1,resolved:0,unresolved:['optional-item']},
    pageReady:{
      page,
      manifestVersion:'test-manifest-version',
      definitionSource:'prepared-bulk-manifest',
      views:PAGE_VIEWS[page],
      coverage:{complete:false,missing:['optional-item']}
    }
  };
}

for(const page of Object.keys(PAGE_VIEWS)){
  const payload=partialPayload(page);
  assert.throws(()=>assertPreparedPagePayload(payload,page),/data is incomplete/,`${page} strict backend contract must reject incomplete preparation`);
  assert.equal(assertRenderablePagePayload(payload,page),payload,`${page} must render verified available data`);
  assert.equal(renderablePagePayloadCoverage(payload,page).complete,true,`${page} render contract must be complete`);
}

const blockingCases=[
  ['wrong page',{...partialPayload('journey'),pageReady:{...partialPayload('journey').pageReady,page:'vault'}}],
  ['missing manifest',{...partialPayload('journey'),pageReady:{...partialPayload('journey').pageReady,manifestVersion:''}}],
  ['unprepared source',{...partialPayload('journey'),pageReady:{...partialPayload('journey').pageReady,definitionSource:'live-item-lookups'}}],
  ['missing profile',{...partialPayload('journey'),profile:null}],
  ['missing characters',{...partialPayload('journey'),profile:{}}]
];
for(const [name,payload] of blockingCases){
  assert.throws(()=>assertRenderablePagePayload(payload,'journey'),/cannot render/,`${name} must remain blocked`);
}

for(const path of runtimeFiles){
  const source=await readFile(new URL(path,root),'utf8');
  assert.match(source,/assertRenderablePagePayload|loadPreparedPagePayload/,`${path} must use the render contract directly or through the shared page client`);
  assert.doesNotMatch(source,/assertPreparedPagePayload/,`${path} must not discard usable prepared data`);
}

const preparedClient=await readFile(new URL('core/prepared-page-client.mjs',root),'utf8');
assert.match(preparedClient,/assertRenderablePagePayload/,`The shared page client must enforce the render contract for every consumer`);

const strictValidator=await readFile(new URL('tools/validate-page-ready-performance.mjs',root),'utf8');
assert.match(strictValidator,/assertPreparedPagePayload/,`Backend completeness validation must remain strict`);

console.log(`RENDERABLE_PAGE_PARTIAL_COVERAGE=PASS pages=${Object.keys(PAGE_VIEWS).length}`);
console.log('RENDERABLE_PAGE_BLOCKING_CONTRACT=PASS');
console.log('RENDERABLE_PAGE_RUNTIME_WIRING=PASS');

// Exercise the actual Journey entry helper, not only the shared contract: it
// previously reintroduced a stricter records gate and swallowed request errors.
const journeySource=await readFile(new URL('pages/journey/journey.mjs',root),'utf8');
const journeyReader=journeySource.slice(journeySource.indexOf('async function readVerifiedProfile(session){'),journeySource.indexOf('async function fetchJourneyProfileRefresh(){'));
let requestFailure=null;
let primed=null;
const available=partialPayload('journey');
const context=vm.createContext({
  FORGE_HERO_PROFILE_PROMISE:Promise.resolve(null),
  JOURNEY_BOOTSTRAP_PROFILE_WAIT_MS:1,
  waitWithin:async promise=>await promise,
  loadPreparedPagePayload:async()=>{
    if(requestFailure)throw requestFailure;
    return assertRenderablePagePayload(available,'journey');
  },
  guardianManifest:{prime:payload=>{primed=payload;}}
});
vm.runInContext(journeyReader,context);
assert.equal(await context.readVerifiedProfile({authenticated:true}),available,'Journey must retain a usable roster when record sections are missing');
assert.equal(primed,available);
requestFailure=new Error('Prepared journey request failed (503).');
await assert.rejects(context.readVerifiedProfile({authenticated:true}),error=>error===requestFailure,'Journey must preserve the request error rather than replace it with generic reconnect advice');
console.log('JOURNEY_PARTIAL_ENTRY_AND_REQUEST_ERROR=PASS');
