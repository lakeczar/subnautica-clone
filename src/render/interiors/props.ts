/** ENV-1: prop template recipes (Babylon-free, the kit's one RecipeBuilder).
 * Local space: base centred at the origin, +Z the front. Every recipe stays
 * inside its catalogue size (`content/interiors/templates.ts`), which is what
 * collision and the validator use, and reaches at least 95% of it on each axis.
 * Fine and coarse keep the same outline; coarse is the silhouette alone.
 *
 * These are procedural stand-ins on the stage's own seam: once the asset
 * pipeline is settled, an imported mesh can supply a template's buffers
 * without the catalogue or any interior changing. */
import { TEMPLATES, type TemplateId } from "../../content/interiors/templates.js";
import { RecipeBuilder, rgba, type Rgba } from "../kit/recipe.js";
import type { TemplateRecipe } from "../kit/types.js";
import { PALETTE as P } from "../palette.js";

type Draw = (b: Box) => void;
/** A box from its corners, in the template's local space. */
type Box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: Rgba) => void;
const boxer = (r: RecipeBuilder): Box => (x0, y0, z0, x1, y1, z1, color) =>
  r.box([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], [x1 - x0, y1 - y0, z1 - z0], color);

const ink = rgba(P.ink, 1.4), seam = rgba(P.seam, 1.2), metal = rgba(P.metal), steel = rgba(P.steelLight), porcelain = rgba(P.porcelain);
const shade = rgba(P.shade), petrol = rgba(P.petrol), ochre = rgba(P.ochre), orange = rgba(P.orange), shell = rgba(P.shell);
const warm = rgba(P.warm), coral = rgba(P.coral), jade = rgba(P.jade), lime = rgba(P.lime), plum = rgba(P.plum), glass = rgba(P.glass, 1);

/** Four legs inside a footprint, from the floor to `top`. */
const legs = (b: Box, hx: number, hz: number, top: number, t: number, c: Rgba): void => {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b(sx * hx - (sx > 0 ? t : 0), 0, sz * hz - (sz > 0 ? t : 0), sx * hx + (sx < 0 ? t : 0), top, sz * hz + (sz < 0 ? t : 0), c);
};
/** A board on its back face (z from -d/2 to d/2), with a border and a few lines. */
const board = (w: number, h: number, d: number, face: Rgba, lines: number): Draw => (b) => {
  b(-w / 2, 0, -d / 2, w / 2, h, d / 2 - 0.004, face);
  b(-w / 2, 0, d / 2 - 0.004, w / 2, 0.02, d / 2, ink); b(-w / 2, h - 0.02, d / 2 - 0.004, w / 2, h, d / 2, ink);
  for (let i = 1; i <= lines; i++) { const y = (h * i) / (lines + 1); b(-w * 0.4, y, d / 2 - 0.004, w * (0.1 + 0.3 * ((i * 7) % 3) / 2), y + 0.012, d / 2, seam); }
};

