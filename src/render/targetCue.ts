import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { Constants } from "@babylonjs/core/Engines/constants.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { InteractionHost } from "../sim/targeting.js";
import { opticalShader, opticalUniforms } from "./materials.js";

/** One retained, depth-tested and normally fogged set of quiet host brackets. */
export function createTargetCue(scene: Scene) {
  const mesh = new Mesh("interaction.cue", scene);
  const data = new VertexData();
  const positions: number[] = [], indices: number[] = [];
  const quad = (x: number, y: number, w: number, h: number): void => {
    const n = positions.length / 3;
    positions.push(x, y, 0, x + w, y, 0, x + w, y + h, 0, x, y + h, 0);
    indices.push(n, n + 1, n + 2, n, n + 2, n + 3);
  };
  for (const x of [-1, 1]) for (const y of [-1, 1]) {
    quad(x < 0 ? -1 : 0.54, y < 0 ? -1 : 0.95, 0.46, 0.05);
    quad(x < 0 ? -1 : 0.95, y < 0 ? -1 : 0.54, 0.05, 0.46);
  }
  data.positions = positions;
  data.indices = indices;
  data.applyToMesh(mesh);
  mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
  mesh.isPickable = false;
  mesh.renderingGroupId = 1;
  const material = new ShaderMaterial("interaction.cue", scene, {
    vertexSource: `precision highp float; attribute vec3 position;
      uniform mat4 world; uniform mat4 worldViewProjection; varying vec3 vWorld;
      void main(){vWorld=(world*vec4(position,1.)).xyz;gl_Position=worldViewProjection*vec4(position,1.);}`,
    fragmentSource: `precision highp float; varying vec3 vWorld;
      ${opticalShader}
      void main(){gl_FragColor=vec4(opticalFog(vec3(.92,.69,.32),vWorld),1.);}`,
  }, { attributes: ["position"], uniforms: ["world", "worldViewProjection", ...opticalUniforms] });
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  material.depthFunction = Constants.LEQUAL;
  mesh.material = material;
  mesh.setEnabled(false);
  let disposed = false;
  return {
    material,
    update(host: InteractionHost | null): void {
      if (disposed) return;
      const valid = host && [host.center.x, host.center.y, host.center.z, host.radius].every(Number.isFinite) && host.radius > 0;
      mesh.setEnabled(!!valid);
      if (!host || !valid) return;
      mesh.position.set(host.center.x, host.center.y, host.center.z);
      mesh.scaling.setAll(Math.max(0.12, Math.min(0.42, host.radius * 0.3)));
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      mesh.dispose();
      material.dispose();
    },
  };
}
