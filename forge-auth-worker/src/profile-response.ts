import {json} from './web.ts';
export type PreparedProfileCapture = {payload?: Record<string, any>};
/** Internal handoff only. Public responses still pass through the JSON size guard. */
export function profileResponse(payload: Record<string, unknown>, headers?: HeadersInit, capture?: PreparedProfileCapture): Response {
  if (capture) {
    capture.payload=payload;
    return new Response(null,{status:204});
  }
  return json(payload,200,headers);
}

import {boundedStringify,jsonByteLength,MAX_JSON_BYTES,MAX_PREPARED_PAGE_BYTES} from '../../astrix-app/core/bounded-json.mjs';
/** Public definitions have their own prepared-page budget; private profile stays at 20 MB.
 * Emit bounded pieces so no JSON.stringify call ever allocates the whole enriched account. */
export function preparedAccountChunks(account: Record<string, any>): {chunks: Uint8Array[]; byteLength: number} {
  jsonByteLength(account.profile,{limit:MAX_JSON_BYTES,context:'prepared private profile'});
  const expected=jsonByteLength(account,{limit:MAX_PREPARED_PAGE_BYTES,context:'prepared account with definitions'});
  function* pieces(value:any):Generator<string>{
    const bytes=jsonByteLength(value,{limit:MAX_PREPARED_PAGE_BYTES,context:'prepared field'});
    if(bytes<=64*1024||value===null||typeof value!=='object'||value instanceof Date){yield boundedStringify(value,'prepared JSON chunk');return;}
    const array=Array.isArray(value);yield array?'[':'{';let first=true;
    for(const key of array?Array.from({length:value.length},(_,i)=>i):Object.keys(value)){
      const child=value[key];if(!array&&['undefined','function','symbol'].includes(typeof child))continue;
      if(!first)yield ',';first=false;
      if(!array){yield boundedStringify(String(key),'prepared JSON key');yield ':';}
      yield* pieces(child===undefined||typeof child==='function'||typeof child==='symbol'?null:child);
    }
    yield array?']':'}';
  }
  const encoder=new TextEncoder(),chunks:Uint8Array[]=[];let buffer='',byteLength=0;
  const flush=()=>{if(buffer){const bytes=encoder.encode(buffer);chunks.push(bytes);byteLength+=bytes.byteLength;buffer='';}};
  for(const piece of pieces(account)){if(buffer.length+piece.length>64*1024)flush();buffer+=piece;}
  flush();if(byteLength!==expected)throw new Error('prepared_account_encoding_mismatch');
  return {chunks,byteLength};
}
