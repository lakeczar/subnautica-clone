# FND-01 author evidence

Author: native `/root/foundation_builder`, Sol 6.1 `max`. Date: 2026-10-17. Baseline: `a3e400b`, shared branch `feat/siltwake-foundation`. This report accompanies the runnable foundation commit; it is **provisional author evidence**, pending coordinator inspection and separate non-author Astra `xhigh` and Sol 6.1 `max` reviews under the independent review gate. It does not accept M0 or any later milestone.

## Delivered scope

Pinned TypeScript/Vite/Babylon scaffold, pure movement and clock, a versioned save boundary and atomic local journal, one runtime lifecycle owner, menu/HUD/settings, and original procedural richer-cel shallow-ocean art. Ordinary movement connects the pod deck, its submerged return ramp, the reef ribs and a walkable island shore. The foundation has explicit bounds.

This is an early construction build. Gathering, recipes, survival drains, pod facilities/interior, narrative, research settlements, seven playable habitats, six usable craft, carrier/berths, recovery gameplay and the campaign are not implemented. Vitals are reserved at 100 until air, food, warnings and recovery can arrive coherently. Decorative colonies, stones and fish are non-solid and have no resource/scan interaction. The seeded content roster is not spawned gameplay. The revised campaign requirements remain in force.

## Commands and results

Environment: Node `24.21.0`, npm `11.19.0`; supported Node minimum `22.12.0`. Versions are exact in `package.json` and `package-lock.json`: TypeScript `5.9.3`, Vite `7.3.1`, Babylon core `9.31.0`, Node types `24.10.0`.

| Command | Author result |
| --- | --- |
| `npm ci --no-audit --no-fund` | Clean install passed; 18 dependency packages installed. npm reported the esbuild postinstall allowScripts warning; the subsequent actual builds worked. |
| `npm run dev -- --port 5181` | Dev scene and controls launched during implementation; stopped before production smoke. |
| `npm run check` | Final source passed strict typecheck, **18/18 tests**, and production build. This includes the final conservative rib-collider radius change. |
| `npm run preview -- --port 5181` | Actual production artifact loaded in isolated Linux Chromium, including the final main asset `assets/index-UKKifhai.js`. |
| `git diff --check` | Passed before staging the author handoff. |

`npm run typecheck`, `npm test`, `npm run build`, `npm run dev` and `npm run preview` are also available separately. Vite uses a relative base; the static bundle has no remote assets, fonts or API dependency. Final build: 476 modules; main JS 1,128.19 kB / gzip 278.41 kB, CSS 8.94 kB / gzip 2.92 kB. Vite emits a main-chunk size warning above 500 kB; this is a remaining optimization concern, not a failed build. Babylon imports are scoped to used modules rather than the broad core barrel.

The tests compile and execute with Node's test runner. Ten tests exercise exact save round trips, invalid JSON/shape/ranges/discriminants, unsupported schema/content, oversize/dates, failed atomic writes, rejected imports, previous-generation recovery/repair, stale tabs and unavailable storage. Eight exercise deterministic normal frame schedules, paused/reset clocks, bounded stalls, immutable/clamped commands, high-speed thin-wall sweeps/sliding, the pod out-and-back route, water/island transitions, seabed/bounds and neutral buoyancy. Pure-system tests use controlled fixtures; they are distinct from the ordinary-input browser observations below.

## Concrete production contracts

The coordinator reconciled these seams during implementation. Exports here describe the actual candidate, rather than speculative complete systems.

| Path | Contract |
| --- | --- |
| `src/content/registry.ts` | `CONTENT_VERSION`, `REGIONS`/`RegionId`, `MATERIALS`/`MaterialId`, `HULLS`/`HullId`, `REMOTE_TOOLS`, active `PLACES`/`PlaceId`, `ASSETS`. Stable IDs, region/source references and original-art metadata share one authority. |
| `src/sim/types.ts` | Plain `WorldPose`, `PlayerState`, `GameState`, `GameCommand`, `GameEvent`, `WorldQueries`, capsule/movement result. No DOM/Babylon objects. Commands are bounded move/look requests; events report committed mode changes or boundary contact. |
| `src/sim/state.ts` | `createGame()` creates a pod-deck session; `eyeHeight()` is the view offset. Future inventory/containers, knowledge, resources/facilities, vehicles/docking and recovery are explicitly empty/null. |
| `src/sim/clock.ts` | `FixedStepClock.advance(now, active, update)` and `reset()`. Fixed 1/60 s, at most eight updates per frame; elapsed capped at 0.15 s and excess discarded. |
| `src/sim/world.ts` | Shared analytic terrain, pod deck/ramp and rib layout; `createWorldQueries()` supplies terrain/support heights and continuous conservative capsule-proxy sweeps/sliding. The renderer consumes these same layout authorities. |
| `src/sim/step.ts` | Pure `stepGame(state, commands, world)` returns `{state, events}`. Walking/swimming, view-directed swimming, jump/rise/dive, neutral stationary swimming and small terrain travel slices. |
| `src/save/codec.ts` | `SaveEnvelope`, `SaveMetadata`, `Result`, schema/content constants, `decodeSave`, `encodeSave`, `createEnvelope`. Writes are validated too. |
| `src/save/repository.ts` | `StoragePort`, `SaveSlot`, `SaveRepository`, `LOCAL_SAVE_KEY`; one atomic journal commit containing both valid generations. |
| `src/render/renderer.ts` | `createRenderer(canvas)` returns `present`, `setQuality`, `resize`, `dispose`. Explicit Babylon right-handed scene, WebGL2 requirement, procedural art and shaders. |
| `src/runtime/{app,input}.ts`, `src/ui/view.ts` | `SiltwakeApp` owns create/update/present/dispose, adapters, pause/resume and session replacement. Input emits commands; UI routes actions through that owner. HMR/pagehide disposal clears event listeners, render resources and held controls. |

