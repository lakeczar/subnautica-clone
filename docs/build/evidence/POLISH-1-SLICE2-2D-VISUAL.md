# POLISH-1 slice2 — hunter warning render leaf

Author deliverable complete; coordinator assembly and the full-slice independent gate remain pending. This leaf improves the existing warm fins/eyes when the animal is in view. It does **not** make the hunter visible at the retained ordinary warning checkpoint: it remains below the viewport.

## Identity and boundary

- Clean committed parent, verified before changes: **`c6da74249db4339f800d618f4126414c6682bc02`**.
- Source/test commit: **`afc126a059c965c273fd20f8ff41bd40a817aa37`**. Evidence is a separate subsequent commit.
- T3-owned worktree: `/home/worker/.t3/worktrees/subnautica-clone/t3-ca616de7`, branch `t3/hunter-warning-visibility`.
- Actual session `/home/worker/.codex/sessions/2026/10/18/rollout-2026-10-18T05-34-57-01a14e94-30fa-7a72-80b0-eb59d7318958.jsonl` reports `model: gpt-6.1-sol`, `effort: max`, and matching collaboration settings. Extract retained in `runtime.json`. The live catalog's provider defaults are not used as runtime proof.
- Changed paths: `src/render/expedition.ts`, new `tests/encounter-art.test.ts`, and this report only. No public API change or essential extra-path proposal. No children, peer polling/messaging, parent edits, push, PR or merge. Preparation 2C was neither inspected nor mutated.
- Direction: STATUS/PLAN/CONTRACTS, revised build input/specification pointers, slice2/visual brief, Opus R2/disposition and T16. Notice priority, direction, air, obstruction, pulse-cost UI and contrast remain later app/HUD work.

All artifacts below are under **`/tmp/siltwake-polish-1-slice2-2d-visual/`**. Full archive: [artifacts.tar.gz](/tmp/siltwake-polish-1-slice2-2d-visual/artifacts.tar.gz), **11,542,291 bytes**, SHA256 **`a9e3b79f85488ea2b93cb95134d33399444e6a79dad5cdf1ce72d3c6edd28f2e`**. Its 264 payloads plus manifest are regular files with safe relative names. [manifest.json](/tmp/siltwake-polish-1-slice2-2d-visual/manifest.json) SHA256 **`822dc281f9bc06836776b0f31c1d21700b2f21b295ec061ec4c9067d5725049d`**. It retains source snapshots/patch, immutable builds, harnesses, exports, logs, actual PNGs/clips and derived motion samples.

## Implemented display

Existing eye-glow vertices, coral outer fin membranes and warm fin veins use the existing scene-owned cel material and its alpha `-1` emission convention. The violet body and inner fin panels retain their authored colors/lighting. Alert modes `warn`, `investigate`, `pursue` share a continuous **0.75 Hz** sine pulse: `1.18 + 0.10 × sin(2π × 0.75 × tick/60)`, hence **1.08–1.28 local RGB gain**, period **80 ticks / 1⅓ simulation seconds**. The shared shader's existing emission multiplier remains 1.12; it still applies ordinary optical fog and opaque depth testing.

Idle/disengage/null restore exact original RGB and alpha. Current state/time fully determine the result, including replacement with an earlier warning save. Repeated presentations at the same simulation tick do not advance it. No transition timer, wall-clock phase, new behavior, shader uniform, mesh, material, outline, light or geometry was added. Existing hunter and fin animation statements remain unchanged.

The three existing color buffers become updatable once at construction. Six retained Float32 arrays hold original/current colors; selected offsets drive updates without new per-frame buffers. Mesh disposal removes its retained entry and leaves the shared material alive. No new public disposal surface is needed; meshes remain scene-owned.

Before/after near imagery and sampled motion were inspected before freezing these values. The warm display becomes more even across the existing fins while retaining the purple animal form; the brightness modulation remains modest. These are author visual judgments, not human detection or comfort measurements.

## Build and browser attribution

