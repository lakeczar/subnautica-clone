import type { Mesh, Scene, ShaderMaterial } from "@babylonjs/core";
import type { Point } from "../geometry.js";
import type { GeometryCache } from "../geometryCache.js";
import { PALETTE as P } from "../palette.js";
import { HUSH } from "../../content/fleet/hulls.js";
import { batchFor, child, glazing, lerp, loop, mirrored, plate, skin } from "./common.js";

/** Starboard wing stations, root to tip: span x, leading/trailing edge z,
 * camber line y and thickness. The trailing edge sweeps back to the tips. */
const WING = [
  { x: .7, le: -2.45, te: .35, c: 1.08, t: .34 },
  { x: 1.3, le: -1.78, te: .12, c: 1.12, t: .26 },
  { x: 1.8, le: -.95, te: .5, c: 1.18, t: .18 },
  { x: 2.15, le: .08, te: 1.3, c: 1.25, t: .11 },
  { x: 2.38, le: 1.15, te: 2.15, c: 1.32, t: .05 },
] as const;
const TOP = [[1, 0], [.7, .55], [.3, 1], [.1, .7], [0, 0]] as const;
const BOTTOM = [[0, 0], [.1, -.35], [.3, -.5], [.7, -.3], [1, 0]] as const;
const station = (s: typeof WING[number], shape: readonly (readonly [number, number])[]): Point[] =>
  shape.map(([u, k]): Point => [s.x, s.c + k * s.t, lerp(s.le, s.te, u)]);

/** Upper and lower surfaces of the starboard wing, outward-wound. */
function wingRings(): { top: Point[][]; bottom: Point[][] } {
  return { top: WING.map((s) => station(s, TOP)), bottom: WING.map((s) => station(s, BOTTOM)) };
}

/** Quiet survey glider: a broad countershaded crescent around a porcelain pod,
 * an underslung glazed blister, winglet fins and a single shrouded fan.
 * Hull-local keel datum; every part stays inside HUSH's envelopes. */
