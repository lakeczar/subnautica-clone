import { decodeSave, encodeSave, MAX_SAVE_BYTES } from './codec.js';
import type { SaveEnvelope } from './codec.js';
import { SAVE_WRITER_LOCK } from './writer-lock.js';
import type { WriterLockPort } from './writer-lock.js';

export const LOCAL_SAVE_KEY = 'siltwake.save.journal.v1';
const MAX_JOURNAL_BYTES = MAX_SAVE_BYTES * 8;
export interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void }
interface Journal { format: 'siltwake.local'; version: 1; current: string; previous: string | null; preserved: string | null }
export interface SaveSlot {
  kind: 'empty' | 'ready' | 'recovered' | 'protected' | 'unavailable';
  save: SaveEnvelope | null;
  message: string;
  backup: SaveEnvelope | null;
}
export type CommitFailure = 'invalid' | 'storage-unavailable' | 'write-refused' | 'lock-unavailable' | 'lock-failed' | 'conflict' | 'protected' | 'too-large' | 'cancelled';
export type CommitResult = { ok: true; value: SaveSlot } | { ok: false; code: CommitFailure; error: string };

function journal(raw: string): Journal | null {
  if (new TextEncoder().encode(raw).byteLength > MAX_JOURNAL_BYTES) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const data = value as Partial<Journal>;
    if (Object.keys(data).length !== 5 || data.format !== 'siltwake.local' || data.version !== 1 || typeof data.current !== 'string' || !(data.previous === null || typeof data.previous === 'string') || !(data.preserved === null || typeof data.preserved === 'string')) return null;
    return data as Journal;
  } catch { return null; }
}

/** One localStorage setItem is the commit point. Current and previous-good generations
 * live in that SAME atomic record: a quota/error cannot strand a half-written pair.
 * The observed-record comparison AND write run inside the shared cross-context lock. */
export class SaveRepository {
  private observed: string | null = null;
  private readable = false;
  private slot: SaveSlot = { kind: 'unavailable', save: null, backup: null, message: 'Local storage has not been read.' };

  constructor(private readonly storage: StoragePort | null, private readonly writerLock: WriterLockPort | null) {}

  load(): SaveSlot {
    try {
      if (!this.storage) throw new Error('unavailable');
      this.observed = this.storage.getItem(LOCAL_SAVE_KEY);
      this.readable = true;
      if (this.observed === null) return this.slot = { kind: 'empty', save: null, backup: null, message: 'No local expedition yet.' };
      const data = journal(this.observed);
      if (!data) return this.slot = { kind: 'protected', save: null, backup: null, message: 'The local save record is unreadable. It is protected from automatic replacement; export it before starting over.' };
      const current = decodeSave(data.current);
      const previous = data.previous === null ? null : decodeSave(data.previous);
      const backup = previous?.ok ? previous.value : null;
      if (current.ok) return this.slot = { kind: 'ready', save: current.value, backup, message: `Local save · ${new Date(current.value.meta.savedAt).toLocaleString()}` };
      if (backup) return this.slot = { kind: 'recovered', save: backup, backup, message: `Current slot could not load: ${current.error} A previous valid save is available. Automatic saving is paused until you explicitly repair the slot.` };
      return this.slot = { kind: 'protected', save: null, backup: null, message: `The local save is protected: ${current.error}` };
    } catch {
      this.readable = false;
      return this.slot = { kind: 'unavailable', save: null, backup: null, message: 'Browser storage is unavailable. You can explore and export a save file; local saving is disabled.' };
    }
  }

  get status(): SaveSlot { return this.slot; }
  get canWrite(): boolean { return this.storage !== null && this.readable && this.writerLock !== null; }
  get raw(): string | null { return this.observed; }
  get backupText(): string | null {
    const data = this.observed === null ? null : journal(this.observed);
    return data?.previous ?? null;
  }

  async commit(save: SaveEnvelope, replaceProtected = false, signal: AbortSignal = new AbortController().signal): Promise<CommitResult> {
    // Serialize before waiting, so both the written bytes and returned slot describe
    // the same snapshot even if the caller keeps simulating while the lock is queued.
    const encoded = encodeSave(save);
    if (!encoded.ok) return { ...encoded, code: 'invalid' };
    const snapshot = JSON.parse(encoded.value) as SaveEnvelope;
    if (signal.aborted) return { ok: false, code: 'cancelled', error: 'Saving was cancelled.' };
    if (!this.storage || !this.readable) return { ok: false, code: 'storage-unavailable', error: 'Local storage is unavailable.' };
    if (!this.writerLock) return { ok: false, code: 'lock-unavailable', error: 'This browser cannot safely coordinate local saves between tabs. Local saving is disabled.' };
    try {
      return await this.writerLock.runExclusive(SAVE_WRITER_LOCK, signal, (): CommitResult => {
        if (signal.aborted) return { ok: false, code: 'cancelled', error: 'Saving was cancelled.' };
        const storage = this.storage!;
        let current: string | null;
        try { current = storage.getItem(LOCAL_SAVE_KEY); }
        catch { return { ok: false, code: 'storage-unavailable', error: 'Browser storage could not be read. The local record has not been changed.' }; }
        if (current !== this.observed) return { ok: false, code: 'conflict', error: 'The local slot changed in another tab. Export any active session, then reload before replacing that slot.' };
        const protectedSlot = this.slot.kind === 'protected' || this.slot.kind === 'recovered';
        if (protectedSlot && !replaceProtected) return { ok: false, code: 'protected', error: 'The unreadable slot is protected. Use the explicit repair / replace action in the save menu.' };
        if (protectedSlot && this.observed !== null && new TextEncoder().encode(this.observed).byteLength > MAX_SAVE_BYTES * 4) return { ok: false, code: 'too-large', error: 'The protected record is too large to preserve safely. Export it; this build will not overwrite it.' };
        const data = this.observed === null ? null : journal(this.observed);
        const oldCurrent = data ? decodeSave(data.current) : null;
        const oldPrevious = data?.previous ? decodeSave(data.previous) : null;
        const previous = oldCurrent?.ok ? data!.current : oldPrevious?.ok ? data!.previous : null;
        const next: Journal = { format: 'siltwake.local', version: 1, current: encoded.value, previous, preserved: protectedSlot ? this.observed : data?.preserved ?? null };
        const raw = JSON.stringify(next);
        if (new TextEncoder().encode(raw).byteLength > MAX_JOURNAL_BYTES) return { ok: false, code: 'too-large', error: 'The combined save record is too large. The local slot is unchanged.' };
        try { storage.setItem(LOCAL_SAVE_KEY, raw); }
        catch { return { ok: false, code: 'write-refused', error: 'Browser storage refused the save (quota or permissions). The local record is unchanged.' }; }
        this.observed = raw;
        const backup = previous ? decodeSave(previous) : null;
        this.slot = { kind: 'ready', save: snapshot, backup: backup?.ok ? backup.value : null, message: `Saved locally · ${new Date(snapshot.meta.savedAt).toLocaleTimeString()}` };
        return { ok: true, value: this.slot };
      });
    } catch {
      return signal.aborted
        ? { ok: false, code: 'cancelled', error: 'Saving was cancelled.' }
        : { ok: false, code: 'lock-failed', error: 'Safe local-save coordination failed. Local saving is disabled; no replacement was attempted.' };
    }
  }
}
