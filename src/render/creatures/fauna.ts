/** CR-1: creatures as resources, drawn from state only. Small schools at the
 * fish grounds (as many as the ground holds), roe clusters, residents' shed,
 * the protected egg cases, the carcass falls with their scavengers, the sound
 * hunter's feeding shoal and the laying skates on the Divide's lee shelf.
 * Stock decides what shows, so an emptied ground reads empty without text. */
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import { CARCASS_FALLS, FAUNA_SOURCES, GROUNDS } from "../../content/fauna/grounds.js";
import type { FaunaSourceId } from "../../content/fauna/grounds.js";
import { HUNTER_FEEDING_SPOT } from "../../content/fauna/windows.js";
import { layerY } from "../../sim/ecology/agents.js";
import { layingSkates, windowSample } from "../../sim/fauna/windows.js";
import type { GameState, Vec3 } from "../../sim/types.js";
import type { ArtBatch } from "../geometry.js";
import { seeded } from "../geometry.js";
import { PALETTE as P } from "../palette.js";
import { creatureParts, Display, smooth } from "./kit.js";
import { createLayerSkate } from "./skate.js";

/** One posed group: built once, enabled near the camera, posed from state. */
interface CreaturePart { readonly at: Vec3; readonly node: TransformNode; pose(s: GameState, seconds: number): void }
/** Most fish drawn at one ground; a full school of four shows eight. */
const SCHOOL_FISH = 8;
const ROE_CLUSTERS = 2;

function fish(b: ArtBatch, glow: boolean): void {
  b.ellipsoid([0, 0, 0], [0.07, 0.09, 0.26], glow ? P.amber : P.reflection, 6);
  b.face([[0, 0, 0.22], [0, 0.11, 0.38], [0, -0.11, 0.38]], glow ? P.orange : P.steelLight);
  if (glow) b.glow(b.ellipsoid([0, 0.02, -0.08], [0.04, 0.04, 0.05], P.warm, 5));
}
function pile(b: ArtBatch, asset: string, seed: number): void {
  const r = seeded(seed);
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2 + r() * 0.5, d = 0.2 + r() * 0.6, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (asset === "shed") b.ellipsoid([x, 0.04, z], [0.28, 0.03, 0.18], i % 2 ? P.shell : P.mint, 6);
    else if (asset === "shells") b.ellipsoid([x, 0.06, z], [0.14, 0.07, 0.12], i % 2 ? P.shell : P.coralRim, 6);
    else if (asset === "nest") b.ellipsoid([x * 0.6, 0.18 + i * 0.04, z * 0.6], [0.22, 0.16, 0.2], i % 2 ? P.amber : P.orange, 7);
    else if (asset === "grit") b.ellipsoid([x, 0.03, z], [0.09, 0.05, 0.08], i % 2 ? P.ink : P.ochre, 5);
    else if (asset === "casts") b.tube([[x, 0.05, z], [x + 0.12, 0.1, z + 0.08], [x + 0.02, 0.15, z + 0.16]], 0.05, i % 2 ? P.stoneLight : P.sand, 5);
    else if (asset === "hide") b.ellipsoid([x, 0.05, z], [0.4, 0.04, 0.26], i % 2 ? P.plum : "#5b4a5e", 6);
    else if (asset === "bone") b.tube([[x - 0.2, 0.05, z], [x + 0.2, 0.08, z + 0.05]], 0.05, i % 2 ? P.porcelain : P.shell, 5);
  }
}

