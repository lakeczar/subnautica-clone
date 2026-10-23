// Shared by tests/m2-hunter-reconciliation.test.ts and its heavy tier file (TT-1); not a test file itself.
import { createGame, makeVehicle } from "../src/sim/state.js";
import { encounterRotation, add } from "../src/sim/hunterQueries.js";
import type { GameState, Vec3 } from "../src/sim/types.js";

export function fixture():GameState {
  const s=createGame();s.opening.phase=4;s.player.mode="swimming";s.player.pose.position={x:132,y:-110,z:-112};
  Object.assign(s.world.threat,{mode:"pursue",modeSeconds:0,interest:12,position:{x:160,y:-110,z:-112}});return s;
}

export function parkedPursuit(yawOffset=0, heightOffset=0, disabled=true):GameState {
  const s=fixture(),v=makeVehicle("parked-dart","dart",
    {x:122.2388436138658,y:-102.78398623796338,z:-99.79702216882471},"parked-hold");
  v.pose.yaw=1.51659265358977+yawOffset;v.pose.pitch=1.734723475976807e-16;
  v.disabled=disabled;v.health=disabled?0:100;s.fleet.vehicles=[v];s.tick=12645;
  const at=(p:Vec3):Vec3=>add(v.pose.position,encounterRotation(p,v.pose.yaw,v.pose.pitch));
  s.player.pose.position=at({x:-14,y:heightOffset,z:0});s.player.velocity={x:0,y:0,z:0};
  s.world.threat.position=at({x:-5.54327719506773,y:0,z:-2.29610059419053});
  return s;
}
