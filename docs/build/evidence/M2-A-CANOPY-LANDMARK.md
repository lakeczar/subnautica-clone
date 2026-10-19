# M2-A Canopy landmark — implementation evidence

Source **dc5d67c75b3fd3b6d18ed08718f39206edfeaa3d** adds an elevated living fork, two sparse attachments and a flush holdfast on the existing rock. This bounded leaf is ready for coordinator inspection. It does not claim feature or M2 acceptance. The controlling authority is [the encounter reconciliation](M2-A-ENCOUNTER-DIRECTION-INTEGRATION.md), with [the leaf brief](../tasks/M2-A-CANOPY-LANDMARK.md).

The original runtime `turn_context` is **gpt-6.1-sol / max**, cwd `/home/worker/.t3/worktrees/subnautica-clone/t3-567c62e8`; T3 binding is the same checkout on `t3/m2-a-canopy-landmark`. The original session is `01a152fc-473e-7683-ba82-eb7ff79688e8`, first context at `2026-10-19T07:07:07.817Z`. The clean parent is exactly **d9f09dc6a18e13fafd70496c4c6bb9743fbe53a6**. Its production/test/config inputs equal **b91cde9e2956ce36ec9e4e7901332f7ebf1257cc**. Original runtime/binding/clean-tree receipts are retained in the artifact directory. No children, peer communication, parent mutation, push, PR or merge occurred; the correctness worker's unfinished files were not consumed.

Only **src/render/expedition.ts** changed: 44 added lines in two insertions inside static `suspended_garden` region construction. `tests/m2-region-render.test.ts` stays unchanged: its region/cache/lifetime checks are meaningful already; decorative-coordinate assertions would duplicate implementation. There are no simulation, physical-cover, world, save, hunter, vehicle, actor-update, camera, material/shader, lighting, audio or UI changes. Source slicing verifies unchanged vehicle helpers and the complete actor/update suffix; all other 107 archived source/test/config/checker inputs match the parent. The evidence commit adds only this report.

All artifacts below are relative to **`/tmp/siltwake-m2-a-canopy-landmark/`**. `README.md` gives reproduction instructions; `PAYLOAD-MANIFEST.json` hashes the payload and `SEAL.json` records its archive. Original composition/direction artifacts remain read-only. `raw/source-build-receipts.json` contains 108 exact inputs per revision, 27 baseline and 27 final build files, 49 baseline and 96 final compiled files. All final served build bytes equal the `npm run check` build; archived compiled files equal the check output.

| Identity | SHA256 |
| --- | --- |
| Baseline expedition.ts | `dd57d3c0cc0189eaf99c8f78e8592a86cd9bca0b73e0c9506ed23770d136a117` |
| Final expedition.ts | `60ad21e5d7f80ef4c12f37d4bf0f281ae6b0d95d76f8be5536ce38807a1631bf` |
| Frozen vehicle helpers | `e16395ba5c3cecb37856350e48a860f9129adeb88c964f02da2e14d7127d6e02` |
| Frozen actor/update suffix | `5e71dc73f51b43154cb405e6efbc027d85951d7650228824a0008ceec01dbc63` |
| Baseline assets/index-CNubbEhE.js | `6f493b992a5a7c6bf543acb65b8464ab813f8dca2fa6edb3599297fb3de3539b` |
| Final assets/index-D5ToFSod.js | `af22f013e8679de8707b537632a09050ce163684a05d1ef6af3cb68ad042e911` |
| Final dist/index.html | `ebdabeb0fff119dd02cdb4d85cb038516ebc79e0d93ff710996671841b410e41` |

The fork derives from unchanged `CANOPY_COVER`, X103..109 / Y−145..−73 / Z−122..−115. `forkX=106`, `forkZ=−118.5`, and `forkAt(x,y,z)=(106+x,−73+y,−118.5+z)`. It is roughly 4m wide / 3m deep / 2.6m tall near Y−49. Two unequal pale inflated tips maintain a split silhouette when the cupped membranes are edge-on. This replaced the first membrane-only trial, which looked too much like a thin wire Y. Existing jade/shell/petrol colors supply shape/value contrast; no animation or color change is necessary for identification.

