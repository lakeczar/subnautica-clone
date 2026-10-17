// Original procedural art study. These are exterior sculptures, not game vehicles.
import { Mesh, VertexData, TransformNode } from '@babylonjs/core';

const P = {
  porcelain: '#e4e4cf', crown: '#f2e9cd', shade: '#c3cebf', pale: '#a6bab1',
  petrol: '#254e58', edge: '#173d49', steel: '#537982', steelLight: '#7b9997',
  ochre: '#d4933e', orange: '#bd7134', ochreLight: '#ebbb64',
  glass: '#174d60', glassMid: '#296a79', reflection: '#77b1b3',
  warm: '#edc37c', bright: '#ffe6aa', amber: '#c99a5d',
  char: '#354b49', cable: '#263e43', mint: '#b7d8c2'
};
const add = (a,b) => a.map((v,i) => v+b[i]);
const sub = (a,b) => a.map((v,i) => v-b[i]);
const mul = (a,s) => a.map(v => v*s);
const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit = a => mul(a,1/(Math.hypot(...a)||1));
const mean = a => mul(a.reduce((s,p) => add(s,p),[0,0,0]),1/a.length);

// Faces carry their own normals: the cel models retain deliberately chosen facets.
// Voxel volumes emit only exposed faces, rather than six faces for every solid cell.
class Batch {
  constructor(name,ctx,parent) {
    this.name=name; this.ctx=ctx; this.parent=parent;
    this.refined=ctx.refined===true;
    this.positions=[]; this.normals=[]; this.colors=[]; this.indices=[];
    this.palette=new Map();
  }
  face(points,hex,hint) {
    let n=unit(cross(sub(points[1],points[0]),sub(points[2],points[0])));
    if(hint && dot(n,hint)<0) { points=[...points].reverse(); n=mul(n,-1); }
    let c=this.palette.get(hex);
    if(!c) { c=this.ctx.C(hex); this.palette.set(hex,c); }
    const base=this.positions.length/3;
    for(const p of points) {
      this.positions.push(...p); this.normals.push(...n); this.colors.push(c.r,c.g,c.b,1);
    }
    // Babylon's default left-handed front face is clockwise.
    for(let i=1;i<points.length-1;i++)this.indices.push(base,base+i+1,base+i);
  }
  box(p,s,hex) {
    const [x,y,z]=p,[a,b,c]=s.map(v=>v/2);
    this.face([[x-a,y-b,z-c],[x-a,y+b,z-c],[x+a,y+b,z-c],[x+a,y-b,z-c]],hex,[0,0,-1]);
    this.face([[x-a,y-b,z+c],[x+a,y-b,z+c],[x+a,y+b,z+c],[x-a,y+b,z+c]],hex,[0,0,1]);
    this.face([[x-a,y-b,z-c],[x-a,y-b,z+c],[x-a,y+b,z+c],[x-a,y+b,z-c]],hex,[-1,0,0]);
    this.face([[x+a,y-b,z-c],[x+a,y+b,z-c],[x+a,y+b,z+c],[x+a,y-b,z+c]],hex,[1,0,0]);
    this.face([[x-a,y+b,z-c],[x-a,y+b,z+c],[x+a,y+b,z+c],[x+a,y+b,z-c]],hex,[0,1,0]);
    this.face([[x-a,y-b,z-c],[x+a,y-b,z-c],[x+a,y-b,z+c],[x-a,y-b,z+c]],hex,[0,-1,0]);
  }
  prism(poly,offset,hex,step=.22,precision=false) {
    const far=poly.map(p=>add(p,offset)),center=mean([...poly,...far]);
    const faces=[poly,far];
    for(let i=0;i<poly.length;i++) {
      const j=(i+1)%poly.length;faces.push([poly[i],far[i],far[j],poly[j]]);
    }
    if(this.ctx.variant!=='voxel'||(this.refined&&precision)) {
      for(const f of faces)this.face(f,hex,sub(mean(f),center));
      return;
    }
    if(this.refined)step*=.62;
    // Convex volume rasterisation gives fins and broken plates actual stair silhouettes.
    const planes=faces.map(f=>{
      let normal=unit(cross(sub(f[1],f[0]),sub(f[2],f[0])));
      if(dot(normal,sub(mean(f),center))<0)normal=mul(normal,-1);
      return {normal,p:f[0]};
    });
    const points=[...poly,...far],min=[0,1,2].map(a=>Math.min(...points.map(p=>p[a]))),max=[0,1,2].map(a=>Math.max(...points.map(p=>p[a])));
    this.voxels(min,max,step,p=>planes.every(q=>dot(q.normal,sub(p,q.p))<=step*.12),()=>hex);
  }
  plateXY(poly,z,depth,hex,step=.22) { this.prism(poly.map(([x,y])=>[x,y,z]),[0,0,depth],hex,step,this.refined); }
  loft(sections,hex,step=.28,colorAt) {
    const n=sections[0].points.length;
    if(this.ctx.variant==='voxel') {
      if(this.refined)step*=.62;
      const all=sections.flatMap(s=>s.points.map(([x,y])=>[x,y,s.z]));
      const min=[0,1,2].map(a=>Math.min(...all.map(p=>p[a]))),max=[0,1,2].map(a=>Math.max(...all.map(p=>p[a])));
      const inside=([x,y,z])=>{
        if(z<min[2]||z>max[2])return false;
        let k=0;while(k<sections.length-2 && z>sections[k+1].z)k++;
        const a=sections[k],b=sections[k+1],t=(z-a.z)/(b.z-a.z);
        const poly=a.points.map((p,i)=>[p[0]+(b.points[i][0]-p[0])*t,p[1]+(b.points[i][1]-p[1])*t]);
        return inside2([x,y],poly);
      };
      this.voxels(min,max,step,inside,(p,normal)=>colorAt?colorAt(p,normal):hex);
      return;
    }
    const capA=sections[0],capB=sections[sections.length-1];
    this.face(capA.points.map(([x,y])=>[x,y,capA.z]),hex,[0,0,-1]);
    this.face(capB.points.map(([x,y])=>[x,y,capB.z]),hex,[0,0,1]);
    for(let s=0;s<sections.length-1;s++)for(let i=0;i<n;i++) {
      const j=(i+1)%n,a=sections[s],b=sections[s+1];
      const f=[[...a.points[i],a.z],[...a.points[j],a.z],[...b.points[j],b.z],[...b.points[i],b.z]];
      const center=mean(f),c0=mean(a.points.map(p=>[...p,a.z])),c1=mean(b.points.map(p=>[...p,b.z]));
      const normal=sub(center,mul(add(c0,c1),.5));
      this.face(f,colorAt?colorAt(center,unit(normal)):hex,normal);
    }
  }
  voxels(min,max,step,inside,colorAt) {
    // Thin panels retain a real, small extrusion while their contour is pixel stepped.
    const dims=min.map((v,i)=>Math.max(1,Math.ceil((max[i]-v)/step)));
    const widths=min.map((v,i)=>max[i]-v<step?max[i]-v:step);
    const origin=min.map((v,i)=>(v+max[i])/2-dims[i]*widths[i]/2);
    const ids=new Set(),key=(x,y,z)=>(x*dims[1]+y)*dims[2]+z;
    const point=(x,y,z)=>[origin[0]+(x+.5)*widths[0],origin[1]+(y+.5)*widths[1],origin[2]+(z+.5)*widths[2]];
    for(let x=0;x<dims[0];x++)for(let y=0;y<dims[1];y++)for(let z=0;z<dims[2];z++)if(inside(point(x,y,z)))ids.add(key(x,y,z));
    const directions=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    for(let x=0;x<dims[0];x++)for(let y=0;y<dims[1];y++)for(let z=0;z<dims[2];z++) {
      if(!ids.has(key(x,y,z)))continue;
      const p=point(x,y,z),[a,b,c]=widths.map(w=>w/2),[px,py,pz]=p;
      for(const n of directions) {
        const q=[x+n[0],y+n[1],z+n[2]];
        if(q.every((v,i)=>v>=0&&v<dims[i])&&ids.has(key(...q)))continue;
        let f;
        if(n[0]) { const xx=px+n[0]*a;f=[[xx,py-b,pz-c],[xx,py+b,pz-c],[xx,py+b,pz+c],[xx,py-b,pz+c]]; }
        else if(n[1]) { const yy=py+n[1]*b;f=[[px-a,yy,pz-c],[px+a,yy,pz-c],[px+a,yy,pz+c],[px-a,yy,pz+c]]; }
        else { const zz=pz+n[2]*c;f=[[px-a,py-b,zz],[px+a,py-b,zz],[px+a,py+b,zz],[px-a,py+b,zz]]; }
        this.face(f,colorAt(p,n),n);
      }
    }
  }
  tube(points,radius,hex,step=.20,sides=7) {
    if(this.ctx.variant==='voxel'&&!(this.refined&&radius<=.075)) {
      if(this.refined) {
        step*=.62;
        const min=[0,1,2].map(a=>Math.min(...points.map(p=>p[a]))-radius),max=[0,1,2].map(a=>Math.max(...points.map(p=>p[a]))+radius);
        const segments=points.slice(0,-1).map((a,i)=>{const delta=sub(points[i+1],a);return {a,delta,length2:dot(delta,delta)};});
        this.voxels(min,max,step,p=>segments.some(s=>{
          const t=Math.max(0,Math.min(1,dot(sub(p,s.a),s.delta)/(s.length2||1))),d=sub(p,add(s.a,mul(s.delta,t)));
          return dot(d,d)<=radius*radius;
        }),()=>hex);
        return;
      }
      // The cubes touch along a staircase; no rounded tube is hidden under pixel paint.
      const used=new Set();
      for(let i=0;i<points.length-1;i++) {
        const a=points[i],b=points[i+1],n=Math.max(1,Math.ceil(Math.hypot(...sub(b,a))/step));
        for(let j=0;j<=n;j++) {
          const p=add(a,mul(sub(b,a),j/n)).map(v=>Math.round(v/step)*step),key=p.join(',');
          if(used.has(key))continue;used.add(key);
          this.box(p,[Math.max(radius*2,step),Math.max(radius*2,step),Math.max(radius*2,step)],hex);
        }
      }
      return;
    }
    // Small precision rails, handles and seams remain square engineered members.
    if(this.refined&&this.ctx.variant==='voxel')sides=4;
    const rings=points.map((p,i)=>{
      const tangent=unit(sub(points[Math.min(i+1,points.length-1)],points[Math.max(0,i-1)]));
      const u=unit(cross(tangent,Math.abs(tangent[1])>.85?[1,0,0]:[0,1,0])),v=unit(cross(tangent,u));
      return Array.from({length:sides},(_,j)=>add(p,add(mul(u,Math.cos(j/sides*Math.PI*2)*radius),mul(v,Math.sin(j/sides*Math.PI*2)*radius))));
    });
    this.face(rings[0],hex,sub(points[0],points[1]));
    this.face(rings[rings.length-1],hex,sub(points[points.length-1],points[points.length-2]));
    for(let i=0;i<rings.length-1;i++)for(let j=0;j<sides;j++) {
      const k=(j+1)%sides,f=[rings[i][j],rings[i][k],rings[i+1][k],rings[i+1][j]];
      this.face(f,hex,sub(mean(f),mul(add(points[i],points[i+1]),.5)));
    }
  }
  // Precision fittings are layered solid geometry in both styles, with real centre holes.
  ring(center,u,v,outer,inner,depth,hex,sides=10) {
    const normal=unit(cross(u,v)),back=mul(normal,-depth);
    const points=r=>Array.from({length:sides},(_,i)=>add(center,add(mul(u,Math.cos(i/sides*Math.PI*2)*r),mul(v,Math.sin(i/sides*Math.PI*2)*r))));
    const a=points(outer),b=points(inner),c=a.map(p=>add(p,back)),d=b.map(p=>add(p,back));
    for(let i=0;i<sides;i++) {
      const j=(i+1)%sides,radial=sub(mul(add(a[i],a[j]),.5),center);
      this.face([a[i],a[j],b[j],b[i]],hex,normal);
      this.face([c[i],d[i],d[j],c[j]],hex,mul(normal,-1));
      this.face([a[i],c[i],c[j],a[j]],hex,radial);
      this.face([b[i],b[j],d[j],d[i]],hex,mul(radial,-1));
    }
  }
  disc(center,u,v,radius,depth,hex,sides=10) {
    const poly=Array.from({length:sides},(_,i)=>add(center,add(mul(u,Math.cos(i/sides*Math.PI*2)*radius),mul(v,Math.sin(i/sides*Math.PI*2)*radius))));
    this.prism(poly,mul(unit(cross(u,v)),-depth),hex,.12,true);
  }
  finish(outline=false) {
    if(!this.positions.length)return null;
    const mesh=new Mesh(this.name,this.ctx.scene),data=new VertexData();
    data.positions=this.positions;data.normals=this.normals;data.indices=this.indices;data.colors=this.colors;
    data.applyToMesh(mesh);mesh.parent=this.parent;mesh.useVertexColors=true;
    mesh.material=this.ctx.variant==='cel'?this.ctx.toon:this.ctx.voxelMaterial;
    mesh.isPickable=false;
    if(outline&&this.ctx.variant==='cel') {
      mesh.renderOutline=true;mesh.outlineColor=this.ctx.C(P.edge);mesh.outlineWidth=.018;
    }
    return mesh;
  }
}

