/** All Siltwake writers on an origin must use this exact name. */
export const SAVE_WRITER_LOCK = 'siltwake.save.journal.v1.writer';

/** The cross-context writer lock, as a portable port: no browser types here, so
 * the headless simulation and its tests reach only this. The browser adapter is
 * `browserWriterLock` (`src/runtime/browserLock.ts`). */
export interface WriterLockPort {
  runExclusive<T>(name: string, signal: AbortSignal, action: () => T): Promise<T>;
}
