# Siltwake build status

Updated: 2026-10-17. State: paired FND-01 / provisional ECO-01 acceptance recorded; foundation PR #2 opened/linked and merged locally into `game/siltwake` at `1bba23a`. Fresh coordinator M0 checks pass. Separate independent M0 reviews are next.

## Authority and checkpoint

- Owner invoked `.scratch/siltwake/BUILD_HANDOFF.md` and the revised prompt on 2026-10-17. Routine implementation, integration, fixes and PR work are authorized. Main merge/public deployment remain with the owner.
- Specification: [revised input](../../prompts/BUILD_GAME_REVISED.md); planning source SHA `b3c3231b99ca5f1bd1159c5611216f2866e05a37`. Review acceptance for the underlying planning changes is at `6234042`; later planning evidence was bookkeeping.
- Integration branch: `game/siltwake`. Implementation begins from the build-records commit immediately after the planning source. Use `git log -1` for the current checkout SHA; task candidates and acceptance SHAs are recorded explicitly below.
- Current milestone: M0 foundation. [Plan](PLAN.md), [contracts](CONTRACTS.md), [playtest record](PLAYTEST.md), [content manifest](CONTENT_MANIFEST.md), [task ledger](TASKS.md).

## Active ownership

Coordinator `/root`: `gpt-6-astra`, `xhigh`, as reported by T3 runtime. Owns direction, integration and build records. Main implementation model: `gpt-6.1-sol`, `max`. Live Codex catalog verified both requested models and efforts on 2026-10-17. Four concurrent slots including coordinator; only coordinator dispatches.

All component authors and reviewers completed with owned resources closed and no live children. Current branch is `game/siltwake`, integrated source `1bba23a`, tree-identical to feature tip `dbcebfc`. Both component reviews accept `50f5569`; changes afterward are bookkeeping. Coordinator is preparing the new M0 review pair. [Component acceptance](reviews/FND-ECO-R3.md); [fresh integrated checks](evidence/M0-INTEGRATION.md).

## Acceptance and evidence

- FND-01 author commit: `8d72dd2ac2822873e36fe339f8ed2db8c837084b`; clean worktree. [Author evidence](evidence/FND-01.md) records 18 passing tests, final production scene and ordinary-control movement, pause, save/reload and rejected-import checks. Builder closed its tab/server and preserved coordinator tab14.
- Coordinator inspected source boundaries and actual rendered menu, pod, reef and island captures; directed corrections to pod access/hatch geometry, strict save-mode validation, paused rendering/readiness, context-loss resume gating, quality scaling and underwater atmosphere. Coordinator reran `npm run check` on `8d72dd2`: strict typecheck, 18/18 tests and production build passed. The large main-chunk warning remains; SwiftShader evidence does not qualify dedicated-GPU performance.
- Corrected source at `417a7ec`: Vite 7.3.7; native writer exclusion; explicit exportable unsaved starts/imports; async session lifecycle/cancellation. Coordinator inspected code, matched source, viewed actual fallback/HUD artifacts and ran fresh install/check: 35/35 tests and build passed. Audit confirms no Vite/high/moderate/critical entry; one low esbuild Windows-server advisory remains. [Correction evidence](evidence/FND-01-R1-FIX.md); reconciled async exports in [CONTRACTS.md](CONTRACTS.md). Both corrections are now accepted at `50f5569`; see the round-three record.
- Both round-two reviewers confirmed those three fixes but found delayed entry overriding interruption pause. Source `2c25b8b` now preserves entry intent and waits for engine reconstruction/scene readiness. Coordinator inspected source/tests and actual restored paused captures; `npm run check` passed 65/65 tests/build with matching `index-DLXkZ6jy.js`. [New evidence](evidence/FND-01-R2-FIX.md) records ordinary and diagnostic browser runs separately. Renderer callback and preparation-pause semantics are reconciled in CONTRACTS.md; both independent reviewers accepted the frozen `50f5569` candidate.
- ECO-01 proposal committed at `cd1d303`: coordinator reran the Node checker successfully (39 recipes, 33 patches, eight strategy/starter/optional scenarios, six independent optional branches, five budgeted failures and 20 numeric disable/salvage/rebuild transactions per scenario, six rejection fixtures). Both non-author reviewers explicitly accepted its provisional arithmetic/design scope at `2eb0244`; it is not a runtime registry or validated route/playtime balance.
- Existing cel art study `20711d1` is reference only. Its SwiftShader captures do not establish dedicated-GPU performance.
- Every implementation batch remains provisional until coordinator inspection, applicable checks and separate non-author Astra xhigh plus Sol 6.1 max acceptance of one frozen revision. Records go under `reviews/` following [the gate](../DELIVERY_AND_ACCEPTANCE.md#independent-review-gate).
- No fresh-player duration/enjoyment or representative GPU measurements exist.

## Exact next action

Publish `game/siltwake`, verify foundation [PR #2](https://github.com/lakeczar/subnautica-clone/pull/2) reflects integration, and establish the authoritative draft game integration PR against `docs/astra-game-build-brief`, explicitly dependent on planning [PR #1](https://github.com/lakeczar/subnautica-clone/pull/1). Link each PR with T3. Freeze the current evidence-bearing revision and dispatch fresh independent Astra xhigh plus Sol 6.1 max **M0 milestone** reviews; no component author may be a reviewer. Both must accept the same revision before M1 implementation.

Fresh integrated `npm ci`, 65 tests/typecheck/build, economy arithmetic and ordinary production movement/pause/save/reload passed at `1bba23a`. A native-held write plus synthetic blur/focus stayed paused through New completion; explicit Resume worked. [Full evidence and limits](evidence/M0-INTEGRATION.md). Actual source and built artifact match the accepted component. Do not rerun unchanged component matrices without a specific unresolved concern; assess their evidence alongside the new integrated run. Functional/contract changes require new review.

After M0 acceptance, assign the first complete expedition to the main Sol 6.1 max builder: pod/opening and early regional clues, habitat-specific gathering/crafting, first craft, survival/recovery, art/UI/audio, explicit save migration and simplified carrier/collision feasibility. [Plan](PLAN.md) and [playtest run sheet](PLAYTEST.md) retain full scope. ECO remains provisional arithmetic; runtime adoption must address its concrete module/container identities, persistent knowledge, protected recovery provenance and physical-route limits. No new owner decision is required. Main merge and public deployment remain owner actions.

### Foundation PR evidence

[PR #2](https://github.com/lakeczar/subnautica-clone/pull/2) has a verified description with 6/6 bounded FND criteria, paired exact-SHA reviews and two public actual screenshots on `pr-assets`. The island overview is author `8d72dd2` (art unchanged); the paused graphics recovery capture is independent review `50f5569`. Both URLs returned HTTP 200 image/png. The base has no runnable application, so no matching before image is claimed. No public game deployment occurred. Temporary original body: `/tmp/siltwake-foundation-pr/body.md`.

After restart, inspect branch/HEAD/worktree and task ledger; check active task status before duplicating work. Preserve major story spoilers outside ordinary updates and PR descriptions.
