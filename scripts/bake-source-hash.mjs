// The bake's source hash: sha-256 over every input of the bake bundle
// (`src/render/biomes/bake.ts`), path then bytes, in path order. The bake
// writes it into its manifests and the cave collision pack; the game build
// carries it (vite `define`, `__BAKE_SOURCE_HASH__`), so a pack baked from
// other sources is refused at load (STR-13). One function for both, so they
// cannot drift.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";

export const BAKE_ENTRY = "src/render/biomes/bake.ts";

/** The hash of a bake bundle's inputs, from its esbuild metafile. */
export function sourceHashOf(root, metafile) {
  const hash = createHash("sha256");
  for (const input of Object.keys(metafile.inputs).sort()) hash.update(input).update(readFileSync(join(root, input)));
  return hash.digest("hex");
}

/** The source hash the bake would record for the tree at `root`. */
export async function bakeSourceHash(root) {
  const result = await build({
    entryPoints: [join(root, BAKE_ENTRY)], bundle: true, platform: "node", format: "esm",
    outfile: join(root, "bake.mjs"), write: false, metafile: true, logLevel: "warning", absWorkingDir: root,
  });
  return sourceHashOf(root, result.metafile);
}
