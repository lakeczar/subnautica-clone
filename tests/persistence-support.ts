import { createGame } from '../src/sim/state.js';
import { createEnvelope, encodeSave } from '../src/save/codec.js';
import type { SaveEnvelope } from '../src/save/codec.js';
import type { StoragePort } from '../src/save/repository.js';
import type { WriterLockPort } from '../src/save/writer-lock.js';

export function deferred<T = void>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
export const sample = (tick = 150): SaveEnvelope => {
  const state = createGame(); state.tick = tick;
  return createEnvelope(state, { sessionId: 'test-session-001', createdAt: '2026-10-17T12:00:00.000Z', savedAt: '2026-10-17T12:05:00.000Z' });
};
export function encoded(save: SaveEnvelope): string {
  const result = encodeSave(save); if (!result.ok) throw new Error(result.error); return result.value;
}
export class MemoryStorage implements StoragePort {
  data = new Map<string, string>();
  failWrite = false;
  failRead = false;
  writes = 0;
  afterRead: (() => void) | null = null;
  getItem(key: string): string | null {
    if (this.failRead) throw new Error('denied');
    const value = this.data.get(key) ?? null;
    const callback = this.afterRead; this.afterRead = null; callback?.();
    return value;
  }
  setItem(key: string, value: string): void {
    this.writes++;
    if (this.failWrite) throw new Error('quota');
    this.data.set(key, value);
  }
}
/** A shared exclusion fixture, not a production fallback. Gate lets tests queue
 * real repository/session operations without timers or scheduler assumptions. */
export class TestWriterLock implements WriterLockPort {
  private tail = Promise.resolve();
  gate: Promise<void> | null = null;
  requests = 0;
  names = new Set<string>();
  async runExclusive<T>(name: string, signal: AbortSignal, action: () => T): Promise<T> {
    this.requests++; this.names.add(name);
    const predecessor = this.tail, release = deferred();
    this.tail = release.promise;
    await predecessor;
    try {
      if (this.gate) await this.gate;
      signal.throwIfAborted();
      return action();
    } finally { release.resolve(); }
  }
}
export async function settled(): Promise<void> { for (let i = 0; i < 15; i++) await Promise.resolve(); }
