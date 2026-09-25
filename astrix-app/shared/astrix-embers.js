(function(){
  'use strict';
  if(window.__apxEmbers)return;
  window.__apxEmbers=true;

  var MAX_EMBERS=44;
  var MAX_SPARKS=6;
  var MAX_DPR=1.5;
  var reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  var canvas=null,ctx=null,raf=0,last=0,width=0,height=0,dpr=1;
  var crimson='',gold='';
  var embers=[],sparks=[],sparkTimer=0;

  function token(name){
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function rand(a,b){return a+Math.random()*(b-a)}

  function makeEmber(initial){
    var life=rand(9,18);
    return{
      x:rand(0,width),
      y:initial?rand(0,height):height+rand(4,40),
      vy:-rand(10,28),
      sway:rand(6,18),
      freq:rand(.25,.7),
      phase:rand(0,6.283),
      r:rand(.9,2.2),
      age:initial?rand(0,life):0,
      life:life,
      alpha:rand(.4,.8),
      colour:Math.random()<.62?crimson:gold
    };
  }
  function makeSpark(){
    var life=rand(2.2,4.2);
    return{
      x:rand(width*.05,width*.95),
      y:height+rand(0,20),
      vy:-rand(40,80),
      sway:rand(10,26),
      freq:rand(.5,1.1),
      phase:rand(0,6.283),
      r:rand(1.6,2.6),
      age:0,
      life:life,
      alpha:rand(.7,.95),
      colour:gold
    };
  }

  function envelope(p){
    var t=p.age/p.life;
    if(t<.15)return t/.15;
    if(t>.65)return Math.max(0,(1-t)/.35);
    return 1;
  }

  function draw(p,spark){
    var a=envelope(p)*p.alpha;
    if(a<=0)return;
    var x=p.x+Math.sin(p.age*p.freq*6.283+p.phase)*p.sway;
    if(spark)a*=.75+.25*Math.sin(p.age*22+p.phase);
    ctx.fillStyle=p.colour;
    ctx.globalAlpha=a*(spark?.22:.16);
    ctx.beginPath();ctx.arc(x,p.y,p.r*(spark?4.5:3.2),0,6.283);ctx.fill();
    ctx.globalAlpha=a;
    ctx.beginPath();ctx.arc(x,p.y,p.r,0,6.283);ctx.fill();
  }

  function frame(now){
    raf=requestAnimationFrame(frame);
    var dt=Math.min(.05,(now-last)/1000);
    last=now;
    ctx.clearRect(0,0,width,height);
    ctx.globalCompositeOperation='lighter';
    var i,p;
    for(i=0;i<embers.length;i++){
      p=embers[i];
      p.age+=dt;p.y+=p.vy*dt;
      if(p.age>=p.life||p.y<-10){embers[i]=makeEmber(false);continue}
      draw(p,false);
    }
    sparkTimer-=dt;
    if(sparkTimer<=0){
      if(sparks.length<MAX_SPARKS)sparks.push(makeSpark());
      sparkTimer=rand(1.6,4.5);
    }
    for(i=sparks.length-1;i>=0;i--){
      p=sparks[i];
      p.age+=dt;p.y+=p.vy*dt;
      if(p.age>=p.life||p.y<-10){sparks.splice(i,1);continue}
      draw(p,true);
    }
    ctx.globalCompositeOperation='source-over';
    ctx.globalAlpha=1;
  }

  function resize(){
    if(!canvas)return;
    dpr=Math.min(MAX_DPR,window.devicePixelRatio||1);
    width=window.innerWidth;height=window.innerHeight;
    canvas.width=Math.round(width*dpr);
    canvas.height=Math.round(height*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }

  function sitAboveArt(){
    if(canvas&&canvas.parentNode===document.body&&canvas!==document.body.lastElementChild){
      document.body.appendChild(canvas);
    }
  }

  function run(){
    if(raf||!canvas||document.hidden||reduced.matches)return;
    last=performance.now();
    raf=requestAnimationFrame(frame);
  }
  function pause(){
    if(raf)cancelAnimationFrame(raf);
    raf=0;
  }

  function build(){
    crimson=token('--apx-ember-crimson');
    gold=token('--apx-ember-gold');
    if(!crimson||!gold)return;
    canvas=document.createElement('canvas');
    canvas.setAttribute('aria-hidden','true');
    canvas.setAttribute('data-apx-embers','');
    canvas.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;';
    ctx=canvas.getContext('2d');
    if(!ctx)return;
    document.body.appendChild(canvas);
    resize();
    for(var i=0;i<MAX_EMBERS;i++)embers.push(makeEmber(true));
    sparkTimer=rand(1,3);
    window.addEventListener('resize',resize,{passive:true});
    document.addEventListener('visibilitychange',function(){document.hidden?pause():run()});
    var onMotion=function(){
      if(reduced.matches){pause();ctx.clearRect(0,0,width,height)}else run();
    };
    if(reduced.addEventListener)reduced.addEventListener('change',onMotion);
    window.addEventListener('load',function(){sitAboveArt();setTimeout(sitAboveArt,1500)});
    run();
  }

  if(reduced.matches)return;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',build);
  else build();
})();