| Artifact | Baseline `c6da742` | Final source `afc126a` |
| --- | --- | --- |
| `expedition.ts` SHA256 | `7043f19fc5bda06bcabef97a4def97d3fd59b69a3880edfd6b4423f5435a8134` | `230750fb12801778bed63ad0a705ec046881d46c9d4f5754b26a77270410e5da` |
| Actual production main JS | `index-ER3hOea_.js`, 1,352,610 B | `index-DBvxelWQ.js`, 1,353,335 B |
| Main JS SHA256 | `d10145aa22f8646857560ba934eea6ef9f6678358b9cfe7336182efa40104ebc` | `d458327cdf2d14ef8715d42b5456a2544a053e9576a613fb5a24125eab6b5045` |
| Temporary diagnostic main JS | `diagnostic-KwVruD0k.js` | `diagnostic-CEnYmKvz.js` |
| Diagnostic JS SHA256 | `90e4854e2f43f9044528e8af20eb5e8df5f9d833106b07b003eb34e44b7eaf59` | `b8054ccb450535c9b3e426d5c41a8c2898c21a45cb4e5a5bf303697b1b501c26` |

Actual browser resource URLs, byte lengths and fetched-byte digests are in `{baseline,final}-browser-loaded.json` and `{baseline,final}-diagnostic-browser-loaded.json`; they match disk bytes. CSS is unchanged: `index-DQmb9CLB.css`, SHA256 `bc50e2130be0d62a166ee89a578a46aabce0cf0c878a49737da5b4c6c310e18b`. New test SHA256: `c09c1c8bf0aa0527b7325c5a6877a1ba2f9a5692c709b7cf8c1b23096f6ca801`.

Both browser-rule files were read before preview work. T3 status/open created only owned incognito tab `tab_2x_0430977b-1ed3-45f2-ac72-3683f9fe8942`, isolated origin `http://localhost:5192`. The actual shared browser process was verified as Linux PID827911, executable `/home/worker/.t3/tools/chrome-headless-shell/linux64/154.0.8037.92/chrome-headless-shell`, parent T3 PID811435 on factory-worker. UA reports Linux Chromium154; WebGL reports ANGLE Vulkan SwiftShader/Subzero. This is process plus runtime evidence, not hostname alone (`browser-process.txt`, `browser-runtime.json`).

Matched views use **1280×800 CSS viewport, Rich quality, 1280×800 engine canvas, DPR2**, original FOV1.02/near0.07/far450 and production camera/optics. T3 records 2560×1600 variable-rate video; its container frame-rate fields and tool wall times do not measure game performance. The temporary diagnostic bundle calls the production renderer/factories; its extra probes/rebuild control remain outside shipped source/UI.

## Earned-import continuation

The original `/tmp/siltwake-m1-play-presentation/saves/canopy-pre-warning.json` remains unchanged, SHA256 **`3df46ef510e589675a422ebfbc62aaafcb626ecf3c89276c42cd5c03c219d305`**, tick9304. It was imported through production Import/confirmation separately into baseline and final builds. This is continuation of that earlier earned outing, not fresh preparation or whole-game proof.

Page-local keyboard events drove the production input handlers. A temporary rAF scheduler fed four fixed ticks per requested frame; it accessed no game state and granted/teleported nothing. Export blobs were observed at the ordinary production Export button and retained before navigation. `ordinary-hook.js` documents that instrumentation. Blob observation and clock scheduling do not constitute real-mouse or real-time play evidence.

| Inputs after import | Observed exported checkpoint | Result |
| --- | --- | --- |
| W+C, 60 frames ×4 ticks =240 ticks | 9544 | warn, modeSeconds0.55, interest1.184 |
| Resume, W+C another240 ticks | 9784 | investigate, modeSeconds1.533333…, interest5.024 |
| Resume, S+Z+Space160 ticks | 9944 | disengage, modeSeconds0.183333…, interest2.090666… |

