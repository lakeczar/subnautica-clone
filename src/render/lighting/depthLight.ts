import type { RegionId } from "../../content/registry.js";
import { regionAtPoint } from "../../content/regions/layout.js";

/** Depth light (ATM-1, Babylon-free): how much daylight reaches a point at a
 * given depth, the colour it has there, and the water the camera looks
 * through. The cel shader evaluates the same curve per fragment
 * (`DEPTH_LIGHT_SHADER` is generated from these tables), and
 * `updateOpticalUniforms` uses the fog side for the camera.
 *
 * - The shallows keep their look: full light down to 20 m.
 * - Below that, lit colour falls steeply; past about 250 m surfaces are
 *   near-black outside the lamp cone and local lights.
 * - Each region tints what light is left and scales it a little (silt
 *   scatters, brine is clear), so the palettes still read in the dark.
 * - The water itself darkens more slowly than surfaces, so near rock reads
 *   as a silhouette against the murk, and looking up always shows a faint
 *   glow toward the surface: the honest way up. */

/** Lit-colour multiplier against depth, metres. Log-linear between knots. */
export const AMBIENT_KNOTS: readonly (readonly [number, number])[] = [
  [0, 1], [20, 1], [60, 0.86], [110, 0.6], [160, 0.36], [200, 0.21], [250, 0.1], [300, 0.05],
  [400, 0.028], [600, 0.018], [1000, 0.014],
];

/** Daylight left at `depth` metres (0..1), before regional gain. */
export function ambientAt(depth: number): number {
  const k = AMBIENT_KNOTS;
  if (!(depth > k[0]![0])) return k[0]![1];
  for (let i = 1; i < k.length; i++) {
    const [d1, l1] = k[i]!;
    if (depth < d1) {
      const [d0, l0] = k[i - 1]!;
      return Math.exp(Math.log(l0) + (Math.log(l1) - Math.log(l0)) * (depth - d0) / (d1 - d0));
    }
  }
  return k[k.length - 1]![1];
}

export const smoothstep = (low: number, high: number, value: number): number => {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
};

/** One region's light below the shallows. */
export interface RegionLight {
  /** Colour the remaining daylight takes at depth (multiplies lit surfaces). */
  readonly tint: string;
  /** Scales the ambient curve below the shallows: silt scatters (> 1), clear brine (< 1). */
  readonly gain: number;
  /** Water seen straight up from depth: the surface glow. */
  readonly up: string;
  /** Water seen straight down. */
  readonly down: string;
  /** 0: the abyss below darkens with depth. 1: it glows on its own (Rift heat). */
  readonly downGlow: number;
}

export const REGION_LIGHT: Readonly<Record<RegionId, RegionLight>> = {
  refuge_reef: { tint: "#f2fbff", gain: 1, up: "#4aa8b4", down: "#0a2a36", downGlow: 0 },
  island_chain: { tint: "#f2fbff", gain: 1, up: "#4aa8b4", down: "#0a2a36", downGlow: 0 },
  // Canopy teal: crowns and ribs keep a cold green-teal cast.
  suspended_garden: { tint: "#a8e6dc", gain: 1, up: "#3d9ea2", down: "#06252e", downGlow: 0 },
  // Basin silt-green: suspended grains scatter light, so it stays brighter and green.
  silt_basin: { tint: "#c9e0ae", gain: 1.45, up: "#6f9a82", down: "#1b3330", downGlow: 0 },
  // Rift bone: pale, warm-neutral rock; the trench below glows ember.
  thermal_rift: { tint: "#f3dcc0", gain: 1, up: "#4a6470", down: "#9a3c12", downGlow: 1 },
  // Divide slate: cold blue-grey, clear and dark.
  brine_divide: { tint: "#aec0e4", gain: 0.85, up: "#2c5684", down: "#04081a", downGlow: 0 },
  // Meridian: nearly black water; the district's lamps carry it.
  deep_district: { tint: "#a3b6e8", gain: 0.75, up: "#24477a", down: "#02050e", downGlow: 0 },
};

export type Rgb = readonly [number, number, number];
export const rgb = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255,
];
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale = (a: Rgb, k: number): Rgb => [a[0] * k, a[1] * k, a[2] * k];

