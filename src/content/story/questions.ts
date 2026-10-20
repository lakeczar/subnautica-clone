/** The notebook's interpretation layer. Every condition is a set of facts, so the
 * notebook depends on what is known, never on the order it was learned in.
 * A condition list is any-of; each inner list is all-of. Text attached to a
 * condition may only rely on the facts in that condition. */
import type { DiscoveryId } from "./evidence.js";
import type { FactId } from "./facts.js";

export type Conditions = readonly (readonly FactId[])[];

export interface HypothesisDefinition {
  text: string;
  appears: Conditions;
  supported?: Conditions;
  weakened?: Conditions;
  ruledOut?: Conditions;
  established?: Conditions;
  /** Replaces `text` once ruled out or established. Uses only that condition's facts. */
  settled?: string;
  /** Deliberately left open after the question's answer: consistent with it, unproven. */
  survivesAnswer?: true;
}
export interface QuestionDefinition {
  title: string;
  appears: Conditions;
  hypotheses: Readonly<Record<string, HypothesisDefinition>>;
  answer?: { when: readonly FactId[]; text: string };
}

export const QUESTIONS = {
  Q1: {
    title: "What happened to the pod?",
    appears: [["F01"]],
    hypotheses: {
      drift: {
        text: "An accident broke it loose and it drifted here.",
        appears: [["F01"]],
        weakened: [["F08"]],
        ruledOut: [["F18"]],
        settled: "It did not drift. It was sent.",
      },
      launch: {
        text: "A launch: it rose on purpose from somewhere deep.",
        appears: [["F01"]],
        supported: [["F01"]],
        established: [["F08"], ["F18"]],
        settled: "A launch, from deep below, on purpose.",
      },
      sent: {
        text: "Someone sent me up deliberately.",
        appears: [["F08"], ["F18"]],
        supported: [["F09"]],
        established: [["F18"]],
      },
      ascent: {
        text: "The ascent itself did the damage.",
        appears: [["F01"]],
        established: [["F18"]],
        settled: "The regulator failed on the way up. That is where the missing time went.",
      },
    },
    answer: {
      when: ["F18"],
      text: "The controller sent me up after seven years and four months below. The regulator failed on the ascent; my missing memory is that injury, not anyone's tampering.",
    },
  },
  Q2: {
    title: "Where did everyone go?",
    appears: [["F02"], ["F03"], ["F05"], ["F10"], ["F17"]],
    hypotheses: {
      evacuated: {
        text: "They evacuated, and something interrupted it.",
        appears: [["F02"], ["F03"]],
        weakened: [["F05"]],
        ruledOut: [["F10"], ["F17"]],
        settled: "Nobody sailed. They went down, not out.",
      },
      perished: {
        text: "They died in the disaster.",
        appears: [["F02"], ["F07"]],
        supported: [["F07"]],
        weakened: [["F05"], ["F10"]],
        ruledOut: [["F17"]],
        settled: "Not all of them. 191 are alive.",
      },
      held: {
        text: "They were held somewhere against their will.",
        appears: [["F05"], ["F10"]],
        supported: [["F10"]],
        weakened: [["F14"]],
        ruledOut: [["F14", "F17"]],
        settled: "They chose it. The ledger is signed name by name.",
        survivesAnswer: true,
      },
      inward: {
        text: "They went inward and down, somewhere built to keep them.",
        appears: [["F05"], ["F10"], ["F17"]],
        supported: [["F05"], ["F10"], ["F14"]],
        established: [["F17"]],
        settled: "Beneath Meridian, asleep. 191 living, and an empty slot for me.",
      },
    },
    answer: {
      when: ["F17"],
      text: "They went down, not out. 191 people sleep in sealed beds beneath Meridian. Mine is the empty one.",
    },
  },
  Q3: {
    title: "Why do the records name me?",
    appears: [["F06"], ["F09"], ["F11"], ["F12"]],
    hypotheses: {
      routine: {
        text: "I was the engineer on shift; my name is on everything.",
        appears: [["F06"], ["F09"]],
        weakened: [["F11"], ["F12"]],
        survivesAnswer: true,
      },
      shut_out: {
        text: "I shut people out.",
        appears: [["F06"], ["F12"]],
        supported: [["F11"], ["F12"]],
        established: [["F12", "F21"]],
        settled: "I gave the order, and six people did not come back.",
      },
      coerced: {
        text: "Someone forced the order on me.",
        appears: [["F12"]],
        ruledOut: [["F16"]],
        settled: "Nobody forced it. The decision was mine.",
      },
      triage: {
        text: "Triage: closing the gate saved everyone else.",
        appears: [["F12"], ["F10"]],
        supported: [["F16"], ["F17"]],
        survivesAnswer: true,
      },
      too_soon: {
        text: "I closed it too soon.",
        appears: [["F06"], ["F20"], ["F21"]],
        supported: [["F20"]],
        survivesAnswer: true,
      },
    },
    answer: {
      when: ["F12", "F16", "F21"],
      text: "I gave the order at the documented threshold, after the pipe was refused. Six people were still working beyond the gate. Whether waiting would have saved them, the record cannot say.",
    },
  },
  Q4: {
    title: "What changed the water?",
    appears: [["F04"], ["F07"], ["F15"]],
    hypotheses: {
      predators: {
        text: "Predators drove the fauna off.",
        appears: [["F04"]],
        weakened: [["F07"]],
        ruledOut: [["F04", "F07"]],
        settled: "Not predators. The fauna left the dense water.",
      },
      dense_first: {
        text: "Dense water spread before the machines failed.",
        appears: [["F04"], ["F07"]],
        supported: [["F04"], ["F07"]],
        established: [["F04", "F07"]],
        survivesAnswer: true,
      },
      storm: {
        text: "A storm, and bad luck.",
        appears: [["F07"]],
        ruledOut: [["F15"]],
        settled: "The storm was the trigger, not the cause.",
      },
      undermined: {
        text: "The settlement undermined its own ground.",
        appears: [["F07"], ["F15"]],
        supported: [["F15"]],
        established: [["F07", "F15"]],
      },
    },
    answer: {
      when: ["F07", "F15"],
      text: "Extraction thinned the Basin's ridge. A storm brought the slope down and dense water rose through the fractures. The warnings were measured, and written off.",
    },
  },
  Q5: {
    title: "Can they wake without repeating the cost?",
    appears: [["F17"]],
    hypotheses: {},
  },
} as const satisfies Record<string, QuestionDefinition>;
export type QuestionId = keyof typeof QUESTIONS;

