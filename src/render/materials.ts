import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Mesh, Scene } from "@babylonjs/core";
import type { GameState } from "../sim/types.js";
import { CARRIER_LAYOUT } from "../sim/carrier.js";
import { LEGACY_BLEND, LEGACY_PRESERVE } from "../content/regions/terrain.js";
import { opticsAt } from "./biomes/optics.js";
import { ArtBatch } from "./geometry.js";
import type { Point } from "./geometry.js";
import "@babylonjs/core/Shaders/ShadersInclude/instancesDeclaration.js";
import "@babylonjs/core/Shaders/ShadersInclude/instancesVertex.js";

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

/** The cel vertex stage, instancing-aware. Without instances Babylon's
 * includes reduce to `finalWorld = world`, so one material serves merged
 * meshes and thin-instance batches; a per-instance tint multiplies the vertex
 * colour and leaves the cel alpha meaning untouched. */
export const CEL_VERTEX = `
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
export const CEL_UNIFORMS = ["world", "viewProjection", ...opticalUniforms, "lightDirection", "time", "underwater", "lampOn"];
export const LIGHT_DIRECTION = new Vector3(-0.42, 0.85, -0.3);

/** World-space value noise for the cel pass: aperiodic, so no surface
 * treatment repeats on a grid the eye can find. */
export const NOISE_SHADER = `
float hash12(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float vnoise(vec2 p){
  vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),u.x),mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),u.x),u.y);
}
// Distance from p to the nearest edge between drifting cells: the network
// that refracted surface light draws on a shallow floor.
float cellEdge(vec2 p,float t){
  vec2 i=floor(p),f=fract(p); float a=8.0,b=8.0;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec2 g=vec2(float(x),float(y)),h=vec2(hash12(i+g),hash12(i+g+19.19));
    vec2 o=g+.5+.44*sin(t+6.2832*h)-f; float d=dot(o,o);
    if(d<a){b=a;a=d;}else if(d<b)b=d;
  }
  return sqrt(b)-sqrt(a);
}
`;

export const CEL_FRAGMENT = `
precision highp float;
varying vec3 vWorld; varying vec3 vNormal; varying vec4 vColor;
uniform vec3 lightDirection; uniform float time; uniform float underwater; uniform float lampOn;
${opticalShader}
${NOISE_SHADER}
void main(){
  // Thin two-sided parts (fans, fronds, ribbons) light the side in view.
  vec3 n=normalize(vNormal); float d=dot(n,normalize(lightDirection));
  float band=d>.66?1.09:(d>.12?.91:(d>-.32?.69:.45));
  vec3 temperature=mix(vec3(.61,.83,1.04),vec3(1.07,1.035,.93),smoothstep(-.12,.75,d));
  vec3 shade=vColor.rgb*band*temperature;
  // Ground alone carries alpha zero. Its relief is shading on submitted
  // triangles, not a displacement/collision rule, and it is read from the
  // place itself: soft-edged world-space patches everywhere, wave ripples only
  // on flat, shallow, submerged sediment, in fields whose heading, wavelength
  // and coverage change across the floor, and irregular strata on steep ground.
  float ground=step(0.0,vColor.a)*(1.0-step(.5,vColor.a));
  vec2 w=vWorld.xz; float depth=max(0.0,-vWorld.y);
  float view=length(vWorld-cameraPosition);
  float blot=vnoise(w*.043)*.62+vnoise(w*.17+7.3)*.38;
  // Patch contrast is firmer close by, where it carries material and depth.
  float near=1.0-smoothstep(6.0,30.0,view);
  float tone=mix(mix(.88,.82,near),1.04,smoothstep(.4,.56,blot))-mix(.06,.09,near)*smoothstep(.68,.78,vnoise(w*.09+3.7));
  float level=smoothstep(.84,.97,n.y), wet=1.0-smoothstep(-.6,.2,vWorld.y);
  float warp=(vnoise(w*.23)-.5)*2.6;
  float pa=dot(w,vec2(.94,.34))*3.6+warp, pb=dot(w,vec2(.21,.98))*3.1+warp*1.3;
  float ra=pow(.5+.5*sin(pa),2.2), rb=pow(.5+.5*sin(pb),2.2);
  float heading=smoothstep(.35,.65,vnoise(w*.016+1.7));
  float crest=mix(ra,rb,heading);
  float cover=smoothstep(.3,.6,vnoise(w*.028+5.1))*smoothstep(.22,.55,vnoise(w*.13+2.9))*level*wet*
    (1.0-.85*smoothstep(10.0,85.0,depth))*(1.0-.7*smoothstep(18.0,60.0,view));
  float rippleFade=1.0-smoothstep(.5,1.4,max(fwidth(pa),fwidth(pb)));
  float relief=1.0-.24*cover*rippleFade*(1.0-crest);
  // Close by, shallow level sand also shows small current-ripple marks
  // across the big ripples, breaking up a pale near field.
  float pm=dot(w,vec2(.6,.8))*12.5+warp*2.0+vnoise(w*1.3)*2.4, micro=pow(.5+.5*sin(pm),1.6);
  float microFade=level*wet*(1.0-smoothstep(3.0,14.0,view))*(1.0-smoothstep(.6,1.4,fwidth(pm)))*(1.0-smoothstep(15.0,60.0,depth));
  relief*=1.0-.13*microFade*smoothstep(.3,.6,vnoise(w*.4+8.2))*(1.0-micro);
  // Below the wave base the floor answers to current, not swell: long
  // silt drifts at Basin depths, then sparse pale speckle in the deep.
  vec2 cw=vec2(dot(w,vec2(.8,.6)),dot(w,vec2(-.6,.8)));
  float drift=smoothstep(110.0,180.0,depth)*(1.0-smoothstep(300.0,380.0,depth))*level;
  tone*=1.0-.13*drift*smoothstep(.45,.7,vnoise(vec2(cw.x*.03,cw.y*.16)+9.1));
  float speck=smoothstep(.8,.88,vnoise(w*1.9+3.3))*(1.0-smoothstep(.3,.8,fwidth(w.x*1.9)+fwidth(w.y*1.9)));
  tone*=1.0+.12*speck*smoothstep(260.0,340.0,depth);
  float steep=1.0-smoothstep(.55,.85,n.y);
  float strata=vnoise(vec2(vWorld.y*.55+vnoise(w*.05)*2.5,blot*3.0));
  relief*=1.0-.13*steep*smoothstep(.45,.6,strata);
  // A close down-look sees less than a metre of floor: keep a fine,
  // aperiodic grain there and fade it before it can shimmer at distance.
  float grain=vnoise(w*5.3)+vnoise(w*11.0+4.1)*.5+vnoise(w*23.0+1.7)*.3-.9;
  float grainFade=(1.0-smoothstep(4.0,22.0,view))*(1.0-smoothstep(.35,.9,fwidth(w.x*11.0)+fwidth(w.y*11.0)));
  // Sparse grit: shell flecks and dark pebbles, near field only.
  float grit=smoothstep(.87,.91,vnoise(w*6.2+6.6))-smoothstep(.88,.93,vnoise(w*5.1+2.2))*.8;
  float gritFade=(1.0-smoothstep(3.0,16.0,view))*(1.0-smoothstep(.3,.8,fwidth(w.x*6.2)+fwidth(w.y*6.2)));
  shade*=mix(1.0,tone*relief+grain*.1*grainFade+grit*.07*gritFade,ground);
  float rim=pow(1.0-max(0.0,dot(n,normalize(cameraPosition-vWorld))),3.0);
  // Selective grazing ink is in the same opaque pass and receives the same
  // fog/depth test as its owner. No shells, through-wall lines or extra draws.
  float contour=smoothstep(.64,.96,rim)*max(0.0,vColor.a-1.0);
  shade=mix(shade,vec3(.035,.105,.13),contour*.78);
  // Caustics: two drifting cell networks, combined so their crossings read as
  // bright filaments, gated by a slow broad mask so light pools come and go
  // rather than covering the floor as one net. Scaled with the lit colour,
  // fading with depth and resolving to their average brightening at distance.
  float sky=smoothstep(.3,.9,n.y)*(1.0-smoothstep(-.8,-.1,vWorld.y))*underwater;
  if(sky>0.0&&vWorld.y>-70.0){
    vec2 c=w*.52+(vec2(vnoise(w*.55+time*.12),vnoise(w*.55+vec2(5.2,1.3)-time*.1))-.5)*1.3;
    float lines=1.0-smoothstep(.0,.075,cellEdge(c,time*.6));
    float knots=1.0-smoothstep(.0,.3,cellEdge(c*.63+vec2(4.1,9.3),time*.45+2.0));
    float pool=smoothstep(.35,.75,vnoise(w*.04+vec2(time*.04,-time*.03)));
    float resolve=1.0-smoothstep(.2,.6,fwidth(c.x)+fwidth(c.y));
    float light=mix(.035,lines*(.3+.7*knots),resolve)*(.2+.8*pool)*sky*exp(-depth*.035);
    shade+=shade*vec3(.3,.36,.27)*light+vec3(.012,.02,.014)*light;
  }
  // S4 lamp switch (C3): a warm pool on nearby surfaces facing the eye. Off,
  // the deep world keeps only its ambient and animal light.
  vec3 toEye=cameraPosition-vWorld; float eye=length(toEye);
  float lampPool=lampOn*underwater*exp(-eye*.12)*(.3+.7*max(0.0,dot(n,toEye/max(eye,1e-3))));
  shade=shade*(1.0+lampPool*.6)+vec3(.055,.048,.03)*lampPool;
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
  const material = new ShaderMaterial("siltwake.cel", scene, { vertexSource: CEL_VERTEX, fragmentSource: CEL_FRAGMENT }, {
    attributes: ["position", "normal", "color"],
    uniforms: CEL_UNIFORMS,
  });
  material.backFaceCulling = false;
  initializeOptics(material);
  material.setVector3("lightDirection", LIGHT_DIRECTION);
  material.setFloat("time", 0);
  material.setFloat("underwater", 0);
  material.setFloat("lampOn", 0);
  return material;
}

