# M1 completion batches — independent Sol review, round 4

2026-10-17. Fresh non-author reviewer; actual **gpt-6.1-sol / max**, confirmed by the injected T3 runtime. No model or effort substitution.

| Complete bounded batch | Independent verdict |
| --- | --- |
| **M1 core/physical-feasibility** — gameplay/registry/economy, physics/carrier, survival/recovery, state/save/migration and runtime integration | **ACCEPT** |
| **M1 first-expedition presentation** — richer-cel art/environments/optics/camera, early narrative/notebook/UI, controls/focus/feedback/audio and gameplay interactions | **ACCEPT** |

**No blocking finding remains in either batch.** The R3 migration defect is corrected. One inherited P3 notice issue is recorded below. These are batch verdicts only: **M0 remains the sole accepted integrated milestone**; integrated M1 needs its separate verification and fresh paired review.

## Frozen identity, specification and independence

- Clean exact parent/candidate: **`5eb1be1589caca72acc39b230997328682472196`**. Branch `t3/m1-batch-r4-sol-review`; checkout `/home/worker/.t3/worktrees/subnautica-clone/t3-09094b75`. Verified clean initially and again before authoring this report.
- Production assembly: **`769f2adc18cb150c9dd1ff4bac699ea73ad6274b`**; migration source **`a5e589f4f63a66c829cadcc9a5eac36220ebc4e4`**. Candidate production bytes equal that assembly. Later parent bookkeeping is excluded from the candidate.
- Accepted-M0 diff base and verified merge-base: **`a2cb19f1d4cd2d795b82642a2bd357f681d1c293`**. Full M1 delta considered, with focused new scrutiny since R3 **`21d50dfb4de1ab5d2ae81cdeb36e1d9f6fcaf278`**.
- Authoritative specification: `prompts/BUILD_GAME_REVISED.md`, frozen blob **`0f8a548bc5a563c511ea46bfb7020a5493c3391b`**, SHA256 **`c939fa258807c17c710b627afabf96ada833f679dcb15630193e4a9933b717ba`**. Read AGENTS/STATUS first, PLAN/CONTRACTS, M1-01/COORDINATION/PARALLEL, EXPEDITION_INTEGRATION, applicable fleet/survival/world/story/graphics/delivery/playtest specifications, settled decisions/tracker and relevant fixed canon. The superseded short-game draft was not executed.
- Read the complete original R1 brief and R2/R3/R4 briefs, all six R1–R3 independent reports, all three paired records/dispositions, correction/integration records, migration assignment/reproduction/author/root evidence, and UI/LOOK/Opus dispositions. Prior reports are evidence with their own provenance, not this reviewer's verdict.
- No candidate authorship, children, peer consultation/polling, or current Astra R4 report reading. Standards/spec lenses applied locally under the explicit no-children instruction. Only this assigned report is a repository output; no production/test/config/spec changes, push, PR, merge or parent mutation.

## Scope and method

Risk-weighted source inspection, changed-path inventory, executable checks and source-attributed retained evidence covered both full batches; this is not an exhaustive path-coverage claim.

| Area | Checked scope |
| --- | --- |
| Gameplay/economy | `src/content/registry.ts`; `src/sim/{inventory,progression,state,types,vehicles,step}.ts`: source/prerequisite/output relationships, CU/access checks, protected maintenance, knowledge, immediate commands and useful-return route evidence. |
| Physical survival/recovery | `src/sim/{world,carrier,survival,recovery}.ts`: shared bounds/sweeps, attachment/yaw/entry, compact/medium berth transactions, occupied recovery, segment completion, damage/finite air/cache conservation. |
| Persistence/runtime | `src/save/{codec,foundation,validation,repository,writer-lock}.ts`; `src/runtime/{session,app,input}.ts`: strict schema2/content expedition.2, actual-schema1 migration, ownership/provenance/geometry validation, snapshot/writer/session boundaries, cancellation and interruption. |
| Presentation | Changed `src/render/` modules, `src/ui/view.ts`, CSS and `src/audio/sound.ts`: original richer-cel source/habitat/craft/wildlife art, apertures/seals, wet/dry/depth optics, actual hull camera, lifecycle, early clues/notebook, focus/pause/guidance and sound origins/activation/settings. Relevant app, expedition, carrier, migration/save, render-lifecycle, presentation and sound tests were assessed. |

**Fresh:** `npm ci`, `npm run check` — **181/181 tests, strict typecheck and production build pass**. Economy checker passes: 16 alloy / 11 glass / 13 membrane, 56 raw CU, with maintenance allocation separate. No blocking standards/authority violation was identified. No broad unchanged browser/geometry matrix was repeated.

Build bytes independently match the indexed author source/config/build: JS **`index-CUZXvZtF.js`**, SHA256 **`289fc40a8b82ab4d15bb709f50a4cd9922f07a1570bb2448da90f9f774735315`**; CSS **`index-CaesS9kh.css`**, SHA256 **`515776b96a4e38136c3de945b7b3e82ac6948bfa689093af9357fb90daf6b322`**. The existing large-chunk warning and low Windows-development dependency advisory remain.