Pause/export/resume boundaries add no simulation ticks. Baseline also contains an unsuccessful paused resume attempt and a paused input block; neither advanced state. Final added30 paused frames at9784 and exported again: the entire state is unchanged. Resume then reaches the same9944 state. No turn, pulse, inventory grant, actor relocation or debug state setter was used in either ordinary branch.

**All three complete final exported states exactly equal their baseline counterparts**, not just threat/player fields. `ordinary-{baseline,final}-{warn,investigate,disengage}.json`, `ordinary-final-paused.json`, input traces, `artifact-comparison.log` retain this. A separate offline replay of the same640 production steps reproduces all three complete UI exports and identifies transitions9511 warn,9692 investigate,9933 disengage (`earned-replay.json/.log`). Those transition ticks are offline reconstruction; the table records directly observed exports.

Ordinary source-attributed captures:

- Baseline [warning still](/tmp/siltwake-polish-1-slice2-2d-visual/baseline-ordinary-warn.png), [approach clip](/tmp/siltwake-polish-1-slice2-2d-visual/baseline-ordinary-approach.mp4).
- Final [warning still](/tmp/siltwake-polish-1-slice2-2d-visual/final-ordinary-warn.png), [approach clip](/tmp/siltwake-polish-1-slice2-2d-visual/final-ordinary-approach.mp4), [late motion samples](/tmp/siltwake-polish-1-slice2-2d-visual/final-ordinary-warning-motion-samples.png).

At9544 the real camera is **(91.310678,−67.815568,−87.601174)** and the hunter remains at **(132,−112,−113)**, distance **65.214917m**. Its mesh is outside the actual frustum despite a clear simulation LOS. Estimated projected body bounds are **X1024.65–1146.08 / Y1065.21–1238.63px**, below the800px viewport; fins are also below it. Existing density0.009 gives estimated fully wet transmission **55.60%**. At9784 it remains outside the frustum, distance36.693455m. No on-screen animal/readability claim follows. Exact camera/optics/frustum/LOS/projection diagnostics match between builds (`*-ordinary-probes.json`).

Ordinary still differences are confined to the existing toast/shadow area X386–893/Y694–799: baseline wall-clock toast expiry occurred before its capture, final warning toast remained visible. Scene pixels outside that area match exactly. This leaf changes no toast behavior; simulation checkpoints are matched, tool wall-time and toast expiry are not.

## Separate seeded visibility fixtures

These are labelled renderer-only placements, not discoveries or earned encounter behavior. The original state is cloned, player set to swimming and placed for the diagnostic, hunter retained at its existing home (132,−112,−113), mode/tick selected explicitly. Production renderer computes the camera from that state. No water, camera optics, terrain, animal geometry or bounds is altered. Common still tick9600; probes use the actual camera.

| Seeded view | Actual camera XYZ | Distance | Frustum / simulation LOS | Estimated wet transmission |
| --- | --- | ---: | --- | ---: |
| Near | 140,−111.95,−128 | 17.000074m | in / clear | 84.06% |
| Far | 162,−111.95,−173 | 67.082058m | in / clear | 50.41% |
| Foreground occluder | 96,−111.95,−118 | 36.345598m | in / blocked | 68.99% before occlusion |
| Deep fog | 162,−150,−173 | 77.097341m | in / clear | 22.18% |

The occluder is the actual existing CANOPY_COVER rib, X103–109/Y−145…−73/Z−122…−115, with its authored opaque mesh. The deep fixture is above the actual seabed; density **0.019530919** is unchanged production optics. Transmission is `exp(−density × camera-distance)` for these wet rays, an estimate of retained unfogged contribution, not a visibility/detection probability. LOS/frustum do not establish human readability.

