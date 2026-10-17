# FND-01 round-one correction assignment

Role: main builder, `gpt-6.1-sol` at `max`. Coordinator: Astra xhigh. The owner has authorized construction, fixes and PR integration; no start confirmation is needed. Only the coordinator dispatches. Do not delegate children, create PRs, push, merge or change branch. Work exclusively in your T3-created worktree; parent source is unchanged from review candidate `2eb0244d850f4aa2806ddadc3f23c9c47132d1ef` (author `8d72dd2`). Parent HEAD additionally contains documentation-only review records.

Read AGENTS.md; docs/build/{STATUS,PLAN,CONTRACTS}.md; prompts/BUILD_GAME_REVISED.md; docs/DELIVERY_AND_ACCEPTANCE.md; docs/build/evidence/FND-01.md; and the complete independent reports:
- docs/build/reviews/FND-ECO-R1-ASTRA.md
- docs/build/reviews/FND-ECO-R1-SOL.md
- dispositions in docs/build/reviews/FND-ECO-R1.md.

This is a bounded correction pass on FND-01, not M1 gameplay. Preserve the authored scene and unchanged schema-1/content-foundation.1 save data compatibility. Do not change economy design/checker files. ECO-01 has two qualified acceptances as a provisional proposal; its runtime adoption remains later.

## Exclusive editing paths

Affected production persistence/session/input/UI adapters under `src/save/`, `src/runtime/`, `src/ui/`, plus `src/main.ts` or style changes only if necessary to fix these findings; meaningful tests and test configuration; `package.json`, lockfile and Vite configuration as required for the dependency fix; README save/run instructions; new evidence report `docs/build/evidence/FND-01-R1-FIX.md`. Keep edits narrowly related. Original FND-01 evidence is historical and must not be rewritten to pretend the first revision passed. Coordinator owns all other build/review/planning documents and will reconcile contracts from your actual exports. Do not edit renderer, world/simulation/content or unrelated art without a concrete demonstrated dependency and coordinator reconciliation.

You may commit assigned files to your isolated branch. Return exact commit(s), changed paths, exports/interface changes, checks, evidence and resource cleanup. Do not integrate into the parent's branch.

## Accepted findings and direction

1. **FND-A1, P1 — vulnerable Vite 7.3.1.** Coordinator reran audit and confirmed the applicable high-severity advisories. Pin a currently patched compatible release (audit recommends 7.3.7), regenerate lockfile, run fresh installation/check/audit. Do not indiscriminately upgrade unrelated packages. Document any remaining advisory with its actual context; the separate low-severity esbuild Windows server advisory was not an established exploit in this Linux/static-runtime path.

2. **FND-A2 / FND-SOL-01, P2 — write refusal blocks an exportable session.** Storage can read successfully yet reject a first write. Preserve every existing local record and the current in-memory expedition on unsuccessful operations. Offer a clear explicit session-only start/import choice after eligible storage failure, with export available and automatic saving disabled. An initial empty New Game may enter an unsaved session with a clear warning, but failed replacement of an existing session must not silently discard it. The usual replacement confirmation remains. A validated import must be usable when local storage cannot write. Keep malformed/future validation, protected-record safeguards and stale-writer conflicts distinct; do not treat every rejection as permission to replace a session. A failed manual/autosave must retain the active session and export route. Wording must match what is actually possible.

3. **FND-A3 / FND-SOL-02, P2 — concurrent writers lose a successful generation.** Put compare-and-journal-write inside a real cross-context exclusion/transaction boundary. Prefer a small injected asynchronous writer-lock port backed by browser Web Locks; an equally narrow real transaction is acceptable. Both tabs must use the same per-origin lock name. Preserve one-record current/previous/preserved atomicity and compare the observed record after acquiring exclusivity. A second unprotected read or a storage-event listener is not a fix. Without a safe supported lock, allow read/export and clearly unsaved play; do not silently fall back to racing writes. Retain existing saves and explicit corrupt/future repair behavior.

If persistence becomes asynchronous, keep composition coherent: prevent per-frame duplicate autosave queues; take a consistent snapshot; disable/dedupe conflicting pending UI operations; do not let a delayed save/import/new-game result overwrite a newer session or resurrect a disposed app. Cancelled operations and failures must clear busy state. Use one narrow lifecycle owner and a testable boundary, not a generic framework. Record the exact new exports/contracts so the coordinator can reconcile before dependent consumers. No data-schema bump is required merely for writer serialization.

## Required verification

- Fresh `npm ci`, strict `npm run check`, `npm audit --json` with relevant finding resolved, whitespace check. Keep current meaningful tests; extend them rather than weaken.
- Add competing-writer coverage with two independent repositories sharing the exclusion boundary and an adversarial interleaving: the losing stale writer must reject or its predecessor must be retained, never two successful writes with one absent from both generations. Check rejected writes release exclusion and unavailable exclusion never writes. Preserve all existing current/backup/raw protection tests.
- Exercise session-boundary read-success/write-failure for empty New Game and valid import; export must represent the chosen in-memory session, local bytes must stay unchanged, autosave must be disabled, and cancelling an unsaved replacement must retain the existing session. Cover the important async session/disposal race introduced by your design.
- Use actual production-browser checks on an owned origin after final build: normal new/move/pause/save/reload; actual quota refusal for New Game and valid import with explicit fallback/cancel/export; invalid/future import preservation; native exclusion availability and focused competition diagnostic if feasible. Label storage fixtures and synthetic/context diagnostics distinctly from ordinary controls. Inspect actual render to guard regressions. Repeat only relevant affected checks.
- Report remaining gaps honestly. SwiftShader does not establish dedicated-GPU performance. No campaign/human/ten-hour or physical recovery claim belongs to this pass.

## Browser isolation rules

Before any browser/preview/screenshot/test, read `/work/repos/fleet/BROWSER_RULES.md` when present and `docs/BROWSER_RULES.md`. Use HTTP or existing artifacts if sufficient. Verify browser process is on factory-worker/isolated Linux, not the owner's Windows desktop. Prefer T3 preview_status then preview_open and focused actions. Use task-owned incognito storage and your own production server, suggested port 5184. Preserve shared/user tabs and the coordinator's blank tab14. Pointer lock only on verified isolated Linux. Close only owned pages/server using app lifecycle/terminal session; do not kill shared hosts. If browser is unavailable, continue checks and report actual limitation rather than switching to Windows. Retain artifacts and identify actual renderer/hardware/input method.

Return a committed, runnable correction candidate with full evidence and no claims of independent acceptance. Coordinator will inspect/integrate the correction commits, update shared contracts, freeze one revision and dispatch fresh Astra xhigh + separate Sol 6.1 max reviews.

