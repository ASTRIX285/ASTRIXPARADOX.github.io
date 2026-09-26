/* ASTRIX PARADOX glass breach loader skin.
   The logo flies out of deep space, smashes through an invisible glass pane,
   the pane bursts into shards, splinters, debris and embers, the pieces clear
   away and the logo settles and pulses. Every play breaks differently.

   Used by astrix-portal-loader.js on the first visit of a session, never on the
   Forge Loader or Build Forge recommendation pages. All geometry is generated in
   code; only the logo image is an asset. Library: three.js 0.170 (MIT), pinned
   and loaded on demand. The caller falls back to the portal loader if this
   module or three.js cannot load in time, or WebGL is unavailable. */

const THREE_URL='https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

const CONFIG={
  logoAspect:543/420,
  logoWidth:2.6,
  impactTime:1.2,
  hitStop:0.07,
  settleTime:1.4,
  clearStart:4,
  clearEnd:7,
  logoStartZ:-14,
  paneRadius:3.6,
  crackSpeed:0.06,
  maxForward:1.5,
  counts:{splinters:260,debris:420,embers:600,stars:1400},
  splinterMix:[0.55,0.33,0.12],
  paneMix:{ruby:0.04,smoke:0.12},
  edgeShare:0.2,
  pulseEvery:6,
  colours:{crimson:0xb22222,gold:0xc9a84c,glass:0xcfd8e2,smoke:0x2a2b31,ember:0xe0602a}
};

