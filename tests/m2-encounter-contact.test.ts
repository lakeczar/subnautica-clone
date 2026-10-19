import test from "node:test";
import assert from "node:assert/strict";
import { THREAT_HOME } from "../src/content/registry.js";
import { createGame, makeVehicle } from "../src/sim/state.js";
import { updateThreat } from "../src/sim/survival.js";
import { createWorldQueries, moveHull, RIB_SEGMENTS, SOLIDS, WORLD_BOUNDS } from "../src/sim/world.js";
import { actorBox, segmentBoxClosest } from "../src/sim/ribCollision.js";
import { hunterContact, hunterPhase, hunterPose, hunterStandOff, hunterPenetratesActor, moveHunter } from "../src/sim/hunter.js";
import { HUNTER_GEOMETRY as H } from "../src/content/encounterGeometry.js";
import type { HullId } from "../src/content/registry.js";
import type { GameEvent, GameState, Vec3 } from "../src/sim/types.js";

const empty=createWorldQueries([],()=>-250);
function fixture(hull: HullId | null = null):GameState {
  const s=createGame();s.opening.phase=4;s.player.mode=hull?"piloting":"swimming";
  s.player.pose.position={x:132,y:-110,z:-112};
  if(hull){const v=makeVehicle("contact-hull",hull,s.player.pose.position,"contact-hold");s.fleet.vehicles.push(v);s.player.controlledVehicleId=v.id;}
  Object.assign(s.world.threat,{mode:"pursue",interest:12,modeSeconds:0,position:{x:160,y:-110,z:-112}});
  return s;
}
const separation=(a:Vec3,b:Vec3):number=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);

test("post-sweep contact uses the real mouth and visible skin for every controllable hull and the diver",()=>{
  for(const hull of [null,"dart","hush","mantle","creel","spindle","hearthline"] as const) {
    for(const yaw of [0,.7,Math.PI,-1.4]) {
      const s=fixture(hull), v=s.fleet.vehicles[0]; if(v){v.pose.yaw=yaw;v.pose.pitch=hull==="dart"?.55:0;}
      for(let i=0;i<180;i++) {s.tick++;const events:GameEvent[]=[];updateThreat(s,1,events,empty);
        for(const event of events.filter(e=>e.type==="threat-damage")) {
          const c=hunterContact(s,s.world.threat.position,empty);
          assert.ok(c.biting&&c.clear&&!c.penetrating);assert.ok(c.gap<=H.reach);assert.ok(event.loss>0);
        }
      }
      s.world.threat.modeSeconds=0;s.world.threat.position=hunterStandOff(s);
      const c=hunterContact(s,s.world.threat.position,empty);
      assert.ok(c.gap<=H.reach,`${hull}/${yaw}: actual surface within mouth reach`);
      assert.ok(!c.penetrating,`${hull}/${yaw}: exterior contact pose`);
    }
  }
});

test("stationary loudness-one rule fixtures fail within 30 seconds with repeated separated contacts at unchanged rates",()=>{
  for(const hull of [null,"dart"] as const) {
    const s=fixture(hull);let first=-1,last=-1,bites=0;const breaks:number[]=[];
    for(let i=0;i<2400;i++) {
      s.tick++;const events:GameEvent[]=[];updateThreat(s,1,events,empty);
      const damage=events.find(e=>e.type==="threat-damage");
      if(damage?.type==="threat-damage") {
        first=first<0?i:first;if(last>=0&&i>last+1)breaks.push((i-last-1)/60);last=i;bites++;
        assert.ok(damage.loss<=(hull?12:10)/60+1e-10);
      }
      if((s.fleet.vehicles[0]?.health??s.player.vitals.health)<=0)break;
    }
    assert.ok(bites>100&&breaks.length>=2);assert.ok((last-first)/60<=30);
    assert.ok(breaks.every(seconds=>seconds>=.75),JSON.stringify(breaks));
  }
});

test("end-on carrier approaches reach actual keel skin without increasing mouth reach", () => {
  for (const yaw of [0, Math.PI]) for (const bearing of [Math.PI / 2, Math.PI * 1.5]) {
    const s = fixture("hearthline"), v = s.fleet.vehicles[0]!; v.pose.yaw = yaw;
    s.world.threat.position = { x: 132 + Math.cos(bearing) * 35, y: -110, z: -112 + Math.sin(bearing) * 35 };
    let touched = false;
    for (let i = 0; i < 300; i++) {
      s.tick++; const m = moveHunter(s, empty); s.world.threat.position = m.position;
      assert.ok(!m.contact.penetrating);
      if (m.contact.biting) { assert.ok(m.contact.gap <= H.reach); touched = true; break; }
    }
    assert.ok(touched, `carrier end ${yaw}/${bearing} remains reachable`);
  }
});

