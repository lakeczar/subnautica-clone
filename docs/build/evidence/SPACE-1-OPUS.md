# SPACE-1 author evidence — Claude Opus 5.5 / high

Author report for [SPACE-PROGRESSION-OPUS](../tasks/SPACE-PROGRESSION-OPUS.md). This is not acceptance. SPACE-1 is a separate batch from M2-A. Root inspection and fresh non-author Astra xhigh / Sol 6.1 max review are still required, and this author cannot accept its own batch. Design record: [PROGRESSION-CURVE](../design/PROGRESSION-CURVE.md).

## Identity

| Item | Value |
| --- | --- |
| Clean parent | `dae17fcf38ae2e08cb778ebb4c0a04df92eeb072` (resolved before edits; clean) |
| Production baseline | `35c2d22473ff17ed907c62362c25d17ed47cbcd0` |
| Source commit | `7df64e34d764d7c3d4024d3c486a9f0c9384f184` |
| Report commit | the commit adding this file and PROGRESSION-CURVE.md (child of the source commit) |
| Worktree / branch | `/home/worker/.t3/worktrees/subnautica-clone/t3-4ef859b2`, `t3/siltwake-space-progression`. T3 `t3_worktree_status` attached=true. The session's initial git snapshot labelled it `t3/4ef859b2`; git and T3 both report the branch above |
| Runtime | T3 `t3_thread_configuration`: `claude-opus-5-5`, effort `high`, runtime `full-access`, thread `delegated-task…siltwake-space1-opus-high-dae17fc` |
| Production bundle | `dist/assets/index-D7ol9cOB.js`, SHA256 `082716f99d319a8e3b71c9397a3f6271c95129b5194ceabd2be01b32a91c455a` (built from the source commit; same bundle that the browser run served) |
| Artifacts | `/home/worker/.local/share/siltwake-evidence/space1-opus/`, symlinked at `/tmp/siltwake-space1-opus` (shared /tmp was full); `MANIFEST.sha256` covers 51 files |

## Changed paths — all within the brief's ownership

Source: `src/content/registry.ts`, `src/sim/{renewal.ts (new), types.ts, state.ts, step.ts}`, `src/save/{codec.ts, validation.ts}`, `src/save/expedition4/{domain.ts, types.ts, validation.ts}` (new), `src/ui/panels.ts`.

Tests: new `tests/{resource-renewal, renewal-migration, progression-curve}.test.ts`. Adapted `tests/{legacy-fixture-support.ts, m2-migration.test.ts, migration.test.ts, save.test.ts, preparation-panels.test.ts}`.

Script: new `scripts/check-progression-curve.mjs`.

Report: `docs/build/design/PROGRESSION-CURVE.md`, this file.

`progression.ts`, the legacy and foundation validators, repository/writer/session, render, hunter, carrier, recovery and existing economy scripts are unchanged.

## Contract

**Content** (`registry.ts`):

- `CONTENT_VERSION = "expedition.5"`.
- `SOURCE_RENEWAL`: the four living sheds, each `{ quantity: 2, intervalSteps }`, with 21,600 steps for the reef catches and 36,000 for the Canopy pockets at the fixed 60 Hz step.
- `RENEWABLE_SOURCE_IDS` lists them in that order; `renewable(id)` is the guard.
- The cap is the source's original `stock` (`renewalCap`).
- Source IDs, positions, stock, reserves, bundles, scan strings and clue provenance are untouched. No recipe or unlock metadata changed: no current gate defect required it.

**State** (`GameState.world`): a new `renewal: { id: RenewableSourceId; progress: number }[]` key sits after `resources`, with exactly one entry per living shed in `RENEWABLE_SOURCE_IDS` order. `progress` counts integer active steps since stock was last below the cap.

**Simulation** (`src/sim/renewal.ts`):

- `initialRenewal()` returns zero progress for every shed; New Game and migrations use it.
- `advanceRenewal(s)` runs once per `stepGame`, after `updateAction`. It does nothing unless `scenario === "expedition"` and the opening is complete. Per source, at or above the cap it sets progress to 0; otherwise it increments progress, and on reaching `intervalSteps` it adds `min(quantity, cap − stock)` and resets progress to 0. Cost is constant per step (four sources) and independent of elapsed time.
- `settleRenewal(s, id)` runs in the same action transaction when sorting completes: it clears progress if the sort filled the cap. Sorted stock above the cap is never trimmed.
- `executeCommand` (menus) never advances time.

**Current validation** (`validState`):

