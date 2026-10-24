# M2-A hunter query cost — bounded implementation handoff

Source **ea4f5d9e8c226f4859a6cff457f7f538b63b2544** removes redundant exact queries within each hunter update while preserving the corrected9473318 trajectories. **540/540 tests, typecheck/build and all economy invocations pass. The single final timing trial still misses the unchanged2ms warm-p95 gate.** This is provisional implementation evidence, not M2-A acceptance or performance closure.

| Identity | Verified value |
| --- | --- |
| Exact clean shared parent | `485655a98ac058502dce986ce310c2256ce5ae88` |
| Production parent | `9473318bbd69aff4b8a9201a7ad7c44b6f892060` |
| Source commit | `ea4f5d9e8c226f4859a6cff457f7f538b63b2544` |
| Checkout / branch | `/home/worker/.t3/worktrees/subnautica-clone/t3-0ecdd5ac` / `t3/reduce-hunter-query-cost` |
| Actual original runtime | **gpt-6.1-sol / max** |
| Private artifact root | `/home/worker/.local/share/siltwake-evidence/m2-a-hunter-cost/` |

Original session `01a15402-a43b-7502-a903-8fbd41a43339`, first turn context at **2026-10-19T11:53:42.432Z**, line8, records the actual model, effort and assigned cwd. `identity/original-turn-context.json` and its location receipt preserve that original record. Initial/final T3 receipts independently confirm the Codex model/max selection and attached isolated checkout; catalog defaults are not effort evidence. Initial Git status is empty at the exact parent.

Read AGENTS/STATUS first, PLAN/CONTRACTS, revised input and relevant integration/ecology/fleet/delivery specifications, both complete original M2-A R1 reports/disposition, the R1 hunter brief/report and [root correction inspection](M2-A-R1-CORRECTIONS-INTEGRATION.md). The [bounded brief](../tasks/M2-A-HUNTER-COST.md) governs this leaf. The diagnosing-bugs skill guided the reproduction/profile/fix loop. No children, peer messages/waits/polling, parent/peer edits, push, PR or merge occurred. No browser, preview, server, recording or port was acquired.

## Measured work and correction

The original root ABBA comparison remains authoritative historical evidence: source35c2d22 nearby-two p95 **1.046/0.910ms**, corrected9473318 **2.296/2.595ms**, with moveCapsule calls rising1734→3426 over420 updates. All four original sample sets, plan and summary are preserved byte-for-byte in `inputs/root-abba/`, with original paths/hashes. The earlier correction author's **10.328ms** miss is separately retained in `inputs/previous947-single-trial.json`. None was replaced by this run.

Before choosing the change, ran one CPU-profiled baseline diagnostic using the original six-case protocol and world-call counters. `profile/baseline.cpuprofile` / `attribution.json` attribute approximately **931ms inclusive to intersects** within1741ms in moveHunter, including repeated triangle transformation/intersection work; moveHull accounts for approximately144ms. These inclusive samples overlap and are not additive. The profiled baseline's load was about2.41; its timing is diagnostic and is not a comparable before/after speedup claim.

The diagnostic operation-count regression went red on the unmodified parent:

```sh
node /home/worker/.local/share/siltwake-evidence/m2-a-hunter-cost/scripts/query-work.mjs baseline --assert-reuse
```

It reports **4663 repeated exact intersections** per fleet case over421 updates. Module-load instrumentation is confined to the private diagnostic; production source is never instrumented. Final-source diagnostics pass and retain all six complete JSON traces/final states with identical hashes.

Only [hunter.ts](../../../src/sim/hunter.ts) and [the owned reconciliation tests](../../../tests/m2-hunter-reconciliation.test.ts) change in the source commit. Private fleetSweepFrom reuses each immutable start-pose envelope overlap, actual overlap and supporting-plane result within one evaluation. Exact endpoint queries reuse pose, actor penetration and fleet acceptance only for identical swept/slid coordinates, using Object.is to preserve signed-zero distinctions. Nothing survives the update.

