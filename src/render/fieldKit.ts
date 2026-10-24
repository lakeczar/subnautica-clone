/** SIG-1: the field kit in the water, drawn from state. One owner for what the
 * systems and signature upgrades put into the world:
 * - **Field outposts** by tier and power (an anchor frame, mast and lamp, the
 *   built-in locker and charger), with every socketed module visible: planter
 *   crops by stage, a decoder lit while it works, the fish trap and its catch.
 * - **Modules at fixed hosts** on a small socket rack beside the host.
 * - **Signature tools out in the world:** the Creel's dropped cargo pod and
 *   grapple line, the Mantle's scout drone and tether, crane and clamp lines,
 *   and the Dart's sonar sweep: a flare at each opening it found, as its front arrives.
 * - **Fitted signature hardware** on each hull (sonar dome, tagger, cutting
 *   arm, grapple winch, deck crane, salvage jaw, drone bay).
 *
 * Built art is keyed by what it shows and rebuilt only when that changes; lines,
 * the drone and the sonar flares are fixed meshes moved each frame (no per-frame
 * allocation beyond a short key per outpost). Hosts build within BUILD_DISTANCE
 * and are released beyond DROP_DISTANCE, like the placed hosts. */
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { HULL_COLLIDERS, SOURCES } from "../content/registry.js";
import type { SourceId } from "../content/registry.js";
import { FIXED_HOSTS, moduleOfItem, OUTPOST_TIERS } from "../content/systems/hosts.js";
import type { FixedHostId, ModuleKind } from "../content/systems/hosts.js";
import { SEEDS } from "../content/systems/cultivation.js";
import { TRAP } from "../content/fauna/items.js";
import { vehicleProfile } from "../sim/fittings.js";
import { sonarContacts } from "../sim/signatures.js";
import type { GameState, Vec3, VehicleState } from "../sim/types.js";
import { ArtBatch, type Point } from "./geometry.js";
import { flareMaterial } from "./hub.js";
import { PALETTE as P } from "./palette.js";

export const BUILD_DISTANCE = 160;
export const DROP_DISTANCE = 240;
/** The sweep's front travels at this speed; each contact flares for FLARE_SECONDS. */
const PULSE_SPEED = 120, FLARE_SECONDS = 12, MAX_FLARES = 8;

