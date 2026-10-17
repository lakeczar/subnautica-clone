import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Mesh, Scene } from "@babylonjs/core";
import type { GameState } from "../sim/types.js";
import { CARRIER_LAYOUT } from "../sim/carrier.js";
import { ArtBatch } from "./geometry.js";
import type { Point } from "./geometry.js";

export const opticalUniforms = [
  "cameraPosition", "fogColor", "waterFogColor", "fogDensity",
  "carrierPosition", "carrierYaw", "carrierPresent", "carrierAirMin", "carrierAirMax",
];

/** Optical intervals only: these never grant air or change a seal. The lab
 * interval copies src/sim/inventory.ts inCanopyAir's existing box; that function
 * remains the air authority. Keep this render-only dependency in sync until
 * those bounds have a shared descriptor. The carrier interval reads
 * the shared dry deck/room layout and is transformed with the rendered hull.
 * Subtract only the part of each air interval that is actually below Y=0. */
export const opticalShader = `
uniform vec3 cameraPosition; uniform vec3 fogColor; uniform vec3 waterFogColor;
uniform float fogDensity; uniform vec3 carrierPosition; uniform float carrierYaw;
uniform float carrierPresent; uniform vec3 carrierAirMin; uniform vec3 carrierAirMax;
vec2 boxInterval(vec3 a,vec3 b,vec3 low,vec3 high,vec2 clip){
  vec3 d=b-a;
  vec3 safe=vec3(abs(d.x)<.00001?.00001:d.x,abs(d.y)<.00001?.00001:d.y,abs(d.z)<.00001?.00001:d.z);
  vec3 p=(low-a)/safe,q=(high-a)/safe;
  vec3 near=min(p,q),far=max(p,q);
  float enter=max(clip.x,max(near.x,max(near.y,near.z)));
  float leave=min(clip.y,min(far.x,min(far.y,far.z)));
  return leave>enter?vec2(enter,leave):vec2(0.0);
}
vec3 carrierLocal(vec3 p){
  p-=carrierPosition; float c=cos(carrierYaw),s=sin(carrierYaw);
  return vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);
}
float waterPath(vec3 a,vec3 b){
  if(a.y>=0.0&&b.y>=0.0)return 0.0;
  vec2 span=vec2(0.0,1.0);
  if(a.y>=0.0)span.x=-a.y/(b.y-a.y);
  else if(b.y>=0.0)span.y=-a.y/(b.y-a.y);
  vec2 lab=boxInterval(a,b,vec3(111.4,-118.1,-129.6),vec3(120.6,-114.5,-122.4),span);
  vec2 cabin=carrierPresent*boxInterval(carrierLocal(a),carrierLocal(b),carrierAirMin,carrierAirMax,span);
  float overlap=max(0.0,min(lab.y,cabin.y)-max(lab.x,cabin.x));
  float air=lab.y-lab.x+cabin.y-cabin.x-overlap;
  return max(0.0,span.y-span.x-air)*length(b-a);
}
vec3 opticalFog(vec3 color,vec3 point){
  float distance=length(point-cameraPosition),wet=waterPath(cameraPosition,point);
  float dry=max(0.0,distance-wet);
  float haze=1.0-exp(-fogDensity*(wet+dry*.18));
  vec3 medium=mix(fogColor,waterFogColor,wet/max(.0001,wet+dry*.08));
  return mix(color,medium,clamp(haze,0.0,.9999));
}
`;

const vertex = `
precision highp float;
attribute vec3 position; attribute vec3 normal; attribute vec4 color;
uniform mat4 world; uniform mat4 worldViewProjection;
varying vec3 vWorld; varying vec3 vNormal; varying vec4 vColor;
void main(){
  vWorld=(world*vec4(position,1.0)).xyz;
  vNormal=normalize(mat3(world)*normal); vColor=color;
  gl_Position=worldViewProjection*vec4(position,1.0);
}`;

