# GPU enablement R2: coordinator disposition

Coordinator: Opus 5.5. Candidate: `c4d5191`. Reviewer: fresh GPT-6.1 Sol, xhigh. Report: `GPU-ENABLEMENT-SOL-XHIGH-R2.md`.

The bundle is **not ready**. All three findings are accepted, each with a concrete offline reproduction:

- **R2-01 (blocking):** after shutdown, an unreadable definition must not authorize a recovery start. Return `needs-owner` and leave the VM off.
- **R2-02 (blocking):** a guest retry must accept version-matched, half-configured packages that need `Conf` repair actions, while still refusing upgrades and removals. `undo-plan` must list pending packages.
- **R2-03:** check the VM's actual state after any failed start. Report `left-off` only when the VM is observed shut off, and never retry start on a VM that is already running. It is small, so it is fixed in the same pass.

**Next:** the same Opus author fixes all three, adding the reviewer's reproductions as regression tests. Then a fresh Sol R3 review covers the full original scope, R1 and R2. Everything else R2 closed stays closed unless the fix touches it.
