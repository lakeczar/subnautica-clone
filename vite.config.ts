import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { bakeSourceHash } from './scripts/bake-source-hash.mjs';

// The build carries the bake's source hash, so the game refuses a cave
// collision pack baked from other sources (STR-13).
export default defineConfig(async () => ({
  base: './',
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: { target: 'es2022' },
  define: { __BAKE_SOURCE_HASH__: JSON.stringify(await bakeSourceHash(fileURLToPath(new URL('.', import.meta.url)))) },
}));
