// THROWAWAY: two real-time art directions for the same ocean scene.
// Switch with ?variant=voxel or ?variant=cel. This is not a gameplay scaffold.
import {
  Engine, Scene, ArcRotateCamera, Vector3, Color3, Color4, HemisphericLight,
  DirectionalLight, Mesh, MeshBuilder, VertexData, StandardMaterial,
  ShaderMaterial, Effect, TransformNode, DynamicTexture
} from '@babylonjs/core';
import '@babylonjs/core/Rendering/outlineRenderer';
import { createEnvironment, terrainHeight } from './assets/environment.js';
import { createVehicles } from './assets/vehicles.js';
import { createEcology } from './assets/ecology.js';

const canvas = document.querySelector('#scene');
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true }, false);
engine.setHardwareScalingLevel(1);
const params = new URLSearchParams(location.search);
let variant = params.get('variant') === 'cel' ? 'cel' : 'voxel';
let refined = params.get('detail') !== 'original';
let view = ['reef', 'pod', 'scout', 'island','life'].includes(params.get('view')) ? params.get('view') : 'reef';
let dusk = params.get('light') === 'dusk';
let paused = params.get('still') === '1';
let renderDirty = true, interactionUntil = 0, modules = [], moduleStats = [];
let scene, camera, toon, voxelMaterial, sun, ambient, water;
let elapsed = 0, previousFrame = 0, samples = [], frameIntervals = [], renderedFrames = 0;
const V = (x,y,z) => new Vector3(x,y,z);
const C = hex => Color3.FromHexString(hex);
const colors = {
  sand:'#7cbaab', stone:'#417e85', deep:'#346d7b', shore:'#dfcf91',
  fern:'#529778', moss:'#37846b', leaf:'#70c4a3', coral:'#e68d81',
  purple:'#a699c3', yellow:'#e7bd67', white:'#e6e7d5', metal:'#4c7882',
  window:'#075569', ink:'#103442', lime:'#b7deb0', light:'#b5f5d8'
};
function seeded(seed) { return () => { seed=(1664525*seed+1013904223)>>>0; return seed/4294967296; }; }
let random = seeded(74);
const boxData = VertexData.CreateBox({size:1});

Effect.ShadersStore.siltToonVertexShader = [
  'precision highp float;',
  'attribute vec3 position; attribute vec3 normal; attribute vec4 color;',
  'uniform mat4 world; uniform mat4 worldViewProjection;',
  'varying vec3 vNormal; varying vec3 vWorld; varying vec4 vColor;',
  'void main(){vec4 p=world*vec4(position,1.0);vWorld=p.xyz;',
  'vNormal=normalize(mat3(world)*normal);vColor=color;',
  'gl_Position=worldViewProjection*vec4(position,1.0);}'
].join('\n');
Effect.ShadersStore.siltToonFragmentShader = [
  'precision highp float;',
  'varying vec3 vNormal; varying vec3 vWorld; varying vec4 vColor;',
  'uniform vec3 cameraPosition; uniform vec3 fogColor; uniform float fogDensity;',
  'uniform vec3 lightDirection; uniform float exposure; uniform float time; uniform float refinement; uniform float blockStyle;',
  'void main(){vec3 n=normalize(vNormal); float d=dot(n,normalize(lightDirection));',
  'float band=d>0.62?1.13:(d>0.14?0.91:(d>-0.30?0.70:0.51));',
  'float rim=pow(1.0-max(0.0,dot(n,normalize(cameraPosition-vWorld))),3.0);',
  'vec3 shade=vColor.rgb*band*exposure+vec3(0.035,0.09,0.10)*rim;',
  'float ripple=sin(vWorld.x*1.2+vWorld.z*.35+time*.4)*sin(vWorld.z*1.45-vWorld.x*.25-time*.3);',
  'float caustic=smoothstep(.73,.95,ripple)*max(n.y,0.0)*(1.0-smoothstep(8.8,10.0,vWorld.y));',
  'shade+=vec3(.12,.16,.10)*caustic*exposure;',
  'shade*=mix(.84,1.0,smoothstep(-15.0,7.0,vWorld.y));',
  'if(refinement>0.5){',
  'float lum=dot(vColor.rgb,vec3(.2126,.7152,.0722));',
  'vec3 pigment=clamp(mix(vec3(lum),vColor.rgb,1.22),0.0,1.0);',
  'float direct=max(d,0.0);float light=blockStyle>.5?(.55+direct*.63):band;',
  'vec3 temperature=mix(vec3(.68,.88,1.03),vec3(1.08,1.035,.91),smoothstep(-.1,.72,d));',
  'shade=pigment*light*temperature*exposure;',
  'float waveX=vWorld.x*.9+sin(vWorld.z*.62+time*.18)*.7+time*.12;',
  'float waveZ=vWorld.z*1.05+sin(vWorld.x*.51-time*.13)*.8;',
  'float net=1.0-smoothstep(.018,.12,abs(sin(waveX)*sin(waveZ)));',
  'caustic=net*max(n.y,0.0)*(1.0-smoothstep(8.8,10.0,vWorld.y));',
  'shade+=vec3(.035,.12,.15)*rim+vec3(.08,.13,.12)*caustic;',
  'shade*=mix(.89,1.0,smoothstep(-15.0,5.0,vWorld.y));',
  '}',
  'float haze=1.0-exp(-length(cameraPosition-vWorld)*fogDensity);',
  'gl_FragColor=vec4(mix(shade,fogColor,clamp(haze,0.0,0.94)),1.0);}'
].join('\n');