/** Region light blended over a 64 m disc round the camera: footprint samples
 * on a sunflower spiral (no two share a row or column, so a straight border
 * passes them one at a time), so crossing a border never pops. */
export interface BlendedLight { readonly tint: Rgb; readonly gain: number; readonly up: Rgb; readonly down: Rgb; readonly downGlow: number }
export const REGION_BLEND = 64;
const BLEND_SAMPLES: readonly (readonly [number, number])[] = Array.from({ length: 24 }, (_, i) => {
  const r = REGION_BLEND * Math.sqrt((i + 0.5) / 24), a = i * 2.399963229728653;
  return [Math.cos(a) * r, Math.sin(a) * r] as const;
});
export function regionLightAt(x: number, z: number): BlendedLight {
  const n = BLEND_SAMPLES.length;
  const add = (a: Rgb, hex: string): Rgb => { const c = rgb(hex); return [a[0] + c[0] / n, a[1] + c[1] / n, a[2] + c[2] / n]; };
  let tint: Rgb = [0, 0, 0], up: Rgb = [0, 0, 0], down: Rgb = [0, 0, 0], gain = 0, downGlow = 0;
  for (const [dx, dz] of BLEND_SAMPLES) {
    const r = REGION_LIGHT[regionAtPoint(x + dx, z + dz) ?? "refuge_reef"];
    tint = add(tint, r.tint); up = add(up, r.up); down = add(down, r.down);
    gain += r.gain / n; downGlow += r.downGlow / n;
  }
  return { tint, gain, up, down, downGlow };
}

/** Lit-colour multiplier for a surface `depth` metres down under `light`
 * (the shader's `depthLightAt`). */
export function depthLightAt(depth: number, light: Pick<BlendedLight, "tint" | "gain">): Rgb {
  const gain = 1 + (light.gain - 1) * smoothstep(20, 80, depth);
  return scale(mix([1, 1, 1], light.tint, smoothstep(30, 200, depth)), Math.min(1, ambientAt(depth) * gain));
}

/** The water medium dims more slowly than lit surfaces (its light is
 * scattered from everywhere above), so near rock reads darker than the murk. */
export const FOG_LIGHT_POWER = 0.55;
export function fogLightAt(depth: number, gain = 1): number {
  return Math.min(1, ambientAt(depth) * (1 + (gain - 1) * smoothstep(20, 80, depth))) ** FOG_LIGHT_POWER;
}
/** Fog tightens with depth: density multiplier. */
export function fogDensityScale(depth: number): number {
  return 1 + 0.8 * smoothstep(150, 450, depth);
}
/** Overhead glow: dims slower still and never reaches black. */
export const UP_LIGHT_POWER = 0.3;
export function upLightAt(depth: number): number { return ambientAt(depth) ** UP_LIGHT_POWER; }

/** Everything the camera's water needs at one position, given the water
 * colour and density the region optics already chose there. */
export interface WaterLight {
  readonly fog: Rgb;
  readonly density: number;
  /** rgb + weight (0 = no gradient). */
  readonly up: readonly [number, number, number, number];
  readonly down: readonly [number, number, number, number];
  /** Shader `depthLight`: tint rgb + gain. */
  readonly surface: readonly [number, number, number, number];
  /** Camera-depth ambient, 0..1 (halo and lamp weighting). */
  readonly ambient: number;
  /** God-ray strength near the surface, 0..1. */
  readonly rays: number;
}
export function waterLightAt(x: number, y: number, z: number, water: Rgb, density: number): WaterLight {
  const depth = Math.max(0, -y), light = regionLightAt(x, z);
  const fog = scale(water, fogLightAt(depth, light.gain));
  const upWeight = smoothstep(25, 120, depth), downWeight = smoothstep(40, 200, depth);
  const up = scale(light.up, upLightAt(depth));
  // A glowing floor (Rift) keeps its own light; a dark abyss darkens with the water.
  const down = mix(scale(light.down, fogLightAt(depth, light.gain)), light.down, light.downGlow);
  return {
    fog, density: density * fogDensityScale(depth),
    up: [up[0], up[1], up[2], upWeight], down: [down[0], down[1], down[2], downWeight],
    surface: [light.tint[0], light.tint[1], light.tint[2], light.gain],
    ambient: Math.min(1, ambientAt(depth) * (1 + (light.gain - 1) * smoothstep(20, 80, depth))),
    rays: y < 0 ? 1 - smoothstep(12, 45, depth) : 0,
  };
}

