import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url));
const base='astrix-app/pages/guardian-workspace-v2/paradox-build-space/';
const baseline=process.env.BUILD_WEAPON_LAYOUT_BASELINE==='1';
const output=process.env.BUILD_WEAPON_LAYOUT_OUTPUT||'/tmp/build-weapon-card-layout';
await mkdir(output,{recursive:true});
const shell=(await readFile(resolve(root,base+'paradox-build-space.mjs'),'utf8')).match(/^function weaponCardShell\(index\).*$/m)[0];
// Actual Build Forge document and all its styles; account/bootstrap scripts are
// disabled. The shared production weapon renderer receives synthetic weapons.
const html=(await readFile(resolve(root,base+'index.html'),'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*rel="modulepreload"[^>]*>/gi,'');
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/'+base||path==='/'+base+'index.html'){res.setHeader('Content-Type','text/html');res.end(html);return;}
  const file=resolve(root,'.'+path);
  if(!file.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(403).end();return;}
  try{
    const data=baseline&&path==='/'+base+'paradox-build-space.css'?execFileSync('git',['show',`bf209215:${base}paradox-build-space.css`],{cwd:root}):await readFile(file);
    res.setHeader('Content-Type',({'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(data);
  }catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
let browser;
try{
  browser=await chromium.launch({headless:true,...(process.env.BUILD_WEAPON_BROWSER_PATH?{executablePath:process.env.BUILD_WEAPON_BROWSER_PATH}:{})});
  const page=await browser.newPage();
  const origin=`http://127.0.0.1:${server.address().port}`;
  await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  const results=[];
  for(const fixture of ['typical','stress'])for(const width of [2000,1363,2560,390]){
    await page.setViewportSize({width,height:1200});
    await page.goto(origin+'/'+base);
    await page.evaluate(async({shell,base,baseline,fixture})=>{
      const {renderWeapons}=await import('/astrix-app/pages/guardian-workspace-v2/guardian-semantic-ui.mjs');
      const makeShell=(0,eval)(`(${shell})`);
      const grid=document.getElementById('weaponGrid');grid.innerHTML=[0,1,2].map(makeShell).join('');
      const plug=(hash)=>({hash,name:`Synthetic perk ${hash}`,icon:location.origin+'/img/logo.png'});
      const weapons=(fixture==='typical'?[5,6,6]:[6,7,8]).map((columns,slot)=>({itemHash:990000+slot,itemInstanceId:`fixture-${slot}`,name:`Synthetic weapon ${slot}`,icon:location.origin+'/img/logo.png',power:550,weaponSemantics:{perkModel:{expectedRowCount:5,columns:Array.from({length:columns},(_,i)=>({socketIndex:i,options:Array.from({length:1+(i+slot)%5},(_,j)=>plug(1000+slot*100+i*10+j))}))},masterwork:slot>0?plug(9000+slot*10+1):null,modSockets:Array.from({length:slot+1},(_,i)=>({...plug(9000+slot*10+i),name:['Weapon mod','Masterwork','Ornament'][i]}))}}));
      renderWeapons(weapons);
      // Prompt 25: containment must work before the sizing helper runs.
      for(const card of grid.querySelectorAll('.weap')){
        const bounds=card.getBoundingClientRect(),art=card.querySelector('.art').getBoundingClientRect();
        if(art.left<bounds.left||art.right>bounds.right)throw new Error('Weapon art exceeds card before sizing');
      }
      if(!baseline){const {sizeBuildWeaponCards}=await import('/'+base+'build-weapon-card-layout.mjs');sizeBuildWeaponCards(grid);}
      await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
    },{shell,base,baseline,fixture});
    const measurement=await page.evaluate(()=>{
      const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
      const section=document.querySelector('.weapon-design-section');
      const probe=document.createElement('span');probe.style.cssText='display:block;width:var(--build-armour-mod);height:var(--build-armour-mod)';section.append(probe);const armourMod=probe.getBoundingClientRect().width;probe.remove();
      return {viewport:innerWidth,section:box(section),scrollWidth:section.scrollWidth,clientWidth:section.clientWidth,contentWidth:section.clientWidth-parseFloat(getComputedStyle(section).paddingLeft)-parseFloat(getComputedStyle(section).paddingRight),cards:[...section.querySelectorAll('.weap')].map(card=>({box:box(card),containment:getComputedStyle(card).containerType,art:box(card.querySelector('.art')),perks:box(card.querySelector('.weapon-perk-matrix')),strip:{scroll:card.querySelector('.weapon-perk-strip').scrollWidth,client:card.querySelector('.weapon-perk-strip').clientWidth},columns:[...card.querySelectorAll('.weapon-perk-row')].map(row=>[...row.querySelectorAll('.weapon-perk-cell')].map(box)),armourMod,modIcons:[...card.querySelectorAll('.weapon-support-icon')].map(box),mods:box(card.querySelector('.weapon-support-icons')),cells:[...card.querySelectorAll('.weapon-perk-cell')].map(box)}))};
    });
    measurement.fixture=fixture;results.push(measurement);
    await page.locator('.weapon-design-section').screenshot({path:`${output}/${baseline?'before':'after'}-${fixture}-${width}.png`});
    await writeFile(`${output}/${baseline?'before':'after'}.json`,JSON.stringify(results,null,2));
    assert.equal(measurement.cards.length,3,`${width}: all fixture cards rendered`);
    for(const card of measurement.cards){
      assert.ok(card.cells.length>=6,`${width}: fixture perk matrix populated`);
      assert.equal(card.containment,'inline-size',`${width}: containment retained`);
      for(const part of ['art','perks','mods']){
        assert.ok(card.box.width+1>=card[part].width,`${width}: card ${card.box.width}px must fit ${part} ${card[part].width}px`);
        assert.ok(card[part].x>=card.box.x-1&&card[part].right<=card.box.right+1,`${width}: ${part} stays inside card`);
      }
      // Prompt 23: strict real-shaped matrix, column and support-size checks.
      assert.ok(card.strip.scroll<=card.strip.client,`${width}: no perk strip scrollbar`);
      for(const row of card.columns)for(let i=0;i<row.length;i++)assert.ok(Math.abs(row[i].x-card.columns[0][i].x)<=.1,'Each socket stays in one vertical column');
      for(const icon of card.modIcons){assert.equal(icon.width,card.armourMod);assert.equal(icon.height,card.armourMod);assert.equal(icon.y,card.modIcons[0].y);}
      for(const cell of card.cells)assert.ok(cell.x>=card.box.x-1&&cell.right<=card.box.right+1,`${width}: every perk cell stays inside card`);
      assert.ok(card.mods.y>=card.perks.bottom,`${width}: mods must be below the full perk matrix`);
      for(const mod of card.modIcons)for(const cell of card.cells)assert.ok(mod.y>=cell.bottom,`${width}: zero mod/perk overlap`);
      assert.ok(card.box.bottom<=measurement.section.bottom+1,`${width}: card stays within section vertically`);
      assert.ok(card.box.x>=measurement.section.x-1&&card.box.right<=measurement.section.right+1,`${width}: card stays inside section`);
      assert.ok(Math.abs(card.box.width-measurement.cards[0].box.width)<1,`${width}: equal card widths`);
    }
    assert.ok(measurement.scrollWidth<=measurement.clientWidth+1,`${width}: no section overflow`);
    const rows=new Set(measurement.cards.map(c=>Math.round(c.box.y)));
    if(fixture==='typical'&&width===2000)assert.equal(rows.size,1,'2000px: real five/six-column weapons must remain three across');
    const required=3*measurement.cards[0].box.width+24;
    // Prompt 23 replaces the old immediate 3-to-1 fallback with strict 3/2/1 rows.
    const perRow=measurement.contentWidth>=required?3:measurement.contentWidth>=2*measurement.cards[0].box.width+12?2:1;
    assert.equal(rows.size,Math.ceil(3/perRow),`${width}: exact responsive row count`);
    if(perRow===3)assert.ok(measurement.cards[0].box.width<=(measurement.contentWidth-24)/3,'Card fits its third of the section');
  }
  console.log('BUILD_WEAPON_CARD_LAYOUT=PASS Chromium 2000,1363,390; '+JSON.stringify(results.map(r=>({viewport:r.viewport,section:r.section.width,cards:r.cards.map(c=>c.box.width)}))));
}catch(error){if(/Executable doesn't exist/.test(error.message))console.error('NOT RUN: Chromium missing');throw error;}finally{await browser?.close();await new Promise(done=>server.close(done));}
