# POLISH-1 slice2 — fresh independent acceptance round2

Review the complete preparation/encounter slice, including its extraction, collision, signal, preparation, hunter-art and HUD pieces. This is a fresh full-slice review after two R1 corrections, not a fix-only or HUD-only review and not completion of the ten-hour game. No reviewer may have authored these changes. Astra xhigh and Sol6.1 max each review the full scope independently; coordinator inspection is additional.

## Frozen source and authority

The dispatch supplies the exact clean candidate commit containing this brief. Its production source is **c32d8c5d9caeef12e658e697bed78505155cb6b6**, including save5005f1fc and storage11d9a0d. Diff base is accepted controls **d031803730fb44b9208e52fdfb91a88e9ddf8a41**. Verify candidate HEAD and clean worktree before review. Do not fetch/rebase onto later root work. Review all changed production/tests and affected dependencies, not historical build-record volume as if it were new implementation.

Read AGENTS, STATUS, PLAN, CONTRACTS, revised build prompt and specification pointers, settled map, DELIVERY_AND_ACCEPTANCE, and EXPEDITION_INTEGRATION. Keep major story spoilers out of the report. Relevant earlier design and acceptance context:

- `docs/build/reviews/OPUS-DESIGN-R2.md` and `OPUS-DESIGN-R2-DISPOSITION.md`.
- `docs/build/design/OPUS-DESIGN-R2-IMPLEMENTATION.md`: advisory T11–T19, narrowed by current task decisions.
- `docs/build/tasks/POLISH-1-SLICE2.md`: governing direction and all eight acceptance criteria; read in full.
- Component briefs `POLISH-1-SLICE2-{C0,RIB,2D0,2C,2D-VISUAL,2D-HUD}.md`.
- Accepted controls `docs/build/reviews/POLISH-1-SLICE1-R2.md`, with earlier R1 and keyboard correction where affected. Native Tab/focus/capture behavior must remain intact.

The owner requires intuitive controls, gameplay flow and polish, with concise menus and no repeated subtitle/helper-copy overload. Notebook voice, critical warnings, accessibility equivalents and persistence safety must remain useful. Root's narrowed contracts control over advisory pseudocode: preserve rectangular actor proxies/local worlds, use emitted-call origin rather than omniscient animal tracking or false fog visibility, and measure obstruction without changing motion. No new saved schema, registry/lore/economy, encounter timings or handling was authorized.

## All delivered components

| Piece | Source | Root inspection |
| --- | --- | --- |
| C0 mechanical view extraction |72c3355 | `evidence/POLISH-1-SLICE2-C0-INTEGRATION.md` |
| Curved reef ribs |6ebaf02 | `evidence/POLISH-1-SLICE2-RIB-INTEGRATION.md` |
| Transient signals/air/ascent/session notice metadata |c9cd039; test expectation amendment6b3ba83 | `evidence/POLISH-1-SLICE2-2D0-INTEGRATION.md`, `...-INSPECTION.md`, `...-TESTS.md` |
| Preparation menus/storage/focus |705ae5e | `evidence/POLISH-1-SLICE2-2C-INTEGRATION.md` |
| Existing hunter eye/fin warning display |afc126a | `evidence/POLISH-1-SLICE2-2D-VISUAL-INTEGRATION.md` |
| HUD/app/panel notice composition |d7f2085 | `evidence/POLISH-1-SLICE2-2D-HUD-INTEGRATION.md` |

Read each corresponding author report too. All six are integrated provisionally. Independent acceptance cannot be inferred from author or root checks. Both R1 reports are available and required input. No R2 peer report exists yet; do not obtain or share R2 findings before submitting your own independent result.

## Prior findings, dispositions and revised evidence

Read both immutable initial reports `docs/build/reviews/POLISH-1-SLICE2-ASTRA-R1.md` (8440e8f) and `POLISH-1-SLICE2-SOL-R1.md` (934e090), plus `POLISH-1-SLICE2-R1.md`. Both requested changes onb9c99a0. Also read the original `POLISH-1-SLICE2-REVIEW-R1.md`; this R2 brief supersedes its candidate/report ownership, not its scope. There are no rejected findings or unresolved disagreements hidden from you.

- **ASTRA-S2-R1-01 P2:** successful save retry left an obsolete central failure, sometimes after success-chip expiry. Source5005f1fc now clears only the existing persistence notice when a non-error persistence notification confirms a local write. System/export success is insufficient. Review clock/disposal/session safety, unrelated errors/hazards/call preservation and real failure/export/retry behavior.
- **SOL-S2-R1-1 P2:** storage intent reset ran only when panels refreshed, missing closed-panel travel away/return. Source11d9a0d extracts the existing anchor observation/reset into internal `PanelView.observeStorageContext`, called by refresh and `GameView.update`. Review correct observed departure reset, same-site continuity, inaccessible fallback and no extra DOM/focus/scroll/timer/game-state writes.

