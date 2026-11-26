#!/usr/bin/env node
// The Aetherium image weight (feature/aetherium-pwa, 26 Nov 2026).
//   node astrix-app/tools/build-aetherium-images.mjs           write any missing WebP copies
//   node astrix-app/tools/build-aetherium-images.mjs --force   write them all again
//   node astrix-app/tools/build-aetherium-images.mjs --check   exit 1 when a JPG or PNG has no WebP copy
//
// Every JPG and PNG under astrix-app/pages/aetherium/images gets a WebP copy beside it at the same size
// (name.webp). The originals stay: social cards and older code still point at them. Photos (photos,
// section-heroes, page-heroes, page-backgrounds) also get smaller copies for smaller screens
// (name-1600w.webp, name-800w.webp), only where the original is wider. Nothing is edited, cropped or
// tinted: each copy is the whole original, scaled to a width with its own proportions, and encoded.
// The encoder is Chromium's own WebP encoder (the canvas), so no extra tool is needed.
import {readdirSync,statSync,existsSync,writeFileSync,readFileSync} from 'node:fs';
import {join,relative,extname,basename,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const ROOT=resolve(fileURLToPath(new URL('../../',import.meta.url)));
export const IMAGE_DIR='astrix-app/pages/aetherium/images';
export const PHOTO_DIRS=Object.freeze(['photos','section-heroes','page-heroes','page-backgrounds']);
export const PHOTO_WIDTHS=Object.freeze([1600,800]);
// Full-size photos only reach wide screens, so they take a lighter setting than the smaller copies.
const QUALITY={photo:0.8,photoFull:0.7,art:0.9};

export function sources(){
  const out=[];
  (function walk(dir){
    for(const name of readdirSync(dir).sort()){
      const path=join(dir,name);
      if(statSync(path).isDirectory())walk(path);
      else if(/\.(jpe?g|png)$/i.test(name))out.push(relative(ROOT,path).replace(/\\/g,'/'));
    }
  })(join(ROOT,IMAGE_DIR));
  return out;
}
export const isPhoto=file=>PHOTO_DIRS.includes(file.split('/').at(-2));
export const webpOf=(file,width=null)=>file.replace(/\.(jpe?g|png)$/i,width?`-${width}w.webp`:'.webp');

async function main(){
  const args=new Set(process.argv.slice(2));
  const files=sources();
  if(args.has('--check')){
    const missing=files.filter(file=>!existsSync(join(ROOT,webpOf(file))));
    if(missing.length){console.error(`Missing WebP copies (run node ${IMAGE_DIR.replace('pages/aetherium/images','tools/build-aetherium-images.mjs')}):\n${missing.join('\n')}`);process.exit(1);}
    console.log(`AETHERIUM_IMAGES=ok ${files.length}`);return;
  }
  const require=createRequire(import.meta.url);
  const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
  const browser=await chromium.launch();
  const page=await browser.newPage();
  await page.setContent('<!doctype html><title>encode</title>');
  let written=0;
  for(const file of files){
    const photo=isPhoto(file);
    const mime=/\.png$/i.test(file)?'image/png':'image/jpeg';
    const data=`data:${mime};base64,${readFileSync(join(ROOT,file)).toString('base64')}`;
    const natural=await page.evaluate(async src=>{const img=new Image();img.src=src;await img.decode();return {w:img.naturalWidth,h:img.naturalHeight};},data);
    const targets=[[webpOf(file),natural.w]];
    if(photo)for(const width of PHOTO_WIDTHS)if(natural.w>width)targets.push([webpOf(file,width),width]);
    for(const [out,width] of targets){
      if(!args.has('--force')&&existsSync(join(ROOT,out)))continue;
      const encoded=await page.evaluate(async({src,width,quality})=>{
        const img=new Image();img.src=src;await img.decode();
        const height=Math.round(img.naturalHeight*width/img.naturalWidth);
        const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
        const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
        ctx.drawImage(img,0,0,width,height);
        const blob=await new Promise(done=>canvas.toBlob(done,'image/webp',quality));
        if(!blob||blob.type!=='image/webp')throw new Error('This Chromium cannot encode WebP');
        const bytes=new Uint8Array(await blob.arrayBuffer());let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
        return btoa(s);
      },{src:data,width,quality:photo?(width===natural.w?QUALITY.photoFull:QUALITY.photo):QUALITY.art});
      writeFileSync(join(ROOT,out),Buffer.from(encoded,'base64'));
      written++;
      console.log(`${out} ${width}w ${Math.round(Buffer.byteLength(encoded,'base64')/1024)} KB`);
    }
  }
  await browser.close();
  console.log(`AETHERIUM_IMAGES=written ${written}`);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
