/** C4: the content bible's exterior lost sites and their decodes (docs/content/
 * BIBLE.md, "Lost sites"), lifted from `src/content/proposals/` with reveal
 * targets resolved. Story-neutral; the lore owner's canon notes stay in
 * docs/spoilers/. Lifted with two deferrals (C4 handoff):
 * - the hub beacon house waits for W2's crown terrain;
 * - reveals of caves that are not built yet, and plans with no rules yet
 *   (locker extension, ping lens, chart fix, thermal tap, current turbine,
 *   beacon array), are left out until their owners land them. Until the locker
 *   extension lands, the pump-house log carries SYS-2's small-fabricator plan,
 *   which had no source: the first decode pays field fabrication.
 * Positions sit on the composed floor. */
import type { RegionId } from "../registry.js";
import type { RevealDefinition } from "./decodes.js";

export const CB_LOST_SITES = {
  reef_pumphouse_site: { label: "Old intake pump house", region: "refuge_reef", position: { x: -380, y: -23.47, z: -20 },
    see: "A dead console behind a hanging door; a pressure log cabinet sealed with fan growth." },
  isles_strain_gauges: { label: "Strain gauge line", region: "island_chain", position: { x: 345, y: -45.41, z: 70 },
    see: "Six anchored gauges in a row across the scar's edge, the last two bent over, a logger housing clamped to the first." },
  canopy_basket_site: { label: "Fallen tether basket", region: "suspended_garden", position: { x: 760, y: -108.62, z: -100 },
    see: "A log unit clamped in the basket frame, its screen dark." },
  basin_pump_heads_site: { label: "Pump-head field", region: "silt_basin", position: { x: 240, y: -260.21, z: -760 },
    see: "A sealed field cabinet on the central pump head." },
  rift_borehole_site: { label: "Core borehole rig", region: "thermal_rift", position: { x: -420, y: -251.36, z: -900 },
    see: "A field hut by the rig, its logger dark and its vent pipe still warm." },
  divide_mixing_site: { label: "Mixing-line station", region: "brine_divide", position: { x: 880, y: -379.2, z: -1150 },
    see: "A sensor house at the foot of a buoy chain, its logger sealed." },
  meridian_allotments_site: { label: "Terrace allotments", region: "deep_district", position: { x: 1150, y: -600.03, z: -1250 },
    see: "A rota board with a sealed data tag on the allotment post." },
} as const satisfies Record<string, { label: string; region: RegionId; position: { x: number; y: number; z: number }; see: string }>;

export const CB_DECODABLES = {
  reef_pumphouse_log: {
    label: "Pump house log", site: "reef_pumphouse_site", region: "refuge_reef", size: "log",
    gates: ["reef_pumphouse_terminal"], blueprints: ["bp_small_fabricator"], story: false,
    reveals: [],
    logs: [
      "Commissioning notes from the expedition's first year: the intake ran clean, and the crew was cheerful about it.",
      "A rota of complaints that fans keep colonising the intake mouth faster than anyone expected.",
      "A shorter later entry moving the intake east, to the ribs, 'where the water is better'.",
    ],
  },
  isles_strain_gauge_log: {
    label: "Gauge logger", site: "isles_strain_gauges", region: "island_chain", size: "log",
    gates: ["isles_gauge_logger"], blueprints: [], story: false,
    reveals: [],
    logs: [
      "Two years of strain readings, flat and then climbing.",
      "Recalibration notes that call the climb instrument drift.",
      "A last technician's entry asking for a slope review, with no reply attached.",
    ],
  },
  canopy_basket_log: {
    label: "Tether crew log", site: "canopy_basket_site", region: "suspended_garden", size: "log",
    gates: ["canopy_basket_unit"], blueprints: ["bp_outpost_standard"], story: false,
    reveals: [],
    logs: [
      "Tether inspections crown by crown, with a running joke about the hunter, which the crew call the singer.",
      "A note that the small fish have moved up out of the lower channel this season.",
      "A field-outpost layout the crew used on their longer inspection runs.",
    ],
  },
  basin_pumphead_log: {
    label: "Pump-head field log", site: "basin_pump_heads_site", region: "silt_basin", size: "log",
    gates: ["basin_pumphead_cabinet"], blueprints: [], story: false,
    reveals: [{ id: "basin_stop_rift_station", label: "Materials station", category: "stop", position: { x: 135.6, y: -262, z: -920 }, radius: 60 }],
    logs: [
      "Two seasons of extraction quotas, each higher than the last.",
      "Pump pressure logs with notes about the sediment 'settling oddly'.",
      "A crew request to slow the west rim pumps, marked as declined.",
    ],
  },
  rift_borehole_log: {
    label: "Drill logger", site: "rift_borehole_site", region: "thermal_rift", size: "log",
    gates: ["rift_borehole_logger"], blueprints: [], story: false,
    reveals: [],
    logs: [
      "Core sample depths and heat readings, shift by shift.",
      "How the crew piped vent heat into the field hut so they could stay out a week.",
      "A map sketch of a tube running east under the flank 'all the way to the cold'.",
    ],
  },
  divide_mixing_log: {
    label: "Mixing-line logger", site: "divide_mixing_site", region: "brine_divide", size: "log",
    gates: ["divide_mixing_logger"], blueprints: [], story: false,
    reveals: [],
    logs: [
      "Brine profiles along the mixing line, with dense-water spikes flagged in red.",
      "Maintenance tickets replacing the 'faulty' sensors that kept reporting them.",
      "A diver's aside: the sails moved lanes that month.",
    ],
  },
  meridian_allotment_log: {
    label: "Allotment rota", site: "meridian_allotments_site", region: "deep_district", size: "log",
    gates: ["meridian_allotment_tag"], blueprints: [], story: false,
    reveals: [],
    logs: [
      "A planting rota with names in rotation and small complaints in the margins.",
      "A note that the night shift's lamps keep the garden awake.",
      "The last entry's crop is listed as 'ready', never collected.",
    ],
  },
} as const satisfies Record<string, { label: string; site: keyof typeof CB_LOST_SITES; region: RegionId;
  size: "fragment" | "log" | "archive" | "core"; gates: readonly string[]; blueprints: readonly string[]; story: false;
  reveals: readonly RevealDefinition[]; logs: readonly string[] }>;
