/** The current objective (C4, M2 audit #5): one practical line, derived from
 * the state every time and never saved. Recovery comes first while a craft is
 * disabled or cargo sits in a cache; otherwise the next milestone on the
 * campaign's frontier, each line naming what to do and where. The game stays
 * unguided: this says what is useful next, not how to play. H shows it first,
 * then the story's own graduated hint as flavour. */
import { HULLS, ITEMS, PLACES, RECIPES } from "../content/registry.js";
import type { RecipeId } from "../content/registry.js";
import { WORKING_STOPS } from "../content/stops.js";
import { DECODABLES } from "../content/systems/decodes.js";
import { bearingWords } from "./objectiveFormat.js";
import { facility } from "./inventory.js";
import type { GameState } from "./types.js";

export interface Objective {
  /** The practical next step, one sentence. */
  readonly step: string;
  /** Recovery outranks progress. */
  readonly kind: "recovery" | "progress" | "story";
}

const crafted = (s: GameState, id: RecipeId): boolean => s.knowledge.crafted.includes(id);
const known = (s: GameState, bp: string): boolean => (s.knowledge.blueprints as string[]).includes(bp);
const cost = (id: RecipeId): string => Object.entries(RECIPES[id].cost)
  .map(([k, q]) => `${q} ${ITEMS[k as keyof typeof ITEMS].label.toLowerCase()}`).join(", ");

/** Recovery steps while something is lost; null when nothing is. */
export function recoveryObjective(s: GameState): string | null {
  const from = s.player.pose.position;
  const loss = s.recovery.losses.map((l) => s.fleet.vehicles.find((v) => v.id === l.vehicleId)).find((v) => !!v);
  if (loss) {
    const where = bearingWords(from, loss.pose.position);
    return `Your ${HULLS[loss.hull].label} is disabled ${where}. Take the Bobbin kit to its collar, then tow it home, patch it in place, or salvage it into a canister (Cargo lists each option).`;
  }
  const cache = s.recovery.caches.find((c) => s.inventory.items.some((i) => i.containerId === c.containerId));
  if (cache) return `Your dropped cargo waits in a ${cache.id.startsWith("canister_") ? "salvage canister" : "cache"} ${bearingWords(from, cache.position)}. Swim within 4 m and open Cargo to take it back.`;
  return null;
}

export function currentObjective(s: GameState): Objective {
  const recovery = recoveryObjective(s);
  if (recovery) return { step: recovery, kind: "recovery" };
  const step = (text: string): Objective => ({ step: text, kind: "progress" });
  if (s.opening.phase < 4) return step("Work through the pod checks: press E at each lit panel.");
  if (!crafted(s, "pod_repair")) return step(`Repair the pod regulator at its bench: ${cost("pod_repair")}, from the reef ribs or the Splitspine shore.`);
  if (!crafted(s, "essential_tools")) return step(`Fabricate the scanner and service tool at the pod bench (${cost("essential_tools")}).`);
  if (!crafted(s, "suit_150")) return step(`Make the 150 m pressure suit at the pod bench (${cost("suit_150")}).`);
  if (!crafted(s, "restore_workshop")) return step(`Restore the Splitspine workshop east of the pod (${bearingWords(s.player.pose.position, PLACES.island_workshop.position)}): it builds craft and refits.`);
  const craft = s.fleet.vehicles.filter((v) => v.hull !== "hearthline");
  if (!craft.length) return step("Build a first craft at the workshop: the Dart for reach, or the Creel for cargo. The Creel needs one tagged frame from the Canopy's 150 m south rim.");
  if (known(s, "bp_field_outpost") && !crafted(s, "outpost_kit_basic") && !s.systems.outposts.length)
    return step(`Make a basic field outpost kit at the pod bench (${cost("outpost_kit_basic")}) and deploy it on a ledge where you keep working: it charges moored craft and holds a locker.`);
  if (!crafted(s, "suit_350")) return step("Refit the suit to 350 m at the workshop: a tagged frame from the Canopy's south rim, crust and cured resin from the Canopy, membrane from the reef.");
  if (!crafted(s, "restore_canopy_stop")) return step("Restore the outer-crown mooring on the Canopy's east margin: a tagged frame, glass and crust. Its mast charges craft and does 350 m refits.");
  const undecoded = s.systems.found.filter((d) => !s.systems.decoded.includes(d) && !s.systems.decodes.some((j) => j.decodable === d));
  if (undecoded.length && known(s, "bp_decoder"))
    return step(`Decode ${DECODABLES[undecoded[0]!].label} at a powered decoder module (pod, workshop, a restored stop or an outpost): it runs in the background while you work nearby.`);
  if (!crafted(s, "suit_450")) return step("Cut thermal core on the Rift's 350 m lower ledges (north and west walls, cool water), then refit to 450 m at the workshop or the restored Rift materials station.");
  if (!facility(s, "rift_station")) return step(`Restore the ${WORKING_STOPS.rift_station.label}: air, rest and 450 m refits on the Rift shoulder.`);
  if (!crafted(s, "suit_800")) return step("Workable lattice lines the Divide's 450 m east-flank ledges, north of the brine field. Bring it back for the 800 m refits at the workshop or the Divide dock.");
  if (!facility(s, "divide_dock")) return step(`Restore the ${WORKING_STOPS.divide_dock.label}: the forward air stop and 800 m refits.`);
  return { step: "Follow the open leads in your notebook toward the Meridian terraces.", kind: "story" };
}
