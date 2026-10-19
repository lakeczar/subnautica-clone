/** Frozen schema3 expedition.4 domain at dae17fcf38ae2e08cb778ebb4c0a04df92eeb072
 * (production 35c2d22473ff17ed907c62362c25d17ed47cbcd0), generated from that build.
 * Decode-only. Never extend these definitions with current content. */
export const BLUEPRINTS = ["bp_pod_checklist","bp_reef_recovery","bp_island_workshop","bp_carrier_workshop","bp_canopy_reinforcement","bp_creel_service","bp_carrier_basin","bp_rift_pressure"] as const;
export const EVIDENCE = {
  "C01": {"provenance":"Home pod / regulator serial and repair checklist"},
  "C02": {"provenance":"Hearth Reef / intake inspection and living colony"},
  "C03": {"provenance":"Splitspine / workshop ledger and physical stock"},
  "C04": {"provenance":"Upper Canopy / field sheet and present fauna distribution"},
  "C05": {"provenance":"Pale Basin dormitory / D0 +04:20 transfer tags; Tavi Orr +04:40 witness note"},
  "C06": {"provenance":"Pale Basin boundary station / D−12 profile; D0 +00:35 trace and fractured slope"},
} as const;
export const EVIDENCE_BLUEPRINTS = {
  "C01": ["bp_pod_checklist"],
  "C02": ["bp_reef_recovery"],
  "C03": ["bp_island_workshop","bp_carrier_workshop"],
  "C04": ["bp_canopy_reinforcement"],
  "C05": ["bp_creel_service","bp_carrier_basin"],
  "C06": ["bp_rift_pressure"],
} as const;
export const HULLS = {
  "dart": {"berth":"compact"},
  "creel": {"berth":"medium"},
  "hush": {"berth":"compact"},
  "spindle": {"berth":"compact"},
  "mantle": {"berth":"medium"},
  "hearthline": {"berth":null},
} as const;
export const ITEMS = {
  "structural_alloy": {"cu":2},
  "silica_glass": {"cu":1},
  "flex_membrane": {"cu":1},
  "conductive_crust": {"cu":1},
  "buoyant_resin": {"cu":1},
  "pressure_ceramic": {"cu":2},
  "thermal_core": {"cu":2},
  "brine_lattice": {"cu":2},
  "meal": {"cu":1},
  "essential_tools": {"cu":2},
  "suit_150": {"cu":3},
  "suit_350": {"cu":3},
  "salvage_buoy": {"cu":2},
  "reserve_cell": {"cu":2},
  "bobbin_kit": {"cu":6},
  "dart_acoustic_trim": {"cu":2},
} as const;
export const PLACES = {
  "home_pod": {},
  "reef_ribs": {},
  "island_workshop": {},
  "canopy_lab": {},
  "splitspine_shore": {},
  "basin_dormitory": {},
  "basin_boundary_station": {},
} as const;
export const RECIPES = {
  "pod_repair": {"bp":"bp_pod_checklist","needs":[],"cost":{"structural_alloy":2,"silica_glass":1,"flex_membrane":2}},
  "essential_tools": {"bp":"bp_pod_checklist","needs":["pod_repair"],"cost":{"structural_alloy":1,"silica_glass":3,"flex_membrane":1}},
  "suit_150": {"bp":"bp_pod_checklist","needs":["essential_tools"],"cost":{"structural_alloy":1,"flex_membrane":3}},
  "restore_workshop": {"bp":"bp_island_workshop","needs":["essential_tools"],"cost":{"structural_alloy":3,"silica_glass":1}},
  "salvage_buoy": {"bp":"bp_reef_recovery","needs":["essential_tools"],"cost":{"structural_alloy":1,"silica_glass":1,"flex_membrane":2}},
  "reserve_cells": {"bp":"bp_pod_checklist","needs":["essential_tools"],"cost":{"structural_alloy":2,"silica_glass":2,"flex_membrane":2}},
  "bobbin_kit": {"bp":"bp_reef_recovery","needs":["essential_tools"],"cost":{"structural_alloy":2,"silica_glass":1,"flex_membrane":3}},
  "dart_base": {"bp":"bp_island_workshop","needs":["restore_workshop","suit_150"],"cost":{"structural_alloy":6,"silica_glass":3,"flex_membrane":2}},
  "dart_acoustic_trim": {"bp":"bp_canopy_reinforcement","needs":["dart_base"],"cost":{"conductive_crust":2,"buoyant_resin":2}},
  "suit_350": {"bp":"bp_canopy_reinforcement","needs":["suit_150"],"cost":{"structural_alloy":2,"flex_membrane":2,"conductive_crust":4,"buoyant_resin":4}},
} as const;
export const SOURCES = {
  "reef_service_scraps_east": {"item":"structural_alloy","stock":8,"reserve":8},
  "reef_service_scraps_west": {"item":"structural_alloy","stock":8,"reserve":8},
  "reef_glass_ridge_north": {"item":"silica_glass","stock":8,"reserve":8},
  "reef_glass_ridge_south": {"item":"silica_glass","stock":8,"reserve":8},
  "reef_ribbon_catch_north": {"item":"flex_membrane","stock":12,"reserve":12},
  "reef_ribbon_catch_south": {"item":"flex_membrane","stock":12,"reserve":12},
  "island_workshop_scraps": {"item":"structural_alloy","stock":18,"reserve":8},
  "island_headland_scraps": {"item":"structural_alloy","stock":18,"reserve":8},
  "island_glass_ledge_east": {"item":"silica_glass","stock":10,"reserve":8},
  "island_glass_ledge_west": {"item":"silica_glass","stock":10,"reserve":8},
  "island_resin_cove_east": {"item":"buoyant_resin","stock":6,"reserve":6},
  "island_resin_cove_west": {"item":"buoyant_resin","stock":6,"reserve":6},
  "canopy_grounding_fins_upper": {"item":"conductive_crust","stock":14,"reserve":8},
  "canopy_grounding_fins_lower": {"item":"conductive_crust","stock":14,"reserve":8},
  "canopy_resin_lee_upper": {"item":"buoyant_resin","stock":12,"reserve":8},
  "canopy_resin_lee_lower": {"item":"buoyant_resin","stock":12,"reserve":8},
  "reef_edible_school_north": {"item":"meal","stock":8,"reserve":0},
  "reef_edible_school_south": {"item":"meal","stock":8,"reserve":0},
  "island_shore_crop_east": {"item":"meal","stock":8,"reserve":0},
  "island_shore_crop_west": {"item":"meal","stock":8,"reserve":0},
  "basin_ridge_salvage_north": {"item":"structural_alloy","stock":20,"reserve":8},
  "basin_ridge_salvage_south": {"item":"structural_alloy","stock":20,"reserve":8},
  "basin_survey_fins_east": {"item":"conductive_crust","stock":14,"reserve":8},
  "basin_survey_fins_west": {"item":"conductive_crust","stock":14,"reserve":8},
} as const;
export const MODULES = {"dart_acoustic_trim":{"hull":"dart"}} as const;
export const WORLD_BOUNDS = {
  "minX": -76,
  "maxX": 248,
  "minZ": -260,
  "maxZ": 66,
} as const;
export const LEGACY_WORLD_BOUNDS = {
  "minX": -76,
  "maxX": 188,
  "minZ": -184,
  "maxZ": 66,
} as const;
export const WORLD_VERTICAL_BOUNDS = {"minY":-240,"maxY":100} as const;
export const RECOVERY_ATTACHMENT = {"canopy":3,"basin":5} as const;
export const SMALL_CRAFT_SOCKETS = 2;
export const BERTH_LOCAL = [{"x":-3,"y":4,"z":1},{"x":3,"y":4,"z":1}] as const;
export const CARRIER_INTERIOR = {
  "minX": -4.7,
  "maxX": 4.7,
  "minZ": -11,
  "maxZ": 10,
  "y": 4,
} as const;
export const CARRIER_SUPPORT = {"x":65,"y":-0.9,"z":12} as const;