const fragment = `
precision highp float;
varying vec3 vWorld; varying vec3 vNormal; varying vec4 vColor;
uniform vec3 lightDirection; uniform float time; uniform float underwater;
${opticalShader}
void main(){
  vec3 n=normalize(vNormal); float d=dot(n,normalize(lightDirection));
  float band=d>.66?1.09:(d>.12?.91:(d>-.32?.72:.53));
  vec3 temperature=mix(vec3(.66,.85,1.02),vec3(1.07,1.035,.9),smoothstep(-.12,.75,d));
  vec3 shade=vColor.rgb*band*temperature;
  float rim=pow(1.0-max(0.0,dot(n,normalize(cameraPosition-vWorld))),3.0);
  shade+=vec3(.026,.067,.071)*rim;
  float wx=vWorld.x*.82+sin(vWorld.z*.49+time*.2)*.9+time*.15;
  float wz=vWorld.z*.93+sin(vWorld.x*.44-time*.15)*.7;
  float net=1.0-smoothstep(.012,.09,abs(sin(wx)*sin(wz)));
  float caustic=net*smoothstep(.45,.95,n.y)*(1.0-smoothstep(-.8,-.1,vWorld.y));
  shade+=vec3(.06,.10,.055)*caustic*underwater*exp(min(0.0,vWorld.y)*.025);
  gl_FragColor=vec4(opticalFog(shade,vWorld),1.0);
}`;

function initializeOptics(material: ShaderMaterial): void {
  material.setVector3("cameraPosition", Vector3.Zero());
  material.setColor3("fogColor", Color3.FromHexString("#96c5b9"));
  material.setColor3("waterFogColor", Color3.FromHexString("#226e7e"));
  material.setFloat("fogDensity", 0.027);
  material.setVector3("carrierPosition", Vector3.Zero());
  material.setFloat("carrierYaw", 0);
  material.setFloat("carrierPresent", 0);
  material.setVector3("carrierAirMin", new Vector3(CARRIER_LAYOUT.deck.min.x, CARRIER_LAYOUT.deck.max.y, CARRIER_LAYOUT.deck.min.z));
  material.setVector3("carrierAirMax", new Vector3(CARRIER_LAYOUT.deck.max.x, CARRIER_LAYOUT.compact[0].max.y, CARRIER_LAYOUT.deck.max.z));
}

export function createCelMaterial(scene: Scene): ShaderMaterial {
  const material = new ShaderMaterial("siltwake.cel", scene, { vertexSource: vertex, fragmentSource: fragment }, {
    attributes: ["position", "normal", "color"],
    uniforms: ["world", "worldViewProjection", ...opticalUniforms, "lightDirection", "time", "underwater"],
  });
  material.backFaceCulling = false;
  initializeOptics(material);
  material.setVector3("lightDirection", new Vector3(-0.42, 0.85, -0.3));
  material.setFloat("time", 0);
  material.setFloat("underwater", 0);
  return material;
}

/** One scene-owned glass material, shared by explicit panes, never instruments.
 * Each pane has two clipped halves. Alpha indices put the far half before the
 * flat water surface and the same-side half after it. Distance sorting still
 * orders panes within each half; opaque hull depth tests remain enabled. */
export function createGlassMaterial(scene: Scene): ShaderMaterial {
  const material = new ShaderMaterial("siltwake.observation-glass", scene, {
    vertexSource: vertex,
    fragmentSource: `precision highp float;
      varying vec3 vWorld; varying vec3 vNormal; varying vec4 vColor;
      ${opticalShader}
      void main(){
        if(vWorld.y*vColor.a<0.0)discard;
        vec3 view=normalize(cameraPosition-vWorld);
        float fresnel=pow(1.0-abs(dot(normalize(vNormal),view)),4.0);
        vec3 tint=mix(vColor.rgb,vec3(.62,.81,.77),fresnel*.55);
        gl_FragColor=vec4(opticalFog(tint,vWorld),.075+fresnel*.27);
      }`,
  }, {
    attributes: ["position", "normal", "color"],
    uniforms: ["world", "worldViewProjection", ...opticalUniforms],
    needAlphaBlending: true,
  });
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  initializeOptics(material);
  const sort = scene.onBeforeRenderObservable.add(() => {
    const side = (scene.activeCamera?.position.y ?? 1) >= 0 ? 1 : -1;
    for (const mesh of scene.meshes)
      if (mesh.material === material) mesh.alphaIndex = mesh.metadata.paneSide * side;
  });
  material.onDisposeObservable.addOnce(() => scene.onBeforeRenderObservable.remove(sort));
  return material;
}

