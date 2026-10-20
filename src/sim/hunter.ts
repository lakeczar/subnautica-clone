import { HUNTER_GEOMETRY as H, HUNTER_PART_ENVELOPES } from "../content/encounterGeometry.js";
import { THREAT_HOME } from "../content/registry.js";
import type { HullId } from "../content/registry.js";
import type { GameState, Vec3, WorldPose, WorldQueries } from "./types.js";
import { hullClearance, moveHull } from "./world.js";
import { HEARTHLINE_KEEL as K } from "../content/encounterGeometry.js";
import { vec, add, sub, scale, length, finite, unit, encounterRotation, inverseRotation,
  hullMesh, hullContactPose, closestOnMesh, inside, triangleBox, DIVER_MESH } from "./hunterQueries.js";
import { boundDistance, carrierShell, escapePlane, escapePlaneGap, meshOccludes, translatedBoxSweep } from "./hunterQueries.js";
import type { Triangle, ContactMesh, OrientedPiece, Separation } from "./hunterQueries.js";
import type { ContactBox } from "../content/encounterGeometry.js";
import { localToWorld } from "./carrier.js";
export { encounterRotation } from "./hunterQueries.js";

interface ActorQuery {
  readonly pose: WorldPose;
  readonly hull: HullId | null;
  readonly pitch: number;
  readonly mesh: ContactMesh;
  readonly worldTriangles: () => readonly Triangle[];
}
function actorQuery(pose: WorldPose, hull: HullId | null, pitch: number, mesh = hull ? hullMesh(hull) : DIVER_MESH): ActorQuery {
  let triangles: readonly Triangle[] | undefined;
  return {pose,hull,pitch,mesh,worldTriangles:()=>triangles??=mesh.triangles.map(t=>t.map(p=>
    add(pose.position,encounterRotation(p,pose.yaw,pitch))) as unknown as Triangle)};
}
function actor(s: GameState): ActorQuery {
  const v=s.fleet.vehicles.find(v=>v.id===s.player.controlledVehicleId);
  return actorQuery(v?.pose??s.player.pose,v?.hull??null,v?.hull==="dart"&&!v.berth?v.pose.pitch:0,
    v?hullMesh(v.hull,hullContactPose(s,v)):DIVER_MESH);
}
/** Zero/vertical separation uses home-relative horizontal direction, then +X. */
function outward(position: Vec3, target: Vec3): Vec3 {
  let d={x:position.x-target.x,y:0,z:position.z-target.z};
  if (length(d)<1e-8) d={x:THREAT_HOME.x-target.x,y:0,z:THREAT_HOME.z-target.z};
  return length(d)<1e-8 ? {x:1,y:0,z:0} : unit(d);
}
function actorSurface(a: ActorQuery, position: Vec3): { point: Vec3; outward: Vec3 } {
  const n=outward(position,a.pose.position);
  if(!a.hull) return { point:add(a.pose.position,{x:n.x*.34,y:.5,z:n.z*.34}),outward:n };
  const origin=add(a.pose.position,{x:n.x*100,y:a.hull==="hearthline"?1.5:a.hull==="creel"?.8:.55,z:n.z*100});
  const local=inverseRotation(sub(origin,a.pose.position),a.pose.yaw,a.pitch);
  if (a.hull === "hearthline") {
    const from = inverseRotation(sub(position, a.pose.position), a.pose.yaw);
    if (Math.abs(from.z) > K.size[2] / 2 && Math.abs(from.x) < K.offsetX + K.size[0] / 2) {
      // An end-on approach to the twin keels otherwise selects an inner
      // corner: the animal's cheek stops short while its mouth is out of reach.
      const point = add(a.pose.position, encounterRotation({
        x: from.x < 0 ? -K.offsetX : K.offsetX,
        y: K.centerY, z: Math.sign(from.z) * K.size[2] / 2,
      }, a.pose.yaw));
      return { point, outward: outward(position, point) };
    }
  }
  // Choose the exposed skin from this bearing, including projecting fins/tools
  // and the canopy. A ray through the keel could select skin behind a tool.
  const world=add(a.pose.position,encounterRotation(closestOnMesh(local,a.mesh),a.pose.yaw,a.pitch));
  return {point:world,outward:outward(position,world)};
}
export function hunterPhase(s: GameState): { seconds: number; withdrawing: boolean } {
  const seconds=((s.world.threat.modeSeconds%H.cycleSeconds)+H.cycleSeconds)%H.cycleSeconds;
  return {seconds,withdrawing:s.world.threat.mode==="pursue"&&seconds>=H.contactSeconds};
}
export function hunterStandOff(s: GameState, extraGap = 0): Vec3 {
  const a=actor(s),surface=actorSurface(a,s.world.threat.position),pose=poseAt(s,s.world.threat.position,surface);
  return sub(add(surface.point,scale(surface.outward,H.mouthGap+extraGap)),
    encounterRotation(vec(H.mouth),pose.yaw,0,pose.roll));
}
export function hunterPose(s: GameState, position: Vec3 = s.world.threat.position): {
  yaw: number; roll: number; mouth: Vec3; surface: Vec3; outward: Vec3; finAngle: number;
} {
  return poseAt(s,position,actorSurface(actor(s),position));
}
function poseAt(s: GameState, position: Vec3, surface: ReturnType<typeof actorSurface>): ReturnType<typeof hunterPose> {
  const t=s.world.threat, active=["warn","investigate","pursue"].includes(t.mode);
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
// The unchanged world envelope contains every animated yaw/roll. Fleet safety
// uses it against the actual hull triangles too, so a moving target cannot turn
// the derived (unsaved) animal pose into a parked hull between fixed steps.
const fleetBox:ContactBox={center:[0,(H.worldEnvelope.height+H.worldEnvelope.bottom)/2,0],
  size:[H.worldEnvelope.radius*2,H.worldEnvelope.height-H.worldEnvelope.bottom,H.worldEnvelope.radius*2]};
const fleetRadius=Math.hypot(H.worldEnvelope.radius,H.worldEnvelope.radius,Math.max(-H.worldEnvelope.bottom,H.worldEnvelope.height));
type AnimalPose=Pick<ReturnType<typeof hunterPose>,"yaw"|"roll">;
interface Obstacle { readonly id: string; readonly query: ActorQuery }
function fleetObstacles(s: GameState): readonly Obstacle[] {
  const result:Obstacle[]=[];
  for(const v of s.fleet.vehicles) {
    let pose=v.pose;
    if(v.berth) {
      const parent=s.fleet.vehicles.find(p=>p.id===v.berth!.carrierId);
      if(parent)pose={frame:"world",position:localToWorld(v.berth.pose.position,parent),yaw:parent.pose.yaw+v.berth.pose.yaw,pitch:0};
    }
    if(v.id!==s.player.controlledVehicleId)result.push({id:v.id,query:actorQuery(pose,v.hull,v.hull==="dart"&&!v.berth?pose.pitch:0,hullMesh(v.hull,hullContactPose(s,v)))});
    if(v.hull==="hearthline"&&s.fleet.docking?.vehicleId===v.id) {
      const dock=s.fleet.docking,slot=dock.transaction?.phase==="lock"?dock.transaction.slot:undefined;
      result.push({id:v.id+"/shell",query:actorQuery(pose,v.hull,0,carrierShell(dock.configuration,slot))});
    }
  }
  return result;
}
function nearby(obstacles: readonly Obstacle[], position: Vec3): readonly Obstacle[] {
  return obstacles.filter(({query:a})=>boundDistance(inverseRotation(sub(position,a.pose.position),a.pose.yaw,a.pitch),a.mesh.bounds)<=fleetRadius+1);
}
function piecesIn(a: ActorQuery, position: Vec3, pose: AnimalPose, boxes: readonly ContactBox[] = animalBoxes): readonly OrientedPiece[] {
  const axes=[{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}].map(p=>
    inverseRotation(encounterRotation(p,pose.yaw,0,pose.roll),a.pose.yaw,a.pitch)) as [Vec3,Vec3,Vec3];
  return boxes.map(b=>({axes,half:scale(vec(b.size),.5),center:inverseRotation(sub(
    add(position,encounterRotation(vec(b.center),pose.yaw,0,pose.roll)),a.pose.position),a.pose.yaw,a.pitch)}));
}
function obstacleGap(a: ActorQuery, position: Vec3, pose: AnimalPose): number {
  return escapePlane(a.mesh,piecesIn(a,position,pose)).gap;
}
/** Read-only diagnostic of the same actual-primitive query used by movement.
 * This never selects a damage target or modifies the fleet. */
export function hunterFleetObstruction(s: GameState, position: Vec3 = s.world.threat.position): Readonly<{ gap: number; penetrating: boolean; hullId: string | null }> {
  const pose=hunterPose(s,position);let gap=Infinity,hullId:string|null=null,penetrating=false;
  for(const obstacle of nearby(fleetObstacles(s),position)) {
    const hit=intersects(obstacle.query,position,pose),g=hit?obstacleGap(obstacle.query,position,pose):Math.max(0,obstacleGap(obstacle.query,position,pose));
    penetrating ||= hit;if(g<gap){gap=g;hullId=obstacle.id;}
  }
  return {gap,penetrating,hullId};
}
function fleetOccludes(obstacles: readonly Obstacle[], start: Vec3, end: Vec3): boolean {
  return obstacles.some(({query:a})=>meshOccludes(a.mesh,inverseRotation(sub(start,a.pose.position),a.pose.yaw,a.pitch),
    inverseRotation(sub(end,a.pose.position),a.pose.yaw,a.pitch)));
}
const angleDelta=(a:number,b:number):number=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
/** Continuous actual-triangle sweep of the unchanged world envelope. For a
 * retained overlap, one hull-specific supporting plane certifies non-closing
 * escape over the entire linear path. No broad hull bounds become walls. */
function fleetSweepFrom(obstacles: readonly Obstacle[], start: Vec3, from: AnimalPose) {
  const fixed={yaw:0,roll:0};
  // Every alternative starts at the same immutable pose in this evaluation.
  // Reuse its exact overlap/escape queries, never an endpoint from another
  // update or a raw proposal in place of the world's swept/slid result.
  const entries=obstacles.map(o=>{
    const a=o.query;let actual:boolean|undefined,separation:Separation|undefined;
    return {o,overlapping:intersects(a,start,fixed,[fleetBox]),
      actual:():boolean=>actual??=intersects(a,start,from),
      separation:():Separation=>separation??=escapePlane(a.mesh,piecesIn(a,start,fixed,[fleetBox]))};
  });
  return {overlaps:entries.filter(e=>e.overlapping),accepts:(end:Vec3,to:AnimalPose):boolean=>{
  for(const entry of entries) {
    const a=entry.o.query;
    if(entry.overlapping) {
      const initialActual=entry.actual();
      // A retained conservative-envelope overlap may separate; a clear animal
      // cannot rotate through that hull while it is clearing the envelope.
      if(!initialActual&&(Math.abs(angleDelta(from.yaw,to.yaw))>1e-10||Math.abs(from.roll-to.roll)>1e-10))return false;
      const escape=entry.separation();
      const next=piecesIn(a,end,fixed,[fleetBox])[0]!;
      const certificate=escapePlaneGap(a.mesh,escape.normal,()=>{
        const axis=escape.normal,c=next.center,r=Math.abs(axis.x*next.axes[0].x+axis.y*next.axes[0].y+axis.z*next.axes[0].z)*next.half.x+
          Math.abs(axis.x*next.axes[1].x+axis.y*next.axes[1].y+axis.z*next.axes[1].z)*next.half.y+
          Math.abs(axis.x*next.axes[2].x+axis.y*next.axes[2].y+axis.z*next.axes[2].z)*next.half.z;
        const center=c.x*axis.x+c.y*axis.y+c.z*axis.z;return {min:center-r,max:center+r};
      },1);
      if(certificate<escape.gap-1e-8)return false;
    } else if(translatedBoxSweep(a.worldTriangles(),start,end,fleetBox))return false;
  }
  return true;
  }};
}
/** Bounded numeric sweep used for the hunter only; large/nonfinite requests
 * safely refuse. The pose is transient and never enters the save schema. */
export function hunterFleetSweep(s: GameState, start: Vec3, end: Vec3, from: AnimalPose, to: AnimalPose): boolean {
  return finite(start)&&finite(end)&&[from.yaw,from.roll,to.yaw,to.roll].every(Number.isFinite)&&
    length(sub(end,start))<=H.yieldSpeed/60+1e-8&&fleetSweepFrom(nearby(fleetObstacles(s),start),start,from).accepts(end,to);
}
export function hunterPenetratesActor(s: GameState, position: Vec3 = s.world.threat.position): boolean {
  const a=actor(s);return penetrates(a,position,poseAt(s,position,actorSurface(a,position)));
}
function penetrates(a: ActorQuery, position: Vec3, pose: Pick<ReturnType<typeof hunterPose>,"yaw"|"roll">): boolean {
  const radius=a.hull==="hearthline"?20:a.hull==="creel"?5:4;
  if(length(sub(position,a.pose.position))>radius+6) return false;
  return intersects(a,position,pose);
}
function intersects(a: ActorQuery, position: Vec3, pose: AnimalPose, boxes: readonly ContactBox[] = animalBoxes): boolean {
  const toHunter=(p:Vec3):Vec3=>inverseRotation(sub(p,position),pose.yaw,0,pose.roll);
  const local=(p:Vec3):Vec3=>inverseRotation(sub(p,a.pose.position),a.pose.yaw,a.pitch);
  const mesh=a.mesh,transformed=a.worldTriangles().map(t=>t.map(toHunter) as unknown as Triangle);
  for(const b of boxes) {
    if(transformed.some(t=>triangleBox(t,b))) return true;
    const c=local(add(position,encounterRotation(vec(b.center),pose.yaw,0,pose.roll)));
    if(mesh.components.some((ts,i)=>inside(c,ts,mesh.componentBounds[i]))) return true;
  }
  return false;
}
export function hunterContact(s: GameState, position: Vec3, world: WorldQueries): {
  mouth: Vec3; surface: Vec3; gap: number; penetrating: boolean; clear: boolean; biting: boolean;
} {
  const a=actor(s),pose=poseAt(s,position,actorSurface(a,position));
  return contactAt(s,position,world,a,pose,penetrates(a,position,pose),fleetObstacles(s));
}
function contactAt(s: GameState, position: Vec3, world: WorldQueries, a: ActorQuery, pose: ReturnType<typeof hunterPose>, penetrating: boolean, obstacles: readonly Obstacle[]): ReturnType<typeof hunterContact> {
  // Closest visible skin to the actual post-sweep mouth, not the planned point.
  let surface:Vec3;
  if(!a.hull) {
    const n=outward(pose.mouth,a.pose.position);
    surface=add(a.pose.position,{x:n.x*.34,y:Math.max(0,Math.min(.95,pose.mouth.y-a.pose.position.y)),z:n.z*.34});
  } else {
    const p=inverseRotation(sub(pose.mouth,a.pose.position),a.pose.yaw,a.pitch);
    const candidate=closestOnMesh(p,a.mesh);
    surface=add(a.pose.position,encounterRotation(candidate,a.pose.yaw,a.pitch));
  }
  const gap=length(sub(pose.mouth,surface));
  const clear=hullClearance(world,position,H.worldEnvelope) && world.lineOfSight(pose.mouth,surface) &&
    !nearby(obstacles,position).some(o=>intersects(o.query,position,{yaw:0,roll:0},[fleetBox])) && !fleetOccludes(obstacles,pose.mouth,surface);
  return {mouth:pose.mouth,surface,gap,penetrating,clear,
    biting:s.world.threat.mode==="pursue"&&!hunterPhase(s).withdrawing&&!penetrating&&clear&&gap<=H.reach};
}
export function moveHunter(s: GameState, world: WorldQueries): {
  position: Vec3; yielding: boolean; blocked: boolean; contact: ReturnType<typeof hunterContact>;
} {
  const t=s.world.threat,start=t.position,a=actor(s),plan=actorSurface(a,start),pose=poseAt(s,start,plan),phase=hunterPhase(s);
  const obstacles=fleetObstacles(s),near=nearby(obstacles,start);
  const actorOverlap=penetrates(a,start,pose),fleet=fleetSweepFrom(near,start,pose),overlaps=fleet.overlaps;
  const yielding=actorOverlap||overlaps.some(i=>i.actual());
  const endpoints:{position:Vec3;pose:ReturnType<typeof hunterPose>;penetrating?:boolean;fleetSafe?:boolean}[]=[{position:start,pose,penetrating:actorOverlap}];
  const at=(position:Vec3):typeof endpoints[number]=>{
    const previous=endpoints.find(e=>Object.is(e.position.x,position.x)&&Object.is(e.position.y,position.y)&&Object.is(e.position.z,position.z));
    if(previous)return previous;
    const next={position,pose:poseAt(s,position,actorSurface(a,position))};endpoints.push(next);return next;
  };
  const penetratesAt=(endpoint:typeof endpoints[number]):boolean=>endpoint.penetrating??=penetrates(a,endpoint.position,endpoint.pose);
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
  if(yielding||overlaps.length) {
    const n=plan.outward,normals=overlaps.map(({o,separation})=>encounterRotation(separation().normal,o.query.pose.yaw,o.query.pitch));
    const aggregate=normals.reduce(add,{x:0,y:0,z:0});
    const directions=[...(length(aggregate)>1e-8?[unit(aggregate)]:[]),...normals,n,{x:-n.z,y:0,z:n.x},{x:n.z,y:0,z:-n.x},{x:0,y:1,z:0},scale(n,-1),
      ...(overlaps.length?[{x:0,y:-1,z:0},...[-3,-1,1,3].map(i=>encounterRotation(n,i*Math.PI/4))]:[])];
    const targetPosition=a.pose.position, oldDistance=length(sub(start,targetPosition));
    for(const direction of directions) {
      const next=sweep(scale(direction,(yielding?H.yieldSpeed:speed)/60));
      if(finite(next)&&length(sub(next,start))>1e-7&&(!actorOverlap||length(sub(next,targetPosition))>oldDistance+1e-8)&&
        fleet.accepts(next,at(next).pose)){position=next;break;}
    }
    blocked=length(sub(position,start))<1e-8;
  } else if(speed>0) {
    const d=sub(target,start), delta=scale(d,Math.min(1,speed/60/Math.max(1e-12,length(d))));
    const next=sweep(delta);
    const safe=(next:Vec3):boolean=>{
      if(!finite(next))return false;
      const endpoint=at(next);
      return !penetratesAt(endpoint)&&(endpoint.fleetSafe??=fleet.accepts(next,endpoint.pose));
    };
    if(safe(next))position=next;
    else if(near.length) {
      const angles=[Math.PI/4,-Math.PI/4,Math.PI/2,-Math.PI/2],level={x:delta.x,y:0,z:delta.z};
      // After clearing a hull vertically, every rotated approach can descend
      // into it again. Try separated components through the same sweeps; their
      // lengths never exceed the requested step and no clearance is relaxed.
      const alternatives=[...angles.map(angle=>encounterRotation(delta,angle)),
        ...(Math.abs(delta.y)>1e-8?[level,...angles.map(angle=>encounterRotation(level,angle)),{x:0,y:delta.y,z:0}]:[])];
      for(const alternative of alternatives) {
        const attempt=sweep(alternative);if(safe(attempt)&&length(sub(attempt,start))>1e-7){position=attempt;break;}
      }
    }
    blocked=length(sub(position,start)) + 1e-7 < length(delta);
  }
  const endpoint=at(position);
  const contact=contactAt(s,position,world,a,endpoint.pose,penetratesAt(endpoint),obstacles);
  if(yielding||overlaps.length)contact.biting=false;
  return {position,yielding,blocked,contact};
}
