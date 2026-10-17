# M1 completion batches — independent review round 3

Review the same frozen SHA supplied in dispatch. Production assembly is **`06927d54e5a8eae1abaa1a3c048df9c9df6bbd38`**; later candidate changes are evidence/contracts/brief only. **Diff base: accepted M0 `a2cb19f1d4cd2d795b82642a2bd357f681d1c293`.** Review the whole M1 delta, with focused new checks on changes since R2 `e0a7d0df81d1f29216a7b09daba70983381eb43a`. A prior presentation verdict does not cover the new UI/LOOK.

Return separate explicit verdicts for both complete original batches:

1. **M1 core/physical-feasibility:** gameplay, registry/economy, physics/carrier, survival/recovery, state/save/migration and runtime integration.
2. **M1 first-expedition presentation:** original richer-cel assets/environments/optics/camera, early narrative/notebook/UI, controls/focus/feedback, audio and their gameplay interactions.

The original [R1 brief](M1-BATCH-REVIEW-R1.md) remains the full acceptance scope/evidence map. Read it completely, then [R2 brief](M1-BATCH-REVIEW-R2.md), both rounds' ASTRA/SOL reports and paired dispositions. This R3 brief supersedes their checkpoint, active ownership and current test counts. This is batch acceptance only; accepted game/siltwake remains M0. Separate integrated-M1 verification/review, gameplay follow-ups and M2–M4 remain.

## Independence and ownership

| Reviewer | Sole repository output | Temporary evidence | Browser port |
| --- | --- | --- | --- |
| Fresh non-author Astra `gpt-6-astra`, explicit `xhigh` | `docs/build/reviews/M1-BATCH-R3-ASTRA.md` | `/tmp/siltwake-m1-batch-r3-astra/` | 5195, check free |
| Fresh non-author Sol `gpt-6.1-sol`, explicit `max` | `docs/build/reviews/M1-BATCH-R3-SOL.md` | `/tmp/siltwake-m1-batch-r3-sol/` | 5196, check free |

Both review the full scope. Astra emphasizes cross-system/player-experience risks; Sol implementation/invariants/artifact consistency. Verify clean parent and actual model/effort. No candidate author counts as a reviewer. Only your assigned report may be authored/committed in the checkout; no production/test/config/spec edits, children, peer polling, push/PR/merge or parent mutation. Do not read the peer's current findings before returning your independent initial verdict. Copy and redirect immutable older scripts/artifacts before executing; inspect hardcoded output paths and module imports so you test your own compiled candidate.

Read AGENTS/STATUS first, PLAN/CONTRACTS, revised input and relevant linked specifications, M1-01/COORDINATION/PARALLEL, and DELIVERY_AND_ACCEPTANCE. EXPEDITION_INTEGRATION owns dependencies. GRAPHICS_PIPELINE and original `20711d1` reference studies own richer-cel direction. Keep major story spoilers out of ordinary reports/terminal summaries; use a labelled temporary appendix only when needed.

## Prior findings and responses — none waived

| Finding | Response and review obligation |
| --- | --- |
| R1 `SOL-M1-01` / `M1-ASTRA-R1-02`, P2, distraction outside world blocks saving | `b201459` clips the 16 m ray, handles numeric overshoot and refuses unusable outward length atomically. Both R2 reviewers close it. Preserve strict validation, lifetime and repeat refusal. |
| R1 `SOL-M1-02` / `M1-ASTRA-R1-03`, P2, stale caches after New/import/null | `b201459` disposes absent cache IDs while preserving shared materials/current IDs. Both R2 reviewers close it. LOOK extends the same lifecycle test; assess replacement/reuse and gauge descendants too. |
| R1 `M1-ASTRA-R1-01`, P1, occupied tow/salvage breaks ownership | `d99aa649` refuses new occupied operations and cancels valid older operations before movement, without forcing unsafe exit or free repair. Both R2 reviewers close it. Retain paid service, drains and unoccupied conservation. |
| R2 `M1-ASTRA-R2-01`, P2, carrier travel moves attached origins outside valid world | Root accepted; `1c8f719` reserves the 17 m carrier proxy in travel bounds, clips movement before physical sweep, constrains turn arcs/extrema, and supports checked inward/tangent escape and dry entry for valid old overhangs. No validator/schema weakening. Evaluate new helpers and compatibility policy in CONTRACTS. |
| Root `ROOT-CB-01`, exact-heading roundoff still invalidates a retained state | Root reproduced the original correction's tested/returned angle mismatch: compact carrier `(65,-24,63.03314320575622)`, yaw 1.6680903988919056, look delta −0.06564769841653488. `53607cb` tests the exact requested return and clips when required. Returned 1.602442700475372, attached Z 66, now saves. Nearby valid requested heading is preserved. Review exact regression and endpoint/arc logic independently. |

Read `evidence/M1-CARRIER-BOUNDS-{FIX,INTEGRATION}.md` (author report filename may use the assignment name; use the integration link), `M1-CARRIER-YAW-{FIX,INTEGRATION}.md`, earlier R1 correction/root reports and both R2 reports. Original/retained route and real browser Save/Export/Continue evidence remains source-attributed. Root's latest carrier evidence at 9d1397d has 174 checks, 3,020 eligible staged endpoint cases, 2,609 route codec checks and five whole historical browser-export comparisons / 2,010 codec checks. These are root checks, not your verdict or a fresh full expedition.

## New UI and visual work in the candidate

