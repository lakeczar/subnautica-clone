import assert from "node:assert/strict";

/** Identity check for live Babylon objects. node:assert formats a failing
 * equal/strictEqual by deep-inspecting both operands with getters enabled; a
 * mesh, material or scene graph is cyclic and scene-sized, so one failure can
 * consume unbounded CPU and memory. This reports names only. */
export function same(actual: unknown, expected: unknown, message = "same live object"): void {
  const name = (v: unknown): string => v === null ? "null" : v === undefined ? "undefined"
    : typeof v === "object" ? `${(v as { constructor?: { name?: string } }).constructor?.name ?? "Object"}(${String((v as { name?: unknown }).name ?? "")})`
    : String(v);
  assert.ok(actual === expected, `${message}: ${name(actual)} !== ${name(expected)}`);
}