const f = (n: number): string => (Number.isInteger(n) ? n.toFixed(1) : String(n));
/** GLSL `ambientAt`, generated from `AMBIENT_KNOTS` so CPU and GPU agree. */
export function ambientGlsl(knots = AMBIENT_KNOTS): string {
  const lines = [`float ambientAt(float depth){`, `  if(depth<=${f(knots[0]![0])})return ${f(knots[0]![1])};`];
  for (let i = 1; i < knots.length; i++) {
    const [d0, l0] = knots[i - 1]!, [d1, l1] = knots[i]!;
    lines.push(`  if(depth<${f(d1)})return exp(mix(${Math.log(l0).toFixed(6)},${Math.log(l1).toFixed(6)},(depth-${f(d0)})/${f(d1 - d0)}));`);
  }
  lines.push(`  return ${f(knots[knots.length - 1]![1])};`, `}`);
  return lines.join("\n");
}

/** Uniforms the depth light adds to the cel material (the fog gradient,
 * `fogUp`/`fogDown`, is part of the shared optical set). Unset (all zero)
 * they change nothing, so materials that never receive them (labs, viewers)
 * keep the old look. */
export const DEPTH_UNIFORMS = ["depthLight", "godRays"] as const;

/** Declarations and functions; include after `opticalShader`. */
export const DEPTH_LIGHT_SHADER = `
uniform vec4 depthLight; uniform float godRays;
${ambientGlsl()}
// Lit-colour multiplier at a world point (rgb), mirrored by depthLightAt().
vec3 depthLightAt(vec3 p){
  float depth=max(0.0,-p.y);
  float gain=depthLight.a>0.0?depthLight.a:1.0; vec3 tint=depthLight.a>0.0?depthLight.rgb:vec3(1.0);
  gain=1.0+(gain-1.0)*smoothstep(20.0,80.0,depth);
  return mix(vec3(1.0),tint,smoothstep(30.0,200.0,depth))*min(1.0,ambientAt(depth)*gain);
}
// Scalar daylight at p (lamp and local-light weighting).
float daylightAt(vec3 p){
  float depth=max(0.0,-p.y), gain=depthLight.a>0.0?depthLight.a:1.0;
  return min(1.0,ambientAt(depth)*(1.0+(gain-1.0)*smoothstep(20.0,80.0,depth)));
}
`;

/** The water's colour seen along a ray direction: darker below, a faint
 * glow toward the surface above. Part of the shared optical shader. */
export const WATER_MEDIUM_SHADER = `
uniform vec4 fogUp; uniform vec4 fogDown;
vec3 waterMedium(vec3 dir){
  vec3 m=mix(waterFogColor,fogDown.rgb,fogDown.a*smoothstep(0.0,.7,-dir.y));
  float up=smoothstep(0.0,1.0,dir.y);
  return mix(m,fogUp.rgb,fogUp.a*up*up);
}
`;

/** Gentle god rays in the shallows: sun shafts as in-scatter along the view
 * ray, from a drifting pattern on the surface projected down the refracted
 * sun direction. Needs vnoise (NOISE_SHADER), time and godRays. */
export const GOD_RAYS_SHADER = `
vec3 godRayLight(vec3 p){
  if(godRays<=0.0||cameraPosition.y>=0.0)return vec3(0.0);
  vec3 ray=p-cameraPosition; float len=min(length(ray),48.0); vec3 d=normalize(ray);
  vec3 sun=normalize(vec3(-.3,.9,-.42));
  float sum=0.0;
  for(int i=0;i<5;i++){
    vec3 q=cameraPosition+d*(len*(float(i)+.5)/5.0);
    if(q.y>=0.0)continue;
    vec2 s=q.xz+sun.xz*(-q.y/sun.y);
    float shaft=smoothstep(.6,.85,vnoise(s*.22+vec2(time*.11,time*.07)))*smoothstep(.35,.7,vnoise(s*.031-vec2(time*.012)));
    sum+=shaft*exp(q.y*.045);
  }
  return vec3(.5,.72,.7)*(sum/5.0)*godRays*(1.0-exp(-len*.06))*.55;
}
`;
