/** The deep works: a small authored machinery graph for the return gate, the
 * upper hall the player restores, and the resolution that follows. Data and text
 * only; rules live in sim/story/works.ts and sim/story/resolution.ts. */
import type { DiscoveryId, StoryBlueprintId } from "./evidence.js";

export type GateStage = "sealed" | "isolated" | "equalizing" | "equalized" | "open";
export type WorksAction =
  | "install_power" | "install_air" | "isolate" | "equalize" | "open"
  | "restore_hall" | "restore_food" | "route_power";

/** Active steps (60 per second) for the hydraulic pipe to drain the gallery. */
export const EQUALIZE_STEPS = 5_400;
/** Gallery pressure shown on the panel, bar, from flooded ambient to dry. */
export const GALLERY_BAR = { flooded: 71, dry: 1 } as const;

export const GATE_STAGE_TEXT = {
  sealed: "Gate sealed · gallery flooded · compartment on turbine diversion",
  isolated: "Diversion isolated · compartment on staged supply · gallery flooded",
  equalizing: "Hydraulic pipe open · gallery draining",
  equalized: "Gallery dry · pressure matched · gate ready",
  open: "Return gate open · human route clear",
} as const satisfies Record<GateStage, string>;

export const WORKS_TEXT = {
  install_power: {
    ok: "Power assembly coupled. A second supply appears on the panel beside the diversion.",
    missing: "The panel needs an independent power source. Fabricate a portable service power assembly and bring it here.",
    done: "The power assembly is already coupled.",
  },
  install_air: {
    ok: "Air staging coupled. The compartment's air no longer depends on the diversion.",
    missing: "The panel needs independent air. Fabricate a portable air staging assembly and bring it here.",
    done: "Air staging is already coupled.",
  },
  isolate: {
    ok: "Diversion isolated. The sealed compartment holds steady on the staged supply.",
    blocked: "Isolating the diversion now would cut the sealed compartment's only supply. Stage independent power and air first.",
    done: "The diversion is already isolated.",
  },
  equalize: {
    ok: "The hydraulic pipe opens. Gallery pressure begins to fall.",
    blocked: "The pipe cannot equalize while the diversion carries flow. Isolate it first.",
    done: "The gallery is already equalizing.",
  },
  open: {
    ok: "The return gate opens onto a dry gallery. The human route is clear.",
    blocked: "Opening now would let the gallery's water into the sealed compartment. Equalize through the pipe first.",
    waiting: "The pipe is still draining the gallery. Wait for the pressure to match.",
    done: "The return gate is already open.",
  },
  restore_hall: {
    ok: "The upper hall is sealed, pumped and fitted. It will need power from the gate works.",
    plans: "Restoration plans for the upper hall are needed.",
    stock: "Bring the restoration stock to the upper hall.",
    done: "The upper hall is already restored.",
  },
  restore_food: {
    ok: "The food module is planted and plumbed. Communal stores can carry a full hall.",
    plans: "Plans for the communal food module are needed.",
    stock: "Bring the food module stock to the upper hall.",
    hall: "Restore the upper hall first; the module needs its sealed floor.",
    done: "The food module is already running.",
  },
  route_power: {
    ok: "Turbine flow rejoins and runs up to the hall. Lights and air plant come on along the terrace.",
    route: "The diversion stays isolated while the gallery is worked. Open the return route first.",
    hall: "The upper hall has nothing to power yet. Restore it first.",
    done: "Turbine power already reaches the upper hall.",
  },
  site: "Do this at the right part of the works.",
} as const;

/** The resolution checklist. Labels are shown only once Q5 is visible. */
export const RESOLUTION_REQUIREMENTS = {
  route: "Open the return gate without flooding the beds",
  hall: "Restore the upper hall",
  power: "Route turbine power to the hall's air plant and lights",
  food: "Restore the communal food module",
} as const;
export type RequirementId = keyof typeof RESOLUTION_REQUIREMENTS;

export const RESOLUTION_ROSTER = {
  iona: { label: "Dr. Iona Vale · physician", note: "Cleared · recommended first", default: true },
  tavi: { label: "Tavi Orr · maintenance diver", note: "Cleared", default: false },
} as const;
export type RosterId = keyof typeof RESOLUTION_ROSTER;

export interface SceneLine {
  text: string;
  /** Shown only if every listed discovery is known, or, with `unless`, if none is. */
  if?: readonly DiscoveryId[];
  unless?: readonly DiscoveryId[];
}

