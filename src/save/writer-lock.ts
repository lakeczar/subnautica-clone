/** All Siltwake writers on an origin must use this exact name. */
export const SAVE_WRITER_LOCK = 'siltwake.save.journal.v1.writer';

export interface WriterLockPort {
  runExclusive<T>(name: string, signal: AbortSignal, action: () => T): Promise<T>;
}

/** No process-local or optimistic fallback: an unsupported browser is read/export only. */
export function browserWriterLock(manager: LockManager | null | undefined): WriterLockPort | null {
  if (!manager || typeof manager.request !== 'function') return null;
  return {
    runExclusive: (name, signal, action) => manager.request(name, { mode: 'exclusive', signal }, () => {
      signal.throwIfAborted();
      return action();
    }),
  };
}
