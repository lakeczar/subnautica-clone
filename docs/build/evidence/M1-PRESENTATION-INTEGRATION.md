# Presentation staging and coordinator inspection

2026-10-17. Provisional source assembly, **not presentation-batch or M1 acceptance**.

Original task returned clean from `/home/worker/.t3/worktrees/subnautica-clone/t3-1a236c9a`, branch `t3/m1-presentation-clarity`, with owned tab/server closed and no children. Source commits `2ac55ef18169cfdd6cfef6c2f6195702fe2e11b2` and `6c994350d95d796e28a3fddaa4fd00dc01ec6faa`; evidence `6bb25703f4ba0a1965ea0732adacc4f107c348e2`. Merge `becc03e597d79e4aae33d67041aecc6b4d683f4f` preserves author history on `feat/siltwake-first-expedition`. Accepted `game/siltwake` remains M0-only.

Root inspected all six changed paths: UI, CSS, sound, two test files and author evidence. Production/test/dependency paths exactly match the returned author tip. Registry, simulation, saves and shared interfaces are unchanged. The view uses existing crafting/input authority and does not mutate state; threat origins remain explicit, body/equipment cues centred. No new shared contract requires reconciliation. CORE's successful-transfer feedback fix is still in its running worktree and must be checked after assembly.

`npm run check` on staged `becc03e` passed strict typecheck, **124/124 tests** and build. Log: `/tmp/siltwake-m1-presentation-coordinator-check.log`. Existing dependencies were reused; no fresh root-install claim. The unchanged economy matrix was not rerun for UI/audio work. Build hashes match author artifacts:

- `index-BGT_D_6j.js`: `39faf8ff647e53ba4bc4e2b52b305b469e9b5b0e19338aa3ea54b2441c19a772`.
- `index-DONjl4IF.css`: `14756146fd5523913bc59b8079703e86ae867d0250079c88ed57e6198ab0a797`.
- Main JS 1,258.32 kB / 320.33 kB gzip; large-chunk warning remains.

Root hash-verified all 43 entries of `/tmp/siltwake-m1-presentation/manifest.json` against local files and archived bytes in `/tmp/siltwake-m1-presentation-artifacts.tar.gz`. Viewed actual final fabrication, island-first notebook and captions-off opening captures. Quantities/refusal, visible source attribution/order, action text and readable panel layout are present. These are author-source observations; root launched no browser. Imported earned-save provenance remains exactly as attributed in [author evidence](M1-PRESENTATION.md), not a current-source earned route or new recovery proof. SwiftShader and muted audio limits remain.

Preparation and notebook originals were published for PR #4 on `pr-assets/feat-siltwake-first-expedition/` as `preparation-author-6c99435.png` and `notebook-author-6c99435.png`. HTTP 200 image/png responses byte-match inspected originals, SHA256 `d67afd6fe4a670216fb5a6a997b89eed956c5a5682039ea472be118c23b126a6` and `18dc440d9bb8ee145d48a6a69cd442d97dd90aa697231dc5d5f451fc3a13bd66`. Descriptions of PR #4/#3 were fully written/read back with current checks, unresolved focus issue and M0/M1 separation. Matching before panel captures were not collected.

## Coordinator finding P-FOCUS-1 — correction in progress

`GameView.refreshPanel` preserves focus by `textContent` and chooses the first new matching button. Inventory and fleet controls can share identical labels across different objects. Root reproduced on the author's compiled source and again on the staged root build using production GameView/executeCommand with a minimal DOM port:

1. At the pod, put three meals (`item_1`) and three glass (`item_2`) in the locker.
2. Focus glass's `Take to diver · 1` and execute that command.
3. Refresh the panel with the result. The same label restores focus to meal `item_1`, not glass `item_2`; another Enter would transfer the wrong item.

Artifacts: `/tmp/siltwake-presentation-focus-repro.mjs`, `/tmp/siltwake-presentation-focus-root-repro.mjs`, `/tmp/siltwake-presentation-focus-repro.json`. This is a deterministic production-view diagnostic, **not browser gameplay**. The passing 124-test suite does not cover this boundary.

Root assigned the same Sol max author a bounded follow-up: stable semantic control/command identity, deliberate fallback when the original action disappears, regressions for duplicate labels/partial transfer/removal/refusal and a targeted production keyboard check. Only `src/ui/view.ts`, `tests/presentation.test.ts` and its author evidence are writable. Exact new task ID is in [TASKS](../TASKS.md#m1-presentation-returned-provisional-with-focus-correction-running); original terminal result stays unchanged. No unrelated shader, core or audio expansion. Correction source and CORE dependency remain unassembled.

The original batch stays provisional. Inspect the correction, preserve relevant red/green evidence, assemble with core/visual/render/physical results and run combined gameplay before the fresh Astra xhigh/Sol max acceptance pair and separate integrated M1 gate.
