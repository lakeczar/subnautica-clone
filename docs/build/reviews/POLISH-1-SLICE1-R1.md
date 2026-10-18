# POLISH-1 slice1 — round1 reconciliation

**Astra: ACCEPT. Sol: REQUEST CHANGES. Coordinator: REQUEST CHANGES for SOL-P1-1.** Candidate **88f1f71b0ddb38c2f5d325a527afd0c15768d3e9**, diff base **61fcc3033292f9412a795a2388616a4f926ece22**. Production is cd4ef9f832db52742aa127399b5a595ca19fca4b. Subsequent root commits are records only. [Full nine-criterion scope](../tasks/POLISH-1-SLICE1-REVIEW-R1.md) covers all1A+1B+1C, not just the latest patch.

| Reviewer | Task | Effective runtime | Verdict |
| --- | --- | --- | --- |
| [Astra report](POLISH-1-SLICE1-ASTRA-R1.md), commit9325777b4169274e95f721853d56e1ea4731ed1b | `node:delegated-task:command%3Amcp%3A77db24d4-f446-41f1-a361-c1d3f090551d%3Adelegate-task%3Asiltwake-polish-1-slice1-astra-r1-88f1f71` | Root independently confirms gpt-6-astra/xhigh in both session turn_context records | ACCEPT all nine criteria; no blocking findings |
| [Sol report](POLISH-1-SLICE1-SOL-R1.md), commitd75a220c33f65d77752d189fb587ab75f208909e | `node:delegated-task:command%3Amcp%3A77db24d4-f446-41f1-a361-c1d3f090551d%3Adelegate-task%3Asiltwake-polish-1-slice1-sol-r1-88f1f71` | Root independently confirms gpt-6.1-sol/max in both session turn_context records | REQUEST CHANGES: criterion5 fails and9 blocked; other seven pass |

## Astra report inspection

Root read the complete report, scoped diff and selected underlying runtime/check/artifact/paid-replay/browser/cleanup receipts. Only the assigned report path changed; author checkout is clean. Root reverified its37 source/25 test/27 rebuilt artifacts against final candidate manifests and fingerprinted16 reviewer receipts in `/tmp/siltwake-polish-1-slice1-root-r1/astra-receipts.json`. The reviewer independently passed265 tests/typecheck/build/economy, reproduced both full80-tick actual reloads and28 save roundtrips, and inspected source-attributed actual visuals/motion. Its original script adaptations and first setup/scratch failures are explicitly distinguished from product failures.

Astra concurs with provisional closure of P1-VIS-1/2/3 and justifies the two startup-camera trace exclusions using raw neighboring records. Its separate current-build browser trial records native entry/release, deliberate panel recapture and focused Skip. Root inspected the event/label receipt: native keyboard Return retains yaw/pitch, while a mouse Return click is followed by a trusted delta equal to the automated cursor's prior coordinates. The report treats automation cursor restoration as the supported explanation, **not** proof of every real-device behavior. No warp-suppression production patch is justified by this evidence; retain genuine mouse/drag validation as an open hardware/human check.

Astra raised no blocking correction. Its broader acceptance did not cover Sol’s subsequently reproduced native forward-Tab path. The initial reports remained independent; neither reviewer received the other’s findings before returning. Sol’s concrete reproduction controls the combined verdict; the disagreement is resolved by accepting the defect, not averaging the verdicts.

## Sol report inspection and accepted correction

Root read the complete report and relevant source, verified report-only scope and clean checkout, confirmed actual Sol6.1/max in both turn_context records, reverified37 source/25 test/27 build hashes, and fingerprinted12 reviewer receipts in `/tmp/siltwake-polish-1-slice1-root-r1/sol-receipts.json`. Sol independently passed265 tests/typecheck/build/economy, both full80-tick actual reloads and28 save roundtrips; all425 original evidence files are reported unchanged. Root inspected before/after screenshots and the full native keyboard/lock log. Sol closed its owned tab/server normally and5194 is free.

**SOL-P1-1, P2 — accepted.** Native Tab from Hold’s storage SELECT closes the menu and acquires pointer lock at tick88; simulation subsequently advances. Shift+Tab and K preserve that selector. Root compiled the current identical production and ran a temporary real-app harness probe: Tab from both SELECT and BUTTON changes panel→playing, capture requests1→2 and tick311→370 after60 scheduled frames; Shift+Tab/KeyK from SELECT stay paused at311. Receipts are `tab-probe.mjs` and `tab-probe-results.json` in the root review directory. This root probe is synthetic DOM-port evidence, not a second native browser run. Root opened no browser/server and did not edit production/tests.

Source confirms `src/runtime/app.ts` bypasses text-entry protection for Tab. Root also found `src/ui/view.ts` deliberately skips inventory’s forward focus wrap. Fix both coherently: **Tab opens Hold from gameplay; inside any panel Tab/Shift+Tab navigate and wrap.** Return and eligible I/K/J/V shortcuts still deliberately resume; text entry stays protected, Escape never captures. This narrows the older1B same-panel Tab allowance to avoid an ambiguous navigation shortcut. The [bounded Sol correction](../tasks/POLISH-1-SLICE1-R1-FIX.md) owns only app/view focus paths, focused tests and its evidence; no menu redesign or Opus reconsultation is needed for this technical regression.

Both reviewers support closure of P1-VIS-1/2/3 within declared limits. No other blocking finding or rejected substantive objection remains in R1. Corrected slice acceptance requires both fresh reviewers on one new frozen candidate.

## Remaining limits and next action

Preserve sampled local terrain error, increased geometry/buffer cost, coarse remote terrain, SwiftShader/muted-audio and synthetic-relative-input limits. Native drag tooling, representative-GPU performance and human feel/duration remain unverified. Astra’s automated mouse-Return delta is not proof of natural human movement; no speculative suppression patch is authorized.

Dispatch the bounded correction from a committed baseline. Inspect its source/tests and native focus/capture evidence; run affected checks, freeze the candidate and start fresh Astra xhigh/Sol6.1 max round2 tasks with all nine original criteria, both R1 reports and this disposition. Do not use a child-thread message for another review round. Slice2, end-stage1 Opus and M2–M4 remain required. No game/main merge or deployment.
