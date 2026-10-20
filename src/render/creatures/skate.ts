import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { Point } from "../geometry.js";
import { PALETTE as P } from "../palette.js";
import { creatureParts, Display, smooth } from "./kit.js";
import type { CreatureView, ThreatPose } from "./types.js";

/** Layer skate: a broad ray living inside the dense brine. Its cue is at the
 * mirror surface above it, so the view owns a dimple ring at `layerY`: flat
 * at rest, a widening dimple while it tracks you, a raised bulge for the surge.
 * The animal's wing edges curl up when alert and sweep back to lunge. */
export function createLayerSkate(scene: Scene, cel: Material, name: string, layerY: number, parent?: TransformNode): CreatureView {
  const parts = creatureParts(scene, cel, name, parent);
  const body = parts.part("body", b => {
    b.ellipsoid([0, 0, 0], [0.95, 0.32, 2.1], "#2d5f6c", 10);
    b.ellipsoid([0, -0.12, -0.2], [0.8, 0.18, 1.7], P.steelLight, 9);
    for (const side of [-1, 1]) {
      b.ellipsoid([side * 0.38, 0.24, -1.55], [0.1, 0.08, 0.1], P.ink, 6);
      b.glow(b.ellipsoid([side * 0.4, 0.26, -1.63], [0.05, 0.03, 0.03], P.mint, 5));
    }
    b.tube([[0, 0.05, 1.9], [0, 0.1, 3.4], [0.15, 0.25, 4.6]], 0.07, P.petrol, 5);
    b.face([[0, 0.1, 3.6], [0, 0.55, 4.1], [0, 0.1, 4.4]], P.violet);
  });
  const wings: { inner: Mesh; outer: Mesh; side: number; spots: Display }[] = [];
  for (const side of [-1, 1]) {
    const hinge = parts.node(`wing.${side}`);
    hinge.position.set(side * 0.8, 0, 0);
    const chord = (x: number): Point[] => [[x, 0, -1.6 + Math.abs(x) * 0.35], [x, 0.04, 1.6 - Math.abs(x) * 0.25]];
    const inner = parts.part(`wing.${side}.inner`, b => {
      const [a0, a1] = chord(0), [b0, b1] = chord(side * 1.6);
      b.face([a0!, b0!, b1!, a1!], "#356f7a");
      b.face([[0, -0.02, a0![2]], [side * 1.6, -0.02, b0![2]], [side * 1.6, -0.02, b1![2]], [0, -0.02, a1![2]]], P.steelLight);
      for (const z of [-0.6, 0.1, 0.8]) b.glow(b.ellipsoid([side * 0.9, -0.05, z], [0.12, 0.03, 0.12], P.mint, 6));
    }, hinge);
    const tip = parts.node(`wing.${side}.tip`, hinge);
    tip.position.set(side * 1.6, 0, 0);
    const outer = parts.part(`wing.${side}.outer`, b => {
      b.face([[0, 0, -1.04], [side * 1.7, 0.05, 0.2], [0, 0.04, 1.2]], "#3f7f88");
      b.face([[0, -0.02, -1.04], [side * 1.7, -0.02, 0.2], [0, -0.02, 1.2]], P.reflection);
      b.tube([[0, 0.02, -1.04], [side * 1.7, 0.06, 0.2], [0, 0.05, 1.2]], 0.03, P.mint, 4);
    }, tip);
    wings.push({ inner, outer, side, spots: new Display(inner) });
  }
  // The dimple belongs to the mirror layer, in world space above the animal.
  const dimple = parts.part("dimple", b => {
    for (let ring = 0; ring < 3; ring++) b.ring([0, 0, 0], [1, 0, 0], [0, 0, 1], 1.2 + ring * 0.9, 1.0 + ring * 0.9, ring % 2 ? P.reflection : P.mint, 20);
    b.glow(b.ellipsoid([0, 0, 0], [0.3, 0.02, 0.3], P.mint, 6));
  }, parts.world, 0);
  const dimpleDisplay = new Display(dimple, () => true);
  let curl = 0, sweep = 0, dimpleScale = 0, bulge = 0, last = 0;
  return {
    root: parts.root,
    meshes: [body, ...wings.flatMap(w => [w.inner, w.outer]), dimple],
    update(a: ThreatPose, seconds: number) {
      const dt = Math.min(0.1, seconds - last); last = seconds;
      const m = a.mode;
      curl = smooth(curl, m === "alert" ? 0.45 : m === "investigate" ? 0.25 : 0, 3, dt);
      sweep = smooth(sweep, m === "commit" ? 1 : 0, 6, dt);
      dimpleScale = smooth(dimpleScale, m === "alert" ? 0.7 : m === "investigate" ? 1.2 : m === "commit" ? 1.6 : 0, 2.5, dt);
      bulge = smooth(bulge, m === "commit" ? 0.6 : 0, 5, dt);
      const beat = m === "investigate" ? 2.6 : m === "commit" ? 3.4 : 0.9;
      parts.root.position.set(a.position.x, a.position.y, a.position.z);
      // Body pitch rides with sweep: nose up for the surge toward the layer.
      body.rotation.set(-sweep * 0.5, 0, 0);
      parts.root.rotation.set(0, -a.yaw, 0);
      for (const w of wings) {
        const flap = Math.sin(seconds * beat) * (m === "rest" ? 0.12 : 0.22);
        (w.inner.parent as TransformNode).rotation.set(-sweep * 0.5, 0, w.side * (curl + flap) - w.side * sweep * 0.2);
        (w.outer.parent as TransformNode).rotation.set(0, w.side * sweep * 0.6, w.side * (curl * 1.4 + Math.sin(seconds * beat - 0.8) * 0.3));
        w.spots.set(m === "rest" ? 0.5 : m === "commit" ? 0.2 : 0.9 + 0.5 * Math.sin(seconds * 6 + w.side), m !== "commit");
      }
      dimple.setEnabled(dimpleScale > 0.04);
      dimple.position.set(a.position.x, layerY + 0.05 + bulge, a.position.z);
      dimple.scaling.set(dimpleScale * (1 + 0.08 * Math.sin(seconds * 5)), 1, dimpleScale * (1 + 0.08 * Math.cos(seconds * 5)));
      dimpleDisplay.set(0.6 + dimpleScale * 0.5, dimpleScale > 0.5);
    },
    dispose: () => parts.dispose(),
  };
}
