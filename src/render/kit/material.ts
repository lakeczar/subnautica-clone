import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import "@babylonjs/core/Shaders/ShadersInclude/instancesDeclaration.js";
import "@babylonjs/core/Shaders/ShadersInclude/instancesVertex.js";
import { opticalUniforms } from "../materials.js";

/** The cel vertex stage made instancing-aware. Without instances Babylon's
 * includes reduce to `finalWorld = world`, so one material serves merged
 * chunk meshes and thin-instance batches; per-instance tint multiplies the
 * vertex colour and leaves the cel alpha meaning untouched. */
export const KIT_VERTEX = `
precision highp float;
attribute vec3 position; attribute vec3 normal; attribute vec4 color;
#include<instancesDeclaration>
uniform mat4 viewProjection;
varying vec3 vWorld; varying vec3 vNormal; varying vec4 vColor;
void main(){
#include<instancesVertex>
  vec4 w=finalWorld*vec4(position,1.0);
  vWorld=w.xyz;
  vNormal=normalize(mat3(finalWorld)*normal);
  vColor=color;
#ifdef INSTANCESCOLOR
  vColor.rgb*=instanceColor.rgb;
#endif
  gl_Position=viewProjection*w;
}`;

/** Kit material whose fragment stage IS the production cel fragment, read
 * from the supplied cel material, so palette bands, fog, caustics and refuge
 * warmth cannot drift. Effects are stored per submesh, so instanced and
 * merged meshes do not recompile each other's variant every frame. */
export function createKitMaterial(scene: Scene, cel: ShaderMaterial): ShaderMaterial {
  const path = cel.shaderPath;
  if (typeof path === "string" || !path.fragmentSource) throw new Error("Kit material needs the inline cel fragment source.");
  const material = new ShaderMaterial("kit.cel", scene, { vertexSource: KIT_VERTEX, fragmentSource: path.fragmentSource }, {
    attributes: ["position", "normal", "color"],
    uniforms: ["world", "viewProjection", ...opticalUniforms, "lightDirection", "time", "underwater"],
  }, true);
  material.backFaceCulling = false;
  // Same light as createCelMaterial; folds into one material at migration.
  material.setVector3("lightDirection", new Vector3(-0.42, 0.85, -0.3));
  material.setFloat("time", 0);
  material.setFloat("underwater", 0);
  return material;
}