- `world` keys are exact. `renewal` must be an array of exactly four `{ id, progress }` objects in canonical order, each a known renewable ID with integer `0 ≤ progress < intervalSteps`.
- Semantically, non-zero progress is refused when the source's stock is at or above its cap, when the scenario is the carrier fixture, or before the opening ends.
- The existing `stock + reserve ≤ original stock + reserve` bound still holds and is not broadened: renewal only fills below the original stock.
- `encodeSave` refuses any malformed state atomically; it never normalizes.

**Migration API** (`decodeSave`):

| Input | Validation | Result |
| --- | --- | --- |
| schema 4 / expedition.5 | current `validState` | current record |
| schema 3 / expedition.4 | frozen `validExpedition4State` (`src/save/expedition4/`; body byte-identical to the parent validator except its name, domain generated from the parent build) | `migrateRenewal`: adds `renewal: initialRenewal()` after `resources`; everything else, including depletion, is unchanged |
| schema 2 / expedition.2–3 | unchanged legacy validators and relocation policy | `migrateRenewal(migrateExpedition(old))`; the intermediate is a valid expedition.4 state |
| schema 1 / foundation.1 | unchanged | unchanged path; `createGame()` already includes zero progress |

Other schema and content combinations are refused, and the original record is unchanged. Reading never writes. The first commit after Continue keeps the original generation byte-identical as `previous`. Writes are schema 4 / expedition.5 only.

## Checks on source `7df64e3` (clean `.test-build`)

| Command | Result |
| --- | --- |
| `npm run typecheck` | pass |
| `npm test` | **553 / 556**. The only failures are the three `tests/carrier-migration.test.ts` cases asserting literal `schemaVersion 3` / `"expedition.4"` at lines 76–77 (not owned; proposal below) |
| `npm run build` | pass; bundle hash above |
| `node scripts/check-m1-economy.mjs` | **fails only** at its line-20 literal `CONTENT_VERSION === "expedition.4"` (not owned; proposal below) |
| `node docs/build/design/check-economy.mjs` | pass |
| `node scripts/check-m2-a-economy.mjs` (fresh) | pass; schema 4 / expedition.5 |
| `… --earned earned-input.json` | pass. The input is root's retained completed-earned export, copied read-only from `/tmp/siltwake-m2-a-hunter-reconcile/inputs/earned-return-after-Continue.json` (SHA256 `45840e66…4e44`, schema 3 / expedition.4, tick 39125), decoded through the new frozen-validator migration |
| `node scripts/check-progression-curve.mjs` | pass; runtime-derived implemented matrix (`final/progression-curve.json`) |
| `scripts/earned-migration.mjs` (artifact) | pass: real export migrates with every expedition.4 field identical, zero progress, idempotent re-encode, 600-step future after save→decode equal (JSON form), input hash unchanged |

Baseline at the parent: 536 / 536 tests, and all three economies including the earned input passed. The new tests add 20 cases: 8 renewal rules, 6 migration, 4 progression curve, 2 panels.

None of the economies or the staged sequence advances simulation time, so each runs with **zero renewal credited**, and finite solvency is unchanged.

The baseline suite run was slowed to about 38 minutes by host contention from the other worker's concurrent render tests. The final run took 50 s. No timing claims are made.

### Proposals outside this ownership (verified, not applied)

1. `tests/carrier-migration.test.ts` lines 76–77: change to `4` / `"expedition.5"` (`proposal-carrier-migration.patch`). Applied to a scratch compiled copy: **7 / 7 pass**. No other assertion in that file needs changing, because the shared `schema3Expected` helper keeps its contract (the exact current decode of a schema 2 fixture). The truthful schema 3 intermediate is now `historicalSchema3`.
2. `scripts/check-m1-economy.mjs` line 20: change the literal to `"expedition.5"` (`proposal-check-m1-economy.patch`). A scratch copy differing only in that literal and absolute import paths **passes**.

With both applied, the expected total is 556 / 556 and all economies pass.

## Meaningful test coverage