// ---------------------------------------------------------------- module art
/** One module's art at a socket datum, facing outward along `out` (x, z). */
function moduleArt(b: ArtBatch, kind: ModuleKind, [x, y, z]: Point, look: ModuleLook): void {
  if (kind === "charger") {
    b.tube([[x, y, z], [x, y + 0.9, z]], 0.12, P.metal, 7);
    b.glow(b.ellipsoid([x, y + 0.95, z], [0.16, 0.08, 0.16], P.mint, 8));
  } else if (kind === "locker") {
    b.box([x, y + 0.35, z], [0.8, 0.7, 0.6], P.ochre);
    b.box([x, y + 0.72, z], [0.84, 0.05, 0.64], P.petrol);
  } else if (kind === "planter") {
    b.box([x, y + 0.18, z], [1, 0.25, 0.7], P.petrol);
    const grown = look.crop ?? 0;
    for (let i = 0; i < 4; i++) {
      const px = x - 0.33 + i * 0.22, h = 0.06 + grown * 0.32;
      if (grown > 0) b.ellipsoid([px, y + 0.32 + h / 2, z], [0.08, h / 2 + 0.02, 0.08], grown >= 1 ? P.lime : P.jade, 6);
    }
    if (grown >= 1) b.glow(b.box([x, y + 0.31, z + 0.36], [0.9, 0.04, 0.02], P.lime));
  } else if (kind === "decoder") {
    b.box([x, y + 0.45, z], [0.7, 0.9, 0.5], P.petrol);
    const screen = b.box([x, y + 0.55, z + 0.26], [0.5, 0.36, 0.02], look.working ? P.mint : P.ink);
    if (look.working) b.glow(screen);
  } else if (kind === "survey") {
    b.tube([[x, y, z], [x, y + 1.1, z]], 0.06, P.metal, 6);
    b.ring([x, y + 1.25, z], [1, 0, 0], [0, 0.5, 0.86], 0.5, 0.36, P.porcelain, 14);
  } else if (kind === "fabricator") {
    b.box([x, y + 0.35, z], [1, 0.7, 0.6], P.steelLight);
    b.tube([[x - 0.3, y + 0.7, z], [x - 0.1, y + 1.05, z + 0.15], [x + 0.15, y + 0.85, z + 0.2]], 0.04, P.ochre, 5);
  } else if (kind === "relay") {
    b.tube([[x, y, z], [x, y + 2.2, z]], 0.05, P.metal, 5);
    b.glow(b.ellipsoid([x, y + 2.3, z], [0.07, 0.07, 0.07], P.coral, 6));
  } else {
    // Fish trap: a ringed cage of slats, its catch visible inside.
    for (const ry of [0.05, 0.5, 0.95]) b.ring([x, y + ry, z], [1, 0, 0], [0, 0, 1], 0.45, 0.4, P.steelLight, 12);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      b.tube([[x + Math.cos(a) * 0.43, y + 0.05, z + Math.sin(a) * 0.43], [x + Math.cos(a) * 0.43, y + 0.95, z + Math.sin(a) * 0.43]], 0.015, P.shade, 3);
    }
    for (let i = 0; i < (look.fish ?? 0); i++) {
      const a = i * 2.1, px = x + Math.cos(a) * 0.2, pz = z + Math.sin(a) * 0.2;
      b.ellipsoid([px, y + 0.35 + (i % 2) * 0.25, pz], [0.13, 0.05, 0.04], P.reflection, 6);
    }
  }
}
interface ModuleLook { crop?: number; working?: boolean; fish?: number }
/** What a socketed module shows now, as a compact key part and its look. */
function moduleLook(s: GameState, itemId: string, kind: ModuleKind): ModuleLook {
  if (kind === "planter") {
    const crop = s.systems.planters.find((p) => p.moduleId === itemId);
    // Four stages so a crop's art rebuilds a few times while it grows, not every frame.
    return { crop: crop ? Math.min(1, Math.floor((crop.progress / SEEDS[crop.seed].growSeconds) * 4) / 4) : 0 };
  }
  if (kind === "decoder") return { working: s.systems.decodes.some((j) => j.moduleId === itemId) };
  if (kind === "trap") return { fish: Math.min(TRAP.cap, s.systems.traps.find((t) => t.moduleId === itemId)?.held ?? 0) };
  return {};
}
const lookKey = (l: ModuleLook): string => `${l.crop ?? ""}${l.working ? "w" : ""}${l.fish ?? ""}`;

