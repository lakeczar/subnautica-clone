# Siltwake independent Sol review — round 1

Date: 2026-10-17. Reviewer: separate non-author `gpt-6.1-sol`, `max` (injected runtime selection). The live T3 catalog confirms inherited model `gpt-6.1-sol` and support for `max`; catalog provider defaults are not the task's runtime selection. No other independent review or findings were consulted or shared. No child delegation occurred.

## Frozen revision and scope

- Candidate reviewed: **`2eb0244d850f4aa2806ddadc3f23c9c47132d1ef`**.
- FND author source: `8d72dd2ac2822873e36fe339f8ed2db8c837084b`.
- Feature base: `a3e400b`; full bootstrap/spec-change base: `b3c3231b99ca5f1bd1159c5611216f2866e05a37`.
- Isolated T3 worktree: `/home/worker/.t3/worktrees/subnautica-clone/t3-2216521f`, branch `t3/review-fnd-eco`. HEAD matched before reading and at completion; tracked/untracked working tree status remained clean. Production source/config/tests/assets are unchanged between the author source and frozen candidate.

Read AGENTS, build STATUS/PLAN/CONTRACTS/PLAYTEST/CONTENT_MANIFEST, the revised build input, delivery/acceptance gate, FND evidence, economy report/JSON/checker, expedition integration, world progression, fleet/survival, graphics guidance and decision/tracker context. Reviewed all production modules and both test files. The code-review skill's standards/spec checklist was applied without its child-agent workflow, as this assignment explicitly prohibits delegation. No candidate files, commits, pushes or PRs were created or changed. Generated install/build/test outputs are ignored. This report and an additional reproducer are under `/tmp`.

## Separate verdicts

**FND-01: CHANGES REQUIRED at `2eb0244d850f4aa2806ddadc3f23c9c47132d1ef`.** Two P2 save-boundary defects below need correction and relevant adapter/concurrency regression coverage. The ordinary playable foundation, original scene and most save protections are otherwise supported by source, tests and actual rendered/browser evidence. No missing later campaign system is treated as a FND blocker.

**ECO-01 design proposal: ACCEPT at `2eb0244d850f4aa2806ddadc3f23c9c47132d1ef`.** Accepted only as provisional arithmetic/design evidence. It does not adopt a production registry, demonstrate physical rescue, establish route margins or validate playtime. No blocking contradiction or incorrect quantity total was found in this scope.

These are batch verdicts, not integrated M0 or merge acceptance.

## FND findings requiring changes

### FND-SOL-01 — P2: cold-start write refusal prevents play and offers an impossible export

Location: `src/runtime/app.ts:127–130`; same gating pattern in valid import at `src/runtime/app.ts:206–209`. Related evidence claim: `docs/build/evidence/FND-01.md:52`. Applies to FND acceptance 3–5 in `docs/build/PLAN.md`.

`load()` can successfully read an empty slot even though `setItem()` will throw a quota or write-permission error. That slot is `empty`, not `unavailable`. New Game then returns on `commit()` failure before `start()` installs a session. The notification says “Export this session to keep it,” but Export and Resume remain hidden because no session exists. There is no way to explore without a writable slot, unlike the fallback for a failed initial read. The import branch has the same source-level issue; import under quota was not separately browser-reproduced.

Actual production-browser reproduction on the owned incognito origin `http://localhost:5183/`:

1. With no save key, fill one task-owned localStorage fixture to the origin quota. Reads continue to succeed. In this Chromium run the fixture held 5,242,856 ASCII characters and further writes threw `QuotaExceededError`.
2. Reload the production page; it correctly displays “No local expedition yet.” Click **New expedition** through the real browser control.
3. The menu remains open; the save key remains null; `#export-game.hidden` and `#resume.hidden` are both true. The notification nevertheless directs the player to export a session.
4. Remove only the owned quota fixture and click the same button: the game immediately enters `playing`, creates a save and exposes Export. The fixture was removed after the check.

This was an actual browser storage refusal, induced by a storage fixture, not a monkeypatched storage error or injected gameplay state. Screenshot inspected: `/home/worker/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mvcjao3n-e95815e1.png`.

