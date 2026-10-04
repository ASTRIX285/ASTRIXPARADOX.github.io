// Proves the Ubisoft adapter makes no network call, reads no cookies or storage
// and never asks for credentials. Every browser channel is trapped before the
// adapter loads; any touch is recorded and fails the test.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const touched=[];
const trap=name=>new Proxy(function(){},{
  apply(){touched.push(`${name}()`);throw new Error(`${name} called`);},
  construct(){touched.push(`new ${name}`);throw new Error(`${name} constructed`);},
  get(target,key){if(key==='prototype')return target.prototype;touched.push(`${name}.${String(key)}`);return trap(`${name}.${String(key)}`);}
});
const channels=['fetch','XMLHttpRequest','WebSocket','EventSource','localStorage','sessionStorage','indexedDB','prompt','open','caches','cookieStore'];
const saved=Object.fromEntries(channels.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
for(const name of channels)Object.defineProperty(globalThis,name,{configurable:true,get(){touched.push(name);return trap(name);}});
const savedDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
const savedNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
Object.defineProperty(globalThis,'document',{configurable:true,value:{
  get cookie(){touched.push('document.cookie read');return '';},
  set cookie(value){touched.push('document.cookie write');}
}});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{
  sendBeacon(){touched.push('navigator.sendBeacon');return false;},
  get credentials(){touched.push('navigator.credentials');return trap('navigator.credentials');}
}});

try {
  const {createUbisoftAdapter,UBISOFT_ADAPTER}=await import('../platform/adapters/division/ubisoft.mjs');
  const {validateBuildAdapter}=await import('../platform/contracts/build-adapter.mjs');
  for(const adapter of [UBISOFT_ADAPTER,createUbisoftAdapter()]){
    validateBuildAdapter(adapter);
    const status=adapter.status();
    assert.deepEqual({available:status.available,state:status.state},{available:false,state:'not-authorised'},'Status is a clear not authorised state');
    assert.match(status.reason,/not given authorised access/,'Status says why');
    assert.match(status.reason,/never asks for your Ubisoft sign-in/,'Status says it never asks for credentials');
    for(const input of [undefined,'player-name',{email:'a@b.example',password:'x'},{token:'t'}]){
      const result=await adapter.load(input);
      assert.equal(result.ok,false,'Load never succeeds');
      assert.equal(result.state,'not-authorised');
      assert.ok(!('build' in result),'Load never returns a build');
      assert.ok(!JSON.stringify(result).includes('a@b.example')&&!JSON.stringify(result).includes('"x"'),'Load never echoes what it was given');
    }
  }
  assert.deepEqual(touched,[],`Ubisoft adapter touched: ${touched.join(', ')}`);
} finally {
  for(const name of channels){if(saved[name])Object.defineProperty(globalThis,name,saved[name]);else delete globalThis[name];}
  if(savedDocument)Object.defineProperty(globalThis,'document',savedDocument);else delete globalThis.document;
  if(savedNavigator)Object.defineProperty(globalThis,'navigator',savedNavigator);else delete globalThis.navigator;
}

// The source holds no network, storage or credential code, and imports nothing.
const source=readFileSync(new URL('../platform/adapters/division/ubisoft.mjs',import.meta.url),'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm,'');
assert.doesNotMatch(source,/^\s*import\b|\bimport\s*\(|\bfetch\b|XMLHttpRequest|WebSocket|EventSource|sendBeacon|cookie|Storage|indexedDB|credentials|password|token|https?:\/\//im,'Ubisoft adapter code has no network, storage or credential access');

console.log('DIVISION_UBISOFT_ADAPTER=PASS no fetch, no cookies, no storage, no credentials');
