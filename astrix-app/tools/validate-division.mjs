// Division WorkBench gate. See the Division gate in astrix-app/ARCHITECTURE-GATES.md.
//   node astrix-app/tools/validate-division.mjs          check the repo
//   node astrix-app/tools/validate-division.mjs <root>   check another repo root (used by the self-test)
import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import {basename, extname, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkRecords} from './validate-game-folders.mjs';

const SHARED_DIRS=new Set(['schema','engine','docs']);
const TITLE_DIRS=new Set(['data','assets']);
const CODE_EXT=new Set(['.mjs','.js','.cjs','.ts']);
const IGNORED=new Set(['README.md','.gitkeep']);

function walk(dir){
  if(!existsSync(dir))return [];
  const out=[];
  for(const name of readdirSync(dir).sort()){
    const path=join(dir,name);
    if(statSync(path).isDirectory())out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

function readJson(path,errors,rel){
  try {return JSON.parse(readFileSync(path,'utf8'));}
  catch(error){errors.push(`${rel}: invalid JSON (${error.message})`);return undefined;}
}

const filled=value=>typeof value==='string'&&value.trim()!=='';

// Division records use the shared contracts (platform/contracts/provenance.schema.json
// and pending.schema.json). Only official posts and in-game captures are accepted:
// client data tables would mean datamined values, which the Division gate forbids.
export const DIVISION_SOURCE_KINDS=Object.freeze(['official-post','in-game-capture']);

function checkCatalogue(file,rel,errors){
  const data=readJson(file,errors,rel);
  if(data===undefined)return;
  if(!Array.isArray(data)&&!Array.isArray(data?.records)&&!Array.isArray(data?.entries)){errors.push(`${rel}: catalogue must be an array or an object with a records or entries array`);return;}
  checkRecords(data,rel,errors,{kinds:DIVISION_SOURCE_KINDS});
}

// Every file in an assets folder must be listed in that folder's manifest.json,
// with useAllowed "yes" and approvedByMiguel true. A file matches the entry whose
// id equals its name without extension. A web-sized copy is named <id>.web.<ext>.
function checkAssets(dir,root,errors){
  const files=walk(dir).filter(file=>!IGNORED.has(basename(file))&&relative(dir,file)!=='manifest.json');
  const manifestPath=join(dir,'manifest.json');
  const manifestRel=relative(root,manifestPath).replaceAll('\\','/');
  let manifest=[];
  if(existsSync(manifestPath)){
    manifest=readJson(manifestPath,errors,manifestRel);
    if(manifest===undefined)return;
    if(!Array.isArray(manifest)){errors.push(`${manifestRel}: manifest must be a JSON array`);return;}
  }
  const byId=new Map(manifest.filter(entry=>filled(entry?.id)).map(entry=>[entry.id,entry]));
  for(const file of files){
    const rel=relative(root,file).replaceAll('\\','/');
    const stem=basename(file,extname(file)).replace(/\.web$/,'');
    const entry=byId.get(stem);
    if(!entry){errors.push(`${rel}: asset not listed in ${manifestRel}`);continue;}
    if(entry.useAllowed!=='yes')errors.push(`${rel}: manifest entry ${stem} has useAllowed ${JSON.stringify(entry.useAllowed)}, needs "yes"`);
    if(entry.approvedByMiguel!==true)errors.push(`${rel}: manifest entry ${stem} is not approved (approvedByMiguel must be true)`);
  }
}

// Engine and adapter code must not hold catalogue data or fork per title.
function checkCode(dir,root,errors,{engine}){
  for(const file of walk(dir)){
    const rel=relative(root,file).replaceAll('\\','/');
    if(IGNORED.has(basename(file)))continue;
    const ext=extname(file);
    if(ext==='.json'){errors.push(`${rel}: game data belongs in a title data folder, not in code`);continue;}
    if(!CODE_EXT.has(ext))continue;
    const text=readFileSync(file,'utf8');
    if(/["']?gameVersion["']?\s*:/.test(text))errors.push(`${rel}: hardcoded catalogue entry (gameVersion key in code); load it from the catalogue`);
    if(engine&&/games\/division\/td\d|\.\.\/td\d|['"]\.\/td\d/.test(text))errors.push(`${rel}: engine imports a title folder; engine code never forks per title`);
  }
}

export function validateDivision(root){
  const errors=[];
  const division=join(root,'astrix-app','games','division');
  if(existsSync(division)){
    for(const name of readdirSync(division).sort()){
      const path=join(division,name);
      if(!statSync(path).isDirectory()||SHARED_DIRS.has(name))continue;
      if(!/^td\d+$/.test(name)){errors.push(`astrix-app/games/division/${name}: unknown folder; use schema/, engine/, docs/ or a title folder like td2/`);continue;}
      for(const child of readdirSync(path).sort()){
        const childPath=join(path,child);
        const rel=`astrix-app/games/division/${name}/${child}`;
        if(statSync(childPath).isDirectory()&&!TITLE_DIRS.has(child))errors.push(`${rel}: title folders hold data/ and assets/ only; shared code goes in games/division/engine/`);
        else if(!statSync(childPath).isDirectory()&&CODE_EXT.has(extname(child)))errors.push(`${rel}: code in a title folder; shared code goes in games/division/engine/`);
      }
      for(const file of walk(join(path,'data'))){
        const rel=relative(root,file).replaceAll('\\','/');
        if(IGNORED.has(basename(file)))continue;
        if(extname(file)!=='.json'){errors.push(`${rel}: catalogue files must be JSON`);continue;}
        checkCatalogue(file,rel,errors);
      }
      checkAssets(join(path,'assets'),root,errors);
    }
    checkCode(join(division,'engine'),root,errors,{engine:true});
  }
  checkCode(join(root,'astrix-app','platform','adapters','division'),root,errors,{engine:false});
  return errors;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=process.argv[2]?resolve(process.argv[2]):fileURLToPath(new URL('../../',import.meta.url));
  const errors=validateDivision(root);
  if(errors.length){console.error(`DIVISION_GATE=FAIL ${errors.length} problem(s)\n${errors.map(error=>`  ${error}`).join('\n')}`);process.exitCode=1;}
  else console.log('DIVISION_GATE=PASS');
}
