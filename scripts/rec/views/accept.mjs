#!/usr/bin/env node
// REC-1: accept fixed-view baselines, deliberately. Copies the chosen views of
// a capture into the store (outside git, keyed <class>/<view>/<commit>.png)
// and records in the repo's index (scripts/rec/views/baselines.json) who
// accepted each and why. Commit the index afterwards.
//
//   node scripts/rec/views/accept.mjs CAPTURE_DIR --by WHO --why "REASON" (--views id,id | --all | --new)
//     [--store DIR] [--index FILE]
//   --new: only views with no baseline yet (the first baseline of a view set).
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { INDEX, readIndex, STORE } from "./compare.mjs";

const args = process.argv.slice(2), arg = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const dir = args[0], by = arg("by"), why = arg("why");
if (!dir || !by || !why || !(arg("views") || args.includes("--all") || args.includes("--new"))) {
  console.error("usage: accept.mjs CAPTURE_DIR --by WHO --why REASON (--views id,id | --all | --new)"); process.exit(2);
}
const cap = JSON.parse(readFileSync(path.join(dir, "capture.json"), "utf8"));
if (!cap.commit) { console.error("the capture has no commit (dist/COMMIT); a baseline must name the commit it came from"); process.exit(2); }
const store = arg("store") ?? STORE, indexFile = arg("index") ?? INDEX, index = readIndex(indexFile);
const cls = (index.classes[cap.class] ??= {});
const wanted = arg("views") ? new Set(arg("views").split(",")) : null;
const chosen = cap.views.filter((v) => v.file && (args.includes("--all") || (wanted?.has(v.id)) || (args.includes("--new") && !cls[v.id])));
if (wanted) for (const id of wanted) if (!cap.views.some((v) => v.id === id && v.file)) { console.error(`${id} is not in this capture`); process.exit(2); }
const unsettled = chosen.filter((v) => !v.settled || v.stable === false);
if (unsettled.length && !args.includes("--allow-unsettled")) { console.error(`refusing unsettled or animating views as baselines: ${unsettled.map((v) => v.id).join(", ")} (--allow-unsettled to override)`); process.exit(2); }
const at = new Date().toISOString();
for (const v of chosen) {
  const rel = `${cap.class}/${v.id}/${cap.commit}.png`, dest = path.join(store, rel);
  mkdirSync(path.dirname(dest), { recursive: true });
  if (!existsSync(dest)) copyFileSync(path.join(dir, v.file), dest);
  const prior = cls[v.id];
  cls[v.id] = { commit: cap.commit, sha256: v.sha256, file: rel, acceptedBy: by, why, at, viewsVersion: cap.viewsVersion, gpu: cap.gpu,
    history: [...(prior?.history ?? []), ...(prior ? [{ commit: prior.commit, acceptedBy: prior.acceptedBy, why: prior.why, at: prior.at }] : [])].slice(-10) };
}
writeFileSync(indexFile, JSON.stringify(index, null, 1) + "\n");
console.log(`accepted ${chosen.length} ${cap.class} baselines at ${cap.commit.slice(0, 10)} by ${by}: ${why}\nstore ${store}; index ${indexFile} (commit it)`);
