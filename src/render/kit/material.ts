import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { CEL_FRAGMENT, CEL_UNIFORMS, CEL_VERTEX, LIGHT_DIRECTION } from "../materials.js";

/** The production cel vertex stage, which is instancing-aware. */
export const KIT_VERTEX = CEL_VERTEX;

/** A separate material with the production cel stages, for tools that want
 * their own uniforms. The renderer passes its one cel material to the kit
 * instead. `cel` is accepted for compatibility; the sources are shared. */
export function createKitMaterial(scene: Scene, _cel?: ShaderMaterial): ShaderMaterial {
  const material = new ShaderMaterial("kit.cel", scene, { vertexSource: CEL_VERTEX, fragmentSource: CEL_FRAGMENT }, {
    attributes: ["position", "normal", "color"], uniforms: CEL_UNIFORMS,
  }, true);
  material.backFaceCulling = false;
  material.setVector3("lightDirection", LIGHT_DIRECTION);
  material.setFloat("time", 0);
  material.setFloat("underwater", 0);
  return material;
}