function inside2([x,y],poly) {
  let sign=0;
  for(let i=0;i<poly.length;i++) {
    const a=poly[i],b=poly[(i+1)%poly.length],c=(b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]);
    if(Math.abs(c)<1e-8)continue;
    if(sign&&Math.sign(c)!==sign)return false;sign=Math.sign(c);
  }
  return true;
}

function chamferRect(x,y,w,h,c=.16) {
  const l=x-w/2,r=x+w/2,b=y-h/2,t=y+h/2;
  return [[l+c,b],[r-c,b],[r,b+c],[r,t-c],[r-c,t],[l+c,t],[l,t-c],[l,b+c]];
}
const translated=(poly,x,y)=>poly.map(p=>[p[0]+x,p[1]+y]);

// Position a fitting on the authored upper surface, rather than an unrelated flat plane.
function loftUpperY(sections,x,z) {
  let k=0;while(k<sections.length-2&&z>sections[k+1].z)k++;
  const a=sections[k],b=sections[k+1],t=Math.max(0,Math.min(1,(z-a.z)/(b.z-a.z)));
  const poly=a.points.map((p,i)=>[p[0]+(b.points[i][0]-p[0])*t,p[1]+(b.points[i][1]-p[1])*t]);
  let y=-Infinity;
  for(let i=0;i<poly.length;i++) {
    const p=poly[i],q=poly[(i+1)%poly.length];
    if(Math.abs(q[0]-p[0])<1e-8||x<Math.min(p[0],q[0])-1e-7||x>Math.max(p[0],q[0])+1e-7)continue;
    y=Math.max(y,p[1]+(q[1]-p[1])*(x-p[0])/(q[0]-p[0]));
  }
  return y;
}

