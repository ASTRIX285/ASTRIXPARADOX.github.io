// Synthetic API-shaped counts. No fixture is used by the production page.
import {catalogue} from '../../pages/reports/reports-model.mjs';
const definition=(hash,name,mode=4,releaseTime=0)=>({hash,displayProperties:{name},activityModeTypes:[mode,7],releaseTime,pgcrImage:''});
export const definitions={
  100:definition(100,'Fixture Raid: Normal',4,100),
  101:definition(101,'Fixture Raid: Master',4,100),
  102:definition(102,'New Raid: Normal',4,200),
  200:definition(200,'Fixture Dungeon: Standard',82),
  300:definition(300,'Fixture Strike',3),
  301:definition(301,'Nightfall Grandmaster: Fixture Strike',46),
  // Prompt 20a-fix2: exercise every series with an actual visible card.
  400:definition(400,'Fixture Conquest: Standard',2),
  500:definition(500,'Fixture Sector: Legend',87),
  600:{...definition(600,'Fixture Exotic: Normal',2),activityTypeHash:1227821118},
  700:definition(700,'Fixture Story: Normal',2)
};
const row=(hash,entered,cleared,kills,deaths,time,fastest,score)=>({activityHash:hash,values:Object.fromEntries(Object.entries({activitiesEntered:entered,activityCompletions:cleared,activityKills:kills,activityDeaths:deaths,activitySecondsPlayed:time,fastestCompletionMsForActivity:fastest*1000,bestSingleGameScore:score}).map(([key,value])=>[key,{basic:{value}}]))});
export const fixture={
  identity:'3:123',fetchedAt:1,
  characters:[{characterId:'1',classType:0},{characterId:'2',classType:1},{characterId:'3',classType:2}],
  catalogue:catalogue(definitions),
  aggregates:{
    1:{activities:[row(100,3,2,90,9,3000,900,100),row(101,1,1,30,3,1000,1000,120)]},
    2:{activities:[row(100,2,1,60,6,2400,800,80)]},
    3:{activities:[row(100,4,3,120,12,3600,700,110),row(101,2,1,70,7,2000,950,125)]}
  },milestones:{},records:{}
};
