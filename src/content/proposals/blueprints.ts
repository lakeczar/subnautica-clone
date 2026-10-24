/** Plans the bible names. `existing` plans resolve against the registry
 * (BLUEPRINTS / FUTURE_BLUEPRINTS); `elsewhere` plans belong to another stream
 * that is still in flight (named in `owner`); `new` plans are proposed here and
 * must not collide with either. Every new plan is optional: it improves
 * convenience, safety or reach, and no required recipe depends on it. */
import type { SeedId } from "./types.js";

export interface ProposedPlan {
  readonly id: string;
  readonly status: "elsewhere" | "new";
  readonly label: string;
  /** Stream that defines or should wire it. */
  readonly owner: "SYS-1" | "SYS-2" | "S9" | "CB";
  readonly purpose: string;
}

/** Plans owned by in-flight streams (uncommitted when this was written). */
export const ELSEWHERE_PLANS: readonly ProposedPlan[] = [
  { id: "bp_field_outpost", status: "elsewhere", owner: "SYS-2", label: "Field outpost kit · basic", purpose: "Early stopgap outpost." },
  { id: "bp_outpost_standard", status: "elsewhere", owner: "SYS-2", label: "Field outpost kit · standard", purpose: "Leapfrog outposts with two sockets." },
  { id: "bp_outpost_advanced", status: "elsewhere", owner: "SYS-2", label: "Field outpost kit · advanced", purpose: "Deep outposts." },
  { id: "bp_decoder", status: "elsewhere", owner: "SYS-2", label: "Decoder module", purpose: "Main-path decoder (workshop signal rack)." },
  { id: "bp_signal_relay", status: "elsewhere", owner: "SYS-2", label: "Signal relay", purpose: "Remote decoding." },
  { id: "bp_survey_station", status: "elsewhere", owner: "SYS-2", label: "Survey station", purpose: "Marks scanned materials nearby." },
  { id: "bp_cultivation", status: "elsewhere", owner: "SYS-2", label: "Planters", purpose: "Cultivation." },
  { id: "bp_small_fabricator", status: "elsewhere", owner: "SYS-2", label: "Small fabricator", purpose: "Outpost fabrication." },
  { id: "bp_hush_survey", status: "elsewhere", owner: "S9", label: "Hush survey glider plans", purpose: "Optional quiet glider (crown survey marker log)." },
  { id: "bp_spindle_tender", status: "elsewhere", owner: "S9", label: "Spindle island tender plans", purpose: "Optional surface tender (yard tender plate)." },
  // LS-1 1b built these two lost-site plans (src/content/upgrades/hosts.ts).
  { id: "bp_locker_extension", status: "elsewhere", owner: "SYS-2", label: "Locker extension", purpose: "+50% capacity for one locker module (LS-1)." },
  { id: "bp_ping_lens", status: "elsewhere", owner: "SYS-2", label: "Ping lens", purpose: "Handheld ping range 40 → 60 m (LS-1)." },
];

/** New optional plans. Costs use the eight shared materials only. */
export const NEW_PLANS: readonly ProposedPlan[] = [
  { id: "bp_chart_fix", status: "new", owner: "SYS-2", label: "Chart position fix",
    purpose: "Live position on the personal chart (the GAME-DIRECTION chart upgrade), from a relay-linked chart buoy." },
  { id: "bp_lamp_filter", status: "new", owner: "SYS-1", label: "Shaded lamp filter",
    purpose: "Common-pool lamp fitting: half the light the glare stalker reads at full forward visibility. Canopy rootways exclusive." },
  { id: "bp_outpost_thermal_tap", status: "new", owner: "SYS-2", label: "Outpost thermal tap",
    purpose: "Outposts deployed beside a vent charge from it (location power, GAME-DIRECTION)." },
  { id: "bp_current_turbine", status: "new", owner: "SYS-1", label: "Current turbine",
    purpose: "The optional current turbine power source; prototype in the sandbox before wiring." },
  { id: "bp_decoder_cooling", status: "new", owner: "SYS-2", label: "Decoder cooling rack",
    purpose: "Decoder upgrade: decodes 25% faster." },
  { id: "bp_air_line_reel", status: "new", owner: "SYS-1", label: "Air-line reel",
    purpose: "Diver air line from a parked craft 28 → 40 m: useful for caves." },
  { id: "bp_beacon_array", status: "new", owner: "SYS-2", label: "Beacon array",
    purpose: "Restored crown station service: decoded landmark beacons switch on as one regional set." },
];

export const PROPOSED_PLAN_IDS: readonly string[] = [...ELSEWHERE_PLANS, ...NEW_PLANS].map(p => p.id);

export interface SeedProposal {
  readonly id: SeedId;
  readonly status: "elsewhere" | "new";
  readonly label: string;
  readonly role: "food" | "medicine" | "material" | "power";
  /** Produce: a registry item or a SYS-2 item. */
  readonly produce: string;
  readonly sampling: "hand" | "specimen";
  readonly note: string;
}
export const SEEDS: readonly SeedProposal[] = [
  { id: "seed_staple_cup", status: "elsewhere", label: "Staple cups", role: "food", produce: "meal", sampling: "hand", note: "SYS-2: reef nursery." },
  { id: "seed_ribbon_fan", status: "elsewhere", label: "Ribbon fan", role: "material", produce: "flex_membrane", sampling: "hand", note: "SYS-2: reef." },
  { id: "seed_salve_frond", status: "elsewhere", label: "Salve frond", role: "medicine", produce: "field_salve", sampling: "hand", note: "SYS-2: workshop pool; a richer patch in the undercroft." },
  { id: "seed_lumen_bulb", status: "elsewhere", label: "Lumen bulb", role: "power", produce: "bio_cell", sampling: "hand", note: "SYS-2: upper Canopy." },
  { id: "seed_pale_spore", status: "elsewhere", label: "Pale crust spore", role: "material", produce: "conductive_crust", sampling: "specimen", note: "SYS-2: Basin survey fins." },
  { id: "seed_rootglow", status: "new", label: "Rootglow", role: "power", produce: "bio_cell", sampling: "specimen",
    note: "Canopy rootways exclusive. Two bio-cells per harvest at the lumen bulb's growth time: the better power crop for players who went in." },
  { id: "seed_kiln_tuber", status: "new", label: "Kiln tuber", role: "food", produce: "meal", sampling: "hand",
    note: "Ember Rift warm-ledge tuber; three meals per harvest. Grows only in a planter on a thermal outpost or the carrier." },
  { id: "seed_mirror_cress", status: "new", label: "Mirror cress", role: "medicine", produce: "field_salve", sampling: "specimen",
    note: "Mirror Divide pocket-rim cress; two salves per harvest." },
];

/** Considered and rejected new materials, so nobody re-proposes them blind. */
export const REJECTED_MATERIALS: readonly { readonly name: string; readonly why: string }[] = [
  { name: "Cave pearl / glowstone", why: "Would be a cave-only currency for optional items. Cave rewards use the eight materials, seeds, plans and caches instead." },
  { name: "Lamp oil or bio-luminescent paste", why: "A single-purpose intermediate (EXPEDITION_INTEGRATION forbids those). The lamp filter uses glass and membrane." },
  { name: "Deep endgame alloy", why: "The canon and the integration contract both forbid a new final resource; Meridian uses earlier families." },
];
