# M2 Basin terrain dependency disposition

2026-10-18. Root at `1e07130f47a756c5f37cb948e0ba5ce585ded809`; active reconciliation remains on parent `8296f4017c75204325ffdf57d7057910d64e6f37`. This is a scope decision and numerical reproduction, not feature acceptance or a new browser run.

The reconciliation worker reports that all 12 original compile errors and 27 diagnostic failures are resolved in its owned changes. Its full check reaches 461/462, failing `actual source and persistent-host triangles stay supported, visible and stock-driven through replacement` at `basin_ridge_salvage_north` in `tests/resource-surface.test.ts`. Root has not yet received or accepted the terminal commits/full audit.

Root inspected `src/render/terrainSurface.ts`, the full reproduction script and JSON, then ran `/tmp/siltwake-m2-a1-reconcile/terrain-repro.mjs` read-only. This imports the worker's compiled modules; it is not an independent root compilation. New output `/tmp/siltwake-m2-terrain-disposition-root/terrain-repro.json` is byte-identical to the worker JSON, SHA256 `4ad03e39c2ab33082a26973cb2179509b1e87f08e5bafdcd171097adc133b1a5`. Original evidence remains untouched.

The actual float32 terrain vertices span X -95..205 / Z -202..88. Basin source endpoints are north salvage (160,-204), south salvage (196,-240), east fins (216,-214), and west fins (144,-244), in X/Z metres. None has any submitted terrain triangle. Physical clearance, LOS and aimed identity pass at their real normal approaches. The unchanged test falls back to workshop deck Y 1.2 for absent terrain, exposing this renderer mismatch; changing approach cannot supply missing terrain.

## Decision

- Reconciliation keeps its existing test/checker ownership, all 35 normal views / 34 stable hosts, and the failing assertion. It finishes independent preservation/economy/build audits and returns code/report commits with the failure named. No renderer edits, skipped views, assertion weakening, browser work or waiting for A2.
- A2 owns expansion/refinement of submitted terrain plus the planned Basin source/persistent-host art. Preserve the old grid's island refinement, shared-edge fans and exact workshop deck cutout. Do not globally rescale existing samples and silently change previously validated approximations. Compare actual float32 triangles, physical terrain and source work faces across old and new routes. Physical bounds, terrain rules, registry positions/yields and save state remain frozen.
- A2 may receive `tests/resource-surface.test.ts` explicitly for meaningful added coverage and diagnostics while preserving every existing assertion and view. New Basin source/host coverage must prove real support, visibility, depletion/re-entry and target rays; a permissive fallback is not a fix.
- After terminal root inspection/integration, A2 and A3 start from the same committed producer baseline carrying this specific renderer blocker. This supersedes a blanket full-green-before-consumers requirement. It does not waive corrected full checks, ordinary combined route/recovery/reload evidence or the complete-batch independent Astra xhigh/Sol6.1 max gate.

Root delivered this direction in-flight using `t3_thread_send` mode `steer`, stable request `siltwake-m2-a1-reconcile-terrain-disposition-1e07130`; response confirms `steered`/`running`. No new task or broader ownership was created. All other M2-A contracts remain unchanged.