test("investigation stands off; withdrawal keeps its nose toward the actor and cannot bite",()=>{
  const s=fixture("dart");s.world.threat.position=hunterStandOff(s);s.world.threat.mode="investigate";
  for(let i=0;i<90;i++){s.tick++;updateThreat(s,1,[],empty);}
  assert.ok(hunterContact(s,s.world.threat.position,empty).gap>3);
  s.world.threat.mode="pursue";s.world.threat.modeSeconds=2;s.world.threat.position=hunterStandOff(s);
  const before=hunterPose(s), p={...s.world.threat.position};const m=moveHunter(s,empty);
  assert.ok(separation(m.position,s.player.pose.position)>separation(p,s.player.pose.position));
  assert.ok(!m.contact.biting);assert.ok(Math.abs(hunterPose(s,m.position).yaw-before.yaw)<.05);
});

test("phase is finite, saved-timer derived and stable across boundaries and large timers",()=>{
  const s=fixture();
  for(const seconds of [0,1.999999,2,2.999999,3,1e12,Number.MAX_VALUE]) {
    s.world.threat.modeSeconds=seconds;const p=hunterPhase(s);
    assert.ok(Number.isFinite(p.seconds)&&p.seconds>=0&&p.seconds<3);
    assert.equal(p.withdrawing,p.seconds>=2);
    assert.deepEqual(hunterPose(s),hunterPose(structuredClone(s)));
  }
});

test("home coincidence, vertical overlap, moving/turning, disabled control and actor replacement remain bounded",()=>{
  for(const mode of ["investigate","pursue"] as const)for(const offset of [0,1,8]) {
    const s=fixture("dart"),v=s.fleet.vehicles[0]!;s.player.pose.position={...THREAT_HOME};v.pose.position={...THREAT_HOME};
    Object.assign(s.world.threat,{mode,position:{...THREAT_HOME,y:THREAT_HOME.y+offset}});
    for(let i=0;i<100;i++) {
      s.tick++;const before={...s.world.threat.position},inside=hunterPenetratesActor(s);const events:GameEvent[]=[];updateThreat(s,1,events,empty);
      assert.ok(separation(before,s.world.threat.position)<=H.yieldSpeed/60+1e-8);
      if(inside)assert.ok(!events.some(e=>e.type==="threat-damage"));
      if(i===20){v.disabled=true;v.health=0;}
      if(i>25&&i<45){v.pose.yaw+=.3;v.pose.position.x+=.18;s.player.pose.position={...v.pose.position};}
      if(i===50){s.player.controlledVehicleId=null;s.player.mode="swimming";}
      if(i===75){s.player.controlledVehicleId=v.id;s.player.mode="piloting";}
    }
    assert.ok(Object.values(s.world.threat.position).every(Number.isFinite));
  }
});

test("obstruction, animal-world overlap, refuge and distraction cannot create a contact bite",()=>{
  for(const kind of ["wall","overlap","distraction","refuge"] as const) {
    const s=fixture();s.world.threat.position=hunterStandOff(s);const p=hunterPose(s);
    let world=empty;
    if(kind==="wall"||kind==="overlap")world=createWorldQueries([{id:"custom",min:{x:p.mouth.x-.1,y:-112,z:-114},max:{x:p.mouth.x+.1,y:-108,z:-110}}],()=>-250);
    if(kind==="distraction"){s.world.threat.distraction={x:140,y:-110,z:-100};s.world.threat.distractionSeconds=2;}
    if(kind==="refuge")s.player.pose.position={x:0,y:.18,z:22};
    const events:GameEvent[]=[];updateThreat(s,1,events,world);assert.ok(!events.some(e=>e.type==="threat-damage"),kind);
  }
});

