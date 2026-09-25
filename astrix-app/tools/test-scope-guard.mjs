import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,copyFileSync,rmSync,symlinkSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseScope,scopePath,loadBranchScope,scopeAllows} from './scope-guard-policy.mjs';

assert.deepEqual([...parseScope('# note\r\nnew/file.mjs\r\n')],['new/file.mjs']);
for(const invalid of ['/etc/passwd','../secret','x/../y','./x','a//b','C:/file','a\\b','a/*','a/?','a/[x]',' x','x ','x\nx','.scope/other.txt','.git/config'])assert.throws(()=>parseScope(invalid),invalid);
for(const invalid of ['', '../x','a/../b','/x','a//b','a.lock','a..b'])assert.throws(()=>scopePath(invalid),invalid);
assert.notEqual(scopePath('a/b'),scopePath('a-b'));
const scope={path:'.scope/a/b.txt',entries:new Set(['new/file'])};
assert.equal(scopeAllows('new/file',scope,()=>false),true);
assert.equal(scopeAllows('new/file/child',scope,()=>false),false);
assert.equal(scopeAllows('.scope/other.txt',scope,()=>true),false);
assert.equal(scopeAllows(scope.path,scope,()=>false),true);

const root=mkdtempSync(join(tmpdir(),'paradox-scope-'));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const write=(path,text='fixture\n')=>{mkdirSync(join(root,path,'..'),{recursive:true});writeFileSync(join(root,path),text);};
const env={...process.env};
for(const key of Object.keys(env))if(key.startsWith('GITHUB_')||key.startsWith('GIT_'))delete env[key];
const run=(expected,extra={})=>{
  const result=spawnSync(process.execPath,['astrix-app/tools/validate-scope-guard.mjs'],{cwd:root,env:{...env,...extra},encoding:'utf8'});
  assert.equal(result.status,expected,result.stdout+result.stderr);
};
try{
  git('init','-b','main');git('config','user.name','Scope fixture');git('config','user.email','scope@example.invalid');
  for(const name of ['validate-scope-guard.mjs','scope-guard-policy.mjs']){
    const target=`astrix-app/tools/${name}`;write(target);
    copyFileSync(fileURLToPath(new URL(name,import.meta.url)),join(root,target));
  }
  write('index.html');write('outside/deleted.txt');
  git('add','.');git('commit','-m','base');git('update-ref','refs/remotes/origin/main','HEAD');
  run(0); // Main retains baseline-only operation.
  git('switch','-c','chore/example');run(1); // Missing policy fails even for a clean branch.
  write('.scope/chore/example.txt','# no new paths\n');run(0);
  write('index.html','baseline edit\n');run(0); // Baseline preserved.
  write('new/file.mjs');run(1); // Untracked out-of-scope.
  write('.scope/chore/example.txt','new/file.mjs\n');run(0);
  git('add','.');run(0);git('commit','-m','allowed');run(0); // Staged and committed.
  write('new/file.mjs','allowed working edit\n');run(0);
  write('.scope/other.txt','new/file.mjs\n');run(1);rmSync(join(root,'.scope/other.txt'));
  write('outside/unstaged.txt');git('add','outside/unstaged.txt');run(1);git('reset','--','outside/unstaged.txt');rmSync(join(root,'outside/unstaged.txt'));
  rmSync(join(root,'outside/deleted.txt'));run(1);git('restore','outside/deleted.txt');
  git('mv','index.html','outside/renamed.html');run(1);git('reset','--hard','HEAD');
  write('outside/committed.txt');git('add','.');git('commit','-m','outside');run(1);git('reset','--hard','HEAD~1');
  write('outside/odd\nname.txt');run(1);rmSync(join(root,'outside/odd\nname.txt'));
  write('.scope/chore/example.txt','new/*\n');run(1);git('restore','.scope/chore/example.txt');
  rmSync(join(root,'.scope/chore/example.txt'));symlinkSync('../../index.html',join(root,'.scope/chore/example.txt'));run(1);git('restore','.scope/chore/example.txt');
  git('switch','--detach');run(1);
  run(0,{GITHUB_HEAD_REF:'chore/example',GITHUB_REF_NAME:'1/merge',GITHUB_REF_TYPE:'branch'});
  run(0,{GITHUB_REF_NAME:'chore/example',GITHUB_REF_TYPE:'branch'});
  run(1,{GITHUB_REF_NAME:'chore/example',GITHUB_REF_TYPE:'tag'});
  run(1,{GITHUB_HEAD_REF:'chore/missing'});
  assert.equal(loadBranchScope(root,{GITHUB_HEAD_REF:'chore/example'}).branch,'chore/example');
  // An otherwise valid file cannot be borrowed via a symlinked parent directory.
  git('switch','chore/example');git('mv','.scope/chore','.scope/real');symlinkSync('real',join(root,'.scope/chore'));run(1);
}finally{rmSync(root,{recursive:true,force:true});}
console.log('SCOPE_GUARD_TESTS=PASS exact paths, baseline, isolation, all Git states, renames, detached CI, malformed/missing policies and symlinks');
