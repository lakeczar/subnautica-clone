import type { RegionId } from "../registry.js";
import type { Aabb } from "../../world/types.js";
import { BRINE_Y, RIFT_AXIS } from "./terrain.js";
import type { Protection } from "./passages.js";

/** Hazard volumes the ecology stream (S4) attaches behaviour to. Boxes are
 * conservative: a point inside is exposed. `protection` names the gear that
 * makes the volume safe to work in; `null` means it is a readable condition
 * (visibility, current, darkness) that never gates progress. First-access
 * deposits and rescue tethers must stay outside every volume with a
 * protection. `cycle` proposes a readable pulse for timing-based play. */
export type HazardKind = "heat" | "brine" | "sediment" | "current" | "darkness";
export interface HazardDef {
  readonly id: string;
  readonly region: RegionId;
  readonly kind: HazardKind;
  readonly bounds: Aabb;
  readonly protection: Protection | null;
  /** What the player can observe before exposure (never colour alone). */
  readonly cue: string;
  readonly cycle?: { readonly periodS: number; readonly activeS: number };
}

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Aabb =>
  ({ min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } });

/** Warm trench floor: small boxes along the active middle of the Rift axis,
 * below the ledges, so no box reaches the cooled shoulders. */
function trenchBoxes(): HazardDef[] {
  const out: HazardDef[] = [];
  let run = 0, total = 0;
  for (let i = 0; i < RIFT_AXIS.length - 1; i++)
    total += Math.hypot(RIFT_AXIS[i + 1]![0] - RIFT_AXIS[i]![0], RIFT_AXIS[i + 1]![1] - RIFT_AXIS[i]![1]);
  let n = 0;
  for (let i = 0; i < RIFT_AXIS.length - 1; i++) {
    const [ax, az] = RIFT_AXIS[i]!, [bx, bz] = RIFT_AXIS[i + 1]!, len = Math.hypot(bx - ax, bz - az);
    for (let s = 0; s < len; s += 40) {
      const t = (run + s) / total;
      if (t >= 0.24 && t <= 0.82) {
        const x = ax + (bx - ax) * s / len, z = az + (bz - az) * s / len;
        out.push({ id: `hazard.rift.trench_${String(n++).padStart(2, "0")}`, region: "thermal_rift", kind: "heat",
          bounds: box(x - 24, -580, z - 24, x + 24, -425, z + 24), protection: "thermal",
          cue: "Shimmering water and closed fans along the trench floor; hull temperature rises before damage." });
      }
    }
    run += len;
  }
  return out;
}

export const HAZARDS: readonly HazardDef[] = [
  ...trenchBoxes(),
  { id: "hazard.rift.chimney_plume", region: "thermal_rift", kind: "heat", protection: "thermal",
    bounds: box(-198, -548, -1098, -132, -215, -1032),
    cue: "A visible warm column over the split chimney; drifting particles rise fast inside it." },
  { id: "hazard.rift.chimney_pulse", region: "thermal_rift", kind: "heat", protection: "thermal",
    bounds: box(-210, -548, -1110, -112, -380, -1020), cycle: { periodS: 90, activeS: 35 },
    cue: "The chimney breathes: fans beside it close a few seconds before each warm pulse spreads." },
  { id: "hazard.rift.vent_field", region: "thermal_rift", kind: "heat", protection: "thermal",
    bounds: box(-330, -570, -1300, -250, -440, -1210),
    cue: "Small active vents with orange rims on the southern trench floor." },
  { id: "hazard.divide.brine_south", region: "brine_divide", kind: "brine", protection: "chemical",
    bounds: box(180, -800, -1632, 950, BRINE_Y, -1280),
    cue: "A mirror-flat interface; below it the water is still, heavy and visibly layered, and fans are absent." },
  { id: "hazard.divide.crest_current", region: "brine_divide", kind: "current", protection: null,
    bounds: box(200, -372, -1282, 960, -330, -1215),
    cue: "Ribbon colonies lean hard over the crest; light hulls drift south toward the mirror." },
  { id: "hazard.basin.plume_west", region: "silt_basin", kind: "sediment", protection: null,
    bounds: box(160, -392, -900, 300, -300, -690),
    cue: "Scavengers retreat and suspended grains thicken before a surge clouds the lane." },
  { id: "hazard.basin.plume_south", region: "silt_basin", kind: "sediment", protection: null,
    bounds: box(620, -392, -940, 900, -320, -700),
    cue: "A second plume lane off the fractured south slope; the ridge crests stay clear." },
  { id: "hazard.meridian.dark_works", region: "deep_district", kind: "darkness", protection: null,
    bounds: box(1250, -800, -1632, 1472, -700, -1400),
    cue: "No surface light reaches the works; service lamps mark the safe lanes." },
];
