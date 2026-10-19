# M2-A composed-route correctness corrections

**Both assigned corrections are implemented and verified on source `7a822d7dfad8d19c1509e4f1bc943705e1cdfe7d`.** The unchanged earned stall now displays Blocked ahead at the original half-second dwell; the completed earned-save economy checker passes without changing its input or immutable discoveries. This is implementation evidence, **not independent acceptance**. Root must assemble the complete M2-A candidate and obtain fresh non-author Astra xhigh/Sol6.1 max review.

## Baseline, ownership and provenance

- Initial checkout was clean at exact parent **`8f3065117c91a2a8ddceba6235c3b8c4939d51ca`**, containing report-only merge `6b99da7`; its production baseline is **`b91cde9e2956ce36ec9e4e7901332f7ebf1257cc`**. No production integration/deployment occurred here.
- Original Codex `turn_context` confirms **gpt-6.1-sol / max**, cwd **`/home/worker/.t3/worktrees/subnautica-clone/t3-42fec51b`**. Own T3 configuration and thread read confirm the same selection, branch **`t3/fix-composed-route-corrections`**, exact worktree, `subagent` relationship and root parent. Receipts are in `raw/runtime-turn-context.original.json`, `t3-configuration.original.json` and `t3-binding.original.json` under the artifact directory below.
- Read the live STATUS/PLAN/CONTRACTS, revised input, settled map/tracker, integration and relevant M2/save/experience contracts, composition brief/report and root inspection. Continued the root's diagnosing-bugs workflow and ranked hypotheses; no duplicate diagnosis assignment or independent review was created.
- Production ownership used only `src/sim/{world,step,types}.ts` and `src/runtime/app.ts`. Other changes are `scripts/check-m2-a-economy.mjs`, `tests/{experience-signals,app,rib-surface-trap,m2-composed-corrections}.test.ts`, and this report. No collider, terrain, camera, handling, power/damage, placement/migration, save schema, input, thresholds or product-copy change.
- No children, peer polling/messages/waits, peer work consumption, parent mutation, push, PR or merge. All prior evidence and original saves remain unchanged.

Fresh artifacts: **`/tmp/siltwake-m2-a-compose-corrections/`**. Before derived scripts ran, verified all **541 sealed composition payloads /172,367,878 bytes**, copied the author's exact stall reproducer, retained the root hypothesis receipts, and copied the exact inputs. `raw/final-source-input-integrity.json` also verifies all **103 selected original tracked inputs** against the exact parent, **52 final production sources** against the source commit, and all six copied save inputs against their originals. The full original generator was never run inside its sealed directory.

## Earned floor stall: red, correction and exact contract

The complete unchanged tick9370 checkpoint remains SHA256 **`8165e44fc4a8b991e727a579c24903a95d4f21b4ff62960f4f8292193095c646`**. The copied original reproducer, adapted only to fresh paths, fails with `--assert-cue` on the exact parent's compiled source: requested motion is positive, actual horizontal motion and solid limitation are zero, and all60 W steps omit the cue. `logs/original-stall-red.log` and `raw/earned-stall-baseline-red.json` retain this failure. The root's clear-sweep/footprint-floor explanation is confirmed; there is no boundary or water-cap cause.

Before production edits, the new repository regression exercised **real `stepGame` events through the actual `SiltwakeApp.observeAscent/observeThrust` methods**, replacing only session/view ports. Its minimal fixture preserves the earned pose, yaw/pitch and inertia in the default physical world. `logs/red-regression-final.log` records the intended failure at step30: false instead of visible. An earlier fixture-getter error is separately retained in `red-regression.log`; it is not counted as the red regression.

The only public helper change is a backward-compatible sixth optional argument:

```ts
moveHull(
  world: WorldQueries, origin: Vec3, delta: Vec3, shape: Capsule,
  bounds?: HorizontalBounds,
  observeSupport?: (rejectedHorizontalTravel: number) => void,
): ReturnType<WorldQueries["moveCapsule"]>
```

The return shape and every existing caller remain compatible. When the existing horizontal footprint-floor refusal breaks the slice loop, the callback reports nonnegative finite horizontal metres: the current raw sweep's allowed XZ progress that the floor then rejects, plus requested horizontal distance in the later slices that this refusal cancels. It excludes horizontal travel already refused by the raw sweep. Pure vertical floor support does not report horizontal loss. It adds no query, movement correction, clamp or state mutation.

The transient event is now exactly:

```ts
{ type: "thrust-sample"; actorId: string;
  requested: number; actual: number;
  solidLimited: number; supportLimited: number }
```

All distances are horizontal metres per fixed step. `supportLimited` starts at0; each surface attempt owns its own accumulator. Only the selected attempt reaches the sample. Final surface rollback keeps the existing full solid attribution and reports support0, so neither discarded attempts nor an already-attributed rollback add another copy of refused travel. The app validates the new value as finite/nonnegative and combines it with solid loss, capped at `requested - actual`. Existing **80% loss**, **actual ≤10% requested**, **requested >1e-5** and **0.5 active seconds** remain exact. Existing ascent measurements, **0.45s** ceiling dwell, precedence and all reset policies remain unchanged.

