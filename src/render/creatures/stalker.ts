import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import { PALETTE as P } from "../palette.js";
import { creatureParts, Display, smooth } from "./kit.js";
import type { CreatureView, ThreatPose } from "./types.js";

const SEGMENTS = 9, SPACING = 0.72;
/** Body radius along the animal, head first. */
const radius = (i: number): number => 0.44 - (i / (SEGMENTS - 1)) * 0.34;

/** Glare stalker: a long warm-passage eel whose flank lights are its warning.
 * Each mode reads by pattern and posture, not hue alone: a slow drift of light
 * at rest, a fast run from head to tail when it first sees you, paired pulses
 * while closing, every light dark and the body straight for a lunge, and a
 * slow coil away when it withdraws. */
export function createGlareStalker(scene: Scene, cel: Material, name: string, parent?: TransformNode): CreatureView {
  const parts = creatureParts(scene, cel, name, parent);
  const spine = parts.node("spine");
  const segments: { mesh: Mesh; lights: Display }[] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const r = radius(i);
    const mesh = parts.part(`segment.${i}`, b => {
      const next = radius(Math.min(SEGMENTS - 1, i + 1)), fin = 0.3 - i * 0.022;
      b.ellipsoid([0, 0, 0], [r, r * 0.82, SPACING * 0.92], i % 2 ? "#4a3a5e" : P.plum, 10);
      b.ellipsoid([0, -r * 0.35, 0.05], [r * 0.84, r * 0.44, SPACING * 0.85], "#c58f62", 9);
      // One continuous dorsal membrane: each segment's panel meets the next.
      b.face([[0, r * 0.66, -SPACING * 0.55], [0, r * 0.66 + fin, -SPACING * 0.2], [0, next * 0.66 + fin * 0.92, SPACING * 0.62], [0, next * 0.66, SPACING * 0.62]], P.coral);
      b.tube([[0, r * 0.66 + fin, -SPACING * 0.2], [0, next * 0.66 + fin * 0.92, SPACING * 0.62]], 0.02, P.coralRim, 4);
      if (i > 2) b.face([[0, -r * 0.7, -SPACING * 0.5], [0, -r * 0.7 - 0.2, 0], [0, -next * 0.7, SPACING * 0.62]], P.petrol);
      for (const side of [-1, 1])
        for (const z of [-0.18, 0.2]) b.glow(b.ellipsoid([side * r * 0.9, r * 0.1, z], [0.09, 0.1, 0.12], P.amber, 6));
      if (i === 0) {
        for (const side of [-1, 1]) {
          b.ellipsoid([side * 0.27, 0.16, -0.32], [0.09, 0.08, 0.08], P.ink, 7);
          b.glow(b.ellipsoid([side * 0.3, 0.17, -0.36], [0.04, 0.03, 0.025], P.mint, 5));
          // Sensory barbels sweep back from the snout; no weapon silhouette.
          b.tube([[side * 0.12, -0.12, -0.55], [side * 0.34, -0.26, -0.75], [side * 0.5, -0.4, -0.5]], 0.02, P.coralRim, 4);
        }
        b.ellipsoid([0, -0.16, -0.36], [0.3, 0.12, 0.34], "#2f2742", 8);
        b.tube([[-0.24, -0.08, -0.62], [0, -0.1, -0.7], [0.24, -0.08, -0.62]], 0.025, P.ink, 4);
      }
      if (i === SEGMENTS - 1) b.face([[0, 0.05, 0.2], [0, 0.55, 0.9], [0, 0, 0.75], [0, -0.45, 0.9]], P.coral);
    }, spine);
    segments.push({ mesh, lights: new Display(mesh) });
  }
  let amp = 0.25, freq = 1.4, raise = 0, last = 0;
  return {
    root: parts.root,
    setEnabled: parts.setEnabled,
    meshes: segments.map(s => s.mesh),
    update(a: ThreatPose, seconds: number) {
      const dt = Math.min(0.1, seconds - last); last = seconds;
      const mode = a.mode;
      const targetAmp = mode === "commit" ? 0.04 : mode === "alert" ? 0.55 : mode === "investigate" ? 0.3 : mode === "withdraw" ? 0.5 : 0.24;
      const targetFreq = mode === "commit" ? 5 : mode === "investigate" ? 2.6 : mode === "alert" ? 1.9 : 1.2;
      amp = smooth(amp, targetAmp, 4, dt); freq = smooth(freq, targetFreq, 3, dt);
      raise = smooth(raise, mode === "alert" ? 0.35 : mode === "investigate" ? 0.15 : 0, 3, dt);
      parts.root.position.set(a.position.x, a.position.y, a.position.z);
      parts.root.rotation.set(0, -a.yaw, 0);
      let x = 0, z = 0, heading = 0;
      for (let i = 0; i < SEGMENTS; i++) {
        const t = i / (SEGMENTS - 1), wave = Math.sin(seconds * freq * 2 - i * 0.8);
        heading = amp * wave * (0.4 + t);
        const s = segments[i]!;
        s.mesh.position.set(x, raise * (1 - t) * (1 - t), z);
        s.mesh.rotation.set(-raise * (1 - t) * 0.6, heading, 0);
        x += Math.sin(heading) * SPACING;
        z += Math.cos(heading) * SPACING;
        // Light pattern by mode.
        let gain = 0.6 + 0.3 * Math.sin(seconds * 1.3 - i * 0.7), lit = true;
        if (mode === "alert") gain = 0.35 + 1.25 * Math.max(0, Math.sin(seconds * 9 - i * 0.95)) ** 4;
        else if (mode === "investigate") { const ph = seconds % 1.6; gain = ph < 0.16 || (ph > 0.34 && ph < 0.5) ? 1.5 : 0.3; }
        else if (mode === "commit") { gain = 0.25; lit = false; }
        else if (mode === "withdraw") gain = 0.32 + 0.12 * Math.sin(seconds * 0.8 - i * 0.4);
        // CR-1: feeding in the plume, its lights ripple fast and warm down the body.
        if (a.busy) gain = 0.7 + 0.7 * Math.max(0, Math.sin(seconds * 7 - i * 1.3));
        s.lights.set(gain, lit);
      }
    },
    dispose: () => parts.dispose(),
  };
}
