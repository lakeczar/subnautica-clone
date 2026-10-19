# M2-A terrain-wall movement correction — author handoff

The bounded correction prevents the confirmed centre-only rescue-wall approach while retaining the physical terrain, camera and old contact-save escape. This is an implementation handoff for root inspection, not feature or complete-batch acceptance.

- Required clean parent: **930c023d4135f4a6c916eedbb0b7eff4a6381b78**, containing assembled terrain/performance/priority at36aed3d.
- Source commit: **f039e3798972d6030c022e5836898ed8cbd8000f** on `t3/wall-clearance`.
- Actual original runtime: **gpt-6.1-sol / max**. [Original turn context](/tmp/siltwake-m2-a-wall-clearance/runtime.json) and [T3 binding](/tmp/siltwake-m2-a-wall-clearance/binding.json) identify this worktree and original delegated thread, not merely a requested model label.
- Assignment: [M2-A-WALL-CLEARANCE](../tasks/M2-A-WALL-CLEARANCE.md); diagnosis follows the invoked diagnosing-bugs skill and root's retained reproduction/hypotheses.

Only `src/sim/world.ts`, `src/sim/step.ts`, new `tests/terrain-clearance.test.ts`, and additive cases in `tests/hull-clearance.test.ts` and `tests/simulation.test.ts` changed in the source commit. No additional production ownership was needed. This report is a separate evidence commit. No children, peer messages/waits, parent edits, push, PR or merge were performed.

## Movement seam and compatibility boundary

`world.ts` adds private `RESCUE_BENCH`, `TERRAIN_COLUMNS`, `terrainGap` and `sweepTerrain`. Movement sweeps the existing full actor box, including rectangular hull extents and bottom/height, against the bench and Basin pad columns. The constant merely names the existing bench bounds; it does not alter the height function. A supported top has no added lip. Basin's existing `max(natural,pad)` rule remains intact: movement above the natural join is usable.

The bench also overwrites higher natural ground. Private `BenchEdge`, `benchEdgeSlope`, `BENCH_EDGES` and `benchCutWalls` represent those exposed inverse faces. Tangential bounds use the actual heightfield terms' derivative bounds; ambiguous intervals refine until below the sweep tolerance. The 4096-interval budget stops unproved movement conservatively. The existing eight-slide limit remains; each accepted tangent is swept again against all terrain, canonical ribs and caller-supplied solids. A retained overlap permits a supporting-plane non-closing segment, with a gap backstop at each accepted slide. Closing travel is refused; overlap does not waive adjacent collisions.

These terrain volumes apply only when `createWorldQueries` receives the actual `surfaceHeight` or `terrainHeight` function. A custom local floor receives none of the world-specific terrain columns or cut walls. Public `WorldQueries`, `Capsule`, movement results and saved-state signatures are unchanged.

In `step.ts`, diver support height now passes through the existing `surfaceMove` / `verticalCorrection` path. A support lift must clear its complete vertical path and endpoint; it cannot push the player through an adjacent ceiling. Hull floor lifts receive the same continuous validation in `moveHull`. Non-finite/excessive hull travel is refused at the retained finite origin, with at most100000 travel slices; a non-finite origin retains the existing `RangeError` behavior.

**Historical placement `clearance` is deliberately unchanged.** Foundation migration and current/legacy carrier entry therefore retain their old results. These APIs can still accept an existing terrain-footprint overlap; this correction does not claim every placement path prevents one. Prevention during ordinary movement and non-closing escape from retained contact are the bounded change. There is no new decode rejection, relocation, inventory grant or global migration/clearance policy. Render/camera/input/codec/legacy/content files remain byte-identical to the required parent.

## Original symptom: red, then green

The original exports, phase trace, root scripts and smoke images were copied into the task artifact directory before use; sealed source evidence was not overwritten. [Input identities](/tmp/siltwake-m2-a-wall-clearance/identities.json) verify the original approach/contact/retreat exports and earned continuation byte for byte against their retained originals.

