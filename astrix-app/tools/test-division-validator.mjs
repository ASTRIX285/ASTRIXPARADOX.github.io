// Proves the Division gate blocks bad data, unapproved images and per-title engine forks.
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {validateDivision} from './validate-division.mjs';

const good={id:'brand-example',source:'https://www.ubisoft.com/example',gameVersion:'TU-example'};
const pending={id:'set-example',status:'pending',missing:['source','gameVersion']};
const approved={id:'hub-card',useAllowed:'yes',approvedByMiguel:true};

function repo(files){
  const root=mkdtempSync(join(tmpdir(),'division-gate-'));
  for(const [path,content] of Object.entries(files)){
    const full=join(root,path);
    mkdirSync(dirname(full),{recursive:true});
    writeFileSync(full,typeof content==='string'?content:JSON.stringify(content));
  }
  return root;
}

function check(name,files,expected){
  const root=repo(files);
  try {
    const errors=validateDivision(root);
    if(expected===null)assert.deepEqual(errors,[],`${name}: expected pass`);
    else assert.ok(errors.some(error=>error.includes(expected)),`${name}: expected "${expected}", got ${JSON.stringify(errors)}`);
  } finally {rmSync(root,{recursive:true,force:true});}
}

const base='astrix-app/games/division';
check('empty repo passes',{},null);
check('clean layout passes',{
  [`${base}/README.md`]:'# Division',
  [`${base}/td2/data/brands.json`]:{entries:[good,pending]},
  [`${base}/td2/assets/manifest.json`]:[approved,{id:'logo',useAllowed:'unclear',approvedByMiguel:false}],
  [`${base}/td2/assets/hub-card.png`]:'png',
  [`${base}/td2/assets/hub-card.web.png`]:'png',
  [`${base}/engine/stats.mjs`]:'export const total=values=>values.reduce((a,b)=>a+b,0);\n',
  'astrix-app/platform/adapters/division/manual.mjs':'export const adapter={};\n'
},null);
check('entry without source',{[`${base}/td2/data/brands.json`]:[{id:'x',gameVersion:'1'}]},'missing source');
check('entry without gameVersion',{[`${base}/td2/data/brands.json`]:[{id:'x',source:'https://a.example'}]},'missing gameVersion');
check('source not a URL',{[`${base}/td2/data/brands.json`]:[{id:'x',source:'wiki',gameVersion:'1'}]},'http(s) URL');
check('pending without missing list',{[`${base}/td2/data/brands.json`]:[{id:'x',status:'pending'}]},'non-empty missing list');
check('catalogue not JSON',{[`${base}/td2/data/brands.csv`]:'a,b'},'must be JSON');
check('image not in manifest',{[`${base}/td2/assets/stray.png`]:'png'},'not listed');
check('image not approved',{
  [`${base}/td2/assets/manifest.json`]:[{id:'logo',useAllowed:'yes',approvedByMiguel:false}],
  [`${base}/td2/assets/logo.png`]:'png'
},'not approved');
check('image with unclear terms',{
  [`${base}/td2/assets/manifest.json`]:[{id:'logo',useAllowed:'unclear',approvedByMiguel:true}],
  [`${base}/td2/assets/logo.png`]:'png'
},'needs "yes"');
check('hardcoded table in engine',{[`${base}/engine/brands.mjs`]:"export const brands=[{id:'x',gameVersion:'1'}];\n"},'hardcoded catalogue entry');
check('hardcoded table in adapter',{'astrix-app/platform/adapters/division/json.mjs':"const t={gameVersion:'1'};\n"},'hardcoded catalogue entry');
check('JSON data in engine',{[`${base}/engine/table.json`]:[]},'title data folder');
check('engine imports a title',{[`${base}/engine/calc.mjs`]:"import x from '../td2/data/brands.json' with {type:'json'};\n"},'never forks per title');
check('engine folder inside a title',{[`${base}/td2/engine/calc.mjs`]:'export {};\n'},'data/ and assets/ only');
check('code in a title folder',{[`${base}/td2/calc.mjs`]:'export {};\n'},'code in a title folder');
check('unknown top-level folder',{[`${base}/division2/data/a.json`]:[]},'unknown folder');

console.log('DIVISION_GATE_SELFTEST=PASS');
