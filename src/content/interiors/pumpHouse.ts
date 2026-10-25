/** ENV-1: the old intake pump house on the Hearth Reef (LS-1's site
 * `reef_pumphouse_site`). One cheerful room: the crew's sign, scrapers racked,
 * a lunch tin, their painted tally of the fans' growth, and the pump pit where
 * the fans have grown in through the grate. The sealed log cabinet (LS-1's
 * logger) stands at the site's position in the north-east corner. A door and a
 * roof hatch are the two ways out. LS-1 stage 3 places it with its exterior set. */
import { CB_LOST_SITES } from "../systems/lostSites.js";
import { OUTSIDE, type InteriorDef } from "./types.js";
import { lowestFloor, place, slab, v, wall } from "./build.js";

const H = 3.6, ROOF = 3.9;
/** The logger's local position (LS-1's site point, on the floor): the anchor puts it on the site.
 * The cabinet stands just behind it against the north wall, facing into the room. */
const LOGGER = v(3.6, 0, 2.4);
const site = CB_LOST_SITES.reef_pumphouse_site.position;
const ax = site.x - LOGGER.x, az = site.z - LOGGER.z;

export const PUMP_HOUSE: InteriorDef = {
  id: "reef_pump_house", label: "Old intake pump house", region: "refuge_reef", site: "reef_pumphouse_site",
  anchor: v(ax, lowestFloor(ax, az, 4.25, 3.25), az), quarter: 0,
  rooms: [{ id: "hall", role: "chamber", label: "Pump hall", falloff: 6, bounds: { min: v(-4, 0, -3), max: v(4, H, 3) } }],
  portals: [
    { id: "door", kind: "door", label: "Door", between: ["hall", OUTSIDE], center: v(0, 1.05, -3.125), normal: v(0, 0, -1), clear: { width: 1.2, height: 2.1 }, admits: ["diver"] },
    { id: "roof_hatch", kind: "hatch", label: "Roof hatch", between: ["hall", OUTSIDE], center: v(1.5, ROOF, 1), normal: v(0, 1, 0), clear: { width: 1.2, height: 1.2 }, admits: ["diver"] },
  ],
  staging: [{ id: "above_door", role: "craft_parking", label: "Above the door", position: v(0, 6, -6), radius: 5, profiles: ["small"], yaw: 0, approach: v(0, 20, -6) }],
  shell: [
    ...slab("floor", "floor", -4.25, 4.25, -3.25, 3.25, -0.4, 0),
    ...slab("roof", "roof", -4.25, 4.25, -3.25, 3.25, H, ROOF, [{ x0: 0.9, x1: 2.1, z0: 0.4, z1: 1.6 }]),
    ...wall("south", "x", -4.25, 4.25, -3.25, -3, 0, H, [{ a: -0.6, b: 0.6, y0: 0, y1: 2.1 }]),
    ...wall("north", "x", -4.25, 4.25, 3, 3.25, 0, H),
    ...wall("west", "z", -3, 3, -4.25, -4, 0, H),
    ...wall("east", "z", -3, 3, 4, 4.25, 0, H),
  ],
  dressing: [
    place("sign", "sign", v(0, 2.6, 2.98)),
    place("scrapers", "scraper_rack", v(3.97, 1.2, -0.5), 1),
    place("bench", "bench", v(2.6, 0, -2.7), 0, "structure"),
    place("lunch_tin", "lunch_tin", v(2.3, 0.8, -2.7), 0, "clutter"),
    place("mug", "mug", v(2.9, 0.8, -2.7), 0, "clutter"),
    place("tally", "tally_wall", v(-3.99, 1.6, -1), 1),
    place("pump", "pump_housing", v(-2.5, 0, 1.5), 0, "structure"),
    place("valve", "valve_wheel", v(-2.5, 1.2, 1.5), 0, "clutter"),
    place("fans_grate", "fan_growth", v(-2.5, 0, 0)),
    place("fans_pump", "fan_growth", v(-1.3, 0, 1.5)),
    place("fans_cabinet", "fan_growth", v(3.4, 1.2, 2.3)),
    place("cabinet", "log_cabinet", v(LOGGER.x, 0, LOGGER.z + 0.25), 2, "structure"),
  ],
  stacks: [],
  lights: [],
  sounds: [{ id: "inflow", at: v(-2.5, 0.5, 0.2), cue: "pump_house_inflow", caption: "A soft hiss of water drawn in, from the far corner" }],
  hosts: [{ kind: "lost_site", id: "reef_pumphouse_site" }],
  // A swimmer can reach it before any craft; the bot decodes it after the Dart.
  firstAccess: [
    // Swum down from the surface: open water above the door, under a clear rise.
    { route: "creel", milestone: "reef", craft: null, staging: null, origin: v(0, 21, -6) },
    { route: "creel", milestone: "systems", craft: "dart", staging: "above_door" },
  ],
  replaces: [],
};