test("ordinary-box overlap separation is opt-in, deterministic at centres/ties and sweeps every adjoining solid",()=>{
  const solid={id:"local",min:{x:-1,y:-10,z:-1},max:{x:1,y:10,z:1}},shape={radius:.5,height:.5,bottom:-.5};
  const origin={x:0,y:0,z:0},delta={x:4,y:0,z:0},options={separateBoxOverlaps:true};
  const world=createWorldQueries([solid],()=>-200);
  assert.deepEqual(world.moveCapsule(origin,delta,shape),world.moveCapsule(origin,delta,shape,{}));
  assert.ok(world.moveCapsule(origin,delta,shape,options).position.x>1.5);
  const wall={id:"second",min:{x:2,y:-2,z:-3},max:{x:2.1,y:2,z:3}};
  const blocked=createWorldQueries([solid,wall],()=>-200).moveCapsule(origin,delta,shape,options);
  assert.ok(blocked.hitSolid&&blocked.position.x<1.501);
  const opposite={id:"other-overlap",min:{x:-.2,y:-10,z:-1},max:{x:2,y:10,z:1}};
  const conflict=createWorldQueries([solid,opposite],()=>-200).moveCapsule(origin,delta,shape,options);
  assert.deepEqual(conflict.position,origin,"cannot deepen another initial overlap");
  const seam=createWorldQueries([solid],()=>-200);let observed=0;
  const moved=moveHull(seam,origin,delta,shape,undefined,()=>{observed++;},options);
  assert.ok(moved.position.x>1.5);assert.equal(observed,0,"sixth support callback remains separate");
  assert.deepEqual(world.moveCapsule(origin,{x:NaN,y:0,z:0},shape,options).position,origin);
});

test("an initially coincident hunter yields outside the actor without an inside bite", () => {
  const s = createGame(); s.opening.phase = 4; s.player.mode = "swimming";
  s.player.pose.position = { ...THREAT_HOME };
  Object.assign(s.world.threat, { position: { ...THREAT_HOME }, mode: "pursue", interest: 8, modeSeconds: 0 });
  const world = createWorldQueries([], () => -250);
  for (let i = 0; i < 90; i++) {
    const events: GameEvent[] = []; updateThreat(s, 1, events, world);
    if (i < 12) assert.ok(!events.some(e => e.type === "threat-damage"), "no bite while inside actor");
  }
  assert.ok(Math.hypot(s.world.threat.position.x - THREAT_HOME.x,
    s.world.threat.position.z - THREAT_HOME.z) > 4.5, "no persistent origin attachment");
});

test("opted-in rib, supplied terrain and boundary motion stays swept and never snaps a retained overlap", () => {
  const shape = { radius: .5, bottom: -.5, height: .5 }, options = { separateBoxOverlaps: true };
  const rib = RIB_SEGMENTS[5]!, solid = SOLIDS.find(s => s.id === "reef.rib.5")!;
  assert.ok(solid);
  const p = { x: (rib.a.x + rib.b.x) / 2, y: (rib.a.y + rib.b.y) / 2, z: (rib.a.z + rib.b.z) / 2 };
  const ribWorld = createWorldQueries([solid], () => -200);
  const gap = (point: Vec3): number => segmentBoxClosest(rib.a, rib.b, actorBox(point, shape)).distance - rib.radius;
  for (const d of [{ x: 2, y: 0, z: 0 }, { x: 0, y: 2, z: 0 }, { x: 0, y: 0, z: 2 }]) {
    const result = ribWorld.moveCapsule(p, d, shape, options);
    assert.ok(gap(result.position) >= gap(p) - 1e-9);
  }
  const radial = { ...p, z: p.z + rib.radius + .3 };
  const escaped = ribWorld.moveCapsule(radial, { x: 0, y: 0, z: 2 }, shape, options);
  assert.ok(gap(escaped.position) >= gap(radial) - 1e-9);
  assert.ok(escaped.position.z > radial.z + .1, "resolved rib normal permits continuous outward travel");
  const slope = createWorldQueries([], x => x), origin = { x: 0, y: .4, z: 0 };
  assert.deepEqual(moveHull(slope, origin, { x: 1, y: 0, z: 0 }, shape, undefined, undefined, options).position, origin);
  const up = moveHull(slope, origin, { x: 0, y: .2, z: 0 }, shape, undefined, undefined, options);
  assert.ok(Math.abs(up.position.y - .6) < 1e-10, "supplied floor permits only requested upward travel");
  const invalid = createWorldQueries([], () => NaN);
  assert.deepEqual(moveHull(invalid, origin, { x: 0, y: 1, z: 0 }, shape, undefined, undefined, options).position, origin);
  const edge = { x: WORLD_BOUNDS.maxX, y: -100, z: 0 };
  const inward = empty.moveCapsule(edge, { x: -1, y: 0, z: 0 }, shape, options);
  const outward = empty.moveCapsule(edge, { x: 1, y: 0, z: 0 }, shape, options);
  assert.equal(inward.position.x, edge.x - 1); assert.deepEqual(outward.position, edge); assert.ok(outward.hitBoundary);
});