export interface Reread {
  when: readonly FactId[];
  text: string;
  /** Rereads on one axis supersede earlier ones; separate axes stack. */
  axis: string;
  /** Hides the first reading as current; shown as "first read" only if it was seen. */
  replaces?: true;
}

/** Later facts reread earlier entries. Order within an axis is ascending priority. */
export const REREADS = {
  C01: [
    { axis: "origin", when: ["F08"], text: "Its cradle is at the Divide's upper dock. The scoring is where it started, not where it crashed.", replaces: true },
    { axis: "origin", when: ["F18"], text: "Seven years deep, then a launch on a failing regulator. The damage is the journey up.", replaces: true },
  ],
  C02: [
    { axis: "people", when: ["F07"], text: "The dense water reached this intake too. The filters came back; the people did not." },
    { axis: "people", when: ["F10"], text: "The intake fed a settlement that went down to the transfer hall. The filters kept working without them.", replaces: true },
  ],
  C03: [
    { axis: "people", when: ["F10"], text: "Nobody sailed. The supplies stayed because everyone went down, not out.", replaces: true },
  ],
  C04: [
    { axis: "water", when: ["F07"], text: "The fauna read the dense water before the instruments did.", replaces: true },
    { axis: "water", when: ["F15"], text: "This sheet is the first page of the record Mara's ridge surveys finish." },
  ],
  C05: [
    { axis: "people", when: ["F10"], text: "The tagged bundles match a 198-person transfer. Inward was the plan.", replaces: true },
    { axis: "people", when: ["F17"], text: "The bundles went to beds that are still occupied.", replaces: true },
    { axis: "gate", when: ["F12"], text: "Tavi was right about the control. The order was mine." },
    { axis: "gate", when: ["F12", "F16"], text: "Tavi saw who held the gate, not the pressure on it. Neither of us can see what waiting would have bought." },
  ],
  C06: [
    { axis: "water", when: ["F15"], text: "The fractures follow the ridge the quotas thinned.", replaces: true },
  ],
  C07: [
    { axis: "self", when: ["F11"], text: "My seal is on the return gate's actuator too." },
    { axis: "origin", when: ["F18"], text: "This was my cradle. I left from here, seven years late.", replaces: true },
  ],
  C08: [
    { axis: "people", when: ["F14"], text: "The reservations match the annex's suspension protocol.", replaces: true },
    { axis: "people", when: ["F17"], text: "192 reserved. 191 still within thresholds. Mine is the empty one.", replaces: true },
    { axis: "gate", when: ["F12"], text: "The override seal and the order are the same act." },
  ],
  C09: [
    { axis: "gate", when: ["F16"], text: "The order came at the threshold, after the pipe was refused.", replaces: true },
    { axis: "voices", when: ["F20"], text: "They asked for two more minutes." },
  ],
  C10: [
    { axis: "people", when: ["F17"], text: "The thresholds were right. They are still inside them.", replaces: true },
  ],
  C11: [
    { axis: "water", when: ["F07"], text: "Her ridge is the slope that came down under the Basin." },
  ],
  C12: [
    { axis: "people", when: ["F17"], text: "The galleries that closure protected are still occupied." },
  ],
  C13: [
    { axis: "cost", when: ["F21"], text: "They are alive because the margin held. Six people paid for the margin." },
  ],
  C14: [
    { axis: "self", when: ["F17"], text: "I was woken first because someone had to make a way out for the rest." },
  ],
  rift_station_ledger: [
    { axis: "water", when: ["F07"], text: "The quota ridge is the slope that failed." },
  ],
  gate_panel: [
    { axis: "people", when: ["F17"], text: "The sealed compartment is the bed hall. Isolating the diversion carelessly would starve it." },
  ],
} as const satisfies Partial<Record<DiscoveryId, readonly Reread[]>>;

/** Optional journals annotate facts the player already holds. Context only. */
export const JOURNAL_LINKS = {
  mara_reef_note: ["F02"],
  mara_specimen_tray: ["F04"],
  ren_access_log: ["F06", "F12"],
  iona_ledger_note: ["F10", "F14"],
  outside_names: ["F21"],
  mara_last_page: ["F15"],
} as const satisfies Record<string, readonly FactId[]>;
