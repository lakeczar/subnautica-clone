import { EXTERIOR, type CaveSource } from "../caves.js";
import {
  chamber, heatBox, heatVent, portal, room, route, tube, v, type CaveCue, type CaveContent, type CaveHazard, type DeepCave,
} from "./deepKit.js";

/** CA-3, Ember Rift: lava tubes that breathe heat.
 *
 * Round black-glass tubes with ropy floors. Cool tubes on the shoulders are
 * silent; warm ones glow through their cracks and breathe heat on the
 * `KILN_BREATH` clock, and kiln crawlers file into the cracks before each
 * breath. Every warm tube keeps cool water and a cool way out: heat lives in
 * named fields over the warm chambers only, never over a whole cave. */

const EMBER: readonly [number, number, number] = [1, 0.48, 0.16];
const CRAWLER: readonly [number, number, number] = [0.93, 0.86, 0.72];
const TEAL: readonly [number, number, number] = [0.38, 0.9, 0.82];

// --- Kiln tube (medium) -------------------------------------------------------

/** Under the east plateau's cliff, 40 m east of the carrier lane (moved from
 * the bible's 118..178 × -830..-770, which sat 4.7 m from it). The plateau
 * mouth opens at the cliff foot onto the 306 m bench; a cool upper tube a
 * Dart can run falls to the warm vent chamber at 327 m. A parallel return
 * tube climbs back to the rim mouth higher on the cliff, and a junction under
 * the plateau lip joins the two tubes, closing the loop. A diver-only gallery
 * leaves the vent chamber for the thick ceramic lining; the end vent sits in
 * a niche in its east wall. */
const KILN_SOURCE: CaveSource = {
  id: "rift_kiln_tube",
  label: "Kiln tube",
  region: "thermal_rift",
  footprint: { minX: 140, maxX: 200, minZ: -866, maxZ: -806 },
  baseY: -332,
  topY: -258,
  terraces: [],
  carves: [
    tube("kiln.carve.upper", "kiln.upper_tube", [
      [136, -826, -305.5, 11, 7.5], [146, -826.3, -306, 11, 7.5], [154, -827.5, -307, 11, 7.5], [164, -831, -310, 11.5, 7.5],
      [175, -837, -316, 11.5, 8],
    ]),
    chamber("kiln.carve.vent", "kiln.vent_chamber", [184, -320.5, -845], [10, 9, 6.5, 6.5], -327),
    chamber("kiln.carve.niche", "kiln.vent_niche", [195.5, -324.8, -846], [2.4, 2.4, 2, 1.6], -326.4, 0.25),
    tube("kiln.carve.return", "kiln.return_tube", [
      [185, -839, -322, 12, 8], [176, -824, -316, 12, 8], [166, -816, -309.5, 12, 7.5], [156, -812, -303.5, 11.5, 7.5],
      [148, -810.5, -298.5, 11, 7], [140, -809.5, -297.5, 11, 7],
    ]),
    tube("kiln.carve.junction", "kiln.junction", [[160, -828, -308.5, 10.5, 7.5], [161, -820, -307, 10.5, 7.5], [162, -814, -305.5, 10.5, 7.5]]),
    tube("kiln.carve.gallery", "kiln.ceramic_gallery", [
      [186, -852, -326.6, 3.8, 3.4], [185.5, -857, -326.2, 3.6, 3.2], [181, -860.5, -325.8, 3.6, 3.2], [178.5, -861, -325.6, 3.4, 3],
    ], 0.2),
  ],
  blend: 1.6,
  rooms: [
    room("kiln.upper_tube", "passage", "Upper tube", 14),
    room("kiln.junction", "passage", "Plateau-lip junction", 14),
    room("kiln.return_tube", "passage", "Return tube", 14),
    room("kiln.vent_chamber", "chamber", "Vent chamber", 12),
    room("kiln.vent_niche", "pocket", "End vent", 6),
    room("kiln.ceramic_gallery", "passage", "Ceramic gallery", 8),
  ],
  portals: [
    portal("kiln.mouth.plateau", "mouth", "Plateau mouth", "kiln.upper_tube", EXTERIOR, v(147, -303, -826.4), "-x", 8.5, 5, ["diver", "small"]),
    portal("kiln.mouth.rim", "mouth", "Rim mouth", "kiln.return_tube", EXTERIOR, v(154, -297.8, -811.6), "-x", 8.5, 5, ["diver", "small"]),
    portal("kiln.throat.vent", "throat", "Upper tube to vent chamber", "kiln.upper_tube", "kiln.vent_chamber", v(176, -313, -838), "+x", 7, 5, ["diver", "small"]),
    portal("kiln.throat.gallery", "throat", "Gallery throat", "kiln.vent_chamber", "kiln.ceramic_gallery", v(186, -325, -853), "-z", 2.4, 2.2),
    portal("kiln.throat.niche", "throat", "End vent", "kiln.vent_chamber", "kiln.vent_niche", v(193.5, -325, -846), "+x", 2.4, 2),
  ],
  routes: [
    route("kiln.route.loop", "small", "loop", [
      [126, -304.6, -826], [140, -304.8, -826], [147, -305.2, -826.3], [154, -306.2, -827.5], [164, -309.2, -831], [175, -315, -837],
      [181, -321, -842], [185, -322, -842], [184, -320.8, -838], [176, -314.6, -824], [166, -308.2, -816], [156, -302.2, -812],
      [148, -297.2, -810.5], [130, -296.5, -809],
    ]),
    route("kiln.route.junction", "small", "loop", [
      [130, -296.5, -809], [148, -297.2, -810.5], [156, -302.2, -812], [162, -304.4, -814], [161, -306, -820], [160, -307.4, -828],
      [154, -306.2, -827.5], [147, -305.2, -826.3], [126, -304.6, -826],
    ]),
    route("kiln.route.gallery_exit", "diver", "exit", [
      [178.8, -325.2, -861], [181, -325.3, -860.5], [185.5, -325.8, -857], [186, -326.2, -852], [184, -326, -846], [180, -322, -841],
      [175, -315.4, -837], [164, -309.4, -831], [154, -306.4, -827.5], [147, -305.4, -826.3], [136, -305, -826],
    ]),
    route("kiln.route.niche_exit", "diver", "exit", [
      [195.8, -326, -846], [192, -326.1, -846], [186, -325.5, -843], [184, -321.4, -838], [176, -315.4, -824], [166, -309, -816],
      [156, -303, -812], [148, -298, -810.5], [140, -297, -809.5],
    ]),
  ],
  staging: [
    { id: "kiln.parking", role: "craft_parking", label: "Plateau parking above the kiln tube",
      position: v(208, -259.6, -836), radius: 9, profiles: ["small", "medium"] },
  ],
  note: "CA-3 medium. Loop: upper tube - vent chamber - return tube - junction. Hall: Dart (350) and Hush (450). " +
    "Heat only in the vent chamber, the niche and the return tube's lowest leg; the upper tube, junction and gallery are cool.",
};

