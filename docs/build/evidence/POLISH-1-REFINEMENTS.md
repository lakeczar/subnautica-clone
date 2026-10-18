# POLISH-1 bounded OS2 feedback/copy refinement

Implementation handoff only. OS2-02/03/07 source and bounded evidence are ready for root inspection. This record does not independently accept a feature, the combined movement/refinement batch, or stage 1.

## Identity and scope

- Exact clean starting parent: `5830e0a2e0346888b651fb9d6e94cb91c88be453`.
- Source/test commit: `4a5103f9119516eb17071c7355ba11f0e01d209d`; its immediate parent is the dispatched parent.
- T3-bound branch/worktree: `t3/os2-feedback-refinements`, `/home/worker/.t3/worktrees/subnautica-clone/t3-82f2eea7`.
- Actual session runtime: `gpt-6.1-sol`, reasoning effort `max`, on `factory-worker`/Linux. `receipts/actual-runtime.json` retains the actual turn context; `thread-binding.json` retains the T3 checkout binding. The catalog's default effort is not substituted for the actual runtime.
- Read the committed task, AGENTS/STATUS/PLAN/CONTRACTS, revised prompt and applicable specification/delivery/UI pointers, Opus R2, implementation advice section 5 and root disposition. The movement surface helpers and physics remain untouched.
- No children, peer contact/waiting, push, PR, merge, parent changes or edits outside exclusive ownership. Root alone integrates and obtains fresh independent reviews.

Changed paths are exactly:

```text
src/ui/hud.ts
src/ui/notices.ts
src/ui/view.ts
src/ui/panels.ts
src/sim/types.ts
src/sim/vehicles.ts
src/sim/step.ts
src/runtime/session.ts
src/sim/progression.ts
tests/os2-refinements.test.ts
tests/presentation.test.ts
tests/experience-signals.test.ts
tests/session.test.ts
docs/build/evidence/POLISH-1-REFINEMENTS.md
```

## Source behavior and exact seams

OS2-02 rounds the accumulated loss with `Math.round(loss * 10) / 10`, then hides and clears the chip text below displayed 0.1. Standalone 0.01/0.04 still flash the hull card; their accumulated 0.05 displays 0.1; 0.26 displays 0.3. Craft/time accumulation, urgency, the 600 ms flash, 1800 ms chip lifetime and reset/disposal remain intact.

The authorized simulation exports are:

```ts
export type ExitRefusalCode = "not-piloting" | "carrier" | "depth" | "obstructed";

// Added optional member of the existing exported NoticeOptions:
refusal?: { kind: "exit"; vehicleId: string; code: ExitRefusalCode };

export function exitBlock(
  s: GameState, world: WorldQueries,
): { code: ExitRefusalCode; message: string } | null;

// Existing compatible export, same signature:
export function exitRefusal(s: GameState, world: WorldQueries): string | null;
```

`exitBlock` owns the original validation order and every original refusal message. `exitRefusal` wraps its message; `exit()` retains its successful mutations and full saved feedback. The command adapters emit exactly one tagged action refusal for genuine explicit/contextual exits by an identified pilot after opening. Missing actors, unsupported interactions and opening commands retain generic behavior. Metadata records the attempted actor/reason even if later batched commands change the final actor. Successful receipts now say `Left the craft`, including underwater, surface and dry-refuge exits.

The existing exported UI `ActionResult` adds `full: string` and optional `refusal?: NoticeOptions["refusal"]`, alongside its display `message`, `error` and `activeLeft`. `EncounterPresentation.observeExitGuidance(guidance: NoticeOptions["refusal"]): void` is the added UI bookkeeping method. Public lifecycle signatures are unchanged. No saved state/schema, codec or other simulation interfaces changed.

The HUD composes current pilot guidance before results, including notification delivery and presentation steps. Only matching current craft/reason metadata permits `Exit blocked`. Unmatched delivery remains fully readable. Changed/cleared reasons and actor/context changes clear obsolete targeted results; changed depth values within the same reason update the full guidance without replaying the original announcement. The original full error is supplied once through the action live region for each ordinary attempt, including repeated identical attempts. Ordinary renders and active-time expiry do not replay it. Panels retain full action feedback; persistence/errors retain their existing separate routing and lifetimes.

OS2-07 changes only the requested copy/visibility: title/pause decorative caption hidden; title's single tagline retained; explicit incomplete-build note hidden on pause; manual save `Saved locally`; actual discovered habitat ready/reserve/yield counts and concise food/material follow-ups; `Have here / needed`; `Completed · N`; and the Dart cockpit-side guidance sentence. Grouping, focus identities, prerequisites, source state, launch pose and the retained narrative/safety/accessibility guidance remain unchanged. CSS and rendering source are unchanged.