## Fresh migration assessment

`src/save/codec.ts:139` now calls the checked `carrierInteriorEntry` policy; `:146` validates the resulting state/local clearance before success. The helper at `src/sim/carrier.ts:195` retains its R3 body byte-for-byte, apart from export/documentation. Explicit entry callers are unchanged. The migration preserves strict bounds/schema/relationships and vessel/cargo/ownership; it gives no charge, repair, air or vital refill. A missing landing refuses before session entry or storage mutation. Unmigrated blocked current states still cannot encode.

| Exact staged reproduction | Fresh result |
| --- | --- |
| Astra historical-codec/local/world-verified compact `(188,-24,0)`, yaw π/2, local `(-3,4,4.5)` | Clear dry landing approximately **`(185.6,-20,0.05)`**. |
| Original Sol compact `(65,-24,64)`, yaw π, local `(-3,4,4.9)` | Clear dry landing approximately **`(64.95,-20,62.6)`**. Original input retains its **staged/current-semantic diagnostic** provenance; it is not relabelled a captured historical save. |
| Historical-codec/local/world-verified medium `(188,-24,66)`, yaw 50°, local `(-4.7,4,4.5)` | Actionable safe refusal: no supported clear dry passage; original file/journal retained. |

Independent checks, retained under `/tmp/siltwake-m1-batch-r4-sol/`:

- Verified the author's archive SHA256 **`5e2316363a81baee7660dee9c6d307b3deedfecd77a35dcbde0cd3db90459c14`**, all **56 payloads plus manifest**, safe unique regular members and local/archive byte identity. Independently matched 17 historical TS modules against actual `c0aa5cb386a6b98ff8fa7c95d123d4f50d5bc378`, recompiled them into my temporary directory, and reproduced all 17 retained compiled JS bytes. Historical modules stayed immutable.
- Inspected, copied and redirected author fixture/persistence analyzers before executing them against current modules. **16 historically verified staged inputs plus the separately attributed Sol diagnostic: 16 successful migrations / one refusal.** Successful results are immediately clear, strictly valid, saveable and idempotent.
- Independently authored a richer conservation grid: **1,904 attempted poses, 537 historically supported/semantic/local/world-valid inputs, 1,367 excluded**. Grid outcomes: 368 migrations, two refusals, 167 unchanged. Four additional compact/medium prepared/lock cases preserve the exact transaction. **541 total checks: 372 migrations, two refusals, 167 unchanged.** Whole-envelope equality permits only the documented player local/world relocation, zero velocity and migration/feedback changes. Nonempty knowledge/scans/journal/crafted records, vitals/grace/starvation, depleted stock/facilities, equipment/cargo/reserves, fleet damage/charge/air/repair credits, metrics and metadata are conserved. Helper purity/detachment and compatible unchanged saves pass. This is staged composition using some copied earned fields, not an earned carrier route.
- Both exact fixes immediately **Continue / Export / Save / confirmed Import at zero simulation ticks**. Continue reads with zero writes; explicit Save writes once and keeps the exact original local generation as previous. Import writes once, retains the pre-import local current and leaves its source file unchanged. Refused Import preserves active state/autosave/current/previous/preserved/source with zero writes/lock requests. Protected/no-backup and recovered/valid-backup behavior pass.
- Added independent composition for **unplaceable current + migrating legacy previous + explicit repair**, retaining the exact damaged journal and original previous; quota-refused migrated Import, preserving the old session/journal until an explicit clear/exportable unsaved choice; and cancellation while a migrated Import waits for the writer. All pass. **960 ordinary simulated walking ticks** at the two exact fixed poses remain clear/strictly saveable. These are production-module checks, not browser or earned-play evidence.

The initial grid's coverage assertion lacked unchanged/refusal samples; the retained setup log is excluded. Adding helm/50° cases supplied those outcomes, with no production change. Serialization only normalizes JSON signed zero; no arbitrary field exclusions or spatial tolerances support the conservation claims.

## Prior findings and remaining presentation assessment

| Prior finding/correction | Independent R4 disposition |
| --- | --- |
| `SOL-M1-01` / `M1-ASTRA-R1-02`, distraction bounds | **Closed.** Clipped ray, unusable outward-length refusal, 12-second lifetime/repeat refusal and strict bounds remain; current regressions pass. |
| `SOL-M1-02` / `M1-ASTRA-R1-03`, stale cache art | **Closed.** Absent-ID disposal across New/import/null, current/shared materials and LOOK gauge descendants/state-driven values retain source/lifecycle coverage. |
| `M1-ASTRA-R1-01`, occupied recovery | **Closed.** Occupied tow/salvage refuse; valid older operations cancel before movement. No unsafe forced exit/free service. |
| `M1-ASTRA-R2-01`, attached origins during carrier travel | **Closed for the reported cause.** Existing proxy reservation, arc/extrema restrictions, legacy inward/tangent escape and checked explicit entry remain; validation is unchanged. |
| `ROOT-CB-01`, returned yaw differs from tested endpoint | **Closed.** Exact returned representation remains checked, including the R3 regression and nearby safe case in current tests. Strict endpoints are not waived. |
| `M1-ASTRA-R3-01` / `SOL-M1-R3-01`, invalid decoder relocation | **Closed by the fresh checks above.** Migration now returns a clear/saveable result or refuses atomically. |
| Earlier disabled-health saturation, swept tow/completion/notices, semantic command focus and UI/LOOK clarity | Corrections remain present; current regressions pass. Prior actual-input evidence retains its source attribution, rather than becoming a new R4 full-route claim. |

