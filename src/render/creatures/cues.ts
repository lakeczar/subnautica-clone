import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { Vec3 } from "../../sim/types.js";
import { seeded } from "../geometry.js";
import { PALETTE as P } from "../palette.js";
import { creatureParts, Display, revolve } from "./kit.js";

/** Brine sail: a slender benign drifter with a tall ribbed sail. Its only job
 * is to be where the calm lane is; it sways and never reacts to the player. */
export function createBrineSails(scene: Scene, cel: Material, name: string, count: number, parent?: TransformNode) {
  const parts = creatureParts(scene, cel, name, parent);
  const sails: Mesh[] = [];
  for (let n = 0; n < count; n++) sails.push(parts.part(`sail.${n}`, b => {
    b.ellipsoid([0, 0, 0], [0.28, 0.3, 1.5], "#3d7d84", 8);
    b.ellipsoid([0, -0.1, -1.25], [0.18, 0.16, 0.3], P.steelLight, 7);
    const ribs = [-0.9, -0.4, 0.1, 0.6, 1.1];
    for (let i = 0; i < ribs.length - 1; i++) {
      const z0 = ribs[i]!, z1 = ribs[i + 1]!, h0 = 2.6 - Math.abs(z0) * 0.8, h1 = 2.6 - Math.abs(z1) * 0.8;
      b.face([[0, 0.25, z0], [0, h0, z0 + 0.25], [0, h1, z1 + 0.25], [0, 0.25, z1]], i % 2 ? P.violet : "#b4a8d4");
    }
    for (const z of ribs) b.tube([[0, 0.25, z], [0, 2.6 - Math.abs(z) * 0.8, z + 0.25]], 0.025, P.shell, 4);
    for (let f = 0; f < 4; f++) b.tube([[0, -0.2, 0.4 + f * 0.2], [0.1 * (f - 1.5), -1.2, 0.9 + f * 0.2], [0.2 * (f - 1.5), -2.3, 1.2 + f * 0.25]], 0.018, P.mint, 4);
    b.glow(b.ellipsoid([0, 2.25, 0.25], [0.06, 0.06, 0.06], P.mint, 5));
  }));
  let last: Vec3[] = [];
  return {
    root: parts.root, meshes: sails,
    update(positions: readonly Vec3[], seconds: number) {
      sails.forEach((mesh, i) => {
        const p = positions[i];
        mesh.setEnabled(!!p);
        if (!p) return;
        const prev = last[i] ?? p, dx = p.x - prev.x, dz = p.z - prev.z;
        mesh.position.set(p.x, p.y, p.z);
        if (Math.hypot(dx, dz) > 1e-4) mesh.rotation.y = -Math.atan2(dx, -dz);
        mesh.rotation.z = Math.sin(seconds * 0.7 + i) * 0.1;
      });
      last = positions.map(p => ({ ...p }));
    },
    dispose: () => parts.dispose(),
  };
}

/** Ember mites on the chimney lip. `scatter` 0..1 from the simulation moves
 * every mite up and outward along its own line; the bare lip is the cue. */
export function createEmberMites(scene: Scene, cel: Material, name: string, lip: Vec3, count = 14, parent?: TransformNode) {
  const parts = creatureParts(scene, cel, name, parent), random = seeded(523);
  const mites: { mesh: Mesh; home: Vec3; out: Vec3; phase: number; glow: Display }[] = [];
  for (let n = 0; n < count; n++) {
    const a = random() * Math.PI * 2, r = 0.6 + random() * 2.2;
    const mesh = parts.part(`mite.${n}`, b => {
      b.ellipsoid([0, 0, 0], [0.13, 0.08, 0.18], P.orange, 6);
      b.ellipsoid([0, 0.04, -0.06], [0.08, 0.05, 0.08], P.ochre, 5);
      for (const side of [-1, 1]) for (let leg = 0; leg < 3; leg++)
        b.tube([[side * 0.08, 0, -0.08 + leg * 0.08], [side * 0.2, -0.06, -0.1 + leg * 0.09]], 0.012, P.ink, 3);
      b.glow(b.ellipsoid([0, 0.07, 0.08], [0.04, 0.03, 0.04], P.amber, 4));
    });
    const home = { x: lip.x + Math.cos(a) * r, y: lip.y + random() * 0.2, z: lip.z + Math.sin(a) * r };
    const out = { x: Math.cos(a) * (4 + random() * 4), y: 3 + random() * 5, z: Math.sin(a) * (4 + random() * 4) };
    mites.push({ mesh, home, out, phase: random() * 6, glow: new Display(mesh) });
  }
  return {
    root: parts.root, meshes: mites.map(m => m.mesh),
    update(scatter: number, seconds: number) {
      const s = scatter * scatter * (3 - 2 * scatter);
      for (const m of mites) {
        const jitter = Math.sin(seconds * 3 + m.phase) * 0.06 * (1 - s);
        m.mesh.position.set(m.home.x + m.out.x * s + jitter, m.home.y + m.out.y * s, m.home.z + m.out.z * s);
        m.mesh.rotation.y = seconds * (0.3 + s * 2) + m.phase;
        m.glow.set(s > 0.1 ? 1.4 : 0.6, true);
      }
    },
    dispose: () => parts.dispose(),
  };
}

/** Deployed deterrents: a rising glow lure and a dark ink cloud. A fixed pool
 * per kind; unused slots are hidden, never rebuilt per deploy. */
export function createDeterrents(scene: Scene, cel: Material, name: string, slots: number, parent?: TransformNode) {
  const parts = creatureParts(scene, cel, name, parent), random = seeded(77);
  const lures: { mesh: Mesh; glow: Display }[] = [], inks: Mesh[] = [];
  for (let i = 0; i < slots; i++) {
    const mesh = parts.part(`lure.${i}`, b => {
      b.glow(b.ellipsoid([0, 0, 0], [0.22, 0.26, 0.22], P.lime, 8));
      revolve(b, [0, 0.18, 0], [[0.16, 0], [0.2, 0.08], [0.06, 0.18]], P.amber, P.orange, 8);
    });
    lures.push({ mesh, glow: new Display(mesh) });
    inks.push(parts.part(`ink.${i}`, b => {
      for (let k = 0; k < 9; k++) b.ellipsoid([(random() - 0.5) * 6, (random() - 0.5) * 4, (random() - 0.5) * 6], [1.6 + random(), 1.2 + random(), 1.6 + random()], k % 2 ? P.ink : "#22283a", 7);
    }, undefined, 0));
  }
  return {
    root: parts.root, meshes: [...lures.map(l => l.mesh), ...inks],
    update(deployed: readonly { kind: string; position: Vec3; seconds: number }[], seconds: number) {
      let l = 0, k = 0;
      for (const d of deployed) {
        if (d.kind === "lure" && l < lures.length) {
          const lure = lures[l++]!;
          lure.mesh.setEnabled(true);
          lure.mesh.position.set(d.position.x, d.position.y, d.position.z);
          lure.glow.set(1.1 + 0.4 * Math.sin(seconds * 5), true);
        } else if (d.kind === "ink" && k < inks.length) {
          const ink = inks[k++]!, fade = Math.min(1, d.seconds / 3);
          ink.setEnabled(true);
          ink.position.set(d.position.x, d.position.y, d.position.z);
          ink.scaling.setAll(0.5 + 0.5 * fade);
          ink.rotation.y = seconds * 0.1;
        }
      }
      for (; l < lures.length; l++) lures[l]!.mesh.setEnabled(false);
      for (; k < inks.length; k++) inks[k]!.setEnabled(false);
    },
    dispose: () => parts.dispose(),
  };
}
