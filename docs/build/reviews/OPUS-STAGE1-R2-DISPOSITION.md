# Stage1 R2 experience disposition

Coordinator inspection, 2026-10-18. **Hold stage1 for OS2-01, then advance to M2.** Historical technical acceptance of the complete experience batch on 4baaa34 remains recorded; it does not override this newly reproduced movement/save blocker. M0/M1 remain accepted at their bounded historical revisions. M2, M3 and M4 remain substantial unbuilt scope. No broad new stage1 polish round is directed.

## Review and root evidence

[Opus report](OPUS-STAGE1-R2.md), report-only commit c4f208859500258aa26606409752a03f71516c8e on c299ba9d406f124062a9f411f60b9f1e48ee4a88. Root verified non-doc production/test/config equivalence with d9aaf6356cb320f283887922abf97ed8bdc54f59 and the frozen experience candidate. Live T3 configuration confirms claudeAgent / claude-opus-5-5 / selected high; there is no separate effective-effort readout. Completed task has no pending children/questions and releases report/resources.

Root independently verifies all 220 manifest payloads / 51,606,345 bytes, manifest SHA256 724610ba6d957768e39bfd565d98b96f1e2f7de65dbb1165f955cf67243aeb45. Original artifact `/tmp/siltwake-opus-stage1-r2/` is untouched. Actual trapped export SHA256 012982eae770e9c7cce3ba8df06bf567db32c57afa51261d87e4db289f236d55. Root inspected actual frame25 and frame48, source/build/config and Linux renderer/cleanup receipts. This is artifact inspection, not a new root browser playthrough or continuous video viewing.

Root-owned diagnostics: `/tmp/siltwake-opus-stage1-r2-root/`. `integrity.json`, `repro.mjs`, `repro-red.log`, `repro-red-repeat.log`, `probe.mjs`, `probe.json`. Recompiled current real modules with `./node_modules/.bin/tsc -p tsconfig.test.json`. The command `node /tmp/siltwake-opus-stage1-r2-root/repro.mjs` deterministically fails both assertions in approximately 0.4 seconds:

- Decoded actual export: best movement is **0 m** over 72 direction/look combinations, each 60 ticks.
- Minimal diagnostic: fresh `createGame`, completed opening, swimming at (-25.9,-0.7,-7.400000000000001), yaw1.57/pitch0.3, forward input. Initially clear; overlap appears on tick15. No retained inventory, expedition history, save codec or browser input is required for this path.

The diagnostic wraps real `moveCapsule` and copies results before caller mutation. At failing tick15, the swept result (-25.087964241714023,-0.48325385495585743,-7.400646645969426) is clear. Support is -0.846369621966835, below the player, so the floor snap is inactive. The final y=-0.5 clamp makes clearance false. The previous tick remains clear. This identifies the caller correction as the overlap source without modifying production.

The actual export overlaps canonical segment12 by 0.01311010134142121 m. A 0.05 m displacement along its separating normal reaches a world-clear endpoint with 0.03688989865857839 m rib separation; real `sweepBoxRib` still returns t0/stop and `moveCapsule` stays at the origin. This identifies the overlap policy as the permanent-trap mechanism. These probes test the three ranked hypotheses (surface clamp, overlap rejection, floor snap). Broader blind search/bisection is unnecessary after this direct real-callsite isolation. The production builder must still turn the reproduction into regression coverage before its fix.

## Decisions

| Finding | Disposition |
| --- | --- |
| OS2-01 permanent movement/save trap | Confirmed blocker. Obtain detailed advice from the same completed Opus context, reconcile prevention and bounded recovery, then Sol6.1/max implementation and fresh Astra/Sol affected acceptance plus fresh Opus verification. |
| OS2-02 zero-valued hull-loss chip | Accept bounded display refinement. Preserve honest damage/flash; suppress below meaningful displayed precision rather than invent a larger loss. |
| OS2-03 duplicated exit refusal | Accept bounded composition refinement. Preserve one complete actionable reason; typed command/target/reason context must prevent hiding unrelated warnings. No prose matching. |
| OS2-07 copy/subtitle density | Accept bounded title/pause/routine-copy cleanup under the owner's standing restraint requirement. Preserve accessibility/story captions, regional leads, safety/recovery information and deliberately retained personal-log guidance. |
| OS2-04 near-field floor wash | M2 benchmark obligation. Investigate geometry/camera before changing offsets; a camera push is not assumed physics-neutral. |
| OS2-06 Canopy cover/landmark/threat invisibility | M2 benchmark must precede habitat/content multiplication. Prove visible cover and approach landmarks, readable depth/value and call-origin/threat cues, cockpit balance and a legible region edge. Preserve stealth/occlusion rather than revealing hidden animals globally. |
| OS2-05 mouse-resume spike; OS2-08 workshop finding | Human-test hypotheses. No automatic input filter or extra marker based only on synthetic-input evidence. |
| Missing blocked-thrust cue in two stalls | Eligibility unproved. Retain as hypothesis; do not loosen the measured cue gate without telemetry. |

## Safety and scope of the correction

Prevent overlapping corrections while preserving surface/floor/shore behavior and movement metrics. Separating motion must still respect every other solid and connected rib segment; zero-distance/zero-normal cases need explicit conservative handling. Save repair must be deterministic, local, fully clear and idempotent, visible once, with no inventory/knowledge/vehicle grants or relocation through sealed structures. Distinguish current and legacy content, decode from encode, and unsupported corrupt cases. Inspect related hull/support snaps; expand ownership only for a demonstrated affected path.

Critic's 99/595 figure is a targeted seeded diagnostic, not a human incidence rate; root has independently reproduced the minimal and exported cases, not rerun that entire grid yet. Autosave captured the trap; loss of every good backup remains inference. Input was synthetic/CDP with software rendering and muted audio. Human feel/enjoyment, audible mix, ten-hour duration and representative-GPU performance remain unverified. No full fresh expedition/recovery/docking proof is added by this review.

Next: [same-context implementation consultation](../tasks/OPUS-STAGE1-R2-IMPLEMENTATION-CONSULT.md), Sol correction, independent affected gate and fresh Opus verification; then the existing M2–M4 program. No owner permission is missing for these steps.
