# M2-A warm activation — tracing preflight

**Capability result: UNSUPPORTED_REQUIRED_ATTRIBUTION. Causal result: INCONCLUSIVE.** The working T3 browser exposes no supported target-specific trace/profiler interface capable of satisfying the required renderer/thread, scheduler and GC/JIT observations. The preflight stopped before loading the game, calibrating trace clocks or collecting another timing population. **Zero game cycles and zero named game targets ran.** No causal optimization target is established.

The unchanged **no warm activation above 50 ms** predicate remains unresolved. The prior 51.8 / 78.0 / 65.6 ms misses remain retained; this report neither replaces those observations nor attributes their unexplained time to host contention. ASTRA-M2A-R1-02 / SOL-M2A-R1-01 remain open.

## Exact identity and scope

- Clean initial full HEAD: **`d91c82892ae3b2189ddc6990e2bf809c10457795`**. Checked production ancestor: **`631918436001c2264aad3123329efeb0bb6e3ab4`**. Initial porcelain status was empty, verified before edits. Source, tests, scripts and checked root build inputs have no difference from that production commit.
- Checkout `/home/worker/.t3/worktrees/subnautica-clone/t3-df4f91e9`, branch `t3/m2-a-warm-attribution`.
- Original session **`01a15450-fde3-7a70-87ce-bb555be77e60`**, first `turn_context` at line **8**, **2026-10-19T13:19:16.824Z**, records actual **gpt-6.1-sol / max**, matching collaboration settings and cwd. [Original-context receipt](/home/worker/.local/share/siltwake-evidence/m2-a-warm-attribution/runtime.json). Catalog defaults were not used to infer effort.
- One own-thread binding read confirms Codex/Sol6.1, ordinal-1 run, the branch/worktree above and the subagent relationship to root `9604e156-62da-418c-98f6-73a49ed8de4d`. Binding: `thread:delegated-task:command%3Amcp%3A2e1e5263-9a2f-46b6-b140-bd39eb7b7827%3Adelegate-task%3Asiltwake-m2-warm-attribution-sol-max-d91c828`. [Binding receipt](/home/worker/.local/share/siltwake-evidence/m2-a-warm-attribution/t3-self-binding.json).

Read AGENTS/STATUS first, PLAN/CONTRACTS, the complete committed attribution assignment, revised input, delivery/graphics/integration requirements, settled map/tracker, original complete M2-A R1 brief/both reports/reconciliation, regional-profile and Dart reports, [current composition](M2-A-PERFORMANCE-COMPOSITION.md) and the complete [Astra direction](../design/M2-A-WARM-ACTIVATION-DIRECTION.md). [Authority hashes](/home/worker/.local/share/siltwake-evidence/m2-a-warm-attribution/authority-inputs.json) identify those inputs. Historical source attributions, including the corrected f3c5d79 attribution for the older 59.3 ms replacement, remain unchanged. Historical seals were not re-audited or modified.

## Supported capability check

The live catalog contains **95 operations**, including **21 preview operations**. Their complete exposed descriptions are retained in [supported-tool-catalog.json](/home/worker/.local/share/siltwake-evidence/m2-a-warm-attribution/supported-tool-catalog.json). They expose page interaction/evaluation, snapshots and video recording, but no target trace lifecycle, renderer PID/TID lookup, DevTools CPU profiler, GC/JIT trace or scheduler capture operation. This is a negative check of the supported interfaces available to this caller, **not a T3 browser failure or a claim that Chromium cannot trace**. No fabricated trace call or undocumented transport was attempted.

Both browser-rule files were read before browser work. T3 `preview_status` returned `available:false`; `preview_open` then succeeded with `profileId:incognito`, `reuseExistingTab:false`, background-only ownership. The sole owned tab was **`tab_47_0430977b-1ed3-45f2-ac72-3683f9fe8942`**. Its thread-bound listing reports `runtime:server`; environment identity is **factory-worker / Linux x64**, environment `eff88ded-2882-487b-9095-28cba8588c98`. The owned blank page reports Linux x86_64 / Chrome154. A one-time actual `/proc` inspection finds Linux Chrome-headless-shell roots **827911** and **847778**, both parented by **811435**, using the T3 Linux executable. [Original process/port receipt](/home/worker/.local/share/siltwake-evidence/m2-a-warm-attribution/initial-browser-process-and-port.txt). These establish the isolated Linux browser host; they do **not** uniquely map this tab to a renderer or main thread.

One snapshot and one feature query inspected only `about:blank`. No game origin/storage was opened or changed. The query found `performance.now` and `Profiler` functions and PerformanceObserver entries including mark/measure, longtask and long-animation-frame; it found no GC/JIT entry types or Node process API. The blank page is not a secure or cross-origin-isolated game document, so these observations are confined to that page. No profiler was instantiated, marks generated or timing samples collected. API presence and units establish no clock precision. [Page query](/home/worker/.local/share/siltwake-evidence/m2-a-warm-attribution/preview-page-capability.json).

