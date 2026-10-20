import { CREEL_GEOMETRY as C, HEARTHLINE_KEEL as K, SCOUT_GEOMETRY as S, SPINDLE_GEOMETRY as P } from "../content/encounterGeometry.js";
import type { ContactBox, LoftSection, Point3 } from "../content/encounterGeometry.js";
import type { HullId } from "../content/registry.js";
import type { Vec3 } from "./types.js";
import { CARRIER_LAYOUT, carrierStructure } from "./carrier.js";

export type Triangle = readonly [Vec3, Vec3, Vec3];
export const vec = (p: Point3): Vec3 => ({ x: p[0], y: p[1], z: p[2] });
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
export const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const finite = (a: Vec3): boolean => [a.x, a.y, a.z].every(Number.isFinite);
export const unit = (a: Vec3): Vec3 => scale(a, 1 / Math.max(1e-12, length(a)));

/** Matches Babylon's (pitch, -semanticYaw, roll), including its rotation order. */
export function encounterRotation(p: Vec3, yaw: number, pitch = 0, roll = 0): Vec3 {
  const cr = Math.cos(roll), sr = Math.sin(roll), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const x = p.x * cr - p.y * sr, ry = p.x * sr + p.y * cr;
  const y = ry * cp - p.z * sp, z = ry * sp + p.z * cp;
  return { x: x * Math.cos(yaw) - z * Math.sin(yaw), y, z: x * Math.sin(yaw) + z * Math.cos(yaw) };
}
export function inverseRotation(p: Vec3, yaw: number, pitch = 0, roll = 0): Vec3 {
  const x = p.x * Math.cos(yaw) + p.z * Math.sin(yaw), z = -p.x * Math.sin(yaw) + p.z * Math.cos(yaw);
  const y = p.y * Math.cos(pitch) + z * Math.sin(pitch), rz = -p.y * Math.sin(pitch) + z * Math.cos(pitch);
  return { x: x * Math.cos(roll) + y * Math.sin(roll), y: -x * Math.sin(roll) + y * Math.cos(roll), z: rz };
}
function face(points: readonly Point3[]): Triangle[] {
  return points.slice(1, -1).map((_, i) => [vec(points[0]!), vec(points[i + 1]!), vec(points[i + 2]!)]);
}
function loft(sections: readonly LoftSection[]): Triangle[] {
  const rings = sections.map(s => [[-s.w * .68, s.high, s.z], [s.w * .68, s.high, s.z],
    [s.w, s.high * .3 + s.low * .7, s.z], [s.w * .7, s.low, s.z], [-s.w * .7, s.low, s.z],
    [-s.w, s.high * .3 + s.low * .7, s.z]] as Point3[]);
  const result = [...face([...rings[0]!].reverse()), ...face(rings.at(-1)!)];
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < 6; j++)
    result.push(...face([rings[i]![j]!, rings[i]![(j + 1) % 6]!, rings[i + 1]![(j + 1) % 6]!, rings[i + 1]![j]!]));
  return result;
}
export function box(b: ContactBox): Triangle[] {
  const [x, y, z] = b.center, [w, h, d] = b.size;
  const p = (a: number, c: number, e: number): Point3 => [x + a * w / 2, y + c * h / 2, z + e * d / 2];
  return [[p(-1,-1,-1),p(1,-1,-1),p(1,1,-1),p(-1,1,-1)], [p(-1,-1,1),p(-1,1,1),p(1,1,1),p(1,-1,1)],
    [p(-1,-1,-1),p(-1,1,-1),p(-1,1,1),p(-1,-1,1)], [p(1,-1,-1),p(1,-1,1),p(1,1,1),p(1,1,-1)],
    [p(-1,1,-1),p(1,1,-1),p(1,1,1),p(-1,1,1)], [p(-1,-1,-1),p(-1,-1,1),p(1,-1,1),p(1,-1,-1)]]
    .flatMap(points => face(points));
}
function ellipsoid(center: Point3, radius: Point3, segments: number): Triangle[] {
  // Same rings/triangles as the authored Babylon sphere (diameter 2).
  const rings: Vec3[][] = [], result: Triangle[] = [], count=segments+2;
  for(let i=0;i<=count;i++) {
    const theta=i/count*Math.PI, ring:Vec3[]=[];
    for(let j=0;j<=2*count;j++) {const phi=j/(2*count)*Math.PI*2;
      ring.push({x:center[0]+Math.sin(theta)*Math.cos(phi)*radius[0],y:center[1]+Math.cos(theta)*radius[1],z:center[2]-Math.sin(theta)*Math.sin(phi)*radius[2]});}
    rings.push(ring);
  }
  for(let i=0;i<count;i++)for(let j=0;j<2*count;j++) {
    if(i>0)result.push([rings[i]![j]!,rings[i]![j+1]!,rings[i+1]![j]!]);
    if(i<count-1)result.push([rings[i+1]![j]!,rings[i]![j+1]!,rings[i+1]![j+1]!]);
  }
  return result;
}
/** Closed main primitives retain separate inside tests; canopy panes are open faces. */
function hullComponents(hull: HullId): Triangle[][] {
  if (hull === "hearthline") return [box({center:[0,9,0],size:[CARRIER_LAYOUT.deck.max.x-CARRIER_LAYOUT.deck.min.x+.6,.35,26]}),
    box({center:[0,6.5,12],size:[CARRIER_LAYOUT.deck.max.x-CARRIER_LAYOUT.deck.min.x,5,.3]}),
    ...[-1, 1].flatMap(side => [
    box({ center: [side * K.offsetX, K.centerY, 0], size: K.size }),
    box({ center: [side * K.offsetX, K.capY, 0], size: K.capSize })])];
  if (hull === "creel") return [box(C.body), box(C.cabin), box(C.window), box(C.mount), ...C.tools.map(t => box(t))];
  if (hull === "spindle") return [loft(P.body), box(P.roof), ...[-2,2].flatMap(x=>[
    ellipsoid([x,.4,0],P.float.radius,8),box({center:[x/2,.55,0],size:[2,.15,.2]})])];
  return [loft(S.bow), loft(S.body), loft(S.inset), box(S.prow),
    ...[-1.15, 1.15].flatMap(x => [box({ center: [x, .225, 1.3], size: [.18, .45, 2.8] }),
      box({ center: [x, .72, 2.5], size: [.16, 1.2, .18] })])];
}
export interface Bounds { readonly min: Readonly<Vec3>; readonly max: Readonly<Vec3> }
export interface ContactMesh {
  readonly components: readonly (readonly Triangle[])[];
  readonly componentBounds: readonly Bounds[];
  readonly triangles: readonly Triangle[];
  readonly triangleBounds: readonly Bounds[];
  readonly bounds: Bounds;
  readonly escape: Convex;
}
interface Projection { readonly axis: Readonly<Vec3>; readonly min: number; readonly max: number }
interface Convex {
  readonly vertices: readonly Readonly<Vec3>[];
  readonly planes: readonly Projection[];
  readonly edges: readonly Readonly<Vec3>[];
  readonly bounds: Bounds;
}
function convex(triangles: readonly Triangle[]): Convex {
  const points=new Map<string,Vec3>(),normals=new Map<string,Vec3>(),edges=new Map<string,Vec3>();
  const axis=(v:Vec3,into:Map<string,Vec3>):void=>{
    const n=length(v);if(n<1e-12)return;
    const sign=v.x<0||(v.x===0&&v.y<0)||(v.x===0&&v.y===0&&v.z<0)?-1:1;
    const a=scale(v,sign/n);
    // Exact normalized duplicates only. Almost-parallel axes stay in the SAT.
    into.set(`${a.x}/${a.y}/${a.z}`,Object.freeze(a));
  };
  for(const t of triangles) {
    for(const p of t)points.set(`${p.x}/${p.y}/${p.z}`,p);
    const e=[sub(t[1],t[0]),sub(t[2],t[1]),sub(t[0],t[2])];
    axis(cross(e[0]!,e[1]!),normals);for(const v of e)axis(v,edges);
  }
  const vertices=Object.freeze([...points.values()]);
  const planes=Object.freeze([...normals.values()].map(axis=>{
    const ps=vertices.map(p=>dot(p,axis));return Object.freeze({axis,min:Math.min(...ps),max:Math.max(...ps)});
  }));
  return Object.freeze({vertices,planes,edges:Object.freeze([...edges.values()]),bounds:bounds(triangles)});
}
function bounds(triangles: readonly Triangle[]): Bounds {
  const min={x:Infinity,y:Infinity,z:Infinity},max={x:-Infinity,y:-Infinity,z:-Infinity};
  for(const triangle of triangles)for(const p of triangle)for(const k of ["x","y","z"] as const) {
    min[k]=Math.min(min[k],p[k]);max[k]=Math.max(max[k],p[k]);
  }
  return Object.freeze({min:Object.freeze(min),max:Object.freeze(max)});
}
export function contactMesh(components: readonly (readonly Triangle[])[], faces: readonly Triangle[] = components.flat()): ContactMesh {
  for(const triangle of faces){for(const p of triangle)Object.freeze(p);Object.freeze(triangle);}
  for(const component of components)Object.freeze(component);
  return Object.freeze({components:Object.freeze([...components]),componentBounds:Object.freeze(components.map(bounds)),
    triangles:Object.freeze([...faces]),triangleBounds:Object.freeze(faces.map(t=>bounds([t]))),bounds:bounds(faces),
    escape:convex(faces)});
}
// Only authored, immutable local geometry lives across evaluations. Never cache
// a GameState, world transform, contact, berth pose or visibility result here.
const hullMeshes = new Map<HullId, ContactMesh>();
export function hullMesh(hull: HullId): ContactMesh {
  const cached = hullMeshes.get(hull); if (cached) return cached;
  const components = hullComponents(hull), triangles = components.flat();
  if(hull==="hearthline") {
    for(const x of [CARRIER_LAYOUT.deck.min.x,CARRIER_LAYOUT.deck.max.x])
      triangles.push(...face([[x,4.05,-12.5],[x,8.55,-12.5],[x,8.55,12.5],[x,4.05,12.5]]));
    triangles.push(...face([[-6.3,3.9,-12],[6.3,3.9,-12],[6.3,8.9,-12],[-6.3,8.9,-12]]));
  }
  if (!["spindle", "creel", "hearthline"].includes(hull)) {
    triangles.push(...[S.canopy, S.starboard, S.port, S.aft].flatMap(points => face(points)));
    for (const side of [-1, 1]) triangles.push(...face([[side * 1.1, .7, .7], [side * 2.5, .6, 1.8], [side * 1.1, .65, 2.4]]));
  }
  const result = contactMesh(components,triangles); hullMeshes.set(hull, result); return result;
}
export const DIVER_MESH=contactMesh([box({center:[0,.475,0],size:[.68,.95,.68]})]);
const shells=new Map<string,ContactMesh>();
/** The existing structural walls include the sealed panes; no carrier bubble. */
export function carrierShell(configuration: "compact" | "medium", slot?: 0 | 1): ContactMesh {
  const key=configuration+"/"+slot,cached=shells.get(key);if(cached)return cached;
  const components=carrierStructure(configuration,slot).map(b=>box({
    center:[(b.min.x+b.max.x)/2,(b.min.y+b.max.y)/2,(b.min.z+b.max.z)/2],
    size:[b.max.x-b.min.x,b.max.y-b.min.y,b.max.z-b.min.z]}));
  const mesh=contactMesh(components);shells.set(key,mesh);return mesh;
}
export function boundDistance(p: Vec3, b: Bounds): number {
  return Math.hypot(Math.max(b.min.x-p.x,0,p.x-b.max.x),Math.max(b.min.y-p.y,0,p.y-b.max.y),Math.max(b.min.z-p.z,0,p.z-b.max.z));
}
export function closestOnMesh(p: Vec3, mesh: ContactMesh): Vec3 {
  let distance=Infinity,point=p;
  for(let i=0;i<mesh.triangles.length;i++) {
    // Strict rejection with a roundoff guard preserves first-triangle ties.
    if(boundDistance(p,mesh.triangleBounds[i]!)>distance+1e-10)continue;
    const q=closest(p,mesh.triangles[i]!),dist=length(sub(q,p));
    if(dist<distance){distance=dist;point=q;}
  }
  return point;
}
export function closest(p: Vec3, [a, b, c]: Triangle): Vec3 {
  const ab = sub(b,a), ac = sub(c,a), ap = sub(p,a), d1 = dot(ab,ap), d2 = dot(ac,ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p,b), d3 = dot(ab,bp), d4 = dot(ac,bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1*d4-d3*d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, scale(ab,d1/(d1-d3)));
  const cp = sub(p,c), d5 = dot(ab,cp), d6 = dot(ac,cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5*d2-d1*d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a,scale(ac,d2/(d2-d6)));
  const va = d3*d6-d5*d4;
  if (va <= 0 && d4-d3 >= 0 && d5-d6 >= 0) return add(b,scale(sub(c,b),(d4-d3)/(d4-d3+d5-d6)));
  const inv = 1/(va+vb+vc);
  return add(a,add(scale(ab,vb*inv),scale(ac,vc*inv)));
}
function ray(p: Vec3, d: Vec3, [a,b,c]: Triangle): number | null {
  const e1=sub(b,a), e2=sub(c,a), h=cross(d,e2), det=dot(e1,h);
  if (Math.abs(det)<1e-10) return null;
  const s=sub(p,a), u=dot(s,h)/det; if(u < -1e-9 || u > 1+1e-9) return null;
  const q=cross(s,e1), v=dot(d,q)/det; if(v < -1e-9 || u+v > 1+1e-9) return null;
  const t=dot(e2,q)/det; return t>=0 ? t : null;
}
export function inside(p: Vec3, triangles: readonly Triangle[], b?: Bounds): boolean {
  if(b&&boundDistance(p,b)>1e-9)return false;
  const hits = triangles.map(t => ray(p,{x:1,y:.173,z:.317},t)).filter((t): t is number => t!==null && t>1e-8).sort((a,b)=>a-b);
  return hits.filter((t,i)=>!i || t-hits[i-1]!>1e-7).length%2===1;
}
/** Triangle/box SAT: all face, edge-cross-axis and box-axis separating planes. */
export function triangleBox(triangle: Triangle, b: ContactBox): boolean {
  const center=vec(b.center), a=sub(triangle[0],center),c=sub(triangle[1],center),d=sub(triangle[2],center), half=scale(vec(b.size),.5);
  // The first three SAT axes reject nearly all local candidates before edge
  // construction. These are precisely the original narrow-phase comparisons.
  for(const k of ["x","y","z"] as const)
    if(Math.min(a[k],c[k],d[k])>half[k]+1e-8||Math.max(a[k],c[k],d[k])< -half[k]-1e-8)return false;
  const separated=(axis:Vec3):boolean=>{
    const p=dot(a,axis),q=dot(c,axis),s=dot(d,axis),r=Math.abs(axis.x)*half.x+Math.abs(axis.y)*half.y+Math.abs(axis.z)*half.z;
    return Math.min(p,q,s)>r+1e-8||Math.max(p,q,s)<-r-1e-8;
  };
  const e0=sub(c,a),e1=sub(d,c),e2=sub(a,d);
  if(separated(cross(e0,e1)))return false;
  for(const e of [e0,e1,e2])for(const axis of [{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}])
    if(separated(cross(e,axis)))return false;
  return true;
}

