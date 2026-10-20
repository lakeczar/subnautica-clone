import { DEFAULT_DAYLIGHT, DISTANCE_RANGE, LAMP_SKIN, LAMP_WALK_STEPS, type DaylightCurve } from "./lightField.js";

/** Cave darkness and the diver lamp for the cel pass (Babylon-free GLSL).
 *
 * The production cel fragment lights every surface from fixed directional
 * bands; a Babylon `SpotLight` never reaches it. This module adds, inside
 * the active cave's light field (`lightField.ts`):
 * - daylight that falls with the path length from the mouths and skylight,
 *   softly posterised into cel steps, back to full inside the sun's beam;
 * - caustics only where the sun actually reaches;
 * - a fog medium that darkens with the same daylight, so an exterior-bright
 *   fog cannot wash out a dark cave, while open water seen through a mouth
 *   keeps its brightness (the exit glows);
 * - a lamp cone with banded falloff and banded Lambert terms, stopped by any
 *   collision-rock voxel its ray crosses (an exact, unfiltered 3D DDA walk,
 *   mirrored by `lampVisible` in `lightField.ts`), plus a faint in-water beam.
 * Unlit (alpha -1) colour stays unlit: wayfinding colonies glow in the dark.
 *
 * `injectCaveLight` splices this into the production fragment at four
 * anchors and fails loudly if any anchor moved. Outside a cave field with
 * the lamp off it changes nothing. */

export const CAVE_UNIFORMS = [
  "caveFieldMin", "caveFieldSize", "caveActive", "caveCurve", "caveRockMin", "caveRockVoxel", "caveRockDims",
  "lampPosition", "lampDirection", "lampParams", "lampColor",
] as const;
export const CAVE_SAMPLERS = ["caveField", "caveRock"] as const;

export interface LampSettings {
  /** Metres of reach. */
  readonly range: number;
  /** Cone half-angles, degrees: full inside `inner`, none past `outer`. */
  readonly inner: number;
  readonly outer: number;
  /** Linear RGB, already scaled by intensity. */
  readonly color: readonly [number, number, number];
}
export const DEFAULT_LAMP: LampSettings = { range: 22, inner: 15, outer: 30, color: [0.95, 0.88, 0.74] };

/** `caveCurve` uniform: metres per stored unit / falloff, floor, fog floor, posterise mix. */
export function curveUniform(curve: DaylightCurve = DEFAULT_DAYLIGHT, posterise = 0.55): [number, number, number, number] {
  return [DISTANCE_RANGE / curve.falloff, curve.floor, curve.fogFloor, posterise];
}
/** `lampParams` uniform: on, range, cos(outer), cos(inner). */
export function lampUniform(on: boolean, lamp: LampSettings = DEFAULT_LAMP): [number, number, number, number] {
  const rad = Math.PI / 180;
  return [on ? 1 : 0, lamp.range, Math.cos(lamp.outer * rad), Math.cos(lamp.inner * rad)];
}

