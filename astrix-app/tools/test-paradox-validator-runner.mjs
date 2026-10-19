// The PARADOX validator runner (18 Oct 2026): the pool runs suites at once and fails when one fails, --serial runs the
// old way, --changed picks the right areas, and the result lines are the ones the validator always printed.
// 19 Oct 2026: the Chromium cap follows the core count, and a module-versions.json bump picks its module's area.
// Real child processes on small fixture suites in a temporary folder; nothing in the repo is run or written.
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {defaultBrowsers,main,moduleVersionChanges,parseArgs,patternMatches,readAreas,selectSuites,suiteSpec} from './validator-runner.mjs';
import {formatVersions} from './build-module-versions.mjs';
import {validators} from './paradox-validator.mjs';

const dir=mkdtempSync(join(tmpdir(),'paradox-runner-'));
const tools=dir+'/';
const fixture=(name,body)=>writeFileSync(join(dir,name),body);
// Each fixture suite notes when it starts and ends, so the test can see what overlapped.
const timed=(name,ms,exit=0)=>fixture(name,`import {appendFileSync} from 'node:fs';
const log=${JSON.stringify(join(dir,'events.log'))};
appendFileSync(log,'start ${name} '+Date.now()+'\\n');console.log('OUT ${name} one');
await new Promise(done=>setTimeout(done,${ms}));
console.log('OUT ${name} two');appendFileSync(log,'end ${name} '+Date.now()+'\\n');process.exit(${exit});`);
const events=()=>{try {return readFileSync(join(dir,'events.log'),'utf8').trim().split('\n').map(line=>{const [kind,name,at]=line.split(' ');return {kind,name,at:Number(at)};});}catch {return [];}};
const chromium=name=>/^b\d\.mjs$/.test(name);
const reset=()=>rmSync(join(dir,'events.log'),{force:true});
const peak=(filter=()=>true)=>{let now=0,max=0;for(const row of events().filter(row=>filter(row.name)).sort((a,b)=>a.at-b.at||(a.kind==='end'?-1:1))){now+=row.kind==='start'?1:-1;max=Math.max(max,now);}return max;};
async function run(argv,entries,extra={}){
  const lines=[];
  const code=await main(argv,entries,{tools,cwd:dir,isCI:false,branch:'perf/example',log:line=>lines.push(...String(line).split('\n')),...extra});
  return {code,lines};
}