| Part | Final constants |
| --- | --- |
| Left cupped frond | forkAt offsets `(−.15,22.8,.2),(−.9,23.45,−.5),(−1.7,24.4,−.9),(−2,24.8,−.95)`; widths `.12,.55,.62,.025` |
| Right cupped frond | offsets `(.15,22.8,.15),(.9,24,.65),(1.4,25.1,1),(1.7,25.3,1.15)`; widths `.12,.6,.55,.025` |
| Frond cross direction | `(.52,0,−.85)`; existing `P.jade/P.shell` |
| Pale lobes | offset `(−1.35,24,−.78)`, radii `(.67,.72,.58)`; offset `(1.12,24.45,.82)`, radii `(.65,.95,.62)`; eight segments |
| Dark fork spine | left tip through left frond centres, `(0,22.8,.2)`, right centres to right tip; radius `.085`, six sides, `P.petrol` |
| Pale attachment | world points `(105.8,−50.2,−118.3),(104.75,−55,−118.15),(104.5,−61,−117.9),(103.45,−68,−115.85),(103.3,−72.985,−115.7)`; radius `.1`, six sides, `P.shell` |
| Jade attachment | `(106.35,−50.2,−118.25),(105.7,−55,−117.4),(105.25,−61,−116.9),(103.85,−68,−115.35),(103.6,−72.985,−115.15)`; radius `.085`, six sides |
| Crest/north holdfast | flush crest patch X103..103.65 / Z−115.8..−115 / Y−72.986; north patch Z−114.986 / X103..103.45 / Y−73..−75.2 |
| West holdfast | X102.986; `(Z,Y)` path `(−115,−73),(−116.1,−75.2),(−119.8,−79),(−121.1,−82.5),(−121.2,−86)`; widths `.42,.35,.28,.21`, `P.shell` |

The attachment and narrowing seam lead toward the existing west flank. The X96..99 passage remains open. The fork has open water between/around its two tips and sparse strands, with no upper protective wall or new collision geometry. The actual rock remains the only cover at this location; `(98,−82,−121)` is not rendered as a marker or treated as an unconditional safe box.

The baseline/final matrix imports byte-identical retained composition saves through actual Import & save. `raw/original-inputs.json` records the original source files and copy equality. Important input hashes are:

| Input | Tick | SHA256 |
| --- | --- | --- |
| original-009.json, level approach | 10561 | `f27940f7e4ca0441e11ce2e49abce0fb4644deded0453b8513b723e8940bf2fa` |
| original-011.json, downward look | 10608 | `12060d53e0a501387da3237c2d2c0f313ff64ced1b7b9266e53c1c4a720b1c7f` |
| original-012.json, earned warning | 10904 | `89f010d565c2e4ba1947c9b0faf2af30af0e6ffdc3ee41f5b125eb750d6dc0e5` |

Actual T3 screenshots are `frames/{baseline,final}-{009,011}-{1280,960}-{rich,light}.png`; corresponding `raw/` receipts record canvas/HUD/renderer, pose/tick and viewport. Level009 pose is `(78.67008825063884,−53.64620629748181,−76.73003030425045)`, yaw `.9415926535897619`, pitch approximately zero. Down011 is `(78.67009030014866,−53.69453697812859,−76.73003179607998)`, same yaw, pitch `−.7000000000000002`. Both use production Dart cockpit/camera with drag mouse mode, muted audio and underwater WebGL2 rendering. No camera or HUD changes were made.

The author inspected actual images, including `comparison-{009,011}-{1280,960}.png` and grayscale crops. The fork is above the console and clear of the HUD in every level matrix image; its unequal paired lobes differ from the radial crowns. Screenshot luminance-difference bounds measure **72/71 CSS px** at1280 Rich/Light, **52.5/54 CSS px** at960 Rich/Light, exceeding the35px trial. T3 normalizes captures to1280×800; the960 conversion is explicit in `raw/pixel-readability.json`. `grayscale-fork-{1280,960}-{rich,light}.png` retains a visible split silhouette in still grayscale. These are actual screenshot measurements, not projected headings or bounding boxes.

Exact011 partly hides the attachment behind existing HUD/foliage at its original heading. That limitation remains visible in the matched images. An ordinary left/down turn from009 centers the tethers, crest and real west seam at10636, yaw `.5415926535897562`, pitch `−.54`; `final-centered-{1280,960}-{rich,light}.png` captures this. `final-west-edge-*` shows the true rock edge, pale seam and open west water at11186, `(98.14290025313747,−79.73695000418141,−120.73718950902841)`, yaw1.0415926535897633/pitch−.24. `final-exit-*` shows open return/up water beside the rock at11305, `(98.148743634752,−79.8586532441348,−120.75039513364416)`, yaw3.549777960769296/pitch.26. All three four-setting inspection matrices are retained. No claim that every pose exposes the entire attachment is made.

