export const MAX_JSON_BYTES=20*1024*1024;
// Prepared responses also contain shared public manifest tables (up to 42 MB).
// They are streamed with a separate ceiling; private snapshots stay at 20 MB.
export const MAX_PREPARED_PAGE_BYTES=64*1024*1024;
export class PayloadSizeError extends Error{
  constructor(context,bytes,limit=MAX_JSON_BYTES){super(`Profile data exceeds the ${Math.round(limit/1024/1024)} MB safety limit. Retry loading the profile.`);this.name='PayloadSizeError';this.code='profile_payload_too_large';this.context=context;this.bytes=bytes;this.limit=limit;console.error('[PARADOX serialization limit]',{code:this.code,context,bytes,limit});}
}
function stringBytes(text){
  let size=2;
  for(let i=0;i<text.length;i++){
    const c=text.charCodeAt(i);
    if(c===34||c===92||[8,9,10,12,13].includes(c))size+=2;
    else if(c<32)size+=6;
    else if(c<128)size++;
    else if(c<2048)size+=2;
    else if(c>=0xd800&&c<=0xdbff&&text.charCodeAt(i+1)>=0xdc00&&text.charCodeAt(i+1)<=0xdfff){size+=4;i++;}
    else if(c>=0xd800&&c<=0xdfff)size+=6;
    else size+=3;
  }
  return size;
}
// Count aliases as JSON would expand them, without expanding or allocating a string.
export function jsonByteLength(value,{limit=MAX_JSON_BYTES,context='profile'}={}){
  const memo=new WeakMap(),active=new WeakSet();
  const check=n=>{if(n>limit)throw new PayloadSizeError(context,n,limit);return n;};
  function size(v,depth=0){
    if(v===null)return 4;
    if(typeof v==='string')return check(stringBytes(v));
    if(typeof v==='number')return Number.isFinite(v)?String(v).length:4;
    if(typeof v==='boolean')return v?4:5;
    if(typeof v==='bigint')throw new TypeError('BigInt is not JSON data');
    if(typeof v!=='object')return undefined;
    if(typeof v.toJSON==='function'&&!(v instanceof Date))throw new Error('Unsupported profile serialization hook.');
    if(depth>200||active.has(v))throw new Error('Invalid recursive profile data. Retry loading the profile.');
    if(memo.has(v))return memo.get(v);
    active.add(v);
    let total=2;
    if(v instanceof Date)total=size(v.toJSON(),depth+1);
    else if(Array.isArray(v)){for(let i=0;i<v.length;i++)total=check(total+(i?1:0)+(size(v[i],depth+1)??4));}
    else {let count=0;for(const key of Object.keys(v)){const n=size(v[key],depth+1);if(n!==undefined)total=check(total+(count++?1:0)+stringBytes(key)+1+n);}}
    active.delete(v);memo.set(v,total);return total;
  }
  return size(value)??0;
}
export function boundedStringify(value,context='profile',limit=MAX_JSON_BYTES){jsonByteLength(value,{limit,context});return JSON.stringify(value);}
export async function readBoundedText(response,context='profile',limit=MAX_JSON_BYTES){
  const declared=Number(response.headers?.get?.('content-length'));
  if(declared>limit){void response.body?.cancel?.().catch(()=>{});throw new PayloadSizeError(context,declared,limit);}
  if(!response.body?.getReader){if(response.text){const text=await response.text();const bytes=new TextEncoder().encode(text).byteLength;if(bytes>limit)throw new PayloadSizeError(context,bytes,limit);return text;}return boundedStringify(await response.json(),context,limit);}
  const reader=response.body.getReader(),decoder=new TextDecoder();let bytes=0,text='';
  try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>limit){void reader.cancel().catch(()=>{});throw new PayloadSizeError(context,bytes,limit);}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}
  finally{reader.releaseLock();}
  return text;
}
// Non-security cache identity. Memoized subtrees keep repeated definition references
// bounded; no complete inventory JSON string is ever allocated.
export function graphFingerprint(value){
  const memo=new WeakMap(),active=new WeakSet();
  const hash=text=>{let a=2166136261,b=5381;for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);a=Math.imul(a^c,16777619);b=Math.imul(b,33)^c;}return `${a>>>0}:${b>>>0}`;};
  function visit(v){
    if(v===null||typeof v!=='object')return hash(`${typeof v}:${String(v)}`);
    if(active.has(v))throw new Error('Invalid recursive inventory cache data.');
    if(memo.has(v))return memo.get(v);
    active.add(v);let result=Array.isArray(v)?'array':'object';
    for(const key of Object.keys(v))result=hash(`${result}|${hash(key)}|${visit(v[key])}`);
    active.delete(v);memo.set(v,result);return result;
  }
  return visit(value);
}

export async function readBoundedJson(response,context='profile',limit=MAX_JSON_BYTES){return JSON.parse(await readBoundedText(response,context,limit));}
