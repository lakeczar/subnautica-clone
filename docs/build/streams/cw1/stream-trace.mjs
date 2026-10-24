// A Chrome trace, streamed (SIM-PERF-1 for CW-1; belongs in scripts/rec with REC-2).
// Playwright's stopTracing() materialises the whole trace as one string, which passes V8's
// 512 MiB limit on a long traversal with busy categories (CW-1's D2: "Cannot create a string
// longer than 0x1fffffe8"). Here Chrome hands each trace back as a stream (CDP Tracing,
// transferMode "ReturnAsStream"), read in 4 MiB chunks and split into events as it arrives;
// every event goes to `onEvent` once and nothing else is kept. Tracing restarts every
// `rotateMs` so Chrome's own buffer (recordUntilFull) never fills; a rotation's gap is only the
// flush, because the next trace starts before the last one's stream is read. The stats say how
// many rotations lost data (Chrome's dataLossOccurred).
//
//   const trace = await streamTrace(await browser.newBrowserCDPSession(), categories, (e) => ...);
//   ...
//   const stats = await trace.stop();   // { rotations, chunksWithDataLoss, events, megabytes }
import { StringDecoder } from "node:string_decoder";

/** Feeds the events of one trace's JSON text (an object with `traceEvents`, or a bare array),
 * given in chunks, to `onEvent`. Strings (with escapes) never confuse the nesting. */
export function traceEventSplitter(onEvent) {
  const stack = [];
  let inString = false, escaped = false, start = -1, pending = "";
  const atEventLevel = () => stack[stack.length - 1] === 91 && (stack.length === 1 || (stack.length === 2 && stack[0] === 123));
  return (text) => {
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (inString) { if (escaped) escaped = false; else if (c === 92) escaped = true; else if (c === 34) inString = false; continue; }
      if (c === 34) inString = true;
      else if (c === 123 || c === 91) { if (c === 123 && start < 0 && atEventLevel()) start = i; stack.push(c); }
      else if (c === 125 || c === 93) {
        stack.pop();
        if (c === 125 && start >= 0 && atEventLevel()) { onEvent(JSON.parse(pending + text.slice(start, i + 1))); pending = ""; start = -1; }
      }
    }
    if (start >= 0) { pending += text.slice(start); start = 0; }
  };
}

export async function streamTrace(session, categories, onEvent, { rotateMs = 90_000, bufferKb = 256 * 1024, onError = () => {} } = {}) {
  const stats = { rotations: 0, chunksWithDataLoss: 0, events: 0, megabytes: 0 };
  const start = () => session.send("Tracing.start", { transferMode: "ReturnAsStream", streamFormat: "json",
    traceConfig: { recordMode: "recordUntilFull", traceBufferSizeInKb: bufferKb, includedCategories: categories } });
  const end = async () => {
    const done = new Promise((resolve) => session.once("Tracing.tracingComplete", resolve));
    await session.send("Tracing.end");
    const { stream, dataLossOccurred } = await done;
    if (dataLossOccurred) stats.chunksWithDataLoss++;
    return stream;
  };
  const read = async (handle) => {
    const utf8 = new StringDecoder("utf8"), feed = traceEventSplitter((e) => { stats.events++; onEvent(e); });
    let bytes = 0;
    for (;;) {
      const r = await session.send("IO.read", { handle, size: 4 << 20 });
      const text = r.base64Encoded ? utf8.write(Buffer.from(r.data, "base64")) : r.data;
      bytes += text.length; feed(text);
      if (r.eof) break;
    }
    feed(utf8.end());
    await session.send("IO.close", { handle });
    stats.megabytes = +(stats.megabytes + bytes / 1048576).toFixed(1);
  };
  let busy = null;
  const rotate = () => busy ??= (async () => { const stream = await end(); await start(); stats.rotations++; await read(stream); })()
    .catch(onError).finally(() => { busy = null; });
  await start();
  const timer = setInterval(rotate, rotateMs);
  return {
    stats,
    async stop() { clearInterval(timer); if (busy) await busy; await read(await end()); return stats; },
    /** For a `finally`: stops rotating without reading (the run failed). */
    abandon() { clearInterval(timer); },
  };
}
