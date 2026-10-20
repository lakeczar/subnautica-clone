import type { Mesh, Scene, ShaderMaterial } from "@babylonjs/core";
import { ArtBatch, type Point } from "../geometry.js";
import type { GeometryCache } from "../geometryCache.js";
import { PALETTE as P } from "../palette.js";
import { label, type LabelMaterials } from "../landmarks.js";
import { wallWithOpening } from "../materials.js";
import { CARRIER_LAYOUT, carrierRooms, carrierStructure } from "../../sim/carrier.js";
import { HEARTHLINE, HEARTHLINE_HOUSE as H, HEARTHLINE_KEELS as K, HEARTHLINE_WINDOWS as W } from "../../content/fleet/hulls.js";
import {
  BERTH_ZONE, DECK_Y, HEARTHLINE_FIXTURES, HEARTHLINE_ROOMS, HEARTHLINE_SOCKETS, LINING, type InteriorSolid, type Socket,
} from "../../content/fleet/hearthlineInterior.js";
import { batchFor, child, glazing, loftAt, loop } from "./common.js";

/** House cross-section, clockwise seen from +Z: an open arch whose underside is
 * the deck (drawn by the shell) and whose skirts sit on the keels. */
const SECTION: readonly (readonly [number, number])[] = [
  [-K.inner, H.underside], [-K.inner, H.skirt], [-H.halfWidth, H.skirt], [-H.halfWidth, W.low], [-H.halfWidth, W.high],
  [-H.halfWidth, 7.6], [-6.05, 8.75], [-4.9, H.roof], [4.9, H.roof], [6.05, 8.75], [H.halfWidth, 7.6],
  [H.halfWidth, W.high], [H.halfWidth, W.low], [H.halfWidth, H.skirt], [K.inner, H.skirt], [K.inner, H.underside],
];
/** Section segments that carry the side window band (port, starboard). */
const WINDOW_SEGMENTS = { port: 3, starboard: 11 } as const;
const STATIONS = [H.bow, W.bridge[0], W.bridge[1], -2.8, 2.8, W.galley[0], W.galley[1], H.stern] as const;
const keelSections = [
  { z: -K.halfLength, w: .9, low: 1.0, high: 2.6 }, { z: -12.6, w: 1.4, low: .22, high: 3.1 },
  { z: -10, w: 1.6, low: 0, high: K.top }, { z: 11, w: 1.6, low: 0, high: K.top },
  { z: 13.3, w: 1.36, low: .35, high: 3.05 }, { z: K.halfLength, w: 1.1, low: .8, high: 2.8 },
];
const keelX = (K.inner + K.outer) / 2;

/** Inhabited carrier. Root: the exterior and the static interior kit, both
 * hull-local on CARRIER_LAYOUT. The berth configuration lives in a separate
 * shell (hearthlineShellArt), rebuilt like today's carrier shell. */