export async function createBreach({host,logoUrl,lowTier=false}){
  const THREE=await import(THREE_URL);
  const logoImage=await new Promise((resolve,reject)=>{
    const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=logoUrl;
  });

  const C={...CONFIG,counts:{...CONFIG.counts}};
  if(lowTier)for(const key of Object.keys(C.counts))C.counts[key]=Math.round(C.counts[key]*0.5);

  let seed=Math.floor(Math.random()*2147483646)+1;
  const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  const range=(a,b)=>a+rnd()*(b-a);
  const clamp01=x=>Math.min(1,Math.max(0,x));
  const easeOut=x=>1-Math.pow(1-x,3);
  const travel=(t,k,drift=0.04)=>(1-Math.exp(-k*t))/k+drift*t;
  const lifeScale=since=>1-easeOut(clamp01((since-C.clearStart)/(C.clearEnd-C.clearStart)));
  const nearFade=z=>1-clamp01((z-1.2)/1.8);

  const renderer=new THREE.WebGLRenderer({antialias:!lowTier,alpha:true});
  renderer.setSize(innerWidth,innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio,lowTier?1:1.5));
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.1;
  host.prepend(renderer.domElement);

  const hud=document.createElement('div');
  hud.className='apx-breach-hud';
  hud.innerHTML='<div class="apx-breach-label">LOADING</div><div class="apx-breach-bar"><span></span></div>';
  host.append(hud);
  const bar=hud.querySelector('.apx-breach-bar span');

  const scene=new THREE.Scene();
  const disposables=[];
  const own=item=>{disposables.push(item);return item;};

  {
    const env=new THREE.Scene();
    env.background=new THREE.Color(0x050507);
    const strip=(colour,intensity,w,h,pos,rot)=>{
      const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color(colour).multiplyScalar(intensity),side:THREE.DoubleSide}));
      mesh.position.set(...pos);mesh.rotation.set(...rot);env.add(mesh);
    };
    strip(0xffffff,3,10,1.2,[0,6,-4],[Math.PI/2.4,0,0]);
    strip(C.colours.crimson,4,1.4,10,[-7,0,0],[0,Math.PI/2,0]);
    strip(C.colours.gold,3,1.2,8,[7,1,-1],[0,-Math.PI/2,0]);
    strip(0xffffff,1.5,12,0.6,[0,-5,2],[-Math.PI/2.2,0,0]);
    strip(C.colours.crimson,2,6,0.8,[0,2,8],[0,Math.PI,0]);
    const pmrem=new THREE.PMREMGenerator(renderer);
    const target=pmrem.fromScene(env,0.03);
    scene.environment=target.texture;
    own(target);pmrem.dispose();
  }

  const camera=new THREE.PerspectiveCamera(38,innerWidth/innerHeight,0.1,200);
  camera.position.set(0,0,11);
  const onResize=()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);};
  addEventListener('resize',onResize);

  const coreLight=new THREE.PointLight(0xff2222,0,0,2);coreLight.position.set(0,0,-1.5);scene.add(coreLight);
  const keyLight=new THREE.DirectionalLight(0xffe2b0,1.6);keyLight.position.set(4,5,6);scene.add(keyLight);
  const sweepLight=new THREE.PointLight(0xffffff,40,0,2);scene.add(sweepLight);

  {
    const n=C.counts.stars,pos=new Float32Array(n*3);
    for(let i=0;i<n;i++){pos[i*3]=range(-60,60);pos[i*3+1]=range(-40,40);pos[i*3+2]=range(-80,-20);}
    const geometry=own(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.BufferAttribute(pos,3));
    scene.add(new THREE.Points(geometry,own(new THREE.PointsMaterial({color:0xc8d0ff,size:0.12,transparent:true,opacity:.8}))));
  }

  const MAT={
    glass:new THREE.MeshPhysicalMaterial({color:C.colours.glass,metalness:0.1,roughness:0.02,clearcoat:1,clearcoatRoughness:0,transparent:true,opacity:0.1,side:THREE.DoubleSide,envMapIntensity:1.6,depthWrite:false}),
    smoke:new THREE.MeshPhysicalMaterial({color:C.colours.smoke,metalness:0.3,roughness:0.03,clearcoat:1,transparent:true,opacity:0.78,side:THREE.DoubleSide,envMapIntensity:2.4}),
    ruby:new THREE.MeshPhysicalMaterial({color:C.colours.crimson,metalness:0.2,roughness:0.04,clearcoat:1,transparent:true,opacity:.8,side:THREE.DoubleSide,envMapIntensity:2.2}),
    edge:new THREE.LineBasicMaterial({color:C.colours.gold,transparent:true,opacity:.25}),
    splinterClear:new THREE.MeshPhysicalMaterial({color:0xaeb8c4,metalness:0.35,roughness:0.08,clearcoat:1,transparent:true,opacity:.8,envMapIntensity:2.6}),
    splinterDark:new THREE.MeshPhysicalMaterial({color:0x2a2a30,metalness:0.6,roughness:0.12,clearcoat:1,envMapIntensity:2.2}),
    splinterHot:new THREE.MeshStandardMaterial({color:C.colours.ember,emissive:C.colours.crimson,emissiveIntensity:1.1,roughness:.3}),
    debris:new THREE.MeshPhysicalMaterial({color:0x8f9aa6,metalness:.45,roughness:.06,clearcoat:1,envMapIntensity:2.4,side:THREE.DoubleSide})
  };
  Object.values(MAT).forEach(own);

  function triangulate(points){
    const big=[[-100,-100],[100,-100],[0,100]];let tris=[[...big]];
    const circum=([a,b,c])=>{
      const d=2*(a[0]*(b[1]-c[1])+b[0]*(c[1]-a[1])+c[0]*(a[1]-b[1]));
      const s=p=>p[0]**2+p[1]**2;
      const ux=(s(a)*(b[1]-c[1])+s(b)*(c[1]-a[1])+s(c)*(a[1]-b[1]))/d;
      const uy=(s(a)*(c[0]-b[0])+s(b)*(a[0]-c[0])+s(c)*(b[0]-a[0]))/d;
      return [ux,uy,(a[0]-ux)**2+(a[1]-uy)**2];
    };
    for(const p of points){
      const bad=tris.filter(t=>{const[x,y,r2]=circum(t);return (p[0]-x)**2+(p[1]-y)**2<r2;});
      const edges=[];
      for(const t of bad)for(let i=0;i<3;i++){
        const e=[t[i],t[(i+1)%3]];
        const k=edges.findIndex(f=>(f[0]===e[1]&&f[1]===e[0])||(f[0]===e[0]&&f[1]===e[1]));
        if(k>=0)edges.splice(k,1);else edges.push(e);
      }
      tris=tris.filter(t=>!bad.includes(t));
      for(const e of edges)tris.push([e[0],e[1],p]);
    }
    return tris.filter(t=>!t.some(v=>big.includes(v)));
  }

  const paneShards=[];
  {
    const points=[[range(-.05,.05),range(-.05,.05)]];
    [[.18,9],[.4,13],[.7,16],[1.1,19],[1.6,22],[2.2,24],[2.9,26],[3.7,26],[4.6,24]].forEach(([rad,n])=>{
      const count=Math.round(n*range(.8,1.25)*(lowTier?0.7:1));
      for(let i=0;i<count;i++){
        const a=2*Math.PI*i/count+range(-.4,.4)*2*Math.PI/count,r=rad*range(.88,1.12);
        points.push([r*Math.cos(a),r*Math.sin(a)]);
      }
    });
    for(const t of triangulate(points)){
      const c=[(t[0][0]+t[1][0]+t[2][0])/3,(t[0][1]+t[1][1]+t[2][1])/3];
      const dist=Math.hypot(c[0],c[1]);
      if(dist>C.paneRadius)continue;
      const shape=new THREE.Shape(t.map(v=>new THREE.Vector2(v[0]-c[0],v[1]-c[1])));
      const geometry=own(new THREE.ExtrudeGeometry(shape,{depth:0.05,bevelEnabled:true,bevelThickness:0.012,bevelSize:0.012,bevelSegments:1}));
      geometry.translate(0,0,-0.025);
      const pick=rnd();
      const mesh=new THREE.Mesh(geometry,pick<C.paneMix.ruby?MAT.ruby:pick<C.paneMix.ruby+C.paneMix.smoke?MAT.smoke:MAT.glass);
      if(rnd()<C.edgeShare)mesh.add(new THREE.LineSegments(own(new THREE.EdgesGeometry(geometry,30)),MAT.edge));
      mesh.position.set(c[0],c[1],0);mesh.visible=false;scene.add(mesh);
      const dir=new THREE.Vector3(c[0],c[1],0).normalize(),near=Math.max(0,1-dist/4.8);
      paneShards.push({mesh,origin:new THREE.Vector3(c[0],c[1],0),
        velocity:new THREE.Vector3(dir.x*(1.2+near*4.5)*range(.7,1.3),dir.y*(1.2+near*4.5)*range(.7,1.3),Math.min(C.maxForward,(0.6+near*3)*range(.4,1.4))),
        spin:new THREE.Vector3(range(-4,4)*(0.3+near),range(-4,4)*(0.3+near),range(-2,2)),
        delay:dist*C.crackSpeed*range(.6,1.4),drag:range(1,3.6)});
    }
  }

  const splinterGeometry=own(new THREE.ConeGeometry(0.035,1,4,1));
  splinterGeometry.rotateZ(-Math.PI/2);splinterGeometry.translate(0.5,0,0);
  const splinterSets=[MAT.splinterClear,MAT.splinterDark,MAT.splinterHot].map((material,i)=>{
    const mesh=new THREE.InstancedMesh(splinterGeometry,material,Math.floor(C.counts.splinters*C.splinterMix[i]));
    mesh.visible=false;scene.add(mesh);
    const hot=material===MAT.splinterHot;
    const data=Array.from({length:mesh.count},()=>{
      const angle=rnd()*Math.PI*2,rightSide=Math.cos(angle)>0;
      return {angle,elevation:range(-.35,.25),length:0.15+Math.pow(rnd(),2.2)*2,
        speed:(0.8+Math.pow(rnd(),1.5)*6)*(hot&&!rightSide?0.6:1),
        width:range(.3,2.5),depth:range(.2,2.6),roll:rnd()*Math.PI,
        drag:range(1,4.5),delay:rnd()*0.15,start:range(1.1,2.2)};
    });
    return {mesh,data};
  });

  const chip=points=>own(new THREE.ExtrudeGeometry(new THREE.Shape(points.map(([x,y])=>new THREE.Vector2(x,y))),{depth:0.008,bevelEnabled:false}));
  const debrisGeometries=[
    own(new THREE.TetrahedronGeometry(0.06,0)),
    own(new THREE.OctahedronGeometry(0.05,0)),
    own(new THREE.BoxGeometry(0.12,0.04,0.01)),
    chip([[0,0],[0.14,0.02],[0.05,0.07]]),
    chip([[0,0],[0.1,-0.02],[0.13,0.05],[0.03,0.08]])
  ];
  const debrisSets=debrisGeometries.map(geometry=>{
    const count=Math.floor(C.counts.debris/debrisGeometries.length*range(.5,1.5));
    const mesh=new THREE.InstancedMesh(geometry,MAT.debris,count);mesh.visible=false;scene.add(mesh);
    const data=Array.from({length:count},()=>({
      dir:new THREE.Vector3(rnd()-.5,rnd()-.5,(rnd()-.35)*.6).normalize(),
      speed:0.5+Math.pow(rnd(),1.4)*7,scale:new THREE.Vector3(range(.2,1.8),range(.2,1.8),range(.2,1.8)),
      spin:new THREE.Vector3(range(-7,7),range(-7,7),range(-7,7)),drag:range(.8,4),delay:rnd()*0.2,start:range(.9,1.7)}));
    return {mesh,data};
  });

  const emberCount=C.counts.embers;
  const emberPos=new Float32Array(emberCount*3),emberCol=new Float32Array(emberCount*3);
  const emberGeometry=own(new THREE.BufferGeometry());
  emberGeometry.setAttribute('position',new THREE.BufferAttribute(emberPos,3));
  emberGeometry.setAttribute('color',new THREE.BufferAttribute(emberCol,3));
  const embers=new THREE.Points(emberGeometry,own(new THREE.PointsMaterial({size:0.07,vertexColors:true,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false})));
  embers.visible=false;scene.add(embers);
  const goldRGB=new THREE.Color(C.colours.gold),crimsonRGB=new THREE.Color(0xff2a1a);
  const emberData=Array.from({length:emberCount},()=>{
    const a=rnd()*Math.PI*2,bias=Math.cos(a)>0?1:0.35,colour=rnd()<.55?goldRGB:crimsonRGB;
    return {dir:new THREE.Vector3(Math.cos(a),Math.sin(a),range(-.3,.3)).normalize(),
      speed:(1+Math.pow(rnd(),1.3)*12)*bias,colour:[colour.r*1.4,colour.g*1.4,colour.b*1.4],
      life:range(.3,2.5),drag:range(.8,3.8),delay:rnd()*0.25};
  });

  const logoTexture=own(new THREE.Texture(logoImage));logoTexture.colorSpace=THREE.SRGBColorSpace;logoTexture.needsUpdate=true;
  const logo=new THREE.Mesh(own(new THREE.PlaneGeometry(C.logoWidth,C.logoWidth*C.logoAspect)),
    own(new THREE.MeshBasicMaterial({map:logoTexture,transparent:true,depthWrite:false,depthTest:false})));
  logo.renderOrder=10;scene.add(logo);

  const glowCanvas=document.createElement('canvas');glowCanvas.width=glowCanvas.height=256;
  {
    const g=glowCanvas.getContext('2d'),gradient=g.createRadialGradient(128,128,0,128,128,128);
    gradient.addColorStop(0,'rgba(255,40,40,1)');gradient.addColorStop(.35,'rgba(178,34,34,.45)');gradient.addColorStop(1,'rgba(0,0,0,0)');
    g.fillStyle=gradient;g.fillRect(0,0,256,256);
  }
  const glow=new THREE.Mesh(own(new THREE.PlaneGeometry(6,6)),own(new THREE.MeshBasicMaterial({map:own(new THREE.CanvasTexture(glowCanvas)),
    transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false})));
  glow.position.z=-0.3;scene.add(glow);

  const M=new THREE.Matrix4(),Q=new THREE.Quaternion(),E=new THREE.Euler(),S=new THREE.Vector3(),P=new THREE.Vector3();
  const burstTime=since=>{const s=Math.max(0,since-C.hitStop);return s<0.2?s*s/0.4:s-0.1;};

  function renderAt(t){
    const HIT=C.impactTime,since=Math.max(0,t-HIT),broken=t>=HIT;
    const bt=burstTime(since),fade=lifeScale(since),active=broken&&since<C.clearEnd;

    if(t<HIT){const k=t/HIT;logo.position.z=C.logoStartZ+(0.4-C.logoStartZ)*k*k;logo.rotation.z=(1-k)*0.35;logo.position.y=0;}
    else{const k=Math.min(1,since/C.settleTime);logo.position.z=0.4+1.2*easeOut(k);logo.rotation.z=0;
      logo.position.y=since>C.settleTime?Math.sin(since*1.1)*0.04:0;}

    for(const s of paneShards){
      s.mesh.visible=active&&since>=C.hitStop+s.delay*0.5;
      if(!s.mesh.visible)continue;
      const st=Math.max(0,bt-s.delay),f=travel(st,s.drag);
      s.mesh.position.set(s.origin.x+s.velocity.x*f,s.origin.y+s.velocity.y*f,s.origin.z+s.velocity.z*f);
      s.mesh.rotation.set(s.spin.x*f+s.spin.x*0.05*st,s.spin.y*f+s.spin.y*0.05*st,s.spin.z*f);
      s.mesh.scale.setScalar(Math.max(1e-4,fade*nearFade(s.mesh.position.z)));
    }

    for(const {mesh,data} of splinterSets){
      mesh.visible=active;if(!active)continue;
      data.forEach((n,i)=>{
        const nt=Math.max(0,bt-n.delay),f=travel(nt,n.drag),d=n.start+n.speed*f;
        const stretch=1+Math.min(1.2,n.speed*Math.exp(-n.drag*nt)*0.15);
        E.set(n.roll+f*2,-n.elevation,n.angle);Q.setFromEuler(E);
        P.set(Math.cos(n.angle)*Math.cos(n.elevation)*d,Math.sin(n.angle)*Math.cos(n.elevation)*d,Math.min(C.maxForward,Math.sin(n.elevation)*d*0.8)-0.2);
        const on=(nt>0?1:1e-4)*Math.max(1e-4,fade*nearFade(P.z));
        S.set(n.length*stretch*on,n.width*on,n.depth*on);M.compose(P,Q,S);mesh.setMatrixAt(i,M);
      });
      mesh.instanceMatrix.needsUpdate=true;
    }

    for(const {mesh,data} of debrisSets){
      mesh.visible=active;if(!active)continue;
      data.forEach((d,i)=>{
        const dt=Math.max(0,bt-d.delay),f=travel(dt,d.drag,0.03);
        P.copy(d.dir).multiplyScalar(d.start+d.speed*f);P.z=Math.min(C.maxForward,P.z)-0.3;
        E.set(d.spin.x*f+d.spin.x*0.03*dt,d.spin.y*f,d.spin.z*f);Q.setFromEuler(E);
        S.copy(d.scale).multiplyScalar((dt>0?1:1e-4)*Math.max(1e-4,fade*nearFade(P.z)));M.compose(P,Q,S);mesh.setMatrixAt(i,M);
      });
      mesh.instanceMatrix.needsUpdate=true;
    }

    embers.visible=active;
    if(active){
      emberData.forEach((p,i)=>{
        const pt=Math.max(0,bt-p.delay),f=travel(pt,p.drag,0),life=Math.max(0,1-pt/p.life),dist=1+p.speed*0.6*f;
        emberPos[i*3]=p.dir.x*dist;emberPos[i*3+1]=p.dir.y*dist;emberPos[i*3+2]=p.dir.z*dist+0.5;
        const b=pt>0?life*life:0;emberCol[i*3]=p.colour[0]*b;emberCol[i*3+1]=p.colour[1]*b;emberCol[i*3+2]=p.colour[2]*b;
      });
      emberGeometry.attributes.position.needsUpdate=true;emberGeometry.attributes.color.needsUpdate=true;
    }

    const flash=broken?Math.exp(-since*5):0;
    const beat=since>C.settleTime?Math.pow(Math.max(0,Math.sin(since*Math.PI*2/C.pulseEvery)),8):0;
    coreLight.intensity=40+900*flash+120*beat;
    glow.material.opacity=0.08+0.6*flash+0.18*beat;

    sweepLight.position.set(Math.sin(t*0.7)*8,Math.cos(t*0.5)*4,6);
    const shake=broken?Math.exp(-since*9)*0.12:0;
    camera.position.x=Math.sin(t*0.2)*0.25+shake*Math.sin(since*73);
    camera.position.y=Math.cos(t*0.17)*0.15+shake*Math.cos(since*61);
    camera.lookAt(0,0,0);

    hud.classList.toggle('is-on',since>1);
    renderer.render(scene,camera);
  }

  let clock=0,last=performance.now(),raf=0,disposed=false,frames=0,slow=0;
  const loop=now=>{
    if(disposed)return;
    const dt=Math.min(0.05,(now-last)/1000);last=now;clock+=dt;
    if(frames<60){frames++;if(dt>0.024)slow++;if(frames===60&&slow>30)renderer.setPixelRatio(1);}
    renderAt(clock);
    raf=requestAnimationFrame(loop);
  };
  renderAt(0);
  raf=requestAnimationFrame(loop);

  return {
    setProgress(value){bar.style.transform=`scaleX(${clamp01(Number(value)||0)})`;},
    dispose(){
      if(disposed)return;
      disposed=true;cancelAnimationFrame(raf);removeEventListener('resize',onResize);
      disposables.forEach(item=>item.dispose&&item.dispose());
      renderer.dispose();renderer.forceContextLoss();
      renderer.domElement.remove();hud.remove();
    }
  };
}
