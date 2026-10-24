# Core helpers: one way to do each thing

Owned by the coordinator; each per-wave architecture review updates it (STEW-1, from the [steward verdict](https://github.com/lakeczar/subnautica-clone/blob/research/codebase-health/docs/build/audits/CODEBASE-STEWARD-VERDICT-OPUS.md)). It's an index of where things live, not a utility bag: nothing moves into a shared "utils" module because of it. `scripts/guard-architecture.mjs` enforces the rows marked *guarded*.

## The one way to do it

| Job | Owner module | Notes |
| --- | --- | --- |
| Region at a point | `content/regions/layout.ts`: `regionAtPoint(x, z)`, `regionAtPosition(p)` | The only semantic lookup, for audio, optics, the timeline and the HUD. `render/regions.ts` `legacyArtRegionAt` is art residency only. *Guarded.* |
| World queries | `WorldQueries` (`sim/world.ts`); `dataInBox(box, out)` with a caller buffer for hot callers | `dataInBox` arrives with CW-1. |
| Static collision | COL-1's `StaticCollider` | After COL-1 stage B; no new box-set adapters before then. |
| Babylon-free meshes | the kit `RecipeBuilder` (`render/kit/recipe.ts`) | WK-1 retires the biome builder. *Guarded* (no third builder). |
| Inventory and spending | `sim/inventory.ts`, with a plan-then-apply spend (`planSpend`/`applySpend`) | Live since SIG-1 stage 0 (the ledger fork is retired). |
| Seeded random | `render/geometry.ts` `seeded` | New code only: the four existing generators stay, because changing one changes seeded art. |
| Tick time | `sim/clock.ts` `FIXED_SECONDS` | Never a local `1 / 60` or `60`. |
| Formatting | `ui/format.ts` | Durations (`duration`), escaping, headings. |
| Panel sections | `ui/panels.ts` `SectionKit` | New panels use it. Existing bespoke presenters stay until someone changes them. |
| A bounded cache | modelled on `render/geometryCache.ts`; in the simulation, `sim/caches.ts` (`BoundedMemo`, the ledger `simCaches()`) | An owner, a byte bound, an eviction rule and a ledger registration (performance convention 8). Sim caches register with `registerCache`; the app reads the ledger with the step costs. |
| Test clocks and waits | a deterministic `workClock` passed to the stream; `waitUntil` in `tests/shared-support.ts` | Never a fixed sleep for an outcome. |
| Test helpers | `tests/shared-support.ts`: `drain` (run a sliced builder), `rectOf` (a chunk's rectangle), `waitUntil` | Fixtures stay with their tests. |
| Test saves | the SAVE-1 library (`saves.js pick KIND`, `librarySave`) | Hand-seeded diagnostic saves are labelled as such. |
| Browser evidence | `scripts/rec/` | Streams write a scenario, never browser, server, GPU or save plumbing. *Guarded* (`chromium.launch`, `createServer`, `gpu-prep` only in `scripts/rec`, `scripts/heavy`, `scripts/soak`). |
| Heavy and GPU work | `scripts/heavy-check.sh` | With a machine tag (`--machine any` for headless jobs). |
| The merge gate | `npm run gate` (`scripts/gate.mjs`) | Its manifest is the gate. |

**Layering** (*guarded*, failing closed): everything `src/sim/**` and `src/content/**` reach at runtime is followed, in any directory. That means static and lazy imports, through barrels and helpers, including `import { type X }` (it still runs its target); only statement-level `import type`/`export type` are erased. Every path must end in one of:
- JSON data;
- a package on the guard's `PORTABLE_PACKAGES` list (each with its reason; empty today);
- TypeScript the guard analyses.

Render, UI, audio, Babylon, any other package or Node builtin, JavaScript, a missing module or JSON file or a computed `import()`/`require()` anywhere on the path fails, naming the chain.

**The guard's scope:** it's a fail-closed regression rail over honest repository code. Every rule reads real paths and source text, and it refuses symlinks under `src`. It isn't a sandbox against deliberately adversarial constructions; the headless typecheck and review cover those. A bypass that ordinary code wouldn't write is out of scope. They use no DOM: `tsconfig.headless.json` typechecks them, and everything they reach, with no DOM library; `scripts/headless-platform.d.ts` declares the few platform APIs every headless runtime has.

Value-import cycles are frozen at today's two groups: the 3-module render group (`biomes/scatter`, `biomes/vistas`, `poi/landmarks`) and the 13-module sim group around `carrier` and `progression`. **Each cycle must match its allowance exactly.** A change that shrinks or retires a cycle lowers its allowance in the same commit (the guard fails until it does), so it can never regrow. No new cycle may form.

## Open forks

An interim parallel implementation carries a marker at the top of its module:

```ts
// FORK(<id>): <what it duplicates>; retire in <stream>
```

It also gets a row here. A stream that composes or replaces it deletes the fork in the same merge, or names the stream that will. A "temporary" comment without a FORK marker is not allowed. The guard prints every marker. The per-wave review fails any fork whose retiring stream has merged.

| ID | What it duplicates | Where | Retire in |
| --- | --- | --- | --- |
| `biome-recipe-builder` | A second `RecipeBuilder` beside the kit's. Its box yaw mirrors the kit's: biome `box(c, s, col, yaw)` equals kit `box(c, s, col, −yaw)`. | `src/render/biomes/recipe.ts` | WK-1's one builder seam (TER-06), proven by byte-for-byte geometry on rotated, asymmetric parts. |
| `lc-box-collider` | The large-cave box-set collider and the kit object solids, beside COL-1's static collider. | `src/world/caves/large/boxCollider.ts`; the object `Solid` kit composition in `src/sim/world.ts` (about lines 763–819); CW-1's per-cluster object rosters | COL-1 stage B (an acceptance condition there). |
| `env1-swim-speed` | The step's ordinary swim speed (3.4 m/s) and jump height, as constants in the interior validator's timed-return and walking rules. A fast test measures the real step against both. | `src/sim/interiors/validate.ts` (`ORDINARY_SWIM_SPEED`, `JUMP`) | ENV-1 stage 2, once `sim/step.ts` exports its movement speeds (after CW-1 merges). |
| `legacy-terrain` | B1's accepted opening terrain and its four art owners, beside the authored terrain. It's live, and it owns the accepted island, reef, Canopy and Basin benchmark: not dead code. | `src/render/legacyTerrain.ts`, `src/render/legacyWorld.ts` (and `src/sim/terrain.ts`' `legacyWorldHeight`) | The bigger-map re-evaluation (TER-09), which migrates it into the authored terrain contract. |
| `step-costs-global` | A pulled diagnostic global (`__siltwakeStepCosts()`, the step meter's snapshot) beside REC-1's `__siltwake` hook. | `src/runtime/app.ts` (constructor) | Whichever of REC-1 and SIM-PERF-1 merges second: it becomes `__siltwake.steps()`. |
| `stream-drivers` | Per-stream browser drivers, servers and save-derive scripts, each a copy of the last. | the `drivers` allowlist in `scripts/guard-architecture.mjs` (`docs/build/streams/**`, `docs/build/gpu-enablement/webgl-probe.mjs`, `tools/*`) | REC-2: one driver library in `scripts/rec/`, and the allowlist shrinks to nothing. |
