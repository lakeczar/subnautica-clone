# POLISH-1 experience caption — bounded author follow-up

The approved pause-menu caption correction is complete. **“01 / HEARTH REEF” computes to 11px at CSS 960×600 and 1280×800**, including the actual paused save-error presentation. All 399 tests, typecheck/build and diff checks pass. This is implementation evidence, not an independent review or whole-experience acceptance.

## Identity and exact change

- Clean starting parent: **`eb66478a70ce1a9942f6d94b1e4af2354780af9b`**, prior production source `5005095a1c049579d33b3c33a6053a1f3177c417`, in the existing T3 worktree `/home/worker/.t3/worktrees/subnautica-clone/t3-deb4e5ad`. [Starting receipt](/tmp/siltwake-polish-1-experience-caption/starting-state.json).
- CSS/source commit: **`f2e634add96e7dd4951df4d2ac328cc31bf2e621`**. This new report is committed separately afterward.
- Actual original and follow-up runtime: **`gpt-6.1-sol` / `max`**, checked directly from the original session `turn_context` and current follow-up context. [Runtime receipt](/tmp/siltwake-polish-1-experience-caption/runtime.json).
- The sole source change adds **`.scene-caption > span`** to the existing 11px non-action uppercase-label rule at `src/ui/hud.css:56`. The text is already literally uppercase. No new rule, layout/geometry rule, interface, test or gameplay change. All other source/tests remain frozen; tests tree is still `cb711dcf5a97ac0374369f4aa919cd8ab0517545`.
- Root's explicit follow-up authorization supersedes the earlier leaf's CSS exclusion. No parent/peer work was consumed, and no children, push, PR, merge or parent mutation occurred.

## Checks and final production bytes

New artifacts are exclusively under **`/tmp/siltwake-polish-1-experience-caption/`**. [Checks receipt](/tmp/siltwake-polish-1-experience-caption/checks-receipt.json) and `check.log` record postcommit **`npm run check` exit0:399/399 pass**, zero fail/cancel/skip/todo, strict typecheck and production build. No mirrored test was added for the selector. Working-tree and parent-to-source `git diff --check` pass; the report diff is also checked before handoff. The existing >500kB main-chunk warning remains.

All browser evidence uses the one final build from `f2e634a`. [Source identity](/tmp/siltwake-polish-1-experience-caption/source-identity.json) retains the exact one-line source diff, individual source hashes and source tree `75cef7ecbd3133d26df7a4261175d9f4412d3256`. [Current evidence verification](/tmp/siltwake-polish-1-experience-caption/current-evidence-verification.json) proves **all 27 build files** match across working `dist`, retained `dist-final`, served `production` and actual HTTP5190 bytes, with no later source changes.

| Final build | SHA256 |
| --- | --- |
| `assets/index-BJIWxO4z.css` | `c7cef898ba99dd07af6e7de07d85394b83d7aa078b06c95a392cee358d78611a` |
| `assets/index-CCLbdff-.js` | `95cf4bab359e6fd28bbeecb72755294a7be6b86dcb56107fd0a8b0e492724f65` |

The observer is a separate retained diagnostic file, not a modification of production assets. The original first-return input at tick 16585 was imported through the actual File input and confirmation UI, then immediately paused. Its SHA256 remains **`edb24efec61cfcd890cfa6c0b3c29286d0d7bd71f533da6673d4c5902f0c0a91`**. The accepted imported journal equals the immutable input; HUD stays paused at 16585 throughout the checks. This is typography evidence, not another earned route, gameplay transaction or Reload/Continue claim.

## Actual pause-menu observations

Normal and labelled quota-failure views were inspected at both actual CSS viewport sizes. The storage diagnostic patches only journal writes, then invokes the actual **Save locally** control. It produces the existing full error and autosave-off/export presentation. The API is restored before cleanup.

| CSS viewport | Caption computed font / text rectangle | Root client/scroll/body width | Controls and error |
| --- | --- | --- | --- |
| **960×600** | **11px**, x776.164/y387.5,131.039×14px | **960/960/960** | Save/Export/Import 12px; main Return 13px; error 12px at x516/y200,420×76px. |
| **1280×800** | **11px**, x1078.562/y569.5,131.039×14px | **1280/1280/1280** | Save/Export/Import 12px; main Return 13px; error 12px at x836/y200,420×76px. |

Every measured visible actionable label is ≥12px. The only measured text below 12px is 11px non-action uppercase labels, including the corrected caption. Full error text remains visible, and its rectangle does not overlap the main Return/save/export controls or scene caption. No horizontal overflow was observed. Golden keyboard focus is visible in the normal captures. Four preferred captures, all copied and inspected:

- [Normal960](/tmp/siltwake-polish-1-experience-caption/media/pause-normal-960.png), paired with `traces/pause-qualified-normal-960.json`.
- [Normal1280](/tmp/siltwake-polish-1-experience-caption/media/pause-normal-1280.png), paired with `traces/pause-qualified-normal-1280.json`.
- [Current full error960](/tmp/siltwake-polish-1-experience-caption/media/pause-current-error-960.png), paired with `traces/pause-current-error-960.json`.
- [Current full error1280](/tmp/siltwake-polish-1-experience-caption/media/pause-current-error-1280.png), paired with `traces/pause-current-error-1280.json`.

The 960 first viewport cuts off part of the existing non-action build note below the menu; this report does not claim the entire menu fits without vertical scrolling. The approved selector changes no menu-frame geometry rule. T3 normalizes PNG output to 1280×800 even for CSS 960×600; retained viewport/rectangle observations establish actual CSS dimensions, with DPR2.

The first layout observer included ghost rectangles from closed native details. The retained preferred `pause-qualified-normal-*` and `pause-current-error-*` observations explicitly omit collapsed content. A temporary evaluator closure error was corrected before those qualified observations. An intermediate960 error capture occurred after the transient full notice expired; it is retained as `pause-error-expired-960.png`, not used for full-error proof. The final current-error pairs invoke a real fresh failed save immediately before measurement/capture. Preliminary observations remain intact. No missing trace or download is substituted.

## Isolation, preservation and cleanup

Both `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md` were reread before browser use. `preview_status` confirmed no attached tab. An initial `about:blank` open was rejected as an invalid preview URL without creating a tab; a corrected HTTP open created the only owned **incognito** tab, **`tab_3b_0430977b-1ed3-45f2-ac72-3683f9fe8942`**. Port5190 was checked free first. No unattended Windows or physical-cursor input was used; mouse mode was Drag and no pointer lock was requested.

[Actual process proof](/tmp/siltwake-polish-1-experience-caption/browser-process-proof.json) correlates a 900ms target-page CPU pulse with **91 CPU ticks in renderer 2045598**, UID1000, on **factory-worker**, retaining Chrome/T3 ancestry and before/after process samples. One older ancestor's executable link is permission-denied and recorded; the actual renderer and its Linux host/ownership evidence are available. Ownership is not inferred from UA or loopback.

The previous `/tmp/siltwake-polish-1-experience-compose/` archive was read-only. [Before](/tmp/siltwake-polish-1-experience-caption/composition-preservation-before.json) and [after](/tmp/siltwake-polish-1-experience-caption/composition-preservation-after.json) verify **all 368 payloads**, original manifest bytes and SHA sidecar bytes unchanged. Its original manifest SHA remains `42334db877ec81cd3d07cfa5ee6df50dbd95725965063ada4e626a608846d50c`. The original earned save is unchanged.

All 6 retained PNGs and 9 traces were independently checked before closing the tab; **zero downloads** occurred. [Preclosure receipt](/tmp/siltwake-polish-1-experience-caption/preclosure-retention.json) has no failures. `traces/final-browser-tail.json` retains 11 events and 11806 mutation observations, paused 16585, empty held input, no pointer lock, restored storage API and disconnected own observer. The full raw tool-transcript snapshot preserves preceding inputs and observations; it also contains the earlier composition turn and is not a second gameplay run.

The tab closed through T3's lifecycle tool. The owned server stopped normally by Ctrl-C in TTY52903, **exit0**, with explicit server-socket-close log. No recording was started. [Cleanup](/tmp/siltwake-polish-1-experience-caption/cleanup.json) proves server2045551/renderer 2045598 gone and shared Chrome 827911/T3 host 811435 preserved. There is no 5190 listener; the initial socket-reuse bind and later [exclusive plain bind](/tmp/siltwake-polish-1-experience-caption/port-final-exclusive.json) confirm free. The immediate unsuccessful plain-bind attempt remains recorded separately. No kill/relaunch loop or other tab/host closure.

The final immutable [manifest](/tmp/siltwake-polish-1-experience-caption/manifest.json), excluding itself and its SHA sidecar, covers **110 payloads / 36,081,764 bytes**. Every path, byte count and SHA passes retained `verify-manifest.py`. Manifest SHA256:

```text
e66c1d0fa7a6eab7d58e2351fbdcd172cf7c30d572d4c45e9dac2df17e2dc47d
```

No further defect was found within this bounded caption check. It provides no independent acceptance, new P1–P8/reload run, human enjoyment/playtime or representative-GPU claim. Root owns integration and the fresh whole-experience Astra/Sol pair and Opus verification. Work stops at this handoff.