The two correction briefs, author reports and `evidence/POLISH-1-SLICE2-CORRECTIONS-INTEGRATION.md` are required. Root provisionally resolves both; you independently determine closure and review the whole slice. Original findings established contradictory UI/lifetime behavior, not save or inventory corruption.

Final correction evidence: `/tmp/siltwake-polish-1-slice2-storage-context-fix/`,71 payloads, manifest SHA2563eebd6960ed665ad91e7a299c9c2f984796c866b4b10a4f89fd584f10d5325b2. Its27 build files match root, with final source11d9a0d. Save-only evidence: `/tmp/siltwake-polish-1-slice2-save-retry-fix/`,32 payloads, manifest SHA25697f28fcd4f329b2ae19d6eaaab73061b0e4f1a2ccc29a137741376f517af8ee5, earlier source5005f1fc. Both actual Sol6.1/max turn contexts and source hashes are root-verified. The save-only receipt's sourceTree labels a full commit tree; final receipt labels the src subtree, explicitly reconciled in root record.

Root correction artifacts: `/tmp/siltwake-polish-1-slice2-corrections-root/`,13 payloads, manifest SHA256df53264966e1636aed0f72780a5944554ba69cf91b32f0946fd68cb9d8f2cd52. Both R1 defect probes pass on root compiled source, plus author trace verification. Final storage trace shows ordinary-input-handler departure to field at13385 and return to workshop at14398 with panels closed, native same-site choice retained, returned default reset, unchanged inventory/no submitted transfer. Final seeded quota refusal/export/retry preserves journal, recovers264.8ms after preceding failure/export observation, and expires chip3428.6ms later without error replay. Actual recovered state at14454 equals the export; old current generation is retained verbatim as previous. Same final build demonstrates hazard/call remaining on F5 success.

Inspect actual PNGs under final `browser/`: chosen-dart, same-site-reopen, away, return-default, combined-failure, combined-failure-export, combined-recovery, combined-expired and combined-danger-save (all `-960.png`). Read final-storage-trace/final-danger-trace and tooling-notes. Final correction uses **native rAF**, synthetic keys plus native menu/F5 on unchanged earned imports; no grants/relocation. Earlier HUD controlled-rAF evidence below retains its earlier attribution. No new fresh progression/reload or human-feel claim. Root did not launch another browser for corrections. Do not overwrite author/root evidence. Prefer targeted independent checks where new behavior leaves a real risk; do not mechanically repeat unrelated historical matrices.

## Review each acceptance criterion

1. C0 preserves accepted input/focus/capture/session/panel behavior; no stale cross-session UI or timer/resource leak.
2. Ordinary preparation/refit at CSS960×600 and1280×800: readiness, correct accessible counts, no raw instance IDs, deliberate destination retained and actionable refusals. Distinguish navigation, wheel/locator scrolling, refusals and world travel. Old13 grouped steps are no matched benchmark.
3. Notice priority, active-time pause, wall-time errors, context replacement and singular panel results. Actual save during warning must preserve danger; seeded storage failure must remain prominent with export/session safety intact.
4. Actual air source and measured obstruction for healthy/disabled/depleted craft, finite emergency/suit air, surface/pod/lab/carrier and real geometry. No safety promise or automatic movement.
5. Curved ribs preserve visible collision, continuous high-speed safety, actor boxes, local-query/ignore semantics, support, recovery and saved ownership while removing demonstrated proxy stalls.
6. Ordinary earned Canopy approach provides usable encounter information and state-bound release within real fog/occlusion. No undocumented creature progression/rate change.
7. Current checks/economies, affected old-save replay, exact-source workflow and lifecycle evidence. Examine applicable retained proof, run focused independent checks for unresolved risks, and avoid rote repetition of unaffected historical matrices.
8. Concise menu copy with meaningful captions/recovery/persistence information, no new schema/content/economy/handling/lore drift.

Astra emphasizes cross-system correctness and composed player flow; Sol emphasizes implementation, tests and provenance. Both must cover all eight and inspect actual imagery/interaction evidence where behavior requires it. Distinguish a concrete defect from an optional taste improvement and from an unverified human/hardware result. Do not use passing tests to waive a visible or playable problem.

## Evidence and honest limits

Latest combined root checks atc32d8c5:359 tests, strict typecheck/build pass. Both economies passed at660350b and their inputs are unchanged. Exact rebuilt JS `index-BpV8Fym2.js` SHA256 `14834e45c66610caeb3de10de05ea2c21ba84c853e65932567f227812b673af6`; CSS `index-Dz7JMFAC.css` SHA256 `49ea57b440d3f12ace7fb99f01e1a34880329c9ce9912066f4259f22040e074c`. Existing large-chunk warning remains.