Coordinates are **right-handed metres**, Y up, water Y=0. Yaw zero faces -Z; positive yaw turns toward +X; positive pitch looks up. The saved player pose is the upright capsule base in `frame: 'world'`; the camera adds an eye height. Depth follows world water height. No vehicle/interior-local poses or carrier transactions are claimed by these foundation declarations.

## Save compatibility and preservation policy

Only `format: 'siltwake.save'`, schema **1**, content **`foundation.1`** is readable. No legacy migration exists. Old/new/unknown schemas or other content versions are rejected and preserved. Later features require an explicit reviewed v1 migration; fields cannot silently accumulate inside the reserved empty collections. Decoding validates all allowed keys, discriminants, finite bounded numbers, dates and collection emptiness. Import limit: 1 MiB.

`siltwake.save.journal.v1` is a single localStorage value containing `current`, `previous` and a preserved unreadable record when repaired. One `setItem` is the commit point, so a storage refusal cannot half-update current and backup. Reads/writes compare the previously observed raw value to reject a stale tab. Invalid imports do not write. A corrupt/unsupported current can offer the previous valid generation with automatic saving blocked; explicit repair preserves the unreadable raw record. Oversized protected records are refused rather than overwritten. New/import replacement has an explicit confirmation. Raw-journal export is for safekeeping and is not an ordinary importable save.

Autosaves occur every 30 active simulation seconds for a writable session. Pause/background time does not count. Local storage failure is reported with an export route; gameplay can continue without a writable slot. Browser storage is origin-specific; exported JSON is the portable copy.

## Browser environment and method

Read `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md` before browser use. Verified browser ownership on **factory-worker**, Linux, user `worker`, with the T3 chrome-headless-shell processes locally visible. Used the task-owned incognito T3 tab on `http://localhost:5181/`; preserved the coordinator's blank tab and shared browser host. No Windows browser or physical desktop cursor was driven. Temporary task-owned focus-test tab was closed.

Browser: Linux x86_64 Chromium **154**, viewport **1280×800 CSS pixels**, device pixel ratio **2**. Renderer reported WebGL2 using **ANGLE / Google Vulkan SwiftShader Device (Subzero)**. Host CPU: **12th Gen Intel Core i5-12400**, six exposed CPUs. This is software rendering evidence, **not** representative dedicated-GPU performance or an FPS qualification. Live renderer reported **12 batched meshes / 79,005 vertices**. Rich canvas was 1280×800; Light was 853×533, so the quality choices were observably distinct at DPR2.

Gameplay paths below used actual T3 click/key/file-upload actions: WASD, arrow look, R forward cruise, C dive, Space rise, menus and import controls. Readonly DOM datasets and local-journal reads provided observations. No gameplay state injection, inventory grants, teleportation or save fixture posing was used to obtain the movement routes/captures. The one synthetic blur diagnostic is identified separately.

## Observed ordinary-input results

