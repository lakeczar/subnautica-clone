/** S3 hull role data proposals for Hush, Spindle, Mantle and Hearthline.
 *
 * Hull-local metres, Y-up, keel datum at y = 0, bow toward -Z, berth centre at
 * the origin. These are proposals for the coordinator to compose into the
 * registry; nothing here is read by the simulation yet. The art in
 * src/render/fleet/* is built inside these numbers and tests/s3-fleet-art.test.ts
 * proves every visible vertex sits inside the piloting proxy, the berth envelope
 * and the part contact boxes, and that none of them is loose. */
import type { HullId } from "../registry.js";

export type Vec = readonly [number, number, number];
export interface Box { readonly min: Vec; readonly max: Vec }
/** Yaw-independent piloting proxy, as HULL_COLLIDERS: a square of half-side
 * `radius` that must enclose the hull at every heading, from bottom to height. */
export interface PilotingCollider { readonly radius: number; readonly height: number; readonly bottom?: number }
/** Fixed-axis envelope while aligned on a carrier rail, as BERTH_ENVELOPES. */
export interface BerthEnvelope { readonly halfWidth: number; readonly halfLength: number; readonly height: number }
export interface ContactPart extends Box { readonly id: string }
export type MountKind = "equipment" | "major" | "hull_module" | "rescue_collar" | "tow_eye" | "cargo_deck";
export interface Mount {
  readonly id: string;
  readonly kind: MountKind;
  /** Centre of the visible socket face; `normal` points away from the hull. */
  readonly at: Vec;
  readonly normal: Vec;
  /** Largest module footprint the socket accepts, centred on `at`. */
  readonly size: Vec;
  readonly accepts: readonly string[];
}
export type AccessKind = "canopy_hatch" | "dorsal_hatch" | "side_hatch" | "ramp" | "swim_platform" | "launch_well";
export interface AccessPoint {
  readonly id: string;
  readonly kind: AccessKind;
  /** Hull-local point on the opening; `approach` is where a diver waits. */
  readonly at: Vec;
  readonly approach: Vec;
}
export interface HullSpec {
  readonly id: HullId;
  readonly label: string;
  readonly role: string;
  /** Visible extents of the authored hull in its normal (deployed) state. */
  readonly dimensions: { readonly length: number; readonly beam: number; readonly height: number };
  readonly collider: PilotingCollider;
  /** Null for the carrier, which is never berthed. */
  readonly berth: { readonly size: "compact" | "medium"; readonly envelope: BerthEnvelope } | null;
  /** Pose-independent part proxies for encounter contact (hunterQueries).
   * Never read this alone: contactParts(hull, pose) adds the posed parts
   * (Spindle's outriggers, ramp and cargo) and is the only complete set. */
  readonly contact: readonly ContactPart[];
  readonly pressure: { readonly initialDepth: number; readonly maximumDepth: number; readonly surfaceOnly: boolean };
  /** Hold matches B1's HULL_HOLD_CU proposal; crew counts seated occupants. */
  readonly capacity: { readonly holdCu: number; readonly crew: number };
  /** Hull-local pilot eye, a view datum only (cf. DART_SEAT). */
  readonly seat: Vec;
  readonly access: readonly AccessPoint[];
  readonly mounts: readonly Mount[];
}

const box = (id: string, min: Vec, max: Vec): ContactPart => ({ id, min, max });

/** Broad crescent glider; the observation blister is the lowest point. Half
 * width 2.45 (today 2.5): the starboard compact room's inboard wall is 2.45 m
 * from its berth datum, so 2.5 crosses it by 5 cm. */
export const HUSH: HullSpec = {
  id: "hush", label: "Hush", role: "quiet survey glider",
  dimensions: { length: 6.5, beam: 4.86, height: 2.06 },
  collider: { radius: 3.6, height: 2.1 },
  berth: { size: "compact", envelope: { halfWidth: 2.45, halfLength: 3.6, height: 2.1 } },
  contact: [
    box("hush.body", [-.92, .38, -3.48], [.92, 2.0, 3.02]),
    box("hush.blister", [-.78, 0, -2.46], [.78, .56, -.48]),
    box("hush.wing.port", [-2.43, .88, -1.88], [-1.08, 1.4, 2.18]),
    box("hush.wing.starboard", [1.08, .88, -1.88], [2.43, 1.4, 2.18]),
    box("hush.winglet.port", [-2.43, .56, .98], [-2.13, 2.06, 2.24]),
    box("hush.winglet.starboard", [2.13, .56, .98], [2.43, 2.06, 2.24]),
  ],
  pressure: { initialDepth: 220, maximumDepth: 450, surfaceOnly: false },
  capacity: { holdCu: 32, crew: 1 },
  seat: [0, 1.42, -1.25],
  access: [{ id: "hush.access.dorsal", kind: "dorsal_hatch", at: [0, 1.78, .55], approach: [0, 2.9, .55] }],
  mounts: [
    { id: "hush.socket.port", kind: "equipment", at: [-1.35, .93, .15], normal: [0, -1, 0], size: [.5, .3, .7],
      accepts: ["reserve_power", "cargo_pod", "directional_survey", "decoy_emitter"] },
    { id: "hush.socket.starboard", kind: "equipment", at: [1.35, .93, .15], normal: [0, -1, 0], size: [.5, .3, .7],
      accepts: ["reserve_power", "cargo_pod", "directional_survey", "decoy_emitter"] },
    { id: "hush.collar", kind: "rescue_collar", at: [0, 1.0, 3.06], normal: [0, 0, 1], size: [.5, .5, .1], accepts: ["bobbin_collar"] },
  ],
};

