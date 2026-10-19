import { CREEL_GEOMETRY as C, HEARTHLINE_KEEL as K, HUNTER_GEOMETRY as H, HUNTER_PART_ENVELOPES,
  SCOUT_GEOMETRY as S, SPINDLE_GEOMETRY as P } from "../content/encounterGeometry.js";
import type { ContactBox, LoftSection, Point3 } from "../content/encounterGeometry.js";
import { THREAT_HOME } from "../content/registry.js";
import type { HullId } from "../content/registry.js";
import type { GameState, Vec3, WorldPose, WorldQueries } from "./types.js";
import { hullClearance, moveHull } from "./world.js";
import { CARRIER_LAYOUT } from "./carrier.js";

type Triangle = readonly [Vec3, Vec3, Vec3];
const vec = (p: Point3): Vec3 => ({ x: p[0], y: p[1], z: p[2] });
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
const finite = (a: Vec3): boolean => [a.x, a.y, a.z].every(Number.isFinite);
const unit = (a: Vec3): Vec3 => scale(a, 1 / Math.max(1e-12, length(a)));

/** Matches Babylon's (pitch, -semanticYaw, roll), including its rotation order. */
export function encounterRotation(p: Vec3, yaw: number, pitch = 0, roll = 0): Vec3 {
  const cr = Math.cos(roll), sr = Math.sin(roll), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const x = p.x * cr - p.y * sr, ry = p.x * sr + p.y * cr;
  const y = ry * cp - p.z * sp, z = ry * sp + p.z * cp;
  return { x: x * Math.cos(yaw) - z * Math.sin(yaw), y, z: x * Math.sin(yaw) + z * Math.cos(yaw) };
}
function inverseRotation(p: Vec3, yaw: number, pitch = 0, roll = 0): Vec3 {
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
function box(b: ContactBox): Triangle[] {
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
  if (hull === "creel") return [box(C.body), box(C.cabin), box(C.window),
    ...[-2.5, 2.5].map(x => box({ center: [x, .8, -2], size: C.toolSize }))];
  if (hull === "spindle") return [loft(P.body), box(P.roof), ...[-2,2].flatMap(x=>[
    ellipsoid([x,.4,0],P.float.radius,8),box({center:[x/2,.55,0],size:[2,.15,.2]})])];
  return [loft(S.bow), loft(S.body), loft(S.inset), box(S.prow),
    ...[-1.15, 1.15].flatMap(x => [box({ center: [x, .225, 1.3], size: [.18, .45, 2.8] }),
      box({ center: [x, .72, 2.5], size: [.16, 1.2, .18] })])];
}
const hullMeshes = new Map<HullId, { components: Triangle[][]; triangles: Triangle[] }>();
function hullMesh(hull: HullId): { components: Triangle[][]; triangles: Triangle[] } {
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
  const result = { components, triangles }; hullMeshes.set(hull, result); return result;
}
function closest(p: Vec3, [a, b, c]: Triangle): Vec3 {
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
function inside(p: Vec3, triangles: readonly Triangle[]): boolean {
  const hits = triangles.map(t => ray(p,{x:1,y:.173,z:.317},t)).filter((t): t is number => t!==null && t>1e-8).sort((a,b)=>a-b);
  return hits.filter((t,i)=>!i || t-hits[i-1]!>1e-7).length%2===1;
}
function actor(s: GameState): { pose: WorldPose; hull: HullId | null; pitch: number } {
  const v=s.fleet.vehicles.find(v=>v.id===s.player.controlledVehicleId);
  return { pose: v?.pose ?? s.player.pose, hull: v?.hull ?? null, pitch: v?.hull==="dart" && !v.berth ? v.pose.pitch : 0 };
}
/** Zero/vertical separation uses home-relative horizontal direction, then +X. */
function outward(position: Vec3, target: Vec3): Vec3 {
  let d={x:position.x-target.x,y:0,z:position.z-target.z};
  if (length(d)<1e-8) d={x:THREAT_HOME.x-target.x,y:0,z:THREAT_HOME.z-target.z};
  return length(d)<1e-8 ? {x:1,y:0,z:0} : unit(d);
}
function actorSurface(s: GameState, position: Vec3): { point: Vec3; outward: Vec3 } {
  const a=actor(s), n=outward(position,a.pose.position);
  if(!a.hull) return { point:add(a.pose.position,{x:n.x*.34,y:.5,z:n.z*.34}),outward:n };
  const origin=add(a.pose.position,{x:n.x*100,y:a.hull==="hearthline"?1.5:a.hull==="creel"?.8:.55,z:n.z*100});
  const local=inverseRotation(sub(origin,a.pose.position),a.pose.yaw,a.pitch);
  const mesh=hullMesh(a.hull);
  let distance=Infinity, point: Vec3 | null=null;
  // Choose the exposed skin from this bearing, including projecting fins/tools
  // and the canopy. A ray through the keel could select skin behind a tool.
  for(const t of mesh.triangles) {const q=closest(local,t),dist=length(sub(q,local));if(dist<distance){distance=dist;point=q;}}
  const world=add(a.pose.position,encounterRotation(point!,a.pose.yaw,a.pitch));
  return {point:world,outward:outward(position,world)};
}
export function hunterPhase(s: GameState): { seconds: number; withdrawing: boolean } {
  const seconds=((s.world.threat.modeSeconds%H.cycleSeconds)+H.cycleSeconds)%H.cycleSeconds;
  return {seconds,withdrawing:s.world.threat.mode==="pursue"&&seconds>=H.contactSeconds};
}
export function hunterStandOff(s: GameState, extraGap = 0): Vec3 {
  const pose=hunterPose(s), surface=actorSurface(s,s.world.threat.position);
  return sub(add(surface.point,scale(surface.outward,H.mouthGap+extraGap)),
    encounterRotation(vec(H.mouth),pose.yaw,0,pose.roll));
}
export function hunterPose(s: GameState, position: Vec3 = s.world.threat.position): {
  yaw: number; roll: number; mouth: Vec3; surface: Vec3; outward: Vec3; finAngle: number;
} {
  const t=s.world.threat, surface=actorSurface(s,position), active=["warn","investigate","pursue"].includes(t.mode);
  const target=t.distraction ?? (t.mode==="disengage"||t.mode==="idle"?THREAT_HOME:surface.point);
  const n=outward(position,target), roll=Math.sin(s.tick/60*1.5)*.045;
  const rolledMouth=encounterRotation(vec(H.mouth),0,0,roll);
  // Aim the rolled mouth, rather than its unrolled -Z axis. This avoids a
  // perpetual tangential chase caused by the 2cm animated lateral offset.
  const yaw=Math.atan2(-n.x,n.z)-Math.atan2(rolledMouth.x,-rolledMouth.z);
  const phase=hunterPhase(s), warning=active && !phase.withdrawing;
  return {yaw,roll,mouth:add(position,encounterRotation(vec(H.mouth),yaw,0,roll)),surface:surface.point,outward:n,
    finAngle:(warning?.3:-.16)+Math.sin(s.tick/60*(warning?4:1.8))*(warning?.13:.055)};
}
// Conservative pieces contain the whole animated animal without treating its
// broad fins as a square nose. They are actor separation only, never world walls.
const animalBoxes = HUNTER_PART_ENVELOPES;
/** Triangle/box SAT: all face, edge-cross-axis and box-axis separating planes. */
function triangleBox(triangle: Triangle, b: ContactBox): boolean {
  const center=vec(b.center), t=triangle.map(p=>sub(p,center)), half=scale(vec(b.size),.5);
  const axes=[{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}];
  const edges=[sub(t[1]!,t[0]!),sub(t[2]!,t[1]!),sub(t[0]!,t[2]!)];
  for(const axis of [...axes,cross(edges[0]!,edges[1]!),...edges.flatMap(e=>axes.map(a=>cross(e,a)))]) {
    const projections=t.map(p=>dot(p,axis)), r=Math.abs(axis.x)*half.x+Math.abs(axis.y)*half.y+Math.abs(axis.z)*half.z;
    if(Math.min(...projections)>r+1e-8||Math.max(...projections)<-r-1e-8) return false;
  }
  return true;
}
export function hunterPenetratesActor(s: GameState, position: Vec3 = s.world.threat.position): boolean {
  const a=actor(s), radius=a.hull==="hearthline"?20:a.hull==="creel"?5:4;
  if(length(sub(position,a.pose.position))>radius+6) return false;
  const pose=hunterPose(s,position), toHunter=(p:Vec3):Vec3=>inverseRotation(sub(p,position),pose.yaw,0,pose.roll);
  const local=(p:Vec3):Vec3=>inverseRotation(sub(p,a.pose.position),a.pose.yaw,a.pitch);
  const components=a.hull ? hullMesh(a.hull).components : [box({center:[0,.475,0],size:[.68,.95,.68]})];
  const triangles=a.hull ? hullMesh(a.hull).triangles : components[0]!;
  const transformed=triangles.map(t=>t.map(p=>toHunter(add(a.pose.position,encounterRotation(p,a.pose.yaw,a.pitch)))) as unknown as Triangle);
  for(const b of animalBoxes) {
    if(transformed.some(t=>triangleBox(t,b))) return true;
    const c=local(add(position,encounterRotation(vec(b.center),pose.yaw,0,pose.roll)));
    if(components.some(ts=>inside(c,ts))) return true;
  }
  return false;
}
export function hunterContact(s: GameState, position: Vec3, world: WorldQueries): {
  mouth: Vec3; surface: Vec3; gap: number; penetrating: boolean; clear: boolean; biting: boolean;
} {
  const pose=hunterPose(s,position), a=actor(s);
  // Closest visible skin to the actual post-sweep mouth, not the planned point.
  let surface:Vec3;
  if(!a.hull) {
    const n=outward(pose.mouth,a.pose.position);
    surface=add(a.pose.position,{x:n.x*.34,y:Math.max(0,Math.min(.95,pose.mouth.y-a.pose.position.y)),z:n.z*.34});
  } else {
    const p=inverseRotation(sub(pose.mouth,a.pose.position),a.pose.yaw,a.pitch);
    let dist=Infinity, candidate=p;
    for(const t of hullMesh(a.hull).triangles){const q=closest(p,t),d=length(sub(q,p));if(d<dist){dist=d;candidate=q;}}
    surface=add(a.pose.position,encounterRotation(candidate,a.pose.yaw,a.pitch));
  }
  const gap=length(sub(pose.mouth,surface)), penetrating=hunterPenetratesActor(s,position);
  const clear=hullClearance(world,position,H.worldEnvelope) && world.lineOfSight(pose.mouth,surface);
  return {mouth:pose.mouth,surface,gap,penetrating,clear,
    biting:s.world.threat.mode==="pursue"&&!hunterPhase(s).withdrawing&&!penetrating&&clear&&gap<=H.reach};
}
export function moveHunter(s: GameState, world: WorldQueries): {
  position: Vec3; yielding: boolean; blocked: boolean; contact: ReturnType<typeof hunterContact>;
} {
  const t=s.world.threat, start=t.position, pose=hunterPose(s), plan=actorSurface(s,start), phase=hunterPhase(s);
  const yielding=hunterPenetratesActor(s,start);
  let target:Vec3=t.distraction??THREAT_HOME, speed=2;
  if(!t.distraction&&(t.mode==="investigate"||t.mode==="pursue")) {
    const gap=H.mouthGap+(t.mode==="investigate"?H.investigateGap:phase.withdrawing?H.withdrawalGap:0);
    const offset=encounterRotation(vec(H.mouth),pose.yaw,0,pose.roll);
    target=sub(add(plan.point,scale(plan.outward,gap)),offset);
    speed=t.mode==="pursue"?H.approachSpeed:H.investigateSpeed;
  }
  if(t.mode==="idle"||t.mode==="warn")speed=0;
  const sweep=(delta:Vec3):Vec3=>moveHull(world,start,delta,H.worldEnvelope,undefined,undefined,{separateBoxOverlaps:true}).position;
  let position={...start}, blocked=false;
  if(yielding) {
    const n=plan.outward, directions=[n,{x:-n.z,y:0,z:n.x},{x:n.z,y:0,z:-n.x},{x:0,y:1,z:0},scale(n,-1)];
    const a=actor(s).pose.position, oldDistance=length(sub(start,a));
    for(const direction of directions) {
      const next=sweep(scale(direction,H.yieldSpeed/60));
      if(finite(next)&&length(sub(next,start))>1e-7&&length(sub(next,a))>oldDistance+1e-8){position=next;break;}
    }
    blocked=length(sub(position,start))<1e-8;
  } else if(speed>0) {
    const d=sub(target,start), delta=scale(d,Math.min(1,speed/60/Math.max(1e-12,length(d))));
    const next=sweep(delta);
    if(finite(next)&&!hunterPenetratesActor(s,next)) position=next;
    blocked=length(sub(position,start)) + 1e-7 < length(delta);
  }
  const contact=hunterContact(s,position,world);
  if(yielding)contact.biting=false;
  return {position,yielding,blocked,contact};
}
