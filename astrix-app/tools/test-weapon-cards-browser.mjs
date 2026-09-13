import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {weapons,catalogueItem} from './test-weapon-catalogue.mjs';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH?pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href:'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url));
const output=process.env.WEAPON_QA_OUTPUT||'/tmp/paradox-weapon-card-qa';
await mkdir(output,{recursive:true});
const fixture=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/astrix-app/pages/guardian-workspace-v2/guardian-gear-layout.css"><link rel="stylesheet" href="/astrix-app/pages/guardian-workspace-v2/paradox-item-cards.css"><link rel="stylesheet" href="/astrix-app/shared/astrix-desktop-density.css"><style>*{box-sizing:border-box}body{margin:0;background:#08080c;color:white;font-family:Arial,sans-serif}</style>`;
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/weapon-qa.html'){res.setHeader('Content-Type','text/html');res.end(fixture);return;}
  const file=resolve(root,'.'+path);
  if(!file.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(403).end();return;}
  try{const data=await readFile(file);res.setHeader('Content-Type',({'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(data);}catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();await page.emulateMedia({reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/weapon-qa.html`);
  await page.evaluate(async()=>{window.cards=await import('/astrix-app/pages/guardian-workspace-v2/guardian-semantic-ui.mjs?v=20260905-weapon-audit-1');});
  const representative=new Map();
  for(const weapon of Object.values(weapons))if(!representative.has(weapon.weaponType)&&weapon.displayProperties?.name&&!weapon.redacted&&weapon.socketCatalogue.some(s=>s.section==='perks'))representative.set(weapon.weaponType,catalogueItem(weapon));
  const checks=[];
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:1000});
    for(const item of representative.values()){
      await page.evaluate(item=>window.cards.openWeaponDetail(item),item);
      const actual=await page.evaluate(()=>({perks:document.querySelectorAll('.weapon-perk-cell.is-selected').length,overflow:document.documentElement.scrollWidth>innerWidth,mods:[...document.querySelectorAll('.weapon-detail-tile--mod img')].map(img=>getComputedStyle(img).borderRadius)}));
      assert.equal(actual.perks,item.weaponSemantics.selectedPerks.length,`${item.weaponType}/${width} all selected perk sockets retained`);
      assert.equal(actual.overflow,false,`${item.weaponType}/${width} page overflow`);
      assert.ok(actual.mods.every(radius=>parseFloat(radius)<=4),`${item.weaponType}/${width} square mods`);
      checks.push({width,type:item.weaponType,perks:actual.perks});
    }
    await page.evaluate(item=>window.cards.openWeaponDetail(item),catalogueItem(weapons['3049715579']));
    assert.equal(await page.locator('.weapon-perk-cell.is-selected').count(),5,'Praxic Blade retains all five perk columns');
    await page.locator('.paradox-item-card--weapon').screenshot({path:`${output}/praxic-blade-${width}.png`,timeout:30000});
  }
  assert.deepEqual(errors,[]);
  await writeFile(`${output}/results.json`,JSON.stringify({status:'pass',checks,pageErrors:errors}));
  console.log(`WEAPON_CARD_BROWSER=PASS types=${representative.size} viewports=4 checks=${checks.length}`);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