On the parent, the copied minimized command failed after **22 forward ticks**, at tick24445, X54.046496739851975 / Y−39.31140222971044 / Z−59.5. Placement clearance still returned true while the unchanged0.07m camera near plane crossed the real bench face. [Minimized red output](/tmp/siltwake-m2-a-wall-clearance/before/minimal.log) and the new full-step [red regression](/tmp/siltwake-m2-a-wall-clearance/before/regression.log) retain this exact failure before the fix.

The copied full replay reproduced all three original complete browser states exactly before its expected failing crossing assertion: [parent full output](/tmp/siltwake-m2-a-wall-clearance/before/full.log). Its55 crossing observations comprise **53 distinct crossing ticks plus two repeated phase-end inspections**. The corrected replay has zero under either count; the distinction is retained in [input-audit.json](/tmp/siltwake-m2-a-wall-clearance/input-audit.json).

Final commands, run against the final compiled production source:

```sh
node /tmp/siltwake-m2-a-wall-clearance/scripts/wall-contact-minimal.mjs
node /tmp/siltwake-m2-a-wall-clearance/scripts/wall-contact-repro-corrected.mjs
node /tmp/siltwake-m2-a-wall-clearance/scripts/input-audit.mjs
```

All pass. The corrected full script keeps the original150 input ticks and symptom assertion; old unsafe export equality is a parent provenance check, not a requirement on corrected movement.

| Phase from original tick24423 input | Final tick | Corrected body X / Y / Z, m |
| --- | --- | --- |
| W24 | 24447 | 54.340004334 / −39.968937762 / −59.5 |
| C48 | 24495 | 54.340004334 / −40.082764174 / −59.5 |
| S+Space60, idle18 | 24573 | 55.911212466 / −37.067585074 / −59.5 |

The original150-tick sequence has **zero near-plane crossings**, minimum physical near-plane floor gap **0.425319938m**, no health loss/new failures, and a successful codec round trip at every tick. [Final minimized output](/tmp/siltwake-m2-a-wall-clearance/checks/minimal-final.log), [full output](/tmp/siltwake-m2-a-wall-clearance/checks/full-final.log) and [full measurements](/tmp/siltwake-m2-a-wall-clearance/checks/full-final.json) retain exact values.

Unmodified original approach and contact exports decode to their exact original state. The old contact pose remains unchanged while idle, closing travel is refused, and S+Space60 escapes monotonically in X to55.574363815 / −36.182213930 / −59.5. Every escape tick is saveable; inventory, knowledge, fleet, recovery and migration remain unchanged. This establishes ordinary escape from the retained overlap without a grant or decode teleport.

## Checks and affected callers

`npm ci` completed; final **`npm run check` passes516/516 tests**, with no failures/skips, plus typecheck and production build. [Final log](/tmp/siltwake-m2-a-wall-clearance/checks/check-final.log). The14 added tests cover the real full-step symptom and150-tick sequence, retained-contact recovery, continuous diagonal/high-speed sides/corners, inverse bench faces, descent/ascent and supported tops, all Basin pad sides/natural joins, adjacent solids, custom floors, diver/hull support corrections and finite hull refusal. Existing rib-overlap, exact safe-trace, shore/pod/waterline and M2 recovery-route tests continue to pass unchanged.

All three economies pass on final source:

```sh
node scripts/check-m1-economy.mjs
node docs/build/design/check-economy.mjs
node scripts/check-m2-a-economy.mjs --earned /tmp/siltwake-m2-a2/inputs/main-final-ui-export.json --out /tmp/siltwake-m2-a-wall-clearance/economy-m2.json
```

[M1](/tmp/siltwake-m2-a-wall-clearance/checks/economy-m1-final.log), [design](/tmp/siltwake-m2-a-wall-clearance/checks/economy-design-final.log) and [M2](/tmp/siltwake-m2-a-wall-clearance/checks/economy-m2-final.log) outputs retain their staged-rule/arithmetic limits. They are not a newly earned Basin composition.