function paint(mesh, hex, outline = true) {
  if (variant === 'cel') {
    mesh.material = toon;
    const col=C(hex), a=[];
    for(let i=0;i<mesh.getTotalVertices();i++) a.push(col.r,col.g,col.b,1);
    mesh.setVerticesData('color',a);
    mesh.useVertexColors=true;
    if(outline){mesh.renderOutline=true;mesh.outlineColor=C('#17454c');mesh.outlineWidth=.022;}
  } else mesh.material = voxelMaterial;
  return mesh;
}

class Sculpture {
  constructor(name, step=.6) {
    this.root=new TransformNode(name,scene);this.step=step;
    this.positions=[];this.normals=[];this.indices=[];this.colorData=[];this.parts=[];
  }
  cube(p,size,hex) {
    const c=C(hex), offset=this.positions.length/3;
    const variation=.94+.10*(Math.sin(p[0]*4.3+p[1]*9.1+p[2]*3.7)*.5+.5);
    for(let i=0;i<boxData.positions.length;i+=3){
      this.positions.push(boxData.positions[i]*size[0]+p[0],boxData.positions[i+1]*size[1]+p[1],boxData.positions[i+2]*size[2]+p[2]);
      this.normals.push(boxData.normals[i],boxData.normals[i+1],boxData.normals[i+2]);
      this.colorData.push(c.r*variation,c.g*variation,c.b*variation,1);
    }
    for(const index of boxData.indices)this.indices.push(index+offset);
  }
  box(p,size,hex) {
    if(variant==='voxel')this.cube(p,size,hex);
    else {
      const mesh=MeshBuilder.CreateBox('panel',{width:size[0],height:size[1],depth:size[2]},scene);
      mesh.position=V(...p);mesh.parent=this.root;paint(mesh,hex);this.parts.push(mesh);
    }
  }
  ellipsoid(p,radii,hex,step=this.step) {
    if(variant==='voxel'){
      const nx=Math.ceil(radii[0]/step),ny=Math.ceil(radii[1]/step),nz=Math.ceil(radii[2]/step);
      const inside=(x,y,z)=>(x*step/radii[0])**2+(y*step/radii[1])**2+(z*step/radii[2])**2<=1;
      for(let x=-nx;x<=nx;x++)for(let y=-ny;y<=ny;y++)for(let z=-nz;z<=nz;z++){
        if(!inside(x,y,z))continue;
        if(inside(x+1,y,z)&&inside(x-1,y,z)&&inside(x,y+1,z)&&inside(x,y-1,z)&&inside(x,y,z+1)&&inside(x,y,z-1))continue;
        this.cube([p[0]+x*step,p[1]+y*step,p[2]+z*step],[step,step,step],hex);
      }
    }else{
      const mesh=MeshBuilder.CreateSphere('form',{diameter:2,segments:16},scene);
      mesh.scaling=V(...radii);mesh.position=V(...p);mesh.parent=this.root;paint(mesh,hex);this.parts.push(mesh);
    }
  }
  branch(points,radius,hex) {
    if(variant==='voxel'){
      for(let i=0;i<points.length-1;i++){
        const a=V(...points[i]),b=V(...points[i+1]),n=Math.ceil(Vector3.Distance(a,b)/this.step);
        for(let j=0;j<=n;j++){
          const p=Vector3.Lerp(a,b,j/Math.max(n,1));
          const r=Math.max(this.step*.7,radius*(1-(i+j/n)/(points.length)*.65));
          this.cube([p.x,p.y,p.z],[r*1.7,r*1.7,r*1.7],hex);
        }
      }
    }else{
      const mesh=MeshBuilder.CreateTube('branch',{path:points.map(p=>V(...p)),radius,tessellation:7,radiusFunction:i=>Math.max(radius*.25,radius*(1-i/points.length*.7)),cap:Mesh.CAP_ALL},scene);
      mesh.parent=this.root;paint(mesh,hex);this.parts.push(mesh);
    }
  }
  finish(outline=true) {
    if(this.positions.length){
      const mesh=new Mesh('voxel-sculpture',scene), data=new VertexData();
      data.positions=this.positions;data.normals=this.normals;data.indices=this.indices;data.colors=this.colorData;
      data.applyToMesh(mesh);mesh.material=voxelMaterial;mesh.parent=this.root;mesh.useVertexColors=true;
    }
    if(this.parts.length){
      for(const m of this.parts){m.bakeCurrentTransformIntoVertices();m.parent=null;m.renderOutline=false;}
      const merged=Mesh.MergeMeshes(this.parts,true,true,undefined,false,false);
      merged.parent=this.root;
      merged.renderOutline=outline;merged.outlineColor=C('#163e46');merged.outlineWidth=.025;
    }
    return this.root;
  }
}