export function hearthlineArt(scene: Scene, cel: ShaderMaterial, glass: ShaderMaterial, id: string,
  labels?: LabelMaterials, cache?: GeometryCache): Mesh {
  const b = batchFor(scene, cel, cache, id, "hearthline", "exterior");
  // Twin keel pontoons with ochre deck rails and stern drives.
  for (const side of [-1, 1]) {
    loftAt(b, keelSections, P.metal, [side * keelX, 0, 0]);
    b.box([side * keelX, K.top + .015, 0], [2.0, .03, 22], P.petrol);
    b.tube([[side * (keelX + 1.1), K.top + .05, -12.4], [side * (keelX + 1.12), K.top + .06, 0], [side * (keelX + 1.1), K.top + .05, 12.8]], .07, P.ochre, 6);
    b.tube([[side * (keelX + 1.53), 1.25, -11], [side * (keelX + 1.53), 1.25, 11]], .05, P.seam, 4);
    b.tube([[side * (keelX + 1.4), .55, -10], [side * (keelX + 1.4), .55, 10.6]], .1, P.ochre, 5);
    const duct: Point = [side * keelX, 1.6, 13.72];
    b.tube(loop(duct, [1, 0, 0], [0, 1, 0], .78, 18), .11, P.petrol, 6);
    b.ellipsoid([duct[0], duct[1], 13.6], [.32, .32, .3], P.ink, 8);
    for (const z of [-8, 8]) {
      // Tunnel thrusters for station keeping, through each keel.
      b.ring([side * 9.25, 1.4, z], [0, 0, 1], [0, 1, 0], .62, .44, P.steelLight, 14);
      b.ellipsoid([side * 9.2, 1.4, z], [.04, .42, .42], P.ink, 10);
    }
    // Approach lights along the inner keel faces at the launch well mouth.
    for (let z = -12.5; z <= -9; z += 1.15) b.glow(b.box([side * (K.inner + .015), 1.0, z], [.03, .12, .3], P.mint));
  }
  // The pressure house: an arch from keel to keel, windows cut from its sides.
  const rings = STATIONS.map((z) => SECTION.map(([x, y]): Point => [x, y, z]));
  for (let i = 0; i < rings.length - 1; i++) {
    const glazed = (STATIONS[i] === W.bridge[0]) || (STATIONS[i] === W.galley[0]);
    for (let j = 0; j < SECTION.length - 1; j++) {
      if (glazed && (j === WINDOW_SEGMENTS.port || (j === WINDOW_SEGMENTS.starboard && STATIONS[i] === W.bridge[0]))) continue;
      const a = rings[i]!, c = rings[i + 1]!;
      b.face([a[j]!, a[j + 1]!, c[j + 1]!, c[j]!], j >= 6 && j <= 8 ? P.shade : j <= 1 || j >= 13 ? P.metal : P.porcelain);
    }
  }
  // Stern wall (convex part plus skirt ends) and the bow, which is the bridge.
  const end = (z: number, flip: boolean) => {
    const outline: Point[] = [[-H.halfWidth, H.underside, z], [-H.halfWidth, 7.6, z], [-6.05, 8.75, z], [-4.9, H.roof, z],
      [4.9, H.roof, z], [6.05, 8.75, z], [H.halfWidth, 7.6, z], [H.halfWidth, H.underside, z]];
    return flip ? outline.reverse() : outline;
  };
  b.face(end(H.stern, false), P.porcelain);
  for (const side of [-1, 1]) for (const [z, flip] of [[H.stern, false], [H.bow, true]] as const) {
    const q: Point[] = [[side * K.inner, H.underside, z], [side * K.inner, H.skirt, z], [side * H.halfWidth, H.skirt, z], [side * H.halfWidth, H.underside, z]];
    b.face((side > 0) !== flip ? q.reverse() : q, P.metal);
  }
  bowWall(b);
  // Bridge visor and the petrol band that carries the name.
  b.box([0, W.high + .78, H.bow - .14], [11.4, .12, .4], P.petrol);
  for (const x of [-5.6, 5.6]) b.box([x, W.high + .45, H.bow - .1], [.14, .62, .3], P.petrol);
  for (const side of [-1, 1]) {
    b.box([side * (H.halfWidth + .01), 4.45, 0], [.02, .5, 24.8], P.petrol);
    b.box([side * (H.halfWidth + .015), 4.75, 0], [.02, .07, 24.8], P.ochre);
    // Window frames: ochre lips around each opening.
    const frames: [number, number][] = side < 0 ? [[W.bridge[0], W.bridge[1]], [W.galley[0], W.galley[1]]] : [[W.bridge[0], W.bridge[1]]];
    for (const [z0, z1] of frames) {
      const x = side * (H.halfWidth + .02);
      b.tube([[x, W.low, z0], [x, W.high, z0], [x, W.high, z1], [x, W.low, z1], [x, W.low, z0]], .06, P.petrol, 5);
      b.box([x, (W.low + W.high) / 2, (z0 + z1) / 2], [.05, W.high - W.low, .1], P.petrol);
    }
    // Pressure ribs between the windows: the house reads as a hull, not a box.
    for (const z of [-6.3, -4.1, -1.1, 1.6, 4.4, 10.5]) {
      if (side > 0 && Math.abs(z - 10.5) < .1) continue;
      b.tube([[side * K.inner, H.skirt + .02, z], [side * (H.halfWidth + .03), H.skirt + .02, z], [side * (H.halfWidth + .03), 7.6, z], [side * 6.08, 8.77, z]], .06, P.shade, 5);
    }
  }
  // Starboard vestibule hatch above the keel ledge, with rails and a step.
  const hatch = HEARTHLINE.access.find((a) => a.kind === "side_hatch")!.at;
  b.panel([H.halfWidth + .02, hatch[1] - .05, hatch[2]], [1.5, 2.3], .06, P.ochre, -Math.PI / 2, .3);
  b.panel([H.halfWidth + .06, hatch[1] - .05, hatch[2]], [1.2, 2.0], .04, P.shade, -Math.PI / 2, .24);
  b.ring([H.halfWidth + .1, hatch[1] + .3, hatch[2]], [0, 0, 1], [0, 1, 0], .26, .17, P.petrol, 12);
  for (const dz of [-.95, .95]) b.tube([[H.halfWidth + .2, 4.0, hatch[2] + dz], [H.halfWidth + .26, 4.3, hatch[2] + dz], [H.halfWidth + .26, 6.0, hatch[2] + dz], [H.halfWidth + .05, 6.2, hatch[2] + dz]], .04, P.ochre, 5);
  b.box([keelX - .2, K.top + .06, hatch[2]], [1.6, .06, 1.8], P.ochre);
  // Galley porthole beside the vestibule, and the stern collar and lights.
  b.ring([H.halfWidth + .02, 5.9, 7.2], [0, 0, 1], [0, 1, 0], .36, .26, P.steelLight, 14);
  b.ellipsoid([H.halfWidth + .01, 5.9, 7.2], [.02, .27, .27], P.glass, 10);
  const collar = HEARTHLINE.mounts.find((m) => m.kind === "rescue_collar")!.at;
  b.ring([0, collar[1], H.stern + .02], [1, 0, 0], [0, 1, 0], .4, .26, P.shell, 14);
  for (const side of [-1, 1]) {
    b.glow(b.box([side * (H.halfWidth + .02), 8.0, H.bow + .4], [.04, .1, .3], side < 0 ? P.amber : P.mint));
    b.glow(b.box([side * 4.2, 8.9, H.stern + .02], [.5, .08, .04], P.warm));
  }
  // Roof: a raised spine, walkway grating and the four hull-module sockets.
  b.box([0, H.roof + .01, 0], [3.2, .02, 22], P.metal);
  for (let z = -10.5; z <= 10.5; z += 1.5) b.box([0, H.roof + .022, z], [3.0, .006, .05], P.steelLight);
  for (const m of HEARTHLINE.mounts.filter((k) => k.kind === "hull_module")) {
    b.ring([m.at[0], m.at[1] + .028, m.at[2]], [1, 0, 0], [0, 0, 1], 1.0, .78, P.ochre, 16);
    b.ellipsoid([m.at[0], m.at[1] + .012, m.at[2]], [.76, .01, .76], P.petrol, 12);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      b.box([m.at[0] + Math.cos(a) * .9, m.at[1] + .03, m.at[2] + Math.sin(a) * .9], [.08, .02, .08], P.steelLight);
    }
  }
  const hull = b.finish(.35);
  hull.unfreezeWorldMatrix();
  glazing(scene, glass, `${id}.glazing`, windowPanes(), hull);
  for (const side of [-1, 1]) {
    const sign = label(scene, "HEARTHLINE", [side * (H.halfWidth + .03), 7.9, -2], 4.4, side < 0 ? Math.PI / 2 : -Math.PI / 2, labels);
    sign.parent = hull;
  }
  interiorArt(scene, cel, id, hull, labels, cache);
  for (const s of HEARTHLINE_SOCKETS) {
    const occupant = socketOccupant(scene, cel, `${id}.socket.${s.id}`, s, cache);
    child(occupant, hull).setEnabled(false);
  }
  return hull;
}

