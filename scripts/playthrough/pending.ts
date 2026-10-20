/** The versioned list of content the build under test is EXPECTED to lack: S2, S5
 * and S9 work written but not yet composed into the simulation. Only these keys may
 * report "pending C3"; any other missing capability (a removed recipe, an existing
 * route that no longer reaches, an unplaced host not listed here) blocks the run.
 *
 * Keys name ABSENT IDs (or the one uncomposed bounds condition). A present ID that
 * cannot be used gets a `broken:`/`refused:` key, which this list never holds.
 *
 * Update this list at integration: remove every key the composed build now has. The
 * run fails while any listed key is already present (see `staleExpected`), so the
 * list can only shrink as content lands. */
import { stillMissing } from "./content.js";

export const EXPECTED_PENDING_BASE = "root a09968b · S2 706535b, S5 476a044, S9 a67c76a uncomposed in the simulation";

export const EXPECTED_PENDING: ReadonlySet<string> = new Set([
  // S9 recipes (not in the root registry; C3 composes them).
  "recipe:suit_450", "recipe:suit_800", "recipe:creel_450", "recipe:creel_800",
  "recipe:restore_rift_station", "recipe:restore_divide_stop",
  "recipe:hearthline_keel", "recipe:hearthline_base", "recipe:hearthline_550", "recipe:mantle_base",
  "hull:hearthline", "hull:mantle",
  // S9 deposits, not in the root registry.
  "source:rift_ceramic_lip_north", "source:rift_ceramic_lip_south",
  "source:rift_core_shoulder_north", "source:rift_core_shoulder_west",
  "source:divide_lattice_ledge_west", "source:divide_lattice_ledge_east",
  // S2's routes and sites are present; the simulation still runs B1's bounds, so the
  // ones beyond them are unreachable. Only that condition is pending: a route or site
  // outside S1's frame, or outside the lifted bounds, is broken and blocks.
  "bounds:b1-simulation",
  // S5 story sites and hosts not yet placed.
  "story-site:rift_materials_station", "story-site:divide_upper_dock", "story-site:divide_turbine_hall",
  "story-site:splitspine_field_shelter", "story-site:meridian_transfer_hall", "story-site:meridian_medical_annex",
  "story-site:meridian_gate_hall", "story-site:meridian_upper_hall", "story-site:meridian_service_window",
  "story-host:rift_station_ledger", "story-host:C07", "story-host:ren_access_log", "story-host:C11",
  "story-host:mara_last_page", "story-host:C12", "story-host:C08", "story-host:C10", "story-host:iona_ledger_note",
  "story-host:C09", "story-host:gate_panel", "story-host:C13", "story-host:district_controller",
  // S5 plans whose only sources are the hosts above.
  "plans:bp_deep_service",
  // S5's upper-hall work face (restore_hall, restore_food): no host exists yet.
  "works-face:meridian_upper_hall",
]);

/** Listed keys this build already satisfies: the list is out of date. */
export const staleExpected = (): string[] => [...EXPECTED_PENDING].filter((key) => !stillMissing(key));
/** The list must only hold absent-ID keys, never a present-but-broken condition. */
export const malformedExpected = (): string[] => [...EXPECTED_PENDING].filter((key) => /^(broken|refused|owned):/.test(key));
