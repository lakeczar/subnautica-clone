/** CR-1: every threat's natural, non-combat way through (owner, 2026-10-22).
 * Each comes from the animal's own behaviour on a creature cycle
 * (content/currents/cycles.ts): the sound hunter's feeding round, the stalkers
 * feeding in the venting plume, the skates resting deep in slack water and the
 * choir closing to rest. While an animal is `busy` it hears and sees nothing,
 * never escalates, and breaks off any encounter; afterwards it starts again
 * from rest, so ENC-1's warning ladder applies in full.
 *
 * Readable without text: the animal visibly leaves, feeds, sinks or closes.
 * The first time a window is watched, a short caption names it and the
 * journal's cycles tab starts timing it. */
import { CHOIR_REST, HUNTER_FEEDING, SKATE_LAYING, SKATE_REST, STALKER_FEEDING } from "../currents/cycles.js";
import type { CycleDef } from "../../sim/cycles/cycle.js";
import { at } from "../ecology/sites.js";
import type { SiteOffset } from "../ecology/sites.js";
import type { ThreatAgentId, ThreatSpeciesId } from "../ecology/species.js";

export type WindowSpecies = ThreatSpeciesId | "canopy_sound_hunter";
/** One window per species, plus the skates' rarer laying visit. */
export type WindowId = WindowSpecies | "layer_skate_laying";
export interface ThreatWindow {
  readonly species: WindowSpecies;
  readonly cycle: CycleDef;
  /** Phases in which the animal is away, feeding or resting: it perceives nothing. */
  readonly busy: readonly string[];
  /** Metres within which (with a clear sight line) the animal's rhythm can be watched. */
  readonly sight: number;
  /** First-sight captions while it is busy, and while it is not. */
  readonly seenBusy: string;
  readonly seenIdle: string;
  /** Caption when it breaks off an encounter because its window began. */
  readonly breakOff: string;
}

export const THREAT_WINDOWS: Readonly<Record<WindowId, ThreatWindow>> = {
  canopy_sound_hunter: {
    species: "canopy_sound_hunter", cycle: HUNTER_FEEDING, busy: ["leaving", "away", "returning"], sight: 90,
    seenBusy: "The sound hunter has left its crowns to feed on the lantern shoal to the east. While it feeds it hears almost nothing: this is the time to cross.",
    seenIdle: "A sound hunter keeps these crowns. It leaves to feed on the east shoal at regular times; watch for the shoal bunching.",
    breakOff: "The hunter breaks off and turns east toward the lantern shoal to feed.",
  },
  glare_stalker: {
    species: "glare_stalker", cycle: STALKER_FEEDING, busy: ["turning", "feeding", "lingering"], sight: 70,
    seenBusy: "Both stalkers are up in the venting plume, snapping at what it lifts. While the chimney vents they hunt nothing else: the passage is open.",
    seenIdle: "Glare stalkers hunt this warm passage, but every vent they rise into the plume to feed. Watch the mites: when they leave the lip, the stalkers go too.",
    breakOff: "The stalker's lights swing to the venting chimney; it breaks off to feed in the plume.",
  },
  layer_skate: {
    species: "layer_skate", cycle: SKATE_REST, busy: ["fall", "quiet"], sight: 70,
    seenBusy: "In slack water the skates sink deep into the brine and rest. The layer's surface is still: cross while the crest ribbons stand upright.",
    seenIdle: "Layer skates patrol the mirror while the crest current runs. When it slackens and the ribbons stand upright, they sink to rest.",
    breakOff: "The current eases; the skate sinks away from the layer to rest.",
  },
  hollow_choir: {
    species: "hollow_choir", cycle: CHOIR_REST, busy: ["closing", "closed"], sight: 55,
    seenBusy: "The choir's bells have folded shut to rest; closed, they barely hear. Coast through while they stay closed.",
    seenIdle: "The hollow choir rests at regular times: its rims dim and the bells fold shut. Closed bells barely hear.",
    breakOff: "The bells fold shut to rest; the hum dies away.",
  },
  layer_skate_laying: {
    species: "layer_skate", cycle: SKATE_LAYING, busy: ["leaving", "laying", "returning"], sight: 70,
    seenBusy: "Layer skates have left the dense water to lay on the lee shelf. While they are away the mirror is unguarded.",
    seenIdle: "Layer skates leave the dense water only to lay, here on the lee shelf. Their egg cases are protected.",
    breakOff: "The skate turns north under the mirror, toward the lee shelf to lay.",
  },
};
export const WINDOW_IDS = Object.keys(THREAT_WINDOWS) as WindowId[];

/** Where each animal goes while busy: a feeding spot (site-relative), or
 * `deep` (sink below its home into the dense water) or `stay` (sessile). */
export const WINDOW_SPOTS: Readonly<Record<ThreatAgentId, SiteOffset | "deep" | "stay">> = {
  // In the plume's rising wash above the chimney's west lip, over the passage roof.
  rift_stalker_passage: at("rift_split_chimney", -10, 26, 4),
  rift_stalker_chimney: at("rift_split_chimney", -4, 34, -8),
  divide_skate_saddle: "deep",
  divide_skate_east: "deep",
  district_choir_gallery: "stay",
  district_choir_terrace: "stay",
};
/** How far below its home a resting skate sinks. */
export const SKATE_REST_DEPTH = 14;
/** Where the skates lay: their egg cases on the lee shelf, above the brine
 * (`divide_skate_eggcases`). While laying they circle it this close. */
export const SKATE_LAYING_SITE = { x: 424, y: -380.56, z: -1146 } as const;
export const SKATE_LAYING_RADIUS = 5;
/** Leaving to lay, the saddle skates head north and down under the mirror, out
 * of sight of anyone at the saddle, toward the shelf (metres from home). */
export const SKATE_LAYING_AWAY = { x: -14, y: -20, z: 32 } as const;
/** The sound hunter's feeding shoal, east of its home crowns (55 m out, inside
 * its 72 m territory and about 70 m from the lab), and the circle it swims there. */
export const HUNTER_FEEDING_SPOT = { x: 186, y: -110, z: -112 } as const;
export const HUNTER_FEEDING_CIRCLE = { radius: 4, period: 9 } as const;
/** Travel speed of the hunter on its round, m/s: its 55–59 m leg fits the 8 s phase. */
export const HUNTER_ROUND_SPEED = 8;