export function createObservationPane(
  scene: Scene, glass: ShaderMaterial, name: string, points: readonly Point[], parent?: Mesh,
): void {
  for (const side of [1, -1]) {
    const b = new ArtBatch(`${name}.${side > 0 ? "above" : "below"}`, scene, glass);
    const face = b.face(points, "#75adae");
    const colors = face.getVerticesData("color")!;
    for (let i = 3; i < colors.length; i += 4) colors[i] = side;
    face.setVerticesData("color", colors);
    const pane = b.finish();
    pane.metadata = { paneSide: side };
    pane.renderingGroupId = 1;
    if (parent) { pane.unfreezeWorldMatrix(); pane.parent = parent; }
  }
}

/** Render-only subtraction through all backing layers, including partial
 * overlaps. Collision/air descriptors remain sealed and entirely unchanged. */
export function wallWithOpening(
  b: ArtBatch, center: Point, size: Point,
  opening: { center: Point; width: number; height: number; normal: "x" | "z" }, color: string,
): void {
  const u = opening.normal === "z" ? 0 : 2;
  const left = center[u] - size[u] / 2, right = center[u] + size[u] / 2;
  const low = center[1] - size[1] / 2, high = center[1] + size[1] / 2;
  const a = Math.max(left, opening.center[u] - opening.width / 2);
  const c = Math.min(right, opening.center[u] + opening.width / 2);
  const d = Math.max(low, opening.center[1] - opening.height / 2);
  const e = Math.min(high, opening.center[1] + opening.height / 2);
  if (a >= c || d >= e) { b.box(center, size, color); return; }
  const piece = (x0: number, x1: number, y0: number, y1: number): void => {
    if (x1 - x0 < .00001 || y1 - y0 < .00001) return;
    const p: [number, number, number] = [...center], s: [number, number, number] = [...size];
    p[u] = (x0 + x1) / 2; p[1] = (y0 + y1) / 2;
    s[u] = x1 - x0; s[1] = y1 - y0;
    b.box(p, s, color);
  };
  piece(left, a, low, high); piece(c, right, low, high);
  piece(a, c, low, d); piece(a, c, e, high);
}

export function updateOpticalUniforms(
  materials: readonly ShaderMaterial[], camera: Vector3, state: GameState | null,
): void {
  const h = state?.fleet.vehicles.find(v => v.id === state.fleet.docking?.vehicleId);
  const depth = Math.max(0, -camera.y);
  const waterFog = Color3.Lerp(Color3.FromHexString("#226e7e"), Color3.FromHexString("#10384e"), 1 - Math.exp(-depth * .018));
  const airFog = Color3.FromHexString("#96c5b9");
  for (const material of materials) {
    material.setVector3("cameraPosition", camera);
    material.setColor3("fogColor", airFog);
    material.setColor3("waterFogColor", waterFog);
    material.setFloat("fogDensity", state && state.player.pose.position.x > 65 ? .017 : .027);
    material.setFloat("carrierPresent", h ? 1 : 0);
    material.setFloat("carrierYaw", h?.pose.yaw ?? 0);
    material.setVector3("carrierAirMin", new Vector3(CARRIER_LAYOUT.deck.min.x, CARRIER_LAYOUT.deck.max.y, CARRIER_LAYOUT.deck.min.z));
    material.setVector3("carrierAirMax", new Vector3(CARRIER_LAYOUT.deck.max.x, CARRIER_LAYOUT.compact[0].max.y, CARRIER_LAYOUT.deck.max.z));
    if (h) material.setVector3("carrierPosition", new Vector3(h.pose.position.x, h.pose.position.y, h.pose.position.z));
  }
}