export const RESOLUTION_SCENES = {
  iona: [
    { text: "The seal breaks with a sigh. Iona Vale opens her eyes and reads the hall's numbers before she looks at you." },
    { text: "“Ren. Seven years?” A breath. “Air, power, food. You did this alone.”" },
    { text: "“You found the recorder. Then you know what I know. I signed the plan; you closed the gate. We both answer for it.”", if: ["C12"] },
    { text: "“The gate log is in the controller. Read it before anyone asks you about it. They will.”", unless: ["C12"] },
    { text: "“Then we wake them slowly, in order, and nobody is left outside this time.”" },
  ],
  tavi: [
    { text: "Tavi Orr sits up too fast, then holds very still." },
    { text: "“It worked.” A long look at you. “Six of us never got to find out.”" },
    { text: "“You read it. Good. I meant every word. Both halves.”", if: ["C15"] },
    { text: "“I left you a note. Don't read it in front of me.”", unless: ["C15"] },
    { text: "“Help me up. Iona next. Then the rest.”" },
  ],
} as const satisfies Record<RosterId, readonly SceneLine[]>;

export const EPILOGUE = {
  lines: [
    "Forty days later.",
    "The roster fills, one supervised bed at a time: 191 awake. Twenty died on the first day and six at the return gate. Their names stay by the inner door.",
    "Communal stores and the food module carry the hall. Nobody gathers 191 meals.",
    "From the Splitspine lookout: morning on the reef, grazers on the ledges, voices on the shore.",
  ],
  mastRestored: "The mast carries a call outward. The supply ship is years away, but this time someone will be awake to answer.",
  mastBroken: "The island mast is still broken. Someone raises it over dinner. It can wait for morning.",
  close: "What Ren owes, and to whom, is still argued. The ocean is still there.",
} as const;

export type WorksStep =
  | "w_power" | "w_air" | "w_isolate" | "w_equalize" | "w_wait" | "w_open"
  | "w_hall" | "w_food" | "w_route" | "w_begin";
/** Practical hints for the works, three tiers each. `plans` replaces tiers 2–3
 * while the step's plans are unknown, naming where they are kept. Steps after the
 * gate are offered only once the waking question is open. */
export const WORKS_HINTS = {
  w_power: {
    tiers: [
      "The gate panel wants an independent power source before the diversion is isolated.",
      "Fabricate a portable service power assembly at a workshop bench or the carrier's bay.",
      "Two thermal core, four conductive crust and two structural alloy. Carry it to the gate hall and couple it at the panel.",
    ],
    plans: "Plans for a portable power assembly are kept at the Divide's upper dock and on the gate hall's schematic.",
  },
  w_air: {
    tiers: [
      "The panel also wants independent air for the sealed compartment.",
      "Fabricate a portable air staging assembly at a workshop bench or the carrier's bay.",
      "Two brine lattice, four flexible membrane and two silica glass. Couple it at the gate panel.",
    ],
    plans: "Air staging plans are kept in Meridian's transfer hall and medical annex, and on the gate panel itself.",
  },
  w_isolate: {
    tiers: [
      "Both supplies are staged at the gate.",
      "Isolate the turbine diversion at the gate panel.",
      "The sealed compartment holds on the staged supply while the gallery is worked.",
    ],
  },
  w_equalize: {
    tiers: [
      "The diversion is isolated.",
      "Open the hydraulic pipe at the panel to drain the gallery.",
      "The pipe carries water, not people. It takes a while; the panel shows the pressure.",
    ],
  },
  w_wait: {
    tiers: [
      "The gallery is draining.",
      "Watch the gallery pressure on the panel fall toward 1 bar.",
      "It keeps draining while you are away. Nothing is lost by leaving.",
    ],
  },
  w_open: {
    tiers: [
      "The gallery is dry and the pressure matched.",
      "Open the return gate at the panel.",
      "The human route runs through the drained gallery to the inner hall.",
    ],
  },
  w_hall: {
    tiers: [
      "Nobody can wake into a dark district. The upper hall on the top terrace has to be livable first.",
      "Restore the hall from carried stock at its frame work face.",
      "Six structural alloy, four silica glass, four flexible membrane and two buoyant resin.",
    ],
    plans: "The upper hall's restoration plans are in the transfer hall and the district controller.",
  },
  w_food: {
    tiers: [
      "191 people will need to eat, and nobody should gather it by hand.",
      "Restore the communal food module in the upper hall's bay.",
      "Three flexible membrane, two silica glass, two buoyant resin and one conductive crust.",
    ],
    plans: "Food module plans are in the medical annex and the district controller.",
  },
  w_route: {
    tiers: [
      "The hall is restored, but dark.",
      "At the gate panel, route the rejoined turbine flow to the upper hall.",
      "The return gate has to be open first; the diversion stays isolated until then.",
    ],
  },
  w_begin: {
    tiers: [
      "Route, hall, power and food are in place.",
      "Return to the district controller at the lower service window, or go to the inner hall.",
      "The controller offers a medically cleared first candidate. You can choose another.",
    ],
  },
} as const satisfies Record<WorksStep, { tiers: readonly [string, string, string]; plans?: string }>;
export const WORKS_STEP_PLANS = {
  w_power: "bp_service_power", w_air: "bp_service_air", w_hall: "bp_works_hall", w_food: "bp_food_module",
} as const satisfies Partial<Record<WorksStep, StoryBlueprintId>>;
export const NOTHING_PRESSING = "Nothing pressing. The notebook keeps every lead; the ocean is still there to explore.";