/** An outpost: anchor legs and frame, mast and lamp, power gear, locker, charger and sockets. */
function outpostArt(b: ArtBatch, s: GameState, o: GameState["systems"]["outposts"][number]): void {
  const { x, y, z } = o.position, tier = OUTPOST_TIERS[o.tier];
  const deck = y + 0.55, r = 1.2 + tier.sockets * 0.18;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    b.tube([[x + Math.cos(a) * r * 1.3, y - 0.2, z + Math.sin(a) * r * 1.3], [x + Math.cos(a) * r * 0.5, deck, z + Math.sin(a) * r * 0.5]], 0.07, P.metal, 5);
  }
  b.ring([x, deck, z], [1, 0, 0], [0, 0, 1], r, r - 0.18, P.ochre, 18);
  b.box([x, deck - 0.04, z], [r * 1.2, 0.08, r * 1.2], P.petrol);
  b.tube([[x, deck, z], [x, deck + 2.6, z]], 0.07, P.steelLight, 6);
  b.glow(b.ellipsoid([x, deck + 2.7, z], [0.14, 0.14, 0.14], P.warm, 8));
  if (o.power === "solar") for (const dx of [-0.55, 0.55]) b.box([x + dx, deck + 2.2, z], [0.9, 0.04, 0.6], P.glass, [0.3, 0, 0]);
  else if (o.power === "thermal") b.tube([[x, deck, z], [x + 0.6, y - 0.1, z + 0.3], [x + 1.4, y - 0.3, z + 0.9]], 0.09, P.orange, 6);
  else if (o.power === "cells") for (const dx of [-0.2, 0, 0.2]) b.tube([[x + dx, deck, z - 0.5], [x + dx, deck + 0.45, z - 0.5]], 0.07, P.amber, 6);
  // The built-in locker and charger every tier carries.
  moduleArt(b, "locker", [x - 0.45, deck, z + 0.35], {});
  moduleArt(b, "charger", [x + 0.5, deck, z + 0.35], {});
  const sockets = s.systems.sockets.filter((e) => e.hostId === o.id);
  for (let i = 0; i < tier.sockets; i++) {
    const a = (i / tier.sockets) * Math.PI * 2 - Math.PI / 2, p: Point = [x + Math.cos(a) * (r - 0.55), deck, z + Math.sin(a) * (r - 0.55)];
    const e = sockets.find((k) => k.socket === `s${i}`), kind = e ? moduleOfItem(e.kind) : null;
    if (kind) moduleArt(b, kind, p, moduleLook(s, e!.itemId, kind));
    else b.ellipsoid([p[0], deck + 0.06, p[2]], [0.16, 0.06, 0.16], P.seam, 8);
  }
}
function outpostKey(s: GameState, o: GameState["systems"]["outposts"][number]): string {
  let key = `${o.tier}|${o.power}|${o.position.x},${o.position.y},${o.position.z}`;
  for (const e of s.systems.sockets) if (e.hostId === o.id) {
    const kind = moduleOfItem(e.kind);
    if (kind) key += `|${e.socket}:${kind}:${lookKey(moduleLook(s, e.itemId, kind))}`;
  }
  return key;
}
/** A fixed host's socket rack: a short rail beside the host's work datum. */
const RACK_OFFSET: Readonly<Record<FixedHostId, Point>> = {
  home_pod: [2.4, 0, -1.2], island_workshop: [-2.6, 0, 1.4], canopy_stop: [2.2, 0, 0], rift_station: [2.2, 0, 0],
  divide_dock: [2.2, 0, 0], crown_station: [2.2, 0, 0],
};
function rackArt(b: ArtBatch, s: GameState, id: FixedHostId): boolean {
  const entries = s.systems.sockets.filter((e) => e.hostId === id);
  if (!entries.length) return false;
  const h = FIXED_HOSTS[id].position, [ox, oy, oz] = RACK_OFFSET[id];
  const x = h.x + ox, y = h.y + oy, z = h.z + oz;
  b.box([x, y + 0.05, z], [0.3, 0.1, FIXED_HOSTS[id].sockets * 1.1], P.metal);
  for (const e of entries) {
    const n = Number(e.socket.slice(1)) || 0, kind = moduleOfItem(e.kind);
    if (kind) moduleArt(b, kind, [x, y + 0.1, z - (FIXED_HOSTS[id].sockets - 1) * 0.55 + n * 1.1], moduleLook(s, e.itemId, kind));
  }
  return true;
}
function rackKey(s: GameState, id: FixedHostId): string {
  let key = id;
  for (const e of s.systems.sockets) if (e.hostId === id) {
    const kind = moduleOfItem(e.kind);
    if (kind) key += `|${e.socket}:${kind}:${lookKey(moduleLook(s, e.itemId, kind))}`;
  }
  return key;
}