export const CAVE_LIGHT_SHADER = `
uniform highp sampler3D caveField; uniform vec3 caveFieldMin; uniform vec3 caveFieldSize; uniform float caveActive;
uniform vec4 caveCurve;
// Exact collision occupancy, R8, fetched unfiltered (texelFetch only).
uniform highp sampler3D caveRock; uniform vec3 caveRockMin; uniform float caveRockVoxel; uniform vec3 caveRockDims;
uniform vec3 lampPosition; uniform vec3 lampDirection; uniform vec4 lampParams; uniform vec3 lampColor;
// r: daylight path, g: sun, b: rock, a: inside. Open water outside the field.
vec4 caveAt(vec3 p){
  vec3 uvw=(p-caveFieldMin)/caveFieldSize;
  if(caveActive<.5||any(lessThan(uvw,vec3(0.0)))||any(greaterThan(uvw,vec3(1.0))))return vec4(0.0,1.0,0.0,0.0);
  return texture(caveField,uvw);
}
// A surface reads the water in front of it; a second, farther sample keeps
// the inside's darkness from staining exterior rock round a mouth.
vec4 caveFace(vec3 p,vec3 n){
  vec4 a=caveAt(p+n*.35),b=caveAt(p+n*1.1);
  return vec4(min(a.r,b.r),max(a.g,b.g),a.b,min(a.a,b.a));
}
// Lit-colour multiplier: banded fall from the openings, full in the beam.
float caveDaylight(vec4 c){
  float lit=caveCurve.y+(1.0-caveCurve.y)*exp(-c.r*caveCurve.x);
  float q=max(caveCurve.y,floor(lit*5.0+.35)/5.0);
  lit=mix(lit,q,caveCurve.w);
  float sun=smoothstep(.35,.65,c.g);
  return mix(1.0,max(lit,sun),c.a);
}
float caveMedium(vec4 c){
  return mix(1.0,caveCurve.z+(1.0-caveCurve.z)*exp(-c.r*caveCurve.x*.8),c.a);
}
// 1 when no rock voxel lies on p->lamp past the surface skin; 0 otherwise.
// Walks every voxel the ray crosses (Amanatides-Woo), like lampVisible().
float lampVisible(vec3 p,vec3 lamp){
  if(caveActive<.5)return 1.0;
  vec3 a=(p-caveRockMin)/caveRockVoxel,d=(lamp-caveRockMin)/caveRockVoxel-a;
  float len=length(d)*caveRockVoxel;
  if(len<1e-6)return 1.0;
  float tSkip=${LAMP_SKIN.toFixed(2)}/len,tEnter=0.0;
  vec3 cell=floor(a),stp=sign(d);
  vec3 tDelta=vec3(d.x!=0.0?abs(1.0/d.x):1e30,d.y!=0.0?abs(1.0/d.y):1e30,d.z!=0.0?abs(1.0/d.z):1e30);
  vec3 tMax=vec3(d.x!=0.0?(cell.x+(d.x>0.0?1.0:0.0)-a.x)/d.x:1e30,d.y!=0.0?(cell.y+(d.y>0.0?1.0:0.0)-a.y)/d.y:1e30,
    d.z!=0.0?(cell.z+(d.z>0.0?1.0:0.0)-a.z)/d.z:1e30);
  for(int i=0;i<${LAMP_WALK_STEPS};i++){
    if(tEnter>1.0)return 1.0;
    float tExit=min(tMax.x,min(tMax.y,tMax.z));
    if(tExit>tSkip&&all(greaterThanEqual(cell,vec3(0.0)))&&all(lessThan(cell,caveRockDims))&&
      texelFetch(caveRock,ivec3(cell),0).r>.5)return 0.0;
    if(tMax.x<=tMax.y&&tMax.x<=tMax.z){cell.x+=stp.x;tEnter=tMax.x;tMax.x+=tDelta.x;}
    else if(tMax.y<=tMax.z){cell.y+=stp.y;tEnter=tMax.y;tMax.y+=tDelta.y;}
    else{cell.z+=stp.z;tEnter=tMax.z;tMax.z+=tDelta.z;}
  }
  return 0.0;
}
vec3 caveLamp(vec3 p,vec3 n,vec3 albedo){
  if(lampParams.x<.5)return vec3(0.0);
  vec3 l=lampPosition-p; float dist=length(l);
  if(dist>lampParams.y||dist<.001)return vec3(0.0);
  l/=dist;
  float cone=smoothstep(lampParams.z,lampParams.w,dot(-l,lampDirection));
  if(cone<=0.0)return vec3(0.0);
  float lam=dot(n,l);
  // Cel: three Lambert bands and three range rings, like the sun's bands.
  float band=lam>.55?1.0:(lam>.2?.72:(lam>0.0?.42:0.0));
  float fall=1.0-dist/lampParams.y;
  float ring=fall>.55?1.0:(fall>.25?.66:.36*smoothstep(0.0,.08,fall));
  // A bright core with a soft spill, not a hard disc.
  float edge=mix(.5,1.0,smoothstep(.45,.6,cone))*smoothstep(0.0,.3,cone);
  if(band==0.0)return vec3(0.0);
  return albedo*lampColor*band*ring*edge*lampVisible(p+n*.3,lampPosition);
}
vec3 caveShade(vec3 shade,vec3 n,vec4 c){
  float day=caveDaylight(c);
  // In daylight a lamp is a faint pool; in the dark it is the light.
  return shade*day+caveLamp(vWorld,n,vColor.rgb)*(1.0-.78*day);
}
vec3 caveFog(vec3 shade,vec3 p,vec4 c){
  vec3 fogged=opticalFog(shade,p), medium=opticalFog(vec3(0.0),p);
  vec3 v=p-cameraPosition; float dist=length(v);
  float beam=lampParams.x*smoothstep(lampParams.z,1.0,dot(v/max(dist,.001),lampDirection))*(1.0-exp(-dist*.06))
    *(1.0-caveDaylight(caveAt(cameraPosition)))*.22;
  return fogged-medium+medium*caveMedium(c)+lampColor*beam;
}
`;

/** Each anchor in the production cel fragment and what goes there. */
const ANCHORS: readonly { readonly at: string; readonly mode: "before" | "after" | "replace"; readonly code: string }[] = [
  { at: "void main(){", mode: "before", code: CAVE_LIGHT_SHADER },
  { at: "vec3 n=normalize(vNormal); float d=dot(n,normalize(lightDirection));", mode: "after",
    code: "\n  vec4 cave=caveFace(vWorld,n);" },
  { at: "float sky=smoothstep(.3,.9,n.y)*(1.0-smoothstep(-.8,-.1,vWorld.y))*underwater;", mode: "after",
    code: "\n  sky*=mix(1.0,smoothstep(.35,.65,cave.g),cave.a);" },
  { at: "shade=mix(shade,vColor.rgb*1.12,step(vColor.a,-.5));", mode: "before", code: "shade=caveShade(shade,n,cave);\n  " },
  { at: "gl_FragColor=vec4(opticalFog(shade,vWorld),1.0);", mode: "replace", code: "gl_FragColor=vec4(caveFog(shade,vWorld,cave),1.0);" },
];

/** The production cel fragment with cave light spliced in. Throws if the
 * fragment no longer has exactly one of each anchor. */
export function injectCaveLight(fragment: string): string {
  let out = fragment;
  for (const a of ANCHORS) {
    const first = out.indexOf(a.at);
    if (first < 0 || out.indexOf(a.at, first + 1) >= 0)
      throw new Error(`cave light: cel fragment anchor ${first < 0 ? "missing" : "repeated"}: ${a.at}`);
    out = a.mode === "before" ? out.slice(0, first) + a.code + out.slice(first)
      : a.mode === "after" ? out.slice(0, first + a.at.length) + a.code + out.slice(first + a.at.length)
        : out.slice(0, first) + a.code + out.slice(first + a.at.length);
  }
  return out;
}
export const CAVE_ANCHORS = ANCHORS.map(a => a.at);