| Still | Baseline | Final |
| --- | --- | --- |
| Near warn | [before](/tmp/siltwake-polish-1-slice2-2d-visual/baseline-seeded-near-warn.png) | [after](/tmp/siltwake-polish-1-slice2-2d-visual/final-seeded-near-warn.png) |
| Near idle | [before](/tmp/siltwake-polish-1-slice2-2d-visual/baseline-seeded-near-idle.png) | [after](/tmp/siltwake-polish-1-slice2-2d-visual/final-seeded-near-idle.png) |
| Far warn | [before](/tmp/siltwake-polish-1-slice2-2d-visual/baseline-seeded-far-warn.png) | [after](/tmp/siltwake-polish-1-slice2-2d-visual/final-seeded-far-warn.png) |
| Occluded warn | [before](/tmp/siltwake-polish-1-slice2-2d-visual/baseline-seeded-occluded-warn.png) | [after](/tmp/siltwake-polish-1-slice2-2d-visual/final-seeded-occluded-warn.png) |
| Deep warn | [before](/tmp/siltwake-polish-1-slice2-2d-visual/baseline-seeded-deep-warn.png) | [after](/tmp/siltwake-polish-1-slice2-2d-visual/final-seeded-deep-warn.png) |

Baseline/final [mode clips before](/tmp/siltwake-polish-1-slice2-2d-visual/baseline-seeded-modes.mp4) / [after](/tmp/siltwake-polish-1-slice2-2d-visual/final-seeded-modes.mp4) use eight samples each: warn9600–9635, investigate9640–9675, pursue9680–9715, disengage9720–9755, idle9760–9795, five ticks per sample. Final has a labelled previous-view pre-roll frame before the matched near sequence. The normal disengage-facing change remains visible. [Baseline depth/occlusion clip](/tmp/siltwake-polish-1-slice2-2d-visual/baseline-seeded-depth-occlusion.mp4) / [final](/tmp/siltwake-polish-1-slice2-2d-visual/final-seeded-depth-occlusion.mp4) each sample deep, far, then occluded at9600–9675. Wall playback durations vary; simulation samples match.

The final [pulse/pause clip](/tmp/siltwake-polish-1-slice2-2d-visual/final-seeded-pulse-pause.mp4) advances near warn9600–9715, presents the same9715 state16 times with PAUSED labelling, then resumes9720–9835. This seeded renderer hold is complemented by the actual production pause/export check above. Actual final stills and [mode](/tmp/siltwake-polish-1-slice2-2d-visual/final-mode-motion-samples.png), [pulse/pause](/tmp/siltwake-polish-1-slice2-2d-visual/final-pulse-pause-motion-samples.png) and [depth/occlusion](/tmp/siltwake-polish-1-slice2-2d-visual/final-depth-occlusion-motion-samples.png) samples were inspected. Continuous human motion viewing is not claimed.

Exact-phase stills `final-phase-{9600,9620,9640,9660,9680}.png` supplement81 actual retained-color samples over one80-tick period (`candidate-pulse-samples.json`, same final source bytes). Float32 measured gain spans **1.07999997–1.27999997**. After excluding the diagnostic label band, near idle and occluded stills have **zero differing pixels**; near warning differs only in1,767 pixels within X508–775/Y351–378, far warning140 pixels, deep warning380 pixels (`pixel-comparisons.json`). Deep fog still substantially subdues the animal; ordinary warning remains off-screen. This is bounded image evidence, not a human readability threshold.

## Geometry, resources and lifecycle

All114 idle scene mesh fingerprints match exactly: position/normal/color attributes, indices, local transforms, local bounds and material associations. Warning actor/fin local/world transforms and bounds also exactly match. See `*-scene.json`, `*-warning-bounds.json`, `scene-comparison.log`. Other expedition source art is byte-identical; the only authoring-line adjustments retain the existing fin-face vertex counts for selection.

At near warn9600, hunter body local bounds remain **(−3,−1,−4.044995)…(3,2.7,4.5)**. Union world AABB of body and fins remains **(127.136363,−113.126692,−118.033642)…(136.585719,−109.174847,−107.598909)**. Physical query shape remains radius1.2/height1.8/default bottom0 at(132,−112,−113), canonical proxy AABB **(130.8,−112,−114.2)…(133.2,−110.2,−111.8)**. The pre-existing art extends beyond that collision proxy; neither is resized. Simulation source, timings and encounter responses are unchanged.