The regression now proves the full60-step sequence, exact first visibility at **step30/tick9400**, no Blocked above, and ordinary retreat/rise escape without changing the earned hull position during the stall. Added checks cover partial support with useful progress, disjoint solid/support loss including cancelled slices, final surface rollback and selected safe retry. Existing sweep-only cues, tangent slides, ceiling/ascent behavior, surface caps, boundaries, free/reverse/side-only/no-input motion, invalid/missing samples, actor changes, no power, pause/panel/graphics/session resets all pass.

Typed synthetic thrust fixtures add support0 and exercise support-only and mixed80% qualification plus invalid/below-threshold values. The one safe Dart golden hash changes solely for its explicit zero-valued event member; all prior fields remain covered. The original unmodified safe-golden test independently passes on retained parent modules. No skipped view or weakened physical assertion was introduced.

## Bounded old/new state differential

`scripts/differential.mjs` compares retained parent modules with the final snapshot, starting from unchanged exported inputs. The copied trace subset retains actual controls and the intervening production command. Each completed step compares **every gameplay field**, complete encoded saves with fixed identical metadata, and every prior event field; only the added support member is separated for event comparison. No gameplay subtree is filtered.

- Original W stall: **9370→9430,60 steps**. All complete states/saves are exact.60 new support values;31 ahead-presentation differences at ticks9400–9430. The old observer never shows the cue.
- Actual retained escape controls: **9370→9970,600 steps**. Exact complete state/save equality, no prior-event or ascent/forward presentation difference.
- Main pre-Basin continuation: **24190→24790,600 steps plus1 real interact command**. Exact complete state/save and command-result equality.
- Main actual Continue idle: **39125→39162,37 steps**, exact.
- Active recovery actual Continue: **47528→48128,600 steps**, exact, retaining the same operation and gameplay state.

Total **1,897 exact complete-state and encoded-save comparisons**, plus the command comparison. `raw/differential.json`, `differential-events.jsonl` and `trace-copy-receipt.json` retain input/source hashes, windows, measurements and presentation separately. These are bounded continuation checks, not a rerun of the historical complete expedition matrix.

## Completed earned-save economy checker

The completed input remains SHA256 **`45840e6659e9aed6a98d0c0eed67761f5af8dfaab8d9c32ea051f48d652b4e44`**, schema3/expedition.4, tick39125. Parent checker exit1 is retained in `logs/original-economy-red.log`: decoding succeeds; the assertion incorrectly demands C06,C05 after immutable C05,C06 already exist.

The corrected checker validates the imported state and codec round trip **before** staged mutations. Its output now includes original inventory/fleet/knowledge/resources, original complete-state hash, and a distinct decoded input snapshot. Real recipes, collection, transfers, capacities, fitted suit identity, module/frame investment, paid repair and protected recovery stock remain asserted on a detached diagnostic branch. Input state and file bytes are checked unchanged.

The two fresh arrival-order diagnostics use **explicitly clue-free `createGame()` states**. They still require exact C05,C06 and C06,C05 order, unchanged optional journals and idempotent rediscovery. No earned knowledge is erased. The actual retained branch separately proves known records preserve order/tick/provenance, missing clues append only when absent, rediscovery preserves complete knowledge, and every original clue record survives the whole recovery diagnostic. For the completed input, `rediscovery.appendedIds` is empty; its original C05/C06 records remain unchanged. The output labels staged clue-order diagnostics separately from retained-input evidence.

All three economy families pass, with M2 compatibility cases explicitly distinguished:

- M1 runtime economy and original design arithmetic: exit0.
- M2 no-earned fresh arithmetic: exit0,126 codec checks/6,457 recovery updates.
- **M2 completed earned input:** exit0; retained branch71 codec checks/6,457 recovery updates, suit `item_7`, paid trim `item_25`, original frame retained. This is the completed-save proof.
- Same run's pre-Basin checkpoint: exit0; **`a53988b2d052ded2f47fc77a9012567d63a99cf2bfa773e3b9a837c1a55aa68a`**,73 retained-branch codec checks. This is separate compatibility evidence.
- Original schema2/expedition.3 input `/tmp/siltwake-m1-play-root/replay/saves/main-final-ui-export.json`: exit0; **`53cdb39d08b4396eea1b31028a2f1a57cb66070c3636034c52f00f7ba8218989`**,77 retained-branch codec checks. Its original bytes/tags remain unchanged; existing decoder migration is used.

These scripts stage positions/discoveries/failure state and make no new ordinary-route or oxygen/power-margin claim. Earlier completed-route failures remain in their original evidence and fresh copied logs.

## Actual production continuation and media

Both browser rule files were read before browser actions. T3 `preview_status` then corrected `preview_open` established one owned incognito tab on **factory-worker Linux**, with an empty storage origin and free port **5190**. Read-only process inspection retained the Linux T3 Chrome154 host executables/flags; UA, platform, WebGL and T3 artifact paths corroborate that environment. Shared browser hosts827911/847778 were preserved. No Windows/desktop pointer lock or physical cursor automation.