/** Surface tender. Its outriggers fold on knee struts, its bow ramp lowers and
 * its cargo stack shows only while loaded, so its contact set is posed: see
 * contactParts. Proposes height 2.1 (was 1.7) so a seated pilot fits under
 * the solar canopy, and berth half width 2.12 (was 2.4): the folded art is 2.06. */
export const SPINDLE_FLOAT = { deployedX: 3.05, stowedX: 1.75, y: .46, halfLength: 1.7, radius: .3, height: .36 } as const;
/** Knee-jointed outrigger struts: hull hinge, float attachment, segment length,
 * tube radius and joint radius. */
export const SPINDLE_STRUT = { hingeX: .84, hingeY: 1.0, floatY: .86, segment: 1.18, z: [-.55, .75], tube: .045, joint: .07 } as const;
/** Bow ramp hinge and length; closed leans back as a splash visor. `depth` is
 * the plate's local Z extent (front face to back rails). */
export const SPINDLE_RAMP = { hinge: [0, .48, -3.14] as Vec, length: .8, width: 1.3, halfWidth: .65, depth: [-.065, .03], closed: .25, open: -1.83 } as const;
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/** Strut geometry for one side (−1 port, +1 starboard) at a fold in [0, 1]:
 * the float station and the knee, which lifts perpendicular to the
 * hinge–float line. Shared by the art and the contact parts. */
export function spindleStrut(fold: number, side: number): { floatX: number; hinge: readonly [number, number]; knee: readonly [number, number]; foot: readonly [number, number] } {
  const S = SPINDLE_STRUT, F = SPINDLE_FLOAT;
  const floatX = F.deployedX + (F.stowedX - F.deployedX) * clamp01(fold);
  const hx = side * S.hingeX, fx = side * floatX, dy = S.floatY - S.hingeY;
  const half = Math.hypot(fx - hx, dy) / 2, rise = Math.sqrt(Math.max(0, S.segment * S.segment - half * half));
  const ux = (fx - hx) / (2 * half), uy = dy / (2 * half);
  return { floatX, hinge: [hx, S.hingeY], foot: [fx, S.floatY],
    knee: [(hx + fx) / 2 - uy * side * rise, (S.hingeY + S.floatY) / 2 + ux * side * rise] };
}
export const spindleRampAngle = (ramp: number): number => SPINDLE_RAMP.closed + (SPINDLE_RAMP.open - SPINDLE_RAMP.closed) * clamp01(ramp);

export const SPINDLE: HullSpec = {
  id: "spindle", label: "Spindle", role: "surface island tender",
  dimensions: { length: 7.28, beam: 6.8, height: 2.08 },
  collider: { radius: 4, height: 2.1 },
  berth: { size: "compact", envelope: { halfWidth: 2.12, halfLength: 3.7, height: 2.1 } },
  contact: [
    box("spindle.hull", [-.92, 0, -3.64], [.92, 1.24, 3.68]),
    box("spindle.canopy", [-1.04, .5, .4], [1.04, 2.08, 3.0]),
  ],
  pressure: { initialDepth: 0, maximumDepth: 0, surfaceOnly: true },
  capacity: { holdCu: 96, crew: 1 },
  seat: [0, 1.55, 2.0],
  access: [
    { id: "spindle.access.ramp", kind: "ramp", at: [0, .48, -3.14], approach: [0, .4, -5.2] },
    { id: "spindle.access.stern", kind: "swim_platform", at: [0, .5, 3.55], approach: [0, -.4, 4.4] },
  ],
  mounts: [
    { id: "spindle.socket.port", kind: "equipment", at: [-.9, .66, 2.55], normal: [-1, 0, 0], size: [.3, .45, .6],
      accepts: ["reserve_power", "directional_survey", "decoy_emitter", "camp_kit"] },
    { id: "spindle.socket.starboard", kind: "equipment", at: [.9, .66, 2.55], normal: [1, 0, 0], size: [.3, .45, .6],
      accepts: ["reserve_power", "directional_survey", "decoy_emitter", "camp_kit"] },
    { id: "spindle.cargo", kind: "cargo_deck", at: [0, 1.0, -1.2], normal: [0, 1, 0], size: [1.5, .9, 3.0], accepts: ["dry_cargo"] },
    { id: "spindle.collar", kind: "rescue_collar", at: [0, .74, 3.6], normal: [0, 0, 1], size: [.4, .4, .1], accepts: ["bobbin_collar"] },
  ],
};

