# GPU enablement R1 — coordinator disposition

**REQUEST CHANGES on `cdbbab978e5e8a5de1d9dda4b43185e08ac81b10`.** The complete [fresh Sol report](GPU-ENABLEMENT-SOL-XHIGH-R1.md) is accepted as the basis for correction, not as execution approval. Report-only author `e087a6df6b670dd5afed5ae58772336308fb8e12` is copied at `5ac8abf`. All six original readiness criteria remain in the next round. Working GPU hardware remains unverified.

Root read the complete report, the underlying host/guest/probe source, targeted test scripts and actual targeted, recovery, guest-snapshot, precheck and fake-probe outputs. The fake peer-start case shows missing ownership revalidation; it does not prove real simultaneous GPU ownership. The fake screenshot is explicitly a text fixture, not visual evidence. Root's independent source-block reproduction already confirms the false-smoke check; the unchanged ordinary suite independently passes104 with explicit PATH and fails under the original documented environment. Those are distinct results.

Original reviewer session `01a1563a-d66a-78a0-92db-e260773ceadd`, turn_context `2026-10-19T22:14:20.258Z`, independently confirms `gpt-6.1-sol`, `effort: xhigh` and exact bound cwd. Root receipt: `/home/worker/.local/share/siltwake-evidence/gpu-enablement-root-r1/reviewer-runtime.json`. Report source identities match root's nine-file comparison. Reviewer is terminal, clean, no children/questions, and owns no browser/server/background resource.

| Finding | Root disposition |
| --- | --- |
| R1-01 failed host reads accepted | Fix. Unknown or incomplete live/configuration/resource state must not mean safe absence, including recovery/final verification. |
| R1-02 stale ownership/configuration | Fix. Recheck relevant prerequisites at transition boundaries, preserve complete external edits and report conflicts truthfully. |
| R1-03 invalid backup accepted | Fix. Validate read success, full identity/document and durable bytes before disruption. |
| R1-04 guest undo ownership | Fix. Do not purge packages inferred from a machine-wide difference. Handle partial installation/retry and preserve pre-existing config. Simplifying/removing unsafe automatic undo is acceptable if the explicit recovery procedure remains concrete and sufficient. |
| R1-05 successful exit after failed verification | Fix. Exit status must reflect real install/build failures and retain useful recovery records. |
| R1-06 false smoke-report acceptance | Fix. Validate structured, current, matching evidence and distinguish context-only from successful production smoke. |
| R1-07 no rendered-work proof | Fix. Real draw/readback plus game readiness/rendered activity and relevant error handling are required; independent callback cadence is not game fps. |
| R1-08 incorrect recovery result/lock handling | Fix. Failed recovery stays an explicit failed/left-off outcome; do not race the lock holder. |
| R1-09 unreadable shutdown evidence/QXL gate | Fix. Require successful evidence acquisition and enforce the declared prerequisite while preserving the recovery configuration. |
| R1-10 fake-tool PATH | Fix with the bundle. Pin the isolated test environment and check that fake infrastructure is actually selected. |

The cold-attachment rationale, native restricted approval route, detached host execution and distinction between local rendering and remote inference remain supported. Preserve the prior failed RAM run's attribution and all contrary evidence. No host request, driver installation, attachment, reboot or service change has happened.

The [Opus correction brief](../tasks/GPU-ENABLEMENT-R1-FIX.md) preserves the original complete outcome and gives the author discretion to simplify the implementation. Root then inspects the revision and dispatches a new fresh Sol6.1/xhigh round with original scope, this disposition and all unresolved objections. Operational Fleet placement must use identical reviewed bytes before execution. Native approval and a durable coordinated checkpoint precede any disruption to the active game build.
