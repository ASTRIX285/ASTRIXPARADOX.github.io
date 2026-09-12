import {cacheBungieSession,readCachedBungieSession} from "./guardian-session-cache.mjs?v=20260906-all-page-data-1";

const AUTH_ORIGIN = globalThis.FORGE_AUTH_ORIGIN || "https://auth.astrixparadox.com";
const CANONICAL_APP_ORIGIN = "https://astrixparadox.com";
const JOURNEY_PATH = "/astrix-app/pages/journey/";
const BUNGIE_ORIGIN = "https://www.bungie.net";
const SANDBOX_HOST = "sandbox.astrixparadox.com";

function authReturnUrl(){
  const current=new URL(location.href);
  const origin=current.hostname.endsWith(".netlify.app")?CANONICAL_APP_ORIGIN:current.origin;
  return new URL(JOURNEY_PATH,origin);
}

function authStartUrl(returnTarget=null){
  const fallback=authReturnUrl();
  let destination=fallback;
  if(returnTarget){
    try{
      const requested=new URL(String(returnTarget),location.origin);
      if(requested.origin===fallback.origin&&requested.pathname.startsWith('/astrix-app/'))destination=requested;
    }catch{}
  }
  const returnUrl=destination.toString();
  if(location.hostname===SANDBOX_HOST){
    const start=new URL("/__astrix/bungie/start",location.origin);
    start.searchParams.set("return",returnUrl);
    return start.toString();
  }
  return `${AUTH_ORIGIN}/bungie/start?return=${encodeURIComponent(returnUrl)}`;
}

async function requestAccessRecovery(){
  if(location.hostname!==SANDBOX_HOST||new URLSearchParams(location.search).get("bungie")==="recovered")return null;
  const recovery=new URL("/__astrix/bungie/recover",location.origin);
  recovery.searchParams.set("return",authReturnUrl().toString());
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch(recovery,{credentials:"same-origin",headers:{Accept:"application/json"},signal:controller.signal});
    const payload=await response.json().catch(()=>null);
    if(!response.ok||!payload?.recoveryUrl)return null;
    const recoveryUrl=new URL(payload.recoveryUrl);
    if(recoveryUrl.origin!==AUTH_ORIGIN||recoveryUrl.pathname!=="/session/recover")return null;
    return recoveryUrl.toString();
  }catch{return null;}
  finally{clearTimeout(timer);}
}

function installStyles(){
  if(document.getElementById("guardianBungieAuthStyles")) return;
  const style=document.createElement("style");
  style.id="guardianBungieAuthStyles";
  style.textContent=`
    .bungie-auth-control{display:flex;align-items:center;gap:8px;margin-left:10px}
    .bungie-auth-control[hidden],.bungie-auth-btn[hidden],.bungie-account-visual[hidden],.bungie-account-visual img[hidden],.bungie-account-visual__fallback[hidden]{display:none!important}
    .bungie-auth-btn{appearance:none;border:1px solid rgba(139,92,246,.55);background:linear-gradient(180deg,rgba(139,92,246,.18),rgba(16,12,28,.92));color:#f3edff;border-radius:8px;padding:9px 13px;font:700 11px/1 Orbitron,system-ui,sans-serif;letter-spacing:.08em;cursor:pointer;box-shadow:0 0 0 1px rgba(139,92,246,.08) inset;transition:border-color .18s ease,background .18s ease,transform .18s ease}
    .bungie-auth-btn:hover{border-color:rgba(167,125,255,.9);background:linear-gradient(180deg,rgba(139,92,246,.28),rgba(20,14,34,.96));transform:translateY(-1px)}
    .bungie-auth-btn[data-state="checking"]{opacity:.68;cursor:wait}
    .bungie-account-visual{position:relative;isolation:isolate;display:grid;width:var(--apx-icon-account-avatar,3.25rem);height:auto;aspect-ratio:1;box-sizing:border-box;padding:.1875rem;place-items:center;overflow:visible;border:0;border-radius:50%;background:conic-gradient(from 218deg,#063d2e 0 18%,#16bd82 34%,#9dffda 49%,#20d795 63%,#087552 82%,#063d2e 100%);box-shadow:0 0 0 1px rgba(84,242,184,.58),0 0 1.15rem rgba(35,218,153,.3)}
    .bungie-account-visual::before{content:"";position:absolute;z-index:2;inset:.1875rem;border:1px solid rgba(237,198,83,.76);border-radius:50%;box-shadow:inset 0 0 0 2px rgba(126,10,23,.82);pointer-events:none}
    .bungie-account-visual__orbit{position:absolute;z-index:-1;inset:-.3125rem;border:1px solid rgba(84,242,184,.68);border-radius:50%;box-shadow:0 0 .85rem rgba(32,215,149,.25);transform:rotate(-24deg)}
    .bungie-account-visual img,.bungie-account-visual__fallback{display:grid;width:100%;height:100%;box-sizing:border-box;place-items:center;overflow:hidden;border:0;border-radius:50%;background:radial-gradient(circle at 38% 28%,#381017,#11090c 64%,#050505)}
    .bungie-account-visual img{object-fit:cover}
    .bungie-account-visual__fallback{color:#e7c65e;font:800 .6875rem/1 Orbitron,system-ui,sans-serif;letter-spacing:.04em;text-shadow:0 0 .625rem rgba(211,32,47,.48)}
    .topbar:has(>.source-pill)>.source-pill{margin-right:4.125rem}
    @media(max-width:1220px){.bungie-auth-control{margin-left:4px}.bungie-auth-btn{padding:8px 10px;font-size:10px}.bungie-account-visual{width:var(--apx-icon-account-avatar-compact,2.75rem)}}
    @media(max-width:720px){.bungie-account-visual{width:var(--apx-icon-account-avatar-mobile,2.25rem)}.topbar:has(>.source-pill)>.source-pill{margin-right:3rem}}
  `;
  document.head.appendChild(style);
}

