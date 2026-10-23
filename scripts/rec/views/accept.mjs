#!/usr/bin/env node
// REC-1: accept fixed-view baselines, deliberately. Copies the chosen views of
// a capture into the store (outside git, keyed <class>/<view>/<commit>.png)
// and records in the repo's index (scripts/rec/views/baselines.json) who
// accepted each and why. Commit the index afterwards.
//
//   node scripts/rec/views/accept.mjs CAPTURE_DIR --by WHO --why "REASON" (--views id,id | --all | --new)
//     [--store DIR] [--index FILE]
//   --new: only views with no baseline yet (the first baseline of a view set).
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { INDEX, readIndex, STORE } from "./compare.mjs";
import { loadViewSet } from "./stable.mjs";

const sha256 = (b) => createHash("sha256").update(b).digest("hex");

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
// A baseline is a settled, stable, unquarantined picture (R1-F2); `stable` must be true, not merely absent.
const set = loadViewSet();
const quarantined = new Map(set.views.filter((v) => v.quarantine).map((v) => [v.id, v.quarantine]));
const unsettled = chosen.filter((v) => !v.settled || v.stable !== true);
if (unsettled.length && !args.includes("--allow-unsettled")) { console.error(`refusing unsettled or unstable views as baselines: ${unsettled.map((v) => v.id).join(", ")} (--allow-unsettled to override)`); process.exit(2); }
const held = chosen.filter((v) => quarantined.has(v.id));
if (held.length && !args.includes("--allow-quarantined")) { console.error(`refusing quarantined views as baselines: ${held.map((v) => `${v.id} (${quarantined.get(v.id)})`).join(", ")} (--allow-quarantined to override, with the reason in --why)`); process.exit(2); }
const at = new Date().toISOString();
for (const v of chosen) {
  // Content-addressed (audit F22): the stored file is named by the hash of the bytes
  // accepted, read from disk, never taken from the capture's metadata; the copy is
  // verified before the index names it. A second, different picture for the same
  // view and commit is a second file, so the index and the bytes cannot disagree.
  const bytes = readFileSync(path.join(dir, v.file)), sha = sha256(bytes);
  if (v.sha256 && v.sha256 !== sha) { console.error(`${v.id}: the capture's file does not match its recorded hash; not accepted`); process.exit(3); }
  const rel = `${cap.class}/${v.id}/${sha}.png`, dest = path.join(store, rel);
  mkdirSync(path.dirname(dest), { recursive: true });
  if (!existsSync(dest)) { copyFileSync(path.join(dir, v.file), `${dest}.tmp`); renameSync(`${dest}.tmp`, dest); }
  if (sha256(readFileSync(dest)) !== sha) { console.error(`${v.id}: the stored baseline ${rel} does not hold the accepted bytes; not accepted`); process.exit(3); }
  const prior = cls[v.id];
  cls[v.id] = { commit: cap.commit, sha256: sha, file: rel, acceptedBy: by, why, at, viewsVersion: cap.viewsVersion, gpu: cap.gpu,
    history: [...(prior?.history ?? []), ...(prior ? [{ commit: prior.commit, acceptedBy: prior.acceptedBy, why: prior.why, at: prior.at }] : [])].slice(-10) };
}
writeFileSync(indexFile, JSON.stringify(index, null, 1) + "\n");
console.log(`accepted ${chosen.length} ${cap.class} baselines at ${cap.commit.slice(0, 10)} by ${by}: ${why}\nstore ${store}; index ${indexFile} (commit it)`);
