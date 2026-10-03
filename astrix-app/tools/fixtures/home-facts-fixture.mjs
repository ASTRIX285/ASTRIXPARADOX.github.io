// Fixture account for Guardian Home fresh facts: synthetic numbers in Bungie's shapes, never used by
// the production page. Some stats are left out or zero on purpose (orbsGathered missing,
// heroicPublicEventsCompleted 0, longestKillDistance missing) so the tests can prove those facts are skipped.
export const summary={schemaVersion:1,displayName:'Shadowfax#0471',timePlayed:{minutes:258720,hours:4312,days:179},
  classShares:[{className:'Warlock',minutes:157800,share:61},{className:'Hunter',minutes:80200,share:31},{className:'Titan',minutes:20720,share:8}],
  mainCharacter:{className:'Warlock',share:61},topExoticWeapon:{name:'Ace of Spades',icon:null,kills:12408},
  abilityKills:{grenade:71070,melee:3902,super:5544},modes:{pve:5210,pvp:1204},selfEliminations:412,raidClears:146,
  lastActivity:{name:"Salvation's Edge: Master",period:'2026-10-03T10:00:00Z',completed:true,durationSeconds:6502}};
const stat=value=>({basic:{value}});
const group=values=>({allTime:Object.fromEntries(Object.entries(values).map(([name,value])=>[name,stat(value)]))});
export const historical={Response:{mergedAllCharacters:{results:{
  allPvE:group({kills:412000,precisionKills:151300,deaths:21400,assists:96100,resurrectionsPerformed:3104,resurrectionsReceived:2890,longestKillSpree:311,bestSingleGameKills:1488,
    longestSingleLife:5400,orbsDropped:61200,publicEventsCompleted:2207,heroicPublicEventsCompleted:0,activitiesCleared:4320,secondsPlayed:12400000,
    weaponKillsHandCannon:88000,weaponKillsAutoRifle:41000,weaponKillsSniper:12000,weaponKillsGrenade:69000,weaponKillsMelee:3500,weaponKillsSuper:5300}),
  allPvP:group({kills:18600,precisionKills:6100,deaths:9900,assists:4300,resurrectionsPerformed:0,resurrectionsReceived:0,longestKillSpree:14,bestSingleGameKills:41,
    longestSingleLife:610,orbsDropped:2100,publicEventsCompleted:0,heroicPublicEventsCompleted:0,activitiesCleared:1100,secondsPlayed:3100000,
    weaponKillsHandCannon:9100,weaponKillsAutoRifle:1200,weaponKillsSniper:2400,weaponKillsGrenade:2070,weaponKillsMelee:402,weaponKillsSuper:244})
}}}};
// Facts the fixture cannot support: their stats are missing or zero.
export const MISSING_FACTS=Object.freeze(['orbs-collected','heroic-events','kill-distance']);
