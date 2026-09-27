import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../pages/guardian-workspace-v2/paradox-build-space/paradox-build-space.mjs',import.meta.url),'utf8');
const between=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
for(const changeDuringPaint of [false,true]){
 const chosen={id:'chosen'},alternative={id:'alternative'},full={patch:{weaponSelectionRecommendation:{combinations:[chosen,alternative]}},recommendation:{}},first={...full,patch:{weaponSelectionRecommendation:{combinations:[chosen]}}};
 let resolveFull;const completed=new Promise(resolve=>{resolveFull=resolve;});let painted=false,alternativesRendered=false;
 const h=vm.createContext({console,clearTimeout,beginEngineTiming:()=>({mark(){},end(){}}),
  currentBuild:()=>h.readState().workingBuild,byId:()=>null,renderRecommendationControls(){},restorePersistedBuildState:async()=>null,refreshForgeArtifactRecommendation:async()=>{},
  forgeActivityOption:()=>true,validateForgeGenerationEntry:()=>({ready:true}),filterExoticCompatibleSubclasses:(b,c)=>c,resolvedSubclassOptions:()=>[{element:'void'}],hasVerifiedSubclassSockets:()=>true,elementOf:x=>x.element,
  showForgeGenerationLoader:async()=>{},prepareForgeBackground:async()=>{},forgePreparationKey:()=>'',requestedForgeVariant:()=>({element:'void'}),
  forgePreparation:{get:(v,{first=false}={})=>first?Promise.resolve(first?{...full,patch:{weaponSelectionRecommendation:{combinations:[chosen]}}}:full):completed,invalidate(){assert.ok(painted,'Publishing the first build must not cancel pending alternatives.');}},
  validateLoadoutCoherence:()=>({}),createLiveTransferPreflight:()=>({ready:true}),protectBuildState:x=>x,queueStatePersistence(){},updateForgeGenerationPhase:async()=>{},
  render(){},hideForgeGenerationLoader(){},openRecommendedBuild:async()=>true,
  async afterEnginePaint(){assert.equal(h.readState().workingBuild.weaponSelectionRecommendation.combinations.length,1);painted=true;if(changeDuringPaint)vm.runInContext("volatileState={workingBuild:{newSelection:true}}",h);resolveFull(full);},
  renderRecommendedBuildReview(build){assert.equal(build.weaponSelectionRecommendation.combinations.length,2);alternativesRendered=true;},setLiveActionBanner(message){throw new Error(message);}
 });
 vm.runInContext(`let volatileState={originalBuild:{},workingBuild:{activityContext:{}}},recommendationBusy=false,directEntryBusy=false,recommendationFailure='',activeLoadError='',preparationTimer=null,activePreparationKey='',selectedRecommendationElement='void';function readState(){return volatileState;}
 ${between('function writeState(', 'function requestedTransferBinding')}
 ${between('async function generateMaxLoadout(', 'function renderBuildSurface')}
 `,h);
 await h.generateMaxLoadout();assert.ok(painted);assert.equal(alternativesRendered,!changeDuringPaint);if(changeDuringPaint)assert.ok(h.readState().workingBuild.newSelection);
}
console.log('ENGINE_STREAM_REVIEW=PASS first paint, alternatives, stale selection');
