import assert from "node:assert/strict";
import { createHash } from "node:crypto";

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

/** Compact exact identity of a vertex/index array: element type, length and a
 * hash of its bytes. Assert on this instead of copying or stringifying whole
 * buffers, so fixtures stay small and failures print one line. */
export function digest(data: ArrayLike<number> | null | undefined): string {
  if (!data) return "none";
  const view = ArrayBuffer.isView(data) ? data : Float64Array.from(data);
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  return `${data.constructor.name}[${data.length}]:${createHash("sha256").update(bytes).digest("hex").slice(0, 24)}`;
}
