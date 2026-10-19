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
  // Air has its own clear haze. A dry room does not clear the wet portion of
  // an exterior ray; distant underwater objects may still disappear entirely.
  float haze=1.0-exp(-fogDensity*wet-dry*.0018);
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
  float band=d>.66?1.09:(d>.12?.91:(d>-.32?.69:.45));
  vec3 temperature=mix(vec3(.61,.83,1.04),vec3(1.07,1.035,.93),smoothstep(-.12,.75,d));
  vec3 shade=vColor.rgb*band*temperature;
  // Ground alone carries alpha zero. Bounded, antialiased sediment relief
  // breaks up a near-floor wash without lifting the eye or inventing support.
  // This is shading on submitted triangles, not a displacement/collision rule.
  float ground=step(0.0,vColor.a)*(1.0-step(.5,vColor.a));
  float phase=vWorld.x*3.2+vWorld.z*.85+sin(vWorld.z*1.4)*.65;
  float ripple=sin(phase);
  float relief=mix(.67,1.02,smoothstep(-.6,.65,ripple));
  relief=mix(relief,.85,smoothstep(.8,2.5,fwidth(phase)));
  float grain=sin(vWorld.x*37.0+sin(vWorld.z*29.0))*sin(vWorld.z*41.0);
  float grainFade=1.0-smoothstep(.12,.6,fwidth(vWorld.x*37.0)+fwidth(vWorld.z*41.0));
  // A close down-look sees less than a metre of floor. The broad ripples alone
  // can fill that view with one flat value, so retain a smaller sediment scale
  // locally and fade it before it becomes a distant moire pattern.
  float finePhase=vWorld.x*13.0+vWorld.z*5.0+sin(vWorld.z*7.0)*.5;
  float fine=mix(.57,1.02,smoothstep(-.35,.5,sin(finePhase)));
  float fineFade=(1.0-smoothstep(3.0,14.0,length(vWorld-cameraPosition)))*
    (1.0-smoothstep(.7,2.5,fwidth(finePhase)));
  shade*=mix(1.0,relief*mix(1.0,fine,fineFade)+grain*.035*grainFade,ground);
  float rim=pow(1.0-max(0.0,dot(n,normalize(cameraPosition-vWorld))),3.0);
  // Selective grazing ink is in the same opaque pass and receives the same
  // fog/depth test as its owner. No shells, through-wall lines or extra draws.
  float contour=smoothstep(.64,.96,rim)*max(0.0,vColor.a-1.0);
  shade=mix(shade,vec3(.035,.105,.13),contour*.78);
  float wx=vWorld.x*.82+sin(vWorld.z*.49+time*.2)*.9+time*.15;
  float wz=vWorld.z*.93+sin(vWorld.x*.44-time*.15)*.7;
  float net=1.0-smoothstep(.012,.09,abs(sin(wx)*sin(wz)));
  float caustic=net*smoothstep(.45,.95,n.y)*(1.0-smoothstep(-.8,-.1,vWorld.y));
  shade+=vec3(.06,.10,.055)*caustic*underwater*exp(min(0.0,vWorld.y)*.025);
  // Authored diffuse warmth, bounded to the existing refuge interiors. This
  // shader owns the visible light pools; Babylon lamps cannot light this cel.
  float pod=step(abs(vWorld.x),2.94)*step(19.38,vWorld.z)*step(vWorld.z,24.01)*step(.15,vWorld.y)*step(vWorld.y,3.73);
  float lab=step(111.28,vWorld.x)*step(vWorld.x,120.61)*step(-129.72,vWorld.z)*step(vWorld.z,-122.39)*step(-118.03,vWorld.y)*step(vWorld.y,-113.97);
  vec3 pd=(vWorld-vec3(.7,2.6,21.4))*vec3(.22,.35,.30);
  vec3 ld=(vWorld-vec3(114.5,-115.1,-127.4))*vec3(.19,.28,.22);
  float warmth=pod*exp(-dot(pd,pd))*.75+lab*exp(-dot(ld,ld))*.9;
  shade=shade*mix(vec3(1.0),vec3(1.23,1.05,.79),warmth)+vec3(.095,.042,.009)*warmth;
  shade=mix(shade,vColor.rgb*1.12,step(vColor.a,-.5));
  gl_FragColor=vec4(opticalFog(shade,vWorld),1.0);
}`;

function initializeOptics(material: ShaderMaterial): void {
  material.setVector3("cameraPosition", Vector3.Zero());
  material.setColor3("fogColor", Color3.FromHexString("#a5ccd1"));
  material.setColor3("waterFogColor", Color3.FromHexString("#237e89"));
  material.setFloat("fogDensity", 0.0105);
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

const BASIN_SILT = "#4f807c";

export function updateOpticalUniforms(
  materials: readonly ShaderMaterial[], camera: Vector3, state: GameState | null,
): void {
  const h = state?.fleet.vehicles.find(v => v.id === state.fleet.docking?.vehicleId);
  const depth = Math.max(0, -camera.y);
  const blend = (low: number, high: number, value: number): number => {
    const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
    return t * t * (3 - 2 * t);
  };
  const canopy = blend(60, 90, camera.x) * blend(35, 65, depth);
  const lower = blend(98, 175, depth);
  const density = .0105 * (1 - canopy) + (.009 + lower * .014) * canopy;
  // Pale Basin: suspended sediment lifts the deep water to a pale silt jade
  // at unchanged haze density, so wreck ridges and survey dishes read as dark
  // silhouettes. Blended across the Canopy edge and descent; render-only.
  const basin = blend(-168, -194, camera.z) * blend(92, 112, camera.x) * blend(116, 146, depth);
  const waterFog = Color3.Lerp(
    Color3.Lerp(Color3.FromHexString("#237e89"), Color3.FromHexString("#0b3048"), blend(15, 190, depth)),
    Color3.FromHexString(BASIN_SILT), basin * .82);
  const airFog = Color3.FromHexString("#a5ccd1");
  for (const material of materials) {
    material.setVector3("cameraPosition", camera);
    material.setColor3("fogColor", airFog);
    material.setColor3("waterFogColor", waterFog);
    material.setFloat("fogDensity", density);
    material.setFloat("carrierPresent", h ? 1 : 0);
    material.setFloat("carrierYaw", h?.pose.yaw ?? 0);
    material.setVector3("carrierAirMin", new Vector3(CARRIER_LAYOUT.deck.min.x, CARRIER_LAYOUT.deck.max.y, CARRIER_LAYOUT.deck.min.z));
    material.setVector3("carrierAirMax", new Vector3(CARRIER_LAYOUT.deck.max.x, CARRIER_LAYOUT.compact[0].max.y, CARRIER_LAYOUT.deck.max.z));
    if (h) material.setVector3("carrierPosition", new Vector3(h.pose.position.x, h.pose.position.y, h.pose.position.z));
  }
}
