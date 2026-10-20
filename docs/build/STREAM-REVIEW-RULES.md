## Common rules for stream reviewers (fresh non-author Sol 6.1 xhigh)
- **What this is:** you review one stream's handoff before the coordinator (Opus 5.5) integrates it. The game is Siltwake, an original browser alien-ocean survival game (TypeScript + Babylon.js).
- **Read first:**
  - `AGENTS.md`;
  - `docs/build/DIRECTION.md`: lean gate and ground rules; streams write new modules, the coordinator composes them;
  - `docs/build/STREAMS.md`: your stream's brief;
  - `prompts/BUILD_GAME_REVISED.md` and the spec docs your stream cites;
  - the stream's interface note `docs/build/streams/<ID>.md` on the candidate.
- **Setup:** in YOUR worktree, run `git switch -c review/<id> <SHA>`. The author worktree is read-only.
- **Review against:**
  - the brief's player outcome and adverse case;
  - the spec;
  - whether the interfaces are sound for integration with the current game and the other streams;
  - real bugs, determinism and performance risks;
  - test quality: tests must exercise real behaviour, not mocks of the code under test;
  - visual or behavioural quality, where you can see it.

  Be proportionate:
  - **Blocking:** wrong or unsafe for integration, or a missed brief requirement.
  - **Non-blocking:** everything else.
- **Checks:**
  - Typecheck, plus the stream's own tests with `node --test` on its files only.
  - Babylon/NullEngine tests only through `/home/worker/.t3/projects/subnautica-clone/scripts/heavy-check.sh --deadline 600 ...` with `--test-concurrency=1`. That serializes heavy jobs on this 16 GiB VM.
  - Never run the whole repo suite.
- **Browser:** optional and short.
  - Read `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md` first.
  - Use only your port and the T3 preview tools, with no long animation replays (the shared browser is software-rendered and has stalled under load).
  - Close your tab and stop your server.
- **Deliverable:**
  - `docs/build/reviews/<ID>-SOL-XHIGH-R1.md`, plain and concise. Include the candidate and model, a verdict (accept / accept-with-fixes / changes-needed), findings each with priority, a reproduction and a suggested fix, the tests run, and the limits.
  - Commit it on your review branch. No production edits, push, PR or children.
  - Final reply: the verdict and the findings, briefly.
- **Evidence:** `/home/worker/.local/share/siltwake-evidence/<id>-review/`.

**GPU browser (since 2026-10-20):** the shared T3 preview stays software-rendered (SwiftShader), so use it for looks and behaviour only. For frame-rate or GPU checks, launch a task-owned Chrome with `--use-gl=angle --use-angle=gl-egl --ignore-gpu-blocklist`, or run `docs/build/gpu-enablement/webgl-probe.mjs --candidate angle-gl-egl`. Avoid ANGLE-Vulkan, which loses the context at startup. Follow the browser rules and close what you open. Only one GPU-heavy browser job at a time, through `scripts/heavy-check.sh`.
