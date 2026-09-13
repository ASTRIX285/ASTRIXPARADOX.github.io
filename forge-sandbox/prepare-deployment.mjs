import {copyFileSync,lstatSync,mkdirSync,readdirSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=`${root}.sandbox-dist`;
const skippedTopLevel=new Set([
  '.git',
  '.github',
  '.sandbox-dist',
  'ASTRIX285.github.io',
  'forge-auth-worker',
  'forge-manifest-worker',
  'forge-sandbox',
]);
const streamedFiles=new Set([
  'astrix-app/data/armor-information.json',
]);
const assetFileLimit=25*1024*1024;
let fileCount=0;
let totalBytes=0;

function copyDirectory(source,target,relative=''){
  mkdirSync(target,{recursive:true});
  for(const entry of readdirSync(source,{withFileTypes:true})){
    const childRelative=relative?`${relative}/${entry.name}`:entry.name;
    if(!relative&&skippedTopLevel.has(entry.name))continue;
    if(streamedFiles.has(childRelative))continue;
    const childSource=`${source}/${entry.name}`;
    const childTarget=`${target}/${entry.name}`;
    if(entry.isDirectory()){
      copyDirectory(childSource,childTarget,childRelative);
      continue;
    }
    if(!entry.isFile()&&!entry.isSymbolicLink())continue;
    const size=lstatSync(childSource).size;
    if(size>assetFileLimit)throw new Error(`Cloudflare asset file limit exceeded: ${childRelative} (${size} bytes)`);
    copyFileSync(childSource,childTarget);
    fileCount+=1;
    totalBytes+=size;
  }
}

rmSync(output,{recursive:true,force:true});
copyDirectory(root,output);

console.log(`SANDBOX_DEPLOYMENT_READY=${fileCount} files ${totalBytes} bytes`);
