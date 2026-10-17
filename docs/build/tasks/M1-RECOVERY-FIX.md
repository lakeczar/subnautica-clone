# M1 recovery correction — full tow and visible transitions

Bounded Sol 6.1 max implementation, coordinated by Astra xhigh. Fix R-1/R-2 from [RECOVERY](../evidence/M1-RECOVERY.md) and [root reproduction/disposition](../evidence/M1-RECOVERY-INTEGRATION.md). TASKS records the committed dispatch baseline; verify clean exact parent before editing. No children, peer polling, pushes, PRs, parent edits or branch assembly.

Read AGENTS, STATUS, PLAN, CONTRACTS, revised input, EXPEDITION_INTEGRATION, FLEET_AND_SURVIVAL, DELIVERY_AND_ACCEPTANCE and these evidence records. Use existing production source; do not copy moving RENDER work.

## Exclusive ownership

- `src/sim/recovery.ts`, `src/sim/step.ts`.
- `src/ui/view.ts` only for recovery transition/status visibility and panel reopening; preserve existing semantic focus behavior.
- `tests/expedition.test.ts`, `tests/presentation.test.ts`, optional new `tests/recovery-route.test.ts`.
- `docs/build/evidence/M1-RECOVERY-FIX.md`.

All other paths read-only, including world/collision, content registry, save codec/types/schema, runtime adapters and render files. Propose a specific cross-path need to root before editing it. You may change the internal `updateRecovery` return contract to carry an existing notice event through its owned `stepGame` caller; no new public event/schema is preapproved. Root reconciles exact final signatures. UI should retain a useful last recovery explanation across panel opening without inventing an authoritative recovery state or exposing stale unrelated feedback as current status.

## Required behavior

1. Complete the full physical guided tow from the earned loss through a safe accessible shallow mooring. Root reproduced floor collision after 971 steps from `/tmp/siltwake-m1-recovery/saves/attach-tow-command--attached.json` (tick 28427→29398). Current Bobbin stage is `(46,-12,-54)`, towing hull one metre below; intended hull mooring is `(51,-11,-54)`. Survey a clear route/end configuration using production queries. No weakening colliders, world/art edits, unchecked final snap, teleport, free repair or charge. Keep player staging access and collar/boarding/departure usable. Treat original endpoint coordinates as existing design intent, not permission to leave a bad route merely to preserve them; document any bounded safe mooring adjustment.
2. Preserve hull/container/module/frame identities, cargo, power, damage, knowledge and protected maintenance provenance. Tow completion increments rescue only once. Genuine blockage still stops safely at the last valid pose with accessible local repair/salvage guidance; no false completion or loss deletion. Confirm no intermediate unchecked movement or unvalidated final segment.
3. Existing valid saved approach/ready/tow operations must resume safely, including saved waypoint indices and local-start attachment offsets. Do not silently reject or corrupt prior saves. Cover the actual earned attached and approach saves, plus meaningful old-operation phase/cut cases. Any unavoidable schema/interface change requires root reconciliation before implementation.
4. Publish automatic ready, blocked and completed notices through the existing event/UI path exactly when transitions occur. A player reopening Hold/Notebook after the transient message should still find actionable recovery information; test refresh/reload behavior and avoid per-tick spam. Keep current focus/refusal and paused-command behavior intact.

## Verification and evidence

First demonstrate meaningful red regressions for actual failed route/outcome and missing transition notices; the existing shallow-Y/null-operation assertion cannot distinguish abort from success. Then verify the corrected full route, all swept segments/final endpoint, a genuine obstruction, exactly-once completion, identity/conservation and immediately valid command/phase saves. Prefer behavioral tests through production world/step boundaries; clearly label mocked blockers and seeded phase diagnostics. Run `npm run check` once coherent, then only affected checks for subsequent changes.

Build the committed production source. In an isolated browser import the **unmodified earned** attached save via real Import & save, allow normal simulation, observe successful mooring/message, approach, patch, board and depart safely. Also verify automatic ready/blocked explanation and reopened panels; label any obstruction fixture as diagnostic instead of ordinary gameplay. Reload at a useful operation cut and after completion; compare full persisted state with ordinary elapsed ticks. Capture hashes, exact source/bundle, input/action logs flushed before reload, snapshots/screenshots and bounded recordings. Prior repeated-loss/cache evidence remains attributed to its original source; no full fresh preparation repeat or lengthy healthy-battery drain is assigned.

Before browser work read `/work/repos/fleet/BROWSER_RULES.md` when present and `docs/BROWSER_RULES.md`. Verify browser process is factory-worker/isolated Linux, never the owner's Windows desktop. Prefer T3 preview_status then preview_open. Use your own incognito context and free port **5193**; preserve historical tab14, all peer/user tabs, storage and servers. No process-name kills. Bounded inputs/recordings only; no timed-out control script left running. Close only owned tab/server/recordings through normal lifecycle. Record SwiftShader/muted limitations honestly.

Artifacts in `/tmp/siltwake-m1-recovery-fix/` and a new hash-indexed archive; preserve all prior evidence/saves. Return clean source/evidence commits, exact changed paths/signatures/constants, actual checks, rendered observations, old-save results and remaining gaps. Stop after the bounded handoff; completion wakes root. No acceptance claim: fresh non-author Astra xhigh and Sol max plus coordinator inspection follow, and integrated M1 has a separate gate.
