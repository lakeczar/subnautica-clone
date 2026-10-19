import test from "node:test";
import assert from "node:assert/strict";
import { createGame, makeVehicle } from "../src/sim/state.js";
import * as hunter from "../src/sim/hunter.js";
import { updateThreat } from "../src/sim/survival.js";
import { createWorldQueries } from "../src/sim/world.js";
import { fixtureGame, localToWorld } from "../src/sim/carrier.js";
import { carrierShell, encounterRotation, inverseRotation, hullMesh, inside, triangleBox, add, sub, vec,
  meshOccludes } from "../src/sim/hunterQueries.js";
import { HUNTER_PART_ENVELOPES as parts, HUNTER_GEOMETRY as H } from "../src/content/encounterGeometry.js";
import type { GameState, Vec3, VehicleState } from "../src/sim/types.js";
import type { Triangle } from "../src/sim/hunterQueries.js";

const empty=createWorldQueries([],()=>-250);
function fixture():GameState {
  const s=createGame();s.opening.phase=4;s.player.mode="swimming";s.player.pose.position={x:132,y:-110,z:-112};
  Object.assign(s.world.threat,{mode:"pursue",modeSeconds:0,interest:12,position:{x:160,y:-110,z:-112}});return s;
}
// Independent roster/transform assembly. The SAT and inside kernels are shared
// with production; actual-render-triangle audits are retained separately.
function intersects(v:VehicleState,p:Vec3,pose:Pick<ReturnType<typeof hunter.hunterPose>,"yaw"|"roll">):boolean {
  const mesh=hullMesh(v.hull),pitch=v.hull==="dart"&&!v.berth?v.pose.pitch:0;
  const triangles=mesh.triangles.map(t=>t.map(q=>inverseRotation(sub(add(v.pose.position,
    encounterRotation(q,v.pose.yaw,pitch)),p),pose.yaw,0,pose.roll)) as unknown as Triangle);
  return parts.some(b=>triangles.some(t=>triangleBox(t,b))||mesh.components.some((c,i)=>inside(
    inverseRotation(sub(add(p,encounterRotation(vec(b.center),pose.yaw,0,pose.roll)),v.pose.position),v.pose.yaw,pitch),c,mesh.componentBounds[i])));
}
function assertSwept(s:GameState,v:VehicleState,start:Vec3,end:Vec3):void {
  const from=hunter.hunterPose(s,start),to=hunter.hunterPose(s,end),turn=Math.atan2(Math.sin(to.yaw-from.yaw),Math.cos(to.yaw-from.yaw));
  for(let i=0;i<=12;i++) {
    const t=i/12,p={x:start.x+(end.x-start.x)*t,y:start.y+(end.y-start.y)*t,z:start.z+(end.z-start.z)*t};
    assert.ok(!intersects(v,p,{yaw:from.yaw+turn*t,roll:from.roll+(to.roll-from.roll)*t}),`${v.id}: swept sample ${i} enters hull`);
  }
}

test("parked disabled hull stays solid after exit, without taking the diver's damage",()=>{
  const s=fixture(),v=makeVehicle("parked","dart",{x:146,y:-110,z:-112},"parked-hold");v.disabled=true;v.health=0;
  s.fleet.vehicles.push(v);const original=structuredClone(v);let travelled=0;
  assert.ok(!intersects(v,s.world.threat.position,hunter.hunterPose(s)));
  for(let i=0;i<150;i++) {
    s.tick++;const start={...s.world.threat.position},m=hunter.moveHunter(s,empty);
    assertSwept(s,v,start,m.position);travelled+=Math.hypot(m.position.x-start.x,m.position.y-start.y,m.position.z-start.z);s.world.threat.position=m.position;
    s.world.threat.modeSeconds+=1/60;
  }
  assert.ok(travelled>2,"finite alternatives can approach or skirt, rather than losing the obstacle");assert.deepEqual(v,original);
});

test("a turn with two clear endpoints still refuses a mid-rotation parked-hull intersection",()=>{
  const s=fixture(),v=makeVehicle("turn-obstacle","dart",{x:-5.5,y:0,z:5.5},"hold");v.pose.yaw=Math.PI/4;s.fleet.vehicles=[v];
  const p={x:0,y:0,z:0};assert.ok(!intersects(v,p,{yaw:0,roll:0}));assert.ok(!intersects(v,p,{yaw:Math.PI/2,roll:0}));
  assert.ok(intersects(v,p,{yaw:Math.PI/4,roll:0}),"the actual authored tip meets the rotating tail");
  assert.equal(hunter.hunterFleetSweep(s,p,p,{yaw:0,roll:0},{yaw:Math.PI/2,roll:0}),false);
  assert.equal(hunter.hunterFleetSweep(s,p,{...p,x:100},{yaw:0,roll:0},{yaw:0,roll:0}),false,"unbounded requests refuse");
});

