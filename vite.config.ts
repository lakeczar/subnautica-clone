import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { bakeSourceHash } from './scripts/bake-source-hash.mjs';
import { execSync } from 'node:child_process';

/** The commit a build came from (REC-1's evidence header), `-dirty` if the tree had edits. */
function buildCommit(): string {
  try {
    const sha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    return execSync('git status --porcelain --untracked-files=no', { encoding: 'utf8' }).trim() ? `${sha}-dirty` : sha;
  } catch { return 'unknown'; }
}

// The build carries the bake's source hash, so the game refuses a cave
// collision pack baked from other sources (STR-13).
export default defineConfig(async () => ({
  base: './',
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: { target: 'es2022' },
  define: {
    __BAKE_SOURCE_HASH__: JSON.stringify(await bakeSourceHash(fileURLToPath(new URL('.', import.meta.url)))),
    __BUILD_COMMIT__: JSON.stringify(buildCommit()),
  },
}));
