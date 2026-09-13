import { analyzeGuardianBuild } from "./guardian-paradox-engine.mjs?v=20260905-background-forge-1";
import { adviseLiveWeaponRolls } from "./guardian-weapon-roll-advisor.mjs?v=20260905-weapon-audit-1";

const clone=v=>v==null?v:structuredClone(v);

function asResolvedPerk(plug){
  if(!plug?.definition||!Object.keys(plug.definition).length)return null;
  return {
    perkHash:Number(plug.hash),
    socket:plug.socketIndex??null,
    definition:{
      hash:Number(plug.hash),
      bungieHash:Number(plug.hash),
      name:plug.name||"Resolved perk",
      description:plug.description||plug.definition?.displayProperties?.description||"",
      traitIds:plug.definition?.traitIds||[],
      sourceKind:"gameComponent"
    }
  };
}

function evidenceComponent(row){
  if(!row?.verified||row.active===false)return null;
  return {
    hash:Number(row.sourceHash)||null,
    bungieHash:Number(row.sourceHash)||null,
    name:row.sourceName||"Verified armour evidence",
    description:row.description||"",
    sourceKind:`armour-${row.semanticRole||"evidence"}`,
    componentType:`armour-${row.semanticRole||"evidence"}`,
    directionEvidence:{description:row.description||""}
  };
}

function adaptLiveGuardian(detail){
  const build=clone(detail)||{};
  const armourEvidence=(detail?.paradoxEvidence?.armour||[]).map(evidenceComponent).filter(Boolean);
  const activeArtifact=(detail?.artifact?.activePerks||[]).filter(perk=>perk?.definition&&Object.keys(perk.definition).length);
  build.source="paradox-beta-fixture";
  build.fixtureId=`LIVE-${String(detail?.characterId||"GUARDIAN")}${Number.isInteger(Number(detail?.selectedLoadoutIndex))?`-L${Number(detail.selectedLoadoutIndex)+1}`:""}`;
  build.artifact=detail?.artifact?{...clone(detail.artifact),perks:clone(activeArtifact)}:null;
  build.aspects=clone(detail?.aspects)||[];
  build.fragments=clone(detail?.fragments)||[];
  build.armourEffects=armourEvidence;
  build.weapons=(clone(detail?.weapons)||[]).map(weapon=>{
    const selected=weapon?.weaponSemantics?.selectedPerks||weapon?.selectedPerks||[];
    const catalyst=weapon?.catalyst;
    const resolvedPerks=selected.map(asResolvedPerk).filter(Boolean);
    if(catalyst?.progress?.active){
      const catalystPerk=asResolvedPerk(catalyst);
      if(catalystPerk)resolvedPerks.push(catalystPerk);
    }
    return {...weapon,sourceKind:"weapon",resolvedPerks};
  });
  build.synergyChains=[];
  build.knownWeakLinks=[];
  build.knownStrengths=[];
  build.weaponContribution=[];
  build.liveEvidence={
    source:"bungie-live",
    characterId:detail?.characterId||null,
    armour:clone(detail?.paradoxEvidence?.armour||[]),
    artifact:clone(detail?.paradoxEvidence?.artifact||[]),
    coverage:clone(detail?.hashCoverage||{}),
    statModel:clone(detail?.statModel||{})
  };
  return build;
}

function analyzeLiveGuardian(detail){
  const verifiedSources=new Set(["bungie-live","bungie-loadout","current-guardian"]);
  if(!detail||!verifiedSources.has(String(detail.source||"")))return null;
  const adapted=adaptLiveGuardian(detail);
  const analysis=analyzeGuardianBuild(adapted);
  return {
    ...analysis,
    source:"paradox-live-deterministic-engine",
    evidenceSource:`${String(detail.source)}-resolved-only`,
    characterId:detail.characterId||null,
    selectedLoadoutIndex:Number.isInteger(Number(detail.selectedLoadoutIndex))?Number(detail.selectedLoadoutIndex):null,
    coverage:clone(detail.hashCoverage||{}),
    statModel:clone(detail.statModel||{}),
    artifactValidation:clone(detail.artifactValidation||null)
  };
}

