// REC-1 experiment: which way of feeding MediaRecorder keeps producing frames
// while the page draws nothing (the game paused)? Task-owned Chrome, closed at the end.
import http from "node:http";
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
const out = process.argv[2]; mkdirSync(out, { recursive: true });
const html = `<!doctype html><canvas id=g width=1280 height=720></canvas><script>
window.run = async (variant) => {
  const g = document.getElementById("g"), gl = g.getContext("webgl2");
  let src, track, ctx, gen, writer, cv;
  if (variant === "C") { gen = new MediaStreamTrackGenerator({ kind: "video" }); writer = gen.writable.getWriter(); src = new MediaStream([gen]); }
  else { cv = document.createElement("canvas"); cv.width = 1280; cv.height = 720; if (variant === "B") { cv.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0.01"; document.body.appendChild(cv); }
    ctx = cv.getContext("bitmaprenderer"); src = cv.captureStream(0); track = src.getVideoTracks()[0]; }
  const chunks = []; const mr = new MediaRecorder(src, { mimeType: "video/webm;codecs=vp9", videoBitsPerSecond: 900000 });
  mr.ondataavailable = (e) => e.data.size && chunks.push(e.data); mr.start(1000);
  let last = null, next = 0, sent = { drawn: 0, idle: 0 }, pending = 0; const t0 = performance.now();
  const give = (bm, now) => {
    if (variant === "C") { const f = new VideoFrame(bm, { timestamp: Math.round(now * 1000) }); writer.write(f).finally(() => f.close()); return; }
    createImageBitmap(bm).then((copy) => { ctx.transferFromImageBitmap(copy); track.requestFrame(); });
  };
  await new Promise((done) => {
    const loop = (now) => {
      const draw = now - t0 < 3000;
      if (draw) { gl.clearColor(Math.random(), 0.3, 0.5, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
      if (now >= next && pending < 2) {
        next = Math.max(next + 1000 / 12, now - 1000 / 12);
        if (draw) { pending++; createImageBitmap(g, { resizeWidth: 1280, resizeHeight: 720 }).then((bm) => { pending--; last?.close(); last = bm; sent.drawn++; give(bm, now); }); }
        else if (last) { sent.idle++; give(last, now); }
      }
      if (now - t0 < 9000) requestAnimationFrame(loop); else done();
    };
    requestAnimationFrame(loop);
  });
  await new Promise((r) => { mr.onstop = r; mr.stop(); });
  const buf = new Uint8Array(await new Blob(chunks).arrayBuffer());
  let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { sent, b64: btoa(s) };
};
</script>`;
const server = http.createServer((q, r) => { r.writeHead(200, { "content-type": "text/html" }); r.end(html); });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const pw = ["/work/tmp/gpu-prep/pw/", "/work/tmp/pw/"].find((d) => { try { createRequire(d)("playwright-core"); return true; } catch { return false; } });
const { chromium } = createRequire(pw)("playwright-core");
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`, headless: true,
  args: ["--use-gl=angle", "--use-angle=gl-egl", "--ignore-gpu-blocklist"] });
const result = {};
try {
  for (const v of ["A", "B", "C"]) {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const r = await page.evaluate((v) => window.run(v), v).catch((e) => ({ error: String(e) }));
    if (r.b64) {
      const f = `${out}/${v}.webm`, g = `${out}/${v}-remux.webm`; writeFileSync(f, Buffer.from(r.b64, "base64"));
      execFileSync("ffmpeg", ["-v", "error", "-i", f, "-c", "copy", "-y", g]);
      const pts = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v", "-show_entries", "packet=pts_time", "-of", "csv=p=0", g]).toString().trim().split("\n").map((x) => parseFloat(x));
      result[v] = { sent: r.sent, packets: pts.length, lastPts: pts.at(-1), after3s: pts.filter((x) => x > 3.2).length };
    } else result[v] = r;
    await page.close();
  }
} finally { await browser.close(); server.close(); }
console.log(JSON.stringify(result));
