// Shared by the ENC-1 readable-threat tests (not a test file itself): the fast
// tests/enc-1-readable-threats.test.ts and its heavy tier file (TT-1).
import { HUNTER_ENCOUNTER as E } from "../src/content/ecology/encounter.js";
import { CANOPY_BASIN_ROUTE } from "../src/content/routes.js";
import type { HullId } from "../src/content/registry.js";
import { createGame, makeVehicle } from "../src/sim/state.js";
import { completeOpening } from "../src/sim/progression.js";
import { addItem } from "../src/sim/inventory.js";
import { stepGame } from "../src/sim/step.js";
import { createWorldQueries } from "../src/sim/world.js";
import { hunterStandOff } from "../src/sim/hunter.js";
import { hunterBody, viewAngle } from "../src/sim/hunterEncounter.js";
import type { GameCommand, GameEvent, GameState, Vec3 } from "../src/sim/types.js";

export const world = createWorldQueries(), empty = createWorldQueries([], () => -250);
export type Bite = Extract<GameEvent, { type: "threat-damage" }>;
export const bites = (events: readonly GameEvent[]): Bite[] => events.filter((e): e is Bite => e.type === "threat-damage");
export const health = (s: GameState): number => s.fleet.vehicles.find(v => v.id === s.player.controlledVehicleId)?.health ?? s.player.vitals.health;

/** An actor at the hunter's home in pursuit, the animal at its stand-off. */
export function pursuit(hull: HullId | null, hp = 100): GameState {
  const s = createGame(); completeOpening(s); s.tick = 16;
  addItem(s, "suit_150", 1, "equipment", "suit");
  s.player.pose.position = { x: 132, y: -110, z: -112 };
  s.player.mode = hull ? "piloting" : "swimming";
  if (hull) {
    const v = makeVehicle("enc1-hull", hull, s.player.pose.position, "enc1-hold");
    v.health = hp; s.fleet.vehicles.push(v); s.player.controlledVehicleId = v.id;
  } else s.player.vitals.health = hp;
  s.world.threat = { mode: "pursue", position: { x: 147, y: -110, z: -112 }, interest: E.interest.max, modeSeconds: 0, distraction: null, distractionSeconds: 0 };
  s.world.threat.position = hunterStandOff(s);
  return s;
}

/** A craft (or diver) flown along the authored Reef → Canopy route with ordinary commands. */
export function fly(hull: HullId, react: (s: GameState) => { quiet?: boolean; lamp?: boolean; retreat?: boolean } = () => ({}), seconds = 60) {
  let s = createGame(); completeOpening(s); addItem(s, "suit_150", 1, "equipment", "suit");
  const pts = CANOPY_BASIN_ROUTE.upper, v = makeVehicle("enc1-craft", hull, { ...pts[0]! }, "enc1-hold");
  s.fleet.vehicles.push(v); s.player.controlledVehicleId = v.id; s.player.mode = "piloting"; s.player.pose.position = { ...pts[0]! };
  let k = 1, retreating = false;
  const log: { tick: number; mode: string; hp: number; view: number; distance: number; events: GameEvent[] }[] = [];
  for (let i = 0; i < seconds * 60; i++) {
    const want = react(s);
    if (want.retreat) retreating = true;
    const target = retreating ? pts[0]! : pts[Math.min(k, pts.length - 1)]!, p = s.player.pose.position;
    const dx = target.x - p.x, dy = target.y - p.y, dz = target.z - p.z, h = Math.hypot(dx, dz);
    if (!retreating && Math.hypot(dx, dy, dz) < 3 && k < pts.length - 1) k++;
    const done = !retreating && k === pts.length - 1 && Math.hypot(dx, dy, dz) < 3;
    const yaw = Math.atan2(dx, -dz), dyaw = Math.atan2(Math.sin(yaw - s.player.pose.yaw), Math.cos(yaw - s.player.pose.yaw));
    const commands: GameCommand[] = [{ type: "look", yawDelta: dyaw, pitchDelta: Math.atan2(dy, h) - s.player.pose.pitch },
      { type: "move", forward: done ? 0 : 1, right: 0, vertical: 0, sprint: retreating, quiet: want.quiet ?? false }];
    if (want.lamp === false && s.player.lamp) commands.push({ type: "lamp" });
    const r = stepGame(s, commands, world); s = r.state;
    const t = s.world.threat;
    log.push({ tick: s.tick, mode: t.mode, hp: health(s), view: viewAngle(s, hunterBody(s)),
      distance: Math.hypot(t.position.x - s.player.pose.position.x, t.position.y - s.player.pose.position.y, t.position.z - s.player.pose.position.z), events: r.events });
  }
  return { state: s, log };
}

/** A stationary, quiet, dark craft in pursuit at `at`, hunter at its clear stand-off. */
export function stillPursuit(hull: HullId, at: Vec3, hp: number, from: Vec3): GameState {
  const s = createGame(); completeOpening(s); s.tick = 16; addItem(s, "suit_150", 1, "equipment", "suit");
  s.player.mode = "piloting"; s.player.lamp = false; s.player.pose.position = { ...at };
  const v = makeVehicle("enc1-r1", hull, at, "enc1-r1-hold"); v.health = hp;
  s.fleet.vehicles.push(v); s.player.controlledVehicleId = v.id;
  s.world.threat = { mode: "pursue", position: { ...from }, interest: E.interest.max, modeSeconds: 0, distraction: null, distractionSeconds: 0 };
  s.world.threat.position = hunterStandOff(s);
  return s;
}
export const still: GameCommand = { type: "move", forward: 0, right: 0, vertical: 0, sprint: false, quiet: true };