const height = terrainHeight;

function createWater() {
  const texture=new DynamicTexture('water-ripples',{width:512,height:512},scene,false);
  const ctx=texture.getContext();ctx.fillStyle='#64cfce';ctx.fillRect(0,0,512,512);
  for(let i=0;i<48;i++){
    ctx.beginPath();ctx.strokeStyle=i%3?'#a9e7d9':'#e7f3c8';ctx.lineWidth=i%3?1.2:2.5;
    for(let x=0;x<520;x+=8){
      const y=i*11+Math.sin(x*.025+i)*5+Math.sin(x*.06-i)*3;
      if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }ctx.stroke();
  }texture.update();texture.uScale=46;texture.vScale=46;
  water=MeshBuilder.CreateGround('water-surface',{width:4000,height:4000,subdivisions:1},scene);
  water.position.y=10;
  const m=new StandardMaterial('water-surface-material',scene);
  m.diffuseTexture=texture;m.diffuseColor=C('#8cd8cf');m.specularColor=C('#eef5b6');
  m.specularPower=64;m.alpha=.32;m.backFaceCulling=false;m.disableLighting=false;
  water.material=m;
  // Sparse suspended matter and light shafts establish depth without a postprocess stack.
  const dust=new Sculpture('suspended-matter',.1);
  for(let i=0;i<95;i++){
    const p=[(random()-.5)*70,-9+random()*19,-20+random()*60];
    dust.cube(p,[.045,.045,.045],colors.light);
  }dust.finish(false);
  const rayMat=new StandardMaterial('water-light-shaft',scene);
  rayMat.diffuseColor=C('#b0e8d9');rayMat.emissiveColor=C('#8acdc0');rayMat.alpha=.035;rayMat.backFaceCulling=false;rayMat.disableLighting=true;
  for(let i=0;i<5;i++){
    const shaft=MeshBuilder.CreateCylinder('sun-shaft',{height:31,diameterTop:.3,diameterBottom:3.4,tessellation:12},scene);
    shaft.position=V(-7+i*8,-3,13+i*3);shaft.rotation.z=-.29;shaft.material=rayMat;shaft.isPickable=false;
  }
}