The [affected-caller differential](/tmp/siltwake-m2-a-wall-clearance/compatibility-audit.json) passes **195 exact terrain-height samples**, **2340 unchanged placement-clearance comparisons**, **48 complete foundation decode-result comparisons**, and **72 unchanged current/legacy carrier-entry comparisons**. The foundation matrix includes14 successful results and34 matching historical refusals, including positions outside the old domain. It does not falsely count every comparison as a successful migration. The original four full input envelopes also decode exactly as on the parent. This is a bounded affected-caller check, not a claim that every placement path already accounts for cliff extent.

## Final production browser proof

Both browser rule files were read before browser use. [Host/process ownership](/tmp/siltwake-m2-a-wall-clearance/browser-ownership.json) verifies isolated **factory-worker Linux**. One owned incognito/storage-isolated T3 tab used free localhost port5190; shared hosts and human resources were preserved. Final [hardware receipt](/tmp/siltwake-m2-a-wall-clearance/browser/hardware.json): Chromium154, WebGL2/SwiftShader, six reported cores, DPR2, rich1280×800 viewport and1280×800 buffer.

The task-only HTML injects the retained [RAF/input harness](/tmp/siltwake-m2-a-wall-clearance/scripts/browser-harness.js); production JS/assets are unchanged. The harness schedules fixed frames, dispatches DOM keyboard events through the existing input controller, and observes export Blobs. Imports, exports, manual save and Continue use actual UI handlers and native persistence. It neither accesses nor sets game state. This is synthetic scheduling through ordinary controls, not human feel. The rescue/Basin starts are explicitly staged diagnostics. The earned-save continuation is separate and uses the unmodified retained schema2 input with normal codec migration.

[Browser audit](/tmp/siltwake-m2-a-wall-clearance/browser-audit.json) passes **11 complete-state input replays**, all with maximum numeric difference0, and validates all16 retained native UI downloads. Every exported envelope encodes/decodes immediately. Native files are preserved under `downloads/`, named copies under `exports/`, and complete phase/key records under `browser/`.

| Final browser action | Evidence and result |
| --- | --- |
| Original staged import; W24 → C48 → S+Space60+idle18 | [Approach](/tmp/siltwake-m2-a-wall-clearance/frames/approach.png), [contact](/tmp/siltwake-m2-a-wall-clearance/frames/contact.png), [retreat/ascent](/tmp/siltwake-m2-a-wall-clearance/frames/retreat.png). One ordinary initial idle tick makes browser ticks24448/24496/24574; full poses match the corrected trace. |
| Unmodified old contact import; S+Space60 | [Actual escape](/tmp/siltwake-m2-a-wall-clearance/frames/old-contact-escape.png), exact imported state, ending tick24555 at55.574364 / −36.182214 / −59.5. |
| ArrowUp48; W+C48; ArrowUp+C42; ArrowRight+C24 | [Wall/floor look](/tmp/siltwake-m2-a-wall-clearance/frames/contact-floor-look.png) and [corner view](/tmp/siltwake-m2-a-wall-clearance/frames/corner-view.png). Continued ordinary input stops at X54.340005; actual wall and adjoining floor silhouettes remain. |
| S+Space48 after that look | Ends tick24765 at55.358289 / −40.266850 / −58.803355. This phase retreats but slightly descends because of the retained pitch; it is not labeled ascent. Earlier retreat/old-contact escape do ascend. |
| Save locally → actual page navigation/reload → Continue → export | Native downloads08/09 retain **exact complete gameplay-state equality at tick24765**. Export `savedAt` metadata refreshes normally. |
| Staged Basin southwest corner; W36 | [Contact](/tmp/siltwake-m2-a-wall-clearance/frames/basin-corner-contact.png): tick24459,169.442498 / −171 / −224.340004. |
| Basin S+Space36+idle12 | [Retreat/rise](/tmp/siltwake-m2-a-wall-clearance/frames/basin-retreat-rise.png): tick24507,168.328990 / −169.703157 / −225.453512. |
| Retained earned import; W48 then S48 | [Normal reef swim](/tmp/siltwake-m2-a-wall-clearance/frames/earned-swim.png), codec-matched starting state and exact input replays; no grant. No fresh Basin progression claim. |