Requested correction: provide a safe session-only/export fallback or explicit “explore/import without local saving” choice for storage-write refusal. Preserve existing/protected records and retain conflict/validation refusals. Do not require a successful local write merely to create an exportable session. Exercise this through the app adapter, including initial successful reads followed by refused writes; the repository-only failure test cannot catch this behavior.

### FND-SOL-02 — P2: the stale-tab check and journal write are not one transaction

Location: `src/save/repository.ts:68–79`; current regression coverage: `tests/save.test.ts:114–118`. Related claim: README save safety and `docs/build/evidence/FND-01.md:50`.

The comparison at line 68 and `setItem` at line 79 are separate storage operations. Another browser process can commit between them. Both writers then return success, and the later writer builds `previous` from its old `observed` journal rather than the intervening successful generation. The single-key write protects against a half-written current/backup pair, but it does not serialize this read/check/write transaction across tabs.

Deterministic repository-level reproduction, without changing candidate files:

```sh
node /tmp/siltwake-save-interleaving-sol-r1.mjs
```

The fixture imports the actual compiled candidate modules. Two repository instances load a journal whose current tick is 0. It schedules B's tick-20 commit after A's comparison read has obtained the old record and before A's tick-10 write. Both commits report `ok: true`; the final journal contains current tick 10 and previous tick 0. B's successful tick-20 generation is absent from both. The fixture models a cross-process interleaving through `StoragePort`; it is not claimed as an ordinary-input or concurrently scheduled Chromium reproduction.

Requested correction: serialize writers with a real cross-tab exclusion/transaction mechanism and perform the stale comparison inside it, or use storage that provides a transactional conditional update. A second unprotected read alone still leaves a race. Preserve a safe fallback when exclusion is unavailable. Add an interleaving regression: the competing writer must either be rejected as stale or preserved as the previous generation, rather than both reporting success and losing one generation. The current test only covers a tab that is already stale before it starts committing.

## Reproducible checks and browser evidence

All commands ran in this isolated worktree, never the parent's checkout. Environment: Node `v24.21.0`, npm `11.19.0`.

| Check | Result |
| --- | --- |
| `npm ci --no-audit --no-fund` | Exit 0; clean lockfile installation. npm log confirms successful completion. |
| `npm run check` | Exit 0: strict typecheck, **18/18 tests**, production build. |
| `node docs/build/design/check-economy.mjs` | Exit 0: 39 reachable recipes, eight route/starter/optional scenarios, six independent optional purchase branches, five budgeted failures and 20 numeric recovery cycles per scenario; six broken-proposal rejection fixtures. |
| `git diff --check` | Pass. |
| `npm run preview -- --host 127.0.0.1 --port 5183` | Actual local production artifact served; local JS/CSS/shader module requests succeeded. |
| Extra `/tmp` interleaving fixture | Deterministically demonstrates FND-SOL-02; it is not an additional passing product regression test. |

The Vite main chunk remains 1,128.19 kB (278.41 kB gzip), with its declared warning. Build output hash `index-UKKifhai.js` matches the author's final production evidence.

Read both `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md` before browser work. Verified `factory-worker` Linux and local T3 chrome-headless-shell processes, then used T3 `preview_status` → a new task-owned incognito tab. Used only owned tab `tab_18_0430977b-1ed3-45f2-ac72-3683f9fe8942` and assigned port 5183. UA: Linux Chromium 154. Actual renderer: **ANGLE / Vulkan SwiftShader Device (Subzero)**, software rendering, 1280×800 CSS pixels, DPR 2; Rich canvas 1280×800. This is no dedicated-GPU performance qualification.

Ordinary browser controls, with readonly observations:

