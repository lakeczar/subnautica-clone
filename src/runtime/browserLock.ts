import type { WriterLockPort } from '../save/writer-lock.js';

/** The Web Locks API as a writer-lock port. No process-local or optimistic
 * fallback: an unsupported browser is read/export only. */
export function browserWriterLock(manager: LockManager | null | undefined): WriterLockPort | null {
  if (!manager || typeof manager.request !== 'function') return null;
  return {
    runExclusive: (name, signal, action) => manager.request(name, { mode: 'exclusive', signal }, () => {
      signal.throwIfAborted();
      return action();
    }),
  };
}
