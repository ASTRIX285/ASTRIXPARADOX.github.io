import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {destinationNameMatches,destinationActivityMatches,destinationObjectiveMatches} from '../pages/journey/journey-destination-model.mjs';
const base=new URL('../data/journey-index/',import.meta.url);
const table=type=>Object.assign({},...readdirSync(base).filter(name=>name.startsWith(`${type}-`)).map(name=>JSON.parse(readFileSync(new URL(name,base))).definitions));
const activities=table('DestinyActivityDefinition');
const destinations=table('DestinyDestinationDefinition');
const nodes=table('DestinyPresentationNodeDefinition');
assert.equal(destinations['4076196532'].displayProperties.name,'Kepler');
assert(destinationNameMatches('kepler',nodes['2140539821'].displayProperties.name));
assert(destinationNameMatches('lawless-frontier',nodes['3696748178'].displayProperties.name));
assert(!destinationNameMatches('lawless-frontier','Renegades'));
assert(!destinationNameMatches('lawless-frontier','Europa'));
assert(destinationActivityMatches('kepler',activities['2626024486']));
const frontier=Object.values(activities).filter(row=>destinationActivityMatches('lawless-frontier',row));
assert(frontier.length>0);
for(const activity of frontier){
 assert.equal(activity.activityTypeHash,2292427391);
 assert(destinationObjectiveMatches('lawless-frontier',{},null,activity,destinations));
 assert(!destinationActivityMatches('lawless-frontier',{...activity,activityTypeHash:0},destinations[activity.destinationHash]));
 assert(!destinationObjectiveMatches('lawless-frontier',{destinationHash:activity.destinationHash},null,null,destinations));
 assert(!destinationObjectiveMatches('lawless-frontier',{visible:false},null,activity,destinations));
}
assert(destinationObjectiveMatches('kepler',{}, {destinationHash:4076196532},null,destinations));
assert(!destinationObjectiveMatches('kepler',{},null,null,destinations));
assert(!destinationActivityMatches('lawless-frontier',{activityTypeHash:2292427391,redacted:true}));
assert(destinationNameMatches('throne-world',"Savathûn's Throne World"));
assert(destinationNameMatches('edz','European Dead Zone'));
console.log(`Journey destinations: Kepler and ${frontier.length} Lawless Frontier activity definitions verified; host-planet isolation and missing-data cases passed.`);
