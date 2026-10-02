#!/usr/bin/env node
// Markdown report from perf-measure.mjs results (paths and timings only; no cookies, tokens or queries).
//   node perf-report.mjs <perf-results.json> [--title "..."] [--signed-out <perf-results.json>]
import {readFile} from 'node:fs/promises';
const [input]=process.argv.slice(2).filter(value=>!value.startsWith('--'));
const arg=(name,fallback)=>{const index=process.argv.indexOf(`--${name}`);return index>0?process.argv[index+1]:fallback;};
const rows=JSON.parse(await readFile(input,'utf8'));
const signedOut=arg('signed-out')?JSON.parse(await readFile(arg('signed-out'),'utf8')):null;
const pages=[...new Set(rows.map(row=>row.page))],profiles=['phone','desktop'].filter(name=>rows.some(row=>row.profile===name));
const find=(set,page,profile,cache)=>set.find(row=>row.page===page&&row.profile===profile&&row.cache===cache)||{};
const ms=value=>value==null?'-':`${(value/1000).toFixed(2)} s`;
const num=value=>value==null?'-':String(value);
const out=[];
out.push(`# ${arg('title','Tool page load, live astrixparadox.com, signed in')}`,'');
out.push('Measured with `astrix-app/tools/perf/perf-measure.mjs` in Miguel\'s own Chrome (signed in by Miguel, attached over CDP).');
out.push('Phone: 390x844 at 3x, Lighthouse Slow 4G applied throttling (562.5 ms latency, 1474.56 Kbps down, 675 Kbps up), 4x CPU slowdown. Desktop: 1600x900, no throttling.');
out.push('Cold: browser cache cleared before the load (cookies kept). Warm: the next load with the cache kept.');
out.push('First paint: first contentful paint. Usable: the page\'s forge:portal-ready signal when it fires, otherwise the moment network and DOM went quiet for 2 s (capped at 60 s); the signal used is shown per row.');
out.push('KB is transferred size (compressed). Paths only; query strings are never recorded.','');

out.push('## Per page','');
out.push('| Page | Profile | Cache | Requests | KB | First paint | Usable | Usable signal |','|---|---|---|---|---|---|---|---|');
for(const page of pages)for(const profile of profiles)for(const cache of ['cold','warm']){
  const row=find(rows,page,profile,cache);
  out.push(`| ${page} | ${profile} | ${cache} | ${num(row.requests)} | ${num(row.kb)} | ${ms(row.fcp)} | ${ms(row.usable)} | ${row.usableSignal||row.error||'-'} |`);
}
out.push('');

out.push('## Time split per stage (cold loads)','');
out.push('Times are from the first request of the load. HTML: document request start to end. JS/CSS: first code request start to last code response end. Worker data: prepared page payload and live profile from auth.astrixparadox.com, first start to last end, with bytes (streamed bytes counted) and calls still open when the load was measured. Render: usable minus the last Worker data response.','');
out.push('| Page | Profile | HTML | JS/CSS requests | JS/CSS KB | JS/CSS span | Module depth | Worker calls | Worker data span | Render after data | Usable |','|---|---|---|---|---|---|---|---|---|---|---|');
for(const page of pages)for(const profile of profiles){
  const row=find(rows,page,profile,'cold');if(!row.code){out.push(`| ${page} | ${profile} | ${row.error||'-'} |||||||||`);continue;}
  const html=row.html?`${row.html.start}-${row.html.end} ms`:'-',codeSpan=`${row.code.firstStart}-${row.code.lastEnd} ms`,data=row.data.firstStart==null?'none':`${row.data.firstStart}-${row.data.lastEnd??'?'} ms, ${row.data.kb??'-'} KB${row.data.open?`, ${row.data.open} still open`:''}`;
  out.push(`| ${page} | ${profile} | ${html} | ${row.code.requests} | ${row.code.kb} | ${codeSpan} | ${row.code.moduleDepth} | ${row.worker.length} | ${data} | ${row.renderAfterData==null?'-':`${row.renderAfterData} ms`} | ${ms(row.usable)} |`);
}
out.push('');

out.push('## Worker calls (phone, cold)','');
for(const page of pages){
  const row=find(rows,page,'phone','cold');if(!row.worker)continue;
  out.push(`**${page}**: ${row.worker.length?row.worker.map(call=>`${call.path.replace('auth.astrixparadox.com','')} at ${call.start} ms, ${call.open?`still open (last byte ${call.lastByte??'-'} ms)`:`${call.ms} ms`}, ${call.kb} KB`).join('; '):'none'}`,'');
}

for(const profile of profiles){
  out.push(`## Five slowest requests per page (${profile}, cold)`,'');
  for(const page of pages){
    const row=find(rows,page,profile,'cold');if(!row.slowest)continue;
    out.push(`**${page}**`,'','| Request | Type | Start | Duration | KB |','|---|---|---|---|---|');
    for(const request of row.slowest)out.push(`| ${request.path} | ${request.type} | ${request.start} ms | ${request.ms} ms | ${request.kb} |`);
    out.push('');
  }
  out.push(`## Five largest requests per page (${profile}, cold)`,'');
  for(const page of pages){
    const row=find(rows,page,profile,'cold');if(!row.largest)continue;
    out.push(`**${page}**: ${row.largest.map(request=>`${request.path} ${request.kb} KB`).join('; ')}`,'');
  }
}

out.push('## Files requested under more than one URL','');
out.push('Same file, different ?v= query. Each extra URL is a separate download and a separate module instance.','');
for(const page of pages){
  const seen=new Map();
  for(const row of rows.filter(row=>row.page===page))for(const dup of row.duplicates||[])seen.set(dup.path,Math.max(seen.get(dup.path)||0,dup.urls));
  out.push(`**${page}** (${seen.size} file${seen.size===1?'':'s'})`,'');
  if(seen.size)for(const [path,urls] of [...seen].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])))out.push(`- ${path}: ${urls} URLs`);
  else out.push('- none');
  out.push('');
}

if(signedOut){
  out.push('## Signed out, for comparison (headless, own profile)','');
  out.push('| Page | Profile | Cache | Requests | KB | First paint | Usable |','|---|---|---|---|---|---|---|');
  for(const page of pages)for(const profile of profiles)for(const cache of ['cold','warm']){
    const row=find(signedOut,page,profile,cache);
    out.push(`| ${page} | ${profile} | ${cache} | ${num(row.requests)} | ${num(row.kb)} | ${ms(row.fcp)} | ${ms(row.usable)} |`);
  }
  out.push('');
}
console.log(out.join('\n'));