/** Armored bell on a skid ring; the service jaw is the forward extreme. */
export const MANTLE: HullSpec = {
  id: "mantle", label: "Mantle", role: "deep service craft",
  dimensions: { length: 7.7, beam: 5.74, height: 3.96 },
  collider: { radius: 4.5, height: 4 },
  berth: { size: "medium", envelope: { halfWidth: 2.9, halfLength: 4.5, height: 4 } },
  contact: [
    box("mantle.bell", [-2.34, 0, -2.34], [2.34, 3.6, 2.34]),
    box("mantle.lift", [-.5, 3.4, -.25], [.5, 3.96, .25]),
    box("mantle.jaw", [-.78, .32, -4.38], [.78, 1.3, -1.9]),
    box("mantle.fins.port", [-2.87, .92, -.75], [-2.0, 2.62, 1.5]),
    box("mantle.fins.starboard", [2.0, .92, -.75], [2.87, 2.62, 1.5]),
    box("mantle.power", [-.82, .7, 1.9], [.82, 2.12, 3.36]),
  ],
  pressure: { initialDepth: 800, maximumDepth: 800, surfaceOnly: false },
  capacity: { holdCu: 32, crew: 1 },
  seat: [0, 1.72, -1.15],
  access: [{ id: "mantle.access.dorsal", kind: "dorsal_hatch", at: [0, 3.55, .55], approach: [0, 4.6, .55] }],
  mounts: [
    { id: "mantle.socket.port", kind: "equipment", at: [-1.4, .55, 1.55], normal: [-.7, 0, .7], size: [.5, .5, .5],
      accepts: ["reserve_power", "thermal_shroud", "brine_seal", "decoy_emitter"] },
    { id: "mantle.socket.starboard", kind: "equipment", at: [1.4, .55, 1.55], normal: [.7, 0, .7], size: [.5, .5, .5],
      accepts: ["reserve_power", "thermal_shroud", "brine_seal", "decoy_emitter"] },
    { id: "mantle.jaw", kind: "major", at: [0, .8, -3.4], normal: [0, 0, -1], size: [1.5, .9, 1.8], accepts: ["service_jaw", "repair_head"] },
    { id: "mantle.collar", kind: "rescue_collar", at: [0, 1.4, 3.36], normal: [0, 0, 1], size: [.5, .5, .1], accepts: ["bobbin_collar"] },
    { id: "mantle.lift", kind: "tow_eye", at: [0, 3.9, 0], normal: [0, 1, 0], size: [.6, .2, .3], accepts: ["tow_line"] },
  ],
};

/** Carrier-local keel pontoons. Proposed to replace HEARTHLINE_KEEL (x 5.2..9.2),
 * whose inner faces crossed the lock transfer corridor that medium hulls sweep
 * (x up to ±5.9 at the lowered berth). The inner face now stays outboard of it. */