/** Bow wall around the bridge window band: below, above, end pillars and two
 * mullions. Built at the bow station facing -Z. */
function bowWall(b: ArtBatch): void {
  const z = H.bow, x0 = -5.0, x1 = 5.0;
  // Written in the x-right picture; reversed so the faces wind toward -Z.
  const q = (a: Point, c: Point, d: Point, e: Point) => b.face([e, d, c, a], P.porcelain);
  q([H.halfWidth, H.underside, z], [-H.halfWidth, H.underside, z], [-H.halfWidth, W.low, z], [H.halfWidth, W.low, z]);
  b.face(([[H.halfWidth, W.high, z], [-H.halfWidth, W.high, z], [-H.halfWidth, 7.6, z], [-6.05, 8.75, z], [-4.9, H.roof, z], [4.9, H.roof, z], [6.05, 8.75, z], [H.halfWidth, 7.6, z]] as Point[]).reverse(), P.porcelain);
  q([x0, W.low, z], [-H.halfWidth, W.low, z], [-H.halfWidth, W.high, z], [x0, W.high, z]);
  q([H.halfWidth, W.low, z], [x1, W.low, z], [x1, W.high, z], [H.halfWidth, W.high, z]);
  for (const x of [-1.7, 1.7]) b.box([x, (W.low + W.high) / 2, z - .02], [.16, W.high - W.low, .12], P.petrol);
  b.tube([[x0, W.low, z - .05], [x0, W.high, z - .05], [x1, W.high, z - .05], [x1, W.low, z - .05], [x0, W.low, z - .05]], .08, P.petrol, 5);
  // Ochre chevrons on the bow apron under the windows: the bridge end.
  for (const x of [-3.6, -1.2, 1.2, 3.6]) b.face([[x, 4.75, z - .01], [x - .5, 4.25, z - .01], [x + .5, 4.25, z - .01]], P.ochre);
}

function windowPanes(): Point[][] {
  const faces: Point[][] = [];
  const side = (x: number, z0: number, z1: number): Point[] => [[x, W.low, z0], [x, W.low, z1], [x, W.high, z1], [x, W.high, z0]];
  faces.push(side(-H.halfWidth, W.bridge[0], W.bridge[1]), side(H.halfWidth, W.bridge[0], W.bridge[1]), side(-H.halfWidth, W.galley[0], W.galley[1]));
  faces.push([[-5, W.low, H.bow], [5, W.low, H.bow], [5, W.high, H.bow], [-5, W.high, H.bow]]);
  return faces;
}

