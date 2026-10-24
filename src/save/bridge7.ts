/** Schema 7 → schema 8 (LS-1 stage 1b). Additive, plus one recorded provenance:
 * - **Systems:** coded doors opened at their keypads (`opened`) start empty. No coded
 *   door exists in any schema 7 build, so the empty list is exact.
 * - **Knowledge:** `legacyGrants` keeps each plan a schema 7 save earned by a rule that
 *   has since moved: a `LEGACY_GRANTS` row is written only when the save holds both the
 *   row's blueprint and its old source (the planter plan and the workshop outpost sheet).
 *   Otherwise it is empty.
 *
 * Everything else is copied as is, and strict schema 8 validation runs on the result.
 * A schema 7 save that already holds a schema 8 field is refused, because no schema 7
 * build could write one. Schema 6 is refused as an older build: DIRECTION supports the
 * immediately previous schema only. */
import type { GameState, LegacyGrant } from "../sim/types.js";
import { LEGACY_GRANTS, legacySourceHeld } from "./legacyGrants.js";
import { record } from "./validation.js";

export type BridgeResult = { ok: true; value: GameState } | { ok: false; error: string };

const ids = (v: unknown): string[] => Array.isArray(v) ? v.flatMap((x) => typeof x === "string" ? [x] : record(x) && typeof x.id === "string" ? [x.id] : []) : [];
/** Fields only schema 8 writes; their presence in a schema 7 save is corruption. */
function schema8Field(s: Record<string, unknown>): string | null {
  if (record(s.systems) && Object.hasOwn(s.systems, "opened")) return "systems.opened";
  if (record(s.knowledge) && Object.hasOwn(s.knowledge, "legacyGrants")) return "knowledge.legacyGrants";
  return null;
}

/** Bridge one schema 7 state (already shape-checked as an object). */
export function bridgeSchema7(input: unknown): BridgeResult {
  if (!record(input)) return { ok: false, error: "This save's state is not an object. Nothing was loaded." };
  const extra = schema8Field(input);
  if (extra) return { ok: false, error: `This schema 7 save holds ${extra}, which only schema 8 writes. Nothing was loaded.` };
  const s = structuredClone(input) as unknown as GameState;
  // New Game's key order, so a bridged save is canonical once written.
  if (record(s.systems)) s.systems = { ...s.systems, opened: [] };
  if (record(s.knowledge)) {
    const k = s.knowledge as unknown as Record<string, unknown>, story = (s as unknown as Record<string, unknown>).story;
    const blueprints = ids(k.blueprints), scans = ids(k.scans);
    const discoveries = [...ids(k.evidence), ...ids(k.journals), ...(record(story) ? ids(story.discoveries) : [])];
    const legacyGrants: LegacyGrant[] = LEGACY_GRANTS
      .filter((r) => blueprints.includes(r.blueprint) && legacySourceHeld(r, scans, discoveries))
      .map((r) => ({ blueprint: r.blueprint, source: { ...r.source } }));
    s.knowledge = { ...s.knowledge, legacyGrants };
  }
  return { ok: true, value: s };
}
