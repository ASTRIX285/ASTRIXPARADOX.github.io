// Derived region fixtures for the Aetherium tests. These are NOT raw captures: each one is built from the
// captured EU fixtures (eu/) by changing the region, server ids, server names, class and race, to match the
// facts checked on the official search page on 9 Oct 2026 (see ENDPOINTS-regions.md). Server and character
// names are synthetic. Nothing here is Bungie or NCSOFT data beyond what the EU capture already holds.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const dir=fileURLToPath(new URL('./eu/',import.meta.url));
const load=name=>JSON.parse(readFileSync(`${dir}${name}.json`,'utf8'));
const clone=value=>JSON.parse(JSON.stringify(value));

/** The five official regions. digit is the second digit of a server id (Elyos 1x.., Asmodian 2x..). */
export const REGION_TABLE=Object.freeze([
  {code:'naw',name:'North America - West',digit:2,servers:10,cls:'Spiritmaster',level:45},
  {code:'nae',name:'North America - East',digit:1,servers:16,cls:'Assassin',level:45},
  {code:'eu',name:'Europe',digit:3,servers:46,cls:'Gladiator',level:45},
  {code:'la',name:'South America',digit:4,servers:12,cls:'Sorcerer',level:45},
  {code:'as',name:'Asia',digit:5,servers:18,cls:'Ranger',level:45}
]);

/** The Daevanion board ids: Elyos 11 to 16 (no 15), Asmodian 31 to 36 (no 35). */
export const BOARD_IDS=Object.freeze({elyos:[11,12,13,14,16],asmodian:[31,32,33,34,36]});

const label=code=>code.toUpperCase();

/** serverList for a region: half Elyos, half Asmodian, ids 1<digit>NN and 2<digit>NN, synthetic names. */
export function deriveServers(code){
  const row=REGION_TABLE.find(item=>item.code===code);
  if(!row) throw new Error(`Unknown region ${code}`);
  const each=row.servers/2;
  const list=[];
  for(const [raceId,lead] of [[1,1],[2,2]]){
    for(let n=1;n<=each;n++){
      const name=`${label(code)} ${raceId===1?'Elyos':'Asmodian'} ${n}`;
      list.push({raceId,serverId:lead*1000+row.digit*100+n,serverName:name,serverShortName:`${label(code)}${raceId}${String(n).padStart(2,'0')}`});
    }
  }
  return {serverList:list};
}

/**
 * One derived character in a region. race is 'elyos' or 'asmodian'. The official data spells the Asmodian race
 * "Asmodians" (raceId 2), so the derived info does too. Skills and gear stay the EU capture's, only className changes.
 */
export function deriveRegion(code,{race='elyos'}={}){
  const row=REGION_TABLE.find(item=>item.code===code);
  if(!row) throw new Error(`Unknown region ${code}`);
  const asmodian=race==='asmodian';
  const lead=asmodian?2:1;
  const serverId=lead*1000+row.digit*100+1;
  const servers=deriveServers(code).serverList;
  const server=servers.find(item=>item.serverId===serverId);
  const info=clone(load('astrix285-info'));
  const equipment=clone(load('astrix285-equipment'));
  const daevanion=clone(load('astrix285-daevanion-11'));
  const search=clone(load('astrix285-search'));
  const name=`Derived${label(code)}${asmodian?'Asmodian':'Elyos'}`;
  Object.assign(info.profile,{
    characterName:name,className:row.cls,characterLevel:row.level,
    serverId,serverName:server.serverName,
    raceId:asmodian?2:1,raceName:asmodian?'Asmodians':'Elyos',
    characterId:`derived-${code}-${race}-id=`
  });
  if(asmodian){
    const ids=BOARD_IDS.asmodian;
    info.daevanion.boardList.forEach((board,index)=>{board.id=ids[index];});
    for(const node of daevanion.nodeList){
      node.boardId=31;
      node.nodeId=Number(String(node.nodeId).replace(/^11/,'31'));
    }
  }
  const hit=search.list[0];
  Object.assign(hit,{name:`<strong>${name}</strong>`,race:asmodian?2:1,level:row.level,serverId,serverName:server.serverName,region:code,
    characterId:encodeURIComponent(info.profile.characterId)});
  return {region:row,serverId,serverName:server.serverName,name,characterId:info.profile.characterId,
    servers,info,equipment,daevanion,search,boardIds:asmodian?BOARD_IDS.asmodian:BOARD_IDS.elyos};
}
