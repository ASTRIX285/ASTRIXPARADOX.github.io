/* ASTRIX PARADOX brand shell: the public ribbon is full at the top of the page
   and becomes a slim 52px bar once the page scrolls. Uses an IntersectionObserver
   on a 1px marker, never a scroll listener. */
(function(){
  var body=document.body;
  if(!body||!body.classList.contains('ax-brand')||!('IntersectionObserver' in window))return;
  var marker=document.createElement('div');
  marker.setAttribute('aria-hidden','true');
  marker.style.cssText='position:absolute;top:0;left:0;width:1px;height:120px;pointer-events:none;visibility:hidden';
  body.prepend(marker);
  new IntersectionObserver(function(entries){
    body.classList.toggle('ax-nav-slim',!entries[0].isIntersecting);
  }).observe(marker);
})();
