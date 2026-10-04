// Presentation only. Do not change selection, evidence or scoring here.
const text=value=>String(value??'').trim().replace(/\s+/g,' ').replace(/\s*\u2014\s*/g,', '); // dash-ok: removes em dashes from copy
const description=item=>text(item?.description||item?.definition?.displayProperties?.description);
const name=item=>text(item?.name||item?.displayName||item?.definition?.displayProperties?.name);

export function recommendedBuildCopy(build={}){
  const anchor=build.forgeLoaderDecision?.buildAnchor||{},perk=anchor.perk,perkText=description(perk),bullets=[];
  const excluded=build.forgeEvidence?.excludedFromEvidenceScore||[];
  if(!perkText){
    bullets.push(excluded.includes('forgeLoaderDecision.buildAnchor.perk.description')
      ?"We couldn't read this Exotic's perk text, so it wasn't used to rank the build."
      :"We couldn't read this Exotic's perk text.");
  }else if(name(anchor)&&!perk?.unresolved){
    bullets.push(`Built around ${name(anchor)}. ${name(perk)?`Its perk, ${name(perk)}`:'Its perk'}: ${perkText}`);
  }
  // Shared keywords alone do not prove a causal ability loop or faster energy.
  const selected=[build.subclassBuild?.super,...(build.subclassBuild?.abilities||[]),...(build.subclassBuild?.aspects||[]),...(build.subclassBuild?.fragments||[])].filter(Boolean);
  for(const row of build.forgeIntelligence?.decisions||[]){
    if(bullets.length>=3)break;
    const component=selected.find(item=>Number(item.hash??item.bungieHash)===Number(row.componentHash));
    if(!component||component.unresolved||row.evidenceStatus!=='verified-match'||!description(component)||!name(component))continue;
    const direct=(row.reasons||[]).some(reason=>reason.code==='exotic-anchor-exact-ability'&&reason.evidence?.sourceKind==='selected Exotic armour');
    if(direct&&perkText.toLowerCase().includes(name(component).toLowerCase()))
      bullets.push(`${name(anchor)} supports ${name(component)}. ${description(component)}`);
  }
  const recommendation=build.weaponSelectionRecommendation;
  // The engine also permits manual alternatives and incomplete inventory pools.
  // Never turn KEEP or a keyword score into "nothing you own beat it".
  if(bullets.length<3&&recommendation?.source==='bungie-owned-exact-weapon-instances'){
    const kept=recommendation.decisions?.find(row=>row.action==='KEEP'&&name(row.recommended)&&row.reasons?.some(reason=>reason.kind==='activity'&&reason.term));
    const reason=kept?.reasons.find(row=>row.kind==='activity'&&row.term);
    if(kept&&reason&&text(recommendation.activity))bullets.push(`Kept ${name(kept.recommended)} for ${activityName(recommendation.activity)}. Its active perks include ${text(reason.term)} effects.`);
  }
  const count=recommendation?.legalCombinationCount;
  const validCount=typeof count==='number'&&Number.isSafeInteger(count)&&count>=0&&recommendation?.source==='bungie-owned-exact-weapon-instances';
  const quantity=validCount?(count>=1000000?`${(count/1000000).toLocaleString('en-GB',{maximumFractionDigits:6})} million`:count.toLocaleString('en-GB')):'';
  const scale=validCount?`Checked ${quantity} ${count===1?'combination':'combinations'} of ${recommendation.inventoryScope==='equipped-fallback'?'your equipped weapons':'the weapons you own'}`:'';
  const sentence=value=>text(value).toLowerCase().replace(/-/g,' ');
  const subtitle=[sentence(build.characterClass||'Guardian'),sentence(build.recommendationElement||build.subclassName||build.subclass),sentence(build.objective||'balanced'),activityName(build.activityContext?.key||build.activityContext?.activityKey||build.activityContext?.name)].filter(Boolean).join(' · ');
  return {bullets:bullets.slice(0,3),scale,subtitle:subtitle.charAt(0).toUpperCase()+subtitle.slice(1)+(name(anchor)?` · ${name(anchor)}`:'')};
}
function activityName(value){const key=text(value).toLowerCase();return ({raid:'raids',dps:'boss damage',grandmaster:'Grandmasters',crucible:'Crucible',pve:'PvE',pvp:'PvP'})[key]||text(value);}

// Move the original rendered diagnostics, retaining text, markup and listeners.
// The selector is confined to this popup; Apply readiness remains visible.
const movedDiagnostics=new WeakMap();
export function restoreReviewDiagnostics(dialog){
  for(const {node,marker} of movedDiagnostics.get(dialog)||[]){
    if(marker.parentNode)marker.replaceWith(node);
  }
  movedDiagnostics.delete(dialog);
}
export function collectReviewDiagnostics(dialog){
  const target=dialog?.querySelector('#recommendedBuildDiagnostics');if(!target)return;
  const moved=[];
  const move=node=>{const marker=node.ownerDocument.createComment('Review diagnostic');node.before(marker);moved.push({node,marker});target.append(node);};
  const selectors=['[data-review-diagnostic]','#armourExoticRule','#weaponExoticRule','.review-mod-limitations','.review-mod-decision > small','.review-artifact-synergy','.weapon-combination > p','.weapon-combination > header > span','#recommendedWeaponCombinations > p'];
  for(const node of dialog.querySelectorAll(selectors.join(','))){
    if(target.contains(node))continue;
    move(node);
  }
  // Shared item renderers may also expose these diagnostic-only labels.
  const internal=/evidence score|directed (?:evidence|data) link|excluded from scoring|TIER UNRESOLVED|PERK MODEL UNAVAILABLE|Item instance unavailable|NOT COMPARED|\b\d+ (?:OWNED )?CANDIDATES\b|LEGAL BUCKET PICKS|SYNERGY SCORE|supplied Bungie (?:evidence|data)|DESTINY EQUIP RULE|(?:OWNED )?VAULT \+ CHARACTER INVENTORY|Ammo-role (?:evidence|data) is incomplete|copy.limit|limited to one copy/i;
  for(const node of dialog.querySelectorAll('.recommended-build-content span,.recommended-build-content small,.recommended-build-content b,.recommended-build-content em,.recommended-build-content p')){
    if(!target.contains(node)&&!node.children.length&&internal.test(node.textContent))move(node);
  }
  movedDiagnostics.set(dialog,moved);
}
