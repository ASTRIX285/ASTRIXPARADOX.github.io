#!/usr/bin/env node
// Armoury EDIT and SAVE TO IN-GAME failure paths. Runs the real Armoury page code
// (from `const byId=` to the tooltip code) with Bungie, storage and the profile worker
// mocked. Synthetic contract inputs only, never live-account data.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {classifyArmourPlug,normaliseArmourSemantics} from '../pages/guardian-workspace-v2/guardian-semantic-resolver.mjs';
import {createLiveTransferPlan,subclassCompatibilityViolations} from '../pages/guardian-workspace-v2/guardian-perk-change-plan.mjs';
import {filterManualEquipmentSources,eligibleEquipment,stageEquipmentChoice,stageSocketChoice,stageSubclassSocketChoice,recordManualEdit,socketGroups} from '../pages/guardian-workspace-v2/paradox-build-space/paradox-manual-editor.mjs';
import {inventoryLocations,sessionBinding,liveActionCapabilities,verifyReadback} from '../pages/guardian-workspace-v2/guardian-live-actions.mjs';
import {itemTileMarkup} from '../shared/guardian-inventory-workspace.mjs';

const EMPTY_PLUG=2166136261;
const CHARACTER_ID='9100001',MEMBERSHIP_ID='9200001',MEMBERSHIP_TYPE='3';
const OUTAGE=/Bungie is unavailable right now\. Your builds are safe\. Try again in a few minutes\./;
const MISSING=/Bungie did not return your Guardian data\. Retry\./;
const SLOW=/Loading your Guardian took too long\. Retry\./;
const binding={characterId:CHARACTER_ID,membershipId:MEMBERSHIP_ID,membershipType:MEMBERSHIP_TYPE,characterClass:'titan'};
const session={authenticated:true,csrfToken:'synthetic',activeDestinyMembership:{membershipId:MEMBERSHIP_ID,membershipType:Number(MEMBERSHIP_TYPE)},capabilities:{destinyActions:{}}};
const clone=value=>structuredClone(value);
const source=readFileSync(new URL('../pages/loadout/paradox-loadouts.mjs',import.meta.url),'utf8');
const pageSource=source.slice(source.indexOf('const byId='),source.indexOf('let itemTooltip=')).replace(/export (async )?function /g,(_,a)=>`${a||''}function `);

// A saved build with empty weapon and armour slots, null and empty-plug sockets.
const emptyPlug={hash:EMPTY_PLUG,itemHash:EMPTY_PLUG,name:`Unresolved Destiny item ${EMPTY_PLUG}`,socketIndex:7};
const helmet={itemInstanceId:'7001',hash:7000,name:'Seventh Seraph Helmet',bucketHash:3448274439,classType:0,
  socketCoverage:{plugs:[null,emptyPlug,{hash:7100,name:'Real mod',socketIndex:2}]},generalMods:[emptyPlug,null],ornament:emptyPlug,shader:null};
const savedBuild={...binding,weapons:[null,{itemInstanceId:'7002',hash:7002,name:'Saved weapon',bucketHash:2465295065},null],armour:[helmet,null,null,null,null],
  subclassItem:{itemInstanceId:'7003',hash:7003,name:'Saved subclass'},subclassItemInstanceId:'7003',
  subclassBuild:{super:null,abilities:[null],aspects:[emptyPlug],fragments:[null,emptyPlug],transcendenceSlots:[null]}};
const record={id:'saved-1',name:'Saved one',description:'',binding,revision:1,updatedAt:'2026-10-01T00:00:00.000Z',build:savedBuild};