const FINE: Record<TemplateId, Draw> = {
  bunk_double: (b) => {
    legs(b, 0.45, 1, 1.8, 0.05, metal);
    for (const y of [0.32, 1.32]) { b(-0.45, y, -1, 0.45, y + 0.06, 1, steel); b(-0.42, y + 0.06, -0.97, 0.42, y + 0.1, 0.97, shade); }
  },
  bunk_single: (b) => { legs(b, 0.45, 1, 0.7, 0.05, metal); b(-0.45, 0.32, -1, 0.45, 0.38, 1, steel); b(-0.4, 0.38, -0.5, 0.4, 0.5, 0.2, plum); },
  locker: (b) => { b(-0.25, 0, -0.25, 0.25, 1.9, 0.23, steel); b(-0.23, 0.05, 0.23, 0.23, 1.85, 0.25, shade); b(0.15, 0.9, 0.24, 0.19, 1.05, 0.25, ink); },
  shelf: (b) => { b(-0.5, 0, -0.15, -0.46, 1.6, 0.15, petrol); b(0.46, 0, -0.15, 0.5, 1.6, 0.15, petrol); for (const y of [0.05, 0.6, 1.05, 1.57]) b(-0.46, y, -0.15, 0.46, y + 0.03, 0.15, steel); },
  crate: (b) => { b(-0.4, 0, -0.3, 0.4, 0.6, 0.3, ochre); for (const x of [-0.25, 0.05, 0.3]) b(x - 0.02, 0.02, 0.299, x + 0.02, 0.58, 0.3, orange); },
  gauge_rack: (b) => {
    for (const x of [-0.6, 0.56]) b(x, 0, -0.2, x + 0.04, 1.8, 0.2, metal);
    for (const y of [0.1, 0.7, 1.3]) { b(-0.56, y, -0.2, 0.56, y + 0.03, 0.2, steel); for (const x of [-0.4, -0.1, 0.2, 0.45]) b(x - 0.07, y + 0.03, -0.12, x + 0.07, y + 0.35, 0.12, porcelain); }
    b(-0.56, 1.77, -0.2, 0.56, 1.8, 0.2, steel);
  },
  tube_rack: (b) => {
    for (const x of [-0.5, 0.46]) b(x, 0, -0.2, x + 0.04, 1, 0.2, metal);
    for (const [y, z] of [[0.15, -0.1], [0.15, 0.1], [0.45, 0], [0.75, -0.1], [0.75, 0.1]] as const) b(-0.46, y, z - 0.07, 0.46, y + 0.14, z + 0.07, shell);
    b(-0.46, 0.96, -0.2, 0.46, 1, 0.2, steel);
  },
  table: (b) => { b(-0.9, 0.7, -0.45, 0.9, 0.75, 0.45, ochre); legs(b, 0.85, 0.4, 0.7, 0.06, petrol); },
  desk: (b) => { b(-0.7, 0.72, -0.35, 0.7, 0.76, 0.35, ochre); b(-0.7, 0, -0.35, -0.66, 0.72, 0.35, petrol); b(0.66, 0, -0.35, 0.7, 0.72, 0.35, petrol); b(0.2, 0.5, -0.33, 0.66, 0.72, 0.33, shell); },
  bench: (b) => { b(-0.8, 0.74, -0.25, 0.8, 0.8, 0.25, steel); legs(b, 0.76, 0.22, 0.74, 0.05, metal); b(-0.76, 0.2, -0.22, 0.76, 0.24, 0.22, metal); },
  chair: (b) => { legs(b, 0.22, 0.22, 0.45, 0.035, metal); b(-0.225, 0.42, -0.225, 0.225, 0.47, 0.225, ochre); b(-0.225, 0.47, -0.225, 0.225, 0.9, -0.19, ochre); },
  deckchair: (b) => {
    for (const x of [-0.3, 0.26]) { b(x, 0, -0.6, x + 0.04, 0.35, 0.6, ochre); b(x, 0.35, -0.6, x + 0.04, 0.9, -0.5, ochre); }
    b(-0.26, 0.3, -0.5, 0.26, 0.34, 0.6, coral); b(-0.26, 0.34, -0.6, 0.26, 0.88, -0.56, coral);
  },
  pump_housing: (b) => { b(-0.6, 0, -0.6, 0.6, 0.95, 0.6, metal); b(-0.5, 0.95, -0.5, 0.5, 1.1, 0.5, steel); b(-0.15, 1.1, -0.15, 0.15, 1.2, 0.15, petrol); b(-0.6, 0.4, -0.6, 0.6, 0.46, 0.6, ink); },
  log_cabinet: (b) => { b(-0.3, 0, -0.2, 0.3, 1.2, 0.19, porcelain); b(-0.27, 0.1, 0.19, 0.27, 1.1, 0.2, shade); b(-0.04, 0.7, 0.195, 0.04, 0.85, 0.2, orange); },
  bundle: (b) => { b(-0.35, 0, -0.25, 0.35, 0.45, 0.25, shell); for (const x of [-0.18, 0.18]) b(x - 0.025, 0, -0.25, x + 0.025, 0.45, 0.25, petrol); b(0.08, 0.2, 0.245, 0.2, 0.3, 0.25, porcelain); },
  instrument: (b) => { b(-0.15, 0, -0.3, 0.15, 0.1, 0.1, orange); b(-0.03, 0.02, 0.1, 0.03, 0.06, 0.3, ink); b(-0.08, 0.1 - 0.004, -0.15, 0.08, 0.1, -0.05, ink); },
  scarf: (b) => { b(-0.15, 0, -0.15, 0.15, 0.05, -0.05, coral); b(-0.05, 0, -0.05, 0.05, 0.04, 0.15, coral); },
  oilskins: (b) => { b(-0.3, 0.3, -0.025, 0.3, 1.1, 0.025, ochre); b(-0.12, 0, -0.025, 0.12, 0.3, 0.025, ochre); b(-0.04, 1.02, -0.025, 0.04, 1.1, 0.025, ink); },
  sun_hat: (b) => { b(-0.17, 0, -0.17, 0.17, 0.02, 0.17, warm); b(-0.09, 0.02, -0.09, 0.09, 0.12, 0.09, warm); b(-0.091, 0.03, -0.091, 0.091, 0.05, 0.091, coral); },
  paperback: (b) => { b(-0.065, 0, -0.1, 0.065, 0.03, 0.1, coral); b(-0.06, 0.03 - 0.004, -0.09, 0.06, 0.03, 0.09, shell); },
  mug: (b) => { b(-0.04, 0, -0.04, 0.04, 0.11, 0.04, porcelain); b(0.04, 0.03, -0.01, 0.05, 0.08, 0.01, porcelain); b(-0.05, 0.09, -0.05, 0.04, 0.1, 0.05, petrol); },
  kettle: (b) => { b(-0.09, 0, -0.09, 0.09, 0.16, 0.09, metal); b(-0.06, 0.16, -0.06, 0.06, 0.2, 0.06, metal); b(-0.02, 0.2, -0.07, 0.02, 0.24, 0.07, ink); b(0.09, 0.06, -0.015, 0.11, 0.12, 0.015, metal); b(-0.11, 0.08, -0.015, -0.09, 0.16, 0.015, ink); },
  jar: (b) => { b(-0.06, 0, -0.06, 0.06, 0.17, 0.06, glass); b(-0.05, 0.17, -0.05, 0.05, 0.2, 0.05, ochre); },
  lunch_tin: (b) => { b(-0.14, 0, -0.09, 0.14, 0.1, 0.09, jade); b(-0.14, 0.1, -0.09, 0.14, 0.12, 0.09, petrol); },
  paperweight: (b) => { b(-0.045, 0, -0.045, 0.045, 0.05, 0.045, rgba(P.coralRim)); },
  valve_wheel: (b) => { b(-0.16, 0, -0.03, 0.16, 0.03, 0.03, orange); b(-0.16, 0.29, -0.03, 0.16, 0.32, 0.03, orange); b(-0.16, 0, -0.03, -0.13, 0.32, 0.03, orange); b(0.13, 0, -0.03, 0.16, 0.32, 0.03, orange); b(-0.02, 0, -0.03, 0.02, 0.32, 0.03, ink); },
  duty_board: board(0.9, 0.6, 0.03, porcelain, 5),
  chart: board(1.0, 0.7, 0.02, rgba(P.sand), 3),
  sign: board(1.2, 0.4, 0.03, rgba(P.mint), 1),
  note: board(0.2, 0.25, 0.01, warm, 4),
  game_board: (b) => {
    for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) b(-0.25 + i * 0.125, 0, -0.25 + k * 0.125, -0.125 + i * 0.125, 0.02, -0.125 + k * 0.125, (i + k) % 2 ? porcelain : petrol);
    for (const [x, z] of [[-0.18, -0.06], [0.07, 0.18], [0.18, -0.18]] as const) b(x - 0.025, 0.02, z - 0.025, x + 0.025, 0.03, z + 0.025, coral);
  },
  tally_wall: (b) => {
    b(-0.05, 0, -0.005, 0.05, 1.4, 0.005, porcelain);
    for (let i = 0; i < 9; i++) { const y = 0.1 + i * 0.15, w = 0.3 + 0.08 * i; b(-0.8, y, -0.005, -0.8 + w, y + 0.02, 0.005, i % 3 ? jade : ochre); }
    b(0.4, 0.2, -0.005, 0.8, 0.25, 0.005, seam); b(0.4, 1.3, -0.005, 0.8, 1.35, 0.005, seam);
  },
  picture_mark: (b) => { b(-0.2, 0, -0.005, 0.2, 0.3, 0.005, rgba(P.crown)); b(-0.01, 0.27, -0.005, 0.01, 0.3, 0.005, ink); },
  lashing: (b) => { for (const [y, t] of [[0.1, 0.06], [0.45, 0.05], [0.8, 0.06]] as const) b(-0.8, y, -0.02, 0.8, y + t, 0.02, ochre); b(-0.05, 0, -0.02, 0.05, 0.9, 0.02, ochre); },
  silt_fan: (b) => { b(-1.5, 0, -1.2, 1.5, 0.01, 1.2, rgba(P.shore)); b(-1, 0.01, -0.8, 1.2, 0.02, 0.9, rgba(P.sand)); b(-0.4, 0.02, -0.3, 0.7, 0.03, 0.5, rgba(P.shore)); },
  scraper_rack: (b) => { b(-0.5, 0.7, -0.025, 0.5, 0.8, 0.025, petrol); for (const x of [-0.35, -0.12, 0.1, 0.33]) { b(x - 0.015, 0.05, -0.02, x + 0.015, 0.7, 0.02, metal); b(x - 0.07, 0, -0.025, x + 0.07, 0.05, 0.025, steel); } },
  fan_growth: (b) => {
    for (const [x, z, h, s] of [[-0.35, -0.3, 1.4, 0.5], [0.3, 0.25, 1.1, 0.6], [0.05, -0.45, 0.8, 0.5], [-0.25, 0.4, 0.9, 0.4]] as const) {
      b(x - 0.03, 0, z - 0.03, x + 0.03, h * 0.6, z + 0.03, rgba(P.amber, 1.2));
      b(Math.max(-0.6, x - s / 2), h * 0.4, z - 0.02, Math.min(0.6, x + s / 2), h, z + 0.02, (x > 0 ? coral : lime));
    }
    b(-0.6, 0.3, -0.6, -0.56, 0.6, 0.6, jade); b(0.56, 0.2, -0.6, 0.6, 0.5, 0.6, jade);
  },
};

/** The silhouette: the template's whole box. */
const coarse = (id: TemplateId): Draw => (b) => {
  const [x, y, z] = TEMPLATES[id].size;
  b(-x / 2, 0, -z / 2, x / 2, y, z / 2, id === "fan_growth" ? jade : shade);
};

/** A template's fine and coarse recipe. Built on demand and not kept here:
 * stage 2 hands them to the kit's `TemplateLibrary`, which owns them. */
export function propRecipe(id: TemplateId): TemplateRecipe {
  const fine = new RecipeBuilder(), rough = new RecipeBuilder();
  FINE[id](boxer(fine));
  coarse(id)(boxer(rough));
  return { id: `interior.${id}`, fine: fine.build(`interior.${id}.fine`), coarse: rough.build(`interior.${id}.coarse`) };
}
