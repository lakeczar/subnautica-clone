// THROWAWAY: two real-time art directions for the same ocean scene.
// Switch with ?variant=voxel or ?variant=cel. This is not a gameplay scaffold.
import {
  Engine, Scene, ArcRotateCamera, Vector3, Color3, Color4, HemisphericLight,
  DirectionalLight, Mesh, MeshBuilder, VertexData, StandardMaterial,
  ShaderMaterial, Effect, TransformNode, DynamicTexture
} from '@babylonjs/core';
import '@babylonjs/core/Rendering/outlineRenderer';

const canvas = document.querySelector('#scene');
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true }, false);
engine.setHardwareScalingLevel(1);
const params = new URLSearchParams(location.search);
let variant = params.get('variant') === 'cel' ? 'cel' : 'voxel';
let view = ['reef', 'pod', 'scout', 'island'].includes(params.get('view')) ? params.get('view') : 'reef';
let dusk = params.get('light') === 'dusk';
let paused = false;
let scene, camera, toon, voxelMaterial, sun, ambient, water, animals = [];
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
  'uniform vec3 lightDirection; uniform float exposure;',
  'void main(){vec3 n=normalize(vNormal); float d=dot(n,normalize(lightDirection));',
  'float band=d>0.62?1.13:(d>0.14?0.89:(d>-0.30?0.66:0.44));',
  'float rim=pow(1.0-max(0.0,dot(n,normalize(cameraPosition-vWorld))),3.0);',
  'vec3 shade=vColor.rgb*band*exposure+vec3(0.035,0.09,0.10)*rim;',
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

function height(x,z) {
  return -13 + Math.sin(x*.16)*1.2 + Math.cos(z*.15)*1.1
    + 34*Math.exp(-((x+29)**2/170+(z-36)**2/280))
    + 17*Math.exp(-((x+39)**2/80+(z-46)**2/110))
    + 3*Math.exp(-((x-20)**2/220+(z-12)**2/180));
}
function terrainColor(y,x,z) {
  if(y>13.2)return colors.fern;
  if(y>7.2)return colors.shore;
  if(y>2)return colors.stone;
  if(Math.sin(x*.29+z*.15)>.5)return colors.deep;
  return colors.sand;
}
function createTerrain() {
  if(variant==='voxel'){
    const land=new Sculpture('stepped-seafloor');
    for(let x=-69;x<69;x+=3)for(let z=-48;z<90;z+=3){
      const top=Math.round(height(x,z)/1.5)*1.5;
      land.box([x,(-23+top)/2,z],[3,top+23,3],terrainColor(top,x,z));
    } land.finish(false);
  }else{
    const positions=[],indices=[],colorData=[],normals=[];
    const n=60,step=2.4;
    for(let z=0;z<=n;z++)for(let x=0;x<=n;x++){
      const px=-72+x*step,pz=-50+z*step,y=height(px,pz),c=C(terrainColor(y,px,pz));
      positions.push(px,y,pz);colorData.push(c.r,c.g,c.b,1);
    }
    for(let z=0;z<n;z++)for(let x=0;x<n;x++){
      const a=z*(n+1)+x;indices.push(a,a+n+1,a+1,a+1,a+n+1,a+n+2);
    }
    VertexData.ComputeNormals(positions,indices,normals);
    const data=new VertexData(), mesh=new Mesh('sculpted-seafloor',scene);
    data.positions=positions;data.indices=indices;data.normals=normals;data.colors=colorData;
    data.applyToMesh(mesh);mesh.material=toon;mesh.useVertexColors=true;
  }
}

