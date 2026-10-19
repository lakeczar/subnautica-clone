# SPACE-1 bounded version reconciliation

Delivered the three authorized assertion-literal corrections on **153b4a452be217b50e79275646f71a7d14f7bd6a**. Clean compilation, **93/93 focused tests** and M1 economy pass. This is an isolated provisional composite; neither SPACE-1 nor M2-A is accepted by this task.

The checkout began clean at exact root baseline **866db7ff74463a5251b9f77ae32e0d60628ab450**, branch `t3/space-1-reconcile`, path `/home/worker/.t3/worktrees/subnautica-clone/t3-9c930742`. The original session `01a15458-8600-7ba3-b8ae-2795f2e353a0` records `gpt-6.1-sol` / `max` in its first actual `turn_context` at `2026-10-19T13:27:30.440Z`. T3 reports the same model/provider (`codex`), attached worktree and branch, with a subagent relationship to root. The live catalog's default effort is not used as runtime evidence.

Explicit local merge **32e9fce5d9953562b80cf5b5e42ca6b9c0fa0805** has parents `866db7ff74463a5251b9f77ae32e0d60628ab450` and Opus report **239b301b65042f145403c9ec6cfc590cc93a54fa**, which contains source **7df64e34d764d7c3d4024d3c486a9f0c9384f184**. Command: `git merge --no-ff 239b301b65042f145403c9ec6cfc590cc93a54fa -m 'merge: compose returned SPACE-1 report for bounded reconciliation'`. The merge completed without conflicts or manual resolution. Root and Opus checkouts were not mutated.

Authored code changes are exactly:

- `tests/carrier-migration.test.ts`: output schema `3` → `4` and output content `expedition.4` → `expedition.5` in `assertMigrates`.
- `scripts/check-m1-economy.mjs`: current executable content `expedition.4` → `expedition.5`.

A byte-level comparison against the merge proves every other byte in both files is unchanged. Historical labels, schema2 inputs, comparison/refusal/relocation/idempotence assertions, adoption tag `expedition.3`, historical proposal hash and every economy assertion remain intact. The only additional authored repository path is this report. The diagnosing-bugs skill's existing-test feedback loop was used; the task's pre-inspected, exact correction made broader hypothesis generation and instrumentation unnecessary.

All checks ran serially with `NODE_OPTIONS='--max-old-space-size=960 --max-semi-space-size=16'`, Node **v24.21.0**, and test concurrency **1**. V8 reports a total heap limit of **1,056,964,608 bytes / 1008 MiB**, below 1 GiB. Dependencies were installed with `npm ci --no-audit --no-fund`; the lockfile is unchanged. Only this checkout's generated `.test-build` was removed before each compilation.

| Check | Revision | Actual result |
| --- | --- | --- |
| `node node_modules/typescript/bin/tsc -p tsconfig.test.json` after clean output removal | Merge | Exit 0 |
| `node --test --test-concurrency=1 .test-build/tests/carrier-migration.test.js` | Merge, before correction | 4/7 pass; exactly three failures at `assertMigrates`, actual schema4 versus expected3 |
| `node scripts/check-m1-economy.mjs` | Merge, before correction | Exit 1 at line20: actual `expedition.5` versus expected `expedition.4` |
| Same clean test compilation | Correction | Exit 0 |
| Exact focused command below | Correction | 93/93 pass, zero failures/skips/cancellations; includes all seven carrier-migration cases |
| `node scripts/check-m1-economy.mjs` | Correction | Exit 0; nine adopted M1 recipes, ten executable recipes, reef-first and island-first staged transactions; historical content remains `expedition.3` |
| Private frozen-domain comparison command below | Correction | Exit 0; all 17 frozen domain exports equal their original-source projections; validator and saved-type body comparisons pass |

Exact focused invocation, using the environment above:

```sh
node --test --test-concurrency=1 \
  .test-build/tests/carrier-boundary.test.js \
  .test-build/tests/carrier-clearance.test.js \
  .test-build/tests/carrier-migration.test.js \
  .test-build/tests/carrier.test.js \
  .test-build/tests/resource-renewal.test.js \
  .test-build/tests/renewal-migration.test.js \
  .test-build/tests/progression-curve.test.js \
  .test-build/tests/m2-migration.test.js \
  .test-build/tests/migration.test.js \
  .test-build/tests/save.test.js
```

The focused checks cover carrier bounds/clearance/transactions, historical landing and atomic refusal, renewal boundaries/caps/finite stock, malformed current and old-domain saves, deterministic future equality, journal preservation, current gates and all120 clue orders. The progression and M1 checks preserve finite-stock solvency with zero renewal credited. They are automated rule/staged-state evidence, not ordinary-input play.

`node /home/worker/.local/share/siltwake-evidence/space1-reconcile/verify-frozen-domain.mjs` reads immutable Git blobs at original **dae17fcf38ae2e08cb778ebb4c0a04df92eeb072**. It reconstructs every exported frozen-domain projection from the original registry/routes/carrier/modules/world declarations, including IDs, provenance, stock/reserves, costs, bounds, recovery attachments and carrier datums. The schema3 validator body from `export const record` onward is byte-identical after normalizing only its entry-point name; saved types from `Vec3` through `GameState` are byte-identical. Original `src/save/legacy/` and `src/save/foundation.ts` are unchanged. This comparison does not establish a complete semantic proof of the copied dependency helpers or replace independent review.

Production verification: all **59** tracked `src/` files match their authorized origin—11 imported paths match the Opus report exactly, and all remaining paths match the root baseline exactly. `git diff 32e9fce5d9953562b80cf5b5e42ca6b9c0fa0805 153b4a452be217b50e79275646f71a7d14f7bd6a -- src` is empty. Source tree is **ed2892b10acdcff9528b520b0a38d8a7ae55620a**. All **110** emitted production files, including source maps, match before/after clean compilation byte for byte.

Private evidence is `/home/worker/.local/share/siltwake-evidence/space1-reconcile/`: baseline/runtime/T3 receipts, exact command arguments and exit statuses, before/after logs, correction patch, production manifests, composition verification, frozen-domain script/results and final handoff receipt. `SHA256SUMS` inventories the retained payloads. Existing sealed evidence was not changed. All recorded owned command processes exited; no browser/server/port, children, peer contact, push or PR was used. No temporary production instrumentation exists; the committed checkout is clean at handoff and assigned paths/resources are released.

No full suite, `npm run check`, production Vite build, other economy invocation, browser or timing population was run. Opus's earlier553/556 result remains historical, not a new composite result, and no556/556 extrapolation is claimed. No unexpected failure remains within the executed checks. Root retains the final full composed check, M2-A disposition and fresh complete SPACE-1 Astra/Sol review. Progression recommendations remain proposals.
