// Shared by the CA-1 heavy cave tests (not a test file itself).
import { REEF_CAVES } from "../src/content/regions/caves/reef.js";
import { ISLES_CAVES } from "../src/content/regions/caves/isles.js";
import { CAVE_NETWORKS } from "../src/content/regions/caves/networks.js";
import { SUIT_OXYGEN_DRAIN_PER_SECOND } from "../src/sim/survival.js";

export const NEW_CAVES = [...REEF_CAVES, ...ISLES_CAVES].map(s => s.id);
/** Each lone cave, or each linked network, retreats in one frame so crawls resolve. */
export const groups: string[][] = [
  ...CAVE_NETWORKS.filter(n => n.links.length).map(n => n.caves.filter(id => NEW_CAVES.includes(id))),
  ...NEW_CAVES.filter(id => !CAVE_NETWORKS.some(n => n.links.length && n.caves.includes(id))).map(id => [id]),
];
/** sim/step.ts: the diver's ordinary swim speed (not sprinting), m/s. */
export const SWIM_SPEED = 3.4;
/** 20% of a full suit: seconds of air left. */
export const AIR_SECONDS = 20 / SUIT_OXYGEN_DRAIN_PER_SECOND;