function createReef() {
  const rock=new Sculpture('reef-arch',1.05);
  for(let i=0;i<11;i++){
    const t=i/10*Math.PI;
    rock.ellipsoid([6+Math.cos(t)*9,-11+Math.sin(t)*11,18],[3,3.4,2.8],i%3===0?colors.moss:colors.stone,1.05);
  }
  const rr=seeded(300);
  for(let i=0;i<24;i++){
    const x=(rr()-.5)*78,z=rr()*65-12;
    rock.ellipsoid([x,height(x,z)+.4,z],[1.8+rr()*3,1.2+rr()*2,1.5+rr()*2],i%3?colors.stone:colors.moss,1.05);
  }
  rock.finish();
  const reef=new Sculpture('coral-gardens',.45);
  const sites=[[-16,-17],[18,-16],[25,-6],[-27,2],[2,14],[20,19],[-13,17],[-3,-20],[30,31],[-38,17]];
  sites.forEach(([x,z],i)=>{
    const y=height(x,z),color=[colors.coral,colors.purple,colors.yellow][i%3];
    for(let j=0;j<5;j++){
      const bx=x+(j-2)*.72,bz=z+Math.sin(j*2.1),tall=2.2+random()*2.6;
      reef.branch([[bx,y,bz],[bx+.1,y+tall*.5,bz],[bx+(j%2?1:-1),y+tall,bz+.4]],.42,color);
      reef.branch([[bx,y+tall*.45,bz],[bx+1.2,y+tall*.65,bz-.7],[bx+1.5,y+tall*.9,bz-.9]],.25,color);
    }
    reef.ellipsoid([x+2.5,y+.8,z+2],[2.1,.8,1.5],colors.lime,.5);
    reef.ellipsoid([x+2.5,y+1.2,z+2],[1.4,.4,1],colors.leaf,.5);
  });
  for(let i=0;i<15;i++){
    const x=(random()-.5)*62,z=random()*55-18,y=height(x,z);
    if(y>6)continue;
    reef.ellipsoid([x,y+.5,z],[1.2,.45,1.2],colors.purple,.4);
    reef.ellipsoid([x,y+1.1,z],[.85,.33,.85],colors.coral,.35);
    reef.ellipsoid([x,y+1.65,z],[.6,.23,.6],colors.yellow,.3);
  }
  reef.finish();
}

function createKelp() {
  const garden=new Sculpture('ribbon-forest',.5);
  const positions=[[-24,-8],[-28,-6],[-30,-1],[29,2],[34,8],[32,12],[-23,20],[25,28],[-40,10]];
  positions.forEach(([x,z],j)=>{
    const y=height(x,z),h=8+(j%3)*1.9;
    const pts=[];
    for(let i=0;i<7;i++)pts.push([x+Math.sin(i*.7+j)*1.1,y+i*h/6,z+Math.sin(i*.5)*.7]);
    garden.branch(pts,.28,colors.moss);
    for(let i=1;i<6;i++){
      const p=pts[i],dir=i%2?1:-1;
      garden.branch([p,[p[0]+dir*1.2,p[1]+1,p[2]],[p[0]+dir*2.1,p[1]+1.3,p[2]+.3]],.45,colors.leaf);
      if(i%2===0)garden.ellipsoid([p[0]+dir*1.6,p[1]+.9,p[2]],[.36,.56,.36],colors.yellow,.3);
    }
  });
  garden.finish();
}

function createPod() {
  const pod=new Sculpture('refuge-pod',.45);
  pod.box([0,-3.1,0],[10,.65,8],colors.metal);
  for(const x of [-3.5,3.5])for(const z of [-2.7,2.7])pod.box([x,-5,z],[.6,4,.6],colors.metal);
  pod.ellipsoid([0,0,0],[4,3.1,3.1],colors.white,.45);
  pod.ellipsoid([0,-.3,-2.45],[2.85,1.8,.72],colors.window,.35);
  pod.box([0,-2.4,-3.15],[5,.2,.3],colors.yellow);
  pod.box([0,2.8,.2],[2.7,.6,2.4],colors.yellow);
  pod.box([0,3.3,.2],[1.9,.5,1.7],colors.metal);
  pod.box([-3.6,-.2,0],[.5,4.7,2.5],colors.yellow);
  pod.box([3.6,-.2,0],[.5,4.7,2.5],colors.yellow);
  pod.box([0,-2.5,-4.6],[3.4,.25,2.4],colors.metal);
  pod.box([1.55,-1.9,-4.6],[.12,1.2,2.4],colors.lime);
  pod.branch([[2,2.4,1],[2,6,1],[2.3,6.4,1]],.12,colors.white);
  pod.ellipsoid([2.3,6.5,1],[.3,.3,.3],colors.coral,.25);
  const root=pod.finish();root.position=V(-13,-5,-1);root.rotation.y=-.15;
  // The warm window strips are in-scene geometry, not a painted screenshot.
  const strips=new Sculpture('pod-window-strips',.2);
  strips.box([0,.1,-3.16],[.13,3.1,.16],colors.lime);
  strips.box([0,-.1,-3.22],[5.1,.13,.12],colors.lime);
  strips.box([-2.8,-1,-3.1],[.2,.35,.2],colors.light);
  strips.box([2.8,-1,-3.1],[.2,.35,.2],colors.light);
  const s=strips.finish();s.parent=root;
}