// ---------------------------------------------------------------- hull hardware
type Hardware = "sonar" | "tagger" | "cutting_arm" | "grapple" | "drop_pod" | "deck_crane" | "salvage_clamp" | "scout_drone";
function hardwareOf(s: GameState, v: VehicleState): Hardware[] {
  const p = vehicleProfile(s, v), out: Hardware[] = [];
  if (p.contracts.includes("wide_sonar")) out.push("sonar");
  if (p.contracts.includes("range_tagger")) out.push("tagger");
  if (p.contracts.includes("scout_drone")) out.push("scout_drone");
  for (const t of ["cutting_arm", "grapple", "drop_pod", "deck_crane", "salvage_clamp"] as const) if (p.tools.includes(t)) out.push(t);
  return out;
}
/** Hull-local hardware (−Z is the bow), drawn on a mesh that follows the hull. */
function hardwareArt(b: ArtBatch, v: VehicleState, kinds: readonly Hardware[]): void {
  const r = HULL_COLLIDERS[v.hull].radius, bow = -r * 0.85;
  for (const k of kinds) {
    if (k === "sonar") b.glow(b.ellipsoid([0, -0.25, bow + 0.4], [0.32, 0.18, 0.36], P.reflection, 10));
    else if (k === "tagger") { b.tube([[0.5, 0.55, bow + 0.8], [0.5, 0.55, bow + 0.1]], 0.06, P.metal, 6); b.glow(b.ellipsoid([0.5, 0.55, bow + 0.05], [0.05, 0.05, 0.05], P.coral, 6)); }
    else if (k === "cutting_arm") {
      b.tube([[-0.7, 0.4, bow + 0.6], [-0.9, 0.2, bow - 0.6], [-0.6, 0.1, bow - 1.2]], 0.09, P.ochre, 6);
      b.ring([-0.6, 0.1, bow - 1.3], [1, 0, 0], [0, 1, 0], 0.32, 0.2, P.porcelain, 12);
    } else if (k === "grapple") { b.box([0.8, 0.6, bow + 0.7], [0.5, 0.4, 0.5], P.petrol); b.tube([[0.8, 0.6, bow + 0.45], [0.8, 0.6, bow]], 0.05, P.ochre, 5); }
    else if (k === "drop_pod") b.ellipsoid([0, 0.9, r * 0.45], [0.55, 0.4, 0.75], P.orange, 10);
    else if (k === "deck_crane") {
      b.tube([[0.9, 0.4, 0.4], [0.9, 2.6, 0.4]], 0.1, P.ochre, 6);
      b.tube([[0.9, 2.6, 0.4], [0.9, 2.9, -2.4]], 0.08, P.ochre, 6);
      b.tube([[0.9, 2.9, -2.4], [0.9, 1.6, -2.4]], 0.02, P.ink, 3);
    } else if (k === "salvage_clamp") for (const side of [-1, 1]) b.tube([[side * 0.9, -0.4, bow + 0.8], [side * 1.1, -0.9, bow - 0.4], [side * 0.5, -1.1, bow - 0.9]], 0.12, P.steelLight, 6);
    else b.box([0, -0.85, 0.6], [1.2, 0.3, 1.2], P.seam);
  }
}

