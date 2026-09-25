import {armShootingRangeCapture,collectShootingRangeResults,readCapture,clearCapture} from './guardian-shooting-range-capture.mjs?plain=20260925-1';

if(new URLSearchParams(location.search).has('rangeTest')){
  const host=document.createElement('aside');
  host.id='astrixRangeCapture';
  host.innerHTML=`<style>
  #astrixRangeCapture{position:fixed;right:18px;bottom:18px;z-index:9999;width:min(560px,calc(100vw - 36px));background:#0b0810;border:1px solid #6f3aa0;border-radius:14px;box-shadow:0 20px 60px #000;padding:14px;color:#fff;font:13px Inter,system-ui,sans-serif}
  #astrixRangeCapture h3{margin:0 0 8px;font-size:15px}#astrixRangeCapture p{margin:0 0 10px;color:#b9b1c2;line-height:1.4}
  #astrixRangeCapture .rr{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}#astrixRangeCapture button{border:1px solid #8e58c6;background:#24122f;color:#fff;border-radius:8px;padding:9px 12px;font-weight:800;cursor:pointer}#astrixRangeCapture button.primary{background:#a6111c;border-color:#cf3340}#astrixRangeCapture pre{margin:0;max-height:250px;overflow:auto;background:#050507;border:1px solid #2d2632;border-radius:8px;padding:10px;white-space:pre-wrap;color:#ddd}
  </style><h3>PARADOX SHOOTING RANGE CAPTURE</h3><p>This runs inside the live Guardian Build Forge. Select the Guardian here first, then arm the test.</p><div class="rr"><button class="primary" data-act="arm">ARM TEST</button><button data-act="pull">PULL RESULTS</button><button data-act="clear">CLEAR</button><button data-act="close">CLOSE</button></div><pre>Ready. Select the Guardian in the cards above, then press ARM TEST.</pre>`;
  document.body.appendChild(host);
  const out=host.querySelector('pre');
  const show=value=>{out.textContent=typeof value==='string'?value:JSON.stringify(value,null,2)};
  host.addEventListener('click',async event=>{
    const button=event.target.closest('button[data-act]');if(!button)return;
    const act=button.dataset.act;
    if(act==='close'){host.remove();return;}
    if(act==='clear'){clearCapture();show('Capture cleared.');return;}
    try{
      button.disabled=true;
      if(act==='arm'){
        show('Arming against the Guardian currently selected in this workspace...');
        const selected=String(sessionStorage.getItem('astrix:selected-character-id')||'');
        if(!selected)throw new Error('Select Hunter, Warlock or Titan in the character cards before arming.');
        show(await armShootingRangeCapture({characterId:selected}));
      }
      if(act==='pull'){
        show('Pulling Activity History and PGCR candidates...');
        show(await collectShootingRangeResults());
      }
    }catch(error){show({error:error?.message||String(error),code:error?.code||null,status:error?.status||null,url:error?.url||null});}
    finally{button.disabled=false;}
  });
  const existing=readCapture();if(existing)show(existing);
}