Candidate order, the level/component fallback, every world sweep, continuous fleet certificate and final contact/LOS/clearance check remain. Geometry/SAT/inside kernels, world/step/save/content/rendering, movement and damage/noise/timing rules are unchanged. No intentional trajectory differences are introduced.

| Fleet-case diagnostic, including first call | Parent9473318 | Sourceea4f5d9 |
| --- | ---: | ---: |
| Exact intersections |6286|1623|
| Repeated identical intersections |4663|0|
| Pose evaluations |7445|3772|
| moveCapsule calls |3434|3434|

That is **74.18% fewer exact intersection calls**, with all candidate movement retained. The original eight owned test bodies remain a byte-identical complete prefix; every other test/fixture is unchanged. Two new regressions protect the preferred safe world-slid endpoint even when its raw proposal fails fleet safety, and expire query reuse before changed poses/rosters/restored states.

## Safety, persistence and continuations

Full `npm run check` passes **540 tests, zero failures/skips/cancellations**, strict typecheck and production build. All four invocations pass: `node scripts/check-m1-economy.mjs`, `node docs/build/design/check-economy.mjs`, `node scripts/check-m2-a-economy.mjs`, and the latter with `--earned` plus the copied completed-earned tick39125 input. Logs and exact commands are in `checks/`. These are rule/arithmetic checks.

The focused compatibility probe retains **48 staged states,192 exact public sweep comparisons** (137 accepted,55 refused) and48 strict-equal complete motion/contact results across all six hull geometries, orientations, retained overlaps and carrier shell/berth configurations. Geometry kernels are unchanged; this is not new exact animated triangle/triangle collision proof. Existing parked/disabled/berthed obstruction, no-inside-bite, speed/rate, overlap, LOS and contact tests pass.

The exact original staged1,800-update motion audit retains **contact on update62**, longest stationary run **one update**, **75.493278m** travel,888 valid contact steps and10 contact runs. Later three-second cycles travel6.884–7.118m. Its maximum approach speed is7.000000000000553m/s, floating-point error around the unchanged7m/s bound. The three600-update live-damage cases apply46.0000/47.0000/47.1667 loss at the unchanged10/60 maximum diver loss per step. All3600 motion/damage trace rows and summaries are byte-equal to the original9473318 audit after lossless decompression, with30 complete codec/next-step comparisons. The full-duration motion case omits injury application to observe the whole interval; it is not ordinary play.

Affected retained-input replays use both parent9473318 and final compiled modules: healthy exit/retreat/reboard150 steps/one command; disabled exit/open-water/recovery1566/one; original retained overlap90/zero. **All1806 candidate steps, all three final states, damage and hunter traces match the parent**, with28 candidate codec/next-step comparisons. The disabled branch preserves first damage13599 and incapacity14728; healthy reboarding retains the same Dart at11365.

| Imported retained-control continuation | Steps / commands | Minimum O2 / power | Codec/future comparisons |
| --- | --- | --- | ---: |
| Useful return34274→39125 |4851 /4|63.962963% /83.966769%|16|
| Same-Dart recovery47528→56372 |8844 /9|88.814815% /87.912546%|29|

Both active continuations preserve complete9473318 final state, including hunter, cargo, investment and discoveries. The036 numerical window has zero steps and supplies no active-run or margin claim. These are staged/imported deterministic continuations, not new browser or New Game evidence. Root retains actual affected ordinary play after composition.

`identity/source-build.json` verifies111 source/test/script/config inputs, with only the two authorized changes, plus **196 compiled and27 production files** byte-identical to the checked output. Main bundle `assets/index-D2W-ez5i.js` is **1,487,387 bytes**, SHA256 **`9f5c8518f432d1a284613185ff7fec99e2e4eb906b4d7b962e776b7e654eb62f`**. The existing large-chunk warning remains. No production changes follow this checked source.

## Final required timing — gate remains open

