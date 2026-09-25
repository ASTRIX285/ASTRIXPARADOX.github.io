// Preview is an explicit page opt-in on localhost and Cloudflare quick tunnel hosts only. No storage or auth state is used.
const TUNNEL_HOST=/^(?:[a-z0-9-]+\.)+trycloudflare\.com$/;
function isPreviewHost(hostname){return ['localhost','127.0.0.1'].includes(hostname)||TUNNEL_HOST.test(hostname);}
export function isLocalPreview(location=globalThis.location){
  try{
    const url=new URL(location.href);
    return ['http:','https:'].includes(url.protocol)
      && isPreviewHost(url.hostname)
      && url.searchParams.has('preview');
  }catch{return false;}
}
export function isJourneyPreview(location=globalThis.location){
  return isLocalPreview(location)&&/^\/astrix-app\/pages\/journey\/(?:index\.html)?$/.test(new URL(location.href).pathname);
}
export async function startPage({preview,live,location=globalThis.location}){
  return isLocalPreview(location)?preview():live();
}
