// M2 hunter reconciliation, heavy tier (TT-1): the retained 1800-step stall and the
// 600-step damage runs. tests/m2-hunter-reconciliation.test.ts keeps the rest and fast smokes.
import test from "node:test";
import assert from "node:assert/strict";
import * as hunter from "../src/sim/hunter.js";
import { updateThreat } from "../src/sim/survival.js";
import { createWorldQueries, hullClearance } from "../src/sim/world.js";
import { HUNTER_GEOMETRY as H } from "../src/content/encounterGeometry.js";
import { HUNTER_ENCOUNTER } from "../src/content/ecology/encounter.js";
import { parkedPursuit } from "./m2-hunter-reconciliation-support.js";

test("parked-Dart pursuit resumes contact approaches throughout the retained 1800-step stall",()=>{
  // Minimal motion-only version of Astra/root's schema-valid real12645
  // derivative. Keep the actor alive for the full 30 seconds without changing
  // damage rules; the separate updateThreat case below exercises actual loss.
  const s=parkedPursuit(),world=createWorldQueries(),vehicle=structuredClone(s.fleet.vehicles),player=structuredClone(s.player);
  let stationary=0,maxStationary=0,travelled=0,contacts=0,contactRuns=0,wasBiting=false,closest=Infinity;
  for(let i=0;i<1800;i++) {
    s.tick++;s.world.threat.modeSeconds+=1/60;
    const start={...s.world.threat.position},from=hunter.hunterPose(s),motion=hunter.moveHunter(s,world);
    const distance=Math.hypot(motion.position.x-start.x,motion.position.y-start.y,motion.position.z-start.z);
    assert.ok(distance<=(motion.yielding?H.yieldSpeed:H.approachSpeed)/60+1e-8,"existing movement rate");
    assert.ok(hunter.hunterFleetSweep(s,start,motion.position,from,hunter.hunterPose(s,motion.position)),"continuous fleet safety, including retained overlap");
    assert.ok(hullClearance(world,motion.position,H.worldEnvelope),"actual-world clearance");
    s.world.threat.position=motion.position;
    if(distance<1e-8)stationary++;else stationary=0;
    maxStationary=Math.max(maxStationary,stationary);travelled+=distance;closest=Math.min(closest,motion.contact.gap);
    if(motion.contact.biting) {
      contacts++;if(!wasBiting)contactRuns++;
      assert.ok(motion.contact.clear&&!motion.contact.penetrating&&motion.contact.gap<=H.reach);
      assert.ok(!hunter.hunterFleetObstruction(s).penetrating,"no bite through parked hull");
      assert.ok(!hunter.hunterPhase(s).withdrawing);
    }
    wasBiting=motion.contact.biting;
  }
  assert.ok(maxStationary<120,`pursuit remained stationary for ${maxStationary} steps`);
  assert.ok(closest<=H.reach&&contacts>100&&contactRuns>=6,"repeated valid approaches, rather than harmless oscillation");
  assert.ok(travelled>40,"meaningful approach and withdrawal over the full repro");
  assert.deepEqual(s.fleet.vehicles,vehicle);assert.deepEqual(s.player,player);
});

test("level fallback preserves safe contact and damage rates at nearby parked-Dart orientations and heights",()=>{
  for(const [yaw,height,disabled] of [[0,0,true],[-.1,.25,false],[.1,-.25,true]] as const) {
    const s=parkedPursuit(yaw,height,disabled),world=createWorldQueries(),vehicle=structuredClone(s.fleet.vehicles);
    let damage=0,firstContact=-1;
    for(let i=0;i<600;i++) {
      s.tick++;const start={...s.world.threat.position},from=hunter.hunterPose(s),events:Parameters<typeof updateThreat>[2]=[];
      const penetrating=hunter.hunterPenetratesActor(s)||hunter.hunterFleetObstruction(s).penetrating;
      updateThreat(s,1,events,world);
      const end=s.world.threat.position;
      assert.ok(Math.hypot(end.x-start.x,end.y-start.y,end.z-start.z)<=(penetrating?H.yieldSpeed:H.approachSpeed)/60+1e-8);
      assert.ok(hunter.hunterFleetSweep(s,start,end,from,hunter.hunterPose(s)));
      assert.ok(hullClearance(world,end,H.worldEnvelope));
      for(const event of events)if(event.type==="threat-damage") {
        // ENC-1: the bite starts this cycle's withdrawal; probe its contact phase.
        const probe=structuredClone(s);probe.world.threat.modeSeconds=Math.floor(s.world.threat.modeSeconds/H.cycleSeconds)*H.cycleSeconds;
        const contact=hunter.hunterContact(probe,end,world);
        assert.ok(!penetrating&&contact.biting&&contact.clear&&!contact.penetrating&&contact.gap<=H.reach);
        assert.ok(!hunter.hunterFleetObstruction(s).penetrating);
        assert.deepEqual(event.target,{kind:"diver"});assert.ok(event.loss>0&&event.loss<=Math.max(...HUNTER_ENCOUNTER.bites.diver)+1e-10);
        damage+=event.loss;if(firstContact<0)firstContact=i;
      }
    }
    assert.ok(firstContact>=0&&firstContact<180,`${yaw}/${height}: bounded resumed approach`);
    assert.ok(damage>10,`${yaw}/${height}: meaningful danger`);assert.deepEqual(s.fleet.vehicles,vehicle);
    assert.equal(s.world.threat.mode,"pursue");assert.equal(s.world.threat.interest,HUNTER_ENCOUNTER.interest.max);
  }
});
