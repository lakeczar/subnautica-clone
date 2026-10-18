# M1-ASTRA-R3-01 — safe legacy carrier room migration

One bounded **Sol 6.1 max** implementation in a T3 isolated worktree from the exact committed dispatch parent. Verify clean parent and actual model/effort. Read AGENTS/STATUS first, PLAN/CONTRACTS, revised input and relevant save/carrier specifications, DELIVERY_AND_ACCEPTANCE, the complete `reviews/M1-BATCH-R3-ASTRA.md` and `evidence/M1-R3-MIGRATION-REPRODUCTION.md`. M0 alone is accepted; this correction and M1 remain provisional. No children, peer polling or reading the current Sol R3 review. That independent reviewer continues on unchanged `21d50df`.

## Exclusive ownership

- `src/save/codec.ts`: only the legacy carrier-room migration and its result checks/feedback.
- `src/sim/carrier.ts`: only the checked `carrierInteriorEntry` helper and its export/documentation, plus existing call sites if necessary to share it. Root authorizes reusing/exporting that checked placement seam; report the final signature and behavior. Preserve existing explicit entry semantics. No yaw, travel, transfer, room geometry or hull changes.
- `tests/save.test.ts`, `tests/migration.test.ts`, `tests/session.test.ts` and, if needed, one focused new `tests/carrier-migration.test.ts` for composed migration/persistence coverage. Do not edit unrelated tests or shared support files.
- `docs/build/evidence/M1-MIGRATION-FIX.md` only for repository evidence. Temporary files under `/tmp/siltwake-m1-migration-fix/`.

All other production, tests, config and coordinator records remain frozen. If a necessary fix cannot fit this boundary, send root an exact path/interface proposal while continuing independent diagnosis. No push, PR, merge, parent mutation or acceptance claim.

## Reproduced defect and desired behavior

Historical production `c0aa5cb386a6b98ff8fa7c95d123d4f50d5bc378` accepts a staged compact carrier `(188,-24,0)`, yaw π/2, player local `(-3,4,4.5)`. Historical local clearance and current incoming semantic validation pass. Current decode moves the covered old pose unconditionally to local helm `(0,4,-6)`, world X194 beyond maxX188, then returns success without checking the result. Save/Export fail; Continue installs the invalid state; Import confirmation fails its commit. Original raw storage and fleet/cargo remain intact. Taking helm is a demonstrated workaround. This is a historical-compatible staged diagnostic, not a captured old save or earned route.

Root copied/reproduced the complete codec/session proof in `/tmp/siltwake-m1-r3-root/`. Inspect `legacy-migration.mjs` before execution. Copy it and redirect output paths to your own directory; keep historical compiled modules read-only. Preserve an observed failing test/reproduction against your clean parent before edits. Do not overwrite root/reviewer evidence.

Choose a supported dry carrier-local destination that also passes actual world clearance. Prefer the authored helm when clear, otherwise reuse the existing checked interior-entry policy where applicable. Check the resulting migrated state before reporting success. When no supported safe landing exists, return a useful failure atomically, leaving active session, journal generations and source file untouched. Do not move the vessel or cargo, acquire ownership of the helm, grant air/repair/power, clamp coordinates independently, loosen validation/bounds or silently change schema/content version. Migration feedback must describe the actual safe passage instead of claiming every fallback is the bridge. Normal unchanged compatible saves remain unchanged; successful migration remains visible and idempotent. Encoding an unmigrated blocked current pose must still refuse.

Preserve all R1/R2/ROOT-CB-01 fixes and strict player/local/world relationships. The existing helper returns null for some obstructed destinations: do not replace safe refusal with unchecked projection. Keep this a small reuse of authoritative geometry, not a parallel placement framework.

## Required evidence

Add meaningful tests around production codec/repository/session behavior, not only the helper:

1. Exact historical reproduction and focused compact/medium edge-heading variants: successful results are locally/world clear, strictly valid, immediately encodable/decodable and idempotent. Fleet, inventory, knowledge, vitals, metadata and unaffected fields are conserved; disclose intentional player/velocity/notice changes.
2. No-supported-destination case: atomic useful refusal. Journal Continue/import protection, zero unintended writes, and active session/current/backup preservation are demonstrated. Do not invent invalid inputs and call them supported old saves; state historical provenance of each fixture.
3. Successful migrated local Continue, immediate Save/Export, and confirmed Import; original journal generation stays available under existing repository semantics. No tick is required to make returned state saveable.
4. Existing ordinary migration and carrier-boundary/entry regressions pass. One final `npm run check`, exact source/build identity and concise actual results. Broaden checks only if the correction changes additional behavior.

No fresh full expedition or unchanged browser matrix is requested. Use executable persistence integration and existing immutable artifacts. If browser inspection becomes necessary, first read `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md`; use T3 preview_status then own incognito tab on verified isolated factory-worker Linux, with checked-free5193. Preserve reviewer5196, historical tab14, user/peer tabs/storage and shared hosts. No Windows automation, physical desktop cursor capture or process-name kills. Close only own resources through normal lifecycle and report cleanup.

Return clean source/evidence commits, changed paths, final helper seam, checks/artifact paths and honest remaining limits. Evidence should be concise and source-attributed. Root inspects/assembles before a fresh non-author Astra xhigh/Sol max pair on a new frozen candidate. Do not wait for peers.
