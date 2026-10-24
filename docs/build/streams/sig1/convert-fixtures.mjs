// SIG-1: convert the named test fixtures once from schema 6 to schema 7 through
// this build's own decoder (bridge6), archiving each schema 6 original unchanged.
// usage: node convert-fixtures.mjs <repo>   (after `npm run test:build`)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
const [repo] = process.argv.slice(2), B = path.join(repo, ".test-build/");
const { decodeSave, encodeSave } = await import(B + "src/save/codec.js");
for (const name of ["earned-c06", "reef-rib-trap", "diagnostic-depleted"]) {
  const file = path.join(repo, "tests/fixtures", `${name}.json`), archive = path.join(repo, "tests/fixtures/archive", `${name}.schema6.json`);
  const raw = readFileSync(file, "utf8");
  if (JSON.parse(raw).schemaVersion !== 6) { console.log(name, "is not schema 6; left alone"); continue; }
  if (existsSync(archive)) throw new Error(`${archive} exists: never rewrite an archived original`);
  const d = decodeSave(raw);
  if (!d.ok) throw new Error(`${name}: ${d.error}`);
  const e = encodeSave(d.value);
  if (!e.ok) throw new Error(`${name}: ${e.error}`);
  writeFileSync(archive, raw);
  writeFileSync(file, e.value);
  console.log("converted", name, "→ schema", JSON.parse(e.value).schemaVersion, "; original archived as", path.basename(archive));
}