function createScout() {
  const ship=new Sculpture('scout-submersible',.34);
  ship.ellipsoid([0,0,0],[1.9,1.45,4.6],colors.yellow,.34);
  ship.ellipsoid([0,.55,-2.6],[1.48,1.22,1.8],colors.window,.3);
  ship.ellipsoid([0,.5,-3.25],[1.15,.93,1.1],colors.metal,.3);
  ship.ellipsoid([0,.6,-3.8],[.92,.66,.5],colors.window,.25);
  ship.box([0,1.55,-1],[.23,.23,2.3],colors.white);
  ship.box([0,-1.05,-.5],[1.4,.45,6.2],colors.white);
  for(const side of [-1,1]){
    ship.ellipsoid([side*2.7,-.15,1],[.75,.8,2.2],colors.white,.3);
    ship.ellipsoid([side*2.7,-.15,2.7],[.62,.65,.45],colors.ink,.3);
    ship.ellipsoid([side*2.7,-.15,2.95],[.29,.31,.25],colors.light,.22);
    ship.box([side*2,-.4,.5],[2,.3,1.9],colors.metal);
    ship.box([side*1.1,.05,-4],[.35,.35,.35],colors.light);
  }
  ship.branch([[0,.6,2.5],[0,2.6,3.2],[0,2.2,4.4]],.3,colors.yellow);
  const root=ship.finish();root.position=V(9,-3,-4);root.rotation.y=-.5;
  animals.push({root,kind:'scout',base:root.position.clone(),phase:0});
}

function createIslandPlants() {
  const plants=new Sculpture('island-plants',.7);
  for(let i=0;i<12;i++){
    const x=-35+random()*18,z=28+random()*18,y=height(x,z);
    if(y<11)continue;
    plants.branch([[x,y,z],[x+.4,y+2.4,z],[x+1,y+5,z+.5]],.5,colors.metal);
    for(let j=0;j<5;j++){
      const a=j/5*Math.PI*2;
      plants.ellipsoid([x+1+Math.cos(a)*1.7,y+4.8,z+.5+Math.sin(a)*1.7],[2.1,.6,1.4],j%2?colors.leaf:colors.fern,.65);
    }
  }plants.finish();
  const station=new Sculpture('island-research-remnant',.65);
  const x=-27,z=35,y=height(x,z);
  station.box([x,y+1.2,z],[6,2.4,4],colors.white);
  station.box([x,y+2.5,z],[7,.4,5],colors.metal);
  station.box([x,y+1.2,z-2.05],[3.8,.9,.15],colors.window);
  station.branch([[x+2,y+2.7,z],[x+2,y+7,z]],.2,colors.yellow);
  station.ellipsoid([x+2,y+7,z],[1,.5,1],colors.yellow,.5);
  station.finish();
}

function createFish() {
  for(let i=0;i<24;i++){
    const fish=new Sculpture('reef-fish',.16);
    const col=i%4===0?colors.coral:i%3===0?colors.lime:colors.yellow;
    fish.ellipsoid([0,0,0],[.75,.35,.19],col,.16);
    fish.ellipsoid([-.74,0,0],[.3,.44,.11],colors.white,.14);
    fish.ellipsoid([.45,.08,-.18],[.075,.075,.075],colors.ink,.1);
    fish.ellipsoid([.45,.08,.18],[.075,.075,.075],colors.ink,.1);
    const root=fish.finish();
    const group=i<15?0:1;
    const base=V(group===0?4+(i%5)*1.8:-10+(i%3)*1.7,group===0?2+(i%3)*.55:-6+(i%4)*.6,group===0?7+(i%3)*1.3:-12+(i%4));
    root.position.copyFrom(base);root.scaling.setAll(.65+random()*.45);
    animals.push({root,kind:'fish',base,phase:i*.6,group});
  }
  for(let i=0;i<3;i++){
    const animal=new Sculpture('ribbon-swimmer',.35);
    animal.ellipsoid([0,0,0],[2,.45,1.7],colors.purple,.35);
    animal.ellipsoid([-2,.02,.3],[1.4,.2,1.6],colors.coral,.35);
    animal.ellipsoid([2,.02,.3],[1.4,.2,1.6],colors.coral,.35);
    animal.branch([[0,0,1],[0,-.3,3],[.4,-.7,4.4]],.16,colors.purple);
    const root=animal.finish(),base=V(12+i*6,6+i*.7,30+i*4);
    root.position.copyFrom(base);root.scaling.setAll(.7+i*.2);
    animals.push({root,kind:'ray',base,phase:i});
  }
}