// ---------------------------------------------------------------- interior kit

const center = (f: InteriorSolid): Point => [(f.min.x + f.max.x) / 2, (f.min.y + f.max.y) / 2, (f.min.z + f.max.z) / 2];

/** Static interior: lining, ceilings, room floors, fixtures drawn on their
 * solids, warm light strips and room signs. Everything outside the berth zone,
 * which belongs to the configuration shell. */
function interiorArt(scene: Scene, cel: ShaderMaterial, id: string, hull: Mesh, labels?: LabelMaterials, cache?: GeometryCache): void {
  const b = batchFor(scene, cel, cache, `${id}.interior`, "hearthline", "interior");
  const zones: [number, number][] = [[LINING.bow, BERTH_ZONE.minZ], [BERTH_ZONE.maxZ, LINING.stern]];
  for (const [z0, z1] of zones) {
    const zc = (z0 + z1) / 2, len = z1 - z0;
    // Ceiling with warm light strips and petrol ribs.
    b.box([0, LINING.ceiling + .03, zc], [LINING.x * 2, .06, len], P.shell);
    for (let x = -4.5; x <= 4.6; x += 3) b.glow(b.box([x, LINING.ceiling - .005, zc], [.22, .02, len - 1.2], P.warm));
    for (let z = z0 + 1.6; z < z1 - .5; z += 2.4) b.box([0, LINING.ceiling - .02, z], [LINING.x * 2, .06, .14], P.petrol);
  }
  // Hull lining on both sides between the window openings, and the aft wall.
  for (const side of [-1, 1]) {
    const x = side * LINING.x, spans: [number, number][] = [[LINING.bow, BERTH_ZONE.minZ], [BERTH_ZONE.maxZ, LINING.stern]];
    for (const [z0, z1] of spans) {
      wallWithOpening(b, [x + side * .02, 5.7, (z0 + z1) / 2], [.04, 3.4, z1 - z0], {
        center: [x, (W.low + W.high) / 2, z0 < 0 ? (W.bridge[0] + W.bridge[1]) / 2 : (W.galley[0] + W.galley[1]) / 2],
        width: z0 < 0 ? W.bridge[1] - W.bridge[0] : side < 0 ? W.galley[1] - W.galley[0] : 0, height: W.high - W.low, normal: "x",
      }, P.porcelain);
      b.box([x, 4.3, (z0 + z1) / 2], [.06, .6, z1 - z0], P.metal);
      b.box([x, 4.62, (z0 + z1) / 2], [.07, .05, z1 - z0], P.ochre);
    }
  }
  wallWithOpening(b, [0, 5.7, LINING.stern + .02], [LINING.x * 2, 3.4, .04], { center: [0, 0, 0], width: 0, height: 0, normal: "z" }, P.porcelain);
  b.box([0, 4.3, LINING.stern], [LINING.x * 2, .6, .06], P.metal);
  // Room floors: bridge grating, fabrication hazard border, galley warm deck,
  // cabin rug, the yellow vestibule drain field (as the sim's prompt says).
  const floor = (x0: number, x1: number, z0: number, z1: number, color: string, lift = .004) =>
    b.box([(x0 + x1) / 2, DECK_Y + lift, (z0 + z1) / 2], [x1 - x0, .008, z1 - z0], color);
  floor(-6.2, 6.2, -11.8, -6.9, P.petrol);
  for (let x = -5.5; x <= 5.6; x += .55) floor(x - .015, x + .015, -11.7, -7.0, P.seam, .009);
  floor(-6.2, -1.4, -6.75, -3.8, P.metal);
  floor(-6.2, -1.4, -3.95, -3.82, P.ochre, .009);
  floor(1.4, 6.2, -6.75, -3.8, P.metal);
  floor(-6.2, .88, 5.8, 9.6, P.shell);
  floor(-4.4, -1.2, 9.75, 11.7, P.coral);
  floor(-4.2, -1.4, 9.95, 11.5, P.coralRim, .009);
  floor(1.08, 6.2, 7.4, 11.8, P.ochre);
  for (let z = 7.7; z < 11.6; z += .3) floor(1.3, 6.0, z - .02, z + .02, P.petrol, .009);
  // Fixtures, each drawn on its solid.
  for (const f of HEARTHLINE_FIXTURES) fixtureArt(b, f);
  const interior = child(b.finish(.18), hull);
  for (const room of HEARTHLINE_ROOMS) {
    const sign = ROOM_SIGNS[room.id];
    if (!sign) continue;
    label(scene, room.label, sign.at, sign.width, sign.yaw, labels).parent = interior;
  }
}

