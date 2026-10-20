/** Carrier interfaces played through real commands: the helm, the dry interior
 * (walked around the game's own interior solids) and the exterior vestibule. */
import { CARRIER_LAYOUT, carrierInteriorSolids, localToWorld } from "../../src/sim/carrier.js";
import { createWorldQueries } from "../../src/sim/world.js";
import type { Vec3, VehicleState } from "../../src/sim/types.js";
import { unload } from "./actions.js";
import { Blocked, Driver, where } from "./driver.js";
import { gridPath } from "./nav.js";
import { route, travel } from "./travel.js";

// ASSUME (carrier): the Hearthline is piloted like any hull, station keeping frees the
// helm, the diver walks the dry interior to the aft vestibule and leaves through it,
// and re-enters within 5 m of the exterior vestibule (sim/carrier.ts today).
export const carrier = (d: Driver): VehicleState => {
  const h = d.vehicle("hearthline");
  if (!h) throw new Blocked("No Hearthline owned", where(d.state));
  return h;
};
/** Compact berths leave one walkway between bow and stern: the 0.84 m strip between
 * the berth-room walls, passable only on centre lines near x 0.0–0.1 (game movement). */
const COMPACT_LANE = { x: 0.05, aft: 5.6, fore: -3.4 } as const;
/** Walk the dry interior in the carrier frame, routed around its rooms, fixtures and
 * berthed craft (the game's own interior solids, queried read-only). */
export function walkAboard(d: Driver, local: Vec3, label: string): void {
  const h = carrier(d), here = d.state.player.interiorPose?.position;
  if (!here) throw new Blocked(`Not inside the carrier to walk ${label}`, where(d.state));
  const solids = createWorldQueries(carrierInteriorSolids(d.state), () => -200), b = CARRIER_LAYOUT.interior;
  const open = (x: number, z: number): boolean => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ &&
    solids.clearance({ x, y: here.y + 0.02, z }, { radius: 0.36, height: 1.75 });
  const leg = (from: Vec3, to: Vec3): Vec3[] => gridPath(from, to, here.y, 0.25, 2, open, "interior");
  const crosses = d.state.fleet.docking?.configuration === "compact" &&
    ((here.z > COMPACT_LANE.aft && local.z < COMPACT_LANE.fore) || (here.z < COMPACT_LANE.fore && local.z > COMPACT_LANE.aft));
  let path: Vec3[];
  if (crosses) {
    const [near, far] = here.z > local.z ? [COMPACT_LANE.aft, COMPACT_LANE.fore] : [COMPACT_LANE.fore, COMPACT_LANE.aft];
    const a = { x: COMPACT_LANE.x, y: here.y, z: near }, z = { x: COMPACT_LANE.x, y: here.y, z: far };
    path = [...leg(here, a), z, ...leg(z, local)];
  } else path = leg(here, local);
  travel(d, route(`carrier ${label}`, "diver", "dry interior walk, A* over the interior solids, played",
    path.map((q, i) => ({ ...localToWorld(q, h), land: true, tolerance: i === path.length - 1 ? 0.5 : 0.08 }))));
}
/** From the helm: hold station, walk aft and swim out of the vestibule. */
export function carrierOut(d: Driver): void {
  d.command({ type: "carrier", action: "station-keep" });
  d.command({ type: "carrier", action: "leave-helm" });
  exitCarrier(d);
}
/** Back through the exterior vestibule, stow the diver hold in the stores, take the helm. */
export function carrierIn(d: Driver): void {
  const h = carrier(d);
  enterCarrier(d);
  unload(d, "diver", h.cargoId);
  walkAboard(d, CARRIER_LAYOUT.helm, "to the helm");
  d.command({ type: "carrier", action: "helm" });
}

/** Swim to the exterior vestibule, engage station keeping there if it is off (the
 * interface answers only within 15 m of the keel datum, and the vestibule is 13.8 m
 * out), then step into the dry interior. */
export function enterCarrier(d: Driver): void {
  const h = carrier(d);
  travel(d, route("to the carrier vestibule", "diver", "local swim, played", [{ ...localToWorld(CARRIER_LAYOUT.exteriorVestibule, h), tolerance: 1 }]));
  const keel = Math.hypot(d.state.player.pose.position.x - h.pose.position.x, d.state.player.pose.position.y - h.pose.position.y,
    d.state.player.pose.position.z - h.pose.position.z);
  if (keel > 15) throw new Blocked(`At the exterior vestibule the diver is ${keel.toFixed(1)} m from the carrier keel; its interface answers within 15 m`, where(d.state));
  if (!d.state.fleet.docking?.stationKeeping) d.command({ type: "carrier", action: "station-keep" });
  d.command({ type: "carrier", action: "enter-interior" });
}
/** From anywhere aboard: walk aft and leave through the vestibule. */
export function exitCarrier(d: Driver): void {
  walkAboard(d, CARRIER_LAYOUT.vestibule, "to the vestibule");
  d.command({ type: "carrier", action: "leave-interior" });
}
