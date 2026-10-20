import type { Mesh, Scene, ShaderMaterial } from "@babylonjs/core";
import type { Point } from "../geometry.js";
import type { GeometryCache } from "../geometryCache.js";
import { PALETTE as P } from "../palette.js";
import { MANTLE } from "../../content/fleet/hulls.js";
import { batchFor, child, glazing, lathe, loftAt, loop, plate } from "./common.js";

/** Bell profile [radius x, y, radius z], keel datum. */
const BELL: readonly Point[] = [
  [1.45, .32, 1.45], [1.95, .5, 1.95], [2.18, .95, 2.18], [2.22, 1.5, 2.22], [2.22, 2.0, 2.22],
  [2.05, 2.62, 2.05], [1.6, 3.12, 1.6], [.95, 3.44, .95], [.4, 3.55, .4],
];
const SIDES = 16;
/** The forward viewport: the two segments either side of -Z, between y 1.5 and 2.0. */
const VIEWPORT = { segments: [11, 12], band: 3 } as const;
const ring = (i: number, j: number): Point => {
  const [rx, y, rz] = BELL[i]!, a = j / SIDES * Math.PI * 2;
  return [Math.cos(a) * rx, y, Math.sin(a) * rz];
};

/** Deep service craft: a porcelain pressure bell banded in petrol armour on a
 * skid ring, a heavy ochre service jaw forward, radiator fin stacks on both
 * flanks and an aft power pod. The single forward slot is the only real view. */
