# GPU preparation — coordinator inspection, round 1

Prepared source `e1a85c2bec048b7a2581cd5aa4bfc2270154d6ae` is copied unchanged at `53b66c1aced866a8bdc7e6bc147493b0a94ae8c6`. All nine files under `docs/build/gpu-enablement/` match the author. Host script SHA256 is `3710945199e0af4193e04719c1077a9739001c6108f9cf6b0806702973c57080`. This is provisional preparation, not execution approval or working GPU evidence.

The Opus/high author is terminal with no children/questions. Root read the complete host, guest, ask and browser scripts and the offline isolation/fake implementation. No host file, VM, package, driver, service or browser setting was changed by root; no native ask was submitted. Game production remains `eb712f1`; M2-B1 continues independently.

## Observations for independent review

- The guest postcheck's exact report-validation block accepts both a context-only `{"verdict":"accelerated"}` document with no game smoke and a top-level failed document containing a nested accelerated string. Both print `accelerated with smoke`. Root reproduced these by executing the unchanged block against isolated fixtures, without invoking system checks. Structured report validation and an actual smoke requirement are needed before that claim.
- The browser probe reads a renderer string but performs no standalone draw/readback. Its game `framesIn5s` is an independent `requestAnimationFrame` counter, not an observed Babylon render count, and its pass condition ignores collected console errors. Review actual readiness/rendered-work proof and avoid interpreting the counter as game performance.
- Guest package accounting snapshots the whole package set once and records additions only after a successful install. Partial failure/retry, unrelated concurrent installation, source-file preservation, version changes and purge dependency effects need independent assessment. These are source observations, not a reproduced destructive transaction.
- Independently inspect host read failures, current ownership rechecks, external definition changes and every recovery outcome. The read-only `virsh` pipelines and filtered definition fingerprint deserve particular attention. Do not limit the review to this list.

The first exact documented offline command exits 1: 49 host assertions pass and 42 fail; the 5 ask and 8 classifier assertions pass. Its fake `virsh` is unavailable through the inherited Codex PATH (`timeout: failed to run command ‘virsh’: No such file or directory`). No real host operation occurred. Root started a separate unchanged-source rerun with an explicit conventional system PATH to distinguish harness portability from host transition behavior; its log retains the outcome separately. Do not erase the first failure or silently attribute author success to the default coordinator environment.

Root receipts are under `/home/worker/.local/share/siltwake-evidence/gpu-enablement-root-r1/`: `source-hashes.json`, `postcheck-reproductions.json`, `offline-checks.log` and `offline-checks-explicit-path.log`. Author evidence remains separately under `gpu-enablement-prep/`.

## Execution boundary

Use the complete [review brief](../tasks/GPU-ENABLEMENT-SOL-XHIGH-REVIEW.md). The current Fleet operational branch is clean `ops/factory-worker-16g` in `/work/repos/fleet-vm-upgrade`, last known `af0426a016e96e75be6809d5b78bb5637852c1f1`; shared `/work/repos/fleet` is not the current recovery record. After acceptance, root will copy byte-identical operational files into Fleet before execution. Native host approval, a durable checkpoint and orderly suspension of active game work precede any disruptive transition. The current author report's cold-attach and QXL diagnosis remain evidence-backed proposals, not a guarantee of the next shutdown.

The full-game goal remains active. This review cannot establish real 3090 rendering, host attachment, successful driver load, consumer performance or completed M2-B1 before those checks run.
