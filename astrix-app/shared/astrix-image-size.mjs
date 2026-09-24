// Application image sizing, deliberately independent of browser zoom and DPR.
export const IMAGE_SIZE_KEY='astrix:image-size:v1';
export function normaliseImageSize(value){
  if(value===null||value===undefined||String(value).trim()==='')return 100;
  const number=Number(value);
  return Number.isFinite(number)?Math.min(110,Math.max(75,Math.round(number/5)*5)):100;
}
export function installImageSizeControl(doc=document,view=window){
  if(doc.body.classList.contains('forge-loader-page')||doc.getElementById('apxImageSize'))return;
  const css=doc.createElement('link');
  css.rel='stylesheet';css.href=new URL('./astrix-image-size.css?v=20260924-1',import.meta.url).href;
  doc.head.append(css);
  const label=doc.createElement('label');
  label.className='apx-image-size-control';label.textContent='Image size ';
  const select=doc.createElement('select');
  select.id='apxImageSize';select.setAttribute('aria-label','Image size');
  for(let value=75;value<=110;value+=5){
    const option=doc.createElement('option');option.value=String(value);option.textContent=`${value}%`;
    select.append(option);
  }
  label.append(select);doc.body.append(label);
  const apply=value=>{
    const size=normaliseImageSize(value);
    select.value=String(size);
    doc.documentElement.dataset.apxImageSize=String(size);
    doc.documentElement.style.setProperty('--apx-image-scale',String(size/100));
    return size;
  };
  let saved=null;
  try{saved=view.localStorage.getItem(IMAGE_SIZE_KEY);}catch{}
  apply(saved);
  select.addEventListener('change',()=>{
    const size=apply(select.value);
    try{view.localStorage.setItem(IMAGE_SIZE_KEY,String(size));}catch{}
  });
  view.addEventListener('storage',event=>{
    if(event.key===IMAGE_SIZE_KEY||event.key===null)apply(event.newValue);
  });
}
