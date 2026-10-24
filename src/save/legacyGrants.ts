/** LS-1 (schema 8): plans earned under an older rule. When a plan's source moves (the
 * planter plan left the workshop sheet for the keeper's racks), a save that earned it
 * the old way keeps it, with the provenance that earned it, in
 * `knowledge.legacyGrants`. One table and one validator (coordinator, 2026-10-24): each
 * row names its blueprint and its source, a scan (`knowledge.scans`) or a story
 * discovery (`storyView(s).discoveries`). Validation accepts an entry only when its row
 * exists here and its source is held, and only its blueprint joins the expected plans.
 * The field and this table are permanent: retiring a converter never revokes what it
 * converted. A row lands together with the schema step that writes it. */
import type { BlueprintId } from "../content/registry.js";
import type { LegacyGrant } from "../sim/types.js";

export interface LegacyGrantRow extends LegacyGrant { readonly reason: string }
export const LEGACY_GRANTS: readonly LegacyGrantRow[] = [
  { blueprint: "bp_cultivation" as BlueprintId, source: { kind: "scan", id: "workshop_outpost_sheet" },
    reason: "LS-1 1b (schema 7 → 8): the planter plan moved from the workshop's outpost sheet to the keeper's racks." },
];
/** The table row an entry claims, if it is one. */
export const legacyRow = (g: LegacyGrant, rows: readonly LegacyGrantRow[] = LEGACY_GRANTS): LegacyGrantRow | null =>
  rows.find((r) => r.blueprint === g.blueprint && r.source.kind === g.source.kind && r.source.id === g.source.id) ?? null;
/** Whether the save holds an entry's source: the scan, or the story discovery. */
export const legacySourceHeld = (g: LegacyGrant, scans: readonly string[], discoveries: readonly string[]): boolean =>
  g.source.kind === "scan" ? scans.includes(g.source.id) : discoveries.includes(g.source.id);
