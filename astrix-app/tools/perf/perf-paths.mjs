// Where performance tools may write. The signed-in browser profile (cookies) and any measurement
// output always live outside the repo; a path inside the repo stops the tool before anything is written.
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';

export const REPO_ROOT=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
export const DEFAULT_PROFILE_DIR='C:\\Users\\patch\\pwtools\\astrix-live-profile';
export const DEFAULT_OUT_DIR=join(tmpdir(),'astrix-perf');

export function outsideRepo(path,label){
  const absolute=resolve(path),inside=relative(REPO_ROOT,absolute);
  if(inside===''||(!inside.startsWith('..')&&!isAbsolute(inside))){
    console.error(`Refusing to use ${label} inside the repo (${absolute}). Use a folder outside ${REPO_ROOT}.`);
    process.exit(2);
  }
  return absolute;
}