export interface OrientedPiece {
  readonly center: Readonly<Vec3>;
  readonly half: Readonly<Vec3>;
  readonly axes: readonly [Readonly<Vec3>,Readonly<Vec3>,Readonly<Vec3>];
}
export interface Separation { readonly gap: number; readonly normal: Readonly<Vec3> }
/** A supporting-plane depth for an already intersecting hull. The plane uses
 * every authored vertex and every animal piece. It is an escape constraint,
 * never collision authority: clear starts use the original triangle/inside
 * narrow phase, including loft concavities, open panes and the carrier gaps. */
export function escapePlane(mesh: ContactMesh, pieces: readonly OrientedPiece[]): Separation {
  const c=mesh.escape;let gap=-Infinity,normal:Vec3={x:0,y:1,z:0};
  const test=(axis:Vec3,projection?:Projection):void=>{
    const n=length(axis);if(n<1e-12)return;const a=projection||n===1?axis:scale(axis,1/n);
    let min=projection?.min??Infinity,max=projection?.max??-Infinity;
    if(!projection)for(const p of c.vertices){const v=dot(p,a);min=Math.min(min,v);max=Math.max(max,v);}
    let low=Infinity,high=-Infinity;
    for(const b of pieces){const center=dot(b.center,a),radius=Math.abs(dot(b.axes[0],a))*b.half.x+Math.abs(dot(b.axes[1],a))*b.half.y+Math.abs(dot(b.axes[2],a))*b.half.z;
      low=Math.min(low,center-radius);high=Math.max(high,center+radius);}
    const positive=low-max,negative=min-high,g=Math.max(positive,negative);
    if(g>gap){gap=g;normal=scale(a,positive>=negative?1:-1);}
  };
  for(const axis of pieces[0]!.axes)test(axis);
  for(const p of c.planes)test(p.axis,p);
  for(const e of c.edges)for(const axis of pieces[0]!.axes)test(cross(e,axis));
  return {gap,normal};
}
export function escapePlaneGap(mesh: ContactMesh, normal:Vec3, project:(piece:number,axis:Vec3)=>Readonly<{min:number;max:number}> , pieceCount:number):number {
  let max=-Infinity,min=Infinity;
  for(const p of mesh.escape.vertices)max=Math.max(max,dot(p,normal));
  for(let i=0;i<pieceCount;i++)min=Math.min(min,project(i,normal).min);
  return min-max;
}
/** Continuous triangle/AABB SAT for the existing yaw-independent world animal
 * envelope. The same fixed axes apply for the whole translation interval. */