function refinePod(glazing,detail) {
  const frontU=[1,0,0],frontV=[0,-1,0],upU=[1,0,0],upV=[0,0,-1];
  // Shallow front access covers, captive fasteners and real hinges give the blank cheeks scale.
  for(const side of [-1,1]) {
    detail.plateXY(chamferRect(side*2.04,-1.39,1.13,1.10,.13),-3.11,-.13,P.pale,.14);
    detail.plateXY(chamferRect(side*2.04,-1.39,.99,.94,.10),-3.25,-.035,P.shade,.12);
    detail.box([side*2.04,-1.76,-3.31],[.70,.055,.04],P.ochre);
    for(const dx of [-.36,.36])for(const y of [-1.07,-1.70]) {
      detail.disc([side*2.04+dx,y,-3.31],frontU,frontV,.046,.025,P.petrol,6);
    }
    for(const z of [-1.13,.91]) {
      detail.box([side*3.74,-1.97,z],[.13,.20,.34],P.petrol);
      detail.box([side*3.83,-1.97,z],[.08,.09,.17],P.ochreLight);
    }
  }
  for(const y of [-.90,-1.76]) {
    detail.box([-.83,y,-3.55],[.22,.29,.11],P.petrol);
    detail.box([-.83,y,-3.63],[.13,.19,.06],P.steelLight);
  }

  // Readable hatch control box: analog pressure gauge, status lamps, guarded manual release.
  detail.plateXY(chamferRect(1.30,-1.05,.54,.93,.07),-3.16,-.19,P.petrol,.10);
  detail.plateXY(chamferRect(1.30,-1.05,.42,.81,.04),-3.37,-.025,P.pale,.08);
  detail.disc([1.30,-.83,-3.421],frontU,frontV,.143,.025,P.mint,12);
  detail.ring([1.30,-.83,-3.45],frontU,frontV,.181,.136,.065,P.edge,12);
  detail.plateXY([[1.285,-.86],[1.315,-.86],[1.37,-.75]],-3.456,-.012,P.ochre,.05);
  for(let i=0;i<3;i++)glazing.box([1.18+i*.12,-1.12,-3.425],[.068,.065,.035],i===2?P.ochreLight:P.mint);
  detail.box([1.30,-1.30,-3.43],[.28,.08,.055],P.petrol);
  detail.box([1.30,-1.30,-3.49],[.20,.07,.075],P.ochre);
  glazing.box([-.91,-.43,-3.48],[.055,.10,.045],P.mint);

  // Seams interrupt the broad pressure panels at deliberate structural intervals.
  for(const z of [-.77,.57]) {
    detail.tube([[-2.42,2.55,z],[2.42,2.55,z]],.016,P.steel,.12,4);
  }
  for(const z of [-2.08,1.72])for(const side of [-1,1]) {
    detail.box([side*3.82,-.58,z],[.16,.38,.42],P.steelLight);
    detail.box([side*3.93,-.58,z],[.075,.19,.21],P.petrol);
    detail.box([side*2.53,2.60,z],[.35,.12,.42],P.ochre);
    detail.disc([side*2.53,2.685,z],upU,upV,.063,.03,P.petrol,8);
  }
  // Starboard service coupling and a four-blade vent stay distinct from the living window.
  const sideU=[0,0,1],sideV=[0,-1,0],socket=[3.92,-1.13,1.37];
  detail.disc([3.92,-1.13,1.37],sideU,sideV,.161,.05,P.edge,12);
  detail.ring([3.96,-1.13,1.37],sideU,sideV,.227,.159,.075,P.steelLight,12);
  detail.disc(add(socket,[.06,0,0]),sideU,sideV,.086,.035,P.ochre,8);
  detail.box([4.028,-1.13,1.37],[.025,.04,.10],P.petrol);
  for(const z of [-.63,.87])for(const y of [-1.03,-1.66])detail.disc([3.89,y,z],sideU,sideV,.042,.025,P.petrol,6);
  detail.tube([[3.95,-2.12,-1.34],[3.95,-2.12,.99],[3.95,-1.42,1.37]],.045,P.cable,.16,5);
  for(const z of [-.94,.10,.87])detail.box([3.96,-2.11,z],[.15,.16,.11],P.steelLight);
  detail.ring([.55,2.963,.72],upU,upV,.188,.124,.065,P.steelLight,12);
  detail.disc([.55,2.95,.72],upU,upV,.118,.04,P.petrol,12);
  detail.box([.55,2.97,.72],[.14,.035,.055],P.ochreLight);

  // Grip strips belong to the walking surface, and do not obstruct the protected doorway.
  for(const z of [-3.61,-3.97,-4.33,-4.69])detail.box([0,-2.493,z],[2.32,.025,.065],P.petrol);
  detail.box([0,-2.471,-3.43],[.46,.025,.12],P.ochreLight);
  // A localized front-visible roof scar joins the existing rear peeled shield.
  detail.tube([[-2.43,2.57,-1.13],[-1.95,2.57,-.88],[-2.09,2.57,-.54],[-1.72,2.57,-.32]],.021,P.char,.13,4);
  for(const z of [.65,1.87])detail.disc([-2.49,2.64,z],upU,upV,.055,.03,P.ochreLight,8);
}