| Scene/resource metric in matched fixture | Before → after | Delta |
| --- | --- | ---: |
| Meshes / geometries | 114/114 →114/114 | 0/0 |
| Materials / scene textures | 18/13 →18/13 | 0/0 |
| Scene vertices | 304,683 →304,683 | 0 |
| Hunter body / each fin vertices | 1,871/135 →1,871/135 | 0 |
| Live GPU buffer objects | 454 →454 | 0 |
| Estimated attribute/index bytes | 16,911,584 →16,911,584 | 0 |
| Existing hunter color buffers | 3 static →3 dynamic, total34,256 B | 0 live buffers/bytes |
| Additional meshes/materials/draw submissions | 0/0/0 | 0 |

The new code retains **68,512 bytes of Float32 storage** in six arrays, plus **724 numeric offsets** and three small entries. It selects462 existing eye vertices and131 vertices on each fin; body/inner-fin colors stay unchanged. JavaScript heap/driver VRAM delta is not measured; the raw storage and GPU-byte estimate above are explicit bounds/counts, not a hardware memory profile. Construction replaces/disposes three original static color buffers once; updates reuse their replacements and CPU arrays.

The new behavior/lifecycle regression covers four scene constructions,8,000 advancing updates, alert-mode continuity, deterministic repeated/replaced states, pause/null/release restoration, unchanged geometry/non-hunter colors, finite transforms/colors, stable buffer identities/counts, attachment and shared-material survival. It tests behavior rather than palette literals. NullEngine's texture-release stub is not used as GPU cleanup proof.

Actual WebGL probe `final-resource-probe.json` records **96 advancing +20 same-tick presentations**, stable CPU/GPU buffer identities and counts, finite scene transforms/colors, **zero createBuffer/deleteBuffer calls during those116 presentations**, and exact null restoration. Disposing the owned body/fins removes three meshes/geometries and12 buffers (454→442), disposes all three color VertexBuffers and preserves shared cel/material count18. The intervening null→earned-state replacement rebuilds the existing Dart art:1,356 transient buffer creations and1,356 deletions balance, followed by the12 owned deletions. Those replacement allocations are existing vehicle behavior, not per-frame pulse allocations.

Three real renderer rebuilds each return to114 meshes/18 materials/114 geometries/304,683 vertices; each old scene has0 meshes/materials/geometries/textures and a disposed engine. No resource growth was observed across them. The temporary rebuild/probe helpers are not shipped.

## Checks, cleanup and limits

Fresh `npm ci`, `npm run check` (**322/322 tests**, strict typecheck and production build), `node docs/build/design/check-economy.mjs`, `node scripts/check-m1-economy.mjs`, `git diff --check`, complete-state/checkpoint comparisons and geometry/resource comparisons pass. Logs: `npm-ci.log`, `check.log`, `encounter-art.log`, `economy.log`, `m1-economy.log`, `artifact-comparison.log`, `earned-replay.log`. The existing large-main-chunk build warning remains. No unrelated historical matrix was rerun.

All recordings were stopped. The owned renderer was disposed, owned tab closed through T3 lifecycle, owned5192 server stopped with Ctrl-C (exit130), and no5192 listener remained. Shared Linux browser host, other ports/tabs including historical tab14, prior saves/artifacts and peer resources were preserved (`cleanup.json`).

This is bounded render author evidence, not slice2 acceptance. Root must assemble with2C/later HUD work and obtain fresh non-author Astra xhigh/Sol max full-slice review, then stage1 Opus. No UI/notice correctness, audible mix, human detection/enjoyment/duration, real-mouse comfort or dedicated-GPU performance claim. The complementary call-direction cue and ordinary approach composition remain later work; fog and off-screen/solid occlusion limits remain intact.
