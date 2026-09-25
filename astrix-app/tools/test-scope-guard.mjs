import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {baselineAllows,branchName,exactPath,validateScope} from './validate-scope-guard.mjs';

const temp=mkdtempSync(join(tmpdir(),'paradox-scope-'));
const env={};
let checks=0;
function git(cwd,...args){return execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
function put(cwd,path,content='fixture\n'){mkdirSync(dirname(join(cwd,path)),{recursive:true});writeFileSync(join(cwd,path),content);}
function fixture(name='chore/task'){
  const cwd=mkdtempSync(join(temp,'repo-'));
  git(cwd,'init','-b','main');git(cwd,'config','user.name','Scope fixture');git(cwd,'config','user.email','scope@example.invalid');
  put(cwd,'index.html');put(cwd,'old.txt');
  put(cwd,'.scope/chore/other.txt','secret.txt\n');
  git(cwd,'add','.');git(cwd,'commit','-m','baseline');git(cwd,'update-ref','refs/remotes/origin/main','HEAD');
  git(cwd,'switch','-c',name);
  return cwd;
}
function scope(cwd,content='# No additions to baseline.\n',branch='chore/task'){put(cwd,`.scope/${branch}.txt`,content);}
function pass(cwd,environment=env){assert.doesNotThrow(()=>validateScope(cwd,environment));checks++;}
function fail(cwd,pattern,environment=env){assert.throws(()=>validateScope(cwd,environment),pattern);checks++;}

try {
  // Snapshot the entire inherited exact set and all five regexes, not just a
  // handful of examples. This migration must not widen or shrink the baseline.
  const source=readFileSync(fileURLToPath(new URL('./validate-scope-guard.mjs',import.meta.url)),'utf8');
  const baseline=source.match(/const allowed=new Set\(\[[\s\S]*?\n\]\);/)[0]+source.match(/const (?:cataloguePath|journeyIndexPath|phaseThree\w+Path)=.*;/g).join('\n');
  assert.equal(createHash('sha256').update(baseline).digest('hex'),'34e8b379e4aa2d40e81d36aa53b94bec1feae2ef5361d4ce2413c11f3f1fe782');checks++;
  // Existing exact and patterned baseline permissions remain available.
  for(const path of ['index.html','pages/clips.html','.github/workflows/update-clips.yml','forge-auth-worker/src/new.ts','astrix-app/data/weapon-catalogue/weapons-auto-rifles.json','astrix-app/data/journey-index/DestinyRecordDefinition-15.json'])assert.ok(baselineAllows(path),path);
  for(const path of ['secret.txt','index.html.bak','astrix-app/data/journey-index/DestinyRecordDefinition-16.json','astrix-app/data/weapon-catalogue/anything.json','.github/workflows/unapproved.yml','.scope/chore/other.txt'])assert.ok(!baselineAllows(path),path);
  checks+=12;
  for(const path of ['../escape','/absolute','a/../b','a/./b','a//b','a/','a\\b','a*','a?','a[0]','a{b,c}',' a','a ','a\tb','a\nb','C:/x','%2e%2e/x','.git/config','.GIT/config','.scope/chore/other.txt']){assert.throws(()=>exactPath(path));checks++;}
  assert.equal(exactPath('.gitattributes'),'.gitattributes');

  let cwd=fixture();pass(cwd); // Clean checkout needs no task file.
  put(cwd,'index.html','changed\n');fail(cwd,/ENOENT/);scope(cwd);pass(cwd);
  put(cwd,'feature.txt');scope(cwd,'feature.txt\r\n');pass(cwd); // CRLF accepted.
  git(cwd,'add','.');pass(cwd);git(cwd,'commit','-m','task');pass(cwd);
  put(cwd,'secret.txt');fail(cwd,/Scope violation/); // Other scope file is not loaded.
  rmSync(join(cwd,'secret.txt'));put(cwd,'feature.txt.bak');fail(cwd,/Scope violation/);
  git(cwd,'add','.');fail(cwd,/Scope violation/);git(cwd,'commit','-m','outside scope');fail(cwd,/Scope violation/);
  cwd=fixture();scope(cwd);put(cwd,'line\nbreak.txt');fail(cwd,/Scope violation/);
  cwd=fixture();scope(cwd);git(cwd,'update-ref','-d','refs/remotes/origin/main');fail(cwd,/origin\/main/);

  for(const contents of ['missing.txt\n','../escape\n','feature*\n','feature.txt\nfeature.txt\n',' feature.txt\n','.scope/chore/other.txt\n','directory\n']){
    cwd=fixture();put(cwd,'feature.txt');mkdirSync(join(cwd,'directory'));scope(cwd,contents);fail(cwd,/Missing scope entry|Scope |Duplicate|Not a regular/);
  }
  cwd=fixture();scope(cwd,Buffer.from([0xff]));fail(cwd,/UTF-8/);
  cwd=fixture();scope(cwd,'old.txt\n');rmSync(join(cwd,'old.txt'));pass(cwd); // Real deletions can be scoped.
  git(cwd,'add','.');git(cwd,'commit','-m','delete');pass(cwd);
  cwd=fixture();scope(cwd);git(cwd,'mv','old.txt','renamed.txt');fail(cwd,/renamed.txt/);
  scope(cwd,'old.txt\nrenamed.txt\n');pass(cwd); // Both rename endpoints checked.

  for(const stage of ['working','staged','committed','deleted']){
    cwd=fixture();scope(cwd);
    if(stage==='deleted')rmSync(join(cwd,'.scope/chore/other.txt'));
    else put(cwd,'.scope/chore/other.txt','index.html\n');
    if(stage==='staged'||stage==='committed')git(cwd,'add','.');
    if(stage==='committed')git(cwd,'commit','-m','cross-branch change');
    fail(cwd,/Another branch/);
  }
  cwd=fixture();scope(cwd);put(cwd,'.scope/chore/new.txt','index.html\n');fail(cwd,/Another branch/);
  cwd=fixture();scope(cwd);git(cwd,'mv','.scope/chore/other.txt','.scope/chore/renamed.txt');fail(cwd,/Another branch/);
  cwd=fixture();scope(cwd);git(cwd,'add','.');git(cwd,'commit','-m','scope');rmSync(join(cwd,'.scope/chore/task.txt'));fail(cwd,/ENOENT/);

  cwd=fixture();scope(cwd,'alias.txt\n');symlinkSync(join(cwd,'index.html'),join(cwd,'alias.txt'));fail(cwd,/Symlink/);
  cwd=fixture();scope(cwd,'linked/index.html\n');symlinkSync(cwd,join(cwd,'linked'));fail(cwd,/Symlink/);
  cwd=fixture();scope(cwd);rmSync(join(cwd,'.scope/chore/task.txt'));symlinkSync(join(cwd,'index.html'),join(cwd,'.scope/chore/task.txt'));fail(cwd,/Symlink/);
  cwd=fixture();rmSync(join(cwd,'.scope'),{recursive:true});symlinkSync(temp,join(cwd,'.scope'));fail(cwd,/Another branch|Symlink/);

  cwd=fixture('chore/nested/task');scope(cwd,'feature.txt\n','chore/nested/task');put(cwd,'feature.txt');pass(cwd);
  git(cwd,'add','.');git(cwd,'commit','-m','feature');git(cwd,'checkout','--detach');
  pass(cwd,{GITHUB_HEAD_REF:'chore/nested/task',GITHUB_REF:'refs/pull/123/merge'});
  pass(cwd,{GITHUB_REF:'refs/heads/chore/nested/task'});
  fail(cwd,/Cannot resolve branch/);
  fail(cwd,/Cannot resolve branch/,{GITHUB_REF:'refs/pull/123/merge'});
  for(const branch of ['../escape','chore/../escape','chore//task','/absolute','chore/*','chore/task.lock']){
    assert.throws(()=>branchName(cwd,{GITHUB_HEAD_REF:branch}));checks++;
  }
  const event=join(temp,'event.json');writeFileSync(event,JSON.stringify({pull_request:{head:{ref:'chore/nested/task'}}}));
  pass(cwd,{GITHUB_EVENT_PATH:event,GITHUB_EVENT_NAME:'pull_request'});
  writeFileSync(event,'{}');fail(cwd,/Missing pull request head ref/,{GITHUB_EVENT_PATH:event,GITHUB_EVENT_NAME:'pull_request'});
  fail(cwd,/Another branch/,{GITHUB_HEAD_REF:'chore/wrong'});
  // Simulated merge checkout, not merely a detached feature commit.
  git(cwd,'switch','main');put(cwd,'pages/clips.html');git(cwd,'add','.');git(cwd,'commit','-m','new main');
  git(cwd,'update-ref','refs/remotes/origin/main','HEAD');git(cwd,'merge','--no-ff','chore/nested/task','-m','PR merge fixture');git(cwd,'checkout','--detach');
  pass(cwd,{GITHUB_HEAD_REF:'chore/nested/task',GITHUB_REF:'refs/pull/123/merge'});
  git(cwd,'update-ref','refs/remotes/origin/main','HEAD');pass(cwd,{GITHUB_REF:'refs/heads/main'});

  // Exercise the actual command-line entry and exit codes in an isolated repo.
  cwd=fixture();scope(cwd,'astrix-app/tools/validate-scope-guard.mjs\n');
  put(cwd,'astrix-app/tools/validate-scope-guard.mjs',readFileSync(fileURLToPath(new URL('./validate-scope-guard.mjs',import.meta.url))));
  const cli=()=>spawnSync(process.execPath,['astrix-app/tools/validate-scope-guard.mjs'],{cwd,env:{PATH:process.env.PATH},encoding:'utf8'});
  let result=cli();assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/SCOPE_GUARD=PASS/);checks++;
  put(cwd,'outside.txt');result=cli();assert.equal(result.status,1);assert.match(result.stderr,/SCOPE_GUARD=FAIL/);checks++;
  console.log(`SCOPE_GUARD_TESTS=PASS checks=${checks}`);
} finally {rmSync(temp,{recursive:true,force:true});}
