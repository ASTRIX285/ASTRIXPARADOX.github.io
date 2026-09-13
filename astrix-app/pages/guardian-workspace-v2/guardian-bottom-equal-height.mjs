function lockBottomPanelHeights(){
  let style=document.getElementById('forge-bottom-equal-height');
  if(!style){
    style=document.createElement('style');
    style.id='forge-bottom-equal-height';
    style.textContent=`
      .equip.gear-layout-active{
        align-items:stretch!important;
      }
      .equip.gear-layout-active > .gear-weapons{
        height:auto!important;
        min-height:100%!important;
        align-self:stretch!important;
      }
      .equip.gear-layout-active > .gear-combined{
        align-self:stretch!important;
      }
    `;
    document.head.appendChild(style);
  }
}

lockBottomPanelHeights();
document.addEventListener('forge:guardian-selection-changed',lockBottomPanelHeights);