function createWater() {
  const texture=new DynamicTexture('water-ripples',{width:512,height:512},scene,false);
  const ctx=texture.getContext();ctx.fillStyle='#64cfce';ctx.fillRect(0,0,512,512);
  for(let i=0;i<48;i++){
    ctx.beginPath();ctx.strokeStyle=i%3?'#a9e7d9':'#e7f3c8';ctx.lineWidth=i%3?1.2:2.5;
    for(let x=0;x<520;x+=8){
      const y=i*11+Math.sin(x*.025+i)*5+Math.sin(x*.06-i)*3;
      if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }ctx.stroke();
  }texture.update();texture.uScale=8;texture.vScale=8;
  water=MeshBuilder.CreateGround('water-surface',{width:700,height:700,subdivisions:1},scene);
  water.position.y=10;
  const m=new StandardMaterial('water-surface-material',scene);
  m.diffuseTexture=texture;m.diffuseColor=C('#8cd8cf');m.specularColor=C('#eef5b6');
  m.specularPower=64;m.alpha=.32;m.backFaceCulling=false;m.disableLighting=false;
  water.material=m;
  // Sparse suspended matter and light shafts establish depth without a postprocess stack.
  const dust=new Sculpture('suspended-matter',.1);
  for(let i=0;i<95;i++){
    const p=[(random()-.5)*70,-9+random()*19,-20+random()*60];
    if(variant==='voxel')dust.cube(p,[.055,.055,.055],colors.light);
    else dust.ellipsoid(p,[.04,.04,.04],colors.light);
  }dust.finish(false);
  const rayMat=new StandardMaterial('water-light-shaft',scene);
  rayMat.diffuseColor=C('#b0e8d9');rayMat.emissiveColor=C('#8acdc0');rayMat.alpha=.035;rayMat.backFaceCulling=false;rayMat.disableLighting=true;
  for(let i=0;i<5;i++){
    const shaft=MeshBuilder.CreateCylinder('sun-shaft',{height:31,diameterTop:.3,diameterBottom:3.4,tessellation:12},scene);
    shaft.position=V(-7+i*8,-3,13+i*3);shaft.rotation.z=-.29;shaft.material=rayMat;shaft.isPickable=false;
  }
}

