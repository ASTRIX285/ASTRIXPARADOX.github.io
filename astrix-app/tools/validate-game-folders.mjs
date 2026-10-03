// One layout and data contract for every folder under astrix-app/games/.
//   node astrix-app/tools/validate-game-folders.mjs          check the repo
//   node astrix-app/tools/validate-game-folders.mjs <root>   check another repo root (used by the self-test)
//
// Every game folder has index.mjs (a module on platform/contracts/game-module.mjs),
// schema/, docs/SCOPE.md and README.md. Data lives in data/ (single-title game) or
// <title>/data/ (multi-title game). Every data record has a provenance block
// (platform/contracts/provenance.schema.json). Every pending field has a reason
// (platform/contracts/pending.schema.json).
import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import {basename, join, relative, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

// Exemptions are exact (game + check). An exemption that is no longer needed fails
// the run, so each one is removed as soon as the game meets the contract.
export const EXEMPTIONS=Object.freeze([
  {game:'destiny-2',check:'file:schema/',reason:'Destiny schemas live in astrix-app/core and astrix-app/data, outside the game folder.'},
  {game:'destiny-2',check:'file:docs/SCOPE.md',reason:'No Destiny scope doc in the game folder yet.'},
  {game:'destiny-2',check:'file:README.md',reason:'No Destiny README in the game folder yet.'},
  {game:'destiny-2',check:'module',reason:'index.mjs is a facade (DESTINY_GAME_MODULE metadata plus domain re-exports), not a contract implementation. Importing it would load Destiny domains.'},
  {game:'destiny-2',check:'data-location',reason:'Destiny data lives in astrix-app/data/ and the manifest workers, outside the game folder, so it has no record checks here.'},
  {game:'wow-forever',check:'file:schema/',reason:'WoW Forever schemas sit in data/schema/. Moves to schema/ on the WoW follow-up.'},
  {game:'wow-forever',check:'file:README.md',reason:'WoW Forever has data/README.md but no README.md at the game root yet.'},
  {game:'wow-forever',check:'schema-in-data',reason:'WoW Forever schemas sit in data/schema/. Moves to schema/ on the WoW follow-up.'},
  {game:'wow-forever',check:'record:data/stat-types.json',reason:'stat-types.json is an empty id map with source null, not a sourced record yet.'}
]);

const REQUIRED=['index.mjs','schema/','docs/SCOPE.md','README.md'];
const IGNORED=new Set(['README.md','.gitkeep']);
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const filled=value=>typeof value==='string'&&value.trim()!=='';
const isObject=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const posix=path=>path.replaceAll('\\','/');

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

function onlyKeys(source,allowed,label,errors){
  for(const key of Object.keys(source))if(!allowed.includes(key))errors.push(`${label}: unknown provenance field ${key}`);
}

// Mirrors platform/contracts/provenance.schema.json (kept dependency free so CI needs no install).
export function checkSource(source,label,errors,{kinds}={}){
  if(!isObject(source)){errors.push(`${label}: provenance must be an object`);return;}
  const kind=source.kind??(('table' in source||'sourceSha256' in source)?'client-data':undefined);
  if(kinds&&!kinds.includes(kind)){errors.push(`${label}: provenance kind ${JSON.stringify(kind??null)} not allowed here (allowed: ${kinds.join(', ')})`);return;}
  if(kind==='official-post'){
    onlyKeys(source,['kind','url','gameVersion','retrievedOn','quote'],label,errors);
    if(!filled(source.url)||!/^https?:\/\//.test(source.url))errors.push(`${label}: official-post needs an http(s) url`);
    if(!filled(source.gameVersion))errors.push(`${label}: official-post needs gameVersion`);
    if(!DATE.test(source.retrievedOn??''))errors.push(`${label}: official-post needs retrievedOn (YYYY-MM-DD)`);
    if('quote' in source&&!filled(source.quote))errors.push(`${label}: official-post quote is empty`);
  } else if(kind==='in-game-capture'){
    onlyKeys(source,['kind','capturedBy','capturedOn','gameVersion','where','note'],label,errors);
    if(!filled(source.capturedBy))errors.push(`${label}: in-game-capture needs capturedBy`);
    if(!DATE.test(source.capturedOn??''))errors.push(`${label}: in-game-capture needs capturedOn (YYYY-MM-DD)`);
    if(!filled(source.gameVersion))errors.push(`${label}: in-game-capture needs gameVersion`);
    if(!filled(source.where))errors.push(`${label}: in-game-capture needs where (the in-game screen)`);
    if(!filled(source.note))errors.push(`${label}: in-game-capture needs note`);
  } else if(kind==='client-data'){
    onlyKeys(source,['kind','product','build','table','rowId','sourceSha256'],label,errors);
    for(const key of ['product','build','table'])if(!filled(source[key]))errors.push(`${label}: client-data needs ${key}`);
    if(!Number.isInteger(source.rowId))errors.push(`${label}: client-data needs an integer rowId`);
    if(!/^[0-9a-f]{64}$/.test(source.sourceSha256??''))errors.push(`${label}: client-data needs a sha256 sourceSha256`);
  } else errors.push(`${label}: provenance kind must be official-post, in-game-capture or client-data`);
}

export function checkProvenance(provenance,label,errors,options){
  if(provenance===undefined||provenance===null){errors.push(`${label}: no provenance`);return;}
  if(Array.isArray(provenance)){
    if(!provenance.length)errors.push(`${label}: provenance list is empty`);
    provenance.forEach((source,index)=>checkSource(source,`${label} provenance[${index}]`,errors,options));
  } else checkSource(provenance,`${label} provenance`,errors,options);
}

// Any object with a pending key must be exactly {pending: true, reason: "..."}.
export function checkPending(value,label,errors,path=''){
  if(Array.isArray(value)){value.forEach((item,index)=>checkPending(item,label,errors,`${path}[${index}]`));return;}
  if(!isObject(value))return;
  if('pending' in value){
    const where=`${label}${path?` field ${path}`:''}`;
    if(value.pending!==true)errors.push(`${where}: pending must be true`);
    if(!filled(value.reason))errors.push(`${where}: pending field needs a reason`);
    for(const key of Object.keys(value))if(key!=='pending'&&key!=='reason')errors.push(`${where}: pending field holds a value (${key})`);
    return;
  }
  for(const [key,child] of Object.entries(value))if(key!=='provenance')checkPending(child,label,errors,path?`${path}.${key}`:key);
}

// A data file is an array of records, an object with a records or entries array, or one record.
export function dataRecords(data){
  if(Array.isArray(data))return data;
  if(isObject(data)&&Array.isArray(data.records))return data.records;
  if(isObject(data)&&Array.isArray(data.entries))return data.entries;
  return [data];
}

export function checkRecords(data,rel,errors,options){
  dataRecords(data).forEach((record,index)=>{
    const label=`${rel} record ${filled(record?.id)||Number.isInteger(record?.id)?record.id:`#${index}`}`;
    if(!isObject(record)){errors.push(`${label}: record must be an object`);return;}
    checkProvenance(record.provenance,label,errors,options);
    checkPending(record,label,errors);
  });
}

function dataDirs(gameDir){
  const dirs=[];
  if(existsSync(join(gameDir,'data')))dirs.push(join(gameDir,'data'));
  for(const name of readdirSync(gameDir).sort()){
    const path=join(gameDir,name,'data');
    if(name!=='data'&&statSync(join(gameDir,name)).isDirectory()&&existsSync(path)&&statSync(path).isDirectory())dirs.push(path);
  }
  return dirs;
}

export async function validateGameFolders(root,{exemptions=EXEMPTIONS}={}){
  const errors=[];
  const used=new Set();
  const gamesDir=join(root,'astrix-app','games');
  const exempt=(game,check)=>{
    const index=exemptions.findIndex(item=>item.game===game&&item.check===check);
    if(index<0)return false;
    used.add(index);
    return true;
  };
  const fail=(game,check,message)=>{if(!exempt(game,check))errors.push(message);};
  const games=existsSync(gamesDir)?readdirSync(gamesDir).filter(name=>statSync(join(gamesDir,name)).isDirectory()).sort():[];
  const {validateGameModule}=await import(pathToFileURL(join(root,'astrix-app','platform','contracts','game-module.mjs')).href).catch(()=>import('../platform/contracts/game-module.mjs'));

  for(const game of games){
    const dir=join(gamesDir,game);
    const rel=`astrix-app/games/${game}`;
    for(const file of REQUIRED){
      const path=join(dir,file);
      const ok=file.endsWith('/')?existsSync(path)&&statSync(path).isDirectory():existsSync(path)&&statSync(path).isFile();
      if(!ok)fail(game,`file:${file}`,`${rel}: missing ${file}`);
    }

    if(existsSync(join(dir,'index.mjs'))&&!exempt(game,'module')){
      try {
        const exported=await import(pathToFileURL(join(dir,'index.mjs')).href);
        const modules=Object.values(exported).filter(value=>{try {validateGameModule(value);return true;} catch {return false;}});
        if(!modules.length)errors.push(`${rel}/index.mjs: exports no module that passes validateGameModule`);
        else if(!modules.some(module=>module.getMetadata().id===game))errors.push(`${rel}/index.mjs: module id must be ${game}`);
      } catch(error){errors.push(`${rel}/index.mjs: failed to load (${error.message})`);}
    }

    const dirs=dataDirs(dir);
    if(!dirs.length)fail(game,'data-location',`${rel}: no data/ or <title>/data/ folder`);
    for(const dataDir of dirs){
      for(const file of walk(dataDir)){
        const fileRel=posix(relative(dir,file));
        const label=`${rel}/${fileRel}`;
        if(IGNORED.has(basename(file)))continue;
        if(file.endsWith('.schema.json')){fail(game,'schema-in-data',`${label}: schemas belong in schema/, not in a data folder`);continue;}
        if(!file.endsWith('.json')){errors.push(`${label}: data files must be JSON`);continue;}
        let data;
        try {data=JSON.parse(readFileSync(file,'utf8'));}
        catch(error){errors.push(`${label}: invalid JSON (${error.message})`);continue;}
        const fileErrors=[];
        checkRecords(data,label,fileErrors);
        if(fileErrors.length&&!exempt(game,`record:${fileRel}`))errors.push(...fileErrors);
      }
    }
  }

  exemptions.forEach((item,index)=>{
    if(!used.has(index))errors.push(`stale exemption: ${item.game} ${item.check} is no longer needed; remove it from EXEMPTIONS`);
  });
  return errors;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=process.argv[2]?resolve(process.argv[2]):fileURLToPath(new URL('../../',import.meta.url));
  const errors=await validateGameFolders(root);
  if(errors.length){console.error(`GAME_FOLDERS=FAIL ${errors.length} problem(s)\n${errors.map(error=>`  ${error}`).join('\n')}`);process.exitCode=1;}
  else console.log(`GAME_FOLDERS=PASS (${EXEMPTIONS.length} exemptions in use)`);
}