The browser loaded the exact final production bundle through external recording scaffolding; JS/CSS/build files were byte-identical to the retained build. The HTML only loads the copied recorder. It exposes keyboard/UI/export observations and deterministic rAF scheduling, with **no gameplay setter**. The byte-identical earned file was supplied through the actual production file input and Import & save confirmation.

1. Initial actual export is complete-state equal at9370.
2. W24 steps leaves the cue hidden. At **W30/tick9400**, actual visible **Blocked ahead** appears; W60/tick9430 retains it at the original pose.
3. Ordinary **S60** retreats to approximately(42.063,−7.483,−30.817); **Space30** rises to(41.293,−5.928,−29.077). The cue clears, with the same Dart and original look controls/geometry.
4. Actual **Save locally**, page reload and **Continue** preserve every gameplay field at9520. Another30 idle steps reach9550 and match the old source exactly.

`raw/browser-export-equality.json` compares all **six complete exported states** with the old-source replay, including import, stall, escape, save, actual Continue and subsequent idle. All six native downloads match recorder bytes. Save metadata changes normally; no gameplay field is omitted. The fsynced `raw/browser-input-ledger.jsonl` preserves the entire input/export attribution across both page sessions. No game errors/unhandled rejections were recorded. One wrong save-control selector was corrected from a fresh snapshot without advancing simulation; initial rejected `about:blank` syntax was corrected before one tab was created. Both tool corrections are disclosed in the method receipt.

Actual inspected Rich1280×800 images:

- [Earned W30 visible cue](/tmp/siltwake-m2-a-compose-corrections/frames/01-earned-W-30-cue.png)
- [Ordinary retreat/rise, cue cleared](/tmp/siltwake-m2-a-compose-corrections/frames/02-ordinary-retreat-rise.png)
- [Manual local save](/tmp/siltwake-m2-a-compose-corrections/frames/03-manual-local-save.png)
- [Actual Continue plus30 idle steps](/tmp/siltwake-m2-a-compose-corrections/frames/04-actual-Continue-idle30.png)
- [18.529-second motion excerpts](/tmp/siltwake-m2-a-compose-corrections/motion/earned-stall-escape-reload-excerpts.mp4), with the [complete76.176-second recording](/tmp/siltwake-m2-a-compose-corrections/motion/earned-stall-escape-reload-full.mp4) retained. Excerpts remove tool/menu idle; source intervals and variable-frame attribution are in `raw/browser-timing-and-method.json`.

Hardware is Chrome154 Linux,6 cores/reported8GiB/DPR2 and **SwiftShader Vulkan software rendering**. First regional activation530.8ms, new-page activation452.9ms are observed cold/page costs, not warmed performance or a dedicated-GPU claim. Deterministic100ms callbacks and tool/menu wall time do not establish human timing, frame pacing or comfort. This is a short **earned-save continuation**, not a fresh full expedition.

## Checks, sealed handoff and limits

Clean `npm ci` followed by one clean-generated `npm run check` passes **520/520, zero skipped**, strict typecheck and production build. Relevant113-test targeted run also passes. Vite's existing >500kB chunk warning remains. Final main bundle **`index-CQQ_vEyZ.js`**, SHA256 **`19b5e4dd8e27a0f619c100960319a50b66fb1a5f2952638be91d77bb7c39221f`**. All27 dist files and final source/compiled modules are retained and hashed. No unrelated historical matrix was rerun.

The artifact README contains reproduction commands, exact scope and classifications. Run `scripts/verify-seal.py` before derived generators, then use an extracted working copy. The copied parent stall command is intentionally red; current stall, bounded differential and actual-export verification are green. Economy commands and fresh outputs are retained in `logs/` and `raw/`.

- **839 payloads /24,879,570 bytes**, all disk and archive members verified.
- Manifest SHA256 **`d3d4a2f15c4afee073ec9961a3158f875294ade574b5a20dbcc5e9997b3a8318`**.
- Archive SHA256 **`bacb34549441d8723b580bbf7684a68868779bd03a11d7c8ff07b3842a73d3e8`**, archive8,920,956 bytes.
- Archive: `/tmp/siltwake-m2-a-compose-corrections/m2-a-compose-corrections-evidence.tar.gz`. Manifest/seal/archive exclude their own hash cycle; node_modules links and this separately committed report are excluded.

The only owned recording is stopped/copied; owned tab **`tab_3x_0430977b-1ed3-45f2-ac72-3683f9fe8942`** was closed through normal T3 lifecycle and own preview list is empty. Owned server PID2514579 is gone;5190 refuses connections and is reusable. Shared hosts remain alive. Release receipts are in `raw/browser-lifecycle-release.json` and `resource-release.json`. No server, recording, browser tab, check process, child or watcher remains owned.

No further production path/policy is needed for this bounded correction. Historical placement limits remain unchanged. Shelter readability/close-hunter visual work belongs to root's separate direction/implementation path; this leaf does not evaluate or consume that work. Complete-batch independent acceptance, human learning/feel, audible quality and representative-GPU evidence remain outstanding. Root owns assembly, affected visual continuation checks and the fresh full-batch reviewer pair.