## Checks and required root correction

| Final-source check | Result | Receipt |
| --- | --- | --- |
| Focused existing/new behavioral suites | 99/99 pass | `receipts/targeted-tests-final.log` |
| `npm run check` | Typecheck passes; 418/419 tests pass; stops before build | `receipts/check-final.log` |
| Separate `npm run build` | Pass; existing chunk-size advisory | `receipts/build-final.log` |
| `node docs/build/design/check-economy.mjs` | Pass | `receipts/economy-candidate-final.log` |
| `node scripts/check-m1-economy.mjs` | Pass | `receipts/economy-m1-final.log` |

The full check is **not green**. `tests/session-notices.test.ts:40`, outside exclusive ownership, still expects `Saved locally. The previous valid save is retained as a backup.` The required correction is only that expected string to `Saved locally`, preserving its event-order, persistence metadata and subsequent import assertions. The repository file is unmodified. The proposed root patch is `receipts/root-session-notices-correction.patch`.

A detached copy of that compiled suite, its existing fixture and current compiled source passes **10/10** after only this expected-string correction (`receipts/proposed-expectation-check.log`). Its first temporary run lacked the fixture import; copying the existing fixture resolved that harness setup error. This supplemental result does not turn the unchanged repository's full check green. Both economies were run once on final source; no economy assertions were weakened.

Behavioral coverage includes query precedence/text/purity, both adapters and contextual interact, one refusal/no success cue, command batches/final actor changes, missing actor/opening/generic fallback, unchanged successful exit transaction/air supply, impact accumulation/flash/time/craft/session/disposal, current guidance and depth updates, full one-time/repeated announcements, expiry and panel/menu/persistence routing. Existing import/Continue/new/reset and save-failure coverage is retained.

## Production browser evidence

Read `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md` before browser work. Used T3 `preview_status`, then an owned incognito tab and explicit tab IDs. Ownership was established on isolated Linux by a page-local busy pulse and corresponding renderer CPU ticks: PID `2219402`, UID 1000, ancestry through `827917`/`827915`/`827911` to T3 `811435`. Both ownership receipts are retained. The remote thread alone was not treated as proof.

The production before/after builds each contain 27 files:

| Build | Main asset | SHA-256 |
| --- | --- | --- |
| Parent | `index-DBZ5dmh1.js` | `ece9dbe372ca4bcc25d96421175193a44dbce28088373000284186a37a8713eb` |
| Source commit | `index-DUTF9Fq3.js` | `d42d10bcb0a8b63af7ce4614c2476acd1a9be048bedc3e05c834ff572d835006` |
| Identical CSS | `index-CHzXt-7W.css` | `ec97b5d97f29dfda288959b2341ac6a6b825f8eddadca1a2fe55b9d8ee3209dd` |

The fetched production asset hash matches the final build. Full build/file and source/tree hashes are in `receipts/build-{before,after}-hashes.json` and `source-identity.json`. Port 5190 was checked free before the owned production server. The supplementary diagnostic server used free port 5191.

Actual production captures cover title, pause, known habitats, fabrication and matching blocked-exit cockpit at **CSS 960×600 and 1280×800**. T3 screenshots use a raster 1280×800 preview surface even for CSS 960×600; viewport measurements and accessibility boxes retain the actual requested CSS sizes. Chromium 154 uses software SwiftShader/WebGL2, DPR 2, Light rendering and Drag mouse. No pointer lock or OS cursor/focus actions were used.

| View/workflow | Observed result | Main payloads |
| --- | --- | --- |
| Title and pause, both sizes | Caption has `hidden: true`, `checkVisibility(): false`, computed `display: none`, zero rectangle. Pause also actually hides tagline/build note. Title retains one tagline and the requested incomplete-build copy. The existing small title menu scrolls to its build note when Continue is available. | `before/{title,pause}-*.png`, `after/after-{title,pause}-*.png`, title-note scrolled captures and measurement JSON |
| Known habitats, both sizes | Eight discovered entries show actual counts and requested follow-ups; source state/yield/reserve is unchanged. | `before/habitats-*.png`, `after/after-habitats-*` |
| Fabrication, both sizes | Requested count label and `Completed · 7`; existing current-craft/preparation groups, availability and controls retained. | `before/fabricate-*.png`, `after/after-fabricate-*` |
| Seven-warning cockpit, both sizes | All seven warnings retained; one full actionable exit reason in guidance, short `Exit blocked` result, zero measured HUD element overlaps. Full announcement once, then clear/full again on repeated E. | `before/seven-*`, `after/after-seven-*` |
| Panel and save/error routing | Fabricate clears targeted result. Page-local quota fault gives original full persistence error outside panel without overlap. Restored storage then F5 gives `Saved locally`, clears obsolete persistence warning; closing panel does not replay the exit result. | `after/after-panel-save-error*`, `after/after-panel-save-retry.json`, `after/after-seven-panel-*` |