/** One owned group for every creature resource; built once, posed per frame. */
export function createFauna(scene: Scene, cel: Material, parent?: TransformNode) {
  const parts = creatureParts(scene, cel, "fauna", parent), groups: CreaturePart[] = [], meshes: Mesh[] = [];
  const keep = (m: Mesh): Mesh => { meshes.push(m); return m; };
  for (const id of Object.keys(FAUNA_SOURCES) as FaunaSourceId[]) {
    const g = FAUNA_SOURCES[id], kind = GROUNDS[id].kind, node = parts.node(`ground.${id}`), r = seeded(id.length * 131 + Math.round(g.position.x));
    node.position.set(g.position.x, g.position.y, g.position.z);
    if (kind === "fish") {
      const school = Array.from({ length: SCHOOL_FISH }, (_, i) => ({ mesh: keep(parts.part(`${id}.fish.${i}`, (b) => fish(b, false), node)), phase: r() * 6.3, radius: 0.8 + r() * 1.6, lift: (r() - 0.5) * 1.2 }));
      groups.push({ at: g.position, node, pose(s, t) {
        const shown = Math.min(SCHOOL_FISH, (s.world.resources.find((x) => x.id === id)?.stock ?? 0) * 2);
        school.forEach((f, i) => {
          f.mesh.setEnabled(i < shown);
          const a = t * 0.6 + f.phase;
          f.mesh.position.set(Math.cos(a) * f.radius, f.lift + Math.sin(t * 1.3 + f.phase) * 0.15, Math.sin(a) * f.radius);
          f.mesh.rotation.y = -a;
        });
      } });
    } else if (kind === "roe") {
      const glow = id === "canopy_roe_crowns";
      const clusters = Array.from({ length: ROE_CLUSTERS }, (_, c) => keep(parts.part(`${id}.roe.${c}`, (b) => {
        for (let i = 0; i < 9; i++) {
          const e = b.ellipsoid([(r() - 0.5) * 0.4 + c * 0.7, 0.08 + r() * 0.25, (r() - 0.5) * 0.4], [0.07, 0.07, 0.07], glow ? P.lime : P.amber, 5);
          if (glow) b.glow(e);
        }
      }, node)));
      const pulse = clusters.map((m) => glow ? new Display(m, () => true) : null);
      groups.push({ at: g.position, node, pose(s, t) {
        const n = s.world.resources.find((x) => x.id === id)?.stock ?? 0;
        clusters.forEach((m, i) => { m.setEnabled(i < n); pulse[i]?.set(0.8 + 0.3 * Math.sin(t * 1.4 + i), true); });
      } });
    } else if (kind === "shed" || kind === "fall") {
      const stock = keep(parts.part(`${id}.stock`, (b) => pile(b, g.asset, id.length * 17), node));
      groups.push({ at: g.position, node, pose(s) { stock.setEnabled((s.world.resources.find((x) => x.id === id)?.stock ?? 0) > 0); } });
    } else {
      // Protected egg cases: always there, shadows moving inside.
      const cases = keep(parts.part(`${id}.cases`, (b) => {
        for (let i = 0; i < 5; i++) {
          const a = i * 1.26, x = Math.cos(a) * 0.9, z = Math.sin(a) * 0.7;
          b.box([x, 0.18, z], [0.55, 0.22, 0.9], "#3a3328", [0, a, 0.15]);
          b.tube([[x, 0.1, z - 0.45], [x + 0.1, 0.05, z - 0.75]], 0.02, "#2a241c", 3);
          b.glow(b.ellipsoid([x, 0.3, z], [0.12, 0.04, 0.2], P.mint, 5));
        }
      }, node));
      const inner = new Display(cases);
      groups.push({ at: g.position, node, pose(_s, t) { inner.set(0.35 + 0.3 * Math.max(0, Math.sin(t * 0.9)), true); } });
    }
  }
  // Carcass falls: a long spine with arching ribs, a skull, and scavengers working it.
  for (const [id, f] of Object.entries(CARCASS_FALLS)) {
    const node = parts.node(`fall.${id}`), r = seeded(id.length * 53);
    node.position.set(f.position.x, f.position.y, f.position.z);
    node.rotation.y = f.yaw;
    keep(parts.part(`${id}.bones`, (b) => {
      const L = f.length;
      b.tube([[0, 0.4, -L / 2], [0, 0.7, -L / 6], [0, 0.6, L / 6], [0.2, 0.3, L / 2]], 0.28, P.porcelain, 7);
      b.ellipsoid([0, 0.9, -L / 2 - 1.2], [1.1, 0.8, 1.6], P.shell, 9);
      for (let k = 0; k < Math.floor(L / 1.6); k++) {
        const z = -L / 2 + 1.5 + k * 1.6, h = 2.6 * Math.sin(Math.PI * (0.25 + 0.6 * k / (L / 1.6))) + 0.6;
        for (const side of [-1, 1]) b.tube([[0, 0.7, z], [side * 1.6, h, z + 0.2], [side * 2.4, 0.2 + r() * 0.3, z + 0.5]], 0.11, k % 3 ? P.porcelain : P.shell, 5);
      }
      for (let k = 0; k < 6; k++) b.ellipsoid([(r() - 0.5) * 3, 0.15, (r() - 0.5) * L], [0.6, 0.12, 0.4], "#5b4a5e", 6);
    }, node));
    const crawlers = Array.from({ length: f.scavengers }, (_, i) => ({
      mesh: keep(parts.part(`${id}.scavenger.${i}`, (b) => {
        b.ellipsoid([0, 0.1, 0], [0.12, 0.08, 0.3], P.stoneLight, 6);
        b.tube([[-0.1, 0.05, -0.2], [0, 0.04, -0.34], [0.1, 0.05, -0.2]], 0.02, P.ink, 3);
      }, node)), phase: r() * 6.3, along: (r() - 0.5) * f.length, side: r() < 0.5 ? -1 : 1,
    }));
    groups.push({ at: f.position, node, pose(_s, t) {
      for (const c of crawlers) {
        const a = t * 0.25 + c.phase;
        c.mesh.position.set(c.side * (0.5 + 0.6 * Math.sin(a)), 0.25, c.along + Math.cos(a) * 0.8);
        c.mesh.rotation.y = Math.atan2(c.side * Math.cos(a), -Math.sin(a));
      }
    } });
  }
  // The sound hunter's feeding shoal: bunches and flashes as it comes, scatters as it leaves.
  {
    const node = parts.node("shoal.hunter"), r = seeded(404);
    node.position.set(HUNTER_FEEDING_SPOT.x, HUNTER_FEEDING_SPOT.y, HUNTER_FEEDING_SPOT.z);
    const shoal = Array.from({ length: 14 }, (_, i) => ({ mesh: keep(parts.part(`shoal.fish.${i}`, (b) => fish(b, true), node)), phase: r() * 6.3, radius: 2 + r() * 3 }));
    const lights = shoal.map((f) => new Display(f.mesh));
    let spread = 1, last = 0;
    groups.push({ at: HUNTER_FEEDING_SPOT, node, pose(s, t) {
      const dt = Math.min(0.1, t - last); last = t;
      const phase = windowSample("canopy_sound_hunter", s.tick).phase;
      spread = smooth(spread, phase === "leaving" ? 0.35 : phase === "returning" ? 2.4 : phase === "away" ? 0.8 : 1, 1.5, dt);
      shoal.forEach((f, i) => {
        const a = t * (phase === "away" ? 1.4 : 0.5) + f.phase;
        f.mesh.position.set(Math.cos(a) * f.radius * spread, Math.sin(t + f.phase) * 0.8 * spread, Math.sin(a) * f.radius * spread);
        f.mesh.rotation.y = -a;
        lights[i]!.set(phase === "leaving" ? 0.8 + 0.8 * Math.max(0, Math.sin(t * 8 + i)) : 0.9, true);
      });
    } });
  }
  // Laying skates on the lee shelf, only during their visit.
  const laying = [0, 1].map((i) => createLayerSkate(scene, cel, `fauna.laying_skate.${i}`, layerY("divide_dense_layer"), parts.root));
  for (const v of laying) meshes.push(...v.meshes);
  return {
    root: parts.root, meshes,
    update(s: GameState, seconds: number, camera: Vec3 | undefined, near: (p: Vec3, c: Vec3 | undefined) => boolean): void {
      for (const g of groups) {
        const shown = near(g.at, camera);
        g.node.setEnabled(shown);
        if (shown) g.pose(s, seconds);
      }
      const skates = layingSkates(s.tick);
      laying.forEach((v, i) => {
        const k = skates[i], shown = !!k && near(k.position, camera);
        v.root.setEnabled(shown);
        if (shown) v.update({ id: "divide_skate_saddle", species: "layer_skate", mode: "rest", position: k.position, yaw: k.yaw,
          warning: 0, cue: null, modeSeconds: 0, busy: true }, seconds);
      });
    },
    dispose(): void { for (const v of laying) v.dispose(); parts.dispose(); },
  };
}
export type FaunaLayer = ReturnType<typeof createFauna>;
