#!/usr/bin/env node
// Refresh the saved AION 2 server lists (astrix-app/games/aion2/data/servers.json) from the live Worker, every region.
// The Daeva Card already reads the live list each time; this file is only its first paint and its fallback, so run
// this when the official site adds servers. Usage: node astrix-app/tools/refresh-aion2-servers.mjs
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const WORKER='https://aetherium-worker.astrix285.workers.dev';
const REGIONS=['naw','nae','eu','la','as'];
const file=fileURLToPath(new URL('../games/aion2/data/servers.json',import.meta.url));
const current=JSON.parse(readFileSync(file,'utf8'));
const regions={};
let savedAt=null;
for(const code of REGIONS){
  const response=await fetch(`${WORKER}/aion2/servers?region=${code}`,{headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error(`${code}: the Worker answered ${response.status}`);
  const body=await response.json();
  const list=Array.isArray(body.serverList)?body.serverList:[];
  // Never shrink a list to nothing on a bad answer: keep what was saved and say so.
  if(!list.length){console.log(`${code}: empty answer, kept ${current.regions[code]?.length??0} saved servers`);regions[code]=current.regions[code]??[];continue;}
  regions[code]=list.map(({raceId,serverId,serverName,serverShortName})=>({raceId,serverId,serverName,serverShortName}));
  savedAt=body.meta?.fetchedAt??new Date().toISOString();
  const before=new Set((current.regions[code]??[]).map(server=>server.serverId));
  const added=regions[code].filter(server=>!before.has(server.serverId)).map(server=>server.serverName);
  console.log(`${code}: ${regions[code].length} servers${added.length?`, new: ${added.join(', ')}`:''}`);
}
const lines=['{',`  "source": ${JSON.stringify(current.source)},`,`  "savedAt": ${JSON.stringify(savedAt??current.savedAt)},`,`  "note": ${JSON.stringify(current.note)},`,'  "regions": {'];
REGIONS.forEach((code,at)=>{
  lines.push(`    "${code}": [`);
  regions[code].forEach((server,i)=>lines.push(`      ${JSON.stringify(server)}${i<regions[code].length-1?',':''}`));
  lines.push(`    ]${at<REGIONS.length-1?',':''}`);
});
lines.push('  }','}');
writeFileSync(file,`${lines.join('\n')}\n`);
console.log('AION2_SERVERS_REFRESHED=PASS');
