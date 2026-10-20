import type { Mesh, Scene, ShaderMaterial } from "@babylonjs/core";
import type { Point } from "../geometry.js";
import type { GeometryCache } from "../geometryCache.js";
import { PALETTE as P } from "../palette.js";
import { SPINDLE, SPINDLE_FLOAT as F, SPINDLE_RAMP as R, SPINDLE_STRUT as S } from "../../content/fleet/hulls.js";
import { batchFor, child, glazing, lerp, loftAt } from "./common.js";

/** Island tender: a narrow porcelain surface hull, ochre outrigger floats with
 * solar decks on knee-jointed struts, an aft solar canopy over the pilot and a
 * bow landing ramp. Outriggers, struts, ramp and cargo are live children posed
 * by setSpindlePose; the hull batch itself never moves. */
export function spindleArt(scene: Scene, cel: ShaderMaterial, glass: ShaderMaterial, id: string, cache?: GeometryCache): Mesh {
  const b = batchFor(scene, cel, cache, id, "spindle", "hull");
  b.loft(HULL, P.porcelain);
  for (const side of [-1, 1]) {
    // Ochre rub rail at the deck edge, coral boot stripe at the waterline.
    b.tube([[side * .5, .9, -3.12], [side * .87, .99, -1.5], [side * .86, .99, 1.5], [side * .7, .96, 3.3], [side * .56, .91, 3.55]], .045, P.ochre, 6);
    b.tube([[side * .3, .36, -3.5], [side * .82, .42, -2.4], [side * .88, .42, 1.5], [side * .66, .44, 3.35]], .03, P.coral, 5);
    // Low coaming along the cargo deck.
    b.box([side * .8, 1.09, -1.2], [.06, .22, 3.6], P.shade);
    // Strut hinge brackets on the hull shoulder.
    for (const z of S.z) b.box([side * (S.hingeX - .02), S.hingeY - .02, z], [.12, .22, .24], P.metal);
    // Equipment sockets on each transom quarter.
    const m = SPINDLE.mounts.find((k) => k.id === `spindle.socket.${side > 0 ? "starboard" : "port"}`)!;
    b.panel([m.at[0], m.at[1], m.at[2]], [.6, .4], .04, P.petrol, side > 0 ? -Math.PI / 2 : Math.PI / 2, .05);
    for (const dz of [-.2, .2]) b.box([m.at[0] + side * .01, m.at[1] + .12, m.at[2] + dz], [.03, .06, .06], P.ochre);
  }
  // Cargo deck: pale plate, tie-down rails and a bow cleat bar.
  b.box([0, 1.0, -1.25], [1.5, .03, 3.5], P.shell);
  for (let i = 0; i < 6; i++) b.box([0, 1.02, -2.8 + i * .6], [1.42, .02, .05], P.steelLight);
  for (const x of [-.62, .62]) b.box([x, 1.025, -1.25], [.05, .03, 3.4], P.metal);
  // Bow frame the ramp seals against, with ochre hazard chevrons.
  b.box([0, .98, -3.12], [1.46, .1, .1], P.metal);
  for (const x of [-.7, .7]) b.box([x, .72, -3.12], [.1, .55, .12], P.metal);
  // Aft cockpit: a recessed well, console, seat and the transom.
  b.box([0, .56, 1.95], [1.34, .04, 2.0], P.metal);
  b.box([0, .9, 1.0], [1.2, .58, .3], P.petrol);
  b.face([[-.6, 1.19, .85], [.6, 1.19, .85], [.6, 1.14, 1.15], [-.6, 1.14, 1.15]], P.metal);
  b.box([0, .74, 2.1], [.62, .36, .5], P.shade);
  b.box([0, 1.1, 2.38], [.6, .52, .1], P.petrol);
  // Solar canopy: four posts and a dark photovoltaic roof with pale grid lines.
  for (const x of [-.9, .9]) for (const z of [.55, 2.85]) b.tube([[x, .96, z], [x, 1.98, z]], .035, P.steelLight, 5);
  b.box([0, 2.0, 1.7], [2.06, .04, 2.56], P.metal);
  b.box([0, 2.045, 1.7], [1.94, .03, 2.44], P.glass);
  for (let i = -3; i <= 3; i++) b.box([i * .27, 2.064, 1.7], [.012, .006, 2.4], P.reflection);
  for (let i = -4; i <= 4; i++) b.box([0, 2.064, 1.7 + i * .27], [1.9, .006, .012], P.reflection);
  // Stern swim platform, ladder and the Bobbin collar.
  b.box([0, .47, 3.54], [1.1, .06, .26], P.steelLight);
  for (const x of [-.3, .3]) b.tube([[x, .47, 3.62], [x, .1, 3.66]], .02, P.steelLight, 4);
  b.box([0, .24, 3.645], [.62, .025, .03], P.steelLight);
  b.ring([0, SPINDLE.mounts.find((k) => k.id === "spindle.collar")!.at[1], 3.585], [1, 0, 0], [0, 1, 0], .17, .1, P.shell, 10);
  // Running lights at the canopy corners.
  for (const side of [-1, 1]) b.glow(b.box([side * .99, 2.0, .45], [.05, .05, .1], side < 0 ? P.amber : P.mint));
  const hull = b.finish(.45);
  hull.unfreezeWorldMatrix(); hull.renderingGroupId = 1;
  glazing(scene, glass, `${id}.glazing`, [[[-.6, 1.18, .86], [.6, 1.18, .86], [.62, 1.72, .7], [-.62, 1.72, .7]]], hull);

  // Outrigger floats with their solar decks, built at the deployed station.
  for (const side of [-1, 1]) {
    const f = batchFor(scene, cel, cache, `${id}.outrigger.${side < 0 ? "port" : "starboard"}`, "spindle", `float-${side}`);
    const x = side * F.deployedX, top = F.y + F.height;
    const rings = [
      { z: -F.halfLength, w: .05, low: .36, high: .54 },
      { z: -1.2, w: F.radius, low: F.y - F.height, high: top },
      { z: 1.2, w: F.radius, low: F.y - F.height, high: top },
      { z: F.halfLength, w: .08, low: .34, high: .58 },
    ];
    loftAt(f, rings, P.ochre, [x, 0, 0]);
    f.box([x, top + .015, 0], [.62, .03, 2.3], P.metal);
    f.box([x, top + .04, 0], [.54, .025, 2.2], P.glass);
    for (let i = -3; i <= 3; i++) f.box([x, top + .055, i * .3], [.5, .006, .012], P.reflection);
    f.box([x, top - .2, 0], [.04, .05, 2.4], P.coral);
    for (const z of S.z) f.box([x - side * .05, S.floatY - .01, z], [.16, .12, .2], P.metal);
    const float = child(f.finish(.35), hull);
    float.metadata = { side };
    for (const [k, z] of S.z.entries()) for (const part of ["upper", "lower"] as const) {
      const s = batchFor(scene, cel, cache, `${id}.strut.${side < 0 ? "port" : "starboard"}.${k}.${part}`, "spindle", `strut-${part}`);
      s.tube([[0, 0, 0], [S.segment, 0, 0]], .045, part === "upper" ? P.steelLight : P.metal, 6);
      s.ellipsoid([0, 0, 0], [.07, .07, .07], P.petrol, 8);
      const strut = child(s.finish(.2), hull);
      strut.metadata = { side, z, part };
    }
  }

  // Bow ramp hinged at its foot. Local +Y runs up the ramp.
  const r = batchFor(scene, cel, cache, `${id}.ramp`, "spindle", "ramp");
  r.box([0, R.length / 2, 0], [R.width, R.length, .06], P.metal);
  r.box([0, R.length / 2, -.035], [R.width - .1, R.length - .08, .01], P.shade);
  for (let i = 0; i < 4; i++) r.box([0, .14 + i * .19, -.045], [R.width - .2, .04, .015], P.steelLight);
  for (const x of [-.62, .62]) r.box([x, R.length / 2, -.04], [.06, R.length, .05], P.ochre);
  const ramp = child(r.finish(.3), hull);
  ramp.position.set(...R.hinge);

  // Dry cargo stack: shown while the hold carries anything.
  const c = batchFor(scene, cel, cache, `${id}.cargo`, "spindle", "cargo");
  for (const [x, z, h, color] of [[-.35, -2.3, .5, P.ochre], [.35, -2.25, .42, P.metal], [-.3, -1.5, .38, P.steelLight], [.32, -1.45, .55, P.ochre], [0, -.7, .34, P.metal]] as const) {
    c.box([x, 1.02 + h / 2, z], [.62, h, .6], color);
    c.box([x, 1.02 + h + .005, z], [.64, .01, .08], P.petrol);
  }
  c.tube([[-.7, 1.62, -2.6], [0, 1.66, -1.6], [.7, 1.62, -.6]], .02, P.ochre, 4);
  child(c.finish(.25), hull);

  // View-only pilot fittings: wheel, throttle and two state bars.
  const cockpit = batchFor(scene, cel, cache, `${id}.cockpit`, "spindle", "cockpit");
  cockpit.tube([[0, 1.1, 1.18], [0, 1.28, 1.36]], .025, P.metal, 5);
  cockpit.tube(Array.from({ length: 13 }, (_, i): Point => {
    const a = i / 12 * Math.PI * 2;
    return [Math.cos(a) * .17, 1.31 + Math.sin(a) * .15, 1.38 - Math.sin(a) * .07];
  }), .018, P.ink, 5);
  cockpit.tube([[.42, 1.15, 1.1], [.42, 1.3, 1.22]], .02, P.metal, 5);
  cockpit.ellipsoid([.42, 1.31, 1.23], [.04, .04, .04], P.ochre, 6);
  const fittings = child(cockpit.finish(), hull);
  for (const [kind, left] of [["charge", -.5], ["health", -.18]] as const) {
    const gauge = batchFor(scene, cel, cache, `${id}.instrument.${kind}`, "spindle", `gauge-${kind}`);
    gauge.glow(gauge.box([.13, 0, 0], [.26, .01, .06], kind === "charge" ? P.amber : P.mint));
    child(gauge.finish(), fittings).position.set(left, 1.195, .95);
  }
  setSpindlePose(hull, id, { fold: 0, ramp: 0 });
  return hull;
}