Native availability inspection finds no `perf`, `trace-cmd`, `bpftrace` or `strace` executable on PATH; `perf_event_paranoid` reads **3**. No attach, install, permission change or scheduler polling was attempted. This records current access, not an exhaustive assertion about every possible host facility. [Native availability](/home/worker/.local/share/siltwake-evidence/m2-a-warm-attribution/native-tool-availability.json).

| Required preflight observation | Result |
| --- | --- |
| Safe trace confined to owned target, with supported start/stop/export | **Unavailable through the exposed interfaces.** Working page controls provide no such trace lifecycle. |
| Page → renderer PID/main TID, verified with a named marker in that trace | **Unverified.** Browser-host process identity cannot supply the missing target/thread binding. |
| Monotonic activation/callback alignment | **Not demonstrated.** No target trace exists in which to correlate markers. |
| Useful measured resolution/quantization on bounded known intervals | **Not demonstrated.** Calibration was not started after the trace/mapping prerequisite failed. No API-unit precision claim. |
| Main-thread CPU plus scheduler/runqueue/native-wait distinction | **Unavailable in the supported page interface.** No process-total CPU or pressure substitute was collected. |
| GC/JIT events and source-mapped sampled stacks in the same interval | **Unavailable in the exposed trace interface.** The prior coarse self-profiler was not repeated. |

The [machine-readable result](/home/worker/.local/share/siltwake-evidence/m2-a-warm-attribution/supported-capability-check.json) records this stop. Without these prerequisites, another activation population cannot answer whether a current miss is application/VM execution, native blocking or runnable-but-unscheduled time. No slow interval/comparator or wall/CPU/off-CPU reconciliation was obtained; the causal question remains inconclusive.

## Smallest isolated-environment requirement

Root needs a **documented, app-supported tracing/profiling channel for an exclusively owned Linux browser process**, with verified tab/renderer/main-thread identity, named user-timing markers, main-thread CPU and scheduler intervals, V8 GC/JIT events, sampled stacks and matching source maps. If the trace facility records browser-global events, the browser process itself must be dedicated to this task. Capture scope, dropped-event reporting and normal cleanup must be explicit. Its clocks must then pass the named-marker/known-interval quantization and alignment preflight before any game timing.

This requires observation access, not a speculative renderer correction. The current working shared T3 host was preserved; no standalone replacement, global trace, pipe injection or Windows automation was attempted. Once an adequate environment exists, the committed conditional protocol remains exactly one reference and one traced cycle per Rich/Light preset, **12 named targets total**, with every setup/intermediate transition retained. None of that population ran here.

## Verification, artifacts and release

No source or test files were edited. No build, game server, save import, control replay, recording or game timing ran. The four conditionally authorized render files were never edited; their original hashes are retained in [source-verification.json](/home/worker/.local/share/siltwake-evidence/m2-a-warm-attribution/source-verification.json). There is no instrumentation patch, derivative bundle, served-bundle hash, game tick ledger, observer-overhead estimate or new visual/state-preservation evidence to report. No full suite/economy repetition was warranted. The private verification script passes identity, ancestry, source equality, original runtime/binding, capability-receipt consistency and normal browser cleanup checks; this is receipt verification, not a successful tracing preflight.

Private artifacts are exclusively **`/home/worker/.local/share/siltwake-evidence/m2-a-warm-attribution/`**. The [manifest](/home/worker/.local/share/siltwake-evidence/m2-a-warm-attribution/MANIFEST.json) covers **22 payload files / 232,278 bytes**; [payload.tar.gz](/home/worker/.local/share/siltwake-evidence/m2-a-warm-attribution/payload.tar.gz) is **46,506 bytes**, with all 23 archive entries verified, including the manifest. No dependencies/full sessions or historical trees were copied. [Seal](/home/worker/.local/share/siltwake-evidence/m2-a-warm-attribution/SEAL.json):

- Manifest SHA256: `cc9168d0b72ced4171d96d5faa6314dc055e4d75386d7441240ff5c72716d0e6`.
- Archive SHA256: `4f5ebe6a3089244ea3c1dc4e53a1b588b7d7226aacafd2cc2674398ae18975f1`.

The owned tab closed successfully through `t3_preview_close`; final status is `available:false`, `tabId:null`. Port **5191** passed one initial bind/close availability check and was never served or retained. No trace, profiler object, recorder, server or owned long-running process remains. Shared browser hosts and peer resources, including 5190, were untouched. [Cleanup receipt](/home/worker/.local/share/siltwake-evidence/m2-a-warm-attribution/cleanup.json).

Only this report is committed. No children, peer contact/polling/waits, parent edits, push, PR or merge. All assigned paths/resources are released on handoff. Root retains environment/contract decisions, actual affected ordinary play and the fresh full independent Astra/Sol acceptance pair. This useful capability-limit completion does not accept M2-A, waive 50 ms, or establish representative-GPU performance or human experience.