function makeControl(){
  const existing=document.getElementById("bungieAuthControl");
  if(existing)return {
    wrap:existing,
    button:document.getElementById("bungieAuthButton"),
    visual:document.getElementById("bungieAccountVisual"),
    image:document.getElementById("bungieAccountAvatar"),
    fallback:document.getElementById("bungieAccountAvatarFallback")
  };
  const topbar=document.querySelector(".topbar")||document.querySelector(".apx-destination-header");
  const host=topbar?.querySelector(":scope > .topbar-actions")||topbar;
  if(!host) return null;
  const wrap=document.createElement("div");
  wrap.id="bungieAuthControl";
  wrap.className="bungie-auth-control";
  wrap.hidden=true;
  const button=document.createElement("button");
  button.id="bungieAuthButton";
  button.className="bungie-auth-btn";
  button.type="button";
  button.dataset.state="checking";
  button.textContent="CHECKING BUNGIE…";
  button.addEventListener("click",()=>{
    if(button.dataset.state==="connected") return;
    location.href=authStartUrl();
  });
  const visual=document.createElement("div");
  visual.id="bungieAccountVisual";
  visual.className="bungie-account-visual";
  visual.setAttribute("role","img");
  visual.setAttribute("aria-label","Connected Bungie account");
  visual.hidden=true;
  const orbit=document.createElement("span");
  orbit.className="bungie-account-visual__orbit";
  orbit.setAttribute("aria-hidden","true");
  const image=document.createElement("img");
  image.id="bungieAccountAvatar";
  image.alt="";
  image.decoding="async";
  image.referrerPolicy="no-referrer";
  image.hidden=true;
  const fallback=document.createElement("span");
  fallback.id="bungieAccountAvatarFallback";
  fallback.className="bungie-account-visual__fallback";
  fallback.setAttribute("aria-hidden","true");
  fallback.textContent="AP";
  visual.append(orbit,image,fallback);
  wrap.append(button,visual);
  const anchor=host.querySelector(":scope > .char-switch");
  if(anchor)anchor.insertAdjacentElement("afterend",wrap);else host.appendChild(wrap);
  return {wrap,button,visual,image,fallback};
}

function accountInitials(value){
  const words=String(value||"AP").trim().split(/\s+/).filter(Boolean);
  return (words.length>1?`${words[0][0]}${words.at(-1)[0]}`:words[0]?.slice(0,2)||"AP").toUpperCase();
}