const ROOM_SIGNS: Partial<Record<string, { at: Point; width: number; yaw: number }>> = {
  // Yaw 0 reads from -Z, PI from +Z, PI/2 from -X, -PI/2 from +X.
  bridge: { at: [0, 7.15, -11.83], width: 2.2, yaw: Math.PI },
  fabrication: { at: [-4.4, 6.9, -6.74], width: 2.4, yaw: Math.PI },
  stores: { at: [4.4, 6.9, -6.74], width: 1.8, yaw: Math.PI },
  galley: { at: [.89, 6.9, 8.3], width: 1.8, yaw: Math.PI / 2 },
  cabin: { at: [.89, 6.9, 10.7], width: 1.5, yaw: Math.PI / 2 },
  vestibule: { at: [1.06, 6.9, 9.6], width: 2.0, yaw: -Math.PI / 2 },
};

/** Furniture and partitions, kept inside each solid (handles at most 2 cm proud). */
function fixtureArt(b: ArtBatch, f: InteriorSolid): void {
  const [cx, , cz] = center(f), w = f.max.x - f.min.x, d = f.max.z - f.min.z, top = f.max.y;
  switch (f.id) {
    case "hl.bridge.helm": {
      b.box([cx, 4.45, cz], [w, .9, d], P.petrol);
      b.face([[f.max.x, 5.15, f.min.z], [f.min.x, 5.15, f.min.z], [f.min.x, 4.9, f.max.z], [f.max.x, 4.9, f.max.z]], P.metal);
      // Three displays lie on the sloped top, which falls .25 m toward the pilot.
      const slope = (z: number): number => 5.15 - (z - f.min.z) * .25 / d + .006;
      for (const x of [-.78, 0, .78]) {
        b.face([[x + .3, slope(-8.5), -8.5], [x - .3, slope(-8.5), -8.5], [x - .3, slope(-8.0), -8.0], [x + .3, slope(-8.0), -8.0]], P.glass);
        b.glow(b.box([x, slope(-8.2) + .003, -8.2], [.44, .004, .05], x === 0 ? P.mint : P.reflection));
      }
      for (const x of [-.45, .45]) b.tube([[x, 4.93, -7.72], [x, 5.06, -7.6]], .025, P.metal, 5);
      b.ellipsoid([.45, 5.07, -7.58], [.045, .045, .045], P.ochre, 6);
      b.ellipsoid([-.45, 5.07, -7.58], [.045, .045, .045], P.amber, 6);
      b.box([cx, 4.08, cz], [w - .1, .16, d - .1], P.ink);
      break;
    }
    case "hl.bridge.seat": {
      b.tube([[cx, 4, cz], [cx, 4.5, cz]], .07, P.metal, 6);
      b.box([cx, 4.58, cz - .02], [w - .04, .14, .54], P.coral);
      b.box([cx, 4.88, f.max.z - .07], [w - .06, .56, .1], P.coral);
      b.box([cx, 5.1, f.max.z - .07], [w - .16, .14, .12], P.shell);
      break;
    }
    case "hl.bridge.survey": case "hl.bridge.launch": {
      b.box([cx, 4.4, cz], [w, .8, d], P.petrol);
      b.box([cx, 4.94, cz], [w, .12, d], P.metal);
      b.glow(b.box([cx, 5.005, cz], [w - .3, .01, d - .3], f.id.endsWith("survey") ? P.jade : P.glass));
      if (f.id.endsWith("survey")) {
        b.ring([cx, 5.012, cz], [1, 0, 0], [0, 0, 1], .45, .41, P.mint, 16);
        b.ring([cx, 5.012, cz], [1, 0, 0], [0, 0, 1], .22, .2, P.mint, 12);
      } else for (const x of [cx - .35, cx + .35]) b.glow(b.box([x, 5.012, cz], [.5, .006, .9], P.amber));
      break;
    }
    case "hl.bulkhead.fore.port": case "hl.bulkhead.fore.starboard": case "hl.bulkhead.aft": {
      b.bounds(f, P.porcelain);
      const along = w > d, t = along ? d : w;
      for (const off of [-1, 1]) {
        const p: Point = along ? [cx, 4.3, cz + off * (t / 2 + .004)] : [cx + off * (t / 2 + .004), 4.3, cz];
        b.box(p, along ? [w, .6, .008] : [.008, .6, d], P.metal);
        b.box([p[0], 4.62, p[2]], along ? [w, .05, .009] : [.009, .05, d], P.ochre);
      }
      break;
    }
    case "hl.fab.fabricator": {
      b.bounds(f, P.porcelain);
      b.box([f.max.x + .004, 5.0, cz], [.008, .9, d - .5], P.ink);
      b.glow(b.box([f.max.x + .008, 5.0, cz], [.006, .7, d - .7], P.amber));
      b.box([f.max.x + .006, 5.75, cz], [.01, .1, d - .2], P.ochre);
      b.box([f.max.x + .005, 6.15, cz], [.01, .3, d - .3], P.petrol);
      b.glow(b.box([f.max.x + .009, 6.15, cz - .55], [.006, .1, .1], P.mint));
      break;
    }
    case "hl.fab.bench": case "hl.galley.table": case "hl.galley.bench": case "hl.vestibule.bench": {
      const slab = f.id.endsWith("table") || f.id.endsWith("bench") && !f.id.startsWith("hl.fab") ? .08 : .06;
      b.box([cx, top - slab / 2, cz], [w, slab, d], f.id.startsWith("hl.galley") ? P.ochre : P.metal);
      if (f.id === "hl.galley.table") b.tube([[cx, 4, cz], [cx, top - slab, cz]], .09, P.petrol, 8);
      else for (const x of [f.min.x + .06, f.max.x - .06]) b.box([x, (4 + top - slab) / 2, cz], [.06, top - slab - 4, d - .08], P.petrol);
      if (f.id === "hl.fab.bench") {
        b.box([cx, 4.55, cz], [w - .2, .45, d - .04], P.shade);
        for (const x of [cx - .55, cx, cx + .55]) b.box([x, 4.62, f.max.z + .004], [.4, .02, .008], P.ochre);
      }
      break;
    }
    case "hl.fab.locker": case "hl.stores.lockers": case "hl.galley.pantry": case "hl.cabin.locker": case "hl.vestibule.suits": {
      b.bounds(f, f.id === "hl.stores.lockers" ? P.shade : P.porcelain);
      // Doors on the open face, toward the room.
      const face = f.id === "hl.stores.lockers" ? "-x" : f.id === "hl.galley.pantry" || f.id === "hl.fab.locker" ? "+x" : "-z";
      const doors = Math.max(1, Math.round((face === "-z" ? w : d) / .6));
      for (let i = 0; i < doors; i++) {
        const t = (i + .5) / doors;
        if (face === "-z") {
          const x = f.min.x + w * t;
          b.box([x, (4.05 + top) / 2, f.min.z - .004], [w / doors - .06, top - 4.15, .008], f.id === "hl.vestibule.suits" ? P.ochre : P.steelLight);
          b.box([x + w / doors * .3, 5.1, f.min.z - .012], [.04, .22, .016], P.ink);
        } else {
          const x = face === "-x" ? f.min.x - .004 : f.max.x + .004, z = f.min.z + d * t;
          b.box([x, (4.05 + top) / 2, z], [.008, top - 4.15, d / doors - .06], f.id === "hl.stores.lockers" ? (i % 2 ? P.metal : P.steelLight) : P.steelLight);
          b.box([x + (face === "-x" ? -.008 : .008), 5.1, z + d / doors * .3], [.016, .22, .04], P.ochre);
        }
      }
      break;
    }
    case "hl.stores.rack": {
      for (const x of [f.min.x + .04, f.max.x - .04]) b.box([x, (4 + top) / 2, cz], [.06, top - 4, d], P.petrol);
      for (const y of [4.1, 4.9, 5.7]) {
        b.box([cx, y, cz], [w - .08, .04, d], P.metal);
        for (let i = 0; i < 3; i++) b.box([f.min.x + .35 + i * .6, y + .16, cz], [.42, .28, d - .1], i % 2 ? P.ochre : P.steelLight);
      }
      break;
    }
    case "hl.galley.counter": {
      b.box([cx, 4.43, cz], [w, .86, d], P.shell);
      b.box([cx, 4.91, cz], [w, .08, d], P.metal);
      b.ring([cx + .05, 4.955, 6.6], [1, 0, 0], [0, 0, 1], .19, .11, P.ink, 12);
      b.glow(b.box([cx + .05, 4.952, 6.6], [.14, .004, .14], P.amber));
      b.ring([cx + .05, 4.955, 7.25], [1, 0, 0], [0, 0, 1], .16, .1, P.ink, 12);
      for (let z = 6.2; z < 8.4; z += .55) b.box([f.max.x + .004, 4.45, z + .25], [.008, .72, .48], P.ochre);
      break;
    }
    case "hl.cabin.bunks": {
      b.box([cx, 4.15, cz], [w, .3, d], P.petrol);
      for (const y of [4.55, 5.75]) {
        b.box([cx, y - .12, cz], [w, .08, d], P.petrol);
        b.box([cx, y, cz], [w - .1, .16, d - .1], P.porcelain);
        b.box([cx + .3, y + .1, cz], [w - .8, .06, d - .12], y < 5 ? P.coral : P.jade);
        b.box([f.min.x + .3, y + .12, cz], [.42, .1, d - .3], P.shell);
      }
      for (const x of [f.min.x + .03, f.max.x - .03]) b.box([x, (4 + top) / 2, f.max.z - .05], [.06, top - 4, .08], P.petrol);
      b.box([cx, top - .04, cz], [w, .08, d], P.petrol);
      for (const y of [4.6, 5.0, 5.4, 5.8]) b.box([f.max.x - .1, y, f.min.z + .03], [.12, .04, .04], P.steelLight);
      b.glow(b.box([f.min.x + .2, 6.35, f.max.z - .1], [.12, .08, .04], P.warm));
      break;
    }
    case "hl.vestibule.launch": {
      b.box([cx, 4.5, cz], [w, 1.0, d], P.petrol);
      b.face([[f.min.x, 5.2, f.max.z], [f.max.x, 5.2, f.max.z], [f.max.x, 5.0, f.min.z], [f.min.x, 5.0, f.min.z]], P.metal);
      for (const x of [cx - .3, cx + .3]) b.glow(b.box([x, 5.115, cz], [.4, .01, .25], x < cx ? P.mint : P.amber));
      break;
    }
    default: b.bounds(f, P.shade);
  }
}