function createGrounding() {
  // Soft procedural contact shade gives the study's static forms a seabed anchor.
  // It is an authored art cue, not a demonstrated production shadow system.
  const tex=new DynamicTexture('soft-contact',{width:128,height:128},scene,false);
  const ctx=tex.getContext(),g=ctx.createRadialGradient(64,64,8,64,64,64);
  g.addColorStop(0,'rgba(7,35,46,.37)');g.addColorStop(.5,'rgba(7,35,46,.19)');g.addColorStop(1,'rgba(7,35,46,0)');
  ctx.fillStyle=g;ctx.fillRect(0,0,128,128);tex.update();tex.hasAlpha=true;
  const mat=new StandardMaterial('contact-shade',scene);
  mat.diffuseTexture=tex;mat.useAlphaFromDiffuseTexture=true;mat.disableLighting=true;mat.emissiveColor=Color3.White();mat.backFaceCulling=false;mat.zOffset=-1;
  for(const [x,z,w,d] of [[-13,-1,15,13],[9,-4,9,9],[-3,18,10,8],[15,18,10,8]]){
    const mesh=new Mesh('seabed-contact',scene),data=new VertexData();
    const positions=[],uvs=[],indices=[],normals=[],step=variant==='voxel'?(refined?1.15:2.3):1;
    const left=x-w/2,right=x+w/2,front=z-d/2,back=z+d/2;
    const startX=variant==='voxel'?-69+Math.floor((left+69)/step)*step:left;
    const startZ=variant==='voxel'?-48+Math.floor((front+48)/step)*step:front;
    for(let sx=startX;sx<right;sx+=step)for(let sz=startZ;sz<back;sz+=step){
      const a=Math.max(sx,left),b=Math.min(sx+step,right),c=Math.max(sz,front),e=Math.min(sz+step,back);
      const quantum=refined?.425:.85;
      const top=Math.round(height(sx+step/2,sz+step/2)/quantum)*quantum;
      const base=positions.length/3;
      for(const [px,pz] of [[a,c],[a,e],[b,e],[b,c]]){
        positions.push(px,(variant==='voxel'?top:height(px,pz))+.06,pz);
        normals.push(0,1,0);uvs.push((px-left)/w,(pz-front)/d);
      }indices.push(base,base+1,base+2,base,base+2,base+3);
    }
    data.positions=positions;data.normals=normals;data.uvs=uvs;data.indices=indices;data.applyToMesh(mesh);
    mesh.material=mat;mesh.isPickable=false;
  }
}

