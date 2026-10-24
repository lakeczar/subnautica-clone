# Exact carrier heading: coordinator integration

2026-10-17. Author source `53607cb01e29012f9881dbe48a1b1376346eeb9d`, evidence `d3f65bc`, combined with UI clarity at **`9d1397d0e7f2659c967a23d3c8410f25c99b7a58`**. Sol 6.1 max task `siltwake-m1-carrier-yaw-sol-max-e0ec3a9` is terminal with no children/questions or browser/server resources. Source changes only the endpoint checked in `constrainCarrierYaw`, plus two focused regressions. No interface or validator change.

Root inspected the complete diff and verified the portable archive: SHA256 `00667b3e2d3513e8e3829b1d608169c7a8e02644482b5f5df01983def8a6d64f`, 35 payloads/36 unique safe regular members, identical local/archive bytes. Root artifacts and copies are under `/tmp/siltwake-m1-carrier-yaw-root/`; earlier red evidence remains untouched.

ROOT-CB-01 now passes the exact root command/codec reproduction: returned yaw `1.602442700475372`, attached Z `66`, before/after both saveable. The nearby valid requested angle remains unmodified in the new regression. Root's targeted arithmetic probe additionally checked 3,020 eligible cases where endpoint recomputation might differ; each accepted heading kept attachment origins in bounds. This is explicitly staged arithmetic evidence, not ordinary travel.

Combined **`npm run check`: 174/174 tests, strict typecheck and build pass**. Root reran the copied original/retained-route analyzer (2,609 complete codec checks) and five whole-state historical browser-export comparisons (2,010 codec checks, including cold Continue). No fresh browser or unchanged full matrix rerun. `identity.json` records combined source/build hashes; original captures remain attributed to source 1c8f719 and UI e2c7ae8.

The carrier helper/compatibility contract is reconciled in CONTRACTS.md. The root-discovered defect is corrected provisionally; fresh non-author Astra xhigh/Sol max acceptance still follows LOOK assembly, and integrated M1 remains separate. LOOK is the only active child, on its original e06035d baseline. Ordinary depleted-power proof, full campaign, human experience and representative-GPU/audio qualifications remain open.