try {
  // 1. Pool: suites overlap, at most 3 Chromium suites at once, a serial suite runs alone after the pool.
  for(const name of ['a.mjs','b.mjs','c.mjs','d.mjs'])timed(name,400);
  for(const name of ['b1.mjs','b2.mjs','b3.mjs','b4.mjs','b5.mjs'])timed(name,400);
  timed('alone.mjs',100);
  const entries=['a.mjs','b.mjs','c.mjs','d.mjs',...['b1.mjs','b2.mjs','b3.mjs','b4.mjs','b5.mjs'].map(name=>({name,browser:true})),{name:'alone.mjs',serial:true}];
  reset();
  let started=Date.now();
  let result=await run(['--all','--jobs=8','--browsers=3'],entries);
  const pooled=Date.now()-started;
  assert.equal(result.code,0);
  assert.equal(result.lines.at(-1),'PARADOX_VALIDATOR=PASS');
  assert.ok(peak()>=4,`suites ran at the same time (peak ${peak()})`);
  assert.equal(peak(chromium),3,`3 Chromium suites at once, never more (peak ${peak(chromium)})`);
  const alone=events().filter(row=>row.name==='alone.mjs');
  const others=events().filter(row=>row.name!=='alone.mjs');
  assert.ok(alone[0].at>=Math.max(...others.filter(row=>row.kind==='end').map(row=>row.at)),'the serial suite starts after the pool');
  assert.ok(pooled<9*400,`pool faster than one by one (${pooled} ms)`);
  // Output stays grouped: each suite's two lines sit together under its header.
  for(const name of ['a.mjs','b3.mjs']){
    const at=result.lines.indexOf(`----- ${name} -----`);
    assert.deepEqual(result.lines.slice(at+1,at+3),[`OUT ${name} one`,`OUT ${name} two`]);
    assert.match(result.lines[at+3],new RegExp(`^SUITE_TIME=${name.replace('.','\\.')} \\d+\\.\\ds exit=0$`));
  }
  assert.ok(result.lines.some(line=>/^VALIDATOR_TIME=10 suite\(s\) ran in \d+\.\ds$/.test(line)));
  assert.equal(result.lines.filter(line=>line.startsWith('VALIDATOR_SLOWEST=')).length,10);
  // --browsers=1: one Chromium suite at a time, plain suites still alongside.
  reset();
  result=await run(['--all','--jobs=8','--browsers=1'],entries);
  assert.equal(result.code,0);
  assert.equal(peak(chromium),1,`--browsers=1 runs one Chromium suite at a time (peak ${peak(chromium)})`);
  assert.ok(peak()>=2,'plain suites still run beside it');
  assert.ok(result.lines.includes('VALIDATOR_SUITES=10 of 10 pool of 8, at most 1 Chromium, 1 serial after'));
  // The default Chromium cap follows the logical core count: 1 on 8 or fewer, 2 above; --browsers=N still overrides.
  for(const [cores,cap] of [[1,1],[4,1],[8,1],[9,2],[16,2],[28,2]])assert.equal(defaultBrowsers(cores),cap,`${cores} cores: ${cap} Chromium at once`);
  for(const [cores,cap] of [[4,1],[16,2]]){
    reset();
    result=await run(['--all','--jobs=8'],entries,{cores});
    assert.equal(result.code,0);
    assert.equal(peak(chromium),cap,`${cores} cores: ${cap} Chromium suite(s) at once by default (peak ${peak(chromium)})`);
    assert.ok(result.lines.includes(`VALIDATOR_SUITES=10 of 10 pool of 8, at most ${cap} Chromium, 1 serial after`));
  }
  reset();
  result=await run(['--all','--jobs=8','--browsers=3'],entries,{cores:4});
  assert.equal(peak(chromium),3,'--browsers=3 overrides the 4-core default');
  console.log(`RUNNER_POOL=PASS peak ${peak()} at once, Chromium peak 3 with --browsers=3, default cap 1 on 8 cores or fewer and 2 above, serial after, ${pooled} ms`);

  // 2. A failing suite fails the run with its exit code and the old result line; the others still run.
  timed('fail.mjs',50,3);timed('fail-late.mjs',50,5);
  reset();
  result=await run(['--all','--jobs=4'],['a.mjs','fail.mjs','b.mjs','fail-late.mjs']);
  assert.equal(result.code,3,'the first failing suite in list order sets the exit code');
  assert.ok(result.lines.includes('VALIDATOR_FAILED=fail.mjs exit=3 signal=null'));
  assert.ok(result.lines.includes('VALIDATOR_FAILED=fail-late.mjs exit=5 signal=null'));
  assert.ok(!result.lines.includes('PARADOX_VALIDATOR=PASS'));
  assert.equal(events().filter(row=>row.kind==='end').length,4,'every suite ran to the end');
  console.log('RUNNER_FAILURE=PASS a failing suite fails the run, exit code and VALIDATOR_FAILED line unchanged');

  // 3. --serial: one at a time in list order, stops at the first failure, same lines.
  reset();
  result=await run(['--all','--serial'],['a.mjs','fail.mjs','b.mjs']);
  assert.equal(result.code,3);
  assert.equal(peak(),1,'one at a time');
  assert.deepEqual(events().filter(row=>row.kind==='start').map(row=>row.name),['a.mjs','fail.mjs'],'stops at the first failure');
  assert.ok(result.lines.includes('VALIDATOR_FAILED=fail.mjs exit=3 signal=null'));
  reset();
  result=await run(['--all','--serial'],['a.mjs','b.mjs']);
  assert.equal(result.code,0);assert.equal(result.lines.at(-1),'PARADOX_VALIDATOR=PASS');
  assert.deepEqual(events().filter(row=>row.kind==='start').map(row=>row.name),['a.mjs','b.mjs']);
  // Serial and pooled give the same verdict on the same list.
  reset();
  assert.equal((await run(['--all'],['a.mjs','fail.mjs','b.mjs'])).code,3);
  console.log('RUNNER_SERIAL=PASS one by one, list order, stops at the first failure, same verdict as the pool');

  // 4. Options.
  assert.deepEqual(parseArgs([]),{mode:null,serial:false,jobs:null,browsers:null});
  assert.deepEqual(parseArgs(['--changed','--jobs=2','--browsers=1']),{mode:'changed',serial:false,jobs:2,browsers:1});
  assert.throws(()=>parseArgs(['--browsers=0']),/--browsers/);
  assert.throws(()=>parseArgs(['--fast']),/Unknown validator option/);
  assert.throws(()=>parseArgs(['--jobs=0']),/--jobs/);
  assert.ok(patternMatches('astrix-app/pages/','astrix-app/pages/journey/index.html'));
  assert.ok(patternMatches('astrix-app/tools/test-aion2-*','astrix-app/tools/test-aion2-adapter.mjs'));
  assert.ok(!patternMatches('astrix-app/tools/*.py','astrix-app/tools/sub/x.py'));
  assert.ok(patternMatches('a/**/z.mjs','a/b/c/z.mjs'));
  assert.ok(!patternMatches('CLAUDE.md','x/CLAUDE.md'));

  // 5. The real list and the real area map: every suite placed, every Chromium suite marked, nothing unknown.
  const areas=readAreas();
  const specs=validators.map(suiteSpec),names=specs.map(spec=>spec.name);
  assert.equal(new Set(names).size,names.length,'no suite listed twice');
  const placed=new Set([...areas.core,...Object.values(areas.areas).flatMap(area=>area.suites)]);
  assert.deepEqual(names.filter(name=>!placed.has(name)),[],'every suite sits in core or an area');
  assert.deepEqual([...placed].filter(name=>!names.includes(name)),[],'the area map names only listed suites');
  for(const core of ['validate-scope-guard.mjs','validate-journey-visual-pass.mjs','validate-no-dashes.mjs','test-game-folders.mjs','validate-game-folders.mjs','test-game-footers.mjs','validate-local-preview.mjs'])assert.ok(areas.core.includes(core),`core runs ${core}`);
  const here=new URL('./',import.meta.url);
  for(const spec of specs){
    const source=readFileSync(new URL(spec.name,here),'utf8');
    if(/\bchromium\s*\.\s*launch|\{\s*chromium\s*[,}]/.test(source))assert.ok(spec.browser,`${spec.name} starts Chromium: mark it browser(...)`);
  }
  console.log(`RUNNER_LIST=PASS ${names.length} suites, ${specs.filter(spec=>spec.browser).length} Chromium, ${specs.filter(spec=>spec.serial).length} serial, all placed in the area map`);

  // 6. --changed picks areas by the changed files.
  const pick=files=>selectSuites(files,names,areas);
  const coreOnly=new Set(areas.core);
  const aetherium=pick(['astrix-app/pages/aetherium/guide.css','hub/aetherium/index.html']);
  assert.equal(aetherium.all,false);
  assert.deepEqual(aetherium.reasons.map(row=>row.area),['aion2']);
  for(const name of ['test-aetherium-guide.mjs','test-aetherium-pages.mjs','test-aion2-advisor.mjs',...coreOnly])assert.ok(aetherium.suites.has(name),`Aetherium change runs ${name}`);
  for(const name of ['test-engine-budget.mjs','test-reports-data.mjs','test-division-validator.mjs'])assert.ok(!aetherium.suites.has(name),`Aetherium change skips ${name}`);
  const destiny=pick(['astrix-app/pages/journey/journey-map-explorer.mjs']);
  assert.deepEqual(destiny.reasons.map(row=>row.area),['destiny']);
  for(const name of ['test-journey-maps.mjs','test-engine-budget.mjs','test-background-prebuild.mjs'])assert.ok(destiny.suites.has(name));
  for(const name of ['test-aetherium-guide.mjs','test-division-validator.mjs'])assert.ok(!destiny.suites.has(name),`Destiny change skips ${name}`);
  const division=pick(['astrix-app/games/division/catalogue/gear.json']);
  assert.deepEqual(division.reasons.map(row=>row.area),['division']);
  assert.ok(division.suites.has('validate-division.mjs')&&!division.suites.has('test-aetherium-guide.mjs'));
  const hub=pick(['hub/index.html']);
  assert.deepEqual(hub.reasons.map(row=>row.area),['hub']);
  assert.ok(hub.suites.has('validate-tools-hub.mjs')&&hub.suites.has('validate-sitemap.mjs'));
  const data=pick(['astrix-app/data/weapon-catalogue/index.json']);
  assert.deepEqual(data.reasons.map(row=>row.area).sort(),['data','destiny'],'data files run the data checks and the Destiny suites that read them');
  const script=pick(['astrix-app/tools/import-weapon-information.py']);
  assert.deepEqual(script.reasons.map(row=>row.area),['data']);
  // A changed suite runs itself, and its own area.
  const ownSuite=pick(['astrix-app/tools/test-aion2-adapter.mjs']);
  assert.ok(ownSuite.suites.has('test-aion2-adapter.mjs'));
  assert.ok(ownSuite.reasons.some(row=>row.area==='suite:test-aion2-adapter.mjs'));
  // Shared files and files no area claims select every suite.
  for(const files of [['astrix-app/shared/astrix-tokens.css'],['CLAUDE.md'],['DESIGN.md'],['astrix-app/core/page-ready-contract.mjs'],['astrix-app/tools/paradox-validator.mjs'],['astrix-app/tools/validator-areas.json'],['css/site.css'],['astrix-app/pages/aetherium/guide.css','js/site.js'],['some-new-folder/file.txt']]){
    const all=pick(files);
    assert.equal(all.all,true,`${files.join(', ')} selects every suite`);
    assert.equal(all.suites.size,names.length);
  }
  assert.deepEqual(pick(['.scope/perf/validator-speed.txt']).suites,coreOnly,'a scope file alone runs the core set');
  // module-versions.json: the modules it bumps pick their own areas; only a format change runs everything.
  const NOTE='Generated by astrix-app/tools/build-module-versions.mjs. Do not edit by hand.';
  const versions=(modules,workerStamped=['/astrix-app/core/engine-profile-worker.mjs'])=>formatVersions({note:NOTE,modules,workerStamped});
  const baseModules={'/astrix-app/games/aion2/engine/ascent-advisor.mjs':'aaaaaaaaaa','/astrix-app/pages/journey/journey.mjs':'bbbbbbbbbb','/astrix-app/shared/astrix-hero-cards.mjs':'cccccccccc'};
  const before=versions(baseModules);
  const aionBump=moduleVersionChanges(before,versions({...baseModules,'/astrix-app/games/aion2/engine/ascent-advisor.mjs':'dddddddddd'}));
  assert.deepEqual(aionBump,{format:false,paths:['astrix-app/games/aion2/engine/ascent-advisor.mjs']});
  assert.deepEqual(moduleVersionChanges(before,before.replace(/\n/g,'\r\n')),{format:false,paths:[]},'CRLF copies read the same');
  const added=moduleVersionChanges(before,versions({...baseModules,'/astrix-app/games/aion2/engine/new.mjs':'eeeeeeeeee'}));
  assert.deepEqual(added.paths,['astrix-app/games/aion2/engine/new.mjs'],'a new module counts as bumped');
  const stamped=moduleVersionChanges(before,versions(baseModules,['/astrix-app/core/engine-profile-worker.mjs','/astrix-app/pages/journey/journey.mjs']));
  assert.deepEqual(stamped.paths,['astrix-app/pages/journey/journey.mjs'],'a worker-stamped change counts as bumped');
  for(const after of [before.replace('"schemaVersion": 1','"schemaVersion": 2'),before.replace(NOTE,'Hand edited.'),before.replace(/\n\n/g,'\n'),JSON.stringify(JSON.parse(before)),'{ not json'])
    assert.equal(moduleVersionChanges(before,after).format,true,'a format, schema or note change is a format change');
  const engineFile='astrix-app/games/aion2/engine/ascent-advisor.mjs';
  const aionVersions=selectSuites([engineFile,'astrix-app/module-versions.json','hub/aetherium/index.html'],names,areas,{moduleVersions:aionBump});
  assert.equal(aionVersions.all,false,'an Aetherium module bump does not run everything');
  assert.deepEqual(aionVersions.reasons.map(row=>row.area),['aion2']);
  assert.deepEqual(aionVersions.suites,new Set([...coreOnly,...areas.areas.aion2.suites]),'Aetherium area and core, nothing else');
  assert.ok(aionVersions.reasons[0].files.includes('astrix-app/module-versions.json (bumps astrix-app/games/aion2/engine/ascent-advisor.mjs)'));
  const destinyBump=moduleVersionChanges(before,versions({...baseModules,'/astrix-app/pages/journey/journey.mjs':'ffffffffff'}));
  const destinyVersions=selectSuites(['astrix-app/module-versions.json'],names,areas,{moduleVersions:destinyBump});
  assert.equal(destinyVersions.all,false);assert.deepEqual(destinyVersions.reasons.map(row=>row.area),['destiny']);
  const sharedBump=moduleVersionChanges(before,versions({...baseModules,'/astrix-app/shared/astrix-hero-cards.mjs':'0000000000'}));
  assert.equal(selectSuites(['astrix-app/module-versions.json'],names,areas,{moduleVersions:sharedBump}).all,true,'a shared module bump still runs everything');
  assert.equal(selectSuites(['astrix-app/module-versions.json'],names,areas,{moduleVersions:{format:true,paths:[]}}).all,true,'a format change runs everything');
  assert.equal(selectSuites(['astrix-app/module-versions.json'],names,areas).all,true,'no diff read: every suite');
  assert.equal(pick(['astrix-app/tools/build-module-versions.mjs']).all,true,'the versions tool runs everything');
  console.log('RUNNER_MODULE_VERSIONS=PASS an Aetherium bump picks aion2 and core, a Destiny bump picks destiny, shared bumps and format changes run everything');
  console.log('RUNNER_CHANGED=PASS Aetherium, Destiny, Division, Hub and data changes pick their areas; shared and unmapped files pick every suite');

  // 7. --changed through main: prints the areas and why, runs only what it picked, same result line.
  for(const name of ['core.mjs','aion.mjs','destiny.mjs'])timed(name,20);
  const sample={core:['core.mjs'],ignore:['.scope/'],everything:['CLAUDE.md'],areas:{
    aion2:{label:'aion2 and Aetherium',paths:['astrix-app/pages/aetherium/'],suites:['aion.mjs']},
    destiny:{label:'Destiny and The Forge',paths:['astrix-app/pages/'],suites:['destiny.mjs']}}};
  const changed=files=>async()=>({base:'origin/main',files});
  reset();
  result=await run([],['core.mjs','aion.mjs','destiny.mjs'],{areas:sample,changed:changed(['astrix-app/pages/aetherium/a.css'])});
  assert.equal(result.code,0);assert.equal(result.lines.at(-1),'PARADOX_VALIDATOR=PASS');
  assert.ok(result.lines.includes('VALIDATOR_MODE=changed against origin/main: 1 changed file(s)'));
  assert.ok(result.lines.includes('VALIDATOR_AREA=aion2 (aion2 and Aetherium) because astrix-app/pages/aetherium/a.css'));
  assert.deepEqual(events().filter(row=>row.kind==='start').map(row=>row.name).sort(),['aion.mjs','core.mjs']);
  reset();
  result=await run([],['core.mjs','aion.mjs','destiny.mjs'],{areas:sample,changed:changed(['CLAUDE.md'])});
  assert.ok(result.lines.includes('VALIDATOR_MODE=all'));
  assert.equal(events().filter(row=>row.kind==='start').length,3);
  // --all, main and CI run everything without asking git.
  for(const extra of [{},{branch:'main'},{isCI:true}]){
    reset();
    const argv=Object.keys(extra).length?[]:['--all'];
    result=await run(argv,['core.mjs','aion.mjs','destiny.mjs'],{areas:sample,changed:()=>{throw new Error('git must not be asked');},...extra});
    assert.ok(result.lines.includes('VALIDATOR_MODE=all'));assert.equal(events().filter(row=>row.kind==='start').length,3);
  }
  // A module-versions.json bump through main: the area of the bumped module, not every suite.
  reset();
  result=await run([],['core.mjs','aion.mjs','destiny.mjs'],{areas:sample,changed:async()=>({base:'origin/main',files:['astrix-app/module-versions.json'],moduleVersions:{format:false,paths:['astrix-app/pages/aetherium/a.mjs']}})});
  assert.ok(result.lines.includes('VALIDATOR_AREA=aion2 (aion2 and Aetherium) because astrix-app/module-versions.json (bumps astrix-app/pages/aetherium/a.mjs)'));
  assert.deepEqual(events().filter(row=>row.kind==='start').map(row=>row.name).sort(),['aion.mjs','core.mjs']);
  // --all on the real list still runs every suite.
  const ran=[];
  const allCode=await main(['--all','--jobs=4'],validators,{tools,cwd:dir,isCI:false,branch:'perf/example',log:()=>{},run:async spec=>{ran.push(spec.name);return {...spec,status:0,signal:null,error:null,output:'',seconds:0};}});
  assert.equal(allCode,0);
  assert.deepEqual(ran.sort(),[...names].sort(),`--all runs all ${names.length} suites`);
  // No changed-file list (no origin/main): run every suite, never fewer.
  reset();
  result=await run(['--changed'],['core.mjs','aion.mjs','destiny.mjs'],{areas:sample,changed:async()=>{throw new Error('no origin/main');}});
  assert.ok(result.lines.some(line=>/^VALIDATOR_MODE=changed could not read the changed files \(no origin\/main\): running every suite$/.test(line)));
  assert.equal(events().filter(row=>row.kind==='start').length,3);
  console.log(`RUNNER_CHANGED_RUN=PASS areas printed with their files, only picked suites run; a module bump picks its area; --all runs all ${names.length}; main, CI and a missing base run everything`);
} finally {
  rmSync(dir,{recursive:true,force:true});
}
console.log('PARADOX_VALIDATOR_RUNNER=PASS');
