/** S4's wildlife and hazard notes in the notebook, through S8's extension
 * sections (C3). Derived from state only: a later region's notes open once the
 * player has worked any source there. S4 owns every word; this lays it out. */
import { HAZARD_FIELDS, PROTECTION } from "../content/ecology/hazards.js";
import { CUE_SPECIES, THREATS } from "../content/ecology/species.js";
import { REGIONS, SOURCES, type RegionId, type SourceId } from "../content/registry.js";
import { fittedProtections, lampOn } from "../sim/ecologyLink.js";
import type { GameState } from "../sim/types.js";
import type { PanelView, SectionKit } from "./panels.js";

/** Regions whose habitats the player has actually worked (scanned or collected). */
function reached(s: GameState): Set<RegionId> {
  return new Set(s.knowledge.scans.filter((id): id is SourceId => Object.hasOwn(SOURCES, id)).map((id) => SOURCES[id].region));
}
const count = (s: GameState, kind: "glow_lure" | "startle_ink"): number =>
  s.inventory.items.filter((i) => i.kind === kind).reduce((n, i) => n + i.quantity, 0);

export function ecologyNotes(s: GameState, kit: SectionKit): string {
  const regions = reached(s);
  const threats = Object.values(THREATS).filter((t) => regions.has(t.region));
  const cues = Object.values(CUE_SPECIES).filter((c) => regions.has(c.region));
  const fields = Object.values(HAZARD_FIELDS).filter((f) => regions.has(f.region));
  const worn = fittedProtections(s);
  const kits = `<p class="ecology-kit"><b>Lamp</b> · ${lampOn(s) ? "on" : "off (running dark)"} · L · <b>Glow lures</b> ${count(s, "glow_lure")} · T · <b>Startle ink</b> ${
    count(s, "startle_ink")} · Y${worn.length ? ` · <b>Protection</b> ${worn.map((p) => kit.escape(PROTECTION[p].label)).join(", ")}` : ""}</p>`;
  if (!threats.length && !cues.length && !fields.length) return s.inventory.items.some((i) => i.kind === "glow_lure" || i.kind === "startle_ink") ? kits : "";
  const body = [
    ...threats.map((t) => `<p class="ecology-note"><b>${kit.escape(t.label)}</b> · ${kit.escape(REGIONS[t.region].label)} · ${kit.escape(t.scan)}</p>`),
    ...cues.map((c) => `<p class="ecology-note"><b>${kit.escape(c.label)}</b> · ${kit.escape(c.scan)}</p>`),
    ...fields.map((f) => `<p class="ecology-note"><b>${kit.escape(f.label)}</b> · ${kit.escape(f.cue)}</p>`),
  ].join("");
  return kits + kit.group("ecology", "Wildlife and hazards", body, false, { className: "ecology-notes" });
}
export function registerEcologyNotes(panels: PanelView): void {
  panels.addSection("notebook", { id: "ecology-notes", after: "field-notes", render: ecologyNotes });
}