export function mantleArt(scene: Scene, cel: ShaderMaterial, glass: ShaderMaterial, id: string, cache?: GeometryCache): Mesh {
  const b = batchFor(scene, cel, cache, id, "mantle", "hull");
  const rings = lathe(b, [0, 0, 0], BELL, SIDES, P.porcelain,
    (j, band) => band === VIEWPORT.band && (VIEWPORT.segments as readonly number[]).includes(j));
  b.face(rings.at(-1)!, P.porcelain);
  b.face([...rings[0]!].reverse(), P.metal);
  // Armour: two petrol bands and vertical ribs that stop short of the viewport.
  for (const [i, r] of [[2, .07], [4, .07], [5, .05]] as const) b.tube(loop([0, BELL[i]![1], 0], [1, 0, 0], [0, 0, 1], BELL[i]![0] + .02, 24), r, P.petrol, 6);
  for (let j = 1; j < SIDES; j += 2) {
    if (j >= 10 && j <= 13) continue;
    b.tube([2, 3, 4, 5, 6].map((i): Point => { const p = ring(i, j); return [p[0] * 1.015, p[1], p[2] * 1.015]; }), .045, P.seam, 4);
  }
  // Viewport frame: a heavy ochre lip around the opening and a centre mullion.
  const v = [ring(3, 11), ring(3, 12), ring(3, 13), ring(4, 13), ring(4, 12), ring(4, 11)];
  b.tube([...v, v[0]!], .06, P.ochre, 6);
  b.tube([ring(3, 12), ring(4, 12)], .035, P.petrol, 5);
  // Two small side ports: bezels only, the restricted view is the point.
  for (const j of [8.6, 15.4]) {
    const a = j / SIDES * Math.PI * 2, c: Point = [Math.cos(a) * 2.1, 2.42, Math.sin(a) * 2.1];
    b.ring(c, [-Math.sin(a), 0, Math.cos(a)], [0, 1, .0], .2, .12, P.steelLight, 12);
    b.ellipsoid([c[0] * .995, c[1], c[2] * .995], [.12, .12, .12], P.glass, 8);
  }
  // Floodlights above the slot.
  for (const x of [-.62, .62]) {
    b.box([x, 2.62, -1.95], [.3, .22, .22], P.petrol);
    b.glow(b.box([x, 2.62, -2.07], [.22, .14, .02], P.warm));
  }
  // Skid ring on four legs, and four ducted station-keeping thrusters.
  b.tube(loop([0, .14, 0], [1, 0, 0], [0, 0, 1], 1.62, 20), .12, P.metal, 6);
  for (let k = 0; k < 4; k++) {
    const a = (k + .5) / 4 * Math.PI * 2, x = Math.cos(a), z = Math.sin(a);
    b.tube([[x * 1.62, .14, z * 1.62], [x * 1.62, .26, z * 1.62], [x * 1.42, .4, z * 1.42]], .07, P.metal, 5);
    const c: Point = [x * 2.2, .62, z * 2.2];
    b.tube(loop(c, [1, 0, 0], [0, 0, 1], .24, 12), .055, P.petrol, 5);
    b.ellipsoid(c, [.1, .1, .1], P.ink, 6);
    b.tube([[x * 1.92, .62, z * 1.92], [c[0], c[1], c[2]]], .05, P.metal, 4);
  }
  // Service jaw: housing through the bell, twin arms, wrist, two claws and the
  // repair coupling between them. Ochre: the working edge of the craft.
  b.box([0, .88, -2.2], [1.0, .62, .62], P.petrol);
  for (const x of [-.34, .34]) b.tube([[x, .92, -2.4], [x, .84, -2.9], [x, .8, -3.28]], .08, P.metal, 6);
  b.box([0, .8, -3.36], [1.08, .44, .3], P.petrol);
  for (const side of [-1, 1]) {
    b.tube([[side * .48, .82, -3.48], [side * .64, .76, -3.82], [side * .52, .7, -4.12], [side * .24, .66, -4.27]], .085, P.ochre, 6);
    b.tube([[side * .48, .6, -3.48], [side * .6, .52, -3.8], [side * .44, .44, -4.06]], .06, P.ochre, 6);
    for (const t of [[.5, .72, -3.95], [.36, .66, -4.18]] as const)
      b.box([side * (t[0] - .08), t[1], t[2]], [.08, .07, .07], P.ink);
  }
  b.ring([0, .8, -3.52], [1, 0, 0], [0, 1, 0], .17, .09, P.steelLight, 12);
  b.ellipsoid([0, .8, -3.5], [.08, .08, .04], P.ink, 6);
  // Radiator fin stacks: five plates a side on a manifold, warm edges glowing.
  for (const side of [-1, 1]) {
    for (const z of [-.6, -.15, .3, .75, 1.2]) {
      plate(b, [[side * 2.1, 1.0, z], [side * 2.84, 1.22, z], [side * 2.84, 2.34, z], [side * 2.1, 2.56, z]], [0, 0, .05], P.metal, P.steelLight);
      b.glow(b.box([side * 2.845, 1.78, z + .025], [.012, 1.0, .03], P.amber));
    }
    for (const y of [1.15, 2.42]) b.tube([[side * 2.16, y, -.78], [side * 2.16, y, 1.38]], .06, P.petrol, 5);
    // Equipment socket on each aft quarter, just above the skid.
    const m = MANTLE.mounts.find((k) => k.id === `mantle.socket.${side > 0 ? "starboard" : "port"}`)!;
    b.panel([m.at[0], m.at[1] + .35, m.at[2]], [.5, .42], .05, P.petrol, side > 0 ? -Math.PI * .75 : Math.PI * .75, .06);
  }
  // Aft power pod with ochre cell bands, the Bobbin collar on its tail.
  loftAt(b, [{ z: 1.9, w: .8, low: .74, high: 2.08 }, { z: 2.95, w: .78, low: .74, high: 2.08 }, { z: 3.3, w: .55, low: .95, high: 1.86 }], P.petrol, [0, 0, 0]);
  for (const z of [2.25, 2.6]) b.box([0, 1.41, z], [1.6, 1.38, .06], P.ochre);
  b.ring([0, 1.4, 3.31], [1, 0, 0], [0, 1, 0], .2, .12, P.shell, 10);
  // Dorsal hatch and lifting eye.
  b.ring([0, 3.5, .5], [1, 0, 0], [0, 0, 1], .34, .25, P.steelLight, 12);
  b.ellipsoid([0, 3.5, .5], [.26, .03, .26], P.shade, 10);
  b.tube([[-.36, 3.48, 0], [-.3, 3.78, 0], [0, 3.88, 0], [.3, 3.78, 0], [.36, 3.48, 0]], .05, P.ochre, 6);
  // Running lights at the bell shoulder.
  for (const side of [-1, 1]) b.glow(b.box([side * 2.07, 2.62, .2], [.04, .08, .14], side < 0 ? P.amber : P.mint));
  const hull = b.finish(.5);
  hull.unfreezeWorldMatrix();
  glazing(scene, glass, `${id}.glazing`, [
    [ring(3, 11), ring(3, 12), ring(4, 12), ring(4, 11)],
    [ring(3, 12), ring(3, 13), ring(4, 13), ring(4, 12)],
  ], hull);

  // View-only pilot fittings inside the bell: console under the slot, jaw
  // levers and two state bars. Nothing here reaches past the shell.
  const cockpit = batchFor(scene, cel, cache, `${id}.cockpit`, "mantle", "cockpit");
  cockpit.box([0, 1.28, -1.72], [1.3, .3, .44], P.petrol);
  cockpit.face([[-.62, 1.44, -1.92], [.62, 1.44, -1.92], [.62, 1.4, -1.52], [-.62, 1.4, -1.52]], P.metal);
  cockpit.box([0, .82, -.7], [.62, .5, .6], P.shade);
  cockpit.box([0, 1.4, -.4], [.6, .9, .12], P.petrol);
  for (const x of [-.48, .48]) {
    cockpit.tube([[x, 1.2, -1.45], [x, 1.42, -1.5]], .025, P.metal, 5);
    cockpit.ellipsoid([x, 1.45, -1.5], [.05, .05, .05], P.ochre, 6);
  }
  const fittings = child(cockpit.finish(), hull);
  for (const [kind, left] of [["charge", -.4], ["health", .04]] as const) {
    const gauge = batchFor(scene, cel, cache, `${id}.instrument.${kind}`, "mantle", `gauge-${kind}`);
    gauge.glow(gauge.box([.17, 0, 0], [.34, .01, .07], kind === "charge" ? P.amber : P.mint));
    child(gauge.finish(), fittings).position.set(left, 1.445, -1.8);
  }
  return hull;
}