const cameras={
  reef:{position:[29,3,-45],target:[-1,-3,9]},
  pod:{position:[4,0,-22],target:[-13,-4.5,-1]},
  scout:{position:[23,2,-19],target:[9,-3,-4]},
  island:{position:[10,31,-8],target:[-28,19,36]},
  life:{position:[27,5,-4],target:[16,1.5,10.5]}
};
function applyCamera() {
  renderDirty=true;
  const p=cameras[view];camera.setTarget(V(...p.target));camera.setPosition(V(...p.position));
  camera.lowerRadiusLimit=8;camera.upperRadiusLimit=130;
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('selected',b.dataset.view===view));
  updateAtmosphere();
}
function updateAtmosphere() {
  renderDirty=true;
  const surface=view==='island';
  const fog=dusk?(surface?'#5c7391':'#124957'):(surface?'#8bd0d3':refined?'#176980':'#348997');
  scene.fogColor=C(fog);scene.clearColor=Color4.FromColor3(C(fog),1);
  scene.fogDensity=surface?.0028:(refined?.0048:.009);
  canvas.style.background=surface?(dusk?'linear-gradient(#24364e,#8d9ca7)':'linear-gradient(#79becd,#c8e3db)'):(dusk?'linear-gradient(#18566a,#082f46)':'linear-gradient(#51a4ad,#185669)');
  if(refined&&!surface)canvas.style.background=dusk?'linear-gradient(#123c59,#041c32)':'linear-gradient(#398f9c,#0a344f)';
  scene.clearColor=new Color4(0,0,0,0);
  sun.intensity=dusk?.65:1.1;ambient.intensity=dusk?.65:.92;
  toon.setColor3('fogColor',scene.fogColor);toon.setFloat('fogDensity',scene.fogDensity);
  toon.setFloat('exposure',dusk?.8:(refined?1.08:1.13));
  toon.setFloat('refinement',refined?1:0);toon.setFloat('blockStyle',variant==='voxel'?1:0);
  water.material.alpha=surface?.68:.16;
  document.querySelector('#light-toggle').setAttribute('aria-pressed',String(dusk));
  document.querySelector('#light-toggle span').textContent=dusk?'Blue hour':'Daylight';
}
function syncURL() {
  const url=new URL(location.href);url.searchParams.set('variant',variant);url.searchParams.set('view',view);url.searchParams.set('detail',refined?'refined':'original');
  if(dusk)url.searchParams.set('light','dusk');else url.searchParams.delete('light');
  history.replaceState({},'',url);
}
function syncUI() {
  const voxel=variant==='voxel';
  document.querySelector('#detail-toggle').setAttribute('aria-pressed',String(refined));
  document.querySelector('#detail-toggle span').textContent=refined?'Refined study':'Original study';
  document.querySelector('#style-title').textContent=voxel?(refined?'Fine tidal blocks':'Tidal blocks'):(refined?'Living color':'Living ink');
  document.querySelector('#style-summary').textContent=voxel?
    (refined?'Smaller steps reveal finer silhouettes, while engineered surfaces retain their precision.':'A living reef in carved, stepped forms. Crisp silhouettes under soft underwater light.'):
    (refined?'Richer reef colonies, clearer material colors and a more luminous illustrated ocean.':'Sculpted life, pools of color and delicate ink. A luminous ocean with an illustrated edge.');
  document.querySelector('#technique').textContent=voxel?'VOXEL GEOMETRY · DIFFUSE LIGHT':'CURVED GEOMETRY · BANDED LIGHT · INK';
  document.querySelector('#variant-number').textContent=voxel?'01 / 02':'02 / 02';
  for(const id of ['voxel','cel'])document.querySelector('#'+id).setAttribute('aria-pressed',String(variant===id));
}
function build() {
  if(scene)scene.dispose();
  modules=[];moduleStats=[];renderDirty=true;random=seeded(74);samples=[];frameIntervals=[];previousFrame=0;elapsed=0;
  scene=new Scene(engine);scene.fogMode=Scene.FOGMODE_EXP;
  scene.imageProcessingConfiguration.exposure=1.06;scene.imageProcessingConfiguration.contrast=1.08;
  camera=new ArcRotateCamera('study-camera',-.8,1.3,58,V(0,-3,9),scene);
  camera.attachControl(canvas,true);camera.wheelPrecision=22;camera.panningSensibility=75;
  camera.lowerBetaLimit=.12;camera.upperBetaLimit=Math.PI*.87;camera.minZ=.1;camera.maxZ=850;
  camera.inputs.attached.keyboard.keysLeft=[];camera.inputs.attached.keyboard.keysRight=[];
  camera.inputs.attached.keyboard.keysUp=[];camera.inputs.attached.keyboard.keysDown=[];
  ambient=new HemisphericLight('sky-fill',V(0,1,0),scene);
  ambient.groundColor=C('#337685');ambient.diffuse=C('#b3e5dc');
  sun=new DirectionalLight('sun',V(.4,-1,.35),scene);sun.diffuse=C('#fff1bf');
  toon=new ShaderMaterial('illustrated-material',scene,{vertex:'siltToon',fragment:'siltToon'},{
    attributes:['position','normal','color'],
    uniforms:['world','worldViewProjection','cameraPosition','fogColor','fogDensity','lightDirection','exposure','time','refinement','blockStyle']
  });
  toon.setVector3('lightDirection',V(-.4,1,-.35));toon.backFaceCulling=false;
  voxelMaterial=new StandardMaterial('voxel-palette',scene);
  voxelMaterial.diffuseColor=Color3.White();voxelMaterial.specularColor=Color3.Black();
  voxelMaterial.ambientColor=C('#67968c');
  if(refined&&variant==='voxel')voxelMaterial=toon;
  const ctx={scene,variant,refined,Sculpture,colors,V,C,seeded,height,paint,toon,voxelMaterial};
  for(const [name,create] of [['environment',createEnvironment],['vehicles',createVehicles],['ecology',createEcology]]){
    const before={meshes:scene.meshes.length,vertices:scene.meshes.reduce((n,m)=>n+m.getTotalVertices(),0)};
    modules.push(create(ctx));
    moduleStats.push({name,meshes:scene.meshes.length-before.meshes,vertices:scene.meshes.reduce((n,m)=>n+m.getTotalVertices(),0)-before.vertices});
  }
  createWater();createGrounding();
  applyCamera();syncUI();syncURL();
  scene.executeWhenReady(()=>{renderDirty=true;document.querySelector('#loading').classList.add('loaded');setTimeout(()=>{document.querySelector('#loading').hidden=true;},550);window.dispatchEvent(new Event('art-study-ready'));});
}

document.querySelector('#detail-toggle').addEventListener('click',()=>{
  const position=camera.position.clone(),target=camera.target.clone();refined=!refined;build();camera.setTarget(target);camera.setPosition(position);
});