/** One scene-owned glass material, shared by explicit panes, never instruments.
 * Each pane has two clipped halves. Alpha indices put the far half before the
 * flat water surface and the same-side half after it. Distance sorting still
 * orders panes within each half; opaque hull depth tests remain enabled. */
export function createGlassMaterial(scene: Scene): ShaderMaterial {
  const material = new ShaderMaterial("siltwake.observation-glass", scene, {
    vertexSource: CEL_VERTEX,
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
    uniforms: ["world", "viewProjection", ...opticalUniforms],
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
  let waterFog = Color3.Lerp(
    Color3.Lerp(Color3.FromHexString("#237e89"), Color3.FromHexString("#0b3048"), blend(15, 190, depth)),
    Color3.FromHexString(BASIN_SILT), basin * .82);
  let fogDensity = density;
  // S2's per-region optics take over outside B1's area over the same 96 m the
  // shared floor blends; inside the preserve the optics above are unchanged.
  const p = LEGACY_PRESERVE;
  const outside = Math.hypot(Math.max(0, p.minX - camera.x, camera.x - p.maxX), Math.max(0, p.minZ - camera.z, camera.z - p.maxZ));
  if (outside > 0) {
    const region = opticsAt(camera.x, camera.y, camera.z), w = blend(0, LEGACY_BLEND, outside);
    const authored = Color3.Lerp(Color3.FromHexString(region.water), Color3.FromHexString(region.deep), region.depthMix);
    waterFog = Color3.Lerp(waterFog, authored, w);
    fogDensity = density * (1 - w) + region.density * w;
  }
  const airFog = Color3.FromHexString("#a5ccd1");
  for (const material of materials) {
    material.setVector3("cameraPosition", camera);
    material.setColor3("fogColor", airFog);
    material.setColor3("waterFogColor", waterFog);
    material.setFloat("fogDensity", fogDensity);
    material.setFloat("carrierPresent", h ? 1 : 0);
    material.setFloat("carrierYaw", h?.pose.yaw ?? 0);
    material.setVector3("carrierAirMin", new Vector3(CARRIER_LAYOUT.deck.min.x, CARRIER_LAYOUT.deck.max.y, CARRIER_LAYOUT.deck.min.z));
    material.setVector3("carrierAirMax", new Vector3(CARRIER_LAYOUT.deck.max.x, CARRIER_LAYOUT.compact[0].max.y, CARRIER_LAYOUT.deck.max.z));
    if (h) material.setVector3("carrierPosition", new Vector3(h.pose.position.x, h.pose.position.y, h.pose.position.z));
  }
}
