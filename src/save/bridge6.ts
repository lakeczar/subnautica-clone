/** Schema 6 → schema 7 (SIG-1). Additive only; no saved meaning changed:
 * - **Per craft:** the signature tools' runtime (`sonar`, `tag`, `drone`, `lift`,
 *   `tow`) starts at New Game's value. Schema 6's `grapple` and `pod` were always
 *   null, and stay so.
 * - **Systems:** the host-module upgrade record (`moduleUpgrades`) starts empty.
 *
 * Everything else is copied as is, and strict schema 7 validation runs on the
 * result. A schema 6 save that already holds any schema 7 field is refused,
 * because no schema 6 build could write one. Schema 5 is refused as an older
 * build: DIRECTION supports the immediately previous schema only. */
import { initialRuntime } from "../sim/upgrades/tools.js";
import type { GameState } from "../sim/types.js";
import { record } from "./validation.js";

export type BridgeResult = { ok: true; value: GameState } | { ok: false; error: string };

const SCHEMA7_RUNTIME = ["sonar", "tag", "drone", "lift", "tow"] as const;
/** Fields only schema 7 writes; their presence in a schema 6 save is corruption. */
function schema7Field(s: Record<string, unknown>): string | null {
  if (record(s.systems) && Object.hasOwn(s.systems, "moduleUpgrades")) return "systems.moduleUpgrades";
  const fleet = s.fleet;
  if (record(fleet) && Array.isArray(fleet.vehicles))
    for (const v of fleet.vehicles)
      if (record(v) && record(v.upgrades) && SCHEMA7_RUNTIME.some((k) => Object.hasOwn(v.upgrades as object, k))) return "signature tool runtime";
  return null;
}

/** Bridge one schema 6 state (already shape-checked as an object). */
export function bridgeSchema6(input: unknown): BridgeResult {
  if (!record(input)) return { ok: false, error: "This save's state is not an object. Nothing was loaded." };
  const extra = schema7Field(input);
  if (extra) return { ok: false, error: `This schema 6 save holds ${extra}, which only schema 7 writes. Nothing was loaded.` };
  const s = structuredClone(input) as unknown as GameState;
  // New Game's key order, so a bridged save is canonical once written.
  if (record(s.systems)) s.systems = { ...s.systems, moduleUpgrades: {} };
  if (record(s.fleet) && Array.isArray(s.fleet.vehicles)) {
    const fresh = initialRuntime();
    for (const v of s.fleet.vehicles)
      if (record(v) && record(v.upgrades))
        v.upgrades = { ...v.upgrades, ...Object.fromEntries(SCHEMA7_RUNTIME.map((k) => [k, fresh[k]])) } as typeof v.upgrades;
  }
  return { ok: true, value: s };
}
