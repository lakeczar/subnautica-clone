/** Milestone saves through the game's own repository: commit the live state to an
 * in-memory local slot, open a fresh repository on that storage as a new page
 * would, and require the reloaded state to hash exactly like the live one. Play
 * then continues from the reloaded state, so every later phase runs on a save. */
import { createHash } from "node:crypto";
import { createEnvelope, encodeSave } from "../../src/save/codec.js";
import { SaveRepository } from "../../src/save/repository.js";
import type { StoragePort } from "../../src/save/repository.js";
import type { WriterLockPort } from "../../src/save/writer-lock.js";
import { validState } from "../../src/save/validation.js";
import type { GameState } from "../../src/sim/types.js";
import { Blocked, Driver } from "./driver.js";

export class MemoryStorage implements StoragePort {
  private readonly data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}
const LOCK: WriterLockPort = { runExclusive: async (_name, _signal, action) => action() };

/** Key-sorted canonical JSON, so the hash ignores nothing but key order. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(value);
}
export const stateHash = (s: GameState): string => createHash("sha256").update(canonical(s)).digest("hex").slice(0, 16);

/** One session's local slot; each milestone commits to it and reloads from it. */
export class SaveSlot {
  readonly storage = new MemoryStorage();
  private repository = new SaveRepository(this.storage, LOCK);
  private readonly createdAt = "2026-10-20T00:00:00.000Z";
  readonly sessionId: string;
  constructor(scenario: string) {
    this.sessionId = `playthrough-${scenario}`.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 64);
    this.repository.load();
  }

  async milestone(d: Driver, label: string): Promise<GameState> {
    const live = d.state;
    if (!validState(live)) throw new Blocked(`State at ${label} fails strict save validation`);
    const savedAt = new Date(Date.parse(this.createdAt) + live.tick * (1000 / 60)).toISOString();
    const envelope = createEnvelope(live, { sessionId: this.sessionId, createdAt: this.createdAt, savedAt });
    const encoded = encodeSave(envelope);
    if (!encoded.ok) throw new Blocked(`Save at ${label} refused: ${encoded.error}`);
    const result = await this.repository.commit(envelope);
    if (!result.ok) throw new Blocked(`Local commit at ${label} failed (${result.code}): ${result.error}`);
    // A new page: fresh repository, same storage.
    this.repository = new SaveRepository(this.storage, LOCK);
    const slot = this.repository.load();
    if (slot.kind !== "ready" || !slot.save) throw new Blocked(`Reload at ${label} found a ${slot.kind} slot: ${slot.message}`);
    const loaded = slot.save.state, hash = stateHash(live), equal = stateHash(loaded) === hash;
    d.run.saves.push({ phase: d.phase, label, tick: live.tick, bytes: encoded.value.length, hash, equal });
    if (!equal) throw new Blocked(`Reloaded state at ${label} differs from the live state`);
    d.state = loaded;
    return loaded;
  }
}