/** Fold 0 = outriggers deployed, 1 = stowed for a compact berth. Ramp 0 = closed
 * visor, 1 = lowered to a shore. Pure presentation; poses never enter state. */
export function setSpindlePose(hull: Mesh, id: string, pose: { fold: number; ramp: number }): void {
  const fold = Math.max(0, Math.min(1, pose.fold)), xf = lerp(F.deployedX, F.stowedX, fold);
  for (const m of hull.getChildMeshes(true)) {
    const meta = m.metadata as { side?: number; z?: number; part?: string } | null;
    if (m.name.startsWith(`${id}.outrigger.`)) m.position.x = meta!.side! * (xf - F.deployedX);
    else if (m.name.startsWith(`${id}.strut.`)) {
      const side = meta!.side!, hx = side * S.hingeX, fx = side * xf, dy = S.floatY - S.hingeY;
      const half = Math.hypot(fx - hx, dy) / 2, rise = Math.sqrt(Math.max(0, S.segment * S.segment - half * half));
      // Knee lifts perpendicular to the hinge–float line, always upward.
      const ux = (fx - hx) / (2 * half), uy = dy / (2 * half);
      const nx = -uy * side, ny = ux * side;
      const kx = (hx + fx) / 2 + nx * rise, ky = (S.hingeY + S.floatY) / 2 + ny * rise;
      const [ax, ay, bx, by] = meta!.part === "upper" ? [hx, S.hingeY, kx, ky] : [kx, ky, fx, S.floatY];
      m.position.set(ax, ay, meta!.z!);
      m.rotation.set(0, 0, Math.atan2(by - ay, bx - ax));
    } else if (m.name === `${id}.ramp`) m.rotation.x = lerp(R.closed, R.open, Math.max(0, Math.min(1, pose.ramp)));
  }
}

const HULL = [
  { z: -3.62, w: .3, low: .12, high: .42 },
  { z: -3.1, w: .78, low: .02, high: .96 },
  { z: -1.5, w: .88, low: 0, high: .98 },
  { z: 1.5, w: .86, low: 0, high: .98 },
  { z: 3.3, w: .7, low: .18, high: .95 },
  { z: 3.55, w: .56, low: .34, high: .9 },
] as const;