function refineScout(glazing,detail,sections,cabin) {
  const upU=[1,0,0],upV=[0,0,-1],frontU=[1,0,0],frontV=[0,-1,0];
  const deck=([x,z],lift=.10)=>[x,loftUpperY(sections,x,z)+lift,z];
  for(const side of [-1,1]) {
    // Raised, gasketed shoulder covers follow the existing swept pressure surface.
    const outline=[[1.38,-.59],[1.82,-.20],[2.35,.70],[1.72,1.24],[1.47,.91]].map(([x,z])=>[side*x,z]);
    const center=[outline.reduce((s,p)=>s+p[0],0)/outline.length,outline.reduce((s,p)=>s+p[1],0)/outline.length];
    const inset=outline.map(p=>p.map((v,i)=>center[i]+(v-center[i])*.88));
    detail.prism(outline.map(p=>deck(p,.065)),[0,.048,0],P.steel,.12,true);
    detail.prism(inset.map(p=>deck(p,.118)),[0,.032,0],P.porcelain,.12,true);
    for(const p of [inset[0],inset[2],inset[3]])detail.disc(deck(p,.167),upU,upV,.045,.025,P.petrol,6);
    const handle=deck([side*1.70,.34],.185);
    detail.box(handle,[.27,.07,.18],P.petrol);
    detail.box(add(handle,[0,.03,0]),[.15,.055,.08],P.ochreLight);

    // Low vent banks aft of the pilot, each with a recessed well and individual louvres.
    const bank=deck([side*1.03,1.60],.10);
    detail.box(bank,[.65,.09,.72],P.ochre);
    detail.box(add(bank,[0,.055,0]),[.54,.045,.62],P.edge);
    for(let i=0;i<5;i++) {
      const z=1.35+i*.117,x=side*1.03,y=bank[1]+.10;
      detail.prism([[x-.25,y,z-.025],[x+.25,y,z-.025],[x+.25,y+.042,z+.038],[x-.25,y+.042,z+.038]],[0,-.025,0],P.steelLight,.08,true);
    }
    // Collared trim-thruster openings and small skid clamps remain useful engineering detail.
    detail.ring([side*2.35,.568,.68],upU,upV,.335,.236,.060,P.steelLight,12);
    for(const z of [-1.00,.79]) {
      const x=side*(z<0?1.14:1.28),y=z<0?-.90:-.86;
      detail.box([x,y,z],[.29,.23,.14],P.steel);
      detail.box([x,y-.145,z],[.20,.055,.09],P.ochre);
    }
  }

  // Two authored glint planes sit on the right upper canopy facet, preserving most dark glass.
  const canopyPoint=(z,f)=>{
    let k=0;while(k<cabin.length-2&&z>cabin[k+1].z)k++;
    const a=cabin[k],b=cabin[k+1],t=(z-a.z)/(b.z-a.z);
    const p=a.points[4].map((v,i)=>v+(b.points[4][i]-v)*t),q=a.points[3].map((v,i)=>v+(b.points[3][i]-v)*t);
    return [p[0]+(q[0]-p[0])*f+.045,p[1]+(q[1]-p[1])*f+.045,z];
  };
  const glint=(za,zb,fa,fb,hex)=>detail.prism([canopyPoint(za,fa),canopyPoint(za,fb),canopyPoint(zb,fb),canopyPoint(zb,fa)],[.006,.006,0],hex,.10,true);
  glint(-1.48,-.43,.16,.30,'#bad7ce');
  glint(-1.38,-.72,.64,.70,P.reflection);
  // A visible sealed-hatch edge and manual release near the rear canopy pillar.
  detail.tube([[-.28,.99,.68],[.18,1.12,.68],[.62,.99,.68]],.020,P.steelLight,.12,4);
  detail.box([.87,.85,.48],[.18,.12,.30],P.petrol);
  detail.box([.97,.85,.48],[.065,.07,.20],P.ochreLight);

  // The existing sensor gets a pressure bezel, with a dark lens and one small reflection.
  detail.ring([-.70,.48,-2.838],frontU,frontV,.167,.106,.055,P.steelLight,12);
  glazing.disc([-.70,.48,-2.827],frontU,frontV,.103,.03,P.glassMid,12);
  glazing.disc([-.73,.515,-2.845],frontU,frontV,.034,.008,P.bright,8);
  // Quick-disconnect service points feed the one stern drive; no extra engine silhouettes.
  detail.ring([-.78,.986,2.70],upU,upV,.142,.088,.055,P.petrol,10);
  detail.disc([-.78,.975,2.70],upU,upV,.083,.03,P.ochreLight,10);
  detail.tube([[-.78,.94,2.62],[-1.12,.93,2.30],[-1.13,.59,1.92]],.036,P.cable,.12,5);
  for(const x of [-1.42,1.42]) {
    detail.box([x,.30,3.133],[.13,.58,.065],P.ochre);
    detail.disc([x,.31,3.177],frontU,[0,1,0],.046,.025,P.pale,8);
  }
  glazing.box([.45,.667,.56],[.12,.022,.045],P.mint);
}

