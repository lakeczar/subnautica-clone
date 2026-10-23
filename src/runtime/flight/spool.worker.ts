/** REC-1 playtest spool: appends the recording to the Origin Private File
 * System from a worker, with synchronous access handles, so every flush is
 * durable (a crashed tab keeps what was written) and the main thread never
 * waits on disk. Messages: { op: "append", dir, file, data } and
 * { op: "close", id } (releases every handle so the page can read the files;
 * the next append reopens them). Local only: nothing leaves the computer. */

interface SyncHandle {
  getSize(): number;
  write(buffer: ArrayBufferView | ArrayBuffer, options?: { at?: number }): number;
  flush(): void;
  close(): void;
}
interface SyncFileHandle extends FileSystemFileHandle { createSyncAccessHandle(): Promise<SyncHandle> }
type Message =
  | { op: "append"; dir: string; file: string; data: ArrayBuffer | string }
  | { op: "close"; id: number };

const handles = new Map<string, SyncHandle>();
const encoder = new TextEncoder();
let queue: Promise<void> = Promise.resolve();
const scope = globalThis as unknown as { onmessage: ((e: MessageEvent<Message>) => void) | null; postMessage(m: unknown): void };

async function handle(dir: string, file: string): Promise<SyncHandle> {
  const key = `${dir}/${file}`;
  const open = handles.get(key);
  if (open) return open;
  let at = await navigator.storage.getDirectory();
  for (const part of [...dir.split("/"), ...file.split("/").slice(0, -1)]) at = await at.getDirectoryHandle(part, { create: true });
  const fh = await at.getFileHandle(file.split("/").at(-1)!, { create: true }) as SyncFileHandle;
  const h = await fh.createSyncAccessHandle();
  handles.set(key, h);
  return h;
}

scope.onmessage = (e) => {
  const m = e.data;
  queue = queue.then(async () => {
    if (m.op === "append") {
      const h = await handle(m.dir, m.file);
      h.write(typeof m.data === "string" ? encoder.encode(m.data) : new Uint8Array(m.data), { at: h.getSize() });
      h.flush();
      // Snapshots are written once: release their handles at once.
      if (m.file.startsWith("snapshots/")) { h.close(); handles.delete(`${m.dir}/${m.file}`); }
    } else {
      for (const h of handles.values()) h.close();
      handles.clear();
      scope.postMessage({ closed: m.id });
    }
  }).catch((error: unknown) => scope.postMessage({ error: error instanceof Error ? error.message : String(error) }));
};