/** Placeholder occupant for an authored socket, drawn inside its footprint.
 * The kind follows the first accepted category; the gameplay item is S3-agnostic. */
function socketOccupant(scene: Scene, cel: ShaderMaterial, name: string, s: Socket, cache?: GeometryCache): Mesh {
  const b = batchFor(scene, cel, cache, name, "hearthline", `socket-${s.id}`), f = s.footprint;
  const [cx, , cz] = center(f), w = f.max.x - f.min.x, d = f.max.z - f.min.z, h = f.max.y - f.min.y, base = f.min.y;
  const kind = s.accepts[0]!;
  if (kind === "galley_planter") {
    b.box([cx, base + .14, cz], [w, .28, d], P.ochre);
    b.box([cx, base + .285, cz], [w - .08, .02, d - .08], P.basalt);
    for (let i = 0; i < 5; i++) b.ellipsoid([f.min.x + w * (.2 + i * .15), base + .45, f.min.z + d * (.25 + (i % 2) * .5)], [.12, .16, .12], i % 2 ? P.lime : P.jade, 7);
  } else if (s.kind === "furniture") {
    b.box([cx, base + h / 2, cz], [w, h, d], kind === "locker" ? P.steelLight : P.shell);
    for (let y = base + .4; y < f.max.y - .2; y += .5) b.box([cx, y, cz], [w - .04, .04, d - .04], P.petrol);
  } else {
    b.box([cx, base + h * .45, cz], [w, h * .9, d], P.petrol);
    b.glow(b.box([cx, base + h * .92, cz], [w * .6, h * .06, d * .6], kind.includes("charger") ? P.amber : P.mint));
  }
  const mesh = b.finish(.2);
  mesh.metadata = { socket: s.id };
  return mesh;
}