Seven-warning scenes are **staged diagnostics**, imported from the retained valid severe seed and held with a bounded rAF freeze for comparable before/after composition at tick 16593. They are not earned severe-danger gameplay. Initial setup incorrectly removed this tab's observed journal, correctly triggering writer-conflict protection; stable storage plus an actual reload/import corrected the setup. Earlier wrong-state/time-out attempts are not the strict comparison pair. Repeated same-file upload also required a fresh filename/change event. The final matrix trace and named seven-warning captures retain the corrected state.

The bounded ordinary workflow starts from the previously earned Dart checkpoint, tick **16585**. A finite page-local W hold requested 2400 ms; contact produced a real `Hull −0.6%` chip and hull-card flash (recording frame at 8.5 seconds). At tick **16729**, a trusted E press safely exited into swimming with `Left the craft`; the full saved feedback stayed `Clear exit. Your personal oxygen and pressure protection now apply.` Returned to menu, manually saved, exported, actually reloaded, used Continue and exported again. The observer immediately paused entry for comparison without a simulation tick grant.

The **complete exported game state**, format/schema/content versions and journal bytes match across that reload at tick 16729. The only export metadata difference is `savedAt`, generated by each export; session ID and creation time match. `receipts/actual-reload-comparison.json` retains the full comparison and canonical state SHA-256 `033c4bc1d234c80caa6f8bea0302e2fa9b2f5bd40561802c4192b29b1bfb4fa0`. Unedited exports/journals and the 37.958-second recording are retained under `raw/`; bounded input/timing events are in `receipts/earned-workflow-trace.json`. Synthetic page-local holds are marked untrusted in the trace; native E/clicks retain trusted event flags. This is a short checkpoint workflow, with no fresh full-expedition claim.

Supplementary native diagnostics bundle the actual current GameView/simulation modules with the identical production CSS. Controlled clearance/depth/craft changes and exact injected damage are explicitly staged. All **9 impact** and **14 refusal/routing** checks pass: tiny standalone impacts flash without text, honest accumulation, 0.3 display, craft/expired-window clearing, 600/1800 ms behavior/reset; matching explicit/contextual results, accurate changed depth, reason clear/change, repeated full announcements, unmatched full fallback, actor/missing-actor changes and menu/panel routing. Scripts and raw results are in `diagnostic/`, `scripts/*diagnostic-sequence.js` and `after/{impact,refusal}-diagnostic.json`.

These software-rendered observations do not establish separate human comfort/enjoyment, actual screen-reader usability, audible-mix or consumer-GPU results.

## Payload and cleanup

Payload root: `/tmp/siltwake-os2-refinements/`. The finite `manifest.json` lists **244 regular payload files, 17,890,469 bytes**, excluding only itself and `manifest.sha256`; no symlinks. Manifest SHA-256:

```text
0aac46682fc3c8efd456d61bc88553d98610ad7c0eee45163cced5b64bb8faa6
```

Before/after captures, input/output save provenance, bounded traces, scripts, exact production builds, model/checkout/process receipts, source diff, check logs, proposed root correction and cleanup are included. Prior archives were read-only; adapted scripts were copied into this task directory.

Recording stopped and transferred. Temporary storage patch restored. The owned tab `tab_3m_0430977b-1ed3-45f2-ac72-3683f9fe8942` was closed through T3's normal lifecycle; final status has no attached tab and renderer `2219402` is gone. Owned server terminals 51640/57082 exited normally via Ctrl-C; ports 5190/5191 are free. Shared browser hosts `827911`, `847778` and T3 `811435` remain. No global process kill or browser relaunch was used. See `receipts/cleanup.json` and `cleanup-preview-status.json`.

Ownership is released after the source/evidence commits. Root still needs the adjacent exact-copy correction, combined-batch inspection/freeze, fresh non-author Astra xhigh and Sol 6.1 max acceptance, and fresh Opus stage-1 verification.