The final ordinary-control session is `11c05d99-28b1-4bea-98d5-23d58f719071`. It uses actual arrow/W/C keyboard controls and normal thrust, with observation/turning while unpaused. Navigation is **coordinate assisted and uses prior route knowledge**, with controlled rAF scheduling. It is not fresh-human learning or a real-time control-comfort test. There are no direct look/state commands, teleports or hidden simulation changes in these browser routes. Every input, frame batch, observation and exported Blob is durable in `raw/input-ledger.jsonl`; `raw/replay-steps.jsonl` derives per-step production movement, AI, cover, damage and charge. The exact label/export pairing is in `raw/checkpoint-index.json` and asserted by `scripts/audit-evidence.py`.

| Actual route | Immediate step before first cover | First true cover | Disengagement | Hull / health / power |
| --- | --- | --- | --- | --- |
| 009 approach | 11043, investigate, cover=false | **11044**, investigate; 8.05s from10561 | 11089, cover=true | Hull99.30205715200904 and health100 unchanged; power96.74643518518477→95.76347222222151 |
| 012 warning response | **11157, investigate, cover=false** | **11158**, mode becomes disengage on that step; 4.233333s from10904 | 11158, cover=true | Same unchanged hull/health; power96.21857407407364→95.64264814814726 |

009 inputs: observe30 ticks; left+down16; down11; observe18; left5; W180; W180; observe12; W+down10; W60; observe18; C30; observe30. Warning begins10848, investigate11029. Export11161 ends `(98.12939842740849,−79.45574024501659,−120.70667634833308)`. 012 inputs: observe24; left+up13; up7; observe12; W150; W75; observe30. Thus56 ticks/.933333s of ordinary observation/turning precede forward movement. Investigate begins11021; export11215 ends `(97.90520377215901,−80.22376648484693,−120.70398337628924)`. Both retain unchanged inventory, no pulse/cell command, no bite or impact event and no extra hull loss. Their final export hashes are respectively `b444762f2d21c815e3bba7c7dd98b8600f61d68d3a01260ffbf84bc7883b7a3f` and `34a04193967379952226cad216c448b4f27bc73833204e78ac533bfd76d97b97`.

Retreat is ordinary turning/up-look then forward thrust through open west/return water. Normal thrust out of009 shelter renews warning at11409. After the actual012 Save→reload→Continue, the longer return renews warning11503, investigate11684, then disengages11780 in open water; export11846 ends `(84.479,−68.950,−69.844)` without health/hull loss. Leaving cover is not presented as permanent safety. Original quiet012 retreat is reproduced separately: quiet+reverse+up20×100ms, coast3×100ms, quiet20×100ms after the resume clock initializer. Its export11162 has the complete original013 state, and **cover=false for all258 steps**, with disengagement11021. This is open-water retreat evidence, not shelter-response evidence.

`motion/final009-{approach,retreat}.mp4`, `final012-{response,retreat,original-quiet-retreat}.mp4` and `baseline009-matched-approach.mp4` / `baseline012-matched-response.mp4` retain actual screen motion. Six ffmpeg-seek samples per video were inspected; sample times and derived sheets are in `raw/motion-samples.json` and `frames/motion-*.png`. Video wall durations include tool delays/paused frames and controlled scheduling, so they are not human playtime. Baseline matched inputs produce exactly the same complete states at11161/11215 while visibly lacking the fork/holdfast.

Final offline replay uses frozen archived production modules and reproduces **29/29 complete exported states exactly, 3,279 simulation steps**, zero command actions/errors. The29 include named trial/lifecycle/inspection exports as well as the final routes. Actual native Save/reload/Continue preserves the entire state at11215; the additional idle export is11252, exactly37 steps later. An earlier note misread the lagging HUD11251 as36; the ledger correction and authoritative export are preserved. Independent save files have different `meta.savedAt` timestamps; state and all other envelope fields match. Raw export bytes are therefore not claimed identical across separate exports. Original imported files are byte-identical; production codec/simulation source bytes are unchanged. `raw/evidence-audit.json` reports every comparison and hash.

