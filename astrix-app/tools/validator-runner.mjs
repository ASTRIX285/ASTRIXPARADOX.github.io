// The PARADOX validator runner (18 Oct 2026). paradox-validator.mjs owns the suite list; this module runs it.
//   - A pool of child processes: CPU cores minus one at a time, at most 3 of them suites that start Chromium.
//     Suites marked serial run alone, one after another, once the pool has finished.
//   - Each suite's output is held until it ends and printed in one block, with its time and exit code.
//   - --changed (default on a branch, outside CI) runs the core set plus the areas the changed files touch,
//     from validator-areas.json. --all runs every suite. --serial runs the old way: one by one, stop at the first failure.
// Result lines are the ones the validator always printed: VALIDATOR_FAILED=<suite> exit=<n> signal=<s> and
// PARADOX_VALIDATOR=PASS, with the first failing suite's exit code.
import {spawn,execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {availableParallelism} from 'node:os';
import {fileURLToPath} from 'node:url';

export const TOOLS=fileURLToPath(new URL('./',import.meta.url));
export const ROOT=fileURLToPath(new URL('../../',import.meta.url));
export const BROWSER_LIMIT=3;

/** A suite entry from the list: a file name, or {name, browser, serial}. */
export function suiteSpec(entry){
  return typeof entry==='string'?{name:entry,browser:false,serial:false}:{browser:false,serial:false,...entry};
}

export function parseArgs(argv){
  const options={mode:null,serial:false,jobs:null};
  for(const arg of argv){
    if(arg==='--all')options.mode='all';
    else if(arg==='--changed')options.mode='changed';
    else if(arg==='--serial')options.serial=true;
    else if(/^--jobs=\d+$/.test(arg)){options.jobs=Number(arg.slice(7));if(options.jobs<1)throw new Error('--jobs must be 1 or more');}
    else throw new Error(`Unknown validator option: ${arg} (use --all, --changed, --serial, --jobs=N)`);
  }
  return options;
}

export function defaultJobs(){
  return Math.max(1,availableParallelism()-1);
}

// Area map patterns: "dir/" is everything under dir, "*" is any run of characters inside one path part,
// "**" is any run of characters across parts. Anything else is an exact path.
export function patternMatches(pattern,path){
  if(pattern.endsWith('/'))return path.startsWith(pattern);
  const source=pattern.split('**').map(part=>part.split('*').map(text=>text.replace(/[.+?^${}()|[\]\\]/g,'\\$&')).join('[^/]*')).join('.*');
  return new RegExp(`^${source}$`).test(path);
}

export function readAreas(file=`${TOOLS}validator-areas.json`){
  return JSON.parse(readFileSync(file,'utf8'));
}

/**
 * Which suites a list of changed files needs. Returns {all, suites:Set, reasons:[{area,label,files}]}.
 * A shared file, or a file no area claims, selects every suite. A changed suite file always runs itself.
 */
export function selectSuites(changed,names,areas){
  const known=new Set(names);
  const picked=new Set(areas.core);
  const reasons=new Map();
  const note=(area,label,file)=>{if(!reasons.has(area))reasons.set(area,{area,label,files:[]});reasons.get(area).files.push(file);};
  let all=false;
  for(const file of changed){
    if(areas.ignore.some(pattern=>patternMatches(pattern,file)))continue;
    if(areas.everything.some(pattern=>patternMatches(pattern,file))){all=true;note('everything','shared file: every suite',file);continue;}
    const base=file.startsWith('astrix-app/tools/')?file.slice('astrix-app/tools/'.length):null;
    let claimed=false;
    if(base&&known.has(base)){picked.add(base);note(`suite:${base}`,'changed suite runs itself',file);claimed=true;}
    // The most specific pattern wins: astrix-app/pages/aetherium/ claims its files from astrix-app/pages/.
    const matches=Object.entries(areas.areas).map(([key,area])=>[key,area,Math.max(-1,...area.paths.filter(pattern=>patternMatches(pattern,file)).map(pattern=>pattern.length))]).filter(row=>row[2]>=0);
    const best=Math.max(-1,...matches.map(row=>row[2]));
    for(const [key,area,length] of matches){
      if(length<best)continue;
      claimed=true;note(key,area.label,file);
      for(const suite of area.suites)picked.add(suite);
    }
    if(!claimed){all=true;note('unmapped','file no area claims: every suite',file);}
  }
  return {all,suites:all?new Set(names):picked,reasons:[...reasons.values()]};
}

function git(args,cwd=ROOT){
  return execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']});
}

/** Changed files against the scope base (origin/main, or a stacked PR's base): committed, staged, unstaged and untracked. */
export async function changedFiles(cwd=ROOT){
  const {branchName,scopeBaseName,scopeBaseRef}=await import('./validate-scope-guard.mjs');
  const branch=branchName(cwd);
  const {base}=scopeBaseName(cwd,branch);
  const ref=scopeBaseRef(cwd,base);
  const files=new Set([
    ...git(['diff','--no-renames','--name-only','-z',`${ref}...HEAD`],cwd).split('\0'),
    ...git(['diff','--no-renames','--name-only','-z'],cwd).split('\0'),
    ...git(['diff','--no-renames','--name-only','-z','--cached'],cwd).split('\0'),
    ...git(['ls-files','--others','--exclude-standard','-z'],cwd).split('\0'),
  ].filter(Boolean));
  return {branch,base:ref,files:[...files].sort()};
}

function currentBranch(cwd=ROOT){
  try {return git(['branch','--show-current'],cwd).trim();}catch {return '';}
}

/** One suite as a child process. Output is buffered and handed back when it ends. */
export function runSuite(spec,{tools=TOOLS,cwd=ROOT,env=process.env,inherit=false}={}){
  return new Promise(resolve=>{
    const started=Date.now();
    const executable=spec.name.endsWith('.py')?'python3':process.execPath;
    const chunks=[];
    let child;
    try {child=spawn(executable,[`${tools}${spec.name}`],{cwd,env,stdio:inherit?'inherit':['ignore','pipe','pipe']});}
    catch(error){resolve({...spec,status:null,signal:null,error,output:'',seconds:0});return;}
    child.stdout?.on('data',chunk=>chunks.push(chunk));
    child.stderr?.on('data',chunk=>chunks.push(chunk));
    let spawnError=null;
    child.on('error',error=>{spawnError=error;});
    child.on('close',(status,signal)=>resolve({...spec,status,signal,error:spawnError,output:Buffer.concat(chunks).toString('utf8'),seconds:(Date.now()-started)/1000}));
  });
}

/** Serial: one by one in list order, inherited output, stop at the first failure (the validator before 18 Oct 2026). */
async function runSerial(specs,options,log){
  const results=[];
  for(const spec of specs){
    const result=await options.run(spec,{...options,inherit:true});
    if(result.output)log(result.output.replace(/\n$/,''));
    log(`SUITE_TIME=${result.name} ${result.seconds.toFixed(1)}s exit=${result.status}`);
    results.push(result);
    if(result.error||result.status!==0)break;
  }
  return results;
}

/** Pool: up to `jobs` at once, at most `browserLimit` Chromium suites among them; then the serial suites alone. */
async function runPool(specs,options,log){
  const {jobs,browserLimit}=options;
  const queue=specs.filter(spec=>!spec.serial);
  const results=[];
  let running=0,browsers=0;
  await new Promise(done=>{
    const next=()=>{
      if(!queue.length&&!running){done();return;}
      while(running<jobs&&queue.length){
        // Prefer a Chromium suite while a browser slot is free: they are the long ones.
        let index=browsers<browserLimit?queue.findIndex(spec=>spec.browser):-1;
        if(index<0)index=queue.findIndex(spec=>!spec.browser);
        if(index<0)break;
        const [spec]=queue.splice(index,1);
        running++;if(spec.browser)browsers++;
        options.run(spec,options).then(result=>{
          running--;if(spec.browser)browsers--;
          log(`----- ${result.name} -----`);
          if(result.output)log(result.output.replace(/\n$/,''));
          log(`SUITE_TIME=${result.name} ${result.seconds.toFixed(1)}s exit=${result.status}`);
          results.push(result);
          next();
        });
      }
    };
    next();
  });
  for(const spec of specs.filter(spec=>spec.serial)){
    const result=await options.run(spec,options);
    log(`----- ${result.name} (serial) -----`);
    if(result.output)log(result.output.replace(/\n$/,''));
    log(`SUITE_TIME=${result.name} ${result.seconds.toFixed(1)}s exit=${result.status}`);
    results.push(result);
  }
  return results;
}

/**
 * Run the validator. `entries` is the suite list; returns the exit code. Options for tests: tools, cwd, env,
 * run (replaces runSuite), changed (replaces the git lookup), areas, log, isCI, branch.
 */
export async function main(argv,entries,overrides={}){
  const log=overrides.log||(line=>console.log(line));
  const fail=overrides.log||(line=>console.error(line));
  const specs=entries.map(suiteSpec);
  const names=specs.map(spec=>spec.name);
  const options=parseArgs(argv);
  const isCI=overrides.isCI??Boolean(process.env.CI);
  const branch=overrides.branch??currentBranch(overrides.cwd);
  let mode=options.mode||(isCI||!branch||branch==='main'?'all':'changed');
  let selected=specs;
  if(mode==='changed'){
    try {
      const changed=overrides.changed?await overrides.changed():await changedFiles(overrides.cwd);
      const areas=overrides.areas||readAreas();
      const pick=selectSuites(changed.files,names,areas);
      log(`VALIDATOR_MODE=changed against ${changed.base}: ${changed.files.length} changed file(s)`);
      for(const reason of pick.reasons){
        const shown=reason.files.slice(0,6).join(', ')+(reason.files.length>6?` and ${reason.files.length-6} more`:'');
        log(`VALIDATOR_AREA=${reason.area} (${reason.label}) because ${shown}`);
      }
      if(pick.all)mode='all';
      else selected=specs.filter(spec=>pick.suites.has(spec.name));
    }catch(error){
      log(`VALIDATOR_MODE=changed could not read the changed files (${error.message.split('\n')[0]}): running every suite`);
      mode='all';
    }
  }
  if(mode==='all'){log(`VALIDATOR_MODE=all`);selected=specs;}
  const jobs=options.serial?1:(options.jobs??overrides.jobs??defaultJobs());
  const browserLimit=Math.min(BROWSER_LIMIT,jobs);
  log(`VALIDATOR_SUITES=${selected.length} of ${specs.length} ${options.serial?'serial':`pool of ${jobs}, at most ${browserLimit} Chromium, ${selected.filter(spec=>spec.serial).length} serial after`}`);
  const runOptions={jobs,browserLimit,run:overrides.run||runSuite,tools:overrides.tools||TOOLS,cwd:overrides.cwd||ROOT,env:overrides.env||process.env};
  const started=Date.now();
  const results=options.serial?await runSerial(selected,runOptions,log):await runPool(selected,runOptions,log);
  const total=(Date.now()-started)/1000;
  log(`VALIDATOR_TIME=${results.length} suite(s) ran in ${total.toFixed(1)}s`);
  for(const result of [...results].sort((a,b)=>b.seconds-a.seconds).slice(0,10))log(`VALIDATOR_SLOWEST=${result.name} ${result.seconds.toFixed(1)}s`);
  // Failures in list order, so the exit code is the first failing suite's, as before.
  const order=new Map(names.map((name,index)=>[name,index]));
  const failed=results.filter(result=>result.error||result.status!==0).sort((a,b)=>order.get(a.name)-order.get(b.name));
  for(const result of failed){
    if(result.error)fail(`VALIDATOR_FAILED=${result.name} error=${result.error.message}`);
    else fail(`VALIDATOR_FAILED=${result.name} exit=${result.status} signal=${result.signal}`);
  }
  if(failed.length)return failed[0].status||1;
  log('PARADOX_VALIDATOR=PASS');
  return 0;
}
