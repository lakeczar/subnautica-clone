import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { EcologyView } from "../../sim/ecology/ecology.js";

/** The renderer reads ecology only through its derived view; it never owns
 * encounter truth and never writes simulation state. */
export type ThreatPose = EcologyView["threats"][number];
export interface CreatureView {
  readonly root: TransformNode;
  /** Meshes whose color buffers this view animates (for tests and culling). */
  readonly meshes: readonly Mesh[];
  update(pose: ThreatPose, seconds: number): void;
  dispose(): void;
}