The browser ran on isolated **factory-worker Linux, Chrome154 / SwiftShader**, verified by actual process ancestry and GPU/browser observations in `raw/browser-processes.txt` and `raw/browser-hardware.json`. Both browser-rules files were read first. T3 preview_status preceded preview_open; one task-owned Incognito/storage-isolated tab and free port5191 were used. No Windows/desktop pointer lock was used. Setup failures are retained: initial server termination/one connection refusal recovered with the owned TTY server, and a same-name import selection failed to fire change. The latter paused inspection, session e21476cc seq97..125, is excluded. A byte-identical alias was imported through the actual confirmation control before valid exit captures; final exit receipts are notes175/179/183/187 and export193. A screenshot-copy command used unavailable `python`; corrected `python3` copies succeeded at unchanged pose/tick. No production workaround was added.

| Static Canopy cost | Baseline | Final | Delta |
| --- | --- | --- | --- |
| Meshes / geometries / materials / textures | 11 /11 /5 /3 | 11 /11 /5 /3 | 0 |
| Vertices | 95,547 | 96,622 | **+1,075** |
| Triangles | 149,496 | 151,052 | **+1,556** |
| Warm geometry cache entries | 81 | 81 | 0 |
| Warm geometry cache bytes | 22,709,776 | 22,807,896 | **+98,120** |

`facilities.canopy` changes3485→3509 vertices /2980→2992 triangles; `canopy.habitat` changes87280→88331 /140040→141584. Existing batches/materials are reused. Browser live scene remains96 meshes/96 geometries/14 materials/9 textures, with vertices285288→286363 and triangles467079→468635. Matched level/down draw counts remain19/36. The NullEngine probe performs two fresh constructions with ten regional updates each, repeated unload/re-entry, stable live counts, no render-state writes, cache bounds32MiB/256 and label cleanup. Double art disposal leaves0 meshes/geometries/textures/cache bytes and0 label references; two caller-owned materials remain until scene disposal. Probe selection positions are diagnostic, not ordinary travel.

Bounded NullEngine first-Canopy activation is baseline430.02/308.83ms versus final429.89/290.40ms across two fresh scenes; Canopy warm returns are baseline4.33..5.07ms versus final4.10..9.67ms. These are CPU NullEngine samples, not GPU/frame pacing. Actual browser first Canopy including initial setup is baseline558.5ms (later new page519.1) versus final541.0ms, actual Continue516.2ms and later inspection556.9ms. No performance win is inferred from variance.

Comparable browser lifecycle imports006→009→006→009 give baseline first island320.3 / first Canopy226.0 / warm island8.4 / warm Canopy11.2ms; final387.8 /261.1 /9.6 /12.9ms. These session replacements isolate region lifetime; they are not ordinary route traversals. `raw/browser-activation-attribution.json` and both region-probe files retain all samples, including earlier trials. Original production evidence remains attributed: first scene487.4ms, Canopy338.3ms, new-page Canopy761.1ms, first Basin90.5ms and warm return50.6ms. The50.6ms return exceeds the50ms trial, and first-use stalls remain open. SwiftShader evidence does not certify consumer-GPU pacing.

Final source verification ran **`npm run check`:516/516 tests, typecheck and production build pass**. Unchanged M1 and design economies pass. `git diff --check` passes. The unchanged completed-save M2 checker exits1 at the known C05/C06 clue-order assertion, line100; no output JSON is emitted. It is outside this leaf's ownership and is not reported as a pass. Commands/results are in `raw/check-receipts.json` and full logs. Fresh-checkout missing dependencies were resolved by pinned `npm ci`; the initial failed baseline build and corrected baseline compilation/config/probe setup are retained. The existing Vite large-chunk warning remains.

All owned recordings stopped. T3 normal lifecycle closed tab `tab_3y_0430977b-1ed3-45f2-ac72-3683f9fe8942`; subsequent thread preview list is empty. Ctrl-C stopped only server PID2531772/session53609; port5191 is free and that PID is gone. `raw/preview-release.json` and `raw/resource-release.json` record cleanup. T3's last20 download metadata are retained; native temporary paths cleaned by normal tab close are explicitly marked unavailable, with independently durable Blob text/exports retained in `saves/`. Shared/human/peer hosts were preserved. All leaf paths/resources are released at handoff.

Coordinator next inspects this source/evidence and composes it with the independent correctness change before the sequential hunter-contact leaf. Paired non-author Astra xhigh/Sol6.1 max acceptance remains required on the final assembled batch. Fresh-human learning, control comfort, audible mix, representative-GPU pacing and complete campaign acceptance remain unverified.
