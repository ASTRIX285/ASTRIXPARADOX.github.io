// Checks the shared Division schemas compile, every title catalogue file matches them,
// and the schemas reject what the gate forbids. Needs astrix-app dev dependencies
// (npm install --prefix astrix-app), as validate-builds.mjs does.
import assert from 'node:assert/strict';
import {readdirSync, readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root=fileURLToPath(new URL('../../',import.meta.url));
const division=join(root,'astrix-app','games','division');
const schemaDir=join(division,'schema');
const contracts=join(root,'astrix-app','platform','contracts');
const read=path=>JSON.parse(readFileSync(path,'utf8'));
const BASE='https://astrixparadox.com/astrix-app/games/division/schema/';

const ajv=new Ajv2020({allErrors:true,strict:true});
addFormats(ajv);
for(const file of ['provenance.schema.json','pending.schema.json'])ajv.addSchema(read(join(contracts,file)));
const schemaFiles=readdirSync(schemaDir).filter(file=>file.endsWith('.schema.json')).sort();
for(const file of schemaFiles)ajv.addSchema(read(join(schemaDir,file)));
const validator=file=>{
  const validate=ajv.getSchema(BASE+file);
  assert.ok(validate,`Missing schema ${file}`);
  return validate;
};
const errorsOf=validate=>ajv.errorsText(validate.errors,{separator:'\n  '});

// Every record schema builds on recordBase, so every record carries Division provenance.
const recordKinds=read(join(schemaDir,'catalogue-file.schema.json')).properties.kind.enum;
for(const kind of recordKinds){
  const schema=read(join(schemaDir,`${kind}.schema.json`));
  assert.equal(schema.$ref,'common.schema.json#/$defs/recordBase',`${kind}.schema.json must build on recordBase`);
  assert.equal(schema.unevaluatedProperties,false,`${kind}.schema.json must reject unknown fields`);
}
assert.equal(schemaFiles.length,recordKinds.length+3,'Schema folder holds common, catalogue-file, account-state and one schema per record kind');
const common=readFileSync(join(schemaDir,'common.schema.json'),'utf8');
assert.ok(common.includes('../../../platform/contracts/provenance.schema.json#/$defs/officialPost')&&common.includes('../../../platform/contracts/provenance.schema.json#/$defs/inGameCapture'),'Division provenance refs the shared contract');
assert.ok(common.includes('../../../platform/contracts/pending.schema.json'),'Division pending refs the shared contract');
assert.doesNotMatch(readdirSync(schemaDir).join(' '),/td\d/,'No title-specific schema in the shared schema folder');

// Every catalogue file in every title validates.
let checked=0;
const titles=readdirSync(division).filter(name=>/^td\d+$/.test(name));
for(const title of titles){
  const dataDir=join(division,title,'data');
  if(!existsSync(dataDir))continue;
  for(const file of readdirSync(dataDir).filter(name=>name.endsWith('.json'))){
    const data=read(join(dataDir,file));
    const fileCheck=validator('catalogue-file.schema.json');
    assert.ok(fileCheck(data),`${title}/data/${file}:\n  ${errorsOf(fileCheck)}`);
    assert.equal(data.title,title,`${title}/data/${file}: title must match its folder`);
    const recordCheck=validator(`${data.kind}.schema.json`);
    const ids=new Set();
    for(const record of data.records){
      assert.ok(recordCheck(record),`${title}/data/${file} record ${record.id}:\n  ${errorsOf(recordCheck)}`);
      assert.ok(!ids.has(record.id),`${title}/data/${file}: duplicate id ${record.id}`);
      ids.add(record.id);
      checked++;
    }
  }
}
assert.ok(checked>0,'At least one catalogue record is checked');

// The schemas reject what the gate forbids.
const post={kind:'official-post',url:'https://www.ubisoft.com/example',gameVersion:'TU-example',retrievedOn:'2026-10-04'};
const capture={kind:'in-game-capture',capturedBy:'Miguel',capturedOn:'2026-10-05',gameVersion:'TU-example',where:'Gear tooltip',note:'Core attribute line.'};
const slot=validator('gear-slot.schema.json');
const attribute=validator('attribute.schema.json');
const account=validator('account-state.schema.json');
const reject=(validate,value,name)=>assert.equal(validate(value),false,`${name} must be rejected`);
const accept=(validate,value,name)=>assert.ok(validate(value),`${name} must pass:\n  ${errorsOf(validate)}`);
accept(slot,{id:'mask',name:'Mask',provenance:capture},'a captured slot');
accept(attribute,{id:'x',name:'X',provenance:[post,capture],kind:'core',roll:{min:{pending:true,reason:'r'},max:5,unit:'percent'}},'a partly pending attribute');
reject(slot,{id:'mask',name:'Mask'},'a record with no provenance');
reject(slot,{id:'mask',name:'Mask',provenance:{product:'p',build:'1',table:'T',rowId:1,sourceSha256:'a'.repeat(64)}},'client data for Division');
reject(slot,{id:'mask',name:'Mask',provenance:{...capture,gameVersion:undefined}},'a capture with no gameVersion');
reject(slot,{id:'mask',name:'Mask',provenance:post,talentSlot:{pending:true}},'a pending field with no reason');
reject(slot,{id:'mask',name:'Mask',provenance:post,colour:'red'},'an unknown field');
reject(attribute,{id:'x',name:'X',provenance:post,kind:'core',roll:{min:1,max:'high',unit:'percent'}},'a non-numeric roll');
accept(account,{access:'requires-ubisoft-authorised-access',equipped:[],loadouts:[],stash:[]},'empty account state');
reject(account,{access:'requires-ubisoft-authorised-access',equipped:[{slotId:'mask',itemInstanceId:'1'}],loadouts:[],stash:[]},'filled account state');

console.log(`DIVISION_SCHEMA=PASS ${schemaFiles.length} schemas, ${checked} records`);