Presentation source is unchanged from R3/production `06927d5`; only migration feedback/refusal changed. Independently checked all **22 indexed LOOK artifacts**, seven matching HUD/camera pairs, and four root combined captures against retained hashes; current renderer bytes equal LOOK `b40d077`, and current combined presentation/UI/audio/runtime/registry bytes equal `06927d5`. Viewed all seven individual before/after pairs, reef/scout references, the comparison sheet, root combined opening/helm/Canopy/lab, and ordinary replay Canopy/lab stills. No fresh rendering or video inspection is claimed.

The actual views support improved habitat/value separation, warmer refuges, restrained signage, a clearer cockpit, organic Canopy/hunter silhouettes and a readable laboratory destination. The combined UI clears routine exit text from the moving centre view; the isolated author's older UI view is not used to claim that correction. Small distant roof stippling remains **nonblocking** in these views. The work remains simpler than the selected reference; further regional composition/art iteration remains appropriate. Aperture/depth/air subtraction and non-cardinal camera/lifecycle evidence retain their R3 coverage. Early C01–C04 text/notebook source distinctions and optional-record independence remain consistent with the fixed canon; no new reveal or operational ecosystem claim is introduced. Tests/source support audio origin/lifecycle/settings behavior, not the audible mix.

## Nonblocking finding

**SOL-M1-R4-01 · P3 · presentation/feedback — persistent migration notice overstates journal backup provenance.** Source: `src/save/codec.ts:144`, replayed by `src/runtime/session.ts:162`; journal selection at `src/save/repository.ts:91` is correct. The last sentence is inherited from R3.

Reproduction: with an existing valid local expedition, confirm Import of a covered legacy carrier save, then reopen/Continue the newly saved import. The notice says **“the original record remains in the journal backup after saving”**, while `previous` correctly contains the pre-import local expedition, not the original imported file. The source file is untouched. Fresh executable proof: `persistence-robustness.json`, fourth case, reproduced by `persistence-robustness.mjs` in my artifact directory.

Player consequence: inaccurate guidance about where to retrieve the pre-migration original. There is no session corruption, source loss or incorrect journal replacement, so this does **not** block either bounded batch. Recommended follow-up: remove the blanket backup promise from the persistent migration text, or issue context-aware storage feedback at the session boundary; retain the correct previous-generation policy.

## Evidence limits and handoff

- Full New→C01–C04→Dart/useful return/store/service/reload, alternate-order, repeated-loss and seeded-carrier matrices retain **`4d0a7f0`** provenance, with later focused replays/corrections. This reviewer did not repeat those full runs. Labelled geometric-construction/thin-throat diagnostics do not imply nonexistent player solid-placement tools; the excluded non-exact walking reconstruction and misleading/partial historical clips remain excluded.
- **Ordinary healthy-battery exhaustion remains OPEN for integrated M1.** Zero-power fixtures/tests and the present checks do not close it. Seeded carrier/pod fallback is not earned acquisition or registered-mobile-refuge proof. Advanced/deep fleet, both campaign paths and M2–M4/full ten-hour obligations remain.
- Opus counterplay cost/recharge/cues, transfer friction, meaningful-return reward, accounting copy and canon-aware leads remain planned gameplay follow-ups. They are not implemented or waived by these verdicts. No concrete additional blocker was established within this frozen bounded delivery; existing sortie proof does not establish human enjoyment.
- SwiftShader/muted-host media do not establish dedicated-GPU performance, audible mix, human learning/enjoyment/surprise or duration. Separate integrated-M1 verification/review is still required.

Artifact index: **`/tmp/siltwake-m1-batch-r4-sol/README.md`**. Review archive **`/tmp/siltwake-m1-batch-r4-sol/review-artifacts.tar.gz`**, **66 payloads plus manifest**, SHA256 **`10d75f4b2b0128540bf10b003e3f65cec3d55687db2e3dacd334492987058b95`**; manifest SHA256 **`cfdb120f2df13a697b596cea6c7aec6a78f7dfc6eb40073b5d456e5c89f389aa`**. All archive/local bytes and safe unique regular members verified. Original external artifacts are referenced, not repackaged or overwritten.

Both browser-rule files were read. **No browser/preview/server/tab/storage/controller/recording/pointer lock was created; port5196 was unused.** All shell sessions completed; historical tab14, user/peer resources and original artifacts were preserved. This is my independent initial verdict; only this report is committed, with no peer wait or reconciliation.
