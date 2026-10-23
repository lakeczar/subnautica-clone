// Extracts the in-game export (src/runtime/flight/zip.ts: store-only, ZIP64
// when needed) into a directory. Reads through a file descriptor, so a
// multi-gigabyte video is copied in slices, never held in memory.
import { closeSync, mkdirSync, openSync, readSync, fstatSync, writeSync } from "node:fs";
import path from "node:path";

function read(fd, at, n) { const b = Buffer.alloc(n); readSync(fd, b, 0, n, at); return b; }

export function unzip(file, out) {
  const fd = openSync(file, "r");
  try {
    const size = fstatSync(fd).size, tail = read(fd, Math.max(0, size - 65558), Math.min(size, 65558));
    const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (eocd < 0) throw new Error(`${file} is not a ZIP`);
    let entries = tail.readUInt16LE(eocd + 10), cdOffset = tail.readUInt32LE(eocd + 16);
    if (cdOffset === 0xffffffff || entries === 0xffff) {
      const loc = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x06, 0x07]));
      const z64 = read(fd, Number(tail.readBigUInt64LE(loc + 8)), 56);
      entries = Number(z64.readBigUInt64LE(32)); cdOffset = Number(z64.readBigUInt64LE(48));
    }
    let at = cdOffset;
    const root = path.resolve(out);
    for (let i = 0; i < entries; i++) {
      const h = read(fd, at, 46), n = h.readUInt16LE(28), x = h.readUInt16LE(30), k = h.readUInt16LE(32);
      const name = read(fd, at + 46, n).toString("utf8"), extra = read(fd, at + 46 + n, x);
      if (h.readUInt16LE(10) !== 0) throw new Error(`${name}: compressed entries are not supported (REC-1 exports are stored)`);
      let len = h.readUInt32LE(24), local = h.readUInt32LE(42);
      for (let e = 0; e + 4 <= extra.length;) {
        const id = extra.readUInt16LE(e), sz = extra.readUInt16LE(e + 2);
        if (id === 1) { let p = e + 4; if (h.readUInt32LE(24) === 0xffffffff) { len = Number(extra.readBigUInt64LE(p)); p += 8; } if (h.readUInt32LE(20) === 0xffffffff) p += 8; if (h.readUInt32LE(42) === 0xffffffff) local = Number(extra.readBigUInt64LE(p)); }
        e += 4 + sz;
      }
      const lh = read(fd, local, 30), dataAt = local + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
      const dest = path.resolve(root, name);
      if (!dest.startsWith(root + path.sep)) throw new Error(`${name} escapes the output directory`);
      mkdirSync(path.dirname(dest), { recursive: true });
      const w = openSync(dest, "w");
      try { for (let done = 0; done < len;) { const n2 = Math.min(8 << 20, len - done); writeSync(w, read(fd, dataAt + done, n2)); done += n2; } } finally { closeSync(w); }
      at += 46 + n + x + k;
    }
    return entries;
  } finally { closeSync(fd); }
}
