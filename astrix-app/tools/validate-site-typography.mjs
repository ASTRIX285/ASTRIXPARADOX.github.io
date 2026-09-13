import assert from 'node:assert/strict';
import {existsSync,readdirSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const excludedTopLevel=new Set([
  '.git',
  '.sandbox-dist',
  'ASTRIX285.github.io',
  'forge-auth-worker',
  'node_modules',
]);
const files=[];

function collect(directory,relative=''){
  for(const entry of readdirSync(directory,{withFileTypes:true})){
    if(!relative&&excludedTopLevel.has(entry.name))continue;
    const childRelative=relative?`${relative}/${entry.name}`:entry.name;
    const childPath=`${directory}/${entry.name}`;
    if(entry.isDirectory())collect(childPath,childRelative);
    else if(entry.isFile()&&/\.(?:css|html)$/i.test(entry.name))files.push(childRelative);
  }
}

collect(root);

const htmlFiles=files.filter(path=>path.endsWith('.html')&&!/(?:^|\/)google[^/]*\.html$/i.test(path));
assert.ok(htmlFiles.length>0,'No served HTML pages found');

for(const path of htmlFiles){
  const source=readFileSync(`${root}${path}`,'utf8');
  assert.match(source,/https:\/\/use\.typekit\.net\/tnp6kbq\.css/,`${path} must load the Adobe Fonts web project`);
  assert.match(source,/\/css\/astrix-site-typography\.css/,`${path} must load the shared Forge typography layer`);
}

for(const path of files){
  const source=readFileSync(`${root}${path}`,'utf8');
  assert.doesNotMatch(source,/fonts\.(?:googleapis|gstatic)\.com/,`${path} still loads a legacy Google font service`);
  assert.doesNotMatch(source,/\b(?:Inter|Orbitron|Rajdhani)\b/,`${path} still references a legacy font family`);
}

const typographyPath=`${root}css/astrix-site-typography.css`;
assert.ok(existsSync(typographyPath),'Shared Forge typography stylesheet is missing');
const typography=readFileSync(typographyPath,'utf8');
for(const family of ['bahnschrift','bahnschrift-semicondensed','bahnschrift-condensed']){
  assert.ok(typography.includes(`"${family}"`),`Shared typography must define ${family}`);
}

console.log(`SITE_TYPOGRAPHY=PASS (${htmlFiles.length} pages)`);