Ran the original uninstrumented query-cost body **once** on final source, Node24.21.0/shared Linux, six exposed logical CPUs (reported i5-12400). Each case retains its first call,60 setup and360 warm updates: all2520 post-first samples survive. Counters/hooks, CPU profiling, other owned tests and audits were absent during this trial. `timing/plan.json` predates implementation; the failed predicate and full samples are retained.

| Scenario | First call ms | Warm p95 ms | Warm max ms |
| --- | ---: | ---: | ---: |
| Idle |5.654|0.167|16.160|
| Investigate |38.862|**9.883**|38.832|
| Pursue |0.241|**4.049**|16.359|
| Earned043 overlap |1.356|1.368|19.772|
| Nearby two |17.299|**2.620**|7.304|
|48-hull screen |2.173|**5.654**|30.913|

The benchmark itself exits0; its unchanged2ms gate predicate exits1. No second final trial was run. Fleet cases still perform3426 moveCapsule /34614 groundHeight calls over420 updates, exactly the parent's count.

`timing/host-activity.json` retains half-second CPU/process, memory and I/O pressure snapshots without argv/environment. During3.641s, load averages are15.88→15.57; Chrome consumes13.61 CPU seconds, about374% of one core, with additional unattributed CPU activity. CPU pressure some-avg10 is30.78→36.26%; memory pressure also remains recorded. The own full check finished three minutes before measurement; no other owned heavy work ran. No shared process was altered, contacted or waited for. This context does **not** establish that all misses are external or waive the gate. Operation-count improvement is established; compliant wall-clock cost is not.

**Precise next seam:** intersects still transforms every triangle for each distinct tested endpoint. Prepare the immutable actor/endpoint rotation coefficients once per evaluation and reuse them inside toHunter/local vertex transforms, preserving the current inverseRotation arithmetic order, signed zero and all SAT/inside tolerances. The original profile exposes this transform work, and1623 distinct intersections remain in each fleet diagnostic. This is a bounded follow-up proposal, not a proven attribution of every final miss; it needs exact compatibility checks and a fresh declared trial. Do not skip world-slid alternatives, lower geometry quality or raise2ms.

## Retained incidents, seal and release

`checks/harness-incidents.json` indexes setup/probe failures and corrections. Missing dependencies, a premature import and a zero-counter predicate error are retained. The initial serial-affinity full check ended with SIGTERM/exit143 after524 passing lines, before summary/build; cause is unestablished. The clean standard check then passes without source changes. A copied affected-replay assertion initially expected the pre9473318 overlap export; its known X/Z difference, original script and partial states survive. Corrected complete-state assertions use the preserved original9473318 expected state and retain the older export differences. No tracked assertion was weakened, and no timing miss was erased or retimed.

The sealed private payload contains **581 regular files /17,302,336 bytes** and one undereferenced dependency link. Every payload, archive member, symlink target and included manifest verifies:

- Manifest: `manifest.json`, SHA256 **`27ff43f50814668fdc06449341842e834f3a5d8d08f1446ef0b3a3e6c7403842`**.
- Archive: `artifacts.tar.gz`, **4,508,078 bytes**, SHA256 **`3de9f7a4362f07f327a96f01a2af77f95c63979e6b252e9c6a29e1a48ea07e9c`**.
- `seal.json` records verification; external `handoff.json` records the separate report commit/hash, final clean checkout and released resources. The tracked report is outside the archive to avoid a self-hash cycle. Reproduction must copy/retarget writers into fresh artifacts, as README explains.

All owned checks/probes finished; no owned heavy process, browser/server/recording or port remains. Assigned paths/resources are released with separate source/report commits and a clean checkout. The **2ms gate remains unresolved**. Root retains actual affected ordinary healthy exit/retreat/reboard and disabled/open-water continuations, then fresh complete M2-A Astra xhigh/Sol6.1 max R2 covering all ten original criteria and both R1 dispositions. Human control feel/learning, audio, enjoyment/duration and representative-GPU evidence remain unverified. This leaf cannot accept M2-A.
