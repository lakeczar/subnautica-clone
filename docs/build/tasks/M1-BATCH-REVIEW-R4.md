# M1 completion batches — independent review round 4

Review the same frozen SHA supplied in dispatch. Production assembly is **`769f2adc18cb150c9dd1ff4bac699ea73ad6274b`**, source-author migration fix **`a5e589f4f63a66c829cadcc9a5eac36220ebc4e4`**; later candidate changes are coordinator records only. **Diff base accepted M0 `a2cb19f1d4cd2d795b82642a2bd357f681d1c293`.** Review the complete bounded M1 batches, using prior evidence and focused new checks since R3 **`21d50dfb4de1ab5d2ae81cdeb36e1d9f6fcaf278`**. Do not treat the one migration fix as the entire original feature scope or rerun every unchanged matrix without cause.

Return separate explicit **ACCEPT** or **CHANGES REQUIRED** verdicts for:

1. **M1 core/physical-feasibility:** gameplay/registry/economy, physics/carrier, survival/recovery, state/save/migration and runtime integration.
2. **M1 first-expedition presentation:** richer-cel art/environments/optics/camera, early narrative/notebook/UI, controls/focus/feedback/audio and gameplay interactions.

This is batch review, not integrated-M1 acceptance. Both R3 reviewers accepted presentation on21d50df and required the same core migration defect. The new candidate changes migration behavior/feedback; assess it and unchanged presentation evidence explicitly. Only M0 is an accepted integrated milestone. Separate integrated-M1 verification/review, gameplay follow-ups and M2–M4 remain required.

## Scope, independence and outputs

Read AGENTS/STATUS first, PLAN/CONTRACTS, revised build input and relevant specifications, DELIVERY_AND_ACCEPTANCE, M1-01/COORDINATION/PARALLEL. Read the **complete original R1 brief** (supplied in dispatch), R2/R3 briefs, **all three prior paired records and both reports in each round**, root dispositions and correction records. R3 brief is the current UI/LOOK/Opus evidence map. This R4 brief supersedes old checkpoint/ownership/counts, not requirements. Keep canon spoilers out of ordinary reports.

| Reviewer | Sole repository output | Temporary artifacts | Browser port if justified |
| --- | --- | --- | --- |
| Fresh non-author Astra gpt-6-astra / xhigh | `docs/build/reviews/M1-BATCH-R4-ASTRA.md` | `/tmp/siltwake-m1-batch-r4-astra/` |5195, check free |
| Fresh non-author Sol gpt-6.1-sol / max | `docs/build/reviews/M1-BATCH-R4-SOL.md` | `/tmp/siltwake-m1-batch-r4-sol/` |5196, check free |

Verify clean exact parent and actual model/effort. Each reviews both full batches; Astra emphasizes cross-system/player consequences, Sol implementation/invariants/artifact consistency. No candidate author counts. No children, peer polling/consultation or reading the current peer report before your independent initial verdict. No production/test/config/spec edits, push/PR/merge or parent mutation. Only your assigned report may be committed. Use own temporary scripts; inspect and redirect output paths/imports before executing retained analyzers. Original artifacts are immutable.

## Prior findings, responses and remaining objections

| Finding | Response and R4 obligation |
| --- | --- |
| R1 SOL-M1-01 / M1-ASTRA-R1-02, distraction bounds | b201459 clips the ray and refuses unusable outward length; both R2/R3 close it. Preserve strict bounds,12-second lifetime/repeat refusal. |
| R1 SOL-M1-02 / M1-ASTRA-R1-03, stale cache art | b201459 disposes absent IDs, preserves shared materials/current IDs. Both later pairs close it. LOOK's gauge descendants/state values are covered by lifecycle evidence. |
| R1 M1-ASTRA-R1-01, occupied recovery | d99aa649 refuses new occupied tow/salvage and cancels valid older operations before movement; no unsafe forced exit/free service. Both later pairs close it. |
| R2 M1-ASTRA-R2-01, carrier travel invalidates attached origins |1c8f719 reserves existing proxy bounds, constrains arcs/extrema and supports checked legacy inward/tangent escape/explicit entry. Both R3 reviewers close the reported travel cause. No schema/validation weakening. |
| ROOT-CB-01, returned yaw differs from tested endpoint |53607cb checks exact requested return; R3 pair closes exact regression and nearby safe case. Do not waive strict endpoint invariants. |
| **R3 M1-ASTRA-R3-01 / SOL-M1-R3-01, decoder relocates beyond world bounds** | Both reviewers independently found the same P2 defect; root reproduced both. a5e589f now reuses checked dry placement and validates the migrated result, or refuses atomically. **This is the new correction to assess, not yet independently accepted.** |

Read `reviews/M1-BATCH-R3-{ASTRA,SOL}.md`, paired R3, `tasks/M1-MIGRATION-FIX.md`, `evidence/M1-R3-MIGRATION-REPRODUCTION.md`, `M1-MIGRATION-FIX.md` and `M1-MIGRATION-FIX-INTEGRATION.md` in full. Earlier health saturation, tow completion/notices, semantic command focus, UI clarity and LOOK remain part of the full candidate and recorded dispositions.

## Exact correction and executable evidence

Only two production files changed since R3:

- `src/sim/carrier.ts` exports/documents **`carrierInteriorEntry(s: GameState, world: WorldQueries, preferred: Vec3): Vec3 | null`**. Its existing body and explicit entry callers are unchanged. Given a validated assembly, it returns a detached local point after local/world clearance. Preferred authored point first; only an edge overhang enables its existing dry-cell fallback; otherwise safe refusal. No ownership/state mutation.
- `src/save/codec.ts` uses it for a covered legacy walking pose, retains vessel/cargo/world schema and strict relationships, zeroes player velocity, gives truthful dry-passage feedback, then checks validState and local clearance before success. No landing returns an actionable error without installing a session or writing storage. Unmigrated blocked current states still cannot encode.
- Seven composed tests in `tests/carrier-migration.test.ts` cover exact reported poses, compact/medium edge headings, idempotence/conservation, immediate Continue/Save/Export/confirmed Import and refusal protection. No repository/session implementation changed.

Reproductions: Astra's historically verified staged compact carrier `(188,-24,0)`, yawπ/2, local `(-3,4,4.5)` formerly moved player toX194; now world approximately `(185.6,-20,0.05)`. Sol's independent staged compact `(65,-24,64)`, yawπ, local `(-3,4,4.9)` formerly moved player toZ70; now approximately `(64.95,-20,62.6)`. Sol's case retains staged/current-semantic provenance; do not relabel it an actual historical save. The medium corner refusal `(188,-24,66)`, yaw50°, local `(-4.7,4,4.5)` has historical codec/local/world clearance but no supported new dry landing.

Author archive `/tmp/siltwake-m1-migration-fix/migration-fix-artifacts.tar.gz`:56 payloads plus manifest, SHA256 `5e2316363a81baee7660dee9c6d307b3deedfecd77a35dcbde0cd3db90459c14`. Parent red run6 failures/1 pass; source/helper/provenance and fixed scripts indexed in README. Historical verification reads retained c0aa5cb compiled modules under `/tmp/siltwake-m1-batch-r3-astra/legacy-c0aa5cb/compiled/src/`; no historical module mutation. Root independently verified the archive and copied/redirected scripts under `/tmp/siltwake-m1-migration-root/`.

Root `npm run check` on769f2ad: **181/181 tests, typecheck/build pass**. Production JS `index-CUZXvZtF.js`, SHA256 `289fc40a8b82ab4d15bb709f50a4cd9922f07a1570bb2448da90f9f774735315`; unchanged CSS `index-CaesS9kh.css`, SHA256 `515776b96a4e38136c3de945b7b3e82ac6948bfa689093af9357fb90daf6b322`. Root confirmed indexed source/config/build bytes equal author's final source. Root reruns cover16 historical inputs,16 successful migrations including Sol diagnostic,1 safe refusal, both exact session proofs and120 additional ordinary simulated walking ticks. These are executable staged checks, not browser/earned-route evidence.

Evaluate whether all success paths are immediately clear/saveable, failure is atomic/useful, supported source provenance is honest, and conservation covers knowledge/vitals/fleet/metadata—not just inventory. Verify original journal generation and source preservation, idempotence and unchanged compatible states. Test additional specific risks as warranted. Root/author passing checks are evidence to assess, not your verdict.

## Presentation, gameplay and limits

Render/UI/audio/gameplay source is unchanged from R3; only the migration notice/refusal changes presentation. Inspect the actual current source-attributed visuals and R3 evidence, including LOOK matched pairs, reef/scout references and root combined opening/helm/Canopy/lab at `/tmp/siltwake-m1-look-root/`. R3 source06927d5 remains accurate for these images. A repeat broad visual/browser matrix is unnecessary without an identified risk. New runtime/visual claims need actual executable/rendered evidence; do not substitute passing tests for player experience.

Both R3 reviewers treat small distant roof stippling as nonblocking. Opus counterplay cost/recharge/cues, transfer friction, useful-return reward, accounting copy and canon-aware leads remain planned follow-ups; judge any concrete current blocker instead of silently waiving it as polish. Neither planned fixes nor existing sortie proof establish human enjoyment or the full ten-hour game.

Full earlier expedition/repeated-loss/seeded-carrier evidence retains4d0a7f0 provenance; later changes have targeted replays, not a fresh complete matrix. **Ordinary healthy-battery exhaustion remains open for integrated M1.** Zero-power fixtures/tests do not close it. Geometric construction/thin-throat blockers retain labelled diagnostic evidence, not nonexistent player tools. Registered mobile-refuge fallback, advanced/deep fleet and all M2–M4 scope remain obligations. SwiftShader/muted-host results do not qualify dedicated-GPU performance/audible mix/human learning, enjoyment, surprise or duration. Existing bundle/dependency advisory limits remain.

Before any browser/preview, read `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md`. Prefer existing artifacts/APIs where adequate; otherwise verify actual factory-worker isolated Linux process, T3 preview_status then own incognito tab/storage and checked-free assigned port. No Windows automation/desktop cursor capture, process-name kills or shared-tab/storage changes. Preserve historical tab14/user/peer/shared resources; close only own resources normally. No browser is required just to repeat the unchanged matrix.

Return exact candidate/base/spec/model/effort, checked scope/methods, stable findings/severity/source/reproduction/player consequence/recommendation, explicit disposition of prior findings, proof limits and separate verdicts for both complete batches. Keep report/evidence concise, identifying retained versus fresh checks. Commit only the report and stop without waiting for the peer. Root reconciles both initial verdicts; any substantive correction requires another frozen revision/fresh pair.