**Retained earlier660350b evidence**, not new correction footage: root artifacts `/tmp/siltwake-polish-1-slice2-2d-hud-integration/`; manifest35 payloads, SHA e02e5a0d9c932ad2b1103529a8c018773dada0ad0c572d7ce1a13fffdb2c23e4. Author artifacts `/tmp/siltwake-polish-1-slice2-2d-hud/`;379 payloads, manifest SHA5d3d04ab79ccaed33337d61f40e7a637b08b3f9dedf4d89f8d2dd330df3f50d7. **Author `release/` is final production**; earlier diagnostic/workflow cohorts retain their earlier source. Other component reports identify their artifacts and original source hashes. Do not overwrite any prior evidence or saves.

Inspect root warning/save, release, service, refit, actual Board prompt and post-reload captures plus motion samples/video and traces. Root warning/save and retreat are actual production input-handler continuations from unchanged earned checkpoints. Refit is a short cradle service/departure/return/exit/remove/reinstall/reboard/next-outing, not fresh progression. Root real reload/Continue matches every codec-normalized state field for eight no-input steps; six author comparisons were also reproduced with no omitted fields. Earlier RIB/2C/signal/hunter proofs retain original attribution.

Important boundaries to preserve and assess:

- The ordinary first-warning animal remains off-screen, around65.2m; modest brightness did not fix that. The short emitted-call direction is complementary and is not a live tracker, visual detection measurement or safety guarantee.
- Synthetic keyboard plus a controlled four-tick rAF schedule reaches production handlers without direct state setters/grants/relocation. It proves bounded behavior, not physical-mouse comfort or real-time human pacing; no exact per-tick look replay exists. Root encounter has one unrecorded captured-look change. Native menu/Tab evidence and actual state exports are separately retained.
- Root/author final workflow each has4 panel navigations,3 commands,0 gameplay refusals,3 short travel legs,1 successful boarding,1 storage selection. Zero explicit wheels does not mean zero scroll cost; locators scrolled. Author final pre-E observation missed prompt refresh; root capture independently shows the actual Board prompt.
- Some refit information is still repeated, secondary text10–13px is small, and HUD uses substantial edge area. Judge against scope and the owner's priority. Stage1 Opus will separately inspect experience after this gate; do not defer a blocking current defect simply because that review is planned.
- Author final50-observation diagnostics include storage failure, invalid import, fresh call origin after reload, body alarms, air, obstruction, context loss and clocks. Seeded diagnostics are not ordinary earned progression. CSS960 captures normalize to1280 PNGs; viewport metadata owns layout size.
- Root excluded stale `#resume` timeout/local export before actual Continue from reload-play proof. Tooling mistakes are documented, not game refusals. Muted SwiftShader establishes no audible mix, enjoyment/duration or dedicated-GPU performance.

## Exclusive report ownership and execution

The dispatch assigns exactly one report path: `docs/build/reviews/POLISH-1-SLICE2-ASTRA-R2.md` or `...-SOL-R2.md`. Commit only that report. Put independent probes/artifacts in your own dispatched temporary directory, outside tracked source. Do not edit production/tests/config/build records, fix findings, create children, send peer messages, poll peers, push, open/merge PRs or mutate the parent. Root coordinates. If a path or assumption is wrong, report the concrete mismatch and continue useful independent review.

Use the dispatched isolated worktree and port (Astra5191, Sol5192), checking availability before starting. Before any browser work read `/work/repos/fleet/BROWSER_RULES.md` when available and `docs/BROWSER_RULES.md`. Prefer existing artifacts/APIs when sufficient. Unattended browser work must run on verified factory-worker/isolated Linux: verify the machine/process actually rendering the tab. Prefer T3 preview; call preview_status then preview_open if needed. Use only your own incognito tab/storage and bounded server. Never automate the owner's Windows desktop/cursor or drive human/peer/historical tabs. Keep actions within the page, preserve shared hosts and use normal T3 lifecycle to close only your pages/recordings; stop only your server. No relaunch loops or unverified flag changes. If isolation is unavailable, report the limitation and continue non-browser review.

## Return

Give the exact candidate/base and actual model/effort evidence, explicit **ACCEPT** or **REQUEST CHANGES**, explicit closure/open disposition for both R1 findings and an eight-row criterion disposition, precise prioritized findings with source lines/reproduction/player consequence, actual checks/imagery inspected and all evidence limits. Separate blockers from optional recommendations. State what earlier evidence remains applicable. Include commit, report/artifact paths, owned resource cleanup and confirmation of no children/source changes. Stop after this bounded handoff; do not wait on peers or continue construction.