function harness({session:sessionAnswer=()=>session,profile=()=>goodProfile(),normalise=()=>equipped()}={}){
  const nodes=new Map(),calls={plan:0,profile:0};
  const node=id=>{
    if(!nodes.has(id))nodes.set(id,{id,innerHTML:'',textContent:'',hidden:false,open:false,value:'',inert:false,classList:{toggle(){}},
      querySelector(){return {focus(){}};},querySelectorAll(){return [];},showModal(){this.open=true;},close(){this.open=false;}});
    return nodes.get(id);
  };
  const context={URL,structuredClone,Date,Promise,classifyArmourPlug,normaliseArmourSemantics,itemTileMarkup,inventoryLocations,sessionBinding,liveActionCapabilities,verifyReadback,
    eligibleEquipment,filterManualEquipmentSources,stageEquipmentChoice,stageSocketChoice,stageSubclassSocketChoice,recordManualEdit,socketGroups,subclassCompatibilityViolations,
    createLiveTransferPlan:(...args)=>{calls.plan++;return createLiveTransferPlan(...args);},
    stageLiveTransferPreflight:async plan=>plan,
    LOADOUT_DEFINITIONS:{},hideItemTooltip(){},CustomEvent:class{constructor(type,options={}){this.type=type;this.detail=options.detail;}},
    document:{getElementById:node,querySelector:()=>null,dispatchEvent(){}},
    getBungieSession:async()=>sessionAnswer(),
    requestFreshProfile:async()=>{calls.profile++;return profile();},
    runProfileTask:async()=>normalise(),
    normalisePreparedPagePayload:value=>value,guardianManifest:{seedPayload(){},applyForgeArmourIndex:()=>true,hydratePayload:value=>value},
    createVaultCatalogue:()=>({items:[]}),
    ARMOURY_STEP_TIMEOUT_MS:50,setTimeout,clearTimeout
  };
  runInNewContext(pageSource+`;this.api={render,runBusy,openEditor,reviewBuildAction,refreshProfile,savedBuildOverview,selectedSocketTargets,livePlugHashes,draftFor,
    set(next){records=next.records;session=next.session;characterId=next.characterId;equipped=next.equipped;payload=next.payload;loading=false;},
    state(){return {busy,dialogState,records:visibleRecords().length,session};}};`,context);
  context.api.set({records:[clone(record)],session,characterId:CHARACTER_ID,equipped:equipped(),payload:goodProfile()});
  return {api:context.api,dialog:node('paradoxLoadoutDialog'),status:node('paradoxLoadoutStatus'),calls};
}
function goodProfile(){return {definitions:{},profile:{characters:{data:{[CHARACTER_ID]:{characterId:CHARACTER_ID,classType:0}}},characterEquipment:{data:{[CHARACTER_ID]:{items:[]}}},itemComponents:{sockets:{data:{'7001':{sockets:[{plugHash:7101},{plugHash:7102},{plugHash:7100}]}}}}}};}
function equipped(){return {characterId:CHARACTER_ID,characterClass:'titan',subclassName:'Synthetic',subclassCatalog:[null],loadoutsAvailable:true,loadouts:[],artifact:{activePerks:[]},weapons:[],armour:[]};}

// 1. Empty plug: 2166136261 renders as an empty socket, never a fake item, and is never applied.
{
  const {api}=harness();
  const markup=api.savedBuildOverview(savedBuild);
  assert.doesNotMatch(markup,/Unresolved Destiny item/,'2166136261 must never render as an item');
  assert.match(markup,/aria-label="Empty socket"/,'2166136261 renders as an empty socket');
  const targets=api.selectedSocketTargets(savedBuild);
  assert.ok(targets.every(row=>row.plugHash!==EMPTY_PLUG),'The empty plug is never a socket target');
  assert.deepEqual(Array.from(api.livePlugHashes([7200,EMPTY_PLUG,7202],[{plugHash:1},{plugHash:7201},{plugHash:3}])),[7200,7201,7202],'An empty-plug slot socket keeps its live plug');
  assert.equal(api.livePlugHashes([EMPTY_PLUG],[]),null,'Without a live plug the slot leaves live sockets untouched');
  console.log('ARMOURY_EMPTY_PLUG=PASS 2166136261 is an empty socket in cards, apply targets and slot copies');
}

// 2. EDIT with empty slots and sockets opens the editor and never reads a null hash.
{
  const {api,dialog}=harness();
  await api.runBusy(()=>api.openEditor(api.draftFor('saved-1')));
  assert.equal(dialog.open,true);
  assert.match(dialog.innerHTML,/EDIT Saved one/,'The editor opens for a build with empty slots and sockets');
  assert.doesNotMatch(dialog.innerHTML,/Cannot read properties/);
  assert.equal(api.state().busy,false);
  console.log('ARMOURY_EDIT_EMPTY=PASS editor opens with empty slots, null sockets and empty plugs');
}