export function translatedBoxSweep(triangles: readonly Triangle[], start: Vec3, end: Vec3, b: ContactBox): boolean {
  const center=add(start,vec(b.center)),delta=sub(end,start),half=scale(vec(b.size),.5);
  const axes=[{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}];
  for(const triangle of triangles) {
    let low=0,high=1;
    const overlap=(axis:Vec3):boolean=>{
      const ps=triangle.map(p=>dot(p,axis)),c=dot(center,axis),d=dot(delta,axis),r=Math.abs(axis.x)*half.x+Math.abs(axis.y)*half.y+Math.abs(axis.z)*half.z;
      const min=Math.min(...ps)-r-1e-8,max=Math.max(...ps)+r+1e-8;
      if(Math.abs(d)<1e-14)return c>=min&&c<=max;
      const a=(min-c)/d,b=(max-c)/d;low=Math.max(low,Math.min(a,b));high=Math.min(high,Math.max(a,b));return low<=high;
    };
    if(!axes.every(overlap))continue;
    const edges=[sub(triangle[1],triangle[0]),sub(triangle[2],triangle[1]),sub(triangle[0],triangle[2])];
    if(overlap(cross(edges[0]!,edges[1]!))&&edges.every(e=>axes.every(a=>overlap(cross(e,a)))))return true;
  }
  return false;
}
export function meshOccludes(mesh: ContactMesh, start: Vec3, end: Vec3): boolean {
  const d=sub(end,start);let low=0,high=1;
  for(const k of ["x","y","z"] as const) {
    if(Math.abs(d[k])<1e-12){if(start[k]<mesh.bounds.min[k]||start[k]>mesh.bounds.max[k])return false;}
    else {const a=(mesh.bounds.min[k]-start[k])/d[k],b=(mesh.bounds.max[k]-start[k])/d[k];
      low=Math.max(low,Math.min(a,b));high=Math.min(high,Math.max(a,b));if(low>high)return false;}
  }
  if(mesh.components.some((c,i)=>inside(start,c,mesh.componentBounds[i])||inside(end,c,mesh.componentBounds[i])))return true;
  return mesh.triangles.some(t=>{const hit=ray(start,d,t);return hit!==null&&hit<=1+1e-9;});
}