export interface FieldKitLayer {
  update(state: GameState | null, camera: Vec3): void;
  /** What is built now, for diagnostics and tests. */
  readonly built: readonly string[];
  dispose(): void;
}
interface Built { mesh: Mesh; key: string }
export function createFieldKit(scene: Scene, cel: ShaderMaterial): FieldKitLayer {
  const built = new Map<string, Built>();
  const make = (name: string, draw: (b: ArtBatch) => void, contour = 0.12): Mesh => {
    const b = new ArtBatch(name, scene, cel);
    draw(b);
    const m = b.finish(contour);
    m.renderingGroupId = 1;
    return m;
  };
  /** Keep `id` built to `key`, or drop it. */
  const keep = (id: string, key: string | null, draw: (b: ArtBatch) => void, dynamic = false): Mesh | null => {
    const was = built.get(id);
    if (was && was.key === key) return was.mesh;
    was?.mesh.dispose();
    built.delete(id);
    if (key === null) return null;
    const mesh = make(id, draw);
    if (dynamic) mesh.unfreezeWorldMatrix();
    built.set(id, { mesh, key });
    return mesh;
  };
  // A unit line along +Z, scaled to length and pointed at its far end each frame.
  const unitLine = (name: string, color: string, radius: number): Mesh => {
    const m = make(name, (b) => b.tube([[0, 0, 0], [0, 0, 1]], radius, color, 5), 0);
    m.unfreezeWorldMatrix();
    m.setEnabled(false);
    return m;
  };
  const lines = new Map<string, Mesh>();
  const line = (id: string, from: Vec3, to: Vec3, color: string, radius = 0.04): void => {
    let m = lines.get(id);
    if (!m) lines.set(id, m = unitLine(`fieldkit.line.${id}`, color, radius));
    const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    m.position.set(from.x, from.y, from.z);
    m.scaling.set(1, 1, Math.max(0.01, length));
    m.rotation.set(-Math.atan2(to.y - from.y, Math.hypot(to.x - from.x, to.z - from.z)), Math.atan2(to.x - from.x, to.z - from.z), 0);
    m.setEnabled(true);
  };
  const usedLines = new Set<string>();
  const pod = make("fieldkit.pod", (b) => {
    b.ellipsoid([0, 0.5, 0], [0.7, 0.55, 0.9], P.orange, 12);
    b.box([0, 0.5, 0], [1.42, 0.12, 0.3], P.petrol);
    b.glow(b.ellipsoid([0, 1.08, 0], [0.08, 0.08, 0.08], P.warm, 6));
  });
  pod.unfreezeWorldMatrix(); pod.setEnabled(false);
  const anchor = make("fieldkit.grapple.anchor", (b) => {
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; b.tube([[0, 0, 0], [Math.cos(a) * 0.35, Math.sin(a) * 0.35, -0.3]], 0.05, P.ochre, 4); }
  });
  anchor.unfreezeWorldMatrix(); anchor.setEnabled(false);
  const drone = make("fieldkit.drone", (b) => {
    b.ellipsoid([0, 0, 0], [0.3, 0.2, 0.42], P.porcelain, 12);
    b.box([0, 0.02, 0.1], [0.75, 0.05, 0.16], P.petrol);
    b.glow(b.ellipsoid([0, 0, -0.4], [0.09, 0.07, 0.04], P.warm, 8));
  });
  drone.unfreezeWorldMatrix(); drone.setEnabled(false);
  // The sweep reads through murk on the hub beacon's additive flare: each opening it
  // found lights as the sweep's front (PULSE_SPEED) reaches it, sized to stay legible at range.
  const sonarTint = Color3.FromHexString("#7fe7ff");
  const flares: { mesh: Mesh; material: ShaderMaterial; on: boolean }[] = [];
  for (let i = 0; i < MAX_FLARES; i++) {
    const material = flareMaterial(scene, `fieldkit.sonar.flare.${i}`);
    material.setColor3("tint", sonarTint);
    const mesh = CreatePlane(`fieldkit.sonar.flare.${i}`, { size: 1 }, scene);
    mesh.billboardMode = Mesh.BILLBOARDMODE_ALL; mesh.material = material; mesh.isPickable = false; mesh.renderingGroupId = 1;
    mesh.setEnabled(false);
    flares.push({ mesh, material, on: false });
  }
  let sweepAt = -1;
  let disposed = false;
  return {
    get built() { return [...built.keys()]; },
    update(s, camera) {
      if (disposed) return;
      const near = (p: Vec3, d: number): boolean => Math.hypot(p.x - camera.x, p.y - camera.y, p.z - camera.z) <= d;
      const playing = !!s && s.opening.phase >= 4;
      // Outposts and fixed-host racks.
      const want = new Set<string>();
      if (playing) {
        for (const o of s!.systems.outposts) {
          const id = `outpost.${o.id}`, shown = near(o.position, built.has(id) ? DROP_DISTANCE : BUILD_DISTANCE);
          if (!shown) continue;
          want.add(id);
          keep(id, outpostKey(s!, o), (b) => outpostArt(b, s!, o));
        }
        for (const host of Object.keys(FIXED_HOSTS) as FixedHostId[]) {
          const id = `rack.${host}`;
          if (!near(FIXED_HOSTS[host].position, built.has(id) ? DROP_DISTANCE : BUILD_DISTANCE) ||
            !s!.systems.sockets.some((e) => e.hostId === host)) continue;
          want.add(id);
          keep(id, rackKey(s!, host), (b) => { rackArt(b, s!, host); });
        }
        // Fitted hardware, following each visible hull.
        for (const v of s!.fleet.vehicles) {
          if (v.berth || !near(v.pose.position, DROP_DISTANCE)) continue;
          const kinds = hardwareOf(s!, v);
          if (!kinds.length) continue;
          const id = `hardware.${v.id}`;
          want.add(id);
          const m = keep(id, `${v.hull}|${kinds.join(",")}`, (b) => hardwareArt(b, v, kinds), true)!;
          m.position.set(v.pose.position.x, v.pose.position.y, v.pose.position.z);
          m.rotation.set(v.hull === "dart" ? v.pose.pitch : 0, -v.pose.yaw, 0);
        }
      }
      for (const id of [...built.keys()]) if (!want.has(id)) keep(id, null, () => {});
      // Tools out in the world.
      usedLines.clear();
      let podShown = false, anchorShown = false, droneShown = false;
      if (playing) for (const v of s!.fleet.vehicles) {
        const rt = v.upgrades, at = v.pose.position;
        if (rt.pod && near(rt.pod.position, DROP_DISTANCE)) {
          pod.position.set(rt.pod.position.x, rt.pod.position.y, rt.pod.position.z);
          podShown = true;
        }
        if (rt.grapple) {
          const to = rt.grapple.load ? SOURCES[rt.grapple.load as SourceId].position : rt.grapple.anchor;
          // A hooked frame comes in along the line as it shortens.
          const d = Math.hypot(to.x - at.x, to.y - at.y, to.z - at.z) || 1, k = rt.grapple.load ? Math.min(1, rt.grapple.length / d) : 1;
          const end = { x: at.x + (to.x - at.x) * k, y: at.y + (to.y - at.y) * k, z: at.z + (to.z - at.z) * k };
          line(`grapple.${v.id}`, at, end, P.ochre, 0.035); usedLines.add(`grapple.${v.id}`);
          anchor.position.set(end.x, end.y, end.z); anchorShown = true;
        }
        if (rt.drone) {
          const d = rt.drone.position;
          drone.position.set(d.x, d.y, d.z);
          drone.rotation.set(rt.drone.pitch, -rt.drone.yaw, 0);
          // Seen from outside only: while the pilot flies it, the view is the drone's own camera.
          droneShown = s!.player.controlledVehicleId !== v.id;
          line(`tether.${v.id}`, at, d, P.coral, 0.015); usedLines.add(`tether.${v.id}`);
        }
        if (rt.lift) {
          const src = SOURCES[rt.lift.sourceId as SourceId].position;
          line(`lift.${v.id}`, { x: at.x, y: at.y + (rt.lift.tool === "crane" ? 2.9 : -0.5), z: at.z }, src, P.ink, 0.025); usedLines.add(`lift.${v.id}`);
        }
        if (rt.tow) {
          const towed = s!.fleet.vehicles.find((o) => o.id === rt.tow);
          if (towed) { line(`tow.${v.id}`, at, towed.pose.position, P.steelLight, 0.06); usedLines.add(`tow.${v.id}`); }
        }
        if (rt.sonar && v.hull === "dart") {
          const age = (s!.tick - rt.sonar.at) / 60;
          if (rt.sonar.at !== sweepAt) {
            sweepAt = rt.sonar.at;
            const contacts = sonarContacts(vehicleProfile(s!, v), rt.sonar.origin);
            flares.forEach((f, i) => { const c = contacts[i]; f.on = !!c; if (c) f.mesh.position.set(c.position.x, c.position.y, c.position.z); });
          }
          const o = rt.sonar.origin, radius = age * PULSE_SPEED;
          for (const f of flares) {
            const p = f.mesh.position, reached = Math.hypot(p.x - o.x, p.y - o.y, p.z - o.z) <= radius;
            const shown = f.on && reached && age < FLARE_SECONDS;
            f.mesh.setEnabled(shown);
            if (!shown) continue;
            f.mesh.scaling.setAll(Math.max(3, Math.hypot(p.x - camera.x, p.y - camera.y, p.z - camera.z) * 0.06));
            f.material.setFloat("glow", Math.min(1, (FLARE_SECONDS - age) / 4));
          }
        }
      }
      if (!playing || !s!.fleet.vehicles.some((v) => v.upgrades.sonar)) for (const f of flares) f.mesh.setEnabled(false);
      pod.setEnabled(podShown); anchor.setEnabled(anchorShown); drone.setEnabled(droneShown);
      for (const [id, m] of lines) if (!usedLines.has(id)) m.setEnabled(false);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const b of built.values()) b.mesh.dispose();
      built.clear();
      for (const m of lines.values()) m.dispose();
      lines.clear();
      for (const m of [pod, anchor, drone]) m.dispose();
      for (const f of flares) { f.mesh.dispose(); f.material.dispose(); }
    },
  };
}