function renderList(host,rows,empty){
  if(!host)return;
  host.innerHTML=(rows||[]).length
    ? rows.slice(0,4).map(row=>`<li><span class="d"></span>${String(row.statement||row.change||row.causalImpact||row).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}</li>`).join("")
    : `<li><span class="d"></span>${empty}</li>`;
}

function renderLiveAnalysis(analysis){
  if(!analysis)return;
  const panel=document.querySelector("[data-paradox-analysis], .panel.right");
  if(!panel)return;
  panel.dataset.analysisSource="bungie-live";
  const updated=panel.querySelector(".ra-head .upd");
  if(updated)updated.textContent="Live Bungie evidence · verified";
  const confidence=analysis.confidence;
  const confidenceValue=typeof confidence==="number"?confidence:Number(confidence?.score??confidence?.value??0);
  const conf=panel.querySelector(".mini-grid .mini:nth-child(4) .big");
  if(conf)conf.textContent=confidenceValue>=.8||confidenceValue>=80?"Very High":confidenceValue>=.6||confidenceValue>=60?"High":"Evidence Limited";
  const loop=panel.querySelector(".mini-grid .mini:nth-child(1) .big");
  if(loop)loop.textContent=analysis.buildLoop?.length?`${analysis.buildLoop.length} Verified Link${analysis.buildLoop.length===1?"":"s"}`:"No Verified Loop";
  const strengthHost=panel.querySelector(".sw-card.str ul");
  const weakHost=panel.querySelector(".sw-card.weak ul");
  renderList(strengthHost,analysis.strengths,"No strength claimed without directed evidence");
  renderList(weakHost,analysis.weakLinks,"No verified weak link identified");
  const improve=panel.querySelector(".improve p");
  const recommendation=analysis.recommendations?.[0];
  if(improve)improve.textContent=recommendation?.causalImpact||recommendation?.change||"No recommendation is claimed until a verified missing input or weak link is found.";
  const verdict=panel.querySelector(".health-card .verdict");
  if(verdict){
    const coverage=analysis.coverage||{};
    const unresolved=[...(coverage?.definitions?.unresolved||[]),...(coverage?.armour?.unresolved||[]),...(coverage?.weapons?.unresolved||[])];
    const semanticUnknown=[...(coverage?.armour?.semanticUnknown||[]),...(coverage?.weapons?.semanticUnknown||[])];
    const complete=unresolved.length===0&&semanticUnknown.length===0;
    verdict.childNodes[0].nodeValue=complete?"EVIDENCE VERIFIED":"PARTIAL EVIDENCE";
    const small=verdict.querySelector("small");
    if(small)small.textContent=complete?"Paradox is reasoning only from resolved live Bungie evidence.":`${unresolved.length+semanticUnknown.length} unresolved or unclassified evidence item(s) excluded from claims.`;
  }
}

if(typeof document!=='undefined'){
document.addEventListener("forge:guardian-selection-changed",event=>{
  if(event.detail?.source!=="bungie-live")return;
  queueMicrotask(()=>{
    try{
      const analysis=analyzeLiveGuardian(event.detail);
      event.detail.paradoxAnalysis=analysis;
      renderLiveAnalysis(analysis);
      document.dispatchEvent(new CustomEvent("forge:paradox-live-analysis-changed",{detail:analysis}));
      adviseLiveWeaponRolls(event.detail,analysis,{insertSocketPlugFree:false}).catch(error=>console.warn("[Forge weapon advisor]",String(error)));
    }catch(error){
      console.error("[Paradox live adapter]",error);
      document.dispatchEvent(new CustomEvent("forge:paradox-live-analysis-error",{detail:{message:error?.message||String(error)}}));
    }
  });
});
}

export {adaptLiveGuardian,analyzeLiveGuardian,renderLiveAnalysis};
