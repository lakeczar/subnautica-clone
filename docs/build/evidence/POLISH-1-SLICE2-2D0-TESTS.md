# POLISH-1 slice2 2D0 — authorized notice expectation amendment

The eight previously failing tests now pass with explicit notice channel/context expectations. This bounded implementation follow-up changes ten expected literals in three existing test files. All prior scenarios, data, state/safety assertions, text/error expectations, event order and deep comparisons are preserved. Production source remains frozen at `c9cd03994b0eae7eb4f9ef0914f46987e3495619`.

## Revision and runtime

- Verified exact clean starting HEAD: `5d137ce6c9d9bd1c2c4f5678fb4c0b2ebbe2b1fd` (the original 2D0 evidence commit).
- Test amendment commit: `6b3ba837a6545d2513bf2aa4961c3c83418231a1`; its direct parent is the starting HEAD. This report is committed separately.
- Branch: `t3/transient-presentation-signals`; same T3-bound worktree: `/home/worker/.t3/worktrees/subnautica-clone/t3-8c15ee31`.
- Actual session `turn_context` confirms **`gpt-6.1-sol` / `max`**, timestamp `2026-10-18T10:20:44.481Z`, ordinal `413`, turn ID `01a14e86-41fa-7a81-8716-573e77cd6d90`. The collaboration settings also record `reasoning_effort: max`.
- Runtime source: `/home/worker/.codex/sessions/2026/10/18/rollout-2026-10-18T05-02-22-01a14e76-5c76-7ff1-9af2-0687a915909a.jsonl`; extracted receipt: [runtime.json](/tmp/siltwake-polish-1-slice2-2d0-tests/runtime.json).

## Recorded before result and exact changes

The before result is taken from the original sealed [final-check.log](/tmp/siltwake-polish-1-slice2-2d0/final-check.log): **321 tests, 313 pass, 8 fail**, with zero skipped, cancelled or todo. Its SHA256 is `2a0431eeb1025bbeba107711dca3f0dbf0d9652a33ec8674fca4666a341eb892`. The original manifest, all 50 payloads, archive payload entries and archive hash were verified before editing. The copied log and complete eight failure diffs are retained as [before-check.log](/tmp/siltwake-polish-1-slice2-2d0-tests/before-check.log) and [before-failures.log](/tmp/siltwake-polish-1-slice2-2d0-tests/before-failures.log).

| Original failing test | Amended expectations |
| --- | --- |
| `transfer commands report their committed quantity and destination instead of stale collection or craft feedback` | `action` on the partial transfer notice |
| `refused transfer preserves inventory and prior feedback and emits only the refusal` | `action` on the error notice |
| `directional distraction shortens its ray at every world edge/corner and saves immediately` | `action` on the repeat refusal |
| `automatic Bobbin ready and blocked transitions publish one notice through stepGame` | `action/recovery` when ready; `hazard/recovery` when blocked |
| `a blocker on the final mooring segment stops at the last clear pose without a rescue or discarded loss` | `hazard/recovery` on the blocked notice |
| `valid old occupied approach, ready and tow snapshots cancel once before movement without service` | `hazard/recovery` on the composed step notice |
| `known evidence E repeats are informative, saveable and idempotent without replaying protected recovery feedback` | `action` on the notebook notice |
| `Q keeps equipment and acoustic rules on the same target; known scans repeat without a panel or recovery rewrite` | `action` on both blocked and turned-away scan notices |

The blocked Bobbin and turned-away scan expectations were previously hidden behind their tests' first failing assertion. Both are reconciled using their existing event source. The direct `updateRecovery` result assertion remains byte-identical; the step expectation retains that asserted event through `{ ...event, channel: "hazard", context: "recovery" }`, matching metadata added at the existing composition boundary.

| Changed test path | Expected literals | Diff |
| --- | ---: | ---: |
| [tests/expedition.test.ts](../../../tests/expedition.test.ts) | 6 | +6 / −6 |
| [tests/recovery-occupancy.test.ts](../../../tests/recovery-occupancy.test.ts) | 1 | +1 / −1 |
| [tests/targeting.test.ts](../../../tests/targeting.test.ts) | 3 | +3 / −3 |
| Total | **10 across 8 tests** | **+10 / −10** |

There are seven `action` and three `hazard` expectations; four carry `recovery` context. The [expectation audit](/tmp/siltwake-polish-1-slice2-2d0-tests/expectation-audit.json) verifies that every other byte in these files matches the clean parent. The [exact patch](/tmp/siltwake-polish-1-slice2-2d0-tests/tests.patch) retains all deep comparisons and existing event filters.

## Fresh verification

| Command | Result |
| --- | --- |
| `npm run check` | Exit 0: fresh typecheck, **321/321 tests**, production build; zero failed/skipped/cancelled/todo |
| `node scripts/check-m1-economy.mjs` | Exit 0: 9 compared recipes; reef-first and island-first scenarios, each with 20 collections and 8 staged recipe receipts |
| `node docs/build/design/check-economy.mjs` | Exit 0: 39 reachable recipes, 33 patches, 8 strategy scenarios, 6 rejection fixtures |
| `git diff --check` | Exit 0 |

All eight recorded failure names appear as passing tests in the fresh log. `npm run check` ran from `2026-10-18T10:22:19.881942Z` through `2026-10-18T10:22:59.251167Z` (39.369 seconds). The existing Vite large-chunk advisory remains. Logs: [check.log](/tmp/siltwake-polish-1-slice2-2d0-tests/check.log), [m1-economy.log](/tmp/siltwake-polish-1-slice2-2d0-tests/m1-economy.log), [design-economy.log](/tmp/siltwake-polish-1-slice2-2d0-tests/design-economy.log), [checks.json](/tmp/siltwake-polish-1-slice2-2d0-tests/checks.json).

## Frozen source, bundle and original evidence identity

[identity.json](/tmp/siltwake-polish-1-slice2-2d0-tests/identity.json) records byte comparisons and SHA256 identities:

- All **41 `src` files** exactly equal the Git blobs at `c9cd03994b0eae7eb4f9ef0914f46987e3495619` and the original sealed source receipt. Source tree: `fbdd034115888e3c2f9001614764dc0c2275a934`.
- All **27 freshly built files** and **39 compiled source modules** exactly match the original sealed receipt, including the complete file set for `dist`.
- Main bundle: `dist/assets/index-ER3hOea_.js`, **1,352,610 bytes**, SHA256 **`d10145aa22f8646857560ba934eea6ef9f6678358b9cfe7336182efa40104ebc`**.
- All **23 other original test/support files** and both new 2D0 behavioral test files remain byte-identical.
- All **24 originally referenced artifacts**, including original checkpoint/receipt inputs, remain byte-identical. The **50 original sealed payloads plus their seal, manifest and archive** remain unchanged (53 files verified).
- Original report `POLISH-1-SLICE2-2D0.md` remains byte-identical: SHA256 `daaa304c52f30921341447798456ee258df2e26f76b403114915e287d2087bf9`.

All follow-up artifacts are under `/tmp/siltwake-polish-1-slice2-2d0-tests/`. The original `/tmp/siltwake-polish-1-slice2-2d0/` payloads and receipts were read-only throughout.

## Limits and handoff

No new defect was found. Production, unrelated tests, UI and peer work are unchanged. All owned verification commands completed; no browser, server, children, peer communication, push, PR or merge was used. This follow-up does not rerun or extend the original long parity matrices, make visual/feel/audio/GPU claims, or establish full-slice acceptance. Root integration and the fresh non-author Astra/Sol review pair remain required.