const cameras={
  reef:{position:[29,3,-45],target:[-1,-3,9]},
  pod:{position:[4,0,-22],target:[-13,-4.5,-1]},
  scout:{position:[29,2,0],target:[9,-3,-3]},
  island:{position:[35,45,-42],target:[-19,6,24]}
};
function applyCamera() {
  const p=cameras[view];camera.setTarget(V(...p.target));camera.setPosition(V(...p.position));
  camera.lowerRadiusLimit=8;camera.upperRadiusLimit=130;
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('selected',b.dataset.view===view));
  updateAtmosphere();
}
function updateAtmosphere() {
  const surface=view==='island';
  const fog=dusk?(surface?'#5c7391':'#124957'):(surface?'#8bd0d3':'#348997');
  scene.fogColor=C(fog);scene.clearColor=Color4.FromColor3(C(fog),1);
  scene.fogDensity=surface?.0028:.007;
  sun.intensity=dusk?.65:1.25;ambient.intensity=dusk?.75:1.12;
  toon.setColor3('fogColor',scene.fogColor);toon.setFloat('fogDensity',scene.fogDensity);
  toon.setFloat('exposure',dusk?.8:1.13);
  water.material.alpha=surface?.68:.16;
  document.querySelector('#light-toggle').setAttribute('aria-pressed',String(dusk));
  document.querySelector('#light-toggle span').textContent=dusk?'Blue hour':'Daylight';
}
function syncURL() {
  const url=new URL(location.href);url.searchParams.set('variant',variant);url.searchParams.set('view',view);
  if(dusk)url.searchParams.set('light','dusk');else url.searchParams.delete('light');
  history.replaceState({},'',url);
}
function syncUI() {
  const voxel=variant==='voxel';
  document.querySelector('#style-title').textContent=voxel?'Tidal blocks':'Living ink';
  document.querySelector('#style-summary').textContent=voxel?
    'A living reef in carved, stepped forms. Crisp silhouettes under soft underwater light.':
    'Sculpted life, pools of color and delicate ink. A luminous ocean with an illustrated edge.';
  document.querySelector('#technique').textContent=voxel?'VOXEL GEOMETRY · DIFFUSE LIGHT':'CURVED GEOMETRY · BANDED LIGHT · INK';
  document.querySelector('#variant-number').textContent=voxel?'01 / 02':'02 / 02';
  for(const id of ['voxel','cel'])document.querySelector('#'+id).setAttribute('aria-pressed',String(variant===id));
}
function build() {
  if(scene)scene.dispose();
  animals=[];random=seeded(74);samples=[];frameIntervals=[];previousFrame=0;elapsed=0;
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
    uniforms:['world','worldViewProjection','cameraPosition','fogColor','fogDensity','lightDirection','exposure']
  });
  toon.setVector3('lightDirection',V(-.4,1,-.35));toon.backFaceCulling=false;
  voxelMaterial=new StandardMaterial('voxel-palette',scene);
  voxelMaterial.diffuseColor=Color3.White();voxelMaterial.specularColor=Color3.Black();
  voxelMaterial.ambientColor=C('#67968c');
  createTerrain();createReef();createKelp();createPod();createScout();createIslandPlants();createFish();createWater();
  applyCamera();syncUI();syncURL();
  scene.executeWhenReady(()=>{document.querySelector('#loading').classList.add('loaded');setTimeout(()=>{document.querySelector('#loading').hidden=true;},550);window.dispatchEvent(new Event('art-study-ready'));});
}

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
  paused=!paused;document.querySelector('#motion-toggle').setAttribute('aria-pressed',String(paused));
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
window.addEventListener('resize',()=>engine.resize());
if(params.get('clean')==='1')document.body.classList.add('clean');
build();
engine.runRenderLoop(()=>{
  if(document.hidden)return;
  const now=performance.now();if(now-previousFrame<1000/30)return;
  if(previousFrame>0){frameIntervals.push(now-previousFrame);if(frameIntervals.length>180)frameIntervals.shift();}
  const dt=Math.min((now-previousFrame)/1000,.12);previousFrame=now;
  if(!paused)elapsed+=dt;
  for(const a of animals){
    if(a.kind==='fish'){
      const t=elapsed*.23+a.phase;
      a.root.position.set(a.base.x+Math.sin(t)*4,a.base.y+Math.sin(t*1.8)*.45,a.base.z+Math.cos(t)*2);
      a.root.rotation.y=-Math.atan2(-Math.sin(t)*2,Math.cos(t)*4);
      a.root.rotation.z=Math.sin(t*2)*.08;
    }else if(a.kind==='ray'){
      a.root.position.set(a.base.x+Math.sin(elapsed*.12+a.phase)*5,a.base.y+Math.sin(elapsed*.5+a.phase)*.5,a.base.z);
      a.root.rotation.z=Math.sin(elapsed*.7+a.phase)*.08;
    }else a.root.position.y=a.base.y+Math.sin(elapsed*.8)*.12;
  }
  water.material.diffuseTexture.uOffset=elapsed*.0013;
  toon.setVector3('cameraPosition',camera.position);
  const start=performance.now();scene.render();samples.push(performance.now()-start);
  if(samples.length>180)samples.shift();renderedFrames++;
});
Object.defineProperty(window,'artStudy',{value:{
  getState:()=>{
    const sorted=[...samples].sort((a,b)=>a-b),intervals=[...frameIntervals].sort((a,b)=>a-b),gl=engine.getGlInfo();
    return {variant,view,lighting:dusk?'blue-hour':'daylight',paused,ready:scene.isReady(),
      meshes:scene.meshes.length,vertices:scene.getTotalVertices(),renderedFrames,
      camera:{position:camera.position.asArray(),target:camera.target.asArray()},
      viewport:[engine.getRenderWidth(),engine.getRenderHeight()],webGL:engine.webGLVersion,
      renderer:gl.renderer,vendor:gl.vendor,
      frameIntervalMs:{sampleCount:intervals.length,p50:intervals[Math.floor(intervals.length*.5)]??null,p95:intervals[Math.floor(intervals.length*.95)]??null},
      cpuRenderMs:{p50:sorted[Math.floor(sorted.length*.5)]??null,p95:sorted[Math.floor(sorted.length*.95)]??null},
      note:'Frame intervals include a 30 fps cap and software/browser capture overhead. CPU submission is separate. Neither is a full-game performance claim.'};
  }
},writable:false});
