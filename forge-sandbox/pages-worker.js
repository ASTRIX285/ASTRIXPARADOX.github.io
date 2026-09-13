const STREAMED_FILES=new Map([
  ['/astrix-app/data/armor-information.json','application/json; charset=utf-8'],
]);
const RAW_BRANCH_ROOT='https://raw.githubusercontent.com/ASTRIX285/ASTRIX285.github.io/sandbox';
const ACCESS_TOKEN_HEADER='cf-access-jwt-assertion';
const ACCESS_COOKIE='CF_Authorization';
const INTERNAL_AUTH_ORIGIN='https://forge-auth.internal';

function cookieValue(request,name){
  const cookie=request.headers.get('Cookie')||'';
  for(const pair of cookie.split(';')){
    const [key,...rest]=pair.trim().split('=');
    if(key===name)return rest.join('=');
  }
  return '';
}

function json(payload,status=200){
  return new Response(JSON.stringify(payload),{
    status,
    headers:{
      'Content-Type':'application/json; charset=utf-8',
      'Cache-Control':'no-store',
      'X-Robots-Tag':'noindex, nofollow',
      'X-Content-Type-Options':'nosniff',
    },
  });
}

async function sha256(value){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

async function verifiedAccessIdentity(request,env){
  const token=request.headers.get(ACCESS_TOKEN_HEADER)||cookieValue(request,ACCESS_COOKIE);
  if(!token||token.length>8192)return '';
  let teamDomain;
  try{teamDomain=new URL(env.ACCESS_TEAM_DOMAIN);}
  catch{return '';}
  if(teamDomain.protocol!=='https:'||!teamDomain.hostname.endsWith('.cloudflareaccess.com'))return '';
  const identityUrl=new URL('/cdn-cgi/access/get-identity',teamDomain.origin);
  const response=await fetch(identityUrl,{
    headers:{Accept:'application/json',Cookie:`${ACCESS_COOKIE}=${token}`},
    redirect:'manual',
  }).catch(()=>null);
  if(!response?.ok)return '';
  const identity=await response.json().catch(()=>null);
  const accountId=String(identity?.account_id||'');
  const userId=String(identity?.user_uuid||'');
  if(!accountId||accountId!==env.ACCESS_ACCOUNT_ID||!userId)return '';
  return sha256(`cloudflare-access:${accountId}:${userId}`);
}

async function handleBungieBridge(request,env,url){
  if(request.method!=='GET')return json({error:'method_not_allowed'},405);
  const accessIdentityKey=await verifiedAccessIdentity(request,env);
  if(!accessIdentityKey)return json({error:'cloudflare_access_identity_required'},401);
  const internalPath=url.pathname==='/__astrix/bungie/start'
    ?'/internal/access/start'
    :'/internal/access/recovery-ticket';
  const target=new URL(internalPath,INTERNAL_AUTH_ORIGIN);
  target.searchParams.set('identity',accessIdentityKey);
  const returnUrl=url.searchParams.get('return');
  if(returnUrl)target.searchParams.set('return',returnUrl);
  const response=await env.AUTH_API.fetch(new Request(target,{
    method:'GET',
    headers:{Accept:'application/json'},
    redirect:'manual',
  }));
  return sandboxResponse(response,'',true);
}

function sandboxResponse(response,contentType='',noStore=false){
  const headers=new Headers(response.headers);
  headers.set('X-Robots-Tag','noindex, nofollow');
  headers.set('X-Content-Type-Options','nosniff');
  if(noStore){
    headers.set('Cache-Control','no-store');
    headers.set('Referrer-Policy','no-referrer');
  }
  if(contentType)headers.set('Content-Type',contentType);
  return new Response(response.body,{
    status:response.status,
    statusText:response.statusText,
    headers,
  });
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/__astrix/bungie/start'||url.pathname==='/__astrix/bungie/recover'){
      return handleBungieBridge(request,env,url);
    }
    const contentType=STREAMED_FILES.get(url.pathname);
    if(contentType&&(request.method==='GET'||request.method==='HEAD')){
      const upstream=await fetch(`${RAW_BRANCH_ROOT}${url.pathname}`,{
        method:request.method,
        headers:{Accept:contentType},
        cf:{cacheEverything:true,cacheTtl:300},
      });
      return sandboxResponse(upstream,contentType);
    }
    return sandboxResponse(await env.ASSETS.fetch(request));
  },
};
