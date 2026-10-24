// LS-1 1b, one-off (DIRECTION: named fixtures are converted once, originals archived).
// Run after `node scripts/test-build.mjs`: each schema 7 fixture is archived as
// tests/fixtures/archive/<name>.schema7.json, then rewritten as the canonical schema 8
// save the bridge produces. Lives outside the browser import graph.
import fs from "node:fs";
import { pathToFileURL } from "node:url";
const { decodeSave, encodeSave } = await import(pathToFileURL(".test-build/src/save/codec.js").href);
for (const name of ["earned-c06.json", "reef-rib-trap.json", "diagnostic-depleted.json"]) {
  const path = `tests/fixtures/${name}`, raw = fs.readFileSync(path, "utf8");
  if (JSON.parse(raw).schemaVersion !== 7) { console.log(`${name}: not schema 7, left as is`); continue; }
  const archive = `tests/fixtures/archive/${name.replace(/\.json$/, ".schema7.json")}`;
  if (fs.existsSync(archive)) throw new Error(`${archive} exists; never rewrite an archived original`);
  const out = decodeSave(raw);
  if (!out.ok) throw new Error(`${name}: ${out.error}`);
  const text = encodeSave(out.value);
  if (!text.ok) throw new Error(`${name}: ${text.error}`);
  fs.writeFileSync(archive, raw);
  fs.writeFileSync(path, text.value);
  console.log(`${name}: archived as ${archive}, rewritten as schema 8`);
}
