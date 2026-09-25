// Preview is an explicit, local-only page opt-in. No storage or auth state is used.
export function isLocalPreview(location=globalThis.location){
  try{
    const url=new URL(location.href);
    return ['http:','https:'].includes(url.protocol)
      && ['localhost','127.0.0.1'].includes(url.hostname)
      && url.searchParams.has('preview');
  }catch{return false;}
}
export function isJourneyPreview(location=globalThis.location){
  return isLocalPreview(location)&&/^\/astrix-app\/pages\/journey\/(?:index\.html)?$/.test(new URL(location.href).pathname);
}
export async function startPage({preview,live,location=globalThis.location}){
  return isLocalPreview(location)?preview():live();
}