- New expedition with existing progress showed replacement confirmation. The old slot remained until explicit start. Starting wrote the new local slot immediately.
- Left pod deck, swam and dived into reef water, stopped at a stable underwater depth, and returned through the submerged ramp. With the final corrected pod geometry, observed outbound `(0, -0.744, 2.943)` swimming; after arrow turn and cruise, `(0.183, 0.180, 13.995)` walking. Further forward input stopped at `(0.307, 0.180, 18.660)` against the pod shell. The amber ramp is a usable return surface, not just decoration.
- Continued from deck toward the island: `(2.372, -0.254, -36.638)` walking at the shore, then `(2.903, 7.081, -47.245)` on dry island. The final-build repeat reached `(0, 11.086, -51.881)` walking. Normal arrow look to yaw 3.10 then produced the useful sea/pod overview. The preceding ground-filled island image looked uphill; no camera defect was inferred from it.
- Paused through Esc: tick **7513** and presented frames **1929** stayed exactly unchanged across more than 40 seconds/read operations. Quality changes produced one requested redraw each without simulation ticks. Final-build island pause also left the menu at tick **3841**.
- Saved while paused at tick **7513**, pose `(-7.614, -3.286, 0.223)`, yaw `4.4581853`. Actual page reload → Continue → Esc retained the exact tick and pose. Export downloaded valid schema1 JSON.
- Actual file-upload imports of malformed JSON and future schema99 produced readable errors, no replacement confirmation, and **byte-for-byte unchanged whole local journal**. Paused tick **7546** also stayed unchanged. Uploading the valid exported file showed confirmation; accepting restored exact tick **7513** and pose, with the previous valid generation retained.
- Explicit **Resume with locked mouse** successfully requested pointer lock in this isolated Linux tab. Escape released it and paused with the readable “Mouse released” reason. Lock was never requested implicitly.
- The final production navigation loaded local JS/CSS/shader resources successfully. Early dev iteration had a fixed vertex-UV mismatch and Vite optimized-dependency reload 504s; those historical console entries persisted in T3 snapshots and are not final production-navigation failures.

Opening another headless tab did **not** produce actual focus loss: the game still reported visible/focused. Therefore real host focus-switch behavior is **not browser-verified**. A separately labelled diagnostic `window.dispatchEvent(new Event('blur'))` did exercise the pause adapter: menu, “lost focus” reason, cruise cleared, tick5158/frames1556. Pure clock tests verify interruption/reset behavior. That synthetic event is not ordinary-input evidence of a real focus transition.

## Captures and files

Paths below are actual author artifacts on this worker. Captures illustrate a foundation, not campaign completion or GPU performance. Earlier captures are labelled where subsequent visual corrections matter.

| Artifact | Location |
| --- | --- |
| **Final-build dry-island view toward sea/pod** | `/home/worker/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mvcijskw-8b2b7875.png` |
| Corrected pod hatch / ordinary ramp return | `/home/worker/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mvcicmq9-f602c913.png` |
| Corrected underwater atmosphere | `/home/worker/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mvci4lwt-30d8a30f.png` |
| Shore transition | `/home/worker/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mvci8tb8-815ff0d1.png` |
| Dry island looking uphill (ground close-up) | `/home/worker/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mvciawng-18df3144.png` |
| Production menu; before later pod/tint corrections | `/home/worker/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mvchwnkd-c15a5b01.png` |
| New game → reef swim/dive video; before underwater tint correction | `/home/worker/.t3/userdata/attachments/9604e156-62da-418c-98f6-73a49ed8de4d-59b88e3b-bded-41c2-ace9-1c6d97fb0f12-mp4.mp4` |
| Deck → island shore video; before pod hatch geometry correction | `/home/worker/.t3/userdata/attachments/9604e156-62da-418c-98f6-73a49ed8de4d-ff662b96-cbe6-435b-ae1e-5d4749c6bc4a-mp4.mp4` |
| Exported save (1216 bytes) | `/home/worker/.t3/userdata/server-browser/downloads/50082c9477b9f5f208a8e83f03f435646b71f59cb9c19f2d219f27b10868d691/89bc637b-e392-4183-9e0a-c40b25e50cf0` |
| Browser upload fixtures (valid copy, schema99, malformed JSON) | `/tmp/siltwake-fnd01-smoke/{valid,future,corrupt}.json` |

Art provenance: original typed procedural generators, palette, cel/caustic/sky/water shaders and SVG identity. Design language adapts the repository's original richer-cel study at `20711d1`; it does not import that throwaway viewer or its different water coordinate system. No commercial/copied assets, downloaded fonts or generated raster stand-ins are used. `ASSETS` records source, dimensions, pivot, role, materials and region.

## Remaining review and verification gaps

Coordinator acceptance and both required independent reviews remain pending. Real host focus loss, actual hidden-tab transitions, context-loss/recovery, WebGL-unavailable behavior and browser-level storage quota refusal have not all been exercised in a production browser. Clock and repository unit tests cover their pure boundaries; those are not substitutes for every adapter/browser condition. Context loss explicitly gates active simulation and Resume in code. No claim of full browser compatibility is made from one Chromium software-renderer run.

The island surface and foundation reef density are early art; the coordinator plans further first-expedition iteration. Colliders are conservative proxy solids, not detailed craft/interior physics. Main JS size still triggers Vite's warning. No dedicated-GPU profile, fresh-player enjoyment/duration result, ten-hour playthrough, start-to-ending route, functional carrier, fleet recovery or later milestone acceptance exists. Those remain separate required work rather than conclusions drawn from this foundation.