function chooseStyle(next) {
  if(variant===next)return;
  const position=camera.position.clone(),target=camera.target.clone();
  variant=next;build();camera.setTarget(target);camera.setPosition(position);
  console.info('Art study variant:',variant,'view:',view,'lighting:',dusk?'blue-hour':'daylight');
}
for(const id of ['voxel','cel'])document.querySelector('#'+id).addEventListener('click',()=>chooseStyle(id));
for(const id of ['previous','next'])document.querySelector('#'+id).addEventListener('click',()=>chooseStyle(variant==='voxel'?'cel':'voxel'));
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{view=b.dataset.view;applyCamera();syncURL();}));
document.querySelector('#light-toggle').addEventListener('click',()=>{dusk=!dusk;updateAtmosphere();syncURL();});
document.querySelector('#motion-toggle').addEventListener('click',()=>{
  paused=!paused;renderDirty=true;previousFrame=0;frameIntervals=[];document.querySelector('#motion-toggle').setAttribute('aria-pressed',String(paused));
  document.querySelector('#motion-toggle span').textContent=paused?'Resume life':'Pause life';
});
document.querySelector('#reset-camera').addEventListener('click',applyCamera);
document.querySelector('#details-toggle').addEventListener('click',()=>{
  const panel=document.querySelector('#details');panel.hidden=!panel.hidden;
  document.querySelector('#details-toggle').setAttribute('aria-expanded',String(!panel.hidden));
  document.querySelector('#render-info').textContent='Current study: '+variant+' · '+scene.meshes.length+' meshes · '+scene.getTotalVertices().toLocaleString()+' vertices. A small scene does not establish full-game performance.';
});
document.querySelector('#close-details').addEventListener('click',()=>{document.querySelector('#details').hidden=true;document.querySelector('#details-toggle').setAttribute('aria-expanded','false');});
window.addEventListener('keydown',e=>{
  if(e.target.matches('input,textarea,[contenteditable=true]'))return;
  if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();chooseStyle(variant==='voxel'?'cel':'voxel');}
  if(e.key==='Escape'){document.querySelector('#details').hidden=true;document.querySelector('#details-toggle').setAttribute('aria-expanded','false');}
});
window.addEventListener('resize',()=>{engine.resize();renderDirty=true;});
for(const event of ['pointerdown','pointerup','pointermove','wheel','keydown'])canvas.addEventListener(event,()=>{renderDirty=true;interactionUntil=performance.now()+1600;},{passive:true});
if(params.get('clean')==='1')document.body.classList.add('clean');
build();
document.querySelector('#motion-toggle').setAttribute('aria-pressed',String(paused));
document.querySelector('#motion-toggle span').textContent=paused?'Resume life':'Pause life';
engine.runRenderLoop(()=>{
  if(document.hidden)return;
  const now=performance.now();
  if(paused&&!renderDirty&&now>interactionUntil&&scene.isReady())return;
  if(now-previousFrame<1000/30)return;
  if(previousFrame>0&&!paused){frameIntervals.push(now-previousFrame);if(frameIntervals.length>180)frameIntervals.shift();}
  const dt=Math.min((now-previousFrame)/1000,.12);previousFrame=now;
  if(!paused)elapsed+=dt;
  for(const assetModule of modules)assetModule?.update?.(elapsed);
  water.material.diffuseTexture.uOffset=elapsed*.0013;
  toon.setVector3('cameraPosition',camera.position);
  toon.setFloat('time',elapsed);
  const start=performance.now();scene.render();renderDirty=false;samples.push(performance.now()-start);
  if(samples.length>180)samples.shift();renderedFrames++;
});
Object.defineProperty(window,'artStudy',{value:{
  getState:()=>{
    const sorted=[...samples].sort((a,b)=>a-b),intervals=[...frameIntervals].sort((a,b)=>a-b),gl=engine.getGlInfo();
    return {variant,detail:refined?'refined':'original',view,lighting:dusk?'blue-hour':'daylight',paused,ready:scene.isReady(),
      meshes:scene.meshes.length,vertices:scene.getTotalVertices(),moduleStats,renderedFrames,
      camera:{position:camera.position.asArray(),target:camera.target.asArray()},
      viewport:[engine.getRenderWidth(),engine.getRenderHeight()],webGL:engine.webGLVersion,
      renderer:gl.renderer,vendor:gl.vendor,
      frameIntervalMs:{sampleCount:intervals.length,p50:intervals[Math.floor(intervals.length*.5)]??null,p95:intervals[Math.floor(intervals.length*.95)]??null},
      cpuRenderMs:{p50:sorted[Math.floor(sorted.length*.5)]??null,p95:sorted[Math.floor(sorted.length*.95)]??null},
      note:'Frame intervals include a 30 fps cap and software/browser capture overhead. CPU submission is separate. Neither is a full-game performance claim.'};
  }
},writable:false});
