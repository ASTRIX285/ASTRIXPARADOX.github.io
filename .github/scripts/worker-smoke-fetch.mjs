import {setTimeout as sleep} from 'node:timers/promises';
const transientCodes=new Set(['ECONNRESET','ETIMEDOUT','ECONNREFUSED','EAI_AGAIN','UND_ERR_SOCKET','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT']);
const transient=error=>error?.name==='TimeoutError'||transientCodes.has(error?.code)||transientCodes.has(error?.cause?.code);

// Buffer the body inside the retry boundary: a reset can follow the headers.
export async function smokeFetch(url,options={}, {fetchImpl=globalThis.fetch,wait=sleep,warn=console.warn}={}){
  if(!['GET','OPTIONS'].includes(options.method||'GET'))throw new Error('Smoke retries are read-only');
  for(let attempt=1;attempt<=3;attempt++){
    try{
      const response=await fetchImpl(url,{...options,signal:AbortSignal.timeout(10000)});
      const bytes=await response.arrayBuffer();
      return new Response([204,205,304].includes(response.status)?null:bytes,{status:response.status,statusText:response.statusText,headers:response.headers});
    }catch(error){
      if(attempt===3||!transient(error))throw error;
      warn(`Smoke request ${new URL(url).pathname}: transient connection failure, retry ${attempt}/2`);
      await wait(attempt*1000);
    }
  }
}
