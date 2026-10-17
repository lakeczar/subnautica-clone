# M1 recovery inspection and correction disposition

2026-10-17. Coordinator inspection of evidence-only commit `4ccc73dc0a9aba46ed4c433ca9b4104f8a120d0f`; production remains the combined `ef6608f` source. The author used `2ce5e14`, with the same production tree/bundle. This is provisional staging, not independent acceptance.

Root read the terminal result and complete [report](M1-RECOVERY.md), inspected the verification script, and independently verified all **314 indexed files** both locally and inside `/tmp/siltwake-m1-recovery-artifacts.tar.gz`. Archive SHA256 `155ac7520e46c5e22e0871e1a7033d20df2f63305490687abf22b1dd7f926b14`, 18,196,451 bytes. Actual final workshop and reopened Hold captures were inspected. No fresh root browser run is claimed.

The earned recovery branch retained the original Dart and recovered both caches after repeated gameplay losses. Food from an empty carried hold, local patches, return/service/storage and actual reload are evidenced, with ordinary no-input ticks accounted for. Its 28 gameplay commands and flushed logs correct the earlier trace-loss limitation for this bounded branch, not for CORE's original preparation.

## Confirmed blockers

- **R-1:** From the unmodified earned `saves/attach-tow-command--attached.json`, root's detached production-simulator replay reproduced abort at tick29398 after971 steps, position `(46.22656352979209,-12.938209946420303,-54.22656352979209)`. The intended final mooring `(51,-11,-54)` is not reached. The current route lowers the towed hull into the shallow floor. Source also contains an unchecked final endpoint assignment; route correction must cover every movement through completion. Existing test only asserts a shallow Y and null operation, so it accepts an abort as success.
- **R-2:** The same abort updates saved feedback but emits no notice events; the actual reopened Hold capture and snapshot omit the explanation. Root confirmed `updateRecovery` is called without publishing its automatic transitions. Include ready/completed transitions and useful reopened-panel status in the correction; avoid per-tick notice spam or indiscriminately broadcasting all saved feedback.

Root reproduction: `/tmp/siltwake-recovery-coordinator-repro.json`. The historical loss position is unchanged during tow, but current Hold/notebook bearings use the actual hull pose; this alone is **not** a reproduced stale-marker UI defect.

[Focused correction](../tasks/M1-RECOVERY-FIX.md) owns simulation/feedback and narrowly assigned UI/tests. RENDER retains its five disjoint files. Preserve saved operations, swept collision, original identities/cargo/charge/damage and immediate-save validity. The local patch workaround is not nominal tow acceptance.

Ordinary full battery depletion remains unexecuted (minimum88.848926%). Deep/all-advanced-disabled recovery and mobile-refuge registration remain M2 obligations. Final combined visuals/play, fresh non-author Astra xhigh/Sol max batch reviews and separate integrated M1 reviews remain open. SwiftShader, muted audio and guided agent controls establish no consumer-GPU, audible-mix, human enjoyment or duration result.