function bungieAvatarUrl(path){
  if(!path)return "";
  try{
    const url=new URL(String(path),BUNGIE_ORIGIN);
    return url.protocol==="https:"&&(url.hostname==="bungie.net"||url.hostname.endsWith(".bungie.net"))?url.toString():"";
  }catch{return "";}
}

function setAccountVisual(control,account,session){
  const displayName=String(account?.displayName||account?.uniqueName||session?.activeDestinyMembership?.displayName||"Bungie Guardian");
  control.visual.setAttribute("aria-label",`${displayName} · Bungie connected`);
  control.visual.title=displayName;
  control.fallback.textContent=accountInitials(displayName);
  control.fallback.hidden=false;
  const source=bungieAvatarUrl(account?.profilePicturePath);
  if(!source)return;
  control.image.onload=()=>{
    control.image.hidden=false;
    control.fallback.hidden=true;
  };
  control.image.onerror=()=>{
    control.image.hidden=true;
    control.fallback.hidden=false;
  };
  control.image.src=source;
}

async function hydrateAccountVisual(control,session){
  setAccountVisual(control,null,session);
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch(new URL("/bungie/account",AUTH_ORIGIN),{
      credentials:"include",
      headers:{Accept:"application/json"},
      signal:controller.signal
    });
    const account=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(account?.error||`account:${response.status}`);
    setAccountVisual(control,account,session);
  }catch(error){
    console.info("[Forge Bungie auth] account avatar unavailable",error);
  }finally{
    clearTimeout(timer);
  }
}

let sessionRequest=null;

async function requestSession(){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch(`${AUTH_ORIGIN}/session`,{
      credentials:"include",
      headers:{Accept:"application/json"},
      signal:controller.signal
    });
    const session=await response.json().catch(()=>({authenticated:false}));
    if(response.status===401){
      const recoveryUrl=await requestAccessRecovery();
      if(recoveryUrl){
        location.replace(recoveryUrl);
        return {authenticated:false,recovering:true};
      }
      return {authenticated:false};
    }
    if(!response.ok)throw new Error(session?.error||`session:${response.status}`);
    return session;
  }finally{
    clearTimeout(timer);
  }
}

function publishSession(session){
  if(session?.recovering){
    globalThis.FORGE_BUNGIE_SESSION=session;
    return;
  }
  if(session?.authenticated){
    cacheBungieSession(session);
    globalThis.ForgeLoader?.authResolved?.();
  }else{
    globalThis.ForgeLoader?.authRequired?.(authStartUrl());
  }
  globalThis.FORGE_BUNGIE_SESSION=session;
  globalThis.dispatchEvent(new CustomEvent("forge:bungie-session",{detail:session}));
}

function getBungieSession({force=false}={}){
  if(!force&&sessionRequest)return sessionRequest;
  if(!force){
    const cached=readCachedBungieSession();
    if(cached){
      publishSession(cached);
      sessionRequest=Promise.resolve(cached);
      globalThis.FORGE_BUNGIE_SESSION_PROMISE=sessionRequest;
      return sessionRequest;
    }
  }
  sessionRequest=requestSession()
    .then(session=>{
      publishSession(session);
      return session;
    })
    .catch(error=>{
      console.info("[Forge Bungie auth] no active session",error);
      const session={authenticated:false,error:error?.message||"session_unavailable"};
      publishSession(session);
      return session;
    });
  globalThis.FORGE_BUNGIE_SESSION_PROMISE=sessionRequest;
  return sessionRequest;
}

async function refreshAuthState(control){
  const session=await getBungieSession();
  if(session?.recovering)return;
  if(session?.authenticated){
    control.wrap.hidden=false;
    control.button.hidden=true;
    control.visual.hidden=false;
    void hydrateAccountVisual(control,session);
    return;
  }
  control.wrap.hidden=false;
  control.visual.hidden=true;
  control.button.hidden=false;
  control.button.dataset.state="disconnected";
  control.button.textContent="CONNECT BUNGIE";
}

installStyles();
const control=makeControl();
if(control) refreshAuthState(control);
if(new URLSearchParams(location.search).has("rangeTest")) import("./guardian-shooting-range-inline.mjs");

export {AUTH_ORIGIN,authStartUrl,getBungieSession};
