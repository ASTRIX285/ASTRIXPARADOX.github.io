import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {IMAGE_SIZE_KEY,normaliseImageSize,installImageSizeControl} from '../shared/astrix-image-size.mjs';
for(const [input,expected] of [[null,100],['',100],['broken',100],['Infinity',100],[-5,75],[25,75],[75,75],[83,85],[100,100],[110,110],[300,110]]){
  assert.equal(normaliseImageSize(input),expected,`Bound ${input}`);
}
function fixture({saved=null,blocked=false,loader=false}={}){
  const nodes=[];const events={};const values=new Map([[IMAGE_SIZE_KEY,saved]]);
  const node=()=>({children:[],events:{},append(...items){this.children.push(...items);},setAttribute(){},addEventListener(name,fn){this.events[name]=fn;}});
  const head=node(),body=node();body.classList={contains:()=>loader};
  const root={dataset:{},style:{setProperty(name,value){this[name]=value;}}};
  const doc={head,body,documentElement:root,createElement(){const n=node();nodes.push(n);return n;},getElementById(id){return nodes.find(n=>n.id===id);}};
  const view={localStorage:{getItem(key){if(blocked)throw Error('blocked');return values.get(key);},setItem(key,value){if(blocked)throw Error('blocked');values.set(key,value);}},addEventListener(name,fn){events[name]=fn;}};
  return {doc,view,values,events,root};
}
const f=fixture({saved:'25'});installImageSizeControl(f.doc,f.view);
const select=f.doc.getElementById('apxImageSize');
assert.equal(select.value,'75');assert.equal(f.root.style['--apx-image-scale'],'0.75');
assert.deepEqual(select.children.map(n=>n.value),['75','80','85','90','95','100','105','110']);
select.value='900';select.events.change();assert.equal(select.value,'110');assert.equal(f.values.get(IMAGE_SIZE_KEY),'110');
f.events.storage({key:IMAGE_SIZE_KEY,newValue:'100'});assert.equal(select.value,'100');
f.events.storage({key:null,newValue:null});assert.equal(select.value,'100');
installImageSizeControl(f.doc,f.view);assert.equal(f.doc.body.children.length,1,'No duplicate controls');
const noStorage=fixture({blocked:true});installImageSizeControl(noStorage.doc,noStorage.view);
assert.equal(noStorage.root.dataset.apxImageSize,'100');
const localSelect=noStorage.doc.getElementById('apxImageSize');localSelect.value='80';localSelect.events.change();assert.equal(noStorage.root.dataset.apxImageSize,'80');
const loader=fixture({loader:true});installImageSizeControl(loader.doc,loader.view);
assert.equal(loader.doc.head.children.length,0);assert.equal(loader.doc.body.children.length,0);assert.deepEqual(loader.root.dataset,{});
const css=await readFile(new URL('../shared/astrix-image-size.css',import.meta.url),'utf8');
assert.doesNotMatch(css,/\b(?:\d+(?:\.\d+)?)(?:vw|vh|cqw|cqi)\b|zoom\s*:|scale\s*\(/,'No viewport growth or browser zoom compensation');
assert.match(css,/--apx-equipment-icon-size:calc\(50px \* var\(--apx-image-scale,1\)\)/);
assert.match(css,/--apx-icon-catalog:calc\(44px \* var\(--apx-image-scale,1\)\)/);
assert.match(css,/grid-template-columns:repeat\(10,var\(--apx-equipment-icon-size\)\)/);
assert.match(css,/--character-item-size:var\(--apx-equipment-icon-size\)/);
assert.match(css,/--apx-hero-width:300px/);assert.match(css,/--apx-workspace-left:392px/);
assert.match(css,/transparent 85%/);assert.match(css,/prefers-reduced-motion:reduce/);
console.log('IMAGE_SIZE=PASS bounds, persistence, unavailable storage, cross-tab updates, Loader exclusion and viewport-independent sizing');
