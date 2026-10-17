// Original procedural life for the Siltwake comparison. No external art assets.
import { Mesh, VertexData, TransformNode } from '@babylonjs/core';

const TAU = Math.PI * 2;
const add = (a,b) => a.map((v,i)=>v+b[i]);
const sub = (a,b) => a.map((v,i)=>v-b[i]);
const mul = (a,s) => a.map(v=>v*s);
const dot = (a,b) => a.reduce((n,v,i)=>n+v*b[i],0);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const len = a => Math.hypot(...a);
const unit = a => mul(a,1/(len(a)||1));
const mix = (a,b,t) => a.map((v,i)=>v+(b[i]-v)*t);
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const shade = (hex,f) => {
  const n=parseInt(hex.slice(1),16);
  return '#'+[n>>16,(n>>8)&255,n&255].map(v=>Math.round(clamp(v*f,0,255)).toString(16).padStart(2,'0')).join('');
};

// Each batch is either a closed, faceted sculpture or a real occupied voxel grid.
// Voxel surfaces omit faces between occupied cells, including intersecting leaves.
class LifeBatch {
  constructor(ctx,name,step=.3) {
    this.ctx=ctx;this.name=name;this.step=step;this.cells=new Map();
    this.positions=[];this.indices=[];this.colors=[];this.palette=new Map();
  }
  color(hex) {
    if(!this.palette.has(hex)) {
      const c=this.ctx.C(hex);this.palette.set(hex,[c.r,c.g,c.b,1]);
    }
    return this.palette.get(hex);
  }
  face(points,hex) {
    const start=this.positions.length/3,col=this.color(hex);
    for(const p of points){this.positions.push(...p);this.colors.push(...col);}
    // Babylon's left-handed front faces use the opposite order to a RH cross.
    for(let i=1;i<points.length-1;i++)this.indices.push(start,start+i+1,start+i);
  }
  cell(p,hex) {
    const c=p.map(v=>Math.round(v/this.step)),key=c.join(',');
    this.cells.set(key,{c,hex});
  }
  tube(path,radii,hex) {
    if(typeof radii==='number')radii=path.map(()=>radii);
    if(this.ctx.variant==='voxel') {
      const s=this.step;
      for(let i=0;i<path.length-1;i++) {
        const a=path[i],b=path[i+1],d=sub(b,a),d2=dot(d,d),r=Math.max(radii[i],radii[i+1]);
        const low=a.map((v,j)=>Math.floor((Math.min(v,b[j])-r)/s));
        const high=a.map((v,j)=>Math.ceil((Math.max(v,b[j])+r)/s));
        for(let x=low[0];x<=high[0];x++)for(let y=low[1];y<=high[1];y++)for(let z=low[2];z<=high[2];z++) {
          const p=[x*s,y*s,z*s],t=clamp(dot(sub(p,a),d)/(d2||1),0,1);
          const rr=Math.max(s*.48,radii[i]+(radii[i+1]-radii[i])*t);
          if(len(sub(p,add(a,mul(d,t))))<=rr)this.cell(p,hex);
        }
      }
      return;
    }
    const rings=path.map((p,i)=>{
      const tangent=unit(sub(path[Math.min(i+1,path.length-1)],path[Math.max(0,i-1)]));
      const u=unit(cross(tangent,Math.abs(tangent[1])>.9?[1,0,0]:[0,1,0])),v=cross(tangent,u);
      return Array.from({length:6},(_,j)=>add(p,add(mul(u,Math.cos(j/6*TAU)*radii[i]),mul(v,Math.sin(j/6*TAU)*radii[i]))));
    });
    for(let i=0;i<rings.length-1;i++)for(let j=0;j<6;j++)this.face([rings[i][j],rings[i][(j+1)%6],rings[i+1][(j+1)%6],rings[i+1][j]],j<3?hex:shade(hex,.8));
    this.face([...rings[0]].reverse(),hex);this.face(rings.at(-1),hex);
  }
  // A ridged, closed membrane, with a narrow structural spine and colored rim.
  leaf(path,widths,across,hex,tip=hex,ridge=.075) {
    across=unit(across);
    const frames=path.map((p,i)=>{
      const tangent=unit(sub(path[Math.min(i+1,path.length-1)],path[Math.max(0,i-1)]));
      const side=unit(sub(across,mul(tangent,dot(across,tangent))));
      return {p,w:widths[i],side,normal:unit(cross(tangent,side))};
    });
    if(this.ctx.variant==='voxel') {
      for(let i=0;i<frames.length-1;i++) {
        const a=frames[i],b=frames[i+1],n=Math.max(2,Math.ceil(len(sub(a.p,b.p))/(this.step*.52)));
        for(let j=0;j<=n;j++) {
          const t=j/n,p=mix(a.p,b.p,t),w=a.w+(b.w-a.w)*t;
          const side=unit(mix(a.side,b.side,t)),normal=unit(mix(a.normal,b.normal,t));
          const m=Math.max(2,Math.ceil(w*2/(this.step*.52)));
          for(let k=0;k<=m;k++) {
            const v=k/m*2-1,q=add(add(p,mul(side,w*v)),mul(normal,ridge*(1-v*v)));
            this.cell(q,(i+t)/(frames.length-1)>.78?tip:Math.abs(v)<.19?shade(hex,1.09):hex);
          }
        }
      }
      return;
    }
    const rings=frames.map(f=>[
      add(f.p,mul(f.side,-f.w)),add(f.p,mul(f.normal,ridge)),
      add(f.p,mul(f.side,f.w)),add(f.p,mul(f.normal,-.035))
    ]);
    for(let i=0;i<rings.length-1;i++)for(let j=0;j<4;j++) {
      const col=i>=rings.length-2?tip:j>1?shade(hex,.74):j===0?shade(hex,1.06):hex;
      this.face([rings[i][j],rings[i+1][j],rings[i+1][(j+1)%4],rings[i][(j+1)%4]],col);
    }
    this.face(rings[0],hex);this.face([...rings.at(-1)].reverse(),tip);
  }
  body(rings,hex,spine,frame=p=>p) {
    if(this.ctx.variant==='voxel') {
      const s=this.step;
      for(let i=0;i<rings.length-1;i++) {
        const a=rings[i],b=rings[i+1];
        for(let x=Math.ceil(a[0]/s);x<=Math.floor(b[0]/s);x++) {
          const t=(x*s-a[0])/(b[0]-a[0]),ry=a[1]+(b[1]-a[1])*t,rz=a[2]+(b[2]-a[2])*t;
          const cy=(a[3]||0)+((b[3]||0)-(a[3]||0))*t;
          for(let y=Math.floor((cy-ry)/s);y<=Math.ceil((cy+ry)/s);y++)for(let z=Math.floor(-rz/s);z<=Math.ceil(rz/s);z++) {
            if(((y*s-cy)/(ry||.01))**2+(z*s/(rz||.01))**2<=1.05)
              this.cell(frame([x*s,y*s,z*s]),y*s>cy+ry*.48?spine:hex);
          }
        }
      }
      return;
    }
    const sections=rings.map(([x,ry,rz,cy=0])=>Array.from({length:8},(_,j)=>frame([x,cy+Math.cos(j/8*TAU)*ry,Math.sin(j/8*TAU)*rz])));
    for(let i=0;i<sections.length-1;i++)for(let j=0;j<8;j++) {
      const col=j===0||j===7?spine:j>=3&&j<=4?shade(hex,.74):hex;
      this.face([sections[i][j],sections[i][(j+1)%8],sections[i+1][(j+1)%8],sections[i+1][j]],col);
    }
    this.face([...sections[0]].reverse(),hex);this.face(sections.at(-1),hex);
  }
  diamond(p,r,hex) {
    const top=add(p,[0,r,0]),bottom=add(p,[0,-r,0]);
    const ring=[[r,0,0],[0,0,r],[-r,0,0],[0,0,-r]].map(q=>add(p,q));
    if(this.ctx.variant==='voxel'){this.cell(p,hex);return;}
    for(let i=0;i<4;i++){this.face([top,ring[(i+1)%4],ring[i]],hex);this.face([bottom,ring[i],ring[(i+1)%4]],shade(hex,.78));}
  }
  finish(outline=false) {
    if(this.ctx.variant==='voxel') {
      const half=this.step/2;
      const faces=[
        [[1,0,0],[[1,-1,-1],[1,1,-1],[1,1,1],[1,-1,1]]],
        [[-1,0,0],[[-1,-1,1],[-1,1,1],[-1,1,-1],[-1,-1,-1]]],
        [[0,1,0],[[-1,1,-1],[-1,1,1],[1,1,1],[1,1,-1]]],
        [[0,-1,0],[[-1,-1,1],[-1,-1,-1],[1,-1,-1],[1,-1,1]]],
        [[0,0,1],[[1,-1,1],[1,1,1],[-1,1,1],[-1,-1,1]]],
        [[0,0,-1],[[-1,-1,-1],[-1,1,-1],[1,1,-1],[1,-1,-1]]]
      ];
      // Greedily join coplanar faces of one pigment. This preserves every step
      // while avoiding hundreds of tiny quads across the face of a leaf.
      const planes=new Map();
      for(const {c,hex} of this.cells.values())for(let f=0;f<faces.length;f++) {
        const [neighbor]=faces[f];if(this.cells.has(add(c,neighbor).join(',')))continue;
        const axis=neighbor.findIndex(v=>v!==0),uv=[0,1,2].filter(i=>i!==axis);
        const key=[f,c[axis],hex].join('|');
        if(!planes.has(key))planes.set(key,{f,axis,uv,plane:c[axis],hex,pixels:new Map()});
        planes.get(key).pixels.set(c[uv[0]]+','+c[uv[1]],[c[uv[0]],c[uv[1]]]);
      }
      for(const {f,axis,uv,plane,hex,pixels} of planes.values()) {
        const ordered=[...pixels.values()].sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
        for(const [u,v] of ordered) {
          if(!pixels.has(u+','+v))continue;
          let width=1,height=1;
          while(pixels.has((u+width)+','+v))width++;
          outer:while(true) {
            for(let i=0;i<width;i++)if(!pixels.has((u+i)+','+(v+height)))break outer;
            height++;
          }
          for(let y=0;y<height;y++)for(let x=0;x<width;x++)pixels.delete((u+x)+','+(v+y));
          const [normal,corners]=faces[f];
          this.face(corners.map(corner=>{
            const p=[];p[axis]=plane*this.step+normal[axis]*half;
            p[uv[0]]=(u+(corner[uv[0]]<0?-.5:width-.5))*this.step;
            p[uv[1]]=(v+(corner[uv[1]]<0?-.5:height-.5))*this.step;
            return p;
          }),hex);
        }
      }
    }
    const mesh=new Mesh(this.name,this.ctx.scene),data=new VertexData(),normals=[];
    VertexData.ComputeNormals(this.positions,this.indices,normals);
    data.positions=this.positions;data.indices=this.indices;data.normals=normals;data.colors=this.colors;
    data.applyToMesh(mesh);mesh.material=this.ctx.variant==='cel'?this.ctx.toon:this.ctx.voxelMaterial;
    mesh.useVertexColors=true;mesh.isPickable=false;
    if(this.ctx.variant==='cel'&&outline){mesh.renderOutline=true;mesh.outlineColor=this.ctx.C('#17424b');mesh.outlineWidth=.016;}
    mesh.metadata={ecology:true,species:this.name,voxelCells:this.cells.size};
    return mesh;
  }
}

