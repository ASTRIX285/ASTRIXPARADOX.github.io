// Proves the shared game-folder contract: provenance on every record, a reason on
// every pending field, required files present, and no stale exemptions.
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {validateGameFolders} from './validate-game-folders.mjs';

const capture={kind:'in-game-capture',capturedBy:'Miguel',capturedOn:'2026-10-05',gameVersion:'TU-example',where:'Gear tooltip',note:'Core attribute line.'};
const post={kind:'official-post',url:'https://news.example.com/patch',gameVersion:'TU-example',retrievedOn:'2026-10-03'};
const armory={kind:'armory',region:'eu',endpoint:'/api/character/equipment',capturedOn:'2026-10-05',fixture:'astrix-app/tools/fixtures/aion2/eu/astrix285-equipment.json'};
const client={product:'example_beta',build:'1.2.3.4',table:'Item',rowId:7,sourceSha256:'a'.repeat(64)};
const moduleSource=`const pending=reason=>({pending:true,reason});
export const MODULE={getMetadata:()=>({id:'demo',name:'Demo',version:'0.1.0'}),normalisePlayer:()=>pending('x'),normaliseCharacter:()=>pending('x'),normaliseEquipment:()=>[],normaliseAbilities:()=>[],normalisePassives:()=>[],normaliseEncounter:()=>pending('x'),explainRecommendation:()=>pending('x')};
`;
const base='astrix-app/games/demo';
const shell={
  [`${base}/index.mjs`]:moduleSource,
  [`${base}/schema/.gitkeep`]:'',
  [`${base}/docs/SCOPE.md`]:'# Scope',
  [`${base}/README.md`]:'# Demo',
  [`${base}/data/.gitkeep`]:''
};

async function check(name,files,expected,options={exemptions:[]}){
  const root=mkdtempSync(join(tmpdir(),'game-folders-'));
  try {
    for(const [path,content] of Object.entries(files)){
      if(content===undefined)continue;
      const full=join(root,path);
      mkdirSync(dirname(full),{recursive:true});
      writeFileSync(full,typeof content==='string'?content:JSON.stringify(content));
    }
    const errors=await validateGameFolders(root,options);
    if(expected===null)assert.deepEqual(errors,[],`${name}: expected pass`);
    else assert.ok(errors.some(error=>error.includes(expected)),`${name}: expected "${expected}", got ${JSON.stringify(errors)}`);
  } finally {rmSync(root,{recursive:true,force:true});}
}

await check('empty games folder passes',{},null);
await check('valid in-game capture passes',{...shell,[`${base}/data/items.json`]:[{id:'mask',name:'Mask',provenance:capture}]},null);
await check('partly pending record passes',{...shell,[`${base}/data/items.json`]:{records:[{id:'mask',provenance:[post,capture],maxRoll:{pending:true,reason:'Not captured yet.'}}]}},null);
await check('client data passes without kind',{...shell,[`${base}/data/items.json`]:[{id:7,provenance:client}]},null);
await check('armory source passes',{...shell,[`${base}/data/items.json`]:[{id:'a',provenance:armory}]},null);
await check('armory source with no endpoint fails',{...shell,[`${base}/data/items.json`]:[{id:'a',provenance:{...armory,endpoint:''}}]},'armory needs the endpoint path');
await check('armory source with no date fails',{...shell,[`${base}/data/items.json`]:[{id:'a',provenance:{...armory,capturedOn:'5 Oct'}}]},'armory needs capturedOn');
await check('multi-title data folder passes',{...shell,[`${base}/t1/data/items.json`]:[{id:'a',provenance:post}]},null);

await check('record with no provenance fails',{...shell,[`${base}/data/items.json`]:[{id:'mask',name:'Mask'}]},'no provenance');
await check('in-game capture with no gameVersion fails',{...shell,[`${base}/data/items.json`]:[{id:'mask',provenance:{...capture,gameVersion:undefined}}]},'in-game-capture needs gameVersion');
await check('pending field with no reason fails',{...shell,[`${base}/data/items.json`]:[{id:'mask',provenance:capture,maxRoll:{pending:true}}]},'pending field needs a reason');
await check('pending field holding a value fails',{...shell,[`${base}/data/items.json`]:[{id:'mask',provenance:capture,maxRoll:{pending:true,reason:'r',value:12}}]},'holds a value');
await check('capture with no screen fails',{...shell,[`${base}/data/items.json`]:[{id:'mask',provenance:{...capture,where:''}}]},'needs where');
await check('official post with no URL fails',{...shell,[`${base}/data/items.json`]:[{id:'mask',provenance:{...post,url:'wiki page'}}]},'http(s) url');
await check('client data with bad hash fails',{...shell,[`${base}/data/items.json`]:[{id:7,provenance:{...client,sourceSha256:'nope'}}]},'sha256');
await check('unknown provenance kind fails',{...shell,[`${base}/data/items.json`]:[{id:'a',provenance:{kind:'fan-wiki',url:'https://wiki.example'}}]},'provenance kind must be');
await check('empty provenance list fails',{...shell,[`${base}/data/items.json`]:[{id:'a',provenance:[]}]},'provenance list is empty');
await check('missing SCOPE.md fails',{...shell,[`${base}/docs/SCOPE.md`]:undefined},'missing docs/SCOPE.md');
await check('missing schema folder fails',Object.fromEntries(Object.entries(shell).filter(([path])=>!path.includes('/schema/'))),'missing schema/');
await check('no data folder fails',Object.fromEntries(Object.entries(shell).filter(([path])=>!path.includes('/data/'))),'no data/');
await check('schema inside data fails',{...shell,[`${base}/data/item.schema.json`]:'{}'},'schemas belong in schema/');
await check('index without a contract module fails',{...shell,[`${base}/index.mjs`]:'export const x=1;\n'},'passes validateGameModule');
await check('module with wrong id fails',{...shell,[`${base}/index.mjs`]:moduleSource.replace("id:'demo'","id:'other'")},'module id must be demo');
await check('exemption covers a gap',{...shell,[`${base}/README.md`]:undefined},null,{exemptions:[{game:'demo',check:'file:README.md',reason:'test'}]});
await check('stale exemption fails',shell,'stale exemption',{exemptions:[{game:'demo',check:'file:README.md',reason:'test'}]});

console.log('GAME_FOLDERS_SELFTEST=PASS');
