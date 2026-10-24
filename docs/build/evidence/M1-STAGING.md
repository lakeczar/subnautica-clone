# M1 provisional source staging

Coordinator record, 2026-10-17. **Not M1 acceptance.** Source is preserved on `feat/siltwake-first-expedition`; accepted `game/siltwake` remains M0. Root made no competing production-source changes.

- Original author source `5fd633879d7c8e059c7ff5cb6a6200895e1f7d93`, evidence `ff928689a9b758a68ad1068564d7a3c6a1e84fd2`; evidence changes documentation only.
- Provisional merge `7da897f` preserves the entire author history from parent `a2cb19f`. `git diff --exit-code 5fd6338 HEAD -- src tests scripts package.json package-lock.json index.html README.md` passed before later documentation additions.
- Root read the final author handoff and the [Astra coordination audit](M1-COORDINATION-ASTRA.md). Both tasks completed, no live children or owned running resources; specialist paths explicitly released. No specialist can edit core/shared paths without root transfer.

## Fresh coordinator checks

On unchanged source `5fd6338` at provisional merge `7da897f`: `npm ci`, `npm run check` and `node scripts/check-m1-economy.mjs` passed. Strict typecheck, **97 tests**, and production build passed. Artifact `dist/assets/index-C0WmyEai.js` matches the author's final bundle; 1,239.97 kB / 314.23 kB gzip. Large-chunk warning remains. Install reports one low advisory; no dependency changes were made.

Retained logs: `/tmp/siltwake-m1-coordinator-install.log`, `/tmp/siltwake-m1-coordinator-check.log`, `/tmp/siltwake-m1-coordinator-economy.json`. The economy checker confirms only adopted M1 arithmetic, not physical reachability or enjoyable workload.

Root independently reproduced the advisor's two R1 candidates with the compiled production command and codec modules. Diagnostic output: `/tmp/siltwake-m1-coordinator-command-repro.json`.

| Diagnostic | Before | Command(s), no tick in between | After |
| --- | --- | --- | --- |
| Carrier helm | Seeded production fixture encodes successfully | `executeCommand({type:'carrier', action:'helm'})` | Encode fails; piloted player's pose differs from hull by 7.2111025509 m |
| Repair during tow | Author-earned save decoded; disabled Dart/local position seeded; initial state encodes | `executeCommand(recover tow)` then `executeCommand(recover repair)` | Tow state encodes; repaired state fails. Hull is enabled but recovery operation still targets it |

These are labelled **seeded rules diagnostics**, not browser or ordinary-input recovery evidence. They justify the focused [M1-A0](../tasks/M1-A0.md) correction before dependent art/UI work. The passing existing test suite does not cover these immediate snapshots. R3 whole-corridor and R5 sound-origin concerns are corroborated by source inspection, not a fresh browser/listening pass.

## Evidence limits and next work

Root performed no new browser run in this staging step. Author evidence in [M1-01](M1-01.md) remains attributed to its actual source/bundle: the earlier complete route predates final geometry and failed the preparation reserve threshold; the final-source island-first route is a shorter preparation segment, not a full Dart outing. Gameplay failure/repeated recovery, the browser carrier matrix, final visual/audio coverage and several edge cases remain open.

Astra advice recommends A0 first, then exclusive main-core, visual and presentation/story/audio assignments. Carrier/recovery leaf work can rotate into a freed slot after the physical interface is frozen. No restart or broad extraction is needed. Coordinator reconciles A0 contracts, commits the baseline, then dispatches those dependent worktrees. Preserve the full M1 and later campaign gates, separate non-author paired batch/milestone reviews, and explicit human/GPU limitations.