test("two nearby hulls remain obstacles while the controlled actor moves and turns",()=>{
  const s=fixture(),actor=makeVehicle("controlled","dart",s.player.pose.position,"actor-hold");s.player.mode="piloting";s.player.controlledVehicleId=actor.id;
  const parked=[makeVehicle("port","dart",{x:146,y:-110,z:-115},"port-hold"),makeVehicle("starboard","creel",{x:146,y:-110,z:-108},"starboard-hold")];
  parked[0]!.pose.pitch=.45;parked[1]!.disabled=true;parked[1]!.health=0;s.fleet.vehicles=[actor,...parked];const copies=structuredClone(parked);
  for(let i=0;i<100;i++) {
    actor.pose.position.z+=.015;actor.pose.yaw+=.03;actor.pose.pitch=Math.sin(i*.1)*.4;s.player.pose=structuredClone(actor.pose);s.tick++;
    const start={...s.world.threat.position},m=hunter.moveHunter(s,empty);for(const v of parked)assertSwept(s,v,start,m.position);
    s.world.threat.position=m.position;s.world.threat.modeSeconds+=1/60;
  }
  assert.deepEqual(parked,copies);
});

test("retained real diver overlap separates boundedly without bites or actor/hull displacement",()=>{
  const s=fixture(),v=makeVehicle("original-dart","dart",{x:122.2388436138658,y:-102.78398623796338,z:-99.79702216882471},"original-hold");
  v.pose.yaw=1.51659265358977;v.disabled=true;v.health=0;s.fleet.vehicles=[v];s.tick=12825;
  s.player.pose.position={x:122.40679273244938,y:-102.58398623796337,z:-96.70157501315124};
  s.world.threat.position={x:122.43627573343994,y:-102.54398022621432,z:-101.90149204661954};s.world.threat.modeSeconds=26.0499999999998;
  const player=structuredClone(s.player),vehicle=structuredClone(v);let separated=false;
  for(let i=0;i<90;i++) {
    const before=hunter.hunterFleetObstruction(s),start={...s.world.threat.position},m=hunter.moveHunter(s,empty);
    assert.ok(Math.hypot(m.position.x-start.x,m.position.y-start.y,m.position.z-start.z)<=H.yieldSpeed/60+1e-8);
    if(before.penetrating){assert.ok(m.yielding&&!m.contact.biting);assert.ok(hunter.hunterFleetSweep(s,start,m.position,hunter.hunterPose(s),hunter.hunterPose(s,m.position)));}
    s.world.threat.position=m.position;if(!hunter.hunterFleetObstruction(s).penetrating){separated=true;break;}
    s.tick++;s.world.threat.modeSeconds+=1/60;
  }
  assert.ok(separated,"12825 escapes through active movement");assert.deepEqual(s.player,player);assert.deepEqual(v,vehicle);
});

test("berths use their carrier-local frame and sealed shell while the keel gap stays open",()=>{
  const s=fixtureGame(),h=s.fleet.vehicles[0]!,d=s.fleet.vehicles[1]!;h.pose.yaw=.8;s.player.mode="swimming";s.player.controlledVehicleId=null;s.player.interiorId=null;
  s.player.pose.position=localToWorld({x:0,y:0,z:-20},h);s.world.threat.mode="pursue";s.world.threat.position=localToWorld(d.berth!.pose.position,h);
  const before=hunter.hunterFleetObstruction(s);d.pose.position={x:-180,y:-100,z:180};
  assert.deepEqual(hunter.hunterFleetObstruction(s),before,"stale independent pose is never a second berth obstacle");assert.ok(before.penetrating);
  const start={x:-3,y:3.5,z:1},end={x:-3,y:4.5,z:1};
  assert.ok(meshOccludes(carrierShell("compact"),start,end));assert.ok(!meshOccludes(carrierShell("compact",0),start,end));
  h.pose.yaw=0;s.player.pose.position=localToWorld({x:0,y:-1.5,z:-20},h);s.world.threat.position=localToWorld({x:0,y:-1.5,z:10},h);
  assert.ok(!hunter.hunterFleetObstruction(s).penetrating,"actual gap is not the full carrier's broad square");
});

test("a parked opaque pane occludes mouth LOS, independently of damage target identity",()=>{
  const mesh=hullMesh("dart"),start={x:0,y:1.4,z:-2},end={x:0,y:1.4,z:1};
  assert.ok(meshOccludes(mesh,start,end),"segment crosses the authored canopy");
  assert.ok(!meshOccludes(mesh,{x:3,y:1.4,z:-2},{x:3,y:1.4,z:1}),"broad hull bounds do not replace the skin");
  const s=fixture(),controlled=makeVehicle("current","dart",s.player.pose.position,"current-hold"),parked=makeVehicle("other","dart",{x:140,y:-110,z:-112},"other-hold");
  s.fleet.vehicles=[controlled,parked];s.player.mode="piloting";s.player.controlledVehicleId=controlled.id;
  s.world.threat.position=hunter.hunterStandOff(s);const original=structuredClone(parked),events:Parameters<typeof updateThreat>[2]=[];
  updateThreat(s,1,events,empty);assert.ok(events.filter(e=>e.type==="threat-damage").every(e=>e.type==="threat-damage"&&e.target.kind==="vehicle"&&e.target.vehicleId===controlled.id));
  assert.deepEqual(parked,original);
});

