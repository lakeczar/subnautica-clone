/** Stable saved identifiers. Labels and render mesh names are never saved references.
 * Seeded from WORLD_PROGRESSION / EXPEDITION_INTEGRATION, not a recipe balance. */
export const CONTENT_VERSION = 'foundation.1' as const;

export const REGIONS = {
  refuge_reef: { label: 'Hearth Reef', depth: [0, 65] },
  island_chain: { label: 'Splitspine Isles', depth: [-95, 90] },
  suspended_garden: { label: 'Lantern Canopy', depth: [55, 220] },
  silt_basin: { label: 'Pale Basin', depth: [150, 380] },
  thermal_rift: { label: 'Ember Rift', depth: [250, 540] },
  brine_divide: { label: 'Mirror Divide', depth: [360, 650] },
  deep_district: { label: 'Meridian District', depth: [520, 780] },
} as const;
export type RegionId = keyof typeof REGIONS;

export const MATERIALS = {
  structural_alloy: { label: 'Structural alloy', sources: ['silt_basin', 'refuge_reef', 'island_chain'] },
  silica_glass: { label: 'Silica glass', sources: ['island_chain', 'refuge_reef'] },
  flex_membrane: { label: 'Flexible membrane', sources: ['refuge_reef', 'suspended_garden'] },
  conductive_crust: { label: 'Conductive crust', sources: ['suspended_garden', 'silt_basin'] },
  buoyant_resin: { label: 'Buoyant resin', sources: ['suspended_garden', 'island_chain'] },
  pressure_ceramic: { label: 'Pressure ceramic', sources: ['thermal_rift'] },
  thermal_core: { label: 'Thermal core', sources: ['thermal_rift'] },
  brine_lattice: { label: 'Brine lattice', sources: ['brine_divide'] },
} as const satisfies Record<string, { label: string; sources: readonly RegionId[] }>;
export type MaterialId = keyof typeof MATERIALS;

export const HULLS = {
  dart: { label: 'Dart', role: 'scout', berth: 'compact', initialDepth: 180, maximumDepth: 350 },
  creel: { label: 'Creel', role: 'cargo / service', berth: 'medium', initialDepth: 240, maximumDepth: 800 },
  hush: { label: 'Hush', role: 'quiet survey', berth: 'compact', initialDepth: 220, maximumDepth: 450 },
  spindle: { label: 'Spindle', role: 'surface tender', berth: 'compact', initialDepth: 0, maximumDepth: 0 },
  mantle: { label: 'Mantle', role: 'deep service', berth: 'medium', initialDepth: 800, maximumDepth: 800 },
  hearthline: { label: 'Hearthline', role: 'inhabited carrier', berth: null, initialDepth: 400, maximumDepth: 550 },
} as const;
export type HullId = keyof typeof HULLS;
export const REMOTE_TOOLS = { bobbin: { label: 'Bobbin', role: 'tethered recovery service' } } as const;

// Only the bounded foundation is active. The seed roster above does not spawn content.
export const PLACES = {
  home_pod: { label: 'Home pod', region: 'refuge_reef', position: { x: 0, y: 0.18, z: 14 } },
  reef_ribs: { label: 'Reef ribs', region: 'refuge_reef', position: { x: -17, y: -5, z: -8 } },
  splitspine_shore: { label: 'Splitspine shore', region: 'island_chain', position: { x: 10, y: 0, z: -31 } },
} as const satisfies Record<string, { label: string; region: RegionId; position: { x: number; y: number; z: number } }>;
export type PlaceId = keyof typeof PLACES;

/** Production art metadata. All generators are original; the art study is provenance,
 * not a dependency or its coordinate system (it used a different water height). */
export const ASSETS = {
  pod: { role: 'refuge exterior including deck / ramp', dimensions: [7.9, 7.2, 18.2], pivot: 'world / keel', materialSlots: ['porcelain', 'petrol', 'ochre', 'glass', 'warm'], region: 'refuge_reef', source: 'src/render/landmarks.ts; adapted design language from original study 20711d1' },
  ribs: { role: 'orientation / solid swim-through', dimensions: [24, 11, 6], pivot: 'world / seabed', materialSlots: ['basalt', 'mineral'], region: 'refuge_reef', source: 'src/render/landmarks.ts; original authored arcs inspired by study 20711d1' },
  island: { role: 'walkable terrain / split landmark', dimensions: [57, 30, 60], pivot: 'world / waterline', materialSlots: ['sand', 'basalt', 'lichen'], region: 'island_chain', source: 'src/render/environment.ts; production analytic height field' },
  ribbons: { role: 'decorative current-facing reef colonies', dimensions: [3, 3, 3], pivot: 'colony base', materialSlots: ['jade', 'coral', 'amber'], region: 'refuge_reef', source: 'src/render/ecology.ts; original ridged ribbon generators inspired by study 20711d1' },
} as const;