// 3. SAVE TO IN-GAME with empty slots stops on a named blocker, not a TypeError.
{
  const {api,dialog}=harness();
  await api.runBusy(()=>api.reviewBuildAction('saved-1',true));
  assert.equal(api.state().busy,false,'busy is always released');
  assert.doesNotMatch(dialog.innerHTML,/Cannot read properties/);
  assert.match(dialog.innerHTML,/Three weapon instances are required before Apply\./,'Empty weapon slots stop Apply with a clear reason');
  console.log('ARMOURY_SAVE_INGAME_EMPTY=PASS empty slots stop with a named blocker');
}

// 4. A 5xx profile refresh stops with the outage message and RETRY, before any plan or editor.
for(const status of [503,500]){
  for(const action of ['edit','ingame']){
    const {api,dialog,calls}=harness({profile:()=>{const error=new Error('bungie_unavailable');error.status=status;error.payload={error:'bungie_unavailable'};throw error;}});
    await api.runBusy(()=>action==='edit'?api.openEditor(api.draftFor('saved-1')):api.reviewBuildAction('saved-1',true));
    assert.match(dialog.innerHTML,OUTAGE,`${status} on ${action} shows the outage message`);
    assert.match(dialog.innerHTML,/data-dialog-retry/,'A RETRY button is offered');
    assert.doesNotMatch(dialog.innerHTML,/EDIT Saved one|SAVE TO IN-GAME<\/h2>/,'Never continue into the editor or plan');
    assert.equal(calls.plan,0);
    assert.equal(api.state().busy,false);
    assert.equal(api.state().records,1,'Cached Armoury builds stay visible');
  }
}
console.log('ARMOURY_5XX=PASS 500 and 503 stop Edit and Save to In-Game with RETRY and keep cached builds');

// 5. An unavailable session answer is an outage, not a sign-out: the session and builds stay.
{
  const {api,dialog}=harness({session:()=>({authenticated:null,error:'bungie_unavailable'})});
  await api.runBusy(()=>api.reviewBuildAction('saved-1',true));
  assert.match(dialog.innerHTML,OUTAGE);
  assert.equal(api.state().session.authenticated,true,'The signed-in session is kept');
  assert.equal(api.state().records,1);
  console.log('ARMOURY_SESSION_UNAVAILABLE=PASS session outage keeps the session and builds');
}

// 6. A null or partial profile stops with the missing-data message.
for(const [label,profile] of [['null',()=>null],['no profile',()=>({})],['no character',()=>({profile:{characters:{data:{}},characterEquipment:{data:{}}}})],['no equipment',()=>({profile:{characters:{data:{[CHARACTER_ID]:{}}}}})]]){
  const {api,dialog,calls}=harness({profile});
  await api.runBusy(()=>api.reviewBuildAction('saved-1',true));
  assert.match(dialog.innerHTML,MISSING,`${label} profile stops with the missing-data message`);
  assert.equal(calls.plan,0,'No plan is built on missing data');
  assert.equal(api.state().busy,false);
}
{
  const {api,dialog}=harness({normalise:()=>null});
  await api.runBusy(()=>api.openEditor(api.draftFor('saved-1')));
  assert.match(dialog.innerHTML,MISSING,'An empty normalised Guardian stops the editor');
}
console.log('ARMOURY_PARTIAL_PROFILE=PASS null, empty and partial profiles never reach the editor or plan');

// 7. A stalled step times out, releases busy and offers RETRY.
{
  const {api,dialog}=harness({profile:()=>new Promise(()=>{})});
  await api.runBusy(()=>api.openEditor(api.draftFor('saved-1')));
  assert.match(dialog.innerHTML,SLOW);
  assert.match(dialog.innerHTML,/data-dialog-retry/);
  assert.equal(api.state().busy,false,'A hung step can never leave the page busy');
  console.log('ARMOURY_STEP_TIMEOUT=PASS a stalled refresh step times out and releases busy');
}
