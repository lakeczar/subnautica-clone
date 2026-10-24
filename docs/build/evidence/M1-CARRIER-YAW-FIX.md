# ROOT-CB-01 — exact requested yaw endpoint

2026-10-17. Author runtime **gpt-6.1-sol / max**, under root Astra xhigh. Verified clean exact dispatch parent **e0ec3a91a9d0df3e13338536a76b6e573a66002e** on isolated `t3/carrier-heading-endpoint`. Source/test commit **53607cb01e29012f9881dbe48a1b1376346eeb9d**; this evidence is committed separately. Provisional author correction; root inspection and fresh non-author Astra xhigh / Sol max review remain required.

Only production change: `src/sim/carrier.ts`, inside `constrainCarrierYaw`. The full-turn success check now tests `desiredYaw`, exactly what that branch returns. Bisection still checks its normalized returned endpoint; shortest-arc/extremum calculations and blocked view/hull handling are preserved. No interface, schema, validation, geometry, bounds, cost or UI changes. Other changed paths: `tests/carrier-boundary.test.ts` and this evidence file.

Copied root's endpoint script and fixture into **`/tmp/siltwake-m1-carrier-yaw-fix/`**, redirecting only paths/source attribution. Ran it against compiled clean-parent source before editing; retained complete before/after states and meaningful failure in `red/yaw-endpoint-regression.{json,log}`. Carrier `(65,-24,63.03314320575622)`, initial yaw `1.6680903988919056`, one production look delta `-0.06564769841653488`:

```text
Parent: beforeSaveable=true, afterSaveable=false
        returned yaw=1.602442700475371, starboard Z=66.00000000000001
Fixed:  beforeSaveable=true, afterSaveable=true
        returned yaw=1.602442700475372, starboard Z=66
```

New command/codec regression also failed on unchanged parent production (`red/regression-tests.log`: one fail/one pass). The nearby case lowers carrier Z to `63.03314320575621`; its safe requested yaw remains exactly `1.602442700475371`, with no boundary event. This guards against unnecessarily rewriting accepted headings. Both check full codec round trips, coherent attachments/view and unchanged carrier position. Placement is explicit diagnostic staging, not travelled or earned acquisition.

Actual final checks on the committed source:

- Compiled with `node node_modules/typescript/bin/tsc -p tsconfig.test.json`; focused `node --test --test-reporter=tap` on `.test-build/tests/{carrier-boundary,carrier,carrier-clearance}.test.js`: **39/39 pass** (`focused-carrier.log`).
- One final **`npm run check`: typecheck, 169/169 tests and production build pass** (`check.log`). Existing large-chunk warning remains.
- Copied endpoint script: **pass**, as above (`final/`).
- Unchanged copied `verify-routes.mjs`: **2,609 complete codec checks**, including the original route, both retained valid old-state inputs and rejection of the original invalid state. No legacy origin relocation (`routes.log`, `replay/route-verification.json`).
- Unchanged copied `verify-browser.mjs`: **five whole-state export comparisons and 2,010 codec checks**, including retained cold Continue plus 53 no-input ticks (`browser-export-replay.log`). Original captures remain attributed to **1c8f719**; this is diagnostic compatibility replay on the new compiled modules, with no fresh browser run.

Production main JS **`index-hB48OND4.js`**, SHA256 **b53fce4d8a6bc5c7e053abc8addf4ac4ca71caadce5c79a490037fb6150acbc1**. `identity.json` records source, compiled modules and every built asset; copied analyzer/input hashes were reverified against untouched originals. `README.md` provides replay commands. Verified archive **`carrier-yaw-artifacts.tar.gz`**, **62,715 bytes**, **35 payloads + manifest**, SHA256 **00667b3e2d3513e8e3829b1d608169c7a8e02644482b5f5df01983def8a6d64f**; manifest SHA256 **ea7fe4b13e1cfce3df69394b21200e5283f3b2214616c1d2ea52acefb9a8d65a**. All archive members are unique safe regular files and match local bytes.

No children, peer polling, cross-owner edits, parent mutation, browser/server resources, push, PR or merge. No standalone full legacy matrix or full expedition rerun: scope stayed one arithmetic defect in one function. Integrated M1 acceptance, ordinary depleted-power proof and prior campaign/performance/human-evidence limits remain open with root.