- Clicked New expedition; used real `R` cruise input to leave the pod and enter swimming. At tick 403 the observed pose was `(0, -1.273, -7.641)`; scene ready, 12 meshes / 79,005 vertices.
- Escape paused at tick 414 / presented frame 102. Both remained unchanged across a two-second observation. No state setter or teleport was used.
- Real F5 save, page navigation/reload, Continue and Escape retained the exact saved tick 414 and pose `(0, -1.3043917079836576, -8.263433313022608)` in this run.
- Real file upload of the author's schema-99 fixture showed a readable unsupported-schema error, no confirmation, unchanged paused tick and byte-for-byte unchanged journal.

Additional diagnostic adapter checks:

- Induced actual WebGL context loss through `WEBGL_lose_context`. The app paused at tick 417 / frame 7; Escape could not resume while lost. Restoration left tick 417 unchanged, displayed “Graphics restored. Resume when ready,” and redrew to frame 8. Explicit Escape resumed, producing tick 453 with ready graphics. This is an induced browser context-loss diagnostic, not normal gameplay or a GPU-driver failure observation.
- The actual quota fixture and its removal produced the failure/success pair described above.

Inspected the actual author screenshots for final dry-island overview (`…mvcijskw-8b2b7875.png`), corrected pod/hatch/ramp return (`…mvcicmq9-f602c913.png`) and corrected underwater scene (`…mvci4lwt-30d8a30f.png`) at their absolute evidence paths. The refuge, distinct reef ribs, shallow water and island landmark are visibly present, with original coherent cel shading. Sparse art remains early-build work, as advertised. My fresh production launch also rendered the scene correctly. Existing author evidence supplies the longer ordinary-input ramp/island routes and optional Linux pointer-lock check; I did not independently repeat those full routes or request pointer lock.

At completion the owned tab was closed through T3 and the owned preview process was stopped through its terminal session. Shared browser hosts and other agents' tabs/processes were preserved.

## FND scope and test-quality assessment

- Exact pinned TypeScript/Vite/Babylon versions and a usable lockfile/commands are present. Runtime art/code are local. Renderer startup checks WebGL 2 and has a readable error UI; actual WebGL-unavailable startup was not exercised here.
- Simulation and save state have no Babylon/DOM objects. IDs cover the seven accepted regions, eight materials, six hull roles and Bobbin. The economy JSON is clearly a proposal, not a second active content registry.
- Fixed 60 Hz simulation, frame/stall cap and pause/reset behavior are implemented and meaningfully tested. World coordinates, terrain height, pod deck/ramp and reef rib definitions are shared with rendering. Thin-wall sweep/sliding, water/shore transitions and pod return tests check useful outcomes. Conservative box proxies are an honest foundation limitation, not evidence of future vehicle/interior collision correctness.
- Save validation rejects malformed shape, unsafe numbers/discriminants, unsupported versions and nonempty future collections. Writes are validated; atomic single-record refusal, backup recovery, explicit repair and raw preservation have useful tests. Schema-1/content-`foundation.1` exact compatibility and future migration policy are recorded.
- Menu/HUD, controls/settings and explicit pause/resume are coherent in source and actual evidence. Most unit tests exercise pure boundaries; they do not instantiate the app/input/render adapters. The two findings expose consequential gaps at those boundaries and at concurrent storage access.
- README, build plan and evidence preserve the complete campaign. Missing survival drains, crafting, narrative, fleet, full world and vitals remaining at 100 are intentional later milestones, not hidden reductions or additional FND findings.

Normal-input loading/movement/pause/reload evidence is adequate for those narrow foundation claims. Real host focus loss remains unobserved, the author's synthetic blur remains diagnostic only, and hidden-tab transitions have not been independently browser-exercised. Context-loss coverage was extended by this review, but one induced restoration is not full graphics compatibility. Representative GPU and human evidence remain unavailable. Acceptance is withheld for the two actual save defects, not for a demand that the later game or all browser matrices be finished now.

## ECO-01 arithmetic assessment

The declared source/recipe dependencies preserve the preceding-tier depth envelopes. Two ordinary patches support each material's first access. Ceramic/core at 260–315 m precede 450 protection; flushed lattice at 365/385 m precedes 800 protection. Blueprint/site checks and recipe prerequisites do not require the protection being purchased. Initial Hearthline uses the five early materials and two distinct 8-alloy frame payloads; a first Dart can support that branch without its 350 refit or a mandatory Creel.

