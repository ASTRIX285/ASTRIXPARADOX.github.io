import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {lstatSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

export function scopePath(branch){
  assert.ok(typeof branch==='string' && branch.split('/').every(part=>/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(part) && !part.includes('..') && !part.endsWith('.') && !part.endsWith('.lock')), 'Missing or unsafe branch name');
  return `.scope/${branch}.txt`;
}

export function parseScope(text){
  const entries=new Set();
  for(const [index,line] of text.split(/\r?\n/).entries()){
    if(!line.trim() || line.startsWith('#'))continue;
    assert.ok(line===line.trim() && line.split('/').every(part=>/^[A-Za-z0-9_.-]+$/.test(part) && part!=='.' && part!=='..') && !line.startsWith('.scope/') && !line.startsWith('.git/'), `Invalid scope path on line ${index+1}: ${line}`);
    assert.ok(!entries.has(line), `Duplicate scope path: ${line}`);
    entries.add(line);
  }
  return entries;
}

export function loadBranchScope(root,env=process.env){
  const attached=execFileSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8'}).trim();
  // PR merge checkouts are detached; the PR head name identifies the allowlist.
  // Push/workflow checkouts may also be detached, with refs/heads/* metadata.
  const branch=env.GITHUB_HEAD_REF || attached || (env.GITHUB_REF_TYPE==='branch' ? env.GITHUB_REF_NAME : '');
  const path=scopePath(branch);
  if(branch==='main')return {branch,path:null,entries:new Set()};
  let current=root;
  for(const part of path.split('/')){
    current=join(current,part);
    const stat=lstatSync(current); // Missing scope is an error, never a fallback.
    assert.ok(!stat.isSymbolicLink(), `Scope path must not contain symlinks: ${path}`);
  }
  assert.ok(lstatSync(current).isFile(), `Scope must be a regular file: ${path}`);
  return {branch,path,entries:parseScope(readFileSync(current,'utf8'))};
}

export function scopeAllows(path,scope,baselineAllows){
  // Check this before baseline/branch entries so no allowlist can authorize a
  // different branch's policy. The current policy file authorizes itself only.
  if(path==='.scope' || path.startsWith('.scope/'))return path===scope.path;
  return baselineAllows(path) || scope.entries.has(path);
}