// ---------------------------------------------------------------- configuration shell

/** Berth rooms, deck, lock and throat from carrierStructure, which stays the
 * physical authority: every box is drawn on its descriptor, skins at most 1 cm
 * proud. Rebuilt on configuration or transfer slot changes, as today. */
export function hearthlineShellArt(scene: Scene, cel: ShaderMaterial, glass: ShaderMaterial, id: string,
  configuration: "compact" | "medium", openSlot?: 0 | 1, labels?: LabelMaterials): Mesh {
  const b = new ArtBatch(`${id}.shell`, scene, cel);
  const rooms = carrierRooms(configuration), panes: Point[][] = [], signs: [string, Point, number, number][] = [];
  for (const solid of carrierStructure(configuration, openSlot)) {
    const room = rooms.find((r) => solid.id === r.id + ".fore" || solid.id === r.id + ".aft");
    if (room) {
      const a = solid.min, c = solid.max;
      wallWithOpening(b, [(a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2], [c.x - a.x, c.y - a.y, c.z - a.z], {
        center: [(room.min.x + room.max.x) / 2, room.min.y + 1.85, 0], width: room.max.x - room.min.x - 1.04, height: 1.21, normal: "z",
      }, P.petrol);
    } else b.bounds(solid, solid.id.includes("gate") ? P.ochre : solid.id.includes("roof") ? P.shade
      : solid.id.includes("deck") || solid.id.endsWith(".floor") ? P.petrol : solid.id.includes("throat") ? P.metal : P.porcelain);
  }
  for (const [slot, room] of rooms.entries()) {
    const { min: a, max: c } = room, w = c.x - a.x, cx = (a.x + c.x) / 2;
    const accent = slot === 0 ? P.ochre : P.steelLight;
    for (const [z, toward] of [[a.z - CARRIER_LAYOUT.wall, -1], [c.z + CARRIER_LAYOUT.wall, 1]] as const) {
      const f = z + toward * .004;
      b.box([cx, a.y + .65, f], [w - .14, 1.05, .006], P.metal);
      b.box([cx, a.y + .18, f + toward * .002], [w - .4, .07, .004], accent);
      b.box([cx, a.y + 2.7, f + toward * .002], [w - .8, .06, .004], openSlot === slot ? P.ochre : P.mint);
      for (const x of [a.x + .16, c.x - .16]) b.box([x, a.y + 1.85, f], [.1, 3.7, .006], P.porcelain);
      const x0 = cx - (w - 1.04) / 2, x1 = cx + (w - 1.04) / 2, y0 = a.y + 1.85 - .605, y1 = a.y + 1.85 + .605;
      panes.push([[x0, y0, z + toward * .02], [x1, y0, z + toward * .02], [x1, y1, z + toward * .02], [x0, y1, z + toward * .02]]);
      b.tube([[x0, y0, f], [x1, y0, f], [x1, y1, f], [x0, y1, f], [x0, y0, f]], .014, P.ochre, 4);
      const yaw = toward < 0 ? 0 : Math.PI;
      signs.push([configuration === "medium" ? "SERVICE BERTH" : slot === 0 ? "PORT / 01" : "STARBOARD / 02", [cx, a.y + 2.95, z + toward * .022], Math.min(2.3, w - 1.05), yaw]);
      signs.push([openSlot === slot ? "TRANSFER / KEEP CLEAR" : "DRY / ISOLATED", [cx, a.y + .65, z + toward * .022], Math.min(1.65, w - .9), yaw]);
    }
  }
  // Ceiling over the walkable deck in the berth zone (between and around the
  // rooms), with warm strips; and painted passage tracks.
  const deck = CARRIER_LAYOUT.deck, xs = [-LINING.x, LINING.x, ...rooms.flatMap((r) => [r.min.x - CARRIER_LAYOUT.wall, r.max.x + CARRIER_LAYOUT.wall])].sort((p, q) => p - q);
  const zs = [BERTH_ZONE.minZ, BERTH_ZONE.maxZ, ...rooms.flatMap((r) => [r.min.z - CARRIER_LAYOUT.wall, r.max.z + CARRIER_LAYOUT.wall])].sort((p, q) => p - q);
  for (let i = 1; i < xs.length; i++) for (let j = 1; j < zs.length; j++) {
    const x0 = xs[i - 1]!, x1 = xs[i]!, z0 = zs[j - 1]!, z1 = zs[j]!;
    if (x1 - x0 < .01 || z1 - z0 < .01) continue;
    const x = (x0 + x1) / 2, z = (z0 + z1) / 2;
    if (rooms.some((r) => x > r.min.x - CARRIER_LAYOUT.wall && x < r.max.x + CARRIER_LAYOUT.wall && z > r.min.z - CARRIER_LAYOUT.wall && z < r.max.z + CARRIER_LAYOUT.wall)) continue;
    b.box([x, LINING.ceiling + .03, z], [x1 - x0, .06, z1 - z0], P.shell);
    if (x1 - x0 > .5 && z1 - z0 > 1.5) b.glow(b.box([x, LINING.ceiling - .005, z], [Math.min(.22, x1 - x0 - .2), .02, z1 - z0 - .6], P.warm));
  }
  const passage = configuration === "compact" ? [rooms[0]!.max.x + CARRIER_LAYOUT.wall, rooms[1]!.min.x - CARRIER_LAYOUT.wall] : [rooms[0]!.max.x + CARRIER_LAYOUT.wall, CARRIER_LAYOUT.interior.maxX];
  const px = (passage[0]! + passage[1]!) / 2;
  for (let z = deck.min.z + 1; z < deck.max.z - 1; z += .85)
    for (const x of [px - .27, px + .27]) b.box([x, deck.max.y + .002, z], [.045, .004, .5], P.mint);
  // Launch-well mouth: hazard chevrons on the throat plates and mint guide lights.
  const t = CARRIER_LAYOUT.throat;
  for (const side of [-1, 1]) {
    const x = side * (t.max.x + CARRIER_LAYOUT.wall / 2) + side * .045;
    for (let y = t.min.y + .4; y < t.max.y - .2; y += .8) b.box([x, y, t.min.z + .4], [.01, .35, .6], P.ochre);
    for (let z = t.min.z + 1; z < t.max.z; z += 1.6) b.glow(b.box([side * (t.max.x - .01), 0, z], [.012, .1, .4], P.mint));
  }
  const mesh = b.finish(.2);
  mesh.unfreezeWorldMatrix();
  mesh.renderingGroupId = 1;
  glazing(scene, glass, `${id}.shell.glazing`, panes, mesh);
  for (const [text, p, width, yaw] of signs) label(scene, text, p, width, yaw, labels).parent = mesh;
  return mesh;
}

/** Show the occupants of the given sockets; hide the rest. */
export function setHearthlineSockets(hull: Mesh, id: string, occupied: readonly string[]): void {
  for (const m of hull.getChildMeshes(true))
    if (m.name.startsWith(`${id}.socket.`)) m.setEnabled(occupied.includes((m.metadata as { socket: string }).socket));
}