function frameAt(origin,yaw=0,scale=1) {
  const c=Math.cos(yaw),s=Math.sin(yaw);
  return p=>[origin[0]+(p[0]*c+p[2]*s)*scale,origin[1]+p[1]*scale,origin[2]+(-p[0]*s+p[2]*c)*scale];
}
function placeLeaf(batch,frame,path,widths,across,hex,tip,ridge) {
  const p0=frame([0,0,0]);
  batch.leaf(path.map(frame),widths.map(w=>w*len(sub(frame([1,0,0]),p0))),sub(frame(across),p0),hex,tip,ridge);
}
function placeTube(batch,frame,path,radius,hex) {
  const scale=len(sub(frame([1,0,0]),frame([0,0,0])));
  batch.tube(path.map(frame),Array.isArray(radius)?radius.map(r=>r*scale):radius*scale,hex);
}

export function createEcology(ctx) {
  const {scene,height,V}=ctx;
  const motion=[];
  const palette={grass:'#6eae83',grassRim:'#b8cf78',coral:'#d47e73',coralRim:'#edba70',
    coralStem:'#805d66',ribbon:'#398b79',ribbonRim:'#8ac5a0',stem:'#286f69',
    crown:'#4c9c79',crownRim:'#a8cf93',bark:'#6a7e69',dart:'#dfb462',
    fin:'#447e7f',cream:'#e2d6a6',ink:'#123f4c',hero:'#377d88',heroRim:'#9acbb5'};

  // Sand-fringe compass rosettes: low basal fans, no random lawn across the path.
  const sand=new LifeBatch(ctx,'compass-rosettes',.29);
  const rosetteSites=[[-25,-7],[-28,-2],[-26,5],[-31,10],[27,-4],[31,1],[33,13],[29,24],[23,31],[-20,18],[-17,22]];
  rosetteSites.forEach(([x,z],i)=>{
    const y=height(x,z)-.12;
    if(y>5)return;
    for(let k=0;k<(i%3===0?2:1);k++) {
      const f=frameAt([x+k*1.6,y,z+k*.75],i*.87+k, .85+(i%3)*.12);
      for(let j=0;j<5;j++) {
        const a=j/5*TAU,h=1.65+(j%3)*.4;
        const leafFrame=p=>f([p[0]*Math.cos(a)+p[2]*Math.sin(a),p[1],-p[0]*Math.sin(a)+p[2]*Math.cos(a)]);
        placeLeaf(sand,leafFrame,[[0,0,0],[0,h*.45,.18],[0,h*.85,.65],[0,h,1.45]], [.055,.30,.39,.015],[1,0,0],palette.grass,palette.grassRim,.07);
      }
    }
  });
  sand.finish();

  // Forked, laterally compressed coral fans rooted into the arch's basalt feet.
  const fans=new LifeBatch(ctx,'tuning-fan-corals',.31);
  const fanSites=[[-4.5,17,1.25],[17.5,19,1.0],[20.5,24,.82],[28,25,.72],[-22,18,.82]];
  fanSites.forEach(([x,z,scale],i)=>{
    const f=frameAt([x,height(x,z)+(i<2?1.0:.65),z],-.18+i*.49,scale);
    placeTube(fans,f,[[0,-.25,0],[.15,.9,.04],[-.1,1.65,.1]],[.25,.20,.11],palette.coralStem);
    for(let j=0;j<5;j++) {
      const a=(j-2)*.39,dx=Math.sin(a),dy=Math.cos(a),h=2.65-(Math.abs(j-2)*.13);
      const path=[[-.1,1.1,.1],[dx*.65,1.55,.04],[dx*h,1.2+dy*h,.15],[dx*(h+.35),1.35+dy*h,.25]];
      placeLeaf(fans,f,path,[.065,.22,.48,.09],[Math.cos(a),-Math.sin(a),0],palette.coral,palette.coralRim,.085);
      placeTube(fans,f,path.slice(0,3),[.105,.085,.045],palette.coralStem);
    }
    // One side-grown juvenile makes the attachment asymmetrical and legible.
    placeLeaf(fans,f,[[.2,.35,-.08],[1.1,.8,-.2],[1.55,1.65,-.18],[1.6,1.9,-.1]],[.04,.21,.37,.02],[.6,-.8,0],palette.coral,palette.coralRim,.06);
  });
  fans.finish(true);

  // Six bounded current gardens. Each batch has its own rooted sway pivot.
  const ribbonSites=[[-28,-4,8.0,.1],[-31,8,9.3,.8],[-35,16,7.8,-.5],[29,8,10.2,.5],[35,19,11.3,-.4],[28,31,10.0,.9]];
  ribbonSites.forEach(([x,z,h,yaw],i)=>{
    const y=height(x,z)-.25,batch=new LifeBatch(ctx,'current-sails-'+i,.34);
    for(let stalk=0;stalk<2;stalk++) {
      const f=frameAt([stalk*1.2,0,stalk*.6],yaw+stalk*.65,stalk===0?1:.77);
      const path=Array.from({length:7},(_,j)=>[Math.sin(j*.59+i)*j*.12,j*h/6,Math.sin(j*.41+i)*j*.07]);
      placeTube(batch,f,path,path.map((_,j)=>.17-j*.018),palette.stem);
      for(let j=1;j<6;j++) {
        const p=path[j],side=j%2===0?1:-1,w=.43+(j%3)*.055;
        const leaf=[p,add(p,[side*.65,.28,.12]),add(p,[side*1.5,.75,.42]),add(p,[side*2.0,1.35,.72]),add(p,[side*1.85,1.9,.94])];
        placeLeaf(batch,f,leaf,[.04,w*.72,w,w*.64,.015],[.0,.05,1],palette.ribbon,palette.ribbonRim,.10);
      }
      const p=path.at(-1);
      placeLeaf(batch,f,[p,add(p,[.12,.8,.22]),add(p,[.6,1.35,.45])],[.04,.36,.01],[1,0,0],palette.ribbon,palette.ribbonRim,.08);
    }
    const mesh=batch.finish();mesh.position=V(x,y,z);
    motion.push({kind:'ribbon',mesh,phase:i*1.3});
  });

  // Island wind crowns grow outside the outpost's footprint and approach.
  const crowns=new LifeBatch(ctx,'wind-crown-island-plants',.46);
  const crownSites=[[-35.7,30.1,4.8],[-37.2,35.7,6.1],[-40.2,42,5.5],[-35.8,47.5,4.9],[-28,46,4.8],[-23.7,43.5,3.6],[-31.5,27.0,3.8]];
  crownSites.forEach(([x,z,h],i)=>{
    const y=height(x,z);if(y<10.4)return;
    const f=frameAt([x,y-.3,z],.7+i*.34);
    const trunk=[[0,0,0],[-.28,h*.4,.12],[.08,h*.78,.35],[.5,h,.65]];
    placeTube(crowns,f,trunk,[.28,.22,.17,.10],palette.bark);
    for(let j=0;j<5;j++) {
      const angle=j/5*TAU,base=trunk.at(-1),a=[Math.cos(angle),0,Math.sin(angle)];
      const path=[base,add(base,[a[0]*.9,.6,a[2]*.9]),add(base,[a[0]*2.0,.4,a[2]*2.0]),add(base,[a[0]*3.1,-.45,a[2]*2.8])];
      placeLeaf(crowns,f,path,[.07,.48,.73,.025],[-a[2],.08,a[0]],j%2===0?palette.crown:'#5ba987',palette.crownRim,.14);
    }
    placeLeaf(crowns,f,[[.0,h*.65,.32],[.1,h*.65+1.0,.4],[.45,h*.65+1.55,.45]],[.04,.34,.02],[1,0,0],palette.coral,palette.coralRim,.08);
    for(const a of [0,2.1,4.2])placeTube(crowns,f,[[Math.cos(a)*.85,-.05,Math.sin(a)*.85],[0,.9,0]],[.11,.15],palette.bark);
  });
  crowns.finish();

  function drawDart(batch,origin,yaw,scale,index) {
    const f=frameAt(origin,yaw,scale);
    batch.body([[-.9,.06,.04],[-.45,.27,.14],[.08,.34,.18],[.60,.23,.15],[.92,.065,.045]],palette.dart,palette.cream,f);
    for(const side of [-1,1]) {
      placeLeaf(batch,f,[[-.72,0,0],[-1.12,side*.28,0],[-1.6,side*.57,0]],[.04,.20,.035],[.45,side*.85,0],palette.fin,palette.coralRim,.035);
      placeLeaf(batch,f,[[.02,-.08,side*.12],[-.3,-.13,side*.38],[-.7,-.2,side*.56]],[.025,.20,.01],[1,.05,0],palette.fin,palette.cream,.028);
      batch.diamond(f([.56,.10,side*.145]),.062*scale,palette.ink);
      placeTube(batch,f,[[.22,-.15,side*.16],[.28,.18,side*.165]],[.055,.04],palette.cream);
    }
    placeLeaf(batch,f,[[-.33,.22,0],[-.29,.57,0],[-.57,.89,0]],[.025,.31,.015],[1,0,0],palette.fin,index%3===0?palette.coral:palette.cream,.04);
  }
  const shoals=[{p:[-.5,-4.2,9],n:5,phase:0,yaw:.15},{p:[15,-5.1,24],n:4,phase:2.1,yaw:2.7},{p:[-19,-6,11],n:4,phase:4.2,yaw:.55}];
  shoals.forEach((s,k)=>{
    const batch=new LifeBatch(ctx,'signal-dart-shoal-'+k,.205);
    for(let i=0;i<s.n;i++)drawDart(batch,[(i%3-1)*2.05,Math.sin(i*2.1)*.85,Math.floor(i/3)*2.1+(i%2)*.35],s.yaw+.10*Math.sin(i),.80+(i%3)*.09,i);
    const mesh=batch.finish(true);mesh.position=V(...s.p);
    motion.push({kind:'shoal',mesh,base:s.p,phase:s.phase});
  });

  // Veiljaw: a slow filter feeder with a genuinely open underslung mouth,
  // raker bars and free-standing fins. Its narrow body is not a manta shape.
  const heroRoot=new TransformNode('veiljaw-filter-feeder',scene);
  heroRoot.position=V(16,1.25,10.5);heroRoot.rotation.y=.30;
  const hero=new LifeBatch(ctx,'veiljaw-body-and-filter-basket',.285);
  hero.body([[-2.45,.13,.13],[-1.7,.40,.38],[-.6,.63,.56],[.7,.72,.57],[1.65,.61,.47],[2.32,.35,.34],[2.78,.13,.22,.20]],palette.hero,palette.heroRim);
  for(const side of [-1,1]) {
    // The lower jaw stays visibly separate from the upper rostrum.
    hero.tube([[1.15,-.45,side*.34],[1.9,-.88,side*.43],[2.75,-.69,side*.31],[3.05,-.40,side*.15]],[.15,.13,.11,.065],palette.coral);
    for(let j=0;j<4;j++) {
      const x=1.3+j*.43;
      hero.tube([[x,-.18+j*.09,side*(.49-j*.075)],[x+.10,-.69,side*(.43-j*.03)]],[.055,.038],palette.cream);
    }
    hero.diamond([2.15,.21,side*.325],.13,palette.ink);
    hero.diamond([2.19,.25,side*.38],.034,palette.cream);
    for(let j=0;j<3;j++)hero.tube([[.15+j*.28,.16,side*.55],[.03+j*.28,-.31,side*.52]],[.045,.035],palette.coral);
  }
  hero.tube([[2.75,-.69,-.31],[3.05,-.65,0],[2.75,-.69,.31]],[.095,.11,.095],palette.coralRim);
  for(let j=0;j<3;j++) {
    const x=.3-j*.95,h=1.8-j*.25;
    hero.leaf([[x,.5,0],[x-.1,1.1,.03],[x-.45,h,.05],[x-.9,h+.08,.10]],[.05,.42,.41,.035],[1,.08,0],palette.heroRim,palette.coralRim,.09);
  }
  // A short, sparse feeding plume leads into the open mouth.
  for(let i=0;i<5;i++)hero.diamond([3.35+(i%3)*.37,-.35+Math.sin(i*2)*.27,(i%2-.5)*.54],.055,palette.coralRim);
  const heroMesh=hero.finish(true);heroMesh.parent=heroRoot;

  const fins=[];
  for(const side of [-1,1]) {
    const wing=new LifeBatch(ctx,'veiljaw-pectoral-'+side,.285);
    wing.leaf([[0,0,0],[-.45,-.03,side*.75],[-1.40,-.16,side*1.55],[-2.65,-.33,side*2.0]],[.07,.55,.67,.025],[1,.05,side*.3],palette.hero,palette.coralRim,.10);
    wing.tube([[0,.025,0],[-.5,.035,side*.75],[-1.6,-.06,side*1.65]],[.09,.065,.025],palette.heroRim);
    const mesh=wing.finish(true),pivot=new TransformNode('veiljaw-pectoral-hinge-'+side,scene);
    pivot.parent=heroRoot;pivot.position=V(.65,-.15,side*.46);mesh.parent=pivot;
    fins.push({pivot,side});
  }
  const tail=new LifeBatch(ctx,'veiljaw-fork-tail',.285);
  tail.tube([[0,0,0],[-.65,.03,0]],[.17,.095],palette.hero);
  for(const side of [-1,1])tail.leaf([[-.45,.02,0],[-1.0,side*.47,0],[-1.75,side*1.12,.04],[-2.1,side*1.26,.07]],[.06,.35,.31,.025],[.5,side*.8,0],palette.heroRim,palette.coralRim,.055);
  const tailMesh=tail.finish(true),tailPivot=new TransformNode('veiljaw-tail-hinge',scene);
  tailPivot.parent=heroRoot;tailPivot.position=V(-2.30,0,0);tailMesh.parent=tailPivot;

  return {
    update(timeSeconds) {
      for(const m of motion) {
        if(m.kind==='ribbon') {
          m.mesh.rotation.z=Math.sin(timeSeconds*.43+m.phase)*.025;
          m.mesh.rotation.x=Math.sin(timeSeconds*.34+m.phase)*.018;
        } else {
          const t=timeSeconds*.16+m.phase;
          m.mesh.position.set(m.base[0]+Math.sin(t)*1.25,m.base[1]+Math.sin(t*1.7)*.22,m.base[2]+Math.cos(t)*.55);
          m.mesh.rotation.y=Math.sin(t)*.10;m.mesh.rotation.z=Math.sin(t*1.6)*.025;
        }
      }
      heroRoot.position.set(16+Math.sin(timeSeconds*.11)*1.6,1.25+Math.sin(timeSeconds*.32)*.22,10.5+Math.cos(timeSeconds*.11)*.6);
      heroRoot.rotation.y=.30+Math.sin(timeSeconds*.11)*.12;
      heroRoot.rotation.z=Math.sin(timeSeconds*.32)*.025;
      tailPivot.rotation.y=Math.sin(timeSeconds*.8)*.12;
      for(const {pivot,side} of fins)pivot.rotation.x=Math.sin(timeSeconds*.67+.4)*.085*side;
    }
  };
}
