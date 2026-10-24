/** ENV-1: the prop template catalogue. Each template's size (X × Y × Z, base
 * centred at the origin, metres) and collision class; the recipes that draw them
 * live in `render/interiors/props.ts` and must fill exactly this size.
 *
 * Collision classes:
 * - `box`: collides as its box (stage 2 replaces boxes with shapes from the art);
 * - `small`: every side under `SMALL_PROP`, never collides;
 * - `flat`: one side at most `FLAT_PROP` (boards, decals, rope on a door), never collides;
 * - `soft`: living growth, which the diver brushes through as in open water;
 * - `visual`: anything else that doesn't collide; the validator proves no
 *   reachable diver pose passes through it.
 *
 * A source is a procedural recipe today. An imported mesh later only changes
 * where the recipe's buffers come from, not this row. */
export type CollisionClass = "box" | "small" | "flat" | "soft" | "visual";
export interface TemplateSpec {
  readonly size: readonly [number, number, number];
  readonly collision: CollisionClass;
  /** Somebody's belongings: never heaped (see the validator). */
  readonly belonging?: true;
  /** Carries emissive art: it must sit at one of the interior's declared lights. */
  readonly emissive?: true;
}
export const SMALL_PROP = 0.35;
export const FLAT_PROP = 0.05;

const t = (x: number, y: number, z: number, collision: CollisionClass, extra: Omit<TemplateSpec, "size" | "collision"> = {}): TemplateSpec =>
  ({ size: [x, y, z], collision, ...extra });

export const TEMPLATES = {
  // Sleeping and storage.
  bunk_double: t(0.9, 1.8, 2.0, "box"),
  bunk_single: t(0.9, 0.7, 2.0, "box"),
  locker: t(0.5, 1.9, 0.5, "box"),
  shelf: t(1.0, 1.6, 0.3, "box"),
  crate: t(0.8, 0.6, 0.6, "box"),
  gauge_rack: t(1.2, 1.8, 0.4, "box"),
  tube_rack: t(1.0, 1.0, 0.4, "box"),
  // Tables and seats.
  table: t(1.8, 0.75, 0.9, "box"),
  desk: t(1.4, 0.76, 0.7, "box"),
  bench: t(1.6, 0.8, 0.5, "box"),
  chair: t(0.45, 0.9, 0.45, "box"),
  deckchair: t(0.6, 0.9, 1.2, "box"),
  // Machinery.
  pump_housing: t(1.2, 1.2, 1.2, "box"),
  log_cabinet: t(0.6, 1.2, 0.4, "box"),
  // Belongings.
  bundle: t(0.7, 0.45, 0.5, "box", { belonging: true }),
  instrument: t(0.3, 0.1, 0.6, "box", { belonging: true }),
  scarf: t(0.3, 0.05, 0.3, "small", { belonging: true }),
  oilskins: t(0.6, 1.1, 0.05, "flat", { belonging: true }),
  sun_hat: t(0.34, 0.12, 0.34, "small", { belonging: true }),
  paperback: t(0.13, 0.03, 0.2, "small", { belonging: true }),
  // Small things.
  mug: t(0.1, 0.11, 0.1, "small"),
  kettle: t(0.22, 0.24, 0.18, "small"),
  jar: t(0.12, 0.2, 0.12, "small"),
  lunch_tin: t(0.28, 0.12, 0.18, "small"),
  paperweight: t(0.09, 0.05, 0.09, "small"),
  valve_wheel: t(0.32, 0.32, 0.06, "small"),
  // Boards, signs and decals.
  duty_board: t(0.9, 0.6, 0.03, "flat"),
  chart: t(1.0, 0.7, 0.02, "flat"),
  sign: t(1.2, 0.4, 0.03, "flat"),
  note: t(0.2, 0.25, 0.01, "flat"),
  game_board: t(0.5, 0.03, 0.5, "flat"),
  tally_wall: t(1.6, 1.4, 0.01, "flat"),
  picture_mark: t(0.4, 0.3, 0.01, "flat"),
  lashing: t(1.6, 0.9, 0.04, "flat"),
  silt_fan: t(3.0, 0.03, 2.4, "flat"),
  scraper_rack: t(1.0, 0.8, 0.05, "flat"),
  // Living growth.
  fan_growth: t(1.2, 1.4, 1.2, "soft"),
} as const satisfies Record<string, TemplateSpec>;
export type TemplateId = keyof typeof TEMPLATES;
export const isTemplate = (id: string): id is TemplateId => Object.hasOwn(TEMPLATES, id);