export const HEARTHLINE_KEELS = { inner: 6.12, outer: 9.32, top: 3.2, halfLength: 14.5 } as const;
/** House: the pressure hull around the deck, rooms and interior. */
export const HEARTHLINE_HOUSE = { halfWidth: 6.6, skirt: 3.2, underside: 3.8, roof: 9.16, bow: -12.45, stern: 12.4 } as const;
/** Window band on the house sides and bow, in the dry interval's height. */
export const HEARTHLINE_WINDOWS = { low: 5.0, high: 7.1, bridge: [-11.5, -8.2], galley: [6.2, 8.4] } as const;
export const HEARTHLINE: HullSpec = {
  id: "hearthline", label: "Hearthline", role: "inhabited carrier",
  dimensions: { length: 29, beam: 18.64, height: 9.66 },
  collider: { radius: 17, height: 9.2, bottom: -.5 },
  berth: null,
  contact: [
    box("hearthline.keel.port", [-HEARTHLINE_KEELS.outer, 0, -14.5], [-HEARTHLINE_KEELS.inner + .02, 3.32, 14.5]),
    box("hearthline.keel.starboard", [HEARTHLINE_KEELS.inner - .02, 0, -14.5], [HEARTHLINE_KEELS.outer, 3.32, 14.5]),
    box("hearthline.house", [-6.7, 3.2, -12.8], [6.7, 9.2, 12.5]),
    // Boarding rails and step around the starboard vestibule hatch.
    box("hearthline.vestibule", [6.6, 3.2, 7.95], [6.92, 6.25, 10.05]),
    // Configuration shell from carrierStructure (lock floor, throat plates, gate).
    box("hearthline.lock", [-6.08, -.5, -12.08], [6.08, 3.82, 5.78]),
  ],
  pressure: { initialDepth: 400, maximumDepth: 550, surfaceOnly: false },
  capacity: { holdCu: 256, crew: 1 },
  seat: [0, 5.62, -6],
  access: [
    { id: "hearthline.access.vestibule", kind: "side_hatch", at: [6.6, 5.1, 9], approach: [10, 3, 9] },
    { id: "hearthline.access.launch_well", kind: "launch_well", at: [0, 1.6, -12], approach: [0, -3, -17] },
  ],
  mounts: [
    { id: "hearthline.module.dorsal.fore", kind: "hull_module", at: [0, 9.16, -2.4], normal: [0, 1, 0], size: [2.2, .05, 2.2],
      accepts: ["pressure_ceramic_plating", "thermal_exchanger", "brine_lattice_seal", "power_cell"] },
    { id: "hearthline.module.dorsal.aft", kind: "hull_module", at: [0, 9.16, 3.4], normal: [0, 1, 0], size: [2.2, .05, 2.2],
      accepts: ["pressure_ceramic_plating", "thermal_exchanger", "brine_lattice_seal", "power_cell"] },
    { id: "hearthline.module.keel.port", kind: "hull_module", at: [-7.72, 3.2, 7.5], normal: [0, 1, 0], size: [2.2, .05, 2.6],
      accepts: ["thermal_exchanger", "power_cell", "floodlight_array"] },
    { id: "hearthline.module.keel.starboard", kind: "hull_module", at: [7.72, 3.2, -7.5], normal: [0, 1, 0], size: [2.2, .05, 2.6],
      accepts: ["thermal_exchanger", "power_cell", "floodlight_array"] },
    { id: "hearthline.collar", kind: "rescue_collar", at: [0, 5.2, 12.42], normal: [0, 0, 1], size: [.8, .8, .1], accepts: ["bobbin_collar"] },
  ],
};

export const S3_HULLS = { hush: HUSH, spindle: SPINDLE, mantle: MANTLE, hearthline: HEARTHLINE } as const;
export type S3HullId = keyof typeof S3_HULLS;

/** Presentation state that changes a hull's visible extent. Spindle only;
 * omitted fields mean deployed (fold 0), ramp closed (0) and an empty hold. */
export interface ContactPose { readonly fold?: number; readonly ramp?: number; readonly cargoLoaded?: boolean }

/** The complete contact set for a hull in a pose: the one selector for the
 * viewer, the fit tests and the sim adapter (hunterQueries). Spindle's posed
 * parts are computed from the same kinematics its art uses; the cargo part
 * exists only while the hold is loaded, as the cargo stack does. */
export function contactParts(hull: S3HullId, pose: ContactPose = {}): readonly ContactPart[] {
  const spec = S3_HULLS[hull];
  if (hull !== "spindle") return spec.contact;
  const S = SPINDLE_STRUT, F = SPINDLE_FLOAT, R = SPINDLE_RAMP, pad = .01;
  const parts = [...spec.contact];
  for (const side of [-1, 1]) {
    const { floatX, knee } = spindleStrut(pose.fold ?? 0, side);
    const inner = S.hingeX - S.joint - pad, outer = floatX + F.radius + .01 + pad;
    const top = Math.max(F.y + F.height + .07, knee[1] + S.joint, S.hingeY + S.joint) + pad;
    parts.push(box(`spindle.outrigger.${side < 0 ? "port" : "starboard"}`,
      [side < 0 ? -outer : inner, F.y - F.height - pad, -F.halfLength - pad], [side < 0 ? -inner : outer, top, F.halfLength + pad]));
  }
  // Ramp plate corners rotated about the hinge's X axis.
  const a = spindleRampAngle(pose.ramp ?? 0), ys: number[] = [], zs: number[] = [];
  for (const ly of [0, R.length]) for (const lz of R.depth) {
    ys.push(R.hinge[1] + ly * Math.cos(a) - lz * Math.sin(a));
    zs.push(R.hinge[2] + ly * Math.sin(a) + lz * Math.cos(a));
  }
  parts.push(box("spindle.ramp", [-R.halfWidth - pad, Math.min(...ys) - pad, Math.min(...zs) - pad],
    [R.halfWidth + pad, Math.max(...ys) + pad, Math.max(...zs) + pad]));
  if (pose.cargoLoaded) parts.push(box("spindle.cargo", [-.74, .98, -2.65], [.74, 1.7, -.38]));
  return parts;
}