export function hushArt(scene: Scene, cel: ShaderMaterial, glass: ShaderMaterial, id: string, cache?: GeometryCache): Mesh {
  const b = batchFor(scene, cel, cache, id, "hush", "hull");
  const { top, bottom } = wingRings();
  // Dark, quiet upper surface over a pale belly; mint listening edge.
  for (const [rings, color] of [[top, P.plum], [bottom, P.shade]] as const) {
    skin(b, rings, color, false);
    skin(b, mirrored(rings), color, false);
  }
  for (const side of [1, -1]) {
    const tip = WING.at(-1)!, root = WING[0]!;
    // Tip cap closes the airfoil.
    const cap = [...station(tip, TOP), ...station(tip, BOTTOM).slice(1, -1)].map((p): Point => [side * p[0], p[1], p[2]]);
    b.face(side > 0 ? cap : [...cap].reverse(), P.plum);
    b.tube(WING.map((s): Point => [side * Math.min(s.x, 2.36), s.c, s.le + .02]), .045, P.mint, 6);
    // Trailing-edge flaps, a violet stripe the pilot sees from the canopy.
    b.tube(WING.slice(1).map((s): Point => [side * s.x, s.c + .02, s.te - .12]), .035, P.violet, 5);
    // Root fillet seam into the pod.
    b.tube([[side * root.x, root.c + .12, root.le + .3], [side * root.x, root.c + .14, root.te - .2]], .03, P.seam, 4);
    // Hydrophone pods ride the leading edge.
    for (const s of WING.slice(1, 4)) b.ellipsoid([side * s.x, s.c - .01, s.le + .1], [.085, .07, .17], P.mint, 8);
    // Winglets: a swept upper fin and a short ventral keel at each tip.
    const wx = side * 2.33;
    plate(b, [[wx, 1.25, 1.0], [wx, 1.3, 2.14], [wx, 2.04, 2.22], [wx, 1.98, 1.78]], [side * .06, 0, 0], P.violet, P.plum);
    plate(b, [[wx, 1.25, 1.35], [wx, .6, 1.62], [wx, .58, 1.95], [wx, 1.27, 2.05]], [side * .06, 0, 0], P.plum);
    // Equipment socket pads under each wing root, ochre rim and bolt pair.
    const m = HUSH.mounts.find((k) => k.id === `hush.socket.${side > 0 ? "starboard" : "port"}`)!;
    b.box([m.at[0], m.at[1] + .02, m.at[2]], [m.size[0], .05, m.size[2]], P.petrol);
    b.box([m.at[0], m.at[1] - .01, m.at[2] - m.size[2] / 2 + .04], [m.size[0], .03, .05], P.ochre);
    for (const dz of [-.2, .2]) b.box([m.at[0], m.at[1] - .015, m.at[2] + dz], [.07, .03, .07], P.steelLight);
  }
  // Porcelain pod: a low hull under the canopy, then the dorsal hump.
  b.loft([
    { z: -3.42, w: .14, low: .8, high: .98 },
    { z: -2.8, w: .55, low: .52, high: 1.2 },
    { z: -1.6, w: .86, low: .4, high: 1.25 },
    { z: .3, w: .9, low: .42, high: 1.3 },
    { z: 1.6, w: .66, low: .55, high: 1.25 },
    { z: 2.5, w: .4, low: .72, high: 1.18 },
    { z: 2.8, w: .3, low: .8, high: 1.12 },
  ], P.shade);
  b.loft([
    { z: -.1, w: .58, low: 1.24, high: 1.92 },
    { z: 1.1, w: .5, low: 1.24, high: 1.8 },
    { z: 2.3, w: .3, low: 1.18, high: 1.38 },
  ], P.porcelain);
  // Nose sensor and the blue recessed seams of pressure equipment.
  b.ellipsoid([0, .9, -3.36], [.11, .09, .1], P.ink, 8);
  for (const side of [-1, 1]) {
    b.tube([[side * .38, 1.21, -2.78], [side * .6, 1.27, -1.6], [side * .62, 1.3, .3], [side * .46, 1.26, 1.6]], .022, P.seam, 4);
    b.tube([[side * .5, .55, -2.6], [side * .77, .44, -1.0], [side * .7, .5, 1.4]], .02, P.seam, 4);
  }
  // Gasket around the canopy and the canopy's aft hoop.
  const C = CANOPY;
  b.tube([C.nose[0], C.nose[1], C.crown[1], C.aft[1], C.aft[0], C.crown[0], C.nose[0]], .026, P.petrol, 6);
  b.tube([C.aft[0], [0, 1.94, -.15], C.aft[1]], .04, P.porcelain, 6);
  // Dorsal hatch with an ochre grab bar, and the passive listening "ears".
  b.ring([0, 1.83, .55], [1, 0, 0], [0, 0, 1], .3, .22, P.steelLight, 12);
  b.ellipsoid([0, 1.81, .55], [.22, .02, .22], P.shade, 10);
  b.tube([[-.18, 1.86, .9], [-.18, 1.9, .92], [.18, 1.9, .92], [.18, 1.86, .9]], .02, P.ochre, 5);
  for (const side of [-1, 1]) {
    b.ring([side * .45, 1.58, 1.2], [0, 0, 1], [0, 1, 0], .18, .1, P.steelLight, 12);
    b.ellipsoid([side * .44, 1.58, 1.2], [.05, .1, .1], P.ink, 8);
  }
  // Shrouded stern fan and the Bobbin collar on the hump's aft face.
  b.tube(loop([0, .98, 2.9], [1, 0, 0], [0, 1, 0], .34, 16), .075, P.petrol, 6);
  b.ellipsoid([0, .98, 2.86], [.12, .12, .14], P.ink, 8);
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + .4;
    b.tube([[0, .98, 2.88], [Math.cos(a) * .3, .98 + Math.sin(a) * .3, 2.9]], .025, P.steelLight, 4);
  }
  b.tube([[0, .8, 2.75], [0, .64, 2.9]], .04, P.petrol, 5);
  b.ring([0, 1.3, 2.31], [1, 0, 0], [0, 1, 0], .17, .1, P.shell, 10);
  // Blister frame: a porcelain rim under the pod and two keel ribs.
  const rim = blisterRings()[0]!;
  b.tube([...rim, rim[0]!], .035, P.porcelain, 5);
  b.tube([[0, .5, -2.38], [0, .2, -2.2], [0, .03, -1.45], [0, .2, -.7], [0, .5, -.56]], .028, P.porcelain, 5);
  // Running lights: amber port, mint starboard (as the Dart).
  for (const side of [-1, 1]) b.glow(b.box([side * 2.3, 1.31, .95], [.08, .04, .14], side < 0 ? P.amber : P.mint));
  const hull = b.finish(.5);
  hull.unfreezeWorldMatrix(); hull.renderingGroupId = 1;
  const blister = blisterRings();
  glazing(scene, glass, `${id}.glazing`, [
    [C.nose[0], C.nose[1], C.crown[1], C.crown[0]],
    [C.crown[0], C.crown[1], C.aft[1], C.aft[0]],
    [C.nose[0], C.crown[0], C.aft[0], C.side[0]],
    [C.side[1], C.aft[1], C.crown[1], C.nose[1]],
    ...blisterFaces(blister),
  ], hull);

  // View-only pilot fittings: console under the canopy and two state bars.
  const cockpit = batchFor(scene, cel, cache, `${id}.cockpit`, "hush", "cockpit");
  cockpit.box([0, 1.12, -2.2], [.7, .16, .42], P.petrol);
  cockpit.face([[-.32, 1.21, -2.4], [.32, 1.21, -2.4], [.32, 1.17, -2.02], [-.32, 1.17, -2.02]], P.metal);
  cockpit.box([0, 1.06, -.75], [.5, .4, .5], P.shade);
  cockpit.box([0, 1.4, -.52], [.48, .5, .1], P.petrol);
  for (const x of [-.36, .36]) {
    cockpit.tube([[x, .95, -1.6], [x, 1.12, -1.7], [x * .9, 1.16, -1.8]], .02, P.metal, 5);
    cockpit.ellipsoid([x * .9, 1.17, -1.81], [.035, .035, .035], P.ochre, 6);
  }
  const fittings = child(cockpit.finish(), hull);
  for (const [kind, left] of [["charge", -.28], ["health", .02]] as const) {
    const gauge = batchFor(scene, cel, cache, `${id}.instrument.${kind}`, "hush", `gauge-${kind}`);
    gauge.glow(gauge.box([.12, 0, 0], [.24, .01, .06], kind === "charge" ? P.amber : P.mint));
    child(gauge.finish(), fittings).position.set(left, 1.215, -2.3);
  }
  return hull;
}