The owner-requested [Opus advisory](../reviews/OPUS-DESIGN-R1.md) and [root disposition](../reviews/OPUS-DESIGN-R1-DISPOSITION.md) cover real visual/playability concerns and hypotheses. Opus 5.5 is confirmed; high was requested, not independently runtime-confirmed. Its 90-second live opening/reef inspection plus retained imagery is not full gameplay proof. It does not replace this pair or the later full-campaign Astra critic.

- **UI source e2c7ae8:** compact opening, individual HUD visibility, preserved errors/unsaved reminder and Export, native keyboard/caption/skip behavior and canvas focus; pilot guidance leaves the centre but preserves stopped/blocked warnings; recovery choices disclose costs/constraints. No saved provenance or simulation text was changed. Read `M1-UI-CLARITY[-INTEGRATION].md`. Accounting copy remains a coordinated gameplay follow-up; future recovery rule changes must update UI previews.
- **LOOK source b40d077:** regional value/color/depth tuning, cel contour/emission metadata, curved Canopy crowns/lanterns, warmer pod/lab fill, actual lab port aperture and cladding against existing solids, smaller signs, refined Dart canopy/console with state-driven charge/health bars, hunter frontal silhouette. No seat, heading, physics, state/save/audio or public renderer/factory signature change. Read `M1-LOOK[-INTEGRATION].md` and concrete seams in CONTRACTS.
- Inspect **actual pixels**, including all six matched author views and reference reef/scout studies in `/tmp/siltwake-m1-look/comparison.png`, individual images, author ordinary-replay Canopy/lab images, and root combined opening/helm/Canopy/lab captures in `/tmp/siltwake-m1-look-root/`. Do not substitute mesh counts or source inspection for visual judgment. Root observes clearer controls, stronger reef contrast, readable Canopy forms and warmer refuges; your independent assessment may differ.
- The author reported centre UI overlap from its old isolated baseline; root's combined production views show current UI resolves it. Slight distant lab roof stippling under SwiftShader remains visible: decide its severity in actual context. Visual vertex count rises 153,313→253,527 and meshes 96→98; these counts do not establish performance. Check disposal/quality/context readiness and visibility if your risk analysis warrants it, without repeating all unchanged matrices.

Original artifact directories are immutable. LOOK's manifest records camera/pose comparisons rather than a comprehensive hashed archive. Root hashed 22 inspected artifact files, confirmed all 7 pair HUD/camera matches including hunter, verified earned input bytes and author JS, and decoded 8 inputs plus final save under combined modules. Author replay uses unchanged `4d0a7f0` earned Dart input, reaches lab air through keyboard controls at tick 15318, and is distinct from six staged art pairs. The edited 103-second clip is not route/duration evidence; inspect full recording/trace as needed. Root's 3 diagnostic assembly views and native New are not a fresh full expedition.

## Current checks and unresolved limits

Root `npm run check` on 06927d5: **174/174 tests, typecheck/build pass**. JS `index-BvNijfql.js`, SHA256 `a008caeba09601c2a3a4e6561fdd4e5c7a3cc8191e8f1d7089374f5a9f77a232`; CSS `index-CaesS9kh.css`, SHA256 `515776b96a4e38136c3de945b7b3e82ac6948bfa689093af9357fb90daf6b322`. Actual root browser-fetched bundle matches; no GL error/console error/warning/failed requests in targeted assembly check. All author/root resources closed.

The full earlier expedition/repeated-loss/seeded-carrier evidence and R1/R2 limits stay in scope with their exact sources. No fresh complete preparation/recovery/carrier matrix follows the latest targeted fixes. **Ordinary healthy-battery depletion proof stays open for integrated M1**, not satisfied by zero-power fixtures. Geometric construction and thin-throat blockers retain labelled diagnostics; do not invent new player tools to fill those checks. Registered mobile-refuge fallback and full advanced/deep fleet remain M2 obligations.

Opus counterplay/transfer friction/useful-return-reward and canon-aware lead changes are still tracked for a subsequent coordinated gameplay batch. Do not treat that plan as evidence they were implemented or hide a real current M1 playability blocker behind future polish. Identify concrete player consequences, distinguish a scoped blocker from a later design recommendation, and explain any missing-proof judgment. Do not require M2–M4 completion as a new M1 condition.

SwiftShader/muted-host evidence does not qualify consumer-GPU performance, audible mix, human enjoyment/learning/surprise or ten-hour duration. Existing bundle warning/dependency advisory persist. Full campaign and dedicated final design critique remain required; no release claim.

## Method and terminal return

Inspect whole delta/spec/evidence and run focused new executable/production checks for identified risks. Independent build/check is useful; avoid repeated unchanged broad browser matrices. Runtime claims need executable or actual rendered evidence. Keep new reviewer play, earned-checkpoint replay, inspected author evidence and diagnostic setups distinct.

Before any browser/preview read `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md`. Prefer retained artifacts/APIs when adequate. Otherwise verify actual factory-worker/isolated Linux browser process, use T3 preview_status then preview_open with own incognito tab/storage and checked-free assigned port. No Windows automation, physical desktop cursor capture, process-name kills or unverified global-browser switch. Preserve historical tab14/user/peer tabs and shared hosts. Bound input/recordings and close only owned resources normally. An invalid `about:blank` URL is corrected by omitting URL when opening, not switching browsers.

Return exact candidate/base/spec/model/effort, checked scopes/methods, stable findings with severity/source or artifact/reproduction/player consequence/recommendation, disposition of each prior finding, remaining proof limits and separate **ACCEPT** or **CHANGES REQUIRED** for each named batch. Keep the report concise, link supporting artifacts and state cleanup. Commit only your assigned report, stop without waiting on the peer. Root reconciles initial verdicts and dispatches another fresh pair after justified fixes when needed.