The eight quantity scenarios debit costs before grants, include suit upgrades, final repairs, reserve cells and one failed recovery patch per stage. Both first-hull choices and both fleet strategies complete without every optional hull. The six independent purchase branches cover every one of the 39 recipes quantitatively. They do not promise simultaneous purchase of all optional equipment; the report says so clearly.

Verified cargo arithmetic: final assemblies 32 CU + kit 6 + cells 4 + meals 2 + spares 4 = **48/52 CU** for service Creel or Mantle; cabin cannot share Creel's service mount. Divide + District + reserve load is **11 + 13 + 16 = 40/52**; Mantle's District load is **13 + 16 = 29/52**. Carrier raw materials total **106 CU**, Mantle **71 CU**; carrier component loads **40/34/32 CU**, each fitting Dart+buoy 56 CU with 16 CU reserves. First-hull bundled packets plus reserve are Dart 32 and Creel 40 CU against diver+buoy 40 CU. The report distinguishes packed assemblies from raw material CU and keeps buoy cargo in a separate deployed container.

Protected maintenance arithmetic is **16 A / 1 G / 10 M**, less kit **2/1/3** and five patches **10/0/5**, leaving **4/0/2**: two additional patches. Public optional spending never draws this allocation. Public vectors and safe-shelf remainders in the report match the checker, including the carrier/Creel stress case's remaining three glass, four membrane and four safe lattice units.

The 20-cycle calculation actually disables hull ratings, refunds ordinary/advanced frame and module escrow, debits reconstruction from that wallet, and conserves a separate ordinary cargo cache. Its 100% salvage assumption prevents advanced rebuild debt; a degraded advanced refund is correctly rejected. This is transaction arithmetic on the proposed rule. There are no authored staging/tether coordinates or physical salvage operations in the checker, and none are falsely claimed. Renewal binding/anti-siphoning are explicit requirements/assumptions, not implemented safeguards. Food is separately budgeted at 25 of 32 initial meals, without thirst. Collection time and nominal range are appropriately qualified, not presented as observed playtime or 25% return-margin evidence.

No blocking ECO change requested. Before adoption, the coordinator must own 52-CU service holds/pallet compatibility, the external 650 m stop and its independent final supplies, bound renewal/provenance and public-vs-maintenance ledgers, and mapping the approved proposal into the one production registry/save migration. Actual route/cargo transfers, physical rescue, oxygen/power margins, all hull missions, carrier timing, food pacing and human duration remain required later integration evidence.

## Separate M0 integrated-check concerns for coordinator

1. Resolve FND-SOL-01/02 and return one corrected frozen revision to both independent reviewers. Re-run affected checks; current batch acceptance is not permission to skip integrated M0 review or to merge.
2. Retain honest focus/background coverage limits. An integrated pause/focus/input run should exercise real focus/visibility changes where the isolated harness supports them; record any remaining gap instead of relabelling the synthetic blur. Keep unavailable-WebGL startup and any unexercised browser adapters explicit.
3. Reconcile the save contract and composition after the concurrency/failure fixes, before dependent implementation uses this boundary. Future inventory/fleet/recovery fields require a reviewed migration, not silent extension of empty v1 collections.
4. ECO acceptance authorizes only the proposal. Production adoption needs coherent source/container identity, protected provenance and atomic crafting/recovery transactions; its global ledger and selected payload inequalities are not proof of physical hauling or rescue topology.
5. Preserve the dedicated-GPU/human exceptions and large-chunk warning. Revisit scene density/readability in the first expedition; do not infer later performance, enjoyment or campaign completion from these foundation captures.
6. Minor bookkeeping: `docs/build/CONTENT_MANIFEST.md:11` references nonexistent `public/siltwake-mark.svg`; the delivered identity asset is `public/siltwake.svg`. Correct the manifest when recording the next checkpoint. This is not an ECO or FND acceptance blocker.

No major story spoilers were read or included. Full M0 milestone and eventual merge acceptance remain with the coordinator's later integration process.