const KILN_HAZARDS: readonly CaveHazard[] = [
  heatBox("rift_kiln_tube.heat.vent_chamber", "rift_kiln_tube", "rift_inactive_shoulder", v(174, -327.5, -854), v(194, -314, -836), 0.6, 3,
    "Ember cracks brighten round the vent chamber and the crawlers file into them before each breath."),
  heatBox("rift_kiln_tube.heat.return_low", "rift_kiln_tube", "rift_inactive_shoulder", v(176, -326, -840), v(188, -315, -829), 0.45, 3,
    "The return tube's lowest leg is warm; its cracks fade as it climbs."),
  heatVent("rift_kiln_tube.heat.end_vent", "rift_kiln_tube", "rift_inactive_shoulder", v(196.5, -326.4, -846), 1.2, 0, 3.4, 0.95, 3,
    "A steady orange crack at the back of the niche: the end vent never cools."),
];

const KILN_CONTENTS: readonly CaveContent[] = [
  { id: "rift_kiln_tube.ceramic_lining", kind: "resource", bible: { kind: "resource", id: "rift_kiln_tube_ceramic" },
    room: "kiln.ceramic_gallery", at: v(180.5, -325.8, -860.6), item: "pressure_ceramic", stock: 16,
    read: "Thick pale lining where the gallery cooled slowly; the wall rings when tapped." },
  { id: "rift_kiln_tube.vent_charge", kind: "service", bible: { kind: "reward", id: "rift.kiln_vent_charge" },
    room: "kiln.vent_chamber", at: v(190, -325.5, -846), read: "A craft holding beside the niche charges a tier-1 thermal exchanger from the end vent." },
];

const KILN_CUES: readonly CaveCue[] = [
  { id: "rift_kiln_tube.cue.vent_cracks", kind: "ember_crack", room: "kiln.vent_chamber", meaning: "heat_breath", color: EMBER,
    points: [v(192, -324, -851), v(193.5, -321, -846), v(192, -318, -840)], read: "Orange cracks on the chamber's east wall: the warm side." },
  { id: "rift_kiln_tube.cue.crawlers", species: "kiln_crawler", kind: "colony", room: "kiln.vent_chamber", meaning: "heat_breath", color: CRAWLER,
    points: [v(178, -319, -852), v(182, -317, -853.5)], read: "Pale crawlers on the warm wall file into the cracks five seconds before a breath." },
  { id: "rift_kiln_tube.cue.return_crawlers", species: "kiln_crawler", kind: "colony", room: "kiln.return_tube", meaning: "heat_breath", color: CRAWLER,
    points: [v(181, -318, -834), v(178, -317, -828)], read: "Crawlers thin out up the return tube: past them the rock is cool." },
  { id: "rift_kiln_tube.cue.plateau_mouth", kind: "colony", room: "kiln.upper_tube", meaning: "exit", exit: "kiln.mouth.plateau", color: TEAL,
    points: [v(150, -303, -822), v(150, -303, -831)], read: "Teal unlit colonies frame the plateau mouth from inside." },
  { id: "rift_kiln_tube.cue.rim_mouth", kind: "colony", room: "kiln.return_tube", meaning: "exit", exit: "kiln.mouth.rim", color: TEAL,
    points: [v(157, -298, -807), v(157, -298, -816)], read: "Teal colonies inside the rim mouth, higher up the cliff." },
];

const KILN: DeepCave = {
  source: KILN_SOURCE, bible: ["rift_kiln_tube"], size: "medium", style: "lava_tube",
  exits: { "plateau mouth": "kiln.mouth.plateau", "rim mouth": "kiln.mouth.rim" },
  hall: { profile: "small", craft: ["dart", "hush"], note: "The hall keel stays above 327 m: inside the Dart's 350 m refit and the Hush's 450 m." },
  graph: {
    chambers: { "upper tube": ["kiln.upper_tube"], "vent chamber": ["kiln.vent_chamber"], "return tube": ["kiln.return_tube"], "ceramic gallery": ["kiln.ceramic_gallery"] },
    loopCloser: { passage: "junction", rooms: ["kiln.junction"] },
  },
  contents: KILN_CONTENTS, cues: KILN_CUES, hazards: KILN_HAZARDS,
};

export const RIFT_CAVES: readonly DeepCave[] = [KILN];