function buildPod(ctx) {
  const root=new TransformNode('vehicle-refuge-keelhouse',ctx.scene);
  root.position=ctx.V(-13,-5,-1);root.rotation.y=-.16;
  const hull=new Batch('refuge-pressure-hull',ctx,root),frame=new Batch('refuge-cradle-and-pressure-frames',ctx,root);
  const glazing=new Batch('refuge-warm-glazing',ctx,root),detail=new Batch('refuge-hatch-service-and-damage',ctx,root);
  const contour=[[-3.65,-1.55],[-2.75,-2.5],[2.75,-2.5],[3.65,-1.55],[3.65,.85],[2.55,2.5],[-2.55,2.5],[-3.65,.85]];
  const scale=(sx,sy,dy=0)=>contour.map(([x,y])=>[x*sx,y*sy+dy]);
  const sections=[{z:-3.0,points:scale(.93,.96)},{z:-2.0,points:scale(1,1)},
    {z:1.7,points:scale(1,1)},{z:2.8,points:scale(.83,.88,.04)}];
  hull.loft(sections,P.porcelain,.32,(p,n)=>{
    if(n[1]<-.55||p[1]<-1.95)return P.steel;
    if(n[1]>.45)return p[2]>1.65?P.shade:P.crown;
    if(n[0]<-.45&&p[2]>1.4)return P.shade;
    return P.porcelain;
  });

  // Load-bearing transverse hoops and two continuous landing rails.
  for(const z of [-2.08,1.72]) {
    const path=contour.map(([x,y])=>[x*1.035,y*1.035,z]);path.push(path[0]);
    frame.tube(path,.145,P.petrol,.25,6);
  }
  const front=scale(.95,.98).map(([x,y])=>[x,y,-3.1]);front.push(front[0]);
  frame.tube(front,.14,P.petrol,.24,6);
  for(const side of [-1,1]) {
    frame.box([side*3.85,-2.65,.1],[.46,.45,7.0],P.petrol);
    frame.box([side*3.85,-2.35,-.25],[.5,.13,4.9],P.ochre);
  }

  // Landing feet meet the actual shared seabed, including the pod's yaw.
  const floorAt=(x,z)=>{
    const a=root.rotation.y,wx=-13+x*Math.cos(a)+z*Math.sin(a),wz=-1-x*Math.sin(a)+z*Math.cos(a);
    return ctx.height(wx,wz)+5+.14;
  };
  for(const side of [-1,1])for(const z of [-2.15,2.15]) {
    const x=side*4.35,bottom=floorAt(x,z);
    frame.tube([[side*3.55,-2.5,z],[side*4.15,-3.65,z],[x,bottom+.35,z]],.20,P.petrol,.28,6);
    frame.box([side*4.12,-3.7,z],[.65,.7,.65],P.ochre);
    frame.box([x,bottom,z],[1.4,.28,1.55],P.steel);
    detail.box([x,bottom+.18,z],[.85,.12,1.05],P.ochre);
  }

  // A protected entrance sits below a single divided warm window, keeping the face calm.
  const window=[[-2.65,.13],[2.65,.13],[2.65,1.0],[1.95,1.75],[-1.95,1.75],[-2.65,1.0]];
  glazing.plateXY(window,-3.19,-.13,P.edge,.22);
  glazing.plateXY([[-2.42,.29],[-1.02,.29],[-1.02,1.52],[-1.83,1.52],[-2.42,.9]],-3.34,-.055,P.amber,.20);
  glazing.plateXY([[-.81,.29],[.81,.29],[.81,1.52],[-.81,1.52]],-3.34,-.055,P.warm,.20);
  glazing.plateXY([[1.02,.29],[2.42,.29],[2.42,.9],[1.83,1.52],[1.02,1.52]],-3.34,-.055,P.warm,.20);
  glazing.plateXY([[-2.23,.97],[-1.1,.97],[-1.1,1.15],[-2.06,1.15]],-3.405,-.018,P.bright,.18);
  glazing.box([0,1.28,-3.413],[1.28,.12,.025],P.bright);
  glazing.box([1.63,.47,-3.413],[1.04,.10,.025],P.bright);
  detail.box([0,.12,-3.38],[5.34,.14,.14],P.ochre);

  detail.plateXY(chamferRect(0,-1.22,1.94,2.36,.22),-3.23,-.15,P.edge,.20);
  detail.plateXY(chamferRect(0,-1.22,1.65,2.12,.17),-3.40,-.10,P.shade,.18);
  detail.box([.62,-1.15,-3.55],[.25,.51,.12],P.petrol);
  detail.box([.64,-1.12,-3.66],[.48,.13,.14],P.ochreLight);
  glazing.plateXY(chamferRect(0,-.58,.82,.43,.1),-3.52,-.045,P.glass,.14);
  glazing.box([-.11,-.49,-3.58],[.51,.055,.025],P.reflection);
  detail.box([-.61,-1.98,-3.53],[.11,.29,.08],P.ochre);
  detail.box([-.39,-1.98,-3.53],[.11,.29,.08],P.ochre);
  for(const x of [-2.93,2.93]) {
    detail.box([x,-.72,-3.16],[.25,.76,.22],P.petrol);
    glazing.box([x,-.65,-3.30],[.12,.43,.075],P.bright);
  }

  // Small side glazing and service access, on the starboard flank seen by the pod camera.
  detail.box([3.72,.12,-.05],[.16,1.35,2.20],P.petrol);
  glazing.box([3.825,.27,-.1],[.075,.66,1.72],P.warm);
  glazing.box([3.87,.44,-.1],[.025,.10,1.45],P.bright);
  detail.box([3.88,.27,-.1],[.07,.75,.13],P.petrol);
  detail.box([3.73,-1.35,.18],[.14,.84,1.92],P.shade);
  detail.box([3.83,-1.68,.18],[.06,.12,1.67],P.ochre);
  for(let i=0;i<4;i++)detail.box([3.83,-1.25,-.45+i*.38],[.07,.37,.12],P.petrol);
  detail.tube([[3.92,-1.85,1.3],[3.92,-.6,1.3],[3.92,-.6,1.9]],.065,P.cable,.19,5);

  // A landing porch and rails lead straight to the hatch. No ornament obscures it.
  frame.box([0,-2.74,-4.15],[3.05,.28,2.42],P.petrol);
  frame.box([0,-2.55,-4.15],[2.65,.09,2.18],P.steelLight);
  detail.box([0,-2.49,-5.13],[2.68,.08,.20],P.ochreLight);
  for(const x of [-1.45,1.45]) {
    frame.tube([[x,-2.63,-5.19],[x,-1.5,-5.19],[x,-1.5,-3.45]],.065,P.pale,.18,5);
  }
  const ladderFloor=floorAt(0,-5.2)+.3;
  for(const x of [-.57,.57])frame.tube([[x,-2.64,-5.30],[x,ladderFloor,-5.63]],.085,P.steelLight,.22,5);
  for(let y=-3.0;y>ladderFloor;y-=.43)frame.box([0,y,-5.3-(y+2.64)/(ladderFloor+2.64)*.33],[1.2,.105,.14],P.ochre);

  // An intact pressure cabin under a peeled, scorched rear roof shield.
  detail.box([.55,2.61,.72],[2.05,.28,1.72],P.ochre);
  detail.box([.55,2.80,.72],[1.47,.12,1.18],P.petrol);
  detail.box([.55,2.88,.72],[1.06,.07,.77],P.shade);
  if(ctx.variant==='cel') {
    detail.prism([[-3.48,1.5,.52],[-2.48,2.57,.52],[-2.48,2.57,2.0],[-3.38,1.62,2.25]],[-.07,.055,0],P.char);
    detail.prism([[-3.46,1.72,1.10],[-2.88,2.63,1.1],[-3.04,2.94,2.48],[-3.9,2.34,2.26]],[-.09,.08,0],P.shade);
    detail.prism([[-3.9,2.34,2.02],[-3.38,2.71,2.15],[-3.04,2.94,2.48],[-3.9,2.34,2.26]],[-.03,.025,0],P.orange);
  } else if(ctx.refined) {
    for(let i=0;i<9;i++)detail.box([-3.38+i*.10,1.68+i*.10,1.35],[.14,.14,1.7],P.char);
    for(let i=0;i<9;i++)detail.box([-3.77+i*.09,2.32+i*.07,1.86],[.14,.13,.98-i*.04],i<3?P.orange:P.shade);
  } else {
    for(let i=0;i<5;i++)detail.box([-3.38+i*.2,1.68+i*.2,1.35],[.24,.24,1.7],P.char);
    for(let i=0;i<5;i++)detail.box([-3.77+i*.18,2.32+i*.14,1.86],[.23,.20,.98-i*.08],i<2?P.orange:P.shade);
  }
  for(const z of [.8,1.38,1.92])detail.tube([[-3.42,1.60,z],[-2.52,2.53,z]],.055,P.steelLight,.17,5);
  detail.tube([[-3.45,1.57,2.16],[-3.78,.85,2.4],[-3.62,.21,2.50]],.055,P.cable,.17,5);
  detail.tube([[2.14,2.25,1.45],[2.14,3.65,1.45]],.065,P.petrol,.18,6);
  detail.box([2.14,3.68,1.45],[.34,.26,.34],P.edge);
  glazing.box([2.14,3.85,1.45],[.24,.14,.24],P.warm);
  if(ctx.refined)refinePod(glazing,detail);
  hull.finish(true);frame.finish(false);glazing.finish(false);detail.finish(false);
  root.metadata={asset:'original-keelhouse-refuge',purpose:'Warm, intact shelter beneath a damaged replaceable shield',scale:'metres',origin:'pressure-cabin center'};
  return root;
}

