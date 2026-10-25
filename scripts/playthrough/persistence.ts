/** Milestone saves through the game's own repository: commit the live state to an
 * in-memory local slot, open a fresh repository on that storage as a new page
 * would, and require the reloaded state to hash exactly like the live one. Play
 * then continues from the reloaded state, so every later phase runs on a save. */
import { createHash } from "node:crypto";
import { createEnvelope, decodeSave, encodeSave } from "../../src/save/codec.js";
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

const utf8 = (text: string): number => new TextEncoder().encode(text).byteLength;

/** One session's local slot; each milestone commits to it and reloads from it.
 * Mid-phase captures (SAVE-1) are queued during play and committed to their own
 * fresh slot at the phase end, so the session's slot holds only milestones. */
export class SaveSlot {
  readonly storage = new MemoryStorage();
  private repository = new SaveRepository(this.storage, LOCK);
  private readonly createdAt = "2026-10-20T00:00:00.000Z";
  readonly sessionId: string;
  private pending: { label: string; phase: string; state: GameState; commands: number }[] = [];
  constructor(scenario: string) {
    this.sessionId = `playthrough-${scenario}`.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 64);
    this.repository.load();
  }

  /** Commit `live` to `storage` through a repository, reload it as a new page
   * would, and hash both. Returns the loaded state and the text. */
  private async commitAndReload(live: GameState, label: string, storage: MemoryStorage, repository: SaveRepository):
    Promise<{ loaded: GameState; text: string; hash: string; equal: boolean; journalBytes: number }> {
    if (!validState(live)) throw new Blocked(`State at ${label} fails strict save validation`);
    const savedAt = new Date(Date.parse(this.createdAt) + live.tick * (1000 / 60)).toISOString();
    const envelope = createEnvelope(live, { sessionId: this.sessionId, createdAt: this.createdAt, savedAt });
    const encoded = encodeSave(envelope);
    if (!encoded.ok) throw new Blocked(`Save at ${label} refused: ${encoded.error}`);
    const result = await repository.commit(envelope);
    if (!result.ok) throw new Blocked(`Local commit at ${label} failed (${result.code}): ${result.error}`);
    // A new page: fresh repository, same storage.
    const fresh = new SaveRepository(storage, LOCK);
    const slot = fresh.load();
    if (slot.kind !== "ready" || !slot.save) throw new Blocked(`Reload at ${label} found a ${slot.kind} slot: ${slot.message}`);
    const hash = stateHash(live);
    if (repository === this.repository) this.repository = fresh;
    return { loaded: slot.save.state, text: encoded.value, hash, equal: stateHash(slot.save.state) === hash, journalBytes: utf8(fresh.raw ?? "") };
  }

  async milestone(d: Driver, label: string): Promise<GameState> {
    const live = d.state;
    const saved = await this.commitAndReload(live, label, this.storage, this.repository);
    d.run.saves.push({ phase: d.phase, label, tick: live.tick, bytes: utf8(saved.text), hash: saved.hash, equal: saved.equal,
      commands: d.commands, journalBytes: saved.journalBytes });
    if (!saved.equal) throw new Blocked(`Reloaded state at ${label} differs from the live state`);
    this.snapshots.set(label, saved.text);
    d.state = saved.loaded;
    return saved.loaded;
  }
  /** Queue the live state as a named capture; play goes on from the live state. */
  capture(d: Driver, label: string): void {
    if (this.snapshots.has(label) || this.pending.some((p) => p.label === label)) return;
    this.pending.push({ label, phase: d.phase, state: structuredClone(d.state), commands: d.commands });
  }
  /** Save and reload every queued capture, each through its own fresh slot. */
  async flushCaptures(d: Driver): Promise<void> {
    for (const p of this.pending.splice(0)) {
      const storage = new MemoryStorage(), repository = new SaveRepository(storage, LOCK);
      repository.load();
      const saved = await this.commitAndReload(p.state, p.label, storage, repository);
      d.run.saves.push({ phase: p.phase, label: p.label, tick: p.state.tick, bytes: utf8(saved.text), hash: saved.hash, equal: saved.equal,
        commands: p.commands, journalBytes: saved.journalBytes, capture: true });
      if (!saved.equal) throw new Blocked(`Reloaded capture ${p.label} differs from the state it captured`);
      this.snapshots.set(p.label, saved.text);
    }
  }
  /** Each milestone's and capture's exact save text, for branches and the save library. */
  readonly snapshots = new Map<string, string>();
}

/** Load a milestone save as Continue/Import would: decode and strictly validate. */
export function loadSnapshot(text: string): GameState {
  const decoded = decodeSave(text);
  if (!decoded.ok) throw new Blocked(`Branch save does not load: ${decoded.error}`);
  return decoded.value.state;
}