- **Rules:** exact policy and rates. Finite sources stay finite over 80,000 steps, and reserves never refill. Boundaries are exact one step either side. Generation clips at the cap; time at the cap is not banked; sorted stock above the cap is kept. After collection, a full interval passes before regrowth. A sort that fills the cap clears progress in that step; otherwise every action step still counts.
- **No-time paths generate nothing:** menu commands, save / Continue / tick gaps, the opening and the carrier fixture.
- **Unchanged rules:** food tending and the rescue-only allocation.
- **Equivalence:** save → decode → future execution equals uninterrupted execution across a regrowth boundary; 25 in-place save/load cycles add nothing. The empty-shed notice reads "· Empty · regrowing", without mutation.
- **Migration:** exact schema 3 → 4 output for pristine and depleted states. Schema 2 → 4 equals schema 2 → 3 → 4. Ten frozen-domain mutations are refused, including injected renewal and broadened stock, reserve, IDs, blueprints and capacity. Fourteen malformed current states are refused on both decode and encode without normalization. Repository Continue does not write, and the original journal is preserved.
- **Curve:** New Game gate codes; atomic refusal of all nine non-first recipes even with full materials at either bench. Exact per-clue unlocks; all 120 clue orders converge. Acyclic prerequisites, with materials at two patches within the preceding protection. New Game → all ten recipes on finite exposed stock with zero renewal, in reef-first and island-first orders (rule-staged, not play).
- **Panels:** Bobbin plan copy before and after C02; lifecycle labels with no countdown; the fabricator lists only known plans; Basin plans add no construction row.

## Browser demonstration (production build, isolated Linux)

Read `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md` first. Host `factory-worker` (Linux). My own `vite preview` served 127.0.0.1:5190, and I used one owned **incognito** T3 tab. The peer's 5191 was not touched.

Under shared load the page rendered at about 3 fps, so with 8 fixed steps per frame, game time ran at about 0.4× wall time. Input went through the production handlers: the preview's key presses, and held keys dispatched as DOM `keydown`/`keyup` on `window`. Exact state came from F5 manual saves and read-only reads of the local journal.

**Ordinary sequence** (New Game, no injected state):

1. Four `E` presses completed the opening. I swam from the pod ramp to the north ribbon catch.
2. Before collecting, the prompt read "Downstream ribbon catch · Collect" with the shed visible (`01`).
3. Three `E` collections took the catch from 12 to 0; the work face disappeared and the prompt became "Sort · 20 s" (`02`).
4. Saved state: stock 0, reserve 12, progress 794 at tick 5385.
5. The Notebook showed "0 ready · 12 in reserve · 4 per gather. Living shed · regrows to 12 ready · sort the reserve when none are ready." with no countdown (`03`).
6. Paused for 6 s: tick and progress unchanged at 5718 / 1127.
7. Reloaded the page, waited about 8 s offline, then Continue. The stored record was still 5718 / 1127, and afterwards Δprogress equalled Δtick exactly (+344, then +232), with no catch-up or refill.
8. Exported the save (`04`, tick 7006, progress 2415).

**Labelled accelerated diagnostic** (`05-DIAGNOSTIC…`): identical to `04` except `progress = 21480`, 120 steps short of the interval, imported through the menu. This is not an ordinary expedition.

1. After resuming, the catch regrew **exactly 2**, with progress 376 = 7502 − 7006 − 120.
2. The same work-face meshes reappeared with the Collect prompt (`06`), and the Notebook read "2 ready" (`07`).
3. An ordinary `E` gave "+2 Flexible membrane · diver hold 14/16 CU". Stock returned to 0 and progress kept counting (2019 at tick 9145).

The renderer's existing `update(state)` enables each work face from `stock > 0`, so it shows presence, not partial counts; the Notebook carries the count. No separate visual counter exists.

**Not shown in the browser:** Canopy resin pockets (covered by rules tests), human pacing, GPU performance, audio.

## Findings summary

See [PROGRESSION-CURVE](../design/PROGRESSION-CURVE.md).

- **No gate bypass or premature unlock.** One misleading plan presentation was fixed: the recovery card said "fabricate at the pod" without the C02 Bobbin plan.
- **No circular prerequisites.**
- **Candidate unlock piles at C03 and C04, with a proposed redistribution.** The carrier's candidate `salvage_buoy` prerequisite is an obligatory optional purchase.
- **Current reward drought after C05/C06.** Close it with Creel first.
- **Planned membrane demand (45–59) exceeds the 48 finite units placed.** M2-B must place the second membrane family; renewal never counts toward solvency.
- **Rates:** root's baseline is kept; no evidence required a change.

## Limits

- Staged rule sequences and measured minimum travel are not human pacing.
- Ten-hour duration, enjoyment, audible mix and representative-GPU performance are unverified.
- Membrane renewal fully refills an emptied catch in 36 active minutes. Whether that feels generous needs human play.
- The planned matrix rows are design, not implementation.

## Resources

- No children, peer messages or waits. No push, PR or merge.
- The owned preview server is stopped and port 5190 is free. The owned tab was closed through `t3_preview_close`, and `preview_status` shows no tabs.
- No other process was touched.
- After the report commit the worktree is clean. Artifacts stay in the private evidence directory; no sealed or shared prior evidence was modified.