function scoutProfile(w,lower,top) {
  return [[-w*.73,lower], [w*.73,lower], [w,lower+(top-lower)*.28], [w,lower+(top-lower)*.68],
    [w*.62,top],[-w*.62,top],[-w,lower+(top-lower)*.68],[-w,lower+(top-lower)*.28]];
}

function buildScout(ctx) {
  const root=new TransformNode('vehicle-cleft-scout',ctx.scene);
  root.position=ctx.V(9,-3,-4);root.rotation.y=-.5;
  const hull=new Batch('scout-swept-pressure-hull',ctx,root),frame=new Batch('scout-keel-and-drive-frame',ctx,root);
  const glazing=new Batch('scout-faceted-canopy',ctx,root),detail=new Batch('scout-sensors-controls-and-panels',ctx,root);
  const sections=[{z:-4.0,points:scoutProfile(.36,-.28,.03)},{z:-3.25,points:scoutProfile(1.20,-.48,.32)},
    {z:-1.05,points:scoutProfile(1.91,-.70,.57)},{z:.9,points:scoutProfile(2.97,-.65,.40)},
    {z:1.72,points:scoutProfile(2.53,-.55,.31)},{z:2.65,points:scoutProfile(1.15,-.43,.22)}];
  hull.loft(sections,P.porcelain,.235,(p,n)=>{
    if(p[2]<-3.25)return P.ochre;
    if(n[1]<-.2||p[1]<-.37)return P.petrol;
    if(Math.abs(p[0])>2.05)return P.ochre;
    return n[1]>.45?P.porcelain:P.shade;
  });

  // A low off-center pressure canopy, enclosed in structural brows, not a glass sphere.
  const cabin=[{z:-2.98,points:translated(scoutProfile(.38,.32,.82),.18,0)},
    {z:-1.64,points:translated(scoutProfile(1.02,.44,1.70),.18,0)},
    {z:-.12,points:translated(scoutProfile(.95,.42,1.59),.18,0)},
    {z:.93,points:translated(scoutProfile(.56,.30,.86),.18,0)}];
  glazing.loft(cabin,P.glass,.20,(p,n)=>n[1]>.55?P.glassMid:P.glass);
  // Reflection shapes are geometry and occupy a restrained part of the glass.
  glazing.prism([[.45,.92,-2.54],[.77,1.28,-2.16],[1.13,1.30,-.45],[1.13,1.12,-.45]],[.018,.014,-.006],P.reflection,.18);
  glazing.prism([[-.33,1.73,-1.58],[.48,1.73,-1.58],[.51,1.68,-1.05],[-.35,1.68,-1.05]],[0,.012,0],P.steelLight,.18);
  for(const side of [-1,1]) {
    const x=side*.99+.18;
    frame.tube([[side*.4+.18,.54,-2.96],[x,.78,-1.64],[side*.92+.18,.75,-.12],[side*.57+.18,.52,.94]],.075,P.petrol,.19,6);
  }
  frame.tube([[-.44,1.72,-1.64],[.81,1.72,-1.64]],.06,P.porcelain,.18,5);
  frame.tube([[.18,.84,-2.98],[.18,1.76,-1.64],[.18,1.64,-.12]],.055,P.petrol,.18,5);
  glazing.box([.18,.54,-2.94],[.46,.07,.06],P.warm);

  // Distinctive open stern: one wide rectangular pressure duct with visible internals.
  // The dark throat remains empty around its central hub and guide vanes.
  frame.box([0,-.27,2.71],[3.28,.16,.78],P.petrol);
  frame.box([0,.78,2.71],[3.28,.16,.78],P.petrol);
  for(const side of [-1,1])frame.box([side*1.56,.25,2.71],[.16,1.07,.78],P.petrol);
  detail.box([0,.25,2.39],[2.97,.87,.10],P.edge);
  detail.box([0,.25,2.46],[.47,.47,.11],P.steel);
  for(const side of [-1,1])for(const y of [-.05,.57]) {
    detail.tube([[side*.18,.25,2.47],[side*1.35,y,2.49]],.045,P.steelLight,.17,4);
  }
  for(const x of [-.9,-.45,.45,.9])detail.box([x,.26,2.53],[.055,.70,.15],P.steel);
  glazing.box([0,.25,2.55],[.20,.20,.12],P.mint);
  detail.box([0,.9,2.70],[2.55,.12,.62],P.ochre);

  // Swept control surfaces, skids and a single dorsal stabilizer establish maneuverability.
  for(const side of [-1,1]) {
    const fin=[[side*1.68,-.24,.36],[side*3.32,-.12,1.30],[side*3.13,-.13,2.07],[side*1.95,-.27,1.64]];
    hull.prism(fin,[0,-.11,0],P.ochre,.235);
    frame.tube([[side*.73,-.66,-2.6],[side*1.14,-.93,-.95],[side*1.35,-.88,1.74]],.105,P.petrol,.235,6);
    detail.box([side*2.35,.43,.68],[.69,.10,.69],P.petrol);
    // Vertical trim thruster: octagonal recess, crossed interior, no separate side engine.
    const ring=Array.from({length:8},(_,i)=>[side*2.35+Math.cos(i/8*Math.PI*2)*.28,.50,.68+Math.sin(i/8*Math.PI*2)*.28]);
    detail.prism(ring,[0,.035,0],P.edge,.15);
    detail.box([side*2.35,.56,.68],[.37,.035,.07],P.steelLight);
    detail.box([side*2.35,.56,.68],[.07,.035,.37],P.steelLight);
    // External panel seam and three sparse grip ridges.
    detail.tube([[side*1.27,.42,-2.1],[side*1.63,.48,-1.0],[side*2.49,.43,.48]],.035,P.steel,.19,4);
    for(let i=0;i<3;i++)detail.box([side*(1.63+i*.17),.53,-.25+i*.23],[.32,.065,.085],P.petrol);
  }
  hull.prism([[0,.44,1.2],[0,1.36,2.23],[0,1.28,3.15],[0,.68,2.73]],[.16,0,0],P.ochre,.21);
  detail.prism([[.17,.71,1.72],[.17,1.18,2.28],[.17,1.15,2.70],[.17,.78,2.43]],[.03,0,0],P.petrol,.18);

  // A brow lamp, bow sensor, tow point and accessible equipment covers add human scale.
  detail.box([0,.15,-3.83],[.40,.22,.24],P.petrol);
  glazing.box([0,.17,-3.98],[.25,.10,.07],P.bright);
  detail.box([-.70,.47,-2.60],[.27,.28,.36],P.petrol);
  glazing.box([-.70,.48,-2.81],[.15,.15,.065],P.reflection);
  detail.tube([[-.20,-.20,-4.03],[-.20,-.46,-4.05],[.20,-.46,-4.05],[.20,-.20,-4.03]],.045,P.steelLight,.17,5);
  detail.box([-.48,.54,.70],[.58,.12,.47],P.ochre);
  detail.box([.48,.54,.70],[.58,.12,.47],P.shade);
  detail.tube([[-.73,.59,.83],[-1.09,.60,1.30],[-.92,.58,1.78]],.045,P.cable,.17,5);
  for(let i=0;i<3;i++)detail.box([.45,.63,.56+i*.12],[.32,.045,.045],P.petrol);
  glazing.box([2.85,.10,.89],[.12,.12,.30],P.mint);
  glazing.box([-2.85,.10,.89],[.12,.12,.30],P.ochreLight);
  if(ctx.refined)refineScout(glazing,detail,sections,cabin);
  hull.finish(true);frame.finish(false);glazing.finish(false);detail.finish(false);
  root.metadata={asset:'original-cleft-scout',purpose:'One-person agile survey craft; swept hull and one framed stern drive',scale:'metres',origin:'central keel'};
  return root;
}

export function createVehicles(ctx) {
  buildPod(ctx);
  const scout=buildScout(ctx),baseY=scout.position.y;
  return { update(timeSeconds) {
    scout.position.y=baseY+Math.sin(timeSeconds*.75)*.105;
    scout.rotation.z=Math.sin(timeSeconds*.5)*.010;
  } };
}