The head-on upward contact still appears as a broad blue face filling the view. This report does not claim every blue frame disappears. Near-plane measurements prove the corrected stand-off; ordinary look input exposes the preserved wall/floor/corner geometry. Before images under [before/](/tmp/siltwake-m2-a-wall-clearance/before/) are retained original author captures, not fresh parent screenshots. Before/after poses intentionally differ, so these are not state-matched pixel comparisons. No new35-view visual matrix was run.

Four raw Blob-capture receipts lagged their corresponding native downloads: `visible-wall-contact`, `after-reload`, `earned-start`, `earned-swim-back`. Their raw files remain unchanged; the audit uses chronological native UI files06/09/13/15 and discloses the stale/missing captures. The other12 same-receipt captures match native bytes; every captured Blob identifies a native file. Copies were made before normal tab closure, which disposed T3's temporary download paths. The final snapshot retains one aborted duplicate evidence POST during navigation; the earlier complete receipt, native export and real reload comparison survive. Captured page errors/rejections are empty; game assets returned200.

Exploratory audit failures are retained: the initial audit assumed timely Blob capture; subsequent assumptions about disposed native paths and the fourth lagging capture were corrected. The first post-HTTP cleanup bind encountered TCP TIME_WAIT; the final reuse-address bind and refused-connection check establish no listener. These are harness/audit corrections, with no production edits after the frozen source commit.

## Identity, archive and release

[Identities](/tmp/siltwake-m2-a-wall-clearance/identities.json) verify **103 parent and104 final tracked source/test/config/public inputs** against Git, **27 files in each parent/final production build**, and all27 final HTTP responses against build bytes. The HTTP identity fetch occurred after the browser run using the same frozen server/files; browser network receipts identify its final bundle. [Parent compiled identity](/tmp/siltwake-m2-a-wall-clearance/parent-compiled-identity.json) additionally matches all48 baseline production JS modules to a separate clean parent compilation.

- Verified parent bundle: `index-BEamZ7cN.js`, SHA256 `303404868f32325cee8a21c1099b5f31c2d79c780545e425a52958ee1051740d`.
- Final bundle: `index-CNubbEhE.js`, SHA256 **`6f493b992a5a7c6bf543acb65b8464ab813f8dca2fa6edb3599297fb3de3539b`**.
- Original approach input SHA256: `54f3824a6dee21d31cc3af0c61bb1ca5f34405ae40f3bd0836c2c307b173219a`.
- Retained earned input SHA256: `53cdb39d08b4396eea1b31028a2f1a57cb66070c3636034c52f00f7ba8218989`.

`baseline-src/dist` is the verified clean parent build. `before/dist` is a discarded exploratory in-progress build and must not be attributed to the parent. `browser-first/`, `frames-first/`, `downloads-first/`, `exports-first/` and `served-production-first/` are the earlier pre-final hull-bound-guard run; they do not support final-source media claims. The final browser run repeated the relevant flows on `index-CNubbEhE.js`.

The artifact [manifest](/tmp/siltwake-m2-a-wall-clearance/manifest.json) contains **1228 payloads /30979459 bytes**. Every disk and archive payload was hash-verified. Manifest SHA256 **`53a355fde7c7c0ca8b37194ef30019c37e7a116363ef81d01e0768502ac38572`**. [Archive](/tmp/siltwake-m2-a-wall-clearance/wall-clearance-evidence.tar.gz):12531087 bytes, SHA256 **`9b6abeaa8167ae3714bc4b132473b3a9a6f9777133712afc8286e749d8547c54`**. [Seal identity](/tmp/siltwake-m2-a-wall-clearance/archive-identity.json) records exclusions; the baseline dependency symlink was not followed. The separate tracked report stays outside the archive to avoid circular hashes.

This leaf is terminal. [Cleanup](/tmp/siltwake-m2-a-wall-clearance/cleanup.json) records normal closure of the owned T3 tab, an empty own-tab list, stopped owned servers, no recording/children and no listener on5190. Assigned paths/resources are released with a clean committed worktree. Root inspection, full earned Basin composition, OS2-06, cold-loading work and the fresh non-author Astra/Sol complete-batch gate remain outside this leaf. Software rendering and fixed-step diagnostics establish no representative-GPU performance or human-feel acceptance.
