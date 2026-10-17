# M0 integrated foundation: coordinator verification

Date: 2026-10-17. Integrated source commit: **`1bba23aa734dddc0b32774ed6cd0755d05d39396`**, branch `game/siltwake`. This is coordinator evidence, not the separate dual milestone acceptance. No first expedition, fleet, campaign or GPU-performance pass is claimed.

## Integration and checks

Feature [PR #2](https://github.com/lakeczar/subnautica-clone/pull/2), `feat/siltwake-foundation` → `game/siltwake`, was opened as a draft and T3-linked immediately. Its tip `dbcebfc` contains the two independent component acceptances of `50f5569`; changes after that reviewed SHA are evidence/acceptance bookkeeping only. Integration used a normal no-conflict merge from `a3e400b`. `git diff --exit-code dbcebfc 1bba23a` is empty: the merge introduced no additional tree changes. Production source/config/tests/assets match the component-reviewed tree. Planning PR #1 remains the base dependency; main merge and public hosting are owner actions.

On the integrated checkout, Node 24.21.0 / npm 11.19.0:

- Fresh `npm ci --no-fund` passed; install log `/tmp/siltwake-m0/install.log`.
- `npm run check` passed strict typecheck, **65/65 tests**, and production build; `/tmp/siltwake-m0/check.log`.
- `node docs/build/design/check-economy.mjs` passed; `/tmp/siltwake-m0/economy.log`. This remains proposal arithmetic, not runtime economy/recovery proof.
- `git diff --check a3e400b...HEAD` and feature-to-merge tree equality passed.
- Production `index-DLXkZ6jy.js`: 1,134.38 kB / 280.16 kB gzip; SHA-256 `a3be0c5477cce93887ddf7626c34349061b951591f11afc25e182674d047a92b`, identical to the accepted feature artifact.

The main-chunk warning and previously disclosed low esbuild Windows-development-server advisory remain. Installation reported one low vulnerability; no separate fresh audit is claimed. No CI workflow exists.

## Fresh integrated production browser

Read `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md` first. Verified host `factory-worker`, Linux and local T3 chrome-headless-shell ownership. Called T3 `preview_status`, then opened one owned incognito tab through `preview_open`; no Windows browser, shared/human tab or physical pointer lock was operated. Served this exact fresh `dist/` with `npm run preview -- --host 127.0.0.1 --port 5185 --strictPort` and navigated through the environment port.

Environment: Linux Chromium 154, WebGL 2, Babylon 9.31.0, ANGLE/Vulkan **SwiftShader Device (Subzero)**; 1280×800 CSS viewport, DPR 2, Rich canvas 1280×800, 12 meshes / 79,005 vertices. Initial task-origin local storage was empty. This is software-rendered functional evidence, not a representative dedicated-GPU measurement.

**Ordinary controls:** New expedition → R cruise → Escape → F5 save. The player moved from the pod deck to swimming without teleports, injected state or direct simulation commands. After the asynchronous save settled, tick **720**, pose **`(0, -2.219177102867941, -26.543892245785315)`**, yaw 0 / pitch -0.05 were saved. Across 60 further RAF observations while paused, tick 720 and rendered frame 193 stayed unchanged. Production reload → ordinary Continue → Escape retained tick 720 and the same displayed position and complete on-disk envelope. The initial immediate post-F5 observation was still busy and is not used as the successful-save assertion.

**Focused interruption diagnostic:** held the genuine exclusive native writer Web Lock using a temporary page helper, then ordinary New/Start new & save controls. Observed one held and one pending native lock request. Dispatched explicitly **synthetic blur then focus**, released the holder and waited for the real operation to settle. New completed in the menu at tick **0**, frame **8**, and stayed there across 90 further RAF observations. Current journal tick 0 / previous tick 720; held/pending lock lists empty. An actual later Return to the water click entered playing and advanced to tick **165**. This is request-completion integration evidence, not a real OS focus transition or a new two-tab competition test.

Captured and visually inspected the actual paused completion: `/home/worker/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mvcn6c2m-f6988411.png`. The island, water, pod ramp and menu are populated; the menu reads “Expedition ready. Resume when ready.” The image is appearance evidence, while the observations establish pause/resume behavior. Existing component author/reviewer reports retain their own induced-graphics restoration and quota/competing-writer evidence; those matrices were not repeated or relabelled as fresh here.

Final snapshot showed only two Babylon startup log entries, no console errors/warnings and no failed production requests. Retained detailed environment, saved envelope, reload state, native queue, interruption/resume observations, screenshot path and action/network/console records: `/tmp/siltwake-m0/browser-observations.json`.

## Cleanup and remaining gates

Removed the task-only lock helper after it settled, verified no held/pending locks, and restored initially empty task-origin storage. Closed only owned tab `tab_1k_0430977b-1ed3-45f2-ac72-3683f9fe8942` through T3 lifecycle. Stopped only preview session 11244 with SIGINT (exit 130). Preserved other tabs/browser hosts. No preview is being claimed as a public hosted game.

Coordinator finds no integration regression in the bounded M0 scope. Freeze the evidence-bearing revision and request new non-author Astra xhigh + Sol 6.1 max milestone reviews. Both component acceptances remain at `50f5569`; this report does not substitute for M0 review. Real OS focus/hidden transitions, unsupported-WebGL startup, wider browser matrices and representative hardware/human evidence remain open. Sparse early art and all M1–M4 gameplay/content remain future work; vitals intentionally stay 100 at this milestone.
