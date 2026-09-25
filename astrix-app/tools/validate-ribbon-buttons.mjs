import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const read=path=>readFileSync(join(root,path),'utf8');
const css=read('astrix-app/shared/astrix-destination-ribbon.css');
const layer=css.slice(css.indexOf('@layer astrix-ribbon-buttons'));
// Prompt 22 adds strict effective button rules without removing legacy geometry checks.
assert.ok(layer.startsWith('@layer astrix-ribbon-buttons'));
for(const declaration of ['gap:6px!important','background:var(--apx-colour-canvas)!important','border:1px solid var(--apx-colour-action)!important','border-radius:8px!important','color:var(--apx-colour-focus)!important','outline:2px solid var(--apx-colour-focus)!important','background:var(--apx-colour-action)!important','color:var(--apx-button-primary-text)!important','box-shadow:none!important'])assert.ok(layer.includes(declaration),declaration);
assert.doesNotMatch(layer,/#[\da-f]{3,8}\b|rgba?\(/i,'New colours use existing tokens');
function* files(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())yield*files(path);else if(path.endsWith('.html'))yield path;}}
let count=0;
for(const path of files(join(root,'astrix-app/pages'))){const html=readFileSync(path,'utf8');if(html.includes('astrix-destination-ribbon.css?')){count++;assert.match(html,/astrix-destination-ribbon\.css\?[^"\s]*buttons=20260925-22/,path);}}
assert.ok(count>=7);
const reports=read('astrix-app/pages/reports/reports.css');
assert.match(reports,/body\.apx-destination-page #reportsWorkspace,[\s\S]*?\.apx-bungie-attribution\s*\{\s*padding-inline:max\(24px,var\(--apx-page-gutter,24px\)\);/);
console.log(`RIBBON_BUTTONS_STATIC=PASS pages=${count}`);
