import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildHomeSummary, summariseHome} from '../src/home-summary.ts';

const value = (v: number) => ({basic: {value: v}});
const profile = {Response: {
  profile: {data: {userInfo: {bungieGlobalDisplayName: 'Shadowfax', bungieGlobalDisplayNameCode: 471, displayName: 'old'}}},
  characters: {data: {
    '1': {characterId: '1', classType: 2, minutesPlayedTotal: '164000', emblemPath: '/e.jpg', dateLastPlayed: '2026-09-27T18:00:00Z'},
    '2': {characterId: '2', classType: 1, minutesPlayedTotal: '83000', emblemPath: '/e.jpg', dateLastPlayed: '2026-09-20T18:00:00Z'},
    '3': {characterId: '3', classType: 0, minutesPlayedTotal: '22280', emblemPath: '/e.jpg', dateLastPlayed: '2026-01-01T00:00:00Z'}
  }}
}};
const stats = {Response: {
  allPvE: {allTime: {activitiesEntered: value(5210), weaponKillsGrenade: value(6000), weaponKillsMelee: value(3000), weaponKillsSuper: value(5000), suicides: value(300)}},
  allPvP: {allTime: {activitiesEntered: value(1204), weaponKillsGrenade: value(2211), weaponKillsMelee: value(902), weaponKillsSuper: value(544), suicides: value(112)}},
  raid: {allTime: {activitiesCleared: value(146)}}
}};
const weapons = (rows: [number, number][]) => ({Response: {weapons: rows.map(([referenceId, kills]) => ({referenceId, values: {uniqueWeaponKills: value(kills)}}))}});
const activity = (period: string, hash: number) => ({Response: {activities: [{period, activityDetails: {directorActivityHash: hash, referenceId: hash}, values: {completed: value(1), activityDurationSeconds: value(6502)}}]}});

test('summarises real Bungie shapes without inventing anything', () => {
  const s = summariseHome({profile, stats, uniqueWeapons: {'1': weapons([[111, 9000], [222, 100]]), '2': weapons([[111, 3408]])}, activities: {'1': activity('2026-09-27T17:00:00Z', 900), '2': activity('2026-09-20T17:00:00Z', 800)}});
  assert.equal(s.displayName, 'Shadowfax#0471');
  assert.deepEqual(s.timePlayed, {minutes: 269280, hours: 4488, days: 187});
  assert.equal(s.mainCharacter?.className, 'Warlock');
  assert.equal(s.mainCharacter?.share, 61);
  assert.deepEqual(s.classShares.map(r => r.className), ['Warlock', 'Hunter', 'Titan']);
  assert.deepEqual(s.topExoticWeapon, {hash: 111, kills: 12408}, 'kills summed across characters');
  assert.deepEqual(s.abilityKills, {grenade: 8211, melee: 3902, super: 5544});
  assert.deepEqual(s.modes, {pve: 5210, pvp: 1204});
  assert.equal(s.selfEliminations, 412);
  assert.equal(s.raidClears, 146);
  assert.equal(s.lastActivity?.hash, 900, 'most recent activity across characters');
});

test('missing Bungie data becomes null, never zero or a guess', () => {
  const s = summariseHome({profile: null, stats: null, uniqueWeapons: {}, activities: {}});
  assert.equal(s.timePlayed, null);
  assert.equal(s.mainCharacter, null);
  assert.equal(s.topExoticWeapon, null);
  assert.equal(s.abilityKills, null);
  assert.equal(s.modes, null);
  assert.equal(s.selfEliminations, null);
  assert.equal(s.raidClears, null);
  assert.equal(s.lastActivity, null);
});

test('route builder resolves names, drops unnamed cards and stays small', async () => {
  const reads: string[] = [];
  const read = async (input: any) => {
    reads.push(input.kind + (input.characterId ? ':' + input.characterId : ''));
    if (input.kind === 'home-profile') return profile;
    if (input.kind === 'home-stats') return stats;
    if (input.kind === 'unique-weapons') return weapons([[111, 100]]);
    if (input.kind === 'activity-history') return activity('2026-09-27T17:00:00Z', 900);
    return null;
  };
  const named = await buildHomeSummary(read, async (type, hash) => type === 'DestinyInventoryItemDefinition' ? {displayProperties: {name: 'Ace of Spades', icon: '/ace.jpg'}} : {displayProperties: {name: "Salvation's Edge: Master"}});
  assert.equal(named.topExoticWeapon?.name, 'Ace of Spades');
  assert.equal(named.topExoticWeapon?.icon, 'https://www.bungie.net/ace.jpg');
  assert.equal(named.lastActivity?.name, "Salvation's Edge: Master");
  assert.equal(reads.filter(r => r.startsWith('unique-weapons')).length, 3, 'one weapon history read per character');
  assert.ok(JSON.stringify(named).length < 20 * 1024, 'Home summary stays under 20 KB');
  assert.equal('characterIds' in named, false);
  const unnamed = await buildHomeSummary(read, async () => null);
  assert.equal(unnamed.topExoticWeapon, null, 'no definition, no weapon card');
  assert.equal(unnamed.lastActivity, null, 'no definition, no activity card');
  console.log(`HOME_SUMMARY=PASS bytes=${JSON.stringify(named).length}`);
});
