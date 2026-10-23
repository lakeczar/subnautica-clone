/** REC-1 playtest spool: writes the recording to the Origin Private File
 * System from a worker, with synchronous access handles, so every flush is
 * durable (a crashed tab keeps what was written) and the main thread never
 * waits on disk. Messages are handled strictly in order, so a message is a
 * barrier for everything posted before it. Local only: nothing leaves the computer.
 *
 *   { op: "append" | "put" (replace), dir, file, data }  → { ack: bytes } or { failed: file, bytes, quota, error }
 *   { op: "remove", dir, file | null (the whole directory), id } → { removed: id }
 *   { op: "export", dir, out, id } → { exported: id, bytes } : `out` is a ZIP of every
 *     file in `dir` as it stands at this point in the queue (nothing appended later
 *     is in it, and nothing modifies `out` afterwards). */
import { crc32, zipLayout, type ZipLayoutEntry } from "./zip.js";

interface SyncHandle {
  getSize(): number;
  read(buffer: ArrayBufferView, options?: { at?: number }): number;
  write(buffer: ArrayBufferView | ArrayBuffer, options?: { at?: number }): number;
  truncate(size: number): void;
  flush(): void;
  close(): void;
}
interface SyncFileHandle extends FileSystemFileHandle { createSyncAccessHandle(): Promise<SyncHandle> }
type Message =
  | { op: "append"; dir: string; file: string; data: ArrayBuffer | string }
  | { op: "put"; dir: string; file: string; data: ArrayBuffer | string }
  | { op: "remove"; dir: string; file: string | null; id: number }
  | { op: "export"; dir: string; out: string; id: number };

const handles = new Map<string, SyncHandle>();
const encoder = new TextEncoder();
let queue: Promise<void> = Promise.resolve();
const scope = globalThis as unknown as { onmessage: ((e: MessageEvent<Message>) => void) | null; postMessage(m: unknown): void };

async function directory(path: string, create = true): Promise<FileSystemDirectoryHandle> {
  let at = await navigator.storage.getDirectory();
  for (const part of path.split("/").filter(Boolean)) at = await at.getDirectoryHandle(part, { create });
  return at;
}
async function handle(dir: string, file: string): Promise<SyncHandle> {
  const key = `${dir}/${file}`;
  const open = handles.get(key);
  if (open) return open;
  const parts = file.split("/");
  const at = await directory([dir, ...parts.slice(0, -1)].join("/"));
  const fh = await at.getFileHandle(parts.at(-1)!, { create: true }) as SyncFileHandle;
  const h = await fh.createSyncAccessHandle();
  handles.set(key, h);
  return h;
}
function release(prefix: string): void {
  for (const [key, h] of handles) if (key === prefix || key.startsWith(`${prefix}/`)) { h.close(); handles.delete(key); }
}
async function files(dir: FileSystemDirectoryHandle, prefix = ""): Promise<{ name: string; handle: FileSystemFileHandle }[]> {
  const out: { name: string; handle: FileSystemFileHandle }[] = [];
  for await (const [name, h] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
    if (h.kind === "directory") out.push(...await files(h as FileSystemDirectoryHandle, `${prefix}${name}/`));
    else out.push({ name: `${prefix}${name}`, handle: h as FileSystemFileHandle });
  }
  return out.sort((a, b) => (a.name < b.name ? -1 : 1));
}

async function exportZip(dir: string, out: string): Promise<number> {
  const root = await directory(dir, false), list = await files(root);
  const STEP = 4 << 20, buffer = new Uint8Array(STEP);
  const read = async (key: string) => handles.get(`${dir}/${key}`) ?? (await (await handle(dir, key)));
  // Pass 1: sizes and CRCs as the files stand now.
  const layout: ZipLayoutEntry[] = [];
  for (const f of list) {
    const h = await read(f.name), size = h.getSize();
    let crc = 0;
    for (let at = 0; at < size; at += STEP) { const n = h.read(buffer.subarray(0, Math.min(STEP, size - at)), { at }); crc = crc32(buffer.subarray(0, n), crc); }
    layout.push({ name: f.name, size, crc });
  }
  // Pass 2: the ZIP, written to its own file.
  const parts = out.split("/"), outDir = await directory(parts.slice(0, -1).join("/"));
  const target = await (await outDir.getFileHandle(parts.at(-1)!, { create: true }) as SyncFileHandle).createSyncAccessHandle();
  try {
    target.truncate(0);
    let pos = 0;
    const put = (b: Uint8Array) => { pos += target.write(b, { at: pos }); };
    const { locals, tail } = zipLayout(layout);
    for (const [i, f] of list.entries()) {
      put(locals[i]!);
      const h = await read(f.name), size = layout[i]!.size;
      for (let at = 0; at < size; at += STEP) { const n = h.read(buffer.subarray(0, Math.min(STEP, size - at)), { at }); put(buffer.subarray(0, n)); }
    }
    for (const b of tail) put(b);
    target.flush();
    return pos;
  } finally { target.close(); }
}

scope.onmessage = (e) => {
  const m = e.data;
  queue = queue.then(async () => {
    if (m.op === "append" || m.op === "put") {
      const bytes = typeof m.data === "string" ? encoder.encode(m.data) : new Uint8Array(m.data);
      try {
        const h = await handle(m.dir, m.file);
        if (m.op === "put") h.truncate(0);
        h.write(bytes, { at: h.getSize() });
        h.flush();
        // Pictures are written once: release their handles at once.
        if (m.file.startsWith("snapshots/")) { h.close(); handles.delete(`${m.dir}/${m.file}`); }
        scope.postMessage({ ack: bytes.length, file: m.file });
      } catch (error) {
        const name = error instanceof DOMException ? error.name : "";
        scope.postMessage({ failed: m.file, bytes: bytes.length, quota: name === "QuotaExceededError", error: error instanceof Error ? error.message : String(error) });
      }
    } else if (m.op === "remove") {
      try {
        const target = m.file ? `${m.dir}/${m.file}` : m.dir;
        release(target);
        const parts = target.split("/"), parent = await directory(parts.slice(0, -1).join("/"), false);
        await parent.removeEntry(parts.at(-1)!, { recursive: true });
      } catch { /* already gone */ }
      scope.postMessage({ removed: m.id });
    } else {
      try { scope.postMessage({ exported: m.id, bytes: await exportZip(m.dir, m.out) }); }
      catch (error) { scope.postMessage({ exported: m.id, error: error instanceof Error ? error.message : String(error) }); }
    }
  });
};
