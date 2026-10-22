import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import { seeded } from "../geometry.js";
import { PALETTE as P } from "../palette.js";
import { creatureParts, Display, revolve, smooth } from "./kit.js";
import type { CreatureView, ThreatPose } from "./types.js";

const BELLS = 9;
/** Hollow choir: a sessile colony of pale bells on stalks. Closed bells at
 * rest; open, swaying bells with lit rims that hum; every bell swelling in
 * unison as the pulse builds; a pressure shell expanding to the pulse radius;
 * then the bells fold shut. `reach` is the simulation's pulse radius. */
export function createHollowChoir(scene: Scene, cel: Material, name: string, reach: number, parent?: TransformNode): CreatureView {
  const parts = creatureParts(scene, cel, name, parent), random = seeded(911);
  const bells: { mesh: Mesh; rim: Display; phase: number; height: number }[] = [];
  const base = parts.part("holdfast", b => {
    b.ellipsoid([0, -0.2, 0], [3.4, 0.6, 3], "#43626b", 9);
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2;
      b.ellipsoid([Math.cos(a) * 2.6, -0.1, Math.sin(a) * 2.2], [0.8, 0.35, 0.7], i % 2 ? P.basalt : "#5b7d7f", 7);
    }
  });
  for (let i = 0; i < BELLS; i++) {
    const a = i / BELLS * Math.PI * 2 + random() * 0.4, r = i === 0 ? 0 : 1 + random() * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, height = 1.6 + random() * 2.2;
    parts.part(`stalk.${i}`, b => b.tube([[x, 0, z], [x + 0.15, height * 0.5, z - 0.1], [x, height, z]], 0.07, P.petrol, 5), base);
    const pivot = parts.node(`bell.${i}`, base);
    pivot.position.set(x, height, z);
    const mesh = parts.part(`bell.${i}.cup`, b => {
      revolve(b, [0, 0, 0], [[0.08, 0], [0.32, 0.25], [0.5, 0.75], [0.62, 1.15], [0.78, 1.25]], P.porcelain, P.plum, 10);
      revolve(b, [0, 0, 0], [[0.74, 1.24], [0.8, 1.27]], P.mint, P.mint, 10);
      for (let k = 0; k < 5; k++) {
        const t = k / 5 * Math.PI * 2;
        b.glow(b.ellipsoid([Math.cos(t) * 0.76, 1.26, Math.sin(t) * 0.76], [0.07, 0.05, 0.07], P.mint, 5));
      }
    }, pivot);
    bells.push({ mesh, rim: new Display(mesh), phase: random() * Math.PI * 2, height });
  }
  // A pressure shell in three planes reads as a sphere at gameplay distance.
  const shell = parts.part("pulse", b => {
    b.ring([0, 0, 0], [1, 0, 0], [0, 0, 1], 1, 0.9, P.mint, 28);
    b.ring([0, 0, 0], [1, 0, 0], [0, 1, 0], 1, 0.92, P.reflection, 28);
    b.ring([0, 0, 0], [0, 0, 1], [0, 1, 0], 1, 0.92, P.reflection, 28);
  }, parts.world, 0);
  const shellDisplay = new Display(shell, () => true);
  let open = 0, swell = 0, last = 0;
  return {
    root: parts.root,
    meshes: [base, ...bells.map(b => b.mesh), shell],
    update(a: ThreatPose, seconds: number) {
      const dt = Math.min(0.1, seconds - last); last = seconds;
      const m = a.mode;
      // CR-1: resting (its natural window), the bells fold fully shut.
      open = smooth(open, a.busy ? 0.02 : m === "rest" ? 0.25 : m === "withdraw" ? 0.3 : 1, m === "withdraw" || a.busy ? 0.6 : 2.2, dt);
      swell = smooth(swell, m === "investigate" ? 1 : m === "commit" ? 1.2 : 0, 2.5, dt);
      parts.root.position.set(a.position.x, a.position.y, a.position.z);
      for (const bell of bells) {
        // Alert: each bell sways on its own phase. Investigate: all swell in unison.
        const own = Math.sin(seconds * 2.2 + bell.phase), unison = Math.sin(seconds * 4.5);
        const s = 1 + swell * 0.25 * (0.5 + 0.5 * unison);
        bell.mesh.scaling.set((0.5 + open * 0.5) * s, 0.6 + open * 0.4, (0.5 + open * 0.5) * s);
        (bell.mesh.parent as TransformNode).rotation.set(own * 0.12 * open, 0, Math.cos(seconds * 1.7 + bell.phase) * 0.12 * open);
        const hum = m === "alert" ? 0.6 + 0.4 * own : m === "investigate" ? 0.9 + 0.6 * unison : m === "commit" ? 1.6 : 0.35;
        bell.rim.set(a.busy ? 0.12 : hum, !a.busy && m !== "rest" && m !== "withdraw");
      }
      // The shell expands over the commit window, matching the 2 s pulse timing.
      const pulsing = m === "commit";
      shell.setEnabled(pulsing);
      if (pulsing) {
        const t = Math.min(1, a.modeSeconds / 2), r = 1 + t * reach;
        shell.position.set(a.position.x, a.position.y + 2, a.position.z);
        shell.scaling.set(r, r, r);
        shell.rotation.y = seconds * 0.3;
        shellDisplay.set(1.3 - t * 0.6, true);
      }
    },
    dispose: () => parts.dispose(),
  };
}