/** Canopy corner points: nose and crown edges sit on the pod's top chines. */
const CANOPY = {
  nose: [[-.42, 1.22, -2.35], [.42, 1.22, -2.35]],
  crown: [[-.44, 1.8, -1.45], [.44, 1.8, -1.45]],
  aft: [[-.4, 1.9, -.15], [.4, 1.9, -.15]],
  side: [[-.6, 1.28, -.15], [.6, 1.28, -.15]],
} as const satisfies Record<string, readonly [Point, Point]>;

/** Blister rings from the pod rim (y 0.5) down to the keel facet (y 0). */
function blisterRings(): Point[][] {
  return [[.62, .5, .94], [.55, .2, .82], [.28, 0, .42]].map(([rx, y, rz]) =>
    Array.from({ length: 8 }, (_, j): Point => {
      const a = j / 8 * Math.PI * 2;
      return [Math.cos(a) * rx!, y!, -1.47 + Math.sin(a) * rz!];
    }));
}
function blisterFaces(rings: Point[][]): Point[][] {
  const faces: Point[][] = [];
  for (let i = 0; i < rings.length - 1; i++)
    for (let j = 0; j < 8; j++) {
      const k = (j + 1) % 8;
      faces.push([rings[i + 1]![j]!, rings[i + 1]![k]!, rings[i]![k]!, rings[i]![j]!]);
    }
  faces.push([...rings.at(-1)!].reverse());
  return faces;
}
