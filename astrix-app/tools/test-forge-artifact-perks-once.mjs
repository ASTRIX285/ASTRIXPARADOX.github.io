#!/usr/bin/env node
// Character and Build Forge show the same Artifact perks, each once (Miguel, 27 Nov 2026).
// Fixture: an Artifact 2.0 definition whose socket buckets offer some perks in more than one bucket,
// with seven different perks socketed. Character used to list every bucket copy of a socketed perk
// (three perks twice plus one more), Build Forge listed the seven. Both now read one list from the
// same profile data. Runs the production profile, Character state and Build Forge display code.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {resolveArtifactTwoCatalog} from '../pages/guardian-workspace-v2/guardian-artifact-catalog.mjs';
import {createArtifactConfiguration} from '../pages/guardian-workspace-v2/guardian-artifact-provenance.mjs';
import {resolveArtifactViewState} from '../pages/guardian-workspace-v2/guardian-artifact-state.mjs';

const profileSource=await readFile(new URL('../pages/guardian-workspace-v2/guardian-bungie-profile.mjs',import.meta.url),'utf8');
const buildSource=await readFile(new URL('../pages/guardian-workspace-v2/paradox-build-space/paradox-build-space.mjs',import.meta.url),'utf8');
const between=(source,start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));

// Artifact 2.0 definition: five socket buckets. Perks 103, 104 and 105 are offered in two buckets each.
const ARTIFACT=900100,perk=hash=>({hash,itemTypeDisplayName:'Artifact Perk',displayProperties:{name:`Perk ${hash}`,description:`Perk ${hash} effect.`,icon:`/icons/${hash}.png`}});
const buckets=[[101,102,103],[103,104,105],[104,105,106],[106,107,108],[108,109]];
const inventory={[ARTIFACT]:{hash:ARTIFACT,itemTypeDisplayName:'Artifact',displayProperties:{name:'Fixture Artifact',icon:'/icons/artifact.png'},
  sockets:{socketEntries:buckets.map((_,index)=>({reusablePlugSetHash:800+index}))}}};
for(const hash of new Set(buckets.flat()))inventory[hash]=perk(hash);
const plugSets=Object.fromEntries(buckets.map((rows,index)=>[800+index,{reusablePlugItems:rows.map(plugItemHash=>({plugItemHash}))}]));
const catalog=resolveArtifactTwoCatalog({inventoryDefinitions:inventory,plugSetDefinitions:plugSets});
assert.equal(catalog.length,1,'fixture catalogue has one Artifact');
assert.ok(catalog[0].perks.some((row,index,rows)=>rows.findIndex(other=>other.hash===row.hash)!==index),'fixture offers a perk in more than one bucket');

// Seven different perks socketed on the equipped Artifact, including the ones offered twice.
const socketed=[101,103,104,105,106,107,108];
const profile={itemComponents:{sockets:{data:{'artifact-1':{sockets:socketed.map(plugHash=>({plugHash}))}}}}};
const context=vm.createContext({createArtifactConfiguration});
vm.runInContext(`${between(profileSource,'function equippedArtifactFromCatalog','\n}\n')}\n}\nthis.equippedArtifactFromCatalog=equippedArtifactFromCatalog;`,context);
const artifact=context.equippedArtifactFromCatalog(profile,[{itemHash:ARTIFACT,itemInstanceId:'artifact-1'}],catalog,null);
const hashes=rows=>rows.map(row=>Number(row.hash));

// Profile: one active row per perk, in Bungie's order.
assert.deepEqual(hashes(artifact.activePerks),socketed,'Profile lists each socketed Artifact perk once');
assert.deepEqual(artifact.artifactConfiguration.selectedPerkHashes,socketed,'The stored configuration matches the active perks');

// Character (guardian-artifact.mjs reads resolveArtifactViewState and shows the first seven).
const character=resolveArtifactViewState({source:'bungie-live',artifact,artifactConfiguration:artifact.artifactConfiguration});
const characterShown=character.selectedHashes.slice(0,7);
assert.equal(new Set(characterShown).size,characterShown.length,'Character shows each Artifact perk once');
// A cached handoff from before this fix may still carry bucket copies; Character lists each perk once.
const stale={...artifact,activePerks:artifact.perks.filter(row=>row.isActive)};
assert.ok(stale.activePerks.length>socketed.length,'stale fixture repeats bucket copies');
assert.deepEqual(resolveArtifactViewState({source:'bungie-live',artifact:stale}).selectedHashes,socketed,'Character lists each perk once from a stale handoff too');

// Build Forge (renderArtifact: configured hashes mapped onto the perk catalogue, first seven shown).
const displayLine=between(buildSource,'configuredHashes=Array.isArray(','recommendationRows=');
assert.match(displayLine,/displayPerks=configuredHashes\?configuredHashes\.map\(hash=>allArtifactPerks\.find/,'Build Forge display rule unchanged');
const buildForgeShown=artifact.artifactConfiguration.selectedPerkHashes.map(hash=>artifact.perks.find(row=>String(row.hash)===String(hash))).filter(Boolean).slice(0,7).map(row=>Number(row.hash));
assert.deepEqual(characterShown,buildForgeShown,'Character and Build Forge show the same Artifact perks in the same order');
assert.equal(characterShown.length,7,'all seven perks are shown');
console.log('FORGE_ARTIFACT_PERKS_ONCE=PASS');
